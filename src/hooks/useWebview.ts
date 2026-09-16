import { useRef, useCallback, useEffect } from 'react';

type ElectronWebview = Electron.WebviewTag;

interface WebviewRefs {
  [key: string]: ElectronWebview | null;
}

interface HibernatedTab {
  id: string;
  url: string;
  title: string;
  scrollX: number;
  scrollY: number;
  hibernatedAt: number;
}

const HIBERNATION_DELAY = 5 * 60 * 1000; // 5 minutes

export function useWebview() {
  const webviewRefs = useRef<WebviewRefs>({});
  const hibernationTimers = useRef<Map<string, NodeJS.Timeout>>(new Map());
  const hibernatedTabs = useRef<Map<string, HibernatedTab>>(new Map());

  const registerWebview = useCallback((id: string, element: ElectronWebview | null) => {
    if (element) {
      webviewRefs.current[id] = element;
      // Cancel hibernation if tab becomes active again
      const timer = hibernationTimers.current.get(id);
      if (timer) {
        clearTimeout(timer);
        hibernationTimers.current.delete(id);
      }
    } else {
      delete webviewRefs.current[id];
    }
  }, []);

  const getWebview = useCallback((id: string): ElectronWebview | undefined => {
    return webviewRefs.current[id];
  }, []);

  const goBack = useCallback(
    (id: string) => {
      const webview = getWebview(id);
      if (webview && webview.canGoBack()) {
        webview.goBack();
      }
    },
    [getWebview]
  );

  const goForward = useCallback(
    (id: string) => {
      const webview = getWebview(id);
      if (webview && webview.canGoForward()) {
        webview.goForward();
      }
    },
    [getWebview]
  );

  const reload = useCallback(
    (id: string) => {
      const webview = getWebview(id);
      if (webview) {
        webview.reload();
      }
    },
    [getWebview]
  );

  const stop = useCallback(
    (id: string) => {
      const webview = getWebview(id);
      if (webview) {
        webview.stop();
      }
    },
    [getWebview]
  );

  const navigate = useCallback(
    (id: string, url: string) => {
      const webview = getWebview(id);
      if (webview) {
        try {
          const currentUrl = webview.getURL();
          if (currentUrl === url) return;
          webview.loadURL(url);
        } catch {
          try { webview.loadURL(url); } catch {
            webview.src = url;
          }
        }
      }
    },
    [getWebview]
  );

  // Tab Hibernation Logic
  const hibernateTab = useCallback(
    (id: string) => {
      const webview = getWebview(id);
      if (!webview) return;

      try {
        // Save scroll position before hibernating
        webview
          .executeJavaScript(
            `
        JSON.stringify({
          scrollX: window.scrollX,
          scrollY: window.scrollY,
          title: document.title,
          url: window.location.href
        })
      `
          )
          .then((result: unknown) => {
            const state = JSON.parse(result as string);
            hibernatedTabs.current.set(id, {
              id,
              url: state.url,
              title: state.title,
              scrollX: state.scrollX,
              scrollY: state.scrollY,
              hibernatedAt: Date.now(),
            });

            // Clear the webview src to free memory
            webview.src = 'about:blank';
            console.log(`Tab ${id} hibernated`);
          })
          .catch(err => {
            console.error('Failed to hibernate tab:', err);
          });
      } catch (err) {
        console.error('Hibernation error:', err);
      }
    },
    [getWebview]
  );

  const wakeTab = useCallback(
    (id: string, originalUrl: string) => {
      const webview = getWebview(id);
      const hibernated = hibernatedTabs.current.get(id);
      if (!webview || !hibernated) return;

      webview.src = originalUrl;

      // Restore scroll position after load
      const handleLoad = () => {
        webview.removeEventListener('did-stop-loading', handleLoad);
        webview
          .executeJavaScript(
            `
        window.scrollTo(${hibernated.scrollX}, ${hibernated.scrollY});
      `
          )
          .catch(console.error);
        hibernatedTabs.current.delete(id);
        console.log(`Tab ${id} restored`);
      };

      webview.addEventListener('did-stop-loading', handleLoad);
    },
    [getWebview]
  );

  const scheduleHibernation = useCallback(
    (id: string, isActive: boolean) => {
      // Clear existing timer
      const existingTimer = hibernationTimers.current.get(id);
      if (existingTimer) {
        clearTimeout(existingTimer);
      }

      if (!isActive) {
        const timer = setTimeout(() => {
          hibernateTab(id);
          hibernationTimers.current.delete(id);
        }, HIBERNATION_DELAY);
        hibernationTimers.current.set(id, timer);
      }
    },
    [hibernateTab]
  );

  const getHibernatedTabs = useCallback((): HibernatedTab[] => {
    return Array.from(hibernatedTabs.current.values());
  }, []);

  const clearHibernation = useCallback((id: string) => {
    const timer = hibernationTimers.current.get(id);
    if (timer) {
      clearTimeout(timer);
      hibernationTimers.current.delete(id);
    }
    hibernatedTabs.current.delete(id);
  }, []);

  const setTabMuted = useCallback(
    (id: string, muted: boolean) => {
      const webview = getWebview(id);
      if (webview) {
        try {
          webview.setAudioMuted(muted);
        } catch (err) {
          console.error('Failed to set mute status:', err);
        }
      }
    },
    [getWebview]
  );

  const setTabVolume = useCallback(
    (id: string, volume: number) => {
      const webview = getWebview(id);
      if (webview) {
        try {
          webview
            .executeJavaScript(
              `
            (() => {
              const mediaEls = document.querySelectorAll('video, audio');
              mediaEls.forEach(el => {
                el.volume = ${volume};
              });
            })()
          `
            )
            .catch(console.error);
        } catch (err) {
          console.error('Failed to set volume:', err);
        }
      }
    },
    [getWebview]
  );

  const toggleTabPlayPause = useCallback(
    (id: string) => {
      const webview = getWebview(id);
      if (webview) {
        try {
          webview
            .executeJavaScript(
              `
            (() => {
              const mediaEls = document.querySelectorAll('video, audio');
              if (mediaEls.length === 0) return;
              mediaEls.forEach(el => {
                if (el.paused) {
                  el.play().catch(console.error);
                } else {
                  el.pause();
                }
              });
            })()
          `
            )
            .catch(console.error);
        } catch (err) {
          console.error('Failed to toggle play/pause:', err);
        }
      }
    },
    [getWebview]
  );

  // Cleanup on unmount
  useEffect(() => {
    const timers = hibernationTimers.current;
    const tabs = hibernatedTabs.current;
    return () => {
      timers.forEach(timer => clearTimeout(timer));
      timers.clear();
      tabs.clear();
    };
  }, []);

  return {
    registerWebview,
    getWebview,
    goBack,
    goForward,
    reload,
    stop,
    navigate,
    hibernateTab,
    wakeTab,
    scheduleHibernation,
    getHibernatedTabs,
    clearHibernation,
    setTabMuted,
    setTabVolume,
    toggleTabPlayPause,
  };
}
