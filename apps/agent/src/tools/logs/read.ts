import fs from "fs";
import path from "path";
import type { Tool, ToolContext, ToolResult } from "../types.js";
import { config } from "../../config.js";

const DEFAULT_TAIL_LINES = 50;
const MAX_TAIL_LINES = 500;
const MAX_LOG_SIZE = 50 * 1024 * 1024; // 50 MB hard limit
const TAIL_CHUNK_SIZE = 1 * 1024 * 1024; // 1 MB — max bytes read from end for large files

/**
 * Resolve a (possibly relative) log path.
 * Tries cwd first, then project root. Returns cwd-based path as fallback.
 */
function resolveLogPath(filePath: string, cwd: string): string {
  if (path.isAbsolute(filePath)) return filePath;

  const fromCwd = path.resolve(cwd, filePath);
  if (fs.existsSync(fromCwd)) return fromCwd;

  const fromProject = path.resolve(config.projectRoot, filePath);
  if (fs.existsSync(fromProject)) return fromProject;

  return fromCwd;
}

/**
 * Extract the last `n` lines from a string.
 * Handles trailing newline (doesn't count it as an empty line).
 */
function tailLines(content: string, n: number): string[] {
  const lines = content.endsWith("\n")
    ? content.slice(0, -1).split("\n")
    : content.split("\n");
  return lines.slice(-n);
}

/** Null bytes in the sample indicate binary content. */
function isBinary(buf: Buffer): boolean {
  return buf.includes(0x00);
}

export class ReadLogTool implements Tool {
  readonly name = "read_log";
  readonly description =
    "Read the last N lines of a text log file (default 50, max 500)";

  async execute(
    args: Record<string, string>,
    ctx: ToolContext
  ): Promise<ToolResult> {
    const filePath = args["path"];
    if (!filePath) {
      return { output: "", error: "Missing required argument: path" };
    }

    const rawLines = parseInt(args["lines"] ?? "", 10);
    const tailN =
      Number.isNaN(rawLines) || rawLines <= 0
        ? DEFAULT_TAIL_LINES
        : Math.min(rawLines, MAX_TAIL_LINES);

    const resolved = resolveLogPath(filePath, ctx.cwd);

    // Existence and read permission
    try {
      fs.accessSync(resolved, fs.constants.R_OK);
    } catch {
      if (!fs.existsSync(resolved)) {
        return { output: "", error: `Archivo no encontrado: ${filePath}` };
      }
      return { output: "", error: `Sin permisos de lectura: ${resolved}` };
    }

    // Must be a regular file
    const stat = fs.statSync(resolved);
    if (!stat.isFile()) {
      return { output: "", error: `No es un archivo regular: ${resolved}` };
    }

    // Hard size limit
    if (stat.size > MAX_LOG_SIZE) {
      return {
        output: "",
        error: `Archivo demasiado grande: ${(stat.size / 1024 / 1024).toFixed(0)} MB (límite ${MAX_LOG_SIZE / 1024 / 1024} MB). Usa grep o journalctl para filtrar primero.`,
      };
    }

    // Binary detection — sample first 512 bytes
    if (stat.size > 0) {
      const fd = fs.openSync(resolved, "r");
      const probe = Buffer.alloc(Math.min(512, stat.size));
      fs.readSync(fd, probe, 0, probe.length, 0);
      fs.closeSync(fd);
      if (isBinary(probe)) {
        return {
          output: "",
          error: `Archivo binario, no se puede leer como texto: ${resolved}`,
        };
      }
    }

    // Read strategy: full read for small files, tail chunk for large ones
    let raw: string;
    let chunked = false;

    if (stat.size <= TAIL_CHUNK_SIZE) {
      raw = fs.readFileSync(resolved, "utf-8");
    } else {
      // Read last TAIL_CHUNK_SIZE bytes from end
      const fd = fs.openSync(resolved, "r");
      const buf = Buffer.alloc(TAIL_CHUNK_SIZE);
      const offset = stat.size - TAIL_CHUNK_SIZE;
      fs.readSync(fd, buf, 0, TAIL_CHUNK_SIZE, offset);
      fs.closeSync(fd);
      raw = buf.toString("utf-8");
      // Drop the first (likely partial) line
      const firstNewline = raw.indexOf("\n");
      if (firstNewline !== -1) raw = raw.slice(firstNewline + 1);
      chunked = true;
    }

    const lines = tailLines(raw, tailN);
    const content = lines.join("\n");

    const sizeLabel =
      stat.size >= 1024 * 1024
        ? `${(stat.size / 1024 / 1024).toFixed(1)} MB`
        : `${(stat.size / 1024).toFixed(0)} KB`;

    const chunkNote = chunked
      ? ` [leído desde el final — archivo de ${sizeLabel}]`
      : "";

    const header = `${resolved} — últimas ${lines.length} líneas${chunkNote}`;

    // Extract error/warn lines for a structured summary injected into context
    const errorLines = lines.filter((l) =>
      /\b(ERRORS?|FATALS?|CRITICAL)\b|Exception|Traceback|panic|Segmentation fault/i.test(l)
    );
    const warnLines = lines.filter((l) => /\bWARN(ING)?\b/i.test(l));

    let summary: string;
    if (errorLines.length > 0) {
      const listed = errorLines
        .slice(0, 10)
        .map((l) => `  - ${l.trim()}`)
        .join("\n");
      summary = `\n\n[LOG_ERRORS_FOUND: ${errorLines.length}]\nDEBES listar estos errores en tu respuesta:\n${listed}`;
      if (warnLines.length > 0) {
        summary += `\n[LOG_WARNINGS: ${warnLines.length}]`;
      }
    } else if (warnLines.length > 0) {
      const listed = warnLines
        .slice(0, 5)
        .map((l) => `  - ${l.trim()}`)
        .join("\n");
      summary = `\n\n[LOG_WARNINGS_ONLY: ${warnLines.length}]\nDEBES listar estos warnings en tu respuesta:\n${listed}`;
    } else {
      summary = `\n\n[LOG_CLEAN: sin errores ni warnings detectados]`;
    }

    return {
      output: content,
      contextOutput: `${header}\n\n${content}${summary}`,
    };
  }
}
