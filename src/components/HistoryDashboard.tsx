import React, { useState, useEffect, useCallback } from 'react';
import { supabase } from '../utils/supabase';
import { ContextMenu, ContextMenuAction } from './ContextMenu';

interface HistoryDashboardProps {
  onNavigate: (url: string) => void;
  onCreateTab: (url?: string) => void;
}

interface HistoryEntry {
  id: string;
  url: string;
  title: string;
  timestamp: number;
}

interface GroupedDomain {
  domain: string;
  displayName: string;
  entries: HistoryEntry[];
  isExpanded: boolean;
}

export function HistoryDashboard({ onNavigate, onCreateTab }: HistoryDashboardProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const [groupedHistory, setGroupedHistory] = useState<GroupedDomain[]>([]);
  const [expandedDomains, setExpandedDomains] = useState<Record<string, boolean>>({});
  const [histContextMenu, setHistContextMenu] = useState<{
    visible: boolean;
    x: number;
    y: number;
    entry: HistoryEntry | null;
  }>({ visible: false, x: 0, y: 0, entry: null });

  // Helper to extract clean domain/site name
  const getDomain = (urlStr: string) => {
    try {
      return new URL(urlStr).hostname.replace('www.', '');
    } catch (e) {
      return urlStr;
    }
  };

  const getCleanSiteName = (domain: string, title: string) => {
    if (domain.includes('google.com') && title.toLowerCase().includes('google')) {
      return 'Google Search';
    }
    if (domain.includes('youtube.com')) {
      return 'YouTube';
    }
    if (domain.includes('gemini.google.com')) {
      return 'Google Gemini';
    }
    if (domain.includes('github.com')) {
      return 'GitHub';
    }
    if (domain.includes('aistudio.google.com')) {
      return 'Google AI Studio';
    }
    if (domain.includes('lovable.dev') || domain.includes('lovable.app')) {
      return 'Lovable AI';
    }
    if (domain.includes('v0.dev')) {
      return 'v0 by Vercel';
    }
    if (domain.includes('figma.com')) {
      return 'Figma';
    }
    if (domain.includes('whatsapp.com')) {
      return 'WhatsApp';
    }

    // Fallback: capitalized first word of the title or domain
    const cleanTitle = title.split(' - ')[0].split(' | ')[0].trim();
    if (cleanTitle && cleanTitle.length < 24 && isNaN(Number(cleanTitle))) {
      return cleanTitle;
    }

    return domain.charAt(0).toUpperCase() + domain.slice(1).split('.')[0];
  };

  // Format timestamp to hh:mm am/pm
  const formatTime = (timestamp: number) => {
    const date = new Date(timestamp);
    let hours = date.getHours();
    const minutes = date.getMinutes();
    const ampm = hours >= 12 ? 'pm' : 'am';
    hours = hours % 12;
    hours = hours ? hours : 12; // the hour '0' should be '12'
    const minutesStr = minutes < 10 ? '0' + minutes : minutes;
    return `${hours}:${minutesStr} ${ampm}`;
  };

  // Load history data
  const loadHistory = useCallback(async () => {
    try {
      const rawList: HistoryEntry[] = await window.electronAPI.db.getHistory();

      // Sort newest first
      const sortedList = [...rawList].sort((a, b) => b.timestamp - a.timestamp);

      // Group by domain
      const groups: Record<string, HistoryEntry[]> = {};
      sortedList.forEach(entry => {
        const dom = getDomain(entry.url);
        if (!groups[dom]) {
          groups[dom] = [];
        }
        groups[dom].push(entry);
      });

      const grouped: GroupedDomain[] = Object.entries(groups).map(([dom, entries]) => {
        // Find best display name from the first page title
        const dispName = getCleanSiteName(dom, entries[0]?.title || dom);
        return {
          domain: dom,
          displayName: dispName,
          entries,
          isExpanded: expandedDomains[dom] ?? false,
        };
      });

      // Sort groups by their latest visit timestamp descending
      grouped.sort((a, b) => b.entries[0].timestamp - a.entries[0].timestamp);

      setGroupedHistory(grouped);
    } catch (err) {
      console.error('Failed to load history:', err);
    }
  }, [expandedDomains]);

  useEffect(() => {
    loadHistory();
  }, [loadHistory]);

  // Toggle group expansion
  const toggleExpand = (domain: string) => {
    setExpandedDomains(prev => ({
      ...prev,
      [domain]: !prev[domain],
    }));
  };

  // Search filter
  const filteredGroups = groupedHistory
    .map(group => {
      const filteredEntries = group.entries.filter(
        entry =>
          entry.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
          entry.url.toLowerCase().includes(searchQuery.toLowerCase()) ||
          group.displayName.toLowerCase().includes(searchQuery.toLowerCase())
      );
      return {
        ...group,
        entries: filteredEntries,
      };
    })
    .filter(group => group.entries.length > 0);

  // Delete single visit entry
  const handleHistContextMenu = (e: React.MouseEvent, entry: HistoryEntry) => {
    e.preventDefault();
    setHistContextMenu({ visible: true, x: e.clientX, y: e.clientY, entry });
  };

  const handleHistMenuAction = (action: ContextMenuAction) => {
    const entry = histContextMenu.entry;
    if (!entry) return;
    switch (action.type) {
      case 'openInNewTab':
        onCreateTab(entry.url);
        break;
      case 'copyUrl':
        navigator.clipboard.writeText(entry.url).catch(() => {});
        break;
      case 'deleteEntry':
        handleDeleteEntry({} as React.MouseEvent, entry.id, entry.url);
        break;
    }
    setHistContextMenu(prev => ({ ...prev, visible: false }));
  };

  const handleDeleteEntry = async (e: React.MouseEvent, entryId: string, url: string) => {
    e.stopPropagation();
    try {
      // 1. Remove from Local Secure DB
      await window.electronAPI.db.deleteHistory(entryId);

      // 2. Remove from Supabase
      const isSyncActive = localStorage.getItem('gemini-browser-sync-active') === 'true';
      if (isSyncActive) {
        const { data, error: fetchErr } = await supabase.from('browser_history').select('*');
        if (!fetchErr && data) {
          const isUnlocked = await window.electronAPI.passwords.isUnlocked();
          for (const row of data) {
            let decryptedUrl = row.url;
            if (row.url.startsWith('enc:') && isUnlocked) {
              try {
                const decrypted = await window.electronAPI.passwords.decryptSyncData(row.url.substring(4));
                try {
                  const parsed = JSON.parse(decrypted);
                  decryptedUrl = parsed.url;
                } catch {
                  decryptedUrl = decrypted;
                }
              } catch (e) {
                // ignore decryption errors
              }
            }
            if (decryptedUrl === url) {
              await supabase.from('browser_history').delete().eq('id', row.id);
            }
          }
        }
      }

      loadHistory();
    } catch (err) {
      console.error('Failed to delete history item:', err);
    }
  };

  // Delete entire domain group
  const handleDeleteGroup = async (
    e: React.MouseEvent,
    domain: string,
    entries: HistoryEntry[]
  ) => {
    e.stopPropagation();
    try {
      // 1. Remove from Local Secure DB
      for (const entry of entries) {
        await window.electronAPI.db.deleteHistory(entry.id);
      }

      // 2. Remove from Supabase (delete all urls containing this domain)
      const isSyncActive = localStorage.getItem('gemini-browser-sync-active') === 'true';
      if (isSyncActive) {
        const { data, error: fetchErr } = await supabase.from('browser_history').select('*');
        if (!fetchErr && data) {
          const isUnlocked = await window.electronAPI.passwords.isUnlocked();
          for (const row of data) {
            let decryptedUrl = row.url;
            if (row.url.startsWith('enc:') && isUnlocked) {
              try {
                const decrypted = await window.electronAPI.passwords.decryptSyncData(row.url.substring(4));
                try {
                  const parsed = JSON.parse(decrypted);
                  decryptedUrl = parsed.url;
                } catch {
                  decryptedUrl = decrypted;
                }
              } catch (e) {
                // ignore decryption errors
              }
            }
            if (decryptedUrl && getDomain(decryptedUrl) === domain) {
              await supabase.from('browser_history').delete().eq('id', row.id);
            }
          }
        }
      }

      loadHistory();
    } catch (err) {
      console.error('Failed to delete history group:', err);
    }
  };

  // Clear entire history
  const handleClearAll = async () => {
    const confirmClear = window.confirm('Are you sure you want to clear your entire history?');
    if (!confirmClear) return;
    try {
      await window.electronAPI.db.clearHistory();
      
      const isSyncActive = localStorage.getItem('gemini-browser-sync-active') === 'true';
      if (isSyncActive) {
        const { error } = await supabase.from('browser_history').delete().neq('url', '');
        if (error) {
          console.warn('Supabase clear history failed:', error);
        }
      }
      loadHistory();
    } catch (err) {
      console.error('Failed to clear history:', err);
    }
  };

  return (
    <div className="history-dashboard-container">
      {/* Background blobs for organic ambient light */}
      <div className="icrush-ambient-blobs">
        <div className="ambient-blob azure-blob" />
        <div className="ambient-blob indigo-blob" />
        <div className="ambient-blob pink-blob" />
      </div>

      {/* Header section */}
      <header className="history-dashboard-header">
        <div className="history-brand">
          <svg
            className="history-logo-icon"
            width="20"
            height="20"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <circle cx="12" cy="12" r="10" />
            <polyline points="12 6 12 12 16 14" />
          </svg>
          <span>Smart History Map</span>
        </div>

        <div className="history-search-container">
          <svg
            className="history-search-icon"
            width="16"
            height="16"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <circle cx="11" cy="11" r="8" />
            <line x1="21" y1="21" x2="16.65" y2="16.65" />
          </svg>
          <input
            type="text"
            className="history-search-input"
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            placeholder="Search history by title, URL or domain..."
          />
          {searchQuery && (
            <button className="clear-search-btn" onClick={() => setSearchQuery('')}>
              ×
            </button>
          )}
        </div>

        <div className="history-actions">
          <button className="history-action-btn danger-btn" onClick={handleClearAll}>
            Clear History
          </button>
          <button className="history-action-btn home-btn" onClick={() => onNavigate('about:blank')}>
            Home
          </button>
        </div>
      </header>

      {/* Main dashboard map view */}
      <div className="history-map-view">
        {filteredGroups.length > 0 ? (
          <div className="history-tree-container">
            {filteredGroups.map(group => {
              const hasEntries = group.entries.length > 0;
              const isExpanded = expandedDomains[group.domain] ?? false;

              return (
                <div
                  key={group.domain}
                  className={`history-tree-node-group ${isExpanded ? 'expanded' : ''}`}
                >
                  {/* Root Node Row */}
                  <div
                    className="history-root-node-card"
                    onClick={() => toggleExpand(group.domain)}
                  >
                    <div className="node-glow-indicator" />

                    <div className="node-favicon-wrapper">
                      <img
                        src={`https://www.google.com/s2/favicons?sz=128&domain=${group.domain}`}
                        alt={group.displayName}
                        onError={e => {
                          e.currentTarget.style.display = 'none';
                          const parent = e.currentTarget.parentElement;
                          if (parent && !parent.querySelector('.node-letter-fallback')) {
                            const fallback = document.createElement('span');
                            fallback.className = 'node-letter-fallback';
                            fallback.innerText = group.displayName.charAt(0).toUpperCase();
                            parent.appendChild(fallback);
                          }
                        }}
                        className="node-favicon-img"
                      />
                    </div>

                    <div className="node-info">
                      <span className="node-title">{group.displayName}</span>
                      <span className="node-domain-subtitle">{group.domain}</span>
                    </div>

                    <div className="node-badge-count">
                      {group.entries.length} {group.entries.length === 1 ? 'visit' : 'visits'}
                    </div>

                    <div className="node-actions-area">
                      <button
                        className="node-delete-group-btn"
                        onClick={e => handleDeleteGroup(e, group.domain, group.entries)}
                        title="Delete all visits to this domain"
                      >
                        <svg
                          width="14"
                          height="14"
                          viewBox="0 0 24 24"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="2.5"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                        >
                          <polyline points="3 6 5 6 21 6" />
                          <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                        </svg>
                      </button>

                      <div className={`node-toggle-indicator ${isExpanded ? 'active' : ''}`}>
                        <svg
                          width="14"
                          height="14"
                          viewBox="0 0 24 24"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="2.5"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                        >
                          <polyline points="6 9 12 15 18 9" />
                        </svg>
                      </div>
                    </div>
                  </div>

                  {/* Collapsible tree branches */}
                  {isExpanded && hasEntries && (
                    <div className="node-branches-container">
                      {/* Vertical connector line (tree trunk) */}
                      <div className="branch-trunk-line" />

                      {group.entries.map((entry, _index) => (
  <div key={entry.id} className="branch-leaf-item" onContextMenu={(e) => handleHistContextMenu(e, entry)}>
    {/* Branch horizontal line and branch connector dot */}
                          <div className="branch-leaf-connector">
                            <div className="branch-leaf-horizontal-line" />
                            <div className="branch-leaf-connector-dot" />
                          </div>

                          {/* Time opened pill indicator */}
                          <div className="branch-time-badge">{formatTime(entry.timestamp)}</div>

                          {/* Branch contents (link pill card) */}
                          <div className="branch-leaf-card">
                            <span
                              className="leaf-card-link"
                              onClick={() => onNavigate(entry.url)}
                              title={entry.url}
                            >
                              {entry.title || entry.url}
                            </span>

                            <button
                              className="leaf-card-delete-btn"
                              onClick={e => handleDeleteEntry(e, entry.id, entry.url)}
                              title="Delete this entry"
                            >
                              ×
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        ) : (
          <div className="history-empty-view">
            <svg
              width="48"
              height="48"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <circle cx="12" cy="12" r="10" />
              <polyline points="12 6 12 12 16 14" />
            </svg>
            <span className="empty-title">No history found</span>
            <p className="empty-desc">
              {searchQuery
                ? 'No results match your search filter.'
                : 'Start browsing websites and they will automatically populate here.'}
            </p>
          </div>
        )}
      </div>

      {histContextMenu.visible && histContextMenu.entry && (
        <ContextMenu
          x={histContextMenu.x}
          y={histContextMenu.y}
          items={[
            { type: 'item', label: 'Open in New Tab', icon: '↗', action: 'openInNewTab' },
            { type: 'item', label: 'Copy URL', icon: '📋', action: 'copyUrl' },
            { type: 'separator' },
            { type: 'item', label: 'Delete Entry', icon: '🗑', action: 'deleteEntry' },
          ]}
          onClose={() => setHistContextMenu(prev => ({ ...prev, visible: false }))}
          onAction={handleHistMenuAction}
        />
      )}
    </div>
  );
}
