import React, { useState, useEffect, useRef } from 'react';

interface Tab {
  id: string;
  url: string;
  title: string;
  loading: boolean;
  canGoBack: boolean;
  canGoForward: boolean;
}

interface CommandAction {
  id: string;
  name: string;
  category: 'MORE ACTIONS' | 'NAVIGATION' | 'WORKSPACES';
  icon: React.ReactNode;
  shortcut: string;
  action: () => void;
}

interface CommandHUDProps {
  isOpen: boolean;
  onClose: () => void;
  tabs: Tab[];
  activeId: string | null;
  onFocusTab: (id: string) => void;
  onCloseTab: (id: string) => void;
  onCreateTab: (url?: string, isIncognito?: boolean) => void;
  onSummarizePage: () => void;
  includeContext: boolean;
  onToggleContext: (value: boolean) => void;
  isAgentMode: boolean;
  onToggleAgentMode: (value: boolean) => void;
  onClearChat: () => void;
  onOpenSettings: () => void;
  onNavigate: (url: string) => void;
}

export function CommandHUD({
  isOpen,
  onClose,
  tabs,
  activeId: _activeId,
  onFocusTab,
  onCloseTab: _onCloseTab,
  onCreateTab,
  onSummarizePage,
  includeContext,
  onToggleContext,
  isAgentMode: _isAgentMode,
  onToggleAgentMode: _onToggleAgentMode,
  onClearChat: _onClearChat,
  onOpenSettings,
  onNavigate: _onNavigate,
}: CommandHUDProps) {
  const [inputValue, setInputValue] = useState('');
  const [selectedIndex, setSelectedIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (isOpen) {
      setTimeout(() => {
        inputRef.current?.focus();
      }, 50);
    }
  }, [isOpen]);

  useEffect(() => {
    setSelectedIndex(0);
  }, [inputValue]);

  if (!isOpen) return null;

  const moreActions: CommandAction[] = [
    {
      id: 'summarize',
      name: 'Summarize Page',
      category: 'MORE ACTIONS',
      icon: (
        <svg
          width="12"
          height="12"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
        </svg>
      ),
      shortcut: '⏎',
      action: onSummarizePage,
    },
    {
      id: 'context',
      name: `Toggle Context`,
      category: 'MORE ACTIONS',
      icon: (
        <svg
          width="12"
          height="12"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
        </svg>
      ),
      shortcut: '',
      action: () => onToggleContext(!includeContext),
    },
    {
      id: 'new-tab',
      name: 'New Tab',
      category: 'MORE ACTIONS',
      icon: (
        <svg
          width="12"
          height="12"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <line x1="12" y1="5" x2="12" y2="19" />
          <line x1="5" y1="12" x2="19" y2="12" />
        </svg>
      ),
      shortcut: 'Ctrl+T',
      action: () => {
        onCreateTab();
        onClose();
      },
    },
    {
      id: 'new-incognito-tab',
      name: 'New Incognito Tab',
      category: 'MORE ACTIONS',
      icon: (
        <svg
          width="12"
          height="12"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.5"
          strokeLinecap="round"
          strokeLinejoin="round"
          style={{ color: '#c084fc' }}
        >
          <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24" />
          <line x1="1" y1="1" x2="23" y2="23" />
        </svg>
      ),
      shortcut: 'Ctrl+Shift+N',
      action: () => {
        onCreateTab(undefined, true);
        onClose();
      },
    },
  ];

  const navigationActions: CommandAction[] = [
    {
      id: 'switch-tab',
      name: 'Switch to GitHub Tab',
      category: 'NAVIGATION',
      icon: (
        <svg
          width="12"
          height="12"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
          <line x1="9" y1="3" x2="9" y2="21" />
        </svg>
      ),
      shortcut: '⌘ 2',
      action: () => {
        const ghTab = tabs.find(t => t.url?.includes('github.com'));
        if (ghTab) onFocusTab(ghTab.id);
      },
    },
    {
      id: 'settings',
      name: 'Open Settings',
      category: 'NAVIGATION',
      icon: (
        <svg
          width="12"
          height="12"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <circle cx="12" cy="12" r="3" />
          <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
        </svg>
      ),
      shortcut: '⌘ ,',
      action: onOpenSettings,
    },
  ];

  const workspaceActions: CommandAction[] = [
    {
      id: 'load-project-alpha',
      name: "Load 'Project Alpha'",
      category: 'WORKSPACES',
      icon: (
        <svg
          width="12"
          height="12"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
        </svg>
      ),
      shortcut: '',
      action: () => {
        const ghTab = tabs.find(t => t.url?.includes('github.com'));
        if (ghTab) {
          onFocusTab(ghTab.id);
        } else {
          onCreateTab('https://github.com');
        }
      },
    },
  ];

  const allActions = [...moreActions, ...navigationActions, ...workspaceActions];

  const filteredActions = allActions.filter(action =>
    action.name.toLowerCase().includes(inputValue.toLowerCase())
  );

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setSelectedIndex(prev => (prev + 1) % filteredActions.length);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setSelectedIndex(prev => (prev - 1 + filteredActions.length) % filteredActions.length);
    } else if (e.key === 'Enter') {
      e.preventDefault();
      const selected = filteredActions[selectedIndex];
      if (selected) {
        selected.action();
        onClose();
      }
    } else if (e.key === 'Escape') {
      e.preventDefault();
      onClose();
    }
  };

  const renderGroupedActions = () => {
    const categories: Array<'MORE ACTIONS' | 'NAVIGATION' | 'WORKSPACES'> = [
      'MORE ACTIONS',
      'NAVIGATION',
      'WORKSPACES',
    ];
    let absoluteIdx = 0;

    return categories.map(cat => {
      const catActions = filteredActions.filter(a => a.category === cat);
      if (catActions.length === 0) return null;

      return (
        <div key={cat} className="hud-category-group">
          <div className="hud-category-header">
            <span>{cat}</span>
            {cat === 'MORE ACTIONS' && <span className="hud-category-chevron">▼</span>}
          </div>

          <div className="hud-category-list">
            {catActions.map(action => {
              const currentAbsoluteIdx = absoluteIdx++;
              const isSelected = currentAbsoluteIdx === selectedIndex;

              return (
                <div
                  key={action.id}
                  className={`hud-result-item ${isSelected ? 'selected' : ''}`}
                  onClick={() => {
                    action.action();
                    onClose();
                  }}
                  onMouseEnter={() => setSelectedIndex(currentAbsoluteIdx)}
                >
                  <div className="hud-item-left-content">
                    <span className="hud-item-icon-symbol">{action.icon}</span>
                    <span className="hud-item-name">{action.name}</span>
                  </div>

                  {action.shortcut ? (
                    <span className="keycap">{action.shortcut}</span>
                  ) : (
                    isSelected && <span className="keycap">⏎</span>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      );
    });
  };

  return (
    <div className="hud-overlay" onClick={onClose}>
      <div className="hud-panel" onClick={e => e.stopPropagation()}>
        <div className="hud-input-row">
          <span className="hud-search-icon">
            <svg
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
          </span>
          <input
            ref={inputRef}
            type="text"
            className="hud-input-field"
            placeholder="Type a command or search..."
            value={inputValue}
            onChange={e => setInputValue(e.target.value)}
            onKeyDown={handleKeyDown}
          />
          <span className="keycap esc-keycap">ESC</span>
        </div>

        <div className="hud-results-viewport">
          {filteredActions.length === 0 ? (
            <div className="hud-empty-viewport">No matching actions found</div>
          ) : (
            renderGroupedActions()
          )}
        </div>

        <div className="hud-footer">
          <div className="hud-footer-version">ICRUSH Browser v2.4</div>
          <div className="hud-footer-hints">
            <div className="hud-hotkey-hint">
              <span className="keycap">↑</span>
              <span className="keycap">↓</span> Navigate
            </div>
            <div className="hud-hotkey-hint">
              <span className="keycap">⏎</span> Execute
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
