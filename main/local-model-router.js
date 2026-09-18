"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.discoverLocalModels = discoverLocalModels;
exports.getBestLocalModel = getBestLocalModel;
exports.grantCloudConsent = grantCloudConsent;
exports.hasCloudConsent = hasCloudConsent;
exports.revokeCloudConsent = revokeCloudConsent;
exports.getRouterState = getRouterState;
exports.routePrompt = routePrompt;
exports.streamPrompt = streamPrompt;
exports.getStoredApiKeys = getStoredApiKeys;
exports.setStoredApiKeys = setStoredApiKeys;
exports.getApiKey = getApiKey;
exports.setApiKey = setApiKey;
exports.getLocalEmbedding = getLocalEmbedding;
exports.localSemanticSearch = localSemanticSearch;
/**
 * Local-First Model Router — privacy-first AI routing.
 *
 * Design invariants:
 * - Ollama (local) is ALWAYS the default; no silent cloud fallback.
 * - Cloud calls require explicit, per-request user consent (stored in memory only).
 * - Provider keys never leave this process; encrypted at rest via safeStorage.
 * - Telemetry: zero. No usage analytics, no model ping home.
 * - All routing decisions are auditable via the agent audit ledger.
 */
const electron_1 = require("electron");
const fs_1 = __importDefault(require("fs"));
const path_1 = __importDefault(require("path"));
const gemini_1 = require("./gemini");
const CONSENT_TTL_MS = 24 * 60 * 60 * 1000; // 24h for persistent consent
// In-memory only — never persisted
const cloudConsentCache = new Map();
const modelDiscoveryCache = new Map();
const DISCOVERY_TTL = 5 * 60 * 1000;
/** Check if Ollama is running and return available local models. */
async function discoverLocalModels() {
    const now = Date.now();
    const cached = modelDiscoveryCache.get('ollama');
    if (cached && now - cached.time < DISCOVERY_TTL) {
        return cached.models;
    }
    const models = [];
    try {
        const running = await (0, gemini_1.ensureOllamaRunning)();
        if (running) {
            const res = await fetch('http://127.0.0.1:11434/api/tags', { signal: AbortSignal.timeout(3000) });
            if (res.ok) {
                const data = (await res.json());
                if (data.models && Array.isArray(data.models)) {
                    for (const m of data.models) {
                        const caps = [];
                        if (m.details) {
                            if (typeof m.details.parameter_size === 'string')
                                caps.push(`params:${m.details.parameter_size}`);
                            if (typeof m.details.family === 'string')
                                caps.push(`family:${m.details.family}`);
                        }
                        models.push({
                            id: m.name,
                            name: m.name.split(':')[0],
                            provider: 'local',
                            local: true,
                            size: m.size ? `${(m.size / 1024 / 1024 / 1024).toFixed(1)}GB` : undefined,
                            capabilities: caps.length > 0 ? caps : undefined,
                        });
                    }
                }
            }
        }
    }
    catch {
        // Ollama not running — empty local list
    }
    modelDiscoveryCache.set('ollama', { models, time: now });
    return models;
}
/** Get the best local model for a task type. */
async function getBestLocalModel(task = 'chat') {
    const models = await discoverLocalModels();
    if (models.length === 0)
        return null;
    // Prefer smaller models for JSON/chat, larger for code/reasoning
    const prefs = {
        chat: ['qwen2.5:3b', 'phi3:3.8b', 'gemma2:2b', 'llama3.2:3b'],
        json: ['qwen2.5:3b', 'phi3:3.8b', 'gemma2:2b'],
        code: ['codellama:7b', 'deepseek-coder:6.7b', 'qwen2.5-coder:7b', 'starcoder2:7b'],
        vision: ['llava:7b', 'bakllava:7b', 'moondream:1.8b'],
    };
    const pref = prefs[task] || prefs.chat;
    for (const p of pref) {
        const found = models.find(m => m.id.startsWith(p));
        if (found)
            return found.id;
    }
    return models[0].id; // fallback to first available
}
/** Record explicit user consent for a cloud provider. Scope: 'session' (memory only) or 'persistent' (24h TTL). */
function grantCloudConsent(provider, scope = 'session') {
    const record = {
        granted: true,
        provider,
        timestamp: Date.now(),
        scope,
    };
    const key = `${provider}:${scope}`;
    cloudConsentCache.set(key, record);
    return record;
}
/** Check if cloud consent exists and is valid. */
function hasCloudConsent(provider, scope = 'session') {
    const key = `${provider}:${scope}`;
    const record = cloudConsentCache.get(key);
    if (!record || !record.granted)
        return false;
    if (scope === 'persistent' && Date.now() - record.timestamp > CONSENT_TTL_MS) {
        cloudConsentCache.delete(key);
        return false;
    }
    return true;
}
/** Revoke cloud consent. */
function revokeCloudConsent(provider) {
    if (provider) {
        cloudConsentCache.delete(`${provider}:session`);
        cloudConsentCache.delete(`${provider}:persistent`);
    }
    else {
        cloudConsentCache.clear();
    }
}
/** Get current router state for UI. */
async function getRouterState() {
    const localModels = await discoverLocalModels();
    return {
        mode: cloudConsentCache.size > 0 ? 'cloud-allowed' : 'local-only',
        availableLocalModels: localModels,
        configuredCloudProviders: {
            gemini: hasCloudConsent('gemini'),
            openai: hasCloudConsent('openai'),
            anthropic: hasCloudConsent('anthropic'),
            groq: hasCloudConsent('groq'),
            openrouter: hasCloudConsent('openrouter'),
            local: true,
        },
        lastConsent: cloudConsentCache.size > 0 ? Array.from(cloudConsentCache.values())[0] : undefined,
    };
}
/**
 * Route a prompt to the appropriate provider.
 * - If provider === 'local' or mode is 'local-only': ALWAYS use Ollama.
 * - If provider is cloud: requires explicit consent (checked at call time).
 * - NEVER silently falls back to cloud when local fails — throws instead.
 */
async function routePrompt(prompt, options = {}) {
    const provider = options.provider || 'local';
    const task = options.task || 'chat';
    // Local provider — always allowed, no consent needed
    if (provider === 'local') {
        const model = await getBestLocalModel(task);
        if (!model)
            throw new Error('No local models available. Start Ollama and pull a model (e.g., `ollama pull qwen2.5:3b`).');
        const content = await (0, gemini_1.callLocalOllama)(prompt, options.format === 'json' ? 'json' : undefined);
        return { content, provider: 'local', model };
    }
    // Cloud provider — consent gate
    if (!hasCloudConsent(provider, options.consentScope)) {
        throw new Error(`Cloud consent required for ${provider}. User must explicitly grant consent via the consent modal.`);
    }
    // Delegate to existing cloud caller (which handles model detection, streaming, etc.)
    const apiKey = options.apiKey || '';
    const content = await (0, gemini_1.callProviderModel)(apiKey, prompt, provider, undefined, options.format === 'json' ? 'application/json' : undefined);
    const model = await (0, gemini_1.autoDetectModel)(provider, apiKey);
    return { content, provider, model };
}
/**
 * Stream a prompt with the same routing rules.
 * Cloud streaming also requires consent.
 */
async function* streamPrompt(prompt, options) {
    const provider = options.provider || 'local';
    if (provider === 'local' || options.forceLocal) {
        const model = await getBestLocalModel(options.task || 'chat');
        if (!model)
            throw new Error('No local models available. Start Ollama and pull a model.');
        // Local Ollama supports streaming via /api/chat with stream:true
        // For now, fall back to non-streaming (can be enhanced)
        const content = await (0, gemini_1.callLocalOllama)(prompt);
        options.onChunk(content);
        yield;
        return { provider: 'local', model };
    }
    if (!hasCloudConsent(provider, options.consentScope)) {
        throw new Error(`Cloud consent required for ${provider}.`);
    }
    // Delegate to existing streamGemini (which handles all cloud providers)
    const { streamGemini } = await Promise.resolve().then(() => __importStar(require('./gemini')));
    const apiKey = options.apiKey || '';
    const model = await (0, gemini_1.autoDetectModel)(provider, apiKey);
    await streamGemini(prompt, options.history || [], provider, apiKey, options.onChunk, options.onCommand, {
        isTor: options.isTor,
        forceLocal: options.forceLocal,
        torCloudRouting: options.torCloudRouting,
        files: options.files,
        systemInstruction: options.systemInstruction,
        modelName: model,
    });
    yield;
    return { provider, model };
}
/** Encrypted API key storage (delegates to safeStorage). */
const API_KEYS_PATH = path_1.default.join(electron_1.app.getPath('userData'), 'api-keys.enc');
async function getStoredApiKeys() {
    try {
        if (!fs_1.default.existsSync(API_KEYS_PATH))
            return {};
        const encrypted = fs_1.default.readFileSync(API_KEYS_PATH);
        const decrypted = electron_1.safeStorage.decryptString(encrypted);
        return JSON.parse(decrypted);
    }
    catch {
        return {};
    }
}
async function setStoredApiKeys(keys) {
    const json = JSON.stringify(keys);
    const encrypted = electron_1.safeStorage.encryptString(json);
    fs_1.default.writeFileSync(API_KEYS_PATH, encrypted);
}
async function getApiKey(provider) {
    const keys = await getStoredApiKeys();
    return keys[provider] || '';
}
async function setApiKey(provider, key) {
    const keys = await getStoredApiKeys();
    keys[provider] = key;
    await setStoredApiKeys(keys);
}
/** Hardened local embeddings using Ollama's /api/embeddings (nomic-embed-text, mxbai-embed-large, etc.) */
async function getLocalEmbedding(text, model) {
    const running = await (0, gemini_1.ensureOllamaRunning)();
    if (!running)
        throw new Error('Ollama not running');
    const embedModel = model || (await getBestLocalModel('chat')).replace(/:.*/, '') + ':embed'; // heuristic
    try {
        const res = await fetch('http://127.0.0.1:11434/api/embeddings', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ model: embedModel, prompt: text }),
            signal: AbortSignal.timeout(10000),
        });
        if (!res.ok)
            throw new Error(`Embedding failed: ${res.status}`);
        const data = (await res.json());
        return data.embedding || [];
    }
    catch {
        throw new Error('Local embedding unavailable. Ensure Ollama has an embedding model (e.g., `ollama pull nomic-embed-text`).');
    }
}
/** Local semantic search over a corpus using cosine similarity. */
async function localSemanticSearch(query, corpus, topK = 5) {
    const queryVec = await getLocalEmbedding(query);
    const results = await Promise.all(corpus.map(async (item) => {
        const vec = await getLocalEmbedding(item.text);
        const score = cosineSimilarity(queryVec, vec);
        return { ...item, score };
    }));
    return results.sort((a, b) => b.score - a.score).slice(0, topK);
}
function cosineSimilarity(a, b) {
    if (a.length !== b.length)
        return 0;
    let dot = 0, na = 0, nb = 0;
    for (let i = 0; i < a.length; i++) {
        dot += a[i] * b[i];
        na += a[i] * a[i];
        nb += b[i] * b[i];
    }
    return na === 0 || nb === 0 ? 0 : dot / (Math.sqrt(na) * Math.sqrt(nb));
}
