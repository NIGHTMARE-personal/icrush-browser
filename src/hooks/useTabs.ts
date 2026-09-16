import { useState, useEffect } from 'react';
import { storage, Tab } from '../utils/storage';
import { generateUUID } from '../utils/uuid';

const isWindowIncognito = new URLSearchParams(window.location.search).get('incognito') === 'true';

export function useTabs() {
  const [tabs, setTabs] = useState<Tab[]>(() => {
    if (isWindowIncognito) {
      return [
        {
          id: generateUUID(),
          url: 'about:blank',
          title: 'New Incognito Tab',
          loading: false,
          canGoBack: false,
          canGoForward: false,
          lastActiveTime: Date.now(),
          isIncognito: true,
        },
      ];
    }
    const saved = storage.getTabs();
    const active = storage.getActiveTabId();
    return saved.map(t => ({
      ...t,
      isSuspended: t.id !== active && t.url !== 'about:blank' && t.url !== '',
      loading: false,
      canGoBack: false,
      canGoForward: false,
    }));
  });

  const [activeId, setActiveId] = useState<string | null>(() => {
    if (isWindowIncognito) {
      return tabs[0]?.id || null;
    }
    return storage.getActiveTabId();
  });

  useEffect(() => {
    if (!isWindowIncognito) {
      const timeoutId = setTimeout(() => {
        storage.setTabs(tabs);
      }, 500);
      return () => clearTimeout(timeoutId);
    }
  }, [tabs]);

  useEffect(() => {
    if (!isWindowIncognito) {
      storage.setActiveTabId(activeId);
    }
  }, [activeId]);

  const [suspensionThreshold, setSuspensionThreshold] = useState(() => {
    const saved = localStorage.getItem('tabSuspensionTimer');
    return saved ? parseInt(saved) : 10 * 60 * 1000; // Default 10 minutes
  });

  useEffect(() => {
    const handleSettingsUpdate = () => {
      const saved = localStorage.getItem('tabSuspensionTimer');
      setSuspensionThreshold(saved ? parseInt(saved) : 10 * 60 * 1000);
    };
    window.addEventListener('tab-suspension-settings-updated', handleSettingsUpdate);
    return () =>
      window.removeEventListener('tab-suspension-settings-updated', handleSettingsUpdate);
  }, []);

  // Tab Suspension: Update activity timestamp for active tab
  useEffect(() => {
    if (activeId) {
      setTabs(prev =>
        prev.map(tab => {
          if (tab.id === activeId) {
            return { ...tab, lastActiveTime: Date.now(), isSuspended: false };
          }
          return tab;
        })
      );
    }
  }, [activeId]);

  // Tab Suspension: Background checker interval
  useEffect(() => {
    if (suspensionThreshold === -1) return;

    const checkInterval = setInterval(() => {
      const now = Date.now();

      setTabs(prev =>
        prev.map(tab => {
          if (
            tab.id === activeId ||
            tab.url === 'about:blank' ||
            tab.url === '' ||
            tab.url === 'about:history' ||
            tab.url === 'about:bookmarks' ||
            tab.isSuspended
          ) {
            return tab;
          }

          const lastActive = tab.lastActiveTime || now;
          if (now - lastActive >= suspensionThreshold) {
            console.log(`Suspending tab: ${tab.title} (${tab.id})`);
            return { ...tab, isSuspended: true };
          }

          return tab;
        })
      );
    }, 30 * 1000); // Check every 30 seconds for background tab suspension

    return () => clearInterval(checkInterval);
  }, [activeId, suspensionThreshold]);

  useEffect(() => {
    if (tabs.length === 0) {
      createTab('about:blank');
    } else if (!activeId || !tabs.find(t => t.id === activeId)) {
      setActiveId(tabs[0].id);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const createTab = (url = 'about:blank'): string => {
    const newId = generateUUID();
    const newTab: Tab = {
      id: newId,
      url,
      title: isWindowIncognito ? 'New Incognito Tab' : 'New Tab',
      loading: false,
      canGoBack: false,
      canGoForward: false,
      lastActiveTime: Date.now(),
      isIncognito: isWindowIncognito,
    };
    setTabs(prev => [...prev, newTab]);
    setActiveId(newId);
    return newId;
  };

  const updateTab = (id: string, patch: Partial<Tab>): void => {
    setTabs(prev =>
      prev.map(tab => {
        if (tab.id === id) {
          return { ...tab, ...patch };
        }
        return tab;
      })
    );
  };

  const closeTab = (id: string): void => {
    const tabIndex = tabs.findIndex(t => t.id === id);
    if (tabIndex === -1) return;

    const newTabs = tabs.filter(t => t.id !== id);
    setTabs(newTabs);

    if (activeId === id) {
      if (newTabs.length > 0) {
        const nextActiveIndex = Math.min(tabIndex, newTabs.length - 1);
        setActiveId(newTabs[nextActiveIndex].id);
      } else {
        setActiveId(null);
      }
    }
  };

  const focusTab = (id: string): void => {
    if (tabs.find(t => t.id === id)) {
      setActiveId(id);
    }
  };

  return {
    tabs,
    activeId,
    createTab,
    updateTab,
    closeTab,
    focusTab,
    setTabs,
  };
}
