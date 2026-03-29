# Local AI Assistant (CLI)

A terminal-based AI agent powered by a local LLM (Ollama + qwen2.5-coder). It observes your Linux system in real time, diagnoses problems, and executes controlled actions — no cloud, no telemetry, fully offline.

---

## What it does

- **Observes** — processes, memory, disk, ports, services, logs, network
- **Diagnoses** — interprets live system data through an LLM with strict grounding (no hallucinations)
- **Acts** — restarts services, kills processes — always with explicit confirmation
- **Monitors** — continuous real-time audit loop with `Ctrl+C` exit

---

## Stack

| Layer | Technology |
|---|---|
| Runtime | Node.js 22+ |
| Language | TypeScript 5 (strict, `moduleResolution: nodenext`) |
| LLM backend | Ollama |
| Default model | `qwen2.5-coder:7b` |
| REPL | Node.js `readline` |
| Tool execution | `child_process.execFile` |
| Service tools | `systemctl`, `journalctl` |
| Network tools | `ss`, `ip` (iproute2) |
| Connectivity | `ping`, `curl` (HTTP checks) |
| System tools | `ps`, `free`, `df`, `uname` |

---

## Installation

### Prerequisites

- **Node.js** 22+
- **Ollama** running locally
- A pulled model (default: `qwen2.5-coder:7b`)
- Linux with `systemd`, `iproute2`, `procps` (standard on most distros)

### Steps

```bash
# 1. Clone the repository
git clone git@github.com:Wil-1302/local-ai-assistant.git
cd local-ai-assistant/apps/agent

# 2. Install dependencies
npm install

# 3. Start Ollama and pull the model
ollama serve &
ollama pull qwen2.5-coder:7b

# 4. (Optional) Configure via .env
cp ../../.env .env
```

`.env` options:

```env
OLLAMA_MODEL=qwen2.5-coder:7b
OLLAMA_URL=http://localhost:11434
```

### Run

```bash
npx tsx src/index.ts
```

```
Local AI Assistant — qwen2.5-coder:7b
Type /help for commands or /exit to quit.

You:
```

---

## Commands

### Audit & Monitoring

| Command | Description |
|---|---|
| `/audit` | Full system audit: memory, disk, processes, ports, services — deterministic status rows |
| `/audit deep` | Deep audit with priority grouping: CRITICAL / ATTENTION / OK + 1-line conclusion |
| `/monitor <secs>` | Continuous real-time audit every N seconds. `Ctrl+C` to stop |

### Connectivity Checks

| Command | Description |
|---|---|
| `/check web <host>` | Composite web check: DNS lookup + ping + HTTP headers → 4-line summary |
| `/check service <name>` | Service check: `systemctl` status + journal → structured report (no LLM) |
| `/ping <host>` | Raw ping check (`ping -c 4`) |
| `/dns <host>` | DNS lookup (`getent hosts`) |
| `/http <url>` | HTTP header check (`curl -I --max-time 10`) |

### Service Diagnosis & Actions

| Command | Description |
|---|---|
| `/service <name>` | `systemctl status <name>` |
| `/journal [svc] [N]` | `journalctl` output, service optional, default 50 lines |
| `/diagnose <svc>` | `systemctl` + `journalctl` → agent diagnosis → suggests `/restart` if needed |
| `/fix <svc>` | Diagnose + restart if warranted (still requires `yes` confirmation) |
| `/restart <svc>` | Restart a systemd service (requires confirmation) |
| `/kill <pid>` | Send `SIGTERM` to a process by PID (requires confirmation) |

### System & Files

| Command | Description |
|---|---|
| `/ps [filter]` | List running processes, optional text filter |
| `/read <path>` | Read a file and load it into agent context |
| `/log <path> [N]` | Read last N lines of a log file (default: 50), pre-computes error markers |
| `/ls [path]` | List directory contents (default: current dir) |

### Session

| Command | Description |
|---|---|
| `/help` | Show all commands |
| `/clear` | Clear conversation history |
| `/history` | Show number of conversation turns |
| `/model` | Show current model |
| `/exit` | Exit (also: `exit`, `quit`, `Ctrl+D`) |

---

## Usage Examples

**Deep system audit:**
```
You: /audit deep

─── CRITICAL ────────────────────────────────────────────
 ✗ nginx.service — failed (exit-code)

─── ATTENTION ───────────────────────────────────────────
 ! Memory: 7.2G / 8.0G used (90%)
 ! Disk /: 48G / 50G (96%)

─── OK ──────────────────────────────────────────────────
 ✓ ollama.service — active (running)
 ✓ Ports: 3 listening (22, 80, 11434)

Conclusion: nginx is down and disk is near full — address these first.
```

**Real-time monitoring:**
```
You: /monitor 5
[monitor] audit every 5s — Ctrl+C to stop

[2026-03-28 14:01:05]
 ✓ Memory: 4.1G / 16G (26%)   ✓ Disk /: 21G / 50G (42%)
 ✓ ollama.service — active     ✓ Ports: 4 listening

[2026-03-28 14:01:10]
...
^C
[monitor] stopped.
```

**Web connectivity check:**
```
You: /check web github.com
DNS:  github.com → 140.82.121.4 ✓
Ping: 140.82.121.4 — 28ms avg ✓
HTTP: 200 OK (github.com) ✓
Result: github.com is fully reachable.
```

**Service check (no LLM):**
```
You: /check service nginx

Service: nginx
State:   failed (Result: exit-code)
Since:   Sat 2026-03-28 13:44:01 UTC (17min ago)
Recent errors (journal):
  bind() to 0.0.0.0:80 failed (98: Address already in use)
Suggestion: use /fix nginx to diagnose and restart.
```

**Auto-fix with confirmation:**
```
You: /fix nginx
[tool] systemctl status nginx → failed
[tool] journalctl -u nginx → 1 error: Address already in use
Assistant: nginx.service is down. bind() conflict on port 80.
  Suggestion: restart after resolving port conflict.
[fix] restart_service "nginx"
Restart service "nginx"? (yes/no): yes
✓ nginx restarted successfully
```

**Process triage — natural language:**
```
You: el sistema está lento, qué está corriendo
[tool] executing: ps
Assistant: ATTENTION — node (PID 4821, 87% CPU, 3.1% MEM)
  proceso node sin ruta de script visible consumiendo CPU sostenido
  Siguiente paso: /kill 4821 o verifica con /read /proc/4821/cmdline
```

**Network inspection:**
```
You: qué puertos están escuchando
[tool] executing: ss -tulpn
Assistant: tcp  0.0.0.0:22   sshd
           tcp  127.0.0.1:11434  ollama
           tcp  0.0.0.0:80   nginx
```

---

## Auto Tool Detection

The intent router (`tool-selector.ts`) detects the right tool from natural language — no slash command required:

```
L0  log path / log-intent keyword  → read_log
L1  file path with extension       → read_file
L2  directory / structure intent   → list_dir
L3  service status + name          → systemctl_status
L4  journal / service logs         → journalctl
L5  process / performance intent   → list_processes
    memory keywords                → memory_status
    disk keywords                  → disk_usage
    system info keywords           → system_info
    port keywords                  → open_ports
    interface keywords             → net_interfaces
    route keywords                 → net_routes
```

Chains are supported: if the message contains both a directory intent and a file path, `list_dir` and `read_file` run in sequence before the agent replies.

Destructive tools (`restart_service`, `kill_process`) are **never auto-invoked** — they require explicit slash commands and `yes` confirmation.

---

## Security

All destructive actions require explicit user confirmation before execution:

```
Restart service "nginx"? (yes/no): _
```

- Any input other than `yes` (case-insensitive) cancels the action immediately
- Actions affected: `/restart`, `/kill`, `/fix`
- The agent **never executes destructive actions autonomously**
- No arbitrary shell execution — all tools use `child_process.execFile` with a fixed binary and argument list
- Services can be restricted via an allowlist in `config.ts`

---

## Architecture

```
User input
    │
    ├─ slash command? ──→ direct handler → tool execution → inject context
    │
    └─ natural language
           │
           ├─ detectToolChain() → 0–2 auto tools
           │       └─ each tool: execFile → parse output → inject context
           │
           └─ agent.send(input, stream)
                   └─ Ollama streaming → stdout token by token
```

### Module layout

```
apps/agent/src/
├── agent/
│   ├── loop.ts           # Conversation loop, Ollama streaming
│   ├── system-prompt.ts  # Behavioral rules, response modes, tool grounding
│   └── tool-selector.ts  # Keyword-heuristic intent router (detectToolChain)
├── cli/
│   └── repl.ts           # REPL, slash commands, audit/monitor/check logic
├── tools/
│   ├── registry.ts       # Tool registration and dispatch
│   ├── types.ts          # Tool interface, ToolContext (cwd, confirm)
│   ├── fs/               # read_file, list_dir
│   ├── processes/        # list_processes
│   ├── logs/             # read_log
│   ├── system/           # memory_status, disk_usage, system_info
│   │                     # systemctl_status, journalctl
│   │                     # open_ports, net_interfaces, net_routes
│   │                     # ping_host, dns_lookup, http_head_check
│   └── actions/          # restart_service, kill_process
├── logging/
│   └── logger.ts         # Session/event logging to data/logs/
├── config.ts             # Ollama URL, model, data paths
└── index.ts              # Entry point
```

The extension point is the `Tool` interface in `tools/types.ts`. Each tool exports a `Tool` implementation and registers itself in `registry.ts`.

---

## Project Structure

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
├── data/         ← runtime (logs, sessions, memory) — not committed
└── docs/
    └── architecture.md
```

---

## Roadmap

| Phase | Feature | Status |
|---|---|---|
| 1 | Core agent + tool interface | ✓ done |
| 2 | Auto tool detection (NL → tool) | ✓ done |
| 3 | Service diagnosis (systemctl + journalctl) | ✓ done |
| 4 | Controlled actions (restart, kill) | ✓ done |
| 5 | Composite /diagnose + /fix | ✓ done |
| 6 | Network tools (ping, dns, http) | ✓ done |
| 7 | Composite /check web + /check service | ✓ done |
| 8 | /audit + /audit deep (deterministic) | ✓ done |
| 9 | /monitor (real-time loop) | ✓ done |
| — | Persistent memory across sessions | planned |
| — | Write actions (file edit with diff preview) | planned |
| — | Terminal UI (React/Ink or web frontend) | planned |
| — | Voice input/output | planned |
| — | Remote agent integration | planned |
