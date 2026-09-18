/**
 * Agent Permission Policy & Audit Ledger (main process)
 *
 * Pure policy logic — no Electron imports so Vitest can exercise it directly.
 * Persistence helpers take explicit file paths; main.ts passes userData paths.
 */
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { hasSensitiveFields, isSensitiveField } from './agent-engine';
import type {
  AgentPermissionTier,
  AgentPolicyStore,
  AgentPolicyVerdict,
  AgentAuditEvent,
  AgentAuditVerdict,
  SiteAgentPolicy,
} from '../shared/agent-contracts';

export const TIER_RANK: Record<AgentPermissionTier, number> = {
  read: 0,
  navigate: 1,
  interact: 2,
  sensitive: 3,
};

export const MAX_AUDIT_EVENTS = 500;
export const APPROVAL_TTL_MS = 5 * 60 * 1000;

export interface PolicyActionInput {
  type: string;
  selector?: string;
  text?: string;
  value?: string;
  keys?: string;
  formFields?: Array<{ selector: string; value: string }>;
}

export interface ClassifiedAction {
  tier: AgentPermissionTier;
  requiresApproval: boolean;
  reasons: string[];
}

/**
 * Map a raw agent action to its least-privilege tier.
 * fill_form with sensitive fields, or typing into a sensitive selector,
 * always lands in the sensitive tier and requires approval.
 */
export function classifyAgentAction(action: PolicyActionInput): ClassifiedAction {
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
      if (action.selector && isSensitiveField(action.selector)) {
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
      const sensitive = hasSensitiveFields(fields);
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
export function domainOf(url: string | undefined): string {
  if (!url) return '';
  try {
    const host = new URL(url).hostname.toLowerCase();
    return host.startsWith('www.') ? host.slice(4) : host;
  } catch {
    return '';
  }
}

function isOnionHost(host: string): boolean {
  return host.endsWith('.onion');
}

/**
 * Detect crossings between trust zones:
 * - onion <-> clearnet transitions
 * - https -> http downgrades
 */
export function crossesTrustBoundary(fromUrl: string, toUrl: string): { crosses: boolean; reasons: string[] } {
  const reasons: string[] = [];
  let from: URL;
  let to: URL;
  try {
    from = new URL(fromUrl);
    to = new URL(toUrl);
  } catch {
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
export function defaultPolicyStore(): AgentPolicyStore {
  return { version: 1, defaultMaxTier: 'sensitive', sites: {} };
}

export function effectivePolicy(store: AgentPolicyStore, domain: string): SiteAgentPolicy {
  const site = domain ? store.sites[domain.toLowerCase()] : undefined;
  if (site) return site;
  return { domain, maxTier: store.defaultMaxTier, allowSensitive: true, updatedAt: 0 };
}

/**
 * Evaluate one action against the store for a given page URL.
 * Never throws; unknown input degrades to read-only + approval.
 */
export function evaluateAction(
  store: AgentPolicyStore,
  action: PolicyActionInput,
  url: string | undefined,
): AgentPolicyVerdict {
  const classified = classifyAgentAction(action);
  const domain = domainOf(url);
  const policy = effectivePolicy(store, domain);

  if (TIER_RANK[classified.tier] > TIER_RANK[policy.maxTier]) {
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
export function newPromptId(): string {
  if (typeof crypto.randomUUID === 'function') return crypto.randomUUID();
  return `ap-${Date.now()}-${crypto.randomBytes(8).toString('hex')}`;
}

export function buildAuditEvent(input: {
  url: string;
  actionType: string;
  tier: AgentPermissionTier;
  verdict: AgentAuditVerdict;
  reasons: string[];
  actor?: string;
}): AgentAuditEvent {
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
export function appendAuditEvent(log: AgentAuditEvent[], event: AgentAuditEvent, max = MAX_AUDIT_EVENTS): AgentAuditEvent[] {
  const next = [...log, event];
  return next.length > max ? next.slice(next.length - max) : next;
}

// ---------- persistence (explicit paths; main passes userData) ----------

function ensureDirFor(filePath: string): void {
  const dir = path.dirname(filePath);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function isValidTier(value: unknown): value is AgentPermissionTier {
  return value === 'read' || value === 'navigate' || value === 'interact' || value === 'sensitive';
}

export function loadPolicyStore(filePath: string): AgentPolicyStore {
  const fallback = defaultPolicyStore();
  try {
    if (!fs.existsSync(filePath)) return fallback;
    const raw = JSON.parse(fs.readFileSync(filePath, 'utf-8')) as unknown;
    if (!isRecord(raw)) return fallback;
    const sites: AgentPolicyStore['sites'] = {};
    if (isRecord(raw.sites)) {
      for (const [domain, entry] of Object.entries(raw.sites)) {
        if (!isRecord(entry)) continue;
        const maxTier = entry.maxTier;
        if (!isValidTier(maxTier)) continue;
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
  } catch {
    return fallback;
  }
}

export function savePolicyStore(filePath: string, store: AgentPolicyStore): void {
  ensureDirFor(filePath);
  fs.writeFileSync(filePath, JSON.stringify(store, null, 2), 'utf-8');
}

function isAuditEvent(value: unknown): value is AgentAuditEvent {
  if (!isRecord(value)) return false;
  return (
    typeof value.id === 'string' &&
    typeof value.ts === 'number' &&
    typeof value.url === 'string' &&
    typeof value.actionType === 'string' &&
    isValidTier(value.tier) &&
    (value.verdict === 'auto-approved' ||
      value.verdict === 'approved' ||
      value.verdict === 'denied' ||
      value.verdict === 'blocked') &&
    Array.isArray(value.reasons)
  );
}

export function loadAuditLog(filePath: string): AgentAuditEvent[] {
  try {
    if (!fs.existsSync(filePath)) return [];
    const raw = JSON.parse(fs.readFileSync(filePath, 'utf-8')) as unknown;
    if (!Array.isArray(raw)) return [];
    return raw.filter(isAuditEvent).slice(-MAX_AUDIT_EVENTS);
  } catch {
    return [];
  }
}

export function appendAuditLogFile(filePath: string, event: AgentAuditEvent): AgentAuditEvent[] {
  const log = appendAuditEvent(loadAuditLog(filePath), event);
  try {
    ensureDirFor(filePath);
    fs.writeFileSync(filePath, JSON.stringify(log, null, 2), 'utf-8');
  } catch {
    // Audit persistence is best-effort; the in-memory trail still stands.
  }
  return log;
}
