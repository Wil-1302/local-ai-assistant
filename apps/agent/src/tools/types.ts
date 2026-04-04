export interface ToolContext {
  cwd: string;
  /** Interactive confirmation callback — required by action tools. */
  confirm?: (message: string) => Promise<boolean>;
}

/** Structured metrics returned by edit_file after applying SEARCH/REPLACE operations. */
export interface EditMeta {
  /** Total number of SEARCH/FILE_START/FILE_END blocks parsed from the LLM response. */
  parsed: number;
  /** Blocks that found their target and were applied. */
  matched: number;
  /** Blocks that did not find their target (no change made for those). */
  failed: number;
  /** Absolute difference in file size in bytes after the edit. */
  charsChanged: number;
}

export interface ToolResult {
  output: string;
  /** Plain-text version for context injection (no ANSI codes). Defaults to output if absent. */
  contextOutput?: string;
  error?: string;
  /** True when the operation was intentionally skipped (e.g. overwrite declined by user). */
  skipped?: boolean;
  /** Populated by edit_file with per-operation metrics. Undefined for all other tools. */
  editMeta?: EditMeta;
}

export interface Tool {
  readonly name: string;
  readonly description: string;
  execute(args: Record<string, string>, ctx: ToolContext): Promise<ToolResult>;
}
