import { execFile } from "child_process";
import { promisify } from "util";
import type { Tool, ToolContext, ToolResult } from "../types.js";

const execFileAsync = promisify(execFile);

export class DiskUsageTool implements Tool {
  readonly name = "disk_usage";
  readonly description = "Show disk usage for all mounted filesystems (df -h). No args.";

  async execute(_args: Record<string, string>, _ctx: ToolContext): Promise<ToolResult> {
    try {
      const { stdout } = await execFileAsync("df", ["-h"]);
      return { output: stdout.trim(), contextOutput: `[SYSTEM_DISK]\n${stdout.trim()}` };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      return { output: "", error: `Failed to run df: ${msg}` };
    }
  }
}
