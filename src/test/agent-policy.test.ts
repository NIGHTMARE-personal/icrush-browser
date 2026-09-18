import { describe, it, expect } from 'vitest';
import {
  classifyAgentAction,
  crossesTrustBoundary,
  defaultPolicyStore,
  domainOf,
  effectivePolicy,
  evaluateAction,
  appendAuditEvent,
  buildAuditEvent,
} from '../../main/agent-policy.js';

describe('agent-policy', () => {
  describe('classifyAgentAction', () => {
    it('maps extract to read-only without approval', () => {
      expect(classifyAgentAction({ type: 'extract' })).toMatchObject({ tier: 'read', requiresApproval: false });
    });

    it('maps scroll/wait/hover to navigate without approval', () => {
      for (const type of ['scroll', 'wait', 'hover']) {
        expect(classifyAgentAction({ type })).toMatchObject({ tier: 'navigate', requiresApproval: false });
      }
    });

    it('maps click/select/press_key to interact without approval', () => {
      for (const type of ['click', 'select', 'press_key']) {
        expect(classifyAgentAction({ type })).toMatchObject({ tier: 'interact', requiresApproval: false });
      }
    });

    it('maps plain type to interact without approval', () => {
      expect(classifyAgentAction({ type: 'type', selector: '#search', text: 'hi' })).toMatchObject({
        tier: 'interact',
        requiresApproval: false,
      });
    });

    it('escalates typing into a password selector to sensitive with approval', () => {
      const c = classifyAgentAction({ type: 'type', selector: '#password', text: 'x' });
      expect(c.tier).toBe('sensitive');
      expect(c.requiresApproval).toBe(true);
    });

    it('escalates fill_form with sensitive fields to sensitive with approval', () => {
      const c = classifyAgentAction({
        type: 'fill_form',
        formFields: [
          { selector: '#user', value: 'a' },
          { selector: '#credit-card', value: '4111' },
        ],
      });
      expect(c.tier).toBe('sensitive');
      expect(c.requiresApproval).toBe(true);
      expect(c.reasons.length).toBeGreaterThan(0);
    });

    it('keeps non-sensitive fill_form at interact', () => {
      const c = classifyAgentAction({ type: 'fill_form', formFields: [{ selector: '#q', value: 'x' }] });
      expect(c).toMatchObject({ tier: 'interact', requiresApproval: false });
    });
  });

  describe('domainOf', () => {
    it('extracts and normalizes domains', () => {
      expect(domainOf('https://WWW.Example.com/path')).toBe('example.com');
      expect(domainOf('http://x.onion/')).toBe('x.onion');
      expect(domainOf('not a url')).toBe('');
      expect(domainOf(undefined)).toBe('');
    });
  });

  describe('crossesTrustBoundary', () => {
    it('flags onion to clearnet transitions', () => {
      const r = crossesTrustBoundary('http://abc.onion/', 'https://example.com/');
      expect(r.crosses).toBe(true);
    });

    it('flags clearnet to onion transitions', () => {
      const r = crossesTrustBoundary('https://example.com/', 'http://abc.onion/');
      expect(r.crosses).toBe(true);
    });

    it('flags https to http downgrades', () => {
      const r = crossesTrustBoundary('https://example.com/', 'http://example.com/');
      expect(r.crosses).toBe(true);
    });

    it('passes same-zone https navigation', () => {
      const r = crossesTrustBoundary('https://a.com/', 'https://b.com/');
      expect(r.crosses).toBe(false);
    });
  });

  describe('evaluateAction', () => {
    it('auto-approves read actions under the default store', () => {
      const v = evaluateAction(defaultPolicyStore(), { type: 'extract' }, 'https://example.com/');
      expect(v).toMatchObject({ allowed: true, requiresApproval: false, tier: 'read' });
    });

    it('requires approval for sensitive actions by default', () => {
      const v = evaluateAction(
        defaultPolicyStore(),
        { type: 'type', selector: '#password', text: 'x' },
        'https://example.com/',
      );
      expect(v).toMatchObject({ allowed: true, requiresApproval: true, tier: 'sensitive' });
    });

    it('blocks tiers above the site limit', () => {
      const store = defaultPolicyStore();
      store.sites['example.com'] = { domain: 'example.com', maxTier: 'read', allowSensitive: true, updatedAt: 0 };
      const v = evaluateAction(store, { type: 'click', selector: '#b' }, 'https://example.com/');
      expect(v.allowed).toBe(false);
      expect(v.requiresApproval).toBe(false);
    });

    it('blocks sensitive actions when the site disables them', () => {
      const store = defaultPolicyStore();
      store.sites['bank.com'] = { domain: 'bank.com', maxTier: 'sensitive', allowSensitive: false, updatedAt: 0 };
      const v = evaluateAction(store, { type: 'type', selector: '#pin', text: '1' }, 'https://bank.com/');
      expect(v.allowed).toBe(false);
    });

    it('falls back to defaults for unknown domains', () => {
      expect(effectivePolicy(defaultPolicyStore(), 'new.com').maxTier).toBe('sensitive');
    });
  });

  describe('audit ledger', () => {
    it('builds events with normalized domains', () => {
      const e = buildAuditEvent({
        url: 'https://WWW.Example.com/x',
        actionType: 'click',
        tier: 'interact',
        verdict: 'auto-approved',
        reasons: [],
      });
      expect(e.domain).toBe('example.com');
      expect(e.id.length).toBeGreaterThan(0);
    });

    it('caps the log at the max size', () => {
      let log = Array.from({ length: 5 }, (_, i) =>
        buildAuditEvent({ url: 'https://a.com/', actionType: 'extract', tier: 'read', verdict: 'auto-approved', reasons: [`${i}`] }),
      );
      for (let i = 0; i < 600; i++) {
        log = appendAuditEvent(log, buildAuditEvent({ url: 'https://a.com/', actionType: 'extract', tier: 'read', verdict: 'auto-approved', reasons: [] }), 500);
      }
      expect(log.length).toBe(500);
    });
  });
});
