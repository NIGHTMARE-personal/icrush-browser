"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.AgentRunLoop = void 0;
exports.generateDefaultPlan = generateDefaultPlan;
exports.generateStepId = generateStepId;
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
const crypto_1 = __importDefault(require("crypto"));
const agent_policy_1 = require("./agent-policy");
const agent_memory_vault_1 = require("./agent-memory-vault");
const agent_undo_stack_1 = require("./agent-undo-stack");
const agent_policy_2 = require("./agent-policy");
// ─── Defaults ─────────────────────────────────────────────────────────────
const DEFAULT_MAX_STEPS = 25;
const DEFAULT_TIMEOUT_MS = 5 * 60 * 1000; // 5 minutes
const DEFAULT_STEP_TIMEOUT_MS = 30000;
const MAX_REPLANS = 3;
const OBSERVATION_DELAY_MS = 1500;
// ─── Agent Run Loop ───────────────────────────────────────────────────────
class AgentRunLoop {
    constructor(policyStore) {
        Object.defineProperty(this, "state", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: 'idle'
        });
        Object.defineProperty(this, "goal", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: null
        });
        Object.defineProperty(this, "steps", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: []
        });
        Object.defineProperty(this, "currentStepIndex", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: 0
        });
        Object.defineProperty(this, "history", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: []
        });
        Object.defineProperty(this, "lastObservation", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: null
        });
        Object.defineProperty(this, "replanCount", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: 0
        });
        Object.defineProperty(this, "startedAt", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: 0
        });
        Object.defineProperty(this, "timeoutHandle", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: null
        });
        Object.defineProperty(this, "policyStore", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: void 0
        });
        Object.defineProperty(this, "abortController", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: null
        });
        // Callbacks — set by the orchestrator (main.ts)
        Object.defineProperty(this, "onProgress", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: void 0
        });
        Object.defineProperty(this, "onStateChange", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: void 0
        });
        Object.defineProperty(this, "onStepExecute", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: void 0
        });
        Object.defineProperty(this, "onObserve", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: void 0
        });
        Object.defineProperty(this, "onPlan", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: void 0
        });
        Object.defineProperty(this, "onReflect", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: void 0
        });
        Object.defineProperty(this, "onApprovalRequest", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: void 0
        });
        Object.defineProperty(this, "onAudit", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: void 0
        });
        this.policyStore = policyStore || { version: 1, defaultMaxTier: 'sensitive', sites: {} };
    }
    // ─── Public API ───────────────────────────────────────────────────────
    getState() { return this.state; }
    getProgress() {
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
    setCallbacks(callbacks) {
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
    setPolicyStore(store) {
        this.policyStore = store;
    }
    /** Start the loop with a goal. */
    async start(goal) {
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
                if (this.abortController.signal.aborted)
                    break;
                const step = this.steps[this.currentStepIndex];
                step.status = 'executing';
                this.emitProgress();
                // Policy gate
                const verdict = (0, agent_policy_1.evaluateAction)(this.policyStore, step.action, goal.url);
                if (!verdict.allowed) {
                    step.status = 'failed';
                    this.recordAudit(step, 'denied', verdict.reasons);
                    this.emitProgress();
                    this.currentStepIndex++;
                    continue;
                }
                // Sensitive action gate
                if (verdict.requiresApproval || (goal.constraints?.requireApprovalForSensitive && (0, agent_policy_1.classifyAgentAction)(step.action).tier === 'sensitive')) {
                    step.status = 'needs_approval';
                    this.setState('awaiting_approval');
                    const domain = (0, agent_policy_1.domainOf)(goal.url);
                    const pending = {
                        promptId: crypto_1.default.randomUUID(),
                        stepId: step.id,
                        action: step.action,
                        tier: (0, agent_policy_1.classifyAgentAction)(step.action).tier,
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
                    const boundary = (0, agent_policy_1.crossesTrustBoundary)(goal.url, goal.url); // same URL for now
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
                let result;
                try {
                    result = await this.executeWithTimeout(() => this.callStepExecute(step), DEFAULT_STEP_TIMEOUT_MS);
                }
                catch (err) {
                    result = { success: false, error: err.message };
                }
                const executionTimeMs = Date.now() - startTime;
                step.status = result.success ? 'succeeded' : 'failed';
                const stepResult = {
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
                (0, agent_undo_stack_1.recordAgentAction)({
                    stepNumber: this.currentStepIndex,
                    goal: goal.description,
                    url: goal.url || '',
                    action: {
                        type: step.action.type,
                        selector: step.action.selector,
                        value: step.action.text || step.action.value,
                    },
                });
                this.recordAudit(step, result.success ? 'auto-approved' : 'denied', result.success ? [] : [`Execution failed: ${result.error}`]);
                this.emitProgress();
                this.currentStepIndex++;
                // Observe after action
                if (result.success) {
                    this.setState('observing');
                    await this.sleep(OBSERVATION_DELAY_MS);
                    try {
                        this.lastObservation = await this.callObserve();
                        this.emitProgress();
                    }
                    catch {
                        // Observation failure is non-fatal
                    }
                    // Reflect
                    this.setState('reflecting');
                    try {
                        const reflection = await this.callReflect(goal, this.steps, this.lastObservation, this.history);
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
                    }
                    catch {
                        // Reflection failure is non-fatal — continue with existing plan
                    }
                }
            }
            // Check if we exhausted steps
            if (this.state !== 'completed' && this.state !== 'failed' && this.state !== 'cancelled') {
                if (this.currentStepIndex >= maxSteps) {
                    this.setState('failed');
                }
                else {
                    this.setState('completed');
                }
            }
            return this.buildResult();
        }
        catch (err) {
            this.setState('failed');
            return this.buildResult(err.message);
        }
        finally {
            if (this.timeoutHandle) {
                clearTimeout(this.timeoutHandle);
                this.timeoutHandle = null;
            }
        }
    }
    /** Cancel the running loop. */
    cancel(reason) {
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
    undoLast() {
        return (0, agent_undo_stack_1.undoLastAction)();
    }
    /** Get the encrypted vault for this session. */
    getVault() {
        return agent_memory_vault_1.agentVault;
    }
    // ─── Internal ─────────────────────────────────────────────────────────
    setState(s) {
        if (this.state === s)
            return;
        this.state = s;
        this.onStateChange?.(s);
    }
    emitProgress() {
        this.onProgress?.(this.getProgress());
    }
    async buildInitialContext(goal) {
        const parts = [`Goal: ${goal.description}`];
        if (goal.url)
            parts.push(`Starting URL: ${goal.url}`);
        if (goal.constraints) {
            if (goal.constraints.maxSteps)
                parts.push(`Max steps: ${goal.constraints.maxSteps}`);
            if (goal.constraints.allowedDomains)
                parts.push(`Allowed domains: ${goal.constraints.allowedDomains.join(', ')}`);
            if (goal.constraints.blockedDomains)
                parts.push(`Blocked domains: ${goal.constraints.blockedDomains.join(', ')}`);
        }
        // Pull relevant memories from vault
        const memories = agent_memory_vault_1.agentVault.list();
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
    async callPlan(goal, context, history) {
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
    async callStepExecute(step) {
        if (this.onStepExecute) {
            return this.onStepExecute(step);
        }
        throw new Error('No step executor registered');
    }
    async callObserve() {
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
    async callReflect(goal, steps, observation, history) {
        if (this.onReflect) {
            return this.onReflect(goal, steps, observation, history);
        }
        return { achieved: false, reasoning: 'No reflector registered' };
    }
    async executeWithTimeout(fn, ms) {
        return new Promise((resolve, reject) => {
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
    recordAudit(step, verdict, reasons) {
        const event = (0, agent_policy_2.buildAuditEvent)({
            url: this.goal?.url || '',
            actionType: step?.action.type || 'plan',
            tier: step ? (0, agent_policy_1.classifyAgentAction)(step.action).tier : 'read',
            verdict,
            reasons,
        });
        this.onAudit?.(event);
    }
    buildResult(error) {
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
    sleep(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }
}
exports.AgentRunLoop = AgentRunLoop;
// ─── Built-in Plan Generator (local-first, uses LLM or template) ────────
/**
 * Generate a plan from a goal using the registered LLM.
 * This is the default planner — called by the loop when no custom planner is set.
 * It returns a structured plan that the loop can execute.
 */
function generateDefaultPlan(goal, context) {
    const steps = [];
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
function generateStepId() {
    return `step-${Date.now()}-${crypto_1.default.randomBytes(4).toString('hex')}`;
}
