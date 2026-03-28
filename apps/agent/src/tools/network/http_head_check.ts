import { execFile } from "child_process";
import { promisify } from "util";
import type { Tool, ToolContext, ToolResult } from "../types.js";

const execFileAsync = promisify(execFile);

function classifyCurlError(detail: string, url: string): string {
  const d = detail.toLowerCase();
  if (d.includes("ssl certificate") || d.includes("certificate verify failed") || d.includes("ssl_error"))
    return `SSL error: certificate verification failed for ${url} — try with --insecure to confirm, or check the cert chain`;
  if (d.includes("timed out") || d.includes("operation timed out") || d.includes("28"))
    return `Timeout: no response from ${url} within 10s`;
  if (d.includes("could not resolve") || d.includes("name or service not known") || d.includes("6)"))
    return `DNS failure: could not resolve host for ${url}`;
  if (d.includes("connection refused") || d.includes("7)"))
    return `Connection refused: host is up but port is closed for ${url}`;
  if (d.includes("network unreachable") || d.includes("no route to host"))
    return `Network unreachable: cannot reach ${url} — check routing or network interface`;
  return `curl failed for ${url}: ${detail}`;
}

/** Only allow http:// and https:// URLs. */
function isValidHttpUrl(url: string): boolean {
  return /^https?:\/\/[a-zA-Z0-9]/.test(url);
}

export class HttpHeadCheckTool implements Tool {
  readonly name = "http_head_check";
  readonly description = "Fetch HTTP headers of a URL (curl -I --max-time 10). Args: url.";

  async execute(args: Record<string, string>, _ctx: ToolContext): Promise<ToolResult> {
    const url = args["url"]?.trim();
    if (!url) return { output: "", error: "Missing required arg: url" };
    if (!isValidHttpUrl(url)) return { output: "", error: `Invalid URL (must start with http:// or https://): ${url}` };

    try {
      const { stdout } = await execFileAsync("curl", [
        "-I",
        "--max-time", "10",
        "--silent",
        "--show-error",
        url,
      ]);
      const out = stdout.trim();
      return {
        output: out,
        contextOutput: `[HTTP_HEAD: ${url}]\n${out}`,
      };
    } catch (err) {
      const e = err as { stdout?: string; stderr?: string; message?: string };
      const out = e.stdout?.trim() ?? "";
      const detail = e.stderr?.trim() ?? e.message ?? String(err);
      if (out) {
        return {
          output: out,
          contextOutput: `[HTTP_HEAD: ${url}]\n${out}`,
        };
      }
      return { output: "", error: classifyCurlError(detail, url) };
    }
  }
}
