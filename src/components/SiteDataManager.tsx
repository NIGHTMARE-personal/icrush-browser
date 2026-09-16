/* eslint-disable @typescript-eslint/no-explicit-any */
import React, { useState, useEffect, useCallback } from 'react';

interface Cookie {
  name: string;
  value: string;
  domain: string;
  path: string;
  expires: number;
  secure: boolean;
  httpOnly: boolean;
  sameSite: 'strict' | 'lax' | 'none' | 'no_restriction';
  session: boolean;
}

interface SiteData {
  origin: string;
  cookies: Cookie[];
  localStorage: number;
  sessionStorage: number;
  indexedDB: number;
  cacheStorage: number;
  serviceWorker: boolean;
}

interface SiteDataManagerProps {
  webview: Electron.WebviewTag | null;
  isOpen: boolean;
  onClose: () => void;
}

export function SiteDataManager({ webview, isOpen, onClose }: SiteDataManagerProps) {
  const [sites, setSites] = useState<SiteData[]>([]);
  const [searchText, setSearchText] = useState('');
  const [loading, setLoading] = useState(false);
  const [showCookies, setShowCookies] = useState<Record<string, boolean>>({});

  const loadSites = useCallback(async () => {
    if (!webview) return;
    setLoading(true);
    try {
      // Get all cookies from the webview session via IPC
      const partition = webview.getAttribute('partition') || undefined;
      const cookies = await window.electronAPI.session.getCookies(partition);
      
      // Group cookies by origin
      const siteMap = new Map<string, SiteData>();
      
      for (const cookie of cookies) {
        try {
          const url = new URL(cookie.url);
          const origin = url.origin;
          
          if (!siteMap.has(origin)) {
            siteMap.set(origin, {
              origin,
              cookies: [],
              localStorage: 0,
              sessionStorage: 0,
              indexedDB: 0,
              cacheStorage: 0,
              serviceWorker: false,
            });
          }
          
          const site = siteMap.get(origin)!;
          site.cookies.push({
            name: cookie.name,
            value: cookie.value,
            domain: cookie.domain,
            path: cookie.path,
            expires: cookie.expirationDate ? Math.floor(cookie.expirationDate) : Date.now() + 86400000,
            secure: cookie.secure,
            httpOnly: cookie.httpOnly,
            sameSite: cookie.sameSite as any,
            session: cookie.session,
          });
        } catch (e) {
          console.warn('Failed to parse cookie URL:', cookie.url);
        }
      }
      
      setSites(Array.from(siteMap.values()));
    } catch (err) {
      console.error('Failed to load site data:', err);
    } finally {
      setLoading(false);
    }
  }, [webview]);

  useEffect(() => {
    if (isOpen) {
      loadSites();
    }
  }, [isOpen, webview, loadSites]);

  const toggleCookies = (origin: string) => {
    setShowCookies(prev => ({ ...prev, [origin]: !prev[origin] }));
  };

  const deleteCookie = async (origin: string, name: string) => {
    if (!webview) return;
    try {
      const partition = webview.getAttribute('partition') || undefined;
      // Since cookie urls are domain based, construct a rough url for deletion key matching
      const isSecure = origin.startsWith('https://');
      const domain = origin.replace(/https?:\/\//, '');
      const url = `http${isSecure ? 's' : ''}://${domain}`;
      const success = await window.electronAPI.session.deleteCookie(url, name, partition);
      if (success) {
        await loadSites();
      }
    } catch (err) {
      console.error('Failed to delete cookie:', err);
    }
  };

  const clearSiteData = async (origin: string) => {
    if (!webview) return;
    if (!confirm(`Clear all cookies and local data for ${origin}?`)) return;
    try {
      const partition = webview.getAttribute('partition') || undefined;
      const success = await window.electronAPI.session.clearData(origin, partition);
      if (success) {
        try {
          webview.reloadIgnoringCache();
        } catch (e) {
          console.warn('Webview hard reload warning:', e);
        }
        await loadSites();
      }
    } catch (err) {
      console.error('Failed to clear site data:', err);
    }
  };



  const formatDate = (timestamp: number): string => {
    if (timestamp === 0 || timestamp > 8640000000000000) return 'Session';
    return new Date(timestamp).toLocaleString();
  };

  const filteredSites = sites.filter(site => 
    site.origin.toLowerCase().includes(searchText.toLowerCase())
  );

  if (!isOpen) return null;

  return (
    <div className="site-data-overlay" onClick={onClose}>
      <div className="site-data-panel" onClick={e => e.stopPropagation()}>
        <div className="site-data-header">
          <h2>Site Data & Cookies</h2>
          <button className="site-data-close" onClick={onClose} aria-label="Close">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>

        <div className="site-data-toolbar">
          <input
            type="text"
            className="site-data-search"
            placeholder="Search sites..."
            value={searchText}
            onChange={e => setSearchText(e.target.value)}
          />
          <span className="site-count">{filteredSites.length} sites</span>
        </div>

        <div className="site-data-list">
          {loading ? (
            <div className="site-data-loading">Loading site data...</div>
          ) : filteredSites.length === 0 ? (
            <div className="site-data-empty">
              <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                <polyline points="7 10 12 15 17 10" />
                <line x1="12" y1="15" x2="12" y2="3" />
              </svg>
              <p>No site data found</p>
            </div>
          ) : (
            filteredSites.map(site => (
              <div key={site.origin} className="site-data-item">
                <div className="site-data-header" onClick={() => setShowCookies(prev => ({ ...prev, [site.origin]: !prev[site.origin] }))}>
                  <div className="site-info">
                    <span className="site-origin">{site.origin}</span>
                    <span className="site-cookie-count">{site.cookies.length} cookies</span>
                  </div>
                  <button
                    className="expand-toggle"
                    onClick={e => { e.stopPropagation(); toggleCookies(site.origin); }}
                    aria-label={showCookies[site.origin] ? 'Collapse' : 'Expand'}
                  >
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <polyline points={showCookies[site.origin] ? "18 15 12 9 6 15" : "6 9 12 15 18 9"} />
                    </svg>
                  </button>
                </div>

                {showCookies[site.origin] && (
                  <div className="cookies-list">
                    {site.cookies.map(cookie => (
                      <div key={`${cookie.name}-${cookie.domain}-${cookie.path}`} className="cookie-item">
                        <div className="cookie-info">
                          <span className="cookie-name">{cookie.name}</span>
                          <span className="cookie-domain">{cookie.domain}</span>
                          <span className="cookie-expires">{formatDate(cookie.expires)}</span>
                          <span className={`cookie-flags ${cookie.secure ? 'secure' : ''} ${cookie.httpOnly ? 'httponly' : ''}`}>
                            {cookie.secure ? '🔒' : ''} {cookie.httpOnly ? '🔐' : ''} {cookie.sameSite}
                          </span>
                        </div>
                        <button
                          className="cookie-delete"
                          onClick={(e) => { e.stopPropagation(); deleteCookie(site.origin, cookie.name); }}
                          title="Delete cookie"
                        >
                          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <polyline points="3 6 5 6 21 6" />
                            <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                          </svg>
                        </button>
                      </div>
                    ))}
                    <div className="site-actions">
                      <button className="site-action-btn" onClick={() => clearSiteData(site.origin)}>
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                          <polyline points="3 6 5 6 21 6" />
                          <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                        </svg>
                        Clear Site Data
                      </button>
                    </div>
                  </div>
                )}
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}