import { chat, type Message } from "../llm/ollama.js";
import { SYSTEM_PROMPT } from "./system-prompt.js";
import type { Logger } from "../logging/logger.js";
import type { ToolRegistry } from "../tools/registry.js";

export class Agent {
  private history: Message[] = [];
  private pendingContext: string[] = [];
  private logger: Logger;
  // tools will be used for function calling in a future iteration
  private _tools: ToolRegistry;

  constructor(logger: Logger, tools: ToolRegistry) {
    this.logger = logger;
    this._tools = tools;
    this.history.push({ role: "system", content: SYSTEM_PROMPT });
  }

  /**
   * Queue context (e.g. file contents) to be prepended to the next user
   * message. Avoids consecutive user-role messages that can confuse models.
   */
  injectContext(content: string): void {
    this.pendingContext.push(content);
    this.logger.info(`Context queued: ${content.length}c`);
  }

  async send(
    userMessage: string,
    onToken: (token: string) => void
  ): Promise<string> {
    let fullMessage = userMessage;
    if (this.pendingContext.length > 0) {
      const ctx = this.pendingContext.join("\n\n");
      fullMessage = `${ctx}\n\n${userMessage}`;
      this.pendingContext = [];
    }
    this.history.push({ role: "user", content: fullMessage });

    let fullResponse = "";

    try {
      for await (const token of chat(this.history)) {
        onToken(token);
        fullResponse += token;
      }
      this.history.push({ role: "assistant", content: fullResponse });
      this.logger.debug(
        `turn user=${userMessage.length}c response=${fullResponse.length}c`
      );
      return fullResponse;
    } catch (err) {
      this.history.pop(); // keep history consistent on failure
      throw err;
    }
  }

  clearHistory(): void {
    this.history = [{ role: "system", content: SYSTEM_PROMPT }];
    this.pendingContext = [];
    this.logger.info("History cleared");
  }

  /** Number of conversation turns (excludes system prompt). */
  get turns(): number {
    return Math.max(0, this.history.length - 1);
  }
}
