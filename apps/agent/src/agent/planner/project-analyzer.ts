/**
 * project-analyzer.ts — Phase 27 deep project analysis.
 *
 * Inspects an existing project workspace and produces a structured report
 * with stack detection, architecture summary, weak points, and improvement
 * recommendations — all deterministic, no LLM required.
 */

import fs from "fs";
import path from "path";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface WorkspaceAnalysis {
  projectPath: string;
  files: string[];
  stack: string[];
  totalLines: number;
  architecture: string;
  weakPoints: {
    uiUx: string[];
    structure: string[];
    performance: string[];
    maintainability: string[];
    scalability: string[];
  };
  recommendations: string[];
}

// ---------------------------------------------------------------------------
// Core analysis
// ---------------------------------------------------------------------------

export function analyzeWorkspace(projectPath: string): WorkspaceAnalysis {
  if (!fs.existsSync(projectPath)) {
    return emptyAnalysis(projectPath, "directory not found");
  }

  const allEntries = fs.readdirSync(projectPath);
  const files = allEntries.filter((f) => {
    const full = path.join(projectPath, f);
    return fs.statSync(full).isFile();
  });

  const stack = inferStack(files);

  // Read each text file and collect content
  const fileContents: Record<string, string> = {};
  let totalLines = 0;
  for (const f of files) {
    if (isBinary(f)) continue;
    try {
      const content = fs.readFileSync(path.join(projectPath, f), "utf-8");
      fileContents[f] = content;
      totalLines += content.split("\n").length;
    } catch {
      // skip unreadable files
    }
  }

  const architecture = buildArchitectureSummary(files, stack, fileContents);
  const weakPoints = detectWeakPoints(files, stack, fileContents);
  const recommendations = buildRecommendations(weakPoints, stack);

  return {
    projectPath,
    files,
    stack,
    totalLines,
    architecture,
    weakPoints,
    recommendations,
  };
}

// ---------------------------------------------------------------------------
// Stack inference
// ---------------------------------------------------------------------------

function inferStack(files: string[]): string[] {
  const stack: string[] = [];
  if (files.includes("index.html")) stack.push("html");
  if (files.includes("styles.css") || files.some((f) => f.endsWith(".css"))) stack.push("css");
  if (files.includes("script.js") || files.some((f) => f.endsWith(".js") && f !== "script.js")) stack.push("javascript");
  if (files.some((f) => f.endsWith(".ts"))) stack.push("typescript");
  if (files.some((f) => f.endsWith(".py"))) stack.push("python");
  if (files.includes("package.json")) stack.push("node");
  if (files.includes("requirements.txt")) stack.push("pip");
  return stack.length > 0 ? stack : ["unknown"];
}

// ---------------------------------------------------------------------------
// Architecture summary
// ---------------------------------------------------------------------------

function buildArchitectureSummary(
  files: string[],
  stack: string[],
  contents: Record<string, string>
): string {
  const isWeb = stack.includes("html");
  const isPython = stack.includes("python");

  if (isWeb) {
    const htmlLines = countLines(contents["index.html"]);
    const cssLines  = countLines(contents["styles.css"]);
    const jsLines   = countLines(contents["script.js"]);

    const hasSidebar   = containsAny(contents["index.html"] ?? "", ["sidebar", "side-nav", "sidenav"]);
    const hasTopbar    = containsAny(contents["index.html"] ?? "", ["topbar", "top-bar", "header", "navbar"]);
    const hasModules   = (contents["script.js"] ?? "").includes("function show");
    const hasAnimCSS   = containsAny(contents["styles.css"] ?? "", ["@keyframes", "animation:", "transition:"]);
    const hasGlassmorphism = containsAny(contents["styles.css"] ?? "", ["backdrop-filter", "glassmorphism"]);

    const features: string[] = [];
    if (hasSidebar) features.push("sidebar navigation");
    if (hasTopbar)  features.push("topbar/header");
    if (hasModules) features.push("view switching (showSection)");
    if (hasAnimCSS) features.push("CSS animations/transitions");
    if (hasGlassmorphism) features.push("glassmorphism effects");

    return [
      `Stack: ${stack.join(", ")} (${files.length} files, ${htmlLines + cssLines + jsLines} total lines)`,
      `HTML: ${htmlLines} lines | CSS: ${cssLines} lines | JS: ${jsLines} lines`,
      features.length > 0 ? `Features detected: ${features.join(", ")}` : "No special features detected",
    ].join("\n");
  }

  if (isPython) {
    const pyFiles = files.filter((f) => f.endsWith(".py"));
    return `Stack: Python (${pyFiles.length} source files, ${countLinesAll(contents)} total lines)`;
  }

  return `Stack: ${stack.join(", ")} (${files.length} files)`;
}

// ---------------------------------------------------------------------------
// Weak point detection
// ---------------------------------------------------------------------------

function detectWeakPoints(
  files: string[],
  stack: string[],
  contents: Record<string, string>
): WorkspaceAnalysis["weakPoints"] {
  const uiUx: string[] = [];
  const structure: string[] = [];
  const performance: string[] = [];
  const maintainability: string[] = [];
  const scalability: string[] = [];

  const isWeb = stack.includes("html");

  if (isWeb) {
    const html = contents["index.html"] ?? "";
    const css  = contents["styles.css"] ?? "";
    const js   = contents["script.js"] ?? "";

    // UI/UX
    if (!containsAny(css, ["transition:", "animation:", "@keyframes"])) {
      uiUx.push("No CSS transitions or animations — interactions feel abrupt");
    }
    if (!containsAny(css, [":hover"])) {
      uiUx.push("No :hover states defined — cards and buttons lack interactive feedback");
    }
    if (!containsAny(css, ["backdrop-filter", "blur("])) {
      uiUx.push("No glassmorphism/blur effects — UI looks flat");
    }
    if (!containsAny(html, ["viewport"])) {
      uiUx.push("No viewport meta tag — mobile experience is broken");
    }
    if (!containsAny(js, ["search", "filter", "querySelector"])) {
      uiUx.push("No search/filter functionality — data tables are not interactive");
    }

    // Structure
    if (js.split("\n").length > 600) {
      structure.push("script.js exceeds 600 lines — consider splitting into modules");
    }
    if (!containsAny(html, ["<main", "<section", "<article", "<aside"])) {
      structure.push("No semantic HTML5 elements — poor accessibility and SEO");
    }
    if (countOccurrences(js, "function ") < 3 && js.split("\n").length > 100) {
      structure.push("Low function count for file size — logic may be monolithic");
    }

    // Performance
    if (css.split("\n").length > 400) {
      performance.push("styles.css is large (>400 lines) — consider splitting or purging unused rules");
    }
    if (!containsAny(html, ["defer", "async"])) {
      performance.push("Script tags lack defer/async — may block page rendering");
    }

    // Maintainability
    if (!containsAny(css, ["--", "var("])) {
      maintainability.push("No CSS custom properties (variables) — colors/sizes hardcoded everywhere");
    }
    if (!containsAny(js, ["//", "/*"])) {
      maintainability.push("No comments in script.js — logic is undocumented");
    }
    if (!files.includes("README.md")) {
      maintainability.push("No README.md — project is undocumented");
    }

    // Scalability
    if (!containsAny(js, ["fetch(", "XMLHttpRequest", "axios"])) {
      scalability.push("No API calls — data is hardcoded, not fetched from backend");
    }
    if (!containsAny(js, ["router", "route", "history.push"])) {
      scalability.push("No client-side routing — hard to add new views without full rewrite");
    }
    if (files.length < 3) {
      scalability.push("All code in single files — zero module separation");
    }
  }

  return { uiUx, structure, performance, maintainability, scalability };
}

// ---------------------------------------------------------------------------
// Recommendation builder
// ---------------------------------------------------------------------------

function buildRecommendations(
  weakPoints: WorkspaceAnalysis["weakPoints"],
  stack: string[]
): string[] {
  const recs: string[] = [];

  if (weakPoints.uiUx.length > 0) {
    recs.push("Add CSS transitions + :hover effects for premium interactivity");
    if (weakPoints.uiUx.some((w) => w.includes("glassmorphism"))) {
      recs.push("Apply backdrop-filter: blur() to topbar and cards for glassmorphism");
    }
    if (weakPoints.uiUx.some((w) => w.includes("search"))) {
      recs.push("Implement live search with input[type=search] + JS filter on table rows");
    }
  }

  if (weakPoints.maintainability.some((w) => w.includes("variables"))) {
    recs.push("Extract colors, radii, and shadows into CSS custom properties (:root)");
  }

  if (weakPoints.scalability.some((w) => w.includes("API"))) {
    recs.push("Add a fetch-based data layer to replace hardcoded mock data");
  }

  if (weakPoints.structure.some((w) => w.includes("semantic"))) {
    recs.push("Wrap main content in <main>, group sections with <section> for accessibility");
  }

  if (recs.length === 0) {
    recs.push("Project structure looks solid — focus on UX polish and feature expansion");
  }

  return recs;
}

// ---------------------------------------------------------------------------
// Format report for console
// ---------------------------------------------------------------------------

export function formatAnalysisReport(analysis: WorkspaceAnalysis): string {
  const lines: string[] = [];
  const W = 60;
  const bar = "─".repeat(W);

  lines.push(`\n${bar}`);
  lines.push(`  [analysis]`);
  lines.push(bar);
  lines.push(`\n  workspace: ${analysis.projectPath}`);
  lines.push(`  files:     ${analysis.files.join(", ")}`);
  lines.push(`  stack:     ${analysis.stack.join(", ")}`);
  lines.push(`  lines:     ${analysis.totalLines} total`);
  lines.push(`\n  architecture:`);
  for (const line of analysis.architecture.split("\n")) {
    lines.push(`    ${line}`);
  }

  const categories: Array<[string, string[]]> = [
    ["UI/UX",           analysis.weakPoints.uiUx],
    ["structure",       analysis.weakPoints.structure],
    ["performance",     analysis.weakPoints.performance],
    ["maintainability", analysis.weakPoints.maintainability],
    ["scalability",     analysis.weakPoints.scalability],
  ];

  lines.push(`\n  weak points:`);
  for (const [cat, points] of categories) {
    if (points.length === 0) {
      lines.push(`    ${cat.padEnd(18)} ✓ OK`);
    } else {
      lines.push(`    ${cat}:`);
      for (const p of points) {
        lines.push(`      - ${p}`);
      }
    }
  }

  lines.push(`\n  recommendations:`);
  for (const r of analysis.recommendations) {
    lines.push(`    → ${r}`);
  }

  lines.push(`\n${bar}\n`);
  return lines.join("\n");
}

// ---------------------------------------------------------------------------
// Tactical improvement content builders — Phase 27
// ---------------------------------------------------------------------------

/**
 * Builds a CSS patch string containing all requested tactical improvements.
 * Designed to be appended to an existing styles.css.
 */
export function buildTacticalCSSPatch(instruction: string): string {
  const lower = instruction.toLowerCase();
  const chunks: string[] = ["/* ═══════════════════════════════════════════════════", " * Phase 27 — Tactical improvements", " * ═══════════════════════════════════════════════════ */\n"];

  const wantsTopbar    = containsAny(lower, ["topbar", "navbar", "glassmorphism", "header"]);
  const wantsCards     = containsAny(lower, ["cards", "card", "hover"]);
  const wantsTransition = containsAny(lower, ["animaciones", "transiciones", "suaves", "smooth"]);
  const wantsGlow      = containsAny(lower, ["glow", "premium", "spacing", "spacing", "elegante"]);
  const wantsSearch    = containsAny(lower, ["búsqueda", "search", "tabla", "table"]);

  // If no specific signals, apply all
  const applyAll = !wantsTopbar && !wantsCards && !wantsTransition && !wantsGlow && !wantsSearch;

  if (wantsTopbar || applyAll) {
    chunks.push(`/* --- Topbar glassmorphism --- */
.topbar, .top-bar, header, nav.navbar, .header {
  background: rgba(10, 10, 30, 0.72) !important;
  backdrop-filter: blur(18px) saturate(160%);
  -webkit-backdrop-filter: blur(18px) saturate(160%);
  border-bottom: 1px solid rgba(139, 92, 246, 0.22);
  box-shadow: 0 4px 32px rgba(0, 0, 0, 0.35);
  position: sticky;
  top: 0;
  z-index: 100;
}\n`);
  }

  if (wantsCards || applyAll) {
    chunks.push(`/* --- Premium card hover --- */
.card, .module-card, .stat-card, .metric-card, .info-card {
  transition: transform 0.28s cubic-bezier(0.4, 0, 0.2, 1),
              box-shadow 0.28s cubic-bezier(0.4, 0, 0.2, 1),
              border-color 0.28s ease !important;
  will-change: transform;
}
.card:hover, .module-card:hover, .stat-card:hover, .metric-card:hover {
  transform: translateY(-6px) scale(1.015);
  box-shadow: 0 20px 48px rgba(99, 102, 241, 0.28),
              0 0 0 1px rgba(139, 92, 246, 0.2);
  border-color: rgba(139, 92, 246, 0.5) !important;
}\n`);
  }

  if (wantsTransition || applyAll) {
    chunks.push(`/* --- Smooth global transitions --- */
button, .btn, a, .nav-item, .menu-item, .sidebar-item, .tab-item {
  transition: all 0.22s cubic-bezier(0.4, 0, 0.2, 1) !important;
}
button:hover, .btn:hover {
  transform: translateY(-2px);
  filter: brightness(1.08);
}
button:active, .btn:active {
  transform: translateY(0);
}\n`);
  }

  if (wantsGlow || applyAll) {
    chunks.push(`/* --- Glow polish & premium spacing --- */
:root {
  --glow-primary: 0 0 22px rgba(99, 102, 241, 0.38);
  --glow-accent:  0 0 35px rgba(139, 92, 246, 0.32);
  --glow-hover:   0 6px 24px rgba(99, 102, 241, 0.48);
}
.btn-primary, button[type="submit"], .primary-btn, .action-btn {
  box-shadow: var(--glow-primary);
}
.btn-primary:hover, button[type="submit"]:hover, .primary-btn:hover {
  box-shadow: var(--glow-hover);
}
input:focus, select:focus, textarea:focus {
  box-shadow: 0 0 0 3px rgba(99, 102, 241, 0.28);
  border-color: rgba(99, 102, 241, 0.65) !important;
  outline: none;
  transition: box-shadow 0.2s ease, border-color 0.2s ease;
}
section, .section, .panel, .content-panel {
  padding: 2rem 2.5rem;
}
h2, h3 { margin-bottom: 1.25rem; }\n`);
  }

  if (wantsSearch || applyAll) {
    chunks.push(`/* --- Search input + table styling --- */
.search-bar {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  margin-bottom: 1.25rem;
}
.search-input {
  flex: 1;
  padding: 0.55rem 1rem;
  border-radius: 10px;
  border: 1px solid rgba(139, 92, 246, 0.3);
  background: rgba(255,255,255,0.04);
  color: inherit;
  font-size: 0.9rem;
  transition: border-color 0.2s ease, box-shadow 0.2s ease;
}
.search-input:focus {
  border-color: rgba(139, 92, 246, 0.7);
  box-shadow: 0 0 0 3px rgba(99,102,241,0.18);
  outline: none;
}
.data-table {
  width: 100%;
  border-collapse: collapse;
  font-size: 0.9rem;
}
.data-table th {
  padding: 0.7rem 1rem;
  background: rgba(99,102,241,0.12);
  border-bottom: 1px solid rgba(139,92,246,0.25);
  text-align: left;
  font-weight: 600;
  letter-spacing: 0.03em;
}
.data-table td {
  padding: 0.65rem 1rem;
  border-bottom: 1px solid rgba(255,255,255,0.06);
}
.data-table tr:hover td {
  background: rgba(139,92,246,0.08);
}\n`);
  }

  return chunks.join("\n");
}

/**
 * Builds HTML snippet for a student table with live search.
 * Designed to be injected into the alumnos/students section.
 */
export function buildSearchTableHTML(): string {
  return `
  <!-- Phase 27: Alumnos table with live search -->
  <div id="alumnos-section" class="section" style="display:none">
    <h2>Alumnos</h2>
    <div class="search-bar">
      <input
        type="search"
        class="search-input"
        id="alumnos-search"
        placeholder="Buscar alumno…"
        oninput="filterTable('alumnos-table', this.value)"
      />
    </div>
    <table class="data-table" id="alumnos-table">
      <thead>
        <tr>
          <th>#</th><th>Nombre</th><th>Grado</th><th>Estado</th><th>Acción</th>
        </tr>
      </thead>
      <tbody>
        <tr><td>001</td><td>Ana García</td><td>3°A</td><td><span class="badge ok">Activo</span></td><td><button class="btn-sm">Ver</button></td></tr>
        <tr><td>002</td><td>Carlos López</td><td>2°B</td><td><span class="badge ok">Activo</span></td><td><button class="btn-sm">Ver</button></td></tr>
        <tr><td>003</td><td>María Torres</td><td>4°A</td><td><span class="badge warn">Becado</span></td><td><button class="btn-sm">Ver</button></td></tr>
        <tr><td>004</td><td>Juan Ramírez</td><td>1°C</td><td><span class="badge ok">Activo</span></td><td><button class="btn-sm">Ver</button></td></tr>
        <tr><td>005</td><td>Sofía Herrera</td><td>5°A</td><td><span class="badge off">Inactivo</span></td><td><button class="btn-sm">Ver</button></td></tr>
      </tbody>
    </table>
  </div>`;
}

/**
 * Builds the JS snippet for live table filtering.
 * Designed to be appended to script.js.
 */
export function buildSearchTableJS(): string {
  return `

// === Phase 27: Live table search ===
function filterTable(tableId, query) {
  const table = document.getElementById(tableId);
  if (!table) return;
  const q = query.toLowerCase().trim();
  table.querySelectorAll('tbody tr').forEach(function(row) {
    const text = row.textContent.toLowerCase();
    row.style.display = q === '' || text.includes(q) ? '' : 'none';
  });
}
`;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function emptyAnalysis(projectPath: string, reason: string): WorkspaceAnalysis {
  return {
    projectPath,
    files: [],
    stack: [],
    totalLines: 0,
    architecture: reason,
    weakPoints: { uiUx: [], structure: [], performance: [], maintainability: [], scalability: [] },
    recommendations: [],
  };
}

function isBinary(filename: string): boolean {
  return /\.(png|jpg|jpeg|gif|svg|ico|woff|woff2|ttf|eot|pdf|zip|gz|bin)$/i.test(filename);
}

function countLines(content: string | undefined): number {
  if (!content) return 0;
  return content.split("\n").length;
}

function countLinesAll(contents: Record<string, string>): number {
  return Object.values(contents).reduce((sum, c) => sum + c.split("\n").length, 0);
}

function containsAny(text: string, keywords: string[]): boolean {
  const lower = text.toLowerCase();
  return keywords.some((k) => lower.includes(k));
}

function countOccurrences(text: string, needle: string): number {
  let count = 0;
  let pos = 0;
  while ((pos = text.indexOf(needle, pos)) !== -1) { count++; pos++; }
  return count;
}
