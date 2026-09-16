import React, { useState, useRef, useCallback, memo } from 'react';
import { TorButton } from './TorButton';
import { Tab } from '../utils/storage';

interface Workspace {
  id: string;
  name: string;
  color: string;
  tabIds: string[];
}

interface TabBarProps {
  tabs: Tab[];
  activeId: string | null;
  onFocusTab: (id: string) => void;
  onCloseTab: (id: string) => void;
  onUpdateTab: (id: string, patch: Partial<Tab>) => void;
  onCreateTab: (url?: string, isIncognito?: boolean) => Promise<void> | void;
  workspaces: Workspace[];
  activeWorkspaceId: string;
  onSelectWorkspace: (id: string) => void;
  onAutoGroup: (category?: string) => void;
  tabLayout?: 'top' | 'sidebar';
  onSetTabLayout?: (layout: 'top' | 'sidebar') => void;
  onOpenSettings: (tab?: string) => void;
  onOpenProfile: () => void;
  onOpenHUD: () => void;
  onOpenDownloads: () => void;
  onOpenPasswords: () => void;
  onToggleAISidebar?: () => void;
  onToggleTor: (enabled: boolean) => void;
  onOpenTorManager: () => void;
  profilePic: string;
  currentPalette: string;
  onSelectPalette: (palette: string) => void;
  onNavigate: (url: string) => void;
  syncStatus: string;
  onSetMuted: (id: string, muted: boolean) => void;
  onSetVolume: (id: string, volume: number) => void;
  onTogglePlayPause: (id: string) => void;
  torMode: boolean;
  onTriggerSync: () => void;
  isIncognito: boolean;
  onReloadTab: (id: string) => void;
  adblockEnabled?: boolean;
}

export const TabBar = memo(function TabBar({
  tabs,
  activeId,
  onFocusTab,
  onCloseTab,
  onUpdateTab,
  onCreateTab,
  workspaces,
  activeWorkspaceId,
  onSelectWorkspace,
  onAutoGroup,
  tabLayout = 'top',
  onSetTabLayout,
  onOpenSettings,
  onOpenProfile,
  onOpenHUD,
  onOpenDownloads,
  onOpenPasswords,
  onToggleAISidebar,
  onToggleTor,
  onOpenTorManager,
  profilePic,
  currentPalette,
  onSelectPalette,
  onNavigate,
  onSetMuted,
  onTogglePlayPause,
  torMode,
  onReloadTab,
}: TabBarProps) {
  const [showWorkspaceDropdown, setShowWorkspaceDropdown] = useState(false);
  const [showPaletteMenu, setShowPaletteMenu] = useState(false);
  const [tabContextMenu, setTabContextMenu] = useState<{ visible: boolean; x: number; y: number; tabId: string }>({ visible: false, x: 0, y: 0, tabId: '' });
  const scrollRef = useRef<HTMLDivElement>(null);
  const dragTabId = useRef<string | null>(null);

  const handleDragStart = (e: React.DragEvent, tabId: string) => {
    dragTabId.current = tabId;
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', tabId);
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
  };

  const handleDrop = (e: React.DragEvent, targetTabId: string) => {
    e.preventDefault();
    const sourceId = dragTabId.current;
    if (!sourceId || sourceId === targetTabId) return;
    const sourceIdx = tabs.findIndex(t => t.id === sourceId);
    const targetIdx = tabs.findIndex(t => t.id === targetTabId);
    if (sourceIdx === -1 || targetIdx === -1) return;
    const reordered = [...tabs];
    const [moved] = reordered.splice(sourceIdx, 1);
    reordered.splice(targetIdx, 0, moved);
    onUpdateTab(sourceId, { lastActiveTime: Date.now() });
    dragTabId.current = null;
  };

  const handleDragEnd = useCallback((e: React.DragEvent) => {
    const { clientX, clientY } = e;
    const isOutsideWindow = clientX < 0 || clientX > window.innerWidth || clientY < 0 || clientY > 100;
    if (isOutsideWindow && dragTabId.current) {
      const tabId = dragTabId.current;
      const tab = tabs.find(t => t.id === tabId);
      if (tab && tab.url && !tab.url.startsWith('about:')) {
        onCreateTab(tab.url);
        onCloseTab(tabId);
      }
      dragTabId.current = null;
    }
  }, [tabs, onCreateTab, onCloseTab]);

  const handleWheel = useCallback((e: React.WheelEvent) => {
    if (scrollRef.current) {
      scrollRef.current.scrollLeft += e.deltaX;
    }
  }, []);

  const handleTabContextMenu = useCallback((e: React.MouseEvent, tabId: string) => {
    e.preventDefault();
    e.stopPropagation();
    setTabContextMenu({ visible: true, x: e.clientX, y: e.clientY, tabId });
  }, []);

  const handleTabContextAction = useCallback((action: string) => {
    const { tabId } = tabContextMenu;
    if (!tabId) return;
    const currentTab = tabs.find(t => t.id === tabId);

    switch (action) {
      case 'pin': {
        onUpdateTab(tabId, { isPinned: !currentTab?.isPinned });
        break;
      }
      case 'mute': {
        onSetMuted(tabId, !currentTab?.isMuted);
        break;
      }
      case 'reload': {
        if (onReloadTab) {
          onReloadTab(tabId);
        } else {
          onUpdateTab(tabId, { loading: true });
        }
        break;
      }
      case 'duplicate': {
        if (currentTab) onCreateTab(currentTab.url);
        break;
      }
      case 'new-tab-right': {
        onCreateTab('about:blank');
        break;
      }
      case 'suspend': {
        onUpdateTab(tabId, { isSuspended: !currentTab?.isSuspended });
        break;
      }
      case 'copy-url': {
        if (currentTab?.url) {
          navigator.clipboard.writeText(currentTab.url);
        }
        break;
      }
      case 'copy-markdown': {
        if (currentTab) {
          const title = currentTab.title || currentTab.url;
          navigator.clipboard.writeText(`[${title}](${currentTab.url})`);
        }
        break;
      }
      case 'open-incognito': {
        if (currentTab) {
          onCreateTab(currentTab.url || 'about:blank', true);
        }
        break;
      }
      case 'ai-tab': {
        if (onToggleAISidebar) {
          onToggleAISidebar();
        } else {
          onCreateTab('about:ai');
        }
        break;
      }
      case 'ai-studio': {
        onCreateTab('about:ai');
        break;
      }
      case 'close': {
        onCloseTab(tabId);
        break;
      }
      case 'close-others': {
        tabs.forEach(t => { if (t.id !== tabId) onCloseTab(t.id); });
        break;
      }
      case 'close-right': {
        const idx = tabs.findIndex(t => t.id === tabId);
        if (idx !== -1) {
          tabs.slice(idx + 1).forEach(t => onCloseTab(t.id));
        }
        break;
      }
      case 'close-left': {
        const idx = tabs.findIndex(t => t.id === tabId);
        if (idx !== -1) {
          tabs.slice(0, idx).forEach(t => onCloseTab(t.id));
        }
        break;
      }
      case 'close-suspended': {
        tabs.forEach(t => { if (t.isSuspended && t.id !== tabId) onCloseTab(t.id); });
        break;
      }
    }
    setTabContextMenu({ visible: false, x: 0, y: 0, tabId: '' });
  }, [tabContextMenu, tabs, onUpdateTab, onSetMuted, onReloadTab, onCreateTab, onToggleAISidebar, onCloseTab]);

  // Sort tabs: pinned first, then by lastActiveTime
  const sortedTabs = [...tabs].sort((a, b) => {
    if (a.isPinned && !b.isPinned) return -1;
    if (!a.isPinned && b.isPinned) return 1;
    return 0;
  });

  return (
    <div className={`tab-bar ${tabLayout === 'sidebar' ? 'tab-bar-sidebar' : ''}`}>
      <div className="tab-bar-left">
        <div className="workspace-selector">
          <button
            className="workspace-dropdown-btn"
            onClick={() => setShowWorkspaceDropdown(!showWorkspaceDropdown)}
            title="Workspaces"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <rect x="3" y="3" width="7" height="7" />
              <rect x="14" y="3" width="7" height="7" />
              <rect x="14" y="14" width="7" height="7" />
              <rect x="3" y="14" width="7" height="7" />
            </svg>
            <span className="workspace-name">
              {activeWorkspaceId === 'all'
                ? 'All Tabs'
                : workspaces.find(w => w.id === activeWorkspaceId)?.name || 'Workspaces'}
            </span>
            <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="6 9 12 15 18 9" />
            </svg>
          </button>
          {showWorkspaceDropdown && (
            <div className="workspace-dropdown" onClick={() => setShowWorkspaceDropdown(false)}>
              <div className="workspace-dropdown-header">
                <span>Workspaces</span>
                <button className="workspace-ai-btn" onClick={(e) => { e.stopPropagation(); onAutoGroup(); setShowWorkspaceDropdown(false); }} title="AI Auto-Group">
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
                  </svg>
                  Auto-Group
                </button>
              </div>
              <div style={{ display: 'flex', gap: '4px', padding: '4px 8px', flexWrap: 'wrap' }}>
                {['All', 'By Domain', 'By Topic', 'By Type'].map(cat => (
                  <button
                    key={cat}
                    onClick={(e) => { e.stopPropagation(); onAutoGroup(cat); setShowWorkspaceDropdown(false); }}
                    style={{ fontSize: '9px', padding: '2px 6px', borderRadius: '4px', background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)', color: '#a0aec0', cursor: 'pointer' }}
                    onMouseEnter={e => { e.currentTarget.style.background = 'rgba(255,255,255,0.12)'; e.currentTarget.style.color = '#fff'; }}
                    onMouseLeave={e => { e.currentTarget.style.background = 'rgba(255,255,255,0.06)'; e.currentTarget.style.color = '#a0aec0'; }}
                  >
                    {cat}
                  </button>
                ))}
              </div>
              <div style={{ height: '1px', background: 'rgba(255,255,255,0.06)', margin: '2px 8px' }} />
              <button
                className={`workspace-dropdown-item ${activeWorkspaceId === 'all' ? 'active' : ''}`}
                onClick={() => { onSelectWorkspace('all'); setShowWorkspaceDropdown(false); }}
              >
                All Tabs ({tabs.length})
              </button>
              {workspaces.map(ws => (
                <button
                  key={ws.id}
                  className={`workspace-dropdown-item ${activeWorkspaceId === ws.id ? 'active' : ''}`}
                  onClick={() => { onSelectWorkspace(ws.id); setShowWorkspaceDropdown(false); }}
                >
                  <span className="workspace-color-dot" style={{ background: ws.color }} />
                  <span>{ws.name}</span>
                  <span className="workspace-tab-count">{ws.tabIds.length}</span>
                </button>
              ))}
            </div>
          )}
        </div>

        <div 
          className="tabs-list" 
          ref={scrollRef} 
          onWheel={handleWheel}
          onDoubleClick={(e) => {
            if (e.target === e.currentTarget) {
              onCreateTab();
            }
          }}
        >
          {sortedTabs.map(tab => (
            <div
              key={tab.id}
              className={`tab-item ${tab.id === activeId ? 'active' : ''} ${tab.isIncognito ? 'incognito' : ''} ${tab.isSuspended ? 'suspended' : ''} ${tab.isPinned ? 'pinned' : ''}`}
              onClick={() => onFocusTab(tab.id)}
              onAuxClick={e => {
                if (e.button === 1) {
                  e.preventDefault();
                  e.stopPropagation();
                  onCloseTab(tab.id);
                }
              }}
              onContextMenu={e => handleTabContextMenu(e, tab.id)}
              draggable
              onDragStart={e => handleDragStart(e, tab.id)}
              onDragOver={handleDragOver}
              onDrop={e => handleDrop(e, tab.id)}
              onDragEnd={handleDragEnd}
              title={tab.title || tab.url}
              style={tab.isPinned ? { minWidth: '40px', maxWidth: '40px', padding: '0 4px' } : undefined}
            >
              <div className="tab-content-wrapper">
                {tab.isPinned && (
                  <svg className="tab-pin-icon" width="10" height="10" viewBox="0 0 24 24" fill="currentColor" stroke="none" style={{ marginRight: '2px', flexShrink: 0, opacity: 0.6 }}>
                    <path d="M16,12V4H17V2H7V4H8V12L6,14V16H11.2V22H12.8V16H18V14L16,12Z" />
                  </svg>
                )}
                {tab.loading ? (
                  <div className="tab-loading-spinner" />
                ) : tab.isIncognito ? (
                  <svg className="tab-icon incognito-icon" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
                    <path d="M7 11V7a5 5 0 0 1 10 0v4" />
                  </svg>
                ) : tab.torMode ? (
                  <svg className="tab-icon tor-icon" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M12 22c-4.42 0-8-3.58-8-8c0-5.5 8-12 8-12s8 6.5 8 12c0 4.42-3.58 8-8 8z" />
                    <path d="M12 22c-2.2 0-4-3.58-4-8c0-5.5 4-12 4-12s4 6.5 4 8c0 4.42-1.8 8-4 8z" />
                  </svg>
                ) : (
                  <svg className="tab-icon globe-icon" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <circle cx="12" cy="12" r="10" />
                    <line x1="2" y1="12" x2="22" y2="12" />
                    <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" />
                  </svg>
                )}
                <span className="tab-title">{tab.title || 'New Tab'}</span>
                {tab.isAudible && (
                  <span
                    className="tab-audio-indicator"
                    onClick={e => {
                      e.stopPropagation();
                      onTogglePlayPause(tab.id);
                    }}
                    title={tab.isMuted ? 'Unmute' : 'Mute'}
                  >
                    {tab.isMuted ? (
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" />
                        <line x1="23" y1="9" x2="17" y2="15" />
                        <line x1="17" y1="9" x2="23" y2="15" />
                      </svg>
                    ) : (
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" />
                        <path d="M19.07 4.93a10 10 0 0 1 0 14.14M15.54 8.46a5 5 0 0 1 0 7.07" />
                      </svg>
                    )}
                  </span>
                )}
              </div>
              <button
                className="tab-close-btn"
                onClick={e => {
                  e.stopPropagation();
                  onCloseTab(tab.id);
                }}
                title="Close tab (Ctrl+W)"
              >
                <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <line x1="18" y1="6" x2="6" y2="18" />
                  <line x1="6" y1="6" x2="18" y2="18" />
                </svg>
              </button>
            </div>
          ))}

          {/* New Tab Button */}
          <button
            className="new-tab-btn"
            onClick={() => onCreateTab()}
            title="New Tab (Ctrl+T)"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
              <line x1="12" y1="5" x2="12" y2="19" />
              <line x1="5" y1="12" x2="19" y2="12" />
            </svg>
          </button>
        </div>
      </div>
      <div className="tab-bar-right">
        <div className="tab-bar-actions">
          <button className="tab-bar-action-btn" onClick={() => onOpenHUD()} title="Command HUD (Ctrl+Space)">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="10" />
              <line x1="12" y1="16" x2="12" y2="12" />
              <line x1="12" y1="8" x2="12.01" y2="8" />
            </svg>
          </button>
          <TorButton
            torMode={torMode}
            onToggle={onToggleTor}
            onOpenManager={onOpenTorManager}
            onCreateIncognitoTab={() => onCreateTab('about:blank', true)}
          />
          <div className="palette-selector">
            <button
              className="tab-bar-action-btn palette-btn"
              onClick={() => setShowPaletteMenu(!showPaletteMenu)}
              title="Theme"
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="13.5" cy="6.5" r="0.5" fill="currentColor" />
                <circle cx="17.5" cy="10.5" r="0.5" fill="currentColor" />
                <circle cx="8.5" cy="7.5" r="0.5" fill="currentColor" />
                <circle cx="6.5" cy="12.5" r="0.5" fill="currentColor" />
                <path d="M12 2C6.5 2 2 6.5 2 12s4.5 10 10 10c.93 0 1.5-.67 1.5-1.5 0-.35-.15-.68-.38-.92-.25-.25-.62-.58-.62-1.08 0-.83.67-1.5 1.5-1.5H16c3.31 0 6-2.69 6-6 0-5.5-4.5-10-10-10z" />
              </svg>
            </button>
            {showPaletteMenu && (
              <div
                className="palette-menu"
                onClick={() => setShowPaletteMenu(false)}
                style={{
                  position: 'absolute',
                  top: '32px',
                  right: 0,
                  width: '180px',
                  background: 'rgba(15, 15, 20, 0.95)',
                  border: '1px solid rgba(255, 255, 255, 0.1)',
                  borderRadius: '12px',
                  boxShadow: '0 8px 32px rgba(0,0,0,0.6)',
                  backdropFilter: 'blur(16px)',
                  padding: '6px',
                  zIndex: 2500,
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '2px'
                }}
              >
                {[
                  { id: 'default', name: 'Indigo Night', color: '#6366f1' },
                  { id: 'gilt', name: 'Warm Paper & Gold', color: '#d4af37' },
                  { id: 'obsidian', name: 'Obsidian Glass', color: '#a855f7' },
                  { id: 'teal', name: 'Ocean Teal', color: '#14b8a6' },
                  { id: 'rose', name: 'Sunset Rose', color: '#f43f5e' },
                  { id: 'green', name: 'Emerald Forest', color: '#10b981' }
                ].map(p => (
                  <button
                    key={p.id}
                    className={`palette-item ${currentPalette === p.id ? 'active' : ''}`}
                    onClick={() => { onSelectPalette(p.id); setShowPaletteMenu(false); }}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '8px',
                      width: '100%',
                      padding: '8px 10px',
                      background: currentPalette === p.id ? 'rgba(212, 175, 55, 0.15)' : 'transparent',
                      border: 'none',
                      color: '#fff',
                      borderRadius: '6px',
                      cursor: 'pointer',
                      fontSize: '12px'
                    }}
                  >
                    <span style={{ width: '10px', height: '10px', borderRadius: '50%', background: p.color, display: 'inline-block' }} />
                    <span>{p.name}</span>
                  </button>
                ))}
              </div>
            )}
          </div>
          {onToggleAISidebar && (
            <button
              className="tab-bar-action-btn"
              onClick={onToggleAISidebar}
              title="AI Assistant (Alt+Space)"
              style={{ color: '#d4af37' }}
            >
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                <path d="M12 3c0 4.5-3.5 8-8 8 4.5 0 8 3.5 8 8 0-4.5 3.5-8 8-8-4.5 0-8-3.5-8-8z" />
                <path d="M19 4v3M17.5 5.5h3" strokeWidth="1.5" />
              </svg>
            </button>
          )}
          <button className="tab-bar-action-btn" onClick={() => onOpenDownloads()} title="Downloads (Ctrl+J)">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
              <polyline points="7 10 12 15 17 10" />
              <line x1="12" y1="15" x2="12" y2="3" />
            </svg>
          </button>
          <button className="tab-bar-action-btn" onClick={() => onOpenPasswords()} title="Password Manager">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
              <path d="M7 11V7a5 5 0 0 1 10 0v4" />
            </svg>
          </button>
          <button
            className="tab-bar-action-btn"
            onClick={() => onNavigate('about:extensions')}
            title="Extensions (about:extensions)"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M20.5 11H19V7a2 2 0 0 0-2-2h-4V3.5a2.5 2.5 0 0 0-5 0V5H4a2 2 0 0 0-2 2v3.8h1.5a2.5 2.5 0 0 1 0 5H2v4a2 2 0 0 0 2 2h3.8v-1.5a2.5 2.5 0 0 1 5 0V22H17a2 2 0 0 0 2-2v-4h1.5a2.5 2.5 0 0 0 0-5z" />
            </svg>
          </button>
          <button
            className="tab-bar-action-btn"
            onClick={() => onOpenSettings()}
            title="Settings"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="3" />
              <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z" />
            </svg>
          </button>
          <button
            className="tab-bar-profile-btn"
            onClick={onOpenProfile}
            title="Profile & Sync Account Settings"
            style={{
              width: '28px',
              height: '28px',
              borderRadius: '50%',
              padding: 0,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              border: '1.5px solid var(--border-light, rgba(255,255,255,0.15))',
              background: 'var(--bg-glass, rgba(255,255,255,0.05))',
              cursor: 'pointer',
              overflow: 'hidden',
              transition: 'all 0.15s ease',
            }}
          >
            {profilePic ? (
              <img src={profilePic} alt="Profile" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
            ) : (
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
                <circle cx="12" cy="7" r="4" />
              </svg>
            )}
          </button>
        </div>
      </div>

      {/* Tab Context Menu */}
      {tabContextMenu.visible && (() => {
        const currentTab = tabs.find(t => t.id === tabContextMenu.tabId);
        const isPinned = !!currentTab?.isPinned;
        const isMuted = !!currentTab?.isMuted;
        const isSuspended = !!currentTab?.isSuspended;

        const menuWidth = 240;
        const menuHeight = 460;
        const adjustedX = Math.min(tabContextMenu.x, Math.max(10, window.innerWidth - menuWidth - 16));
        const adjustedY = Math.min(tabContextMenu.y, Math.max(10, window.innerHeight - menuHeight - 16));

        type MenuItemConfig = {
          type?: 'separator' | 'header';
          label?: string;
          action?: string;
          icon?: React.ReactNode;
          shortcut?: string;
          danger?: boolean;
        };

        const menuItems: MenuItemConfig[] = [
          // Navigation & Tab Flow
          {
            label: 'Reload Tab',
            action: 'reload',
            shortcut: 'Ctrl+R',
            icon: (
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M21.5 2v6h-6M21.34 15.57a10 10 0 1 1-.57-8.38l5.67-5.19" />
              </svg>
            ),
          },
          {
            label: 'Duplicate Tab',
            action: 'duplicate',
            icon: (
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
                <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
              </svg>
            ),
          },
          {
            label: 'New Tab to the Right',
            action: 'new-tab-right',
            shortcut: 'Ctrl+T',
            icon: (
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <line x1="12" y1="5" x2="12" y2="19" />
                <line x1="5" y1="12" x2="19" y2="12" />
              </svg>
            ),
          },
          {
            label: isPinned ? 'Unpin Tab' : 'Pin Tab',
            action: 'pin',
            icon: (
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <line x1="12" y1="17" x2="12" y2="22" />
                <path d="M5 17h14v-1.76a2 2 0 0 0-1.11-1.79l-1.78-.9A2 2 0 0 1 15 10.76V6h1a1 1 0 0 0 1-1V3a1 1 0 0 0-1-1H8a1 1 0 0 0-1 1v2a1 1 0 0 0 1 1h1v4.76a2 2 0 0 1-1.11 1.79l-1.78.9A2 2 0 0 0 5 15.24Z" />
              </svg>
            ),
          },
          { type: 'separator' },

          // Tab State & Media
          {
            label: isMuted ? 'Unmute Tab Audio' : 'Mute Tab Audio',
            action: 'mute',
            icon: isMuted ? (
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" />
                <line x1="23" y1="9" x2="17" y2="15" />
                <line x1="17" y1="9" x2="23" y2="15" />
              </svg>
            ) : (
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" />
                <path d="M19.07 4.93a10 10 0 0 1 0 14.14M15.54 8.46a5 5 0 0 1 0 7.07" />
              </svg>
            ),
          },
          {
            label: isSuspended ? 'Wake Tab from Sleep' : 'Sleep Tab (Free RAM)',
            action: 'suspend',
            icon: (
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
              </svg>
            ),
          },
          {
            label: 'Open in Incognito Mode',
            action: 'open-incognito',
            shortcut: 'Ctrl+Shift+N',
            icon: (
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M2 12h20M12 2a8 8 0 0 1 8 8H4a8 8 0 0 1 8-8z" />
                <circle cx="6" cy="18" r="3" />
                <circle cx="18" cy="18" r="3" />
                <line x1="9" y1="18" x2="15" y2="18" />
              </svg>
            ),
          },
          { type: 'separator' },

          // AI & Sharing
          {
            label: 'Ask Neural AI about Tab',
            action: 'ai-tab',
            shortcut: 'Alt+Space',
            icon: (
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
              </svg>
            ),
          },
          {
            label: 'Open in Full-Screen AI Studio',
            action: 'ai-studio',
            icon: (
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
                <polyline points="15 3 21 3 21 9" />
                <line x1="10" y1="14" x2="21" y2="3" />
              </svg>
            ),
          },
          {
            label: 'Copy Page URL Address',
            action: 'copy-url',
            icon: (
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" />
                <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" />
              </svg>
            ),
          },
          {
            label: 'Copy as Markdown Link',
            action: 'copy-markdown',
            icon: (
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2" />
                <rect x="8" y="2" width="8" height="4" rx="1" ry="1" />
              </svg>
            ),
          },
          { type: 'separator' },

          // Closing Actions
          {
            label: 'Close Tab',
            action: 'close',
            shortcut: 'Ctrl+W',
            danger: true,
            icon: (
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <line x1="18" y1="6" x2="6" y2="18" />
                <line x1="6" y1="6" x2="18" y2="18" />
              </svg>
            ),
          },
          {
            label: 'Close Other Tabs',
            action: 'close-others',
            icon: (
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
                <line x1="9" y1="9" x2="15" y2="15" />
                <line x1="15" y1="9" x2="9" y2="15" />
              </svg>
            ),
          },
          {
            label: 'Close Tabs to the Right',
            action: 'close-right',
            icon: (
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="13 17 18 12 13 7" />
                <polyline points="6 17 11 12 6 7" />
              </svg>
            ),
          },
          {
            label: 'Close Tabs to the Left',
            action: 'close-left',
            icon: (
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="11 17 6 12 11 7" />
                <polyline points="18 17 13 12 18 7" />
              </svg>
            ),
          },
          {
            label: 'Close All Sleeping Tabs',
            action: 'close-suspended',
            icon: (
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
                <line x1="2" y1="2" x2="22" y2="22" />
              </svg>
            ),
          },
        ];

        return (
          <>
            <div
              style={{ position: 'fixed', inset: 0, zIndex: 9998 }}
              onClick={() => setTabContextMenu({ visible: false, x: 0, y: 0, tabId: '' })}
              onContextMenu={e => {
                e.preventDefault();
                setTabContextMenu({ visible: false, x: 0, y: 0, tabId: '' });
              }}
            />
            <div
              style={{
                position: 'fixed',
                left: adjustedX,
                top: adjustedY,
                zIndex: 9999,
                background: 'rgba(18, 18, 24, 0.96)',
                border: '1px solid rgba(255, 255, 255, 0.12)',
                borderRadius: '14px',
                boxShadow: '0 16px 48px rgba(0, 0, 0, 0.7), 0 0 0 1px rgba(255, 255, 255, 0.04)',
                backdropFilter: 'blur(20px)',
                WebkitBackdropFilter: 'blur(20px)',
                padding: '6px',
                minWidth: '240px',
                maxWidth: '280px',
                animation: 'context-menu-appear 0.15s cubic-bezier(0.16, 1, 0.3, 1)',
                userSelect: 'none',
              }}
            >
              {menuItems.map((item, i) => {
                if (item.type === 'separator') {
                  return (
                    <div
                      key={i}
                      style={{
                        height: '1px',
                        background: 'rgba(255, 255, 255, 0.08)',
                        margin: '4px 6px',
                      }}
                    />
                  );
                }

                return (
                  <button
                    key={i}
                    type="button"
                    onClick={() => item.action && handleTabContextAction(item.action)}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      width: '100%',
                      padding: '7px 10px',
                      background: 'transparent',
                      border: 'none',
                      color: item.danger ? '#f87171' : '#e2e8f0',
                      borderRadius: '8px',
                      cursor: 'pointer',
                      fontSize: '12px',
                      textAlign: 'left',
                      transition: 'all 0.12s ease',
                      gap: '10px',
                    }}
                    onMouseEnter={e => {
                      e.currentTarget.style.background = item.danger
                        ? 'rgba(239, 68, 68, 0.15)'
                        : 'rgba(255, 255, 255, 0.08)';
                      if (item.danger) e.currentTarget.style.color = '#fca5a5';
                    }}
                    onMouseLeave={e => {
                      e.currentTarget.style.background = 'transparent';
                      e.currentTarget.style.color = item.danger ? '#f87171' : '#e2e8f0';
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: '9px' }}>
                      <span
                        style={{
                          width: '16px',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          color: item.danger ? '#f87171' : '#94a3b8',
                        }}
                      >
                        {item.icon}
                      </span>
                      <span style={{ fontSize: '12px', fontWeight: '500' }}>{item.label}</span>
                    </div>

                    {item.shortcut && (
                      <span
                        style={{
                          fontSize: '10px',
                          fontFamily: 'monospace',
                          color: '#64748b',
                          background: 'rgba(255, 255, 255, 0.04)',
                          padding: '1px 5px',
                          borderRadius: '4px',
                          border: '1px solid rgba(255, 255, 255, 0.06)',
                        }}
                      >
                        {item.shortcut}
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          </>
        );
      })()}
    </div>
  );
});