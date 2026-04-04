import fs from "fs";
import path from "path";
import type { Tool, ToolContext, ToolResult } from "../types.js";

const MAX_WRITE_BYTES = 1024 * 1024; // 1 MB

/** Absolute path prefixes that must never be touched by this tool. */
const BLOCKED_PREFIXES = [
  "/etc", "/usr", "/bin", "/sbin", "/lib", "/lib64",
  "/boot", "/sys", "/proc", "/dev", "/root",
];

function isBlockedPath(resolved: string): boolean {
  return BLOCKED_PREFIXES.some(
    (prefix) => resolved === prefix || resolved.startsWith(prefix + "/")
  );
}

export class WriteFileTool implements Tool {
  readonly name = "write_file";
  readonly description =
    "Write text content to a file (creates or overwrites). System paths are blocked.";

  async execute(
    args: Record<string, string>,
    ctx: ToolContext
  ): Promise<ToolResult> {
    const filePath = args["path"];
    const content = args["content"];

    if (!filePath) return { output: "", error: "Missing required argument: path" };
    if (content === undefined) return { output: "", error: "Missing required argument: content" };

    if (content.length > MAX_WRITE_BYTES) {
      return {
        output: "",
        error: `Contenido demasiado grande: ${content.length} bytes (máx ${MAX_WRITE_BYTES})`,
      };
    }

    const resolved = path.isAbsolute(filePath)
      ? filePath
      : path.resolve(ctx.cwd, filePath);

    if (isBlockedPath(resolved)) {
      return { output: "", error: `Escritura bloqueada en ruta de sistema: ${resolved}` };
    }

    const exists = fs.existsSync(resolved);
    if (exists) {
      const stat = fs.statSync(resolved);
      if (!stat.isFile()) {
        return { output: "", error: `No es un archivo regular: ${resolved}` };
      }
      if (ctx.confirm) {
        const ok = await ctx.confirm(`¿Sobrescribir "${resolved}"? (yes/no)`);
        if (!ok) return { output: "Escritura cancelada (omitida).", skipped: true };
      }
    }

    const dir = path.dirname(resolved);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    fs.writeFileSync(resolved, content, "utf-8");

    const lineCount = content.split("\n").length;
    return {
      output: `Archivo escrito: ${resolved} (${lineCount} líneas, ${content.length} bytes)`,
    };
  }
}
