/**
 * tactical-builders.ts — Phase 29.1
 *
 * Applies real HTML/CSS/JS feature snippets to an existing web project.
 * Each feature has a guard marker so it is never applied twice.
 */

import fs from "fs";
import path from "path";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface FeatureSnippets {
  html?: string;   // injected before </body>
  css?: string;    // appended to styles.css
  js?: string;     // appended to script.js (wrapped in setTimeout)
}

export interface EvolutionResult {
  appliedFeatures: string[];
  filesChanged: string[];
  skipped: string[];
}

// ---------------------------------------------------------------------------
// Feature builders
// ---------------------------------------------------------------------------

function buildKanban(): FeatureSnippets {
  return {
    html: `
  <!-- Kanban Board -->
  <div class="kanban-section" id="phase29-kanban">
    <h3 class="section-title" style="margin-bottom:1rem">Kanban Board</h3>
    <div class="kanban-board">
      <div class="kanban-col">
        <div class="kanban-col-header">Todo <span class="kanban-count">3</span></div>
        <div class="kanban-cards">
          <div class="kanban-card priority-high">Design new onboarding flow</div>
          <div class="kanban-card priority-medium">Write API docs</div>
          <div class="kanban-card priority-low">Update favicon</div>
        </div>
      </div>
      <div class="kanban-col">
        <div class="kanban-col-header">In Progress <span class="kanban-count">2</span></div>
        <div class="kanban-cards">
          <div class="kanban-card priority-high">Integrate metrics API</div>
          <div class="kanban-card priority-medium">Deploy to staging</div>
        </div>
      </div>
      <div class="kanban-col">
        <div class="kanban-col-header">Done <span class="kanban-count">3</span></div>
        <div class="kanban-cards">
          <div class="kanban-card done">Login screen redesign</div>
          <div class="kanban-card done">Sidebar navigation</div>
          <div class="kanban-card done">Dashboard metrics</div>
        </div>
      </div>
    </div>
  </div>`,
    css: `.kanban-section { padding: 2rem; }
.kanban-board { display: flex; gap: 1rem; align-items: flex-start; }
.kanban-col {
  flex: 1;
  background: rgba(255,255,255,0.03);
  border: 1px solid rgba(30,45,85,0.6);
  border-radius: 12px;
  padding: 1rem;
  min-width: 0;
}
.kanban-col-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  font-size: 0.8rem;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.06em;
  color: var(--muted, #7b8bbf);
  margin-bottom: 0.85rem;
}
.kanban-count {
  background: rgba(0,229,255,0.12);
  color: var(--accent, #00e5ff);
  border-radius: 20px;
  padding: 0.1rem 0.5rem;
  font-size: 0.75rem;
}
.kanban-cards { display: flex; flex-direction: column; gap: 0.5rem; }
.kanban-card {
  background: rgba(15,22,41,0.8);
  border: 1px solid rgba(30,45,85,0.8);
  border-radius: 8px;
  padding: 0.7rem 0.85rem;
  font-size: 0.85rem;
  cursor: grab;
  transition: transform 0.15s, box-shadow 0.15s, border-color 0.15s;
}
.kanban-card:hover { transform: translateY(-2px); border-color: rgba(0,229,255,0.3); box-shadow: 0 4px 16px rgba(0,0,0,0.3); }
.kanban-card.done { opacity: 0.5; text-decoration: line-through; }
.kanban-card.priority-high  { border-left: 3px solid var(--danger, #ff4d6d); }
.kanban-card.priority-medium { border-left: 3px solid var(--warn, #ff9800); }
.kanban-card.priority-low   { border-left: 3px solid var(--success, #00e5a0); }`,
  };
}

function buildMiniCharts(): FeatureSnippets {
  return {
    css: `.mini-chart { display: flex; align-items: flex-end; height: 40px; gap: 3px; padding: 4px 0 0; }
.mini-chart-bar {
  flex: 1;
  background: linear-gradient(to top, var(--accent, #00e5ff), var(--accent2, #7c4dff));
  border-radius: 3px 3px 0 0;
  min-width: 6px;
  opacity: 0.75;
  transition: opacity 0.2s, transform 0.2s;
}
.mini-chart-bar:hover { opacity: 1; transform: scaleY(1.05); transform-origin: bottom; }`,
    js: `document.querySelectorAll('.metric-card').forEach(function(card, i) {
  var values = [30,55,42,70,60,85,72][i % 7];
  var bars = [40,55,70,85,62,90,50,75];
  var chart = document.createElement('div');
  chart.className = 'mini-chart';
  bars.slice(0,6).forEach(function(h) {
    var bar = document.createElement('div');
    bar.className = 'mini-chart-bar';
    bar.style.height = h + '%';
    chart.appendChild(bar);
  });
  card.appendChild(chart);
});`,
  };
}

function buildTableFilters(): FeatureSnippets {
  return {
    html: `
  <!-- Table filter bar (Phase 29.1) -->
  <div class="filter-bar" id="phase29-filter-bar">
    <button class="filter-btn active" data-filter="all">All</button>
    <button class="filter-btn" data-filter="high">High</button>
    <button class="filter-btn" data-filter="medium">Medium</button>
    <button class="filter-btn" data-filter="low">Low</button>
  </div>`,
    css: `.filter-bar {
  display: flex;
  gap: 0.5rem;
  flex-wrap: wrap;
  margin-bottom: 1rem;
}
.filter-btn {
  padding: 0.32rem 0.85rem;
  border-radius: 20px;
  border: 1px solid rgba(30,45,85,0.8);
  background: transparent;
  color: var(--muted, #7b8bbf);
  cursor: pointer;
  font-size: 0.8rem;
  transition: background 0.15s, border-color 0.15s, color 0.15s;
}
.filter-btn:hover { border-color: var(--accent, #00e5ff); color: var(--text, #e0e8ff); }
.filter-btn.active {
  background: rgba(0,229,255,0.12);
  border-color: rgba(0,229,255,0.4);
  color: var(--accent, #00e5ff);
}`,
    js: `(function() {
  var filterBar = document.getElementById('phase29-filter-bar');
  if (!filterBar) return;
  filterBar.addEventListener('click', function(e) {
    var btn = e.target.closest('.filter-btn');
    if (!btn) return;
    document.querySelectorAll('.filter-btn').forEach(function(b) { b.classList.remove('active'); });
    btn.classList.add('active');
    var f = btn.dataset.filter;
    document.querySelectorAll('table tbody tr').forEach(function(row) {
      row.style.display = (f === 'all' || row.dataset.priority === f) ? '' : 'none';
    });
  });

  // Move filter bar before the first table found
  var firstTable = document.querySelector('table');
  if (firstTable && firstTable.parentNode) {
    firstTable.parentNode.insertBefore(filterBar, firstTable);
  }
}());`,
  };
}

function buildTeam(): FeatureSnippets {
  const members = [
    { initials: "AV", name: "Ana Vega",    role: "Product" },
    { initials: "ML", name: "Marc López",  role: "Frontend" },
    { initials: "SR", name: "Sara Ruiz",   role: "Backend" },
    { initials: "JM", name: "José Mora",   role: "Design" },
  ];
  const memberHTML = members.map((m) =>
    `      <div class="team-member">
        <div class="avatar">${m.initials}</div>
        <span class="member-name">${m.name}</span>
        <span class="member-role">${m.role}</span>
      </div>`
  ).join("\n");

  return {
    html: `
  <!-- Team panel (Phase 29.1) -->
  <div class="team-section" id="phase29-team">
    <h3 class="section-title" style="margin-bottom:1rem">Equipo</h3>
    <div class="avatar-grid">
${memberHTML}
    </div>
  </div>`,
    css: `.team-section { padding: 2rem; }
.avatar-grid { display: flex; gap: 1.75rem; flex-wrap: wrap; }
.team-member { display: flex; flex-direction: column; align-items: center; gap: 0.35rem; }
.avatar {
  width: 52px; height: 52px;
  border-radius: 50%;
  background: linear-gradient(135deg, var(--accent, #00e5ff), var(--accent2, #7c4dff));
  display: flex; align-items: center; justify-content: center;
  font-weight: 700; font-size: 1.05rem; color: #080c18;
  box-shadow: 0 0 0 3px rgba(0,229,255,0.15);
  transition: box-shadow 0.2s;
}
.avatar:hover { box-shadow: 0 0 0 4px rgba(0,229,255,0.35); }
.member-name { font-size: 0.8rem; font-weight: 600; color: var(--text, #e0e8ff); }
.member-role { font-size: 0.72rem; color: var(--muted, #7b8bbf); }`,
  };
}

function buildActivity(): FeatureSnippets {
  const items = [
    { icon: "✓", text: "Ana completó <b>Deploy to staging</b>",    time: "5m ago" },
    { icon: "↑", text: "Marc subió 3 archivos al repositorio",       time: "22m ago" },
    { icon: "◎", text: "Sara abrió issue #42: Login edge case",       time: "1h ago" },
    { icon: "✎", text: "José actualizó el diseño del dashboard",      time: "2h ago" },
    { icon: "★", text: "Sprint 4 marcado como completado",            time: "4h ago" },
  ];
  const itemsHTML = items.map((i) =>
    `      <li class="activity-item">
        <div class="activity-icon">${i.icon}</div>
        <span>${i.text}</span>
        <span class="activity-time">${i.time}</span>
      </li>`
  ).join("\n");

  return {
    html: `
  <!-- Activity feed (Phase 29.1) -->
  <div class="activity-section" id="phase29-activity">
    <h3 class="section-title" style="margin-bottom:1rem">Actividad reciente</h3>
    <ul class="activity-list">
${itemsHTML}
    </ul>
  </div>`,
    css: `.activity-section { padding: 2rem; }
.activity-list { list-style: none; padding: 0; }
.activity-item {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  padding: 0.65rem 0;
  border-bottom: 1px solid rgba(30,45,85,0.5);
  font-size: 0.87rem;
}
.activity-item:last-child { border-bottom: none; }
.activity-icon {
  width: 28px; height: 28px;
  border-radius: 50%;
  background: rgba(0,229,255,0.1);
  display: flex; align-items: center; justify-content: center;
  font-size: 0.75rem;
  flex-shrink: 0;
  color: var(--accent, #00e5ff);
}
.activity-time { margin-left: auto; font-size: 0.73rem; color: var(--muted, #7b8bbf); white-space: nowrap; }`,
  };
}

function buildNotifications(): FeatureSnippets {
  return {
    html: `
  <!-- Toast notifications (Phase 29.1) -->
  <div class="toast-container" id="phase29-toasts"></div>`,
    css: `.toast-container { position: fixed; top: 1.5rem; right: 1.5rem; z-index: 9999; display: flex; flex-direction: column; gap: 0.5rem; pointer-events: none; }
.toast {
  background: rgba(15,22,41,0.95);
  border: 1px solid rgba(0,229,255,0.25);
  border-radius: 10px;
  padding: 0.85rem 1.25rem;
  backdrop-filter: blur(16px);
  -webkit-backdrop-filter: blur(16px);
  font-size: 0.875rem;
  min-width: 240px;
  max-width: 320px;
  pointer-events: auto;
  animation: toastIn 0.3s ease both;
  box-shadow: 0 4px 20px rgba(0,0,0,0.4);
}
@keyframes toastIn { from { opacity: 0; transform: translateX(20px); } to { opacity: 1; transform: translateX(0); } }
@keyframes toastOut { from { opacity: 1; transform: translateX(0); } to { opacity: 0; transform: translateX(20px); } }`,
    js: `(function() {
  function showToast(msg, duration) {
    duration = duration || 3500;
    var container = document.getElementById('phase29-toasts');
    if (!container) return;
    var toast = document.createElement('div');
    toast.className = 'toast';
    toast.textContent = msg;
    container.appendChild(toast);
    setTimeout(function() {
      toast.style.animation = 'toastOut 0.3s ease forwards';
      setTimeout(function() { if (toast.parentNode) toast.parentNode.removeChild(toast); }, 300);
    }, duration);
  }

  // Show welcome toast once on login
  var loginBtn = document.getElementById('login-btn');
  if (loginBtn) {
    loginBtn.addEventListener('click', function() {
      setTimeout(function() { showToast('Bienvenido al sistema \uD83D\uDC4B'); }, 600);
      setTimeout(function() { showToast('Tienes 3 tareas pendientes'); }, 1800);
    }, { once: true });
  }

  window.showToast = showToast;
}());`,
  };
}

function buildAnalytics(): FeatureSnippets {
  return {
    html: `
  <!-- Analytics panel (Phase 29.1) -->
  <div class="analytics-section" id="phase29-analytics">
    <h3 class="section-title" style="margin-bottom:1rem">Analytics</h3>
    <div class="analytics-cards">
      <div class="analytics-card">
        <div class="analytics-value" id="analytics-done">12</div>
        <div class="analytics-label">Tareas completadas esta semana</div>
      </div>
      <div class="analytics-card">
        <div class="analytics-value">2.4d</div>
        <div class="analytics-label">Tiempo promedio de resolución</div>
      </div>
      <div class="analytics-card">
        <div class="analytics-value" style="color: var(--success, #00e5a0)">↑ 18%</div>
        <div class="analytics-label">Velocidad del equipo vs semana anterior</div>
      </div>
    </div>
  </div>`,
    css: `.analytics-section { padding: 2rem; }
.analytics-cards {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(160px, 1fr));
  gap: 1rem;
}
.analytics-card {
  background: rgba(15,22,41,0.8);
  border: 1px solid rgba(30,45,85,0.7);
  border-radius: 12px;
  padding: 1.5rem 1.25rem;
  text-align: center;
  transition: border-color 0.2s, box-shadow 0.2s;
}
.analytics-card:hover { border-color: rgba(0,229,255,0.3); box-shadow: 0 0 20px rgba(0,229,255,0.08); }
.analytics-value { font-size: 2rem; font-weight: 700; color: var(--accent, #00e5ff); line-height: 1; }
.analytics-label { font-size: 0.78rem; color: var(--muted, #7b8bbf); margin-top: 0.5rem; line-height: 1.3; }`,
  };
}

function buildPremiumStyle(): FeatureSnippets {
  return {
    css: `:root {
  --radius: 14px;
  --radius-sm: 8px;
}
body {
  font-family: 'Inter', 'Segoe UI', system-ui, -apple-system, sans-serif;
  -webkit-font-smoothing: antialiased;
  letter-spacing: -0.012em;
}
.login-box, .metric-card, .module-card, .analytics-card, .kanban-col {
  border-radius: var(--radius);
}
button, .filter-btn, .badge {
  border-radius: var(--radius-sm);
}
.sidebar {
  border-right-width: 1px;
  background: linear-gradient(180deg, rgba(15,22,41,1) 0%, rgba(9,14,28,1) 100%);
}
.sidebar-brand {
  font-size: 1rem;
  letter-spacing: -0.02em;
}
.nav-item {
  font-size: 0.875rem;
  font-weight: 500;
  letter-spacing: -0.01em;
  border-radius: var(--radius-sm);
}
.content-header {
  padding: 1rem 2rem;
}
.view-section {
  padding: 1.5rem 2rem;
}
.metric-num, .analytics-value {
  letter-spacing: -0.03em;
}
.data-table {
  font-size: 0.875rem;
}
.data-table td, .data-table th {
  padding: 0.7rem 1rem;
}`,
  };
}

function buildSmoothTransitions(): FeatureSnippets {
  return {
    css: `button, .nav-item, .module-card, .filter-btn, .kanban-card, input, .metric-card {
  transition: background 0.18s ease, color 0.15s ease, border-color 0.18s ease,
              box-shadow 0.2s ease, transform 0.15s ease, opacity 0.15s ease;
}
.view-section:not(.hidden) {
  animation: viewEnter 0.3s ease both;
}
@keyframes viewEnter {
  from { opacity: 0; transform: translateY(6px); }
  to   { opacity: 1; transform: translateY(0); }
}
.sidebar-nav .nav-item.active::before {
  content: '';
  display: inline-block;
  width: 3px;
  height: 1em;
  background: var(--accent, #00e5ff);
  border-radius: 2px;
  margin-right: 0.5rem;
  vertical-align: middle;
}`,
  };
}

function buildSkeleton(): FeatureSnippets {
  return {
    css: `@keyframes shimmer {
  0%   { background-position: -600px 0; }
  100% { background-position:  600px 0; }
}
.skeleton {
  background: linear-gradient(
    90deg,
    rgba(255,255,255,0.04) 25%,
    rgba(255,255,255,0.1)  50%,
    rgba(255,255,255,0.04) 75%
  );
  background-size: 1200px 100%;
  animation: shimmer 1.5s infinite linear;
  border-radius: 6px;
  color: transparent !important;
  pointer-events: none;
  user-select: none;
}
.skeleton-text   { height: 14px; margin-bottom: 8px; }
.skeleton-title  { height: 22px; width: 60%; margin-bottom: 12px; }
.skeleton-avatar { width: 40px; height: 40px; border-radius: 50%; }
.skeleton-card   { height: 80px; border-radius: 12px; }
.skeleton-row    { height: 42px; margin-bottom: 4px; }`,
  };
}

function buildEmptyStates(): FeatureSnippets {
  return {
    css: `.empty-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 3rem 1rem;
  opacity: 0.5;
  gap: 0.5rem;
  text-align: center;
}
.empty-state-icon { font-size: 2.5rem; }
.empty-state-text { font-size: 0.88rem; color: var(--muted, #7b8bbf); }`,
    js: `document.querySelectorAll('table tbody').forEach(function(tbody) {
  if (tbody.rows.length === 0) {
    var tr = document.createElement('tr');
    var td = document.createElement('td');
    td.colSpan = 99;
    td.innerHTML = '<div class="empty-state"><div class="empty-state-icon">&#128235;</div><div class="empty-state-text">No hay datos para mostrar</div></div>';
    tr.appendChild(td);
    tbody.appendChild(tr);
  }
});`,
  };
}

function buildComments(): FeatureSnippets {
  return {
    html: `
  <!-- Comments section (Phase 29.1) -->
  <div class="comments-section" id="phase29-comments">
    <h3 class="section-title" style="margin-bottom:1rem">Comentarios</h3>
    <div class="comment-input-row">
      <input type="text" class="comment-input" id="phase29-comment-input" placeholder="Escribe un comentario…">
      <button class="filter-btn" id="phase29-comment-submit">Enviar</button>
    </div>
    <ul class="comment-list" id="phase29-comment-list">
      <li class="comment-item"><span class="comment-avatar">AV</span><span>Task looks good, let's ship it.</span><span class="activity-time">2h ago</span></li>
      <li class="comment-item"><span class="comment-avatar">ML</span><span>Added unit tests for this flow.</span><span class="activity-time">5h ago</span></li>
    </ul>
  </div>`,
    css: `.comments-section { padding: 2rem; }
.comment-input-row { display: flex; gap: 0.5rem; margin-bottom: 1rem; }
.comment-input {
  flex: 1;
  padding: 0.5rem 0.9rem;
  background: rgba(15,22,41,0.8);
  border: 1px solid rgba(30,45,85,0.8);
  border-radius: 8px;
  color: var(--text, #e0e8ff);
  font-size: 0.88rem;
  transition: border-color 0.2s;
}
.comment-input:focus { outline: none; border-color: var(--accent, #00e5ff); }
.comment-input::placeholder { color: var(--muted, #7b8bbf); }
.comment-list { list-style: none; padding: 0; }
.comment-item {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  padding: 0.6rem 0;
  border-bottom: 1px solid rgba(30,45,85,0.4);
  font-size: 0.87rem;
}
.comment-item:last-child { border-bottom: none; }
.comment-avatar {
  width: 28px; height: 28px;
  border-radius: 50%;
  background: linear-gradient(135deg, var(--accent, #00e5ff), var(--accent2, #7c4dff));
  display: flex; align-items: center; justify-content: center;
  font-size: 0.65rem; font-weight: 700; color: #080c18;
  flex-shrink: 0;
}`,
    js: `(function() {
  var input  = document.getElementById('phase29-comment-input');
  var submit = document.getElementById('phase29-comment-submit');
  var list   = document.getElementById('phase29-comment-list');
  if (!input || !submit || !list) return;
  submit.addEventListener('click', function() {
    var text = input.value.trim();
    if (!text) return;
    var li = document.createElement('li');
    li.className = 'comment-item';
    li.innerHTML = '<span class="comment-avatar">Me</span>'
      + '<span>' + text.replace(/</g, '&lt;') + '</span>'
      + '<span class="activity-time">ahora</span>';
    list.insertBefore(li, list.firstChild);
    input.value = '';
  });
  input.addEventListener('keydown', function(e) { if (e.key === 'Enter') submit.click(); });
}());`,
  };
}

function buildGlassmorphism(): FeatureSnippets {
  return {
    css: `/* Phase 29.1: glassmorphism — deeper glass and glow effects */
.metric-card, .module-card, .login-box, .analytics-card, .kanban-col {
  background: rgba(10, 16, 35, 0.65);
  backdrop-filter: blur(20px) saturate(160%);
  -webkit-backdrop-filter: blur(20px) saturate(160%);
  border: 1px solid rgba(0, 229, 255, 0.12);
  box-shadow: 0 8px 32px rgba(0, 0, 0, 0.45), inset 0 1px 0 rgba(255,255,255,0.06);
}
.metric-card:hover, .module-card:hover {
  border-color: rgba(0, 229, 255, 0.28);
  box-shadow: 0 8px 32px rgba(0,0,0,0.5), 0 0 20px rgba(0,229,255,0.10), inset 0 1px 0 rgba(255,255,255,0.08);
}
.content-topbar, header, .topbar {
  backdrop-filter: blur(28px) saturate(180%);
  -webkit-backdrop-filter: blur(28px) saturate(180%);
  background: rgba(8, 12, 24, 0.72);
  border-bottom: 1px solid rgba(0, 229, 255, 0.08);
  position: sticky;
  top: 0;
  z-index: 100;
}
.metric-num, .kpi-value {
  text-shadow: 0 0 18px rgba(0, 229, 255, 0.45);
}
.btn-primary, button[type="submit"], .action-btn {
  box-shadow: 0 0 14px rgba(0, 229, 255, 0.25);
}
.btn-primary:hover, button[type="submit"]:hover, .action-btn:hover {
  box-shadow: 0 0 22px rgba(0, 229, 255, 0.45);
}
.nav-item.active, .sidebar-nav .active {
  background: rgba(0, 229, 255, 0.10);
  box-shadow: inset 3px 0 0 var(--accent, #00e5ff);
}`,
  };
}

function buildSidebarMinimal(): FeatureSnippets {
  return {
    css: `/* Phase 29.1: sidebar-minimal — clean, spacious sidebar */
.sidebar {
  width: 220px;
  min-width: 220px;
  padding: 1.5rem 0.75rem;
  gap: 0.25rem;
  background: linear-gradient(180deg, rgba(9,13,26,1) 0%, rgba(6,9,18,1) 100%);
  border-right: 1px solid rgba(255,255,255,0.05);
}
.sidebar-brand {
  font-size: 0.95rem;
  font-weight: 700;
  letter-spacing: -0.025em;
  padding: 0.5rem 0.75rem 1.5rem;
  opacity: 0.92;
}
.nav-item {
  padding: 0.5rem 0.75rem;
  border-radius: 7px;
  font-size: 0.85rem;
  font-weight: 500;
  letter-spacing: -0.01em;
  color: rgba(224, 232, 255, 0.6);
  display: flex;
  align-items: center;
  gap: 0.6rem;
  transition: background 0.15s, color 0.15s;
}
.nav-item:hover {
  background: rgba(255,255,255,0.05);
  color: rgba(224, 232, 255, 0.9);
}
.nav-item.active {
  background: rgba(0,229,255,0.08);
  color: #e0e8ff;
}
.sidebar-section-label {
  font-size: 0.7rem;
  font-weight: 600;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: rgba(123,139,191,0.5);
  padding: 1rem 0.75rem 0.35rem;
}`,
  };
}

// ---------------------------------------------------------------------------
// Feature builder registry
// ---------------------------------------------------------------------------

type FeatureBuilder = () => FeatureSnippets;

const FEATURE_BUILDERS = new Map<string, FeatureBuilder>([
  ["kanban",             buildKanban],
  ["mini-charts",        buildMiniCharts],
  ["table-filters",      buildTableFilters],
  ["team",               buildTeam],
  ["activity",           buildActivity],
  ["notifications",      buildNotifications],
  ["analytics",          buildAnalytics],
  ["premium-style",      buildPremiumStyle],
  ["smooth-transitions", buildSmoothTransitions],
  ["skeleton",           buildSkeleton],
  ["empty-states",       buildEmptyStates],
  ["comments",           buildComments],
  ["glassmorphism",      buildGlassmorphism],
  ["sidebar-minimal",    buildSidebarMinimal],
]);

// ---------------------------------------------------------------------------
// Main export
// ---------------------------------------------------------------------------

/**
 * Applies evolution features to an existing web project.
 * Reads index.html, styles.css, script.js from projectPath,
 * appends snippets for each feature (guarded by comment markers),
 * and writes only the files that actually changed.
 */
export function applyEvolutionFeatures(
  projectPath: string,
  features: string[]
): EvolutionResult {
  const result: EvolutionResult = { appliedFeatures: [], filesChanged: [], skipped: [] };
  if (features.length === 0) return result;

  const htmlPath = path.join(projectPath, "index.html");
  const cssPath  = path.join(projectPath, "styles.css");
  const jsPath   = path.join(projectPath, "script.js");

  let html = fs.existsSync(htmlPath) ? fs.readFileSync(htmlPath, "utf-8") : "";
  let css  = fs.existsSync(cssPath)  ? fs.readFileSync(cssPath,  "utf-8") : "";
  let js   = fs.existsSync(jsPath)   ? fs.readFileSync(jsPath,   "utf-8") : "";

  let htmlDirty = false;
  let cssDirty  = false;
  let jsDirty   = false;

  for (const feature of features) {
    const builder = FEATURE_BUILDERS.get(feature);
    if (!builder) {
      result.skipped.push(`${feature} (no builder)`);
      continue;
    }

    const marker = `Phase 29.1: ${feature}`;

    // Check guard in each target — skip feature entirely if already in all applicable files
    const snippets = builder();
    const needsCSS  = !!snippets.css;
    const needsHTML = !!snippets.html;
    const needsJS   = !!snippets.js;

    const hasCSS  = !needsCSS  || css.includes(marker);
    const hasHTML = !needsHTML || html.includes(marker);
    const hasJS   = !needsJS   || js.includes(marker);

    if (hasCSS && hasHTML && hasJS) {
      result.skipped.push(feature);
      continue;
    }

    let applied = false;

    if (needsCSS && !css.includes(marker)) {
      css += `\n/* ${marker} */\n${snippets.css}\n`;
      cssDirty = true;
      applied = true;
    }
    if (needsHTML && !html.includes(marker) && html.includes("</body>")) {
      html = html.replace("</body>", `<!-- ${marker} -->\n${snippets.html}\n</body>`);
      htmlDirty = true;
      applied = true;
    }
    if (needsJS && !js.includes(marker)) {
      js += `\n/* ${marker} */\nsetTimeout(function() {\n${snippets.js}\n}, 0);\n`;
      jsDirty = true;
      applied = true;
    }

    if (applied) result.appliedFeatures.push(feature);
    else result.skipped.push(feature);
  }

  if (cssDirty && fs.existsSync(cssPath)) {
    fs.writeFileSync(cssPath, css, "utf-8");
    result.filesChanged.push("styles.css");
  }
  if (htmlDirty && fs.existsSync(htmlPath)) {
    fs.writeFileSync(htmlPath, html, "utf-8");
    result.filesChanged.push("index.html");
  }
  if (jsDirty && fs.existsSync(jsPath)) {
    fs.writeFileSync(jsPath, js, "utf-8");
    result.filesChanged.push("script.js");
  }

  return result;
}
