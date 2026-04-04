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

// ── Edit intent ──────────────────────────────────────────────────────────────

/**
 * Returns true when a string looks like actual code / CSS / structured text
 * rather than plain natural-language prose.
 * Used to distinguish literal edits ("cambia color: red; por color: blue;")
 * from semantic edits ("cambia el color del botón a azul").
 */
function looksLikeCode(s: string): boolean {
  return /[{};:()"'=<>!@#$%^&*|\\]/.test(s);
}

/**
 * Words that signal the user wants to EDIT or MODIFY part of an existing file.
 * Must be checked BEFORE write detection to avoid routing edit → write_file.
 *
 * Includes structural rebuild verbs so instructions like
 * "reconstruye el layout con sidebar en index.html" route to semantic edit
 * instead of falling through to detectToolChain (read_file → LLM text response).
 */
const EDIT_KEYWORDS: string[] = [
  // Spanish — incremental edit
  "cambia", "cambiar", "modifica", "modificar", "edita", "editar",
  "arregla", "arreglar", "corrige", "corregir", "actualiza", "actualizar",
  "añade", "añadir", "agrega", "agregar", "reemplaza", "reemplazar",
  "sustituye", "sustituir", "borra la línea", "elimina la línea",
  // Spanish — structural rebuild (routes to semantic edit + structural assessment path)
  "reconstruye", "reconstruir", "rehaz", "rehacer", "rehace",
  "reestructura", "reestructurar",
  "rediseña", "redisena", "rediseñar",
  // English — incremental edit
  "change", "modify", "edit", "fix", "update", "replace",
  "add to", "append to", "remove from", "delete from",
  "rename", "refactor",
  // English — structural rebuild
  "rebuild", "restructure", "redesign", "rewrite",
];

/** Patterns to extract the search (old) text from an edit-intent message. */
const EDIT_SEARCH_PATTERNS: RegExp[] = [
  // "cambia X a Y" / "change X to Y"
  /\b(?:cambia|change|reemplaza|replace|sustituye|substitute)\s+["']?(.+?)["']?\s+(?:a|por|to|with)\s+["']?(.+?)["']?$/i,
  // "modifica X por Y" / "update X to Y"
  /\b(?:modifica|modifca|update|edita|edit)\s+["']?(.+?)["']?\s+(?:por|a|to|with)\s+["']?(.+?)["']?$/i,
];

// ── Write intent ─────────────────────────────────────────────────────────────

/**
 * Words that signal the user wants to CREATE or WRITE a file.
 * Checked before read detection to prevent write → read_file misrouting.
 */
const WRITE_KEYWORDS: string[] = [
  // Spanish
  "crea", "crear", "genera", "generar", "escribe", "escribir",
  "haz un archivo", "haz el archivo", "nuevo archivo",
  // English
  "create", "generate", "write a file", "write the file",
  "create a file", "make a file", "new file",
];

/**
 * Patterns to extract explicit inline content from write-intent messages.
 * Tried in order; first match wins.
 */
const WRITE_CONTENT_PATTERNS: RegExp[] = [
  /\bcon\s+contenido\s+(.+)$/i,
  /\bcon\s+el\s+contenido\s+(.+)$/i,
  /\bcon\s+el\s+texto\s+(.+)$/i,
  /\bque\s+diga\s+(.+)$/i,
  /\bque\s+contenga\s+(.+)$/i,
  /\bwith\s+content\s+(.+)$/i,
  /\bcontaining\s+(.+)$/i,
  /\bwith\s+text\s+(.+)$/i,
];

/** System path prefixes blocked for write operations (mirrors write.ts). */
const BLOCKED_WRITE_PREFIXES = [
  "/etc", "/usr", "/bin", "/sbin", "/lib", "/lib64",
  "/boot", "/sys", "/proc", "/dev", "/root",
];

function isBlockedWritePath(p: string): boolean {
  return BLOCKED_WRITE_PREFIXES.some(
    (prefix) => p === prefix || p.startsWith(prefix + "/")
  );
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

const PING_KEYWORDS: string[] = [
  // Spanish
  "haz ping", "hacer ping", "ping a", "prueba ping", "prueba la conexión a",
  "prueba conectividad", "comprueba conexión", "conectividad a", "conectividad con",
  "alcanzable", "llego a", "llega a",
  // English
  "ping", "check connectivity to", "is reachable", "can reach",
];

const DNS_KEYWORDS: string[] = [
  // Spanish
  "resuelve ", "resolución dns", "dns de ", "resuelve el host",
  "qué ip tiene", "qué dirección tiene", "qué ip es",
  "resolución de nombre", "lookup de",
  // English
  "dns lookup", "resolve ", "nslookup", "what ip is", "what ip does",
  "dns resolve",
];

const HTTP_HEAD_KEYWORDS: string[] = [
  // Spanish
  "cabecera http", "cabeceras http", "cabecera de ", "cabeceras de ",
  "revisa la cabecera", "revisa la url", "estado http de",
  "responde la url", "qué responde", "qué devuelve",
  // English
  "http head", "http headers", "check url", "check the url",
  "curl head", "http status of", "what does the url return",
];

const JOURNALCTL_KEYWORDS: string[] = [
  // Spanish
  "journalctl", "journal de", "journal del", "logs del servicio",
  "logs de systemd", "logs del sistema",
  // English
  "systemd logs", "journal log", "service journal",
];

/** Patterns to extract a hostname or IP from a natural-language ping/dns message. */
const HOST_PATTERNS: RegExp[] = [
  // "ping a google.com" / "ping google.com"
  /\bping\s+(?:a\s+)?([a-zA-Z0-9][a-zA-Z0-9.\-]*\.[a-zA-Z]{2,})\b/i,
  // "resuelve openai.com" / "resolve openai.com"
  /\b(?:resuelve|resolve|nslookup|lookup\s+de)\s+([a-zA-Z0-9][a-zA-Z0-9.\-]*\.[a-zA-Z]{2,})\b/i,
  // "dns de google.com"
  /\bdns\s+de\s+([a-zA-Z0-9][a-zA-Z0-9.\-]*\.[a-zA-Z]{2,})\b/i,
  // "conectividad a/con google.com"
  /\bconectividad\s+(?:a|con)\s+([a-zA-Z0-9][a-zA-Z0-9.\-]*\.[a-zA-Z]{2,})\b/i,
  // "qué ip tiene google.com" / "qué ip es google.com"
  /\bqu[eé]\s+ip\s+(?:tiene|es)\s+([a-zA-Z0-9][a-zA-Z0-9.\-]*\.[a-zA-Z]{2,})\b/i,
  // bare hostname.tld anywhere (last resort)
  /\b([a-zA-Z0-9][a-zA-Z0-9.\-]{2,}\.[a-zA-Z]{2,})\b/i,
];

/** Patterns to extract an HTTP/HTTPS URL. */
const URL_PATTERNS: RegExp[] = [
  /(https?:\/\/[^\s,;'"]+)/i,
];

function extractHost(text: string): string | null {
  for (const pattern of HOST_PATTERNS) {
    const m = text.match(pattern);
    if (m?.[1]) return m[1].toLowerCase();
  }
  return null;
}

function extractUrl(text: string): string | null {
  for (const pattern of URL_PATTERNS) {
    const m = text.match(pattern);
    if (m?.[1]) return m[1];
  }
  return null;
}

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

// ── Write-path security check ─────────────────────────────────────────────────

/** Matches any token that looks like an absolute path (with or without extension). */
const ABSOLUTE_PATH_RE = /(?:^|\s)(\/\S+)/g;

/**
 * If the message has write intent AND references a blocked system path,
 * returns an error string. Call this BEFORE detectToolChain so no tool runs.
 */
export function getBlockedWritePathError(message: string): string | null {
  const text = message.toLowerCase();
  if (!hasAny(text, WRITE_KEYWORDS)) return null;
  const blocked = findBlockedAbsolutePath(message);
  if (blocked) return `Ruta no permitida por seguridad: ${blocked}`;
  return null;
}

/**
 * Scan a message for any absolute path that falls under a blocked prefix.
 * Uses a broad regex that matches extensionless paths like /etc/hosts too.
 */
function findBlockedAbsolutePath(message: string): string | null {
  ABSOLUTE_PATH_RE.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = ABSOLUTE_PATH_RE.exec(message)) !== null) {
    const p = (m[1] ?? "").replace(/['"]/g, "").replace(/[,;]$/, "");
    if (isBlockedWritePath(p)) return p;
  }
  // Also check READ_PATTERNS for paths already detected with extension
  for (const pattern of READ_PATTERNS) {
    const match = message.match(pattern);
    if (match?.[1]) {
      const p = match[1].replace(/['"]/g, "");
      if (isBlockedWritePath(p)) return p;
    }
  }
  return null;
}

/**
 * If the message has edit intent AND references a blocked system path,
 * returns an error string. Call this BEFORE detectToolChain so no tool runs
 * and the LLM is never invoked with the request.
 */
export function getBlockedEditPathError(message: string): string | null {
  const text = message.toLowerCase();
  if (!hasAny(text, EDIT_KEYWORDS)) return null;
  const blocked = findBlockedAbsolutePath(message);
  if (blocked) return `Ruta no permitida por seguridad: ${blocked}`;
  return null;
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

/**
 * Find the first editable (non-log, non-blocked) file path mentioned in a message.
 *
 * Unlike iterating READ_PATTERNS directly, this function uses matchAll on the bare
 * filename pattern so it can skip over false positives like `console.log` and keep
 * looking for the actual target file (e.g. `script.js`).
 *
 * Priority:
 *   1. Absolute path (first pattern)
 *   2. Verb-prefixed filename (Spanish/English verb + filename)
 *   3. All bare filename.ext matches in the message, skipping log paths
 */
function findEditableFilePath(message: string): string | null {
  // Priority 1: absolute path
  const absMatch = message.match(/(?:^|\s)(\/[^\s,;'"]+\.[a-zA-Z0-9]{1,6})/);
  if (absMatch?.[1]) {
    const p = absMatch[1].replace(/['"]/g, "");
    if (!isLogPath(p) && !isBlockedWritePath(p)) return p;
  }

  // Priority 2: verb-prefixed filename (same sub-patterns as READ_PATTERNS[1] and [2])
  const verbPatterns: RegExp[] = [
    /\b(?:lee|leer|abre|abrir|revisa|revisar|muestra|mostrar|carga|cargar)\s+(?:el\s+)?(?:archivo\s+)?([^\s,;'"]+\.[a-zA-Z0-9]+)/i,
    /\b(?:read|open|show|load|check)\s+(?:the\s+)?(?:file\s+)?([^\s,;'"]+\.[a-zA-Z0-9]+)/i,
  ];
  for (const pat of verbPatterns) {
    const m = message.match(pat);
    if (m?.[1]) {
      const p = m[1].replace(/['"]/g, "");
      if (!isLogPath(p) && !isBlockedWritePath(p)) return p;
    }
  }

  // Priority 3: scan ALL bare filename.ext occurrences, skipping log paths
  // This handles cases like "añade un console.log al inicio en script.js"
  // where console.log is a method call, not the edit target.
  const bareRe = /\b([a-zA-Z0-9_\-./]+\.[a-zA-Z]{2,5})\b/g;
  let m: RegExpExecArray | null;
  while ((m = bareRe.exec(message)) !== null) {
    const p = (m[1] ?? "").replace(/['"]/g, "");
    if (!isLogPath(p) && !isBlockedWritePath(p)) return p;
  }

  return null;
}

/**
 * Strip the file reference from a message to produce a clean instruction.
 * Handles prepositions: "en", "in", "a" (Spanish "a <file>").
 */
function stripFileRef(message: string, filePath: string): string {
  const escapedPath = filePath.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const fileArticle = `(?:el\\s+(?:archivo|fichero)|the\\s+file|the)?`;
  return message
    .replace(new RegExp(`\\s*\\b(?:en|in|a)\\b\\s+${fileArticle}\\s*${escapedPath}\\b`, "i"), " ")
    .replace(new RegExp(`\\s+${escapedPath}\\b`, "i"), " ")
    .trim();
}

/**
 * Detects edit_file intent: user wants to change part of an existing file
 * using literal search/replace text (must look like code, not prose).
 * Returns null when no edit keyword or no file path is detected, or when
 * the extracted search text is natural-language prose (→ semantic edit instead).
 * Must run BEFORE detectWriteIntent so "modifica" doesn't fall into write_file.
 */
function detectEditIntent(message: string): AutoToolCall | null {
  const text = message.toLowerCase();
  if (!hasAny(text, EDIT_KEYWORDS)) return null;

  const filePath = findEditableFilePath(message);
  if (!filePath) return null;

  const stripped = stripFileRef(message, filePath);

  // Try to extract search/replace from structured patterns on the stripped message
  let search = "";
  let replace = "";
  for (const ep of EDIT_SEARCH_PATTERNS) {
    const em = stripped.match(ep);
    if (em?.[1] && em?.[2]) {
      search = em[1].trim();
      replace = em[2].trim();
      break;
    }
  }

  // No literal search/replace found → semantic edit (handled separately)
  if (!search) return null;

  // If the search text doesn't look like code (e.g. "el color del botón"),
  // the user is describing intent in prose → route to semantic edit instead.
  if (!looksLikeCode(search)) return null;

  debug("edit", `edit_file(${filePath})`);
  return {
    toolName: "edit_file",
    args: { path: filePath, search, replace },
    label: `edit ${filePath}`,
  };
}

export interface SemanticEditIntent {
  filePath: string;
  /** The user's instruction with the file reference stripped out. */
  instruction: string;
}

/**
 * Detects semantic edit intent: user wants to change a file via natural language
 * but without specifying exact search/replace text.
 *
 * Returns null when:
 *   - no edit keywords present
 *   - no editable file path found (log paths and blocked paths are skipped)
 *   - a literal search/replace with code-like text IS extractable (→ detectEditIntent)
 */
export function detectSemanticEditIntent(message: string): SemanticEditIntent | null {
  const text = message.toLowerCase();
  if (!hasAny(text, EDIT_KEYWORDS)) return null;

  const filePath = findEditableFilePath(message);
  if (!filePath) return null;

  const instruction = stripFileRef(message, filePath);

  // Only defer to detectEditIntent when the extracted search text looks like code.
  // Natural-language descriptions (no code chars) are semantic edits.
  for (const ep of EDIT_SEARCH_PATTERNS) {
    const em = instruction.match(ep);
    if (em?.[1] && em?.[2] && looksLikeCode(em[1].trim())) return null;
  }

  debug("semantic_edit", `semantic_edit(${filePath})`);
  return { filePath, instruction };
}

// ── Bugfix / refactor intent ──────────────────────────────────────────────────

/**
 * Keywords that signal a specific code bug/error that needs fixing.
 * Only trigger when combined with an EDIT_KEYWORD (e.g. "arregla") to
 * distinguish "arregla este bug en script.js" from "arregla el color…".
 */
const BUGFIX_SPECIFIC_KEYWORDS: string[] = [
  // Spanish
  "bug", "falla", "fallo",
  "error en el código", "error en la función", "el error en",
  "hay un bug", "tiene un bug", "hay un error", "el bug en",
  // English
  "fix the bug", "fix this bug", "there's a bug", "there is a bug",
  "the bug in", "the error in", "debug",
];

/**
 * Keywords that signal refactoring / code-quality improvement.
 * These are standalone — no EDIT_KEYWORD required.
 */
const REFACTOR_KEYWORDS: string[] = [
  // Spanish
  "refactoriza", "refactorizar",
  "simplifica", "simplificar",
  "haz más limpio", "haz este código más limpio",
  "limpia el código", "limpia este código",
  "mejora el código", "mejora esta función",
  // English
  "refactor", "simplify", "clean up", "make cleaner",
  "improve this code", "make this better", "clean this up",
];

export interface BugfixIntent {
  filePath: string;
  /** The user's instruction with the file reference stripped out. */
  instruction: string;
  /** True when the intent is a refactor/simplify request, not a bug fix. */
  isRefactor: boolean;
}

/**
 * Detects bugfix or refactor intent: user wants to fix a bug or improve
 * existing code quality — not insert/append new content.
 *
 * Returns null when:
 *   - no bugfix/refactor keywords are present
 *   - no editable file path is found
 */
export function detectBugfixIntent(message: string): BugfixIntent | null {
  const text = message.toLowerCase();

  const hasRefactor = hasAny(text, REFACTOR_KEYWORDS);
  const hasBugfix = hasAny(text, EDIT_KEYWORDS) && hasAny(text, BUGFIX_SPECIFIC_KEYWORDS);

  if (!hasRefactor && !hasBugfix) return null;

  const filePath = findEditableFilePath(message);
  if (!filePath) return null;

  const instruction = stripFileRef(message, filePath);
  debug("bugfix", `bugfix(${filePath}) isRefactor=${hasRefactor}`);
  return { filePath, instruction, isRefactor: hasRefactor };
}

/**
 * Returns true when the message has edit/modify intent but no editable file path
 * was found. Used to display a helpful "which file?" prompt instead of routing to
 * the LLM which may refuse an edit request without file context.
 */
export function detectEditWithoutFileIntent(message: string): boolean {
  const text = message.toLowerCase();
  if (!hasAny(text, EDIT_KEYWORDS)) return false;
  return findEditableFilePath(message) === null;
}

/**
 * Detects write file intent (runs before read detection).
 * Returns null if blocked (caller already checked via getBlockedWritePathError).
 * Returns null if run keywords present — create+run is handled separately.
 */
function detectWriteIntent(message: string): AutoToolCall | null {
  const text = message.toLowerCase();
  if (!hasAny(text, WRITE_KEYWORDS)) return null;
  // Don't intercept create+run flows (handled via detectCreateAndRunIntent)
  if (hasAny(text, RUN_KEYWORDS)) return null;

  for (const pattern of READ_PATTERNS) {
    const m = message.match(pattern);
    if (m?.[1]) {
      const filePath = m[1].replace(/['"]/g, "");
      // Skip log paths — let them fall through to read_log
      if (isLogPath(filePath)) return null;
      // Skip blocked paths — caller already surfaced error, return empty
      if (isBlockedWritePath(filePath)) return null;

      // Try explicit content patterns first
      let content = "";
      for (const cp of WRITE_CONTENT_PATTERNS) {
        const cm = message.match(cp);
        if (cm?.[1]) { content = cm[1].trim(); break; }
      }

      // Fallback: extract content after filename via "con ..." / "with ..."
      if (!content) {
        const fileIdx = message.indexOf(filePath);
        if (fileIdx !== -1) {
          const rest = message.slice(fileIdx + filePath.length);
          const cm = rest.match(/^\s+con\s+(.+)$/i) ?? rest.match(/^\s+with\s+(.+)$/i);
          if (cm?.[1]) content = cm[1].trim();
        }
      }

      debug("write", `write_file(${filePath})`);
      return { toolName: "write_file", args: { path: filePath, content }, label: `write ${filePath}` };
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

  // Network connectivity — checked FIRST so domain/URL names don't fall into read_file
  if (hasAny(text, HTTP_HEAD_KEYWORDS)) {
    const url = extractUrl(text);
    if (url) {
      debug("http_head", `http_head_check(${url})`);
      return [{ toolName: "http_head_check", args: { url }, label: `curl -I ${url}` }];
    }
  }

  if (hasAny(text, PING_KEYWORDS)) {
    const host = extractHost(text);
    if (host) {
      debug("ping", `ping_host(${host})`);
      return [{ toolName: "ping_host", args: { host }, label: `ping -c 4 ${host}` }];
    }
  }

  if (hasAny(text, DNS_KEYWORDS)) {
    const host = extractHost(text);
    if (host) {
      debug("dns", `dns_lookup(${host})`);
      return [{ toolName: "dns_lookup", args: { host }, label: `getent hosts ${host}` }];
    }
  }

  // Edit intent — must run before write so "modifica archivo.css" → edit_file, not write_file.
  const editCall = detectEditIntent(message);
  if (editCall) return [editCall];

  // Write intent — must run before read detection to prevent write → read_file misrouting.
  // Priority: write_file > read_file
  const writeCall = detectWriteIntent(message);
  if (writeCall) return [writeCall];

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

// ── Create + run intent ───────────────────────────────────────────────────────

const CREATE_KEYWORDS: string[] = [
  // Spanish
  "crea", "crear", "escribe", "escribir", "genera", "generar", "haz", "hacer",
  // English
  "create", "write", "generate", "make",
];

const RUN_KEYWORDS: string[] = [
  // Spanish
  "ejecuta", "ejecutar", "ejecútalo", "ejecútala", "corre", "correr", "lanza", "lanzar",
  // English
  "run", "execute", "launch",
];

/** Maps file extension → interpreter command alias. */
const EXT_TO_CMD: Readonly<Record<string, string>> = {
  ".py":  "python3",
  ".js":  "node",
  ".mjs": "node",
  ".c":   "gcc",
  ".cpp": "g++",
  ".cc":  "g++",
};

// ── Multi-file generation intent ─────────────────────────────────────────────

/**
 * Phrases that signal the user wants to create more than one file at once.
 * Combined with CREATE_KEYWORDS to avoid false positives.
 */
const MULTI_FILE_INDICATORS: string[] = [
  // Spanish — language combos
  "html y css", "html y javascript", "html y js",
  "css y js", "css y javascript",
  "html, css", "css, js",
  // Spanish — project/web nouns
  "página web", "sitio web", "web básica", "web completa", "web mínima",
  "app web", "aplicación web",
  "varios archivos", "múltiples archivos", "varios ficheros",
  "proyecto web", "proyecto completo",
  // English — language combos
  "html and css", "html and javascript", "html and js",
  "css and js", "css and javascript",
  "html, css",
  // English — project/web nouns
  "web page", "website", "basic web", "complete web",
  "multiple files", "web project", "complete project",
];

/**
 * Matches an explicit list of 2+ filenames like "index.html, styles.css y script.js".
 * Allows comma or "y"/"and" as separators.
 */
const EXPLICIT_FILE_LIST_RE =
  /\b[a-z0-9_\-.]+\.[a-z]{1,6}\b(?:\s*[,]\s*\b[a-z0-9_\-.]+\.[a-z]{1,6}\b)+/i;

/**
 * Returns true when the message contains create intent AND either:
 * - A multi-file keyword indicator (e.g. "html y css", "sitio web"), OR
 * - An explicit comma-separated list of 2+ filenames (e.g. "index.html, styles.css, script.js")
 */
export function detectMultiFileIntent(message: string): boolean {
  const text = message.toLowerCase();
  if (!hasAny(text, CREATE_KEYWORDS)) return false;
  if (hasAny(text, MULTI_FILE_INDICATORS)) return true;
  if (EXPLICIT_FILE_LIST_RE.test(text)) return true;
  return false;
}

// ── Project scan intent ───────────────────────────────────────────────────────

const PROJECT_SCAN_KEYWORDS: string[] = [
  // Spanish
  "revisa este proyecto", "revisa el proyecto",
  "analiza este proyecto", "analiza el proyecto",
  "cómo está el proyecto", "cómo está organizado",
  "estructura del proyecto",
  "overview del proyecto",
  "qué archivos importantes",
  "qué archivos hay en este",
  "qué hay en este proyecto",
  "escanea el proyecto",
  "explora el proyecto",
  "explica este proyecto",
  "resumen del proyecto",
  // English
  "review this project", "review the project",
  "analyze this project", "analyze the project",
  "project overview",
  "what files are here",
  "scan this project",
  "explore the project",
  "explain this project",
  "summarize this project",
  "what's in this project",
];

/**
 * Returns true when the user wants a high-level overview of the current project
 * (scan structure, detect type, identify key files).
 */
export function detectProjectScanIntent(message: string): boolean {
  const lower = message.toLowerCase();
  return PROJECT_SCAN_KEYWORDS.some((kw) => lower.includes(kw));
}

// ── Multi-file read intent ────────────────────────────────────────────────────

const MULTI_READ_RELATION_KEYWORDS: string[] = [
  // Spanish
  "conectado", "relacionado", "relación", "entre",
  "cómo funciona", "cómo se relaciona", "cómo está",
  "juntos", "depende", "vinculado", "interactúa",
  // English
  "connected", "related", "relationship", "between",
  "how does", "how are", "together", "depends", "linked", "interacts",
];

/**
 * Detects intent to read and compare multiple related files.
 * Returns an ordered list of 2–4 filenames when intent is found, or null otherwise.
 *
 * Triggers when:
 *   - The message contains 2+ filenames with extensions, AND
 *   - A relational keyword is present OR the message is a question.
 */
export function detectMultiReadIntent(message: string): string[] | null {
  const lower = message.toLowerCase();

  const hasRelation = MULTI_READ_RELATION_KEYWORDS.some((kw) => lower.includes(kw));
  const isQuestion  = lower.includes("?") || lower.startsWith("cómo") || lower.startsWith("how");
  if (!hasRelation && !isQuestion) return null;

  const FILE_RE = /\b([a-zA-Z0-9_\-]+\.[a-zA-Z0-9]{1,6})\b/g;
  const seen = new Set<string>();
  const filenames: string[] = [];
  let m: RegExpExecArray | null;

  while ((m = FILE_RE.exec(message)) !== null) {
    const name = m[1]!;
    if (/^\d+\.\d+$/.test(name)) continue;   // skip version strings like "1.0"
    if (!seen.has(name)) {
      seen.add(name);
      filenames.push(name);
    }
  }

  if (filenames.length < 2) return null;
  return filenames.slice(0, 4);
}

export interface CreateAndRunIntent {
  filename: string;
  cmd: string;
}

/**
 * Returns create+run intent when the message contains both a create keyword
 * and a run keyword, plus a filename whose extension maps to an allowed command.
 */
export function detectCreateAndRunIntent(message: string): CreateAndRunIntent | null {
  const text = message.toLowerCase();
  if (!hasAny(text, CREATE_KEYWORDS)) return null;
  if (!hasAny(text, RUN_KEYWORDS)) return null;

  for (const pattern of READ_PATTERNS) {
    const match = message.match(pattern);
    if (match?.[1]) {
      const filename = match[1].replace(/['"]/g, "");
      const ext = filename.slice(filename.lastIndexOf(".")).toLowerCase();
      const cmd = EXT_TO_CMD[ext];
      if (cmd) {
        debug("create+run", `write_file(${filename}) → run_command(${cmd})`);
        return { filename, cmd };
      }
    }
  }

  return null;
}

// ── Run + fix intent ──────────────────────────────────────────────────────────

/**
 * Keywords that signal the user wants errors corrected after running.
 * Combined with RUN_KEYWORDS to identify run+fix intent.
 * Deliberately specific to avoid colliding with pure bugfix detection.
 */
const RUN_FIX_KEYWORDS: string[] = [
  // Spanish
  "y arregla", "y corrige", "si falla", "y soluciona",
  "arregla errores", "corrige errores", "arregla los errores",
  "corrige los errores", "y arréglalo", "corríjelo si",
  // English
  "and fix", "fix if", "and correct", "fix errors", "fix issues",
  "and fix errors", "and fix issues",
];

export interface RunAndFixIntent {
  /** Filename to run, or null if the caller should infer from cwd. */
  filePath: string | null;
  /** Interpreter alias (python3, node, gcc, g++), or null if not yet determined. */
  cmd: string | null;
}

/**
 * Detects run+fix intent: user wants to execute a file and automatically
 * repair any runtime error that results.
 *
 * Requires both a RUN keyword and a FIX keyword.
 * Does NOT require a CREATE keyword — this distinguishes it from create+run.
 * Checked before bugfix so "corre app.py si falla" routes here, not to bugfix.
 */
export function detectRunAndFixIntent(message: string): RunAndFixIntent | null {
  const text = message.toLowerCase();
  if (!hasAny(text, RUN_KEYWORDS)) return null;
  if (!hasAny(text, RUN_FIX_KEYWORDS)) return null;

  for (const pattern of READ_PATTERNS) {
    const match = message.match(pattern);
    if (match?.[1]) {
      const filePath = match[1].replace(/['"]/g, "");
      const ext = filePath.slice(filePath.lastIndexOf(".")).toLowerCase();
      const cmd = EXT_TO_CMD[ext];
      if (cmd) {
        debug("run+fix", `run_command(${cmd} ${filePath}) → auto-fix on error`);
        return { filePath, cmd };
      }
    }
  }

  // No explicit file found — caller will infer from cwd
  debug("run+fix", "no explicit file — caller infers");
  return { filePath: null, cmd: null };
}
