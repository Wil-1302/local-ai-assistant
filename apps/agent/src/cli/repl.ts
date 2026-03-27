import readline from "readline";
import path from "path";
import { config } from "../config.js";
import type { Agent } from "../agent/loop.js";
import type { Logger } from "../logging/logger.js";
import type { ToolRegistry } from "../tools/registry.js";
import { detectToolCall, type AutoToolCall } from "../agent/tool-selector.js";

const HELP = `
Commands:
  /help              Show this help
  /clear             Clear conversation history
  /history           Show number of conversation turns
  /model             Show current model
  /read <path>       Read a file and load it into context
  /log <path> [N]    Read last N lines of a log file (default: 50)
  /ls [path]         List directory contents (default: current dir)
  /ps [filter]       List running processes (optional text filter)
  /exit              Exit (also: exit, quit, Ctrl+D)
`;

const RULE_WIDTH = 60;
const rule = (char = "─") => char.repeat(RULE_WIDTH);

export class Repl {
  private agent: Agent;
  private logger: Logger;
  private tools: ToolRegistry;
  private rl: readline.Interface;

  constructor(agent: Agent, logger: Logger, tools: ToolRegistry) {
    this.agent = agent;
    this.logger = logger;
    this.tools = tools;
    this.rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
    });
  }

  private handleCommand(input: string): boolean {
    switch (input) {
      case "/help":
        console.log(HELP);
        return true;
      case "/clear":
        this.agent.clearHistory();
        console.log("History cleared.\n");
        return true;
      case "/history":
        console.log(`Turns: ${this.agent.turns}\n`);
        return true;
      case "/model":
        console.log(`Model: ${config.model}\n`);
        return true;
      case "/exit":
      case "exit":
      case "quit":
        this.rl.close();
        return true;
      default:
        return false;
    }
  }

  private async handleLs(input: string): Promise<void> {
    const dirPath = input.slice("/ls".length).trim() || ".";
    const resolved = path.resolve(process.cwd(), dirPath);

    const result = await this.tools.execute(
      "list_dir",
      { path: dirPath },
      { cwd: process.cwd() }
    );

    if (result.error) {
      console.log(`[error] ${result.error}\n`);
      this.logger.warn(`/ls failed: ${result.error}`);
      return;
    }

    const header = `─── ${resolved} `;
    const pad = Math.max(0, RULE_WIDTH - header.length);

    console.log(`\n${header}${"─".repeat(pad)}`);
    console.log(result.output);
    console.log(rule() + "\n");

    const ctx = result.contextOutput ?? result.output;
    this.agent.injectContext(`Directory listing of \`${resolved}\`:\n\n${ctx}`);
    console.log("[Directory loaded into context. Ask anything about it.]\n");
    this.logger.info(`/ls: listed ${resolved}`);
  }

  private async handlePs(input: string): Promise<void> {
    const filter = input.slice("/ps".length).trim();

    const result = await this.tools.execute(
      "list_processes",
      filter ? { filter } : {},
      { cwd: process.cwd() }
    );

    if (result.error) {
      console.log(`[error] ${result.error}\n`);
      this.logger.warn(`/ps failed: ${result.error}`);
      return;
    }

    const header = filter ? `─── processes: ${filter} ` : "─── processes ";
    const pad = Math.max(0, RULE_WIDTH - header.length);

    console.log(`\n${header}${"─".repeat(pad)}`);
    console.log(result.output);
    console.log(rule() + "\n");

    const ctx = result.contextOutput ?? result.output;
    this.agent.injectContext(`Current process list:\n\n${ctx}`);
    console.log("[Process list loaded into context. Ask anything about it.]\n");
    this.logger.info(`/ps: listed processes${filter ? ` filter="${filter}"` : ""}`);
  }

  /**
   * Injects the result of an auto-detected tool into the agent context,
   * using the same format as the corresponding manual slash commands.
   */
  private injectAutoToolContext(call: AutoToolCall, ctx: string): void {
    if (call.toolName === "list_processes") {
      this.agent.injectContext(`Current process list:\n\n${ctx}`);
    } else if (call.toolName === "list_dir") {
      const resolvedDir = path.resolve(process.cwd(), call.args["path"] ?? ".");
      this.agent.injectContext(`Directory listing of \`${resolvedDir}\`:\n\n${ctx}`);
    } else if (call.toolName === "read_file") {
      const resolved = path.resolve(process.cwd(), call.args["path"] ?? "");
      this.agent.injectContext(
        `Here is the content of \`${resolved}\`:\n\n\`\`\`\n${ctx}\n\`\`\``
      );
    } else if (call.toolName === "read_log") {
      this.agent.injectContext(`Log content of \`${call.args["path"] ?? ""}\`:\n\n${ctx}`);
    }
  }

  private async handleLog(input: string): Promise<void> {
    const parts = input.slice("/log".length).trim().split(/\s+/);
    const filePath = parts[0];
    if (!filePath) {
      console.log("Usage: /log <path> [lines]\n");
      return;
    }
    const lines = parts[1] ?? "";

    const resolved = path.resolve(process.cwd(), filePath);

    const result = await this.tools.execute(
      "read_log",
      lines ? { path: filePath, lines } : { path: filePath },
      { cwd: process.cwd() }
    );

    if (result.error) {
      console.log(`[error] ${result.error}\n`);
      this.logger.warn(`/log failed: ${result.error}`);
      return;
    }

    const lineCount = result.output.split("\n").length;
    const header = `─── log: ${resolved} (${lineCount} líneas) `;
    const pad = Math.max(0, RULE_WIDTH - header.length);

    console.log(`\n${header}${"─".repeat(pad)}`);
    console.log(result.output);
    console.log(rule());

    const ctx = result.contextOutput ?? result.output;
    this.agent.injectContext(`Log content of \`${resolved}\`:\n\n${ctx}`);
    console.log("[Log cargado en contexto. Pregunta lo que necesites.]\n");
    this.logger.info(`/log: loaded ${resolved} (${lineCount} lines)`);
  }

  private async handleRead(input: string): Promise<void> {
    const filePath = input.slice("/read".length).trim();
    if (!filePath) {
      console.log("Usage: /read <path>\n");
      return;
    }

    const resolved = path.resolve(process.cwd(), filePath);

    const result = await this.tools.execute(
      "read_file",
      { path: filePath },
      { cwd: process.cwd() }
    );

    if (result.error) {
      console.log(`[error] ${result.error}\n`);
      this.logger.warn(`/read failed: ${result.error}`);
      return;
    }

    const lineCount = result.output.split("\n").length;
    const header = `─── ${resolved} (${lineCount} lines) `;
    const pad = Math.max(0, RULE_WIDTH - header.length);

    console.log(`\n${header}${"─".repeat(pad)}`);
    console.log(result.output);
    console.log(rule());

    this.agent.injectContext(
      `Here is the content of \`${resolved}\`:\n\n\`\`\`\n${result.output}\n\`\`\``
    );
    console.log("[File loaded into context. Ask anything about it.]\n");
    this.logger.info(`/read: loaded ${resolved} (${lineCount} lines)`);
  }

  start(): void {
    console.log(`\nLocal AI Assistant — ${config.model}`);
    console.log("Type /help for commands or /exit to quit.\n");

    const loop = (): void => {
      this.rl.question("You: ", async (raw) => {
        const input = raw.trim();

        if (!input) {
          loop();
          return;
        }

        // Async commands
        if (input.startsWith("/ls")) {
          await this.handleLs(input);
          loop();
          return;
        }

        if (input.startsWith("/read")) {
          await this.handleRead(input);
          loop();
          return;
        }

        if (input.startsWith("/log")) {
          await this.handleLog(input);
          loop();
          return;
        }

        if (input.startsWith("/ps")) {
          await this.handlePs(input);
          loop();
          return;
        }

        // Sync commands
        if (this.handleCommand(input)) {
          loop();
          return;
        }

        // Auto tool detection — run at most one tool before generating response
        const autoTool = detectToolCall(input);
        if (autoTool) {
          process.stdout.write(`[tool] executing: ${autoTool.label}\n`);
          this.logger.info(`auto-tool: ${autoTool.toolName}`);
          const result = await this.tools.execute(
            autoTool.toolName,
            autoTool.args,
            { cwd: process.cwd() }
          );
          if (result.error) {
            process.stdout.write(`[tool] error: ${result.error}\n`);
            this.logger.warn(`auto-tool ${autoTool.toolName} failed: ${result.error}`);
            // Inject error context so the model responds as a tool-aware agent,
            // not as an isolated LLM that implies it has no file/tool capabilities.
            this.agent.injectContext(
              `[Tool result: ${autoTool.toolName}] Error: ${result.error}`
            );
          } else {
            const ctx = result.contextOutput ?? result.output;
            this.injectAutoToolContext(autoTool, ctx);
          }
        }

        process.stdout.write("Assistant: ");

        try {
          await this.agent.send(input, (token) => {
            process.stdout.write(token);
          });
          process.stdout.write("\n\n");
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err);
          process.stdout.write(`\n[error] ${msg}\n\n`);
          this.logger.error("Agent send failed", err);
        }

        loop();
      });
    };

    this.rl.on("close", () => {
      this.logger.session("end");
      console.log("\nBye.");
      process.exit(0);
    });

    loop();
  }
}
