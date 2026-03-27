/**
 * Auto tool selection — priority-based intent routing for automatic tool invocation.
 *
 * Priority order (highest wins):
 *   L0 LOG   — log file path detected, or log-analysis intent + path
 *   L1 READ  — concrete file path with extension detected
 *   L2 LS    — directory / project structure intent
 *   L3 PS    — process / performance intent
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
  "qué está corriendo",
  "qué corre",
  "corriendo",
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

/**
 * Detect whether a message implies automatic tool invocation.
 * Returns at most one tool call; priority: READ > LS > PS.
 * Returns null when intent is absent or ambiguous.
 */
export function detectToolCall(message: string): AutoToolCall | null {
  const text = message.toLowerCase().trim();

  // ── L0: LOG — highest priority ────────────────────────────────────────────
  // Fire when a log-looking path is found, or log-intent keywords + any path.
  const hasLogIntent = hasAny(text, LOG_INTENT_KEYWORDS);
  for (const pattern of READ_PATTERNS) {
    const match = message.match(pattern);
    if (match?.[1]) {
      const filePath = match[1].replace(/['"]/g, "");
      if (isLogPath(filePath) || hasLogIntent) {
        debug("log", `read_log(${filePath})`);
        return {
          toolName: "read_log",
          args: { path: filePath },
          label: `log ${filePath}`,
        };
      }
    }
  }

  // ── L1: READ — concrete file path with extension ──────────────────────────
  for (const pattern of READ_PATTERNS) {
    const match = message.match(pattern);
    if (match?.[1]) {
      const filePath = match[1].replace(/['"]/g, "");
      debug("read", `read_file(${filePath})`);
      return {
        toolName: "read_file",
        args: { path: filePath },
        label: `read ${filePath}`,
      };
    }
  }

  // ── L2: LS — directory / structure intent ─────────────────────────────────
  if (hasAny(text, LS_KEYWORDS)) {
    debug("ls", "list_dir");
    return { toolName: "list_dir", args: { path: "." }, label: "ls ." };
  }

  // ── L3: PS — process / performance intent ─────────────────────────────────
  // Blocked when structural keywords are present to avoid misclassification.
  if (hasAny(text, PS_KEYWORDS) && !hasAny(text, PS_EXCLUSION_KEYWORDS)) {
    debug("ps", "list_processes");
    return { toolName: "list_processes", args: {}, label: "ps" };
  }

  debug("none", null);
  return null;
}
