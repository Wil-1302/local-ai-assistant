/**
 * Auto tool selection — priority-based intent routing for automatic tool invocation.
 *
 * Priority order (highest wins):
 *   L0 LOG        — log file path detected, or log-analysis intent + path
 *   L1 READ       — concrete file path with extension detected
 *   L2 LS         — directory / project structure intent
 *   L3 SYSTEMCTL  — systemd service status query with service name
 *   L4 JOURNALCTL — systemd journal query (service name optional)
 *   L5 PS         — process / performance intent
 *
 * Semantic exclusions prevent cross-category false positives.
 * Conservative by design: ambiguous intent → null (no tool).
 *
 * Future: replace or supplement with LLM-driven intent classification.
 */

export interface AutoToolCall {
  toolName: string;
  args: Record<string, string>;
  /** Short label shown to the user: [tool] executing: <label> */
  label: string;
}

// ── Log helpers ───────────────────────────────────────────────────────────────

/**
 * Extensions and path patterns that identify a file as a log.
 * Used to route `.log` / `.err` / etc. paths to read_log instead of read_file.
 */
const LOG_EXTENSIONS = new Set([".log", ".err", ".out", ".error", ".access"]);

/** Path segments that strongly indicate a log directory. */
const LOG_PATH_SEGMENTS = ["/log/", "/logs/", "/var/log", "/tmp/log"];

/**
 * Keywords that express log-analysis intent.
 * Only trigger read_log when combined with a detectable file path.
 */
const LOG_INTENT_KEYWORDS: string[] = [
  // Spanish
  "analiza este log",
  "analiza el log",
  "analiza los logs",
  "revisa este log",
  "revisa el log",
  "qué error hay en",
  "qué errores hay en",
  "qué hay en el log",
  "mira este log",
  "mira el log",
  "mira este archivo de log",
  "errores del log",
  "busca errores en",
  // English
  "analyze this log",
  "analyze the log",
  "check this log",
  "check the log",
  "what errors in",
  "what's in the log",
  "read this log",
  "look at this log",
];

function isLogPath(filePath: string): boolean {
  const ext = filePath.slice(filePath.lastIndexOf(".")).toLowerCase();
  if (LOG_EXTENSIONS.has(ext)) return true;
  const lower = filePath.toLowerCase();
  return LOG_PATH_SEGMENTS.some((seg) => lower.includes(seg));
}

// ── Keyword tables ────────────────────────────────────────────────────────────

/**
 * Words that signal the user is asking about directory / project structure.
 * Match on individual words, not full phrases, so partial sentences still hit.
 */
const LS_KEYWORDS: string[] = [
  // Spanish
  "estructura",
  "carpeta",
  "carpetas",
  "directorio",
  "directorios",
  "organización",
  "layout",
  "árbol",
  "árbol de archivos",
  "qué hay",
  "qué tiene",
  "listar",
  "listar archivos",
  "mostrar carpetas",
  // English
  "structure",
  "folder",
  "folders",
  "directory",
  "directories",
  "project layout",
  "what's in",
  "list files",
  "list folders",
];

/**
 * Words that signal process / performance queries.
 * Only applied when no LS/READ exclusion is active.
 */
const PS_KEYWORDS: string[] = [
  // Spanish — performance / slowness
  "lento",
  "lenta",
  "lentitud",
  "rendimiento",
  "carga del sistema",
  "qué pasa con el sistema",
  "qué está corriendo",   // generic "what's running" — no service name
  "qué corre",
  // NOTE: bare "corriendo" removed — too ambiguous with "está corriendo <service>"
  // Spanish — direct process query
  "proceso",
  "procesos",
  // Spanish — resource query
  "cpu alta",
  "alto cpu",
  "mucha cpu",
  "mucha memoria",
  "memoria ram",
  // English
  "performance",
  "slow",
  "sluggish",
  "system load",
  "high cpu",
  "high mem",
  "processes",
  "running processes",
  "what's running",
  "consuming",
];

const MEMORY_KEYWORDS: string[] = [
  // Spanish
  "memoria ram", "cuánta memoria", "uso de memoria", "estado de memoria",
  "ram disponible", "ram libre", "ram usada", "memoria libre", "memoria usada",
  "memoria disponible", "memoria del sistema",
  // English
  "memory usage", "ram usage", "free memory", "memory status", "how much memory",
  "available memory", "memory free",
];

const DISK_KEYWORDS: string[] = [
  // Spanish
  "disco", "espacio en disco", "uso de disco", "espacio disponible",
  "cuánto espacio", "particiones", "espacio libre",
  // English
  "disk usage", "disk space", "free disk", "storage", "filesystem",
  "how much disk", "disk free", "df",
];

const SYSINFO_KEYWORDS: string[] = [
  // Spanish
  "información del sistema", "info del sistema", "kernel", "arquitectura",
  "versión del sistema", "qué sistema", "qué kernel", "versión del kernel",
  // English
  "system info", "system information", "kernel version", "uname",
  "architecture", "os version", "what kernel", "what system",
];

const SYSTEMCTL_KEYWORDS: string[] = [
  // Spanish
  "systemctl", "estado del servicio", "estado de servicio", "estado de", "estado del",
  "servicio activo", "servicio caído", "servicio fallido",
  "está activo", "está corriendo", "está caído", "está fallido", "unidad systemd",
  // English
  "service status", "is the service", "is running", "service active",
  "service failed", "service down", "systemd unit",
];

const NET_PORTS_KEYWORDS: string[] = [
  // Spanish
  "puertos abiertos", "puertos escuchando", "qué puertos", "puertos en uso",
  "puertos activos", "ss -tulpn", "netstat", "qué está escuchando",
  // English
  "open ports", "listening ports", "which ports", "ports in use",
  "what ports", "what's listening",
];

const NET_INTERFACES_KEYWORDS: string[] = [
  // Spanish
  "interfaces de red", "interfaz de red", "ip a", "ip addr",
  "direcciones ip", "configuración de red", "qué interfaces",
  // English
  "network interfaces", "ip address", "network config", "what interfaces",
  "show interfaces",
];

const NET_ROUTES_KEYWORDS: string[] = [
  // Spanish
  "rutas de red", "tabla de rutas", "ip route", "rutas ip",
  "gateway", "puerta de enlace", "enrutamiento",
  // English
  "routing table", "ip routes", "network routes", "default gateway",
  "show routes",
];

const JOURNALCTL_KEYWORDS: string[] = [
  // Spanish
  "journalctl", "journal de", "journal del", "logs del servicio",
  "logs de systemd", "logs del sistema",
  // English
  "systemd logs", "journal log", "service journal",
];

/** Patterns to extract a service name from a natural-language message. */
const SYSTEMCTL_SERVICE_PATTERNS: RegExp[] = [
  // "systemctl status <svc>" / "systemctl <svc>"
  /\bsystemctl\s+(?:status\s+)?(\w[\w@:.-]*)\b/i,
  // "status de sshd" / "status sshd"
  /\bstatus\s+(?:de(?:l?\s+servicio)?\s+)?(\w[\w@:.-]*)/i,
  // "estado de sshd" / "estado del sshd"
  /\bestado\s+de[l]?\s+(?:servicio\s+)?(\w[\w@:.-]*)/i,
  // "estado sshd" (fallback without preposition)
  /\bestado\s+(?:de(?:l?\s+servicio)?\s+)?(\w[\w@:.-]*)/i,
  // "está corriendo sshd" / "está activo sshd" (subject AFTER verb)
  /\b(?:está|is)\s+(?:corriendo|running|activo|active|caído|down|fallido|failed)\s+(\w[\w@:.-]*)/i,
  // "sshd está corriendo" / "sshd is running" (subject BEFORE verb)
  /\b(\w[\w@:.-]*)\s+(?:está|is)\s+(?:activo|inactivo|corriendo|running|stopped|failed|caído)/i,
  // "servicio sshd"
  /\bservicio\s+(\w[\w@:.-]*)\b/i,
  // "sshd status"
  /\b(\w[\w@:.-]*)\s+status\b/i,
];

const JOURNALCTL_SERVICE_PATTERNS: RegExp[] = [
  // "journalctl -u ollama" — \b removed because `-` is non-word char
  /-u\s+(\w[\w@:.-]*)/i,
  // "journalctl ollama" / "journal de sshd" — skip optional "-u" or preposition
  /\bjournal(?:ctl)?\s+(?:-u\s+)?(?:de(?:l?\s+servicio)?\s+)?(\w[\w@:.-]*)/i,
  // "ollama journal"
  /\b(\w[\w@:.-]*)\s+journal\b/i,
  // "logs del sshd" / "logs de sshd"
  /\blogs\s+de[l]?\s+(?:servicio\s+)?(\w[\w@:.-]*)/i,
];

function extractServiceName(text: string, patterns: RegExp[]): string | null {
  // Exclude terms that are not service names
  const EXCLUDED = new Set([
    // Articles / prepositions
    "de", "del", "el", "la", "los", "las", "un", "una",
    "the", "a", "an", "of",
    // Generic nouns that are not service names
    "status", "estado", "servicio", "service", "unit",
    "sistema", "system", "memoria", "memory", "disco", "disk",
    "kernel", "red", "network", "proceso", "process",
  ]);
  for (const pattern of patterns) {
    const m = text.match(pattern);
    if (m?.[1] && !EXCLUDED.has(m[1].toLowerCase())) {
      return m[1].toLowerCase();
    }
  }
  return null;
}

/**
 * Words that, when present, block PS from triggering.
 * They indicate a structural / file-system query, not a process query.
 */
const PS_EXCLUSION_KEYWORDS: string[] = [
  "estructura",
  "carpeta",
  "carpetas",
  "directorio",
  "directorios",
  "folder",
  "folders",
  "directory",
  "directories",
  "structure",
  "proyecto",
  "project",
  "archivo",
  "file",
];

/** Patterns that extract a file path from a read-intent message. */
const READ_PATTERNS: RegExp[] = [
  // Absolute path — must come first so the leading "/" is never stripped by \b
  /(?:^|\s)(\/[^\s,;'"]+\.[a-zA-Z0-9]{1,6})/,
  // Spanish: lee / leer / abre / revisa / muestra / carga + optional "el archivo" + filename.ext
  /\b(?:lee|leer|abre|abrir|revisa|revisar|muestra|mostrar|carga|cargar)\s+(?:el\s+)?(?:archivo\s+)?([^\s,;'"]+\.[a-zA-Z0-9]+)/i,
  // English: read / open / show / load / check + optional "the file" + filename.ext
  /\b(?:read|open|show|load|check)\s+(?:the\s+)?(?:file\s+)?([^\s,;'"]+\.[a-zA-Z0-9]+)/i,
  // Bare filename.ext anywhere in the message (e.g. "qué dice README.md")
  /\b([a-zA-Z0-9_\-./]+\.[a-zA-Z]{2,5})\b/,
];

// ── Helpers ───────────────────────────────────────────────────────────────────

const DEBUG = process.env["DEBUG_TOOLS"] === "1";

function debug(intent: string, tool: string | null): void {
  if (DEBUG) {
    console.debug(`[tool-selector] intent="${intent}" → tool=${tool ?? "none"}`);
  }
}

function hasAny(text: string, keywords: string[]): boolean {
  return keywords.some((k) => text.includes(k));
}

// ── Detection ─────────────────────────────────────────────────────────────────

// ── Single-intent detectors ───────────────────────────────────────────────

/** Detects read/log intent only (L0 + L1). Does not match LS or PS. */
function detectReadIntent(message: string): AutoToolCall | null {
  const text = message.toLowerCase();
  const hasLogIntent = hasAny(text, LOG_INTENT_KEYWORDS);

  // L0: log path or log-intent keyword + any path
  for (const pattern of READ_PATTERNS) {
    const match = message.match(pattern);
    if (match?.[1]) {
      const filePath = match[1].replace(/['"]/g, "");
      if (isLogPath(filePath) || hasLogIntent) {
        debug("log", `read_log(${filePath})`);
        return { toolName: "read_log", args: { path: filePath }, label: `log ${filePath}` };
      }
    }
  }

  // L1: concrete file path with extension
  for (const pattern of READ_PATTERNS) {
    const match = message.match(pattern);
    if (match?.[1]) {
      const filePath = match[1].replace(/['"]/g, "");
      debug("read", `read_file(${filePath})`);
      return { toolName: "read_file", args: { path: filePath }, label: `read ${filePath}` };
    }
  }

  return null;
}

/** Detects list_dir intent only (L2). */
function detectLsIntent(message: string): AutoToolCall | null {
  if (hasAny(message.toLowerCase(), LS_KEYWORDS)) {
    debug("ls", "list_dir");
    return { toolName: "list_dir", args: { path: "." }, label: "ls ." };
  }
  return null;
}

// ── Chain detection ───────────────────────────────────────────────────────

/**
 * Detect up to 2 auto tool calls from a single message.
 *
 * Chains supported:
 *   list_dir → read_file
 *   list_dir → read_log
 *
 * Guarantees: result length is 0, 1, or 2. Never more.
 * Chain aborts in the caller on first tool error — no loops possible.
 */
export function detectToolChain(message: string): AutoToolCall[] {
  const text = message.toLowerCase().trim();

  const lsCall = detectLsIntent(message);
  const readCall = detectReadIntent(message);

  if (lsCall && readCall) return [lsCall, readCall];
  if (readCall) return [readCall];
  if (lsCall) return [lsCall];

  // L3: systemctl — requires a service name to be useful
  if (hasAny(text, SYSTEMCTL_KEYWORDS)) {
    const service = extractServiceName(text, SYSTEMCTL_SERVICE_PATTERNS);
    if (service) {
      debug("systemctl", `systemctl_status(${service})`);
      return [{ toolName: "systemctl_status", args: { service }, label: `systemctl status ${service}` }];
    }
  }

  // L4: journalctl — service name optional
  if (hasAny(text, JOURNALCTL_KEYWORDS)) {
    const service = extractServiceName(text, JOURNALCTL_SERVICE_PATTERNS);
    debug("journalctl", service ? `journalctl(${service})` : "journalctl");
    return [{
      toolName: "journalctl",
      args: service ? { service } : {},
      label: service ? `journalctl -u ${service}` : "journalctl",
    }];
  }

  // L5: PS only when no structural exclusion is active
  if (hasAny(text, PS_KEYWORDS) && !hasAny(text, PS_EXCLUSION_KEYWORDS)) {
    debug("ps", "list_processes");
    return [{ toolName: "list_processes", args: {}, label: "ps" }];
  }

  if (hasAny(text, MEMORY_KEYWORDS)) {
    debug("memory", "memory_status");
    return [{ toolName: "memory_status", args: {}, label: "free -h" }];
  }

  if (hasAny(text, DISK_KEYWORDS)) {
    debug("disk", "disk_usage");
    return [{ toolName: "disk_usage", args: {}, label: "df -h" }];
  }

  if (hasAny(text, SYSINFO_KEYWORDS)) {
    debug("sysinfo", "system_info");
    return [{ toolName: "system_info", args: {}, label: "uname -a" }];
  }

  if (hasAny(text, NET_PORTS_KEYWORDS)) {
    debug("net_ports", "open_ports");
    return [{ toolName: "open_ports", args: {}, label: "ss -tulpn" }];
  }

  if (hasAny(text, NET_INTERFACES_KEYWORDS)) {
    debug("net_ifaces", "net_interfaces");
    return [{ toolName: "net_interfaces", args: {}, label: "ip a" }];
  }

  if (hasAny(text, NET_ROUTES_KEYWORDS)) {
    debug("net_routes", "net_routes");
    return [{ toolName: "net_routes", args: {}, label: "ip route" }];
  }

  debug("none", null);
  return [];
}
