/**
 * executePlanStep — routes plan steps to real tools (web stack) or safe stubs.
 *
 * Phase 21: Real execution for web app steps only.
 * Phase 24: Domain-aware content generation (school, sales, generic).
 *   - Detected domain drives HTML/CSS/JS templates.
 *   - Releases used to mark v1 as executed, v2/v3 as "próximamente".
 */

import fs from "fs";
import path from "path";
import type { PlanStep, Release, WebDesign } from "./types.ts";
import type { ToolContext } from "../../tools/types.js";

// ---------------------------------------------------------------------------
// School domain content builders
// ---------------------------------------------------------------------------

function buildSchoolRoadmapHTML(releases: Release[]): string {
  if (releases.length === 0) return "";
  const rows = releases
    .map((r, i) => {
      const isDone = i === 0;
      const cls    = isDone ? "done" : "pending";
      const icon   = isDone ? "✅ Ejecutado" : "⏳ Pendiente";
      const goals  = r.goals.length > 0 ? r.goals.join(", ") : r.version;
      return `        <div class="release-row ${cls}"><span class="rel-tag">${r.version}</span> ${goals} — ${icon}</div>`;
    })
    .join("\n");

  return `
      <div class="releases-roadmap">
        <h3>Roadmap de Releases</h3>
${rows}
      </div>`;
}

function buildSchoolHTML(releases: Release[]): string {
  const roadmap  = buildSchoolRoadmapHTML(releases);
  const v2label  = releases[1] ? releases[1].version : "v2";
  const v3label  = releases[2] ? releases[2].version : "v3";

  return `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>EduNova — Plataforma Escolar</title>
  <link rel="stylesheet" href="styles.css">
</head>
<body>

  <!-- LOGIN -->
  <section id="login-section">
    <div class="login-box">
      <div class="logo">
        <div class="logo-icon">🎓</div>
        <h1>EduNova</h1>
        <p class="tagline">Plataforma Escolar</p>
      </div>
      <input type="text" id="username" placeholder="Usuario o correo institucional">
      <input type="password" id="password" placeholder="Contraseña">
      <button id="login-btn">Ingresar al Sistema</button>
      <p id="login-error" class="error hidden">Credenciales incorrectas. Intente de nuevo.</p>
    </div>
  </section>

  <!-- DASHBOARD -->
  <section id="dashboard-section" class="hidden">
    <nav class="topbar">
      <span class="nav-brand">🎓 EduNova</span>
      <span id="nav-user" class="nav-user"></span>
      <button id="logout-btn">Salir</button>
    </nav>

    <main class="dashboard-main">
      <div class="dashboard-header">
        <h2>Panel Principal</h2>
        <p class="dash-subtitle">Ciclo escolar 2025–2026</p>
      </div>

      <div class="stats-row">
        <div class="stat-card">
          <span class="stat-num">248</span>
          <span class="stat-label">Alumnos activos</span>
        </div>
        <div class="stat-card">
          <span class="stat-num">12</span>
          <span class="stat-label">Cursos activos</span>
        </div>
        <div class="stat-card">
          <span class="stat-num">18</span>
          <span class="stat-label">Docentes</span>
        </div>
        <div class="stat-card">
          <span class="stat-num">94%</span>
          <span class="stat-label">Asistencia promedio</span>
        </div>
      </div>

      <h3 class="modules-title">Módulos del Sistema</h3>
      <div class="cards-row">
        <div class="card active">
          <div class="card-icon">👨‍🎓</div>
          <h3>Alumnos</h3>
          <p class="card-meta">248 registrados</p>
          <span class="badge live">Disponible</span>
        </div>
        <div class="card active">
          <div class="card-icon">📚</div>
          <h3>Cursos</h3>
          <p class="card-meta">12 activos · 6 materias</p>
          <span class="badge live">Disponible</span>
        </div>
        <div class="card coming-soon">
          <div class="card-icon">📝</div>
          <h3>Matrícula</h3>
          <p class="card-meta">Inscripción y alta de alumnos</p>
          <span class="badge soon">Próximamente ${v2label}</span>
        </div>
        <div class="card coming-soon">
          <div class="card-icon">💳</div>
          <h3>Pagos</h3>
          <p class="card-meta">Colegiatura y recibos</p>
          <span class="badge soon">Próximamente ${v2label}</span>
        </div>
        <div class="card coming-soon">
          <div class="card-icon">🗓️</div>
          <h3>Horarios</h3>
          <p class="card-meta">Vista semanal interactiva</p>
          <span class="badge v3">Próximamente ${v3label}</span>
        </div>
      </div>
${roadmap}
    </main>
  </section>

  <script src="script.js"></script>
</body>
</html>
`;
}

function buildSchoolCSS(): string {
  return `* {
  box-sizing: border-box;
  margin: 0;
  padding: 0;
}

:root {
  --bg:      #080c18;
  --surface: #0f1629;
  --border:  #1e2d55;
  --accent:  #4fc3f7;
  --accent2: #7c4dff;
  --text:    #e0e8ff;
  --muted:   #7b8bbf;
  --success: #00e5a0;
  --warn:    #ff9800;
  --glow:    0 0 24px rgba(79, 195, 247, 0.22);
  --glow-strong: 0 0 40px rgba(79, 195, 247, 0.35);
}

/* ── KEYFRAMES ── */
@keyframes fadeIn {
  from { opacity: 0; transform: translateY(12px); }
  to   { opacity: 1; transform: translateY(0); }
}

@keyframes slideUp {
  from { opacity: 0; transform: translateY(20px); }
  to   { opacity: 1; transform: translateY(0); }
}

@keyframes revealCard {
  from { opacity: 0; transform: translateY(16px) scale(0.97); }
  to   { opacity: 1; transform: translateY(0)   scale(1);    }
}

@keyframes pulse-glow {
  0%, 100% { box-shadow: 0 0 0 0 rgba(79,195,247,0); }
  50%       { box-shadow: 0 0 18px 4px rgba(79,195,247,0.18); }
}

@keyframes shimmer {
  0%   { background-position: -200% center; }
  100% { background-position:  200% center; }
}

@keyframes shake {
  0%, 100% { transform: translateX(0); }
  20%       { transform: translateX(-8px); }
  40%       { transform: translateX(8px); }
  60%       { transform: translateX(-5px); }
  80%       { transform: translateX(5px); }
}

body {
  font-family: 'Segoe UI', system-ui, sans-serif;
  background: var(--bg);
  color: var(--text);
  min-height: 100vh;
}

.hidden { display: none !important; }

/* ── LOGIN ── */
#login-section {
  display: flex;
  align-items: center;
  justify-content: center;
  min-height: 100vh;
  background: radial-gradient(ellipse at 50% 40%, rgba(79,195,247,0.08) 0%, transparent 70%);
  animation: fadeIn 0.5s ease both;
}

.login-box {
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: 18px;
  padding: 2.75rem 2.25rem;
  width: 380px;
  display: flex;
  flex-direction: column;
  gap: 1.1rem;
  box-shadow: 0 0 60px rgba(79,195,247,0.1), 0 12px 40px rgba(0,0,0,0.6);
  animation: fadeIn 0.55s ease both;
}

.logo { text-align: center; margin-bottom: 0.5rem; }
.logo-icon { font-size: 2.75rem; }

.logo h1 {
  font-size: 2.1rem;
  background: linear-gradient(90deg, var(--accent), var(--accent2));
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
  background-clip: text;
  font-weight: 700;
  margin-top: 0.3rem;
}

.tagline { color: var(--muted); font-size: 0.875rem; margin-top: 0.25rem; }

.login-box input {
  background: #070b16;
  border: 1px solid var(--border);
  border-radius: 9px;
  color: var(--text);
  padding: 0.8rem 1rem;
  font-size: 0.95rem;
  transition: border-color 0.25s, box-shadow 0.25s, background 0.2s;
}

.login-box input:focus {
  outline: none;
  border-color: var(--accent);
  background: #0a1020;
  box-shadow: 0 0 0 3px rgba(79,195,247,0.14);
}

.login-box input::placeholder { color: var(--muted); }

#login-btn {
  background: linear-gradient(135deg, var(--accent) 0%, var(--accent2) 100%);
  background-size: 200% auto;
  border: none;
  border-radius: 9px;
  color: #fff;
  padding: 0.85rem;
  font-size: 1rem;
  font-weight: 600;
  cursor: pointer;
  letter-spacing: 0.03em;
  transition: opacity 0.2s, transform 0.18s, box-shadow 0.25s;
}

#login-btn:hover {
  opacity: 0.92;
  transform: translateY(-2px);
  box-shadow: 0 6px 20px rgba(79,195,247,0.3);
  animation: shimmer 1.4s linear infinite;
}

#login-btn:active { transform: translateY(0); }

.error { color: #ef5350; font-size: 0.85rem; text-align: center; }

/* ── DASHBOARD ── */
#dashboard-section {
  display: flex;
  flex-direction: column;
  min-height: 100vh;
  animation: fadeIn 0.4s ease both;
}

.topbar {
  display: flex;
  align-items: center;
  gap: 1rem;
  padding: 0.9rem 2rem;
  background: rgba(15, 22, 41, 0.75);
  backdrop-filter: blur(14px);
  -webkit-backdrop-filter: blur(14px);
  border-bottom: 1px solid var(--border);
  position: sticky;
  top: 0;
  z-index: 10;
}

.nav-brand {
  font-size: 1.1rem;
  font-weight: 700;
  background: linear-gradient(90deg, var(--accent), var(--accent2));
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
  background-clip: text;
  flex: 1;
}

.nav-user { color: var(--muted); font-size: 0.9rem; }

#logout-btn {
  background: transparent;
  border: 1px solid var(--border);
  border-radius: 6px;
  color: var(--muted);
  padding: 0.4rem 0.9rem;
  cursor: pointer;
  font-size: 0.85rem;
  transition: border-color 0.2s, color 0.2s, box-shadow 0.2s;
}

#logout-btn:hover {
  border-color: var(--accent);
  color: var(--accent);
  box-shadow: 0 0 8px rgba(79,195,247,0.15);
}

.dashboard-main {
  flex: 1;
  padding: 2.25rem 2rem;
  max-width: 1100px;
  margin: 0 auto;
  width: 100%;
}

.dashboard-header {
  margin-bottom: 2rem;
  animation: slideUp 0.4s ease both;
}
.dashboard-header h2 { font-size: 1.5rem; font-weight: 700; }
.dash-subtitle { color: var(--muted); font-size: 0.875rem; margin-top: 0.3rem; }

/* ── STATS ── */
.stats-row {
  display: flex;
  gap: 1.25rem;
  margin-bottom: 2.25rem;
  flex-wrap: wrap;
}

.stat-card {
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: 14px;
  padding: 1.4rem 1.6rem;
  flex: 1;
  min-width: 130px;
  display: flex;
  flex-direction: column;
  gap: 0.35rem;
  transition: box-shadow 0.25s, transform 0.2s, border-color 0.2s;
  animation: revealCard 0.5s ease both;
}

.stat-card:nth-child(1) { animation-delay: 0.05s; }
.stat-card:nth-child(2) { animation-delay: 0.10s; }
.stat-card:nth-child(3) { animation-delay: 0.15s; }
.stat-card:nth-child(4) { animation-delay: 0.20s; }

.stat-card:hover {
  box-shadow: var(--glow-strong);
  transform: translateY(-3px) scale(1.02);
  border-color: rgba(79,195,247,0.4);
}

.stat-num {
  font-size: 1.85rem;
  font-weight: 700;
  background: linear-gradient(90deg, var(--accent), var(--accent2));
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
  background-clip: text;
}

.stat-label { color: var(--muted); font-size: 0.8rem; }

/* ── MODULES ── */
.modules-title {
  font-size: 0.82rem;
  font-weight: 600;
  color: var(--muted);
  text-transform: uppercase;
  letter-spacing: 0.06em;
  margin-bottom: 1.1rem;
}

.cards-row {
  display: flex;
  flex-wrap: wrap;
  gap: 1.25rem;
  margin-bottom: 2rem;
}

.card {
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: 14px;
  padding: 1.6rem 1.4rem;
  width: 180px;
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
  transition: box-shadow 0.25s, border-color 0.25s, transform 0.2s;
  animation: revealCard 0.5s ease both;
}

.card:nth-child(1) { animation-delay: 0.10s; }
.card:nth-child(2) { animation-delay: 0.16s; }
.card:nth-child(3) { animation-delay: 0.22s; }
.card:nth-child(4) { animation-delay: 0.28s; }
.card:nth-child(5) { animation-delay: 0.34s; }

.card.active { cursor: pointer; }

.card.active:hover {
  box-shadow: var(--glow-strong);
  border-color: var(--accent);
  transform: translateY(-5px) scale(1.03);
}

.card.coming-soon { opacity: 0.45; cursor: default; }

.card-icon { font-size: 2.1rem; }
.card h3   { font-size: 0.95rem; font-weight: 600; }
.card-meta { color: var(--muted); font-size: 0.75rem; }

.badge {
  display: inline-block;
  border-radius: 20px;
  padding: 0.15rem 0.65rem;
  font-size: 0.7rem;
  font-weight: 600;
  margin-top: 0.3rem;
  width: fit-content;
}

.badge.live { background: rgba(0,229,160,0.15);  color: var(--success); }
.badge.soon { background: rgba(255,152,0,0.15);   color: var(--warn);    }
.badge.v3   { background: rgba(124,77,255,0.15);  color: var(--accent2); }

/* ── ROADMAP ── */
.releases-roadmap {
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: 14px;
  padding: 1.6rem;
  animation: slideUp 0.5s 0.3s ease both;
}

.releases-roadmap h3 {
  font-size: 0.8rem;
  font-weight: 600;
  color: var(--muted);
  text-transform: uppercase;
  letter-spacing: 0.06em;
  margin-bottom: 1rem;
}

.release-row {
  display: flex;
  align-items: center;
  gap: 0.9rem;
  padding: 0.7rem 0;
  border-bottom: 1px solid rgba(30,45,85,0.6);
  font-size: 0.9rem;
  transition: color 0.2s;
}

.release-row:last-child { border-bottom: none; }

.rel-tag {
  background: rgba(79,195,247,0.12);
  color: var(--accent);
  border-radius: 4px;
  padding: 0.1rem 0.5rem;
  font-weight: 700;
  font-size: 0.78rem;
  min-width: 28px;
  text-align: center;
}

.release-row.done    { color: var(--success); }
.release-row.pending { color: var(--muted);   }
`;
}

function buildSchoolJS(): string {
  return `// EduNova — Plataforma Escolar (v1)
const loginSection = document.getElementById('login-section');
const dashSection  = document.getElementById('dashboard-section');
const loginBtn     = document.getElementById('login-btn');
const logoutBtn    = document.getElementById('logout-btn');
const loginError   = document.getElementById('login-error');
const navUser      = document.getElementById('nav-user');

// Smooth section transition: fade out A, fade in B
function transition(from, to) {
  from.style.transition = 'opacity 0.3s ease';
  from.style.opacity = '0';
  setTimeout(function () {
    from.classList.add('hidden');
    from.style.opacity = '';
    from.style.transition = '';
    to.classList.remove('hidden');
    to.style.opacity = '0';
    to.style.transition = 'opacity 0.35s ease';
    requestAnimationFrame(function () {
      requestAnimationFrame(function () {
        to.style.opacity = '1';
        setTimeout(function () { to.style.transition = ''; to.style.opacity = ''; }, 360);
      });
    });
  }, 300);
}

loginBtn.addEventListener('click', function () {
  const user = document.getElementById('username').value.trim();
  const pass = document.getElementById('password').value;

  if (user && pass) {
    loginError.classList.add('hidden');
    navUser.textContent = '👤 ' + user;
    transition(loginSection, dashSection);
    console.log('[EduNova] login OK — usuario:', user);
  } else {
    loginError.classList.remove('hidden');
    // Shake animation on error
    const box = document.querySelector('.login-box');
    box.style.animation = 'none';
    box.offsetHeight; // reflow
    box.style.animation = 'shake 0.4s ease';
    console.warn('[EduNova] login fallido: campos vacíos');
  }
});

logoutBtn.addEventListener('click', function () {
  transition(dashSection, loginSection);
  document.getElementById('username').value = '';
  document.getElementById('password').value = '';
  navUser.textContent = '';
  console.log('[EduNova] sesión cerrada');
});

// Módulos activos — click feedback with microinteraction
document.querySelectorAll('.card.active').forEach(function (card) {
  card.addEventListener('click', function () {
    const name = card.querySelector('h3').textContent;
    card.style.transform = 'scale(0.97)';
    setTimeout(function () { card.style.transform = ''; }, 150);
    console.log('[EduNova] módulo seleccionado:', name);
    // TODO v2: cargar vista de módulo
  });
});

// Stat cards — counter reveal animation
document.querySelectorAll('.stat-num').forEach(function (el) {
  const target = parseInt(el.textContent.replace(/[^0-9]/g, ''), 10);
  if (isNaN(target) || target === 0) return;
  const suffix = el.textContent.replace(/[0-9]/g, '');
  let current = 0;
  const step = Math.ceil(target / 30);
  const timer = setInterval(function () {
    current = Math.min(current + step, target);
    el.textContent = current + suffix;
    if (current >= target) clearInterval(timer);
  }, 40);
});
`;
}

// ---------------------------------------------------------------------------
// Generic (fallback) content builders — unchanged from phase 21
// ---------------------------------------------------------------------------

const GENERIC_HTML = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>App</title>
  <link rel="stylesheet" href="styles.css">
</head>
<body>
  <section id="login-section">
    <div class="login-box">
      <h1>Login</h1>
      <input type="text" id="username" placeholder="Username">
      <input type="password" id="password" placeholder="Password">
      <button id="login-btn">Login</button>
      <p id="login-error" class="error hidden">Invalid credentials</p>
    </div>
  </section>

  <section id="dashboard-section" class="hidden">
    <div class="dashboard">
      <h1>Dashboard</h1>
      <p>Welcome! You are logged in.</p>
      <button id="logout-btn">Logout</button>
    </div>
  </section>

  <script src="script.js"></script>
</body>
</html>
`;

const GENERIC_CSS = `* {
  box-sizing: border-box;
  margin: 0;
  padding: 0;
}

body {
  font-family: sans-serif;
  background: #f0f2f5;
  display: flex;
  align-items: center;
  justify-content: center;
  min-height: 100vh;
}

.hidden {
  display: none !important;
}

#login-section {
  width: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
}

.login-box {
  background: #fff;
  padding: 2rem;
  border-radius: 8px;
  box-shadow: 0 2px 12px rgba(0, 0, 0, 0.15);
  display: flex;
  flex-direction: column;
  gap: 1rem;
  width: 320px;
}

.login-box h1 { font-size: 1.5rem; color: #333; }

.login-box input {
  padding: 0.6rem 0.8rem;
  border: 1px solid #ccc;
  border-radius: 4px;
  font-size: 1rem;
}

.login-box button {
  padding: 0.7rem;
  background: #4f6ef7;
  color: #fff;
  border: none;
  border-radius: 4px;
  font-size: 1rem;
  cursor: pointer;
}

.login-box button:hover { background: #3a57d4; }

.error { color: #e53935; font-size: 0.875rem; }

#dashboard-section {
  width: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
}

.dashboard {
  background: #fff;
  padding: 2rem;
  border-radius: 8px;
  box-shadow: 0 2px 12px rgba(0, 0, 0, 0.15);
  width: 480px;
  display: flex;
  flex-direction: column;
  gap: 1rem;
}

.dashboard h1 { font-size: 1.5rem; color: #333; }

.dashboard button {
  padding: 0.7rem 1rem;
  background: #e53935;
  color: #fff;
  border: none;
  border-radius: 4px;
  font-size: 1rem;
  cursor: pointer;
  align-self: flex-start;
}

.dashboard button:hover { background: #c62828; }
`;

const GENERIC_JS = `// Mock login / logout logic
const loginSection    = document.getElementById('login-section');
const dashboardSection = document.getElementById('dashboard-section');
const loginBtn        = document.getElementById('login-btn');
const logoutBtn       = document.getElementById('logout-btn');
const loginError      = document.getElementById('login-error');

loginBtn.addEventListener('click', function () {
  const user = document.getElementById('username').value.trim();
  const pass = document.getElementById('password').value;

  if (user && pass) {
    loginSection.classList.add('hidden');
    dashboardSection.classList.remove('hidden');
    loginError.classList.add('hidden');
    console.log('[app] login OK — user:', user);
  } else {
    loginError.classList.remove('hidden');
    console.log('[app] login failed: empty credentials');
  }
});

logoutBtn.addEventListener('click', function () {
  dashboardSection.classList.add('hidden');
  loginSection.classList.remove('hidden');
  document.getElementById('username').value = '';
  document.getElementById('password').value = '';
  console.log('[app] logged out');
});
`;

// ---------------------------------------------------------------------------
// Phase 29: Design-aware SaaS content builders
// ---------------------------------------------------------------------------

function buildSaaSHTML(design: WebDesign, releases: Release[]): string {
  const name    = design.productName;
  const hasSidebar = design.components.includes("sidebar");
  const hasSearch  = design.components.includes("search");
  const hasMetrics = design.components.includes("metrics");
  const hasTable   = design.components.includes("table");
  const hasGlow    = design.components.includes("glow");
  const modules    = design.modules;
  const views      = design.views;

  // Build sidebar nav items
  const navItems = views.map((v, i) => {
    const icons: Record<string, string> = {
      overview: "⊞", tasks: "✓", projects: "◈", priorities: "▲", filters: "⊟",
      contacts: "◉", pipeline: "→", deals: "◆", activities: "◷", metrics: "◎",
      reports: "◑", trends: "↗", users: "◑", team: "◑", settings: "⊙",
      billing: "◈", notifications: "◍", income: "↑", expenses: "↓", invoices: "◧",
      data: "◫", export: "↗", sprints: "◈", milestones: "◉",
    };
    const icon  = icons[v] ?? "◦";
    const label = v.charAt(0).toUpperCase() + v.slice(1).replace(/-/g, " ");
    return `      <div class="nav-item${i === 0 ? " active" : ""}" data-view="${v}">${icon} ${label}</div>`;
  }).join("\n");

  // Build metric cards
  const metricDefs: Record<string, Array<{ num: string; label: string; trend: string }>> = {
    tasks:     [{ num: "48", label: "Tasks Total", trend: "+12%" }, { num: "16", label: "In Progress", trend: "active" }, { num: "29", label: "Completed", trend: "+8%" }, { num: "3",  label: "Overdue",    trend: "!3" }],
    crm:       [{ num: "284", label: "Contacts",    trend: "+22" }, { num: "$84k", label: "Pipeline",   trend: "+5%" }, { num: "18", label: "Open Deals",  trend: "active" }, { num: "94%", label: "Win Rate",    trend: "+2%" }],
    analytics: [{ num: "12.4k", label: "Users",    trend: "+18%" }, { num: "4.2k", label: "Sessions",  trend: "+9%" }, { num: "3:42", label: "Avg Time",   trend: "stable" }, { num: "7.8%", label: "Conversion", trend: "+1.2%" }],
    pm:        [{ num: "6",  label: "Projects",   trend: "active" }, { num: "38", label: "Tasks Open",  trend: "14 due" }, { num: "73%", label: "Progress",   trend: "+5%" }, { num: "8",  label: "Team",        trend: "online" }],
    finance:   [{ num: "$128k", label: "Revenue",  trend: "+14%" }, { num: "$46k", label: "Expenses",  trend: "-3%" }, { num: "$82k", label: "Net Profit",  trend: "+18%" }, { num: "24",  label: "Invoices",    trend: "3 due" }],
    saas:      [{ num: "1.2k", label: "Users",    trend: "+8%" },  { num: "98%", label: "Uptime",     trend: "ok" }, { num: "$4.2k", label: "MRR",         trend: "+12%" }, { num: "24ms", label: "Latency",     trend: "good" }],
    generic:   [{ num: "248", label: "Records",   trend: "+12" }, { num: "18",  label: "Active",      trend: "live" }, { num: "94%", label: "Success",     trend: "+2%" }, { num: "12",  label: "Pending",     trend: "low" }],
  };
  const metrics = (metricDefs[design.appType] ?? metricDefs["generic"]!);
  const metricCards = metrics.map((m) => `
        <div class="metric-card${hasGlow ? " glow" : ""}">
          <span class="metric-num">${m.num}</span>
          <span class="metric-label">${m.label}</span>
          <span class="metric-trend">${m.trend}</span>
        </div>`).join("");

  // Build module cards for main overview
  const moduleCards = modules.slice(0, 6).map((mod, i) => {
    const modIcons: Record<string, string> = {
      tasks: "✓", projects: "◈", priorities: "▲", filters: "⊟", contacts: "◉",
      pipeline: "→", deals: "◆", activities: "◷", metrics: "◎", reports: "◑",
      trends: "↗", users: "◑", team: "◑", settings: "⊙", billing: "◈",
      overview: "⊞", notifications: "◍", income: "↑", expenses: "↓",
      invoices: "◧", data: "◫", export: "↗", sprints: "◈", milestones: "◉",
    };
    const isActive = i < 3;
    const label    = mod.charAt(0).toUpperCase() + mod.slice(1).replace(/-/g, " ");
    const icon     = modIcons[mod] ?? "◦";
    const v2label  = releases[1] ? releases[1].version : "v2";
    return `
        <div class="module-card${isActive ? " active" : " coming-soon"}" data-view="${mod}">
          <div class="card-icon">${icon}</div>
          <h3>${label}</h3>
          ${isActive
            ? `<span class="badge live">Available</span>`
            : `<span class="badge soon">Soon ${v2label}</span>`}
        </div>`;
  }).join("");

  // Build task table (if table component present)
  const taskTableHTML = hasTable ? `
      <!-- TABLE VIEW -->
      <div class="view-section hidden" data-view-id="tasks">
        ${hasSearch ? `<div class="search-bar"><input type="text" id="task-search" placeholder="Search tasks…" class="search-input"><span class="search-icon">⌕</span></div>` : ""}
        <table class="data-table" id="tasks-table">
          <thead><tr><th>#</th><th>Task</th><th>Project</th><th>Priority</th><th>Status</th><th>Due</th></tr></thead>
          <tbody id="tasks-body"></tbody>
        </table>
      </div>` : "";

  const roadmapRows = releases.length > 0 ? releases.map((r, i) => {
    const done = i === 0;
    return `<div class="release-row${done ? " done" : " pending"}"><span class="rel-tag">${r.version}</span> ${r.goals.join(", ") || r.version} — ${done ? "✓ Done" : "⏳ Pending"}</div>`;
  }).join("\n") : "";

  const sidebarLayout = hasSidebar ? `
  <!-- SIDEBAR LAYOUT -->
  <section id="dashboard-section" class="hidden">
    <aside class="sidebar">
      <div class="sidebar-brand">${name}</div>
      <nav class="sidebar-nav">
${navItems}
      </nav>
      <div class="sidebar-footer" id="sidebar-user"></div>
    </aside>
    <main class="main-content">
      <header class="content-header">
        <div class="header-left">
          <h2 id="view-title">Overview</h2>
          <span class="breadcrumb">Dashboard / <span id="view-breadcrumb">Overview</span></span>
        </div>
        <div class="header-right">
          ${hasSearch ? `<div class="search-bar"><input type="text" id="global-search" placeholder="Search…" class="search-input"><span class="search-icon">⌕</span></div>` : ""}
          <button id="logout-btn" class="logout-btn">Sign out</button>
        </div>
      </header>

      <!-- OVERVIEW VIEW -->
      <div class="view-section" data-view-id="overview">
        ${hasMetrics ? `<div class="metrics-row">${metricCards}</div>` : ""}
        <h3 class="section-title">Modules</h3>
        <div class="module-grid">${moduleCards}</div>
        ${releases.length > 0 ? `<div class="releases-roadmap"><h3>Roadmap</h3>${roadmapRows}</div>` : ""}
      </div>

      ${taskTableHTML}
    </main>
  </section>` : `
  <!-- TOPBAR LAYOUT -->
  <section id="dashboard-section" class="hidden">
    <nav class="topbar">
      <span class="nav-brand">${name}</span>
      <div class="topbar-nav">
${navItems.replace(/      /g, "        ")}
      </div>
      <button id="logout-btn" class="logout-btn">Sign out</button>
    </nav>
    <main class="main-content topbar-main">
      ${hasMetrics ? `<div class="metrics-row">${metricCards}</div>` : ""}
      <div class="module-grid">${moduleCards}</div>
      ${releases.length > 0 ? `<div class="releases-roadmap"><h3>Roadmap</h3>${roadmapRows}</div>` : ""}
      ${taskTableHTML}
    </main>
  </section>`;

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${name}</title>
  <link rel="stylesheet" href="styles.css">
</head>
<body>

  <!-- LOGIN -->
  <section id="login-section">
    <div class="login-box">
      <div class="logo">
        <div class="logo-icon">◈</div>
        <h1>${name}</h1>
        <p class="tagline">${design.appType.charAt(0).toUpperCase() + design.appType.slice(1)} Platform</p>
      </div>
      <input type="text" id="username" placeholder="Email or username">
      <input type="password" id="password" placeholder="Password">
      <button id="login-btn">Sign in</button>
      <p id="login-error" class="error hidden">Invalid credentials — try again.</p>
    </div>
  </section>
${sidebarLayout}

  <script src="script.js"></script>
</body>
</html>
`;
}

function buildSaaSCSS(design: WebDesign): string {
  const hasSidebar = design.components.includes("sidebar");
  const hasGlow    = design.components.includes("glow");
  const hasGlass   = design.components.includes("glassmorphism");
  const hasAnim    = design.components.includes("animations");

  return `* {
  box-sizing: border-box;
  margin: 0;
  padding: 0;
}

:root {
  --bg:       #080c18;
  --surface:  #0f1629;
  --surface2: #131c35;
  --border:   #1e2d55;
  --accent:   #00e5ff;
  --accent2:  #7c4dff;
  --text:     #e0e8ff;
  --muted:    #7b8bbf;
  --success:  #00e5a0;
  --warn:     #ff9800;
  --danger:   #ff4d6d;
  --sidebar-w: 220px;
  --glow-cyan: ${hasGlow ? "0 0 24px rgba(0,229,255,0.25)" : "none"};
  --glow-strong: ${hasGlow ? "0 0 40px rgba(0,229,255,0.35)" : "none"};
}

${hasAnim ? `@keyframes fadeIn {
  from { opacity: 0; transform: translateY(10px); }
  to   { opacity: 1; transform: translateY(0); }
}
@keyframes slideInLeft {
  from { opacity: 0; transform: translateX(-16px); }
  to   { opacity: 1; transform: translateX(0); }
}
@keyframes pulse-glow {
  0%, 100% { box-shadow: 0 0 0 0 rgba(0,229,255,0); }
  50%       { box-shadow: 0 0 18px 4px rgba(0,229,255,0.2); }
}
@keyframes shake {
  0%, 100% { transform: translateX(0); }
  20%       { transform: translateX(-8px); }
  40%       { transform: translateX(8px); }
  60%       { transform: translateX(-5px); }
  80%       { transform: translateX(5px); }
}` : ""}

body {
  font-family: 'Segoe UI', system-ui, sans-serif;
  background: var(--bg);
  color: var(--text);
  min-height: 100vh;
}

.hidden { display: none !important; }

/* ── LOGIN ── */
#login-section {
  display: flex;
  align-items: center;
  justify-content: center;
  min-height: 100vh;
  background: radial-gradient(ellipse at 50% 40%, rgba(0,229,255,0.07) 0%, transparent 70%);
  ${hasAnim ? "animation: fadeIn 0.5s ease both;" : ""}
}

.login-box {
  ${hasGlass
    ? "background: rgba(15,22,41,0.6); backdrop-filter: blur(24px); -webkit-backdrop-filter: blur(24px);"
    : "background: var(--surface);"}
  border: 1px solid var(--border);
  border-radius: 18px;
  padding: 2.75rem 2.25rem;
  width: 380px;
  display: flex;
  flex-direction: column;
  gap: 1.1rem;
  box-shadow: 0 0 60px rgba(0,229,255,0.1), 0 12px 40px rgba(0,0,0,0.6);
  ${hasAnim ? "animation: fadeIn 0.6s ease both;" : ""}
}

.logo { text-align: center; margin-bottom: 0.5rem; }
.logo-icon { font-size: 2.5rem; color: var(--accent); }
.logo h1 {
  font-size: 2rem;
  background: linear-gradient(90deg, var(--accent), var(--accent2));
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
  background-clip: text;
  font-weight: 700;
  margin-top: 0.3rem;
}
.tagline { color: var(--muted); font-size: 0.85rem; margin-top: 0.2rem; }

.login-box input {
  background: rgba(7,11,22,0.8);
  border: 1px solid var(--border);
  border-radius: 9px;
  color: var(--text);
  padding: 0.8rem 1rem;
  font-size: 0.95rem;
  transition: border-color 0.2s, box-shadow 0.2s;
}
.login-box input:focus {
  outline: none;
  border-color: var(--accent);
  box-shadow: 0 0 0 3px rgba(0,229,255,0.14);
}
.login-box input::placeholder { color: var(--muted); }

#login-btn {
  background: linear-gradient(135deg, var(--accent) 0%, var(--accent2) 100%);
  border: none;
  border-radius: 9px;
  color: #080c18;
  font-weight: 700;
  font-size: 1rem;
  padding: 0.85rem;
  cursor: pointer;
  ${hasAnim ? "transition: transform 0.15s, box-shadow 0.2s;" : ""}
}
${hasAnim ? `#login-btn:hover { transform: translateY(-1px); box-shadow: var(--glow-strong); }` : ""}
.error { color: var(--danger); font-size: 0.875rem; }

/* ── SIDEBAR LAYOUT ── */
#dashboard-section {
  display: flex;
  min-height: 100vh;
  ${hasAnim ? "animation: fadeIn 0.4s ease both;" : ""}
}

.sidebar {
  width: var(--sidebar-w);
  min-height: 100vh;
  background: var(--surface);
  border-right: 1px solid var(--border);
  display: flex;
  flex-direction: column;
  padding: 1.5rem 0;
  position: fixed;
  top: 0; left: 0;
  ${hasAnim ? "animation: slideInLeft 0.35s ease both;" : ""}
}
.sidebar-brand {
  font-size: 1.1rem;
  font-weight: 700;
  color: var(--accent);
  padding: 0 1.25rem 1.5rem;
  border-bottom: 1px solid var(--border);
  margin-bottom: 1rem;
}
.sidebar-nav { flex: 1; display: flex; flex-direction: column; gap: 0.2rem; padding: 0 0.75rem; }
.nav-item {
  display: flex;
  align-items: center;
  gap: 0.6rem;
  padding: 0.65rem 0.9rem;
  border-radius: 8px;
  color: var(--muted);
  cursor: pointer;
  font-size: 0.9rem;
  ${hasAnim ? "transition: background 0.15s, color 0.15s;" : ""}
}
.nav-item:hover, .nav-item.active {
  background: rgba(0,229,255,0.08);
  color: var(--accent);
}
.sidebar-footer {
  padding: 1rem 1.25rem 0;
  border-top: 1px solid var(--border);
  color: var(--muted);
  font-size: 0.8rem;
  margin-top: 1rem;
}

/* ── MAIN CONTENT ── */
.main-content {
  flex: 1;
  margin-left: var(--sidebar-w);
  min-height: 100vh;
  display: flex;
  flex-direction: column;
}
.content-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 1.25rem 2rem;
  background: var(--surface);
  border-bottom: 1px solid var(--border);
  position: sticky; top: 0; z-index: 10;
}
.header-left h2 { font-size: 1.3rem; font-weight: 700; }
.breadcrumb { color: var(--muted); font-size: 0.8rem; margin-top: 2px; display: block; }
.header-right { display: flex; align-items: center; gap: 1rem; }

/* ── TOPBAR (alternate layout) ── */
.topbar {
  position: sticky; top: 0; z-index: 10;
  display: flex; align-items: center; gap: 1.5rem;
  padding: 0 2rem;
  height: 56px;
  ${hasGlass
    ? "background: rgba(15,22,41,0.75); backdrop-filter: blur(20px); -webkit-backdrop-filter: blur(20px);"
    : "background: var(--surface);"}
  border-bottom: 1px solid var(--border);
}
.nav-brand { font-weight: 700; font-size: 1rem; color: var(--accent); }
.topbar-nav { display: flex; gap: 0.25rem; flex: 1; }
.topbar-main { padding: 2rem; }
.logout-btn {
  background: transparent;
  border: 1px solid var(--border);
  color: var(--muted);
  border-radius: 6px;
  padding: 0.4rem 0.9rem;
  cursor: pointer;
  font-size: 0.85rem;
  ${hasAnim ? "transition: color 0.15s, border-color 0.15s;" : ""}
}
.logout-btn:hover { color: var(--danger); border-color: var(--danger); }

/* ── VIEW SECTIONS ── */
.view-section { padding: 2rem; }

/* ── METRICS ── */
.metrics-row {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(160px, 1fr));
  gap: 1rem;
  margin-bottom: 2rem;
}
.metric-card {
  background: var(--surface2);
  border: 1px solid var(--border);
  border-radius: 12px;
  padding: 1.25rem 1.5rem;
  display: flex;
  flex-direction: column;
  gap: 0.35rem;
  ${hasAnim ? "animation: fadeIn 0.5s ease both;" : ""}
}
${hasGlow ? `.metric-card.glow:hover { box-shadow: var(--glow-cyan); border-color: var(--accent); transition: box-shadow 0.2s, border-color 0.2s; }` : ""}
.metric-num { font-size: 1.8rem; font-weight: 700; color: var(--accent); }
.metric-label { font-size: 0.8rem; color: var(--muted); }
.metric-trend { font-size: 0.75rem; color: var(--success); }

/* ── MODULE GRID ── */
.section-title { font-size: 1rem; font-weight: 600; color: var(--muted); margin-bottom: 1rem; text-transform: uppercase; letter-spacing: 0.05em; }
.module-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(140px, 1fr));
  gap: 1rem;
  margin-bottom: 2rem;
}
.module-card {
  background: var(--surface2);
  border: 1px solid var(--border);
  border-radius: 12px;
  padding: 1.25rem;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 0.5rem;
  text-align: center;
  cursor: pointer;
  ${hasAnim ? "transition: transform 0.15s, box-shadow 0.2s, border-color 0.2s;" : ""}
}
.module-card.active:hover {
  transform: translateY(-2px);
  border-color: var(--accent);
  ${hasGlow ? "box-shadow: var(--glow-cyan);" : ""}
}
.module-card.coming-soon { opacity: 0.5; cursor: default; }
.card-icon { font-size: 1.6rem; color: var(--accent); }
.module-card h3 { font-size: 0.9rem; font-weight: 600; }
.badge { font-size: 0.7rem; padding: 0.2rem 0.55rem; border-radius: 20px; font-weight: 600; }
.badge.live { background: rgba(0,229,160,0.15); color: var(--success); }
.badge.soon { background: rgba(255,152,0,0.12); color: var(--warn); }

/* ── SEARCH ── */
.search-bar { position: relative; margin-bottom: 1.25rem; }
.search-input {
  width: 100%;
  max-width: 360px;
  background: var(--surface2);
  border: 1px solid var(--border);
  border-radius: 8px;
  color: var(--text);
  padding: 0.6rem 1rem 0.6rem 2.4rem;
  font-size: 0.9rem;
  ${hasAnim ? "transition: border-color 0.2s, box-shadow 0.2s;" : ""}
}
.search-input:focus { outline: none; border-color: var(--accent); box-shadow: 0 0 0 3px rgba(0,229,255,0.1); }
.search-input::placeholder { color: var(--muted); }
.search-icon { position: absolute; left: 0.75rem; top: 50%; transform: translateY(-50%); color: var(--muted); pointer-events: none; }

/* ── TABLE ── */
.data-table {
  width: 100%;
  border-collapse: collapse;
  background: var(--surface2);
  border-radius: 10px;
  overflow: hidden;
  font-size: 0.875rem;
}
.data-table thead { background: rgba(0,229,255,0.05); }
.data-table th { padding: 0.75rem 1rem; text-align: left; color: var(--muted); font-weight: 600; font-size: 0.75rem; text-transform: uppercase; letter-spacing: 0.04em; border-bottom: 1px solid var(--border); }
.data-table td { padding: 0.75rem 1rem; border-bottom: 1px solid rgba(30,45,85,0.5); }
.data-table tr:last-child td { border-bottom: none; }
.data-table tr:hover td { background: rgba(0,229,255,0.03); }

/* ── PRIORITY / STATUS BADGES ── */
.priority { font-size: 0.7rem; padding: 0.15rem 0.5rem; border-radius: 4px; font-weight: 600; }
.priority-high   { background: rgba(255,77,109,0.15); color: var(--danger); }
.priority-medium { background: rgba(255,152,0,0.12);  color: var(--warn); }
.priority-low    { background: rgba(0,229,160,0.1);   color: var(--success); }
.status { font-size: 0.7rem; padding: 0.15rem 0.5rem; border-radius: 4px; }
.status-done     { background: rgba(0,229,160,0.1);   color: var(--success); }
.status-progress { background: rgba(0,229,255,0.1);   color: var(--accent); }
.status-todo     { background: rgba(123,75,255,0.1);  color: var(--accent2); }

/* ── ROADMAP ── */
.releases-roadmap {
  background: var(--surface2);
  border: 1px solid var(--border);
  border-radius: 10px;
  padding: 1.25rem 1.5rem;
  margin-top: 2rem;
}
.releases-roadmap h3 { font-size: 0.85rem; text-transform: uppercase; letter-spacing: 0.06em; color: var(--muted); margin-bottom: 0.75rem; }
.release-row { padding: 0.5rem 0; border-bottom: 1px solid rgba(30,45,85,0.4); font-size: 0.875rem; }
.release-row:last-child { border-bottom: none; }
.release-row.done { color: var(--success); }
.release-row.pending { color: var(--muted); }
.rel-tag { font-weight: 700; margin-right: 0.5rem; color: var(--accent); }
`;
}

function buildSaaSJS(design: WebDesign): string {
  const hasTable  = design.components.includes("table");
  const hasSearch = design.components.includes("search");
  const hasSidebar = design.components.includes("sidebar");

  const taskData = design.appType === "tasks" ? `
var tasks = [
  { id: 1, name: 'Design login screen',     project: 'App Redesign',  priority: 'high',   status: 'done',     due: '2026-03-10' },
  { id: 2, name: 'Build sidebar navigation',project: 'App Redesign',  priority: 'high',   status: 'done',     due: '2026-03-12' },
  { id: 3, name: 'Integrate metrics API',   project: 'Analytics',     priority: 'medium', status: 'progress', due: '2026-04-05' },
  { id: 4, name: 'Write unit tests',        project: 'Core',          priority: 'medium', status: 'todo',     due: '2026-04-10' },
  { id: 5, name: 'Deploy to staging',       project: 'Infrastructure',priority: 'high',   status: 'progress', due: '2026-04-03' },
  { id: 6, name: 'UX review session',       project: 'App Redesign',  priority: 'low',    status: 'todo',     due: '2026-04-15' },
  { id: 7, name: 'Performance audit',       project: 'Core',          priority: 'medium', status: 'todo',     due: '2026-04-20' },
  { id: 8, name: 'User onboarding flow',    project: 'Product',       priority: 'high',   status: 'progress', due: '2026-04-08' },
];

function renderTasks(filter) {
  var rows = tasks;
  if (filter) rows = rows.filter(function(t) {
    return t.name.toLowerCase().includes(filter.toLowerCase())
      || t.project.toLowerCase().includes(filter.toLowerCase());
  });
  var tbody = document.getElementById('tasks-body');
  if (!tbody) return;
  tbody.innerHTML = rows.map(function(t) {
    return '<tr>'
      + '<td>' + t.id + '</td>'
      + '<td>' + t.name + '</td>'
      + '<td>' + t.project + '</td>'
      + '<td><span class="priority priority-' + t.priority + '">' + t.priority + '</span></td>'
      + '<td><span class="status status-' + t.status + '">' + t.status + '</span></td>'
      + '<td>' + t.due + '</td>'
      + '</tr>';
  }).join('');
}` : "";

  const searchInit = hasSearch && hasTable && design.appType === "tasks" ? `
var taskSearch = document.getElementById('task-search');
if (taskSearch) taskSearch.addEventListener('input', function() { renderTasks(taskSearch.value); });
var globalSearch = document.getElementById('global-search');
if (globalSearch) globalSearch.addEventListener('input', function() {
  if (currentView === 'tasks') renderTasks(globalSearch.value);
});` : "";

  const navLogic = hasSidebar ? `
var currentView = 'overview';
function navegarVista(view) {
  currentView = view;
  document.querySelectorAll('.view-section').forEach(function(s) {
    var id = s.getAttribute('data-view-id');
    if (id === view) s.classList.remove('hidden');
    else s.classList.add('hidden');
  });
  document.querySelectorAll('.nav-item').forEach(function(el) {
    el.classList.toggle('active', el.getAttribute('data-view') === view);
  });
  var titleEl = document.getElementById('view-title');
  var bcEl    = document.getElementById('view-breadcrumb');
  var label   = view.charAt(0).toUpperCase() + view.slice(1).replace(/-/g, ' ');
  if (titleEl) titleEl.textContent = label;
  if (bcEl) bcEl.textContent = label;
  if (view === 'tasks') renderTasks('');
}

document.querySelectorAll('.nav-item').forEach(function(el) {
  el.addEventListener('click', function() {
    var view = el.getAttribute('data-view');
    if (view) navegarVista(view);
  });
});
document.querySelectorAll('.module-card.active').forEach(function(card) {
  card.addEventListener('click', function() {
    var view = card.getAttribute('data-view');
    if (view) navegarVista(view);
  });
});` : "";

  return `(function() {
'use strict';

var loginSection  = document.getElementById('login-section');
var dashSection   = document.getElementById('dashboard-section');
var loginBtn      = document.getElementById('login-btn');
var logoutBtn     = document.getElementById('logout-btn');
var loginError    = document.getElementById('login-error');
var sidebarUser   = document.getElementById('sidebar-user');
${taskData}
${navLogic}
${searchInit}

function transition(hide, show) {
  hide.classList.add('hidden');
  show.classList.remove('hidden');
}

loginBtn.addEventListener('click', function() {
  var user = document.getElementById('username').value.trim();
  var pass = document.getElementById('password').value;
  if (user && pass) {
    transition(loginSection, dashSection);
    if (sidebarUser) sidebarUser.textContent = user;
    ${design.appType === "tasks" ? "renderTasks('');" : ""}
    console.log('[${design.productName}] login OK:', user);
  } else {
    loginError.classList.remove('hidden');
    ${design.components.includes("animations") ? `
    var box = document.querySelector('.login-box');
    box.style.animation = 'none';
    box.offsetHeight;
    box.style.animation = 'shake 0.4s ease';` : ""}
  }
});

if (logoutBtn) {
  logoutBtn.addEventListener('click', function() {
    transition(dashSection, loginSection);
    document.getElementById('username').value = '';
    document.getElementById('password').value = '';
    console.log('[${design.productName}] signed out');
  });
}

}());
`;
}

// ---------------------------------------------------------------------------
// Content factory — selects templates based on domain + releases
// ---------------------------------------------------------------------------

function buildWebContent(
  domain: string | undefined,
  releases: Release[],
  design?: WebDesign
): Record<string, string> {
  if (domain === "school") {
    return {
      "index.html": buildSchoolHTML(releases),
      "styles.css": buildSchoolCSS(),
      "script.js":  buildSchoolJS(),
    };
  }
  // Phase 29: design-aware rich template for non-domain web products
  if (design && design.appType !== "generic") {
    return {
      "index.html": buildSaaSHTML(design, releases),
      "styles.css": buildSaaSCSS(design),
      "script.js":  buildSaaSJS(design),
    };
  }
  // Future: add "sales" domain here
  return {
    "index.html": GENERIC_HTML,
    "styles.css": GENERIC_CSS,
    "script.js":  GENERIC_JS,
  };
}

/** Files that belong to the web planner output (used for safe overwrite detection). */
const WEB_PLANNER_FILES = new Set(["index.html", "styles.css", "script.js"]);

// ---------------------------------------------------------------------------
// School domain v2 content builders — Phase 26
// Implements: matrícula, alumnos, cursos, pagos mock modules
// ---------------------------------------------------------------------------

function buildSchoolV2HTML(): string {
  return `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>EduNova — Plataforma Escolar v2</title>
  <link rel="stylesheet" href="styles.css">
</head>
<body>

  <!-- LOGIN -->
  <section id="login-section">
    <div class="login-box">
      <div class="logo">
        <div class="logo-icon">&#127891;</div>
        <h1>EduNova</h1>
        <p class="tagline">Plataforma Escolar</p>
      </div>
      <input type="text" id="username" placeholder="Usuario o correo institucional">
      <input type="password" id="password" placeholder="Contrasena">
      <button id="login-btn">Ingresar al Sistema</button>
      <p id="login-error" class="error hidden">Credenciales incorrectas. Intente de nuevo.</p>
    </div>
  </section>

  <!-- DASHBOARD v2 -->
  <section id="dashboard-section" class="hidden">
    <nav class="topbar">
      <span class="nav-brand">&#127891; EduNova</span>
      <span id="nav-user" class="nav-user"></span>
      <span class="version-badge">v2</span>
      <button id="logout-btn">Salir</button>
    </nav>

    <div class="app-layout">
      <aside class="sidebar">
        <nav class="sidebar-nav">
          <button class="nav-item active" data-view="overview">
            <span class="ni-icon">&#127968;</span>
            <span class="ni-label">Panel</span>
          </button>
          <button class="nav-item" data-view="alumnos">
            <span class="ni-icon">&#127891;</span>
            <span class="ni-label">Alumnos</span>
          </button>
          <button class="nav-item" data-view="matricula">
            <span class="ni-icon">&#128221;</span>
            <span class="ni-label">Matricula</span>
          </button>
          <button class="nav-item" data-view="cursos">
            <span class="ni-icon">&#128218;</span>
            <span class="ni-label">Cursos</span>
          </button>
          <button class="nav-item" data-view="pagos">
            <span class="ni-icon">&#128179;</span>
            <span class="ni-label">Pagos</span>
          </button>
        </nav>
      </aside>

      <main class="dashboard-main">

        <!-- OVERVIEW -->
        <div id="view-overview" class="module-view">
          <div class="view-header">
            <h2>Panel Principal</h2>
            <p class="dash-subtitle">Ciclo escolar 2025-2026</p>
          </div>
          <div class="stats-row">
            <div class="stat-card"><span class="stat-num" id="stat-alumnos">0</span><span class="stat-label">Alumnos activos</span></div>
            <div class="stat-card"><span class="stat-num" id="stat-cursos">0</span><span class="stat-label">Cursos activos</span></div>
            <div class="stat-card"><span class="stat-num">18</span><span class="stat-label">Docentes</span></div>
            <div class="stat-card"><span class="stat-num">94%</span><span class="stat-label">Asistencia promedio</span></div>
          </div>
          <h3 class="modules-title">Modulos activos</h3>
          <div class="cards-row">
            <div class="card active" data-view="alumnos"><div class="card-icon">&#127891;</div><h3>Alumnos</h3><p class="card-meta" id="card-alumnos-meta">0 registrados</p><span class="badge live">Disponible</span></div>
            <div class="card active" data-view="matricula"><div class="card-icon">&#128221;</div><h3>Matricula</h3><p class="card-meta">Inscripcion y alta de alumnos</p><span class="badge live">Disponible</span></div>
            <div class="card active" data-view="cursos"><div class="card-icon">&#128218;</div><h3>Cursos</h3><p class="card-meta" id="card-cursos-meta">0 activos</p><span class="badge live">Disponible</span></div>
            <div class="card active" data-view="pagos"><div class="card-icon">&#128179;</div><h3>Pagos</h3><p class="card-meta">Colegiatura y recibos</p><span class="badge live">Disponible</span></div>
            <div class="card coming-soon"><div class="card-icon">&#128197;</div><h3>Horarios</h3><p class="card-meta">Vista semanal interactiva</p><span class="badge v3">Proximamente v3</span></div>
          </div>
          <div class="releases-roadmap">
            <h3>Roadmap de Releases</h3>
            <div class="release-row done"><span class="rel-tag">v1</span> Base — Login + dashboard &#10003; Ejecutado</div>
            <div class="release-row done"><span class="rel-tag">v2</span> Matricula, alumnos, cursos, pagos &#10003; Ejecutado</div>
            <div class="release-row pending"><span class="rel-tag">v3</span> Horarios, reportes &#8987; Pendiente</div>
          </div>
        </div>

        <!-- ALUMNOS -->
        <div id="view-alumnos" class="module-view hidden">
          <div class="view-header">
            <h2>Alumnos</h2>
            <button class="btn-primary" id="btn-ir-matricula">+ Nueva matricula</button>
          </div>
          <div class="search-bar">
            <input type="text" id="search-alumnos" placeholder="Buscar alumno por nombre o matricula...">
          </div>
          <table class="data-table">
            <thead>
              <tr><th>Matricula</th><th>Nombre</th><th>Grado</th><th>Estado</th><th>Ingreso</th></tr>
            </thead>
            <tbody id="tbody-alumnos"></tbody>
          </table>
        </div>

        <!-- MATRICULA -->
        <div id="view-matricula" class="module-view hidden">
          <div class="view-header">
            <h2>Nueva Matricula</h2>
          </div>
          <div class="form-card">
            <h3 class="form-section-title">Datos del alumno</h3>
            <div class="form-grid">
              <div class="form-group">
                <label>Nombre(s)</label>
                <input type="text" id="mat-nombre" placeholder="Ej: Maria">
              </div>
              <div class="form-group">
                <label>Apellidos</label>
                <input type="text" id="mat-apellidos" placeholder="Ej: Garcia Lopez">
              </div>
              <div class="form-group">
                <label>Grado</label>
                <select id="mat-grado">
                  <option value="1 Primaria">1 Primaria</option>
                  <option value="2 Primaria">2 Primaria</option>
                  <option value="3 Primaria">3 Primaria</option>
                  <option value="1 Secundaria">1 Secundaria</option>
                  <option value="2 Secundaria">2 Secundaria</option>
                  <option value="3 Secundaria">3 Secundaria</option>
                </select>
              </div>
              <div class="form-group">
                <label>Correo (tutor)</label>
                <input type="email" id="mat-correo" placeholder="tutor@email.com">
              </div>
            </div>
            <div class="form-actions">
              <button class="btn-secondary" id="btn-cancelar-mat">Cancelar</button>
              <button class="btn-primary" id="btn-matricular">Matricular alumno</button>
            </div>
            <div id="mat-success" class="mat-success hidden">Alumno matriculado correctamente</div>
            <div id="mat-error" class="mat-error hidden">Complete todos los campos obligatorios</div>
          </div>
        </div>

        <!-- CURSOS -->
        <div id="view-cursos" class="module-view hidden">
          <div class="view-header">
            <h2>Cursos</h2>
          </div>
          <table class="data-table">
            <thead>
              <tr><th>Codigo</th><th>Nombre</th><th>Grado</th><th>Docente</th><th>Alumnos</th><th>Estado</th></tr>
            </thead>
            <tbody id="tbody-cursos"></tbody>
          </table>
        </div>

        <!-- PAGOS -->
        <div id="view-pagos" class="module-view hidden">
          <div class="view-header">
            <h2>Pagos</h2>
          </div>
          <div class="stats-row">
            <div class="stat-card"><span class="stat-num" id="stat-pagos-total">0</span><span class="stat-label">Pagos registrados</span></div>
            <div class="stat-card"><span class="stat-num" id="stat-pagos-monto">$0</span><span class="stat-label">Total cobrado</span></div>
            <div class="stat-card"><span class="stat-num" id="stat-pagos-pendientes">0</span><span class="stat-label">Pendientes</span></div>
          </div>
          <table class="data-table">
            <thead>
              <tr><th>Folio</th><th>Alumno</th><th>Concepto</th><th>Monto</th><th>Estado</th><th>Fecha</th></tr>
            </thead>
            <tbody id="tbody-pagos"></tbody>
          </table>
        </div>

      </main>
    </div>
  </section>

  <script src="script.js"></script>
</body>
</html>
`;
}

function buildSchoolV2CSS(): string {
  return `* {
  box-sizing: border-box;
  margin: 0;
  padding: 0;
}

:root {
  --bg:      #080c18;
  --surface: #0f1629;
  --border:  #1e2d55;
  --accent:  #4fc3f7;
  --accent2: #7c4dff;
  --text:    #e0e8ff;
  --muted:   #7b8bbf;
  --success: #00e5a0;
  --warn:    #ff9800;
  --glow:    0 0 24px rgba(79, 195, 247, 0.22);
  --glow-strong: 0 0 40px rgba(79, 195, 247, 0.35);
}

@keyframes fadeIn {
  from { opacity: 0; transform: translateY(12px); }
  to   { opacity: 1; transform: translateY(0); }
}
@keyframes slideUp {
  from { opacity: 0; transform: translateY(20px); }
  to   { opacity: 1; transform: translateY(0); }
}
@keyframes revealCard {
  from { opacity: 0; transform: translateY(16px) scale(0.97); }
  to   { opacity: 1; transform: translateY(0)   scale(1); }
}
@keyframes shake {
  0%, 100% { transform: translateX(0); }
  20%       { transform: translateX(-8px); }
  40%       { transform: translateX(8px); }
  60%       { transform: translateX(-5px); }
  80%       { transform: translateX(5px); }
}
@keyframes shimmer {
  0%   { background-position: -200% center; }
  100% { background-position:  200% center; }
}

body {
  font-family: 'Segoe UI', system-ui, sans-serif;
  background: var(--bg);
  color: var(--text);
  min-height: 100vh;
  display: flex;
  flex-direction: column;
}

.hidden { display: none !important; }

/* ── LOGIN ── */
#login-section {
  display: flex;
  align-items: center;
  justify-content: center;
  min-height: 100vh;
  background: radial-gradient(ellipse at 50% 40%, rgba(79,195,247,0.08) 0%, transparent 70%);
  animation: fadeIn 0.5s ease both;
}

.login-box {
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: 18px;
  padding: 2.75rem 2.25rem;
  width: 380px;
  display: flex;
  flex-direction: column;
  gap: 1.1rem;
  box-shadow: 0 0 60px rgba(79,195,247,0.1), 0 12px 40px rgba(0,0,0,0.6);
  animation: fadeIn 0.55s ease both;
}

.logo { text-align: center; margin-bottom: 0.5rem; }
.logo-icon { font-size: 2.75rem; }
.logo h1 {
  font-size: 2.1rem;
  background: linear-gradient(90deg, var(--accent), var(--accent2));
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
  background-clip: text;
  font-weight: 700;
  margin-top: 0.3rem;
}
.tagline { color: var(--muted); font-size: 0.875rem; margin-top: 0.25rem; }

.login-box input {
  background: #070b16;
  border: 1px solid var(--border);
  border-radius: 9px;
  color: var(--text);
  padding: 0.8rem 1rem;
  font-size: 0.95rem;
  transition: border-color 0.25s, box-shadow 0.25s;
}
.login-box input:focus {
  outline: none;
  border-color: var(--accent);
  box-shadow: 0 0 0 3px rgba(79,195,247,0.14);
}
.login-box input::placeholder { color: var(--muted); }

#login-btn {
  background: linear-gradient(135deg, var(--accent) 0%, var(--accent2) 100%);
  border: none;
  border-radius: 9px;
  color: #fff;
  padding: 0.85rem;
  font-size: 1rem;
  font-weight: 600;
  cursor: pointer;
  transition: opacity 0.2s, transform 0.18s, box-shadow 0.25s;
}
#login-btn:hover {
  opacity: 0.92;
  transform: translateY(-2px);
  box-shadow: 0 6px 20px rgba(79,195,247,0.3);
}
#login-btn:active { transform: translateY(0); }
.error { color: #ef5350; font-size: 0.85rem; text-align: center; }

/* ── TOPBAR ── */
#dashboard-section {
  display: flex;
  flex-direction: column;
  min-height: 100vh;
  animation: fadeIn 0.4s ease both;
}

.topbar {
  display: flex;
  align-items: center;
  gap: 1rem;
  padding: 0.9rem 2rem;
  background: rgba(15, 22, 41, 0.85);
  backdrop-filter: blur(14px);
  -webkit-backdrop-filter: blur(14px);
  border-bottom: 1px solid var(--border);
  position: sticky;
  top: 0;
  z-index: 10;
}
.nav-brand {
  font-size: 1.1rem;
  font-weight: 700;
  background: linear-gradient(90deg, var(--accent), var(--accent2));
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
  background-clip: text;
  flex: 1;
}
.nav-user { color: var(--muted); font-size: 0.9rem; }
#logout-btn {
  background: transparent;
  border: 1px solid var(--border);
  border-radius: 6px;
  color: var(--muted);
  padding: 0.4rem 0.9rem;
  cursor: pointer;
  font-size: 0.85rem;
  transition: border-color 0.2s, color 0.2s;
}
#logout-btn:hover { border-color: var(--accent); color: var(--accent); }

.version-badge {
  background: rgba(79,195,247,0.15);
  border: 1px solid rgba(79,195,247,0.3);
  border-radius: 12px;
  color: var(--accent);
  font-size: 0.72rem;
  font-weight: 700;
  padding: 0.15rem 0.6rem;
}

/* ── APP LAYOUT v2 ── */
.app-layout {
  display: flex;
  flex: 1;
}

.sidebar {
  width: 190px;
  background: var(--surface);
  border-right: 1px solid var(--border);
  padding: 1.25rem 0.75rem;
  display: flex;
  flex-direction: column;
  gap: 0.3rem;
  flex-shrink: 0;
}

.nav-item {
  display: flex;
  align-items: center;
  gap: 0.7rem;
  background: transparent;
  border: none;
  border-radius: 8px;
  color: var(--muted);
  cursor: pointer;
  padding: 0.65rem 0.85rem;
  width: 100%;
  font-size: 0.88rem;
  transition: background 0.2s, color 0.2s;
  text-align: left;
}
.nav-item:hover { background: rgba(79,195,247,0.08); color: var(--text); }
.nav-item.active { background: rgba(79,195,247,0.13); color: var(--accent); font-weight: 600; }
.ni-icon { font-size: 1rem; }

/* ── MODULE VIEWS ── */
.module-view {
  flex: 1;
  padding: 2rem;
  animation: fadeIn 0.3s ease both;
  overflow-y: auto;
}

.view-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 1.75rem;
}
.view-header h2 { font-size: 1.4rem; font-weight: 700; }
.dash-subtitle { color: var(--muted); font-size: 0.875rem; margin-top: 0.25rem; }

/* ── STATS ── */
.stats-row {
  display: flex;
  gap: 1.25rem;
  margin-bottom: 2.25rem;
  flex-wrap: wrap;
}
.stat-card {
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: 14px;
  padding: 1.4rem 1.6rem;
  flex: 1;
  min-width: 120px;
  display: flex;
  flex-direction: column;
  gap: 0.35rem;
  transition: box-shadow 0.25s, transform 0.2s;
  animation: revealCard 0.5s ease both;
}
.stat-card:hover { box-shadow: var(--glow-strong); transform: translateY(-3px); }
.stat-num {
  font-size: 1.85rem;
  font-weight: 700;
  background: linear-gradient(90deg, var(--accent), var(--accent2));
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
  background-clip: text;
}
.stat-label { color: var(--muted); font-size: 0.8rem; }

/* ── MODULE CARDS ── */
.modules-title {
  font-size: 0.82rem;
  font-weight: 600;
  color: var(--muted);
  text-transform: uppercase;
  letter-spacing: 0.06em;
  margin-bottom: 1.1rem;
}
.cards-row {
  display: flex;
  flex-wrap: wrap;
  gap: 1.25rem;
  margin-bottom: 2rem;
}
.card {
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: 14px;
  padding: 1.6rem 1.4rem;
  width: 170px;
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
  transition: box-shadow 0.25s, border-color 0.25s, transform 0.2s;
  animation: revealCard 0.5s ease both;
}
.card.active { cursor: pointer; }
.card.active:hover { box-shadow: var(--glow-strong); border-color: var(--accent); transform: translateY(-5px); }
.card.coming-soon { opacity: 0.45; cursor: default; }
.card-icon { font-size: 2rem; }
.card h3 { font-size: 0.9rem; font-weight: 600; }
.card-meta { color: var(--muted); font-size: 0.75rem; }

.badge {
  display: inline-block;
  border-radius: 20px;
  padding: 0.15rem 0.65rem;
  font-size: 0.7rem;
  font-weight: 600;
  margin-top: 0.3rem;
  width: fit-content;
}
.badge.live { background: rgba(0,229,160,0.15);  color: var(--success); }
.badge.soon { background: rgba(255,152,0,0.15);   color: var(--warn); }
.badge.v3   { background: rgba(124,77,255,0.15);  color: var(--accent2); }

/* ── ROADMAP ── */
.releases-roadmap {
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: 14px;
  padding: 1.6rem;
  animation: slideUp 0.5s 0.3s ease both;
}
.releases-roadmap h3 {
  font-size: 0.8rem;
  font-weight: 600;
  color: var(--muted);
  text-transform: uppercase;
  letter-spacing: 0.06em;
  margin-bottom: 1rem;
}
.release-row {
  display: flex;
  align-items: center;
  gap: 0.9rem;
  padding: 0.7rem 0;
  border-bottom: 1px solid rgba(30,45,85,0.6);
  font-size: 0.9rem;
}
.release-row:last-child { border-bottom: none; }
.rel-tag {
  background: rgba(79,195,247,0.12);
  color: var(--accent);
  border-radius: 4px;
  padding: 0.1rem 0.5rem;
  font-weight: 700;
  font-size: 0.78rem;
  min-width: 28px;
  text-align: center;
}
.release-row.done    { color: var(--success); }
.release-row.pending { color: var(--muted); }

/* ── BUTTONS ── */
.btn-primary {
  background: linear-gradient(135deg, var(--accent), var(--accent2));
  border: none;
  border-radius: 8px;
  color: #fff;
  cursor: pointer;
  font-size: 0.9rem;
  font-weight: 600;
  padding: 0.6rem 1.25rem;
  transition: opacity 0.2s, transform 0.15s;
}
.btn-primary:hover { opacity: 0.88; transform: translateY(-1px); }

.btn-secondary {
  background: transparent;
  border: 1px solid var(--border);
  border-radius: 8px;
  color: var(--muted);
  cursor: pointer;
  font-size: 0.9rem;
  padding: 0.6rem 1.25rem;
  transition: border-color 0.2s, color 0.2s;
}
.btn-secondary:hover { border-color: var(--accent); color: var(--accent); }

/* ── SEARCH BAR ── */
.search-bar { margin-bottom: 1.25rem; }
.search-bar input {
  background: #070b16;
  border: 1px solid var(--border);
  border-radius: 8px;
  color: var(--text);
  font-size: 0.9rem;
  padding: 0.65rem 1rem;
  width: 100%;
  max-width: 420px;
  transition: border-color 0.2s, box-shadow 0.2s;
}
.search-bar input:focus { outline: none; border-color: var(--accent); box-shadow: 0 0 0 3px rgba(79,195,247,0.12); }
.search-bar input::placeholder { color: var(--muted); }

/* ── DATA TABLES ── */
.data-table { width: 100%; border-collapse: collapse; font-size: 0.875rem; }
.data-table th {
  background: rgba(79,195,247,0.07);
  border-bottom: 1px solid var(--border);
  color: var(--muted);
  font-size: 0.75rem;
  font-weight: 600;
  letter-spacing: 0.04em;
  padding: 0.7rem 1rem;
  text-align: left;
  text-transform: uppercase;
}
.data-table td {
  border-bottom: 1px solid rgba(30,45,85,0.5);
  color: var(--text);
  padding: 0.75rem 1rem;
}
.data-table tr:hover td { background: rgba(79,195,247,0.04); }

/* ── FORM CARD ── */
.form-card {
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: 14px;
  padding: 2rem;
  max-width: 640px;
}
.form-section-title {
  color: var(--muted);
  font-size: 0.8rem;
  font-weight: 600;
  letter-spacing: 0.05em;
  margin-bottom: 1.25rem;
  text-transform: uppercase;
}
.form-grid {
  display: grid;
  gap: 1.1rem;
  grid-template-columns: 1fr 1fr;
  margin-bottom: 1.5rem;
}
.form-group { display: flex; flex-direction: column; gap: 0.4rem; }
.form-group label { color: var(--muted); font-size: 0.8rem; font-weight: 600; }
.form-group input,
.form-group select {
  background: #070b16;
  border: 1px solid var(--border);
  border-radius: 8px;
  color: var(--text);
  font-size: 0.9rem;
  padding: 0.65rem 0.9rem;
  transition: border-color 0.2s, box-shadow 0.2s;
}
.form-group input:focus,
.form-group select:focus { outline: none; border-color: var(--accent); box-shadow: 0 0 0 3px rgba(79,195,247,0.12); }
.form-group input::placeholder { color: var(--muted); }
.form-group select { cursor: pointer; }
.form-group select option { background: #0f1629; }

.form-actions { display: flex; gap: 0.75rem; }

.mat-success {
  background: rgba(0,229,160,0.1);
  border: 1px solid rgba(0,229,160,0.3);
  border-radius: 8px;
  color: var(--success);
  font-size: 0.9rem;
  margin-top: 1rem;
  padding: 0.65rem 1rem;
}
.mat-error {
  background: rgba(239,83,80,0.1);
  border: 1px solid rgba(239,83,80,0.3);
  border-radius: 8px;
  color: #ef5350;
  font-size: 0.9rem;
  margin-top: 1rem;
  padding: 0.65rem 1rem;
}

/* ── STATUS BADGES ── */
.status-badge {
  border-radius: 20px;
  display: inline-block;
  font-size: 0.72rem;
  font-weight: 600;
  padding: 0.15rem 0.65rem;
}
.status-badge.activo   { background: rgba(0,229,160,0.15);  color: var(--success); }
.status-badge.inactivo { background: rgba(239,83,80,0.15);  color: #ef5350; }
.status-badge.pagado   { background: rgba(0,229,160,0.15);  color: var(--success); }
.status-badge.pendiente { background: rgba(255,152,0,0.15); color: var(--warn); }
`;
}

function buildSchoolV2JS(): string {
  return `// EduNova v2 — Plataforma Escolar
// Mock data
var alumnos = [
  { id: 'EDN-001', nombre: 'Ana Garcia Lopez',    grado: '3 Secundaria', estado: 'activo',   ingreso: '2024-09-01' },
  { id: 'EDN-002', nombre: 'Luis Martinez Ruiz',  grado: '2 Secundaria', estado: 'activo',   ingreso: '2024-09-01' },
  { id: 'EDN-003', nombre: 'Sofia Herrera Diaz',  grado: '1 Secundaria', estado: 'activo',   ingreso: '2024-09-01' },
  { id: 'EDN-004', nombre: 'Carlos Perez Torres', grado: '3 Primaria',   estado: 'activo',   ingreso: '2025-01-15' },
  { id: 'EDN-005', nombre: 'Valentina Cruz Mora', grado: '2 Primaria',   estado: 'inactivo', ingreso: '2024-09-01' },
  { id: 'EDN-006', nombre: 'Diego Ramirez Vega',  grado: '1 Primaria',   estado: 'activo',   ingreso: '2025-01-15' },
];

var cursos = [
  { codigo: 'MAT-301', nombre: 'Matematicas Avanzadas', grado: '3 Secundaria', docente: 'Prof. Elena Torres', alumnos: 28, estado: 'activo' },
  { codigo: 'ESP-201', nombre: 'Espanol y Literatura',  grado: '2 Secundaria', docente: 'Prof. Marco Silva',  alumnos: 30, estado: 'activo' },
  { codigo: 'CIE-101', nombre: 'Ciencias Naturales',    grado: '1 Secundaria', docente: 'Prof. Ana Nunez',   alumnos: 25, estado: 'activo' },
  { codigo: 'HIS-102', nombre: 'Historia Universal',    grado: '1 Secundaria', docente: 'Prof. Luis Rios',   alumnos: 25, estado: 'activo' },
  { codigo: 'ART-301', nombre: 'Artes Plasticas',       grado: '3 Primaria',   docente: 'Prof. Carla Montes', alumnos: 22, estado: 'activo' },
];

var pagos = [
  { folio: 'PAG-001', alumno: 'Ana Garcia Lopez',    concepto: 'Colegiatura Ene', monto: 2800, estado: 'pagado',   fecha: '2025-01-05' },
  { folio: 'PAG-002', alumno: 'Luis Martinez Ruiz',  concepto: 'Colegiatura Ene', monto: 2800, estado: 'pagado',   fecha: '2025-01-06' },
  { folio: 'PAG-003', alumno: 'Sofia Herrera Diaz',  concepto: 'Colegiatura Ene', monto: 2800, estado: 'pendiente', fecha: '2025-01-31' },
  { folio: 'PAG-004', alumno: 'Carlos Perez Torres', concepto: 'Inscripcion',     monto: 1500, estado: 'pagado',   fecha: '2025-01-15' },
  { folio: 'PAG-005', alumno: 'Diego Ramirez Vega',  concepto: 'Inscripcion',     monto: 1500, estado: 'pendiente', fecha: '2025-01-31' },
  { folio: 'PAG-006', alumno: 'Valentina Cruz Mora', concepto: 'Colegiatura Ene', monto: 2800, estado: 'pagado',   fecha: '2025-01-08' },
];

// DOM refs
var loginSection    = document.getElementById('login-section');
var dashSection     = document.getElementById('dashboard-section');
var loginBtn        = document.getElementById('login-btn');
var logoutBtn       = document.getElementById('logout-btn');
var loginError      = document.getElementById('login-error');
var navUser         = document.getElementById('nav-user');
var btnMatricular   = document.getElementById('btn-matricular');
var btnIrMatricula  = document.getElementById('btn-ir-matricula');
var btnCancelarMat  = document.getElementById('btn-cancelar-mat');
var searchInput     = document.getElementById('search-alumnos');
var matSuccess      = document.getElementById('mat-success');
var matError        = document.getElementById('mat-error');

// View routing
function navegarVista(viewId) {
  document.querySelectorAll('.module-view').forEach(function(v) { v.classList.add('hidden'); });
  document.querySelectorAll('.nav-item').forEach(function(b) { b.classList.remove('active'); });
  var view = document.getElementById('view-' + viewId);
  if (view) view.classList.remove('hidden');
  var navBtn = document.querySelector('.sidebar-nav [data-view="' + viewId + '"]');
  if (navBtn) navBtn.classList.add('active');
  if (matSuccess) matSuccess.classList.add('hidden');
  if (matError)   matError.classList.add('hidden');
  console.log('[EduNova v2] vista:', viewId);
}

// Transition
function transition(from, to) {
  from.style.transition = 'opacity 0.3s ease';
  from.style.opacity = '0';
  setTimeout(function() {
    from.classList.add('hidden');
    from.style.opacity = '';
    from.style.transition = '';
    to.classList.remove('hidden');
    to.style.opacity = '0';
    to.style.transition = 'opacity 0.35s ease';
    requestAnimationFrame(function() {
      requestAnimationFrame(function() {
        to.style.opacity = '1';
        setTimeout(function() { to.style.opacity = ''; to.style.transition = ''; }, 360);
      });
    });
  }, 300);
}

// Stats refresh
function refreshStats() {
  var activos = alumnos.filter(function(a) { return a.estado === 'activo'; }).length;
  var elA = document.getElementById('stat-alumnos');
  var elC = document.getElementById('stat-cursos');
  var elMeta = document.getElementById('card-alumnos-meta');
  var elCursosMeta = document.getElementById('card-cursos-meta');
  if (elA) elA.textContent = String(activos);
  if (elC) elC.textContent = String(cursos.length);
  if (elMeta) elMeta.textContent = activos + ' registrados';
  if (elCursosMeta) elCursosMeta.textContent = cursos.length + ' activos';

  var pagados = pagos.filter(function(p) { return p.estado === 'pagado'; });
  var pendientes = pagos.filter(function(p) { return p.estado === 'pendiente'; });
  var totalMonto = pagados.reduce(function(acc, p) { return acc + p.monto; }, 0);
  var elPT = document.getElementById('stat-pagos-total');
  var elPM = document.getElementById('stat-pagos-monto');
  var elPP = document.getElementById('stat-pagos-pendientes');
  if (elPT) elPT.textContent = String(pagos.length);
  if (elPM) elPM.textContent = '$' + totalMonto.toLocaleString('es-MX');
  if (elPP) elPP.textContent = String(pendientes.length);
}

// Render tables
function renderAlumnos(filter) {
  var tbody = document.getElementById('tbody-alumnos');
  if (!tbody) return;
  var list = filter
    ? alumnos.filter(function(a) {
        return a.nombre.toLowerCase().includes(filter.toLowerCase())
            || a.id.toLowerCase().includes(filter.toLowerCase());
      })
    : alumnos;
  tbody.innerHTML = list.map(function(a) {
    return '<tr>'
      + '<td>' + a.id + '</td>'
      + '<td>' + a.nombre + '</td>'
      + '<td>' + a.grado + '</td>'
      + '<td><span class="status-badge ' + a.estado + '">' + a.estado + '</span></td>'
      + '<td>' + a.ingreso + '</td>'
      + '</tr>';
  }).join('');
}

function renderCursos() {
  var tbody = document.getElementById('tbody-cursos');
  if (!tbody) return;
  tbody.innerHTML = cursos.map(function(c) {
    return '<tr>'
      + '<td>' + c.codigo + '</td>'
      + '<td>' + c.nombre + '</td>'
      + '<td>' + c.grado + '</td>'
      + '<td>' + c.docente + '</td>'
      + '<td>' + c.alumnos + '</td>'
      + '<td><span class="status-badge activo">' + c.estado + '</span></td>'
      + '</tr>';
  }).join('');
}

function renderPagos() {
  var tbody = document.getElementById('tbody-pagos');
  if (!tbody) return;
  tbody.innerHTML = pagos.map(function(p) {
    return '<tr>'
      + '<td>' + p.folio + '</td>'
      + '<td>' + p.alumno + '</td>'
      + '<td>' + p.concepto + '</td>'
      + '<td>$' + p.monto.toLocaleString('es-MX') + '</td>'
      + '<td><span class="status-badge ' + p.estado + '">' + p.estado + '</span></td>'
      + '<td>' + p.fecha + '</td>'
      + '</tr>';
  }).join('');
}

// Login / Logout
loginBtn.addEventListener('click', function() {
  var user = document.getElementById('username').value.trim();
  var pass = document.getElementById('password').value;
  if (user && pass) {
    loginError.classList.add('hidden');
    navUser.textContent = user;
    transition(loginSection, dashSection);
    refreshStats();
    renderAlumnos();
    renderCursos();
    renderPagos();
    console.log('[EduNova v2] login OK — usuario:', user);
  } else {
    loginError.classList.remove('hidden');
    var box = document.querySelector('.login-box');
    box.style.animation = 'none';
    box.offsetHeight;
    box.style.animation = 'shake 0.4s ease';
  }
});

logoutBtn.addEventListener('click', function() {
  transition(dashSection, loginSection);
  document.getElementById('username').value = '';
  document.getElementById('password').value = '';
  navUser.textContent = '';
  navegarVista('overview');
  console.log('[EduNova v2] sesion cerrada');
});

// Sidebar + card nav
document.querySelectorAll('.sidebar-nav .nav-item').forEach(function(el) {
  el.addEventListener('click', function() {
    var view = el.getAttribute('data-view');
    if (view) navegarVista(view);
  });
});

document.querySelectorAll('.cards-row .card.active').forEach(function(card) {
  card.addEventListener('click', function() {
    var view = card.getAttribute('data-view');
    if (view) navegarVista(view);
  });
});

// Matricula helpers
if (btnIrMatricula) {
  btnIrMatricula.addEventListener('click', function() { navegarVista('matricula'); });
}
if (btnCancelarMat) {
  btnCancelarMat.addEventListener('click', function() { navegarVista('alumnos'); });
}

// Matricula form
if (btnMatricular) {
  btnMatricular.addEventListener('click', function() {
    var nombre    = document.getElementById('mat-nombre').value.trim();
    var apellidos = document.getElementById('mat-apellidos').value.trim();
    var grado     = document.getElementById('mat-grado').value;
    var correo    = document.getElementById('mat-correo').value.trim();
    matSuccess.classList.add('hidden');
    matError.classList.add('hidden');
    if (!nombre || !apellidos || !correo) {
      matError.classList.remove('hidden');
      return;
    }
    var nextId = 'EDN-' + String(alumnos.length + 1).padStart(3, '0');
    var hoy    = new Date().toISOString().slice(0, 10);
    alumnos.push({ id: nextId, nombre: nombre + ' ' + apellidos, grado: grado, estado: 'activo', ingreso: hoy });
    matSuccess.classList.remove('hidden');
    document.getElementById('mat-nombre').value    = '';
    document.getElementById('mat-apellidos').value = '';
    document.getElementById('mat-correo').value    = '';
    refreshStats();
    renderAlumnos();
    console.log('[EduNova v2] matriculado:', nombre, apellidos, '—', nextId);
  });
}

// Alumno search
if (searchInput) {
  searchInput.addEventListener('input', function() {
    renderAlumnos(searchInput.value);
  });
}
`;
}

/**
 * Builds the complete file content for school domain v2.
 * Returns index.html, styles.css, and script.js as a map.
 */
export function buildSchoolV2Content(): Record<string, string> {
  return {
    "index.html": buildSchoolV2HTML(),
    "styles.css": buildSchoolV2CSS(),
    "script.js":  buildSchoolV2JS(),
  };
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function writeWebFile(
  filename: string,
  content: string,
  cwd: string
): { success: boolean; message: string } {
  const resolved = path.resolve(cwd, filename);

  if (fs.existsSync(resolved)) {
    const stat = fs.statSync(resolved);
    if (!stat.isFile()) {
      return { success: false, message: `[create] error: ${filename} existe pero no es un archivo regular` };
    }
    if (!WEB_PLANNER_FILES.has(filename)) {
      return { success: false, message: `[create] abortado: "${filename}" no pertenece al caso web generado` };
    }
  }

  fs.writeFileSync(resolved, content, "utf-8");
  const lines = content.split("\n").length;
  return { success: true, message: `[create] ${filename} escrito (${lines} líneas)` };
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export async function executePlanStep(
  step: PlanStep,
  ctx: ToolContext,
  stack: string[] = [],
  domain?: string,
  releases: Release[] = [],
  design?: WebDesign
): Promise<{ success: boolean; message: string }> {
  const files    = step.targetFiles.length > 0 ? step.targetFiles.join(", ") : "(none)";
  const isWebStack = stack.includes("html");

  switch (step.type) {
    case "create": {
      const webContent = buildWebContent(domain, releases, design);
      const webTargets = isWebStack ? step.targetFiles.filter((f) => f in webContent) : [];
      if (webTargets.length > 0) {
        for (const filename of webTargets) {
          const content = webContent[filename]!;
          const result  = writeWebFile(filename, content, ctx.cwd);
          if (!result.success) return result;
        }
        const domainLabel = domain ? ` [dominio: ${domain}]` : "";
        return {
          success: true,
          message: `[create] ${webTargets.join(", ")} escritos${domainLabel}`,
        };
      }
      return { success: true, message: `[create] ready for ${files}` };
    }

    case "edit": {
      const htmlTargets = isWebStack ? step.targetFiles.filter((f) => f === "index.html") : [];
      if (htmlTargets.length > 0) {
        const resolved = path.resolve(ctx.cwd, "index.html");
        if (fs.existsSync(resolved)) {
          const current = fs.readFileSync(resolved, "utf-8");
          const hasCSS  = current.includes('href="styles.css"') || current.includes("href='styles.css'");
          const hasJS   = current.includes('src="script.js"')   || current.includes("src='script.js'");
          if (hasCSS && hasJS) {
            return { success: true, message: `[edit] index.html — assets ya enlazados` };
          }
        }
      }
      return { success: true, message: `[edit] ready to patch ${files}` };
    }

    case "semantic":
      return { success: true, message: `[semantic] ready to apply NL edit on ${files}` };

    case "run":
      return { success: true, message: `[run] stub — smoke test pendiente${files !== "(none)" ? `: ${files}` : ""}` };

    case "analyze":
      return { success: true, message: `[analyze] ready to inspect ${files !== "(none)" ? files : "project structure"}` };

    default: {
      const unknown: never = step.type;
      return { success: false, message: `[error] unsupported step type: "${unknown}"` };
    }
  }
}
