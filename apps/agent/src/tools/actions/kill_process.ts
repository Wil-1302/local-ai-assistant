import type { Tool, ToolContext, ToolResult } from "../types.js";

export class KillProcessTool implements Tool {
  readonly name = "kill_process";
  readonly description =
    "Send SIGTERM to a process by PID with mandatory user confirmation (kill <pid>)";

  async execute(
    args: Record<string, string>,
    ctx: ToolContext
  ): Promise<ToolResult> {
    const pidStr = args["pid"]?.trim();
    if (!pidStr) {
      return { output: "", error: "Missing required argument: pid" };
    }

    const pid = parseInt(pidStr, 10);
    if (isNaN(pid) || pid <= 0) {
      return { output: "", error: `Invalid PID: ${pidStr}` };
    }

    if (!ctx.confirm) {
      return { output: "", error: "This action requires an interactive session" };
    }

    const confirmed = await ctx.confirm(
      `¿Deseas terminar el proceso con PID ${pid}? (yes/no)`
    );

    if (!confirmed) {
      return { output: "Acción cancelada." };
    }

    try {
      process.kill(pid, "SIGTERM");
      return { output: `Señal SIGTERM enviada al proceso ${pid}.` };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      return { output: "", error: `kill ${pid}: ${msg}` };
    }
  }
}
