/**
 * Alert evaluation engine.
 *
 * - evaluateAlerts(): run rules against a snapshot, return sorted results
 * - formatAlerts():   full CLI block for /alert command
 * - formatAlertsCompact(): one-line summary for /monitor cycles
 * - AlertTracker: tracks alert state across cycles (anti-spam foundation)
 */

import type { AlertChange, AlertResult, AlertRule, AuditSnapshot } from "./types.js";

// ── ANSI helpers ─────────────────────────────────────────────────────────────

const RED    = "\x1b[31m";
const YELLOW = "\x1b[33m";
const GREEN  = "\x1b[32m";
const BOLD   = "\x1b[1m";
const RESET  = "\x1b[0m";

const RULE_WIDTH = 60;
const hrule = () => "─".repeat(RULE_WIDTH);

function severityColor(s: AlertResult["severity"]): string {
  if (s === "CRITICAL") return RED;
  if (s === "WARNING")  return YELLOW;
  return GREEN;
}

function severityIcon(s: AlertResult["severity"]): string {
  if (s === "CRITICAL") return "✖";
  if (s === "WARNING")  return "!";
  return "✔";
}

// ── Core evaluation ──────────────────────────────────────────────────────────

/**
 * Evaluate all rules against a snapshot.
 * Returns only triggered alerts (non-null), sorted CRITICAL → WARNING.
 */
export function evaluateAlerts(
  rules: AlertRule[],
  snapshot: AuditSnapshot,
): AlertResult[] {
  const results: AlertResult[] = [];
  for (const rule of rules) {
    const r = rule.evaluate(snapshot);
    if (r !== null) results.push(r);
  }
  const order: Record<AlertResult["severity"], number> = { CRITICAL: 0, WARNING: 1, OK: 2 };
  return results.sort((a, b) => order[a.severity] - order[b.severity]);
}

// ── Formatters ───────────────────────────────────────────────────────────────

/**
 * Full CLI block for the /alert command.
 * Groups alerts by severity with icons and optional detail lines.
 */
export function formatAlerts(alerts: AlertResult[]): string {
  const lines: string[] = [];
  lines.push(`\n─── alerts ${"─".repeat(RULE_WIDTH - 10)}`);

  if (alerts.length === 0) {
    lines.push(`  ${GREEN}✔${RESET}  Sin alertas activas.`);
    lines.push(hrule());
    return lines.join("\n") + "\n";
  }

  const criticals = alerts.filter((a) => a.severity === "CRITICAL");
  const warnings  = alerts.filter((a) => a.severity === "WARNING");

  if (criticals.length > 0) {
    lines.push(`\n${BOLD}${RED}CRITICAL:${RESET}`);
    for (const a of criticals) {
      const suffix = a.detail ? `  (${a.detail})` : "";
      lines.push(`  ${RED}✖${RESET}  ${a.message}${suffix}`);
    }
  }

  if (warnings.length > 0) {
    lines.push(`\n${BOLD}${YELLOW}WARNING:${RESET}`);
    for (const a of warnings) {
      const suffix = a.detail ? `  (${a.detail})` : "";
      lines.push(`  ${YELLOW}!${RESET}  ${a.message}${suffix}`);
    }
  }

  lines.push(`\n${hrule()}`);
  return lines.join("\n") + "\n";
}

/**
 * One-line summary suitable for embedding in a /monitor cycle row.
 * Shows the top (most severe) alert and a count of additional ones.
 */
export function formatAlertsCompact(alerts: AlertResult[]): string {
  if (alerts.length === 0) {
    return `${GREEN}✔${RESET}  Sin alertas`;
  }
  // alerts is pre-sorted CRITICAL first by evaluateAlerts()
  const top = alerts[0]!;
  const c    = severityColor(top.severity);
  const icon = severityIcon(top.severity);
  const extra = alerts.length > 1 ? ` (+${alerts.length - 1} más)` : "";
  return `${c}${icon}${RESET}  ${top.message}${extra}`;
}

// ── AlertTracker ─────────────────────────────────────────────────────────────

/**
 * Tracks alert state across /monitor cycles.
 *
 * Primary API: computeChanges() — returns a typed diff of what changed.
 * Returns an empty array on the first call (cold start = baseline, no spam).
 *
 * Signature fast-path: if id+severity set is identical, skips diff computation.
 */
export class AlertTracker {
  private lastSignature = "";
  private lastAlerts: AlertResult[] = [];
  private firstCycle = true;

  /**
   * Computes which alerts are new, resolved, or changed severity since last call.
   * Returns empty array on first call (establishes baseline without notifying).
   * Side effect: updates internal state.
   */
  computeChanges(alerts: AlertResult[]): AlertChange[] {
    const sig = alerts
      .map((a) => `${a.id}:${a.severity}`)
      .sort()
      .join("|");

    if (this.firstCycle) {
      this.firstCycle = false;
      this.lastAlerts = [...alerts];
      this.lastSignature = sig;
      return [];
    }

    if (sig === this.lastSignature) {
      return []; // fast path: nothing changed
    }

    const changes: AlertChange[] = [];
    const prevMap = new Map(this.lastAlerts.map((a) => [a.id, a]));
    const currMap = new Map(alerts.map((a) => [a.id, a]));

    for (const [id, curr] of currMap) {
      const prev = prevMap.get(id);
      if (!prev) {
        changes.push({ type: "NEW_ALERT", id, current: curr });
      } else if (prev.severity !== curr.severity) {
        changes.push({ type: "SEVERITY_CHANGED", id, current: curr, previous: prev });
      }
    }

    for (const [id, prev] of prevMap) {
      if (!currMap.has(id)) {
        changes.push({ type: "RESOLVED_ALERT", id, previous: prev });
      }
    }

    this.lastAlerts = [...alerts];
    this.lastSignature = sig;

    return changes;
  }

  /** Reset state (call at the start of each /monitor session). */
  reset(): void {
    this.lastSignature = "";
    this.lastAlerts = [];
    this.firstCycle = true;
  }
}
