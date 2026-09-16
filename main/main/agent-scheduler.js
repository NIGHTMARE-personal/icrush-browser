"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.agentScheduler = void 0;
const uuid_1 = require("uuid");
class AgentScheduler {
    constructor() {
        Object.defineProperty(this, "tasks", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: new Map()
        });
        Object.defineProperty(this, "intervals", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: new Map()
        });
        Object.defineProperty(this, "onExecute", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: void 0
        });
    }
    setExecutor(executor) {
        this.onExecute = executor;
    }
    addTask(name, goal, cronExpression) {
        const id = (0, uuid_1.v4)();
        const task = {
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
    removeTask(taskId) {
        const task = this.tasks.get(taskId);
        if (!task)
            return false;
        const interval = this.intervals.get(taskId);
        if (interval)
            clearInterval(interval);
        this.intervals.delete(taskId);
        this.tasks.delete(taskId);
        this.saveTasks();
        return true;
    }
    updateTask(taskId, updates) {
        const task = this.tasks.get(taskId);
        if (!task)
            return false;
        const interval = this.intervals.get(taskId);
        if (interval)
            clearInterval(interval);
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
    enableTask(taskId) {
        const task = this.tasks.get(taskId);
        if (!task)
            return false;
        task.enabled = true;
        this.scheduleTask(task);
        this.saveTasks();
        return true;
    }
    disableTask(taskId) {
        const task = this.tasks.get(taskId);
        if (!task)
            return false;
        task.enabled = false;
        const interval = this.intervals.get(taskId);
        if (interval)
            clearInterval(interval);
        this.intervals.delete(taskId);
        this.saveTasks();
        return true;
    }
    getTask(taskId) {
        return this.tasks.get(taskId);
    }
    getAllTasks() {
        return Array.from(this.tasks.values());
    }
    getEnabledTasks() {
        return Array.from(this.tasks.values()).filter(t => t.enabled);
    }
    async runTaskNow(taskId) {
        const task = this.tasks.get(taskId);
        if (!task || !this.onExecute)
            return false;
        try {
            await this.onExecute(task.goal);
            task.lastRun = Date.now();
            this.saveTasks();
            return true;
        }
        catch (err) {
            console.error('[AgentScheduler] Task execution failed:', err);
            return false;
        }
    }
    scheduleTask(task) {
        if (!task.enabled)
            return;
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
                    }
                    catch (err) {
                        console.error(`[AgentScheduler] Failed to run task ${task.name}:`, err);
                    }
                }
            }
        }, checkInterval);
        this.intervals.set(task.id, interval);
    }
    getNextRunTime(cronExpression) {
        const now = new Date();
        const parts = cronExpression.split(' ');
        if (parts.length !== 5)
            return now.getTime() + 3600000;
        const [minute, hour, dayOfMonth, month, dayOfWeek] = parts;
        const next = new Date(now);
        // Parse minute
        if (minute !== '*') {
            const min = parseInt(minute);
            if (!isNaN(min))
                next.setMinutes(min);
        }
        // Parse hour
        if (hour !== '*') {
            const hr = parseInt(hour);
            if (!isNaN(hr))
                next.setHours(hr);
        }
        // Parse day of month
        if (dayOfMonth !== '*') {
            const dom = parseInt(dayOfMonth);
            if (!isNaN(dom))
                next.setDate(dom);
        }
        // Parse month
        if (month !== '*') {
            const m = parseInt(month) - 1;
            if (!isNaN(m))
                next.setMonth(m);
        }
        // If the computed time is in the past, add a day
        if (next.getTime() <= now.getTime()) {
            next.setDate(next.getDate() + 1);
        }
        return next.getTime();
    }
    parseCronExpression(expr) {
        const parts = expr.split(' ');
        if (parts.length !== 5)
            return null;
        return {
            minute: this.parseCronField(parts[0], 0, 59),
            hour: this.parseCronField(parts[1], 0, 23),
            dayOfMonth: this.parseCronField(parts[2], 1, 31),
            month: this.parseCronField(parts[3], 1, 12),
            dayOfWeek: this.parseCronField(parts[4], 0, 6),
        };
    }
    parseCronField(field, min, max) {
        if (field === '*') {
            return Array.from({ length: max - min + 1 }, (_, i) => i + min);
        }
        const values = [];
        // Handle comma-separated values
        const parts = field.split(',');
        for (const part of parts) {
            // Handle ranges
            if (part.includes('-')) {
                const [start, end] = part.split('-').map(Number);
                for (let i = start; i <= end; i++) {
                    values.push(i);
                }
            }
            else {
                values.push(parseInt(part));
            }
        }
        return values;
    }
    saveTasks() {
        try {
            const tasks = Array.from(this.tasks.values());
            localStorage.setItem('agent-scheduled-tasks', JSON.stringify(tasks));
        }
        catch (err) {
            console.error('[AgentScheduler] Failed to save tasks:', err);
        }
    }
    loadTasks() {
        try {
            const stored = localStorage.getItem('agent-scheduled-tasks');
            if (stored) {
                const tasks = JSON.parse(stored);
                for (const task of tasks) {
                    this.tasks.set(task.id, task);
                    if (task.enabled) {
                        this.scheduleTask(task);
                    }
                }
            }
        }
        catch (err) {
            console.error('[AgentScheduler] Failed to load tasks:', err);
        }
    }
    stopAll() {
        for (const [id, interval] of this.intervals) {
            clearInterval(interval);
        }
        this.intervals.clear();
    }
}
exports.agentScheduler = new AgentScheduler();
