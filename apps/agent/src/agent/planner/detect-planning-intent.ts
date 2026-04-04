/**
 * Planning intent detection — deterministic keyword scoring.
 *
 * Returns true only when the input signals a large multi-file project:
 *   - at least one creation verb
 *   - at least 2 project-scope signals
 *
 * Conservative by design: small tasks (edit a button, fix a script) → false.
 */

const CREATION_VERBS = [
  "create", "build", "make", "generate", "scaffold",
  "construct", "setup", "crea", "haz", "construye",
  "mejora", "reutiliza", "improve", "enhance", "update", "actualiza",
];

const PROJECT_SIGNALS = [
  "app", "crud", "dashboard", "backend", "frontend", "api",
  "sqlite", "electron", "login", "auth", "fullstack", "project", "cli",
  "proyecto", "python", "plataforma", "escolar", "school",
];

export const PLANNING_KEYWORDS = [...CREATION_VERBS, ...PROJECT_SIGNALS];

export function detectPlanningIntent(input: string): boolean {
  const lower = input.toLowerCase();
  const words = lower.split(/\W+/);

  const hasVerb = CREATION_VERBS.some((v) => words.includes(v));
  if (!hasVerb) return false;

  const signalCount = PROJECT_SIGNALS.filter((s) => lower.includes(s)).length;
  return signalCount >= 2;
}

// ---------------------------------------------------------------------------
// Tactical improvement intent — Phase 27
// ---------------------------------------------------------------------------

export interface TacticalImprovementIntent {
  /** The full instruction as typed by the user. */
  instruction: string;
  /** Project name hint extracted from input (may be empty). */
  projectHint: string;
  /** Phase 29.1: canonical feature tags detected from the prompt. */
  features: string[];
}

const TACTICAL_VERBS = [
  "mejora", "agrega", "añade", "cambia", "optimiza", "pule",
  "actualiza", "upgrade", "improve", "polish", "enhance", "refactoriza",
  // Phase 29.1: product evolution verbs
  "convierte", "rediseña", "transforma", "vuelve", "integra", "haz que",
];

// Strong UI/style-specific signals — two separate sets so we can require
// ≥1 strong signal OR ≥2 general UI signals.
const STRONG_UI_SIGNALS = [
  "glassmorphism", "topbar", "navbar", "animaciones", "transiciones",
  "hover", "blur", "glow", "premium", "búsqueda", "search",
  "tabla", "table", "módulo", "sidebar",
  // Phase 29.1: product evolution signals
  "kanban", "chart", "charts", "analytics", "equipo", "team",
  "colaborativo", "notificaciones", "notification", "actividad", "activity",
  "skeleton", "linear", "vercel", "notion", "miembros", "members",
  "comentarios", "comments", "productividad", "microanimaciones",
  "spacing", "tipografía",
];

const GENERAL_UI_SIGNALS = [
  ...STRONG_UI_SIGNALS,
  "cards", "card", "spacing", "elegante", "elegant", "modal", "badge",
  "botón", "button", "grid", "layout", "sombra", "shadow", "scroll",
  "animación", "animation", "dashboard", "dark", "futurista",
];

/**
 * Phase 29.1: maps keywords in the lowercased prompt to canonical feature tags
 * that tactical-builders.ts knows how to implement as real HTML/CSS/JS changes.
 */
export function detectEvolutionFeatures(lower: string): string[] {
  const features: string[] = [];
  if (/kanban/.test(lower))                                              features.push("kanban");
  if (/chart|charts|gráfica|grafica|mini.chart/.test(lower))            features.push("mini-charts");
  if (/filtro|filtrar|filter|tabla con filtros|filtros por/.test(lower)) features.push("table-filters");
  if (/team|equipo|miembros|members|colaborativo/.test(lower))           features.push("team");
  if (/actividad|activity|feed/.test(lower))                             features.push("activity");
  if (/notificaci|notification|toast/.test(lower))                       features.push("notifications");
  if (/analytics|estadísticas|estadisticas|productividad|progreso semanal/.test(lower)) features.push("analytics");
  if (/skeleton|cargando/.test(lower))                                   features.push("skeleton");
  if (/empty.state|vacío|vacio|sin datos/.test(lower))                   features.push("empty-states");
  if (/premium|tipografía|tipografia|spacing|linear|vercel|notion/.test(lower)) features.push("premium-style");
  if (/transici|smooth|suave|microanim|animaciones más fluidas|fluidas/.test(lower)) features.push("smooth-transitions");
  if (/comentarios|comments/.test(lower))                                features.push("comments");
  // Phase 29.1 additions
  if (/glassmorphism|glass.morphism|blur.m[aá]s|topbar.sticky|glow|backdrop/.test(lower)) features.push("glassmorphism");
  if (/sidebar.*minimal|minimal.*sidebar|sidebar.*limpi|sidebar.*clean/.test(lower))       features.push("sidebar-minimal");
  return features;
}

/**
 * Detects tactical improvement intent: user wants to polish or extend an
 * EXISTING project with UI/style/module changes — without creating a new one.
 *
 * Returns null when:
 *   - no tactical verb is present
 *   - fewer than 1 strong OR 2 general UI signals are present
 *   - input contains an explicit file path (routes to semantic-edit instead)
 */
export function detectTacticalImprovementIntent(input: string): TacticalImprovementIntent | null {
  const lower = input.toLowerCase();

  // Skip if user explicitly references a specific file (let semantic-edit handle it)
  if (/\b\w+\.(html|css|js|ts|py|json)\b/.test(lower)) return null;

  const hasVerb = TACTICAL_VERBS.some((v) => lower.includes(v));
  if (!hasVerb) return null;

  const strongCount = STRONG_UI_SIGNALS.filter((s) => lower.includes(s)).length;
  const generalCount = GENERAL_UI_SIGNALS.filter((s) => lower.includes(s)).length;
  if (strongCount < 1 && generalCount < 2) return null;

  // Extract project hint: first 5 words after a project keyword
  const projectKws = ["plataforma", "escolar", "school", "proyecto", "platform", "aplicación", "app", "web", "sitio"];
  let projectHint = "";
  for (const kw of projectKws) {
    const idx = lower.indexOf(kw);
    if (idx !== -1) {
      projectHint = input.slice(Math.max(0, idx - 15), idx + 30).trim();
      break;
    }
  }

  const features = detectEvolutionFeatures(lower);
  return { instruction: input, projectHint, features };
}

// ---------------------------------------------------------------------------
// View completion intent — Phase 29.2
// ---------------------------------------------------------------------------

/** Views that can be completed by name. */
export type ViewKey =
  | "overview" | "my-tasks" | "projects" | "priorities"
  | "filters" | "team" | "analytics" | "activity" | "cohesion";

export interface ViewCompletionIntent {
  /** Full original instruction. */
  instruction: string;
  /** Resolved view key(s) requested. Empty = cohesion-only pass. */
  views: ViewKey[];
  /** True when user asks for a global cohesion / consistency pass. */
  cohesion: boolean;
  /** Phase 29.3: True when user explicitly asks to re-apply/upgrade existing views. */
  forceReapply: boolean;
}

// Natural-language aliases → canonical ViewKey
const VIEW_ALIASES: [RegExp, ViewKey][] = [
  [/\bover\s?view\b|resumen\s*general|vista\s*principal/i,  "overview"],
  [/\bmy.tasks?\b|mis\s*tarea|vista\s*tarea/i,              "my-tasks"],
  [/\bproject(s)?\b|proyectos?\b/i,                         "projects"],
  [/\bpriorities\b|prioridades?\b/i,                        "priorities"],
  [/\bfilters?\b|filtros?\b/i,                              "filters"],
  [/\bteam\b|equipo\b/i,                                    "team"],
  [/\banalytics?\b|estadísticas?\b/i,                       "analytics"],
  [/\bactivity\b|actividad\b/i,                             "activity"],
];

const VIEW_COMPLETION_VERBS = [
  "completa", "complete", "termina", "finish", "haz funcional",
  "make functional", "implementa", "implement",
  "mejora la sección", "mejora la vista", "improve the view",
  "rellena", "desarrolla", "develop",
];

/** Signals that the user wants a force re-apply / upgrade pass (Phase 29.3). */
const FORCE_REAPPLY_SIGNALS = [
  "arregla la integración", "arregla la vista", "arregla el flujo",
  "repara", "repair", "fix integration", "fix the view",
  "re-aplica", "re-apply", "re aplica", "re apply",
  "integra las vistas", "integra la vista", "integra los módulos",
  "vuelve a aplicar", "rebuild the shell", "corrige la navegación",
  "fix navigation", "unifica el contrato", "unify views",
  "conecta la navegación", "connect navigation",
];

const COHESION_SIGNALS = [
  "cohesión", "cohesion", "consistencia", "consistency",
  "pasada general", "general pass", "toda la plataforma",
  "todas las vistas", "all views", "nivel de calidad",
  "inconsistencias", "inconsistencies", "alinea",
];

/**
 * Phase 29.2: detect "complete view X" or "cohesion pass" intent.
 * Takes priority over tactical improvement for view-named prompts.
 */
export function detectViewCompletionIntent(input: string): ViewCompletionIntent | null {
  const lower = input.toLowerCase();

  // Skip if user explicitly references a specific file path
  if (/\b\w+\.(html|css|js|ts|py|json)\b/.test(lower)) return null;

  const hasVerb = VIEW_COMPLETION_VERBS.some((v) => lower.includes(v));
  const hasCohesion = COHESION_SIGNALS.some((s) => lower.includes(s));

  if (!hasVerb && !hasCohesion) return null;

  // Resolve view names
  const views: ViewKey[] = [];
  for (const [pattern, key] of VIEW_ALIASES) {
    if (pattern.test(input) && !views.includes(key)) views.push(key);
  }

  // Require at least one view OR cohesion signal
  if (views.length === 0 && !hasCohesion) return null;

  const forceReapply = FORCE_REAPPLY_SIGNALS.some((s) => lower.includes(s));

  return { instruction: input, views, cohesion: hasCohesion, forceReapply };
}

// ---------------------------------------------------------------------------
// Analysis intent — Phase 27
// ---------------------------------------------------------------------------

const ANALYSIS_PATTERNS = [
  "analiza esta carpeta",
  "analiza este proyecto",
  "analyze this folder",
  "analyze this project",
  "resume este proyecto",
  "summarize this project",
  "qué mejorarías",
  "que mejorarias",
  "analiza el workspace",
  "inspect this project",
  "analiza esta app",
  "resumen del proyecto",
  "describe este proyecto",
];

/**
 * Detects intent to deeply analyze an existing project workspace and produce
 * a structured report with architecture summary and improvement recommendations.
 */
export function detectAnalysisIntent(input: string): boolean {
  const lower = input.toLowerCase();
  return ANALYSIS_PATTERNS.some((p) => lower.includes(p));
}

// ---------------------------------------------------------------------------
// Release continuation intent — Phase 26
// ---------------------------------------------------------------------------

export interface ContinueReleaseIntent {
  /** Target version, e.g. "v2". Null when user said "siguiente release" (auto-detect). */
  targetVersion: string | null;
  /** Project description extracted from the input, e.g. "plataforma escolar futurista". */
  projectHint: string;
}

/**
 * Detects intent to continue a specific release of an existing project.
 *
 * Handles:
 *   "continúa con v2 de la plataforma escolar futurista"
 *   "sigue con v3 del proyecto escolar"
 *   "implementa v2"
 *   "avanza con v2 de la plataforma escolar"
 *   "haz la siguiente release de plataforma escolar"
 */
export function detectContinueReleaseIntent(input: string): ContinueReleaseIntent | null {
  // Pattern A: explicit version number — continúa/sigue/implementa/avanza + v<N>
  const explicitRe =
    /(?:contin[uú]a(?:r)?|sigue|implementa|avanza|ejecuta)\s+(?:con\s+)?(v\d+)(?:\s+(?:de\s+(?:la\s+|el\s+|un\s+|una\s+|los\s+|las\s+)?|del\s+)(.+))?/i;
  const explicitM = explicitRe.exec(input);
  if (explicitM) {
    const targetVersion = explicitM[1]!.toLowerCase();
    const captured     = (explicitM[2] ?? "").trim();
    // Fallback: strip the matched prefix from the full input to get the project hint
    const fullHint = captured || input.replace(explicitRe, "").trim();
    return { targetVersion, projectHint: fullHint };
  }

  // Pattern B: "siguiente release" / "next release" — auto-detect version from README
  const nextRe =
    /(?:(?:haz\s+)?(?:la\s+)?siguiente\s+release|next\s+release|pr[oó]xima\s+release)(?:\s+(?:de\s+(?:la\s+|el\s+|un\s+|una\s+)?|del\s+)(.+))?/i;
  const nextM = nextRe.exec(input);
  if (nextM) {
    const projectHint = (nextM[1] ?? "").trim();
    return { targetVersion: null, projectHint };
  }

  return null;
}
