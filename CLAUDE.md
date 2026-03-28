# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

A local AI assistant built as a TypeScript monorepo with three applications (agent, UI, voice) and shared packages. The project is in early scaffolding stage — most directories are empty and ready for implementation.

## Structure

```
apps/
  agent/    # Core AI agent logic (TypeScript/Node.js)
  ui/       # User interface
  voice/    # Voice/speech processing
packages/
  config/   # Shared configuration
  core/     # Shared core utilities
  memory/   # Memory/state management
  tools/    # Shared tool utilities
data/       # Runtime data (logs, memory, profiles, sessions) — not committed
docs/       # Architecture, ideas, and roadmap docs
```

## Development

The only configured app so far is `apps/agent`. It uses `tsx` for direct TypeScript execution.

```bash
# Run TypeScript files directly
npx tsx <file.ts>

# Install dependencies (from apps/agent/)
npm install
```

No build, lint, or test pipeline is configured yet. The `tsconfig.json` in `apps/agent/` uses strict TypeScript with `moduleResolution: nodenext`, `verbatimModuleSyntax`, and `noUncheckedIndexedAccess`.

## Architecture Notes

- **Monorepo without workspace manager** — no root `package.json` yet; each app/package is independent
- **Data persistence** lives under `data/` (logs, memory, profiles, sessions) — this directory is for runtime state, not source
- The tsconfig includes `jsx: "react-jsx"` anticipating a React-based UI
- `.env` is present but empty — secrets and local config go here
