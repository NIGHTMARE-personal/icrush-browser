"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.AgentMemory = void 0;
/**
 * Agent Memory System — episodic memory, vector search, and skill distillation.
 *
 * Memory types:
 * - Episodic: Complete task traces (goal → steps → result → observation)
 * - Semantic: Facts and knowledge extracted from pages
 * - Procedural: Learned skills (reusable step sequences)
 * - Working: Current task context (transient)
 *
 * Skill distillation:
 * - Successful task traces are distilled into reusable skills
 * - Skills are stored with trigger patterns and success rates
 * - Skills are invoked when similar goals are detected
 *
 * Design invariants:
 * - All memory is stored locally (encrypted via agentVault)
 * - Vector embeddings use Ollama (nomic-embed-text) — fully offline
 * - Memory is bounded (max entries, TTL)
 * - No external services — 100% on-device
 */
const agent_memory_vault_1 = require("./agent-memory-vault");
const local_model_router_1 = require("./local-model-router");
// ─── Memory System ────────────────────────────────────────────────────────
const MEMORY_PREFIX = 'mem:';
const SKILL_PREFIX = 'skill:';
const SEMANTIC_PREFIX = 'sem:';
const WORKING_PREFIX = 'work:';
const MAX_ENTRIES = 2000;
const MAX_EPISODIC = 500;
const MAX_SEMANTIC = 1000;
const MAX_SKILLS = 100;
const DEFAULT_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 days
const COMPACTION_INTERVAL = 24 * 60 * 60 * 1000; // 24h
class AgentMemory {
    constructor() {
        Object.defineProperty(this, "embeddingCache", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: new Map()
        });
        Object.defineProperty(this, "lastCompaction", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: 0
        });
    }
    // ─── Episodic Memory ──────────────────────────────────────────────
    async recordEpisode(trace) {
        const id = `ep-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
        const content = this.serializeEpisode(trace);
        const embedding = await this.getEmbedding(content);
        const entry = {
            id,
            type: 'episodic',
            content,
            metadata: {
                goal: trace.goal,
                url: trace.url,
                success: trace.success,
                durationMs: trace.durationMs,
                totalSteps: trace.totalSteps,
                error: trace.error,
            },
            embedding,
            createdAt: Date.now(),
            lastAccessed: Date.now(),
            accessCount: 0,
            ttl: DEFAULT_TTL_MS,
            tags: this.extractTags(trace.goal),
        };
        this.storeEntry(entry);
        await this.maybeDistillSkill(trace, id);
        return id;
    }
    async searchEpisodes(query, limit = 5) {
        const allEpisodes = this.getEntriesByType('episodic');
        const results = await (0, local_model_router_1.localSemanticSearch)(query, allEpisodes.map(e => ({ id: e.id, text: e.content, metadata: e.metadata })), limit);
        return results.map(r => allEpisodes.find(e => e.id === r.id)).filter(Boolean);
    }
    async getRecentEpisodes(limit = 10) {
        return this.getEntriesByType('episodic')
            .sort((a, b) => b.createdAt - a.createdAt)
            .slice(0, limit);
    }
    // ─── Semantic Memory ──────────────────────────────────────────────
    async recordFact(fact) {
        const id = `sem-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
        const content = `${fact.subject} ${fact.predicate} ${fact.object}`;
        const embedding = await this.getEmbedding(content);
        const entry = {
            id,
            type: 'semantic',
            content,
            metadata: { subject: fact.subject, predicate: fact.predicate, object: fact.object, sourceUrl: fact.sourceUrl, confidence: fact.confidence },
            embedding,
            createdAt: Date.now(),
            lastAccessed: Date.now(),
            accessCount: 0,
            ttl: DEFAULT_TTL_MS,
            tags: [fact.subject, fact.object].map(s => s.toLowerCase().substring(0, 50)),
        };
        this.storeEntry(entry);
        return id;
    }
    async searchFacts(query, limit = 10) {
        const allFacts = this.getEntriesByType('semantic');
        const results = await (0, local_model_router_1.localSemanticSearch)(query, allFacts.map(e => ({ id: e.id, text: e.content, metadata: e.metadata })), limit);
        return results.map(r => {
            const entry = allFacts.find(e => e.id === r.id);
            return entry?.metadata;
        }).filter(Boolean);
    }
    // ─── Procedural Memory (Skills) ──────────────────────────────────
    async recordSkill(skill) {
        const entry = {
            id: skill.id,
            type: 'procedural',
            content: JSON.stringify(skill),
            metadata: { name: skill.name, triggerPattern: skill.triggerPattern, successRate: skill.successRate },
            createdAt: Date.now(),
            lastAccessed: Date.now(),
            accessCount: 0,
            tags: skill.tags,
        };
        this.storeEntry(entry);
    }
    async findMatchingSkills(goal) {
        const allSkills = this.getEntriesByType('procedural');
        const matching = [];
        for (const entry of allSkills) {
            try {
                const skill = JSON.parse(entry.content);
                const pattern = new RegExp(skill.triggerPattern, 'i');
                if (pattern.test(goal)) {
                    entry.lastAccessed = Date.now();
                    entry.accessCount++;
                    this.storeEntry(entry);
                    matching.push(skill);
                }
            }
            catch { /* skip malformed skills */ }
        }
        // Sort by success rate
        matching.sort((a, b) => b.successRate - a.successRate);
        return matching;
    }
    async updateSkillStats(skillId, success) {
        const entries = this.getEntriesByType('procedural');
        const entry = entries.find(e => e.id === skillId);
        if (!entry)
            return;
        try {
            const skill = JSON.parse(entry.content);
            skill.totalUses++;
            if (success)
                skill.successfulUses++;
            skill.successRate = skill.totalUses > 0 ? skill.successfulUses / skill.totalUses : 0;
            skill.lastUsed = Date.now();
            entry.content = JSON.stringify(skill);
            entry.lastAccessed = Date.now();
            this.storeEntry(entry);
        }
        catch { /* skip */ }
    }
    async getSkillReferences() {
        const entries = this.getEntriesByType('procedural');
        return entries.map(entry => {
            try {
                const skill = JSON.parse(entry.content);
                return {
                    id: skill.id,
                    name: skill.name,
                    triggerPattern: skill.triggerPattern,
                    steps: skill.steps,
                    successRate: skill.successRate,
                    lastUsed: skill.lastUsed,
                };
            }
            catch {
                return null;
            }
        }).filter((s) => s !== null);
    }
    // ─── Working Memory ───────────────────────────────────────────────
    setWorkingMemory(sessionId, data) {
        const existing = this.getEntry(`${WORKING_PREFIX}${sessionId}`) || {
            id: `${WORKING_PREFIX}${sessionId}`,
            type: 'working',
            content: '',
            metadata: {},
            createdAt: Date.now(),
            lastAccessed: Date.now(),
            accessCount: 0,
            tags: [],
        };
        existing.content = JSON.stringify({ ...existing.metadata, ...data });
        existing.metadata = { ...existing.metadata, ...data };
        existing.lastAccessed = Date.now();
        this.storeEntry(existing);
    }
    getWorkingMemory(sessionId) {
        const entry = this.getEntry(`${WORKING_PREFIX}${sessionId}`);
        if (!entry)
            return null;
        return entry.metadata;
    }
    clearWorkingMemory(sessionId) {
        this.deleteEntry(`${WORKING_PREFIX}${sessionId}`);
    }
    // ─── Vector Search ────────────────────────────────────────────────
    async searchAll(query, limit = 10) {
        const allEntries = this.getAllEntries().filter(e => e.type !== 'working');
        if (allEntries.length === 0)
            return [];
        const results = await (0, local_model_router_1.localSemanticSearch)(query, allEntries.map(e => ({ id: e.id, text: e.content, metadata: { type: e.type, tags: e.tags } })), limit);
        return results.map(r => {
            const entry = allEntries.find(e => e.id === r.id);
            return entry ? { entry, score: r.score } : null;
        }).filter((r) => r !== null);
    }
    // ─── Skill Distillation ───────────────────────────────────────────
    async maybeDistillSkill(trace, episodeId) {
        // Only distill successful multi-step traces
        if (!trace.success || trace.steps.length < 3)
            return;
        // Check if we already have a similar skill
        const existing = await this.findMatchingSkills(trace.goal);
        if (existing.length > 0) {
            // Update existing skill stats instead
            await this.updateSkillStats(existing[0].id, true);
            return;
        }
        // Create new skill
        const skill = {
            id: `skill-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
            name: this.generateSkillName(trace.goal),
            description: `Learned from task: ${trace.goal}`,
            triggerPattern: this.generateTriggerPattern(trace.goal),
            steps: trace.steps.map(s => ({
                id: `skill-step-${Math.random().toString(36).slice(2, 7)}`,
                index: 0,
                action: s.action,
                rationale: '',
                expectedOutcome: '',
                status: 'pending',
            })),
            successRate: 1.0,
            totalUses: 1,
            successfulUses: 1,
            lastUsed: Date.now(),
            createdAt: Date.now(),
            tags: this.extractTags(trace.goal),
            sourceEpisodeId: episodeId,
        };
        await this.recordSkill(skill);
    }
    generateSkillName(goal) {
        const words = goal.split(/\s+/).slice(0, 5);
        return words.map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
    }
    generateTriggerPattern(goal) {
        // Extract key words and create a regex pattern
        const words = goal.toLowerCase().split(/\s+/).filter(w => w.length > 3);
        const keywords = words.slice(0, 4);
        return keywords.map(w => w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|');
    }
    // ─── Embedding Helper ─────────────────────────────────────────────
    async getEmbedding(text) {
        const cached = this.embeddingCache.get(text);
        if (cached)
            return cached;
        try {
            const embedding = await (0, local_model_router_1.getLocalEmbedding)(text);
            this.embeddingCache.set(text, embedding);
            // Limit cache size
            if (this.embeddingCache.size > 500) {
                const firstKey = this.embeddingCache.keys().next().value;
                if (firstKey)
                    this.embeddingCache.delete(firstKey);
            }
            return embedding;
        }
        catch {
            return [];
        }
    }
    // ─── Storage Helpers ──────────────────────────────────────────────
    storeEntry(entry) {
        const key = this.getEntryKey(entry);
        agent_memory_vault_1.agentVault.set(key, JSON.stringify(entry), entry.type === 'semantic' ? 'user_preference' : 'task_state');
    }
    getEntry(id) {
        const all = agent_memory_vault_1.agentVault.list();
        for (const [key, value] of Object.entries(all)) {
            if (key.endsWith(`:${id}`)) {
                try {
                    return JSON.parse(value);
                }
                catch { /* skip */ }
            }
        }
        return null;
    }
    deleteEntry(id) {
        const all = agent_memory_vault_1.agentVault.list();
        for (const key of Object.keys(all)) {
            if (key.endsWith(`:${id}`)) {
                agent_memory_vault_1.agentVault.delete(key);
                break;
            }
        }
    }
    getAllEntries() {
        const all = agent_memory_vault_1.agentVault.list();
        const entries = [];
        for (const [key, value] of Object.entries(all)) {
            if (key.startsWith(MEMORY_PREFIX) || key.startsWith(SKILL_PREFIX) || key.startsWith(SEMANTIC_PREFIX) || key.startsWith(WORKING_PREFIX)) {
                try {
                    entries.push(JSON.parse(value));
                }
                catch { /* skip */ }
            }
        }
        return entries;
    }
    getEntriesByType(type) {
        return this.getAllEntries().filter(e => e.type === type);
    }
    getEntryKey(entry) {
        switch (entry.type) {
            case 'episodic': return `${MEMORY_PREFIX}ep:${entry.id}`;
            case 'semantic': return `${SEMANTIC_PREFIX}${entry.id}`;
            case 'procedural': return `${SKILL_PREFIX}${entry.id}`;
            case 'working': return `${WORKING_PREFIX}${entry.id}`;
        }
    }
    extractTags(text) {
        const stopWords = new Set(['the', 'a', 'an', 'is', 'are', 'was', 'were', 'be', 'been', 'being', 'have', 'has', 'had', 'do', 'does', 'did', 'will', 'would', 'could', 'should', 'may', 'might', 'can', 'shall', 'to', 'of', 'in', 'for', 'on', 'with', 'at', 'by', 'from', 'as', 'into', 'through', 'during', 'before', 'after', 'above', 'below', 'between', 'out', 'off', 'over', 'under', 'again', 'further', 'then', 'once', 'and', 'but', 'or', 'nor', 'not', 'so', 'yet', 'both', 'either', 'neither', 'each', 'every', 'all', 'any', 'few', 'more', 'most', 'other', 'some', 'such', 'no', 'only', 'own', 'same', 'than', 'too', 'very', 'just']);
        return text.toLowerCase().split(/\s+/).filter(w => w.length > 2 && !stopWords.has(w)).slice(0, 10);
    }
    serializeEpisode(trace) {
        const parts = [`Goal: ${trace.goal}`];
        if (trace.url)
            parts.push(`URL: ${trace.url}`);
        parts.push(`Success: ${trace.success}`);
        parts.push(`Duration: ${trace.durationMs}ms`);
        parts.push(`Steps (${trace.totalSteps}):`);
        for (const step of trace.steps) {
            parts.push(`  - ${step.action.type}: ${step.action.selector || step.action.text || 'N/A'} → ${step.result.success ? 'OK' : 'FAIL'}`);
        }
        if (trace.error)
            parts.push(`Error: ${trace.error}`);
        return parts.join('\n');
    }
    // ─── Maintenance ──────────────────────────────────────────────────
    async compact() {
        const now = Date.now();
        if (now - this.lastCompaction < COMPACTION_INTERVAL) {
            return { removed: 0, remaining: this.getAllEntries().length };
        }
        this.lastCompaction = now;
        let removed = 0;
        const allEntries = this.getAllEntries();
        for (const entry of allEntries) {
            // Remove expired entries
            if (entry.ttl && now - entry.createdAt > entry.ttl) {
                this.deleteEntry(entry.id);
                removed++;
                continue;
            }
            // Remove low-access entries if over limit
            if (allEntries.length - removed > MAX_ENTRIES) {
                if (entry.accessCount === 0 && now - entry.lastAccessed > 7 * 24 * 60 * 60 * 1000) {
                    this.deleteEntry(entry.id);
                    removed++;
                }
            }
        }
        // Enforce per-type limits
        const byType = {};
        for (const entry of this.getAllEntries()) {
            if (!byType[entry.type])
                byType[entry.type] = [];
            byType[entry.type].push(entry);
        }
        const limits = { episodic: MAX_EPISODIC, semantic: MAX_SEMANTIC, procedural: MAX_SKILLS };
        for (const [type, limit] of Object.entries(limits)) {
            const entries = byType[type] || [];
            if (entries.length > limit) {
                const sorted = entries.sort((a, b) => a.lastAccessed - b.lastAccessed);
                for (const entry of sorted.slice(0, entries.length - limit)) {
                    this.deleteEntry(entry.id);
                    removed++;
                }
            }
        }
        const remaining = this.getAllEntries().length;
        return { removed, remaining };
    }
    getStats() {
        const all = this.getAllEntries();
        const totalSize = all.reduce((sum, e) => sum + e.content.length, 0);
        return {
            totalEntries: all.length,
            episodicCount: all.filter(e => e.type === 'episodic').length,
            semanticCount: all.filter(e => e.type === 'semantic').length,
            proceduralCount: all.filter(e => e.type === 'procedural').length,
            workingCount: all.filter(e => e.type === 'working').length,
            skillCount: all.filter(e => e.type === 'procedural').length,
            totalSizeBytes: totalSize,
            lastCompaction: this.lastCompaction,
        };
    }
}
exports.AgentMemory = AgentMemory;
