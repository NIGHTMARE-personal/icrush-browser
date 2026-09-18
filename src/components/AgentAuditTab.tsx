import React, { useCallback, useEffect, useState } from 'react';
import type {
  AgentAuditEvent,
  AgentPermissionTier,
  AgentPolicyStore,
  SiteAgentPolicy,
} from '../../shared/agent-contracts';

const TIERS: AgentPermissionTier[] = ['read', 'navigate', 'interact', 'sensitive'];

const VERDICT_COLORS: Record<AgentAuditEvent['verdict'], string> = {
  'auto-approved': '#34d399',
  approved: '#60a5fa',
  denied: '#f87171',
  blocked: '#fb923c',
};

function formatTime(ts: number): string {
  try {
    return new Date(ts).toLocaleTimeString();
  } catch {
    return '';
  }
}

export function AgentAuditTab() {
  const [store, setStore] = useState<AgentPolicyStore | null>(null);
  const [events, setEvents] = useState<AgentAuditEvent[]>([]);
  const [domain, setDomain] = useState('');
  const [maxTier, setMaxTier] = useState<AgentPermissionTier>('sensitive');
  const [allowSensitive, setAllowSensitive] = useState(true);
  const [error, setError] = useState('');

  const refresh = useCallback(async () => {
    try {
      const api = window.electronAPI?.agent;
      if (!api?.getPolicy || !api?.getAuditLog) {
        setError('Agent policy bridge unavailable in this context.');
        return;
      }
      const [policy, log] = await Promise.all([api.getPolicy(), api.getAuditLog()]);
      setStore(policy);
      setEvents([...log].reverse());
      setError('');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load agent policy.');
    }
  }, []);

  useEffect(() => {
    void refresh();
    const api = window.electronAPI?.agent;
    if (!api?.onAuditEvent) return;
    let unsubscribe: (() => void) | undefined;
    try {
      unsubscribe = api.onAuditEvent(event => {
        setEvents(prev => [event, ...prev].slice(0, 200));
      });
    } catch {
      // live updates unavailable; manual refresh still works
    }
    return () => {
      try {
        unsubscribe?.();
      } catch {
        // ignore
      }
    };
  }, [refresh]);

  const handleSaveSite = useCallback(async () => {
    const clean = domain.toLowerCase().trim();
    if (!clean) {
      setError('Enter a domain first (e.g. example.com).');
      return;
    }
    try {
      const api = window.electronAPI?.agent;
      if (!api?.setSitePolicy) {
        setError('Agent policy bridge unavailable in this context.');
        return;
      }
      await api.setSitePolicy({ domain: clean, maxTier, allowSensitive });
      setDomain('');
      await refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to save site policy.');
    }
  }, [domain, maxTier, allowSensitive, refresh]);

  const handleClear = useCallback(async () => {
    try {
      const api = window.electronAPI?.agent;
      if (!api?.clearAuditLog) return;
      await api.clearAuditLog();
      await refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to clear audit log.');
    }
  }, [refresh]);

  const sites: SiteAgentPolicy[] = store ? Object.values(store.sites) : [];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
      <div
        style={{
          background: 'rgba(255,255,255,0.03)',
          border: '1px solid rgba(255,255,255,0.08)',
          borderRadius: '10px',
          padding: '14px',
        }}
      >
        <div style={{ fontSize: '13px', fontWeight: 600, color: '#f2ca50', marginBottom: '4px' }}>
          Per-site permission tiers
        </div>
        <div style={{ fontSize: '11px', color: '#a1a1aa', marginBottom: '10px' }}>
          Default ceiling: {store?.defaultMaxTier ?? 'sensitive'}. Sensitive actions always need approval unless a
          site disables them outright.
        </div>
        <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', alignItems: 'center' }}>
          <input
            value={domain}
            onChange={e => setDomain(e.target.value)}
            placeholder="example.com"
            style={{
              background: 'rgba(0,0,0,0.35)',
              border: '1px solid rgba(255,255,255,0.12)',
              borderRadius: '6px',
              color: '#e4e4e7',
              fontSize: '12px',
              padding: '6px 10px',
              minWidth: '160px',
            }}
          />
          <select
            value={maxTier}
            onChange={e => setMaxTier(e.target.value as AgentPermissionTier)}
            style={{
              background: 'rgba(0,0,0,0.35)',
              border: '1px solid rgba(255,255,255,0.12)',
              borderRadius: '6px',
              color: '#e4e4e7',
              fontSize: '12px',
              padding: '6px 8px',
            }}
          >
            {TIERS.map(t => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </select>
          <label style={{ fontSize: '12px', color: '#d4d4d8', display: 'flex', alignItems: 'center', gap: '6px' }}>
            <input type="checkbox" checked={allowSensitive} onChange={e => setAllowSensitive(e.target.checked)} />
            allow sensitive
          </label>
          <button
            type="button"
            onClick={() => void handleSaveSite()}
            style={{
              background: 'rgba(212,175,55,0.15)',
              border: '1px solid rgba(212,175,55,0.45)',
              borderRadius: '6px',
              color: '#f2ca50',
              fontSize: '12px',
              padding: '6px 12px',
              cursor: 'pointer',
            }}
          >
            Save site rule
          </button>
        </div>
        {sites.length > 0 && (
          <div style={{ marginTop: '10px', display: 'flex', flexDirection: 'column', gap: '4px' }}>
            {sites.map(s => (
              <div key={s.domain} style={{ fontSize: '12px', color: '#d4d4d8' }}>
                <span style={{ color: '#e4e4e7', fontWeight: 600 }}>{s.domain}</span>
                {' — max '}
                <span style={{ color: '#f2ca50' }}>{s.maxTier}</span>
                {s.allowSensitive ? '' : ' · sensitive off'}
              </div>
            ))}
          </div>
        )}
      </div>

      <div
        style={{
          background: 'rgba(255,255,255,0.03)',
          border: '1px solid rgba(255,255,255,0.08)',
          borderRadius: '10px',
          padding: '14px',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '10px' }}>
          <div style={{ fontSize: '13px', fontWeight: 600, color: '#f2ca50' }}>
            Audit ledger ({events.length})
          </div>
          <div style={{ display: 'flex', gap: '8px' }}>
            <button
              type="button"
              onClick={() => void refresh()}
              style={{
                background: 'transparent',
                border: '1px solid rgba(255,255,255,0.15)',
                borderRadius: '6px',
                color: '#d4d4d8',
                fontSize: '12px',
                padding: '5px 10px',
                cursor: 'pointer',
              }}
            >
              Refresh
            </button>
            <button
              type="button"
              onClick={() => void handleClear()}
              style={{
                background: 'transparent',
                border: '1px solid rgba(248,113,113,0.4)',
                borderRadius: '6px',
                color: '#f87171',
                fontSize: '12px',
                padding: '5px 10px',
                cursor: 'pointer',
              }}
            >
              Clear
            </button>
          </div>
        </div>
        {error && <div style={{ fontSize: '12px', color: '#f87171', marginBottom: '8px' }}>{error}</div>}
        {events.length === 0 ? (
          <div style={{ fontSize: '12px', color: '#71717a' }}>
            No agent actions recorded yet. Every gated action lands here with its verdict.
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', maxHeight: '320px', overflowY: 'auto' }}>
            {events.map(e => (
              <div
                key={e.id}
                style={{
                  fontSize: '12px',
                  color: '#d4d4d8',
                  background: 'rgba(0,0,0,0.25)',
                  border: '1px solid rgba(255,255,255,0.06)',
                  borderRadius: '6px',
                  padding: '6px 10px',
                }}
              >
                <span style={{ color: '#71717a' }}>{formatTime(e.ts)}</span>{' '}
                <span style={{ color: '#e4e4e7', fontWeight: 600 }}>{e.actionType}</span>{' '}
                <span style={{ color: '#a1a1aa' }}>{e.domain || '(no page)'}</span>{' '}
                <span style={{ color: '#a1a1aa' }}>[{e.tier}]</span>{' '}
                <span style={{ color: VERDICT_COLORS[e.verdict], fontWeight: 600 }}>{e.verdict}</span>
                {e.reasons.length > 0 && (
                  <div style={{ color: '#71717a', fontSize: '11px', marginTop: '2px' }}>{e.reasons.join('; ')}</div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
