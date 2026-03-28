import { execFile } from "child_process";
import { promisify } from "util";
import type { Tool, ToolContext, ToolResult } from "../types.js";

const execFileAsync = promisify(execFile);

/** Validates a hostname or IP address — no shell metacharacters. */
function isValidHost(host: string): boolean {
  return /^[a-zA-Z0-9]([a-zA-Z0-9\-\.]*[a-zA-Z0-9])?$/.test(host) && !host.includes("..");
}

export class DnsLookupTool implements Tool {
  readonly name = "dns_lookup";
  readonly description = "Resolve a hostname via getent hosts. Args: host.";

  async execute(args: Record<string, string>, _ctx: ToolContext): Promise<ToolResult> {
    const host = args["host"]?.trim();
    if (!host) return { output: "", error: "Missing required arg: host" };
    if (!isValidHost(host)) return { output: "", error: `Invalid host: ${host}` };

    try {
      const { stdout } = await execFileAsync("getent", ["hosts", host]);
      const out = stdout.trim();
      const result = out || `No DNS record found for ${host}`;
      return {
        output: result,
        contextOutput: `[DNS_LOOKUP: ${host}]\n${result}`,
      };
    } catch (err) {
      const e = err as { code?: number; message?: string };
      // getent exits 2 when not found — not an execution error
      if (e.code === 2) {
        const result = `No DNS record found for ${host}`;
        return {
          output: result,
          contextOutput: `[DNS_LOOKUP: ${host}]\n${result}`,
        };
      }
      return { output: "", error: `getent failed: ${e.message ?? String(err)}` };
    }
  }
}
