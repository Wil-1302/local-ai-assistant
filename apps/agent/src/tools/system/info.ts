import { execFile } from "child_process";
import { promisify } from "util";
import type { Tool, ToolContext, ToolResult } from "../types.js";

const execFileAsync = promisify(execFile);

export class SystemInfoTool implements Tool {
  readonly name = "system_info";
  readonly description = "Show basic system information: kernel, hostname, architecture (uname -a). No args.";

  async execute(_args: Record<string, string>, _ctx: ToolContext): Promise<ToolResult> {
    try {
      const { stdout } = await execFileAsync("uname", ["-a"]);
      return { output: stdout.trim(), contextOutput: `[SYSTEM_INFO]\n${stdout.trim()}` };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      return { output: "", error: `Failed to run uname: ${msg}` };
    }
  }
}
