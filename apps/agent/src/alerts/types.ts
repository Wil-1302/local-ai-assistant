/**
 * Alert system types.
 *
 * AuditSnapshot is the canonical data contract between Repl.collectAuditData()
 * and the alert engine. Rules evaluate the snapshot — no I/O, no LLM, pure functions.
 */

export type AlertSeverity = "CRITICAL" | "WARNING" | "OK";

// ── Alert change tracking ─────────────────────────────────────────────────────

export type AlertChangeType = "NEW_ALERT" | "RESOLVED_ALERT" | "SEVERITY_CHANGED";

/**
 * Represents a single state transition detected between two monitor cycles.
 *
 * - NEW_ALERT:        alert appeared (no previous state for this id)
 * - RESOLVED_ALERT:   alert disappeared (no current state for this id)
 * - SEVERITY_CHANGED: alert still active but severity escalated or de-escalated
 */
export interface AlertChange {
  readonly type: AlertChangeType;
  readonly id: string;
  /** Present for NEW_ALERT and SEVERITY_CHANGED */
  readonly current?: AlertResult;
  /** Present for RESOLVED_ALERT and SEVERITY_CHANGED */
  readonly previous?: AlertResult;
}

export interface AlertResult {
  /** Stable unique identifier used for dedup / anti-spam tracking. */
  readonly id: string;
  readonly severity: AlertSeverity;
  /** Concise one-line description shown to the user. */
  readonly message: string;
  /** Optional supplemental info (e.g. raw detail string from tool output). */
  readonly detail?: string;
}

export interface AlertRule {
  /** Stable unique identifier matching AlertResult.id produced by this rule. */
  readonly id: string;
  readonly description: string;
  /** Pure function — no side effects, no I/O. Return null if condition is not met. */
  evaluate(snapshot: AuditSnapshot): AlertResult | null;
}

/**
 * Structured snapshot of one system audit pass.
 *
 * Produced by Repl.collectAuditData() and consumed by alert rules.
 * Contains both coarse status labels (for display) and raw numeric values
 * (for fine-grained rule thresholds independent from the audit display logic).
 */
export interface AuditSnapshot {
  // ── Coarse status (for /audit display and classification) ────────────────
  memStatus:   "OK" | "ATTENTION" | "CRITICAL";
  memDetail:   string;
  diskStatus:  "OK" | "ATTENTION" | "CRITICAL";
  diskDetail:  string;
  psStatus:    "OK" | "ATTENTION" | "CRITICAL";
  psDetail:    string;
  portsStatus: "OK" | "ATTENTION";
  portsDetail: string;
  svcStatus:   "OK" | "ATTENTION" | "CRITICAL";
  svcDetail:   string;

  // ── Fine-grained numeric values for alert rule evaluation ─────────────────
  /** Memory used as 0–100 percentage (0 if data unavailable). */
  memUsedPercent:  number;
  /** Highest real-disk-mount usage as 0–100 percentage (0 if unavailable). */
  diskMaxPercent:  number;
  /** Number of listening TCP/UDP ports. */
  portCount:       number;
  /** CPU% of the busiest non-ephemeral process (0 if idle or unavailable). */
  topCpuPercent:   number;
}
