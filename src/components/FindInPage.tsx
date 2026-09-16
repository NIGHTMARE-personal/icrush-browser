import React, { useState, useEffect, useRef, useCallback } from 'react';

interface FindInPageProps {
  webview: Electron.WebviewTag | null;
  isOpen: boolean;
  onClose: () => void;
}

export function FindInPage({ webview, isOpen, onClose }: FindInPageProps) {
  const [searchText, setSearchText] = useState('');
  const [matchCount, setMatchCount] = useState(0);
  const [activeMatchIndex, setActiveMatchIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  const requestFind = useCallback((text: string, options?: Electron.FindInPageOptions) => {
    if (!webview || !text.trim()) {
      setMatchCount(0);
      setActiveMatchIndex(0);
      return;
    }
    try {
      webview.findInPage(text, {
        forward: true,
        findNext: true,
        matchCase: false,
        ...options,
      });
    } catch (e) {
      console.error('Find in page error:', e);
    }
  }, [webview]);

  const handleSearchChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const text = e.target.value;
    setSearchText(text);
    setActiveMatchIndex(0);
    requestFind(text);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') {
      onClose();
      return;
    }
    if (e.key === 'Enter') {
      e.preventDefault();
      if (e.shiftKey) {
        findPrevious();
      } else {
        findNext();
      }
    }
  };

  const findNext = useCallback(() => {
    if (!webview || !searchText.trim()) return;
    webview.findInPage(searchText, { forward: true, findNext: true, matchCase: false });
    setActiveMatchIndex(prev => prev + 1);
  }, [searchText, webview]);

  const findPrevious = useCallback(() => {
    if (!webview || !searchText.trim()) return;
    webview.findInPage(searchText, { forward: false, findNext: true, matchCase: false });
    setActiveMatchIndex(prev => Math.max(0, prev - 1));
  }, [searchText, webview]);

  const handleClose = () => {
    if (webview) {
      webview.stopFindInPage('clearSelection');
    }
    setSearchText('');
    setMatchCount(0);
    setActiveMatchIndex(0);
    onClose();
  };

  useEffect(() => {
    if (isOpen) {
      const handleKeyDown = (e: KeyboardEvent) => {
        if ((e.ctrlKey || e.metaKey) && e.key === 'f') {
          e.preventDefault();
        }
      };
      document.addEventListener('keydown', handleKeyDown);
      return () => document.removeEventListener('keydown', handleKeyDown);
    }
  }, [isOpen]);

  useEffect(() => {
    if (isOpen) {
      setTimeout(() => inputRef.current?.focus(), 50);
    } else {
      if (webview) {
        webview.stopFindInPage('clearSelection');
      }
    }
    return () => {
      if (webview) {
        webview.stopFindInPage('clearSelection');
      }
    };
  }, [isOpen, webview]);

  useEffect(() => {
    if (!webview) return;
    const handler = (e: Event) => {
      const foundEvent = e as Electron.FoundInPageEvent;
      setMatchCount(foundEvent.result.activeMatchOrdinal > 0 ? foundEvent.result.matches : 0);
      setActiveMatchIndex(Math.max(0, foundEvent.result.activeMatchOrdinal - 1));
    };
    webview.addEventListener('found-in-page', handler);
    return () => {
      webview.removeEventListener('found-in-page', handler);
    };
  }, [webview]);

  if (!isOpen) return null;

  return (
    <div className="find-in-page-overlay" onClick={e => e.stopPropagation()}>
      <div className="find-in-page-bar" role="search">
        <button className="find-close-btn" onClick={handleClose} title="Close (Esc)" aria-label="Close find">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <line x1="18" y1="6" x2="6" y2="18" />
            <line x1="6" y1="6" x2="18" y2="18" />
          </svg>
        </button>
        
        <div className="find-input-wrapper">
          <svg className="find-search-icon" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="11" cy="11" r="8" />
            <line x1="21" y1="21" x2="16.65" y2="16.65" />
          </svg>
          <input
            ref={inputRef}
            type="text"
            className="find-input"
            placeholder="Find in page..."
            value={searchText}
            onChange={handleSearchChange}
            onKeyDown={handleKeyDown}
            autoFocus
            spellCheck={false}
            aria-label="Find in page"
          />
          {searchText && (
            <button className="find-clear-btn" onClick={() => setSearchText('')} aria-label="Clear search">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <line x1="18" y1="6" x2="6" y2="18" />
                <line x1="6" y1="6" x2="18" y2="18" />
              </svg>
            </button>
          )}
        </div>

        {searchText && (
          <div className="find-results">
            <span className="find-counter">
              {matchCount > 0 ? `${activeMatchIndex + 1} of ${matchCount}` : 'No matches'}
            </span>
            <div className="find-nav">
              <button className="find-nav-btn" onClick={findPrevious} disabled={matchCount === 0} title="Previous match (Shift+Enter)" aria-label="Previous match">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="15 18 9 12 15 6" />
                </svg>
              </button>
              <button className="find-nav-btn" onClick={findNext} disabled={matchCount === 0} title="Next match (Enter)" aria-label="Next match">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="9 18 15 12 9 6" />
                </svg>
              </button>
            </div>
          </div>
        )}

        <div className="find-options">
          <label className="find-option">
            <input type="checkbox" />
            <span>Match Case</span>
          </label>
          <label className="find-option">
            <input type="checkbox" />
            <span>Whole Word</span>
          </label>
        </div>
      </div>
    </div>
  );
}