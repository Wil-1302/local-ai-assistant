import { execFile } from "child_process";
import { promisify } from "util";
import type { Tool, ToolContext, ToolResult } from "../types.js";

const execFileAsync = promisify(execFile);

const DEFAULT_LIMIT = 30;
const MAX_LIMIT = 100;

const CYAN = "\x1b[36m";
const YELLOW = "\x1b[33m";
const RED = "\x1b[31m";
const DIM = "\x1b[2m";
const BOLD = "\x1b[1m";
const RESET = "\x1b[0m";

interface ProcessInfo {
  pid: string;
  name: string;
  cpu: number;
  mem: number;
  args: string;
}

function parsePs(stdout: string): ProcessInfo[] {
  return stdout
    .trim()
    .split("\n")
    .map((line) => {
      const trimmed = line.trim();
      if (!trimmed) return null;
      const parts = trimmed.split(/\s+/);
      const pid = parts[0] ?? "";
      if (!pid || isNaN(parseInt(pid, 10))) return null;
      const name = parts[1] ?? "";
      const cpu = parseFloat(parts[2] ?? "0");
      const mem = parseFloat(parts[3] ?? "0");
      const args = parts.slice(4).join(" ").trim();
      return { pid, name, cpu: isNaN(cpu) ? 0 : cpu, mem: isNaN(mem) ? 0 : mem, args };
    })
    .filter((p): p is ProcessInfo => p !== null);
}

function cpuColor(cpu: number): string {
  if (cpu >= 50) return RED;
  if (cpu >= 10) return YELLOW;
  return RESET;
}

const COL_PID = 7;
const COL_NAME = 20;
const COL_CPU = 5;
const COL_MEM = 5;
const COL_CMD = 42;
const TABLE_WIDTH = COL_PID + 2 + COL_NAME + 2 + COL_CPU + 2 + COL_MEM + 2 + COL_CMD;

function formatRow(p: ProcessInfo, color: boolean): string {
  const name = p.name.length > COL_NAME
    ? p.name.slice(0, COL_NAME - 1) + "…"
    : p.name.padEnd(COL_NAME);
  const cmd = p.args.length > COL_CMD
    ? p.args.slice(0, COL_CMD - 1) + "…"
    : p.args;
  const cpuStr = p.cpu.toFixed(1).padStart(COL_CPU);
  const memStr = p.mem.toFixed(1).padStart(COL_MEM);
  const pid = p.pid.padStart(COL_PID);

  if (!color) {
    return `${pid}  ${name}  ${cpuStr}  ${memStr}  ${cmd}`;
  }

  const cc = cpuColor(p.cpu);
  return (
    `${DIM}${pid}${RESET}  ${CYAN}${name}${RESET}  ` +
    `${cc}${cpuStr}${RESET}  ${memStr}  ${DIM}${cmd}${RESET}`
  );
}

function formatHeader(color: boolean): string {
  const h = (s: string, w: number) => s.padEnd(w);
  const row =
    `${"PID".padStart(COL_PID)}  ${h("NAME", COL_NAME)}  ` +
    `${"CPU%".padStart(COL_CPU)}  ${"MEM%".padStart(COL_MEM)}  COMMAND`;
  const sep = "─".repeat(TABLE_WIDTH);
  return color ? `${BOLD}${row}${RESET}\n${sep}` : `${row}\n${sep}`;
}

export class ListProcessesTool implements Tool {
  readonly name = "list_processes";
  readonly description =
    "List running system processes with PID, name, CPU%, MEM%. Args: filter, sort (cpu|mem|name), limit.";

  async execute(
    args: Record<string, string>,
    _ctx: ToolContext
  ): Promise<ToolResult> {
    const filter = (args["filter"] ?? "").toLowerCase().trim();
    const sortBy = args["sort"] ?? "cpu";
    const limitArg = args["limit"];
    const limit = limitArg
      ? Math.min(Math.max(1, parseInt(limitArg, 10)), MAX_LIMIT)
      : DEFAULT_LIMIT;

    let stdout: string;
    try {
      ({ stdout } = await execFileAsync("ps", [
        "-eo",
        "pid,comm,pcpu,pmem,args",
        "--sort=-pcpu",
        "--no-headers",
      ]));
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      return { output: "", error: `Failed to run ps: ${msg}` };
    }

    let procs = parsePs(stdout);

    if (filter) {
      procs = procs.filter(
        (p) =>
          p.name.toLowerCase().includes(filter) ||
          p.args.toLowerCase().includes(filter)
      );
    }

    if (sortBy === "mem") {
      procs.sort((a, b) => b.mem - a.mem);
    } else if (sortBy === "name") {
      procs.sort((a, b) => a.name.localeCompare(b.name));
    }
    // "cpu" is already sorted by ps --sort=-pcpu

    const total = procs.length;
    procs = procs.slice(0, limit);

    if (procs.length === 0) {
      const msg = filter
        ? `No processes matching "${filter}"`
        : "No processes found";
      return { output: msg, contextOutput: msg };
    }

    const colorRows = procs.map((p) => formatRow(p, true));
    const plainRows = procs.map((p) => formatRow(p, false));

    const footer = total > limit
      ? `Showing ${procs.length} of ${total} processes`
      : `${procs.length} process${procs.length === 1 ? "" : "es"}${filter ? ` matching "${filter}"` : ""}`;

    const output =
      formatHeader(true) + "\n" +
      colorRows.join("\n") + "\n" +
      `${DIM}${footer}${RESET}`;

    const contextOutput =
      formatHeader(false) + "\n" +
      plainRows.join("\n") + "\n" +
      footer;

    return { output, contextOutput };
  }
}
