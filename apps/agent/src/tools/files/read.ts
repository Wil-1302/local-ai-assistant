import fs from "fs";
import path from "path";
import type { Tool, ToolContext, ToolResult } from "../types.js";

const MAX_BYTES = 100 * 1024; // 100 KB
const MAX_LINES = 1000;

export class ReadFileTool implements Tool {
  readonly name = "read_file";
  readonly description =
    "Read a text file and return its contents (max 100 KB / 1000 lines)";

  async execute(
    args: Record<string, string>,
    ctx: ToolContext
  ): Promise<ToolResult> {
    const filePath = args["path"];
    if (!filePath) {
      return { output: "", error: "Missing required argument: path" };
    }

    const resolved = path.resolve(ctx.cwd, filePath);

    // Check existence and read permissions
    try {
      fs.accessSync(resolved, fs.constants.R_OK);
    } catch {
      if (!fs.existsSync(resolved)) {
        return { output: "", error: `File not found: ${resolved}` };
      }
      return { output: "", error: `Permission denied: ${resolved}` };
    }

    // Must be a regular file
    const stat = fs.statSync(resolved);
    if (!stat.isFile()) {
      return { output: "", error: `Not a regular file: ${resolved}` };
    }

    // Guard against very large files before reading
    if (stat.size > MAX_BYTES * 10) {
      return {
        output: "",
        error: `File too large: ${(stat.size / 1024).toFixed(0)} KB (limit ${MAX_BYTES / 1024} KB)`,
      };
    }

    // Binary detection: sample the first 512 bytes for null bytes
    if (stat.size > 0) {
      const fd = fs.openSync(resolved, "r");
      const probe = Buffer.alloc(Math.min(512, stat.size));
      fs.readSync(fd, probe, 0, probe.length, 0);
      fs.closeSync(fd);
      if (isBinary(probe)) {
        return {
          output: "",
          error: `Binary file, cannot read as text: ${resolved}`,
        };
      }
    }

    // Read content
    const raw = fs.readFileSync(resolved, "utf-8");
    const allLines = raw.split("\n");
    let content: string;
    let truncated = false;

    if (raw.length > MAX_BYTES) {
      content = raw.slice(0, MAX_BYTES);
      truncated = true;
    } else if (allLines.length > MAX_LINES) {
      content = allLines.slice(0, MAX_LINES).join("\n");
      truncated = true;
    } else {
      content = raw;
    }

    const shownLines = content.split("\n").length;
    const suffix = truncated
      ? `\n[truncated: showing ${shownLines} of ${allLines.length} lines]`
      : "";

    return { output: content + suffix };
  }
}

/** Null bytes in the sample indicate binary content. */
function isBinary(buf: Buffer): boolean {
  return buf.includes(0x00);
}
