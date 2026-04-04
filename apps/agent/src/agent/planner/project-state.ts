import fs from "fs";
import path from "path";
import type {
  ExecutionPlan,
  ProjectEvolutionState,
  ProjectPreviewState,
  ProjectReleasesState,
  ProjectState,
  ProjectWorkspaceState,
  Release,
  WorkspaceMode,
} from "./types.js";
import { AXIS_STATE_DIRNAME, getWorkspaceStatePaths } from "./workspace.js";

export const PROJECT_STATE_SCHEMA_VERSION = 1;
export const PROJECT_STATE_AXIS_VERSION = "release-30";

const SHELL_MARKER = "Phase 29.3: SaaS shell";
const FEATURE_MARKER_RE = /Phase 29\.1:\s*([a-z0-9-]+)/gi;
const PHASE_29_2_RE = /Phase 29\.2/;
const PHASE_29_3_RE = /Phase 29\.3/;
const VIEW_ID_RE = /id="view-([a-z0-9-]+)"/gi;

interface ReadmeMetadata {
  title: string;
  domain?: string;
  style: string[];
  stack: string[];
  updatedAt: string;
  releases: Release[];
  currentRelease: string;
  previewCommand: string;
  previewUrl: string;
  completedPhases: string[];
  installedViews: string[];
  shellInstalled: boolean;
  cohesionApplied: boolean;
}

export interface EnsureProjectStateOptions {
  workspace: ProjectWorkspaceState;
  axisVersion?: string;
  now?: string;
}

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

function unique(values: string[]): string[] {
  return [...new Set(values.filter(Boolean))];
}

function fileIfExists(filePath: string): string {
  try {
    return fs.existsSync(filePath) ? fs.readFileSync(filePath, "utf-8") : "";
  } catch {
    return "";
  }
}

function inferStackFromFiles(projectPath: string): string[] {
  let files: string[];
  try {
    files = fs.readdirSync(projectPath);
  } catch {
    return ["text"];
  }

  if (files.includes("index.html") && files.includes("styles.css") && files.includes("script.js")) {
    return ["html", "css", "javascript"];
  }
  if (files.includes("main.py") || files.includes("requirements.txt")) {
    return ["python"];
  }
  if (files.includes("main.js") && files.includes("preload.js")) {
    return ["electron"];
  }
  return ["text"];
}

function buildPreviewCommand(projectPath: string, stack: string[]): string {
  if (stack.includes("html")) return `cd ${projectPath} && python3 -m http.server 8000`;
  if (stack.includes("python")) return `cd ${projectPath} && python3 main.py`;
  return `cd ${projectPath}`;
}

function parseReleaseLine(line: string): Release | null {
  const match = line.match(/^- \[[x ]\]\s+(?:\*\*)?(v\d+)(?:\*\*)?\s+—\s+(.+)$/i);
  if (!match?.[1]) return null;
  const version = match[1].toLowerCase();
  const goalText = (match[2] ?? "").trim();
  const goals = goalText && goalText !== "(base)" ? [goalText] : [];
  return { version, goals };
}

function parseMarkdownTableViews(readme: string): string[] {
  const sectionMatch = readme.match(/## Vistas disponibles\s*\n([\s\S]*?)(?:\n##|$)/);
  if (!sectionMatch?.[1]) return [];
  const views: string[] = [];
  const rowRe = /^\|\s*([^|]+?)\s*\|/gm;
  let match: RegExpExecArray | null;
  while ((match = rowRe.exec(sectionMatch[1])) !== null) {
    const label = (match[1] ?? "").trim().toLowerCase();
    if (!label || label === "vista" || label.startsWith("---")) continue;
    views.push(label.replace(/\s+/g, "-"));
  }
  return unique(views);
}

function parseReadmeMetadata(projectPath: string): ReadmeMetadata {
  const readme = fileIfExists(path.join(projectPath, "README.md"));
  if (!readme) {
    return {
      title: path.basename(projectPath),
      style: [],
      stack: [],
      updatedAt: "",
      releases: [],
      currentRelease: "v1",
      previewCommand: "",
      previewUrl: "http://localhost:8000",
      completedPhases: [],
      installedViews: [],
      shellInstalled: false,
      cohesionApplied: false,
    };
  }

  const title = (readme.match(/^#\s+(.+)$/m)?.[1] ?? path.basename(projectPath)).trim();
  const domain = readme.match(/\*\*Dominio:\*\*\s*(.+)$/m)?.[1]?.trim();
  const style = (readme.match(/\*\*Estilo:\*\*\s*(.+)$/m)?.[1] ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  const stack = (readme.match(/\*\*Stack:\*\*\s*(.+)$/m)?.[1] ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  const updatedAt = (readme.match(/\*\*Última actualización:\*\*\s*(.+)$/m)?.[1] ?? "").trim();
  const currentRelease = (readme.match(/## Última release ejecutada\s*\n(.+)$/m)?.[1] ?? "v1").trim().toLowerCase();
  const previewCommand = (readme.match(/## Cómo previsualizar\s*\n```bash\n([\s\S]*?)```/m)?.[1] ?? "").trim();
  const previewUrl = (readme.match(/## URL local\s*\n(.+)$/m)?.[1] ?? "http://localhost:8000").trim();

  const releasesSection = readme.match(/## Releases\s*\n([\s\S]*?)(?:\n##|$)/)?.[1] ?? "";
  const releases = releasesSection
    .split(/\r?\n/)
    .map((line) => parseReleaseLine(line.trim()))
    .filter((r): r is Release => !!r);

  const completedPhases = unique(
    [...readme.matchAll(/Phase\s+(\d+\.\d+)/g)].map((m) => m[1] ?? "")
  );
  const installedViews = parseMarkdownTableViews(readme);
  const shellInstalled = readme.includes("navigateTo(") || completedPhases.includes("29.3");
  const cohesionApplied = /cohesion pass/i.test(readme) || /cohesi[oó]n/i.test(readme);

  return {
    title,
    style,
    stack,
    updatedAt,
    releases,
    currentRelease,
    previewCommand,
    previewUrl,
    completedPhases,
    installedViews,
    shellInstalled,
    cohesionApplied,
    ...(domain ? { domain } : {}),
  };
}

function detectExistingEvolution(projectPath: string): ProjectEvolutionState {
  const html = fileIfExists(path.join(projectPath, "index.html"));
  const css = fileIfExists(path.join(projectPath, "styles.css"));
  const js = fileIfExists(path.join(projectPath, "script.js"));
  const combined = `${html}\n${css}\n${js}`;

  const features: string[] = [];
  let match: RegExpExecArray | null;
  FEATURE_MARKER_RE.lastIndex = 0;
  while ((match = FEATURE_MARKER_RE.exec(combined)) !== null) {
    if (match[1]) features.push(match[1]);
  }

  const installedViews: string[] = [];
  VIEW_ID_RE.lastIndex = 0;
  while ((match = VIEW_ID_RE.exec(html)) !== null) {
    if (match[1]) installedViews.push(match[1]);
  }

  const shellInstalled = combined.includes(SHELL_MARKER) || combined.includes("window.navigateTo = function");
  const cohesionApplied =
    /Cohesion pass/i.test(combined) ||
    combined.includes("btn-primary") ||
    combined.includes("empty-state");

  return {
    appliedFeatures: unique(features),
    installedViews: unique(installedViews),
    cohesionApplied,
    shellInstalled,
  };
}

function normalizeWorkspaceMode(mode: WorkspaceMode): WorkspaceMode {
  return mode === "direct" ? "direct" : "managed";
}

export function isProjectState(value: unknown): value is ProjectState {
  if (!value || typeof value !== "object") return false;
  const state = value as Partial<ProjectState>;
  return (
    state.schemaVersion === PROJECT_STATE_SCHEMA_VERSION &&
    !!state.workspace &&
    !!state.project &&
    !!state.releases &&
    !!state.productEvolution &&
    !!state.preview &&
    !!state.timestamps
  );
}

export function buildProjectStateFromPlan(
  workspace: ProjectWorkspaceState,
  plan: ExecutionPlan,
  options: { axisVersion?: string; now?: string } = {},
): ProjectState {
  const now = options.now ?? todayIso();
  const stack = plan.stack.length > 0 ? [...plan.stack] : ["text"];
  const releasesState: ProjectReleasesState = {
    current: plan.releases?.[0]?.version ?? "v1",
    planned: plan.releases ? [...plan.releases] : [{ version: "v1", goals: ["base"] }],
    completedPhases: [],
  };
  const preview: ProjectPreviewState = {
    command: buildPreviewCommand(workspace.projectPath, stack),
    url: "http://localhost:8000",
  };

  const project = {
    title: plan.objective,
    objective: plan.objective,
    stack,
    style: plan.style ? [...plan.style] : [],
    ...(plan.domain ? { domain: plan.domain } : {}),
  };

  return {
    schemaVersion: PROJECT_STATE_SCHEMA_VERSION,
    axisVersion: options.axisVersion ?? PROJECT_STATE_AXIS_VERSION,
    workspace: {
      mode: normalizeWorkspaceMode(workspace.mode),
      root: workspace.root,
      projectPath: workspace.projectPath,
      slug: workspace.slug,
    },
    project,
    releases: releasesState,
    productEvolution: {
      appliedFeatures: [],
      installedViews: plan.design?.views ? [...plan.design.views] : [],
      cohesionApplied: false,
      shellInstalled: false,
    },
    preview,
    timestamps: {
      createdAt: now,
      updatedAt: now,
    },
    ...(plan.design ? { design: { ...plan.design } } : {}),
  };
}

export function refreshProjectStateFromPlan(
  current: ProjectState,
  plan: ExecutionPlan,
  options: { axisVersion?: string; now?: string } = {},
): ProjectState {
  const now = options.now ?? todayIso();
  const stack = plan.stack.length > 0 ? [...plan.stack] : current.project.stack;
  const plannedReleases = plan.releases && plan.releases.length > 0
    ? [...plan.releases]
    : current.releases.planned;
  const currentRelease = plan.releases?.[0]?.version
    ?? current.releases.current
    ?? "v1";

  return {
    ...current,
    schemaVersion: PROJECT_STATE_SCHEMA_VERSION,
    axisVersion: options.axisVersion ?? current.axisVersion ?? PROJECT_STATE_AXIS_VERSION,
    project: {
      title: plan.objective || current.project.title,
      objective: plan.objective || current.project.objective,
      stack,
      style: plan.style ? [...plan.style] : current.project.style,
      ...(plan.domain
        ? { domain: plan.domain }
        : current.project.domain
        ? { domain: current.project.domain }
        : {}),
    },
    releases: {
      current: currentRelease,
      planned: plannedReleases,
      completedPhases: current.releases.completedPhases,
    },
    productEvolution: {
      ...current.productEvolution,
      installedViews: current.productEvolution.installedViews.length > 0
        ? current.productEvolution.installedViews
        : plan.design?.views
        ? [...plan.design.views]
        : [],
    },
    preview: {
      command: buildPreviewCommand(current.workspace.projectPath, stack),
      url: current.preview.url || "http://localhost:8000",
    },
    timestamps: {
      ...current.timestamps,
      updatedAt: now,
    },
    ...(plan.design ? { design: { ...plan.design } } : current.design ? { design: current.design } : {}),
  };
}

export function projectStateToExecutionPlan(state: ProjectState): ExecutionPlan {
  return {
    objective: state.project.objective,
    stack: [...state.project.stack],
    steps: [],
    releases: [...state.releases.planned],
    style: [...state.project.style],
    ...(state.project.domain ? { domain: state.project.domain } : {}),
    ...(state.design ? { design: { ...state.design } } : {}),
  };
}

export function backfillProjectState(
  workspace: ProjectWorkspaceState,
  options: { axisVersion?: string; now?: string } = {},
): ProjectState {
  const now = options.now ?? todayIso();
  const readmeMeta = parseReadmeMetadata(workspace.projectPath);
  const detectedEvolution = detectExistingEvolution(workspace.projectPath);
  const inferredStack = inferStackFromFiles(workspace.projectPath);
  const stack = readmeMeta.stack.length > 0 ? readmeMeta.stack : inferredStack;
  const previewCommand = readmeMeta.previewCommand || buildPreviewCommand(workspace.projectPath, stack);

  const completedPhases = unique([
    ...readmeMeta.completedPhases,
    ...(detectedEvolution.appliedFeatures.length > 0 ? ["29.1"] : []),
    ...(detectedEvolution.installedViews.length > 0 || PHASE_29_2_RE.test(fileIfExists(path.join(workspace.projectPath, "index.html"))) ? ["29.2"] : []),
    ...(detectedEvolution.shellInstalled || readmeMeta.shellInstalled ? ["29.3"] : []),
  ]);

  const project = {
    title: readmeMeta.title,
    objective: readmeMeta.title,
    stack,
    style: readmeMeta.style,
    ...(readmeMeta.domain ? { domain: readmeMeta.domain } : {}),
  };

  return {
    schemaVersion: PROJECT_STATE_SCHEMA_VERSION,
    axisVersion: options.axisVersion ?? PROJECT_STATE_AXIS_VERSION,
    workspace: {
      mode: normalizeWorkspaceMode(workspace.mode),
      root: workspace.root,
      projectPath: workspace.projectPath,
      slug: workspace.slug,
    },
    project,
    releases: {
      current: readmeMeta.currentRelease || "v1",
      planned: readmeMeta.releases.length > 0 ? readmeMeta.releases : [{ version: "v1", goals: ["base"] }],
      completedPhases,
    },
    productEvolution: {
      appliedFeatures: detectedEvolution.appliedFeatures,
      installedViews: unique([...readmeMeta.installedViews, ...detectedEvolution.installedViews]),
      cohesionApplied: readmeMeta.cohesionApplied || detectedEvolution.cohesionApplied,
      shellInstalled: readmeMeta.shellInstalled || detectedEvolution.shellInstalled,
    },
    preview: {
      command: previewCommand,
      url: readmeMeta.previewUrl || "http://localhost:8000",
    },
    timestamps: {
      createdAt: readmeMeta.updatedAt || now,
      updatedAt: now,
      backfilledAt: now,
    },
  };
}

export function readProjectState(projectPath: string): ProjectState | null {
  const { statePath } = getWorkspaceStatePaths(projectPath);
  try {
    if (!fs.existsSync(statePath)) return null;
    const parsed = JSON.parse(fs.readFileSync(statePath, "utf-8")) as unknown;
    return isProjectState(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

export function writeProjectState(projectPath: string, state: ProjectState): string {
  const { axisDir, statePath } = getWorkspaceStatePaths(projectPath);
  fs.mkdirSync(axisDir, { recursive: true });
  fs.writeFileSync(statePath, JSON.stringify(state, null, 2) + "\n", "utf-8");
  return statePath;
}

export function ensureAxisDir(projectPath: string): string {
  const axisDir = path.join(projectPath, AXIS_STATE_DIRNAME);
  fs.mkdirSync(axisDir, { recursive: true });
  return axisDir;
}

export function ensureProjectState(options: EnsureProjectStateOptions): ProjectState {
  const existing = readProjectState(options.workspace.projectPath);
  if (existing) return existing;

  ensureAxisDir(options.workspace.projectPath);
  const backfillOptions = {
    ...(options.axisVersion ? { axisVersion: options.axisVersion } : {}),
    ...(options.now ? { now: options.now } : {}),
  };
  const backfilled = backfillProjectState(options.workspace, backfillOptions);
  writeProjectState(options.workspace.projectPath, backfilled);
  return backfilled;
}
