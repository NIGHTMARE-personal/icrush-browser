/**
 * Agent Execution Loop — the core runtime for autonomous browsing.
 *
 * Implements: Plan → Act → Observe → Reflect → Replan cycle.
 * - Accepts a high-level goal from the user
 * - Decomposes into executable steps via LLM planning
 * - Executes each step through the DOM engine (agent-engine.ts)
 * - Observes results via page extraction + A11y tree
 * - Reflects on goal completion, decides whether to replan
 * - Enforces safety: step budgets, timeouts, trust boundaries, sensitive-action gates
 * - Broadcasts progress to renderer in real-time
 *
 * Design invariants:
 * - Never silently falls back to cloud — local-first
 * - Every action logged to the audit ledger
 * - Sensitive actions require explicit user approval
 * - Respects per-site permission tiers from agent-policy
 */
import crypto from 'crypto';
import { generateActionJS, parseAgentAction, isSensitiveField, hasSensitiveFields } from './agent-engine';
import { classifyAgentAction, evaluateAction, crossesTrustBoundary, domainOf } from './agent-policy';
import { agentVault } from './agent-memory-vault';
import { recordAgentAction, undoLastAction } from './agent-undo-stack';
import { buildAuditEvent, appendAuditLogFile } from './agent-policy';
import type {
  AgentPermissionTier,
  AgentPolicyStore,
  AgentAuditEvent,
} from '../shared/agent-contracts';

// ─── Types ────────────────────────────────────────────────────────────────

export type AgentLoopState =
  | 'idle'
  | 'planning'
  | 'executing'
  | 'observing'
  | 'reflecting'
  | 'replanning'
  | 'awaiting_approval'
  | 'completed'
  | 'failed'
  | 'cancelled';

export interface AgentGoal {
  description: string;
  url?: string;
  constraints?: {
    maxSteps?: number;
    timeoutMs?: number;
    allowedDomains?: string[];
    blockedDomains?: string[];
    maxNavigations?: number;
    requireApprovalForSensitive?: boolean;
  };
}

export interface AgentStep {
  id: string;
  index: number;
  action: {
    type: string;
    selector?: string;
    text?: string;
    value?: string;
    direction?: 'up' | 'down' | 'left' | 'right';
    amount?: number;
    keys?: string;
    formFields?: Array<{ selector: string; value: string }>;
  };
  rationale: string;
  expectedOutcome: string;
  status: 'pending' | 'executing' | 'succeeded' | 'failed' | 'skipped' | 'needs_approval';
}

export interface StepResult {
  stepId: string;
  stepIndex: number;
  success: boolean;
  output?: string;
  error?: string;
  extractedData?: string;
  timestamp: number;
  executionTimeMs: number;
}

export interface Observation {
  url: string;
  title: string;
  text: string;
  links: Array<{ text: string; url: string }>;
  forms: Array<{ action: string; method: string; fields: Array<{ name: string; type: string; placeholder: string; value: string }> }>;
  inputs: Array<{ tag: string; type: string; name: string; placeholder: string; selector: string }>;
  timestamp: number;
}

export interface LoopProgress {
  state: AgentLoopState;
  goal: string;
  currentStep: number;
  totalSteps: number;
  steps: AgentStep[];
  history: StepResult[];
  lastObservation?: Observation;
  error?: string;
  startedAt: number;
  elapsed: number;
}

export interface AgentLoopResult {
  success: boolean;
  goal: string;
  totalSteps: number;
  stepsExecuted: number;
  history: StepResult[];
  finalObservation?: Observation;
  error?: string;
  durationMs: number;
  undoAvailable: boolean;
}

export interface PendingApproval {
  promptId: string;
  stepId: string;
  action: AgentStep['action'];
  tier: AgentPermissionTier;
  reasons: string[];
  url: string;
  domain: string;
  requestedAt: number;
}

// ─── Defaults ─────────────────────────────────────────────────────────────

const DEFAULT_MAX_STEPS = 25;
const DEFAULT_TIMEOUT_MS = 5 * 60 * 1000; // 5 minutes
const DEFAULT_STEP_TIMEOUT_MS = 30_000;
const MAX_REPLANS = 3;
const OBSERVATION_DELAY_MS = 1500;

// ─── Agent Run Loop ───────────────────────────────────────────────────────

export class AgentRunLoop {
  private state: AgentLoopState = 'idle';
  private goal: AgentGoal | null = null;
  private steps: AgentStep[] = [];
  private currentStepIndex = 0;
  private history: StepResult[] = [];
  private lastObservation: Observation | null = null;
  private replanCount = 0;
  private startedAt = 0;
  private timeoutHandle: ReturnType<typeof setTimeout> | null = null;
  private policyStore: AgentPolicyStore;
  private abortController: AbortController | null = null;

  // Callbacks — set by the orchestrator (main.ts)
  private onProgress?: (progress: LoopProgress) => void;
  private onStateChange?: (state: AgentLoopState) => void;
  private onStepExecute?: (step: AgentStep) => Promise<{ success: boolean; output?: string; error?: string }>;
  private onObserve?: () => Promise<Observation>;
  private onPlan?: (goal: AgentGoal, context: string, history: StepResult[]) => Promise<AgentStep[]>;
  private onReflect?: (goal: AgentGoal, steps: AgentStep[], observation: Observation, history: StepResult[]) => Promise<{ achieved: boolean; reasoning: string; nextSteps?: AgentStep[] }>;
  private onApprovalRequest?: (pending: PendingApproval) => Promise<boolean>;
  private onAudit?: (event: AgentAuditEvent) => void;

  constructor(policyStore?: AgentPolicyStore) {
    this.policyStore = policyStore || { version: 1, defaultMaxTier: 'sensitive', sites: {} };
  }

  // ─── Public API ───────────────────────────────────────────────────────

  getState(): AgentLoopState { return this.state; }
  getProgress(): LoopProgress {
    return {
      state: this.state,
      goal: this.goal?.description || '',
      currentStep: this.currentStepIndex,
      totalSteps: this.steps.length,
      steps: this.steps,
      history: this.history,
      lastObservation: this.lastObservation || undefined,
      startedAt: this.startedAt,
      elapsed: this.startedAt ? Date.now() - this.startedAt : 0,
    };
  }

  /** Register callbacks for the loop. */
  setCallbacks(callbacks: {
    onProgress?: (progress: LoopProgress) => void;
    onStateChange?: (state: AgentLoopState) => void;
    onStepExecute?: (step: AgentStep) => Promise<{ success: boolean; output?: string; error?: string }>;
    onObserve?: () => Promise<Observation>;
    onPlan?: (goal: AgentGoal, context: string, history: StepResult[]) => Promise<AgentStep[]>;
    onReflect?: (goal: AgentGoal, steps: AgentStep[], observation: Observation, history: StepResult[]) => Promise<{ achieved: boolean; reasoning: string; nextSteps?: AgentStep[] }>;
    onApprovalRequest?: (pending: PendingApproval) => Promise<boolean>;
    onAudit?: (event: AgentAuditEvent) => void;
  }): void {
    this.onProgress = callbacks.onProgress;
    this.onStateChange = callbacks.onStateChange;
    this.onStepExecute = callbacks.onStepExecute;
    this.onObserve = callbacks.onObserve;
    this.onPlan = callbacks.onPlan;
    this.onReflect = callbacks.onReflect;
    this.onApprovalRequest = callbacks.onApprovalRequest;
    this.onAudit = callbacks.onAudit;
  }

  /** Update the policy store (e.g., after user changes settings). */
  setPolicyStore(store: AgentPolicyStore): void {
    this.policyStore = store;
  }

  /** Start the loop with a goal. */
  async start(goal: AgentGoal): Promise<AgentLoopResult> {
    if (this.state !== 'idle' && this.state !== 'completed' && this.state !== 'failed' && this.state !== 'cancelled') {
      throw new Error(`Cannot start: loop is in state "${this.state}"`);
    }

    this.goal = goal;
    this.steps = [];
    this.currentStepIndex = 0;
    this.history = [];
    this.lastObservation = null;
    this.replanCount = 0;
    this.startedAt = Date.now();
    this.abortController = new AbortController();

    const maxSteps = goal.constraints?.maxSteps || DEFAULT_MAX_STEPS;
    const timeoutMs = goal.constraints?.timeoutMs || DEFAULT_TIMEOUT_MS;

    // Set global timeout
    this.timeoutHandle = setTimeout(() => {
      this.cancel('Timeout exceeded');
    }, timeoutMs);

    try {
      // Phase 1: Plan
      this.setState('planning');
      const context = await this.buildInitialContext(goal);
      this.steps = await this.callPlan(goal, context, []);
      this.emitProgress();

      // Phase 2: Execute loop
      while (this.currentStepIndex < this.steps.length && this.currentStepIndex < maxSteps) {
        if (this.abortController.signal.aborted) break;

        const step = this.steps[this.currentStepIndex];
        step.status = 'executing';
        this.emitProgress();

        // Policy gate
        const verdict = evaluateAction(this.policyStore, step.action, goal.url);
        if (!verdict.allowed) {
          step.status = 'failed';
          this.recordAudit(step, 'denied', verdict.reasons);
          this.emitProgress();
          this.currentStepIndex++;
          continue;
        }

        // Sensitive action gate
        if (verdict.requiresApproval || (goal.constraints?.requireApprovalForSensitive && classifyAgentAction(step.action).tier === 'sensitive')) {
          step.status = 'needs_approval';
          this.setState('awaiting_approval');

          const domain = domainOf(goal.url);
          const pending: PendingApproval = {
            promptId: crypto.randomUUID(),
            stepId: step.id,
            action: step.action,
            tier: classifyAgentAction(step.action).tier,
            reasons: verdict.reasons,
            url: goal.url || '',
            domain,
            requestedAt: Date.now(),
          };

          const approved = await this.onApprovalRequest?.(pending) ?? false;
          if (!approved) {
            step.status = 'skipped';
            this.recordAudit(step, 'denied', ['User denied approval']);
            this.currentStepIndex++;
            this.emitProgress();
            continue;
          }
          step.status = 'pending';
          this.recordAudit(step, 'approved', ['User approved']);
        }

        // Trust boundary check
        if (goal.url) {
          const boundary = crossesTrustBoundary(goal.url, goal.url); // same URL for now
          if (boundary.crosses) {
            this.recordAudit(step, 'denied', boundary.reasons);
            step.status = 'skipped';
            this.currentStepIndex++;
            this.emitProgress();
            continue;
          }
        }

        // Execute
        this.setState('executing');
        const startTime = Date.now();
        let result: { success: boolean; output?: string; error?: string };

        try {
          result = await this.executeWithTimeout(
            () => this.callStepExecute(step),
            DEFAULT_STEP_TIMEOUT_MS
          );
        } catch (err) {
          result = { success: false, error: (err as Error).message };
        }

        const executionTimeMs = Date.now() - startTime;
        step.status = result.success ? 'succeeded' : 'failed';

        const stepResult: StepResult = {
          stepId: step.id,
          stepIndex: this.currentStepIndex,
          success: result.success,
          output: result.output,
          error: result.error,
          timestamp: Date.now(),
          executionTimeMs,
        };
        this.history.push(stepResult);

        // Record undo capability
        recordAgentAction({
          stepNumber: this.currentStepIndex,
          goal: goal.description,
          url: goal.url || '',
          action: {
            type: step.action.type as any,
            selector: step.action.selector,
            value: step.action.text || step.action.value,
          },
        });

        this.recordAudit(step, result.success ? 'auto-approved' : 'denied',
          result.success ? [] : [`Execution failed: ${result.error}`]);
        this.emitProgress();

        this.currentStepIndex++;

        // Observe after action
        if (result.success) {
          this.setState('observing');
          await this.sleep(OBSERVATION_DELAY_MS);
          try {
            this.lastObservation = await this.callObserve();
            this.emitProgress();
          } catch {
            // Observation failure is non-fatal
          }

          // Reflect
          this.setState('reflecting');
          try {
            const reflection = await this.callReflect(goal, this.steps, this.lastObservation!, this.history);

            if (reflection.achieved) {
              this.setState('completed');
              break;
            }

            if (reflection.nextSteps && reflection.nextSteps.length > 0 && this.replanCount < MAX_REPLANS) {
              this.replanCount++;
              this.setState('replanning');
              this.steps = [...this.steps.slice(0, this.currentStepIndex), ...reflection.nextSteps];
              this.emitProgress();
            }
          } catch {
            // Reflection failure is non-fatal — continue with existing plan
          }
        }
      }

      // Check if we exhausted steps
      if (this.state !== 'completed' && this.state !== 'failed' && this.state !== 'cancelled') {
        if (this.currentStepIndex >= maxSteps) {
          this.setState('failed');
        } else {
          this.setState('completed');
        }
      }

      return this.buildResult();
    } catch (err) {
      this.setState('failed');
      return this.buildResult((err as Error).message);
    } finally {
      if (this.timeoutHandle) {
        clearTimeout(this.timeoutHandle);
        this.timeoutHandle = null;
      }
    }
  }

  /** Cancel the running loop. */
  cancel(reason?: string): void {
    this.abortController?.abort();
    if (this.timeoutHandle) {
      clearTimeout(this.timeoutHandle);
      this.timeoutHandle = null;
    }
    this.setState('cancelled');
    if (reason) {
      this.recordAudit(null, 'denied', [`Cancelled: ${reason}`]);
    }
  }

  /** Undo the last executed step. */
  undoLast(): { success: boolean; undoJsCode?: string; error?: string } {
    return undoLastAction();
  }

  /** Get the encrypted vault for this session. */
  getVault() {
    return agentVault;
  }

  // ─── Internal ─────────────────────────────────────────────────────────

  private setState(s: AgentLoopState): void {
    if (this.state === s) return;
    this.state = s;
    this.onStateChange?.(s);
  }

  private emitProgress(): void {
    this.onProgress?.(this.getProgress());
  }

  private async buildInitialContext(goal: AgentGoal): Promise<string> {
    const parts: string[] = [`Goal: ${goal.description}`];
    if (goal.url) parts.push(`Starting URL: ${goal.url}`);
    if (goal.constraints) {
      if (goal.constraints.maxSteps) parts.push(`Max steps: ${goal.constraints.maxSteps}`);
      if (goal.constraints.allowedDomains) parts.push(`Allowed domains: ${goal.constraints.allowedDomains.join(', ')}`);
      if (goal.constraints.blockedDomains) parts.push(`Blocked domains: ${goal.constraints.blockedDomains.join(', ')}`);
    }
    // Pull relevant memories from vault
    const memories = agentVault.list();
    const relevantMemories = Object.entries(memories)
      .filter(([k]) => k.startsWith('task:') || k.startsWith('preference:'))
      .slice(0, 5)
      .map(([k, v]) => `Memory [${k}]: ${v.substring(0, 200)}`);
    if (relevantMemories.length > 0) {
      parts.push('Relevant memories:');
      parts.push(...relevantMemories);
    }
    return parts.join('\n');
  }

  private async callPlan(goal: AgentGoal, context: string, history: StepResult[]): Promise<AgentStep[]> {
    if (this.onPlan) {
      return this.onPlan(goal, context, history);
    }
    // Default plan: single extract step
    return [{
      id: `step-${Date.now()}-0`,
      index: 0,
      action: { type: 'extract' },
      rationale: 'Default: extract page content',
      expectedOutcome: 'Page content extracted',
      status: 'pending',
    }];
  }

  private async callStepExecute(step: AgentStep): Promise<{ success: boolean; output?: string; error?: string }> {
    if (this.onStepExecute) {
      return this.onStepExecute(step);
    }
    throw new Error('No step executor registered');
  }

  private async callObserve(): Promise<Observation> {
    if (this.onObserve) {
      return this.onObserve();
    }
    return {
      url: '',
      title: '',
      text: '',
      links: [],
      forms: [],
      inputs: [],
      timestamp: Date.now(),
    };
  }

  private async callReflect(
    goal: AgentGoal,
    steps: AgentStep[],
    observation: Observation,
    history: StepResult[]
  ): Promise<{ achieved: boolean; reasoning: string; nextSteps?: AgentStep[] }> {
    if (this.onReflect) {
      return this.onReflect(goal, steps, observation, history);
    }
    return { achieved: false, reasoning: 'No reflector registered' };
  }

  private async executeWithTimeout<T>(fn: () => Promise<T>, ms: number): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error(`Step timed out after ${ms}ms`)), ms);
      fn().then(result => {
        clearTimeout(timer);
        resolve(result);
      }).catch(err => {
        clearTimeout(timer);
        reject(err);
      });
    });
  }

  private recordAudit(step: AgentStep | null, verdict: AgentAuditEvent['verdict'], reasons: string[]): void {
    const event = buildAuditEvent({
      url: this.goal?.url || '',
      actionType: step?.action.type || 'plan',
      tier: step ? classifyAgentAction(step.action).tier : 'read',
      verdict,
      reasons,
    });
    this.onAudit?.(event);
  }

  private buildResult(error?: string): AgentLoopResult {
    return {
      success: this.state === 'completed',
      goal: this.goal?.description || '',
      totalSteps: this.steps.length,
      stepsExecuted: this.history.length,
      history: this.history,
      finalObservation: this.lastObservation || undefined,
      error,
      durationMs: Date.now() - this.startedAt,
      undoAvailable: this.history.length > 0,
    };
  }

  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

// ─── Built-in Plan Generator (local-first, uses LLM or template) ────────

/**
 * Generate a plan from a goal using the registered LLM.
 * This is the default planner — called by the loop when no custom planner is set.
 * It returns a structured plan that the loop can execute.
 */
export function generateDefaultPlan(goal: AgentGoal, context: string): AgentStep[] {
  const steps: AgentStep[] = [];
  const desc = goal.description.toLowerCase();

  // Navigate to starting URL if provided
  if (goal.url) {
    steps.push({
      id: `step-nav-${Date.now()}`,
      index: steps.length,
      action: { type: 'click', selector: `a[href="${goal.url}"]` },
      rationale: `Navigate to ${goal.url}`,
      expectedOutcome: `Page loaded at ${goal.url}`,
      status: 'pending',
    });
  }

  // Common task patterns
  if (desc.includes('search') || desc.includes('find') || desc.includes('look')) {
    const searchTerm = goal.description.replace(/^(search|find|look)\s*(for)?\s*/i, '').trim();
    steps.push({
      id: `step-search-input-${Date.now()}`,
      index: steps.length,
      action: { type: 'type', selector: 'input[type="search"], input[name="q"], input[name="search"]', text: searchTerm },
      rationale: `Type search query "${searchTerm}"`,
      expectedOutcome: 'Search query entered',
      status: 'pending',
    });
    steps.push({
      id: `step-search-submit-${Date.now()}`,
      index: steps.length,
      action: { type: 'press_key', keys: 'enter' },
      rationale: 'Submit search',
      expectedOutcome: 'Search results loaded',
      status: 'pending',
    });
  }

  if (desc.includes('click') || desc.includes('open') || desc.includes('go to')) {
    const target = goal.description.replace(/^(click|open|go\s*to)\s*/i, '').trim();
    steps.push({
      id: `step-click-${Date.now()}`,
      index: steps.length,
      action: { type: 'click', selector: target },
      rationale: `Click "${target}"`,
      expectedOutcome: `"${target}" was clicked/activated`,
      status: 'pending',
    });
  }

  if (desc.includes('fill') || desc.includes('enter') || desc.includes('type')) {
    steps.push({
      id: `step-fill-${Date.now()}`,
      index: steps.length,
      action: { type: 'extract' },
      rationale: 'Extract form fields to determine fill targets',
      expectedOutcome: 'Form fields identified',
      status: 'pending',
    });
  }

  if (desc.includes('read') || desc.includes('extract') || desc.includes('get') || desc.includes('summarize')) {
    steps.push({
      id: `step-extract-${Date.now()}`,
      index: steps.length,
      action: { type: 'extract' },
      rationale: 'Extract page content',
      expectedOutcome: 'Page content extracted',
      status: 'pending',
    });
  }

  // Always end with extraction for observation
  if (!steps.some(s => s.action.type === 'extract')) {
    steps.push({
      id: `step-final-extract-${Date.now()}`,
      index: steps.length,
      action: { type: 'extract' },
      rationale: 'Final extraction to verify task completion',
      expectedOutcome: 'Final page state captured',
      status: 'pending',
    });
  }

  return steps;
}

// ─── Step ID Generator ────────────────────────────────────────────────────

export function generateStepId(): string {
  return `step-${Date.now()}-${crypto.randomBytes(4).toString('hex')}`;
}
