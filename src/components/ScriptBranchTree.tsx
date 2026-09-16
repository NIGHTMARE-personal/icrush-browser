import React, { useState, useMemo } from 'react';
import { ModernSlideToggle } from './ModernSlideToggle';

export interface DetectedScriptItem {
  url: string;
  domain: string;
  origin?: string;
  category?: 'first-party' | 'tracker' | 'cdn' | 'third-party';
  status?: 'blocked' | 'allowed';
  timestamp?: number;
}

interface ScriptBranchTreeProps {
  detectedScripts: DetectedScriptItem[] | string[];
  blockedScripts: string[];
  allowedScripts: string[];
  allowFirstPartyScripts: boolean;
  blockScriptsMaster: boolean;
  rootDomain: string;
  onToggleScript: (scriptUrl: string, newStatus: 'blocked' | 'allowed') => void;
  onToggleBranch: (originDomain: string, scripts: string[], action: 'block' | 'allow') => void;
  onToggleAllowFirstParty: (allow: boolean) => void;
  onBlockAllThirdParty: () => void;
  onAllowAll: () => void;
  onBlockAll: () => void;
}

interface ScriptGroup {
  domain: string;
  category: 'first-party' | 'tracker' | 'cdn' | 'third-party';
  scripts: {
    url: string;
    filename: string;
    isBlocked: boolean;
  }[];
}

export const ScriptBranchTree: React.FC<ScriptBranchTreeProps> = ({
  detectedScripts,
  blockedScripts,
  allowedScripts,
  allowFirstPartyScripts,
  blockScriptsMaster,
  rootDomain,
  onToggleScript,
  onToggleBranch,
  onToggleAllowFirstParty,
  onBlockAllThirdParty,
  onAllowAll,
  onBlockAll,
}) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [expandedBranches, setExpandedBranches] = useState<Record<string, boolean>>({});

  // Normalize detected scripts into structured objects
  const normalizedScripts: DetectedScriptItem[] = useMemo(() => {
    return (detectedScripts || []).map((item) => {
      if (typeof item === 'string') {
        let domain = 'unknown';
        try {
          domain = new URL(item).hostname;
        } catch {
          domain = rootDomain || 'unknown';
        }
        return {
          url: item,
          domain,
          origin: domain,
          category: 'third-party',
        };
      }
      return item;
    });
  }, [detectedScripts, rootDomain]);

  // Group scripts by origin domain and category
  const groups: ScriptGroup[] = useMemo(() => {
    const map = new Map<string, ScriptGroup>();
    const cleanRoot = (rootDomain || '').toLowerCase().replace(/^www\./, '');

    for (const item of normalizedScripts) {
      if (!item.url) continue;

      let host = item.domain || 'unknown';
      try {
        if (!item.domain || item.domain === 'unknown') {
          host = new URL(item.url).hostname;
        }
      } catch {
        host = cleanRoot || 'page-scripts';
      }

      const cleanHost = host.toLowerCase().replace(/^www\./, '');
      const isFirstParty = cleanHost === cleanRoot || cleanHost.endsWith('.' + cleanRoot);

      let cat: 'first-party' | 'tracker' | 'cdn' | 'third-party' = item.category || 'third-party';
      if (isFirstParty) {
        cat = 'first-party';
      } else if (
        cleanHost.includes('analytics') ||
        cleanHost.includes('doubleclick') ||
        cleanHost.includes('googleadservices') ||
        cleanHost.includes('facebook') ||
        cleanHost.includes('hotjar') ||
        cleanHost.includes('clarity') ||
        cleanHost.includes('criteo') ||
        cleanHost.includes('tagmanager') ||
        cleanHost.includes('twitter') ||
        cleanHost.includes('tiktok') ||
        cleanHost.includes('scorecardresearch') ||
        cleanHost.includes('adroll')
      ) {
        cat = 'tracker';
      } else if (
        cleanHost.includes('cloudflare') ||
        cleanHost.includes('jsdelivr') ||
        cleanHost.includes('unpkg') ||
        cleanHost.includes('googleapis') ||
        cleanHost.includes('bootstrapcdn') ||
        cleanHost.includes('fastly')
      ) {
        cat = 'cdn';
      }

      if (!map.has(cleanHost)) {
        map.set(cleanHost, {
          domain: cleanHost,
          category: cat,
          scripts: [],
        });
      }

      // Check blocked status
      const isExplicitlyBlocked = (blockedScripts || []).some((p) => item.url.includes(p));
      const isExplicitlyAllowed = (allowedScripts || []).some((p) => item.url.includes(p));
      let isBlocked = false;

      if (isExplicitlyBlocked) {
        isBlocked = true;
      } else if (isExplicitlyAllowed) {
        isBlocked = false;
      } else if (blockScriptsMaster) {
        if (cat === 'first-party' && allowFirstPartyScripts) {
          isBlocked = false;
        } else {
          isBlocked = true;
        }
      }

      // Extract friendly filename
      let filename = item.url;
      try {
        const u = new URL(item.url);
        const parts = u.pathname.split('/').filter(Boolean);
        filename = parts.length > 0 ? parts[parts.length - 1] : u.hostname;
        if (u.search && u.search.length < 24) {
          filename += u.search;
        }
      } catch {
        filename = item.url.slice(-30);
      }

      map.get(cleanHost)!.scripts.push({
        url: item.url,
        filename,
        isBlocked,
      });
    }

    // Sort: First party first, then Trackers, then CDNs, then Third-party
    const order = { 'first-party': 0, tracker: 1, cdn: 2, 'third-party': 3 };
    return Array.from(map.values()).sort((a, b) => {
      const diff = order[a.category] - order[b.category];
      if (diff !== 0) return diff;
      return a.domain.localeCompare(b.domain);
    });
  }, [normalizedScripts, rootDomain, blockedScripts, allowedScripts, blockScriptsMaster, allowFirstPartyScripts]);

  // Filtered groups by search
  const filteredGroups = useMemo(() => {
    if (!searchQuery.trim()) return groups;
    const q = searchQuery.toLowerCase().trim();
    return groups
      .map((g) => ({
        ...g,
        scripts: g.scripts.filter(
          (s) =>
            s.url.toLowerCase().includes(q) ||
            s.filename.toLowerCase().includes(q) ||
            g.domain.toLowerCase().includes(q)
        ),
      }))
      .filter((g) => g.scripts.length > 0 || g.domain.toLowerCase().includes(q));
  }, [groups, searchQuery]);

  const toggleBranchExpanded = (domain: string) => {
    setExpandedBranches((prev) => ({
      ...prev,
      [domain]: prev[domain] === undefined ? false : !prev[domain], // default open
    }));
  };

  const getCategoryBadge = (category: string) => {
    switch (category) {
      case 'first-party':
        return {
          label: '1ST PARTY',
          bg: 'rgba(16, 185, 129, 0.15)',
          color: '#10b981',
          border: '1px solid rgba(16, 185, 129, 0.3)',
        };
      case 'tracker':
        return {
          label: 'TRACKER / AD',
          bg: 'rgba(239, 68, 68, 0.15)',
          color: '#f87171',
          border: '1px solid rgba(239, 68, 68, 0.3)',
        };
      case 'cdn':
        return {
          label: 'CDN / LIB',
          bg: 'rgba(168, 85, 247, 0.15)',
          color: '#c084fc',
          border: '1px solid rgba(168, 85, 247, 0.3)',
        };
      default:
        return {
          label: '3RD PARTY',
          bg: 'rgba(245, 158, 11, 0.15)',
          color: '#fbbf24',
          border: '1px solid rgba(245, 158, 11, 0.3)',
        };
    }
  };

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: '10px',
        background: 'rgba(0, 0, 0, 0.4)',
        borderRadius: '14px',
        padding: '12px',
        border: '1px solid rgba(255, 255, 255, 0.08)',
      }}
    >
      {/* 1st-Party Master Policy with Modern Slide Toggle */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          background: 'rgba(16, 185, 129, 0.08)',
          border: '1px solid rgba(16, 185, 129, 0.25)',
          borderRadius: '10px',
          padding: '8px 12px',
        }}
      >
        <div style={{ display: 'flex', flexDirection: 'column' }}>
          <span style={{ fontSize: '11px', fontWeight: 600, color: '#ffffff', display: 'flex', alignItems: 'center', gap: '6px' }}>
            <span style={{ width: '6px', height: '6px', borderRadius: '50%', background: allowFirstPartyScripts ? '#10b981' : '#64748b' }} />
            Allow 1st-Party Scripts
          </span>
          <span style={{ fontSize: '10px', color: '#94a3b8' }}>
            Keep core site functional while blocking 3rd-party trackers
          </span>
        </div>
        <ModernSlideToggle
          checked={allowFirstPartyScripts}
          onChange={onToggleAllowFirstParty}
          size="sm"
          variant="emerald"
          ariaLabel="Allow First Party Scripts Toggle"
        />
      </div>

      {/* Quick Action Presets */}
      <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
        <button
          type="button"
          onClick={onBlockAllThirdParty}
          style={{
            flex: 1,
            padding: '6px 8px',
            borderRadius: '8px',
            fontSize: '10px',
            fontWeight: 700,
            cursor: 'pointer',
            border: '1px solid rgba(245, 158, 11, 0.35)',
            background: 'rgba(245, 158, 11, 0.12)',
            color: '#f59e0b',
            transition: 'all 0.2s ease',
            whiteSpace: 'nowrap',
          }}
        >
          🛡️ Block 3rd-Party Only
        </button>
        <button
          type="button"
          onClick={onAllowAll}
          style={{
            padding: '6px 10px',
            borderRadius: '8px',
            fontSize: '10px',
            fontWeight: 700,
            cursor: 'pointer',
            border: '1px solid rgba(16, 185, 129, 0.35)',
            background: 'rgba(16, 185, 129, 0.12)',
            color: '#10b981',
            transition: 'all 0.2s ease',
          }}
        >
          Allow All
        </button>
        <button
          type="button"
          onClick={onBlockAll}
          style={{
            padding: '6px 10px',
            borderRadius: '8px',
            fontSize: '10px',
            fontWeight: 700,
            cursor: 'pointer',
            border: '1px solid rgba(239, 68, 68, 0.35)',
            background: 'rgba(239, 68, 68, 0.12)',
            color: '#ef4444',
            transition: 'all 0.2s ease',
          }}
        >
          Block All
        </button>
      </div>

      {/* Search Filter Input */}
      <div style={{ position: 'relative' }}>
        <input
          type="text"
          placeholder="Filter scripts by origin domain or name..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          style={{
            width: '100%',
            padding: '7px 10px',
            borderRadius: '8px',
            background: 'rgba(255, 255, 255, 0.05)',
            border: '1px solid rgba(255, 255, 255, 0.1)',
            color: '#ffffff',
            fontSize: '11px',
            outline: 'none',
            boxSizing: 'border-box',
          }}
        />
        {searchQuery && (
          <button
            type="button"
            onClick={() => setSearchQuery('')}
            style={{
              position: 'absolute',
              right: '8px',
              top: '50%',
              transform: 'translateY(-50%)',
              background: 'transparent',
              border: 'none',
              color: '#94a3b8',
              cursor: 'pointer',
              fontSize: '11px',
            }}
          >
            ✕
          </button>
        )}
      </div>

      {/* Branch Accordion Hierarchy */}
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          gap: '8px',
          maxHeight: '280px',
          overflowY: 'auto',
          paddingRight: '2px',
        }}
      >
        {filteredGroups.length === 0 ? (
          <div
            style={{
              padding: '20px 10px',
              textAlign: 'center',
              fontSize: '11px',
              color: '#94a3b8',
            }}
          >
            {normalizedScripts.length === 0
              ? 'No external scripts detected on this page.'
              : 'No scripts match your filter.'}
          </div>
        ) : (
          filteredGroups.map((group) => {
            const isExpanded = expandedBranches[group.domain] !== false; // default open
            const badge = getCategoryBadge(group.category);
            const allAllowedInGroup = group.scripts.every((s) => !s.isBlocked);
            const allBlockedInGroup = group.scripts.every((s) => s.isBlocked);

            return (
              <div
                key={group.domain}
                style={{
                  background: 'rgba(255, 255, 255, 0.03)',
                  border: '1px solid rgba(255, 255, 255, 0.07)',
                  borderRadius: '10px',
                  overflow: 'hidden',
                  transition: 'background 0.2s ease',
                }}
              >
                {/* Branch Header */}
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    padding: '8px 10px',
                    background: 'rgba(255, 255, 255, 0.02)',
                    cursor: 'pointer',
                  }}
                  onClick={() => toggleBranchExpanded(group.domain)}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px', overflow: 'hidden' }}>
                    <span
                      style={{
                        fontSize: '9px',
                        transform: isExpanded ? 'rotate(90deg)' : 'rotate(0deg)',
                        transition: 'transform 0.2s ease',
                        color: '#94a3b8',
                        display: 'inline-block',
                      }}
                    >
                      ▶
                    </span>
                    <span
                      style={{
                        fontSize: '9px',
                        fontWeight: 700,
                        padding: '1px 5px',
                        borderRadius: '4px',
                        background: badge.bg,
                        color: badge.color,
                        border: badge.border,
                        flexShrink: 0,
                      }}
                    >
                      {badge.label}
                    </span>
                    <span
                      style={{
                        fontSize: '11px',
                        fontWeight: 600,
                        color: '#e2e8f0',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap',
                        maxWidth: '160px',
                      }}
                      title={group.domain}
                    >
                      {group.domain}
                    </span>
                    <span style={{ fontSize: '10px', color: '#64748b', fontWeight: 500, flexShrink: 0 }}>
                      ({group.scripts.length})
                    </span>
                  </div>

                  {/* Branch Level Slide Toggle */}
                  <div
                    style={{ display: 'flex', alignItems: 'center', gap: '6px' }}
                    onClick={(e) => e.stopPropagation()}
                  >
                    <ModernSlideToggle
                      checked={allAllowedInGroup}
                      onChange={(allow) => {
                        const scriptUrls = group.scripts.map((s) => s.url);
                        onToggleBranch(
                          group.domain,
                          scriptUrls,
                          allow ? 'allow' : 'block'
                        );
                      }}
                      size="sm"
                      variant={group.category === 'first-party' ? 'emerald' : 'gold'}
                      ariaLabel={`Toggle all scripts for ${group.domain}`}
                    />
                  </div>
                </div>

                {/* Sub-script Items with Individual Modern Slide Switches */}
                {isExpanded && (
                  <div
                    style={{
                      padding: '4px 8px 8px 8px',
                      display: 'flex',
                      flexDirection: 'column',
                      gap: '4px',
                      borderTop: '1px solid rgba(255, 255, 255, 0.04)',
                    }}
                  >
                    {group.scripts.map((script, sIdx) => (
                      <div
                        key={sIdx}
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'space-between',
                          padding: '5px 8px',
                          borderRadius: '6px',
                          background: 'rgba(0, 0, 0, 0.28)',
                          fontSize: '10px',
                        }}
                      >
                        <div style={{ display: 'flex', flexDirection: 'column', overflow: 'hidden', maxWidth: '220px' }}>
                          <span
                            style={{
                              color: script.isBlocked ? '#94a3b8' : '#e2e8f0',
                              textDecoration: script.isBlocked ? 'line-through' : 'none',
                              overflow: 'hidden',
                              textOverflow: 'ellipsis',
                              whiteSpace: 'nowrap',
                              fontFamily: 'monospace',
                              fontSize: '10px',
                            }}
                            title={script.url}
                          >
                            {script.filename}
                          </span>
                          <span style={{ fontSize: '8px', color: script.isBlocked ? '#ef4444' : '#10b981', fontWeight: 600 }}>
                            {script.isBlocked ? 'Blocked' : 'Allowed'}
                          </span>
                        </div>

                        {/* Modern Slide Switch for Sub-Script */}
                        <ModernSlideToggle
                          checked={!script.isBlocked}
                          onChange={(allow) =>
                            onToggleScript(
                              script.url,
                              allow ? 'allowed' : 'blocked'
                            )
                          }
                          size="sm"
                          variant="emerald"
                          ariaLabel={`Toggle script ${script.filename}`}
                        />
                      </div>
                    ))}
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>
    </div>
  );
};
