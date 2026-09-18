"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.SubAgentCoordinator = void 0;
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
const crypto_1 = __importDefault(require("crypto"));
const agent_loop_1 = require("./agent-loop");
// ─── Sub-Agent Coordinator ────────────────────────────────────────────────
class SubAgentCoordinator {
    constructor(config = {}, policyStore) {
        Object.defineProperty(this, "tasks", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: new Map()
        });
        Object.defineProperty(this, "running", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: new Map()
        });
        Object.defineProperty(this, "config", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: void 0
        });
        Object.defineProperty(this, "policyStore", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: void 0
        });
        Object.defineProperty(this, "auditCallback", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: void 0
        });
        Object.defineProperty(this, "taskCallbacks", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: new Map()
        });
        this.config = {
            maxConcurrent: 3,
            defaultTimeoutMs: 3 * 60 * 1000,
            defaultMaxSteps: 15,
            enableParallel: true,
            ...config,
        };
        this.policyStore = policyStore || { version: 1, defaultMaxTier: 'sensitive', sites: {} };
    }
    setAuditCallback(callback) {
        this.auditCallback = callback;
    }
    // ─── Task Management ──────────────────────────────────────────────
    /**
     * Spawn a new sub-agent task.
     */
    spawn(goal, options = {}) {
        const taskId = `sub-${Date.now()}-${crypto_1.default.randomBytes(4).toString('hex')}`;
        const task = {
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
    spawnBatch(goals, options = {}) {
        return goals.map(goal => {
            const taskId = this.spawn(goal, {
                ...options,
                onProgress: options.onProgress ? (p) => options.onProgress(taskId, p) : undefined,
                onComplete: options.onComplete ? (r) => options.onComplete(taskId, r) : undefined,
            });
            return taskId;
        });
    }
    /**
     * Cancel a sub-agent task.
     */
    cancel(taskId) {
        const task = this.tasks.get(taskId);
        if (!task)
            return false;
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
    cancelAll() {
        for (const taskId of this.tasks.keys()) {
            this.cancel(taskId);
        }
    }
    /**
     * Get task status.
     */
    getTask(taskId) {
        return this.tasks.get(taskId);
    }
    /**
     * Get all tasks.
     */
    getAllTasks() {
        return Array.from(this.tasks.values());
    }
    /**
     * Get tasks by status.
     */
    getTasksByStatus(status) {
        return Array.from(this.tasks.values()).filter(t => t.status === status);
    }
    /**
     * Get child tasks of a parent.
     */
    getChildTasks(parentId) {
        return Array.from(this.tasks.values()).filter(t => t.parentTaskId === parentId);
    }
    // ─── Result Synthesis ─────────────────────────────────────────────
    /**
     * Synthesize results from multiple completed tasks.
     */
    async synthesize(request) {
        const results = [];
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
    getAggregatedResults() {
        const all = Array.from(this.tasks.values());
        return {
            total: all.length,
            completed: all.filter(t => t.status === 'completed').length,
            failed: all.filter(t => t.status === 'failed').length,
            cancelled: all.filter(t => t.status === 'cancelled').length,
            results: all.filter(t => t.result).map(t => ({
                taskId: t.id,
                goal: t.goal.description,
                success: t.result.success,
                stepsExecuted: t.result.stepsExecuted,
                durationMs: t.result.durationMs,
            })),
        };
    }
    // ─── Internal ─────────────────────────────────────────────────────
    async startTask(taskId) {
        const task = this.tasks.get(taskId);
        if (!task || task.status !== 'pending')
            return;
        task.status = 'running';
        task.startedAt = Date.now();
        const loop = new agent_loop_1.AgentRunLoop(this.policyStore);
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
        }
        catch (err) {
            task.status = 'failed';
            task.error = err.message;
            task.completedAt = Date.now();
        }
        finally {
            this.running.delete(taskId);
            this.taskCallbacks.delete(taskId);
            this.processQueue();
        }
    }
    processQueue() {
        const pending = Array.from(this.tasks.values())
            .filter(t => t.status === 'pending')
            .sort((a, b) => b.priority - a.priority);
        while (pending.length > 0 && this.getRunningCount() < this.config.maxConcurrent) {
            const next = pending.shift();
            if (next)
                this.startTask(next.id);
        }
    }
    getRunningCount() {
        return Array.from(this.tasks.values()).filter(t => t.status === 'running').length;
    }
    buildSynthesisPrompt(request, results) {
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
    basicSynthesize(strategy, results) {
        const completed = results.filter(r => r.result.success);
        switch (strategy) {
            case 'merge':
                return completed.map(r => `[${r.goal}]\n${r.result.finalObservation?.text?.substring(0, 2000) || 'No content'}`).join('\n\n---\n\n');
            case 'compare': {
                if (completed.length < 2)
                    return 'Need at least 2 results to compare.';
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
exports.SubAgentCoordinator = SubAgentCoordinator;
