import readline from "readline";
import path from "path";
import { config } from "../config.js";
import type { Agent } from "../agent/loop.js";
import type { Logger } from "../logging/logger.js";
import type { ToolRegistry } from "../tools/registry.js";
import { detectToolChain, type AutoToolCall } from "../agent/tool-selector.js";

const HELP = `
Commands:
  /help              Show this help
  /clear             Clear conversation history
  /history           Show number of conversation turns
  /model             Show current model
  /read <path>       Read a file and load it into context
  /log <path> [N]    Read last N lines of a log file (default: 50)
  /ls [path]         List directory contents (default: current dir)
  /ps [filter]       List running processes (optional text filter)
  /service <name>    Show systemd service status (systemctl status)
  /journal [svc] [N] Read systemd journal (service optional, default 50 lines)
  /ping <host>       Ping a host (ping -c 4)
  /dns <host>        DNS lookup for a host (getent hosts)
  /http <url>        Check HTTP headers of a URL (curl -I --max-time 10)
  /check web <host>        Composite web check: DNS + ping + HTTP → summary
  /check service <name>    Service check: status + journal → structured report
  /audit             System audit: memory, disk, processes, ports, services
  /audit deep        Deep audit: grouped CRITICAL/ATTENTION/OK blocks + conclusion
  /monitor <secs>    Continuous monitor: repeat audit every N seconds (Ctrl+C to stop)

Actions (require confirmation):
  /restart <service> Restart a systemd service (systemctl restart)
  /kill <pid>        Send SIGTERM to a process by PID
  /diagnose <svc>    Combined diagnosis: status + journal → summary + action suggestion
  /fix <svc>         Diagnose a service and restart it if needed (uses real tools)

  /exit              Exit (also: exit, quit, Ctrl+D)
`;

const RULE_WIDTH = 60;
const rule = (char = "─") => char.repeat(RULE_WIDTH);

// Parse human-readable byte strings from free/df output (e.g. "15Gi", "456Mi", "0B", "8.0G")
function parseHumanBytes(s: string): number {
  const m = s.trim().match(/^([\d.]+)\s*([KMGTP]?)i?B?$/i);
  if (!m) return 0;
  const val = parseFloat(m[1] ?? "0");
  switch ((m[2] ?? "").toUpperCase()) {
    case "K": return val * 1024;
    case "M": return val * 1024 ** 2;
    case "G": return val * 1024 ** 3;
    case "T": return val * 1024 ** 4;
    default:  return val;
  }
}

export class Repl {
  private agent: Agent;
  private logger: Logger;
  private tools: ToolRegistry;
  private rl: readline.Interface;

  constructor(agent: Agent, logger: Logger, tools: ToolRegistry) {
    this.agent = agent;
    this.logger = logger;
    this.tools = tools;
    this.rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
    });
  }

  private handleCommand(input: string): boolean {
    switch (input) {
      case "/help":
        console.log(HELP);
        return true;
      case "/clear":
        this.agent.clearHistory();
        console.log("History cleared.\n");
        return true;
      case "/history":
        console.log(`Turns: ${this.agent.turns}\n`);
        return true;
      case "/model":
        console.log(`Model: ${config.model}\n`);
        return true;
      case "/exit":
      case "exit":
      case "quit":
        this.rl.close();
        return true;
      default:
        return false;
    }
  }

  private async handleLs(input: string): Promise<void> {
    const dirPath = input.slice("/ls".length).trim() || ".";
    const resolved = path.resolve(process.cwd(), dirPath);

    const result = await this.tools.execute(
      "list_dir",
      { path: dirPath },
      { cwd: process.cwd() }
    );

    if (result.error) {
      console.log(`[error] ${result.error}\n`);
      this.logger.warn(`/ls failed: ${result.error}`);
      return;
    }

    const header = `─── ${resolved} `;
    const pad = Math.max(0, RULE_WIDTH - header.length);

    console.log(`\n${header}${"─".repeat(pad)}`);
    console.log(result.output);
    console.log(rule() + "\n");

    const ctx = result.contextOutput ?? result.output;
    this.agent.injectContext(`Directory listing of \`${resolved}\`:\n\n${ctx}`);
    console.log("[Directory loaded into context. Ask anything about it.]\n");
    this.logger.info(`/ls: listed ${resolved}`);
  }

  private async handlePs(input: string): Promise<void> {
    const filter = input.slice("/ps".length).trim();

    const result = await this.tools.execute(
      "list_processes",
      filter ? { filter } : {},
      { cwd: process.cwd() }
    );

    if (result.error) {
      console.log(`[error] ${result.error}\n`);
      this.logger.warn(`/ps failed: ${result.error}`);
      return;
    }

    const header = filter ? `─── processes: ${filter} ` : "─── processes ";
    const pad = Math.max(0, RULE_WIDTH - header.length);

    console.log(`\n${header}${"─".repeat(pad)}`);
    console.log(result.output);
    console.log(rule() + "\n");

    const ctx = result.contextOutput ?? result.output;
    this.agent.injectContext(`Current process list:\n\n${ctx}`);
    console.log("[Process list loaded into context. Ask anything about it.]\n");
    this.logger.info(`/ps: listed processes${filter ? ` filter="${filter}"` : ""}`);
  }

  private async handleService(input: string): Promise<void> {
    const service = input.slice("/service".length).trim();
    if (!service) {
      console.log("Usage: /service <name>\n");
      return;
    }

    const result = await this.tools.execute(
      "systemctl_status",
      { service },
      { cwd: process.cwd() }
    );

    if (result.error) {
      console.log(`[error] ${result.error}\n`);
      this.logger.warn(`/service failed: ${result.error}`);
      return;
    }

    const header = `─── systemctl: ${service} `;
    const pad = Math.max(0, RULE_WIDTH - header.length);

    console.log(`\n${header}${"─".repeat(pad)}`);
    console.log(result.output);
    console.log(rule() + "\n");

    const ctx = result.contextOutput ?? result.output;
    this.agent.injectContext(`Service data:\n\n${ctx}`);
    console.log("[Service status loaded into context. Ask anything about it.]\n");
    this.logger.info(`/service: ${service}`);
  }

  private async handleJournal(input: string): Promise<void> {
    const parts = input.slice("/journal".length).trim().split(/\s+/);
    // First arg: if all digits → lines; otherwise → service
    let service: string | undefined;
    let lines: string | undefined;

    if (parts[0]) {
      if (/^\d+$/.test(parts[0])) {
        lines = parts[0];
      } else {
        service = parts[0];
        if (parts[1] && /^\d+$/.test(parts[1])) lines = parts[1];
      }
    }

    const toolArgs: Record<string, string> = {};
    if (service) toolArgs["service"] = service;
    if (lines) toolArgs["lines"] = lines;

    const result = await this.tools.execute(
      "journalctl",
      toolArgs,
      { cwd: process.cwd() }
    );

    if (result.error) {
      console.log(`[error] ${result.error}\n`);
      this.logger.warn(`/journal failed: ${result.error}`);
      return;
    }

    const label = service ? `journal: ${service}` : "journal";
    const header = `─── ${label} `;
    const pad = Math.max(0, RULE_WIDTH - header.length);

    console.log(`\n${header}${"─".repeat(pad)}`);
    console.log(result.output);
    console.log(rule() + "\n");

    const ctx = result.contextOutput ?? result.output;
    this.agent.injectContext(`Service data:\n\n${ctx}`);
    console.log("[Journal loaded into context. Ask anything about it.]\n");
    this.logger.info(`/journal: ${service ?? "system"}`);
  }

  /**
   * Injects the result of an auto-detected tool into the agent context,
   * using the same format as the corresponding manual slash commands.
   */
  private injectAutoToolContext(call: AutoToolCall, ctx: string): void {
    if (call.toolName === "list_processes") {
      this.agent.injectContext(`Current process list:\n\n${ctx}`);
    } else if (call.toolName === "list_dir") {
      const resolvedDir = path.resolve(process.cwd(), call.args["path"] ?? ".");
      this.agent.injectContext(`Directory listing of \`${resolvedDir}\`:\n\n${ctx}`);
    } else if (call.toolName === "read_file") {
      const resolved = path.resolve(process.cwd(), call.args["path"] ?? "");
      this.agent.injectContext(
        `Here is the content of \`${resolved}\`:\n\n\`\`\`\n${ctx}\n\`\`\``
      );
    } else if (call.toolName === "read_log") {
      this.agent.injectContext(`Log content of \`${call.args["path"] ?? ""}\`:\n\n${ctx}`);
    } else if (
      call.toolName === "memory_status" ||
      call.toolName === "disk_usage" ||
      call.toolName === "system_info"
    ) {
      this.agent.injectContext(`System data:\n\n${ctx}`);
    } else if (
      call.toolName === "systemctl_status" ||
      call.toolName === "journalctl"
    ) {
      this.agent.injectContext(`Service data:\n\n${ctx}`);
    } else if (
      call.toolName === "open_ports" ||
      call.toolName === "net_interfaces" ||
      call.toolName === "net_routes"
    ) {
      this.agent.injectContext(`Network data:\n\n${ctx}`);
    } else if (
      call.toolName === "ping_host" ||
      call.toolName === "dns_lookup" ||
      call.toolName === "http_head_check"
    ) {
      this.agent.injectContext(`Network check:\n\n${ctx}`);
    }
  }

  private async handlePing(input: string): Promise<void> {
    const host = input.slice("/ping".length).trim();
    if (!host) {
      console.log("Usage: /ping <host>\n");
      return;
    }

    const result = await this.tools.execute(
      "ping_host",
      { host },
      { cwd: process.cwd() }
    );

    if (result.error) {
      console.log(`[error] ${result.error}\n`);
      this.logger.warn(`/ping failed: ${result.error}`);
      return;
    }

    const header = `─── ping: ${host} `;
    const pad = Math.max(0, RULE_WIDTH - header.length);
    console.log(`\n${header}${"─".repeat(pad)}`);
    console.log(result.output);
    console.log(rule() + "\n");

    const ctx = result.contextOutput ?? result.output;
    this.agent.injectContext(`Network check:\n\n${ctx}`);
    console.log("[Ping result loaded into context. Ask anything about it.]\n");
    this.logger.info(`/ping: ${host}`);
  }

  private async handleDns(input: string): Promise<void> {
    const host = input.slice("/dns".length).trim();
    if (!host) {
      console.log("Usage: /dns <host>\n");
      return;
    }

    const result = await this.tools.execute(
      "dns_lookup",
      { host },
      { cwd: process.cwd() }
    );

    if (result.error) {
      console.log(`[error] ${result.error}\n`);
      this.logger.warn(`/dns failed: ${result.error}`);
      return;
    }

    const header = `─── dns: ${host} `;
    const pad = Math.max(0, RULE_WIDTH - header.length);
    console.log(`\n${header}${"─".repeat(pad)}`);
    console.log(result.output);
    console.log(rule() + "\n");

    const ctx = result.contextOutput ?? result.output;
    this.agent.injectContext(`Network check:\n\n${ctx}`);
    console.log("[DNS result loaded into context. Ask anything about it.]\n");
    this.logger.info(`/dns: ${host}`);
  }

  private async handleServiceCheck(service: string): Promise<void> {
    if (!service) {
      console.log("Usage: /check service <name>\n");
      return;
    }

    // Step 1: systemctl status (source of truth for state)
    process.stdout.write(`[tool] executing: systemctl status ${service}\n`);
    const statusResult = await this.tools.execute(
      "systemctl_status",
      { service },
      { cwd: process.cwd() }
    );

    // Step 2: journalctl
    process.stdout.write(`[tool] executing: journalctl -u ${service}\n`);
    const journalResult = await this.tools.execute(
      "journalctl",
      { service },
      { cwd: process.cwd() }
    );

    // Derive state from systemctl output — never from LLM
    const statusRaw = statusResult.output + (statusResult.contextOutput ?? "");
    let estado: string;
    if (statusResult.error || /Unit .+ not found|could not be found/i.test(statusRaw)) {
      estado = "not found";
    } else if (/Active:\s+active \(running\)/i.test(statusResult.output)) {
      estado = "running";
    } else if (/Active:\s+failed/i.test(statusResult.output)) {
      estado = "failed";
    } else if (/Active:\s+inactive/i.test(statusResult.output)) {
      estado = "inactive";
    } else {
      estado = "unknown";
    }

    // Parse errors from journal context marker
    const journalCtx = journalResult.contextOutput ?? "";
    let errores = "(ninguno)";
    const errMatch = journalCtx.match(/\[JOURNAL_ERRORS_FOUND:\s*(\d+)[^\]]*\]/);
    const warnMatch = journalCtx.match(/\[JOURNAL_WARNINGS_ONLY:\s*(\d+)[^\]]*\]/);
    if (errMatch) {
      const listed = [...journalCtx.matchAll(/^\s+- (.+)$/gm)]
        .map((m) => m[1] ?? "")
        .slice(0, 3);
      errores = `${errMatch[1]} error(s)${listed.length ? ":\n" + listed.map((l) => `  - ${l}`).join("\n") : ""}`;
    } else if (warnMatch) {
      errores = `(${warnMatch[1]} warning(s), sin errores)`;
    }

    // Determine conclusion and optional suggestion
    let conclusion: string;
    let suggestion = "";
    if (estado === "not found") {
      conclusion = `El servicio "${service}" no existe en este sistema.`;
    } else if (estado === "running") {
      conclusion = errMatch
        ? "Servicio activo pero con errores en el journal."
        : "Servicio funcionando correctamente.";
      if (errMatch) suggestion = `Sugerencia: usa \`/fix ${service}\` para investigar.`;
    } else {
      conclusion = `Servicio no está activo (${estado}).`;
      suggestion = `Sugerencia: usa \`/fix ${service}\` para reiniciarlo.`;
    }

    // Print structured report
    const header = `─── check service: ${service} `;
    const pad = Math.max(0, RULE_WIDTH - header.length);
    console.log(`\n${header}${"─".repeat(pad)}`);
    console.log(`Service:    ${service}`);
    console.log(`Estado:     ${estado}`);
    console.log(`Errores:    ${errores}`);
    console.log(`Conclusión: ${conclusion}`);
    if (suggestion) console.log(suggestion);
    console.log(rule() + "\n");

    // Inject combined context for follow-up questions
    if (!statusResult.error && !journalResult.error) {
      const statusCtx = statusResult.contextOutput ?? statusResult.output;
      const jCtx = journalResult.contextOutput ?? journalResult.output;
      this.agent.injectContext(`Service data:\n\n${statusCtx}\n\n${jCtx}`);
    }

    this.logger.info(`/check service: ${service} — ${estado}`);
  }

  private async handleWebCheck(target: string): Promise<void> {
    if (!target) {
      console.log("Usage: /check web <host-or-url>\n");
      return;
    }

    // Extract host from URL (https://foo.com/path) or treat as bare hostname
    const urlMatch = target.match(/^https?:\/\/([^/]+)/i);
    const host = urlMatch?.[1] ?? target;
    const httpUrl = urlMatch ? target : `https://${target}`;

    const ctxParts: string[] = [];

    // Step 1: DNS
    process.stdout.write(`[tool] executing: getent hosts ${host}\n`);
    const dnsResult = await this.tools.execute("dns_lookup", { host }, { cwd: process.cwd() });
    if (dnsResult.error) {
      console.log(`[error] dns: ${dnsResult.error}\n`);
      this.logger.warn(`/check web dns failed: ${dnsResult.error}`);
      return;
    }
    ctxParts.push(dnsResult.contextOutput ?? dnsResult.output);

    // Step 2: Ping (non-fatal — unreachable is a valid result)
    process.stdout.write(`[tool] executing: ping -c 4 ${host}\n`);
    const pingResult = await this.tools.execute("ping_host", { host }, { cwd: process.cwd() });
    if (pingResult.error) {
      ctxParts.push(`[PING: ${host}]\n${pingResult.error}`);
      this.logger.warn(`/check web ping: ${pingResult.error}`);
    } else {
      ctxParts.push(pingResult.contextOutput ?? pingResult.output);
    }

    // Step 3: HTTP (non-fatal — connection error is a valid result)
    process.stdout.write(`[tool] executing: curl -I ${httpUrl}\n`);
    const httpResult = await this.tools.execute("http_head_check", { url: httpUrl }, { cwd: process.cwd() });
    if (httpResult.error) {
      ctxParts.push(`[HTTP_HEAD: ${httpUrl}]\n${httpResult.error}`);
      this.logger.warn(`/check web http: ${httpResult.error}`);
    } else {
      ctxParts.push(httpResult.contextOutput ?? httpResult.output);
    }

    const header = `─── web check: ${target} `;
    const pad = Math.max(0, RULE_WIDTH - header.length);
    console.log(`\n${header}${"─".repeat(pad)}`);
    console.log(rule() + "\n");

    const dnsStatus = "OK";
    const pingStatus = pingResult.error ? "FAIL" : "OK";
    const httpStatus = httpResult.error ? "FAIL" : "OK";

    console.log(`DNS   ${dnsStatus}`);
    console.log(`Ping  ${pingStatus}${pingResult.error ? " — ICMP sin respuesta" : ""}`);
    console.log(`HTTP  ${httpStatus}${httpResult.error ? ` — ${httpResult.error}` : ""}`);

    let conclusion: string;
    if (pingStatus === "FAIL" && httpStatus === "OK") {
      conclusion = "El host responde HTTP pero bloquea ICMP (ping).";
    } else if (pingStatus === "OK" && httpStatus === "FAIL") {
      conclusion = "El host responde ping pero no devuelve respuesta HTTP.";
    } else if (pingStatus === "FAIL" && httpStatus === "FAIL") {
      conclusion = "El host no responde ni a ICMP ni a HTTP.";
    } else {
      conclusion = "El host es alcanzable por DNS, ping y HTTP.";
    }

    console.log(`\nConclusión: ${conclusion}\n`);
    this.logger.info(`/check web: ${target} dns=${dnsStatus} ping=${pingStatus} http=${httpStatus}`);
  }

  private async handleHttp(input: string): Promise<void> {
    const url = input.slice("/http".length).trim();
    if (!url) {
      console.log("Usage: /http <url>\n");
      return;
    }

    const result = await this.tools.execute(
      "http_head_check",
      { url },
      { cwd: process.cwd() }
    );

    if (result.error) {
      console.log(`[error] ${result.error}\n`);
      this.logger.warn(`/http failed: ${result.error}`);
      return;
    }

    const header = `─── http head: ${url} `;
    const pad = Math.max(0, RULE_WIDTH - header.length);
    console.log(`\n${header}${"─".repeat(pad)}`);
    console.log(result.output);
    console.log(rule() + "\n");

    const ctx = result.contextOutput ?? result.output;
    this.agent.injectContext(`Network check:\n\n${ctx}`);
    console.log("[HTTP headers loaded into context. Ask anything about them.]\n");
    this.logger.info(`/http: ${url}`);
  }

  private isBackend(service: string): boolean {
    return service === config.backendService;
  }

  private confirm(message: string): Promise<boolean> {
    return new Promise((resolve) => {
      this.rl.question(`${message} `, (answer) => {
        resolve(answer.trim().toLowerCase() === "yes");
      });
    });
  }

  private async handleRestart(input: string): Promise<void> {
    const service = input.slice("/restart".length).trim();
    if (!service) {
      console.log("Usage: /restart <service>\n");
      return;
    }

    const result = await this.tools.execute(
      "restart_service",
      { service },
      { cwd: process.cwd(), confirm: this.confirm.bind(this) }
    );

    if (result.error) {
      console.log(`[error] ${result.error}\n`);
      this.logger.warn(`/restart failed: ${result.error}`);
      return;
    }

    console.log(result.output + "\n");
    if (this.isBackend(service)) {
      console.log(
        `[!] Acción ejecutada sobre el backend del agente. La sesión puede interrumpirse.\n` +
        `    Verifica manualmente con \`systemctl status ${service}\` o vuelve a abrir el agente.\n`
      );
    }
    this.logger.info(`/restart: ${service}`);
  }

  private async handleKill(input: string): Promise<void> {
    const pid = input.slice("/kill".length).trim();
    if (!pid) {
      console.log("Usage: /kill <pid>\n");
      return;
    }

    const result = await this.tools.execute(
      "kill_process",
      { pid },
      { cwd: process.cwd(), confirm: this.confirm.bind(this) }
    );

    if (result.error) {
      console.log(`[error] ${result.error}\n`);
      this.logger.warn(`/kill failed: ${result.error}`);
      return;
    }

    console.log(result.output + "\n");
    this.logger.info(`/kill: ${pid}`);
  }

  private async handleDiagnose(input: string): Promise<void> {
    const service = input.slice("/diagnose".length).trim();
    if (!service) {
      console.log("Usage: /diagnose <service>\n");
      return;
    }

    // Step 1: systemctl status
    process.stdout.write(`[tool] executing: systemctl status ${service}\n`);
    const statusResult = await this.tools.execute(
      "systemctl_status",
      { service },
      { cwd: process.cwd() }
    );
    if (statusResult.error) {
      console.log(`[error] ${statusResult.error}\n`);
      this.logger.warn(`/diagnose systemctl failed: ${statusResult.error}`);
      return;
    }

    // Step 2: journalctl
    process.stdout.write(`[tool] executing: journalctl -u ${service}\n`);
    const journalResult = await this.tools.execute(
      "journalctl",
      { service },
      { cwd: process.cwd() }
    );
    if (journalResult.error) {
      console.log(`[error] ${journalResult.error}\n`);
      this.logger.warn(`/diagnose journalctl failed: ${journalResult.error}`);
      return;
    }

    // Combine both into one Service data context block
    const statusCtx = statusResult.contextOutput ?? statusResult.output;
    const journalCtx = journalResult.contextOutput ?? journalResult.output;
    this.agent.injectContext(`Service data:\n\n${statusCtx}\n\n${journalCtx}`);

    // Ask the agent for a structured diagnosis — no action execution
    process.stdout.write("Assistant: ");
    try {
      await this.agent.send(
        `Diagnostica el servicio "${service}": resume el estado y los hallazgos del journal, ` +
        `luego indica la acción concreta más adecuada. ` +
        `Si recomiendas reiniciar, di exactamente: Recomendación: usa \`/restart ${service}\` para reiniciarlo.`,
        (token) => { process.stdout.write(token); }
      );
      process.stdout.write("\n\n");
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      process.stdout.write(`\n[error] ${msg}\n\n`);
      this.logger.error("Diagnose agent call failed", err);
    }
    this.logger.info(`/diagnose: ${service}`);
  }

  private async handleFix(input: string): Promise<void> {
    const service = input.slice("/fix".length).trim();
    if (!service) {
      console.log("Usage: /fix <service>\n");
      return;
    }

    // Step 1: systemctl status
    process.stdout.write(`[tool] executing: systemctl status ${service}\n`);
    const statusResult = await this.tools.execute(
      "systemctl_status",
      { service },
      { cwd: process.cwd() }
    );
    if (statusResult.error) {
      console.log(`[error] ${statusResult.error}\n`);
      this.logger.warn(`/fix systemctl failed: ${statusResult.error}`);
      return;
    }

    const statusText = [statusResult.error, statusResult.output, statusResult.contextOutput]
      .filter(Boolean)
      .join("\n");
    if (/not\s+found|could not be found|Unit .+ not found/i.test(statusText)) {
      console.log(`El servicio "${service}" no existe.\n`);
      this.logger.warn(`/fix: service not found — ${service}`);
      return;
    }

    // Source of truth: systemctl output decides if action is needed
    if (/Active:\s+active \(running\)/i.test(statusResult.output)) {
      console.log(statusResult.contextOutput ?? statusResult.output);
      console.log("No se requiere acción.\n");
      this.logger.info(`/fix: ${service} — already running, no action needed`);
      return;
    }

    // Step 2: journalctl
    process.stdout.write(`[tool] executing: journalctl -u ${service}\n`);
    const journalResult = await this.tools.execute(
      "journalctl",
      { service },
      { cwd: process.cwd() }
    );
    if (journalResult.error) {
      console.log(`[error] ${journalResult.error}\n`);
      this.logger.warn(`/fix journalctl failed: ${journalResult.error}`);
      return;
    }

    // Inject combined context (same format as /diagnose)
    const statusCtx = statusResult.contextOutput ?? statusResult.output;
    const journalCtx = journalResult.contextOutput ?? journalResult.output;
    this.agent.injectContext(`Service data:\n\n${statusCtx}\n\n${journalCtx}`);

    // If targeting the LLM backend, skip agent.send() — restarting it would
    // cut the connection mid-flight and produce an empty [error].
    if (this.isBackend(service)) {
      console.log(statusCtx);
      process.stdout.write(`[fix] restart_service "${service}"\n`);
      const backendRestart = await this.tools.execute(
        "restart_service",
        { service },
        { cwd: process.cwd(), confirm: this.confirm.bind(this) }
      );
      if (backendRestart.error) {
        console.log(`[error] ${backendRestart.error}\n`);
        this.logger.warn(`/fix restart failed: ${backendRestart.error}`);
        return;
      }
      console.log(backendRestart.output + "\n");
      console.log(
        `[!] Acción ejecutada sobre el backend del agente. La sesión puede interrumpirse.\n` +
        `    Verifica manualmente con \`systemctl status ${service}\` o vuelve a abrir el agente.\n`
      );
      this.logger.info(`/fix: restarted backend service ${service}`);
      return;
    }

    // Ask agent for diagnosis, capture full response
    let diagnosis = "";
    process.stdout.write("Assistant: ");
    try {
      await this.agent.send(
        `Diagnostica el servicio "${service}": resume el estado y los hallazgos del journal, ` +
        `luego indica la acción concreta más adecuada. ` +
        `Si recomiendas reiniciar, di exactamente: Recomendación: usa \`/restart ${service}\` para reiniciarlo.`,
        (token) => {
          process.stdout.write(token);
          diagnosis += token;
        }
      );
      process.stdout.write("\n\n");
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      process.stdout.write(`\n[error] ${msg}\n\n`);
      this.logger.error("/fix agent call failed", err);
      return;
    }

    // Service is not running — proceed to restart with mandatory confirmation
    // Execute restart via real tool with mandatory confirmation
    process.stdout.write(`[fix] restart_service "${service}"\n`);
    const restartResult = await this.tools.execute(
      "restart_service",
      { service },
      { cwd: process.cwd(), confirm: this.confirm.bind(this) }
    );

    if (restartResult.error) {
      console.log(`[error] ${restartResult.error}\n`);
      this.logger.warn(`/fix restart failed: ${restartResult.error}`);
      return;
    }

    console.log(restartResult.output + "\n");
    this.logger.info(`/fix: restarted ${service}`);

    // Step 4: verify service state after restart
    process.stdout.write(`[tool] executing: systemctl status ${service}\n`);
    const verifyResult = await this.tools.execute(
      "systemctl_status",
      { service },
      { cwd: process.cwd() }
    );

    if (verifyResult.error) {
      console.log(`[error] ${verifyResult.error}\n`);
      this.logger.warn(`/fix verify failed: ${verifyResult.error}`);
      return;
    }

    const recovered = /active \(running\)/i.test(verifyResult.output);
    if (recovered) {
      console.log(`Servicio recuperado correctamente.\n`);
      this.logger.info(`/fix: ${service} recovered`);
    } else {
      console.log(`El problema persiste. Estado actual:\n${verifyResult.output}\n`);
      this.logger.warn(`/fix: ${service} still not healthy after restart`);
    }
  }

  private async collectAuditData(): Promise<{
    memStatus: "OK" | "ATTENTION" | "CRITICAL"; memDetail: string;
    diskStatus: "OK" | "ATTENTION" | "CRITICAL"; diskDetail: string;
    psStatus: "OK" | "ATTENTION" | "CRITICAL"; psDetail: string;
    portsStatus: "OK" | "ATTENTION"; portsDetail: string;
    svcStatus: "OK" | "ATTENTION" | "CRITICAL"; svcDetail: string;
  }> {
    const cwd = process.cwd();

    // ── Step 1: parallel read-only tools ──────────────────────────────────
    process.stdout.write("[audit] memory, disk, processes, ports...\n");
    const [memResult, diskResult, psResult, portsResult] = await Promise.all([
      this.tools.execute("memory_status",  {},                              { cwd }),
      this.tools.execute("disk_usage",     {},                              { cwd }),
      this.tools.execute("list_processes", { sort: "cpu", limit: "10" },   { cwd }),
      this.tools.execute("open_ports",     {},                              { cwd }),
    ]);

    // ── Step 2: service check ──────────────────────────────────────────────
    const svcName = config.backendService;
    process.stdout.write(`[audit] service: ${svcName}...\n`);
    const svcResult = await this.tools.execute("systemctl_status", { service: svcName }, { cwd });

    // ── Parse: Memory ──────────────────────────────────────────────────────
    let memStatus: "OK" | "ATTENTION" | "CRITICAL" = "OK";
    let memDetail = "";
    if (memResult.error) {
      memStatus = "ATTENTION";
      memDetail = "no data";
    } else {
      const memLine = memResult.output.split("\n").find((l) => l.trim().startsWith("Mem:"));
      if (memLine) {
        const parts = memLine.trim().split(/\s+/);
        const total     = parseHumanBytes(parts[1] ?? "");
        const available = parseHumanBytes(parts[6] ?? "");
        memDetail = `${parts[1] ?? "?"} total, ${parts[6] ?? "?"} available`;
        if (total > 0) {
          const ratio = available / total;
          if (ratio < 0.10) memStatus = "CRITICAL";
          else if (ratio < 0.25) memStatus = "ATTENTION";
        }
      } else {
        memDetail = "unparseable output";
        memStatus = "ATTENTION";
      }
    }

    // ── Parse: Disk ────────────────────────────────────────────────────────
    let diskStatus: "OK" | "ATTENTION" | "CRITICAL" = "OK";
    let diskDetail = "";
    if (diskResult.error) {
      diskStatus = "ATTENTION";
      diskDetail = "no data";
    } else {
      const PSEUDO_FS = new Set([
        "tmpfs", "devtmpfs", "efivarfs", "proc", "sysfs",
        "cgroup", "cgroup2", "devpts", "mqueue", "overlay",
        "hugetlbfs", "pstore", "securityfs", "fusectl",
      ]);
      let maxPct = 0;
      let maxLabel = "";
      for (const line of diskResult.output.split("\n").slice(1)) {
        const parts = line.trim().split(/\s+/);
        if (parts.length < 6) continue;
        const fs = parts[0] ?? "";
        if (PSEUDO_FS.has(fs)) continue;
        const m = (parts[4] ?? "").match(/^(\d+)%$/);
        if (!m) continue;
        const pct = parseInt(m[1] ?? "0", 10);
        if (pct > maxPct) {
          maxPct = pct;
          maxLabel = `${fs} at ${pct}% (${parts[5] ?? ""})`;
        }
      }
      diskDetail = maxLabel || "ok";
      if (maxPct >= 90) diskStatus = "CRITICAL";
      else if (maxPct >= 75) diskStatus = "ATTENTION";
    }

    // ── Parse: Processes ───────────────────────────────────────────────────
    let psStatus: "OK" | "ATTENTION" | "CRITICAL" = "OK";
    let psDetail = "";
    if (psResult.error) {
      psStatus = "ATTENTION";
      psDetail = "no data";
    } else {
      const EPHEMERAL = new Set(["ps", "top", "htop", "grep", "rg", "awk", "sed", "node", "tsx", "ts-node", "ss"]);
      let maxCpu = 0;
      let maxName = "";
      for (const line of (psResult.contextOutput ?? psResult.output).split("\n")) {
        const m = line.match(/^\s*\d+\s+(\S+)\s+([\d.]+)\s+([\d.]+)/);
        if (!m) continue;
        const name = m[1] ?? "";
        if (EPHEMERAL.has(name.toLowerCase())) continue;
        const cpu = parseFloat(m[2] ?? "0");
        if (cpu > maxCpu) { maxCpu = cpu; maxName = name; }
      }
      if (maxCpu === 0) {
        psDetail = "idle";
      } else {
        psDetail = `top: ${maxName} ${maxCpu.toFixed(1)}% CPU`;
        if (maxCpu >= 90) psStatus = "CRITICAL";
        else if (maxCpu >= 50) psStatus = "ATTENTION";
      }
    }

    // ── Parse: Ports ───────────────────────────────────────────────────────
    let portsStatus: "OK" | "ATTENTION" = "OK";
    let portsDetail = "";
    if (portsResult.error) {
      portsStatus = "ATTENTION";
      portsDetail = "no data";
    } else {
      const listenCount = portsResult.output.split("\n").filter((l) => /LISTEN/.test(l)).length;
      portsDetail = `${listenCount} listening`;
      if (listenCount > 30) portsStatus = "ATTENTION";
    }

    // ── Parse: Services ────────────────────────────────────────────────────
    let svcStatus: "OK" | "ATTENTION" | "CRITICAL" = "OK";
    let svcDetail = "";
    const svcRaw = svcResult.output + (svcResult.contextOutput ?? "");
    if (svcResult.error || /Unit .+ not found|could not be found/i.test(svcRaw)) {
      svcStatus = "ATTENTION";
      svcDetail = `${svcName}: not found`;
    } else if (/Active:\s+active \(running\)/i.test(svcResult.output)) {
      svcDetail = `${svcName}: running`;
    } else if (/Active:\s+failed/i.test(svcResult.output)) {
      svcStatus = "CRITICAL";
      svcDetail = `${svcName}: failed`;
    } else if (/Active:\s+inactive/i.test(svcResult.output)) {
      svcStatus = "ATTENTION";
      svcDetail = `${svcName}: inactive`;
    } else {
      svcStatus = "ATTENTION";
      svcDetail = `${svcName}: unknown state`;
    }

    return { memStatus, memDetail, diskStatus, diskDetail, psStatus, psDetail, portsStatus, portsDetail, svcStatus, svcDetail };
  }

  private async handleMonitor(intervalSec: number, resume: () => void): Promise<void> {
    const GREEN  = "\x1b[32m";
    const YELLOW = "\x1b[33m";
    const RED    = "\x1b[31m";
    const RESET  = "\x1b[0m";
    const col = (s: "OK" | "ATTENTION" | "CRITICAL") =>
      s === "OK" ? GREEN : s === "CRITICAL" ? RED : YELLOW;

    let stopped = false;
    let cancelSleep: (() => void) | null = null;

    // Intercept readline's SIGINT handling. Without a "SIGINT" listener on rl,
    // readline calls rl.close() on Ctrl+C, which fires our "close" → process.exit(0).
    // With a listener, readline emits "SIGINT" here instead of closing the interface.
    const onSigint = () => { stopped = true; cancelSleep?.(); };
    this.rl.on("SIGINT", onSigint);

    this.rl.pause();
    process.stdin.setRawMode(true);
    process.stdin.resume();

    console.log(`\nMonitoring every ${intervalSec}s — press Ctrl+C to stop\n`);

    while (!stopped) {
      const { memStatus, memDetail, diskStatus, diskDetail, psStatus, psDetail,
              portsStatus, portsDetail, svcStatus, svcDetail } = await this.collectAuditData();

      const ts = new Date().toLocaleTimeString();
      const lbl = (s: "OK" | "ATTENTION" | "CRITICAL") => `${col(s)}${s}${RESET}`;

      process.stdout.write(`\x1b[2K\r`); // clear current line before block
      console.log(`── ${ts} ${"─".repeat(RULE_WIDTH - ts.length - 4)}`);
      console.log(`Memory:   ${lbl(memStatus)}  ${memDetail}`);
      console.log(`Disk:     ${lbl(diskStatus)}  ${diskDetail}`);
      console.log(`Process:  ${lbl(psStatus)}  ${psDetail}`);
      console.log(`Ports:    ${lbl(portsStatus)}  ${portsDetail}`);
      console.log(`Services: ${lbl(svcStatus)}  ${svcDetail}`);

      if (stopped) break;

      await new Promise<void>((resolve) => {
        const timer = setTimeout(() => { cancelSleep = null; resolve(); }, intervalSec * 1000);
        cancelSleep = () => { clearTimeout(timer); resolve(); };
      });
    }

    this.rl.removeListener("SIGINT", onSigint);
    process.stdin.pause();
    process.stdin.setRawMode(false);
    console.log("\nMonitor stopped.\n");
    this.rl.resume();
    resume();
  }

  private async handleAudit(): Promise<void> {
    const GREEN  = "\x1b[32m";
    const YELLOW = "\x1b[33m";
    const RED    = "\x1b[31m";
    const RESET  = "\x1b[0m";
    const statusColor = (s: "OK" | "ATTENTION" | "CRITICAL") =>
      s === "OK" ? GREEN : s === "CRITICAL" ? RED : YELLOW;

    const { memStatus, memDetail, diskStatus, diskDetail, psStatus, psDetail,
            portsStatus, portsDetail, svcStatus, svcDetail } = await this.collectAuditData();

    // ── Report ─────────────────────────────────────────────────────────────
    const label = (s: "OK" | "ATTENTION" | "CRITICAL") =>
      `${statusColor(s)}${s.padEnd(9)}${RESET}`;

    console.log(`\n─── audit ${"─".repeat(RULE_WIDTH - 9)}`);
    console.log(`Memory:    ${label(memStatus)}  ${memDetail}`);
    console.log(`Disk:      ${label(diskStatus)}  ${diskDetail}`);
    console.log(`Processes: ${label(psStatus)}  ${psDetail}`);
    console.log(`Ports:     ${label(portsStatus)}  ${portsDetail}`);
    console.log(`Services:  ${label(svcStatus)}  ${svcDetail}`);
    console.log(rule());

    // Conclusion — deterministic, no LLM
    const statuses = [memStatus, diskStatus, psStatus, svcStatus] as const;
    const hasCritical = statuses.includes("CRITICAL");
    const hasAttention = statuses.includes("ATTENTION") || portsStatus === "ATTENTION";
    const issues: string[] = [];
    if (memStatus   !== "OK") issues.push(`memoria: ${memDetail}`);
    if (diskStatus  !== "OK") issues.push(`disco: ${diskDetail}`);
    if (psStatus    !== "OK") issues.push(`proceso: ${psDetail}`);
    if (portsStatus !== "OK") issues.push(`puertos: ${portsDetail}`);
    if (svcStatus   !== "OK") issues.push(`servicio: ${svcDetail}`);

    let conclusion: string;
    if (hasCritical)       conclusion = `CRITICAL — acción inmediata. ${issues.join(" | ")}`;
    else if (hasAttention) conclusion = `Revisar: ${issues.join(" | ")}.`;
    else                   conclusion = "Sistema estable. Sin alertas.";

    console.log(`\nConclusion: ${conclusion}\n`);
    this.logger.info(
      `/audit mem=${memStatus} disk=${diskStatus} ps=${psStatus} ports=${portsStatus} svc=${svcStatus}`
    );
  }

  private async handleAuditDeep(): Promise<void> {
    const GREEN  = "\x1b[32m";
    const YELLOW = "\x1b[33m";
    const RED    = "\x1b[31m";
    const BOLD   = "\x1b[1m";
    const RESET  = "\x1b[0m";

    const { memStatus, memDetail, diskStatus, diskDetail, psStatus, psDetail,
            portsStatus, portsDetail, svcStatus, svcDetail } = await this.collectAuditData();

    type Entry = { label: string; detail: string };
    const critical: Entry[] = [];
    const attention: Entry[] = [];
    const ok: Entry[] = [];

    const classify = (status: "OK" | "ATTENTION" | "CRITICAL", label: string, detail: string) => {
      if (status === "CRITICAL")  critical.push({ label, detail });
      else if (status === "ATTENTION") attention.push({ label, detail });
      else ok.push({ label, detail });
    };

    classify(memStatus,   "Memory",    memDetail);
    classify(diskStatus,  "Disk",      diskDetail);
    classify(psStatus,    "Processes", psDetail);
    classify(portsStatus, "Ports",     portsDetail);
    classify(svcStatus,   "Services",  svcDetail);

    console.log(`\n─── audit deep ${"─".repeat(RULE_WIDTH - 14)}`);

    if (critical.length > 0) {
      console.log(`\n${BOLD}${RED}CRITICAL:${RESET}`);
      for (const e of critical) console.log(`  ${RED}✖${RESET}  ${e.label.padEnd(10)} ${e.detail}`);
    }

    if (attention.length > 0) {
      console.log(`\n${BOLD}${YELLOW}ATTENTION:${RESET}`);
      for (const e of attention) console.log(`  ${YELLOW}!${RESET}  ${e.label.padEnd(10)} ${e.detail}`);
    }

    if (ok.length > 0) {
      console.log(`\n${BOLD}${GREEN}OK:${RESET}`);
      for (const e of ok) console.log(`  ${GREEN}✔${RESET}  ${e.label.padEnd(10)} ${e.detail}`);
    }

    console.log(`\n${rule()}`);

    // Conclusion — deterministic, no LLM
    let conclusion: string;
    if (critical.length > 0)       conclusion = `${RED}${BOLD}Sistema en estado crítico.${RESET} Revisar: ${critical.map((e) => e.label).join(", ")}.`;
    else if (attention.length > 0) conclusion = `${YELLOW}${BOLD}Requiere atención.${RESET} Revisar: ${attention.map((e) => e.label).join(", ")}.`;
    else                           conclusion = `${GREEN}${BOLD}Sistema estable.${RESET} Sin alertas.`;

    console.log(`\nConclusion: ${conclusion}\n`);
    this.logger.info(
      `/audit deep mem=${memStatus} disk=${diskStatus} ps=${psStatus} ports=${portsStatus} svc=${svcStatus}`
    );
  }

  private async handleLog(input: string): Promise<void> {
    const parts = input.slice("/log".length).trim().split(/\s+/);
    const filePath = parts[0];
    if (!filePath) {
      console.log("Usage: /log <path> [lines]\n");
      return;
    }
    const lines = parts[1] ?? "";

    const resolved = path.resolve(process.cwd(), filePath);

    const result = await this.tools.execute(
      "read_log",
      lines ? { path: filePath, lines } : { path: filePath },
      { cwd: process.cwd() }
    );

    if (result.error) {
      console.log(`[error] ${result.error}\n`);
      this.logger.warn(`/log failed: ${result.error}`);
      return;
    }

    const lineCount = result.output.split("\n").length;
    const header = `─── log: ${resolved} (${lineCount} líneas) `;
    const pad = Math.max(0, RULE_WIDTH - header.length);

    console.log(`\n${header}${"─".repeat(pad)}`);
    console.log(result.output);
    console.log(rule());

    const ctx = result.contextOutput ?? result.output;
    this.agent.injectContext(`Log content of \`${resolved}\`:\n\n${ctx}`);
    console.log("[Log cargado en contexto. Pregunta lo que necesites.]\n");
    this.logger.info(`/log: loaded ${resolved} (${lineCount} lines)`);
  }

  private async handleRead(input: string): Promise<void> {
    const filePath = input.slice("/read".length).trim();
    if (!filePath) {
      console.log("Usage: /read <path>\n");
      return;
    }

    const resolved = path.resolve(process.cwd(), filePath);

    const result = await this.tools.execute(
      "read_file",
      { path: filePath },
      { cwd: process.cwd() }
    );

    if (result.error) {
      console.log(`[error] ${result.error}\n`);
      this.logger.warn(`/read failed: ${result.error}`);
      return;
    }

    const lineCount = result.output.split("\n").length;
    const header = `─── ${resolved} (${lineCount} lines) `;
    const pad = Math.max(0, RULE_WIDTH - header.length);

    console.log(`\n${header}${"─".repeat(pad)}`);
    console.log(result.output);
    console.log(rule());

    this.agent.injectContext(
      `Here is the content of \`${resolved}\`:\n\n\`\`\`\n${result.output}\n\`\`\``
    );
    console.log("[File loaded into context. Ask anything about it.]\n");
    this.logger.info(`/read: loaded ${resolved} (${lineCount} lines)`);
  }

  start(): void {
    console.log(`\nLocal AI Assistant — ${config.model}`);
    console.log("Type /help for commands or /exit to quit.\n");

    const loop = (): void => {
      this.rl.question("You: ", async (raw) => {
        const input = raw.trim();

        if (!input) {
          loop();
          return;
        }

        // Async commands
        if (input.startsWith("/ls")) {
          await this.handleLs(input);
          loop();
          return;
        }

        if (input.startsWith("/read")) {
          await this.handleRead(input);
          loop();
          return;
        }

        if (input.startsWith("/log")) {
          await this.handleLog(input);
          loop();
          return;
        }

        if (input.startsWith("/ps")) {
          await this.handlePs(input);
          loop();
          return;
        }

        if (input.startsWith("/service")) {
          await this.handleService(input);
          loop();
          return;
        }

        if (input.startsWith("/journal")) {
          await this.handleJournal(input);
          loop();
          return;
        }

        if (input.startsWith("/diagnose")) {
          await this.handleDiagnose(input);
          loop();
          return;
        }

        if (input.startsWith("/fix")) {
          await this.handleFix(input);
          loop();
          return;
        }

        if (input.startsWith("/check")) {
          const sub = input.slice("/check".length).trim();
          if (sub.startsWith("web")) {
            await this.handleWebCheck(sub.slice("web".length).trim());
          } else if (sub.startsWith("service")) {
            await this.handleServiceCheck(sub.slice("service".length).trim());
          } else {
            console.log("Usage: /check web <host-or-url> | /check service <name>\n");
          }
          loop();
          return;
        }

        if (input.startsWith("/ping")) {
          await this.handlePing(input);
          loop();
          return;
        }

        if (input.startsWith("/dns")) {
          await this.handleDns(input);
          loop();
          return;
        }

        if (input.startsWith("/http")) {
          await this.handleHttp(input);
          loop();
          return;
        }

        if (input.startsWith("/monitor")) {
          const arg = input.slice("/monitor".length).trim();
          const secs = arg ? parseInt(arg, 10) : NaN;
          if (!arg || isNaN(secs) || secs < 1) {
            console.log("Usage: /monitor <seconds>  (e.g. /monitor 5)\n");
            loop();
          } else {
            await this.handleMonitor(secs, loop);
          }
          return;
        }

        if (input === "/audit deep") {
          await this.handleAuditDeep();
          loop();
          return;
        }

        if (input === "/audit") {
          await this.handleAudit();
          loop();
          return;
        }

        if (input.startsWith("/restart")) {
          await this.handleRestart(input);
          loop();
          return;
        }

        if (input.startsWith("/kill")) {
          await this.handleKill(input);
          loop();
          return;
        }

        // Sync commands
        if (this.handleCommand(input)) {
          loop();
          return;
        }

        // Auto tool detection — at most 2 tools chained, abort on first error
        const autoTools = detectToolChain(input);
        let chainOk = true;
        for (const autoTool of autoTools) {
          process.stdout.write(`[tool] executing: ${autoTool.label}\n`);
          this.logger.info(`auto-tool: ${autoTool.toolName}`);
          const result = await this.tools.execute(
            autoTool.toolName,
            autoTool.args,
            { cwd: process.cwd() }
          );
          if (result.error) {
            process.stdout.write(`[tool] error: ${result.error}\n\n`);
            this.logger.warn(`auto-tool ${autoTool.toolName} failed: ${result.error}`);
            chainOk = false;
            break;
          }
          const ctx = result.contextOutput ?? result.output;
          this.injectAutoToolContext(autoTool, ctx);
        }
        if (!chainOk) { loop(); return; }

        process.stdout.write("Assistant: ");

        try {
          await this.agent.send(input, (token) => {
            process.stdout.write(token);
          });
          process.stdout.write("\n\n");
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err);
          process.stdout.write(`\n[error] ${msg}\n\n`);
          this.logger.error("Agent send failed", err);
        }

        loop();
      });
    };

    this.rl.on("close", () => {
      this.logger.session("end");
      console.log("\nBye.");
      process.exit(0);
    });

    loop();
  }
}
