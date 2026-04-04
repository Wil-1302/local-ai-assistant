/**
 * Default alert rules.
 *
 * Each rule is a pure function — no I/O, no LLM, no side effects.
 * Thresholds here are intentionally independent from the /audit display
 * thresholds in repl.ts, so they can evolve separately.
 *
 * To add a rule: implement AlertRule, export it, and add it to defaultRules.
 */

import type { AlertRule, AlertResult, AuditSnapshot } from "./types.js";

// ── Rule: memory usage ───────────────────────────────────────────────────────

const memoryRule: AlertRule = {
  id: "memory",
  description: "Memory used above threshold (WARNING ≥ 78%, CRITICAL ≥ 92%)",
  evaluate(s: AuditSnapshot): AlertResult | null {
    if (s.memUsedPercent === 0) return null; // no data available
    if (s.memUsedPercent >= 92) {
      return {
        id: "memory",
        severity: "CRITICAL",
        message: `Memoria crítica: ${s.memUsedPercent.toFixed(0)}% utilizado`,
        detail: s.memDetail,
      };
    }
    if (s.memUsedPercent >= 78) {
      return {
        id: "memory",
        severity: "WARNING",
        message: `Memoria alta: ${s.memUsedPercent.toFixed(0)}% utilizado`,
        detail: s.memDetail,
      };
    }
    return null;
  },
};

// ── Rule: disk usage ─────────────────────────────────────────────────────────

const diskRule: AlertRule = {
  id: "disk",
  description: "Highest real disk mount usage above threshold (WARNING ≥ 78%, CRITICAL ≥ 92%)",
  evaluate(s: AuditSnapshot): AlertResult | null {
    if (s.diskMaxPercent === 0) return null;
    if (s.diskMaxPercent >= 92) {
      return {
        id: "disk",
        severity: "CRITICAL",
        message: `Disco crítico: ${s.diskMaxPercent}% utilizado`,
        detail: s.diskDetail,
      };
    }
    if (s.diskMaxPercent >= 78) {
      return {
        id: "disk",
        severity: "WARNING",
        message: `Disco alto: ${s.diskMaxPercent}% utilizado`,
        detail: s.diskDetail,
      };
    }
    return null;
  },
};

// ── Rule: backend service health ─────────────────────────────────────────────

const backendServiceRule: AlertRule = {
  id: "backend_service",
  description: "Backend service (config.backendService) must be active (running)",
  evaluate(s: AuditSnapshot): AlertResult | null {
    if (s.svcStatus === "CRITICAL") {
      return {
        id: "backend_service",
        severity: "CRITICAL",
        message: `Servicio caído: ${s.svcDetail}`,
      };
    }
    if (s.svcStatus === "ATTENTION") {
      return {
        id: "backend_service",
        severity: "WARNING",
        message: `Servicio anómalo: ${s.svcDetail}`,
      };
    }
    return null;
  },
};

// ── Rule: excessive listening ports ──────────────────────────────────────────

const portsRule: AlertRule = {
  id: "ports",
  description: "Too many listening ports (WARNING > 30, CRITICAL > 50)",
  evaluate(s: AuditSnapshot): AlertResult | null {
    if (s.portCount > 50) {
      return {
        id: "ports",
        severity: "CRITICAL",
        message: `Puertos abiertos excesivos: ${s.portCount} escuchando`,
      };
    }
    if (s.portCount > 30) {
      return {
        id: "ports",
        severity: "WARNING",
        message: `Puertos abiertos elevados: ${s.portCount} escuchando`,
      };
    }
    return null;
  },
};

// ── Rule: high CPU by single process ─────────────────────────────────────────

const cpuRule: AlertRule = {
  id: "cpu",
  description: "Single process CPU usage above threshold (WARNING ≥ 60%, CRITICAL ≥ 90%)",
  evaluate(s: AuditSnapshot): AlertResult | null {
    if (s.topCpuPercent >= 90) {
      return {
        id: "cpu",
        severity: "CRITICAL",
        message: `CPU crítica: ${s.psDetail}`,
      };
    }
    if (s.topCpuPercent >= 60) {
      return {
        id: "cpu",
        severity: "WARNING",
        message: `CPU alta: ${s.psDetail}`,
      };
    }
    return null;
  },
};

// ── Default rule set ─────────────────────────────────────────────────────────

/**
 * Default alert rules evaluated by /alert and /monitor.
 * Order does not affect output (results are sorted by severity after evaluation).
 * Add new rules here as the system grows.
 */
export const defaultRules: AlertRule[] = [
  memoryRule,
  diskRule,
  backendServiceRule,
  portsRule,
  cpuRule,
];
