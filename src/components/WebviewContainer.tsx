/* eslint-disable @typescript-eslint/no-explicit-any */
import React, { useRef, useCallback, useEffect, memo } from 'react';
import { IcrushBrowserHomescreen } from './IcrushBrowserHomescreen';
import { HistoryDashboard } from './HistoryDashboard';
import { BookmarksDashboard } from './BookmarksDashboard';
import { DownloadsDashboard } from './DownloadsDashboard';
import { SecurityWarning } from './SecurityWarning';
import { SleepingScreen } from './SleepingScreen';
import { WorkspacesMindMap } from './WorkspacesMindMap';
import { NodesCanvas } from './NodesCanvas';
import { FormAutofill } from './FormAutofill';
import { ChronosDashboard } from './ChronosDashboard';
import { AIChatDashboard } from './AIChatDashboard';
import { ExtensionsDashboard } from './ExtensionsDashboard';

interface Tab {
  id: string;
  url: string;
  title: string;
  loading: boolean;
  canGoBack: boolean;
  canGoForward: boolean;
  isSuspended?: boolean;
  torMode?: boolean;
  torSessionId?: string;
  isIncognito?: boolean;
}

interface Workspace {
  id: string;
  name: string;
  color: string;
  tabIds: string[];
}

interface WebviewContainerProps {
  tabs: Tab[];
  activeId: string | null;
  registerWebview: (id: string, element: Electron.WebviewTag | null) => void;
  onNavigate: (id: string, url: string) => void;
  onTitleChange: (id: string, title: string) => void;
  onLoadingChange: (id: string, loading: boolean) => void;
  onCanGoBackChange: (id: string, canGoBack: boolean) => void;
  onCanGoForwardChange: (id: string, canGoForward: boolean) => void;
  onAudioStatusChange?: (id: string, isAudible: boolean, isMuted: boolean) => void;
  onOpenSettings?: (tab?: string) => void;
  onOpenProfile?: () => void;
  onFocusAISidebar?: () => void;
  onOpenAIChatWindow?: (initialPrompt?: string) => void;
  onToggleWorkspaces?: () => void;
  onCreateTab?: () => void;
  onGoBack?: (id: string) => void;
  onUpdateTab?: (id: string, patch: Partial<Tab>) => void;
  onCloseTab?: (id: string) => void;
  onFocusTab?: (id: string) => void;
  workspaces?: Workspace[];
  onUpdateWorkspaces?: (workspaces: Workspace[]) => void;
  currentEngine?: string;
  onSelectEngine?: (engine: string) => void;
  onSelectPalette?: (palette: string) => void;
  onContextMenu?: (params: any) => void;
  onInlineMenuAction?: (action: string, text: string) => void;
  apiKeys?: Record<string, string>;
  activeProvider?: string;
}

export const WebviewContainer = memo(function WebviewContainer({
  tabs,
  activeId,
  registerWebview,
  onNavigate,
  onTitleChange,
  onLoadingChange,
  onCanGoBackChange,
  onCanGoForwardChange,
  onAudioStatusChange,
  onOpenSettings = () => {},
  onOpenProfile = () => {},
  onFocusAISidebar = () => {},
  onOpenAIChatWindow = () => {},
  onToggleWorkspaces = () => {},
  onCreateTab = () => {},
  onGoBack,
  onUpdateTab = () => {},
  onCloseTab = () => {},
  onFocusTab = () => {},
  workspaces = [],
  onUpdateWorkspaces = () => {},
  currentEngine,
  onSelectEngine,
  onSelectPalette,
  onContextMenu,
  apiKeys = {},
  activeProvider = 'local',
  ..._rest
}: WebviewContainerProps) {
  const webviewListeners = useRef<Map<string, () => void>>(new Map());

  useEffect(() => {
    const handleReload = () => {
      if (activeId) {
        const el = document.querySelector(`webview[data-tab-id="${activeId}"]`) as Electron.WebviewTag | null;
        try {
          el?.reload();
        } catch {
          // ignore
        }
      }
    };
    window.addEventListener('shields-reload-webview', handleReload);
    return () => window.removeEventListener('shields-reload-webview', handleReload);
  }, [activeId]);

  const registerWebviewRef = useCallback((tabId: string, el: Electron.WebviewTag | null) => {
    if (el) {
      // Detach any previous listeners for this tab to avoid listener accumulation
      const prevCleanup = webviewListeners.current.get(tabId);
      if (prevCleanup) {
        prevCleanup();
        webviewListeners.current.delete(tabId);
      }

      registerWebview(tabId, el);

      // Register partition for Tor tabs only
      const initialPartition = el.getAttribute('partition') || el.partition;
      const isTorPartition = (initialPartition && initialPartition.includes('tor-')) || tabs.some(t => t.id === tabId && t.torMode);
      if (initialPartition && isTorPartition) {
        window.electronAPI.tor.registerPartition(initialPartition).catch((err: unknown) => {
          console.warn(`[Tor] Failed to register partition ${initialPartition} immediately:`, err);
        });
      }

      const updateNavState = () => {
        try {
          onCanGoBackChange?.(tabId, el.canGoBack());
          onCanGoForwardChange?.(tabId, el.canGoForward());
        } catch {
          // ignore
        }
      };

      const handleAttach = () => {
        updateNavState();
        const partition = el.getAttribute('partition') || el.partition;
        const isTor = (partition && partition.includes('tor-')) || tabs.some(t => t.id === tabId && t.torMode);
        if (partition && isTor) {
          window.electronAPI.tor.registerPartition(partition).catch((err: unknown) => {
            console.warn(`[Tor] Failed to register partition ${partition} on did-attach:`, err);
          });
        }
        const srcUrl = el.getAttribute('src') || el.src;
        if (srcUrl && srcUrl !== 'about:blank' && !srcUrl.startsWith('about:') && !srcUrl.startsWith('chrome://')) {
          const tryLoad = (retries: number) => {
            try {
              const currentUrl = el.getURL();
              if (!currentUrl || currentUrl === '' || currentUrl === 'about:blank') {
                el.loadURL(srcUrl).catch(() => {
                  if (retries > 0) setTimeout(() => tryLoad(retries - 1), 300);
                });
              }
            } catch {
              try {
                el.loadURL(srcUrl).catch(() => {
                  if (retries > 0) setTimeout(() => tryLoad(retries - 1), 300);
                });
              } catch { /* ignore */ }
            }
          };
          tryLoad(2);
          setTimeout(() => {
            try {
              const cur = el.getURL();
              if (!cur || cur === '' || cur === 'about:blank') {
                el.loadURL(srcUrl).catch(() => {});
              }
            } catch {
              try { el.loadURL(srcUrl).catch(() => {}); } catch { /* ignore */ }
            }
          }, 500);
        }
      };

      const handleTitle = (e: any) => {
        if (e.title) {
          onTitleChange?.(tabId, e.title);
        }
      };

      const handleStartLoading = () => {
        onLoadingChange?.(tabId, true);
      };

      const handleStopLoading = () => {
        onLoadingChange?.(tabId, false);
        updateNavState();
      };

      const handleDidNavigate = (e: any) => {
        if (e.url && !e.url.startsWith('about:blank')) {
          onNavigate?.(tabId, e.url);
        }
        updateNavState();
      };

      const handleDidNavigateInPage = (e: any) => {
        if (e.url && !e.url.startsWith('about:blank')) {
          onNavigate?.(tabId, e.url);
        }
        updateNavState();
      };

      const handleMediaStarted = () => {
        try {
          onAudioStatusChange?.(tabId, true, el.isAudioMuted());
        } catch {
          // ignore
        }
      };

      const handleMediaPaused = () => {
        try {
          onAudioStatusChange?.(tabId, false, el.isAudioMuted());
        } catch {
          // ignore
        }
      };

      // Crash recovery: listen for render-process-gone
      const handleCrash = () => {
        console.warn(`[Crash Recovery] Webview crashed for tab ${tabId}. Reloading...`);
        setTimeout(() => {
          try {
            el.reload();
          } catch (err) {
            console.error('Failed to reload crashed webview:', err);
          }
        }, 1000);
      };

      // Context menu: forward right-click events to React
      const handleContextMenu = (e: any) => {
        e.preventDefault();
        onContextMenu?.(e.params);
      };

      // DOM Ready: Anti-Fingerprinting Shield & Live Script Discovery
      const handleDomReady = async () => {
        updateNavState();
        try {
          // 1. Anti-Fingerprinting Protections Injection
          const antiFingerprintCode = `
            (function() {
              if (window.__icrush_fingerprint_shield__) return;
              window.__icrush_fingerprint_shield__ = true;

              // Canvas Noise
              try {
                const origToDataURL = HTMLCanvasElement.prototype.toDataURL;
                HTMLCanvasElement.prototype.toDataURL = function(type, ...args) {
                  try {
                    const ctx = this.getContext('2d');
                    if (ctx && this.width > 0 && this.height > 0) {
                      const img = ctx.getImageData(0, 0, Math.min(this.width, 10), Math.min(this.height, 10));
                      for (let i = 0; i < img.data.length; i += 4) {
                        img.data[i] = (img.data[i] + (Math.random() < 0.5 ? 1 : -1) + 256) % 256;
                      }
                      ctx.putImageData(img, 0, 0);
                    }
                  } catch(e) {}
                  return origToDataURL.apply(this, [type, ...args]);
                };
              } catch(e) {}

              // WebGL Spoofing
              try {
                const spoofVendor = (glProto) => {
                  const orig = glProto.getParameter;
                  glProto.getParameter = function(param) {
                    if (param === 37445) return 'Intel Inc.';
                    if (param === 37446) return 'Intel Iris OpenGL Engine';
                    return orig.apply(this, [param]);
                  };
                };
                if (typeof WebGLRenderingContext !== 'undefined') spoofVendor(WebGLRenderingContext.prototype);
                if (typeof WebGL2RenderingContext !== 'undefined') spoofVendor(WebGL2RenderingContext.prototype);
              } catch(e) {}

              // AudioContext Noise
              try {
                const AudioCtx = window.AudioContext || window.webkitAudioContext;
                if (AudioCtx && AudioCtx.prototype.createAnalyser) {
                  const origGetFloat = AnalyserNode.prototype.getFloatFrequencyData;
                  AnalyserNode.prototype.getFloatFrequencyData = function(arr) {
                    origGetFloat.apply(this, [arr]);
                    for (let i = 0; i < arr.length; i += 8) {
                      arr[i] += (Math.random() - 0.5) * 0.1;
                    }
                  };
                }
              } catch(e) {}
            })();
          `;
          el.executeJavaScript(antiFingerprintCode).catch(() => {});

          // 2. Cosmetic Ad Filtering — hide ad containers via CSS injection
          const cosmeticCSS = [
            '[id*="ad-"], [class*="ad-"], [id*="ads-"], [class*="ads-"]',
            '[id*="advert"], [class*="advert"], [id*="promo"], [class*="promo"]',
            '[id*="sponsor"], [class*="sponsor"], [id*="banner-ad"], [class*="banner-ad"]',
            '[id*="google_ad"], [class*="google_ad"], [id*="googletag"], [class*="googletag"]',
            '[id*="taboola"], [class*="taboola"], [id*="outbrain"], [class*="outbrain"]',
            '[id*="criteo"], [class*="criteo"], [id*="amazon-ad"], [class*="amazon-ad"]',
            'ins.adsbygoogle, .adsbygoogle, [data-ad], [data-ad-slot]',
            '[id*="super-ad"], [class*="super-ad"], [id*="sticky-ad"], [class*="sticky-ad"]',
            '[id*="footer-ad"], [class*="footer-ad"], [id*="sidebar-ad"], [class*="sidebar-ad"]',
            '[id*="popup-ad"], [class*="popup-ad"], [id*="overlay-ad"], [class*="overlay-ad"]',
            '.ad-container, .ad-wrapper, .ad-slot, .ad-unit, .ad-block',
            '.advertisement, .advertising, .sponsored-content',
            '[aria-label="advertisement"], [aria-label="ad"]',
          ].join(', ');
          el.insertCSS(cosmeticCSS + ' { display: none !important; visibility: hidden !important; height: 0 !important; min-height: 0 !important; overflow: hidden !important; }').catch(() => {});

          // 3. Discover DOM scripts for Branch Tree
          const scriptScanCode = `
            (function() {
              const scripts = Array.from(document.querySelectorAll('script[src]')).map(s => s.src).filter(Boolean);
              return scripts;
            })();
          `;
          const foundScripts = await el.executeJavaScript(scriptScanCode);
          if (Array.isArray(foundScripts) && foundScripts.length > 0) {
            const currentUrl = el.getURL();
            if (currentUrl && !currentUrl.startsWith('about:') && !currentUrl.startsWith('chrome:')) {
              const domain = new URL(currentUrl).hostname;
              for (const src of foundScripts) {
                window.electronAPI?.shields?.recordScript?.(domain, src, false);
              }
            }
          }
        } catch {
          // ignore
        }
      };

      el.addEventListener('did-attach', handleAttach);
      el.addEventListener('page-title-updated', handleTitle as EventListener);
      el.addEventListener('did-start-loading', handleStartLoading);
      el.addEventListener('did-stop-loading', handleStopLoading);
      el.addEventListener('did-navigate', handleDidNavigate as EventListener);
      el.addEventListener('did-navigate-in-page', handleDidNavigateInPage as EventListener);
      el.addEventListener('media-started-playing', handleMediaStarted);
      el.addEventListener('media-paused', handleMediaPaused);
      el.addEventListener('render-process-gone', handleCrash as EventListener);
      el.addEventListener('context-menu', handleContextMenu as EventListener);
      el.addEventListener('dom-ready', handleDomReady);
      
      webviewListeners.current.set(tabId, () => {
        el.removeEventListener('did-attach', handleAttach);
        el.removeEventListener('page-title-updated', handleTitle as EventListener);
        el.removeEventListener('did-start-loading', handleStartLoading);
        el.removeEventListener('did-stop-loading', handleStopLoading);
        el.removeEventListener('did-navigate', handleDidNavigate as EventListener);
        el.removeEventListener('did-navigate-in-page', handleDidNavigateInPage as EventListener);
        el.removeEventListener('media-started-playing', handleMediaStarted);
        el.removeEventListener('media-paused', handleMediaPaused);
        el.removeEventListener('render-process-gone', handleCrash as EventListener);
        el.removeEventListener('context-menu', handleContextMenu as EventListener);
        el.removeEventListener('dom-ready', handleDomReady);
      });
    } else {
      const cleanup = webviewListeners.current.get(tabId);
      if (cleanup) {
        cleanup();
        webviewListeners.current.delete(tabId);
      }
      registerWebview(tabId, null);
    }
  }, [
    registerWebview,
    tabs,
    onTitleChange,
    onLoadingChange,
    onCanGoBackChange,
    onCanGoForwardChange,
    onAudioStatusChange,
    onNavigate,
    onContextMenu,
  ]);

  return (
    <div className="webview-container">
      {tabs.map(tab => {
        const isActive = tab.id === activeId;
        const isHomescreen = tab.url === 'about:blank' || tab.url === '';
        const isHistory = tab.url === 'about:history' || tab.url === 'chrome://history';
        const isBookmarks = tab.url === 'about:bookmarks' || tab.url === 'chrome://bookmarks';
        const isDownloads = tab.url === 'about:downloads' || tab.url === 'chrome://downloads';
        const isExtensions = tab.url === 'about:extensions' || tab.url === 'chrome://extensions' || tab.url === 'edge://extensions' || tab.url === 'brave://extensions';
        const isAI = tab.url === 'about:ai' || tab.url === 'about:chat' || tab.url === 'chrome://ai' || tab.url.startsWith('about:ai?');
        const isChronos = tab.url === 'about:timer' || tab.url === 'about:chronos' || tab.url === 'about:calendar' || tab.url === 'chrome://timer' || tab.url === 'chrome://calendar';
        const isWorkspaces = tab.url === 'about:workspaces' || tab.url === 'chrome://workspaces';
        const isNodes = tab.url === 'about:nodes' || tab.url === 'chrome://nodes';
        const isWarning =
          tab.url.startsWith('about:warning') || tab.url.startsWith('chrome://warning');

        // Unified partition: standard tabs share 'persist:main-profile', Tor and Incognito remain isolated
        const partition = tab.isIncognito
          ? (tab.torSessionId ? `incognito-tor-${tab.torSessionId}` : 'incognito-session')
          : (tab.torSessionId ? `persist:tor-${tab.torSessionId}` : (tab.torMode ? 'persist:tor-global' : 'persist:main-profile'));

        return (
          <div
            key={tab.id}
            className={`webview-viewport-wrapper ${isActive ? 'active' : 'inactive'}`}
            style={{
              width: '100%',
              height: '100%',
              display: isActive ? 'flex' : 'none',
              flexDirection: 'column',
              flex: 1,
            }}
          >
            {(function () {
              if (tab.isSuspended) {
                return isActive ? (
                  <SleepingScreen
                    url={tab.url}
                    title={tab.title}
                    onUnsuspend={() => onUpdateTab(tab.id, { isSuspended: false })}
                  />
                ) : null;
              }
              if (isHomescreen) {
                return isActive ? (
                  <IcrushBrowserHomescreen
                    tabs={tabs}
                    onNavigate={url => onNavigate(tab.id, url)}
                    onOpenSettings={onOpenSettings}
                    onOpenProfile={onOpenProfile}
                    onFocusAISidebar={onFocusAISidebar}
                    onOpenAIChatWindow={onOpenAIChatWindow}
                    onToggleWorkspaces={onToggleWorkspaces}
                    onCreateTab={onCreateTab}
                    currentEngine={currentEngine}
                    onSelectEngine={onSelectEngine}
                    isIncognito={tab.isIncognito}
                    onSelectPalette={onSelectPalette}
                  />
                ) : null;
              }
              if (isHistory) {
                return isActive ? (
                  <HistoryDashboard
                    onNavigate={url => onNavigate(tab.id, url)}
                    onCreateTab={onCreateTab}
                  />
                ) : null;
              }
              if (isBookmarks) {
                return isActive ? (
                  <BookmarksDashboard onNavigate={url => onNavigate(tab.id, url)} onCreateTab={onCreateTab} />
                ) : null;
              }
              if (isDownloads) {
                return isActive ? (
                  <DownloadsDashboard onNavigate={url => onNavigate(tab.id, url)} onCreateTab={onCreateTab} />
                ) : null;
              }
              if (isExtensions) {
                return isActive ? (
                  <ExtensionsDashboard
                    onNavigate={url => onNavigate(tab.id, url)}
                    onCreateTab={onCreateTab}
                    onOpenSettings={onOpenSettings}
                  />
                ) : null;
              }
              if (isAI) {
                return isActive ? (
                  <AIChatDashboard
                    onNavigate={url => onNavigate(tab.id, url)}
                    onOpenSettings={onOpenSettings}
                    apiKeys={apiKeys}
                  />
                ) : null;
              }
              if (isChronos) {
                return isActive ? (
                  <ChronosDashboard
                    onClose={() => onNavigate(tab.id, 'about:blank')}
                    onNavigate={url => onNavigate(tab.id, url)}
                    onOpenSettings={onOpenSettings}
                  />
                ) : null;
              }
              if (isWorkspaces) {
                return isActive ? (
                  <WorkspacesMindMap
                    tabs={tabs}
                    workspaces={workspaces}
                    onUpdateWorkspaces={onUpdateWorkspaces}
                    onFocusTab={onFocusTab}
                    onCloseTab={onCloseTab}
                    onNavigate={url => onNavigate(tab.id, url)}
                  />
                ) : null;
              }
              if (isNodes) {
                return isActive ? (
                  <NodesCanvas onNavigate={url => onNavigate(tab.id, url)} />
                ) : null;
              }
              if (isWarning) {
                return isActive ? (
                  <SecurityWarning
                    url={(() => {
                      try {
                        const params = new URLSearchParams(tab.url.substring(tab.url.indexOf('?')));
                        return params.get('url') || '';
                      } catch {
                        return '';
                      }
                    })()}
                    reason={(() => {
                      try {
                        const params = new URLSearchParams(tab.url.substring(tab.url.indexOf('?')));
                        return params.get('reason') || 'malware';
                      } catch {
                        return 'malware';
                      }
                    })()}
                    onGoBack={() => {
                      if (onGoBack) {
                        onGoBack(tab.id);
                      } else {
                        onNavigate(tab.id, 'about:blank');
                      }
                    }}
                    onProceed={async () => {
                      try {
                        const params = new URLSearchParams(tab.url.substring(tab.url.indexOf('?')));
                        const targetUrl = params.get('url') || 'about:blank';
                        await window.electronAPI.security.bypassUrl(targetUrl);
                        onNavigate(tab.id, targetUrl);
                      } catch (e) {
                        console.error(e);
                      }
                    }}
                  />
                ) : null;
              }

              const WebviewComponent = 'webview' as any;
              return (
                <WebviewComponent
                  key={tab.id}
                  data-tab-id={tab.id}
                  src={tab.url}
                  partition={partition}
                  className="electron-webview"
                  style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, width: '100%', height: '100%', border: 'none' }}
                  ref={(el: Electron.WebviewTag | null) => registerWebviewRef(tab.id, el)}
                  javascript={true}
                  useragent="Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
                />
              );
            })()}
          </div>
        );
      })}
      <FormAutofill
        webview={(() => {
          const active = tabs.find(t => t.id === activeId);
          if (!active || active.isSuspended || active.url === 'about:blank' || active.url === '') return null;
          const el = document.querySelector(`webview[data-tab-id="${active.id}"]`) as Electron.WebviewTag | null;
          return el;
        })()}
        currentUrl={tabs.find(t => t.id === activeId)?.url || ''}
      />
    </div>
  );
});