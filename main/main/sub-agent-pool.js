"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.subAgentPool = void 0;
const uuid_1 = require("uuid");
class SubAgentPool {
    constructor() {
        Object.defineProperty(this, "agents", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: new Map()
        });
        Object.defineProperty(this, "maxConcurrent", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: 3
        });
        Object.defineProperty(this, "runningCount", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: 0
        });
        Object.defineProperty(this, "queue", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: []
        });
    }
    createAgent(parentId, goal) {
        const agentId = (0, uuid_1.v4)();
        const agent = {
            id: agentId,
            parentAgentId: parentId,
            status: 'pending',
            goal,
            startedAt: Date.now(),
        };
        this.agents.set(agentId, agent);
        return agentId;
    }
    async executeTask(agentId, task) {
        const agent = this.agents.get(agentId);
        if (!agent)
            throw new Error('Agent not found');
        agent.status = 'running';
        this.runningCount++;
        try {
            const maxSteps = task.maxSteps || 5;
            let result = '';
            for (let step = 0; step < maxSteps; step++) {
                if (agent.status === 'cancelled') {
                    throw new Error('Agent cancelled');
                }
                // Extract page state
                const pageState = await task.webview.executeJavaScript(`
          JSON.stringify({
            url: window.location.href,
            text: document.body?.innerText?.substring(0, 1000) || '',
            title: document.title || ''
          })
        `);
                const state = JSON.parse(pageState);
                result = `Sub-agent ${agentId.substring(0, 8)} on "${state.title || state.url}" completed task: ${agent.goal}`;
                break;
            }
            agent.status = 'completed';
            agent.result = result;
            agent.completedAt = Date.now();
            return result;
        }
        catch (err) {
            agent.status = 'failed';
            agent.error = err.message;
            agent.completedAt = Date.now();
            throw err;
        }
        finally {
            this.runningCount--;
            this.processQueue();
        }
    }
    processQueue() {
        while (this.queue.length > 0 && this.runningCount < this.maxConcurrent) {
            const next = this.queue.shift();
            if (next) {
                this.executeTask(next.task.goal, next.task).then(next.resolve).catch(next.reject);
            }
        }
    }
    cancelAgent(agentId) {
        const agent = this.agents.get(agentId);
        if (agent) {
            agent.status = 'cancelled';
        }
    }
    getAgent(agentId) {
        return this.agents.get(agentId);
    }
    getAllAgents() {
        return Array.from(this.agents.values());
    }
    getAgentsByParent(parentId) {
        return Array.from(this.agents.values()).filter(a => a.parentAgentId === parentId);
    }
    getStats() {
        const agents = Array.from(this.agents.values());
        return {
            total: agents.length,
            running: agents.filter(a => a.status === 'running').length,
            completed: agents.filter(a => a.status === 'completed').length,
            failed: agents.filter(a => a.status === 'failed').length,
            queued: this.queue.length,
        };
    }
    cleanup(maxAge = 3600000) {
        const now = Date.now();
        for (const [id, agent] of this.agents) {
            if (agent.completedAt && (now - agent.completedAt) > maxAge) {
                this.agents.delete(id);
            }
        }
    }
}
exports.subAgentPool = new SubAgentPool();
