export type StructuralStatus = "missing" | "present" | "partial" | "insufficient";

export interface StructuralRequirement {
  key: string;
  description: string;
  selectors?: string[];
  ids?: string[];
  classes?: string[];
  requiredText?: string[];
  requiredAttributes?: Array<{ attr: string; value?: string }>;
  wiring?: string[];
}

export interface StructuralFinding {
  key: string;
  status: StructuralStatus;
  evidence: string[];
  reason: string;
}

export interface StructuralAssessment {
  overall: "satisfied" | "partial" | "insufficient";
  findings: StructuralFinding[];
}

export interface WebStructuralInputs {
  instruction: string;
  html: string;
  css?: string;
  js?: string;
}

interface RebuildIntentSignals {
  wantsSidebar: boolean;
  wantsTopbar: boolean;
  wantsOverview: boolean;
  wantsViewContainer: boolean;
  wantsViewNavigation: boolean;
  wantsSaasShell: boolean;
  wantsDataViewContract: boolean;
  wantsNavigateToWiring: boolean;
}

function unique(values: string[]): string[] {
  return [...new Set(values.filter(Boolean))];
}

function escapeRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function hasId(html: string, id: string): boolean {
  return new RegExp(`id=["']${escapeRegExp(id)}["']`, "i").test(html);
}

function hasClass(html: string, className: string): boolean {
  const re = new RegExp(`class=["'][^"']*\\b${escapeRegExp(className)}\\b[^"']*["']`, "i");
  return re.test(html);
}

function hasDataAttr(html: string, attr: string, value?: string): boolean {
  if (value) {
    const re = new RegExp(`${escapeRegExp(attr)}=["']${escapeRegExp(value)}["']`, "i");
    return re.test(html);
  }
  const re = new RegExp(`${escapeRegExp(attr)}=["'][^"']+["']`, "i");
  return re.test(html);
}

function hasTag(html: string, tag: string): boolean {
  return new RegExp(`<${escapeRegExp(tag)}\\b`, "i").test(html);
}

function hasSelectorLike(html: string, selector: string): boolean {
  const lower = selector.toLowerCase().trim();
  if (!lower) return false;

  if (lower.startsWith("#")) return hasId(html, lower.slice(1));
  if (lower.startsWith(".")) return hasClass(html, lower.slice(1));
  if (/^[a-z][a-z0-9-]*$/i.test(lower)) return hasTag(html, lower);

  const attrMatch = lower.match(/^\[([a-z0-9-:]+)(?:=["']?([^"'\]]+)["']?)?\]$/i);
  if (attrMatch?.[1]) {
    const attr = attrMatch[1];
    const value = attrMatch[2];
    return hasDataAttr(html, attr, value);
  }

  // Support common forms like [data-view] and [data-view="overview"] embedded in larger strings.
  const genericAttr = lower.match(/\[([a-z0-9-:]+)(?:=["']?([^"'\]]+)["']?)?\]/i);
  if (genericAttr?.[1]) {
    return hasDataAttr(html, genericAttr[1], genericAttr[2]);
  }

  return html.toLowerCase().includes(lower);
}

function findWiringEvidence(html: string, js: string, token: string): string[] {
  const evidence: string[] = [];
  const lowerToken = token.toLowerCase();

  if (lowerToken === "data-view") {
    if (hasDataAttr(html, "data-view")) evidence.push('html:data-view');
    if (js.toLowerCase().includes("data-view")) evidence.push('js:data-view');
    return evidence;
  }

  if (lowerToken === "navigateTo".toLowerCase()) {
    if (js.includes("navigateTo")) evidence.push("js:navigateTo");
    if (html.includes("navigateTo(")) evidence.push("html:navigateTo()");
    return evidence;
  }

  if (lowerToken === "view-section") {
    if (hasClass(html, "view-section")) evidence.push("html:.view-section");
    if ((js + html).includes("view-section")) evidence.push("js/html:view-section");
    return evidence;
  }

  if ((html + "\n" + js).toLowerCase().includes(lowerToken)) {
    evidence.push(`raw:${token}`);
  }
  return evidence;
}

function detectRebuildIntentSignals(instruction: string): RebuildIntentSignals {
  const lower = instruction.toLowerCase();

  const wantsSidebar = /\bsidebar\b|barra lateral|panel lateral/.test(lower);
  const wantsTopbar = /\btopbar\b|\bnavbar\b|barra superior|header/.test(lower);
  const wantsOverview = /\boverview\b|resumen general|dashboard|panel principal/.test(lower);
  const wantsViewContainer =
    /\bview container\b|contenedor de vistas|contenedor principal|main content|main-content|view-section|layout/.test(lower);
  const wantsViewNavigation =
    /navegaci[oó]n por vistas|navegaci[oó]n entre vistas|view routing|routing|navigate between views|switch views/.test(lower);
  const wantsSaasShell =
    /\bsaas\b|shell saas|dashboard saas|app shell|layout saas|shell de plataforma/.test(lower);
  const wantsDataViewContract =
    /data-view|contrato data-view|atributo data-view/.test(lower);
  const wantsNavigateToWiring =
    /navigateto|navigate to|wiring de navegaci[oó]n|funci[oó]n navigate|navegaci[oó]n real/.test(lower);

  return {
    wantsSidebar: wantsSidebar || wantsSaasShell,
    wantsTopbar: wantsTopbar || wantsSaasShell,
    wantsOverview,
    wantsViewContainer: wantsViewContainer || wantsSaasShell || wantsViewNavigation,
    wantsViewNavigation: wantsViewNavigation || wantsSaasShell || wantsDataViewContract || wantsNavigateToWiring,
    wantsSaasShell,
    wantsDataViewContract: wantsDataViewContract || wantsViewNavigation || wantsSaasShell,
    wantsNavigateToWiring: wantsNavigateToWiring || wantsViewNavigation || wantsSaasShell,
  };
}

function deriveWebStructuralRequirements(instruction: string): StructuralRequirement[] {
  const requirements: StructuralRequirement[] = [];
  const signals = detectRebuildIntentSignals(instruction);

  if (signals.wantsSaasShell) {
    requirements.push({
      key: "saas-shell",
      description: "SaaS shell with persistent navigation and main content area",
      selectors: ["main", "#main-content", ".app-shell", ".dashboard-shell", ".layout-shell"],
      ids: ["main-content"],
      classes: ["app-shell", "dashboard-shell", "sidebar", "topbar", "view-section"],
      requiredAttributes: [{ attr: "data-view" }],
      wiring: ["data-view", "navigateTo", "view-section"],
    });
  }

  if (signals.wantsSidebar) {
    requirements.push({
      key: "sidebar",
      description: "Sidebar or lateral navigation shell",
      selectors: ["aside", ".sidebar", ".sidebar-nav", ".sidebar-shell", ".sidebar-nav-item"],
      ids: ["sidebar"],
      classes: ["sidebar", "sidebar-nav", "sidebar-shell", "sidebar-nav-item"],
      requiredAttributes: [{ attr: "data-view" }],
      wiring: ["data-view"],
    });
  }

  if (signals.wantsTopbar) {
    requirements.push({
      key: "topbar",
      description: "Topbar or header container",
      selectors: ["header", ".topbar", ".navbar", ".top-bar", "nav"],
      ids: ["topbar"],
      classes: ["topbar", "navbar", "top-bar"],
    });
  }

  if (signals.wantsOverview) {
    requirements.push({
      key: "overview",
      description: "Overview/dashboard primary section",
      selectors: ["#view-overview", ".view-overview", "[data-view=\"overview\"]", "main", ".dashboard-main"],
      ids: ["view-overview", "overview"],
      classes: ["view-section", "dashboard-main"],
      requiredText: ["overview", "dashboard"],
      requiredAttributes: [{ attr: "data-view", value: "overview" }],
    });
  }

  if (signals.wantsViewContainer) {
    requirements.push({
      key: "view-container",
      description: "Container for switchable views",
      selectors: ["#main-content", ".view-section", "[data-view]", "main"],
      ids: ["main-content"],
      classes: ["view-section"],
      requiredAttributes: [{ attr: "data-view" }],
      wiring: ["view-section"],
    });
  }

  if (signals.wantsDataViewContract) {
    requirements.push({
      key: "data-view-contract",
      description: "Stable data-view contract between navigation and view sections",
      selectors: ["[data-view]", "[data-view=\"overview\"]"],
      requiredAttributes: [{ attr: "data-view" }],
      wiring: ["data-view", "view-section"],
    });
  }

  if (signals.wantsViewNavigation) {
    requirements.push({
      key: "view-navigation",
      description: "View navigation contract with data-view and navigateTo",
      selectors: ["[data-view]"],
      requiredAttributes: [{ attr: "data-view" }],
      wiring: ["data-view", "navigateTo"],
    });
  }

  if (signals.wantsNavigateToWiring) {
    requirements.push({
      key: "navigate-to-wiring",
      description: "navigateTo wiring for interactive view switching",
      selectors: ["[data-view]"],
      wiring: ["navigateTo", "data-view", "view-section"],
    });
  }

  return unique(requirements.map((r) => r.key)).map((key) =>
    requirements.find((r) => r.key === key)!
  );
}

function assessRequirement(req: StructuralRequirement, html: string, css: string, js: string): StructuralFinding {
  const evidence: string[] = [];

  for (const id of req.ids ?? []) {
    if (hasId(html, id)) evidence.push(`id:${id}`);
  }

  for (const className of req.classes ?? []) {
    if (hasClass(html, className)) evidence.push(`class:${className}`);
    if (css.toLowerCase().includes(`.${className.toLowerCase()}`)) evidence.push(`css:.${className}`);
  }

  for (const selector of req.selectors ?? []) {
    if (hasSelectorLike(html, selector)) evidence.push(`selector:${selector}`);
  }

  for (const text of req.requiredText ?? []) {
    if (html.toLowerCase().includes(text.toLowerCase())) evidence.push(`text:${text}`);
  }

  for (const attr of req.requiredAttributes ?? []) {
    if (hasDataAttr(html, attr.attr, attr.value)) {
      evidence.push(attr.value ? `attr:${attr.attr}=${attr.value}` : `attr:${attr.attr}`);
    }
  }

  for (const token of req.wiring ?? []) {
    evidence.push(...findWiringEvidence(html, js, token));
  }

  const uniqEvidence = unique(evidence);

  // Conservative scoring:
  // - 0 evidence => insufficient
  // - 1 evidence => partial
  // - 2+ evidence => present
  // If only raw text evidence exists for a structural concept, downgrade to insufficient.
  const onlyWeakText = uniqEvidence.length > 0 && uniqEvidence.every((e) => e.startsWith("text:") || e.startsWith("raw:"));

  let status: StructuralStatus;
  if (uniqEvidence.length === 0) {
    status = "insufficient";
  } else if (onlyWeakText) {
    status = "insufficient";
  } else if (uniqEvidence.length === 1) {
    status = "partial";
  } else {
    status = "present";
  }

  const reason =
    status === "present"
      ? "La evidencia estructural mínima está presente."
      : status === "partial"
      ? "Hay señales parciales, pero el contrato estructural aún es débil."
      : "No hay evidencia suficiente para considerar cumplido el requisito.";

  return {
    key: req.key,
    status,
    evidence: uniqEvidence,
    reason,
  };
}

export function assessWebStructuralRequirements(input: WebStructuralInputs): StructuralAssessment {
  const html = input.html ?? "";
  const css = input.css ?? "";
  const js = input.js ?? "";
  const requirements = deriveWebStructuralRequirements(input.instruction);

  if (requirements.length === 0) {
    return {
      overall: "partial",
      findings: [],
    };
  }

  const findings = requirements.map((req) => assessRequirement(req, html, css, js));

  const hasInsufficient = findings.some((f) => f.status === "insufficient");
  const allPresent = findings.every((f) => f.status === "present");

  const overall = allPresent
    ? "satisfied"
    : hasInsufficient
    ? "insufficient"
    : "partial";

  return { overall, findings };
}

export function isLikelyWebStructuralInstruction(instruction: string): boolean {
  const lower = instruction.toLowerCase();
  const structuralVerbs =
    /rebuild|reconstruye|rehaz|reestructura|rediseña|redisen[aá]|reorganiza|shell|layout/.test(lower);
  const webSignals =
    /\bsidebar\b|\btopbar\b|\bnavbar\b|dashboard|overview|view|views|vista|vistas|navegaci[oó]n|data-view/.test(lower);
  return structuralVerbs && webSignals;
}

export function deriveInitialWebRequirements(instruction: string): StructuralRequirement[] {
  return deriveWebStructuralRequirements(instruction);
}
