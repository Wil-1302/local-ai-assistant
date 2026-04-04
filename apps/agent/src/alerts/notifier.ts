/**
 * Alert notifier layer.
 *
 * Decoupled from the engine and REPL — receives a list of AlertChange objects
 * and emits notifications through a configurable channel.
 *
 * Currently ships with a consoleNotifier (stdout, ANSI-colored block).
 * Extend by implementing AlertNotifier and swapping the instance used in repl.ts:
 *
 *   - notify-send (desktop): spawn `notify-send` per change
 *   - voice: pipe message to TTS
 *   - webhook: POST JSON to a URL
 */

import { spawnSync } from "node:child_process";
import type { AlertChange } from "./types.js";

// ── ANSI helpers ──────────────────────────────────────────────────────────────

const RED    = "\x1b[31m";
const YELLOW = "\x1b[33m";
const GREEN  = "\x1b[32m";
const CYAN   = "\x1b[36m";
const BOLD   = "\x1b[1m";
const DIM    = "\x1b[2m";
const RESET  = "\x1b[0m";

const BLOCK_WIDTH = 60;

// ── Interface ────────────────────────────────────────────────────────────────

export interface AlertNotifier {
  /**
   * Called when one or more alert state changes are detected in a monitor cycle.
   * Receives a non-empty array (caller guarantees at least one change).
   */
  notify(changes: AlertChange[]): void;
}

// ── Console notifier (default) ────────────────────────────────────────────────

function severityColor(sev: string): string {
  if (sev === "CRITICAL") return RED;
  if (sev === "WARNING")  return YELLOW;
  return GREEN;
}

function formatChangeLine(change: AlertChange): string {
  switch (change.type) {
    case "NEW_ALERT": {
      const sev = change.current!.severity;
      const c   = severityColor(sev);
      return `  ${GREEN}+${RESET} ${BOLD}NEW${RESET}      ${c}${sev.padEnd(8)}${RESET}  ${change.current!.message}`;
    }
    case "RESOLVED_ALERT": {
      const sev = change.previous!.severity;
      const c   = severityColor(sev);
      return `  ${DIM}-${RESET} ${DIM}RESOLVED ${c}${sev.padEnd(8)}${RESET}  ${DIM}${change.previous!.message}${RESET}`;
    }
    case "SEVERITY_CHANGED": {
      const prevSev = change.previous!.severity;
      const currSev = change.current!.severity;
      const cPrev   = severityColor(prevSev);
      const cCurr   = severityColor(currSev);
      const arrow   = `${cPrev}${prevSev}${RESET} → ${cCurr}${currSev}${RESET}`;
      return `  ${YELLOW}~${RESET} ${BOLD}CHANGED${RESET}  ${arrow.padEnd(30)}  ${change.current!.message}`;
    }
  }
}

// ── Composer ─────────────────────────────────────────────────────────────────

/**
 * Combines multiple notifiers into one.
 * Each notifier receives the full changes array; failures in one do not
 * prevent the others from running.
 */
export function composeNotifiers(...notifiers: AlertNotifier[]): AlertNotifier {
  return {
    notify(changes: AlertChange[]): void {
      for (const n of notifiers) {
        try {
          n.notify(changes);
        } catch {
          // individual notifier failure must not propagate
        }
      }
    },
  };
}

// ── Desktop notifier (Linux notify-send) ─────────────────────────────────────

/**
 * Urgency levels supported by notify-send.
 * Maps AlertSeverity → notify-send urgency.
 */
const URGENCY: Record<string, string> = {
  CRITICAL: "critical",
  WARNING:  "normal",
  OK:       "low",
};

/**
 * Returns true if the change warrants a desktop notification.
 * Only CRITICAL severity changes are surfaced:
 *   - NEW_ALERT with severity CRITICAL
 *   - SEVERITY_CHANGED where the new severity is CRITICAL
 *   - WARNING is intentionally excluded to keep desktop notifications signal-only
 */
function shouldDesktopNotify(change: AlertChange): boolean {
  if (change.type === "NEW_ALERT") {
    return change.current?.severity === "CRITICAL";
  }
  if (change.type === "SEVERITY_CHANGED") {
    return change.current?.severity === "CRITICAL";
  }
  return false;
}

function buildNotifySendArgs(change: AlertChange): string[] | null {
  if (!shouldDesktopNotify(change)) return null;

  const alert = change.current!;
  const urgency = URGENCY[alert.severity] ?? "normal";
  const summary = `[${alert.severity}] ${alert.id}`;
  const body    = alert.detail
    ? `${alert.message}\n${alert.detail}`
    : alert.message;

  return ["-u", urgency, "-a", "local-ai-agent", "--", summary, body];
}

/**
 * Desktop notifier using notify-send (Linux/libnotify).
 *
 * Only fires for CRITICAL severity changes. Degrades silently if notify-send
 * is not installed, not on PATH, or fails for any reason — /monitor continues
 * unaffected.
 *
 * Runs synchronously to keep the notifier contract simple (no async drift).
 * notify-send is nearly instantaneous so blocking for a few ms is acceptable.
 */
export const desktopNotifier: AlertNotifier = {
  notify(changes: AlertChange[]): void {
    for (const change of changes) {
      const args = buildNotifySendArgs(change);
      if (args === null) continue;

      try {
        spawnSync("notify-send", args, {
          timeout: 2000,
          // no shell — args passed directly, no injection surface
          shell: false,
        });
        // spawnSync never throws; errors appear in .error — ignore silently
      } catch {
        // belt-and-suspenders: should not reach here
      }
    }
  },
};

// ── Console notifier (default) ────────────────────────────────────────────────

/**
 * Default notifier: prints a visually distinct ANSI block to stdout.
 * No I/O beyond console.log — deterministic, no external dependencies.
 */
export const consoleNotifier: AlertNotifier = {
  notify(changes: AlertChange[]): void {
    const border = "─".repeat(BLOCK_WIDTH);
    const lines: string[] = [];

    lines.push(`\n${BOLD}${CYAN}▶ ALERT CHANGE DETECTED${RESET}  ${DIM}(${changes.length} change${changes.length > 1 ? "s" : ""})${RESET}`);
    lines.push(`${DIM}${border}${RESET}`);

    for (const change of changes) {
      lines.push(formatChangeLine(change));
    }

    lines.push(`${DIM}${border}${RESET}`);

    console.log(lines.join("\n"));
  },
};
