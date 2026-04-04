import fs from "fs";
import path from "path";
import type { Tool, ToolContext, ToolResult } from "../types.js";

// ── Constants ─────────────────────────────────────────────────────────────────

const SKIP_DIRS = new Set([
  "node_modules", ".git", "__pycache__", "dist", "build",
  ".next", "target", ".cache", "vendor", ".venv", "venv",
  "env", "coverage", ".nyc_output", ".turbo", "out", ".svelte-kit",
]);

const SKIP_FILES = new Set([
  ".DS_Store", "Thumbs.db",
  "package-lock.json", "yarn.lock", "pnpm-lock.yaml", "poetry.lock", "Gemfile.lock",
]);

const SKIP_EXTS = new Set([
  ".pyc", ".pyo", ".class", ".o", ".a", ".so", ".dll", ".exe",
  ".map",
]);

const MAX_SCAN_FILES = 300;
const MAX_TREE_LINES = 120;

const BLUE  = "\x1b[34m";
const RESET = "\x1b[0m";

// ── Types ─────────────────────────────────────────────────────────────────────

interface FileEntry {
  relPath: string;
  ext: string;
}

// ── Scanner ───────────────────────────────────────────────────────────────────

function scanDir(
  dirPath: string,
  rootPath: string,
  depth: number,
  maxDepth: number,
  results: FileEntry[],
): void {
  if (depth > maxDepth || results.length >= MAX_SCAN_FILES) return;

  let items: fs.Dirent[];
  try {
    items = fs.readdirSync(dirPath, { withFileTypes: true });
  } catch {
    return;
  }

  // Directories first, then alphabetically within each group
  items.sort((a, b) => {
    const aD = a.isDirectory() ? 0 : 1;
    const bD = b.isDirectory() ? 0 : 1;
    if (aD !== bD) return aD - bD;
    return a.name.localeCompare(b.name);
  });

  for (const item of items) {
    if (results.length >= MAX_SCAN_FILES) break;

    // Skip hidden entries in subdirectories (root-level dotfiles like .gitignore are useful)
    if (item.name.startsWith(".") && depth > 0) continue;

    const full = path.join(dirPath, item.name);
    const rel  = path.relative(rootPath, full);

    if (item.isDirectory()) {
      if (SKIP_DIRS.has(item.name)) continue;
      scanDir(full, rootPath, depth + 1, maxDepth, results);
    } else {
      if (SKIP_FILES.has(item.name)) continue;
      const ext = path.extname(item.name).toLowerCase();
      if (SKIP_EXTS.has(ext)) continue;
      results.push({ relPath: rel, ext });
    }
  }
}

// ── Project type detection ────────────────────────────────────────────────────

function detectType(rootPath: string, files: FileEntry[]): string {
  const check = (name: string): boolean => {
    try { return fs.existsSync(path.join(rootPath, name)); } catch { return false; }
  };
  const hasExt = (ext: string): boolean => files.some((f) => f.ext === ext);

  const types: string[] = [];
  if (check("Cargo.toml"))                                                 types.push("Rust");
  if (check("go.mod"))                                                     types.push("Go");
  if (check("pyproject.toml") || check("requirements.txt") || check("setup.py")) types.push("Python");
  if (check("package.json")) {
    if (check("tsconfig.json") || hasExt(".ts") || hasExt(".tsx"))        types.push("TypeScript / Node.js");
    else                                                                    types.push("JavaScript / Node.js");
  }
  if (!check("package.json") && (check("index.html") || hasExt(".html"))) types.push("Web (static)");
  if (check("Dockerfile") || check("docker-compose.yml") || check("compose.yml")) types.push("Docker");

  return types.length ? types.join(" + ") : "Unknown";
}

// ── Tree builder ──────────────────────────────────────────────────────────────

/**
 * Builds an indented tree from a list of relative file paths.
 * Directories are emitted once before their children.
 * `colorDirs` wraps directory names with ANSI blue.
 */
function buildTree(files: FileEntry[], colorDirs: boolean): string {
  const sorted = [...files].map((f) => f.relPath).sort();
  const lines: string[] = [];
  const seenDirs = new Set<string>();
  const sep = path.sep;

  for (const rp of sorted) {
    if (lines.length >= MAX_TREE_LINES) {
      const remaining = sorted.length - lines.length;
      lines.push(`  ... (${remaining} more files)`);
      break;
    }

    const parts = rp.split(sep);

    // Emit parent directories not yet seen
    for (let i = 0; i < parts.length - 1; i++) {
      const dirKey = parts.slice(0, i + 1).join(sep);
      if (!seenDirs.has(dirKey)) {
        seenDirs.add(dirKey);
        const indent = "  ".repeat(i);
        const name = parts[i]!;
        const display = colorDirs ? `${BLUE}${name}/${RESET}` : `${name}/`;
        lines.push(`${indent}${display}`);
      }
    }

    // Emit file
    const indent = "  ".repeat(parts.length - 1);
    lines.push(`${indent}${parts[parts.length - 1]!}`);
  }

  return lines.join("\n");
}

// ── Extension stats ───────────────────────────────────────────────────────────

function extStats(files: FileEntry[]): string {
  const counts = new Map<string, number>();
  for (const f of files) {
    const key = f.ext || "(no ext)";
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 8)
    .map(([ext, n]) => `${ext}(${n})`)
    .join("  ");
}

// ── Key files for project context ─────────────────────────────────────────────

/** Returns basenames of the most contextually useful files in the project. */
export function findKeyFiles(rootPath: string): string[] {
  const CANDIDATES = [
    "README.md", "README.rst", "readme.md",
    "package.json", "pyproject.toml", "tsconfig.json",
    "Cargo.toml", "go.mod", "Makefile",
    "index.html", "main.py", "main.ts", "index.ts", "app.py", "app.ts",
    ".env.example",
  ];
  return CANDIDATES.filter((f) => {
    try { return fs.existsSync(path.join(rootPath, f)); } catch { return false; }
  }).slice(0, 5);
}

// ── Tool ──────────────────────────────────────────────────────────────────────

export class ScanProjectTool implements Tool {
  readonly name = "scan_project";
  readonly description =
    "Recursively scan a directory to show project structure, detect project type, and identify key files (up to depth 3)";

  async execute(args: Record<string, string>, ctx: ToolContext): Promise<ToolResult> {
    const scanPath = args["path"] ?? ".";
    const rawDepth = parseInt(args["depth"] ?? "3", 10);
    const maxDepth = isNaN(rawDepth) ? 3 : Math.min(Math.max(1, rawDepth), 5);

    const resolved = path.resolve(ctx.cwd, scanPath);

    if (!fs.existsSync(resolved)) {
      return { output: "", error: `Path not found: ${resolved}` };
    }

    let stat: fs.Stats;
    try {
      stat = fs.statSync(resolved);
    } catch (e) {
      return { output: "", error: `Cannot stat: ${resolved}` };
    }

    if (!stat.isDirectory()) {
      return { output: "", error: `Not a directory: ${resolved}` };
    }

    const files: FileEntry[] = [];
    scanDir(resolved, resolved, 0, maxDepth, files);

    if (files.length === 0) {
      return { output: "(empty directory)", contextOutput: "(empty directory)" };
    }

    const projectType = detectType(resolved, files);
    const treeColor = buildTree(files, true);
    const treePlain = buildTree(files, false);
    const stats     = extStats(files);
    const truncated = files.length >= MAX_SCAN_FILES
      ? ` (first ${MAX_SCAN_FILES} shown)`
      : "";

    const keyFiles = findKeyFiles(resolved);
    const keyFilesNote = keyFiles.length
      ? `\nKey files: ${keyFiles.join(", ")}`
      : "";

    const ruleLen = 60;
    const header = `Project: ${resolved}  [${projectType}]`;
    const footer = `\n${files.length} files${truncated}  |  ${stats}${keyFilesNote}`;

    const output =
      `${header}\n${"─".repeat(Math.min(header.length, ruleLen))}\n${treeColor}${footer}`;

    const contextOutput =
      `[PROJECT SCAN: ${resolved}]\n` +
      `Type: ${projectType}\n` +
      `Files: ${files.length}${truncated}\n` +
      `Stats: ${stats}\n` +
      (keyFiles.length ? `Key files: ${keyFiles.join(", ")}\n` : "") +
      `\n${treePlain}`;

    return { output, contextOutput };
  }
}
