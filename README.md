# Local AI Assistant

A local AI agent for Linux terminal use. Runs fully offline via Ollama, provides system observability through modular tools, and supports both manual slash commands and automatic tool invocation from natural language.

---

## Overview

The agent takes natural language input, detects intent, automatically invokes the relevant system tool, injects the real output into the model's context, and responds with precise, actionable analysis — no hallucination of data, no reliance on training-time knowledge for live system state.

Built for Linux sysadmin workflows: process triage, service diagnosis, log analysis, network inspection, and controlled system actions (restart, kill) with mandatory confirmation.

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
| Network tools | `ss` (iproute2), `ip` (iproute2) |
| System tools | `ps`, `free`, `df`, `uname` |

---

## Architecture

```
apps/agent/src/
├── agent/
│   ├── loop.ts           # Conversation loop, Ollama streaming
│   ├── system-prompt.ts  # Behavioral rules, response modes, process triage
│   └── tool-selector.ts  # Keyword-heuristic intent router (detectToolChain)
├── cli/
│   └── repl.ts           # readline REPL, slash command handlers, confirm()
├── tools/
│   ├── registry.ts       # Tool registration and dispatch
│   ├── types.ts          # Tool interface, ToolContext (cwd, confirm)
│   ├── fs/               # read_file, list_dir
│   ├── processes/        # list_processes
│   ├── logs/             # read_log
│   ├── system/           # memory_status, disk_usage, system_info
│   │                     # systemctl_status, journalctl
│   │                     # open_ports, net_interfaces, net_routes
│   └── actions/          # restart_service, kill_process
├── logging/
│   └── logger.ts         # Session/event logging to data/logs/
├── config.ts             # Ollama URL, model, data paths
└── index.ts              # Entry point
```

The extension point is the `Tool` interface in `tools/types.ts`. Each tool is a module that exports a `Tool` implementation and registers itself in `registry.ts`.

---

## Implemented Tools

### Read / Filesystem
| Tool | Command | Description |
|---|---|---|
| `read_file` | — | Reads a local file into context |
| `list_dir` | `ls -la` | Lists directory contents |
| `read_log` | — | Reads last N lines of a log file, pre-computes error/warning markers |

### System
| Tool | Command | Description |
|---|---|---|
| `list_processes` | `ps aux` | Live process snapshot |
| `memory_status` | `free -h` | RAM usage (total, used, free) |
| `disk_usage` | `df -h` | Filesystem usage per mount |
| `system_info` | `uname -a` | Kernel version, hostname, architecture |

### Services
| Tool | Command | Description |
|---|---|---|
| `systemctl_status` | `systemctl status <svc>` | Systemd unit state and last log lines |
| `journalctl` | `journalctl -u <svc> -n N` | Journal entries for a service or system-wide |

### Network
| Tool | Command | Description |
|---|---|---|
| `open_ports` | `ss -tulpn` | Listening ports with process names |
| `net_interfaces` | `ip a` | Network interfaces and IP addresses |
| `net_routes` | `ip route` | Routing table and default gateway |

### Actions (require confirmation)
| Tool | Command | Description |
|---|---|---|
| `restart_service` | `systemctl restart <svc>` | Restarts a systemd service |
| `kill_process` | `kill -TERM <pid>` | Sends SIGTERM to a process by PID |

---

## Slash Commands

```
/help                    Show all commands
/clear                   Clear conversation history
/history                 Show number of conversation turns
/model                   Show current model
/read <path>             Read a file into context
/log <path> [N]          Read last N lines of a log file (default: 50)
/ls [path]               List directory contents (default: .)
/ps [filter]             List running processes, optional text filter
/service <name>          systemctl status <name>
/journal [svc] [N]       journalctl, service optional, default 50 lines

Actions — require typing "yes" to confirm:
/restart <service>       systemctl restart <service>
/kill <pid>              kill -TERM <pid>

Composite diagnosis:
/diagnose <service>      systemctl + journalctl → agent diagnosis → suggests /restart if needed
/fix <service>           /diagnose flow + executes restart automatically if warranted (still asks "yes")

/exit                    Exit (also: exit, quit, Ctrl+D)
```

---

## Auto Tool Detection

The agent detects tool intent from natural language without requiring a slash command. The intent router (`tool-selector.ts`) applies a priority chain:

```
L0  log path or log-intent keyword → read_log
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

Chains are supported: if the message contains both a directory intent and a file path, `list_dir` and `read_file` are executed in sequence before the agent replies.

Destructive tools (`restart_service`, `kill_process`) are never auto-invoked — they require explicit slash commands and `yes` confirmation.

---

## Agent Workflow

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

Context injection follows a strict format that determines the agent's response mode:

- `Here is the content of \`...\`` → File mode
- `Directory listing of \`...\`` → Directory mode
- `Log content of \`...\`` → Log mode (uses pre-computed `[LOG_ERRORS_FOUND: N]` marker)
- `System data:` → System mode
- `Service data:` → Service mode (uses `[SYSTEMCTL_STATUS]` / `[JOURNAL_*]` markers)
- `Network data:` → Network mode

Each mode has strict rules: report only what is in the injected data, never fabricate values.

---

## Security and Action Confirmation

All destructive actions use `ToolContext.confirm()`, a `readline.question` wrapper that requires the user to type `yes` (case-insensitive):

```
Restart service "ollama"? (yes/no): yes
```

Any other input cancels the action. This applies to `/restart`, `/kill`, and the auto-restart step in `/fix`. The agent never executes destructive actions autonomously.

---

## Prerequisites

- **Node.js** 22+
- **Ollama** running locally (`ollama serve`)
- A pulled model — default is `qwen2.5-coder:7b`:
  ```bash
  ollama pull qwen2.5-coder:7b
  ```
- Linux system with `systemd`, `iproute2`, `procps` (standard on most distros)

---

## Installation

```bash
git clone git@github.com:Wil-1302/local-ai-assistant.git
cd local-ai-assistant/apps/agent
npm install
```

Optional: configure model or Ollama URL in `.env`:

```env
OLLAMA_MODEL=qwen2.5-coder:7b
OLLAMA_URL=http://localhost:11434
```

---

## Running

```bash
cd apps/agent
npx tsx src/index.ts
```

The REPL starts immediately:

```
Local AI Assistant — qwen2.5-coder:7b
Type /help for commands or /exit to quit.

You:
```

---

## Usage Examples

**Process triage — natural language:**
```
You: el sistema está lento, qué está corriendo
[tool] executing: ps
Assistant: ATTENTION — node (PID 4821, 87% CPU, 3.1% MEM)
  Motivo: proceso node sin ruta de script visible consumiendo CPU sostenido
  Siguiente paso: kill -9 4821 o verifica con /read /proc/4821/cmdline
```

**Service diagnosis:**
```
You: /diagnose ollama
[tool] executing: systemctl status ollama
[tool] executing: journalctl -u ollama
Assistant: ollama.service — active (running), uptime 2h 14m
  Journal: 3 errores encontrados — CUDA init failed, fallback to CPU
  Recomendación: usa `/restart ollama` para reiniciarlo.
```

**Auto-fix with confirmation:**
```
You: /fix nginx
[tool] executing: systemctl status nginx
[tool] executing: journalctl -u nginx
Assistant: nginx.service — failed (Result: exit-code)
  Journal: 1 error — bind() to 0.0.0.0:80 failed (98: Address already in use)
  Recomendación: usa `/restart nginx` para reiniciarlo.
[fix] restart_service "nginx"
Restart service "nginx"? (yes/no): yes
✓ nginx restarted successfully
```

**Network inspection:**
```
You: qué puertos están escuchando
[tool] executing: ss -tulpn
Assistant: tcp  0.0.0.0:22   sshd
           tcp  127.0.0.1:11434  ollama
           tcp  0.0.0.0:80   nginx
```

**Log analysis:**
```
You: /log /var/log/nginx/error.log 100
Assistant: 4 errores encontrados:
  2024-01-15 14:23:01 [error] upstream timed out (110) ...
  ...
  Siguiente paso: revisar backend upstream o aumentar proxy_read_timeout
```

**File reading — auto-detected:**
```
You: qué hace src/agent/loop.ts
[tool] executing: read src/agent/loop.ts
Assistant: Implements the conversation loop. Maintains message history as
  {role, content} pairs, sends requests to Ollama's /api/chat endpoint
  with streaming enabled, and invokes a token callback for real-time output.
```

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

- **Phase 6** — Persistent memory: session summaries, user profile, long-term context across restarts
- **Phase 7** — Write actions: create/edit files with diff preview and confirmation
- **Phase 8** — Network diagnostics: ping, traceroute, DNS resolution tools
- **Phase 9** — UI: terminal-based TUI (React/Ink) or web frontend
- **Phase 10** — Voice: speech-to-text input, text-to-speech output
- **Long term** — Workspace manager, shared `packages/` utilities, plugin system for community tools
