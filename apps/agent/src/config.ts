import path from "path";
import fs from "fs";
import { fileURLToPath } from "url";

// Project root: apps/agent/src/ -> apps/agent/ -> apps/ -> root
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = path.resolve(__dirname, "../../..");

function loadEnv(): void {
  const envPath = path.join(PROJECT_ROOT, ".env");
  if (!fs.existsSync(envPath)) return;
  const lines = fs.readFileSync(envPath, "utf-8").split("\n");
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const idx = trimmed.indexOf("=");
    if (idx === -1) continue;
    const key = trimmed.slice(0, idx).trim();
    const value = trimmed.slice(idx + 1).trim();
    if (key && !process.env[key]) {
      process.env[key] = value;
    }
  }
}

loadEnv();

export const config = {
  model: process.env["OLLAMA_MODEL"] ?? "qwen2.5-coder:7b",
  ollamaHost: process.env["OLLAMA_HOST"] ?? "localhost",
  ollamaPort: parseInt(process.env["OLLAMA_PORT"] ?? "11434", 10),
  logPath: process.env["LOG_PATH"] ?? path.join(PROJECT_ROOT, "data/logs/agent.log"),
  dataDir: path.join(PROJECT_ROOT, "data"),
  projectRoot: PROJECT_ROOT,
  // Service name that provides the LLM backend (e.g. "ollama").
  // Actions targeting this service skip LLM-based steps to avoid self-interruption.
  backendService: process.env["AGENT_BACKEND_SERVICE"] ?? "ollama",
  // Services that may be restarted via sudo without a password.
  // Must match the NOPASSWD rules in /etc/sudoers.d/local-ai-agent.
  allowedRestartServices: new Set(
    (process.env["ALLOWED_RESTART_SERVICES"] ?? "")
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean)
  ),
} as const;

export type Config = typeof config;
