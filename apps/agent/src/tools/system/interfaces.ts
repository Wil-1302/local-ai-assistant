import { execFile } from "child_process";
import { promisify } from "util";
import type { Tool, ToolContext, ToolResult } from "../types.js";

const execFileAsync = promisify(execFile);

export class NetworkInterfacesTool implements Tool {
  readonly name = "net_interfaces";
  readonly description = "Show network interfaces and addresses (ip a). No args.";

  async execute(_args: Record<string, string>, _ctx: ToolContext): Promise<ToolResult> {
    try {
      const { stdout } = await execFileAsync("ip", ["a"], { timeout: 5000 });
      return {
        output: stdout.trim(),
        contextOutput: `[NET_INTERFACES]\n${stdout.trim()}`,
      };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      return { output: "", error: `ip a failed: ${msg}` };
    }
  }
}
