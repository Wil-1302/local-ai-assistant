import fs from "fs";
import path from "path";
import type { EditMeta, Tool, ToolContext, ToolResult } from "../types.js";

const MAX_FILE_BYTES = 1024 * 1024; // 1 MB

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

export interface EditOperation {
  /** Exact string to find in the file, or one of the special sentinels:
   *  "<<<FILE_START>>>" — prepend replace to file
   *  "<<<FILE_END>>>"   — append replace to file
   */
  search: string;
  /** Replacement string. Empty string deletes the matched block. */
  replace: string;
}

/** Sentinel used by the LLM to insert content at the beginning of the file. */
const FILE_START = "<<<FILE_START>>>";
/** Sentinel used by the LLM to insert content at the end of the file. */
const FILE_END = "<<<FILE_END>>>";

/**
 * Parse edit operations from the args string.
 *
 * Supported formats (in priority order):
 *
 * 1. Structured block — delimited by markers and >>>REPLACE / >>>END:
 *
 *    <<<SEARCH           — find and replace existing text
 *    old content
 *    >>>REPLACE
 *    new content
 *    >>>END
 *
 *    <<<FILE_START       — insert at beginning (no search text needed)
 *    >>>REPLACE
 *    content to prepend
 *    >>>END
 *
 *    <<<FILE_END         — insert at end (no search text needed)
 *    >>>REPLACE
 *    content to append
 *    >>>END
 *
 * 2. Simple inline — passed as "search" and "replace" args directly.
 */
export function parseEditOperations(args: Record<string, string>): EditOperation[] {
  const raw = args["operations"] ?? "";

  if (raw.trim()) {
    const ops: EditOperation[] = [];
    // Match <<<SEARCH, <<<FILE_START, or <<<FILE_END blocks
    const blockRe = /<<<(SEARCH|FILE_START|FILE_END)\n([\s\S]*?)>>>REPLACE\n([\s\S]*?)>>>END/g;
    let m: RegExpExecArray | null;
    while ((m = blockRe.exec(raw)) !== null) {
      const marker = m[1] ?? "SEARCH";
      const searchRaw = m[2] ?? "";
      const replace = m[3] ?? "";

      if (marker === "FILE_START") {
        ops.push({ search: FILE_START, replace });
      } else if (marker === "FILE_END") {
        ops.push({ search: FILE_END, replace });
      } else {
        // SEARCH block — requires non-empty search text
        if (searchRaw.trim()) {
          ops.push({ search: searchRaw, replace });
        }
      }
    }
    return ops;
  }

  // Simple inline format
  const search = args["search"] ?? "";
  const replace = args["replace"] ?? "";
  if (!search.trim()) return [];
  return [{ search, replace }];
}

export class EditFileTool implements Tool {
  readonly name = "edit_file";
  readonly description =
    "Apply partial edits to a file by searching and replacing text blocks. System paths are blocked.";

  async execute(
    args: Record<string, string>,
    ctx: ToolContext
  ): Promise<ToolResult> {
    const filePath = args["path"];
    if (!filePath) return { output: "", error: "Missing required argument: path" };

    const resolved = path.isAbsolute(filePath)
      ? filePath
      : path.resolve(ctx.cwd, filePath);

    if (isBlockedPath(resolved)) {
      return { output: "", error: `Edición bloqueada en ruta de sistema: ${resolved}` };
    }

    if (!fs.existsSync(resolved)) {
      return { output: "", error: `Archivo no encontrado: ${resolved}` };
    }

    const stat = fs.statSync(resolved);
    if (!stat.isFile()) {
      return { output: "", error: `No es un archivo regular: ${resolved}` };
    }

    if (stat.size > MAX_FILE_BYTES) {
      return {
        output: "",
        error: `Archivo demasiado grande: ${stat.size} bytes (máx ${MAX_FILE_BYTES})`,
      };
    }

    const ops = parseEditOperations(args);
    if (ops.length === 0) {
      return { output: "", error: "No se encontraron operaciones de edición. Proporciona 'search' y 'replace', u 'operations'." };
    }

    const originalContent = fs.readFileSync(resolved, "utf-8");
    let content = originalContent;
    const results: string[] = [];
    let matchedOps = 0;
    let failedOps = 0;

    for (const op of ops) {
      // Positional insertion — no string matching required
      if (op.search === FILE_START) {
        content = op.replace + content;
        matchedOps++;
        results.push(`  ✔ insertado al inicio del archivo`);
        continue;
      }
      if (op.search === FILE_END) {
        content = content + op.replace;
        matchedOps++;
        results.push(`  ✔ insertado al final del archivo`);
        continue;
      }

      if (!content.includes(op.search)) {
        failedOps++;
        const preview = op.search.trimStart().slice(0, 60).replace(/\n/g, "↵");
        results.push(`  ✗ No encontrado: "${preview}${op.search.length > 60 ? "…" : ""}"`);
        continue;
      }

      // Count occurrences
      let count = 0;
      let pos = 0;
      while ((pos = content.indexOf(op.search, pos)) !== -1) {
        count++;
        pos += op.search.length;
      }

      // Replace all occurrences
      content = content.split(op.search).join(op.replace);
      matchedOps++;

      const action = op.replace === "" ? "eliminado" : "reemplazado";
      results.push(`  ✔ ${action} (${count}x): "${op.search.trimStart().slice(0, 60).replace(/\n/g, "↵")}${op.search.length > 60 ? "…" : ""}"`);
    }

    const parsedOps = ops.length;
    const charsChanged = Math.abs(content.length - originalContent.length);
    const editMeta: EditMeta = { parsed: parsedOps, matched: matchedOps, failed: failedOps, charsChanged };

    if (matchedOps === 0) {
      const detailLines = results.join("\n");
      return {
        output: `✗ ${path.basename(resolved)} — ningún bloque encontró match (0/${parsedOps})\n${detailLines}`,
        error: `Edición no aplicada: 0/${parsedOps} bloques encontraron match`,
        editMeta,
      };
    }

    fs.writeFileSync(resolved, content, "utf-8");

    const lineCount = content.split("\n").length;
    const partialWarning = failedOps > 0
      ? `  ⚠ edición parcial: ${matchedOps}/${parsedOps} bloques aplicados · ${failedOps} no encontraron match`
      : null;
    const charsSuffix = charsChanged > 0 ? ` · ±${charsChanged} chars` : "";

    const output = [
      `✔ ${path.basename(resolved)} modificado (${lineCount} líneas · ${matchedOps}/${parsedOps} bloques${charsSuffix})`,
      ...(partialWarning ? [partialWarning] : []),
      ...results,
    ].join("\n");

    return { output, editMeta };
  }
}
