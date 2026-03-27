import type { Tool, ToolContext, ToolResult } from "./types.js";

export class ToolRegistry {
  private tools = new Map<string, Tool>();

  register(tool: Tool): void {
    this.tools.set(tool.name, tool);
  }

  get(name: string): Tool | undefined {
    return this.tools.get(name);
  }

  list(): Tool[] {
    return [...this.tools.values()];
  }

  has(name: string): boolean {
    return this.tools.has(name);
  }

  async execute(
    name: string,
    args: Record<string, string>,
    ctx: ToolContext
  ): Promise<ToolResult> {
    const tool = this.tools.get(name);
    if (!tool) {
      return { output: "", error: `Tool "${name}" not found` };
    }
    return tool.execute(args, ctx);
  }

  describe(): string {
    if (this.tools.size === 0) return "No tools registered.";
    return this.list()
      .map((t) => `- ${t.name}: ${t.description}`)
      .join("\n");
  }
}
