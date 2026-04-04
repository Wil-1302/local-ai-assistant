import { execFile } from "child_process";
import fs from "fs";
import path from "path";
import type { Tool, ToolContext, ToolResult } from "../types.js";

/**
 * Commands allowed for execution.
 * Maps user-supplied alias → resolved executable name.
 */
const ALLOWED_COMMANDS = new Map<string, string>([
  ["python3", "python3"],
  ["python",  "python3"],
  ["node",    "node"],
  ["gcc",     "gcc"],
  ["g++",     "g++"],
]);

/** Valid source/script extensions for each executable. */
const COMMAND_EXTENSIONS = new Map<string, ReadonlySet<string>>([
  ["python3", new Set([".py"])],
  ["node",    new Set([".js", ".mjs", ".cjs"])],
  ["gcc",     new Set([".c"])],
  ["g++",     new Set([".cpp", ".cc", ".cxx"])],
]);

/**
 * Characters allowed in the file argument.
 * Blocks shell metacharacters, spaces, and flag prefixes.
 */
const SAFE_FILE_ARG = /^[a-zA-Z0-9_./@-][a-zA-Z0-9_./ @-]*$/;

const EXEC_TIMEOUT_MS = 15_000;
const MAX_OUTPUT_CHARS = 2000;

function truncateOutput(s: string): string {
  if (s.length <= MAX_OUTPUT_CHARS) return s;
  const omitted = s.length - MAX_OUTPUT_CHARS;
  return s.slice(0, MAX_OUTPUT_CHARS) + `\n... (output truncado, ${omitted} chars omitidos)`;
}

function runProcess(
  executable: string,
  args: string[]
): Promise<{ stdout: string; stderr: string; exitCode: number; timedOut: boolean }> {
  return new Promise((resolve) => {
    execFile(
      executable,
      args,
      { timeout: EXEC_TIMEOUT_MS, killSignal: "SIGKILL" },
      (err, stdout, stderr) => {
        const e = err as (NodeJS.ErrnoException & { killed?: boolean; code?: number }) | null;
        const timedOut = e?.killed ?? false;
        const exitCode = e?.code ?? 0;
        resolve({
          stdout,
          stderr,
          exitCode: typeof exitCode === "number" ? exitCode : 0,
          timedOut,
        });
      }
    );
  });
}

export class RunCommandTool implements Tool {
  readonly name = "run_command";
  readonly description =
    "Execute a script using an allowed interpreter (python3, node, gcc, g++). " +
    "No shell access. Single-file execution only.";

  async execute(
    args: Record<string, string>,
    ctx: ToolContext
  ): Promise<ToolResult> {
    const cmdAlias = args["cmd"]?.trim().toLowerCase();
    const fileArg = args["file"]?.trim();

    if (!cmdAlias) return { output: "", error: "Missing required argument: cmd" };
    if (!fileArg) return { output: "", error: "Missing required argument: file" };

    const executable = ALLOWED_COMMANDS.get(cmdAlias);
    if (!executable) {
      const list = [...ALLOWED_COMMANDS.keys()].join(", ");
      return { output: "", error: `Comando no permitido: "${cmdAlias}". Permitidos: ${list}` };
    }

    // Block flags and shell metacharacters in the file argument
    if (!SAFE_FILE_ARG.test(fileArg)) {
      return { output: "", error: `Argumento inválido: "${fileArg}"` };
    }

    const resolvedFile = path.isAbsolute(fileArg)
      ? fileArg
      : path.resolve(ctx.cwd, fileArg);

    if (!fs.existsSync(resolvedFile)) {
      return { output: "", error: `Archivo no encontrado: ${resolvedFile}` };
    }

    // Extension must match the command
    const ext = path.extname(resolvedFile).toLowerCase();
    const allowedExts = COMMAND_EXTENSIONS.get(executable);
    if (allowedExts && !allowedExts.has(ext)) {
      const extList = [...allowedExts].join(", ");
      return {
        output: "",
        error: `Extensión "${ext}" no válida para ${executable}. Esperada: ${extList}`,
      };
    }

    const { stdout, stderr, timedOut } = await runProcess(executable, [resolvedFile]);

    let output = truncateOutput(stdout.trimEnd());
    const errTrimmed = stderr.trimEnd();
    if (errTrimmed) {
      output += (output ? "\n" : "") + `[stderr]\n${truncateOutput(errTrimmed)}`;
    }
    if (timedOut) {
      output += (output ? "\n" : "") + `[timeout] Proceso terminado tras ${EXEC_TIMEOUT_MS / 1000}s.`;
    }
    if (!output) output = "(sin salida)";

    return { output };
  }
}
