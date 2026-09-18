import React, { useState, useEffect, useRef } from 'react';
import { bookmarkStorage, Bookmark } from '../utils/bookmarks';

interface BookmarkToolbarProps {
  onNavigate: (url: string) => void;
  onOpenBookmarks: () => void;
}

export function BookmarkToolbar({ onNavigate, onOpenBookmarks }: BookmarkToolbarProps) {
  const [bookmarks, setBookmarks] = useState<Bookmark[]>([]);
  const [showOverflow, setShowOverflow] = useState(false);
  const overflowRef = useRef<HTMLDivElement>(null);
  const MAX_VISIBLE = 12;

  useEffect(() => {
    setBookmarks(bookmarkStorage.getBookmarks());
  }, []);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (overflowRef.current && !overflowRef.current.contains(e.target as Node)) {
        setShowOverflow(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  if (bookmarks.length === 0) {
    return (
      <div style={{
        display: 'flex',
        alignItems: 'center',
        gap: '2px',
        padding: '2px 8px',
        background: 'var(--bg-secondary, rgba(0,0,0,0.15))',
        borderBottom: '1px solid var(--border-color, rgba(255,255,255,0.06))',
        overflow: 'hidden',
        minHeight: '28px',
        color: 'var(--text-muted)',
        fontSize: '12px',
        cursor: 'pointer',
      }} onClick={() => {
        const url = prompt('Enter URL to bookmark:');
        if (url) {
          let finalUrl = url;
          if (!url.startsWith('http://') && !url.startsWith('https://')) {
            finalUrl = 'https://' + url;
          }
          const name = new URL(finalUrl).hostname.replace('www.', '');
          bookmarkStorage.addBookmark({ url: finalUrl, title: name });
          setBookmarks(bookmarkStorage.getBookmarks());
        }
      }}>
        <span style={{ opacity: 0.6 }}>No bookmarks yet — click to add one</span>
      </div>
    );
  }

  const visible = bookmarks.slice(0, MAX_VISIBLE);
  const overflow = bookmarks.slice(MAX_VISIBLE);

  const getFaviconUrl = (url: string) => {
    try {
      const hostname = new URL(url).hostname;
      return `https://www.google.com/s2/favicons?domain=${hostname}&sz=16`;
    } catch {
      return '';
    }
  };

  return (
    <div style={{
      display: 'flex',
      alignItems: 'center',
      gap: '2px',
      padding: '2px 8px',
      background: 'var(--bg-secondary, rgba(0,0,0,0.15))',
      borderBottom: '1px solid var(--border-color, rgba(255,255,255,0.06))',
      overflow: 'hidden',
      minHeight: '28px',
    }}>
      {visible.map(b => (
        <button
          key={b.id}
          onClick={() => onNavigate(b.url)}
          title={`${b.title}\n${b.url}`}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '5px',
            padding: '3px 8px',
            background: 'transparent',
            border: 'none',
            borderRadius: '4px',
            color: 'var(--text-secondary, #999)',
            fontSize: '11px',
            cursor: 'pointer',
            whiteSpace: 'nowrap',
            maxWidth: '140px',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            transition: 'background 0.15s',
          }}
          onMouseEnter={e => (e.currentTarget.style.background = 'rgba(255,255,255,0.08)')}
          onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
        >
          <img
            src={getFaviconUrl(b.url)}
            alt=""
            width={14}
            height={14}
            style={{ borderRadius: '2px', flexShrink: 0 }}
            onError={e => (e.currentTarget.style.display = 'none')}
          />
          <span style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>{b.title}</span>
        </button>
      ))}

      {overflow.length > 0 && (
        <div ref={overflowRef} style={{ position: 'relative' }}>
          <button
            onClick={() => setShowOverflow(!showOverflow)}
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              width: '24px',
              height: '24px',
              background: 'transparent',
              border: 'none',
              borderRadius: '4px',
              color: 'var(--text-secondary, #999)',
              fontSize: '14px',
              cursor: 'pointer',
            }}
            onMouseEnter={e => (e.currentTarget.style.background = 'rgba(255,255,255,0.08)')}
            onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
          >
            +
          </button>
          {showOverflow && (
            <div style={{
              position: 'absolute',
              top: '100%',
              left: 0,
              background: 'var(--bg-primary, #1a1a1a)',
              border: '1px solid var(--border-color, rgba(255,255,255,0.1))',
              borderRadius: '6px',
              padding: '4px',
              minWidth: '200px',
              maxHeight: '300px',
              overflowY: 'auto',
              zIndex: 1000,
              boxShadow: '0 4px 12px rgba(0,0,0,0.4)',
            }}>
              {overflow.map(b => (
                <button
                  key={b.id}
                  onClick={() => { onNavigate(b.url); setShowOverflow(false); }}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '6px',
                    width: '100%',
                    padding: '6px 8px',
                    background: 'transparent',
                    border: 'none',
                    borderRadius: '4px',
                    color: 'var(--text-secondary, #999)',
                    fontSize: '12px',
                    cursor: 'pointer',
                    textAlign: 'left',
                  }}
                  onMouseEnter={e => (e.currentTarget.style.background = 'rgba(255,255,255,0.08)')}
                  onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
                >
                  <img
                    src={getFaviconUrl(b.url)}
                    alt=""
                    width={14}
                    height={14}
                    style={{ borderRadius: '2px', flexShrink: 0 }}
                    onError={e => (e.currentTarget.style.display = 'none')}
                  />
                  <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{b.title}</span>
                </button>
              ))}
              <div style={{ borderTop: '1px solid var(--border-color, rgba(255,255,255,0.06))', marginTop: '4px', paddingTop: '4px' }}>
                <button
                  onClick={() => { onOpenBookmarks(); setShowOverflow(false); }}
                  style={{
                    width: '100%',
                    padding: '6px 8px',
                    background: 'transparent',
                    border: 'none',
                    borderRadius: '4px',
                    color: 'var(--accent-color, #4fc3f7)',
                    fontSize: '12px',
                    cursor: 'pointer',
                    textAlign: 'left',
                  }}
                  onMouseEnter={e => (e.currentTarget.style.background = 'rgba(255,255,255,0.08)')}
                  onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
                >
                  Show All Bookmarks
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      <button
        onClick={onOpenBookmarks}
        title="Bookmarks Manager"
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          width: '24px',
          height: '24px',
          background: 'transparent',
          border: 'none',
          borderRadius: '4px',
          color: 'var(--text-secondary, #999)',
          fontSize: '12px',
          cursor: 'pointer',
          marginLeft: 'auto',
          flexShrink: 0,
        }}
        onMouseEnter={e => (e.currentTarget.style.background = 'rgba(255,255,255,0.08)')}
        onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
      >
        ★
      </button>
    </div>
  );
}
