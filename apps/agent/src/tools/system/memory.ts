import { execFile } from "child_process";
import { promisify } from "util";
import type { Tool, ToolContext, ToolResult } from "../types.js";

const execFileAsync = promisify(execFile);

export class MemoryStatusTool implements Tool {
  readonly name = "memory_status";
  readonly description = "Show system memory usage (free -h). No args.";

  async execute(_args: Record<string, string>, _ctx: ToolContext): Promise<ToolResult> {
    try {
      const { stdout } = await execFileAsync("free", ["-h"]);
      return { output: stdout.trim(), contextOutput: `[SYSTEM_MEMORY]\n${stdout.trim()}` };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      return { output: "", error: `Failed to run free: ${msg}` };
    }
  }
}
