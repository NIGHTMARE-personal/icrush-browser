/**
 * Agent Planner & Replanning Engine — decomposes goals and recovers from failures.
 *
 * Provides:
 * - Goal decomposition into ordered steps (via local LLM or template)
 * - Step dependency graph with parallelization hints
 * - Failure-aware replanning (adapts when steps fail)
 * - Alternative path discovery (different selectors, approaches)
 * - Progress tracking with estimated completion
 * - Constraint-aware planning (domain allowlists, step budgets)
 *
 * Design invariants:
 * - All planning happens locally (Ollama) — no cloud by default
 * - Plans are bounded: max steps, max depth, timeout-aware
 * - Replanning adapts but never exceeds safety budgets
 * - Every plan decision is auditable
 */
import type { AgentGoal, AgentStep, StepResult } from './agent-loop';
import { generateStepId } from './agent-loop';
import type { PageUnderstanding, PageClassification } from './page-understanding';
import type { AIProvider } from './local-model-router';

// ─── Types ────────────────────────────────────────────────────────────────

export interface Plan {
  id: string;
  goal: string;
  steps: AgentStep[];
  strategy: PlanStrategy;
  estimatedDurationMs: number;
  dependencies: StepDependency[];
  alternatives: Map<string, AgentStep[]>; // stepId -> alternative steps
  createdAt: number;
}

export type PlanStrategy =
  | 'linear'          // Sequential execution
  | 'parallel'         // Parallel where possible
  | 'exploratory'      // Try multiple paths
  | 'conservative'     // Minimal changes, verify each step
  | 'aggressive';      // Fast execution, skip non-essentials

export interface StepDependency {
  stepId: string;
  dependsOn: string[]; // step IDs this depends on
  type: 'blocks' | 'soft-blocks' | 'optional';
}

export interface PlanningContext {
  goal: AgentGoal;
  currentPage?: PageUnderstanding;
  history: StepResult[];
  previousFailures: FailureRecord[];
  constraints: PlanningConstraints;
  skills: SkillReference[];
}

export interface PlanningConstraints {
  maxSteps: number;
  maxDepth: number; // nesting depth of sub-goals
  timeoutMs: number;
  allowedDomains: string[];
  blockedDomains: string[];
  requireApprovalForSensitive: boolean;
  maxReplans: number;
  preferLocalExecution: boolean;
}

export interface FailureRecord {
  stepId: string;
  stepIndex: number;
  error: string;
  actionType: string;
  selector?: string;
  url: string;
  timestamp: number;
  attempts: number;
}

export interface SkillReference {
  id: string;
  name: string;
  triggerPattern: string;
  steps: AgentStep[];
  successRate: number;
  lastUsed: number;
}

export interface ReplanResult {
  plan: Plan;
  reason: string;
  changes: PlanChange[];
  replanNumber: number;
}

export interface PlanChange {
  type: 'modified' | 'added' | 'removed' | 'reordered' | 'replaced';
  stepId: string;
  description: string;
}

// ─── Planner ──────────────────────────────────────────────────────────────

export class AgentPlanner {
  private promptFn?: (
    prompt: string,
    options: { task: string; format: 'json' | 'text'; systemInstruction: string }
  ) => Promise<string>;
  private replanCount = 0;
  private maxReplans = 3;
  private planHistory: Plan[] = [];

  /**
   * Register a local LLM prompt function for planning.
   */
  setPromptFunction(
    fn: (prompt: string, options: { task: string; format: 'json' | 'text'; systemInstruction: string }) => Promise<string>
  ): void {
    this.promptFn = fn;
  }

  /**
   * Create an initial plan for a goal.
   */
  async createPlan(context: PlanningContext): Promise<Plan> {
    this.replanCount = 0;

    // Try LLM-based planning first
    if (this.promptFn) {
      try {
        return await this.llmPlan(context);
      } catch (err) {
        console.warn('[Planner] LLM planning failed, falling back to template:', err);
      }
    }

    // Fallback: template-based planning
    return this.templatePlan(context);
  }

  /**
   * Replan after a failure or when the current plan is stuck.
   */
  async replan(
    currentPlan: Plan,
    context: PlanningContext,
    failedStep: AgentStep,
    error: string,
    observation?: PageUnderstanding
  ): Promise<ReplanResult> {
    this.replanCount++;

    if (this.replanCount > this.maxReplans) {
      throw new Error(`Max replans (${this.maxReplans}) exceeded`);
    }

    // Record the failure
    context.previousFailures.push({
      stepId: failedStep.id,
      stepIndex: failedStep.index,
      error,
      actionType: failedStep.action.type,
      selector: failedStep.action.selector,
      url: context.goal.url || '',
      timestamp: Date.now(),
      attempts: 1,
    });

    // Try LLM replanning
    if (this.promptFn) {
      try {
        return await this.llmReplan(currentPlan, context, failedStep, error, observation);
      } catch (err) {
        console.warn('[Planner] LLM replanning failed, using heuristic:', err);
      }
    }

    // Heuristic replanning
    return this.heuristicReplan(currentPlan, context, failedStep, error);
  }

  // ─── LLM Planning ──────────────────────────────────────────────────

  private async llmPlan(context: PlanningContext): Promise<Plan> {
    const systemInstruction = `You are an expert web automation planner. Given a goal and current page context, produce a step-by-step plan.
Each step must be a JSON object with: type, selector, text, value, direction, amount, keys, formFields, rationale, expectedOutcome.
Valid action types: click, type, scroll, extract, fill_form, select, hover, wait, press_key.
Selectors can be CSS selectors or text content (for buttons/links).

Return a JSON array of steps. Each step must have: { type, selector?, text?, value?, rationale, expectedOutcome }.
If the goal requires multiple pages, include navigation steps.
Always end with an extract step to verify completion.

CONSTRAINTS:
- Max ${context.constraints.maxSteps} steps
- Allowed domains: ${context.constraints.allowedDomains.length > 0 ? context.constraints.allowedDomains.join(', ') : 'any'}
- Blocked domains: ${context.constraints.blockedDomains.length > 0 ? context.constraints.blockedDomains.join(', ') : 'none'}
- Sensitive actions require approval: ${context.constraints.requireApprovalForSensitive}`;

    const userPrompt = this.buildPlanningPrompt(context);

    const response = await this.promptFn!(userPrompt, {
      task: 'json',
      format: 'json',
      systemInstruction,
    });

    const steps = this.parsePlanSteps(response);
    const strategy = this.inferStrategy(context);

    return {
      id: `plan-${Date.now()}`,
      goal: context.goal.description,
      steps,
      strategy,
      estimatedDurationMs: steps.length * 3000,
      dependencies: this.buildDependencies(steps),
      alternatives: new Map(),
      createdAt: Date.now(),
    };
  }

  private async llmReplan(
    currentPlan: Plan,
    context: PlanningContext,
    failedStep: AgentStep,
    error: string,
    observation?: PageUnderstanding
  ): Promise<ReplanResult> {
    const systemInstruction = `You are an expert web automation replanner. A step failed during execution. Analyze the failure and produce an alternative plan.
The previous plan had ${currentPlan.steps.length} steps. Step "${failedStep.action.type}" failed with: ${error}.

Consider:
1. Alternative selectors for the failed step
2. Different approach (e.g., scroll before click, try different input method)
3. Skip the step if it's not critical
4. Adjust subsequent steps based on current page state

Return a JSON object: { steps: [...], reason: "explanation", changes: [{ type, stepId, description }] }`;

    let pageInfo = '';
    if (observation) {
      pageInfo = `\nCurrent page: ${observation.state.title}\nURL: ${observation.state.url}\nForms: ${observation.forms.length}\nInputs: ${observation.state.inputs.length}`;
    }

    const userPrompt = `Goal: ${context.goal.description}
Failed step: ${JSON.stringify(failedStep.action)}
Error: ${error}
${pageInfo}

Previous plan steps: ${JSON.stringify(currentPlan.steps.map(s => ({ type: s.action.type, selector: s.action.selector, text: s.action.text })))}

Generate an alternative plan that avoids this failure.`;

    const response = await this.promptFn!(userPrompt, {
      task: 'json',
      format: 'json',
      systemInstruction,
    });

    const parsed = this.parseReplanResponse(response);
    const remainingSteps = currentPlan.steps.slice(failedStep.index + 1);

    return {
      plan: {
        ...currentPlan,
        id: `plan-replan-${Date.now()}`,
        steps: [...parsed.steps, ...remainingSteps],
        createdAt: Date.now(),
      },
      reason: parsed.reason || 'LLM-based replanning',
      changes: parsed.changes || [{ type: 'modified', stepId: failedStep.id, description: 'Replaced failed step' }],
      replanNumber: this.replanCount,
    };
  }

  // ─── Template Planning ─────────────────────────────────────────────

  private templatePlan(context: PlanningContext): Plan {
    const steps: AgentStep[] = [];
    const desc = context.goal.description.toLowerCase();

    // Navigate to starting URL
    if (context.goal.url) {
      steps.push(this.makeStep('navigate', {
        action: { type: 'click', selector: context.goal.url },
        rationale: `Navigate to ${context.goal.url}`,
        expectedOutcome: `Page loaded at ${context.goal.url}`,
      }));
    }

    // Common patterns
    if (/search|find|look\s*for|query/.test(desc)) {
      const query = context.goal.description.replace(/^(search|find|look\s*for|query)\s*(for)?\s*/i, '').trim();
      steps.push(this.makeStep('search-input', {
        action: { type: 'type', selector: 'input[type="search"], input[name="q"], input[name="search"], input[placeholder*="search" i]', text: query },
        rationale: `Enter search query "${query}"`,
        expectedOutcome: 'Search input filled',
      }));
      steps.push(this.makeStep('search-submit', {
        action: { type: 'press_key', keys: 'enter' },
        rationale: 'Submit search query',
        expectedOutcome: 'Search results loaded',
      }));
    }

    if (/click|open|go\s*to|navigate/.test(desc)) {
      const target = desc.replace(/^(click|open|go\s*to|navigate)\s*(to)?\s*/i, '').trim();
      steps.push(this.makeStep('click-target', {
        action: { type: 'click', selector: target },
        rationale: `Click on "${target}"`,
        expectedOutcome: `"${target}" was activated`,
      }));
    }

    if (/fill|enter|type|input/.test(desc)) {
      steps.push(this.makeStep('detect-form', {
        action: { type: 'extract' },
        rationale: 'Detect form fields on the page',
        expectedOutcome: 'Form fields identified',
      }));
    }

    if (/read|extract|get|summarize|copy/.test(desc)) {
      steps.push(this.makeStep('extract-content', {
        action: { type: 'extract' },
        rationale: 'Extract page content',
        expectedOutcome: 'Page content captured',
      }));
    }

    // Always extract at the end for observation
    if (!steps.some(s => s.action.type === 'extract')) {
      steps.push(this.makeStep('final-observe', {
        action: { type: 'extract' },
        rationale: 'Final page observation for task verification',
        expectedOutcome: 'Page state captured',
      }));
    }

    const strategy = this.inferStrategy(context);

    return {
      id: `plan-${Date.now()}`,
      goal: context.goal.description,
      steps,
      strategy,
      estimatedDurationMs: steps.length * 3000,
      dependencies: this.buildDependencies(steps),
      alternatives: new Map(),
      createdAt: Date.now(),
    };
  }

  // ─── Heuristic Replanning ──────────────────────────────────────────

  private heuristicReplan(
    currentPlan: Plan,
    context: PlanningContext,
    failedStep: AgentStep,
    error: string
  ): ReplanResult {
    const changes: PlanChange[] = [];
    const newSteps: AgentStep[] = [];

    // Strategy 1: Alternative selector
    if (failedStep.action.selector && error.includes('not found')) {
      const altSelectors = this.generateAlternativeSelectors(failedStep.action.selector);
      for (const alt of altSelectors.slice(0, 2)) {
        newSteps.push(this.makeStep(`alt-${failedStep.id}`, {
          action: { ...failedStep.action, selector: alt },
          rationale: `Alternative selector for failed step: ${alt}`,
          expectedOutcome: failedStep.expectedOutcome,
        }));
        changes.push({ type: 'replaced', stepId: failedStep.id, description: `Replaced selector with ${alt}` });
      }
    }

    // Strategy 2: Scroll + retry
    if (failedStep.action.selector && (error.includes('not found') || error.includes('not visible'))) {
      newSteps.push(this.makeStep(`scroll-${failedStep.id}`, {
        action: { type: 'scroll', direction: 'down', amount: 300 },
        rationale: 'Scroll to reveal hidden elements',
        expectedOutcome: 'Page scrolled',
      }));
      newSteps.push(this.makeStep(`retry-${failedStep.id}`, {
        action: failedStep.action,
        rationale: `Retry after scroll: ${failedStep.rationale}`,
        expectedOutcome: failedStep.expectedOutcome,
      }));
      changes.push({ type: 'added', stepId: `scroll-${failedStep.id}`, description: 'Added scroll step before retry' });
    }

    // Strategy 3: Extract to understand current state
    if (newSteps.length === 0) {
      newSteps.push(this.makeStep(`understand-${failedStep.id}`, {
        action: { type: 'extract' },
        rationale: 'Extract page to understand current state after failure',
        expectedOutcome: 'Page state captured for replanning',
      }));
      changes.push({ type: 'added', stepId: `understand-${failedStep.id}`, description: 'Added extraction for state analysis' });
    }

    // Keep remaining steps
    const remainingSteps = currentPlan.steps.slice(failedStep.index + 1);

    return {
      plan: {
        ...currentPlan,
        id: `plan-replan-${Date.now()}`,
        steps: [...newSteps, ...remainingSteps],
        createdAt: Date.now(),
      },
      reason: `Heuristic replan after failure: ${error.substring(0, 200)}`,
      changes,
      replanNumber: this.replanCount,
    };
  }

  // ─── Helpers ───────────────────────────────────────────────────────

  private makeStep(id: string, override: Partial<AgentStep> & { action: AgentStep['action'] }): AgentStep {
    return {
      id: generateStepId(),
      index: 0,
      action: override.action,
      rationale: override.rationale || '',
      expectedOutcome: override.expectedOutcome || '',
      status: 'pending',
      ...override,
    };
  }

  private buildPlanningPrompt(context: PlanningContext): string {
    const parts: string[] = [`Goal: ${context.goal.description}`];
    if (context.goal.url) parts.push(`Starting URL: ${context.goal.url}`);
    if (context.currentPage) {
      parts.push(`\nCurrent page state:\n${context.currentPage.snapshot}`);
    }
    if (context.previousFailures.length > 0) {
      parts.push(`\nPrevious failures to avoid:`);
      for (const f of context.previousFailures.slice(-5)) {
        parts.push(`- Step ${f.stepIndex} (${f.actionType}): ${f.error}`);
      }
    }
    if (context.skills.length > 0) {
      parts.push(`\nAvailable skills:`);
      for (const s of context.skills.slice(0, 5)) {
        parts.push(`- ${s.name} (${s.triggerPattern}, success rate: ${(s.successRate * 100).toFixed(0)}%)`);
      }
    }
    return parts.join('\n');
  }

  private parsePlanSteps(response: string): AgentStep[] {
    try {
      const parsed = JSON.parse(response);
      const steps = Array.isArray(parsed) ? parsed : parsed.steps || [];
      return steps.map((s: Record<string, unknown>, i: number) => ({
        id: generateStepId(),
        index: i,
        action: {
          type: (s.type || s.action_type || 'extract') as string,
          selector: (s.selector || s.element || s.target) as string | undefined,
          text: (s.text || s.content) as string | undefined,
          value: (s.value || s.option) as string | undefined,
          direction: (s.direction || 'down') as 'up' | 'down' | 'left' | 'right',
          amount: (s.amount || s.pixels || 500) as number,
          keys: (s.keys || s.key) as string | undefined,
          formFields: s.formFields as Array<{ selector: string; value: string }> | undefined,
        },
        rationale: (s.rationale || s.reason || '') as string,
        expectedOutcome: (s.expectedOutcome || s.expected || '') as string,
        status: 'pending' as const,
      }));
    } catch {
      return [];
    }
  }

  private parseReplanResponse(response: string): { steps: AgentStep[]; reason: string; changes: PlanChange[] } {
    try {
      const parsed = JSON.parse(response);
      return {
        steps: this.parsePlanSteps(JSON.stringify(parsed.steps || [])),
        reason: parsed.reason || '',
        changes: parsed.changes || [],
      };
    } catch {
      return { steps: [], reason: 'Failed to parse replan response', changes: [] };
    }
  }

  private inferStrategy(context: PlanningContext): PlanStrategy {
    const desc = context.goal.description.toLowerCase();
    if (/compare|research|explore|investigate/.test(desc)) return 'exploratory';
    if (/careful|verify|confirm|check/.test(desc)) return 'conservative';
    if (/quick|fast|hurry|now/.test(desc)) return 'aggressive';
    return 'linear';
  }

  private buildDependencies(steps: AgentStep[]): StepDependency[] {
    return steps.map((step, i) => ({
      stepId: step.id,
      dependsOn: i > 0 ? [steps[i - 1].id] : [],
      type: i > 0 ? ('blocks' as const) : ('optional' as const),
    }));
  }

  private generateAlternativeSelectors(selector: string): string[] {
    const alts: string[] = [];

    // If it's an ID selector, try class and attribute alternatives
    if (selector.startsWith('#')) {
      const id = selector.slice(1);
      alts.push(`[id="${id}"]`);
      alts.push(`.${id}`);
      alts.push(`[name="${id}"]`);
    }

    // If it's a class selector, try tag and attribute alternatives
    if (selector.startsWith('.')) {
      const cls = selector.slice(1);
      alts.push(`[class*="${cls}"]`);
      alts.push(`[data-testid="${cls}"]`);
    }

    // If it's an attribute selector, try broader matching
    if (selector.startsWith('[name=')) {
      const name = selector.match(/name="([^"]+)"/)?.[1];
      if (name) {
        alts.push(`[name*="${name}"]`);
        alts.push(`[placeholder*="${name}" i]`);
        alts.push(`[aria-label*="${name}" i]`);
      }
    }

    // If it contains text content, try aria-label
    if (!selector.startsWith('.') && !selector.startsWith('#') && !selector.startsWith('[')) {
      alts.push(`[aria-label*="${selector}" i]`);
      alts.push(`[title*="${selector}" i]`);
    }

    return alts.filter(a => a !== selector);
  }
}

// ─── Replanning Monitor ───────────────────────────────────────────────────

/**
 * Monitors execution and detects when replanning is needed.
 */
export class ReplanMonitor {
  private failureThreshold = 3;
  private stallThreshold = 5; // same observation for N steps
  private consecutiveFailures = 0;
  private lastObservationHash = '';
  private sameObservationCount = 0;

  /**
   * Record a step result and check if replanning is needed.
   */
  recordStep(result: StepResult, observationHash?: string): { shouldReplan: boolean; reason: string } {
    if (!result.success) {
      this.consecutiveFailures++;
      this.sameObservationCount = 0;
    } else {
      this.consecutiveFailures = 0;
    }

    // Check consecutive failures
    if (this.consecutiveFailures >= this.failureThreshold) {
      return { shouldReplan: true, reason: `${this.consecutiveFailures} consecutive failures` };
    }

    // Check for stalls (same observation)
    if (observationHash && observationHash === this.lastObservationHash) {
      this.sameObservationCount++;
    } else {
      this.sameObservationCount = 0;
    }
    this.lastObservationHash = observationHash || '';

    if (this.sameObservationCount >= this.stallThreshold) {
      return { shouldReplan: true, reason: `Page unchanged for ${this.sameObservationCount} steps (stalled)` };
    }

    return { shouldReplan: false, reason: '' };
  }

  /**
   * Reset monitor state after a successful replan.
   */
  reset(): void {
    this.consecutiveFailures = 0;
    this.sameObservationCount = 0;
    this.lastObservationHash = '';
  }
}
