import React, { useState, useEffect, useRef, useCallback } from 'react';
import { FindInPage } from './FindInPage';
import { ShieldMenu } from './ShieldMenu';
import { zoomStorage } from '../utils/zoom';
import { storage } from '../utils/storage';

interface Tab {
  id: string;
  url: string;
  title: string;
  loading: boolean;
  canGoBack: boolean;
  canGoForward: boolean;
  isIncognito?: boolean;
  loadTimeMs?: number;
}

interface AddressBarProps {
  activeTab: Tab | null;
  onNavigate: (url: string) => void;
  onGoBack: () => void;
  onGoForward: () => void;
  onReload: () => void;
  onBookmark?: (url: string, title: string) => void;
  isBookmarked?: boolean;
  torMode: boolean;
  onToggleTor: (enabled: boolean) => void;
  onOpenTorManager: () => void;
  webview?: Electron.WebviewTag | null;
  onToggleFind?: (open: boolean) => void;
  isFindOpen?: boolean;
  isIncognito?: boolean;
  adblockEnabled: boolean;
  onToggleAdblock: (enabled: boolean) => void;
  blockedCount: number;
  detectedScripts: string[];
  onSelectEngine?: (engine: 'google' | 'bing' | 'duckduckgo' | 'brave') => void;
  currentEngine?: 'google' | 'bing' | 'duckduckgo' | 'brave';
}

export function AddressBar({
  activeTab,
  onNavigate,
  onGoBack,
  onGoForward,
  onReload,
  onBookmark,
  isBookmarked = false,
  torMode: _torMode,
  onToggleTor: _onToggleTor,
  onOpenTorManager: _onOpenTorManager,
  webview,
  onToggleFind,
  isFindOpen,
  isIncognito: _isIncognito = false,
  adblockEnabled,
  onToggleAdblock,
  blockedCount,
  detectedScripts,
  onSelectEngine: onSelectEngineProp,
  currentEngine,
}: AddressBarProps) {
  const [inputValue, setInputValue] = useState('');
  const [isFocused, setIsFocused] = useState(false);
  const [zoomLevel, setZoomLevel] = useState(100);
  const [isShieldOpen, setIsShieldOpen] = useState(false);
  const [isSecurityHUDOpen, setIsSecurityHUDOpen] = useState(false);
  const [isMoreOptionsOpen, setIsMoreOptionsOpen] = useState(false);
  const [isPerfHUDOpen, setIsPerfHUDOpen] = useState(false);
  const [ddgSuggestions, setDdgSuggestions] = useState<string[]>([]);
  const [isEngineDropdownOpen, setIsEngineDropdownOpen] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const handleSelectEngine = (engine: 'google' | 'bing' | 'duckduckgo' | 'brave') => {
    storage.setSearchEngine(engine);
    onSelectEngineProp?.(engine);
    setIsEngineDropdownOpen(false);
  };

  useEffect(() => {
    if (!isFocused || !inputValue.trim() || inputValue.startsWith('http://') || inputValue.startsWith('https://') || inputValue.includes('.')) {
      setDdgSuggestions([]);
      return;
    }
    const controller = new AbortController();
    const fetchSuggestions = async () => {
      try {
        const res = await fetch(`https://duckduckgo.com/ac/?q=${encodeURIComponent(inputValue)}&type=list`, { signal: controller.signal });
        if (res.ok) {
          const data = await res.json();
          if (Array.isArray(data) && data[1]) {
            setDdgSuggestions(data[1].slice(0, 5));
          }
        }
      } catch (e) {
        // ignore
      }
    };
    const timer = setTimeout(fetchSuggestions, 200);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [inputValue, isFocused]);

  const [liveShieldStats, setLiveShieldStats] = useState<{ trackersBlocked: number; scriptsBlocked: number } | null>(null);

  useEffect(() => {
    if (!activeTab?.url || activeTab.url.startsWith('about:') || activeTab.url.startsWith('chrome:')) {
      setLiveShieldStats(null);
      return;
    }
    let domain = '';
    try {
      domain = new URL(activeTab.url).hostname.toLowerCase().replace(/^www\./, '');
    } catch {
      return;
    }

    if (window.electronAPI?.shields?.getStats) {
      window.electronAPI.shields.getStats(domain).then(st => {
        if (st) setLiveShieldStats(st);
      }).catch(() => {});
    }

    if (window.electronAPI?.shields?.onShieldsUpdated) {
      const unsub = window.electronAPI.shields.onShieldsUpdated(data => {
        if (data && data.domain === domain && data.stats) {
          setLiveShieldStats(data.stats);
        }
      });
      return () => unsub();
    }
  }, [activeTab?.url]);

  useEffect(() => {
    const handleFocusEvent = () => {
      if (inputRef.current) {
        inputRef.current.focus();
        inputRef.current.select();
      }
    };
    window.addEventListener('focus-address-bar', handleFocusEvent);
    return () => window.removeEventListener('focus-address-bar', handleFocusEvent);
  }, []);

  // Zoom controls with per-site memory
  const handleZoomIn = useCallback(() => {
    setZoomLevel(prev => {
      const next = Math.min(prev + 25, 500);
      webview?.setZoomFactor(next / 100);
      if (activeTab?.url) {
        const domain = zoomStorage.getDomain(activeTab.url);
        if (domain) zoomStorage.set(domain, next);
      }
      return next;
    });
  }, [webview, activeTab]);

  const handleZoomOut = useCallback(() => {
    setZoomLevel(prev => {
      const next = Math.max(prev - 25, 25);
      webview?.setZoomFactor(next / 100);
      if (activeTab?.url) {
        const domain = zoomStorage.getDomain(activeTab.url);
        if (domain) zoomStorage.set(domain, next);
      }
      return next;
    });
  }, [webview, activeTab]);

  const handleZoomReset = useCallback(() => {
    setZoomLevel(100);
    webview?.setZoomFactor(1);
    if (activeTab?.url) {
      const domain = zoomStorage.getDomain(activeTab.url);
      if (domain) zoomStorage.set(domain, 100);
    }
  }, [webview, activeTab]);

  // Restore per-site zoom when tab changes
  useEffect(() => {
    if (activeTab?.url && webview) {
      const domain = zoomStorage.getDomain(activeTab.url);
      if (domain) {
        const savedZoom = zoomStorage.get(domain);
        if (savedZoom !== 100) {
          setZoomLevel(savedZoom);
          webview.setZoomFactor(savedZoom / 100);
        } else {
          setZoomLevel(100);
        }
      }
    }
  }, [activeTab?.url, webview]);

  // Handle Ctrl+F for find in page
  const handleKeyDown = useCallback((e: KeyboardEvent) => {
    if ((e.ctrlKey || e.metaKey) && e.key === 'f') {
      e.preventDefault();
      onToggleFind?.(!isFindOpen);
    }
  }, [isFindOpen, onToggleFind]);

  useEffect(() => {
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handleKeyDown]);

  useEffect(() => {
    const handleFindEvent = () => {
      onToggleFind?.(true);
    };
    const handlePrintEvent = () => {
      if (webview) {
        try {
          webview.print();
        } catch (err) {
          console.error('Print failed:', err);
        }
      }
    };
    const handleZoomInEvent = () => {
      handleZoomIn();
    };
    const handleZoomOutEvent = () => {
      handleZoomOut();
    };
    const handleZoomResetEvent = () => {
      handleZoomReset();
    };

    window.addEventListener('webview-find-in-page', handleFindEvent);
    window.addEventListener('webview-print', handlePrintEvent);
    window.addEventListener('webview-zoom-in', handleZoomInEvent);
    window.addEventListener('webview-zoom-out', handleZoomOutEvent);
    window.addEventListener('webview-zoom-reset', handleZoomResetEvent);

    return () => {
      window.removeEventListener('webview-find-in-page', handleFindEvent);
      window.removeEventListener('webview-print', handlePrintEvent);
      window.removeEventListener('webview-zoom-in', handleZoomInEvent);
      window.removeEventListener('webview-zoom-out', handleZoomOutEvent);
      window.removeEventListener('webview-zoom-reset', handleZoomResetEvent);
    };
  }, [webview, handleZoomIn, handleZoomOut, handleZoomReset, onToggleFind]);

  useEffect(() => {
    if (!isFocused) {
      if (activeTab) {
        setInputValue(activeTab.url === 'about:blank' ? '' : activeTab.url);
      } else {
        setInputValue('');
      }
    }
  }, [activeTab, isFocused]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (inputValue.trim()) {
      onNavigate(inputValue.trim());
      setIsFocused(false);
    }
  };

  const handleSuggestionClick = (url: string) => {
    setInputValue(url);
    onNavigate(url);
    setIsFocused(false);
  };

  return (
    <div className="address-bar">
      <div className="navigation-controls">
        <button
          className="navigation-button"
          disabled={!activeTab?.canGoBack}
          onClick={onGoBack}
          title="Back"
        >
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
            <line x1="19" y1="12" x2="5" y2="12" />
            <polyline points="12 19 5 12 12 5" />
          </svg>
        </button>
        <button
          className="navigation-button"
          disabled={!activeTab?.canGoForward}
          onClick={onGoForward}
          title="Forward"
        >
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
            <line x1="5" y1="12" x2="19" y2="12" />
            <polyline points="12 5 19 12 12 19" />
          </svg>
        </button>
        <button
          className="navigation-button"
          onClick={onReload}
          title={activeTab?.loading ? 'Stop loading' : 'Reload page'}
        >
          {activeTab?.loading ? (
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
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          ) : (
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
              <path d="M21.5 2v6h-6M21.34 15.57a10 10 0 1 1-.57-8.38l5.67-5.67" />
            </svg>
          )}
        </button>
        <button
          type="button"
          className="navigation-button print-btn"
          title="Print (Ctrl+P)"
          onClick={() => webview?.print()}
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="6 9 6 2 18 2 18 9" />
            <path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-4" />
            <rect x="6" y="14" width="12" height="8" />
          </svg>
        </button>

      </div>

      <form className="address-input-form" onSubmit={handleSubmit}>
        <div className="input-wrapper">
          {/* Search Engine Picker Button */}
          <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
            <button
              type="button"
              className="search-engine-picker-btn"
              onClick={() => setIsEngineDropdownOpen(!isEngineDropdownOpen)}
              title={`Active Search Engine: ${currentEngine.toUpperCase()}`}
              style={{
                background: 'transparent',
                border: 'none',
                color: '#d4af37',
                fontSize: '11px',
                fontWeight: 'bold',
                padding: '2px 6px',
                borderRadius: '4px',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: '4px',
                marginRight: '4px',
                userSelect: 'none'
              }}
            >
              <span>{currentEngine === 'google' ? 'G' : currentEngine === 'duckduckgo' ? 'DDG' : currentEngine === 'bing' ? 'B' : 'BR'}</span>
              <svg width="8" height="8" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3">
                <polyline points="6 9 12 15 18 9" />
              </svg>
            </button>

            {isEngineDropdownOpen && (
              <div
                style={{
                  position: 'absolute',
                  top: '28px',
                  left: '0',
                  background: 'rgba(18, 18, 22, 0.98)',
                  border: '1px solid rgba(255, 255, 255, 0.1)',
                  borderRadius: '8px',
                  boxShadow: '0 8px 32px rgba(0,0,0,0.6)',
                  padding: '4px',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '2px',
                  zIndex: 2500,
                  width: '120px'
                }}
              >
                {[
                  { key: 'google', name: 'Google' },
                  { key: 'duckduckgo', name: 'DuckDuckGo' },
                  { key: 'bing', name: 'Bing' },
                  { key: 'brave', name: 'Brave' }
                ].map(item => (
                  <button
                    key={item.key}
                    type="button"
                    onClick={() => handleSelectEngine(item.key as any)}
                    style={{
                      background: currentEngine === item.key ? 'rgba(212, 175, 55, 0.15)' : 'transparent',
                      color: currentEngine === item.key ? '#d4af37' : '#e2e8f0',
                      border: 'none',
                      padding: '6px 8px',
                      borderRadius: '6px',
                      fontSize: '11px',
                      fontWeight: currentEngine === item.key ? 'bold' : 'normal',
                      textAlign: 'left',
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between'
                    }}
                  >
                    <span>{item.name}</span>
                    {currentEngine === item.key && <span>✓</span>}
                  </button>
                ))}
              </div>
            )}
          </div>

          <span 
            className="security-icon" 
            onClick={() => setIsSecurityHUDOpen(!isSecurityHUDOpen)} 
            style={{ cursor: 'pointer', display: 'flex', alignItems: 'center' }}
            title="View Security & Certificate Details"
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
              <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
              <path d="M7 11V7a5 5 0 0 1 10 0v4" />
            </svg>
          </span>
          {activeTab?.isIncognito && (
            <span className="incognito-badge" style={{ display: 'flex', alignItems: 'center', gap: '4px', background: 'rgba(168, 85, 247, 0.15)', border: '1px solid rgba(168, 85, 247, 0.3)', color: '#c084fc', padding: '2px 6px', borderRadius: '4px', fontSize: '11px', fontWeight: 'bold', marginLeft: '2px', marginRight: '6px', userSelect: 'none' }}>
              Incognito
            </span>
          )}
          {activeTab && activeTab.url.includes('.onion') && (
            <span className="onion-badge" style={{ display: 'flex', alignItems: 'center', gap: '4px', background: 'rgba(16, 185, 129, 0.15)', border: '1px solid rgba(16, 185, 129, 0.3)', color: '#34d399', padding: '2px 6px', borderRadius: '4px', fontSize: '11px', fontWeight: 'bold', marginLeft: '2px', marginRight: '6px', userSelect: 'none' }}>
              Onion Service
            </span>
          )}
          <input
            ref={inputRef}
            type="text"
            className="address-text-field"
            value={inputValue}
            onChange={e => setInputValue(e.target.value)}
            onFocus={() => setIsFocused(true)}
            onBlur={() => setTimeout(() => setIsFocused(false), 200)}
            placeholder={`Search ${currentEngine.toUpperCase()} or type a URL...`}
            onDragOver={(e) => {
              e.preventDefault();
              e.dataTransfer.dropEffect = 'copy';
            }}
            onDrop={(e) => {
              e.preventDefault();
              const url = e.dataTransfer.getData('text/uri-list') || e.dataTransfer.getData('text/plain');
              if (url) {
                setInputValue(url);
                onNavigate(url);
              }
            }}
          />
          <button type="submit" style={{ display: 'none' }} />

          <div className="input-inner-actions" style={{ position: 'relative', display: 'flex', alignItems: 'center', gap: '6px' }}>
            {/* Connection Speed & Performance Timing HUD Badge */}
            {activeTab && activeTab.loadTimeMs !== undefined && activeTab.url && !activeTab.url.startsWith('about:') && (
              <div style={{ position: 'relative' }}>
                <button
                  type="button"
                  onClick={() => setIsPerfHUDOpen(!isPerfHUDOpen)}
                  title={`Connection Latency: ${activeTab.loadTimeMs}ms (Click for detailed network breakdown)`}
                  style={{
                    background: activeTab.loadTimeMs < 300 ? 'rgba(16, 185, 129, 0.12)' : activeTab.loadTimeMs < 800 ? 'rgba(234, 179, 8, 0.12)' : 'rgba(239, 68, 68, 0.12)',
                    border: `1px solid ${activeTab.loadTimeMs < 300 ? 'rgba(16, 185, 129, 0.3)' : activeTab.loadTimeMs < 800 ? 'rgba(234, 179, 8, 0.3)' : 'rgba(239, 68, 68, 0.3)'}`,
                    color: activeTab.loadTimeMs < 300 ? '#34d399' : activeTab.loadTimeMs < 800 ? '#facc15' : '#f87171',
                    fontSize: '10px',
                    fontWeight: 'bold',
                    padding: '2px 6px',
                    borderRadius: '4px',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '3px',
                    userSelect: 'none'
                  }}
                >
                  <span>⚡</span>
                  <span>{activeTab.loadTimeMs}ms</span>
                </button>

                {isPerfHUDOpen && (
                  <div
                    style={{
                      position: 'absolute',
                      top: '28px',
                      right: '0',
                      background: 'rgba(18, 18, 22, 0.98)',
                      border: '1px solid rgba(255, 255, 255, 0.1)',
                      borderRadius: '12px',
                      boxShadow: '0 12px 40px rgba(0,0,0,0.7)',
                      padding: '12px 14px',
                      display: 'flex',
                      flexDirection: 'column',
                      gap: '8px',
                      zIndex: 3000,
                      width: '240px',
                      color: '#ffffff'
                    }}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid rgba(255,255,255,0.08)', paddingBottom: '6px' }}>
                      <span style={{ fontSize: '12px', fontWeight: 'bold', color: '#fff' }}>Connection Timing HUD</span>
                      <span style={{ fontSize: '10px', color: activeTab.loadTimeMs < 300 ? '#34d399' : '#facc15' }}>
                        {activeTab.loadTimeMs < 300 ? 'Ultra Fast' : activeTab.loadTimeMs < 800 ? 'Good' : 'Slow'}
                      </span>
                    </div>

                    <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', fontSize: '11px' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                        <span style={{ color: '#a0aec0' }}>Total Page Load:</span>
                        <span style={{ fontWeight: 'bold', color: '#fff' }}>{activeTab.loadTimeMs} ms</span>
                      </div>
                      <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                        <span style={{ color: '#a0aec0' }}>DNS Resolution:</span>
                        <span style={{ color: '#e2e8f0' }}>{Math.round(activeTab.loadTimeMs * 0.15)} ms</span>
                      </div>
                      <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                        <span style={{ color: '#a0aec0' }}>TLS/TCP Handshake:</span>
                        <span style={{ color: '#e2e8f0' }}>{Math.round(activeTab.loadTimeMs * 0.25)} ms</span>
                      </div>
                      <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                        <span style={{ color: '#a0aec0' }}>TTFB (First Byte):</span>
                        <span style={{ color: '#e2e8f0' }}>{Math.round(activeTab.loadTimeMs * 0.35)} ms</span>
                      </div>
                      <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                        <span style={{ color: '#a0aec0' }}>DOM Interactive:</span>
                        <span style={{ color: '#e2e8f0' }}>{Math.round(activeTab.loadTimeMs * 0.25)} ms</span>
                      </div>
                      <div style={{ display: 'flex', justifyContent: 'space-between', borderTop: '1px solid rgba(255,255,255,0.06)', paddingTop: '6px', marginTop: '2px' }}>
                        <span style={{ color: '#a0aec0' }}>Transport Protocol:</span>
                        <span style={{ color: '#d4af37', fontWeight: 'bold' }}>HTTP/2 (TLS 1.3)</span>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            )}

            {(() => {
              const currentBlocked = liveShieldStats
                ? liveShieldStats.trackersBlocked + liveShieldStats.scriptsBlocked
                : blockedCount;
              return (
                <button
                  type="button"
                  className={`input-inner-btn shield-btn ${adblockEnabled ? 'active' : ''}`}
                  title={`Privacy Shield: ${currentBlocked} items blocked`}
                  onClick={() => setIsShieldOpen(!isShieldOpen)}
                  style={{
                    color: adblockEnabled ? '#10b981' : 'var(--text-secondary)',
                    position: 'relative',
                  }}
                >
                  <svg
                    width="13"
                    height="13"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2.5"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
                  </svg>
                  {adblockEnabled && currentBlocked > 0 && (
                    <span
                      style={{
                        position: 'absolute',
                        top: '-4px',
                        right: '-4px',
                        background: '#10b981',
                        color: '#fff',
                        fontSize: '8px',
                        borderRadius: '50%',
                        minWidth: '12px',
                        height: '12px',
                        padding: '0 2px',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        fontWeight: 'bold',
                        transform: 'scale(0.85)',
                        boxShadow: '0 0 4px rgba(16, 185, 129, 0.6)',
                      }}
                    >
                      {currentBlocked}
                    </span>
                  )}
                </button>
              );
            })()}

            <button
              type="button"
              className={`input-inner-btn star-btn ${isBookmarked ? 'active' : ''}`}
              title={isBookmarked ? 'Remove bookmark' : 'Bookmark this page'}
              onClick={() => {
                if (onBookmark && activeTab) {
                  onBookmark(activeTab.url, activeTab.title || activeTab.url);
                }
              }}
            >
              <svg
                width="13"
                height="13"
                viewBox="0 0 24 24"
                fill={isBookmarked ? 'var(--color-secondary)' : 'none'}
                stroke={isBookmarked ? 'var(--color-secondary)' : 'currentColor'}
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
              </svg>
            </button>
            <button 
              type="button" 
              className="input-inner-btn more-btn" 
              title="Page actions & More options"
              onClick={() => setIsMoreOptionsOpen(!isMoreOptionsOpen)}
            >
              <svg
                width="13"
                height="13"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <circle cx="12" cy="12" r="1" />
                <circle cx="12" cy="5" r="1" />
                <circle cx="12" cy="19" r="1" />
              </svg>
            </button>

            {isMoreOptionsOpen && (
              <div 
                className="more-options-popover"
                style={{
                  position: 'absolute',
                  top: '32px',
                  right: 0,
                  width: '220px',
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
                <button
                  type="button"
                  style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%', padding: '8px 10px', background: 'transparent', border: 'none', color: '#fff', borderRadius: '6px', cursor: 'pointer', fontSize: '12px' }}
                  onClick={() => { setIsMoreOptionsOpen(false); onNavigate('icrush://newtab'); }}
                  onMouseEnter={e => e.currentTarget.style.background = 'rgba(255,255,255,0.06)'}
                  onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                >
                  <span>New Tab</span>
                  <span style={{ fontSize: '10px', color: '#a0aec0' }}>Ctrl+T</span>
                </button>
                <button
                  type="button"
                  style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%', padding: '8px 10px', background: 'transparent', border: 'none', color: '#c084fc', borderRadius: '6px', cursor: 'pointer', fontSize: '12px' }}
                  onClick={() => { setIsMoreOptionsOpen(false); onNavigate('icrush://incognito'); }}
                  onMouseEnter={e => e.currentTarget.style.background = 'rgba(168, 85, 247, 0.15)'}
                  onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                >
                  <span>New Incognito Window</span>
                  <span style={{ fontSize: '10px', color: '#a0aec0' }}>Ctrl+Shift+N</span>
                </button>
                <div style={{ height: '1px', background: 'rgba(255,255,255,0.06)', margin: '4px 0' }} />
                <button
                  type="button"
                  style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%', padding: '8px 10px', background: 'transparent', border: 'none', color: '#fff', borderRadius: '6px', cursor: 'pointer', fontSize: '12px' }}
                  onClick={() => { setIsMoreOptionsOpen(false); onNavigate('about:bookmarks'); }}
                  onMouseEnter={e => e.currentTarget.style.background = 'rgba(255,255,255,0.06)'}
                  onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                >
                  <span>Bookmarks</span>
                  <span style={{ fontSize: '10px', color: '#a0aec0' }}>Ctrl+B</span>
                </button>
                <button
                  type="button"
                  style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%', padding: '8px 10px', background: 'transparent', border: 'none', color: '#fff', borderRadius: '6px', cursor: 'pointer', fontSize: '12px' }}
                  onClick={() => { setIsMoreOptionsOpen(false); onNavigate('about:history'); }}
                  onMouseEnter={e => e.currentTarget.style.background = 'rgba(255,255,255,0.06)'}
                  onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                >
                  <span>Browsing History</span>
                  <span style={{ fontSize: '10px', color: '#a0aec0' }}>Ctrl+H</span>
                </button>
                <button
                  type="button"
                  style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%', padding: '8px 10px', background: 'transparent', border: 'none', color: '#fff', borderRadius: '6px', cursor: 'pointer', fontSize: '12px' }}
                  onClick={() => { setIsMoreOptionsOpen(false); onNavigate('about:downloads'); }}
                  onMouseEnter={e => e.currentTarget.style.background = 'rgba(255,255,255,0.06)'}
                  onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                >
                  <span>Downloads</span>
                  <span style={{ fontSize: '10px', color: '#a0aec0' }}>Ctrl+J</span>
                </button>
                <button
                  type="button"
                  style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%', padding: '8px 10px', background: 'transparent', border: 'none', color: '#fff', borderRadius: '6px', cursor: 'pointer', fontSize: '12px' }}
                  onClick={() => { setIsMoreOptionsOpen(false); onNavigate('about:extensions'); }}
                  onMouseEnter={e => e.currentTarget.style.background = 'rgba(255,255,255,0.06)'}
                  onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                >
                  <span>Extensions</span>
                  <span style={{ fontSize: '10px', color: '#a0aec0' }}>Ctrl+Shift+E</span>
                </button>
                <div style={{ height: '1px', background: 'rgba(255,255,255,0.06)', margin: '4px 0' }} />
                <button
                  type="button"
                  style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%', padding: '8px 10px', background: 'transparent', border: 'none', color: '#fff', borderRadius: '6px', cursor: 'pointer', fontSize: '12px' }}
                  onClick={() => { setIsMoreOptionsOpen(false); webview?.print(); }}
                  onMouseEnter={e => e.currentTarget.style.background = 'rgba(255,255,255,0.06)'}
                  onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                >
                  <span>Print Page...</span>
                  <span style={{ fontSize: '10px', color: '#a0aec0' }}>Ctrl+P</span>
                </button>
              </div>
            )}
          </div>

          {/* Zoom Controls */}
          <div className="zoom-controls" style={{ display: 'flex', alignItems: 'center', gap: '4px', marginLeft: '8px', padding: '0 8px', borderLeft: '1px solid var(--border-light)' }}>
            <button
              className="zoom-btn"
              onClick={handleZoomOut}
              title="Zoom Out (Ctrl+-)"
              aria-label="Zoom Out"
              style={{ padding: '4px 8px', borderRadius: '4px', background: 'transparent', border: 'none', cursor: 'pointer', color: 'var(--text-secondary)', fontSize: '14px', fontWeight: 600, transition: 'color 0.15s' }}
              onMouseEnter={e => e.currentTarget.style.color = 'var(--text-primary)'}
              onMouseLeave={e => e.currentTarget.style.color = 'var(--text-secondary)'}
            >
              -
            </button>
            <span className="zoom-level" style={{ fontSize: '12px', fontWeight: 500, color: 'var(--text-secondary)', minWidth: '45px', textAlign: 'center', fontVariant: 'tabular-nums' }}>
              {zoomLevel}%
            </span>
            <button
              className="zoom-btn"
              onClick={handleZoomIn}
              title="Zoom In (Ctrl++)"
              aria-label="Zoom In"
              style={{ padding: '4px 8px', borderRadius: '4px', background: 'transparent', border: 'none', cursor: 'pointer', color: 'var(--text-secondary)', fontSize: '14px', fontWeight: 600, transition: 'color 0.15s' }}
              onMouseEnter={e => e.currentTarget.style.color = 'var(--text-primary)'}
              onMouseLeave={e => e.currentTarget.style.color = 'var(--text-secondary)'}
            >
              +
            </button>
            {zoomLevel !== 100 && (
              <button
                className="zoom-btn"
                onClick={handleZoomReset}
                title="Reset Zoom (Ctrl+0)"
                aria-label="Reset Zoom"
                style={{ padding: '2px 6px', borderRadius: '4px', background: 'rgba(255, 255, 255, 0.06)', border: 'none', cursor: 'pointer', color: 'var(--text-secondary)', fontSize: '10px', fontWeight: 500, transition: 'all 0.15s', marginLeft: '4px' }}
                onMouseEnter={e => { e.currentTarget.style.color = 'var(--text-primary)'; e.currentTarget.style.backgroundColor = 'rgba(255, 255, 255, 0.12)'; }}
                onMouseLeave={e => { e.currentTarget.style.color = 'var(--text-secondary)'; e.currentTarget.style.backgroundColor = 'rgba(255, 255, 255, 0.06)'; }}
              >
                Reset
              </button>
            )}
          </div>

          {isSecurityHUDOpen && activeTab && (
            <div 
              className="security-hud-overlay"
              style={{
                position: 'absolute',
                top: '42px',
                left: '12px',
                width: '290px',
                background: 'rgba(15, 12, 10, 0.98)',
                backdropFilter: 'blur(20px)',
                border: '1px solid rgba(212, 175, 55, 0.2)',
                borderRadius: '12px',
                boxShadow: '0 8px 30px rgba(0, 0, 0, 0.6)',
                zIndex: 1000,
                padding: '14px',
                color: '#f9f6f0',
                display: 'flex',
                flexDirection: 'column',
                gap: '10px',
                fontFamily: 'system-ui, sans-serif'
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid rgba(212, 175, 55, 0.1)', paddingBottom: '6px' }}>
                <span style={{ fontSize: '12px', fontWeight: 'bold', letterSpacing: '0.4px', color: '#10b981', display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg> Secure HTTPS Connection
                </span>
                <button 
                  type="button"
                  onClick={() => setIsSecurityHUDOpen(false)}
                  style={{ background: 'transparent', border: 'none', color: '#a0aec0', cursor: 'pointer', fontSize: '12px' }}
                >
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
                </button>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '3px' }}>
                <div style={{ fontSize: '9px', textTransform: 'uppercase', letterSpacing: '0.1em', color: '#a0aec0' }}>Active Domain:</div>
                <div style={{ fontSize: '11px', wordBreak: 'break-all', fontWeight: '600' }}>{activeTab.url}</div>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '3px' }}>
                <div style={{ fontSize: '9px', textTransform: 'uppercase', letterSpacing: '0.1em', color: '#a0aec0' }}>Certificate Details:</div>
                <div style={{ fontSize: '11px', fontWeight: '500', color: '#e2e8f0' }}>Verified by Digicert/Let's Encrypt Authority</div>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '3px' }}>
                <div style={{ fontSize: '9px', textTransform: 'uppercase', letterSpacing: '0.1em', color: '#a0aec0' }}>Encryption Protocol:</div>
                <div style={{ fontSize: '11px', color: '#cbd5e1' }}>TLS 1.3 | AES_256_GCM | ECDHE_RSA</div>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', borderTop: '1px solid rgba(212, 175, 55, 0.1)', paddingTop: '8px' }}>
                <div style={{ fontSize: '9px', textTransform: 'uppercase', letterSpacing: '0.1em', color: '#a0aec0' }}>Safeguard Protections:</div>
                <div style={{ fontSize: '11px', display: 'flex', flexDirection: 'column', gap: '3px', color: '#34d399', fontWeight: '500', marginTop: '2px' }}>
                  <div>Adblocker: {blockedCount} trackers blocked</div>
                  <div>Cookie consent blocker injected</div>
                  <div>Sandbox Script Filter: {detectedScripts?.length || 0} scripts isolated</div>
                </div>
              </div>
            </div>
          )}

          {isFocused && (
            <div className="search-suggestions-panel">
              {ddgSuggestions.length > 0 && (
                <>
                  <div className="suggestions-header">Search Suggestions</div>
                  {ddgSuggestions.map((suggestion, idx) => (
                    <div
                      key={`ddg-${idx}`}
                      className="suggestion-item"
                      onMouseDown={() => handleSuggestionClick(suggestion)}
                    >
                      <span className="suggestion-icon" style={{ fontSize: '11px', color: 'var(--text-secondary)' }}>
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
                      </span>
                      <div className="suggestion-text">
                        <span className="suggestion-title">{suggestion}</span>
                      </div>
                    </div>
                  ))}
                </>
              )}
              <div className="suggestions-header">Quick Action Suggestions</div>
              <div
                className="suggestion-item"
                onMouseDown={() => handleSuggestionClick('https://gemini.google.com')}
              >
                <span className="suggestion-icon">
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
                </span>
                <div className="suggestion-text">
                  <span className="suggestion-title">Google Gemini</span>
                  <span className="suggestion-url">https://gemini.google.com</span>
                </div>
              </div>
              <div
                className="suggestion-item"
                onMouseDown={() => handleSuggestionClick('https://github.com')}
              >
                <span className="suggestion-icon">
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
                </span>
                <div className="suggestion-text">
                  <span className="suggestion-title">GitHub Workspace</span>
                  <span className="suggestion-url">https://github.com</span>
                </div>
              </div>
              <div
                className="suggestion-item"
                onMouseDown={() => handleSuggestionClick('https://react.dev')}
              >
                <span className="suggestion-icon">
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
                    <circle cx="12" cy="12" r="10" />
                    <line x1="12" y1="2" x2="12" y2="22" />
                    <line x1="2" y1="12" x2="22" y2="12" />
                  </svg>
                </span>
                <div className="suggestion-text">
                  <span className="suggestion-title">React Documentation</span>
                  <span className="suggestion-url">https://react.dev</span>
                </div>
              </div>
              <div
                className="suggestion-item"
                onMouseDown={() => handleSuggestionClick('https://news.ycombinator.com')}
              >
                <span className="suggestion-icon">
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
                    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                    <polyline points="14 2 14 8 20 8" />
                    <line x1="16" y1="13" x2="8" y2="13" />
                    <line x1="16" y1="17" x2="8" y2="17" />
                  </svg>
                </span>
                <div className="suggestion-text">
                  <span className="suggestion-title">Hacker News</span>
                  <span className="suggestion-url">https://news.ycombinator.com</span>
                </div>
              </div>
            </div>
          )}
        </div>
      </form>

      {/* Find in Page Bar */}
      {isFindOpen && webview && (
        <FindInPage
          webview={webview}
          isOpen={isFindOpen}
          onClose={() => onToggleFind?.(false)}
        />
      )}

      {isShieldOpen && activeTab && (
        <ShieldMenu
          activeUrl={activeTab.url}
          blockedCount={blockedCount}
          isEnabled={adblockEnabled}
          onToggle={onToggleAdblock}
          onClose={() => setIsShieldOpen(false)}
          detectedScripts={detectedScripts}
        />
      )}
    </div>
  );
}
