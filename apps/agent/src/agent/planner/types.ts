export interface PlanStep {
  id: number;
  title: string;
  type: "create" | "edit" | "semantic" | "run" | "analyze";
  targetFiles: string[];
  prompt: string;
  dependencies?: number[];
  version?: string;
}

export interface Release {
  version: string;
  goals: string[];
}

/**
 * Deep design plan produced before web content generation.
 * Populated by detectWebProductShape/detectUIComponents/detectFeatureModules.
 */
export interface WebDesign {
  /** High-level app category: "tasks" | "crm" | "analytics" | "saas" | "generic" */
  appType: string;
  /** Human-readable product name inferred from the prompt */
  productName: string;
  /** Layout pattern: "sidebar-main" | "topbar-main" | "centered" */
  layout: string;
  /** UI component list: ["sidebar","search","table","metrics","cards","glassmorphism","glow","animations"…] */
  components: string[];
  /** Functional module list e.g. ["tasks","projects","priorities","filters"] */
  modules: string[];
  /** Views/pages to render e.g. ["overview","tasks","projects"] */
  views: string[];
}

export interface ExecutionPlan {
  objective: string;
  stack: string[];
  steps: PlanStep[];
  testStrategy?: string[];
  releases?: Release[];
  /** Detected project domain: "school" | "sales" | undefined (generic) */
  domain?: string;
  /** Detected style hints e.g. ["futuristic"] */
  style?: string[];
  /** Deep design plan for web projects */
  design?: WebDesign;
}

export type WorkspaceMode = "managed" | "direct";

export interface ProjectWorkspaceState {
  mode: WorkspaceMode;
  root: string;
  projectPath: string;
  slug: string;
}

export interface ProjectMetadataState {
  title: string;
  objective: string;
  stack: string[];
  domain?: string;
  style: string[];
}

export interface ProjectReleasesState {
  current: string;
  planned: Release[];
  completedPhases: string[];
}

export interface ProjectEvolutionState {
  appliedFeatures: string[];
  installedViews: string[];
  cohesionApplied: boolean;
  shellInstalled: boolean;
}

export interface ProjectPreviewState {
  command: string;
  url: string;
}

export interface ProjectTimestampsState {
  createdAt: string;
  updatedAt: string;
  backfilledAt?: string;
}

export interface ProjectState {
  schemaVersion: number;
  axisVersion: string;
  workspace: ProjectWorkspaceState;
  project: ProjectMetadataState;
  design?: WebDesign;
  releases: ProjectReleasesState;
  productEvolution: ProjectEvolutionState;
  preview: ProjectPreviewState;
  timestamps: ProjectTimestampsState;
}
