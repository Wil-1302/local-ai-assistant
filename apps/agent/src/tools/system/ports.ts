import { execFile } from "child_process";
import { promisify } from "util";
import type { Tool, ToolContext, ToolResult } from "../types.js";

const execFileAsync = promisify(execFile);

export class OpenPortsTool implements Tool {
  readonly name = "open_ports";
  readonly description = "List open listening ports (ss -tulpn). No args.";

  async execute(_args: Record<string, string>, _ctx: ToolContext): Promise<ToolResult> {
    try {
      const { stdout } = await execFileAsync("ss", ["-tulpn"], { timeout: 5000 });
      return {
        output: stdout.trim(),
        contextOutput: `[NET_PORTS]\n${stdout.trim()}`,
      };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      return { output: "", error: `ss failed: ${msg}` };
    }
  }
}
