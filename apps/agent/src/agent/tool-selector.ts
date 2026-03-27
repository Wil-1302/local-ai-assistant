/**
 * Auto tool selection — heuristic intent detection for automatic tool invocation.
 *
 * Detects whether a natural-language message implies the need for a system tool
 * before generating a response. Returns a ToolCall descriptor or null if no
 * tool is needed. Intentionally conservative: when intent is ambiguous, returns null.
 *
 * Future: replace or supplement with LLM-driven intent classification.
 */

export interface AutoToolCall {
  toolName: string;
  args: Record<string, string>;
  /** Short label shown to the user: [tool] executing: <label> */
  label: string;
}

// ── Intent keyword tables ────────────────────────────────────────────────────

/** Phrases/words that indicate the user wants process or performance info. */
const PS_KEYWORDS = [
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

/** Phrases that indicate the user wants directory/project structure. */
const LS_KEYWORDS = [
  // Spanish
  "estructura del proyecto",
  "estructura de carpetas",
  "qué carpetas hay",
  "qué hay aquí",
  "qué hay en este proyecto",
  "qué tiene este proyecto",
  "organización del proyecto",
  "layout del proyecto",
  "mostrar carpetas",
  "listar carpetas",
  // English
  "project structure",
  "folder structure",
  "directory structure",
  "what's in this project",
  "what folders",
  "list the folders",
];

/** Patterns that extract a file path from read intent. */
const READ_PATTERNS: RegExp[] = [
  // Spanish: lee / leer / abre / revisa / muestra + optional "el archivo" + filename.ext
  /\b(?:lee|leer|abre|abrir|revisa|revisar|muestra|mostrar|carga|cargar)\s+(?:el\s+)?(?:archivo\s+)?([^\s,;'"]+\.[^\s,;'"]+)/i,
  // English: read / open the file + filename.ext
  /\b(?:read|open|show|load|check)\s+(?:the\s+)?(?:file\s+)?([^\s,;'"]+\.[^\s,;'"]+)/i,
];

// ── Detection ────────────────────────────────────────────────────────────────

/**
 * Detect whether a message implies automatic tool invocation.
 * Returns at most one tool call (first match wins).
 */
export function detectToolCall(message: string): AutoToolCall | null {
  const lower = message.toLowerCase();

  // 1. Process / performance intent
  if (PS_KEYWORDS.some((k) => lower.includes(k))) {
    return { toolName: "list_processes", args: {}, label: "ps" };
  }

  // 2. Directory / project structure intent
  if (LS_KEYWORDS.some((k) => lower.includes(k))) {
    return { toolName: "list_dir", args: { path: "." }, label: "ls ." };
  }

  // 3. File read intent — only when a concrete file path with extension is found
  for (const pattern of READ_PATTERNS) {
    const match = message.match(pattern);
    if (match?.[1]) {
      const filePath = match[1].replace(/['"]/g, "");
      return {
        toolName: "read_file",
        args: { path: filePath },
        label: `read ${filePath}`,
      };
    }
  }

  return null;
}
