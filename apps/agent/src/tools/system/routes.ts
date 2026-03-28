import { execFile } from "child_process";
import { promisify } from "util";
import type { Tool, ToolContext, ToolResult } from "../types.js";

const execFileAsync = promisify(execFile);

export class NetworkRoutesTool implements Tool {
  readonly name = "net_routes";
  readonly description = "Show network routing table (ip route). No args.";

  async execute(_args: Record<string, string>, _ctx: ToolContext): Promise<ToolResult> {
    try {
      const { stdout } = await execFileAsync("ip", ["route"], { timeout: 5000 });
      return {
        output: stdout.trim(),
        contextOutput: `[NET_ROUTES]\n${stdout.trim()}`,
      };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      return { output: "", error: `ip route failed: ${msg}` };
    }
  }
}
