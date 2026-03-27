import fs from "fs";
import path from "path";
import type { Tool, ToolContext, ToolResult } from "../types.js";

const MAX_ENTRIES = 100;
const BLUE = "\x1b[34m";
const RESET = "\x1b[0m";

function humanSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export class ListDirectoryTool implements Tool {
  readonly name = "list_dir";
  readonly description =
    "List files and directories at a given path (max 100 entries, sorted dirs first)";

  async execute(
    args: Record<string, string>,
    ctx: ToolContext
  ): Promise<ToolResult> {
    const dirPath = args["path"] ?? ".";
    const limitArg = args["limit"];
    const limit = limitArg
      ? Math.min(Math.max(1, parseInt(limitArg, 10)), MAX_ENTRIES)
      : MAX_ENTRIES;

    const resolved = path.resolve(ctx.cwd, dirPath);

    // Check existence and read permissions
    try {
      fs.accessSync(resolved, fs.constants.R_OK);
    } catch {
      if (!fs.existsSync(resolved)) {
        return { output: "", error: `Path not found: ${resolved}` };
      }
      return { output: "", error: `Permission denied: ${resolved}` };
    }

    // Must be a directory
    const stat = fs.statSync(resolved);
    if (!stat.isDirectory()) {
      return { output: "", error: `Not a directory: ${resolved}` };
    }

    let entries: fs.Dirent[];
    try {
      entries = fs.readdirSync(resolved, { withFileTypes: true });
    } catch {
      return {
        output: "",
        error: `Permission denied reading directory: ${resolved}`,
      };
    }

    // Sort: directories first, then alphabetically within each group
    entries.sort((a, b) => {
      const aDir = a.isDirectory() ? 0 : 1;
      const bDir = b.isDirectory() ? 0 : 1;
      if (aDir !== bDir) return aDir - bDir;
      return a.name.localeCompare(b.name);
    });

    const total = entries.length;
    const shown = entries.slice(0, limit);

    const lines = shown.map((entry) => {
      const isDir = entry.isDirectory();
      const isLink = entry.isSymbolicLink();
      const type = isDir ? "dir" : isLink ? "link" : "file";

      const displayName = isDir ? `${entry.name}/` : entry.name;
      const padding = Math.max(1, 36 - displayName.length);
      const coloredName = isDir
        ? `${BLUE}${displayName}${RESET}`
        : displayName;

      let size = "";
      if (!isDir) {
        try {
          const s = fs.statSync(path.join(resolved, entry.name));
          size = humanSize(s.size);
        } catch {
          // ignore stat errors for individual entries
        }
      }

      const terminalLine = `${coloredName}${" ".repeat(padding)}${type.padEnd(6)}  ${size}`.trimEnd();
      const plainLine = `${displayName}${" ".repeat(padding)}${type.padEnd(6)}  ${size}`.trimEnd();
      return { terminalLine, plainLine };
    });

    const footer =
      total > limit
        ? `\n[showing ${limit} of ${total} entries — use limit arg to see more]`
        : `\n[${total} ${total === 1 ? "entry" : "entries"}]`;

    const output = lines.map((l) => l.terminalLine).join("\n") + footer;
    const contextOutput =
      `Directory listing: ${resolved}\n` +
      lines.map((l) => l.plainLine).join("\n") +
      footer;

    return { output, contextOutput };
  }
}
