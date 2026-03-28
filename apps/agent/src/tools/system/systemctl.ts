import { execFile } from "child_process";
import { promisify } from "util";
import type { Tool, ToolContext, ToolResult } from "../types.js";

const execFileAsync = promisify(execFile);

export class SystemctlStatusTool implements Tool {
  readonly name = "systemctl_status";
  readonly description =
    "Check the status of a systemd service (systemctl status <service>). Requires: service.";

  async execute(
    args: Record<string, string>,
    _ctx: ToolContext
  ): Promise<ToolResult> {
    const service = args["service"]?.trim();
    if (!service) {
      return { output: "", error: "Missing required argument: service" };
    }

    if (!/^[\w@:.-]+$/.test(service)) {
      return { output: "", error: `Invalid service name: ${service}` };
    }

    try {
      const { stdout, stderr } = await execFileAsync(
        "systemctl",
        ["status", service, "--no-pager", "-l"],
        { timeout: 5000 }
      );
      const output = (stdout + stderr).trim();
      return {
        output,
        contextOutput: `[SYSTEMCTL_STATUS: ${service}]\n${output}`,
      };
    } catch (err: unknown) {
      // systemctl exits non-zero for inactive/failed — output is still useful
      if (err && typeof err === "object" && "stdout" in err) {
        const e = err as { stdout?: string; stderr?: string };
        const output = ((e.stdout ?? "") + (e.stderr ?? "")).trim();
        if (output) {
          return {
            output,
            contextOutput: `[SYSTEMCTL_STATUS: ${service}]\n${output}`,
          };
        }
      }
      const msg = err instanceof Error ? err.message : String(err);
      return { output: "", error: `systemctl failed: ${msg}` };
    }
  }
}
