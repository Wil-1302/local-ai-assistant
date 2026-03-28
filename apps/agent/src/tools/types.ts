export interface ToolContext {
  cwd: string;
  /** Interactive confirmation callback — required by action tools. */
  confirm?: (message: string) => Promise<boolean>;
}

export interface ToolResult {
  output: string;
  /** Plain-text version for context injection (no ANSI codes). Defaults to output if absent. */
  contextOutput?: string;
  error?: string;
}

export interface Tool {
  readonly name: string;
  readonly description: string;
  execute(args: Record<string, string>, ctx: ToolContext): Promise<ToolResult>;
}
