/**
 * Sub-Agent Coordinator — manages parallel agent execution and result synthesis.
 *
 * Features:
 * - Spawn child agents with independent goals
 * - Parallel execution with configurable concurrency
 * - Result synthesis from multiple agent outputs
 * - Timeout and cancellation per sub-agent
 * - Parent-child relationship tracking
 * - Result aggregation (merge, compare, filter)
 *
 * Design invariants:
 * - Sub-agents share the same security policy as parent
 * - Each sub-agent has its own step budget and timeout
 * - Sub-agents can't escalate permissions beyond parent
 * - All sub-agent actions are audited
 */
import crypto from 'crypto';
import type { AgentGoal, AgentStep, StepResult, AgentLoopResult, Observation } from './agent-loop';
import { AgentRunLoop } from './agent-loop';
import type { AgentPolicyStore, AgentAuditEvent } from '../shared/agent-contracts';

// ─── Types ────────────────────────────────────────────────────────────────

export type SubAgentStatus = 'pending' | 'running' | 'completed' | 'failed' | 'cancelled' | 'timeout';

export interface SubAgentTask {
  id: string;
  goal: AgentGoal;
  parentTaskId?: string;
  status: SubAgentStatus;
  priority: number;
  result?: AgentLoopResult;
  error?: string;
  startedAt?: number;
  completedAt?: number;
  timeoutMs: number;
  maxSteps: number;
}

export interface SubAgentConfig {
  maxConcurrent: number;
  defaultTimeoutMs: number;
  defaultMaxSteps: number;
  enableParallel: boolean;
}

export interface SynthesisRequest {
  taskIds: string[];
  synthesisGoal: string;
  strategy: 'merge' | 'compare' | 'filter' | 'summarize';
  maxOutputTokens?: number;
}

export interface SynthesisResult {
  content: string;
  sources: string[];
  confidence: number;
  timestamp: number;
}

// ─── Sub-Agent Coordinator ────────────────────────────────────────────────

export class SubAgentCoordinator {
  private tasks: Map<string, SubAgentTask> = new Map();
  private running: Map<string, AgentRunLoop> = new Map();
  private config: SubAgentConfig;
  private policyStore: AgentPolicyStore;
  private auditCallback?: (event: AgentAuditEvent) => void;
  private taskCallbacks: Map<string, {
    onProgress?: (progress: unknown) => void;
    onComplete?: (result: AgentLoopResult) => void;
  }> = new Map();

  constructor(
    config: Partial<SubAgentConfig> = {},
    policyStore?: AgentPolicyStore
  ) {
    this.config = {
      maxConcurrent: 3,
      defaultTimeoutMs: 3 * 60 * 1000,
      defaultMaxSteps: 15,
      enableParallel: true,
      ...config,
    };
    this.policyStore = policyStore || { version: 1, defaultMaxTier: 'sensitive', sites: {} };
  }

  setAuditCallback(callback: (event: AgentAuditEvent) => void): void {
    this.auditCallback = callback;
  }

  // ─── Task Management ──────────────────────────────────────────────

  /**
   * Spawn a new sub-agent task.
   */
  spawn(goal: AgentGoal, options: {
    priority?: number;
    parentTaskId?: string;
    timeoutMs?: number;
    maxSteps?: number;
    onProgress?: (progress: unknown) => void;
    onComplete?: (result: AgentLoopResult) => void;
  } = {}): string {
    const taskId = `sub-${Date.now()}-${crypto.randomBytes(4).toString('hex')}`;

    const task: SubAgentTask = {
      id: taskId,
      goal,
      parentTaskId: options.parentTaskId,
      status: 'pending',
      priority: options.priority ?? 0,
      timeoutMs: options.timeoutMs || this.config.defaultTimeoutMs,
      maxSteps: options.maxSteps || this.config.defaultMaxSteps,
    };

    this.tasks.set(taskId, task);
    if (options.onProgress || options.onComplete) {
      this.taskCallbacks.set(taskId, {
        onProgress: options.onProgress,
        onComplete: options.onComplete,
      });
    }

    // Start if within concurrency limit
    if (this.getRunningCount() < this.config.maxConcurrent) {
      this.startTask(taskId);
    }

    return taskId;
  }

  /**
   * Spawn multiple sub-agents for parallel execution.
   */
  spawnBatch(goals: AgentGoal[], options: {
    priority?: number;
    parentTaskId?: string;
    timeoutMs?: number;
    maxSteps?: number;
    onProgress?: (taskId: string, progress: unknown) => void;
    onComplete?: (taskId: string, result: AgentLoopResult) => void;
  } = {}): string[] {
    return goals.map(goal => {
      const taskId = this.spawn(goal, {
        ...options,
        onProgress: options.onProgress ? (p) => options.onProgress!(taskId, p) : undefined,
        onComplete: options.onComplete ? (r) => options.onComplete!(taskId, r) : undefined,
      });
      return taskId;
    });
  }

  /**
   * Cancel a sub-agent task.
   */
  cancel(taskId: string): boolean {
    const task = this.tasks.get(taskId);
    if (!task) return false;

    if (task.status === 'running') {
      const loop = this.running.get(taskId);
      if (loop) {
        loop.cancel('Cancelled by parent');
        this.running.delete(taskId);
      }
    }

    task.status = 'cancelled';
    task.completedAt = Date.now();
    return true;
  }

  /**
   * Cancel all tasks.
   */
  cancelAll(): void {
    for (const taskId of this.tasks.keys()) {
      this.cancel(taskId);
    }
  }

  /**
   * Get task status.
   */
  getTask(taskId: string): SubAgentTask | undefined {
    return this.tasks.get(taskId);
  }

  /**
   * Get all tasks.
   */
  getAllTasks(): SubAgentTask[] {
    return Array.from(this.tasks.values());
  }

  /**
   * Get tasks by status.
   */
  getTasksByStatus(status: SubAgentStatus): SubAgentTask[] {
    return Array.from(this.tasks.values()).filter(t => t.status === status);
  }

  /**
   * Get child tasks of a parent.
   */
  getChildTasks(parentId: string): SubAgentTask[] {
    return Array.from(this.tasks.values()).filter(t => t.parentTaskId === parentId);
  }

  // ─── Result Synthesis ─────────────────────────────────────────────

  /**
   * Synthesize results from multiple completed tasks.
   */
  async synthesize(request: SynthesisRequest): Promise<SynthesisResult> {
    const results: Array<{ goal: string; result: AgentLoopResult }> = [];

    for (const taskId of request.taskIds) {
      const task = this.tasks.get(taskId);
      if (task?.result) {
        results.push({ goal: task.goal.description, result: task.result });
      }
    }

    if (results.length === 0) {
      return {
        content: 'No completed results to synthesize.',
        sources: [],
        confidence: 0,
        timestamp: Date.now(),
      };
    }

    // Build synthesis prompt
    const prompt = this.buildSynthesisPrompt(request, results);

    // For now, do basic text synthesis (can be enhanced with LLM)
    const content = this.basicSynthesize(request.strategy, results);
    const sources = results.map(r => r.goal);

    return {
      content,
      sources,
      confidence: results.length > 0 ? 0.8 : 0,
      timestamp: Date.now(),
    };
  }

  /**
   * Get aggregated results from all completed tasks.
   */
  getAggregatedResults(): {
    total: number;
    completed: number;
    failed: number;
    cancelled: number;
    results: Array<{ taskId: string; goal: string; success: boolean; stepsExecuted: number; durationMs: number }>;
  } {
    const all = Array.from(this.tasks.values());
    return {
      total: all.length,
      completed: all.filter(t => t.status === 'completed').length,
      failed: all.filter(t => t.status === 'failed').length,
      cancelled: all.filter(t => t.status === 'cancelled').length,
      results: all.filter(t => t.result).map(t => ({
        taskId: t.id,
        goal: t.goal.description,
        success: t.result!.success,
        stepsExecuted: t.result!.stepsExecuted,
        durationMs: t.result!.durationMs,
      })),
    };
  }

  // ─── Internal ─────────────────────────────────────────────────────

  private async startTask(taskId: string): Promise<void> {
    const task = this.tasks.get(taskId);
    if (!task || task.status !== 'pending') return;

    task.status = 'running';
    task.startedAt = Date.now();

    const loop = new AgentRunLoop(this.policyStore);
    this.running.set(taskId, loop);

    // Set up callbacks
    const callbacks = this.taskCallbacks.get(taskId);
    loop.setCallbacks({
      onProgress: callbacks?.onProgress,
      onAudit: this.auditCallback,
    });

    try {
      const result = await loop.start({
        ...task.goal,
        constraints: {
          ...task.goal.constraints,
          maxSteps: task.maxSteps,
          timeoutMs: task.timeoutMs,
        },
      });

      task.result = result;
      task.status = result.success ? 'completed' : 'failed';
      task.completedAt = Date.now();

      callbacks?.onComplete?.(result);
    } catch (err) {
      task.status = 'failed';
      task.error = (err as Error).message;
      task.completedAt = Date.now();
    } finally {
      this.running.delete(taskId);
      this.taskCallbacks.delete(taskId);
      this.processQueue();
    }
  }

  private processQueue(): void {
    const pending = Array.from(this.tasks.values())
      .filter(t => t.status === 'pending')
      .sort((a, b) => b.priority - a.priority);

    while (pending.length > 0 && this.getRunningCount() < this.config.maxConcurrent) {
      const next = pending.shift();
      if (next) this.startTask(next.id);
    }
  }

  private getRunningCount(): number {
    return Array.from(this.tasks.values()).filter(t => t.status === 'running').length;
  }

  private buildSynthesisPrompt(request: SynthesisRequest, results: Array<{ goal: string; result: AgentLoopResult }>): string {
    const parts = [`Synthesis goal: ${request.synthesisGoal}`, `Strategy: ${request.strategy}`, ''];
    for (const r of results) {
      parts.push(`--- Task: ${r.goal} ---`);
      parts.push(`Success: ${r.result.success}`);
      parts.push(`Steps: ${r.result.stepsExecuted}`);
      if (r.result.finalObservation) {
        parts.push(`Final page: ${r.result.finalObservation.title}`);
        parts.push(`Content: ${r.result.finalObservation.text.substring(0, 1000)}`);
      }
      parts.push('');
    }
    return parts.join('\n');
  }

  private basicSynthesize(
    strategy: SynthesisRequest['strategy'],
    results: Array<{ goal: string; result: AgentLoopResult }>
  ): string {
    const completed = results.filter(r => r.result.success);

    switch (strategy) {
      case 'merge':
        return completed.map(r => `[${r.goal}]\n${r.result.finalObservation?.text?.substring(0, 2000) || 'No content'}`).join('\n\n---\n\n');

      case 'compare': {
        if (completed.length < 2) return 'Need at least 2 results to compare.';
        const parts = completed.map(r => `## ${r.goal}\n${r.result.finalObservation?.text?.substring(0, 1500) || 'No content'}`);
        return parts.join('\n\n---\n\n');
      }

      case 'filter':
        return completed.map(r => r.goal).join('\n');

      case 'summarize':
        return completed.map(r => `- ${r.goal}: ${r.result.success ? 'completed' : 'failed'} (${r.result.stepsExecuted} steps)`).join('\n');

      default:
        return completed.map(r => r.goal).join('\n');
    }
  }
}
