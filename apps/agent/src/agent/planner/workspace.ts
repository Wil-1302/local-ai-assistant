/**
 * workspace.ts — project workspace isolation for the planner.
 *
 * Every large planner project gets its own subdirectory under ./proyectos/.
 * This keeps generated project files out of the agent source tree.
 */

import fs from "fs";
import path from "path";
import os from "os";
import type { ExecutionPlan } from "./types.js";

export const AXIS_STATE_DIRNAME = ".axis";
export const PROJECT_STATE_FILENAME = "project-state.json";

/**
 * Regex that matches a leading creation verb + optional article at the start of an objective.
 * Stripping it gives a cleaner project slug (e.g. "plataforma-escolar" vs "crea-una-plataforma").
 */
const LEADING_VERB_RE =
  /^(?:crea|crear|haz|hacer|genera|generar|construye|construir|build|create|make|generate|scaffold|mejora|mejorar|improve|improve|enhance|actualiza|actualizar|update|reutiliza|reutilizar|reuse)\s+(?:una?\s+|el\s+|la\s+|un\s+|los\s+|las\s+|an?\s+|the\s+)?/i;

/**
 * Converts an objective string to a filesystem-safe slug:
 *   - leading creation verb + article stripped ("crea una" → "")
 *   - lowercased
 *   - diacritics stripped
 *   - only alphanumeric, spaces, and hyphens kept
 *   - spaces collapsed to hyphens
 *   - max 50 chars
 */
export function slugify(text: string): string {
  return text
    .replace(LEADING_VERB_RE, "")      // strip "crea una", "build a", etc.
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")   // strip diacritics (é→e, ó→o, etc.)
    .replace(/[^a-z0-9\s-]/g, " ")     // non-alphanum → space
    .trim()
    .replace(/\s+/g, "-")              // spaces → hyphens
    .replace(/-{2,}/g, "-")            // collapse consecutive hyphens
    .replace(/^-|-$/g, "")             // strip leading/trailing hyphens
    .slice(0, 50);
}

export interface ProjectWorkspace {
  /** Absolute path to the ./proyectos root. */
  root: string;
  /** The generated project slug (e.g. "plataforma-escolar-futurista"). */
  slug: string;
  /** Absolute path to the project subdirectory (root/slug). */
  projectPath: string;
}

export interface WorkspaceStatePaths {
  axisDir: string;
  statePath: string;
}

/**
 * Resolves (and creates) a unique project workspace directory.
 *
 * - root: <agentCwd>/proyectos
 * - slug: derived from `objective`; if the directory already exists,
 *         adds an incremental suffix (-2, -3, …) so existing work is never overwritten.
 *
 * @param objective  The plan objective string (e.g. "Crea una plataforma escolar futurista")
 * @param agentCwd   The working directory of the running agent (defaults to process.cwd())
 */
export function resolveProjectWorkspace(
  objective: string,
  agentCwd: string = process.cwd()
): ProjectWorkspace {
  const root = path.join(agentCwd, "proyectos");
  fs.mkdirSync(root, { recursive: true });

  const base = slugify(objective) || "proyecto";

  // Find a non-colliding slug: try base, then base-2, base-3, …
  let slug = base;
  let suffix = 1;
  while (fs.existsSync(path.join(root, slug))) {
    suffix++;
    slug = `${base}-${suffix}`;
  }

  const projectPath = path.join(root, slug);
  fs.mkdirSync(projectPath, { recursive: true });

  return { root, slug, projectPath };
}

/**
 * Continues an existing project workspace by its slug (no new dir created).
 */
export function continueProjectWorkspace(
  slug: string,
  agentCwd: string = process.cwd()
): ProjectWorkspace {
  const root = path.join(agentCwd, "proyectos");
  const projectPath = path.join(root, slug);
  fs.mkdirSync(projectPath, { recursive: true }); // ensure it exists
  return { root, slug, projectPath };
}

/**
 * Strips a trailing incremental suffix (-2, -3, …) from a slug.
 * "plataforma-escolar-futurista-2" → "plataforma-escolar-futurista"
 */
function stripNumberSuffix(slug: string): string {
  return slug.replace(/-\d+$/, "");
}

/**
 * Finds existing project directories similar to the given base slug.
 * Similarity: after stripping number suffixes, one slug is a prefix of the other
 * (handles "plataforma-escolar-futurista-con-mas-ani" matching
 *  "plataforma-escolar-futurista" or "plataforma-escolar-futurista-2").
 * Returns slugs sorted alphabetically (last = most recent).
 */
export function findSimilarProjects(baseSlug: string, root: string): string[] {
  if (!fs.existsSync(root)) return [];
  const newBase = stripNumberSuffix(baseSlug);
  return fs
    .readdirSync(root)
    .filter((d) => {
      const stat = fs.statSync(path.join(root, d));
      if (!stat.isDirectory()) return false;
      const existingBase = stripNumberSuffix(d);
      // Prefix match in either direction — catches continuations and enriched slugs
      return newBase.startsWith(existingBase) || existingBase.startsWith(newBase);
    })
    .sort();
}

/**
 * Infers the technology stack of an existing project workspace by inspecting its files.
 *
 * - web:      index.html + styles.css + script.js present
 * - python:   main.py or requirements.txt present
 * - electron: main.js + preload.js present
 * - [] :      unknown / empty workspace
 */
export function inferStackFromWorkspace(projectPath: string): string[] {
  if (!fs.existsSync(projectPath)) return [];
  let files: string[];
  try {
    files = fs.readdirSync(projectPath);
  } catch {
    return [];
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
  return [];
}

/**
 * Generates a README.md for a project workspace.
 */
export function generateProjectReadme(
  ws: ProjectWorkspace,
  plan: ExecutionPlan,
  updatedAt: string
): string {
  const releases = plan.releases ?? [];
  const executedRelease = releases[0]?.version ?? "v1";
  const pendingModules = releases
    .slice(1)
    .map((r) => `- ${r.version}: ${r.goals.join(", ") || "(sin detalle)"}`)
    .join("\n");

  const previewCmd = plan.stack.includes("html")
    ? `cd ${ws.projectPath} && python3 -m http.server 8000`
    : plan.stack.includes("python")
    ? `cd ${ws.projectPath} && python3 main.py`
    : `cd ${ws.projectPath}`;

  return `# ${plan.objective}

## Metadata
- **Dominio:** ${plan.domain ?? "genérico"}
- **Estilo:** ${plan.style?.join(", ") ?? "default"}
- **Stack:** ${plan.stack.join(", ")}
- **Última actualización:** ${updatedAt}

## Releases
${
  releases.length > 0
    ? releases
        .map(
          (r, i) =>
            `- [${i === 0 ? "x" : " "}] **${r.version}** — ${r.goals.join(", ") || "(base)"}`
        )
        .join("\n")
    : "- [x] v1 — base"
}

## Última release ejecutada
${executedRelease}

## Módulos pendientes
${pendingModules || "- (ninguno pendiente)"}

## Cómo previsualizar
\`\`\`bash
${previewCmd}
\`\`\`

## URL local
http://localhost:8000
`;
}

/**
 * Returns true when the given directory should be used directly as the
 * workspace root, rather than creating a subdirectory under ./proyectos/.
 *
 * Returns false when:
 * - `cwd` is the agent's own repository (detected by package.json name +
 *   presence of src/agent/planner directory).
 * - `cwd` is a generic system folder (home dir, /tmp, filesystem root).
 */
export function shouldUseCwdDirectly(cwd: string): boolean {
  // Reject generic system locations
  const home = os.homedir();
  const tmp  = os.tmpdir();
  if (cwd === home || cwd === tmp || cwd === "/" || cwd === "/tmp") {
    return false;
  }

  // Reject the agent's own source tree
  try {
    const pkgPath = path.join(cwd, "package.json");
    if (fs.existsSync(pkgPath)) {
      const pkg = JSON.parse(fs.readFileSync(pkgPath, "utf8")) as Record<string, unknown>;
      if (
        pkg["name"] === "agent" &&
        fs.existsSync(path.join(cwd, "src", "agent", "planner"))
      ) {
        return false;
      }
    }
  } catch {
    // ignore parse errors — not the agent repo
  }

  // Any other directory is treated as a dedicated project folder
  return true;
}

/**
 * Wraps `cwd` as a ProjectWorkspace pointing directly to the current directory.
 * Used when shouldUseCwdDirectly returns true.
 */
export function cwdAsWorkspace(cwd: string): ProjectWorkspace {
  return {
    root: path.dirname(cwd),
    slug: path.basename(cwd),
    projectPath: cwd,
  };
}

/**
 * Returns the .axis directory and project-state path for a workspace.
 * Pure path helper; it does not create any directories.
 */
export function getWorkspaceStatePaths(projectPath: string): WorkspaceStatePaths {
  const axisDir = path.join(projectPath, AXIS_STATE_DIRNAME);
  const statePath = path.join(axisDir, PROJECT_STATE_FILENAME);
  return { axisDir, statePath };
}

/**
 * Appends (or updates) a "## Últimas mejoras tácticas" section in README.md.
 *
 * @param readmeContent   Existing README string
 * @param changesApplied  List of change descriptions
 * @param filesChanged    List of files that were modified
 * @param updatedAt       ISO date string
 */
export function appendTacticalImprovements(
  readmeContent: string,
  changesApplied: string[],
  filesChanged: string[],
  updatedAt: string
): string {
  const block = `\n## Últimas mejoras tácticas\n- **Fecha:** ${updatedAt}\n- **Cambios:**\n${changesApplied.map((c) => `  - ${c}`).join("\n")}\n- **Archivos tocados:** ${filesChanged.join(", ")}\n`;

  // Replace existing section if present, otherwise append
  if (readmeContent.includes("## Últimas mejoras tácticas")) {
    return readmeContent.replace(/\n## Últimas mejoras tácticas[\s\S]*$/, block);
  }
  return readmeContent + block;
}
