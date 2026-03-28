# Architecture

## apps/agent

Core AI assistant for terminal use. The only active app in this phase.

### Module layout

```
src/
├── index.ts                 # Entry point: wires everything, starts the repl
├── config.ts                # Config: model, host, paths — loaded from .env
├── llm/
│   └── ollama.ts            # Ollama HTTP client (streaming /api/chat)
├── agent/
│   ├── loop.ts              # Agent: manages history, calls LLM, future tool routing
│   └── system-prompt.ts     # System prompt (Linux/terminal persona)
├── cli/
│   └── repl.ts              # Terminal REPL: readline, slash commands, streaming output
├── logging/
│   └── logger.ts            # Structured file logger (info/warn/error/debug)
└── tools/
    ├── types.ts             # Tool interface: Tool, ToolContext, ToolResult
    └── registry.ts          # Tool registry: register, list, execute, describe
```

### Data flow

```
stdin
 → Repl           captures input, routes slash commands vs. messages
 → Agent.send()   appends to history, calls LLM, returns full response
 → OllamaClient   streams tokens over HTTP to local Ollama
 → Repl           writes each token to stdout as it arrives
 → Logger         records session events, errors, turn metadata
```

### Configuration

All config is in `src/config.ts`. Supports `.env` at the project root.

| Variable       | Default               | Description        |
|----------------|-----------------------|--------------------|
| OLLAMA_MODEL   | qwen2.5-coder:7b     | Model to use       |
| OLLAMA_HOST    | localhost             | Ollama host        |
| OLLAMA_PORT    | 11434                 | Ollama port        |
| LOG_PATH       | data/logs/agent.log  | Log file path      |

### Slash commands (REPL)

| Command    | Action                          |
|------------|---------------------------------|
| /help      | Show command list                |
| /clear     | Reset conversation history       |
| /history   | Show number of turns so far      |
| /model     | Show current model name          |
| /exit      | Quit (also: exit, quit, Ctrl+D)  |

### Adding tools

Tools implement `Tool` from `src/tools/types.ts`:

```typescript
interface Tool {
  readonly name: string;
  readonly description: string;
  execute(args: Record<string, string>, ctx: ToolContext): Promise<ToolResult>;
}
```

Register in `src/index.ts`:

```typescript
tools.register(new MyTool());
```

Planned tool categories (not yet implemented):

- `tools/files/`         — read, search, stat
- `tools/processes/`     — ps, top, kill (with confirmation)
- `tools/logs/`          — journalctl, tail, grep
- `tools/network/`       — ip, ss, ping, dig
- `tools/commands/`      — safe shell execution with approval
- `tools/git/`           — status, log, diff
- `tools/dev/`           — run scripts, npm, build tools
- `tools/observability/` — system metrics, disk, CPU, memory
- `tools/security/`      — permissions audit, config review (read-only)

### Running

```bash
cd apps/agent
npm start          # runs: tsx src/index.ts
```

### Planned apps (not yet active)

- `apps/ui/`     — terminal TUI or web interface
- `apps/voice/`  — speech-to-text / text-to-speech

### Packages (not yet active)

- `packages/config/`   — shared config types and loaders
- `packages/core/`     — shared types and utilities
- `packages/memory/`   — persistent conversation memory
- `packages/tools/`    — shared tool implementations
