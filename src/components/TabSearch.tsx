import React, { useState, useRef, useEffect, useMemo } from 'react';

interface Tab {
  id: string;
  url: string;
  title: string;
  loading: boolean;
  isIncognito?: boolean;
}

interface TabSearchProps {
  tabs: Tab[];
  activeId: string | null;
  onSelectTab: (id: string) => void;
  onClose: () => void;
}

export function TabSearch({ tabs, activeId, onSelectTab, onClose }: TabSearchProps) {
  const [query, setQuery] = useState('');
  const [selectedIndex, setSelectedIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const filtered = useMemo(() => {
    const q = query.toLowerCase().trim();
    if (!q) return tabs;
    return tabs.filter(
      t =>
        t.title.toLowerCase().includes(q) ||
        t.url.toLowerCase().includes(q)
    );
  }, [tabs, query]);

  useEffect(() => {
    setSelectedIndex(0);
  }, [query]);

  useEffect(() => {
    const selected = listRef.current?.children[selectedIndex] as HTMLElement | undefined;
    selected?.scrollIntoView({ block: 'nearest' });
  }, [selectedIndex]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') {
      onClose();
    } else if (e.key === 'ArrowDown') {
      e.preventDefault();
      setSelectedIndex(i => Math.min(i + 1, filtered.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setSelectedIndex(i => Math.max(i - 1, 0));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (filtered[selectedIndex]) {
        onSelectTab(filtered[selectedIndex].id);
        onClose();
      }
    }
  };

  const getFavicon = (url: string) => {
    try {
      const hostname = new URL(url).hostname;
      return `https://www.google.com/s2/favicons?domain=${hostname}&sz=32`;
    } catch {
      return '';
    }
  };

  return (
    <div
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        zIndex: 10000,
        display: 'flex',
        justifyContent: 'center',
        paddingTop: '80px',
        background: 'rgba(0,0,0,0.4)',
        backdropFilter: 'blur(8px)',
      }}
      onClick={onClose}
    >
      <div
        onClick={e => e.stopPropagation()}
        style={{
          width: '560px',
          maxHeight: '420px',
          background: 'rgba(20, 20, 24, 0.98)',
          border: '1px solid rgba(255,255,255,0.1)',
          borderRadius: '12px',
          boxShadow: '0 20px 60px rgba(0,0,0,0.6)',
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
        }}
      >
        <div style={{ padding: '12px 16px', borderBottom: '1px solid rgba(255,255,255,0.08)' }}>
          <input
            ref={inputRef}
            value={query}
            onChange={e => setQuery(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Search tabs..."
            style={{
              width: '100%',
              background: 'rgba(255,255,255,0.06)',
              border: '1px solid rgba(255,255,255,0.12)',
              borderRadius: '8px',
              padding: '10px 14px',
              color: '#e4e4e7',
              fontSize: '14px',
              outline: 'none',
              fontFamily: 'inherit',
              boxSizing: 'border-box',
            }}
          />
        </div>
        <div ref={listRef} style={{ flex: 1, overflowY: 'auto', padding: '4px 0' }}>
          {filtered.length === 0 && (
            <div style={{ padding: '24px', textAlign: 'center', color: '#71717a', fontSize: '13px' }}>
              No tabs found
            </div>
          )}
          {filtered.map((tab, i) => (
            <div
              key={tab.id}
              onClick={() => {
                onSelectTab(tab.id);
                onClose();
              }}
              onMouseEnter={() => setSelectedIndex(i)}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '10px',
                padding: '8px 16px',
                cursor: 'pointer',
                background: i === selectedIndex ? 'rgba(255,255,255,0.08)' : 'transparent',
                transition: 'background 0.1s',
              }}
            >
              <img
                src={getFavicon(tab.url)}
                alt=""
                style={{ width: '16px', height: '16px', flexShrink: 0 }}
                onError={e => { (e.target as HTMLImageElement).style.display = 'none'; }}
              />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div
                  style={{
                    fontSize: '13px',
                    color: '#e4e4e7',
                    whiteSpace: 'nowrap',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                  }}
                >
                  {tab.title || tab.url}
                </div>
                <div
                  style={{
                    fontSize: '11px',
                    color: '#71717a',
                    whiteSpace: 'nowrap',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                  }}
                >
                  {tab.url}
                </div>
              </div>
              {tab.id === activeId && (
                <span style={{ fontSize: '10px', color: '#a78bfa', flexShrink: 0 }}>Active</span>
              )}
            </div>
          ))}
        </div>
        <div
          style={{
            padding: '8px 16px',
            borderTop: '1px solid rgba(255,255,255,0.08)',
            fontSize: '11px',
            color: '#52525b',
            display: 'flex',
            gap: '16px',
          }}
        >
          <span><kbd style={{ background: 'rgba(255,255,255,0.1)', padding: '1px 5px', borderRadius: '3px' }}>↑↓</kbd> navigate</span>
          <span><kbd style={{ background: 'rgba(255,255,255,0.1)', padding: '1px 5px', borderRadius: '3px' }}>Enter</kbd> select</span>
          <span><kbd style={{ background: 'rgba(255,255,255,0.1)', padding: '1px 5px', borderRadius: '3px' }}>Esc</kbd> close</span>
        </div>
      </div>
    </div>
  );
}
