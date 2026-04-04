/**
 * Template selector and context builder for structural web rebuilds (Release 31C).
 *
 * selectRebuildTemplate() returns the best matching template for the given
 * instruction and existing file content, or null to fall back to the LLM path.
 *
 * buildTemplateContext() extracts productName, views, and file references from
 * the project directory and current file content.
 */

import path from "path";
import type { RebuildTemplate, TemplateContext } from "./types.js";
import { saasDashboardTemplate } from "./saas-dashboard.js";

// ── Template selector ─────────────────────────────────────────────────────────

/**
 * Signals that strongly indicate a SaaS dashboard shell is wanted.
 * Checked against the lowercased instruction.
 */
const SAAS_SIGNALS = [
  "sidebar", "barra lateral", "panel lateral",
  "shell", "app shell", "shell saas",
  "topbar", "navbar", "barra superior",
  "saas", "dashboard", "layout",
];

/**
 * Returns the most appropriate template for the given rebuild instruction,
 * or null when no template matches (→ LLM fallback).
 */
export function selectRebuildTemplate(
  instruction: string,
  _fileContent: string,
): RebuildTemplate | null {
  const lower = instruction.toLowerCase();
  const hasSaasSignal = SAAS_SIGNALS.some((s) => lower.includes(s));
  if (hasSaasSignal) return saasDashboardTemplate;
  return null;
}

// ── Context builder ───────────────────────────────────────────────────────────

/** Default views used when none are detectable from the existing file. */
const DEFAULT_VIEWS = ["overview", "reports", "settings"];

/**
 * Extract views from data-view attributes already present in the file.
 * Preserves existing view IDs so the rebuild doesn't discard user's module names.
 */
function extractViewsFromContent(fileContent: string): string[] {
  const views: string[] = [];
  const re = /data-view=["']([^"']+)["']/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(fileContent)) !== null) {
    const v = m[1];
    if (v && !views.includes(v)) views.push(v);
  }
  return views;
}

/**
 * Extract a human-readable product name from the existing file content,
 * falling back to the parent directory name.
 */
function extractProductName(filePath: string, fileContent: string): string {
  // 1. <title> tag
  const titleMatch = fileContent.match(/<title[^>]*>([^<]{1,80})<\/title>/i);
  if (titleMatch?.[1]) {
    const t = titleMatch[1].trim();
    if (t && !/untitled|index/i.test(t)) return t;
  }

  // 2. First <h1>
  const h1Match = fileContent.match(/<h1[^>]*>([^<]{1,60})<\/h1>/i);
  if (h1Match?.[1]) {
    const t = h1Match[1].trim().replace(/<[^>]+>/g, "");
    if (t) return t;
  }

  // 3. Parent directory basename converted to Title Case
  const absPath = path.resolve(process.cwd(), filePath);
  const dirName = path.basename(path.dirname(absPath));
  return toTitleCase(dirName.replace(/[-_]/g, " "));
}

function toTitleCase(s: string): string {
  return s
    .split(/\s+/)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
    .join(" ");
}

/**
 * Detect the CSS file referenced in the existing HTML.
 * Returns "styles.css" when no <link> is found.
 */
function detectCssFile(fileContent: string): string {
  const m = fileContent.match(/<link[^>]+href=["']([^"']+\.css)["']/i);
  return m?.[1] ?? "styles.css";
}

/**
 * Detect the JS file referenced in the existing HTML via <script src>.
 * Returns "script.js" when none is found.
 */
function detectJsFile(fileContent: string): string {
  const m = fileContent.match(/<script[^>]+src=["']([^"']+\.js)["']/i);
  return m?.[1] ?? "script.js";
}

/**
 * Builds the TemplateContext used by template.build().
 * Should be called only after selectRebuildTemplate returns non-null.
 */
export function buildTemplateContext(
  filePath: string,
  fileContent: string,
): TemplateContext {
  const productName = extractProductName(filePath, fileContent);

  let views = extractViewsFromContent(fileContent);
  if (views.length === 0) views = [...DEFAULT_VIEWS];

  // Always ensure "overview" is the first view
  if (!views.includes("overview")) {
    views = ["overview", ...views];
  } else if (views[0] !== "overview") {
    views = ["overview", ...views.filter((v) => v !== "overview")];
  }

  return {
    productName,
    views,
    cssFile: detectCssFile(fileContent),
    jsFile:  detectJsFile(fileContent),
    hasExistingLogin: /#login-section|id=["']login/i.test(fileContent),
  };
}
