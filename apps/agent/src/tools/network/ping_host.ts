import { execFile } from "child_process";
import { promisify } from "util";
import type { Tool, ToolContext, ToolResult } from "../types.js";

const execFileAsync = promisify(execFile);

/** Validates a hostname or IP address — no shell metacharacters. */
function isValidHost(host: string): boolean {
  return /^[a-zA-Z0-9]([a-zA-Z0-9\-\.]*[a-zA-Z0-9])?$/.test(host) && !host.includes("..");
}

export class PingHostTool implements Tool {
  readonly name = "ping_host";
  readonly description = "Ping a host (ping -c 4 <host>). Args: host.";

  async execute(args: Record<string, string>, _ctx: ToolContext): Promise<ToolResult> {
    const host = args["host"]?.trim();
    if (!host) return { output: "", error: "Missing required arg: host" };
    if (!isValidHost(host)) return { output: "", error: `Invalid host: ${host}` };

    try {
      const { stdout } = await execFileAsync("ping", ["-c", "4", host]);
      const out = stdout.trim();
      return {
        output: out,
        contextOutput: `[PING: ${host}]\n${out}`,
      };
    } catch (err) {
      // ping exits non-zero on unreachable — capture stdout too
      const e = err as { stdout?: string; message?: string };
      const out = e.stdout?.trim() ?? "";
      const msg = e.message ?? String(err);
      if (out) {
        return {
          output: out,
          contextOutput: `[PING: ${host}]\n${out}`,
        };
      }
      return { output: "", error: `ping failed: ${msg}` };
    }
  }
}
