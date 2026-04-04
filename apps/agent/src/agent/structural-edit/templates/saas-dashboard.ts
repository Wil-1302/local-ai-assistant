/**
 * SaaS Dashboard template — Release 31C.1
 *
 * Generates a complete dark-futuristic SaaS shell with:
 *   - Collapsible sidebar with nav items per view
 *   - Glassmorphism topbar
 *   - Main content area with animated view transitions
 *   - Overview view with stat cards
 *   - Placeholder view sections for each module
 *   - navigateTo() wiring with guard (won't override script.js definition)
 *   - Preserved <link href="styles.css"> and <script src="script.js">
 */

import type { RebuildTemplate, TemplateContext } from "./types.js";
import { BASE_STYLES } from "./base-styles.js";

// ── View icon mapping ─────────────────────────────────────────────────────────

const VIEW_ICONS: Record<string, string> = {
  overview:       "⬡",  dashboard:      "⬡",
  analytics:      "◈",  reports:        "◈",
  alumnos:        "👥", students:       "👥", users:       "👤", usuarios:  "👤",
  cursos:         "📚", courses:        "📚",
  pagos:          "💳", payments:       "💳", billing:    "💳",
  matriculas:     "📝", matrículas:     "📝", enrollment: "📝",
  settings:       "⚙",  configuracion:  "⚙",  configuración: "⚙",
  team:           "🤝", equipo:         "🤝",
  projects:       "📁", proyectos:      "📁",
  tasks:          "✦",  tareas:         "✦",
  calendar:       "◻",  calendario:     "◻",
  files:          "🗂",  archivos:       "🗂",
  inventory:      "📦", inventario:     "📦",
  sales:          "↑",  ventas:         "↑",
  crm:            "◉",  clientes:       "◉",  clients:    "◉",
  activity:       "◎",  actividad:      "◎",
};

function viewIcon(viewId: string): string {
  return VIEW_ICONS[viewId.toLowerCase()] ?? "◈";
}

function viewLabel(viewId: string): string {
  return viewId.charAt(0).toUpperCase() + viewId.slice(1).replace(/-/g, " ");
}

// ── Nav items ─────────────────────────────────────────────────────────────────

function buildNavItems(views: string[]): string {
  return views
    .map(
      (v) =>
        `      <div class="sidebar-nav-item" data-view="${v}">\n` +
        `        <span class="nav-icon">${viewIcon(v)}</span>\n` +
        `        <span class="nav-label">${viewLabel(v)}</span>\n` +
        `      </div>`
    )
    .join("\n");
}

// ── View sections ─────────────────────────────────────────────────────────────

function buildOverviewSection(productName: string): string {
  return `    <section class="view-section" data-view="overview" id="view-overview">
      <div class="section-header">
        <h2>Overview</h2>
        <p>Panel principal de ${productName}</p>
      </div>
      <div class="stats-row">
        <div class="stat-card">
          <span class="stat-num">—</span>
          <span class="stat-label">Total activo</span>
          <span class="stat-delta up">● activo</span>
        </div>
        <div class="stat-card">
          <span class="stat-num">—</span>
          <span class="stat-label">Este mes</span>
          <span class="stat-delta up">↑ en curso</span>
        </div>
        <div class="stat-card">
          <span class="stat-num">—</span>
          <span class="stat-label">Pendiente</span>
          <span class="stat-delta">◌ pendiente</span>
        </div>
        <div class="stat-card">
          <span class="stat-num">—%</span>
          <span class="stat-label">Rendimiento</span>
          <span class="stat-delta up">↑ óptimo</span>
        </div>
      </div>
      <div class="grid-2">
        <div class="card">
          <div class="card-header">
            <span class="card-title">Actividad reciente</span>
            <span class="card-muted">Hoy</span>
          </div>
          <div class="empty-state">
            <div class="empty-icon">◎</div>
            <h3>Sin actividad reciente</h3>
            <p>Los eventos aparecerán aquí</p>
          </div>
        </div>
        <div class="card">
          <div class="card-header">
            <span class="card-title">Estado del sistema</span>
            <span class="card-muted">Tiempo real</span>
          </div>
          <div class="empty-state">
            <div class="empty-icon">⬡</div>
            <h3>Sistema operativo</h3>
            <p>Todos los servicios en línea</p>
          </div>
        </div>
      </div>
    </section>`;
}

function buildPlaceholderSection(viewId: string): string {
  const label = viewLabel(viewId);
  const icon  = viewIcon(viewId);
  return `    <section class="view-section" data-view="${viewId}" id="view-${viewId}">
      <div class="section-header">
        <h2>${label}</h2>
        <p>Módulo ${label} — gestión y operaciones</p>
      </div>
      <div class="card">
        <div class="card-header">
          <span class="card-title">Lista de ${label}</span>
          <button class="btn-primary">+ Nuevo</button>
        </div>
        <div class="empty-state">
          <div class="empty-icon">${icon}</div>
          <h3>Sin elementos</h3>
          <p>Agrega el primer elemento de ${label.toLowerCase()} para comenzar</p>
        </div>
      </div>
    </section>`;
}

function buildViewSections(views: string[], productName: string): string {
  const sections = views.map((v) =>
    v === "overview" ? buildOverviewSection(productName) : buildPlaceholderSection(v)
  );
  return sections.join("\n\n");
}

// ── JS wiring ─────────────────────────────────────────────────────────────────

function buildShellScript(views: string[]): string {
  const firstView = views[0] ?? "overview";
  return `  <script>
    /* Phase 31C.1 — SaaS Shell Navigation */
    (function () {
      if (typeof window.navigateTo === 'function') return; // defined in script.js

      function navigateTo(viewId) {
        document.querySelectorAll('.view-section[data-view]').forEach(function (v) {
          v.classList.toggle('active', v.dataset.view === viewId);
        });
        document.querySelectorAll('.sidebar-nav-item[data-view]').forEach(function (n) {
          n.classList.toggle('active', n.dataset.view === viewId);
        });
        var titleEl = document.getElementById('page-title');
        if (titleEl) {
          var label = document.querySelector('.sidebar-nav-item[data-view="' + viewId + '"] .nav-label');
          titleEl.textContent = label ? label.textContent : viewId;
        }
      }
      window.navigateTo = navigateTo;

      document.querySelectorAll('.sidebar-nav-item[data-view]').forEach(function (item) {
        item.addEventListener('click', function () { navigateTo(item.dataset.view); });
      });

      var toggle  = document.getElementById('sidebar-toggle');
      var sidebar = document.getElementById('sidebar');
      if (toggle && sidebar) {
        toggle.addEventListener('click', function () { sidebar.classList.toggle('collapsed'); });
      }

      navigateTo('${firstView}');
    })();
  </script>`;
}

// ── User avatar initials ──────────────────────────────────────────────────────

function avatarInitial(productName: string): string {
  return (productName.trim()[0] ?? "A").toUpperCase();
}

// ── Main build function ───────────────────────────────────────────────────────

function build(ctx: TemplateContext): string {
  const { productName, views, cssFile, jsFile } = ctx;
  const navItems      = buildNavItems(views);
  const viewSections  = buildViewSections(views, productName);
  const shellScript   = buildShellScript(views);
  const initial       = avatarInitial(productName);
  const firstLabel    = viewLabel(views[0] ?? "overview");

  return `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${productName}</title>
  <style>${BASE_STYLES}</style>
  <link rel="stylesheet" href="${cssFile}">
</head>
<body class="axis-shell">

  <!-- Sidebar -->
  <aside class="sidebar" id="sidebar">
    <div class="sidebar-brand">
      <div class="brand-icon"></div>
      <span class="brand-name">${productName}</span>
    </div>
    <nav class="sidebar-nav">
${navItems}
    </nav>
    <div class="sidebar-footer">
      <div class="sidebar-footer-dot"></div>
      <span class="sidebar-footer-text">Sistema activo</span>
    </div>
  </aside>

  <!-- Main wrapper -->
  <div class="main-wrapper">

    <!-- Topbar -->
    <header class="topbar" id="topbar">
      <div class="topbar-left">
        <button class="sidebar-toggle" id="sidebar-toggle" aria-label="Toggle sidebar">☰</button>
        <span class="page-title" id="page-title">${firstLabel}</span>
      </div>
      <div class="topbar-right">
        <div class="topbar-badge">${productName}</div>
        <div class="user-avatar">${initial}</div>
      </div>
    </header>

    <!-- Content area -->
    <main class="main-content" id="main-content">

${viewSections}

    </main>
  </div><!-- /.main-wrapper -->

${shellScript}
  <script src="${jsFile}"></script>
</body>
</html>`;
}

export const saasDashboardTemplate: RebuildTemplate = {
  id: "saas-dashboard",
  description: "Dark futuristic SaaS shell — sidebar, topbar, view sections, stat cards",
  build,
};
