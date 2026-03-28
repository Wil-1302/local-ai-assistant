import { execFile } from "child_process";
import { promisify } from "util";
import type { Tool, ToolContext, ToolResult } from "../types.js";

const execFileAsync = promisify(execFile);

const DEFAULT_LINES = 50;
const MAX_LINES = 200;

// Strip ANSI escape codes in case journalctl colorizes output
function stripAnsi(str: string): string {
  return str.replace(/\x1b\[[0-9;]*m/g, "");
}

export class JournalctlTool implements Tool {
  readonly name = "journalctl";
  readonly description =
    "Read systemd journal logs. Args: service (optional), lines (optional, default 50, max 200), priority (optional: err|warning|info|debug).";

  async execute(
    args: Record<string, string>,
    _ctx: ToolContext
  ): Promise<ToolResult> {
    const service = args["service"]?.trim();
    const rawLines = parseInt(args["lines"] ?? "", 10);
    const lines =
      Number.isNaN(rawLines) || rawLines <= 0
        ? DEFAULT_LINES
        : Math.min(rawLines, MAX_LINES);
    const priority = args["priority"]?.trim();

    if (service && !/^[\w@:.-]+$/.test(service)) {
      return { output: "", error: `Invalid service name: ${service}` };
    }
    if (
      priority &&
      !/^(emerg|alert|crit|err|warning|notice|info|debug)$/.test(priority)
    ) {
      return { output: "", error: `Invalid priority: ${priority}` };
    }

    const cmdArgs = ["--no-pager", "-n", String(lines), "--output=short-iso"];
    if (service) cmdArgs.push("-u", service);
    if (priority) cmdArgs.push("-p", priority);

    try {
      const { stdout } = await execFileAsync("journalctl", cmdArgs, {
        timeout: 10000,
      });
      const output = stripAnsi(stdout.trim());
      const allLines = output.split("\n");
      const nonEmptyLines = allLines.filter((l) => l.trim().length > 0);

      let summary: string;
      if (nonEmptyLines.length === 0) {
        summary = `[JOURNAL_NO_OUTPUT: journalctl returned no lines]`;
      } else {
        const errorLines = nonEmptyLines.filter((l) =>
          /\b(ERROR|FAIL(ED)?|FATAL|CRITICAL)\b/i.test(l)
        );
        const warnLines = nonEmptyLines.filter((l) => /\bWARN(ING)?\b/i.test(l));

        if (errorLines.length > 0) {
          const listed = errorLines
            .slice(0, 10)
            .map((l) => `  - ${l.trim()}`)
            .join("\n");
          summary = `[JOURNAL_ERRORS_FOUND: ${errorLines.length} de ${nonEmptyLines.length} líneas]\nDEBES listar estas líneas en tu respuesta:\n${listed}`;
          if (warnLines.length > 0) {
            summary += `\n[JOURNAL_WARNINGS: ${warnLines.length}]`;
          }
        } else if (warnLines.length > 0) {
          const listed = warnLines
            .slice(0, 5)
            .map((l) => `  - ${l.trim()}`)
            .join("\n");
          summary = `[JOURNAL_WARNINGS_ONLY: ${warnLines.length} de ${nonEmptyLines.length} líneas]\nDEBES listar estos warnings en tu respuesta:\n${listed}`;
        } else {
          summary = `[JOURNAL_CLEAN: ${nonEmptyLines.length} líneas, sin errores ni warnings]`;
        }
      }

      const tag = service ? `: ${service}` : "";
      return {
        output,
        contextOutput: `[JOURNALCTL${tag}]\n${summary}`,
      };
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      return { output: "", error: `journalctl failed: ${msg}` };
    }
  }
}
