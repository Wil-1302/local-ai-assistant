/**
 * view-completion-builders.ts — Phase 29.2 / 29.3
 *
 * Phase 29.2: view builders (my-tasks, projects, priorities, filters, cohesion).
 * Phase 29.3: SaaS shell engine (sidebar + navigateTo + view routing),
 *             forceReapply support, sentinel-based view injection.
 */

import fs from "fs";
import path from "path";
import type { ViewKey } from "./detect-planning-intent.js";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Marker written into index.html when the SaaS shell is installed. */
const SHELL_MARKER = "Phase 29.3: SaaS shell";

/** Sentinel comment inside <main id="main-content"> where views are injected. */
const VIEW_INJECT_SENTINEL = "<!-- phase29-views -->";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface ViewSnippets {
  html?: string;
  css?: string;
  js?: string;
}

export interface ViewCompletionResult {
  appliedViews: string[];
  filesChanged: string[];
  skipped: string[];
  /** True when the SaaS shell was rebuilt during this run. */
  shellRebuilt?: boolean;
}

// ---------------------------------------------------------------------------
// View builders
// ---------------------------------------------------------------------------

function buildMyTasks(): ViewSnippets {
  return {
    html: `
  <!-- My Tasks view (Phase 29.2) -->
  <div class="view-section hidden" id="view-my-tasks" data-view="my-tasks">
    <div class="content-header">
      <h2 class="view-title">My Tasks</h2>
      <button class="btn-primary" id="mt-add-btn">+ New Task</button>
    </div>

    <div class="mt-toolbar">
      <input type="text" id="mt-search" class="mt-search-input" placeholder="Search tasks…">
      <div class="mt-filter-group">
        <select id="mt-priority-filter" class="mt-select">
          <option value="">All priorities</option>
          <option value="high">High</option>
          <option value="medium">Medium</option>
          <option value="low">Low</option>
        </select>
        <select id="mt-status-filter" class="mt-select">
          <option value="">All statuses</option>
          <option value="todo">To Do</option>
          <option value="in-progress">In Progress</option>
          <option value="done">Done</option>
        </select>
      </div>
    </div>

    <div class="mt-table-wrap">
      <table class="data-table" id="mt-table">
        <thead>
          <tr>
            <th style="width:2rem"></th>
            <th>Task</th>
            <th>Priority</th>
            <th>Status</th>
            <th>Due</th>
            <th>Actions</th>
          </tr>
        </thead>
        <tbody id="mt-tbody"></tbody>
      </table>
      <div class="empty-state hidden" id="mt-empty">
        <div class="empty-state-icon">📋</div>
        <div class="empty-state-text">No tasks match your filters</div>
      </div>
    </div>
  </div>`,

    css: `/* Phase 29.2: my-tasks */
.mt-toolbar {
  display: flex;
  gap: 0.75rem;
  align-items: center;
  flex-wrap: wrap;
  margin-bottom: 1.25rem;
  padding: 0 2rem;
}
.mt-search-input {
  flex: 1;
  min-width: 200px;
  padding: 0.45rem 0.85rem;
  background: rgba(15,22,41,0.8);
  border: 1px solid rgba(30,45,85,0.8);
  border-radius: 8px;
  color: var(--text, #e0e8ff);
  font-size: 0.875rem;
  transition: border-color 0.2s;
}
.mt-search-input:focus { outline: none; border-color: var(--accent, #00e5ff); }
.mt-search-input::placeholder { color: var(--muted, #7b8bbf); }
.mt-filter-group { display: flex; gap: 0.5rem; }
.mt-select {
  padding: 0.42rem 0.75rem;
  background: rgba(15,22,41,0.8);
  border: 1px solid rgba(30,45,85,0.8);
  border-radius: 8px;
  color: var(--text, #e0e8ff);
  font-size: 0.8rem;
  cursor: pointer;
}
.mt-select:focus { outline: none; border-color: var(--accent, #00e5ff); }
.mt-table-wrap { padding: 0 2rem 2rem; overflow-x: auto; }
.badge {
  display: inline-flex; align-items: center;
  padding: 0.2rem 0.6rem;
  border-radius: 20px;
  font-size: 0.72rem;
  font-weight: 600;
  letter-spacing: 0.02em;
}
.badge-high   { background: rgba(255,77,109,0.15); color: #ff4d6d; border: 1px solid rgba(255,77,109,0.25); }
.badge-medium { background: rgba(255,152,0,0.15);  color: #ff9800; border: 1px solid rgba(255,152,0,0.25); }
.badge-low    { background: rgba(0,229,160,0.12);  color: #00e5a0; border: 1px solid rgba(0,229,160,0.2); }
.badge-todo        { background: rgba(123,139,191,0.15); color: #7b8bbf; border: 1px solid rgba(123,139,191,0.2); }
.badge-in-progress { background: rgba(0,229,255,0.12);  color: var(--accent,#00e5ff); border: 1px solid rgba(0,229,255,0.2); }
.badge-done        { background: rgba(0,229,160,0.12);  color: #00e5a0; border: 1px solid rgba(0,229,160,0.2); }
.mt-check-btn {
  background: none;
  border: 1px solid rgba(30,45,85,0.8);
  border-radius: 5px;
  width: 20px; height: 20px;
  cursor: pointer;
  display: flex; align-items: center; justify-content: center;
  color: var(--muted, #7b8bbf);
  transition: all 0.15s;
}
.mt-check-btn:hover { border-color: var(--accent,#00e5ff); color: var(--accent,#00e5ff); }
.mt-row-done td { opacity: 0.45; text-decoration: line-through; }`,

    js: `(function() {
  var TASKS = [
    { id:1, name:"Design onboarding flow",    priority:"high",   status:"in-progress", due:"2026-04-10" },
    { id:2, name:"Write API documentation",   priority:"medium", status:"todo",        due:"2026-04-14" },
    { id:3, name:"Fix login edge case #42",   priority:"high",   status:"todo",        due:"2026-04-08" },
    { id:4, name:"Deploy to staging",         priority:"medium", status:"done",        due:"2026-04-05" },
    { id:5, name:"Update favicon",            priority:"low",    status:"todo",        due:"2026-04-20" },
    { id:6, name:"Integrate metrics API",     priority:"high",   status:"in-progress", due:"2026-04-12" },
    { id:7, name:"Code review sprint 4",      priority:"medium", status:"done",        due:"2026-04-03" },
  ];

  function renderTasks() {
    var tbody = document.getElementById('mt-tbody');
    var empty = document.getElementById('mt-empty');
    var search = (document.getElementById('mt-search').value||'').toLowerCase();
    var pf = document.getElementById('mt-priority-filter').value;
    var sf = document.getElementById('mt-status-filter').value;
    if (!tbody) return;

    var visible = TASKS.filter(function(t) {
      if (search && !t.name.toLowerCase().includes(search)) return false;
      if (pf && t.priority !== pf) return false;
      if (sf && t.status !== sf) return false;
      return true;
    });

    tbody.innerHTML = '';
    if (visible.length === 0) {
      if (empty) empty.classList.remove('hidden');
      return;
    }
    if (empty) empty.classList.add('hidden');

    visible.forEach(function(t) {
      var tr = document.createElement('tr');
      tr.dataset.id = t.id;
      if (t.status === 'done') tr.classList.add('mt-row-done');
      tr.innerHTML =
        '<td><button class="mt-check-btn" data-id="'+t.id+'">'+(t.status==='done'?'✓':'')+'</button></td>' +
        '<td>'+t.name+'</td>' +
        '<td><span class="badge badge-'+t.priority+'">'+t.priority+'</span></td>' +
        '<td><span class="badge badge-'+t.status+'">'+t.status.replace('-',' ')+'</span></td>' +
        '<td style="color:var(--muted,#7b8bbf);font-size:0.8rem">'+t.due+'</td>' +
        '<td><button class="link-btn" style="font-size:0.8rem;color:var(--accent,#00e5ff);background:none;border:none;cursor:pointer" data-id="'+t.id+'">Edit</button></td>';
      tbody.appendChild(tr);
    });

    tbody.querySelectorAll('.mt-check-btn').forEach(function(btn) {
      btn.addEventListener('click', function() {
        var id = parseInt(this.dataset.id);
        var task = TASKS.find(function(t){return t.id===id;});
        if (!task) return;
        task.status = task.status === 'done' ? 'todo' : 'done';
        renderTasks();
      });
    });
  }

  var searchEl = document.getElementById('mt-search');
  var pfEl = document.getElementById('mt-priority-filter');
  var sfEl = document.getElementById('mt-status-filter');
  if (searchEl) searchEl.addEventListener('input', renderTasks);
  if (pfEl) pfEl.addEventListener('change', renderTasks);
  if (sfEl) sfEl.addEventListener('change', renderTasks);

  // Hook into nav to render when switching to this view
  document.querySelectorAll('[data-target="my-tasks"],[href="#my-tasks"]').forEach(function(el) {
    el.addEventListener('click', function() { setTimeout(renderTasks, 50); });
  });

  renderTasks();
  window._mtRender = renderTasks;
}());`,
  };
}

function buildProjects(): ViewSnippets {
  return {
    html: `
  <!-- Projects view (Phase 29.2) -->
  <div class="view-section hidden" id="view-projects" data-view="projects">
    <div class="content-header">
      <h2 class="view-title">Projects</h2>
      <button class="btn-primary">+ New Project</button>
    </div>

    <div class="projects-grid" id="proj-grid">
      <!-- cards rendered by JS -->
    </div>

    <!-- Project detail modal -->
    <div class="proj-modal-overlay hidden" id="proj-modal-overlay">
      <div class="proj-modal" id="proj-modal">
        <button class="proj-modal-close" id="proj-modal-close">✕</button>
        <h3 class="proj-modal-title" id="proj-modal-title"></h3>
        <p class="proj-modal-desc" id="proj-modal-desc"></p>
        <div class="proj-modal-meta" id="proj-modal-meta"></div>
        <div class="proj-progress-bar-wrap">
          <div class="proj-progress-bar" id="proj-modal-bar"></div>
        </div>
      </div>
    </div>
  </div>`,

    css: `/* Phase 29.2: projects */
.projects-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
  gap: 1.25rem;
  padding: 0 2rem 2rem;
}
.proj-card {
  background: rgba(15,22,41,0.75);
  border: 1px solid rgba(30,45,85,0.7);
  border-radius: 14px;
  padding: 1.5rem;
  cursor: pointer;
  transition: border-color 0.2s, box-shadow 0.2s, transform 0.15s;
}
.proj-card:hover {
  border-color: rgba(0,229,255,0.25);
  box-shadow: 0 4px 24px rgba(0,0,0,0.3), 0 0 12px rgba(0,229,255,0.06);
  transform: translateY(-2px);
}
.proj-card-header { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 0.75rem; }
.proj-card-name { font-size: 1rem; font-weight: 600; color: var(--text,#e0e8ff); }
.proj-card-meta { font-size: 0.78rem; color: var(--muted,#7b8bbf); margin-bottom: 1rem; display: flex; gap: 0.85rem; }
.proj-progress-label { display: flex; justify-content: space-between; font-size: 0.75rem; color: var(--muted,#7b8bbf); margin-bottom: 0.35rem; }
.proj-progress-track {
  height: 5px;
  background: rgba(255,255,255,0.07);
  border-radius: 4px;
  overflow: hidden;
}
.proj-progress-fill {
  height: 100%;
  background: linear-gradient(90deg, var(--accent,#00e5ff), var(--accent2,#7c4dff));
  border-radius: 4px;
  transition: width 0.4s ease;
}
.proj-modal-overlay {
  position: fixed; inset: 0;
  background: rgba(0,0,0,0.55);
  backdrop-filter: blur(6px);
  z-index: 500;
  display: flex; align-items: center; justify-content: center;
}
.proj-modal-overlay.hidden { display: none; }
.proj-modal {
  background: rgba(14,20,38,0.97);
  border: 1px solid rgba(0,229,255,0.18);
  border-radius: 16px;
  padding: 2rem 2.25rem;
  max-width: 480px;
  width: calc(100% - 2rem);
  position: relative;
  animation: viewEnter 0.25s ease both;
}
.proj-modal-close {
  position: absolute; top: 1rem; right: 1rem;
  background: none; border: none; color: var(--muted,#7b8bbf);
  font-size: 1rem; cursor: pointer;
}
.proj-modal-title { font-size: 1.2rem; font-weight: 700; margin-bottom: 0.5rem; }
.proj-modal-desc { font-size: 0.875rem; color: var(--muted,#7b8bbf); margin-bottom: 1rem; }
.proj-modal-meta { font-size: 0.8rem; color: var(--muted,#7b8bbf); margin-bottom: 1rem; display: flex; gap: 1rem; }
.proj-progress-bar-wrap { height: 6px; background: rgba(255,255,255,0.07); border-radius: 4px; overflow: hidden; }
.proj-progress-bar { height: 100%; background: linear-gradient(90deg,var(--accent,#00e5ff),var(--accent2,#7c4dff)); border-radius:4px; transition: width 0.4s; }`,

    js: `(function() {
  var PROJECTS = [
    { id:1, name:"Platform Redesign",   owner:"Ana Vega",   due:"2026-05-01", progress:72, desc:"Full UI overhaul for the SaaS platform with new design system." },
    { id:2, name:"API v2 Migration",    owner:"Marc López",  due:"2026-04-20", progress:45, desc:"Migrate REST endpoints to v2 schema with backward compatibility." },
    { id:3, name:"Mobile App MVP",      owner:"Sara Ruiz",   due:"2026-06-15", progress:18, desc:"First native app milestone: auth, dashboard, notifications." },
    { id:4, name:"Analytics Dashboard", owner:"José Mora",   due:"2026-04-30", progress:90, desc:"Real-time analytics with chart.js integration and export." },
    { id:5, name:"Onboarding Flow",     owner:"Ana Vega",   due:"2026-05-10", progress:55, desc:"Step-by-step onboarding wizard for new enterprise customers." },
    { id:6, name:"Billing Module",      owner:"Marc López",  due:"2026-05-28", progress:30, desc:"Stripe integration: plans, invoices, usage-based billing." },
  ];

  var grid = document.getElementById('proj-grid');
  if (!grid) return;

  grid.innerHTML = PROJECTS.map(function(p) {
    return '<div class="proj-card" data-id="'+p.id+'">'
      + '<div class="proj-card-header"><span class="proj-card-name">'+p.name+'</span>'
      + '<span class="badge badge-'+(p.progress>=75?'done':p.progress>=40?'in-progress':'todo')+'">'
      + (p.progress>=75?'On track':p.progress>=40?'In progress':'Early')+'</span></div>'
      + '<div class="proj-card-meta"><span>👤 '+p.owner+'</span><span>📅 '+p.due+'</span></div>'
      + '<div class="proj-progress-label"><span>Progress</span><span>'+p.progress+'%</span></div>'
      + '<div class="proj-progress-track"><div class="proj-progress-fill" style="width:'+p.progress+'%"></div></div>'
      + '</div>';
  }).join('');

  var overlay = document.getElementById('proj-modal-overlay');
  var closeBtn = document.getElementById('proj-modal-close');
  if (overlay && closeBtn) {
    grid.addEventListener('click', function(e) {
      var card = e.target.closest('.proj-card');
      if (!card) return;
      var p = PROJECTS.find(function(x){return x.id===parseInt(card.dataset.id);});
      if (!p) return;
      document.getElementById('proj-modal-title').textContent = p.name;
      document.getElementById('proj-modal-desc').textContent  = p.desc;
      document.getElementById('proj-modal-meta').innerHTML = '<span>👤 '+p.owner+'</span><span>📅 '+p.due+'</span>';
      document.getElementById('proj-modal-bar').style.width = p.progress+'%';
      overlay.classList.remove('hidden');
    });
    closeBtn.addEventListener('click', function() { overlay.classList.add('hidden'); });
    overlay.addEventListener('click', function(e) { if (e.target===overlay) overlay.classList.add('hidden'); });
  }
}());`,
  };
}

function buildPriorities(): ViewSnippets {
  return {
    html: `
  <!-- Priorities view (Phase 29.2) -->
  <div class="view-section hidden" id="view-priorities" data-view="priorities">
    <div class="content-header">
      <h2 class="view-title">Priorities</h2>
    </div>
    <div class="priorities-board">
      <div class="priority-col" id="pri-high-col">
        <div class="priority-col-header high">
          <span class="priority-dot high"></span>High
          <span class="priority-count" id="pri-high-count">0</span>
        </div>
        <div class="priority-items" id="pri-high-items"></div>
      </div>
      <div class="priority-col" id="pri-medium-col">
        <div class="priority-col-header medium">
          <span class="priority-dot medium"></span>Medium
          <span class="priority-count" id="pri-medium-count">0</span>
        </div>
        <div class="priority-items" id="pri-medium-items"></div>
      </div>
      <div class="priority-col" id="pri-low-col">
        <div class="priority-col-header low">
          <span class="priority-dot low"></span>Low
          <span class="priority-count" id="pri-low-count">0</span>
        </div>
        <div class="priority-items" id="pri-low-items"></div>
      </div>
    </div>
  </div>`,

    css: `/* Phase 29.2: priorities */
.priorities-board { display: flex; gap: 1rem; padding: 0 2rem 2rem; align-items: flex-start; }
.priority-col {
  flex: 1;
  background: rgba(15,22,41,0.5);
  border: 1px solid rgba(30,45,85,0.6);
  border-radius: 12px;
  padding: 0.85rem;
  min-width: 0;
}
.priority-col-header {
  display: flex; align-items: center; gap: 0.5rem;
  font-size: 0.8rem; font-weight: 600;
  text-transform: uppercase; letter-spacing: 0.06em;
  margin-bottom: 0.85rem;
  color: var(--muted,#7b8bbf);
}
.priority-dot {
  width: 8px; height: 8px; border-radius: 50%; flex-shrink: 0;
}
.priority-dot.high   { background: #ff4d6d; box-shadow: 0 0 6px rgba(255,77,109,0.6); }
.priority-dot.medium { background: #ff9800; box-shadow: 0 0 6px rgba(255,152,0,0.5); }
.priority-dot.low    { background: #00e5a0; box-shadow: 0 0 6px rgba(0,229,160,0.4); }
.priority-count {
  margin-left: auto;
  background: rgba(0,229,255,0.1);
  color: var(--accent,#00e5ff);
  border-radius: 20px;
  padding: 0.1rem 0.45rem;
  font-size: 0.72rem;
}
.priority-items { display: flex; flex-direction: column; gap: 0.5rem; }
.priority-item {
  background: rgba(10,16,32,0.8);
  border: 1px solid rgba(30,45,85,0.7);
  border-radius: 8px;
  padding: 0.7rem 0.85rem;
  font-size: 0.85rem;
  cursor: pointer;
  transition: border-color 0.15s, transform 0.15s;
}
.priority-item:hover { border-color: rgba(0,229,255,0.2); transform: translateY(-1px); }
.priority-item-title { color: var(--text,#e0e8ff); margin-bottom: 0.25rem; }
.priority-item-meta  { font-size: 0.72rem; color: var(--muted,#7b8bbf); }`,

    js: `(function() {
  var PRI_TASKS = [
    { name:"Fix critical auth bug",    priority:"high",   owner:"Sara Ruiz",  due:"Today" },
    { name:"Design onboarding flow",   priority:"high",   owner:"Ana Vega",   due:"Apr 10" },
    { name:"Integrate metrics API",    priority:"high",   owner:"Marc López",  due:"Apr 12" },
    { name:"Write API docs",           priority:"medium", owner:"Marc López",  due:"Apr 14" },
    { name:"Deploy to staging",        priority:"medium", owner:"Sara Ruiz",  due:"Apr 15" },
    { name:"Code review sprint 4",     priority:"medium", owner:"José Mora",  due:"Apr 16" },
    { name:"Update favicon",           priority:"low",    owner:"Ana Vega",   due:"Apr 20" },
    { name:"Archive old test data",    priority:"low",    owner:"José Mora",  due:"Apr 22" },
    { name:"Lighthouse audit",         priority:"low",    owner:"Marc López",  due:"Apr 25" },
  ];

  ["high","medium","low"].forEach(function(p) {
    var container = document.getElementById('pri-'+p+'-items');
    var countEl   = document.getElementById('pri-'+p+'-count');
    if (!container) return;
    var tasks = PRI_TASKS.filter(function(t){return t.priority===p;});
    if (countEl) countEl.textContent = tasks.length;
    container.innerHTML = tasks.map(function(t){
      return '<div class="priority-item"><div class="priority-item-title">'+t.name+'</div>'
           + '<div class="priority-item-meta">'+t.owner+' · '+t.due+'</div></div>';
    }).join('');
  });
}());`,
  };
}

function buildFilters(): ViewSnippets {
  return {
    html: `
  <!-- Filters view (Phase 29.2) -->
  <div class="view-section hidden" id="view-filters" data-view="filters">
    <div class="content-header">
      <h2 class="view-title">Filters</h2>
      <button class="btn-secondary" id="flt-clear-btn">Clear all</button>
    </div>

    <div class="flt-panel">
      <div class="flt-group">
        <div class="flt-group-label">Priority</div>
        <div class="flt-chips" data-group="priority">
          <button class="flt-chip active" data-value="all">All</button>
          <button class="flt-chip high" data-value="high">🔴 High</button>
          <button class="flt-chip medium" data-value="medium">🟡 Medium</button>
          <button class="flt-chip low" data-value="low">🟢 Low</button>
        </div>
      </div>
      <div class="flt-group">
        <div class="flt-group-label">Status</div>
        <div class="flt-chips" data-group="status">
          <button class="flt-chip active" data-value="all">All</button>
          <button class="flt-chip" data-value="todo">To Do</button>
          <button class="flt-chip active-color" data-value="in-progress">In Progress</button>
          <button class="flt-chip done-color" data-value="done">Done</button>
        </div>
      </div>
      <div class="flt-group">
        <div class="flt-group-label">Assignee</div>
        <div class="flt-chips" data-group="assignee">
          <button class="flt-chip active" data-value="all">All</button>
          <button class="flt-chip" data-value="ana">Ana Vega</button>
          <button class="flt-chip" data-value="marc">Marc López</button>
          <button class="flt-chip" data-value="sara">Sara Ruiz</button>
          <button class="flt-chip" data-value="jose">José Mora</button>
        </div>
      </div>

      <div class="flt-active-bar" id="flt-active-bar">
        <span class="flt-active-label">Active filters:</span>
        <span id="flt-active-chips"></span>
      </div>
    </div>
  </div>`,

    css: `/* Phase 29.2: filters */
.flt-panel { padding: 0 2rem 2rem; display: flex; flex-direction: column; gap: 1.5rem; }
.flt-group-label {
  font-size: 0.73rem; font-weight: 600;
  text-transform: uppercase; letter-spacing: 0.07em;
  color: var(--muted,#7b8bbf); margin-bottom: 0.6rem;
}
.flt-chips { display: flex; gap: 0.4rem; flex-wrap: wrap; }
.flt-chip {
  padding: 0.35rem 0.9rem;
  border-radius: 20px;
  border: 1px solid rgba(30,45,85,0.8);
  background: transparent;
  color: var(--muted,#7b8bbf);
  font-size: 0.82rem;
  cursor: pointer;
  transition: background 0.15s, border-color 0.15s, color 0.15s, transform 0.1s;
}
.flt-chip:hover { border-color: rgba(0,229,255,0.3); color: var(--text,#e0e8ff); transform: translateY(-1px); }
.flt-chip.active {
  background: rgba(0,229,255,0.12);
  border-color: rgba(0,229,255,0.35);
  color: var(--accent,#00e5ff);
}
.flt-chip.high.active    { background: rgba(255,77,109,0.12); border-color: rgba(255,77,109,0.35); color:#ff4d6d; }
.flt-chip.medium.active  { background: rgba(255,152,0,0.12);  border-color: rgba(255,152,0,0.35);  color:#ff9800; }
.flt-chip.low.active     { background: rgba(0,229,160,0.12);  border-color: rgba(0,229,160,0.3);   color:#00e5a0; }
.flt-active-bar {
  padding: 0.75rem 1rem;
  background: rgba(0,229,255,0.05);
  border: 1px solid rgba(0,229,255,0.1);
  border-radius: 10px;
  font-size: 0.82rem;
  display: flex; gap: 0.5rem; align-items: center; flex-wrap: wrap;
}
.flt-active-label { color: var(--muted,#7b8bbf); }
.flt-active-chip {
  padding: 0.2rem 0.6rem;
  background: rgba(0,229,255,0.12);
  border: 1px solid rgba(0,229,255,0.2);
  border-radius: 20px;
  color: var(--accent,#00e5ff);
  font-size: 0.75rem;
}
.btn-secondary {
  padding: 0.4rem 1rem;
  border: 1px solid rgba(30,45,85,0.8);
  border-radius: 8px;
  background: transparent;
  color: var(--muted,#7b8bbf);
  font-size: 0.82rem;
  cursor: pointer;
  transition: border-color 0.15s, color 0.15s;
}
.btn-secondary:hover { border-color: rgba(0,229,255,0.3); color: var(--text,#e0e8ff); }`,

    js: `(function() {
  var state = { priority:'all', status:'all', assignee:'all' };

  function updateActive() {
    var bar   = document.getElementById('flt-active-chips');
    var chips = [];
    if (state.priority !== 'all') chips.push(state.priority);
    if (state.status   !== 'all') chips.push(state.status.replace('-',' '));
    if (state.assignee !== 'all') chips.push(state.assignee);
    if (bar) bar.innerHTML = chips.length
      ? chips.map(function(c){return '<span class="flt-active-chip">'+c+'</span>';}).join('')
      : '<span style="color:var(--muted,#7b8bbf);font-size:0.78rem">None</span>';
  }

  document.querySelectorAll('.flt-chips').forEach(function(group) {
    var grp = group.dataset.group;
    group.addEventListener('click', function(e) {
      var chip = e.target.closest('.flt-chip');
      if (!chip) return;
      group.querySelectorAll('.flt-chip').forEach(function(c){c.classList.remove('active');});
      chip.classList.add('active');
      state[grp] = chip.dataset.value;
      updateActive();
    });
  });

  var clearBtn = document.getElementById('flt-clear-btn');
  if (clearBtn) {
    clearBtn.addEventListener('click', function() {
      state = { priority:'all', status:'all', assignee:'all' };
      document.querySelectorAll('.flt-chips').forEach(function(group) {
        group.querySelectorAll('.flt-chip').forEach(function(c){c.classList.remove('active');});
        var first = group.querySelector('[data-value="all"]');
        if (first) first.classList.add('active');
      });
      updateActive();
    });
  }

  updateActive();
}());`,
  };
}

/** Global cohesion pass — aligns spacing, typography, sections */
function buildCohesion(): ViewSnippets {
  return {
    css: `/* Phase 29.2: cohesion pass — global visual consistency */
:root {
  --spacing-section: 2rem;
  --spacing-header: 1.25rem 2rem 0.75rem;
  --radius-card: 14px;
  --radius-input: 8px;
  --font-base: 0.875rem;
  --font-sm: 0.8rem;
  --font-xs: 0.72rem;
}

/* Uniform section headers */
.content-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: var(--spacing-header);
  margin-bottom: 0.25rem;
}
.view-title {
  font-size: 1.1rem;
  font-weight: 700;
  letter-spacing: -0.02em;
  color: var(--text, #e0e8ff);
}

/* Uniform card appearance across all views */
.proj-card, .kanban-col, .analytics-card, .metric-card, .priority-col {
  border-radius: var(--radius-card);
}

/* Uniform table typography */
.data-table {
  width: 100%;
  border-collapse: collapse;
  font-size: var(--font-base);
}
.data-table th {
  font-size: var(--font-xs);
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.06em;
  color: var(--muted, #7b8bbf);
  padding: 0.6rem 1rem;
  border-bottom: 1px solid rgba(30,45,85,0.6);
  text-align: left;
}
.data-table td {
  padding: 0.7rem 1rem;
  border-bottom: 1px solid rgba(30,45,85,0.35);
  color: var(--text, #e0e8ff);
  vertical-align: middle;
}
.data-table tbody tr:last-child td { border-bottom: none; }
.data-table tbody tr:hover td { background: rgba(255,255,255,0.018); }

/* Uniform button style */
.btn-primary {
  padding: 0.45rem 1.1rem;
  background: linear-gradient(135deg, var(--accent,#00e5ff), var(--accent2,#7c4dff));
  color: #080c18;
  border: none;
  border-radius: var(--radius-input);
  font-size: var(--font-sm);
  font-weight: 700;
  cursor: pointer;
  transition: opacity 0.15s, transform 0.1s, box-shadow 0.2s;
}
.btn-primary:hover { opacity: 0.9; transform: translateY(-1px); box-shadow: 0 4px 14px rgba(0,229,255,0.3); }

/* Section padding uniformity */
.view-section { padding-bottom: 1rem; }
.view-section > *:not(.content-header) { }

/* Consistent empty states */
.empty-state {
  display: flex; flex-direction: column; align-items: center;
  justify-content: center; padding: 3rem 1rem;
  gap: 0.5rem; text-align: center; opacity: 0.5;
}
.empty-state-icon { font-size: 2.5rem; }
.empty-state-text { font-size: var(--font-sm); color: var(--muted,#7b8bbf); }`,
  };
}

// ---------------------------------------------------------------------------
// Phase 29.3: SaaS shell
// ---------------------------------------------------------------------------

/**
 * Returns true when the project already has the Phase 29.3 SaaS shell
 * (sidebar + view routing navigation).
 */
export function hasProjectShell(projectPath: string): boolean {
  const htmlPath = path.join(projectPath, "index.html");
  if (!fs.existsSync(htmlPath)) return false;
  const html = fs.readFileSync(htmlPath, "utf-8");
  return html.includes(SHELL_MARKER);
}

/**
 * Rebuilds the dashboard section of index.html with a full SaaS shell:
 * topbar + sidebar nav + main-content area with overview view.
 * Also injects the navigation CSS and navigateTo() JS.
 * Returns true when a rebuild was performed; false when already present.
 */
export function ensureProjectShell(projectPath: string): boolean {
  if (hasProjectShell(projectPath)) return false;

  const htmlPath = path.join(projectPath, "index.html");
  const cssPath  = path.join(projectPath, "styles.css");
  const jsPath   = path.join(projectPath, "script.js");

  if (!fs.existsSync(htmlPath)) return false;

  const existingHtml = fs.readFileSync(htmlPath, "utf-8");

  // Extract brand name from existing HTML (fallback: "App")
  const brandMatch = /<h1>([^<]+)<\/h1>/.exec(existingHtml);
  const brandName  = brandMatch ? brandMatch[1] : "App";
  const brandEmoji = existingHtml.includes("EduNova") ? "🎓 " : "";

  // Build new index.html keeping the login section, replacing dashboard section
  const loginSectionMatch = /([\s\S]*?<\/section>\s*)([\s\S]*<section id="dashboard-section"[\s\S]*)/
    .exec(existingHtml);

  let loginPart = "";
  if (loginSectionMatch) {
    loginPart = loginSectionMatch[1] ?? "";
  } else {
    // Fallback: keep everything before <section id="dashboard-section"
    const idx = existingHtml.indexOf('<section id="dashboard-section"');
    loginPart = idx !== -1 ? existingHtml.slice(0, idx) : existingHtml.replace(/<\/body>[\s\S]*$/, "");
  }

  const newDashboard = `  <!-- ${SHELL_MARKER} -->
  <section id="dashboard-section" class="hidden">
    <div class="app-shell">

      <nav class="topbar">
        <div class="topbar-brand">
          <span class="nav-brand">${brandEmoji}${brandName}</span>
        </div>
        <div class="topbar-right">
          <span id="nav-user" class="nav-user"></span>
          <button id="logout-btn">Salir</button>
        </div>
      </nav>

      <div class="app-layout">

        <aside class="sidebar">
          <div class="sidebar-brand">${brandName}</div>
          <nav class="sidebar-nav">
            <a class="sidebar-nav-item active" data-view="overview">
              <span class="nav-icon">📊</span><span>Overview</span>
            </a>
            <a class="sidebar-nav-item" data-view="my-tasks">
              <span class="nav-icon">✓</span><span>My Tasks</span>
            </a>
            <a class="sidebar-nav-item" data-view="projects">
              <span class="nav-icon">📁</span><span>Projects</span>
            </a>
            <a class="sidebar-nav-item" data-view="priorities">
              <span class="nav-icon">⬆</span><span>Priorities</span>
            </a>
            <a class="sidebar-nav-item" data-view="filters">
              <span class="nav-icon">🔍</span><span>Filters</span>
            </a>
          </nav>
        </aside>

        <main class="main-content" id="main-content">

          <!-- Overview view -->
          <div class="view-section" id="view-overview" data-view="overview">
            <div class="content-header">
              <h2 class="view-title">Overview</h2>
              <span class="view-subtitle" id="dash-subtitle">Ciclo 2025–2026</span>
            </div>
            <div class="stats-row">
              <div class="stat-card metric-card">
                <span class="stat-num metric-num">248</span>
                <span class="stat-label">Alumnos activos</span>
              </div>
              <div class="stat-card metric-card">
                <span class="stat-num metric-num">12</span>
                <span class="stat-label">Tareas abiertas</span>
              </div>
              <div class="stat-card metric-card">
                <span class="stat-num metric-num">18</span>
                <span class="stat-label">Proyectos activos</span>
              </div>
              <div class="stat-card metric-card">
                <span class="stat-num metric-num">94%</span>
                <span class="stat-label">Progreso semanal</span>
              </div>
            </div>
            <h3 class="modules-title" style="padding: 1.5rem 2rem 0.75rem">Acceso rápido</h3>
            <div class="cards-row" style="padding: 0 2rem 2rem">
              <div class="card active" data-target="my-tasks">
                <div class="card-icon">✓</div>
                <h3>My Tasks</h3>
                <p class="card-meta">Lista de tareas activas</p>
                <span class="badge live">Disponible</span>
              </div>
              <div class="card active" data-target="projects">
                <div class="card-icon">📁</div>
                <h3>Projects</h3>
                <p class="card-meta">Gestión de proyectos</p>
                <span class="badge live">Disponible</span>
              </div>
              <div class="card active" data-target="priorities">
                <div class="card-icon">⬆</div>
                <h3>Priorities</h3>
                <p class="card-meta">Alta, media y baja</p>
                <span class="badge live">Disponible</span>
              </div>
              <div class="card active" data-target="filters">
                <div class="card-icon">🔍</div>
                <h3>Filters</h3>
                <p class="card-meta">Filtros rápidos</p>
                <span class="badge live">Disponible</span>
              </div>
            </div>
          </div>

          ${VIEW_INJECT_SENTINEL}

        </main>
      </div>
    </div>
  </section>`;

  const newHtml = loginPart.trimEnd() + "\n\n" + newDashboard + "\n\n  <script src=\"script.js\"></script>\n</body>\n</html>\n";
  fs.writeFileSync(htmlPath, newHtml, "utf-8");

  // CSS for the shell layout
  const shellCSS = `
/* ${SHELL_MARKER} */
.app-shell { display: flex; flex-direction: column; height: 100vh; overflow: hidden; }

.topbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0 1.5rem;
  height: 52px;
  background: rgba(8,12,24,0.92);
  border-bottom: 1px solid rgba(30,45,85,0.6);
  backdrop-filter: blur(20px);
  -webkit-backdrop-filter: blur(20px);
  flex-shrink: 0;
  z-index: 100;
}
.topbar-brand { display: flex; align-items: center; }
.nav-brand { font-size: 0.95rem; font-weight: 700; letter-spacing: -0.02em; }
.topbar-right { display: flex; align-items: center; gap: 1rem; }
.nav-user { font-size: 0.82rem; color: var(--muted, #7b8bbf); }
#logout-btn {
  padding: 0.3rem 0.85rem;
  border: 1px solid rgba(30,45,85,0.8);
  border-radius: 7px;
  background: transparent;
  color: var(--muted, #7b8bbf);
  font-size: 0.8rem;
  cursor: pointer;
  transition: border-color 0.15s, color 0.15s;
}
#logout-btn:hover { border-color: rgba(0,229,255,0.3); color: var(--text, #e0e8ff); }

.app-layout { display: flex; flex: 1; overflow: hidden; }

.sidebar {
  width: 220px;
  min-width: 220px;
  background: linear-gradient(180deg, rgba(9,13,26,1) 0%, rgba(6,9,18,1) 100%);
  border-right: 1px solid rgba(255,255,255,0.05);
  display: flex;
  flex-direction: column;
  padding: 1.25rem 0.75rem 1.25rem;
  overflow-y: auto;
}
.sidebar-brand {
  font-size: 0.88rem;
  font-weight: 700;
  letter-spacing: -0.02em;
  color: var(--text, #e0e8ff);
  padding: 0 0.5rem 1.25rem;
  border-bottom: 1px solid rgba(255,255,255,0.05);
  margin-bottom: 0.75rem;
}
.sidebar-nav { display: flex; flex-direction: column; gap: 0.15rem; }
.sidebar-nav-item {
  display: flex;
  align-items: center;
  gap: 0.6rem;
  padding: 0.5rem 0.75rem;
  border-radius: 7px;
  font-size: 0.85rem;
  font-weight: 500;
  color: rgba(224,232,255,0.55);
  cursor: pointer;
  text-decoration: none;
  user-select: none;
  transition: background 0.14s, color 0.14s;
}
.sidebar-nav-item:hover {
  background: rgba(255,255,255,0.055);
  color: rgba(224,232,255,0.9);
}
.sidebar-nav-item.active {
  background: rgba(0,229,255,0.09);
  color: #e0e8ff;
  box-shadow: inset 3px 0 0 var(--accent, #00e5ff);
}
.nav-icon { font-size: 0.95rem; width: 1.2rem; text-align: center; }

.main-content {
  flex: 1;
  overflow-y: auto;
  background: var(--bg, #080c18);
}
.view-section { display: block; }
.view-section.hidden { display: none !important; }

.content-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 1.25rem 2rem 0.75rem;
}
.view-title {
  font-size: 1.1rem;
  font-weight: 700;
  letter-spacing: -0.02em;
}
.view-subtitle { font-size: 0.8rem; color: var(--muted, #7b8bbf); }

.stat-card, .metric-card {
  background: rgba(15,22,41,0.75);
  border: 1px solid rgba(30,45,85,0.7);
  border-radius: 12px;
  padding: 1.25rem 1.5rem;
  display: flex;
  flex-direction: column;
  gap: 0.35rem;
  transition: border-color 0.2s, box-shadow 0.2s;
}
.stat-card:hover, .metric-card:hover {
  border-color: rgba(0,229,255,0.2);
  box-shadow: 0 0 16px rgba(0,229,255,0.07);
}
.stat-num, .metric-num {
  font-size: 1.75rem;
  font-weight: 700;
  color: var(--accent, #4fc3f7);
  letter-spacing: -0.03em;
}
.stat-label { font-size: 0.78rem; color: var(--muted, #7b8bbf); }
.stats-row {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(150px,1fr));
  gap: 1rem;
  padding: 0 2rem 1.5rem;
}
.modules-title { color: var(--text, #e0e8ff); font-size: 0.88rem; font-weight: 600; }
.cards-row {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
  gap: 1rem;
}
.card {
  background: rgba(15,22,41,0.75);
  border: 1px solid rgba(30,45,85,0.7);
  border-radius: 12px;
  padding: 1.25rem;
  cursor: pointer;
  transition: border-color 0.2s, transform 0.15s, box-shadow 0.2s;
}
.card:hover {
  border-color: rgba(0,229,255,0.25);
  transform: translateY(-2px);
  box-shadow: 0 4px 20px rgba(0,0,0,0.3);
}
.card-icon { font-size: 1.75rem; margin-bottom: 0.5rem; }
.card h3 { font-size: 0.95rem; font-weight: 700; margin-bottom: 0.25rem; }
.card-meta { font-size: 0.78rem; color: var(--muted, #7b8bbf); margin-bottom: 0.75rem; }
.badge { display: inline-flex; align-items: center; padding: 0.18rem 0.6rem; border-radius: 20px; font-size: 0.7rem; font-weight: 600; }
.badge.live { background: rgba(0,229,160,0.15); color: #00e5a0; border: 1px solid rgba(0,229,160,0.25); }
.badge.soon { background: rgba(255,152,0,0.12); color: #ff9800; border: 1px solid rgba(255,152,0,0.2); }
`;

  const existingCSS = fs.existsSync(cssPath) ? fs.readFileSync(cssPath, "utf-8") : "";
  if (!existingCSS.includes(SHELL_MARKER)) {
    fs.writeFileSync(cssPath, existingCSS + "\n" + shellCSS, "utf-8");
  }

  // Navigation JS
  const shellJS = `
// ${SHELL_MARKER}
window.navigateTo = function(viewId) {
  document.querySelectorAll('#main-content .view-section').forEach(function(s) {
    s.classList.toggle('hidden', s.dataset.view !== viewId);
  });
  document.querySelectorAll('.sidebar-nav-item').forEach(function(n) {
    n.classList.toggle('active', n.dataset.view === viewId);
  });
  console.log('[nav] navigated to:', viewId);
};

document.querySelectorAll('.sidebar-nav-item').forEach(function(item) {
  item.addEventListener('click', function() {
    window.navigateTo(this.dataset.view);
  });
});

// Overview module cards → navigate to target view
document.querySelectorAll('.card[data-target]').forEach(function(card) {
  card.addEventListener('click', function() {
    var target = card.dataset.target;
    if (target) window.navigateTo(target);
  });
});
`;

  const existingJS = fs.existsSync(jsPath) ? fs.readFileSync(jsPath, "utf-8") : "";
  if (!existingJS.includes(SHELL_MARKER)) {
    fs.writeFileSync(jsPath, existingJS + "\n" + shellJS, "utf-8");
  }

  return true;
}

// ---------------------------------------------------------------------------
// Builder registry
// ---------------------------------------------------------------------------

const VIEW_BUILDERS = new Map<ViewKey, () => ViewSnippets>([
  ["my-tasks",   buildMyTasks],
  ["projects",   buildProjects],
  ["priorities", buildPriorities],
  ["filters",    buildFilters],
]);

// ---------------------------------------------------------------------------
// Main export
// ---------------------------------------------------------------------------

/** Strip all CSS/JS blocks between a phase marker and the next one. */
function stripPhaseBlock(content: string, marker: string): string {
  // Match: /* marker */ ... up to start of next /* Phase or end of string
  const escaped = marker.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return content.replace(
    new RegExp(`\\/\\* ${escaped} \\*\\/[\\s\\S]*?(?=\\/\\* Phase|$)`, "g"),
    ""
  );
}

/** Strip <!-- marker --> ... closing </div> for view HTML blocks. */
function stripHTMLViewBlock(html: string, marker: string): string {
  const escaped = marker.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  // Remove from <!-- marker --> to the FIRST </div> that closes the view section
  return html.replace(
    new RegExp(`\\s*<!-- ${escaped} -->\\s*<div[\\s\\S]*?<\\/div>\\s*`, "g"),
    ""
  );
}

/**
 * Applies view completion snippets to an existing web project.
 *
 * Phase 29.3 additions:
 *   - forceReapply: strips existing markers so builders re-inject fresh content
 *   - Uses VIEW_INJECT_SENTINEL if shell is present (injects inside main-content)
 *   - Falls back to </body> for projects without the SaaS shell
 */
export function applyViewCompletions(
  projectPath: string,
  views: ViewKey[],
  cohesion: boolean,
  forceReapply = false
): ViewCompletionResult {
  const result: ViewCompletionResult = { appliedViews: [], filesChanged: [], skipped: [] };

  const htmlPath = path.join(projectPath, "index.html");
  const cssPath  = path.join(projectPath, "styles.css");
  const jsPath   = path.join(projectPath, "script.js");

  let html = fs.existsSync(htmlPath) ? fs.readFileSync(htmlPath, "utf-8") : "";
  let css  = fs.existsSync(cssPath)  ? fs.readFileSync(cssPath,  "utf-8") : "";
  let js   = fs.existsSync(jsPath)   ? fs.readFileSync(jsPath,   "utf-8") : "";

  let htmlDirty = false;
  let cssDirty  = false;
  let jsDirty   = false;

  // Determine injection target based on whether the SaaS shell is installed
  const usesSentinel = html.includes(VIEW_INJECT_SENTINEL);

  // Apply cohesion pass first (CSS only)
  if (cohesion) {
    const marker = "Phase 29.2: cohesion";
    if (forceReapply) {
      css = stripPhaseBlock(css, marker);
    }
    if (!css.includes(marker)) {
      const snippets = buildCohesion();
      css += `\n/* ${marker} */\n${snippets.css}\n`;
      cssDirty = true;
      result.appliedViews.push("cohesion");
    } else {
      result.skipped.push("cohesion (already applied)");
    }
  }

  // Apply each view
  for (const view of views) {
    const builder = VIEW_BUILDERS.get(view);
    if (!builder) {
      result.skipped.push(`${view} (no builder)`);
      continue;
    }

    const marker   = `Phase 29.2: ${view}`;
    const snippets = builder();

    const needsCSS  = !!snippets.css;
    const needsHTML = !!snippets.html;
    const needsJS   = !!snippets.js;

    // forceReapply: strip existing markers so content is re-injected
    if (forceReapply) {
      if (needsCSS) css  = stripPhaseBlock(css, marker);
      if (needsJS)  js   = stripPhaseBlock(js, `/* ${marker} */`.replace(/^\/\* | \*\/$/g, ""));
      // For HTML: only re-inject if the view section ID doesn't exist in the shell
      // (shell pre-creates view-overview; dynamic views are always fresh)
    }

    // Check if already present (after possible stripping)
    const htmlAlreadyHasViewId = html.includes(`id="view-${view}"`);
    const hasCSS  = !needsCSS  || css.includes(marker);
    const hasHTML = !needsHTML || html.includes(marker) || htmlAlreadyHasViewId;
    const hasJS   = !needsJS   || js.includes(marker);

    if (!forceReapply && hasCSS && hasHTML && hasJS) {
      result.skipped.push(`${view} (already applied — use forceReapply to upgrade)`);
      continue;
    }

    let applied = false;

    if (needsCSS && !css.includes(marker)) {
      css += `\n/* ${marker} */\n${snippets.css}\n`;
      cssDirty = true;
      applied = true;
    }

    // HTML injection: use sentinel (inside main-content) when shell is present
    if (needsHTML && !html.includes(marker) && !htmlAlreadyHasViewId) {
      if (usesSentinel) {
        html = html.replace(
          VIEW_INJECT_SENTINEL,
          `<!-- ${marker} -->\n${snippets.html}\n\n          ${VIEW_INJECT_SENTINEL}`
        );
      } else if (html.includes("</body>")) {
        html = html.replace("</body>", `<!-- ${marker} -->\n${snippets.html}\n</body>`);
      }
      htmlDirty = true;
      applied = true;
    }

    if (needsJS && !js.includes(marker)) {
      js += `\n/* ${marker} */\nsetTimeout(function() {\n${snippets.js}\n}, 0);\n`;
      jsDirty = true;
      applied = true;
    }

    if (applied) result.appliedViews.push(view);
    else result.skipped.push(`${view} (no changes needed)`);
  }

  if (cssDirty && fs.existsSync(cssPath)) {
    fs.writeFileSync(cssPath, css, "utf-8");
    if (!result.filesChanged.includes("styles.css")) result.filesChanged.push("styles.css");
  }
  if (htmlDirty && fs.existsSync(htmlPath)) {
    fs.writeFileSync(htmlPath, html, "utf-8");
    if (!result.filesChanged.includes("index.html")) result.filesChanged.push("index.html");
  }
  if (jsDirty && fs.existsSync(jsPath)) {
    fs.writeFileSync(jsPath, js, "utf-8");
    if (!result.filesChanged.includes("script.js")) result.filesChanged.push("script.js");
  }

  return result;
}
