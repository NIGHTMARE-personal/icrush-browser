import { v4 as uuid } from 'uuid';

interface SubAgent {
  id: string;
  parentAgentId: string;
  status: 'pending' | 'running' | 'completed' | 'failed' | 'cancelled';
  goal: string;
  result?: string;
  error?: string;
  startedAt: number;
  completedAt?: number;
}

interface AgentTask {
  goal: string;
  webview: Electron.WebviewTag;
  maxSteps?: number;
}

class SubAgentPool {
  private agents: Map<string, SubAgent> = new Map();
  private maxConcurrent = 3;
  private runningCount = 0;
  private queue: Array<{ task: AgentTask; resolve: (result: string) => void; reject: (err: Error) => void }> = [];

  createAgent(parentId: string, goal: string): string {
    const agentId = uuid();
    const agent: SubAgent = {
      id: agentId,
      parentAgentId: parentId,
      status: 'pending',
      goal,
      startedAt: Date.now(),
    };
    this.agents.set(agentId, agent);
    return agentId;
  }

  async executeTask(agentId: string, task: AgentTask): Promise<string> {
    const agent = this.agents.get(agentId);
    if (!agent) throw new Error('Agent not found');

    agent.status = 'running';
    this.runningCount++;

    try {
      const maxSteps = task.maxSteps || 5;
      let result = '';

      for (let step = 0; step < maxSteps; step++) {
        if ((agent.status as string) === 'cancelled') {
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
    } catch (err) {
      agent.status = 'failed';
      agent.error = (err as Error).message;
      agent.completedAt = Date.now();
      throw err;
    } finally {
      this.runningCount--;
      this.processQueue();
    }
  }

  private processQueue(): void {
    while (this.queue.length > 0 && this.runningCount < this.maxConcurrent) {
      const next = this.queue.shift();
      if (next) {
        this.executeTask(next.task.goal, next.task).then(next.resolve).catch(next.reject);
      }
    }
  }

  cancelAgent(agentId: string): void {
    const agent = this.agents.get(agentId);
    if (agent) {
      agent.status = 'cancelled';
    }
  }

  getAgent(agentId: string): SubAgent | undefined {
    return this.agents.get(agentId);
  }

  getAllAgents(): SubAgent[] {
    return Array.from(this.agents.values());
  }

  getAgentsByParent(parentId: string): SubAgent[] {
    return Array.from(this.agents.values()).filter(a => a.parentAgentId === parentId);
  }

  getStats(): { total: number; running: number; completed: number; failed: number; queued: number } {
    const agents = Array.from(this.agents.values());
    return {
      total: agents.length,
      running: agents.filter(a => a.status === 'running').length,
      completed: agents.filter(a => a.status === 'completed').length,
      failed: agents.filter(a => a.status === 'failed').length,
      queued: this.queue.length,
    };
  }

  cleanup(maxAge: number = 3600000): void {
    const now = Date.now();
    for (const [id, agent] of this.agents) {
      if (agent.completedAt && (now - agent.completedAt) > maxAge) {
        this.agents.delete(id);
      }
    }
  }
}

export const subAgentPool = new SubAgentPool();
