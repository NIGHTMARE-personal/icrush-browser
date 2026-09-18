"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.APPROVAL_TTL_MS = exports.MAX_AUDIT_EVENTS = exports.TIER_RANK = void 0;
exports.classifyAgentAction = classifyAgentAction;
exports.domainOf = domainOf;
exports.crossesTrustBoundary = crossesTrustBoundary;
exports.defaultPolicyStore = defaultPolicyStore;
exports.effectivePolicy = effectivePolicy;
exports.evaluateAction = evaluateAction;
exports.newPromptId = newPromptId;
exports.buildAuditEvent = buildAuditEvent;
exports.appendAuditEvent = appendAuditEvent;
exports.loadPolicyStore = loadPolicyStore;
exports.savePolicyStore = savePolicyStore;
exports.loadAuditLog = loadAuditLog;
exports.appendAuditLogFile = appendAuditLogFile;
/**
 * Agent Permission Policy & Audit Ledger (main process)
 *
 * Pure policy logic — no Electron imports so Vitest can exercise it directly.
 * Persistence helpers take explicit file paths; main.ts passes userData paths.
 */
const fs_1 = __importDefault(require("fs"));
const path_1 = __importDefault(require("path"));
const crypto_1 = __importDefault(require("crypto"));
const agent_engine_1 = require("./agent-engine");
exports.TIER_RANK = {
    read: 0,
    navigate: 1,
    interact: 2,
    sensitive: 3,
};
exports.MAX_AUDIT_EVENTS = 500;
exports.APPROVAL_TTL_MS = 5 * 60 * 1000;
/**
 * Map a raw agent action to its least-privilege tier.
 * fill_form with sensitive fields, or typing into a sensitive selector,
 * always lands in the sensitive tier and requires approval.
 */
function classifyAgentAction(action) {
    const type = (action.type || 'extract').toLowerCase();
    switch (type) {
        case 'extract':
            return { tier: 'read', requiresApproval: false, reasons: [] };
        case 'scroll':
        case 'wait':
        case 'hover':
            return { tier: 'navigate', requiresApproval: false, reasons: [] };
        case 'click':
        case 'select':
        case 'press_key':
            return { tier: 'interact', requiresApproval: false, reasons: [] };
        case 'type': {
            if (action.selector && (0, agent_engine_1.isSensitiveField)(action.selector)) {
                return {
                    tier: 'sensitive',
                    requiresApproval: true,
                    reasons: [`sensitive selector "${action.selector}"`],
                };
            }
            return { tier: 'interact', requiresApproval: false, reasons: [] };
        }
        case 'fill_form': {
            const fields = action.formFields ?? [];
            const sensitive = (0, agent_engine_1.hasSensitiveFields)(fields);
            if (sensitive.length > 0) {
                return {
                    tier: 'sensitive',
                    requiresApproval: true,
                    reasons: sensitive.map(s => `sensitive field "${s}"`),
                };
            }
            return { tier: 'interact', requiresApproval: false, reasons: [] };
        }
        default:
            return { tier: 'read', requiresApproval: false, reasons: [`unknown action "${type}" treated as read-only`] };
    }
}
/** Extract a normalized domain from a URL; returns '' when unparseable. */
function domainOf(url) {
    if (!url)
        return '';
    try {
        const host = new URL(url).hostname.toLowerCase();
        return host.startsWith('www.') ? host.slice(4) : host;
    }
    catch {
        return '';
    }
}
function isOnionHost(host) {
    return host.endsWith('.onion');
}
/**
 * Detect crossings between trust zones:
 * - onion <-> clearnet transitions
 * - https -> http downgrades
 */
function crossesTrustBoundary(fromUrl, toUrl) {
    const reasons = [];
    let from;
    let to;
    try {
        from = new URL(fromUrl);
        to = new URL(toUrl);
    }
    catch {
        return { crosses: false, reasons: [] };
    }
    const fromOnion = isOnionHost(from.hostname.toLowerCase());
    const toOnion = isOnionHost(to.hostname.toLowerCase());
    if (fromOnion !== toOnion) {
        reasons.push(fromOnion ? 'leaving Tor onion service for clearnet' : 'entering Tor onion service from clearnet');
    }
    if (from.protocol === 'https:' && to.protocol === 'http:') {
        reasons.push('https to http downgrade');
    }
    return { crosses: reasons.length > 0, reasons };
}
/** Safe default: everything allowed but sensitive stays approval-gated. */
function defaultPolicyStore() {
    return { version: 1, defaultMaxTier: 'sensitive', sites: {} };
}
function effectivePolicy(store, domain) {
    const site = domain ? store.sites[domain.toLowerCase()] : undefined;
    if (site)
        return site;
    return { domain, maxTier: store.defaultMaxTier, allowSensitive: true, updatedAt: 0 };
}
/**
 * Evaluate one action against the store for a given page URL.
 * Never throws; unknown input degrades to read-only + approval.
 */
function evaluateAction(store, action, url) {
    const classified = classifyAgentAction(action);
    const domain = domainOf(url);
    const policy = effectivePolicy(store, domain);
    if (exports.TIER_RANK[classified.tier] > exports.TIER_RANK[policy.maxTier]) {
        return {
            allowed: false,
            requiresApproval: false,
            tier: classified.tier,
            reasons: [
                `tier "${classified.tier}" exceeds site limit "${policy.maxTier}" for ${domain || 'this page'}`,
                ...classified.reasons,
            ],
        };
    }
    if (classified.tier === 'sensitive' && !policy.allowSensitive) {
        return {
            allowed: false,
            requiresApproval: false,
            tier: classified.tier,
            reasons: [`sensitive actions are disabled for ${domain || 'this page'}`, ...classified.reasons],
        };
    }
    return {
        allowed: true,
        requiresApproval: classified.requiresApproval,
        tier: classified.tier,
        reasons: classified.reasons,
    };
}
/** Single-use approval token id. */
function newPromptId() {
    if (typeof crypto_1.default.randomUUID === 'function')
        return crypto_1.default.randomUUID();
    return `ap-${Date.now()}-${crypto_1.default.randomBytes(8).toString('hex')}`;
}
function buildAuditEvent(input) {
    const domain = domainOf(input.url);
    return {
        id: newPromptId(),
        ts: Date.now(),
        url: input.url,
        domain,
        actionType: input.actionType,
        tier: input.tier,
        verdict: input.verdict,
        reasons: input.reasons,
        actor: input.actor,
    };
}
/** Pure append with cap; newest last. */
function appendAuditEvent(log, event, max = exports.MAX_AUDIT_EVENTS) {
    const next = [...log, event];
    return next.length > max ? next.slice(next.length - max) : next;
}
// ---------- persistence (explicit paths; main passes userData) ----------
function ensureDirFor(filePath) {
    const dir = path_1.default.dirname(filePath);
    if (!fs_1.default.existsSync(dir))
        fs_1.default.mkdirSync(dir, { recursive: true });
}
function isRecord(value) {
    return typeof value === 'object' && value !== null;
}
function isValidTier(value) {
    return value === 'read' || value === 'navigate' || value === 'interact' || value === 'sensitive';
}
function loadPolicyStore(filePath) {
    const fallback = defaultPolicyStore();
    try {
        if (!fs_1.default.existsSync(filePath))
            return fallback;
        const raw = JSON.parse(fs_1.default.readFileSync(filePath, 'utf-8'));
        if (!isRecord(raw))
            return fallback;
        const sites = {};
        if (isRecord(raw.sites)) {
            for (const [domain, entry] of Object.entries(raw.sites)) {
                if (!isRecord(entry))
                    continue;
                const maxTier = entry.maxTier;
                if (!isValidTier(maxTier))
                    continue;
                sites[domain.toLowerCase()] = {
                    domain: domain.toLowerCase(),
                    maxTier,
                    allowSensitive: entry.allowSensitive !== false,
                    updatedAt: typeof entry.updatedAt === 'number' ? entry.updatedAt : 0,
                };
            }
        }
        return {
            version: 1,
            defaultMaxTier: isValidTier(raw.defaultMaxTier) ? raw.defaultMaxTier : 'sensitive',
            sites,
        };
    }
    catch {
        return fallback;
    }
}
function savePolicyStore(filePath, store) {
    ensureDirFor(filePath);
    fs_1.default.writeFileSync(filePath, JSON.stringify(store, null, 2), 'utf-8');
}
function isAuditEvent(value) {
    if (!isRecord(value))
        return false;
    return (typeof value.id === 'string' &&
        typeof value.ts === 'number' &&
        typeof value.url === 'string' &&
        typeof value.actionType === 'string' &&
        isValidTier(value.tier) &&
        (value.verdict === 'auto-approved' ||
            value.verdict === 'approved' ||
            value.verdict === 'denied' ||
            value.verdict === 'blocked') &&
        Array.isArray(value.reasons));
}
function loadAuditLog(filePath) {
    try {
        if (!fs_1.default.existsSync(filePath))
            return [];
        const raw = JSON.parse(fs_1.default.readFileSync(filePath, 'utf-8'));
        if (!Array.isArray(raw))
            return [];
        return raw.filter(isAuditEvent).slice(-exports.MAX_AUDIT_EVENTS);
    }
    catch {
        return [];
    }
}
function appendAuditLogFile(filePath, event) {
    const log = appendAuditEvent(loadAuditLog(filePath), event);
    try {
        ensureDirFor(filePath);
        fs_1.default.writeFileSync(filePath, JSON.stringify(log, null, 2), 'utf-8');
    }
    catch {
        // Audit persistence is best-effort; the in-memory trail still stands.
    }
    return log;
}
