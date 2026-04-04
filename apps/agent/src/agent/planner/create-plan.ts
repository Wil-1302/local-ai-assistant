/**
 * createExecutionPlan — deterministic keyword-based project planner.
 *
 * Produces an ExecutionPlan from a natural-language input string.
 * Pure function: no LLM calls, no file I/O, no side effects.
 */

import type { ExecutionPlan, PlanStep, Release, WebDesign } from "./types.ts";

// ---------------------------------------------------------------------------
// Version roadmap parsing — detects multiline prompts with v1/v2/v3 markers
// ---------------------------------------------------------------------------

const VERSION_LINE_RE = /^(v\d+|version\s*\d+|fase\s*\d+)\s*(.*)$/i;

function normalizeVersionTag(raw: string): string {
  return raw
    .toLowerCase()
    .replace(/^version\s*/, "v")
    .replace(/^fase\s*/, "v")
    .replace(/\s+/g, "");
}

/**
 * Parses lines like "v1 funcional", "v2 mejoras UI", "version 1 base".
 * Returns an array of Release entries if at least 2 version markers found,
 * otherwise null (no roadmap detected → backward-compatible path).
 */
function parseVersionRoadmap(input: string): Release[] | null {
  const lines = input.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  const entries: Release[] = [];

  for (const line of lines) {
    const m = line.match(VERSION_LINE_RE);
    if (m) {
      const version = normalizeVersionTag(m[1]!);
      const goal = (m[2] ?? "").trim();
      entries.push({ version, goals: goal ? [goal] : [] });
    }
  }

  return entries.length >= 2 ? entries : null;
}

// ---------------------------------------------------------------------------
// Domain detection — maps input keywords to a project domain
// ---------------------------------------------------------------------------

const SCHOOL_KEYWORDS = ["escolar", "colegio", "alumnos", "alumno", "matrícula", "matricula", "cursos", "curso", "estudiantes", "académico", "academico", "plataforma escolar", "school", "educativa", "educativo"];
const SALES_KEYWORDS  = ["ventas", "clientes", "productos", "ecommerce", "tienda", "carrito", "sales", "shop", "store", "inventario", "factura"];

function detectDomain(lower: string): string | undefined {
  if (SCHOOL_KEYWORDS.some((kw) => lower.includes(kw))) return "school";
  if (SALES_KEYWORDS.some((kw) => lower.includes(kw)))  return "sales";
  return undefined;
}

// ---------------------------------------------------------------------------
// Style hints detection — futuristic / dark / modern
// ---------------------------------------------------------------------------

const STYLE_FUTURISTIC_KEYWORDS = ["futurist", "dark mode", "modo oscuro", "neon", "cyber", "glow", "glassmorphism", "dark", "moderno", "modern", "sci-fi", "animaciones", "animacion"];

function detectStyleHints(lower: string): string[] {
  if (STYLE_FUTURISTIC_KEYWORDS.some((kw) => lower.includes(kw))) return ["futuristic"];
  return [];
}

// ---------------------------------------------------------------------------
// Visual feature detection — for enriching plan context in multiline specs
// ---------------------------------------------------------------------------

const VISUAL_KEYWORDS: Array<[string, string]> = [
  ["sidebar", "sidebar navigation"],
  ["dark mode", "dark mode"],
  ["modo oscuro", "dark mode"],
  ["animation", "animations"],
  ["animaciones", "animations"],
  ["animado", "animations"],
  ["transition", "CSS transitions"],
  ["transiciones", "CSS transitions"],
  ["dashboard", "dashboard layout"],
  ["modern ui", "modern UI"],
  ["glass", "glassmorphism effect"],
  ["cards", "card components"],
  ["login", "login form"],
  ["polish", "UI polish"],
];

function detectVisualFeatures(lower: string): string[] {
  const found: string[] = [];
  for (const [keyword, label] of VISUAL_KEYWORDS) {
    if (lower.includes(keyword) && !found.includes(label)) {
      found.push(label);
    }
  }
  return found;
}

// ---------------------------------------------------------------------------
// Stack detection
// ---------------------------------------------------------------------------

function detectStack(lower: string): string[] {
  if (lower.includes("electron")) {
    return lower.includes("sqlite") ? ["electron", "sqlite"] : ["electron"];
  }
  if (lower.includes("python") || lower.includes("cli")) {
    return ["python"];
  }
  if (
    lower.includes("web") ||
    lower.includes("html") ||
    lower.includes("dashboard") ||
    lower.includes("login") ||
    lower.includes("frontend") ||
    lower.includes("app")
  ) {
    return ["html", "css", "javascript"];
  }
  return ["text"];
}

// ---------------------------------------------------------------------------
// Step builders per stack
// ---------------------------------------------------------------------------

function webSteps(): PlanStep[] {
  return [
    {
      id: 1,
      title: "Create HTML structure",
      type: "create",
      targetFiles: ["index.html"],
      prompt: "Generate a semantic HTML page with login form and dashboard section.",
    },
    {
      id: 2,
      title: "Create stylesheet",
      type: "create",
      targetFiles: ["styles.css"],
      prompt: "Generate CSS for the login form and dashboard layout.",
      dependencies: [1],
    },
    {
      id: 3,
      title: "Create JavaScript logic",
      type: "create",
      targetFiles: ["script.js"],
      prompt: "Generate client-side JS for login validation and dashboard rendering.",
      dependencies: [1],
    },
    {
      id: 4,
      title: "Link assets in HTML",
      type: "edit",
      targetFiles: ["index.html"],
      prompt: "Add <link> and <script> tags for styles.css and script.js.",
      dependencies: [1, 2, 3],
    },
    {
      id: 5,
      title: "Smoke test in browser",
      type: "run",
      targetFiles: [],
      prompt: "Serve the project and verify login + dashboard load correctly.",
      dependencies: [4],
    },
  ];
}

function pythonCliSteps(): PlanStep[] {
  return [
    {
      id: 1,
      title: "Create logger module",
      type: "create",
      targetFiles: ["logger.py"],
      prompt: "Generate a Python logging module with file and console handlers.",
    },
    {
      id: 2,
      title: "Create main CLI entry point",
      type: "create",
      targetFiles: ["main.py"],
      prompt: "Generate a Python CLI using argparse, importing the logger module.",
      dependencies: [1],
    },
    {
      id: 3,
      title: "Create requirements file",
      type: "create",
      targetFiles: ["requirements.txt"],
      prompt: "List Python dependencies needed by the CLI.",
      dependencies: [2],
    },
    {
      id: 4,
      title: "Smoke test CLI",
      type: "run",
      targetFiles: [],
      prompt: "Run main.py --help and verify logging output.",
      dependencies: [2],
    },
  ];
}

function electronSteps(withSqlite: boolean): PlanStep[] {
  const dbFiles = withSqlite ? ["db.js"] : [];
  const steps: PlanStep[] = [
    {
      id: 1,
      title: "Create main process",
      type: "create",
      targetFiles: ["main.js"],
      prompt: "Generate Electron main process with BrowserWindow setup.",
    },
    {
      id: 2,
      title: "Create preload script",
      type: "create",
      targetFiles: ["preload.js"],
      prompt: "Generate Electron preload with contextBridge API exposure.",
      dependencies: [1],
    },
    {
      id: 3,
      title: "Create renderer UI",
      type: "create",
      targetFiles: ["index.html", "renderer.js"],
      prompt: "Generate HTML/JS renderer for the Electron window.",
      dependencies: [2],
    },
  ];

  if (withSqlite) {
    steps.push({
      id: 4,
      title: "Create SQLite database module",
      type: "create",
      targetFiles: dbFiles,
      prompt: "Generate a SQLite helper using better-sqlite3 for CRUD operations.",
      dependencies: [1],
    });
    steps.push({
      id: 5,
      title: "Integrate DB into main process",
      type: "edit",
      targetFiles: ["main.js"],
      prompt: "Import and initialize db.js in the main process.",
      dependencies: [1, 4],
    });
    steps.push({
      id: 6,
      title: "Smoke test app launch",
      type: "run",
      targetFiles: [],
      prompt: "Run `npm start` and verify the window opens without errors.",
      dependencies: [3, 5],
    });
  } else {
    steps.push({
      id: 4,
      title: "Smoke test app launch",
      type: "run",
      targetFiles: [],
      prompt: "Run `npm start` and verify the window opens.",
      dependencies: [3],
    });
  }

  return steps;
}

function fallbackSteps(): PlanStep[] {
  return [
    {
      id: 1,
      title: "Create project entry point",
      type: "create",
      targetFiles: ["main.txt"],
      prompt: "Generate a basic project scaffold.",
    },
    {
      id: 2,
      title: "Add project description",
      type: "create",
      targetFiles: ["README.md"],
      prompt: "Generate a short README describing the project purpose.",
      dependencies: [1],
    },
    {
      id: 3,
      title: "Review and validate structure",
      type: "analyze",
      targetFiles: [],
      prompt: "Verify the project structure is consistent and complete.",
      dependencies: [1, 2],
    },
  ];
}

// ---------------------------------------------------------------------------
// Objective extraction
// ---------------------------------------------------------------------------

function buildObjective(input: string, stack: string[]): string {
  if (stack.includes("text")) return "Generic project scaffold";
  // For multiline input, use the first non-empty line as the objective
  const firstLine = input.split(/\r?\n/).map((l) => l.trim()).find(Boolean) ?? input.trim();
  return firstLine.charAt(0).toUpperCase() + firstLine.slice(1);
}

// ---------------------------------------------------------------------------
// Test strategy hints
// ---------------------------------------------------------------------------

function buildTestStrategy(stack: string[]): string[] {
  if (stack.includes("html")) {
    return [
      "Open index.html in browser",
      "Test login form validation",
      "Verify dashboard section renders",
    ];
  }
  if (stack.includes("python")) {
    return ["Run: python main.py --help", "Check log file is created"];
  }
  if (stack.includes("electron")) {
    return ["Run: npm start", "Verify BrowserWindow opens", "Check DevTools console for errors"];
  }
  return ["Manually inspect generated files"];
}

// ---------------------------------------------------------------------------
// Deep design planning — Phase 29
// Runs only for web stacks; enriches the plan with structured design info.
// ---------------------------------------------------------------------------

const TASK_KEYWORDS  = ["tareas", "task", "todo", "kanban", "pendientes", "gestión de tareas", "task manager", "to-do", "tickets", "issues"];
const CRM_KEYWORDS   = ["clientes", "crm", "leads", "contactos", "pipeline", "prospects", "customers"];
const ANALYTICS_KEYWORDS = ["analytics", "métricas", "reportes", "kpis", "estadísticas", "charts", "gráficas", "graphs"];
const PM_KEYWORDS    = ["proyectos", "project management", "hitos", "milestones", "sprint", "roadmap"];
const FINANCE_KEYWORDS = ["finanzas", "contabilidad", "gastos", "presupuesto", "ingresos", "facturas", "pagos", "billing"];
const SAAS_KEYWORDS  = ["saas", "plataforma", "platform", "suite", "system", "sistema"];

function detectWebProductShape(lower: string): { appType: string; productName: string } {
  if (TASK_KEYWORDS.some((k) => lower.includes(k)))     return { appType: "tasks",     productName: "TaskFlow" };
  if (CRM_KEYWORDS.some((k) => lower.includes(k)))      return { appType: "crm",       productName: "CRM Pro" };
  if (ANALYTICS_KEYWORDS.some((k) => lower.includes(k))) return { appType: "analytics", productName: "Analytics Hub" };
  if (PM_KEYWORDS.some((k) => lower.includes(k)))       return { appType: "pm",        productName: "ProjectBase" };
  if (FINANCE_KEYWORDS.some((k) => lower.includes(k)))  return { appType: "finance",   productName: "FinanceOS" };
  if (SAAS_KEYWORDS.some((k) => lower.includes(k)))     return { appType: "saas",      productName: "Axis App" };
  return { appType: "generic", productName: "Dashboard App" };
}

function detectUIComponents(lower: string): string[] {
  const found: string[] = [];
  const checks: Array<[string[], string]> = [
    [["sidebar", "lateral", "panel lateral"],                    "sidebar"],
    [["topbar", "navbar", "header", "barra superior"],           "topbar"],
    [["search", "búsqueda", "buscar", "filtro", "filter"],       "search"],
    [["tabla", "table", "lista", "list"],                        "table"],
    [["métrica", "metric", "kpi", "stat", "estadística"],        "metrics"],
    [["card", "cards", "kanban"],                                "cards"],
    [["glassmorphism", "glass", "blur", "frosted"],              "glassmorphism"],
    [["glow", "neon", "cyan", "brillante", "luminoso"],          "glow"],
    [["animaci", "transition", "transici", "suave", "smooth"],   "animations"],
    [["modal", "popup", "overlay"],                              "modal"],
    [["chart", "gráfico", "graph", "pie", "bar chart"],          "chart"],
    [["avatar", "profile", "perfil"],                            "avatar"],
    [["badge", "tag", "etiqueta", "label"],                      "badges"],
    [["progress", "progreso"],                                   "progress"],
    [["notification", "notificaci", "alert"],                    "notifications"],
  ];
  for (const [keywords, component] of checks) {
    if (keywords.some((k) => lower.includes(k))) found.push(component);
  }
  return found;
}

function detectFeatureModules(lower: string, appType: string): string[] {
  const base: Record<string, string[]> = {
    tasks:     ["overview", "my-tasks", "projects", "priorities", "filters"],
    crm:       ["overview", "contacts", "pipeline", "deals", "activities"],
    analytics: ["overview", "metrics", "reports", "trends", "export"],
    pm:        ["overview", "projects", "sprints", "milestones", "team"],
    finance:   ["overview", "income", "expenses", "invoices", "reports"],
    saas:      ["overview", "users", "settings", "billing", "reports"],
    generic:   ["overview", "data", "settings"],
  };
  const modules = base[appType] ?? base["generic"]!;
  // Add extra modules detected from prompt
  if (lower.includes("user") || lower.includes("usuario") || lower.includes("equipo") || lower.includes("team")) {
    if (!modules.includes("users") && !modules.includes("team")) modules.push("team");
  }
  if (lower.includes("notificaci") || lower.includes("notification")) modules.push("notifications");
  return modules;
}

function inferInitialLayout(components: string[]): string {
  if (components.includes("sidebar")) return "sidebar-main";
  if (components.includes("topbar"))  return "topbar-main";
  return "centered";
}

/**
 * Builds a WebDesign plan from raw input text (web stack only).
 * Returns undefined for non-complex prompts (few components detected).
 */
export function buildWebDesign(input: string): WebDesign | undefined {
  const lower = input.toLowerCase();
  const components = detectUIComponents(lower);
  // Only produce a rich design plan when prompt signals a real product (>= 2 UI components)
  if (components.length < 2) return undefined;

  const { appType, productName } = detectWebProductShape(lower);
  const modules  = detectFeatureModules(lower, appType);
  const layout   = inferInitialLayout(components);
  const views    = modules.slice(0, 5); // first 5 modules become navigable views

  return { appType, productName, layout, components, modules, views };
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export function createExecutionPlan(input: string, stackOverride?: string[]): ExecutionPlan {
  const lower = input.toLowerCase();
  const stack = stackOverride ?? detectStack(lower);

  // Detect optional version roadmap from multiline spec
  const roadmap = parseVersionRoadmap(input);

  let steps: PlanStep[];
  if (stack.includes("html")) {
    const base = webSteps();
    // Tag all base steps as v1 when a roadmap is present
    steps = roadmap
      ? base.map((s) => ({ ...s, version: roadmap[0]!.version }))
      : base;
  } else if (stack.includes("python")) {
    steps = pythonCliSteps();
  } else if (stack.includes("electron")) {
    steps = electronSteps(stack.includes("sqlite"));
  } else {
    steps = fallbackSteps();
  }

  // Enrich roadmap goals with detected visual features (first release)
  if (roadmap && stack.includes("html")) {
    const features = detectVisualFeatures(lower);
    if (features.length > 0 && roadmap[0]) {
      roadmap[0].goals = [...new Set([...roadmap[0].goals, ...features])];
    }
  }

  const domain = detectDomain(lower);
  const style  = detectStyleHints(lower);

  const plan: ExecutionPlan = {
    objective: buildObjective(input, stack),
    stack,
    steps,
    testStrategy: buildTestStrategy(stack),
  };

  if (roadmap) plan.releases = roadmap;
  if (domain)  plan.domain   = domain;
  if (style.length > 0) plan.style = style;

  // Phase 29: deep design planning for web stacks (skip if domain already provides a rich template)
  if (stack.includes("html") && !domain) {
    const design = buildWebDesign(input);
    if (design) plan.design = design;
  }

  return plan;
}
