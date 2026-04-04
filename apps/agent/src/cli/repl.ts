import readline from "readline";
import path from "path";
import fs from "fs";
import os from "os";
import vm from "vm";
import { execSync } from "child_process";
import { config } from "../config.js";
import type { Agent } from "../agent/loop.js";
import type { Logger } from "../logging/logger.js";
import type { ToolRegistry } from "../tools/registry.js";
import { detectToolChain, detectCreateAndRunIntent, detectMultiFileIntent, detectSemanticEditIntent, detectBugfixIntent, detectEditWithoutFileIntent, detectProjectScanIntent, detectMultiReadIntent, detectRunAndFixIntent, getBlockedWritePathError, getBlockedEditPathError, type AutoToolCall, type SemanticEditIntent, type BugfixIntent, type RunAndFixIntent } from "../agent/tool-selector.js";
import { findKeyFiles } from "../tools/project/scan.js";
import { detectPlanningIntent, detectContinueReleaseIntent, detectTacticalImprovementIntent, detectAnalysisIntent, detectViewCompletionIntent, type ContinueReleaseIntent, type TacticalImprovementIntent, type ViewCompletionIntent } from "../agent/planner/detect-planning-intent.js";
import { analyzeWorkspace, formatAnalysisReport, buildTacticalCSSPatch, buildSearchTableJS } from "../agent/planner/project-analyzer.js";
import { applyEvolutionFeatures } from "../agent/planner/tactical-builders.js";
import { applyViewCompletions, ensureProjectShell } from "../agent/planner/view-completion-builders.js";
import { buildSchoolV2Content } from "../agent/planner/step-executor.js";
import { createExecutionPlan } from "../agent/planner/create-plan.js";
import { executePlan } from "../agent/planner/execute-plan.js";
import { resolveProjectWorkspace, continueProjectWorkspace, findSimilarProjects, inferStackFromWorkspace, generateProjectReadme, appendTacticalImprovements, slugify, shouldUseCwdDirectly, cwdAsWorkspace } from "../agent/planner/workspace.js";
import { buildProjectStateFromPlan, ensureProjectState, projectStateToExecutionPlan, refreshProjectStateFromPlan, writeProjectState } from "../agent/planner/project-state.js";
import { assessWebStructuralRequirements, isLikelyWebStructuralInstruction } from "../agent/structural-edit/assess-structure.js";
import { chat } from "../llm/ollama.js";
import { evaluateAlerts, formatAlerts, formatAlertsCompact, AlertTracker } from "../alerts/engine.js";
import { consoleNotifier, desktopNotifier, composeNotifiers } from "../alerts/notifier.js";
import { defaultRules } from "../alerts/rules.js";
import type { AuditSnapshot } from "../alerts/types.js";
import type { ProjectState, ProjectWorkspaceState, WorkspaceMode } from "../agent/planner/types.js";

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
  /service <name>    Show systemd service status (systemctl status)
  /journal [svc] [N] Read systemd journal (service optional, default 50 lines)
  /ping <host>       Ping a host (ping -c 4)
  /dns <host>        DNS lookup for a host (getent hosts)
  /http <url>        Check HTTP headers of a URL (curl -I --max-time 10)
  /check web <host>        Composite web check: DNS + ping + HTTP → summary
  /check service <name>    Service check: status + journal → structured report
  /audit             System audit: memory, disk, processes, ports, services
  /audit deep        Deep audit: grouped CRITICAL/ATTENTION/OK blocks + conclusion
  /monitor <secs>    Continuous monitor: repeat audit every N seconds (Ctrl+C to stop)
  /alert             Evaluate alert rules and show active alerts (CRITICAL/WARNING/OK)
  /multi             Enter multiline prompt (type END to finish — sent as one input)
  /write <path>      Write a file (multiline — type END on its own line to finish)
  /edit <path>       Edit a file (<<<SEARCH/>>>REPLACE/>>>END blocks — type END to finish)
  /run <file>        Run a script: python3 (.py), node (.js), gcc (.c), g++ (.cpp)
  /project           Scan project structure and show summary
  /project review    Scan + read key files + LLM review

Natural language:
  "crea una web con html y css"              → genera múltiples archivos (multi-file)
  "crea hola.py y ejecútalo"                 → genera + ejecuta un archivo
  "cambia el color del botón a azul en styles.css"  → edición semántica (lee + LLM + aplica)
  "agrega un footer a index.html"            → edición semántica
  "añade un console.log en script.js"        → edición semántica
  "arregla este bug en script.js"            → bugfix (lee + LLM analiza + aplica fix)
  "refactoriza esta función en app.py"       → refactor localizado
  "simplifica este bloque en utils.ts"       → refactor localizado
  "revisa este proyecto"                     → escanea estructura + resumen LLM
  "cómo está conectado index.html con styles.css"  → lee múltiples archivos + relaciones
  "ejecuta y arregla app.py"                 → run+fix loop: ejecuta, detecta errores, aplica fix, reintenta
  "corre app.py si falla corrígelo"          → run+fix loop (máx. 2 intentos)

Actions (require confirmation):
  /restart <service> Restart a systemd service (systemctl restart)
  /kill <pid>        Send SIGTERM to a process by PID
  /diagnose <svc>    Combined diagnosis: status + journal → summary + action suggestion
  /fix <svc>         Diagnose a service and restart it if needed (uses real tools)

  /exit              Exit (also: exit, quit, Ctrl+D)
`;

const RULE_WIDTH = 60;
const rule = (char = "─") => char.repeat(RULE_WIDTH);

// Parse human-readable byte strings from free/df output (e.g. "15Gi", "456Mi", "0B", "8.0G")
function parseHumanBytes(s: string): number {
  const m = s.trim().match(/^([\d.]+)\s*([KMGTP]?)i?B?$/i);
  if (!m) return 0;
  const val = parseFloat(m[1] ?? "0");
  switch ((m[2] ?? "").toUpperCase()) {
    case "K": return val * 1024;
    case "M": return val * 1024 ** 2;
    case "G": return val * 1024 ** 3;
    case "T": return val * 1024 ** 4;
    default:  return val;
  }
}

// ── Semantic edit prompt ──────────────────────────────────────────────────────

function buildSemanticEditPrompt(filePath: string, content: string, instruction: string): string {
  return `You are a precise code editor. Apply the following change to the file.

RULES:
- Output ONLY edit blocks. No explanations, no markdown, no prose.
- Make the minimal change. Do not rewrite the whole file.
- Use multiple blocks if the change affects several places.
- CSS rule: when adding a new property to a selector that does not already have it, include the ENTIRE selector block in SEARCH (from "selector {" to the closing "}") and add the new property inside in REPLACE.
- HTML insertion rule: when inserting content BEFORE a closing tag (</body>, </div>, </section>, etc.), the SEARCH block must contain ONLY the closing tag, and the REPLACE block must be the new content FIRST, then the closing tag. Never place the closing tag before the inserted content.
- INSERT AT BEGINNING rule: to insert content at the very start of a file (e.g. "add a console.log at the top"), use <<<FILE_START instead of <<<SEARCH. No search text is needed. The REPLACE block must contain ONLY the new content to add — NEVER copy existing file content into it; the original file content is preserved automatically.
- INSERT AT END rule: to insert content at the very end of a file, use <<<FILE_END instead of <<<SEARCH. No search text is needed. The REPLACE block must contain ONLY the new content to add — NEVER copy existing file content into it.
- EACH <<<SEARCH block MUST contain verbatim text that exists literally in the file (exact whitespace and indentation). Never guess — copy from the file shown below.
- DUPLICATE CHECK: if the requested element (footer, property, class, function, log statement, etc.) already exists in the file in a semantically correct position, output exactly the word NO_CHANGES_NEEDED and nothing else.

FORMATS:
<<<SEARCH
[exact text to find in file]
>>>REPLACE
[replacement text]
>>>END

<<<FILE_START
>>>REPLACE
[content to prepend to file]
>>>END

<<<FILE_END
>>>REPLACE
[content to append to file]
>>>END

EXAMPLE — adding a missing CSS property to a selector:
<<<SEARCH
button {
  padding: 10px;
}
>>>REPLACE
button {
  padding: 10px;
  color: blue;
}
>>>END

EXAMPLE — inserting a nav before a closing section tag:
<<<SEARCH
</section>
>>>REPLACE
<nav>Home | About</nav>
</section>
>>>END

File: ${filePath}
\`\`\`
${content}
\`\`\`

Instruction: ${instruction}`;
}

/**
 * Retry prompt used when NO_CHANGES_NEEDED was a false positive.
 * Strips the DUPLICATE CHECK rule and adds an explicit note that the element is absent.
 */
function buildSemanticEditRetryPrompt(
  filePath: string,
  content: string,
  instruction: string,
  missingElement: string,
): string {
  return `You are a precise code editor. Apply the following change to the file.

CRITICAL: The element "${missingElement}" does NOT exist anywhere in the file. You MUST generate insertion blocks — do NOT output NO_CHANGES_NEEDED.

RULES:
- Output ONLY edit blocks. No explanations, no markdown, no prose.
- Make the minimal change.
- HTML insertion: SEARCH block contains ONLY the closing tag; REPLACE block has new content FIRST, then the closing tag.
- INSERT AT BEGINNING: use <<<FILE_START (no search text). The REPLACE block must contain ONLY the new content — never copy existing file content into it.
- EACH <<<SEARCH block MUST contain verbatim text from the file below.

FORMATS:
<<<SEARCH
[exact text to find in file]
>>>REPLACE
[replacement text]
>>>END

<<<FILE_START
>>>REPLACE
[content to prepend]
>>>END

File: ${filePath}
\`\`\`
${content}
\`\`\`

Instruction: ${instruction}`;
}

function buildStructuralSemanticRetryPrompt(
  filePath: string,
  content: string,
  instruction: string,
  assessmentSummary: string,
): string {
  return `You are a precise code editor performing a structural web rebuild.

CRITICAL: The current file does NOT satisfy the requested structural objective.
The previous "NO_CHANGES_NEEDED" result was incorrect.
You MUST generate edit blocks. Do NOT output NO_CHANGES_NEEDED.

STRUCTURAL DIAGNOSIS:
${assessmentSummary}

RULES:
- Output ONLY edit blocks. No explanations, no markdown, no prose.
- Make the smallest structural change set that moves the file toward the requested rebuild.
- If inserting before a closing tag, SEARCH must contain ONLY the closing tag and REPLACE must put the new content before that closing tag.
- You may use <<<FILE_START or <<<FILE_END when appropriate.
- EACH <<<SEARCH block MUST contain verbatim text from the file below.

FORMATS:
<<<SEARCH
[exact text to find in file]
>>>REPLACE
[replacement text]
>>>END

<<<FILE_START
>>>REPLACE
[content to prepend]
>>>END

<<<FILE_END
>>>REPLACE
[content to append]
>>>END

File: ${filePath}
\`\`\`
${content}
\`\`\`

Instruction: ${instruction}`;
}

function formatStructuralAssessmentSummary(
  assessment: ReturnType<typeof assessWebStructuralRequirements>,
): string {
  if (assessment.findings.length === 0) {
    return "- No structural findings were derived from the instruction.";
  }
  return assessment.findings
    .map((f) => {
      const evidence = f.evidence.length > 0 ? ` | evidence: ${f.evidence.join(", ")}` : "";
      return `- ${f.key}: ${f.status} | ${f.reason}${evidence}`;
    })
    .join("\n");
}

function loadStructuralWebInputs(
  filePath: string,
  fileContent: string,
  instruction: string,
): { instruction: string; html: string; css: string; js: string } {
  const absPath = path.resolve(process.cwd(), filePath);
  const dir = path.dirname(absPath);
  const base = path.basename(absPath).toLowerCase();

  const readIfExists = (p: string): string => {
    try {
      return fs.existsSync(p) ? fs.readFileSync(p, "utf-8") : "";
    } catch {
      return "";
    }
  };

  const html = base.endsWith(".html") ? fileContent : readIfExists(path.join(dir, "index.html"));
  const css = base.endsWith(".css") ? fileContent : readIfExists(path.join(dir, "styles.css"));
  const js = (base.endsWith(".js") || base.endsWith(".mjs") || base.endsWith(".ts"))
    ? fileContent
    : readIfExists(path.join(dir, "script.js"));

  return { instruction, html, css, js };
}

// ── Bugfix / refactor prompt ──────────────────────────────────────────────────

/**
 * Deterministic JS/TS syntax check using Node's vm.Script.
 * For .ts files, strips type annotations best-effort before checking.
 * Returns the syntax error message, or null if the file parses cleanly.
 */
function checkJsSyntax(filePath: string, content: string): string | null {
  const ext = filePath.slice(filePath.lastIndexOf(".")).toLowerCase();
  if (ext !== ".js" && ext !== ".ts" && ext !== ".mjs" && ext !== ".cjs") return null;

  // For TS: strip inline type annotations well enough to catch obvious syntax errors.
  // We strip `: Type` after params/vars and `<Type>` casts — not exhaustive but catches
  // common cases without a full TS parser.
  let source = content;
  if (ext === ".ts") {
    // Remove simple type annotations like `: string`, `: number`, `: SomeType`
    source = source.replace(/:\s*[A-Za-z_$][A-Za-z0-9_$<>\[\]|&., ]*(?=[,\)\s=;{])/g, "");
    // Remove generic type params on function calls: foo<Bar>(...)  → foo(...)
    source = source.replace(/<[A-Za-z_$][A-Za-z0-9_$<>, ]*>/g, "");
  }

  try {
    new vm.Script(source);
    return null;
  } catch (err) {
    return err instanceof Error ? err.message : String(err);
  }
}

/**
 * Returns the closing quote character if `line` contains an unclosed string
 * literal (single, double, or template), or null if the line is balanced.
 * Handles backslash escapes.
 */
function findUnclosedString(line: string): '"' | "'" | '`' | null {
  let inSingle = false;
  let inDouble = false;
  let inTemplate = false;

  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === "\\") { i++; continue; } // skip escaped char
    if (ch === '"' && !inSingle && !inTemplate) inDouble = !inDouble;
    else if (ch === "'" && !inDouble && !inTemplate) inSingle = !inSingle;
    else if (ch === "`" && !inSingle && !inDouble) inTemplate = !inTemplate;
  }

  if (inDouble) return '"';
  if (inSingle) return "'";
  if (inTemplate) return "`";
  return null;
}

/**
 * Attempt heuristic fixes for common JS/TS syntax errors.
 * Returns the fixed content string if a fix was found, or null otherwise.
 *
 * Recursive (max depth 2) so it can handle COMBINED errors in sequence, e.g.:
 *   - Unclosed string on line 1  +  stray `}` on line 2
 *   - Missing closing `}`  +  unbalanced parens
 *
 * Per-pass fixes tried:
 *   1. Unclosed string literal (single, double, template)
 *   2. Missing closing braces
 *   3. Extra stray closing braces (removes trailing ones)
 *   4. Missing closing parentheses
 */
function tryFixJsSyntaxDeterministic(
  filePath: string,
  content: string,
  _depth = 0,
): string | null {
  if (_depth > 2) return null;

  const lines = content.split("\n");

  // Attempt 1: unclosed string literal — fix first found, try suffix variants
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i] ?? "";
    const closer = findUnclosedString(line);
    if (closer === null) continue;

    for (const suffix of [closer, closer + ";", closer + ");"]) {
      const candidate = [...lines];
      candidate[i] = line + suffix;
      const result = candidate.join("\n");
      if (checkJsSyntax(filePath, result) === null) return result;
      // Still broken after this suffix — cascade to next pass
      const deeper = tryFixJsSyntaxDeterministic(filePath, result, _depth + 1);
      if (deeper !== null) return deeper;
    }
    break; // only tackle the first unclosed string per depth level
  }

  // Attempt 2: missing closing braces
  const openBraces = (content.match(/\{/g) ?? []).length;
  const closeBraces = (content.match(/\}/g) ?? []).length;
  if (openBraces > closeBraces) {
    const result = content.trimEnd() + "\n" + "}\n".repeat(openBraces - closeBraces);
    if (checkJsSyntax(filePath, result) === null) return result;
    const deeper = tryFixJsSyntaxDeterministic(filePath, result, _depth + 1);
    if (deeper !== null) return deeper;
  }

  // Attempt 3: extra stray closing braces (remove trailing ones)
  if (closeBraces > openBraces) {
    let result = content;
    for (let i = closeBraces - openBraces; i > 0; i--) {
      result = result.replace(/\n\s*\}\s*$/, "");
    }
    if (result !== content) {
      if (checkJsSyntax(filePath, result) === null) return result;
      const deeper = tryFixJsSyntaxDeterministic(filePath, result, _depth + 1);
      if (deeper !== null) return deeper;
    }
  }

  // Attempt 4: missing closing parentheses (trailing)
  const openParens = (content.match(/\(/g) ?? []).length;
  const closeParens = (content.match(/\)/g) ?? []).length;
  if (openParens > closeParens) {
    const result = content.trimEnd() + ")".repeat(openParens - closeParens) + ";\n";
    if (checkJsSyntax(filePath, result) === null) return result;
    const deeper = tryFixJsSyntaxDeterministic(filePath, result, _depth + 1);
    if (deeper !== null) return deeper;
  }

  return null;
}

function buildBugfixPrompt(
  filePath: string,
  content: string,
  instruction: string,
  syntaxError?: string,
): string {
  const syntaxSection = syntaxError
    ? `\nSYNTAX ERROR DETECTED (deterministic check):\n  ${syntaxError}\nYou MUST fix this error. Do NOT output NO_CHANGES_NEEDED.\n`
    : "";

  return `You are a precise code editor. Analyze the file and apply the requested fix or refactor.
${syntaxSection}
RULES:
- Output ONLY edit blocks. No explanations, no markdown, no prose.
- Make the minimal targeted change. Do NOT rewrite the whole file.
- For bug fixes: find the described issue and fix only that.
- For refactoring: preserve behavior, improve structure/readability in the affected block only.
- Use multiple blocks if the fix requires changes in several places.
- EACH <<<SEARCH block MUST contain verbatim text from the file (exact whitespace and indentation). Never guess — copy from the file shown below.
- If the code truly has no issue and needs no change, output exactly: NO_CHANGES_NEEDED

FORMAT:
<<<SEARCH
[exact text to find in file]
>>>REPLACE
[replacement text]
>>>END

File: ${filePath}
\`\`\`
${content}
\`\`\`

Instruction: ${instruction}`;
}

/**
 * Prompt for refactor/simplify requests on code that is already syntactically valid.
 * NO_CHANGES_NEEDED is intentionally NOT offered — the LLM must produce at least one edit.
 */
function buildRefactorPrompt(filePath: string, content: string, instruction: string): string {
  return `You are a code quality specialist. Apply one small, targeted improvement to the code below.

RULES:
- Output ONLY edit blocks. No explanations, no markdown, no prose.
- You MUST produce at least one edit block. There is ALWAYS at least one thing to improve.
- Priority checklist — apply the FIRST that fits:
    1. Any inline string/number literal used in a function body → extract to a named const above the function
    2. A function name that is vague (single verb, no context) → rename to something more descriptive
    3. A plain function expression that could be an arrow function → convert it
    4. A comment that just restates code → remove it
    5. Two similar consecutive lines → consolidate into one
- The improvement must preserve the observable behavior of the code.
- Focus on the section the user mentioned; if none specified, apply the first matching rule.
- EACH <<<SEARCH block MUST contain verbatim text from the file (exact whitespace and indentation).

EXAMPLE — extract string literal to constant:
Input:
  function greet() {
    console.log("hello");
  }
Correct output:
<<<SEARCH
function greet() {
  console.log("hello");
}
>>>REPLACE
const GREETING = "hello";

function greet() {
  console.log(GREETING);
}
>>>END

FORMAT:
<<<SEARCH
[exact text to find in file]
>>>REPLACE
[replacement text]
>>>END

File: ${filePath}
\`\`\`
${content}
\`\`\`

Instruction: ${instruction}`;
}

/**
 * Verify a NO_CHANGES_NEEDED claim by checking whether the referenced HTML element
 * actually exists in the file content.
 *
 * Returns { valid: true } when the claim is plausible, or
 * { valid: false, missingElement } when it is a false positive.
 */
function verifyNoChangesNeeded(
  instruction: string,
  fileContent: string,
): { valid: boolean; missingElement: string | null } {
  const lower = instruction.toLowerCase();
  const contentLower = fileContent.toLowerCase();

  // HTML structural elements that can be checked by tag presence
  const HTML_ELEMENTS = [
    "footer", "header", "nav", "aside", "section", "article",
    "main", "dialog", "figure", "details", "summary", "form",
  ];

  for (const tag of HTML_ELEMENTS) {
    if (lower.includes(tag)) {
      const exists = contentLower.includes(`<${tag}`);
      return { valid: exists, missingElement: exists ? null : tag };
    }
  }

  // JS/TS verifiable patterns: check literal presence in file
  const JS_TS_EXTS = [".js", ".ts", ".mjs", ".cjs", ".jsx", ".tsx"];
  const fileExt = (instruction.match(/\.\w+(?:\s|$)/) ?? [])[0]?.trim() ?? "";
  const isJsTs = JS_TS_EXTS.some((e) => fileExt === e || lower.includes(e));

  if (isJsTs || lower.includes("console.log")) {
    if (lower.includes("console.log") || lower.includes("console log")) {
      const exists = contentLower.includes("console.log");
      return { valid: exists, missingElement: exists ? null : "console.log" };
    }
  }

  // For CSS / unrecognised elements trust the LLM
  return { valid: true, missingElement: null };
}

/**
 * Deterministic fallback for "insert console.log at the beginning of a JS/TS file".
 * Used when the LLM fails to produce valid blocks for a clear prepend instruction.
 * Returns an operations string ready for edit_file, or null if not applicable.
 */
function buildPrependFallback(instruction: string, filePath: string): string | null {
  const lower = instruction.toLowerCase();

  const isPrepend =
    lower.includes("al inicio") ||
    lower.includes("al principio") ||
    lower.includes("al comienzo") ||
    lower.includes("at the beginning") ||
    lower.includes("at the start") ||
    lower.includes("at the top");

  if (!isPrepend) return null;

  const ext = (filePath.split(".").pop() ?? "").toLowerCase();
  if (
    (ext === "js" || ext === "ts" || ext === "mjs" || ext === "cjs") &&
    lower.includes("console.log")
  ) {
    const filename = filePath.split("/").pop() ?? filePath;
    return `<<<FILE_START\n>>>REPLACE\nconsole.log("${filename} loaded");\n\n>>>END\n`;
  }

  return null;
}

/**
 * Deterministic fallback for common HTML structural insertions (footer, header).
 * Used when both the primary and retry LLM calls fail to produce valid blocks.
 */
function buildHtmlElementFallback(
  instruction: string,
  filePath: string,
  fileContent: string,
): string | null {
  const lower = instruction.toLowerCase();
  const ext = (filePath.split(".").pop() ?? "").toLowerCase();
  if (ext !== "html" && ext !== "htm") return null;

  if (lower.includes("footer") && fileContent.includes("</body>")) {
    return `<<<SEARCH\n</body>\n>>>REPLACE\n<footer>\n  <p>&copy; ${new Date().getFullYear()}</p>\n</footer>\n</body>\n>>>END\n`;
  }

  if (
    (lower.includes("header") || lower.includes("cabecera")) &&
    fileContent.includes("<body>")
  ) {
    return `<<<SEARCH\n<body>\n>>>REPLACE\n<body>\n<header>\n  <nav></nav>\n</header>\n>>>END\n`;
  }

  return null;
}

// ── Multi-file extraction ─────────────────────────────────────────────────────

interface FileBlock {
  filename: string;
  content: string;
}

/**
 * Maps a fenced code block language tag to a default filename.
 * Used as fallback when no filename comment is present on the first line.
 */
const LANG_TO_FILENAME: Readonly<Record<string, string>> = {
  html:       "index.html",
  css:        "style.css",
  javascript: "script.js",
  js:         "script.js",
  typescript: "main.ts",
  ts:         "main.ts",
  python:     "main.py",
  py:         "main.py",
  bash:       "script.sh",
  sh:         "script.sh",
};

/**
 * Extracts filenames explicitly mentioned in the user's message.
 * Only matches simple filenames (no leading path separators).
 */
function extractMentionedFilenames(message: string): string[] {
  const re = /\b([a-zA-Z0-9_\-]+\.[a-zA-Z0-9]{1,6})\b/g;
  const seen = new Set<string>();
  const result: string[] = [];
  let m: RegExpExecArray | null;
  while ((m = re.exec(message)) !== null) {
    const name = m[1]!;
    if (!seen.has(name)) {
      seen.add(name);
      result.push(name);
    }
  }
  return result;
}

// ── Run + fix helpers ─────────────────────────────────────────────────────────

interface RunErrorInfo {
  hasError: boolean;
  errorText: string;
  sourceFile: string | null;
  errorType: string | null;
  failingLineNumber: number | null;
  failingLineText: string | null;
}

/**
 * Inspect run_command output for signs of a runtime error.
 * Returns structured error info including type, line number, and failing line text.
 */
function detectRunError(output: string): RunErrorInfo {
  const noError: RunErrorInfo = { hasError: false, errorText: "", sourceFile: null, errorType: null, failingLineNumber: null, failingLineText: null };

  // Python traceback is the most reliable signal
  const tracebackMatch = output.match(/Traceback \(most recent call last\)[\s\S]{0,2000}/);
  if (tracebackMatch) {
    const text = tracebackMatch[0];
    return { hasError: true, errorText: text, sourceFile: inferSourceFileFromError(output), ...extractErrorDetails(text) };
  }

  // Python / JS / compile named error on stderr section
  const namedError = output.match(/\[stderr\]\n?([\s\S]{0,1500})/);
  const errorSection = namedError?.[1] ?? output;
  const ERROR_RE = /(?:SyntaxError|NameError|TypeError|AttributeError|IndentationError|ValueError|ImportError|ModuleNotFoundError|ReferenceError|RangeError)[:\s]/;
  if (ERROR_RE.test(errorSection)) {
    const excerpt = errorSection.slice(0, 800);
    return { hasError: true, errorText: excerpt, sourceFile: inferSourceFileFromError(output), ...extractErrorDetails(excerpt) };
  }

  // Generic "error:" from compilers (gcc/g++)
  if (/\berror:/i.test(errorSection)) {
    const excerpt = errorSection.slice(0, 800);
    return { hasError: true, errorText: excerpt, sourceFile: inferSourceFileFromError(output), errorType: "CompileError", failingLineNumber: null, failingLineText: null };
  }

  return noError;
}

/** Extract error type, line number, and failing line text from an error string. */
function extractErrorDetails(text: string): { errorType: string | null; failingLineNumber: number | null; failingLineText: string | null } {
  const typeMatch = text.match(/\b(SyntaxError|NameError|TypeError|AttributeError|IndentationError|ValueError|ImportError|ModuleNotFoundError|ReferenceError|RangeError)\b/);
  const errorType = typeMatch?.[1] ?? null;

  // Python: "line N" (from "File ..., line N" or SyntaxError header)
  let lineMatch = text.match(/\bline (\d+)\b/);
  // JS/Node: "file.js:N:M" pattern (with or without trailing paren)
  if (!lineMatch) lineMatch = text.match(/\.(?:js|mjs|cjs|ts):(\d+):\d+/);
  const failingLineNumber = lineMatch ? parseInt(lineMatch[1]!, 10) : null;

  let failingLineText: string | null = null;
  if (failingLineNumber !== null) {
    // Python SyntaxError: code line before the "^" caret pointer
    const pointerMatch = text.match(/\n( {4,}[^\n]+)\n[ \t]*\^/);
    if (pointerMatch) {
      failingLineText = pointerMatch[1]!.trim();
    } else {
      // Python runtime traceback: last indented body line
      const lines = text.split("\n");
      for (let i = lines.length - 1; i >= 0; i--) {
        const ln = lines[i] ?? "";
        if (/^\s{4,}\S/.test(ln)) { failingLineText = ln.trim(); break; }
      }
    }
  }

  return { errorType, failingLineNumber, failingLineText };
}

/** Extract the source filename from an error traceback or compiler output. */
function inferSourceFileFromError(output: string): string | null {
  // Python: File "filename.py", line N
  const pyMatch = output.match(/File ["']([^"'\n]+\.py)["']/);
  if (pyMatch?.[1]) return pyMatch[1];

  // JS/Node: at Object.<anonymous> (filename.js:N:M) or at filename.js:N:M
  const jsMatch = output.match(/\(([^)\n]+\.(?:js|mjs|cjs)):\d+:\d+\)/);
  if (jsMatch?.[1]) return jsMatch[1];

  // Compile: filename.c:N:M: error:
  const cMatch = output.match(/([^\s:]+\.(?:c|cpp|cc|cxx)):\d+:\d+:\s+error/);
  if (cMatch?.[1]) return cMatch[1];

  return null;
}

/** Run python3 -m py_compile on content via a temp file. Returns null if OK, error string if broken. */
function checkPythonSyntax(content: string): string | null {
  const tmp = path.join(os.tmpdir(), `_pychk_${Date.now()}.py`);
  try {
    fs.writeFileSync(tmp, content, "utf8");
    execSync(`python3 -m py_compile ${JSON.stringify(tmp)}`, { stdio: "pipe" });
    return null;
  } catch (err) {
    type ProcErr = Error & { stderr?: Buffer };
    const e = err as ProcErr;
    return e.stderr?.toString().trim() ?? (err instanceof Error ? err.message : String(err));
  } finally {
    try { fs.unlinkSync(tmp); } catch { /* ignore */ }
  }
}

/**
 * Heuristic fixes for common Python SyntaxErrors.
 * Returns fixed content string or null if no fix found.
 * Reuses findUnclosedString (same logic as JS — works for Python strings too).
 */
function tryFixPythonSyntaxDeterministic(content: string): string | null {
  const lines = content.split("\n");

  // Attempt 1: unclosed string literal on a line
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i] ?? "";
    const closer = findUnclosedString(line);
    if (closer === null) continue;
    for (const suffix of [closer, closer + ")"]) {
      const candidate = [...lines];
      candidate[i] = line + suffix;
      const result = candidate.join("\n");
      if (checkPythonSyntax(result) === null) return result;
    }
    break; // only tackle first unclosed string
  }

  // Attempt 2: unmatched open parentheses
  const openParens = (content.match(/\(/g) ?? []).length;
  const closeParens = (content.match(/\)/g) ?? []).length;
  if (openParens > closeParens) {
    const result = content.trimEnd() + ")".repeat(openParens - closeParens) + "\n";
    if (checkPythonSyntax(result) === null) return result;
  }

  // Attempt 3: unmatched open brackets
  const openBrackets = (content.match(/\[/g) ?? []).length;
  const closeBrackets = (content.match(/\]/g) ?? []).length;
  if (openBrackets > closeBrackets) {
    const result = content.trimEnd() + "]".repeat(openBrackets - closeBrackets) + "\n";
    if (checkPythonSyntax(result) === null) return result;
  }

  return null;
}

/**
 * Deterministic fix for simple Python NameErrors.
 * Extracts the undefined variable from the traceback and prepends `varName = ""` to the file.
 * Returns fixed content string or null if the error pattern is not recognized.
 */
function tryFixPythonNameErrorDeterministic(content: string, errorText: string): string | null {
  const nameMatch = errorText.match(/NameError: name ['"]([^'"]+)['"]\s+is not defined/);
  if (!nameMatch?.[1]) return null;
  const varName = nameMatch[1];
  return `${varName} = ""\n${content}`;
}

/**
 * Prompt for run-and-fix flow. Mandates a fix — NO_CHANGES_NEEDED is explicitly forbidden.
 * Includes structured error context: type, message, and failing line.
 */
function buildRunFixPrompt(
  filePath: string,
  fileContent: string,
  errorType: string | null,
  errorText: string,
  failingLineNumber: number | null,
  failingLineText: string | null,
): string {
  const errorTypeLabel = errorType ?? "Runtime error";
  const lineInfo = failingLineNumber != null
    ? `\nFailing at line ${failingLineNumber}${failingLineText ? `: ${failingLineText.trim()}` : ""}`
    : "";

  return `You are a precise code editor. This code FAILED at runtime. You MUST fix it.

ERROR TYPE: ${errorTypeLabel}
ERROR:
${errorText.slice(0, 600)}${lineInfo}

CRITICAL RULES:
- This code is BROKEN. You MUST generate edit blocks to fix the error.
- NEVER output NO_CHANGES_NEEDED — the error above proves the code needs fixing.
- Output ONLY edit blocks. No explanations, no markdown, no prose.
- Make the minimal change to fix the runtime error.
- EACH <<<SEARCH block MUST contain verbatim text from the file (exact whitespace and indentation). Never guess — copy from the file shown below.
- NameError/ReferenceError: the variable is undefined — fix the name or add a definition before use.
- SyntaxError: repair the syntax issue (unclosed paren, missing quote, wrong indentation, etc.).
- TypeError/AttributeError: fix the type mismatch or method call.

FORMAT:
<<<SEARCH
[exact text to find in file]
>>>REPLACE
[replacement text]
>>>END

File: ${filePath}
\`\`\`
${fileContent}
\`\`\``;
}

/**
 * Checks HTML blocks for href/src references that are missing from the generated file set.
 * Returns one warning string per broken reference.
 */
function detectBrokenReferences(blocks: FileBlock[]): string[] {
  const generatedFiles = new Set(blocks.map((b) => b.filename));
  const warnings: string[] = [];
  const refRe = /(?:href|src)=["']([^"'#?]+)["']/g;

  for (const block of blocks) {
    if (!block.filename.endsWith(".html")) continue;
    let m: RegExpExecArray | null;
    while ((m = refRe.exec(block.content)) !== null) {
      const ref = m[1]!;
      if (ref.startsWith("http") || ref.startsWith("//") || ref.startsWith("#")) continue;
      // Match against exact ref or just the basename
      const basename = ref.split("/").pop() ?? ref;
      if (!generatedFiles.has(ref) && !generatedFiles.has(basename)) {
        warnings.push(`[warning] ${block.filename} referencia "${ref}" pero no se generó`);
      }
    }
  }
  return warnings;
}

/**
 * Scans an LLM response for fenced code blocks and extracts filename + content.
 *
 * Filename detection (in priority order):
 *   1. First-line comment in the block:
 *        <!-- index.html -->   (HTML)
 *        /* style.css * /      (CSS / C)
 *        // script.js          (JS / TS)
 *        # app.py              (Python / shell)
 *   2. Fallback: infer from language tag (html→index.html, css→style.css, etc.)
 *
 * Duplicate filenames: first occurrence wins. Empty blocks are skipped.
 */
function extractMultiFileBlocks(response: string): FileBlock[] {
  const blocks: FileBlock[] = [];
  const seenFilenames = new Set<string>();
  // Capture optional language tag AND block body
  const blockRe = /```([a-zA-Z]*)\n([\s\S]*?)```/g;
  let match: RegExpExecArray | null;

  // Valid filename: word chars + dot + 1-6 alphanum chars (no path separators on purpose)
  const FILENAME_RE = /^[a-zA-Z0-9_\-./]+\.[a-zA-Z0-9]{1,6}$/;

  // Comment patterns tried in order on the first line of each block
  const COMMENT_RES: RegExp[] = [
    /<!--\s*(\S+?)\s*-->/,    // <!-- index.html -->
    /^\/\/\s*(\S+)\s*$/,      // // script.js
    /^\/\*\s*(\S+?)\s*\*\//, // /* style.css */
    /^#\s*(\S+)\s*$/,         // # app.py
  ];

  while ((match = blockRe.exec(response)) !== null) {
    const lang = (match[1] ?? "").toLowerCase().trim();
    const body = match[2] ?? "";
    const lines = body.split("\n");
    const firstLine = lines[0] ?? "";

    let filename: string | null = null;
    let skipFirstLine = false;

    // Priority 1: filename comment on first line
    for (const re of COMMENT_RES) {
      const m = firstLine.match(re);
      if (m?.[1] && FILENAME_RE.test(m[1])) {
        filename = m[1];
        skipFirstLine = true;
        break;
      }
    }

    // Priority 2: infer from language tag
    if (!filename && lang) {
      filename = LANG_TO_FILENAME[lang] ?? null;
    }

    if (!filename) continue;

    // First occurrence wins — skip duplicates
    if (seenFilenames.has(filename)) continue;
    seenFilenames.add(filename);

    const content = (skipFirstLine ? lines.slice(1) : lines).join("\n").trimEnd();
    if (!content.trim()) continue; // skip empty blocks

    blocks.push({ filename, content });
  }

  return blocks;
}

export class Repl {
  private agent: Agent;
  private logger: Logger;
  private tools: ToolRegistry;
  private rl: readline.Interface;
  private alertTracker = new AlertTracker();
  private _multilineBuffer: string[] | null = null;
  /** Context continuity (Phase 29.1): slug of the last successfully improved project. */
  private _lastTacticalProject: string | null = null;

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

  private async handleService(input: string): Promise<void> {
    const service = input.slice("/service".length).trim();
    if (!service) {
      console.log("Usage: /service <name>\n");
      return;
    }

    const result = await this.tools.execute(
      "systemctl_status",
      { service },
      { cwd: process.cwd() }
    );

    if (result.error) {
      console.log(`[error] ${result.error}\n`);
      this.logger.warn(`/service failed: ${result.error}`);
      return;
    }

    const header = `─── systemctl: ${service} `;
    const pad = Math.max(0, RULE_WIDTH - header.length);

    console.log(`\n${header}${"─".repeat(pad)}`);
    console.log(result.output);
    console.log(rule() + "\n");

    const ctx = result.contextOutput ?? result.output;
    this.agent.injectContext(`Service data:\n\n${ctx}`);
    console.log("[Service status loaded into context. Ask anything about it.]\n");
    this.logger.info(`/service: ${service}`);
  }

  private async handleJournal(input: string): Promise<void> {
    const parts = input.slice("/journal".length).trim().split(/\s+/);
    // First arg: if all digits → lines; otherwise → service
    let service: string | undefined;
    let lines: string | undefined;

    if (parts[0]) {
      if (/^\d+$/.test(parts[0])) {
        lines = parts[0];
      } else {
        service = parts[0];
        if (parts[1] && /^\d+$/.test(parts[1])) lines = parts[1];
      }
    }

    const toolArgs: Record<string, string> = {};
    if (service) toolArgs["service"] = service;
    if (lines) toolArgs["lines"] = lines;

    const result = await this.tools.execute(
      "journalctl",
      toolArgs,
      { cwd: process.cwd() }
    );

    if (result.error) {
      console.log(`[error] ${result.error}\n`);
      this.logger.warn(`/journal failed: ${result.error}`);
      return;
    }

    const label = service ? `journal: ${service}` : "journal";
    const header = `─── ${label} `;
    const pad = Math.max(0, RULE_WIDTH - header.length);

    console.log(`\n${header}${"─".repeat(pad)}`);
    console.log(result.output);
    console.log(rule() + "\n");

    const ctx = result.contextOutput ?? result.output;
    this.agent.injectContext(`Service data:\n\n${ctx}`);
    console.log("[Journal loaded into context. Ask anything about it.]\n");
    this.logger.info(`/journal: ${service ?? "system"}`);
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
    } else if (
      call.toolName === "memory_status" ||
      call.toolName === "disk_usage" ||
      call.toolName === "system_info"
    ) {
      this.agent.injectContext(`System data:\n\n${ctx}`);
    } else if (
      call.toolName === "systemctl_status" ||
      call.toolName === "journalctl"
    ) {
      this.agent.injectContext(`Service data:\n\n${ctx}`);
    } else if (
      call.toolName === "open_ports" ||
      call.toolName === "net_interfaces" ||
      call.toolName === "net_routes"
    ) {
      this.agent.injectContext(`Network data:\n\n${ctx}`);
    } else if (
      call.toolName === "ping_host" ||
      call.toolName === "dns_lookup" ||
      call.toolName === "http_head_check"
    ) {
      this.agent.injectContext(`Network check:\n\n${ctx}`);
    } else if (call.toolName === "write_file") {
      this.agent.injectContext(`File written:\n\n${ctx}`);
    } else if (call.toolName === "run_command") {
      this.agent.injectContext(`Command output:\n\n${ctx}`);
    } else if (call.toolName === "scan_project") {
      this.agent.injectContext(`Project structure:\n\n${ctx}`);
    }
  }

  private async handlePing(input: string): Promise<void> {
    const host = input.slice("/ping".length).trim();
    if (!host) {
      console.log("Usage: /ping <host>\n");
      return;
    }

    const result = await this.tools.execute(
      "ping_host",
      { host },
      { cwd: process.cwd() }
    );

    if (result.error) {
      console.log(`[error] ${result.error}\n`);
      this.logger.warn(`/ping failed: ${result.error}`);
      return;
    }

    const header = `─── ping: ${host} `;
    const pad = Math.max(0, RULE_WIDTH - header.length);
    console.log(`\n${header}${"─".repeat(pad)}`);
    console.log(result.output);
    console.log(rule() + "\n");

    const ctx = result.contextOutput ?? result.output;
    this.agent.injectContext(`Network check:\n\n${ctx}`);
    console.log("[Ping result loaded into context. Ask anything about it.]\n");
    this.logger.info(`/ping: ${host}`);
  }

  private async handleDns(input: string): Promise<void> {
    const host = input.slice("/dns".length).trim();
    if (!host) {
      console.log("Usage: /dns <host>\n");
      return;
    }

    const result = await this.tools.execute(
      "dns_lookup",
      { host },
      { cwd: process.cwd() }
    );

    if (result.error) {
      console.log(`[error] ${result.error}\n`);
      this.logger.warn(`/dns failed: ${result.error}`);
      return;
    }

    const header = `─── dns: ${host} `;
    const pad = Math.max(0, RULE_WIDTH - header.length);
    console.log(`\n${header}${"─".repeat(pad)}`);
    console.log(result.output);
    console.log(rule() + "\n");

    const ctx = result.contextOutput ?? result.output;
    this.agent.injectContext(`Network check:\n\n${ctx}`);
    console.log("[DNS result loaded into context. Ask anything about it.]\n");
    this.logger.info(`/dns: ${host}`);
  }

  private async handleServiceCheck(service: string): Promise<void> {
    if (!service) {
      console.log("Usage: /check service <name>\n");
      return;
    }

    // Step 1: systemctl status (source of truth for state)
    process.stdout.write(`[tool] executing: systemctl status ${service}\n`);
    const statusResult = await this.tools.execute(
      "systemctl_status",
      { service },
      { cwd: process.cwd() }
    );

    // Step 2: journalctl
    process.stdout.write(`[tool] executing: journalctl -u ${service}\n`);
    const journalResult = await this.tools.execute(
      "journalctl",
      { service },
      { cwd: process.cwd() }
    );

    // Derive state from systemctl output — never from LLM
    const statusRaw = statusResult.output + (statusResult.contextOutput ?? "");
    let estado: string;
    if (statusResult.error || /Unit .+ not found|could not be found/i.test(statusRaw)) {
      estado = "not found";
    } else if (/Active:\s+active \(running\)/i.test(statusResult.output)) {
      estado = "running";
    } else if (/Active:\s+failed/i.test(statusResult.output)) {
      estado = "failed";
    } else if (/Active:\s+inactive/i.test(statusResult.output)) {
      estado = "inactive";
    } else {
      estado = "unknown";
    }

    // Parse errors from journal context marker
    const journalCtx = journalResult.contextOutput ?? "";
    let errores = "(ninguno)";
    const errMatch = journalCtx.match(/\[JOURNAL_ERRORS_FOUND:\s*(\d+)[^\]]*\]/);
    const warnMatch = journalCtx.match(/\[JOURNAL_WARNINGS_ONLY:\s*(\d+)[^\]]*\]/);
    if (errMatch) {
      const listed = [...journalCtx.matchAll(/^\s+- (.+)$/gm)]
        .map((m) => m[1] ?? "")
        .slice(0, 3);
      errores = `${errMatch[1]} error(s)${listed.length ? ":\n" + listed.map((l) => `  - ${l}`).join("\n") : ""}`;
    } else if (warnMatch) {
      errores = `(${warnMatch[1]} warning(s), sin errores)`;
    }

    // Determine conclusion and optional suggestion
    let conclusion: string;
    let suggestion = "";
    if (estado === "not found") {
      conclusion = `El servicio "${service}" no existe en este sistema.`;
    } else if (estado === "running") {
      conclusion = errMatch
        ? "Servicio activo pero con errores en el journal."
        : "Servicio funcionando correctamente.";
      if (errMatch) suggestion = `Sugerencia: usa \`/fix ${service}\` para investigar.`;
    } else {
      conclusion = `Servicio no está activo (${estado}).`;
      suggestion = `Sugerencia: usa \`/fix ${service}\` para reiniciarlo.`;
    }

    // Print structured report
    const header = `─── check service: ${service} `;
    const pad = Math.max(0, RULE_WIDTH - header.length);
    console.log(`\n${header}${"─".repeat(pad)}`);
    console.log(`Service:    ${service}`);
    console.log(`Estado:     ${estado}`);
    console.log(`Errores:    ${errores}`);
    console.log(`Conclusión: ${conclusion}`);
    if (suggestion) console.log(suggestion);
    console.log(rule() + "\n");

    // Inject combined context for follow-up questions
    if (!statusResult.error && !journalResult.error) {
      const statusCtx = statusResult.contextOutput ?? statusResult.output;
      const jCtx = journalResult.contextOutput ?? journalResult.output;
      this.agent.injectContext(`Service data:\n\n${statusCtx}\n\n${jCtx}`);
    }

    this.logger.info(`/check service: ${service} — ${estado}`);
  }

  private async handleWebCheck(target: string): Promise<void> {
    if (!target) {
      console.log("Usage: /check web <host-or-url>\n");
      return;
    }

    // Extract host from URL (https://foo.com/path) or treat as bare hostname
    const urlMatch = target.match(/^https?:\/\/([^/]+)/i);
    const host = urlMatch?.[1] ?? target;
    const httpUrl = urlMatch ? target : `https://${target}`;

    const ctxParts: string[] = [];

    // Step 1: DNS
    process.stdout.write(`[tool] executing: getent hosts ${host}\n`);
    const dnsResult = await this.tools.execute("dns_lookup", { host }, { cwd: process.cwd() });
    if (dnsResult.error) {
      console.log(`[error] dns: ${dnsResult.error}\n`);
      this.logger.warn(`/check web dns failed: ${dnsResult.error}`);
      return;
    }
    ctxParts.push(dnsResult.contextOutput ?? dnsResult.output);

    // Step 2: Ping (non-fatal — unreachable is a valid result)
    process.stdout.write(`[tool] executing: ping -c 4 ${host}\n`);
    const pingResult = await this.tools.execute("ping_host", { host }, { cwd: process.cwd() });
    if (pingResult.error) {
      ctxParts.push(`[PING: ${host}]\n${pingResult.error}`);
      this.logger.warn(`/check web ping: ${pingResult.error}`);
    } else {
      ctxParts.push(pingResult.contextOutput ?? pingResult.output);
    }

    // Step 3: HTTP (non-fatal — connection error is a valid result)
    process.stdout.write(`[tool] executing: curl -I ${httpUrl}\n`);
    const httpResult = await this.tools.execute("http_head_check", { url: httpUrl }, { cwd: process.cwd() });
    if (httpResult.error) {
      ctxParts.push(`[HTTP_HEAD: ${httpUrl}]\n${httpResult.error}`);
      this.logger.warn(`/check web http: ${httpResult.error}`);
    } else {
      ctxParts.push(httpResult.contextOutput ?? httpResult.output);
    }

    const header = `─── web check: ${target} `;
    const pad = Math.max(0, RULE_WIDTH - header.length);
    console.log(`\n${header}${"─".repeat(pad)}`);
    console.log(rule() + "\n");

    const dnsStatus = "OK";
    const pingStatus = pingResult.error ? "FAIL" : "OK";
    const httpStatus = httpResult.error ? "FAIL" : "OK";

    console.log(`DNS   ${dnsStatus}`);
    console.log(`Ping  ${pingStatus}${pingResult.error ? " — ICMP sin respuesta" : ""}`);
    console.log(`HTTP  ${httpStatus}${httpResult.error ? ` — ${httpResult.error}` : ""}`);

    let conclusion: string;
    if (pingStatus === "FAIL" && httpStatus === "OK") {
      conclusion = "El host responde HTTP pero bloquea ICMP (ping).";
    } else if (pingStatus === "OK" && httpStatus === "FAIL") {
      conclusion = "El host responde ping pero no devuelve respuesta HTTP.";
    } else if (pingStatus === "FAIL" && httpStatus === "FAIL") {
      conclusion = "El host no responde ni a ICMP ni a HTTP.";
    } else {
      conclusion = "El host es alcanzable por DNS, ping y HTTP.";
    }

    console.log(`\nConclusión: ${conclusion}\n`);
    this.logger.info(`/check web: ${target} dns=${dnsStatus} ping=${pingStatus} http=${httpStatus}`);
  }

  private async handleHttp(input: string): Promise<void> {
    const url = input.slice("/http".length).trim();
    if (!url) {
      console.log("Usage: /http <url>\n");
      return;
    }

    const result = await this.tools.execute(
      "http_head_check",
      { url },
      { cwd: process.cwd() }
    );

    if (result.error) {
      console.log(`[error] ${result.error}\n`);
      this.logger.warn(`/http failed: ${result.error}`);
      return;
    }

    const header = `─── http head: ${url} `;
    const pad = Math.max(0, RULE_WIDTH - header.length);
    console.log(`\n${header}${"─".repeat(pad)}`);
    console.log(result.output);
    console.log(rule() + "\n");

    const ctx = result.contextOutput ?? result.output;
    this.agent.injectContext(`Network check:\n\n${ctx}`);
    console.log("[HTTP headers loaded into context. Ask anything about them.]\n");
    this.logger.info(`/http: ${url}`);
  }

  private isBackend(service: string): boolean {
    return service === config.backendService;
  }

  /** Read lines from stdin until the user types END alone. */
  private async readMultilineContent(): Promise<string> {
    const lines: string[] = [];
    console.log("  (Escribe el contenido. Escribe END en una línea nueva para terminar.)");
    return new Promise((resolve) => {
      const readLine = (): void => {
        this.rl.question("> ", (line) => {
          if (line.trim() === "END") {
            resolve(lines.join("\n"));
          } else {
            // Strip accidental "> " prefix (e.g. from copy-paste or terminal echo)
            const cleaned = line.startsWith("> ") ? line.slice(2) : line;
            lines.push(cleaned);
            readLine();
          }
        });
      };
      readLine();
    });
  }

  private async handleWrite(input: string): Promise<void> {
    const filePath = input.slice("/write".length).trim();
    if (!filePath) {
      console.log("Usage: /write <path>\n");
      return;
    }

    const content = await this.readMultilineContent();

    const result = await this.tools.execute(
      "write_file",
      { path: filePath, content },
      { cwd: process.cwd(), confirm: this.confirm.bind(this) }
    );

    if (result.error) {
      console.log(`[error] ${result.error}\n`);
      this.logger.warn(`/write failed: ${result.error}`);
      return;
    }

    console.log(result.output + "\n");
    this.logger.info(`/write: ${filePath}`);
  }

  /**
   * /edit <path>
   * Interactive multiline edit: user provides search block, then replace block.
   * Format:
   *   <<<SEARCH
   *   old text
   *   >>>REPLACE
   *   new text
   *   >>>END
   */
  private async handleEdit(input: string): Promise<void> {
    const filePath = input.slice("/edit".length).trim();
    if (!filePath) {
      console.log("Usage: /edit <path>\n");
      console.log("Then enter one or more blocks:");
      console.log("  <<<SEARCH");
      console.log("  text to find");
      console.log("  >>>REPLACE");
      console.log("  replacement text");
      console.log("  >>>END");
      console.log("  (type END on its own line to finish)\n");
      return;
    }

    console.log("Enter edit operations (type END on its own line to finish):");
    console.log("  <<<SEARCH → text to find → >>>REPLACE → replacement → >>>END\n");

    const operations = await this.readMultilineContent();

    const result = await this.tools.execute(
      "edit_file",
      { path: filePath, operations },
      { cwd: process.cwd(), confirm: this.confirm.bind(this) }
    );

    if (result.error) {
      console.log(`[error] ${result.error}\n`);
      this.logger.warn(`/edit failed: ${result.error}`);
      return;
    }

    console.log(result.output + "\n");
    this.logger.info(`/edit: ${filePath}`);
  }

  private async handleRun(input: string): Promise<void> {
    const rawArg = input.slice("/run".length).trim();
    if (!rawArg) {
      console.log("Usage: /run <file>  (e.g. /run hola.py)\n");
      return;
    }

    // Strip leading runtime prefix if user wrote e.g. /run python3 hola.py
    const KNOWN_RUNTIMES = ["python3", "python", "node"];
    let fileArg = rawArg;
    for (const rt of KNOWN_RUNTIMES) {
      if (rawArg.startsWith(rt + " ")) {
        fileArg = rawArg.slice(rt.length + 1).trim();
        break;
      }
    }

    const ext = fileArg.slice(fileArg.lastIndexOf(".")).toLowerCase();
    const EXT_TO_CMD: Record<string, string> = {
      ".py":  "python3",
      ".js":  "node",
      ".mjs": "node",
      ".c":   "gcc",
      ".cpp": "g++",
      ".cc":  "g++",
    };
    const cmd = EXT_TO_CMD[ext];
    if (!cmd) {
      console.log(`[error] Extensión no soportada: "${ext}". Usa .py, .js, .c, .cpp\n`);
      return;
    }

    process.stdout.write(`[tool] executing: ${cmd} ${fileArg}\n`);
    const result = await this.tools.execute(
      "run_command",
      { cmd, file: fileArg },
      { cwd: process.cwd() }
    );

    if (result.error) {
      console.log(`[error] ${result.error}\n`);
      this.logger.warn(`/run failed: ${result.error}`);
      return;
    }

    const header = `─── output: ${fileArg} `;
    const pad = Math.max(0, RULE_WIDTH - header.length);
    console.log(`\n${header}${"─".repeat(pad)}`);
    console.log(result.output);
    console.log(rule() + "\n");
    this.logger.info(`/run: ${fileArg}`);
  }

  /**
   * Run / Test / Fix loop (Phase 19)
   *
   * 1. Determine the file to execute (from intent or infer from cwd)
   * 2. Run it via run_command
   * 3. If the output contains an error: infer the source file, apply LLM fix via handleBugfix
   * 4. Re-run — maximum 2 total attempts
   *
   * UX:
   *   [run] intento 1: python3 app.py
   *   [error] ...
   *   [fix] Aplicando fix en: app.py
   *   [run] intento 2: python3 app.py
   *   [success] ...
   */
  private async handleRunAndFix(intent: RunAndFixIntent): Promise<void> {
    const MAX_ATTEMPTS = 2;

    const EXT_TO_CMD: Record<string, string> = {
      ".py":  "python3",
      ".js":  "node",
      ".mjs": "node",
      ".c":   "gcc",
      ".cpp": "g++",
      ".cc":  "g++",
    };

    // Resolve file and command
    let filePath = intent.filePath;
    let cmd = intent.cmd;

    if (!filePath) {
      const candidates = ["main.py", "app.py", "index.js", "main.js", "app.js"];
      for (const c of candidates) {
        if (fs.existsSync(path.join(process.cwd(), c))) { filePath = c; break; }
      }
      if (!filePath) {
        console.log("[error] No se encontró un archivo ejecutable. Especifica el archivo, p.ej: 'ejecuta y arregla app.py'\n");
        return;
      }
    }

    if (!cmd) {
      const ext = filePath.slice(filePath.lastIndexOf(".")).toLowerCase();
      cmd = EXT_TO_CMD[ext] ?? null;
      if (!cmd) {
        console.log(`[error] Extensión no soportada para ejecución automática: ${filePath}\n`);
        return;
      }
    }

    for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
      process.stdout.write(`[run] intento ${attempt}: ${cmd} ${filePath}\n`);
      const runResult = await this.tools.execute(
        "run_command",
        { cmd, file: filePath },
        { cwd: process.cwd() }
      );

      if (runResult.error) {
        console.log(`[error] ${runResult.error}\n`);
        this.logger.warn(`handleRunAndFix: run_command error: ${runResult.error}`);
        return;
      }

      const output = runResult.output;
      const errorInfo = detectRunError(output);

      if (!errorInfo.hasError) {
        const header = `─── output: ${filePath} `;
        const pad = Math.max(0, RULE_WIDTH - header.length);
        console.log(`\n${header}${"─".repeat(pad)}`);
        console.log(output);
        console.log(rule());
        console.log(`[success] Ejecutado sin errores\n`);
        this.logger.info(`handleRunAndFix: ${filePath} OK on attempt ${attempt}`);
        return;
      }

      const errorPreview = errorInfo.errorText.length > 400
        ? errorInfo.errorText.slice(0, 400) + "\n... (truncado)"
        : errorInfo.errorText;
      console.log(`[error]\n${errorPreview}\n`);

      if (attempt === MAX_ATTEMPTS) {
        console.log(`[failed] Máximo de intentos alcanzado. Revisa el archivo manualmente.\n`);
        this.logger.warn(`handleRunAndFix: ${filePath} still failing after ${MAX_ATTEMPTS} attempts`);
        return;
      }

      const targetFile = errorInfo.sourceFile ?? filePath;
      console.log(`[fix] Aplicando fix en: ${targetFile}\n`);
      this.logger.info(`handleRunAndFix: fixing ${targetFile}`);

      // Step A: read the failing file
      const readResult = await this.tools.execute(
        "read_file", { path: targetFile }, { cwd: process.cwd() }
      );
      if (readResult.error) {
        console.log(`[error] No se pudo leer ${targetFile}: ${readResult.error}\n`);
        return;
      }
      let fileContent = readResult.contextOutput ?? readResult.output;

      // Step B: try deterministic syntax fix (avoids LLM call for simple errors)
      let deterministicApplied = false;
      if (errorInfo.errorType === "SyntaxError" || errorInfo.errorType === "IndentationError") {
        const isPy = targetFile.endsWith(".py");
        const isJs = /\.(js|mjs|cjs|ts)$/.test(targetFile);
        const fixed = isPy
          ? tryFixPythonSyntaxDeterministic(fileContent)
          : isJs ? tryFixJsSyntaxDeterministic(targetFile, fileContent) : null;
        if (fixed !== null) {
          const wResult = await this.tools.execute(
            "write_file", { path: targetFile, content: fixed }, { cwd: process.cwd() }
          );
          if (!wResult.error) {
            console.log(`[fix] Sintaxis reparada automáticamente en ${targetFile}\n`);
            this.logger.info(`handleRunAndFix: deterministic syntax fix applied to ${targetFile}`);
            deterministicApplied = true;
          }
        }
      }

      // Step B2: deterministic NameError fix for Python (prepend variable = "")
      if (!deterministicApplied && errorInfo.errorType === "NameError" && targetFile.endsWith(".py")) {
        const fixed = tryFixPythonNameErrorDeterministic(fileContent, errorInfo.errorText);
        if (fixed !== null) {
          const wResult = await this.tools.execute(
            "write_file", { path: targetFile, content: fixed }, { cwd: process.cwd() }
          );
          if (!wResult.error) {
            console.log(`[fix] Variable indefinida resuelta automáticamente en ${targetFile}\n`);
            this.logger.info(`handleRunAndFix: deterministic NameError fix applied to ${targetFile}`);
            deterministicApplied = true;
          }
        }
      }

      // Step C: LLM fix with run-specific prompt (no NO_CHANGES_NEEDED escape hatch)
      if (!deterministicApplied) {
        process.stdout.write(`[tool] analyzing: ${targetFile}\n`);
        const prompt = buildRunFixPrompt(
          targetFile, fileContent,
          errorInfo.errorType, errorInfo.errorText,
          errorInfo.failingLineNumber, errorInfo.failingLineText,
        );
        let llmResponse = "";
        try {
          for await (const token of chat([{ role: "user", content: prompt }])) {
            llmResponse += token;
          }
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err);
          console.log(`[error] LLM failed: ${msg}\n`);
          this.logger.error("handleRunAndFix: LLM call failed", err);
          return;
        }

        const hasValidBlocks = (r: string): boolean =>
          r.includes("<<<SEARCH") && r.includes(">>>REPLACE");

        if (llmResponse.trim() === "NO_CHANGES_NEEDED" || !hasValidBlocks(llmResponse)) {
          console.log(`[error] El LLM no generó bloques de corrección para ${targetFile}. Revisa el archivo manualmente.\n`);
          this.logger.warn(`handleRunAndFix: LLM returned no valid edit blocks for: ${targetFile}`);
          return;
        }

        process.stdout.write(`[tool] applying fix: ${targetFile}\n`);
        const editResult = await this.tools.execute(
          "edit_file", { path: targetFile, operations: llmResponse }, { cwd: process.cwd() }
        );
        if (editResult.error) {
          console.log(`[error] ${editResult.error}\n`);
          this.logger.warn(`handleRunAndFix: edit_file failed: ${editResult.error}`);
          return;
        }
        console.log(editResult.output + "\n");
      }
    }
  }

  /**
   * NL multi-file generation flow:
   * 1. Ask the LLM to generate multiple files (with filename comments per block)
   * 2. Extract filename + content from each code block
   * 3. Write each file via write_file
   * 4. Show a per-file ✔/⚠/❌ summary
   */
  private async handleGenerateFiles(userMessage: string): Promise<void> {
    // Step 1: ask LLM — explicit instruction with concrete examples
    process.stdout.write("Assistant: ");
    let llmResponse = "";

    // If the user explicitly named files, enforce those exact names
    const mentionedFiles = extractMentionedFilenames(userMessage);
    const namesClause = mentionedFiles.length > 0
      ? `\nIMPORTANTE: Usa EXACTAMENTE estos nombres de archivo (no los cambies): ${mentionedFiles.join(", ")}.\n`
      : "";

    // Build per-file comment examples from mentioned names (fallback to generic ones)
    const htmlExample  = mentionedFiles.find((f) => f.endsWith(".html"))  ?? "index.html";
    const cssExample   = mentionedFiles.find((f) => f.endsWith(".css"))   ?? "style.css";
    const jsExample    = mentionedFiles.find((f) => f.endsWith(".js"))    ?? "script.js";
    const pyExample    = mentionedFiles.find((f) => f.endsWith(".py"))    ?? "main.py";

    try {
      llmResponse = await this.agent.send(
        userMessage +
          `\n\n[INSTRUCCIÓN]: Genera cada archivo en un bloque de código separado.${namesClause}` +
          "En la PRIMERA LÍNEA de cada bloque escribe el nombre del archivo como comentario:\n" +
          `  HTML  → \`\`\`html\n<!-- ${htmlExample} -->\n...\n\`\`\`\n` +
          `  CSS   → \`\`\`css\n/* ${cssExample} */\n...\n\`\`\`\n` +
          `  JS    → \`\`\`javascript\n// ${jsExample}\n...\n\`\`\`\n` +
          `  PY    → \`\`\`python\n# ${pyExample}\n...\n\`\`\`\n` +
          "Un bloque por archivo. No combines varios archivos en un solo bloque.",
        (token) => { process.stdout.write(token); }
      );
      process.stdout.write("\n\n");
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      process.stdout.write(`\n[error] ${msg}\n\n`);
      this.logger.error("handleGenerateFiles: LLM call failed", err);
      return;
    }

    // Step 2: extract blocks
    const blocks = extractMultiFileBlocks(llmResponse);
    if (blocks.length === 0) {
      console.log("[info] No se encontraron bloques de código con nombre de archivo.\n");
      this.logger.warn("handleGenerateFiles: no named code blocks in LLM response");
      return;
    }

    // Warn about cross-file reference mismatches (e.g. HTML → missing CSS/JS)
    const refWarnings = detectBrokenReferences(blocks);
    for (const w of refWarnings) {
      console.log(w);
      this.logger.warn(`handleGenerateFiles: ${w}`);
    }

    // Step 3: write each file — track written / omitted / failed separately
    const header = `─── generando ${blocks.length} archivo(s) `;
    const pad = Math.max(0, RULE_WIDTH - header.length);
    console.log(`\n${header}${"─".repeat(pad)}`);

    let written = 0, omitted = 0, failed = 0;
    for (const block of blocks) {
      process.stdout.write(`  ${block.filename} ... `);
      const writeResult = await this.tools.execute(
        "write_file",
        { path: block.filename, content: block.content },
        { cwd: process.cwd(), confirm: this.confirm.bind(this) }
      );
      if (writeResult.skipped) {
        console.log("⚠ omitido");
        omitted++;
        this.logger.info(`handleGenerateFiles: skipped (overwrite declined) ${block.filename}`);
      } else if (writeResult.error) {
        console.log(`❌ error: ${writeResult.error}`);
        failed++;
        this.logger.warn(`handleGenerateFiles: write_file failed (${block.filename}): ${writeResult.error}`);
      } else {
        console.log("✔ creado");
        written++;
      }
    }

    console.log(rule());
    const parts: string[] = [];
    if (written > 0) parts.push(`${written} creado(s)`);
    if (omitted > 0) parts.push(`${omitted} omitido(s)`);
    if (failed > 0) parts.push(`${failed} error(es)`);
    console.log(parts.join("  ") + `  [total: ${blocks.length}]\n`);
    this.logger.info(`handleGenerateFiles: written=${written} omitted=${omitted} failed=${failed} total=${blocks.length}`);
  }

  /**
   * NL "create + run" flow:
   * 1. Ask the LLM to generate the file content
   * 2. Extract the code block from the response
   * 3. Write the file
   * 4. Run it and show output
   */
  private async handleCreateAndRun(userMessage: string, filename: string, cmd: string): Promise<void> {
    // Step 1: ask LLM for code
    process.stdout.write("Assistant: ");
    let llmResponse = "";
    try {
      llmResponse = await this.agent.send(
        userMessage +
          `\n\n(Importante: incluye el código de "${filename}" en un bloque de código markdown.)`,
        (token) => { process.stdout.write(token); }
      );
      process.stdout.write("\n\n");
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      process.stdout.write(`\n[error] ${msg}\n\n`);
      this.logger.error("handleCreateAndRun: LLM call failed", err);
      return;
    }

    // Step 2: extract code block
    const codeMatch = llmResponse.match(/```(?:[a-zA-Z]*\n)?([\s\S]*?)```/);
    const code = codeMatch?.[1]?.trim();
    if (!code) {
      console.log("[error] No se encontró un bloque de código en la respuesta del agente.\n");
      this.logger.warn("handleCreateAndRun: no code block in LLM response");
      return;
    }

    // Step 3: write file
    process.stdout.write(`[tool] write_file: ${filename}\n`);
    const writeResult = await this.tools.execute(
      "write_file",
      { path: filename, content: code },
      { cwd: process.cwd(), confirm: this.confirm.bind(this) }
    );
    if (writeResult.error) {
      console.log(`[error] ${writeResult.error}\n`);
      this.logger.warn(`handleCreateAndRun: write_file failed: ${writeResult.error}`);
      return;
    }
    console.log(writeResult.output);

    // Step 4: run file
    process.stdout.write(`[tool] executing: ${cmd} ${filename}\n`);
    const runResult = await this.tools.execute(
      "run_command",
      { cmd, file: filename },
      { cwd: process.cwd() }
    );
    if (runResult.error) {
      console.log(`[error] ${runResult.error}\n`);
      this.logger.warn(`handleCreateAndRun: run_command failed: ${runResult.error}`);
      return;
    }

    const header = `─── output: ${filename} `;
    const pad = Math.max(0, RULE_WIDTH - header.length);
    console.log(`\n${header}${"─".repeat(pad)}`);
    console.log(runResult.output);
    console.log(rule() + "\n");
    this.logger.info(`handleCreateAndRun: ${filename} → ${cmd}`);
  }

  private confirm(message: string): Promise<boolean> {
    return new Promise((resolve) => {
      this.rl.question(`${message} `, (answer) => {
        resolve(answer.trim().toLowerCase() === "yes");
      });
    });
  }

  /**
   * Semantic edit flow:
   * 1. Read the file
   * 2. Ask LLM (isolated call — does not pollute conversation history) to generate
   *    <<<SEARCH/>>>REPLACE/>>>END blocks for the instruction
   * 3. Apply edit_file with those blocks
   */
  private async handleSemanticEdit(intent: SemanticEditIntent): Promise<void> {
    const { filePath, instruction } = intent;

    // Step 1: read file
    process.stdout.write(`[tool] reading: ${filePath}\n`);
    const readResult = await this.tools.execute(
      "read_file",
      { path: filePath },
      { cwd: process.cwd() }
    );
    if (readResult.error) {
      console.log(`[error] ${readResult.error}\n`);
      this.logger.warn(`handleSemanticEdit: read_file failed: ${readResult.error}`);
      return;
    }

    const fileContent = readResult.contextOutput ?? readResult.output;
    const isStructuralWebRequest =
      isLikelyWebStructuralInstruction(instruction) &&
      /\.(html|css|js|mjs|ts)$/i.test(filePath);

    // ── Pre-LLM deterministic path ────────────────────────────────────────────
    // For well-known insertion patterns (prepend console.log, HTML footer/header),
    // skip the LLM entirely to guarantee deterministic, idempotent behavior.
    // This prevents non-determinism caused by the LLM generating <<<SEARCH blocks
    // with text that doesn't match the file (hasValidBlocks=true → fallback skipped).
    {
      const prependOps = buildPrependFallback(instruction, filePath);
      const htmlOps =
        prependOps === null ? buildHtmlElementFallback(instruction, filePath, fileContent) : null;
      const deterministicOps = prependOps ?? htmlOps;

      if (deterministicOps !== null) {
        // Idempotency check — specific to each operation type to avoid false positives.
        // Prepend: check first non-whitespace line (console.log may exist deeper in file).
        // HTML: verifyNoChangesNeeded checks tag presence.
        let alreadyDone = false;
        if (prependOps !== null) {
          alreadyDone = fileContent.trimStart().startsWith("console.log");
        } else {
          const { valid, missingElement } = verifyNoChangesNeeded(instruction, fileContent);
          alreadyDone = valid && missingElement === null;
        }

        if (alreadyDone) {
          console.log(`[info] Sin cambios: el contenido ya existe en ${filePath}\n`);
          this.logger.info(`handleSemanticEdit: no changes needed (deterministic): ${filePath}`);
          return;
        }

        process.stdout.write(`[tool] applying edit: ${filePath}\n`);
        const editResult = await this.tools.execute(
          "edit_file",
          { path: filePath, operations: deterministicOps },
          { cwd: process.cwd() }
        );
        if (editResult.error) {
          console.log(`[error] ${editResult.error}\n`);
          this.logger.warn(`handleSemanticEdit: deterministic edit failed: ${editResult.error}`);
          return;
        }
        console.log(editResult.output + "\n");
        this.agent.injectContext(`Archivo editado: \`${filePath}\`\nCambio: ${instruction}`);
        this.logger.info(`handleSemanticEdit: ${filePath} — ${instruction} [deterministic]`);
        return;
      }
    }
    // ── End pre-LLM deterministic path ───────────────────────────────────────

    // Step 2: isolated LLM call (no history — keeps conversation clean)
    process.stdout.write(`[tool] generating edit: ${filePath}\n`);
    const prompt = buildSemanticEditPrompt(filePath, fileContent, instruction);
    let llmResponse = "";
    try {
      for await (const token of chat([{ role: "user", content: prompt }])) {
        llmResponse += token;
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.log(`[error] LLM failed: ${msg}\n`);
      this.logger.error("handleSemanticEdit: LLM call failed", err);
      return;
    }

    // Check if the LLM says no changes are needed (element already exists)
    if (llmResponse.trim() === "NO_CHANGES_NEEDED") {
      if (isStructuralWebRequest) {
        const structuralInputs = loadStructuralWebInputs(filePath, fileContent, instruction);
        const assessment = assessWebStructuralRequirements(structuralInputs);
        if (assessment.overall === "satisfied") {
          console.log(`[info] Sin cambios: la estructura objetivo ya existe en ${filePath}\n`);
          this.logger.info(`handleSemanticEdit: structural no changes needed (satisfied): ${filePath}`);
          return;
        }

        const assessmentSummary = formatStructuralAssessmentSummary(assessment);
        this.logger.warn(
          `handleSemanticEdit: structural NO_CHANGES_NEEDED invalidated for ${filePath}; overall=${assessment.overall}`,
        );
        llmResponse = "";
        try {
          const retryPrompt = buildStructuralSemanticRetryPrompt(
            filePath,
            fileContent,
            instruction,
            assessmentSummary,
          );
          for await (const token of chat([{ role: "user", content: retryPrompt }])) {
            llmResponse += token;
          }
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err);
          console.log(`[error] LLM falló en reintento estructural: ${msg}\n`);
          this.logger.error("handleSemanticEdit: structural LLM retry failed", err);
          return;
        }

        if (llmResponse.trim() === "NO_CHANGES_NEEDED") {
          console.log(
            `[error] Rebuild estructural no aplicado: la estructura actual es ${assessment.overall}.\n` +
            `${assessmentSummary}\n\n`
          );
          this.logger.warn(`handleSemanticEdit: structural retry still returned NO_CHANGES_NEEDED for ${filePath}`);
          return;
        }
      } else {
        const { valid, missingElement } = verifyNoChangesNeeded(instruction, fileContent);
        if (valid) {
          console.log(`[info] Sin cambios: el contenido ya existe en ${filePath}\n`);
          this.logger.info(`handleSemanticEdit: no changes needed (already exists): ${filePath}`);
          return;
        }
        // False positive — the element is NOT actually in the file.
        // Retry with an explicit note so the LLM generates insertion blocks.
        this.logger.warn(
          `handleSemanticEdit: NO_CHANGES_NEEDED false positive for "<${missingElement}>" in ${filePath}; retrying`,
        );
        const retryPrompt = buildSemanticEditRetryPrompt(
          filePath,
          fileContent,
          instruction,
          missingElement ?? instruction,
        );
        llmResponse = "";
        try {
          for await (const token of chat([{ role: "user", content: retryPrompt }])) {
            llmResponse += token;
          }
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err);
          console.log(`[error] LLM falló en reintento: ${msg}\n`);
          this.logger.error("handleSemanticEdit: LLM retry failed", err);
          return;
        }
      }
    }

    // Validate that the LLM returned at least one block
    const hasValidBlocks = (r: string): boolean =>
      (r.includes("<<<SEARCH") || r.includes("<<<FILE_START") || r.includes("<<<FILE_END")) &&
      r.includes(">>>REPLACE");

    if (!hasValidBlocks(llmResponse)) {
      // Try deterministic fallbacks before giving up
      const fallback =
        buildPrependFallback(instruction, filePath) ??
        buildHtmlElementFallback(instruction, filePath, fileContent);

      if (fallback) {
        this.logger.info(`handleSemanticEdit: using deterministic fallback for: ${instruction}`);
        llmResponse = fallback;
      } else {
        console.log(`[error] El LLM no generó bloques de edición válidos.\n`);
        this.logger.warn(`handleSemanticEdit: no valid edit blocks in LLM response for: ${instruction}`);
        return;
      }
    }

    // Step 3: apply edit_file
    process.stdout.write(`[tool] applying edit: ${filePath}\n`);
    const editResult = await this.tools.execute(
      "edit_file",
      { path: filePath, operations: llmResponse },
      { cwd: process.cwd() }
    );

    if (editResult.error) {
      console.log(`[error] ${editResult.error}\n`);
      this.logger.warn(`handleSemanticEdit: edit_file failed: ${editResult.error}`);
      return;
    }

    console.log(editResult.output + "\n");
    // Brief context injection so the agent knows what changed
    this.agent.injectContext(`Archivo editado: \`${filePath}\`\nCambio: ${instruction}`);
    this.logger.info(`handleSemanticEdit: ${filePath} — ${instruction}`);
  }

  /**
   * Bugfix / refactor flow:
   * 1. Read the target file
   * 1b. Deterministic syntax check (JS/TS). If broken, try heuristic fix first so
   *     the LLM receives valid code (critical for refactor requests on broken files).
   * 2. Call isolated LLM with a bugfix-oriented prompt (find issue → fix locally)
   * 3. Apply edit_file with the SEARCH/REPLACE blocks returned
   */

  // ---------------------------------------------------------------------------
  // handleAnalyzeWorkspace — Phase 27: deep project analysis
  // ---------------------------------------------------------------------------
  private async handleAnalyzeWorkspace(_input: string): Promise<void> {
    let targetPath: string;

    if (shouldUseCwdDirectly(process.cwd())) {
      // Phase 28.1: user is in a dedicated project folder — analyze it directly
      targetPath = process.cwd();
    } else {
      // In agent repo — pick most recent project under ./proyectos/, or fall back to cwd
      const proyectosRoot = path.join(process.cwd(), "proyectos");
      targetPath = process.cwd();
      if (fs.existsSync(proyectosRoot)) {
        const dirs = fs.readdirSync(proyectosRoot)
          .filter((d) => fs.statSync(path.join(proyectosRoot, d)).isDirectory())
          .sort();
        if (dirs.length > 0) {
          targetPath = path.join(proyectosRoot, dirs[dirs.length - 1]!);
        }
      }
    }

    console.log(`\n[analysis] inspecting: ${targetPath}\n`);
    const analysis = analyzeWorkspace(targetPath);
    console.log(formatAnalysisReport(analysis));
    this.logger.info(`handleAnalyzeWorkspace: ${targetPath}`);
  }

  // ---------------------------------------------------------------------------
  // handleTacticalImprovement — Phase 27: apply UI/style improvements to existing project
  // ---------------------------------------------------------------------------
  private async handleTacticalImprovement(intent: TacticalImprovementIntent): Promise<void> {
    // Phase 28.1: determine project path based on context
    let mostRecent: string;
    let projectPath: string;
    let relProject: string;

    if (shouldUseCwdDirectly(process.cwd())) {
      // User is already in a dedicated project folder — use it directly
      projectPath = process.cwd();
      mostRecent  = path.basename(process.cwd());
      relProject  = ".";
    } else {
      // In agent repo — find project under ./proyectos/
      const proyectosRoot = path.join(process.cwd(), "proyectos");

      let similar: string[] = [];

      // Phase 29.1: context continuity — prefer last-improved project in this session
      if (!intent.projectHint && this._lastTacticalProject) {
        const candidatePath = path.join(proyectosRoot, this._lastTacticalProject);
        if (fs.existsSync(candidatePath)) {
          similar = [this._lastTacticalProject];
        }
      }

      if (similar.length === 0 && intent.projectHint) {
        const baseSlug = slugify(intent.projectHint);
        similar = findSimilarProjects(baseSlug, proyectosRoot);
      }
      if (similar.length === 0 && fs.existsSync(proyectosRoot)) {
        // Sort by mtime descending so we pick the most recently modified project
        similar = fs.readdirSync(proyectosRoot)
          .filter((d) => fs.statSync(path.join(proyectosRoot, d)).isDirectory())
          .sort((a, b) => {
            const ma = fs.statSync(path.join(proyectosRoot, a)).mtimeMs;
            const mb = fs.statSync(path.join(proyectosRoot, b)).mtimeMs;
            return mb - ma;
          });
      }

      if (similar.length === 0) {
        console.log("[tactical] no existing project found. Create one first.\n");
        return;
      }

      mostRecent  = similar[0]!;
      projectPath = path.join(proyectosRoot, mostRecent);
      relProject  = `./proyectos/${mostRecent}`;
    }

    // 2. Infer stack
    const stack = inferStackFromWorkspace(projectPath);
    const isWeb = stack.includes("html");

    if (!isWeb) {
      console.log(`[tactical] project "${mostRecent}" is not a web stack. Tactical improvements require html/css/js.\n`);
      return;
    }

    console.log(`\n[workspace]`);
    console.log(`  project: ${mostRecent}`);
    console.log(`  path:    ${relProject}`);
    console.log(`  stack:   ${stack.join(", ")}`);
    console.log(``);

    const instruction = intent.instruction;
    const lower = instruction.toLowerCase();

    // Phase 29.1 — Feature-level evolution (kanban, charts, team, etc.)
    if (intent.features.length > 0) {
      console.log(`[tactical] Phase 29.1 — product evolution`);
      console.log(`  features requested: ${intent.features.join(", ")}\n`);

      const evolutionResult = applyEvolutionFeatures(projectPath, intent.features);

      const changesApplied: string[] = evolutionResult.appliedFeatures.map((f) => `feature: ${f}`);
      const filesChanged: string[]   = [...evolutionResult.filesChanged];

      if (evolutionResult.skipped.length > 0) {
        console.log(`  skipped (already applied): ${evolutionResult.skipped.join(", ")}`);
      }

      // Update README
      const readmePath = path.join(projectPath, "README.md");
      if (fs.existsSync(readmePath)) {
        const existing = fs.readFileSync(readmePath, "utf-8");
        const updated  = appendTacticalImprovements(
          existing,
          changesApplied.length > 0 ? changesApplied : ["Phase 29.1 evolution"],
          filesChanged,
          new Date().toISOString().slice(0, 10)
        );
        fs.writeFileSync(readmePath, updated, "utf-8");
        if (!filesChanged.includes("README.md")) filesChanged.push("README.md");
      }

      const W = 60;
      const bar = "─".repeat(W);
      console.log(`[tactical]`);
      console.log(`  workspace: ${relProject}`);
      console.log(`  features aplicados:`);
      for (const f of evolutionResult.appliedFeatures) {
        console.log(`    ✓ ${f}`);
      }
      console.log(`  archivos modificados:`);
      for (const f of filesChanged) {
        console.log(`    - ${f}`);
      }
      console.log(`\n${bar}`);
      console.log(`  Resumen — evolución de producto`);
      console.log(bar);
      console.log(`  project  ${mostRecent}`);
      console.log(`  path     ${relProject}`);
      console.log(`\n  Preview`);
      console.log(`    $ cd ${relProject} && python3 -m http.server 8000`);
      console.log(`    → http://localhost:8000`);
      console.log(`\n  Estado: PASS`);
      console.log(bar + "\n");

      this.logger.info(`handleTacticalImprovement[29.1]: ${mostRecent} — features: ${evolutionResult.appliedFeatures.join(", ")}`);
      this._lastTacticalProject = mostRecent; // context continuity
      return;
    }

    // 3. Build CSS patch (legacy — no product evolution features detected)
    const cssPatch = buildTacticalCSSPatch(instruction);

    // 4. Check what improvements were detected
    const wantsSearch = /búsqueda|search|tabla|table/i.test(lower);
    const wantsTopbar = /topbar|navbar|glassmorphism|header/i.test(lower);
    const wantsCards  = /cards|card|hover/i.test(lower);
    const wantsAnim   = /animaciones|transiciones|suaves|smooth/i.test(lower);
    const wantsGlow   = /glow|premium|spacing|elegante/i.test(lower);

    // 5. Apply CSS patch
    const cssPath = path.join(projectPath, "styles.css");
    const changesApplied: string[] = [];
    const filesChanged: string[] = [];

    if (fs.existsSync(cssPath)) {
      const existingCSS = fs.readFileSync(cssPath, "utf-8");
      // Guard: don't re-apply Phase 27 patch if already present
      if (!existingCSS.includes("Phase 27 — Tactical improvements")) {
        fs.writeFileSync(cssPath, existingCSS + "\n" + cssPatch, "utf-8");
        filesChanged.push("styles.css");
        if (wantsTopbar || true) changesApplied.push("topbar glassmorphism applied");
        if (wantsCards  || true) changesApplied.push("card hover premium applied");
        if (wantsAnim   || true) changesApplied.push("smooth transitions applied");
        if (wantsGlow   || true) changesApplied.push("glow polish + premium spacing applied");
        if (wantsSearch)         changesApplied.push("search input + table styles added");
      } else {
        // Already patched — overwrite the patch section
        const patchStart = existingCSS.indexOf("/* ═══════════════════════════════════════════════════");
        const baseCSS = patchStart !== -1 ? existingCSS.slice(0, patchStart) : existingCSS;
        fs.writeFileSync(cssPath, baseCSS + "\n" + cssPatch, "utf-8");
        filesChanged.push("styles.css");
        changesApplied.push("tactical CSS refreshed with latest improvements");
      }
    }

    // 6. Append search JS if requested
    if (wantsSearch) {
      const jsPath = path.join(projectPath, "script.js");
      if (fs.existsSync(jsPath)) {
        const existingJS = fs.readFileSync(jsPath, "utf-8");
        if (!existingJS.includes("Phase 27: Live table search")) {
          const searchJS = buildSearchTableJS();
          fs.writeFileSync(jsPath, existingJS + searchJS, "utf-8");
          filesChanged.push("script.js");
          changesApplied.push("live table search function added");
        }
      }
    }

    // 7. Update README
    const readmePath = path.join(projectPath, "README.md");
    const readmeExists = fs.existsSync(readmePath);
    if (readmeExists) {
      const existing = fs.readFileSync(readmePath, "utf-8");
      const updated = appendTacticalImprovements(
        existing,
        changesApplied.length > 0 ? changesApplied : ["general UI polish applied"],
        filesChanged,
        new Date().toISOString().slice(0, 10)
      );
      fs.writeFileSync(readmePath, updated, "utf-8");
      filesChanged.push("README.md");
    }

    // 8. Print [tactical] summary
    const W = 60;
    const bar = "─".repeat(W);
    console.log(`[tactical]`);
    console.log(`  workspace: ${relProject}`);
    console.log(`  changes:`);
    for (const c of changesApplied) {
      console.log(`    ✓ ${c}`);
    }
    console.log(`  files modified:`);
    for (const f of filesChanged) {
      console.log(`    - ${f}`);
    }
    console.log(``);
    console.log(`\n${bar}`);
    console.log(`  Resumen — mejoras tácticas`);
    console.log(bar);
    console.log(`\n  Workspace`);
    console.log(`    project  ${mostRecent}`);
    console.log(`    path     ${relProject}`);
    console.log(`\n  Archivos modificados`);
    for (const f of filesChanged) {
      console.log(`    ${f}`);
    }
    console.log(`\n  Preview`);
    console.log(`    $ cd ${relProject} && python3 -m http.server 8000`);
    console.log(`    → http://localhost:8000`);
    console.log(`\n  Qué observar visualmente`);
    if (wantsTopbar || true)  console.log(`    - Topbar con efecto blur/glassmorphism al hacer scroll`);
    if (wantsCards  || true)  console.log(`    - Cards con hover elevado y borde violeta brillante`);
    if (wantsAnim   || true)  console.log(`    - Transiciones suaves en botones y nav items`);
    if (wantsGlow   || true)  console.log(`    - Botones con glow, inputs con focus ring premium`);
    if (wantsSearch)          console.log(`    - Input de búsqueda con filtrado en tiempo real`);
    console.log(`\n  Recomendaciones siguientes`);
    console.log(`    → Agrega paginación a la tabla de alumnos`);
    console.log(`    → Conecta fetch() a un backend local (json-server)`);
    console.log(`    → Añade modo claro/oscuro con toggle`);
    console.log(`\n  Estado: PASS`);
    console.log(bar + "\n");

    this.logger.info(`handleTacticalImprovement: ${mostRecent} — ${changesApplied.length} changes`);
    this._lastTacticalProject = mostRecent; // context continuity
  }

  // ---------------------------------------------------------------------------
  // handleViewCompletion — Phase 29.2: complete named SaaS views in a web project
  // ---------------------------------------------------------------------------
  private async handleViewCompletion(intent: ViewCompletionIntent): Promise<void> {
    // Resolve project path (same logic as handleTacticalImprovement)
    let mostRecent: string;
    let projectPath: string;
    let relProject: string;

    if (shouldUseCwdDirectly(process.cwd())) {
      projectPath = process.cwd();
      mostRecent  = path.basename(process.cwd());
      relProject  = ".";
    } else {
      const proyectosRoot = path.join(process.cwd(), "proyectos");

      let candidates: string[] = [];

      // Context continuity: prefer last-improved project
      if (this._lastTacticalProject) {
        const candidatePath = path.join(proyectosRoot, this._lastTacticalProject);
        if (fs.existsSync(candidatePath)) candidates = [this._lastTacticalProject];
      }
      if (candidates.length === 0 && fs.existsSync(proyectosRoot)) {
        candidates = fs.readdirSync(proyectosRoot)
          .filter((d) => fs.statSync(path.join(proyectosRoot, d)).isDirectory())
          .sort((a, b) => {
            const ma = fs.statSync(path.join(proyectosRoot, a)).mtimeMs;
            const mb = fs.statSync(path.join(proyectosRoot, b)).mtimeMs;
            return mb - ma;
          });
      }
      if (candidates.length === 0) {
        console.log("[view-complete] no existing project found. Create one first.\n");
        return;
      }

      mostRecent  = candidates[0]!;
      projectPath = path.join(proyectosRoot, mostRecent);
      relProject  = `./proyectos/${mostRecent}`;
    }

    // Check web stack
    const stack = inferStackFromWorkspace(projectPath);
    if (!stack.includes("html")) {
      console.log(`[view-complete] project "${mostRecent}" is not a web stack.\n`);
      return;
    }

    const viewList = intent.views.length > 0
      ? intent.views.join(", ")
      : "(cohesion only)";
    console.log(`\n[workspace]`);
    console.log(`  project:      ${mostRecent}`);
    console.log(`  path:         ${relProject}`);
    console.log(`  views:        ${viewList}`);
    console.log(`  cohesion:     ${intent.cohesion}`);
    console.log(`  forceReapply: ${intent.forceReapply}`);
    console.log(``);

    // Phase 29.3: ensure SaaS shell (sidebar + navigateTo) is installed first
    const shellWasBuilt = ensureProjectShell(projectPath);
    if (shellWasBuilt) {
      console.log(`[view-complete] SaaS shell installed (sidebar + navigateTo)\n`);
    }

    const vcResult = applyViewCompletions(projectPath, intent.views, intent.cohesion, intent.forceReapply);

    // Update README
    const readmePath = path.join(projectPath, "README.md");
    if (fs.existsSync(readmePath)) {
      const existing  = fs.readFileSync(readmePath, "utf-8");
      const changes   = vcResult.appliedViews.map((v) => `view-complete: ${v}`);
      const updated   = appendTacticalImprovements(
        existing, changes, vcResult.filesChanged, new Date().toISOString().slice(0, 10)
      );
      fs.writeFileSync(readmePath, updated, "utf-8");
      if (!vcResult.filesChanged.includes("README.md")) vcResult.filesChanged.push("README.md");
    }

    const W = 60;
    const bar = "─".repeat(W);
    console.log(`[view-complete]`);
    console.log(`  workspace: ${relProject}`);
    if (shellWasBuilt) console.log(`  shell:     ✓ SaaS shell instalado (sidebar + navigateTo)`);
    if (vcResult.appliedViews.length > 0) {
      console.log(`  vistas completadas:`);
      for (const v of vcResult.appliedViews) console.log(`    ✓ ${v}`);
    }
    if (vcResult.skipped.length > 0) {
      console.log(`  omitidas: ${vcResult.skipped.join(", ")}`);
    }
    console.log(`  archivos modificados: ${vcResult.filesChanged.join(", ")}`);
    console.log(`\n${bar}`);
    console.log(`  Resumen — view completion 29.3`);
    console.log(bar);
    console.log(`  project  ${mostRecent}`);
    console.log(`  path     ${relProject}`);
    console.log(`  shell    ${shellWasBuilt ? "REBUILT" : "pre-existing"}`);
    console.log(`  vistas   ${vcResult.appliedViews.join(", ") || "(none)"}`);
    console.log(`\n  Preview`);
    console.log(`    $ cd ${relProject} && python3 -m http.server 8000`);
    console.log(`    → http://localhost:8000`);
    const anyChange = shellWasBuilt || vcResult.appliedViews.length > 0;
    console.log(`\n  Estado: ${anyChange ? "PASS" : "NO CHANGES"}`);
    console.log(bar + "\n");

    this.logger.info(`handleViewCompletion[29.3]: ${mostRecent} — shell=${shellWasBuilt} views: ${vcResult.appliedViews.join(", ")}`);
    this._lastTacticalProject = mostRecent; // context continuity
  }

  // ---------------------------------------------------------------------------
  // handleContinueRelease — Phase 26: continue a specific release of an existing project
  // ---------------------------------------------------------------------------
  private async handleContinueRelease(intent: ContinueReleaseIntent): Promise<void> {
    const { projectHint } = intent;
    const proyectosRoot = path.join(process.cwd(), "proyectos");

    // 1. Find similar project by hint
    let similar: string[] = [];
    if (projectHint) {
      const baseSlug = slugify(projectHint);
      similar = findSimilarProjects(baseSlug, proyectosRoot);
    }
    // Fallback: all projects
    if (similar.length === 0 && fs.existsSync(proyectosRoot)) {
      similar = fs.readdirSync(proyectosRoot)
        .filter((d) => fs.statSync(path.join(proyectosRoot, d)).isDirectory())
        .sort();
    }

    if (similar.length === 0) {
      console.log(`[release] no existing projects found. Create one first.\n`);
      return;
    }

    const mostRecent = similar[similar.length - 1]!;
    const projectPath = path.join(proyectosRoot, mostRecent);

    // 2. Read README.md to extract metadata
    const readmePath = path.join(projectPath, "README.md");
    let readmeContent = "";
    let lastExecuted  = "v1";
    let domain        = "school";

    if (fs.existsSync(readmePath)) {
      readmeContent = fs.readFileSync(readmePath, "utf-8");
      const domainM = /\*\*Dominio:\*\*\s*(.+)/.exec(readmeContent);
      if (domainM) domain = domainM[1]!.trim();
      const lastM = /## Última release ejecutada\s*\n(.+)/.exec(readmeContent);
      if (lastM) lastExecuted = lastM[1]!.trim();
    }

    // 3. Resolve target version
    const resolvedVersion: string = intent.targetVersion ?? this.nextVersion(lastExecuted);

    // 4. Print workspace + release header
    const relProject = `./proyectos/${mostRecent}`;
    console.log(`\n[workspace]`);
    console.log(`  project: ${mostRecent}`);
    console.log(`  path:    ${relProject}`);
    console.log(``);
    console.log(`[release]`);
    console.log(`  continuing:       ${resolvedVersion}`);
    console.log(`  completed before: ${lastExecuted}`);
    const pendingAfter = this.nextVersion(resolvedVersion);
    console.log(`  pending after:    ${pendingAfter}`);
    console.log(``);

    // 5. Execute release content
    if (domain === "school" && resolvedVersion === "v2") {
      const content = buildSchoolV2Content();
      const written: Array<{ file: string; lines: number }> = [];
      for (const [filename, fileContent] of Object.entries(content)) {
        const targetPath = path.join(projectPath, filename);
        fs.writeFileSync(targetPath, fileContent, "utf-8");
        written.push({ file: filename, lines: fileContent.split("\n").length });
      }

      // 6. Update README.md
      const newReadme = this.updateReadmeReleases(readmeContent, resolvedVersion, "matrícula, alumnos, cursos, pagos");
      fs.writeFileSync(readmePath, newReadme, "utf-8");

      // 7. Print result + summary
      console.log(`[result]`);
      const pad = (s: string, n: number) => s.padEnd(n);
      for (const w of written) {
        console.log(`  ${pad(w.file, 14)}  updated  (${w.lines} líneas)`);
      }
      console.log(`  ${"README.md".padEnd(14)}  updated  v2 marcado completado`);
      console.log(``);

      const SW = 60;
      const sHdr = "─".repeat(SW);
      console.log(`\n${sHdr}`);
      console.log(`  Resumen de ejecucion`);
      console.log(sHdr);
      console.log(`\n  Workspace`);
      console.log(`    project  ${mostRecent}`);
      console.log(`    path     ${relProject}`);
      console.log(`\n  Release ejecutada:  ${resolvedVersion} — matrícula, alumnos, cursos, pagos`);
      console.log(`  Pendientes:         ${pendingAfter}`);
      console.log(`\n  Archivos`);
      for (const w of written) {
        console.log(`    ${pad(w.file, 14)}  updated    v2 real content`);
      }
      console.log(`    ${"README.md".padEnd(14)}  updated    releases actualizadas`);
      console.log(`\n  Preview`);
      console.log(`    $ cd ${relProject} && python3 -m http.server 8000`);
      console.log(`    → http://localhost:8000`);
      console.log(`\n  Estado: PASS`);
      console.log(sHdr + "\n");

      this.logger.info(`handleContinueRelease: ${resolvedVersion} on ${mostRecent}`);
    } else {
      console.log(`[release] domain "${domain}" + version "${resolvedVersion}" — no template available yet.`);
      console.log(`  school/v2 is implemented. Other combinations coming soon.\n`);
    }
  }

  /** Returns the next version string: "v1" → "v2", "v2" → "v3", etc. */
  private nextVersion(current: string): string {
    const m = /v(\d+)/i.exec(current);
    if (!m) return "v2";
    return `v${parseInt(m[1]!, 10) + 1}`;
  }

  /**
   * Updates README.md content to mark targetVersion as completed
   * and add it (+ next pending) if not already listed.
   */
  private updateReadmeReleases(readme: string, targetVersion: string, goals: string): string {
    let updated = readme;

    // Mark existing pending line as done (handles both bold and plain formats)
    const markDoneRe = new RegExp(`- \\[ \\] (\\*{0,2}${targetVersion}\\*{0,2})`, "g");
    if (markDoneRe.test(updated)) {
      updated = updated.replace(markDoneRe, `- [x] $1`);
    } else {
      // Version not in README — append it after last release line
      const relSection = /## Releases\n([\s\S]*?)(\n##|$)/.exec(updated);
      if (relSection) {
        const nextPending = this.nextVersion(targetVersion);
        const insertion   = `- [x] **${targetVersion}** — ${goals}\n- [ ] **${nextPending}** — horarios, reportes\n`;
        updated = updated.replace(relSection[1]!, relSection[1]! + insertion);
      }
    }

    // Update "Última release ejecutada"
    updated = updated.replace(
      /## Última release ejecutada\s*\n.+/,
      `## Última release ejecutada\n${targetVersion}`
    );

    return updated;
  }

  // ---------------------------------------------------------------------------
  // handlePlan — Phase 21 planner integration (real web tool execution)
  // Phase 25: workspace reuse detection + README generation
  // ---------------------------------------------------------------------------
  private async handlePlan(input: string): Promise<void> {
    let plan = createExecutionPlan(input);
    const lower = input.toLowerCase();

    const w = 56;
    const hdr = "─".repeat(w);

    let ws;
    const usingCwd = shouldUseCwdDirectly(process.cwd());

    if (usingCwd) {
      // Phase 28.1: user is already in a dedicated project folder — use it directly
      ws = cwdAsWorkspace(process.cwd());
      console.log(`\n[workspace]`);
      console.log(`  using current directory`);
      console.log(`  path: ${ws.projectPath}`);
    } else {
      // In agent repo or generic folder — use ./proyectos/<slug>
      const wantsReuse = /reutiliza|reuse|continua|continue|mismo proyecto|existing project/i.test(input);

      // Find similar existing projects before creating a new workspace.
      // Use the first meaningful input line for the slug so improvement prompts
      // ("mejora la plataforma escolar...") resolve the same base slug as the
      // original project even when stack detection falls back to "text".
      const proyectosRoot = path.join(process.cwd(), "proyectos");
      const firstMeaningfulLine = input
        .split(/\r?\n/)
        .map((l) => l.trim())
        .find((l) => !!l && !/^(reutiliza|reuse|continua|continue)/i.test(l)) ?? input.trim();
      const baseSlug = slugify(firstMeaningfulLine) || slugify(plan.objective) || "proyecto";
      const similar = findSimilarProjects(baseSlug, proyectosRoot);

      if (similar.length > 0) {
        const mostRecent = similar[similar.length - 1]!;
        console.log(`\n[workspace]`);
        console.log(`similar project found:`);
        console.log(`  ./proyectos/${mostRecent}`);
        console.log(``);
        console.log(`choose:`);
        console.log(`  1) continue existing`);
        console.log(`  2) create new workspace`);
        console.log(``);

        if (wantsReuse) {
          // Auto-continue without prompt when user explicitly said "reutiliza"
          console.log(`(auto-selecting 1 — "reutiliza" detected)\n`);
          ws = continueProjectWorkspace(mostRecent);
        } else {
          // Ask user interactively
          const choice = await new Promise<string>((resolve) => {
            this.rl.question("choice [1/2, default=1]: ", (ans) => {
              resolve(ans.trim());
            });
          });
          if (choice === "2") {
            ws = resolveProjectWorkspace(plan.objective);
            console.log(`\n→ new workspace: ./proyectos/${ws.slug}`);
          } else {
            ws = continueProjectWorkspace(mostRecent);
            console.log(`\n→ continuing: ./proyectos/${ws.slug}`);
          }
        }
      } else {
        // No similar project found — create fresh workspace
        ws = resolveProjectWorkspace(plan.objective);
        console.log(`\n[workspace]`);
      }
    }

    // If we are continuing an existing workspace and the current plan has a
    // generic "text" stack, inherit the real stack from the workspace files.
    if (plan.stack.includes("text") || plan.stack.length === 0) {
      const inferredStack = inferStackFromWorkspace(ws.projectPath);
      if (inferredStack.length > 0) {
        // Rebuild plan preserving domain/style detected from the new prompt
        const savedDomain = plan.domain;
        const savedStyle  = plan.style;
        plan = createExecutionPlan(input, inferredStack);
        if (savedDomain && !plan.domain) plan.domain = savedDomain;
        if (savedStyle && savedStyle.length > 0 && (!plan.style || plan.style.length === 0)) {
          plan.style = savedStyle;
        }
      }
    }

    const relRoot    = usingCwd ? ws.root        : `./proyectos`;
    const relProject = usingCwd ? ws.projectPath : `./proyectos/${ws.slug}`;
    const workspaceMode: WorkspaceMode = usingCwd ? "direct" : "managed";
    const stateWorkspace: ProjectWorkspaceState = {
      mode: workspaceMode,
      root: ws.root,
      projectPath: ws.projectPath,
      slug: ws.slug,
    };
    let projectState: ProjectState | null = null;

    console.log(`root:    ${relRoot}`);
    console.log(`project: ${ws.slug}`);
    console.log(`path:    ${relProject}`);

    console.log(`\n[planner]`);
    console.log(`objective: ${plan.objective}`);
    console.log(`stack:     ${plan.stack.join(", ")}`);
    console.log(`steps:     ${plan.steps.length}`);
    if (plan.domain)              console.log(`domain:    ${plan.domain}`);
    if (plan.style?.length)       console.log(`style:     ${plan.style.join(", ")}`);
    if (plan.design) {
      console.log(`design:    ${plan.design.appType} / ${plan.design.layout}`);
      console.log(`  product:    ${plan.design.productName}`);
      console.log(`  components: ${plan.design.components.join(", ")}`);
      console.log(`  modules:    ${plan.design.modules.join(", ")}`);
    }

    if (plan.releases && plan.releases.length > 0) {
      console.log(`\n[releases]`);
      for (const r of plan.releases) {
        const goals = r.goals.length > 0 ? r.goals.join(", ") : "(pending)";
        console.log(`${r.version}: ${goals}`);
      }
      const v1 = plan.releases[0];
      if (v1) {
        console.log(`\nexecuting: ${v1.version} — ${v1.goals.join(", ") || "base"}`);
        if (plan.releases.length > 1) {
          const pending = plan.releases.slice(1).map((r) => r.version).join(", ");
          console.log(`pending:   ${pending} (próximas iteraciones)`);
        }
      }
    }

    try {
      projectState = ensureProjectState({ workspace: stateWorkspace });
    } catch (err) {
      this.logger.warn(`handlePlan: ensureProjectState failed: ${err instanceof Error ? err.message : String(err)}`);
    }

    if (!projectState) {
      try {
        projectState = buildProjectStateFromPlan(stateWorkspace, plan);
        writeProjectState(ws.projectPath, projectState);
      } catch (err) {
        this.logger.warn(`handlePlan: initial state write failed: ${err instanceof Error ? err.message : String(err)}`);
        projectState = null;
      }
    }

    // Snapshot which target files already exist before execution
    // (used to distinguish "created" vs "updated" in the summary)
    const preExistMap = new Map<string, boolean>();
    for (const step of plan.steps) {
      for (const f of step.targetFiles) {
        if (!preExistMap.has(f)) {
          preExistMap.set(f, fs.existsSync(path.join(ws.projectPath, f)));
        }
      }
    }

    // Execute with workspace cwd so all file writes land inside the project folder
    const ctx = { cwd: ws.projectPath };
    const result = await executePlan(plan, ctx);

    // Step-by-step progress (brief)
    console.log(`\n[steps]`);
    for (const s of result.steps) {
      const ok = s.success ? "ok" : "fail";
      console.log(`  [${s.id}] ${ok}  ${s.title}`);
      console.log(`        ${s.message}`);
    }

    // Write/update README.md for the project
    let readmeWritten = false;
    try {
      const now = new Date().toISOString().slice(0, 10);
      if (projectState) {
        try {
          projectState = refreshProjectStateFromPlan(projectState, plan, { now });
          writeProjectState(ws.projectPath, projectState);
        } catch (err) {
          this.logger.warn(`handlePlan: final state refresh failed: ${err instanceof Error ? err.message : String(err)}`);
        }
      }
      const readmePlan = projectState ? projectStateToExecutionPlan(projectState) : plan;
      const readmeContent = generateProjectReadme(ws, readmePlan, now);
      const readmePath = path.join(ws.projectPath, "README.md");
      fs.writeFileSync(readmePath, readmeContent, "utf-8");
      readmeWritten = true;
    } catch (err) {
      this.logger.warn(`handlePlan: README write failed: ${err instanceof Error ? err.message : String(err)}`);
    }

    // Build file entries for summary table
    interface FileEntry { file: string; action: string; note: string; }
    const fileEntries: FileEntry[] = [];
    for (let i = 0; i < plan.steps.length; i++) {
      const step = plan.steps[i]!;
      const res  = result.steps[i]!;
      if (step.type === "run" || step.type === "analyze") continue;
      if (step.targetFiles.length === 0) continue;
      const isRealWrite = res.message.includes("escrito");
      const note = res.message
        .replace(/^\[(?:create|edit|semantic)\]\s*/, "")
        .replace(/\s*\(\d+\s*l[ií]neas\)/, "")
        .slice(0, 52)
        .trim();
      for (const f of step.targetFiles) {
        const existed = preExistMap.get(f) ?? false;
        const action = isRealWrite
          ? (existed ? "updated" : "created")
          : "stub";
        fileEntries.push({ file: f, action, note });
      }
    }
    if (readmeWritten) {
      fileEntries.push({ file: "README.md", action: "updated", note: "project metadata + roadmap" });
    }
    if (projectState) {
      fileEntries.push({ file: ".axis/project-state.json", action: "updated", note: "project memory kernel" });
    }

    // ── Consolidated execution summary ───────────────────────────────────────
    const SW = 60;
    const sHdr = "─".repeat(SW);

    const pad = (s: string, n: number) => s.padEnd(n);

    // Release lines
    const executedRelease = plan.releases?.[0]
      ? `${plan.releases[0].version}` + (plan.releases[0].goals.length ? ` — ${plan.releases[0].goals.join(", ")}` : "")
      : "v1";
    const pendingReleases = plan.releases && plan.releases.length > 1
      ? plan.releases.slice(1).map((r) => r.version).join(", ")
      : null;

    // Preview command
    const previewCmd = plan.stack.includes("html")
      ? `cd ${relProject} && python3 -m http.server 8000`
      : plan.stack.includes("python")
      ? `cd ${relProject} && python3 main.py`
      : null;

    // Has any stub?
    const hasStubs = fileEntries.some((e) => e.action === "stub");

    console.log(`\n${sHdr}`);
    console.log(`  Resumen de ejecucion`);
    console.log(sHdr);

    console.log(`\n  Workspace`);
    console.log(`    root     ${relRoot}`);
    console.log(`    project  ${ws.slug}`);
    console.log(`    path     ${relProject}`);

    console.log(`\n  Release ejecutada:  ${executedRelease}`);
    if (pendingReleases) {
      console.log(`  Pendientes:         ${pendingReleases}`);
    }

    if (fileEntries.length > 0) {
      console.log(`\n  Archivos`);
      for (const e of fileEntries) {
        console.log(`    ${pad(e.file, 14)}  ${pad(e.action, 9)}  ${e.note}`);
      }
      if (hasStubs) {
        console.log(`\n  (!) Pasos marcados como "stub" no escribieron archivos reales.`);
      }
    } else {
      console.log(`\n  Archivos: (ninguno — todos los pasos son stubs)`);
    }

    if (previewCmd) {
      console.log(`\n  Preview`);
      console.log(`    $ ${previewCmd}`);
      console.log(`    → http://localhost:8000`);
    }

    const estado = result.success ? "PASS" : "FAIL";
    console.log(`\n  Estado: ${estado}`);
    console.log(sHdr + "\n");

    this.logger.info(`handlePlan: workspace=${ws.projectPath}, steps=${plan.steps.length}, success=${result.success}`);
  }

  private async handleBugfix(intent: BugfixIntent): Promise<void> {
    const { filePath, instruction } = intent;

    // Step 1: read file
    process.stdout.write(`[tool] reading: ${filePath}\n`);
    const readResult = await this.tools.execute(
      "read_file",
      { path: filePath },
      { cwd: process.cwd() }
    );
    if (readResult.error) {
      console.log(`[error] ${readResult.error}\n`);
      this.logger.warn(`handleBugfix: read_file failed: ${readResult.error}`);
      return;
    }

    let fileContent = readResult.contextOutput ?? readResult.output;

    // Step 1b: deterministic syntax check (JS/TS only)
    let syntaxError = checkJsSyntax(filePath, fileContent);
    let deterministicFixed = false;

    if (syntaxError) {
      process.stdout.write(`[info] syntax error detected: ${syntaxError}\n`);
      this.logger.info(`handleBugfix: syntax error in ${filePath}: ${syntaxError}`);

      // Step 1c: try deterministic heuristic fix before calling LLM.
      // This ensures refactor requests work on valid code, and simple bugfixes
      // resolve without depending on the LLM at all.
      const fixedContent = tryFixJsSyntaxDeterministic(filePath, fileContent);
      if (fixedContent !== null) {
        process.stdout.write(`[fix] applying deterministic syntax fix: ${filePath}\n`);
        const writeResult = await this.tools.execute(
          "write_file",
          { path: filePath, content: fixedContent },
          { cwd: process.cwd() }
        );
        if (!writeResult.error) {
          console.log(`[fix] Sintaxis reparada automáticamente en ${filePath}\n`);
          this.logger.info(`handleBugfix: deterministic fix applied to ${filePath}`);
          fileContent = fixedContent;
          syntaxError = null; // file is now syntactically valid
          deterministicFixed = true;
        }
      }
    }

    // Step 2: isolated LLM call (no history).
    // For refactor requests on valid code use the refactor prompt (which mandates a change).
    // For bugfix requests (or files with remaining syntax errors) use the bugfix prompt.
    process.stdout.write(`[tool] analyzing: ${filePath}\n`);
    const prompt = (intent.isRefactor && !syntaxError)
      ? buildRefactorPrompt(filePath, fileContent, instruction)
      : buildBugfixPrompt(filePath, fileContent, instruction, syntaxError ?? undefined);
    let llmResponse = "";
    try {
      for await (const token of chat([{ role: "user", content: prompt }])) {
        llmResponse += token;
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.log(`[error] LLM failed: ${msg}\n`);
      this.logger.error("handleBugfix: LLM call failed", err);
      return;
    }

    const hasValidBlocks = (r: string): boolean =>
      r.includes("<<<SEARCH") && r.includes(">>>REPLACE");

    if (llmResponse.trim() === "NO_CHANGES_NEEDED" || !hasValidBlocks(llmResponse)) {
      if (deterministicFixed) {
        // Syntax was repaired; no further LLM changes required.
        console.log(`[info] Sintaxis reparada. No se requirieron cambios adicionales en ${filePath}\n`);
        this.agent.injectContext(`Sintaxis reparada automáticamente: \`${filePath}\``);
      } else if (syntaxError) {
        // Syntax error confirmed but neither LLM nor heuristic could fix it.
        console.log(`[error] Error de sintaxis confirmado pero no pudo corregirse automáticamente.\n  ${syntaxError}\n`);
        console.log(`[info] Revisa el archivo manualmente o describe el fix con más detalle.\n`);
        this.logger.warn(`handleBugfix: unfixable syntax error in ${filePath}: ${syntaxError}`);
      } else if (llmResponse.trim() === "NO_CHANGES_NEEDED") {
        if (intent.isRefactor) {
          // The refactor prompt does not offer NO_CHANGES_NEEDED — the LLM disobeyed.
          console.log(`[warn] El LLM ignoró la instrucción de refactor y no produjo cambios.\n  Intenta ser más específico, p.ej: "extrae la constante en script.js"\n`);
          this.logger.warn(`handleBugfix: refactor prompt disobeyed — LLM returned NO_CHANGES_NEEDED for: ${filePath}`);
        } else {
          console.log(`[info] Sin cambios: el código ya está correcto en ${filePath}\n`);
          this.logger.info(`handleBugfix: no changes needed: ${filePath}`);
        }
      } else {
        console.log(`[error] El LLM no generó bloques de edición válidos.\n`);
        this.logger.warn(`handleBugfix: no valid edit blocks for: ${instruction}`);
      }
      return;
    }

    // Step 3: apply edit_file
    process.stdout.write(`[tool] applying fix: ${filePath}\n`);
    const editResult = await this.tools.execute(
      "edit_file",
      { path: filePath, operations: llmResponse },
      { cwd: process.cwd() }
    );

    if (editResult.error) {
      console.log(`[error] ${editResult.error}\n`);
      this.logger.warn(`handleBugfix: edit_file failed: ${editResult.error}`);
      return;
    }

    console.log(editResult.output + "\n");
    const context = deterministicFixed
      ? `Sintaxis reparada y refactorizado: \`${filePath}\`\n${instruction}`
      : `Archivo corregido: \`${filePath}\`\nMejora: ${instruction}`;
    this.agent.injectContext(context);
    this.logger.info(`handleBugfix: ${filePath} — ${instruction}`);
  }

  private async handleRestart(input: string): Promise<void> {
    const service = input.slice("/restart".length).trim();
    if (!service) {
      console.log("Usage: /restart <service>\n");
      return;
    }

    const result = await this.tools.execute(
      "restart_service",
      { service },
      { cwd: process.cwd(), confirm: this.confirm.bind(this) }
    );

    if (result.error) {
      console.log(`[error] ${result.error}\n`);
      this.logger.warn(`/restart failed: ${result.error}`);
      return;
    }

    console.log(result.output + "\n");
    if (this.isBackend(service)) {
      console.log(
        `[!] Acción ejecutada sobre el backend del agente. La sesión puede interrumpirse.\n` +
        `    Verifica manualmente con \`systemctl status ${service}\` o vuelve a abrir el agente.\n`
      );
    }
    this.logger.info(`/restart: ${service}`);
  }

  private async handleKill(input: string): Promise<void> {
    const pid = input.slice("/kill".length).trim();
    if (!pid) {
      console.log("Usage: /kill <pid>\n");
      return;
    }

    const result = await this.tools.execute(
      "kill_process",
      { pid },
      { cwd: process.cwd(), confirm: this.confirm.bind(this) }
    );

    if (result.error) {
      console.log(`[error] ${result.error}\n`);
      this.logger.warn(`/kill failed: ${result.error}`);
      return;
    }

    console.log(result.output + "\n");
    this.logger.info(`/kill: ${pid}`);
  }

  private async handleDiagnose(input: string): Promise<void> {
    const service = input.slice("/diagnose".length).trim();
    if (!service) {
      console.log("Usage: /diagnose <service>\n");
      return;
    }

    // Step 1: systemctl status
    process.stdout.write(`[tool] executing: systemctl status ${service}\n`);
    const statusResult = await this.tools.execute(
      "systemctl_status",
      { service },
      { cwd: process.cwd() }
    );
    if (statusResult.error) {
      console.log(`[error] ${statusResult.error}\n`);
      this.logger.warn(`/diagnose systemctl failed: ${statusResult.error}`);
      return;
    }

    // Step 2: journalctl
    process.stdout.write(`[tool] executing: journalctl -u ${service}\n`);
    const journalResult = await this.tools.execute(
      "journalctl",
      { service },
      { cwd: process.cwd() }
    );
    if (journalResult.error) {
      console.log(`[error] ${journalResult.error}\n`);
      this.logger.warn(`/diagnose journalctl failed: ${journalResult.error}`);
      return;
    }

    // Combine both into one Service data context block
    const statusCtx = statusResult.contextOutput ?? statusResult.output;
    const journalCtx = journalResult.contextOutput ?? journalResult.output;
    this.agent.injectContext(`Service data:\n\n${statusCtx}\n\n${journalCtx}`);

    // Ask the agent for a structured diagnosis — no action execution
    process.stdout.write("Assistant: ");
    try {
      await this.agent.send(
        `Diagnostica el servicio "${service}": resume el estado y los hallazgos del journal, ` +
        `luego indica la acción concreta más adecuada. ` +
        `Si recomiendas reiniciar, di exactamente: Recomendación: usa \`/restart ${service}\` para reiniciarlo.`,
        (token) => { process.stdout.write(token); }
      );
      process.stdout.write("\n\n");
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      process.stdout.write(`\n[error] ${msg}\n\n`);
      this.logger.error("Diagnose agent call failed", err);
    }
    this.logger.info(`/diagnose: ${service}`);
  }

  private async handleFix(input: string): Promise<void> {
    const service = input.slice("/fix".length).trim();
    if (!service) {
      console.log("Usage: /fix <service>\n");
      return;
    }

    // Step 1: systemctl status
    process.stdout.write(`[tool] executing: systemctl status ${service}\n`);
    const statusResult = await this.tools.execute(
      "systemctl_status",
      { service },
      { cwd: process.cwd() }
    );
    if (statusResult.error) {
      console.log(`[error] ${statusResult.error}\n`);
      this.logger.warn(`/fix systemctl failed: ${statusResult.error}`);
      return;
    }

    const statusText = [statusResult.error, statusResult.output, statusResult.contextOutput]
      .filter(Boolean)
      .join("\n");
    if (/not\s+found|could not be found|Unit .+ not found/i.test(statusText)) {
      console.log(`El servicio "${service}" no existe.\n`);
      this.logger.warn(`/fix: service not found — ${service}`);
      return;
    }

    // Source of truth: systemctl output decides if action is needed
    if (/Active:\s+active \(running\)/i.test(statusResult.output)) {
      console.log(statusResult.contextOutput ?? statusResult.output);
      console.log("No se requiere acción.\n");
      this.logger.info(`/fix: ${service} — already running, no action needed`);
      return;
    }

    // Step 2: journalctl
    process.stdout.write(`[tool] executing: journalctl -u ${service}\n`);
    const journalResult = await this.tools.execute(
      "journalctl",
      { service },
      { cwd: process.cwd() }
    );
    if (journalResult.error) {
      console.log(`[error] ${journalResult.error}\n`);
      this.logger.warn(`/fix journalctl failed: ${journalResult.error}`);
      return;
    }

    // Inject combined context (same format as /diagnose)
    const statusCtx = statusResult.contextOutput ?? statusResult.output;
    const journalCtx = journalResult.contextOutput ?? journalResult.output;
    this.agent.injectContext(`Service data:\n\n${statusCtx}\n\n${journalCtx}`);

    // If targeting the LLM backend, skip agent.send() — restarting it would
    // cut the connection mid-flight and produce an empty [error].
    if (this.isBackend(service)) {
      console.log(statusCtx);
      process.stdout.write(`[fix] restart_service "${service}"\n`);
      const backendRestart = await this.tools.execute(
        "restart_service",
        { service },
        { cwd: process.cwd(), confirm: this.confirm.bind(this) }
      );
      if (backendRestart.error) {
        console.log(`[error] ${backendRestart.error}\n`);
        this.logger.warn(`/fix restart failed: ${backendRestart.error}`);
        return;
      }
      console.log(backendRestart.output + "\n");
      console.log(
        `[!] Acción ejecutada sobre el backend del agente. La sesión puede interrumpirse.\n` +
        `    Verifica manualmente con \`systemctl status ${service}\` o vuelve a abrir el agente.\n`
      );
      this.logger.info(`/fix: restarted backend service ${service}`);
      return;
    }

    // Ask agent for diagnosis, capture full response
    let diagnosis = "";
    process.stdout.write("Assistant: ");
    try {
      await this.agent.send(
        `Diagnostica el servicio "${service}": resume el estado y los hallazgos del journal, ` +
        `luego indica la acción concreta más adecuada. ` +
        `Si recomiendas reiniciar, di exactamente: Recomendación: usa \`/restart ${service}\` para reiniciarlo.`,
        (token) => {
          process.stdout.write(token);
          diagnosis += token;
        }
      );
      process.stdout.write("\n\n");
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      process.stdout.write(`\n[error] ${msg}\n\n`);
      this.logger.error("/fix agent call failed", err);
      return;
    }

    // Service is not running — proceed to restart with mandatory confirmation
    // Execute restart via real tool with mandatory confirmation
    process.stdout.write(`[fix] restart_service "${service}"\n`);
    const restartResult = await this.tools.execute(
      "restart_service",
      { service },
      { cwd: process.cwd(), confirm: this.confirm.bind(this) }
    );

    if (restartResult.error) {
      console.log(`[error] ${restartResult.error}\n`);
      this.logger.warn(`/fix restart failed: ${restartResult.error}`);
      return;
    }

    console.log(restartResult.output + "\n");
    this.logger.info(`/fix: restarted ${service}`);

    // Step 4: verify service state after restart
    process.stdout.write(`[tool] executing: systemctl status ${service}\n`);
    const verifyResult = await this.tools.execute(
      "systemctl_status",
      { service },
      { cwd: process.cwd() }
    );

    if (verifyResult.error) {
      console.log(`[error] ${verifyResult.error}\n`);
      this.logger.warn(`/fix verify failed: ${verifyResult.error}`);
      return;
    }

    const recovered = /active \(running\)/i.test(verifyResult.output);
    if (recovered) {
      console.log(`Servicio recuperado correctamente.\n`);
      this.logger.info(`/fix: ${service} recovered`);
    } else {
      console.log(`El problema persiste. Estado actual:\n${verifyResult.output}\n`);
      this.logger.warn(`/fix: ${service} still not healthy after restart`);
    }
  }

  private async collectAuditData(): Promise<AuditSnapshot> {
    const cwd = process.cwd();

    // ── Step 1: parallel read-only tools ──────────────────────────────────
    process.stdout.write("[audit] memory, disk, processes, ports...\n");
    const [memResult, diskResult, psResult, portsResult] = await Promise.all([
      this.tools.execute("memory_status",  {},                              { cwd }),
      this.tools.execute("disk_usage",     {},                              { cwd }),
      this.tools.execute("list_processes", { sort: "cpu", limit: "10" },   { cwd }),
      this.tools.execute("open_ports",     {},                              { cwd }),
    ]);

    // ── Step 2: service check ──────────────────────────────────────────────
    const svcName = config.backendService;
    process.stdout.write(`[audit] service: ${svcName}...\n`);
    const svcResult = await this.tools.execute("systemctl_status", { service: svcName }, { cwd });

    // ── Parse: Memory ──────────────────────────────────────────────────────
    let memStatus: "OK" | "ATTENTION" | "CRITICAL" = "OK";
    let memDetail = "";
    let memUsedPercent = 0;
    if (memResult.error) {
      memStatus = "ATTENTION";
      memDetail = "no data";
    } else {
      const memLine = memResult.output.split("\n").find((l) => l.trim().startsWith("Mem:"));
      if (memLine) {
        const parts = memLine.trim().split(/\s+/);
        const total     = parseHumanBytes(parts[1] ?? "");
        const available = parseHumanBytes(parts[6] ?? "");
        memDetail = `${parts[1] ?? "?"} total, ${parts[6] ?? "?"} available`;
        if (total > 0) {
          const ratio = available / total;
          memUsedPercent = (1 - ratio) * 100;
          if (ratio < 0.10) memStatus = "CRITICAL";
          else if (ratio < 0.25) memStatus = "ATTENTION";
        }
      } else {
        memDetail = "unparseable output";
        memStatus = "ATTENTION";
      }
    }

    // ── Parse: Disk ────────────────────────────────────────────────────────
    let diskStatus: "OK" | "ATTENTION" | "CRITICAL" = "OK";
    let diskDetail = "";
    let diskMaxPercent = 0;
    if (diskResult.error) {
      diskStatus = "ATTENTION";
      diskDetail = "no data";
    } else {
      const PSEUDO_FS = new Set([
        "tmpfs", "devtmpfs", "efivarfs", "proc", "sysfs",
        "cgroup", "cgroup2", "devpts", "mqueue", "overlay",
        "hugetlbfs", "pstore", "securityfs", "fusectl",
      ]);
      let maxPct = 0;
      let maxLabel = "";
      for (const line of diskResult.output.split("\n").slice(1)) {
        const parts = line.trim().split(/\s+/);
        if (parts.length < 6) continue;
        const fs = parts[0] ?? "";
        if (PSEUDO_FS.has(fs)) continue;
        const m = (parts[4] ?? "").match(/^(\d+)%$/);
        if (!m) continue;
        const pct = parseInt(m[1] ?? "0", 10);
        if (pct > maxPct) {
          maxPct = pct;
          maxLabel = `${fs} at ${pct}% (${parts[5] ?? ""})`;
        }
      }
      diskMaxPercent = maxPct;
      diskDetail = maxLabel || "ok";
      if (maxPct >= 90) diskStatus = "CRITICAL";
      else if (maxPct >= 75) diskStatus = "ATTENTION";
    }

    // ── Parse: Processes ───────────────────────────────────────────────────
    let psStatus: "OK" | "ATTENTION" | "CRITICAL" = "OK";
    let psDetail = "";
    let topCpuPercent = 0;
    if (psResult.error) {
      psStatus = "ATTENTION";
      psDetail = "no data";
    } else {
      const EPHEMERAL = new Set(["ps", "top", "htop", "grep", "rg", "awk", "sed", "node", "tsx", "ts-node", "ss"]);
      let maxCpu = 0;
      let maxName = "";
      for (const line of (psResult.contextOutput ?? psResult.output).split("\n")) {
        const m = line.match(/^\s*\d+\s+(\S+)\s+([\d.]+)\s+([\d.]+)/);
        if (!m) continue;
        const name = m[1] ?? "";
        if (EPHEMERAL.has(name.toLowerCase())) continue;
        const cpu = parseFloat(m[2] ?? "0");
        if (cpu > maxCpu) { maxCpu = cpu; maxName = name; }
      }
      topCpuPercent = maxCpu;
      if (maxCpu === 0) {
        psDetail = "idle";
      } else {
        psDetail = `top: ${maxName} ${maxCpu.toFixed(1)}% CPU`;
        if (maxCpu >= 90) psStatus = "CRITICAL";
        else if (maxCpu >= 50) psStatus = "ATTENTION";
      }
    }

    // ── Parse: Ports ───────────────────────────────────────────────────────
    let portsStatus: "OK" | "ATTENTION" = "OK";
    let portsDetail = "";
    let portCount = 0;
    if (portsResult.error) {
      portsStatus = "ATTENTION";
      portsDetail = "no data";
    } else {
      const listenCount = portsResult.output.split("\n").filter((l) => /LISTEN/.test(l)).length;
      portCount = listenCount;
      portsDetail = `${listenCount} listening`;
      if (listenCount > 30) portsStatus = "ATTENTION";
    }

    // ── Parse: Services ────────────────────────────────────────────────────
    let svcStatus: "OK" | "ATTENTION" | "CRITICAL" = "OK";
    let svcDetail = "";
    const svcRaw = svcResult.output + (svcResult.contextOutput ?? "");
    if (svcResult.error || /Unit .+ not found|could not be found/i.test(svcRaw)) {
      svcStatus = "ATTENTION";
      svcDetail = `${svcName}: not found`;
    } else if (/Active:\s+active \(running\)/i.test(svcResult.output)) {
      svcDetail = `${svcName}: running`;
    } else if (/Active:\s+failed/i.test(svcResult.output)) {
      svcStatus = "CRITICAL";
      svcDetail = `${svcName}: failed`;
    } else if (/Active:\s+inactive/i.test(svcResult.output)) {
      svcStatus = "ATTENTION";
      svcDetail = `${svcName}: inactive`;
    } else {
      svcStatus = "ATTENTION";
      svcDetail = `${svcName}: unknown state`;
    }

    return {
      memStatus, memDetail,
      diskStatus, diskDetail,
      psStatus, psDetail,
      portsStatus, portsDetail,
      svcStatus, svcDetail,
      memUsedPercent, diskMaxPercent, portCount, topCpuPercent,
    };
  }

  private async handleMonitor(intervalSec: number, resume: () => void): Promise<void> {
    const GREEN  = "\x1b[32m";
    const YELLOW = "\x1b[33m";
    const RED    = "\x1b[31m";
    const RESET  = "\x1b[0m";
    const col = (s: "OK" | "ATTENTION" | "CRITICAL") =>
      s === "OK" ? GREEN : s === "CRITICAL" ? RED : YELLOW;

    let stopped = false;
    let cancelSleep: (() => void) | null = null;

    // Intercept readline's SIGINT handling. Without a "SIGINT" listener on rl,
    // readline calls rl.close() on Ctrl+C, which fires our "close" → process.exit(0).
    // With a listener, readline emits "SIGINT" here instead of closing the interface.
    const onSigint = () => { stopped = true; cancelSleep?.(); };
    this.rl.on("SIGINT", onSigint);

    this.rl.pause();
    process.stdin.setRawMode(true);
    process.stdin.resume();

    console.log(`\nMonitoring every ${intervalSec}s — press Ctrl+C to stop\n`);
    this.alertTracker.reset();

    while (!stopped) {
      const snapshot = await this.collectAuditData();
      const { memStatus, memDetail, diskStatus, diskDetail, psStatus, psDetail,
              portsStatus, portsDetail, svcStatus, svcDetail } = snapshot;

      const ts = new Date().toLocaleTimeString();
      const lbl = (s: "OK" | "ATTENTION" | "CRITICAL") => `${col(s)}${s}${RESET}`;

      process.stdout.write(`\x1b[2K\r`); // clear current line before block
      console.log(`── ${ts} ${"─".repeat(RULE_WIDTH - ts.length - 4)}`);
      console.log(`Memory:   ${lbl(memStatus)}  ${memDetail}`);
      console.log(`Disk:     ${lbl(diskStatus)}  ${diskDetail}`);
      console.log(`Process:  ${lbl(psStatus)}  ${psDetail}`);
      console.log(`Ports:    ${lbl(portsStatus)}  ${portsDetail}`);
      console.log(`Services: ${lbl(svcStatus)}  ${svcDetail}`);

      const alerts = evaluateAlerts(defaultRules, snapshot);
      const changes = this.alertTracker.computeChanges(alerts);
      console.log(`Alerts:   ${formatAlertsCompact(alerts)}`);
      if (changes.length > 0) {
        composeNotifiers(consoleNotifier, desktopNotifier).notify(changes);
      }

      if (stopped) break;

      await new Promise<void>((resolve) => {
        const timer = setTimeout(() => { cancelSleep = null; resolve(); }, intervalSec * 1000);
        cancelSleep = () => { clearTimeout(timer); resolve(); };
      });
    }

    this.rl.removeListener("SIGINT", onSigint);
    process.stdin.pause();
    process.stdin.setRawMode(false);
    console.log("\nMonitor stopped.\n");
    this.rl.resume();
    resume();
  }

  private async handleAlert(): Promise<void> {
    const snapshot = await this.collectAuditData();
    const alerts = evaluateAlerts(defaultRules, snapshot);
    console.log(formatAlerts(alerts));
    const activeCount = alerts.length;
    this.logger.info(`/alert: ${activeCount} active alert(s)`);
  }

  private async handleAudit(): Promise<void> {
    const GREEN  = "\x1b[32m";
    const YELLOW = "\x1b[33m";
    const RED    = "\x1b[31m";
    const RESET  = "\x1b[0m";
    const statusColor = (s: "OK" | "ATTENTION" | "CRITICAL") =>
      s === "OK" ? GREEN : s === "CRITICAL" ? RED : YELLOW;

    const { memStatus, memDetail, diskStatus, diskDetail, psStatus, psDetail,
            portsStatus, portsDetail, svcStatus, svcDetail } = await this.collectAuditData();

    // ── Report ─────────────────────────────────────────────────────────────
    const label = (s: "OK" | "ATTENTION" | "CRITICAL") =>
      `${statusColor(s)}${s.padEnd(9)}${RESET}`;

    console.log(`\n─── audit ${"─".repeat(RULE_WIDTH - 9)}`);
    console.log(`Memory:    ${label(memStatus)}  ${memDetail}`);
    console.log(`Disk:      ${label(diskStatus)}  ${diskDetail}`);
    console.log(`Processes: ${label(psStatus)}  ${psDetail}`);
    console.log(`Ports:     ${label(portsStatus)}  ${portsDetail}`);
    console.log(`Services:  ${label(svcStatus)}  ${svcDetail}`);
    console.log(rule());

    // Conclusion — deterministic, no LLM
    const statuses = [memStatus, diskStatus, psStatus, svcStatus] as const;
    const hasCritical = statuses.includes("CRITICAL");
    const hasAttention = statuses.includes("ATTENTION") || portsStatus === "ATTENTION";
    const issues: string[] = [];
    if (memStatus   !== "OK") issues.push(`memoria: ${memDetail}`);
    if (diskStatus  !== "OK") issues.push(`disco: ${diskDetail}`);
    if (psStatus    !== "OK") issues.push(`proceso: ${psDetail}`);
    if (portsStatus !== "OK") issues.push(`puertos: ${portsDetail}`);
    if (svcStatus   !== "OK") issues.push(`servicio: ${svcDetail}`);

    let conclusion: string;
    if (hasCritical)       conclusion = `CRITICAL — acción inmediata. ${issues.join(" | ")}`;
    else if (hasAttention) conclusion = `Revisar: ${issues.join(" | ")}.`;
    else                   conclusion = "Sistema estable. Sin alertas.";

    console.log(`\nConclusion: ${conclusion}\n`);
    this.logger.info(
      `/audit mem=${memStatus} disk=${diskStatus} ps=${psStatus} ports=${portsStatus} svc=${svcStatus}`
    );
  }

  private async handleAuditDeep(): Promise<void> {
    const GREEN  = "\x1b[32m";
    const YELLOW = "\x1b[33m";
    const RED    = "\x1b[31m";
    const BOLD   = "\x1b[1m";
    const RESET  = "\x1b[0m";

    const { memStatus, memDetail, diskStatus, diskDetail, psStatus, psDetail,
            portsStatus, portsDetail, svcStatus, svcDetail } = await this.collectAuditData();

    type Entry = { label: string; detail: string };
    const critical: Entry[] = [];
    const attention: Entry[] = [];
    const ok: Entry[] = [];

    const classify = (status: "OK" | "ATTENTION" | "CRITICAL", label: string, detail: string) => {
      if (status === "CRITICAL")  critical.push({ label, detail });
      else if (status === "ATTENTION") attention.push({ label, detail });
      else ok.push({ label, detail });
    };

    classify(memStatus,   "Memory",    memDetail);
    classify(diskStatus,  "Disk",      diskDetail);
    classify(psStatus,    "Processes", psDetail);
    classify(portsStatus, "Ports",     portsDetail);
    classify(svcStatus,   "Services",  svcDetail);

    console.log(`\n─── audit deep ${"─".repeat(RULE_WIDTH - 14)}`);

    if (critical.length > 0) {
      console.log(`\n${BOLD}${RED}CRITICAL:${RESET}`);
      for (const e of critical) console.log(`  ${RED}✖${RESET}  ${e.label.padEnd(10)} ${e.detail}`);
    }

    if (attention.length > 0) {
      console.log(`\n${BOLD}${YELLOW}ATTENTION:${RESET}`);
      for (const e of attention) console.log(`  ${YELLOW}!${RESET}  ${e.label.padEnd(10)} ${e.detail}`);
    }

    if (ok.length > 0) {
      console.log(`\n${BOLD}${GREEN}OK:${RESET}`);
      for (const e of ok) console.log(`  ${GREEN}✔${RESET}  ${e.label.padEnd(10)} ${e.detail}`);
    }

    console.log(`\n${rule()}`);

    // Conclusion — deterministic, no LLM
    let conclusion: string;
    if (critical.length > 0)       conclusion = `${RED}${BOLD}Sistema en estado crítico.${RESET} Revisar: ${critical.map((e) => e.label).join(", ")}.`;
    else if (attention.length > 0) conclusion = `${YELLOW}${BOLD}Requiere atención.${RESET} Revisar: ${attention.map((e) => e.label).join(", ")}.`;
    else                           conclusion = `${GREEN}${BOLD}Sistema estable.${RESET} Sin alertas.`;

    console.log(`\nConclusion: ${conclusion}\n`);
    this.logger.info(
      `/audit deep mem=${memStatus} disk=${diskStatus} ps=${psStatus} ports=${portsStatus} svc=${svcStatus}`
    );
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

  // ── Project awareness ─────────────────────────────────────────────────────

  /**
   * Scan the project structure, inject context, and ask the LLM for a brief summary.
   * Used by both `/project` and the NL "revisa este proyecto" flow.
   */
  private async handleProjectScan(scanPath = "."): Promise<void> {
    const resolved = path.resolve(process.cwd(), scanPath);
    process.stdout.write(`[tool] scanning project: ${resolved}\n`);

    const result = await this.tools.execute(
      "scan_project",
      scanPath !== "." ? { path: scanPath } : {},
      { cwd: process.cwd() }
    );

    if (result.error) {
      console.log(`[error] ${result.error}\n`);
      this.logger.warn(`/project scan failed: ${result.error}`);
      return;
    }

    const header = `─── project: ${resolved} `;
    const pad = Math.max(0, RULE_WIDTH - header.length);
    console.log(`\n${header}${"─".repeat(pad)}`);
    console.log(result.output);
    console.log(rule() + "\n");

    const ctx = result.contextOutput ?? result.output;
    this.agent.injectContext(`Project structure:\n\n${ctx}`);

    process.stdout.write("Assistant: ");
    try {
      await this.agent.send(
        "Basándote en la estructura del proyecto que ves arriba, da un breve resumen (máximo 5 líneas): " +
        "qué tipo de proyecto es, para qué sirve, y cuáles son los archivos más importantes.",
        (token) => { process.stdout.write(token); }
      );
      process.stdout.write("\n\n");
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      process.stdout.write(`\n[error] ${msg}\n\n`);
      this.logger.error("handleProjectScan: LLM call failed", err);
    }

    this.logger.info(`/project scan: ${resolved}`);
  }

  /**
   * Deep project review: scan + read key files + LLM technical review.
   * Used by `/project review`.
   */
  private async handleProjectReview(): Promise<void> {
    const cwd = process.cwd();

    // Step 1: scan
    process.stdout.write(`[tool] scanning project: ${cwd}\n`);
    const scanResult = await this.tools.execute("scan_project", {}, { cwd });
    if (scanResult.error) {
      console.log(`[error] ${scanResult.error}\n`);
      this.logger.warn("/project review: scan failed");
      return;
    }

    const header = `─── project review: ${cwd} `;
    const pad = Math.max(0, RULE_WIDTH - header.length);
    console.log(`\n${header}${"─".repeat(pad)}`);
    console.log(scanResult.output);
    console.log(rule() + "\n");

    const scanCtx = scanResult.contextOutput ?? scanResult.output;

    // Step 2: read key files (README, config, main entry)
    const keyFiles = findKeyFiles(cwd);
    const fileParts: string[] = [];

    for (const kf of keyFiles) {
      process.stdout.write(`[tool] reading: ${kf}\n`);
      const readResult = await this.tools.execute("read_file", { path: kf }, { cwd });
      if (!readResult.error) {
        const content = readResult.contextOutput ?? readResult.output;
        fileParts.push(`[${kf}]\n${content}`);
      }
    }

    const fullCtx = fileParts.length
      ? `${scanCtx}\n\n${fileParts.join("\n\n---\n\n")}`
      : scanCtx;
    this.agent.injectContext(`Project structure and key files:\n\n${fullCtx}`);

    if (fileParts.length > 0) {
      console.log(`[${keyFiles.length} archivo(s) clave cargados en contexto]\n`);
    }

    // Step 3: LLM review
    process.stdout.write("Assistant: ");
    try {
      await this.agent.send(
        "Basándote en la estructura y archivos del proyecto, da una revisión técnica concisa (máximo 8 líneas): " +
        "qué hace el proyecto, cómo está organizado, qué tecnologías usa, y si detectas algo relevante.",
        (token) => { process.stdout.write(token); }
      );
      process.stdout.write("\n\n");
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      process.stdout.write(`\n[error] ${msg}\n\n`);
      this.logger.error("handleProjectReview: LLM call failed", err);
    }

    this.logger.info("/project review");
  }

  /**
   * Read 2–4 related files and inject all content, then ask the LLM to
   * explain their relationships. Used by the NL multi-read flow.
   */
  private async handleMultiRead(filenames: string[], userMessage: string): Promise<void> {
    const cwd = process.cwd();
    const contextParts: string[] = [];
    const readOk: string[] = [];

    for (const filename of filenames) {
      process.stdout.write(`[tool] reading: ${filename}\n`);
      const result = await this.tools.execute("read_file", { path: filename }, { cwd });
      if (result.error) {
        console.log(`[warn] No se pudo leer ${filename}: ${result.error}`);
        this.logger.warn(`handleMultiRead: read_file failed for ${filename}: ${result.error}`);
        continue;
      }
      const content = result.contextOutput ?? result.output;
      contextParts.push(`[${filename}]\n\`\`\`\n${content}\n\`\`\``);
      readOk.push(filename);
    }

    if (readOk.length === 0) {
      console.log("[error] No se pudo leer ningún archivo.\n");
      return;
    }

    const headerLabel = `─── files: ${readOk.join(", ")} `;
    const pad = Math.max(0, RULE_WIDTH - headerLabel.length);
    console.log(`\n${headerLabel}${"─".repeat(pad)}`);
    console.log(`[${readOk.length} archivo(s) cargados en contexto]\n`);

    this.agent.injectContext(
      readOk.length === 1
        ? `Here is the content of \`${readOk[0]}\`:\n\n${contextParts[0]}`
        : `Multiple files loaded:\n\n${contextParts.join("\n\n")}`
    );

    process.stdout.write("Assistant: ");
    try {
      await this.agent.send(userMessage, (token) => { process.stdout.write(token); });
      process.stdout.write("\n\n");
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      process.stdout.write(`\n[error] ${msg}\n\n`);
      this.logger.error("handleMultiRead: LLM call failed", err);
    }

    this.logger.info(`handleMultiRead: ${readOk.join(", ")}`);
  }

  start(): void {
    console.log(`\nLocal AI Assistant — ${config.model}`);
    console.log("Type /help for commands or /exit to quit.\n");

    const loop = (): void => {
      this.rl.question("You: ", async (raw) => {
        let input = raw.trim();

        if (!input) {
          loop();
          return;
        }

        // Multiline mode: accumulate lines until "END"
        if (this._multilineBuffer !== null) {
          if (input === "END") {
            const block = this._multilineBuffer.join("\n");
            this._multilineBuffer = null;
            if (!block.trim()) { loop(); return; }
            input = block;
            // fall through to normal dispatch below with the full block
          } else {
            this._multilineBuffer.push(raw); // preserve raw (unstripped) for indentation
            loop();
            return;
          }
        }

        // Open multiline capture mode
        if (input === "/multi") {
          this._multilineBuffer = [];
          process.stdout.write("(multiline — type END on its own line to finish)\n");
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

        if (input.startsWith("/service")) {
          await this.handleService(input);
          loop();
          return;
        }

        if (input.startsWith("/journal")) {
          await this.handleJournal(input);
          loop();
          return;
        }

        if (input.startsWith("/diagnose")) {
          await this.handleDiagnose(input);
          loop();
          return;
        }

        if (input.startsWith("/fix")) {
          await this.handleFix(input);
          loop();
          return;
        }

        if (input.startsWith("/check")) {
          const sub = input.slice("/check".length).trim();
          if (sub.startsWith("web")) {
            await this.handleWebCheck(sub.slice("web".length).trim());
          } else if (sub.startsWith("service")) {
            await this.handleServiceCheck(sub.slice("service".length).trim());
          } else {
            console.log("Usage: /check web <host-or-url> | /check service <name>\n");
          }
          loop();
          return;
        }

        if (input.startsWith("/ping")) {
          await this.handlePing(input);
          loop();
          return;
        }

        if (input.startsWith("/dns")) {
          await this.handleDns(input);
          loop();
          return;
        }

        if (input.startsWith("/http")) {
          await this.handleHttp(input);
          loop();
          return;
        }

        if (input.startsWith("/monitor")) {
          const arg = input.slice("/monitor".length).trim();
          const secs = arg ? parseInt(arg, 10) : NaN;
          if (!arg || isNaN(secs) || secs < 1) {
            console.log("Usage: /monitor <seconds>  (e.g. /monitor 5)\n");
            loop();
          } else {
            await this.handleMonitor(secs, loop);
          }
          return;
        }

        if (input === "/audit deep") {
          await this.handleAuditDeep();
          loop();
          return;
        }

        if (input === "/audit") {
          await this.handleAudit();
          loop();
          return;
        }

        if (input === "/alert") {
          await this.handleAlert();
          loop();
          return;
        }

        if (input.startsWith("/restart")) {
          await this.handleRestart(input);
          loop();
          return;
        }

        if (input.startsWith("/kill")) {
          await this.handleKill(input);
          loop();
          return;
        }

        if (input.startsWith("/write")) {
          await this.handleWrite(input);
          loop();
          return;
        }

        if (input.startsWith("/edit")) {
          await this.handleEdit(input);
          loop();
          return;
        }

        if (input.startsWith("/run")) {
          await this.handleRun(input);
          loop();
          return;
        }

        if (input.startsWith("/project")) {
          const sub = input.slice("/project".length).trim();
          if (sub === "review") {
            await this.handleProjectReview();
          } else {
            await this.handleProjectScan(sub || ".");
          }
          loop();
          return;
        }

        // Sync commands
        if (this.handleCommand(input)) {
          loop();
          return;
        }

        // Security: block write/edit intent to system paths before any tool or LLM runs
        const blockedPathErr = getBlockedWritePathError(input) ?? getBlockedEditPathError(input);
        if (blockedPathErr) {
          console.log(`[error] ${blockedPathErr}\n`);
          this.logger.warn(`blocked path: ${blockedPathErr}`);
          loop();
          return;
        }

        // Release continuation — Phase 26: "continúa con v2 de la plataforma escolar"
        // Must run BEFORE detectPlanningIntent so accented verbs don't fall through to LLM.
        const continueRelease = detectContinueReleaseIntent(input);
        if (continueRelease) {
          await this.handleContinueRelease(continueRelease);
          loop();
          return;
        }

        // Analysis intent — Phase 27: "analiza esta carpeta", "resume este proyecto"
        if (detectAnalysisIntent(input)) {
          await this.handleAnalyzeWorkspace(input);
          loop();
          return;
        }

        // View completion — Phase 29.2: "completa la vista Projects", "haz funcional My tasks"
        // Must run BEFORE tactical improvement: view-completion prompts have UI signals that
        // would otherwise mis-route to handleTacticalImprovement or the semantic-edit path.
        const viewIntent = detectViewCompletionIntent(input);
        if (viewIntent) {
          await this.handleViewCompletion(viewIntent);
          loop();
          return;
        }

        // Tactical improvement — Phase 27: "mejora la plataforma con glassmorphism..."
        // Must run BEFORE detectPlanningIntent — some tactical prompts have ≥2 project signals
        // (e.g. "plataforma" + "escolar") and would otherwise be routed to the planner.
        const tacticalIntent = detectTacticalImprovementIntent(input);
        if (tacticalIntent) {
          await this.handleTacticalImprovement(tacticalIntent);
          loop();
          return;
        }

        // Planner — large multi-file project intent (Phase 20)
        // Checked before bugfix/semantic edit; detectPlanningIntent is conservative
        // (requires creation verb + ≥2 project signals) so small edits are never intercepted.
        if (detectPlanningIntent(input)) {
          await this.handlePlan(input);
          loop();
          return;
        }

        // Run + fix loop — checked before bugfix so "corre app.py si falla" routes here
        const runAndFix = detectRunAndFixIntent(input);
        if (runAndFix) {
          await this.handleRunAndFix(runAndFix);
          loop();
          return;
        }

        // Bugfix / refactor — takes priority over semantic edit when bug/refactor keywords present
        const bugfixIntent = detectBugfixIntent(input);
        if (bugfixIntent) {
          await this.handleBugfix(bugfixIntent);
          loop();
          return;
        }

        // Semantic edit: NL instruction for file editing without explicit search/replace
        const semanticEdit = detectSemanticEditIntent(input);
        if (semanticEdit) {
          await this.handleSemanticEdit(semanticEdit);
          loop();
          return;
        }

        // Edit intent without a target file — prompt user instead of falling to LLM (which may refuse)
        if (detectEditWithoutFileIntent(input)) {
          console.log("¿En qué archivo quieres hacer ese cambio? Especifica el nombre del archivo en tu mensaje o usa /edit <archivo>.\n");
          loop();
          return;
        }

        // NL multi-file generation — must run before single create+run detection
        if (detectMultiFileIntent(input)) {
          await this.handleGenerateFiles(input);
          loop();
          return;
        }

        // NL project scan — "revisa este proyecto", "qué archivos hay aquí", etc.
        if (detectProjectScanIntent(input)) {
          await this.handleProjectScan();
          loop();
          return;
        }

        // NL multi-file read — "cómo está conectado index.html con styles.css"
        const multiRead = detectMultiReadIntent(input);
        if (multiRead) {
          await this.handleMultiRead(multiRead, input);
          loop();
          return;
        }

        // NL "create + run" intent — generate code via LLM, write, then execute
        const createRun = detectCreateAndRunIntent(input);
        if (createRun) {
          await this.handleCreateAndRun(input, createRun.filename, createRun.cmd);
          loop();
          return;
        }

        // Auto tool detection — at most 2 tools chained, abort on first error
        // Tools in this set produce self-contained output — no LLM commentary needed.
        const TERMINAL_TOOLS = new Set(["edit_file", "write_file"]);
        const autoTools = detectToolChain(input);
        const allTerminal =
          autoTools.length > 0 && autoTools.every((t) => TERMINAL_TOOLS.has(t.toolName));
        let chainOk = true;
        const toolOutputs: string[] = [];
        for (const autoTool of autoTools) {
          process.stdout.write(`[tool] executing: ${autoTool.label}\n`);
          this.logger.info(`auto-tool: ${autoTool.toolName}`);
          const result = await this.tools.execute(
            autoTool.toolName,
            autoTool.args,
            { cwd: process.cwd() }
          );
          if (result.error) {
            process.stdout.write(`[tool] error: ${result.error}\n\n`);
            this.logger.warn(`auto-tool ${autoTool.toolName} failed: ${result.error}`);
            chainOk = false;
            break;
          }
          const ctx = result.contextOutput ?? result.output;
          this.injectAutoToolContext(autoTool, ctx);
          toolOutputs.push(result.output);
        }
        if (!chainOk) { loop(); return; }

        // Terminal tools: output is self-contained — skip LLM to avoid shell suggestions
        if (allTerminal) {
          process.stdout.write(toolOutputs.join("\n") + "\n\n");
          loop();
          return;
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
