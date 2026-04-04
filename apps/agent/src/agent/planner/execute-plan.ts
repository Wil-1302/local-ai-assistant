/**
 * executePlan — sequential plan runner.
 *
 * Phase 21: passes ToolContext to executePlanStep so real tools can write files.
 */

import type { ExecutionPlan } from "./types.ts";
import type { ToolContext } from "../../tools/types.js";
import { executePlanStep } from "./step-executor.ts";

interface StepResult {
  id: number;
  title: string;
  success: boolean;
  message: string;
}

interface PlanResult {
  success: boolean;
  steps: StepResult[];
}

export async function executePlan(plan: ExecutionPlan, ctx: ToolContext): Promise<PlanResult> {
  const steps: StepResult[] = [];

  for (const step of plan.steps) {
    const result = await executePlanStep(step, ctx, plan.stack, plan.domain, plan.releases, plan.design);
    steps.push({
      id: step.id,
      title: step.title,
      success: result.success,
      message: result.message,
    });
  }

  const success = steps.every((s) => s.success);
  return { success, steps };
}
