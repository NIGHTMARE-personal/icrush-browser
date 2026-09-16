import { v4 as uuid } from 'uuid';

export interface ScheduledTask {
  id: string;
  name: string;
  goal: string;
  cronExpression: string;
  enabled: boolean;
  lastRun?: number;
  nextRun: number;
  createdAt: number;
}

interface CronMatch {
  minute: number[];
  hour: number[];
  dayOfMonth: number[];
  month: number[];
  dayOfWeek: number[];
}

class AgentScheduler {
  private tasks: Map<string, ScheduledTask> = new Map();
  private intervals: Map<string, NodeJS.Timeout> = new Map();
  private onExecute?: (goal: string) => Promise<void>;

  setExecutor(executor: (goal: string) => Promise<void>): void {
    this.onExecute = executor;
  }

  addTask(name: string, goal: string, cronExpression: string): string {
    const id = uuid();
    const task: ScheduledTask = {
      id,
      name,
      goal,
      cronExpression,
      enabled: true,
      nextRun: this.getNextRunTime(cronExpression),
      createdAt: Date.now(),
    };

    this.tasks.set(id, task);
    this.scheduleTask(task);
    this.saveTasks();
    return id;
  }

  removeTask(taskId: string): boolean {
    const task = this.tasks.get(taskId);
    if (!task) return false;

    const interval = this.intervals.get(taskId);
    if (interval) clearInterval(interval);

    this.intervals.delete(taskId);
    this.tasks.delete(taskId);
    this.saveTasks();
    return true;
  }

  updateTask(taskId: string, updates: Partial<ScheduledTask>): boolean {
    const task = this.tasks.get(taskId);
    if (!task) return false;

    const interval = this.intervals.get(taskId);
    if (interval) clearInterval(interval);

    Object.assign(task, updates);
    if (updates.cronExpression) {
      task.nextRun = this.getNextRunTime(updates.cronExpression);
    }
    if (task.enabled) {
      this.scheduleTask(task);
    }

    this.saveTasks();
    return true;
  }

  enableTask(taskId: string): boolean {
    const task = this.tasks.get(taskId);
    if (!task) return false;

    task.enabled = true;
    this.scheduleTask(task);
    this.saveTasks();
    return true;
  }

  disableTask(taskId: string): boolean {
    const task = this.tasks.get(taskId);
    if (!task) return false;

    task.enabled = false;
    const interval = this.intervals.get(taskId);
    if (interval) clearInterval(interval);
    this.intervals.delete(taskId);
    this.saveTasks();
    return true;
  }

  getTask(taskId: string): ScheduledTask | undefined {
    return this.tasks.get(taskId);
  }

  getAllTasks(): ScheduledTask[] {
    return Array.from(this.tasks.values());
  }

  getEnabledTasks(): ScheduledTask[] {
    return Array.from(this.tasks.values()).filter(t => t.enabled);
  }

  async runTaskNow(taskId: string): Promise<boolean> {
    const task = this.tasks.get(taskId);
    if (!task || !this.onExecute) return false;

    try {
      await this.onExecute(task.goal);
      task.lastRun = Date.now();
      this.saveTasks();
      return true;
    } catch (err) {
      console.error('[AgentScheduler] Task execution failed:', err);
      return false;
    }
  }

  private scheduleTask(task: ScheduledTask): void {
    if (!task.enabled) return;

    const checkInterval = 60000; // Check every minute
    const interval = setInterval(async () => {
      const now = Date.now();
      if (now >= task.nextRun) {
        task.lastRun = now;
        task.nextRun = this.getNextRunTime(task.cronExpression);
        this.saveTasks();

        if (this.onExecute) {
          try {
            await this.onExecute(task.goal);
          } catch (err) {
            console.error(`[AgentScheduler] Failed to run task ${task.name}:`, err);
          }
        }
      }
    }, checkInterval);

    this.intervals.set(task.id, interval);
  }

  private getNextRunTime(cronExpression: string): number {
    const now = new Date();
    const parts = cronExpression.split(' ');

    if (parts.length !== 5) return now.getTime() + 3600000;

    const [minute, hour, dayOfMonth, month, dayOfWeek] = parts;
    const next = new Date(now);

    // Parse minute
    if (minute !== '*') {
      const min = parseInt(minute);
      if (!isNaN(min)) next.setMinutes(min);
    }

    // Parse hour
    if (hour !== '*') {
      const hr = parseInt(hour);
      if (!isNaN(hr)) next.setHours(hr);
    }

    // Parse day of month
    if (dayOfMonth !== '*') {
      const dom = parseInt(dayOfMonth);
      if (!isNaN(dom)) next.setDate(dom);
    }

    // Parse month
    if (month !== '*') {
      const m = parseInt(month) - 1;
      if (!isNaN(m)) next.setMonth(m);
    }

    // If the computed time is in the past, add a day
    if (next.getTime() <= now.getTime()) {
      next.setDate(next.getDate() + 1);
    }

    return next.getTime();
  }

  private parseCronExpression(expr: string): CronMatch | null {
    const parts = expr.split(' ');
    if (parts.length !== 5) return null;

    return {
      minute: this.parseCronField(parts[0], 0, 59),
      hour: this.parseCronField(parts[1], 0, 23),
      dayOfMonth: this.parseCronField(parts[2], 1, 31),
      month: this.parseCronField(parts[3], 1, 12),
      dayOfWeek: this.parseCronField(parts[4], 0, 6),
    };
  }

  private parseCronField(field: string, min: number, max: number): number[] {
    if (field === '*') {
      return Array.from({ length: max - min + 1 }, (_, i) => i + min);
    }

    const values: number[] = [];

    // Handle comma-separated values
    const parts = field.split(',');
    for (const part of parts) {
      // Handle ranges
      if (part.includes('-')) {
        const [start, end] = part.split('-').map(Number);
        for (let i = start; i <= end; i++) {
          values.push(i);
        }
      } else {
        values.push(parseInt(part));
      }
    }

    return values;
  }

  private saveTasks(): void {
    try {
      const tasks = Array.from(this.tasks.values());
      localStorage.setItem('agent-scheduled-tasks', JSON.stringify(tasks));
    } catch (err) {
      console.error('[AgentScheduler] Failed to save tasks:', err);
    }
  }

  loadTasks(): void {
    try {
      const stored = localStorage.getItem('agent-scheduled-tasks');
      if (stored) {
        const tasks: ScheduledTask[] = JSON.parse(stored);
        for (const task of tasks) {
          this.tasks.set(task.id, task);
          if (task.enabled) {
            this.scheduleTask(task);
          }
        }
      }
    } catch (err) {
      console.error('[AgentScheduler] Failed to load tasks:', err);
    }
  }

  stopAll(): void {
    for (const [id, interval] of this.intervals) {
      clearInterval(interval);
    }
    this.intervals.clear();
  }
}

export const agentScheduler = new AgentScheduler();
