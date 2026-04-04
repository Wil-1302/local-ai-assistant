# Local AI Assistant — AXIS Agent

A terminal-first local AI coding and system agent powered by a local LLM (Ollama). Designed for offline-first, modular, and deterministic engineering workflows — no cloud, no telemetry, no API keys.

AXIS operates as a coding agent, web app generator, system diagnostician, and workspace manager in a single terminal REPL. It is resilient to imperfect local model output through deterministic fallback chains.

---

## What it does today (v3)

### Code & File Intelligence
- **Semantic file editing** — natural language instructions applied as precise SEARCH/REPLACE patches
- **Structural web rebuilds** — full HTML/CSS reconstruction when patch-based edits fail
- **Bugfix / refactor** — reads file, isolates LLM fix call, applies and reports
- **Multi-file generation** — generates N files from a single intent prompt
- **Run / test / fix loop** — executes a script, detects errors, applies LLM fix, reruns (max 2 cycles)
- **Project scan** — reads key project files and injects them as agent context

### Web App Generation (Planner)
- **Multi-phase project planner** — creates structured execution plans with versioned releases (v1/v2/v3)
- **Domain-aware generation** — school, SaaS, sales, generic — each with a tailored template
- **Workspace isolation** — every project gets its own directory under `./proyectos/<slug>/`
- **Workspace reuse** — prefix-match finds existing workspaces; "reutiliza" continues them
- **Release continuation** — "continúa con v2" routes to the next planned release
- **Tactical improvements** — glassmorphism, sidebar-minimal, animations applied as CSS/HTML patches
- **View completion** — builds out individual module views (alumnos, cursos, pagos) on demand
- **Deep design planning** — infers appType, layout pattern, UI components, and functional modules before generation

### Premium Rebuild Templates (v3 — Release 31C)
- **Deterministic HTML generation** — no LLM quality dependency for structural rebuilds
- **SaaS Dashboard template** — dark futuristic shell: collapsible sidebar, glassmorphism topbar, animated view transitions, stat cards, navigateTo wiring
- **Template selector** — matches rebuild instruction signals to the best template
- **Context builder** — extracts productName, existing views, CSS/JS file references from the project
- **Fallback chain** — template → LLM rebuild → error (each step guards the next)

### Edit Reliability (v3 — Release 31B)
- **Edit observability** — every `edit_file` call reports: blocks parsed / matched / failed / chars changed
- **Partial edit detection** — `[warn] Edición parcial: N/M bloques aplicados` when some blocks miss
- **Intent routing hardening** — rebuild verbs (`reconstruye`, `reestructura`, `rebuild`) route to semantic edit instead of read-only generation
- **Structural assessment** — deterministic analysis of HTML/CSS/JS against structural requirements (sidebar, topbar, data-view contract, navigateTo wiring)
- **Rebuild fallback cascade:**
  1. LLM generates SEARCH/REPLACE blocks → `edit_file`
  2. On failure → structural retry with assessment context
  3. On retry failure → `write_file` with premium template (no LLM)
  4. On template miss → `write_file` with LLM-generated full file

### Project Memory Kernel (v3 — Release 30)
- **Persistent workspace state** — `.axis/project-state.json` in each project directory
- **Schema-versioned** — `schemaVersion`, `axisVersion`, typed structure with full validation
- **Backfill for legacy workspaces** — reads README.md, scans HTML markers, infers stack from files
- **State lifecycle** — created before execution, refreshed after, never overwrites existing state without reading first
- **Tracked fields** — releases, installed views, applied features, cohesion pass, shell installed, preview command

### System Monitoring & Diagnosis
- **Real-time audit** — memory, disk, ports, services — deterministic status rows (CRITICAL / ATTENTION / OK)
- **Continuous monitoring** — `/monitor N` loop with alert change detection and desktop notifications
- **Service diagnosis** — `systemctl` + `journalctl` → LLM sub-mode → suggests `/restart`
- **Composite checks** — `/check web`, `/check service` — structured deterministic reports

### Alert System
- **Modular alert engine** — pluggable rules, deterministic evaluation, no LLM
- **Change detection** — first cycle = silent baseline, subsequent cycles report deltas
- **Notifiers** — console notifier + desktop notifier (`notify-send`) for CRITICAL alerts; composable fan-out

---

## Stack

| Layer | Technology |
|---|---|
| Runtime | Node.js 22+ |
| Language | TypeScript 5 (strict, `moduleResolution: nodenext`) |
| LLM backend | Ollama |
| Default model | `qwen2.5-coder:7b` |
| REPL | Node.js `readline` |
| File execution | `tsx` (TypeScript direct runner) |
| Tool execution | `child_process.execFile` (sandboxed, no shell) |
| Service tools | `systemctl`, `journalctl` |
| Network tools | `ss`, `ip`, `ping`, `curl` |
| System tools | `ps`, `free`, `df`, `uname` |

---

## Installation

### Prerequisites

- **Node.js** 22+
- **Ollama** running locally with a code model
- Linux with `systemd`, `iproute2`, `procps`

### Steps

```bash
git clone git@github.com:Wil-1302/local-ai-assistant.git
cd local-ai-assistant/apps/agent
npm install

# Start Ollama and pull a model
ollama serve &
ollama pull qwen2.5-coder:7b
```

### Configuration (optional)

```env
OLLAMA_MODEL=qwen2.5-coder:7b
OLLAMA_URL=http://localhost:11434
```

### Run

```bash
# Standard REPL
npx tsx src/index.ts

# Global CLI (after npm link)
jas "crea una plataforma SaaS con sidebar y dashboard"
axis "reconstruye el layout con shell saas en index.html"
```

---

## Core Workflows

### Semantic file editing

```
You: cambia el color del botón de login a azul en styles.css
[tool] reading: styles.css
[tool] generating edit: styles.css
[tool] applying edit: styles.css
✔ styles.css modificado (87 líneas · 1/1 bloques · ±12 chars)
```

### Structural web rebuild (with premium template)

```
You: reconstruye el layout con sidebar y shell saas en index.html
[tool] reading: index.html
[tool] generating edit: index.html
[error] El LLM no generó bloques de edición válidos.
[rebuild] plantilla premium: saas-dashboard · 4 vistas · producto: "EduNova"
[tool] write_file (template): index.html
[rebuild] ✔ index.html reconstruido — plantilla saas-dashboard · 128 líneas
```

### Multi-phase web project

```
You: crea una plataforma escolar futurista con login, alumnos, cursos y pagos

[plan]   objetivo: plataforma escolar futurista
[plan]   stack: html, css, javascript
[releases]
  v1: base UI + login + dashboard (executing now)
  v2: sidebar + módulos alumnos/cursos/pagos
  v3: analytics + exportación

[steps]
  [1] ok  Estructura HTML base
  [2] ok  Estilos dark futuristic
  [3] ok  Script de login y navegación

Proyecto creado en: proyectos/plataforma-escolar-futurista/
Preview: cd proyectos/plataforma-escolar-futurista && python3 -m http.server 8000
```

### Edit observability (partial match detection)

```
You: añade navegación entre vistas en index.html
[tool] applying edit: index.html
[warn] Edición parcial en index.html: 2/5 bloques aplicados — 3 no encontraron match · ±124 chars
✔ index.html modificado (298 líneas · 2/5 bloques · ±124 chars)
  ⚠ edición parcial: 2/5 bloques aplicados · 3 no encontraron match
  ✔ reemplazado (1x): "<body>↵..."
  ✗ No encontrado: "<div class="sidebar-nav">↵..."
```

### Run / test / fix loop

```
You: corre app.py y arregla si falla
[tool] run: python3 app.py
[error] NameError: name 'df' is not defined (line 14)
[tool] analyzing: app.py
[tool] applying fix: app.py
[tool] run: python3 app.py (retry)
✓ app.py ejecutado correctamente
```

### System audit

```
You: /audit deep

─── CRITICAL ────────────────────────────────────────────
 ✗ nginx.service — failed (exit-code)

─── ATTENTION ───────────────────────────────────────────
 ! Memory: 7.2G / 8.0G used (90%)

─── OK ──────────────────────────────────────────────────
 ✓ ollama.service — active (running)
 ✓ Ports: 3 listening (22, 80, 11434)

Conclusion: nginx is down — address this first.
```

---

## Intent Router

The router (`tool-selector.ts`) dispatches natural language to the right handler before the LLM is consulted:

```
Priority chain (highest first):

  EDIT / REBUILD      → semantic edit → structural assessment → rebuild fallback
  BUGFIX / REFACTOR   → read file → LLM fix → edit_file
  RUN + FIX           → execute script → detect error → LLM fix → rerun
  PLANNING            → multi-phase project planner → workspace → execute
  TACTICAL            → patch existing project (CSS/JS/HTML improvements)
  VIEW COMPLETION     → build out individual module views
  CONTINUE RELEASE    → resume next planned release in project
  ANALYSIS            → deep workspace report
  LOG                 → read_log (L0)
  READ FILE           → read_file (L1)
  DIRECTORY           → list_dir (L2)
  SERVICE STATUS      → systemctl_status (L3)
  JOURNAL             → journalctl (L4)
  PROCESS             → list_processes (L5)
  AUTO TOOLS          → chained 0–2 tool calls before LLM reply
  LLM                 → conversational fallback
```

Destructive tools (`restart_service`, `kill_process`) are **never auto-invoked** — they require explicit slash commands with `yes` confirmation.

---

## Architecture

```
User input
    │
    ├─ slash command? ──────────────→ direct handler
    │
    └─ natural language
           │
           ├─ intent detection (priority chain)
           │      │
           │      ├─ semantic edit → read → LLM patch → edit_file
           │      │       └─ fallback: assess → retry → template → LLM write
           │      │
           │      ├─ bugfix / refactor → read → LLM fix → edit_file
           │      ├─ run + fix → exec → error? → LLM fix → rerun
           │      ├─ planner → plan → workspace → execute steps
           │      ├─ tactical → patch project files
           │      └─ auto tools → 0–2 tools → inject context
           │
           └─ agent.send(input, stream)
                   └─ Ollama streaming → stdout token by token
```

### Module layout

```
apps/agent/src/
├── agent/
│   ├── loop.ts                       # Conversation loop, Ollama streaming
│   ├── system-prompt.ts              # Behavioral rules, response modes
│   ├── tool-selector.ts              # Priority-based intent router
│   ├── structural-edit/
│   │   ├── assess-structure.ts       # Deterministic structural requirement checker
│   │   └── templates/
│   │       ├── types.ts              # RebuildTemplate, TemplateContext interfaces
│   │       ├── base-styles.ts        # Shared dark futuristic CSS (Release 31C)
│   │       ├── saas-dashboard.ts     # Premium SaaS shell template
│   │       └── selector.ts          # Template selection + context extraction
│   └── planner/
│       ├── create-plan.ts            # ExecutionPlan builder (domain, style, releases)
│       ├── detect-planning-intent.ts # Intent detection for planner, tactical, views
│       ├── execute-plan.ts           # Step runner
│       ├── step-executor.ts          # Per-step file generation (real writes)
│       ├── project-state.ts          # Project memory kernel (.axis/project-state.json)
│       ├── workspace.ts             # Workspace isolation, slug, reuse, README
│       ├── project-analyzer.ts       # Deep workspace analysis
│       ├── tactical-builders.ts      # CSS/JS/HTML evolution patches
│       └── view-completion-builders.ts # Module view builders
├── cli/
│   └── repl.ts                       # REPL, all handlers, rebuild fallback cascade
├── tools/
│   ├── registry.ts                   # Tool registration and dispatch
│   ├── types.ts                      # Tool interface, ToolContext, EditMeta
│   ├── files/
│   │   ├── read.ts                   # read_file
│   │   ├── write.ts                  # write_file (with path blocking)
│   │   ├── edit.ts                   # edit_file (SEARCH/REPLACE + editMeta)
│   │   └── list.ts                   # list_dir
│   ├── execution/
│   │   └── run_command.ts            # run_command (with output truncation + SIGKILL)
│   ├── project/
│   │   └── scan.ts                   # scan_project (key file detection)
│   ├── processes/                    # list_processes
│   ├── logs/                         # read_log
│   ├── system/                       # memory, disk, sysinfo, systemctl, journalctl
│   │                                 # ports, interfaces, routes
│   ├── network/                      # ping_host, dns_lookup, http_head_check
│   └── actions/                      # restart_service, kill_process
├── alerts/
│   ├── engine.ts                     # Alert evaluation engine (deterministic)
│   ├── rules.ts                      # Default alert rules
│   ├── types.ts                      # Alert types and snapshots
│   └── notifier.ts                   # Console + desktop notifiers
├── logging/
│   └── logger.ts                     # Structured session logging
├── config.ts                         # Ollama URL, model, paths
└── index.ts                          # Entry point
```

---

## Commands reference

### Web & File

| Command | Description |
|---|---|
| `/edit <file>` | Open semantic edit flow for a file |
| `/write <file>` | Write or overwrite a file |
| `/read <path>` | Read a file into agent context |
| `/ls [path]` | List directory (default: current) |
| `/project` | Scan current project, inject key files |
| `/run <cmd>` | Execute a command and show output |

### System & Audit

| Command | Description |
|---|---|
| `/audit` | Full system audit (deterministic status rows) |
| `/audit deep` | Priority-grouped: CRITICAL / ATTENTION / OK |
| `/monitor <secs>` | Continuous audit loop every N seconds |
| `/alert` | Single alert evaluation pass |
| `/ps [filter]` | List processes |
| `/log <path> [N]` | Read last N lines of a log file |

### Connectivity

| Command | Description |
|---|---|
| `/check web <host>` | DNS + ping + HTTP → 4-line summary |
| `/check service <name>` | systemctl + journal → structured report |
| `/ping <host>` | Raw ping check |
| `/dns <host>` | DNS lookup |
| `/http <url>` | HTTP headers check |

### Service Actions

| Command | Description |
|---|---|
| `/service <name>` | systemctl status |
| `/journal [svc] [N]` | journalctl output |
| `/diagnose <svc>` | Diagnose + LLM analysis + restart suggestion |
| `/fix <svc>` | Diagnose + conditional restart (with confirmation) |
| `/restart <svc>` | Restart a systemd service (requires `yes`) |
| `/kill <pid>` | Send SIGTERM to a process (requires `yes`) |

### Session

| Command | Description |
|---|---|
| `/help` | Show all commands |
| `/clear` | Clear conversation history |
| `/model` | Show current model |
| `/exit` | Exit |

---

## Security

- Destructive actions (`restart`, `kill`, `fix`) require explicit `yes` confirmation
- System path writes are blocked at the tool level (`/etc`, `/usr`, `/bin`, `/sys`, ...)
- No arbitrary shell execution — all tools use `child_process.execFile` with fixed binaries
- Edit operations on system paths are blocked before the LLM is invoked
- `run_command` has output truncation and SIGKILL timeout to prevent runaway processes

---

## Changelog

### v3 — Agent Brain (current)
**Theme: resilient editing, deterministic rebuilds, project memory**

- `project-state.ts` — persistent workspace state kernel (`.axis/project-state.json`)
- `assess-structure.ts` — deterministic structural requirements checker for HTML/CSS/JS
- `EditMeta` in `ToolResult` — blocks parsed / matched / failed / chars changed per edit call
- Rebuild fallback cascade: `edit_file` → structural retry → write_file template → LLM write
- Premium rebuild templates (`saas-dashboard`) — dark futuristic SaaS shell, no LLM dependency
- Intent routing hardened: `reconstruye`, `rebuild`, `reestructura` route to semantic edit
- `[warn] Edición parcial` when LLM blocks partially match
- Global CLI (`axis`, `jas`) via npm link
- Deep design planning: infers appType, layout, components, modules before generation
- View completion: builds individual module views by name
- Workspace reuse with prefix-match and auto-continue on "reutiliza"

### v2 — Coding Tools
**Theme: file editing, code generation, project awareness**

- Semantic file editing (NL → SEARCH/REPLACE via LLM)
- Bugfix / refactor flow (read → LLM → edit_file)
- Multi-file generation from a single intent
- Run / test / fix loop (exec → error detection → LLM fix → rerun)
- Project scan and multi-file read context injection
- Multi-phase project planner with workspaces, releases, and README generation
- Tactical improvements (glassmorphism, sidebar-minimal, animations)
- Release continuation ("continúa con v2")
- write_file and edit_file tools with system path blocking
- Alert system with change detection and desktop notifications

### v1 — System Agent
**Theme: observe, diagnose, act — local and offline**

- Core REPL + Ollama streaming integration
- System monitoring: memory, disk, ports, processes
- Auto tool detection from natural language (L0–L5 priority chain)
- Service diagnosis: systemctl + journalctl → LLM sub-mode
- Controlled actions: restart service, kill process (with `yes` confirmation)
- Composite checks: `/diagnose`, `/fix`, `/check web`, `/check service`
- Real-time audit loop (`/audit`, `/audit deep`, `/monitor`)
- Network tools: ping, DNS lookup, HTTP head check
- Structured session logging

---

## Roadmap (v4)

| Area | Feature |
|---|---|
| Edit reliability | Partial-match rebuild trigger (not just 0-match) |
| Templates | `login-shell` template with preserved form extraction |
| Templates | `analytics-grid` template (metrics + charts + table) |
| State | `productEvolution` updated from real execution results |
| State | `completedPhases` updated post-execution |
| State | Bidirectional sync between README.md and project-state.json |
| Observability | SEARCH block diff preview before applying |
| Agent | Multi-turn planning loop with checkpoint approval |
| Agent | Memory across sessions (embed + retrieve) |
| UI | Web frontend for the REPL (React or plain HTML) |
| Voice | Voice input/output pipeline |

---

## Project structure

```
local-ai-assistant/
├── apps/
│   ├── agent/    ← active (this app)
│   ├── ui/       ← planned
│   └── voice/    ← planned
├── packages/
│   ├── config/
│   ├── core/
│   ├── memory/
│   └── tools/
├── data/         ← runtime (logs, sessions) — not committed
└── docs/
    └── architecture.md
```
