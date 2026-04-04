/**
 * Shared CSS foundation for all rebuild templates (Release 31C).
 *
 * Embedded as a <style> block BEFORE <link href="styles.css"> so that
 * project-specific CSS always overrides these base styles.
 *
 * Design system: dark futuristic, purple accent, glassmorphism-light.
 */
export const BASE_STYLES = `
/* ── Axis Shell Base ── Release 31C ─────────────────────────────────────── */
*, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

:root {
  --bg:           #0a0e1a;
  --sidebar-bg:   #0d1117;
  --topbar-bg:    rgba(13,17,23,.85);
  --accent:       #6c63ff;
  --accent-hover: #7c74ff;
  --accent-glow:  rgba(108,99,255,.22);
  --text:         #e2e8f0;
  --text-muted:   #64748b;
  --card:         #141824;
  --border:       rgba(255,255,255,.07);
  --sidebar-w:    220px;
  --topbar-h:     56px;
  --radius:       10px;
  --tr:           .18s ease;
}

body.axis-shell {
  font-family: 'Inter', system-ui, -apple-system, sans-serif;
  background: var(--bg);
  color: var(--text);
  display: flex;
  height: 100vh;
  overflow: hidden;
  -webkit-font-smoothing: antialiased;
}

/* ── Sidebar ─────────────────────────────────────────────────────────────── */
.sidebar {
  width: var(--sidebar-w);
  background: var(--sidebar-bg);
  border-right: 1px solid var(--border);
  display: flex;
  flex-direction: column;
  flex-shrink: 0;
  transition: width var(--tr);
  z-index: 100;
}
.sidebar.collapsed { width: 60px; }
.sidebar.collapsed .brand-name,
.sidebar.collapsed .nav-label,
.sidebar.collapsed .sidebar-footer-text { opacity: 0; width: 0; overflow: hidden; }

.sidebar-brand {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 18px 16px;
  border-bottom: 1px solid var(--border);
  min-height: var(--topbar-h);
}
.brand-icon {
  width: 30px; height: 30px;
  background: linear-gradient(135deg, var(--accent), #9c6bff);
  border-radius: 7px;
  flex-shrink: 0;
  box-shadow: 0 0 14px var(--accent-glow);
}
.brand-name {
  font-size: 13px;
  font-weight: 700;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  letter-spacing: .2px;
  transition: opacity var(--tr), width var(--tr);
}

.sidebar-nav {
  flex: 1;
  padding: 10px 8px;
  display: flex;
  flex-direction: column;
  gap: 2px;
  overflow-y: auto;
  scrollbar-width: thin;
  scrollbar-color: var(--border) transparent;
}
.sidebar-nav-item {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 9px 10px;
  border-radius: 8px;
  cursor: pointer;
  color: var(--text-muted);
  font-size: 13px;
  font-weight: 500;
  transition: background var(--tr), color var(--tr);
  user-select: none;
  white-space: nowrap;
}
.sidebar-nav-item:hover  { background: rgba(255,255,255,.05); color: var(--text); }
.sidebar-nav-item.active {
  background: var(--accent-glow);
  color: var(--accent-hover);
  box-shadow: inset 0 0 0 1px rgba(108,99,255,.18);
}
.nav-icon  { font-size: 15px; flex-shrink: 0; }
.nav-label { transition: opacity var(--tr); }

.sidebar-footer {
  padding: 12px 16px;
  border-top: 1px solid var(--border);
  font-size: 11px;
  color: var(--text-muted);
  display: flex;
  align-items: center;
  gap: 8px;
}
.sidebar-footer-dot {
  width: 6px; height: 6px;
  background: #22c55e;
  border-radius: 50%;
  flex-shrink: 0;
}

/* ── Main wrapper ────────────────────────────────────────────────────────── */
.main-wrapper {
  flex: 1;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  min-width: 0;
}

/* ── Topbar ──────────────────────────────────────────────────────────────── */
.topbar {
  height: var(--topbar-h);
  background: var(--topbar-bg);
  backdrop-filter: blur(14px);
  -webkit-backdrop-filter: blur(14px);
  border-bottom: 1px solid var(--border);
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0 20px;
  flex-shrink: 0;
  z-index: 50;
}
.topbar-left { display: flex; align-items: center; gap: 12px; }
.sidebar-toggle {
  background: none; border: none; color: var(--text-muted);
  font-size: 17px; cursor: pointer; padding: 5px; line-height: 1;
  border-radius: 7px; transition: color var(--tr), background var(--tr);
}
.sidebar-toggle:hover { color: var(--text); background: rgba(255,255,255,.06); }
.page-title { font-size: 14px; font-weight: 600; color: var(--text); }
.topbar-right { display: flex; align-items: center; gap: 10px; }
.topbar-badge {
  font-size: 11px;
  background: var(--accent-glow);
  color: var(--accent-hover);
  border: 1px solid rgba(108,99,255,.22);
  padding: 3px 10px;
  border-radius: 20px;
  font-weight: 500;
  letter-spacing: .2px;
}
.user-avatar {
  width: 30px; height: 30px;
  background: linear-gradient(135deg, var(--accent), #9c6bff);
  border-radius: 50%;
  display: flex; align-items: center; justify-content: center;
  font-size: 12px; font-weight: 700; color: #fff;
  box-shadow: 0 0 10px var(--accent-glow);
  cursor: pointer;
}

/* ── Main content ────────────────────────────────────────────────────────── */
.main-content {
  flex: 1;
  overflow-y: auto;
  padding: 24px;
  scrollbar-width: thin;
  scrollbar-color: var(--border) transparent;
}
.view-section { display: none; }
.view-section.active {
  display: block;
  animation: axisViewFadeIn .2s ease;
}
@keyframes axisViewFadeIn {
  from { opacity: 0; transform: translateY(5px); }
  to   { opacity: 1; transform: none; }
}

/* ── Stats row ───────────────────────────────────────────────────────────── */
.stats-row {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
  gap: 14px;
  margin-bottom: 24px;
}
.stat-card {
  background: var(--card);
  border: 1px solid var(--border);
  border-radius: var(--radius);
  padding: 18px;
  display: flex;
  flex-direction: column;
  gap: 5px;
  transition: border-color var(--tr), box-shadow var(--tr), transform var(--tr);
  cursor: default;
}
.stat-card:hover {
  border-color: rgba(108,99,255,.28);
  box-shadow: 0 4px 22px rgba(0,0,0,.22);
  transform: translateY(-1px);
}
.stat-num   { font-size: 28px; font-weight: 700; letter-spacing: -1.2px; }
.stat-label { font-size: 11px; color: var(--text-muted); font-weight: 500; text-transform: uppercase; letter-spacing: .5px; }
.stat-delta { font-size: 11px; font-weight: 600; }
.stat-delta.up   { color: #22c55e; }
.stat-delta.down { color: #ef4444; }

/* ── Generic card ────────────────────────────────────────────────────────── */
.card {
  background: var(--card);
  border: 1px solid var(--border);
  border-radius: var(--radius);
  padding: 20px;
  margin-bottom: 16px;
}
.card-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 14px;
}
.card-title  { font-size: 14px; font-weight: 600; }
.card-muted  { font-size: 12px; color: var(--text-muted); }

.grid-2 { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; margin-bottom: 16px; }

/* ── Section header ──────────────────────────────────────────────────────── */
.section-header { margin-bottom: 20px; }
.section-header h2 { font-size: 17px; font-weight: 700; }
.section-header p  { font-size: 13px; color: var(--text-muted); margin-top: 4px; }

/* ── Empty state ─────────────────────────────────────────────────────────── */
.empty-state {
  text-align: center;
  padding: 48px 24px;
  color: var(--text-muted);
}
.empty-icon { font-size: 38px; margin-bottom: 12px; }
.empty-state h3 { font-size: 15px; font-weight: 600; color: var(--text); margin-bottom: 6px; }
.empty-state p  { font-size: 13px; }

/* ── Buttons ─────────────────────────────────────────────────────────────── */
.btn-primary {
  background: var(--accent);
  color: #fff; border: none;
  padding: 8px 18px;
  border-radius: 8px;
  font-size: 13px; font-weight: 600;
  cursor: pointer;
  transition: background var(--tr), box-shadow var(--tr);
}
.btn-primary:hover {
  background: var(--accent-hover);
  box-shadow: 0 4px 16px var(--accent-glow);
}
.btn-ghost {
  background: none;
  color: var(--text-muted); border: 1px solid var(--border);
  padding: 7px 16px;
  border-radius: 8px;
  font-size: 13px; font-weight: 500;
  cursor: pointer;
  transition: color var(--tr), border-color var(--tr);
}
.btn-ghost:hover { color: var(--text); border-color: rgba(255,255,255,.18); }

/* ── Responsive ──────────────────────────────────────────────────────────── */
@media (max-width: 768px) {
  body.axis-shell { flex-direction: column; height: auto; overflow: auto; }
  .sidebar {
    width: 100% !important;
    height: auto;
    flex-direction: row;
    flex-wrap: wrap;
    align-items: center;
    padding: 8px;
  }
  .sidebar-nav { flex-direction: row; flex-wrap: wrap; padding: 4px; gap: 4px; }
  .sidebar-footer { display: none; }
  .main-content { padding: 16px; }
  .grid-2 { grid-template-columns: 1fr; }
}
`;
