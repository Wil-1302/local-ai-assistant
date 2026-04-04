/**
 * Template system types for structural web rebuilds (Release 31C).
 *
 * Templates produce deterministic premium HTML/CSS output without
 * depending on LLM quality for visual design.
 */

export type TemplateId = "saas-dashboard" | "generic-shell";

/**
 * Context extracted from the existing project files and user instruction.
 * Passed to template.build() to customize the generated HTML.
 */
export interface TemplateContext {
  /** Product name shown in the sidebar brand and <title> */
  productName: string;
  /** View IDs to generate nav items and view sections for */
  views: string[];
  /** CSS file to preserve (detected from existing <link> or "styles.css") */
  cssFile: string;
  /** JS file to preserve (detected from existing <script src> or "script.js") */
  jsFile: string;
  /** True when the existing file has a login section — reserved for 31C.2 */
  hasExistingLogin: boolean;
}

export interface RebuildTemplate {
  readonly id: TemplateId;
  readonly description: string;
  build(ctx: TemplateContext): string;
}
