import React, { useState, useCallback, useEffect, useRef } from 'react';
import { TabBar } from './components/TabBar';
import { AddressBar } from './components/AddressBar';
import { AISidebar } from './components/AISidebar';
import { CloudConsentModal } from './components/CloudConsentModal';
import { WebviewContainer } from './components/WebviewContainer';
import { SettingsModal } from './components/SettingsModal';
import { AgentCommandCenterModal } from './components/AgentCommandCenterModal';
import { AIChatWindowModal } from './components/AIChatWindowModal';
import { CommandHUD } from './components/CommandHUD';
import { TabSearch } from './components/TabSearch';
import { ProfileModal } from './components/ProfileModal';
import { DownloadManager } from './components/DownloadManager';
import { PasswordManager } from './components/PasswordManager';
import { TorManager } from './components/TorManager';
import { SiteDataManager } from './components/SiteDataManager';
import { ReaderMode } from './components/ReaderMode';
import { TextToSpeech } from './components/TextToSpeech';
import { ContextMenu, ContextMenuAction, buildWebviewMenuItems } from './components/ContextMenu';
import { BookmarkToolbar } from './components/BookmarkToolbar';
import { Bookmark } from './utils/bookmarks';
import { supabase } from './utils/supabase';
import { useTabs } from './hooks/useTabs';
import { useWebview } from './hooks/useWebview';
import { useGemini } from './hooks/useGemini';
import { TabMemoryManager } from './utils/TabMemoryManager';
import { normalizeUrl, shouldUseTorForUrl } from './utils/url';
import { storage, sessionStorageUtil, Tab, ContextMenuSettings } from './utils/storage';
import { generateUUID } from './utils/uuid';
import * as aiSessions from './utils/aiSessions';
import {
  syncSettingsToCloud,
  syncSettingsFromCloud,
  syncExtensionsToCloud,
  syncExtensionsFromCloud,
} from './utils/sync';
import './App.css';

const isWindowIncognito = new URLSearchParams(window.location.search).get('incognito') === 'true';

export default function App() {
  const { tabs, activeId, createTab, updateTab, closeTab, focusTab, setTabs } = useTabs();

  const activeTab = tabs.find(t => t.id === activeId);
  const isIncognitoActive = !!activeTab?.isIncognito || isWindowIncognito;

  useEffect(() => {
    if (isWindowIncognito) {
      document.documentElement.classList.add('incognito-mode');
    } else {
      document.documentElement.classList.remove('incognito-mode');
    }
  }, []);

  useEffect(() => {
    if (isIncognitoActive) {
      document.documentElement.classList.add('incognito-active');
    } else {
      document.documentElement.classList.remove('incognito-active');
    }
  }, [isIncognitoActive]);
  const {
    registerWebview: rawRegisterWebview,
    goBack,
    goForward,
    reload,
    stop,
    navigate,
    getWebview,
    setTabMuted,
    setTabVolume,
    toggleTabPlayPause,
  } = useWebview();

  const [webviewRegisteredTick, setWebviewRegisteredTick] = useState(0);
  const registerWebview = useCallback((id: string, el: Electron.WebviewTag | null) => {
    const existing = getWebview(id);
    rawRegisterWebview(id, el);
    if (existing !== el) {
      setTimeout(() => setWebviewRegisteredTick(prev => prev + 1), 0);
    }
  }, [rawRegisterWebview, getWebview]);

  const [workspaces, setWorkspaces] = useState<
    Array<{ id: string; name: string; color: string; tabIds: string[] }>
  >([]);
  const [activeWorkspaceId, setActiveWorkspaceId] = useState('all');
  const [closedTabsHistory, setClosedTabsHistory] = useState<
    Array<{ tab: Tab; workspaceId: string }>
  >([]);

  // Session Restore Prompt States
  const [showRestorePrompt, setShowRestorePrompt] = useState(false);
  const [sessionToRestore, setSessionToRestore] = useState<{
    tabs: Tab[];
    activeId: string | null;
  } | null>(null);

  // Real-time tab sync to Supabase on update (fire-and-forget, non-blocking)
  const handleUpdateTab = useCallback(
    (id: string, patch: Partial<Tab>) => {
      // 1. Update React state locally immediately (non-blocking)
      updateTab(id, patch);

      // 2. Fire-and-forget Supabase sync: never block the main thread for a cloud write
      if (patch.url !== undefined || patch.title !== undefined) {
        const tab = tabs.find(t => t.id === id);
        if (tab?.isIncognito) return;
        (async () => {
          try {
            const { data: { user } } = await supabase.auth.getUser();
            if (user) {
              const t = tabs.find(t => t.id === id);
              if (t) {
                const fullTab = { ...t, ...patch };
                await supabase.from('browser_tabs').upsert({
                  id: fullTab.id,
                  url: fullTab.url,
                  title: fullTab.title || 'New Tab',
                  workspace_id: activeWorkspaceId === 'all' ? 'default' : activeWorkspaceId,
                  active: activeId === fullTab.id,
                  created_at: new Date().toISOString(),
                  tor_mode: fullTab.torMode || false,
                  tor_session_id: fullTab.torSessionId || null,
                });
              }
            }
          } catch {
            // Silently ignore Supabase errors (non-critical)
          }
        })();
      }
    },
    [updateTab, tabs, activeId, activeWorkspaceId]
  );

  // Custom theme palette, profile editing, and settings tab states
  const [currentPalette, setCurrentPalette] = useState(
    () => localStorage.getItem('gemini-browser-palette') || 'default'
  );
  const [profilePic, setProfilePic] = useState(
    () => localStorage.getItem('gemini-browser-profile-pic') || ''
  );
  const [tabLayout, setTabLayout] = useState<'top' | 'sidebar'>(() => storage.getTabLayout());
  const [isProfileOpen, setIsProfileOpen] = useState(false);
  const [isDownloadManagerOpen, setIsDownloadManagerOpen] = useState(false);
  const [isPasswordManagerOpen, setIsPasswordManagerOpen] = useState(false);
  const [isTorManagerOpen, setIsTorManagerOpen] = useState(false);
  const [isSiteDataManagerOpen, setIsSiteDataManagerOpen] = useState(false);
  const [settingsInitialTab, setSettingsInitialTab] = useState('general');

  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [isCommandCenterOpen, setIsCommandCenterOpen] = useState(false);
  const [isAIChatWindowOpen, setIsAIChatWindowOpen] = useState(false);
  const [aiChatInitialPrompt, setAiChatInitialPrompt] = useState('');
  const [aiChatInitialFiles, setAiChatInitialFiles] = useState<Array<{ inlineData: { mimeType: string; data: string } }> | undefined>(undefined);
  const [isHUDOpen, setIsHUDOpen] = useState(false);
  const [isTabSearchOpen, setIsTabSearchOpen] = useState(false);
  const [adblockEnabled, setAdblockEnabled] = useState(true);
  const [blockedCount, setBlockedCount] = useState(0);

  // Initialize and keep adblocker status in sync
  useEffect(() => {
    const initAdblock = async () => {
      try {
        const enabled = await window.electronAPI.adblocker.isEnabled();
        setAdblockEnabled(enabled);
        const count = await window.electronAPI.adblocker.getBlockedCount();
        setBlockedCount(count);
      } catch (err) {
        console.warn('Failed to read adblock status:', err);
      }
    };
    initAdblock();

    const handleSync = async () => {
      try {
        const enabled = await window.electronAPI.adblocker.isEnabled();
        setAdblockEnabled(enabled);
      } catch (err) {
        // ignore
      }
    };

    const unsubscribeAdblock = window.electronAPI.adblocker.onCountUpdated((count: number) => {
      setBlockedCount(count);
    });

    const unsubscribeShields = window.electronAPI?.shields?.onShieldsUpdated
      ? window.electronAPI.shields.onShieldsUpdated((data) => {
          if (data?.stats) {
            const total = (data.stats.trackersBlocked || 0) + (data.stats.scriptsBlocked || 0);
            setBlockedCount((prev) => Math.max(prev, total));
          }
        })
      : () => {};

    window.addEventListener('adblocker-toggled', handleSync);
    return () => {
      window.removeEventListener('adblocker-toggled', handleSync);
      unsubscribeAdblock();
      unsubscribeShields();
    };
  }, []);

  const handleToggleAdblock = async (enabled: boolean) => {
    try {
      await window.electronAPI.adblocker.toggle(enabled);
      setAdblockEnabled(enabled);
      window.dispatchEvent(new Event('adblocker-toggled'));
    } catch (err) {
      console.error('Failed to toggle adblocker:', err);
    }
  };

  // Listen for tab creation within workspaces
  useEffect(() => {
    const handleWorkspaceCreateTab = (e: Event) => {
      const customEvent = e as CustomEvent<{ url: string; workspaceId: string }>;
      const { url, workspaceId } = customEvent.detail;
      
      const newTabId = 'tab-' + Date.now();
      const newTab = {
        id: newTabId,
        url: url,
        title: 'New Tab',
        loading: false,
        canGoBack: false,
        canGoForward: false,
      };
      
      setTabs(prev => [...prev, newTab]);
      focusTab(newTabId);
      
      setWorkspaces(prev => prev.map(ws => {
        if (ws.id === workspaceId) {
          return { ...ws, tabIds: [...ws.tabIds, newTabId] };
        }
        return ws;
      }));
    };

    window.addEventListener('workspace-create-tab', handleWorkspaceCreateTab);
    return () => window.removeEventListener('workspace-create-tab', handleWorkspaceCreateTab);
  }, []);
  const [searchEngine, setSearchEngine] = useState<'google' | 'duckduckgo' | 'bing' | 'brave'>(
    () => storage.getSearchEngine() as 'google' | 'duckduckgo' | 'bing' | 'brave'
  );
  const [isSidebarOpen, setIsSidebarOpen] = useState(
    () => localStorage.getItem('isSidebarOpen') !== 'false'
  );

  // Find in Page state
  const [isFindOpen, setIsFindOpen] = useState(false);
  const [activeWebview, setActiveWebview] = useState<Electron.WebviewTag | null>(null);

  // Reader Mode state
  const [isReaderModeOpen, setIsReaderModeOpen] = useState(false);
  const [isTTSOpen, setIsTTSOpen] = useState(false);

  const [contextMenu, setContextMenu] = useState<{
    visible: boolean;
    x: number;
    y: number;
    params: any;
  }>({ visible: false, x: 0, y: 0, params: {} });

  const [contextMenuSettings, setContextMenuSettings] = useState<ContextMenuSettings>(() => {
    try { return storage.getContextMenuSettings(); } catch { return {} as ContextMenuSettings; }
  });

  // Update active webview when active tab changes (single effect, avoids double render)
  useEffect(() => {
    const webview = getWebview(activeId);
    setActiveWebview(webview || null);
  }, [activeId, tabs, getWebview, webviewRegisteredTick]);

  // Dynamic Script Detection for Brave-like script shielding
  const [detectedScripts, setDetectedScripts] = useState<Record<string, string[]>>({});
  const loadStartTimes = useRef<Record<string, number>>({});

  useEffect(() => {
    if (!activeWebview || !activeId) return;

    const queryScripts = async () => {
      try {
        const scripts = await activeWebview.executeJavaScript(`
          (() => {
            return Array.from(document.querySelectorAll('script[src]')).map(s => s.src).filter(Boolean);
          })()
        `);
        if (Array.isArray(scripts)) {
          setDetectedScripts(prev => ({
            ...prev,
            [activeId]: scripts
          }));

          // Register in main process
          const activeTab = tabs.find(t => t.id === activeId);
          if (activeTab && activeTab.url && !activeTab.url.startsWith('about:')) {
            try {
              const domain = new URL(activeTab.url).hostname;
              for (const s of scripts) {
                window.electronAPI?.shields?.recordScript?.(domain, s, false);
              }
            } catch { /* ignore */ }
          }
        }
      } catch (err) {
        // ignore
      }
    };

    const handleLoadCommit = () => {
      loadStartTimes.current[activeId] = performance.now();
      setDetectedScripts(prev => ({
        ...prev,
        [activeId]: []
      }));
    };

    const handleLoadStop = () => {
      queryScripts();
      const startTime = loadStartTimes.current[activeId];
      if (startTime) {
        const elapsed = Math.round(performance.now() - startTime);
        handleUpdateTab(activeId, { loadTimeMs: elapsed });
      }
      if (activeWebview) {
        activeWebview.executeJavaScript(`
          (() => {
            // Cookie Consent Banner Killer — one-time scan only
            const selectors = [
              '#onetrust-consent-sdk', '.onetrust-pc-dark', '#qc-cmp2-container', '.qc-cmp2-container',
              '.fc-consent-root', '.cookie-consent', '.cookies-consent', '#cookies-consent'
            ];
            selectors.forEach(sel => {
              try {
                const el = document.querySelector(sel);
                if (el) el.style.setProperty('display', 'none', 'important');
              } catch(e) {}
            });
          })()
        `).catch(() => {});
      }
    };

    // Run immediately
    queryScripts();

    activeWebview.addEventListener('dom-ready', handleLoadStop);
    activeWebview.addEventListener('load-commit', handleLoadCommit);

    return () => {
      if (activeWebview) {
        try {
          activeWebview.removeEventListener('dom-ready', handleLoadStop);
          activeWebview.removeEventListener('load-commit', handleLoadCommit);
        } catch { /* ignore */ }
      }
    };
  }, [activeWebview, activeId, handleUpdateTab]);

  // Reader Mode: Open with F9 key
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'F9') {
        e.preventDefault();
        if (activeWebview) {
          const url = activeWebview.getURL();
          if (url && !url.startsWith('about:') && !url.startsWith('chrome://')) {
            setIsReaderModeOpen(true);
          }
        }
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [activeWebview]);

  // Phase 2 advanced states
  const [includeContext, setIncludeContext] = useState(false);
  const [includeHistory, setIncludeHistory] = useState(false);
  const [isAgentMode, setIsAgentMode] = useState(false);
  const [agentStatus, setAgentStatus] = useState('');
  const [agentConfirmAction, setAgentConfirmAction] = useState<{
    type: string;
    description: string;
    resolve: (confirmed: boolean) => void;
  } | null>(null);
  const [canUndo, setCanUndo] = useState(false);
  const agentAbortRef = useRef<AbortController | null>(null);

  const [cloudConsentGranted, setCloudConsentGranted] = useState(() => {
    return localStorage.getItem('gemini-browser-cloud-consent') === 'true';
  });
  const [isCloudConsentOpen, setIsCloudConsentOpen] = useState(false);
  const [pendingCloudAction, setPendingCloudAction] = useState<{ type: 'send' | 'summarize' | 'toggleContext' | 'toggleHistory'; text?: string; enabled?: boolean } | null>(null);

  // API key states (persisted)
  const [apiKeys, setApiKeys] = useState<Record<string, string>>({});
  const [activeProvider, setActiveProvider] = useState<string>(() => storage.getActiveProvider());

  const [bookmarks, setBookmarks] = useState<Bookmark[]>([]);

  // Load API keys on mount
  useEffect(() => {
    const loadApiKeys = async () => {
      const keys = await storage.getApiKeys();
      setApiKeys(keys);
    };
    loadApiKeys();
  }, []);

  const hasCloudKeys = Object.keys(apiKeys).some(k => k !== 'local' && apiKeys[k]);
  const isCloudAssistDisabled = !hasCloudKeys;
  const cloudAssistTooltip = isCloudAssistDisabled 
    ? "Please configure a Cloud API key in Settings to enable Cloud Assist."
    : "Cloud Assist (Request Cloud AI Plan)";

  // Keep compatibility for direct apiKey reads
  const apiKey = apiKeys[activeProvider] || '';

  // activeTab defined at top of component



  const handleRestoreSession = () => {
    if (sessionToRestore) {
      setTabs(sessionToRestore.tabs);
      if (sessionToRestore.activeId) {
        focusTab(sessionToRestore.activeId);
      }
    }
    setShowRestorePrompt(false);
    setSessionToRestore(null);
  };

  const handleDismissRestore = () => {
    setShowRestorePrompt(false);
    setSessionToRestore(null);
    // Overwrite the saved session state to start fresh
    storage.setTabs(tabs);
    storage.setActiveTabId(activeId);
  };

  // Tor Privacy Mode state
  const [torMode, setTorMode] = useState(false);
  const [torSessionId, setTorSessionId] = useState<string | null>(null);

  const handleToggleTor = useCallback(async (enabled: boolean) => {
    setTorMode(enabled);
    if (enabled) {
      const sessionId = `tor-${Date.now()}`;
      setTorSessionId(sessionId);
      try {
        await window.electronAPI.tor.setTorMode(true);
      } catch (err) {
        console.error('Failed to enable Tor:', err);
      }
    } else {
      setTorSessionId(null);
      try {
        await window.electronAPI.tor.setTorMode(false);
      } catch (err) {
        console.error('Failed to disable Tor:', err);
      }
    }
  }, []);

  // Sync initial workspaces with tab IDs if they are empty
  useEffect(() => {
    if (tabs.length > 0 && workspaces.length === 0) {
      setWorkspaces([
        {
          id: 'default',
          name: 'General',
          color: '#6366f1',
          tabIds: tabs.map(t => t.id),
        },
      ]);
    }
  }, [tabs.length, workspaces.length]);

  // Save session on tab changes for restore on next launch
  useEffect(() => {
    if (tabs.length > 0) {
      sessionStorageUtil.saveSession(tabs, activeId);
    }
  }, [tabs, activeId]);

  // ===== SUPABASE-FIRST STORAGE (localStorage as fallback cache) =====
  const [syncStatus, setSyncStatus] = useState<'idle' | 'syncing' | 'synced' | 'error'>('idle');
  const [isOnline, setIsOnline] = useState(true);
  const mutationQueue = useRef<Array<() => Promise<void>>>([]);

  // Online/offline detection
  useEffect(() => {
    const handleOnline = () => {
      setIsOnline(true);
      setSyncStatus('syncing');
      // Flush mutation queue
      const queue = [...mutationQueue.current];
      mutationQueue.current = [];
      queue.forEach(fn => fn());
      setTimeout(() => setSyncStatus('synced'), 1000);
    };
    const handleOffline = () => {
      setIsOnline(false);
      setSyncStatus('error');
    };
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  const safeMutate = useCallback(
    async (fn: () => Promise<void>) => {
      if (!isOnline) {
        mutationQueue.current.push(fn);
        setSyncStatus('error');
        return;
      }
      try {
        await fn();
      } catch (err) {
        mutationQueue.current.push(fn);
        setSyncStatus('error');
      }
    },
    [isOnline]
  );

  // Load workspaces from Supabase (primary) with localStorage fallback
  useEffect(() => {
    const loadWorkspaces = async () => {
      setSyncStatus('syncing');
      try {
        // Try Supabase first
        const { data, error } = await supabase.from('browser_workspaces').select('*');
        if (!error && data && data.length > 0) {
          const ws = data.map(w => ({
            id: w.id,
            name: w.name,
            color: w.color,
            tabIds: w.tab_ids || [],
          }));
          setWorkspaces(ws);
          // Cache in localStorage
          localStorage.setItem('gemini-browser-workspaces', JSON.stringify(ws));
          setSyncStatus('synced');
          return;
        }
      } catch (err) {
        console.warn('Supabase workspace load failed, trying localStorage:', err);
      }
      // Fallback to localStorage
      const saved = localStorage.getItem('gemini-browser-workspaces');
      if (saved) {
        try {
          setWorkspaces(JSON.parse(saved));
          setSyncStatus('synced');
        } catch (e) {
          console.error('Failed to load workspaces from cache:', e);
          setSyncStatus('error');
        }
      } else {
        setSyncStatus('error');
      }
    };
    loadWorkspaces();
  }, []);

  // Automatic Tab Memory Manager Evaluation
  useEffect(() => {
    const timer = setInterval(() => {
      TabMemoryManager.evaluateTabSuspensions(tabs, activeId, (tabIdToSuspend) => {
        handleUpdateTab(tabIdToSuspend, { isSuspended: true });
      });
    }, 60000);
    return () => clearInterval(timer);
  }, [tabs, activeId, handleUpdateTab]);

  // Save workspaces to Supabase (primary) + localStorage cache
  useEffect(() => {
    if (workspaces.length === 0) return;

    // Update localStorage cache immediately (fast)
    localStorage.setItem('gemini-browser-workspaces', JSON.stringify(workspaces));

    // Debounce Supabase sync
    const timeoutId = setTimeout(async () => {
      setSyncStatus('syncing');
      try {
        for (const ws of workspaces) {
          const { error } = await supabase.from('browser_workspaces').upsert({
            id: ws.id,
            name: ws.name,
            color: ws.color,
            tab_ids: ws.tabIds,
            updated_at: new Date().toISOString(),
          });
          if (error) throw error;
        }
        setSyncStatus('synced');
      } catch (err) {
        console.error('Supabase workspace sync failed:', err);
        setSyncStatus('error');
      }
    }, 500);

    return () => clearTimeout(timeoutId);
  }, [workspaces]);

  // Load bookmarks from Supabase (primary) with Secure DB fallback
  useEffect(() => {
    const loadBookmarks = async () => {
      const isSyncActive = localStorage.getItem('gemini-browser-sync-active') === 'true';
      if (isSyncActive) {
        try {
          const { data, error } = await supabase
            .from('browser_bookmarks')
            .select('*')
            .order('created_at', { ascending: false });
          if (!error && data) {
            const isUnlocked = await window.electronAPI.passwords.isUnlocked();
            const bm: Bookmark[] = [];
            for (const b of data) {
              let url = b.url;
              let title = b.title;
              if (url && url.startsWith('enc:') && isUnlocked) {
                try {
                  const decrypted = await window.electronAPI.passwords.decryptSyncData(url.substring(4));
                  try {
                    const parsed = JSON.parse(decrypted);
                    url = parsed.url;
                    title = parsed.title;
                  } catch {
                    url = decrypted;
                    title = (b.title && b.title.startsWith('enc:')) ? await window.electronAPI.passwords.decryptSyncData(b.title.substring(4)) : b.title;
                  }
                } catch {
                  url = '[Locked URL]';
                  title = '[Locked Bookmark]';
                }
              } else if (url && url.startsWith('enc:')) {
                url = '[Locked URL]';
                title = '[Locked Bookmark]';
              }
              bm.push({
                id: b.id,
                url,
                title,
                createdAt: b.created_at ? new Date(b.created_at).getTime() : Date.now(),
                updatedAt: b.updated_at ? new Date(b.updated_at).getTime() : Date.now(),
              });
            }
            setBookmarks(bm);
            // Cache in Secure DB
            for (const b of bm) {
              if (b.url !== '[Locked URL]') {
                await window.electronAPI.db.addBookmark(b);
              }
            }
            return;
          }
        } catch (err) {
          console.warn('Supabase bookmarks load failed:', err);
        }
      }
      // Fallback
      const saved = await window.electronAPI.db.getBookmarks();
      if (saved && saved.length > 0) setBookmarks(saved);
    };
    loadBookmarks();
  }, []);

  // API keys are now only configured through the Settings UI (no env key loading for security)
  useEffect(() => {
    // No-op: removed getEnvApiKey to prevent API key exfiltration via XSS
  }, []);

  // Session Restore Prompt: Check for previous session on startup
  useEffect(() => {
    const checkSessionRestore = async () => {
      try {
        const sessionKey = 'gemini-browser-session-restored-prompted';
        if (sessionStorage.getItem(sessionKey) === 'true') {
          return;
        }
        sessionStorage.setItem(sessionKey, 'true');

        const savedSession = sessionStorageUtil.getSession();
        if (savedSession && savedSession.tabs.length > 0) {
          // Check if session is recent (within 7 days)
          const sessionAge = Date.now() - savedSession.timestamp;
          const maxAge = 7 * 24 * 60 * 60 * 1000;
          if (sessionAge > maxAge) {
            sessionStorageUtil.clearSession();
            return;
          }

          const hasSavedSession =
            savedSession.tabs.length > 1 ||
            (savedSession.tabs.length === 1 &&
              savedSession.tabs[0].url !== 'about:blank' &&
              savedSession.tabs[0].url !== '');

          if (hasSavedSession) {
            const mappedTabs: Tab[] = savedSession.tabs.map(t => ({
              id: t.id,
              url: t.url,
              title: t.title || 'New Tab',
              loading: false,
              canGoBack: false,
              canGoForward: false,
              isSuspended: t.id !== savedSession.activeTabId && t.url !== 'about:blank' && t.url !== '',
            }));
            setSessionToRestore({ tabs: mappedTabs, activeId: savedSession.activeTabId });

            // Initialize with a single blank tab initially
            const defaultTabId = 'initial-blank-tab';
            setTabs([
              {
                id: defaultTabId,
                url: 'about:blank',
                title: 'New Tab',
                loading: false,
                canGoBack: false,
                canGoForward: false,
                lastActiveTime: Date.now(),
              },
            ]);
            focusTab(defaultTabId);
            setShowRestorePrompt(true);
          }
        }
      } catch (err) {
        console.error('Failed to check session restore:', err);
      }
    };
    checkSessionRestore();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ===== CLOUD SETTINGS & EXTENSIONS AUTO-SYNC =====
  const loadCloudSyncData = useCallback(async () => {
    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) return;

      setSyncStatus('syncing');
      const cloudSettings = await syncSettingsFromCloud();
      if (cloudSettings) {
        if (cloudSettings.theme) {
          setCurrentPalette(cloudSettings.theme);
          localStorage.setItem('gemini-browser-palette', cloudSettings.theme);
        }
        if (cloudSettings.searchEngine) {
          setSearchEngine(cloudSettings.searchEngine as 'google' | 'duckduckgo' | 'bing' | 'brave');
          storage.setSearchEngine(cloudSettings.searchEngine);
        }
        if (cloudSettings.adblockEnabled !== undefined) {
          await window.electronAPI.adblocker.toggle(cloudSettings.adblockEnabled);
        }
        if (cloudSettings.torEnabled !== undefined && cloudSettings.torEnabled !== torMode) {
          handleToggleTor(cloudSettings.torEnabled);
        }
      }

      const cloudExtensions = await syncExtensionsFromCloud();
      if (cloudExtensions && window.electronAPI?.extensions?.getExtensions) {
        const localExtensions = await window.electronAPI.extensions.getExtensions();
        for (const ext of cloudExtensions) {
          const exists = localExtensions.some(le => le.id === ext.extension_id);
          if (!exists) {
            try {
              await window.electronAPI.extensions.loadExtension(ext.path);
            } catch (e) {
              console.warn('Could not auto-load cloud extension locally:', ext.name);
            }
          }
          await window.electronAPI.extensions.toggleExtension(ext.extension_id, ext.enabled);
        }
      }
      setSyncStatus('synced');
    } catch (err) {
      console.warn('Load cloud sync failed:', err);
      setSyncStatus('error');
    }
  }, [torMode, handleToggleTor]);

  const triggerCloudSync = useCallback(async () => {
    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) return;

      setSyncStatus('syncing');
      const adblockEnabled = await window.electronAPI.adblocker.isEnabled();
      await syncSettingsToCloud({
        theme: currentPalette,
        searchEngine,
        adblockEnabled,
        torEnabled: torMode,
      });

      if (window.electronAPI?.extensions?.getExtensions) {
        const localExts = await window.electronAPI.extensions.getExtensions();
        const syncExts = localExts.map(ext => ({
          extension_id: ext.id,
          name: ext.name,
          version: ext.version,
          enabled: ext.enabled,
          path: ext.path,
        }));
        await syncExtensionsToCloud(syncExts);
      }
      setSyncStatus('synced');
    } catch (err) {
      console.warn('Sync failed:', err);
      setSyncStatus('error');
    }
  }, [currentPalette, searchEngine, torMode]);

  useEffect(() => {
    loadCloudSyncData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const delayDebounce = setTimeout(() => {
      triggerCloudSync();
    }, 1500);
    return () => clearTimeout(delayDebounce);
  }, [currentPalette, searchEngine, torMode, triggerCloudSync]);

  useEffect(() => {
    const handleSyncRequest = () => {
      triggerCloudSync();
    };
    window.addEventListener('adblocker-toggled', handleSyncRequest);
    window.addEventListener('extensions-modified', handleSyncRequest);
    return () => {
      window.removeEventListener('adblocker-toggled', handleSyncRequest);
      window.removeEventListener('extensions-modified', handleSyncRequest);
    };
  }, [triggerCloudSync]);

  // ===== REAL-TIME SUPABASE SUBSCRIPTIONS =====
  useEffect(() => {
    if (typeof navigator !== 'undefined' && !navigator.onLine) return;
    const isSyncActive = localStorage.getItem('gemini-browser-sync-active') === 'true';
    if (!isSyncActive) return;

    const channels: ReturnType<typeof supabase.channel>[] = [];

    // Workspaces real-time sync
    const wsChannel = supabase
      .channel('browser_workspaces_changes')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'browser_workspaces' },
        payload => {
          console.log('Workspace change:', payload.eventType, payload.new);
          setWorkspaces(prev => {
            if (payload.eventType === 'INSERT' || payload.eventType === 'UPDATE') {
              const ws = payload.new as {
                id: string;
                name: string;
                color: string;
                tab_ids?: string[];
              };
              const newWs = { id: ws.id, name: ws.name, color: ws.color, tabIds: ws.tab_ids || [] };
              const exists = prev.some(w => w.id === ws.id);
              return exists ? prev.map(w => (w.id === ws.id ? newWs : w)) : [...prev, newWs];
            }
            if (payload.eventType === 'DELETE') {
              return prev.filter(w => w.id !== payload.old.id);
            }
            return prev;
          });
        }
      )
      .subscribe();
    channels.push(wsChannel);

    // Bookmarks real-time sync
    const bmChannel = supabase
      .channel('browser_bookmarks_changes')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'browser_bookmarks' },
        payload => {
          console.log('Bookmark change:', payload.eventType);
          setBookmarks(prev => {
            if (payload.eventType === 'INSERT') {
              const b = payload.new as {
                id: string;
                url: string;
                title: string;
                created_at?: string;
              };
              (async () => {
                let url = b.url;
                let title = b.title;
                const isUnlocked = await window.electronAPI.passwords.isUnlocked();
                if (url.startsWith('enc:') && isUnlocked) {
                  try {
                    const decrypted = await window.electronAPI.passwords.decryptSyncData(url.substring(4));
                    try {
                      const parsed = JSON.parse(decrypted);
                      url = parsed.url;
                      title = parsed.title;
                    } catch {
                      url = decrypted;
                      title = b.title.startsWith('enc:') ? await window.electronAPI.passwords.decryptSyncData(b.title.substring(4)) : b.title;
                    }
                  } catch {
                    url = '[Locked URL]';
                    title = '[Locked Bookmark]';
                  }
                }
                setBookmarks(prev => {
                  if (prev.some(bm => bm.id === b.id)) return prev;
                  return [
                    {
                      id: b.id,
                      url,
                      title,
                      createdAt: new Date(b.created_at || Date.now()).getTime(),
                      updatedAt: new Date(b.created_at || Date.now()).getTime(),
                    },
                    ...prev,
                  ];
                });
              })();
              return prev;
            }
            if (payload.eventType === 'DELETE') {
              return prev.filter(b => b.id !== payload.old.id);
            }
            if (payload.eventType === 'UPDATE') {
              const b = payload.new as { id: string; url: string; title: string };
              (async () => {
                let url = b.url;
                let title = b.title;
                const isUnlocked = await window.electronAPI.passwords.isUnlocked();
                if (url.startsWith('enc:') && isUnlocked) {
                  try {
                    const decrypted = await window.electronAPI.passwords.decryptSyncData(url.substring(4));
                    try {
                      const parsed = JSON.parse(decrypted);
                      url = parsed.url;
                      title = parsed.title;
                    } catch {
                      url = decrypted;
                      title = b.title.startsWith('enc:') ? await window.electronAPI.passwords.decryptSyncData(b.title.substring(4)) : b.title;
                    }
                  } catch {
                    url = '[Locked URL]';
                    title = '[Locked Bookmark]';
                  }
                }
                setBookmarks(prev =>
                  prev.map(bm =>
                    bm.id === b.id ? { ...bm, title, url, updatedAt: Date.now() } : bm
                  )
                );
              })();
              return prev;
            }
            return prev;
          });
        }
      )
      .subscribe();
    channels.push(bmChannel);

    // History real-time sync
    const histChannel = supabase
      .channel('browser_history_changes')
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'browser_history' },
        payload => {
          console.log('History change:', payload.new);
          // Could update local history cache here if needed
        }
      )
      .subscribe();
    channels.push(histChannel);

    // Chat messages real-time sync
    const chatChannel = supabase
      .channel('chat_messages_changes')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'chat_messages' }, payload => {
        console.log('Chat change:', payload.eventType);
        // Note: We can't easily access setMessages here without restructuring
        // This would need a context or global state for chat
      })
      .subscribe();
    channels.push(chatChannel);

    return () => {
      channels.forEach(c => supabase.removeChannel(c));
    };
  }, []);

  // Listen to application menu shortcuts forwarded via IPC (works even when webview is focused)
  useEffect(() => {
    const unsubNewTab = window.electronAPI.shortcuts.onNewTab(() => {
      handleCreateTab();
    });
    const unsubNewIncognitoTab = window.electronAPI.shortcuts.onNewIncognitoTab(() => {
      handleCreateTab('about:blank', true);
    });
    const unsubCloseTab = window.electronAPI.shortcuts.onCloseTab(() => {
      if (activeId) handleCloseTab(activeId);
    });
    const unsubHistory = window.electronAPI.shortcuts.onHistory(() => {
      handleAddressNavigate('about:history');
    });
    const unsubToggleAI = window.electronAPI.shortcuts.onToggleAI(() => {
      setIsSidebarOpen(prev => {
        const next = !prev;
        localStorage.setItem('isSidebarOpen', next ? 'true' : 'false');
        return next;
      });
    });
    const unsubOpenHUD = window.electronAPI.shortcuts.onOpenHUD(() => {
      setIsHUDOpen(prev => !prev);
    });
    const unsubFind = window.electronAPI.shortcuts.onFind(() => {
      window.dispatchEvent(new CustomEvent('webview-find-in-page'));
    });
    const unsubPrint = window.electronAPI.shortcuts.onPrint(() => {
      window.dispatchEvent(new CustomEvent('webview-print'));
    });
    const unsubZoomIn = window.electronAPI.shortcuts.onZoomIn(() => {
      window.dispatchEvent(new CustomEvent('webview-zoom-in'));
    });
    const unsubZoomOut = window.electronAPI.shortcuts.onZoomOut(() => {
      window.dispatchEvent(new CustomEvent('webview-zoom-out'));
    });
    const unsubZoomReset = window.electronAPI.shortcuts.onZoomReset(() => {
      window.dispatchEvent(new CustomEvent('webview-zoom-reset'));
    });
    const unsubDevTools = window.electronAPI.shortcuts.onDevTools(() => {
      if (activeId) {
        const webview = getWebview(activeId);
        if (webview) {
          try {
            webview.openDevTools();
          } catch (err) {
            console.error('Failed to open webview DevTools:', err);
          }
        }
      }
    });

    return () => {
      unsubNewTab();
      unsubNewIncognitoTab();
      unsubCloseTab();
      unsubHistory();
      unsubToggleAI();
      unsubOpenHUD();
      unsubFind();
      unsubPrint();
      unsubZoomIn();
      unsubZoomOut();
      unsubZoomReset();
      unsubDevTools();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeId, tabs]);

  // Global Keyboard Shortcuts Listener (Spotlight HUD, New Tab, Close Tab, History)
  useEffect(() => {
    const handleGlobalKeyDown = (e: KeyboardEvent) => {
      // F5 or Ctrl+R: Reload
      if (e.key === 'F5' || ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'r' && !e.shiftKey)) {
        e.preventDefault();
        if (activeId) reload(activeId);
      }
      // Ctrl+Shift+R: Hard Reload
      if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key.toLowerCase() === 'r') {
        e.preventDefault();
        if (activeId) {
          const webview = getWebview(activeId);
          if (webview) {
            try {
              webview.reloadIgnoringCache();
            } catch (err) {
              console.error('Hard reload failed:', err);
              reload(activeId);
            }
          }
        }
      }
      // Esc: Stop Loading
      if (e.key === 'Escape') {
        e.preventDefault();
        if (activeId) stop(activeId);
      }
      // Ctrl+L or Alt+D: Focus Address Bar
      if (((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'l') || (e.altKey && e.key.toLowerCase() === 'd')) {
        e.preventDefault();
        window.dispatchEvent(new CustomEvent('focus-address-bar'));
      }
      // Ctrl+Shift+T: Reopen Last Closed Tab
      if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key.toLowerCase() === 't') {
        e.preventDefault();
        handleRestoreLastClosedTab();
      }
      // Ctrl+Tab / Ctrl+Shift+Tab: Cycle Tabs
      if ((e.ctrlKey || e.metaKey) && e.key === 'Tab') {
        e.preventDefault();
        if (tabs.length > 1) {
          const currentIndex = tabs.findIndex(t => t.id === activeId);
          if (currentIndex !== -1) {
            const nextIndex = e.shiftKey 
              ? (currentIndex - 1 + tabs.length) % tabs.length
              : (currentIndex + 1) % tabs.length;
            focusTab(tabs[nextIndex].id);
          }
        }
      }
      // Ctrl+D: Bookmark Current Page
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'd') {
        e.preventDefault();
        const activeTab = tabs.find(t => t.id === activeId);
        if (activeTab) {
          handleToggleBookmark(activeTab.url, activeTab.title || activeTab.url);
        }
      }
      // Ctrl+J: Open Download Manager
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'j') {
        e.preventDefault();
        setIsDownloadManagerOpen(prev => !prev);
      }
      // Ctrl+Space: Open Spotlight HUD
      if ((e.ctrlKey || e.metaKey) && e.code === 'Space') {
        e.preventDefault();
        setIsHUDOpen(prev => !prev);
      }
      // F11: Toggle Fullscreen
      if (e.key === 'F11') {
        e.preventDefault();
        window.electronAPI.toggleFullscreen();
      }
      // Alt+Space (Left or Right Alt): Toggle AI Sidebar
      if (e.altKey && e.code === 'Space') {
        e.preventDefault();
        setIsSidebarOpen(prev => {
          const next = !prev;
          localStorage.setItem('isSidebarOpen', next ? 'true' : 'false');
          return next;
        });
      }
      // Ctrl+T: Open New Tab
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 't') {
        e.preventDefault();
        handleCreateTab();
      }
      // Ctrl+Shift+N: Open New Incognito Tab
      if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key.toLowerCase() === 'n') {
        e.preventDefault();
        handleCreateTab('about:blank', true);
      }
      // Ctrl+W: Close Active Tab
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'w') {
        e.preventDefault();
        if (activeId) {
          handleCloseTab(activeId);
        }
      }
      // Ctrl+H: Open Smart History
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'h') {
        e.preventDefault();
        handleAddressNavigate('about:history');
      }
      // Ctrl+J: Open Downloads
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'j') {
        e.preventDefault();
        setIsDownloadManagerOpen(prev => !prev);
      }
      // Ctrl+Shift+A: Open Tab Search
      if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key.toLowerCase() === 'a') {
        e.preventDefault();
        setIsTabSearchOpen(prev => !prev);
      }
      // Ctrl+Shift+E: Open Extensions Dashboard
      if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key.toLowerCase() === 'e') {
        e.preventDefault();
        handleAddressNavigate('about:extensions');
      }
    };
    window.addEventListener('keydown', handleGlobalKeyDown);
    return () => window.removeEventListener('keydown', handleGlobalKeyDown);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeId, tabs, closedTabsHistory]);

  const handleSelectEngine = (engine: 'google' | 'duckduckgo' | 'bing' | 'brave') => {
    setSearchEngine(engine);
    storage.setSearchEngine(engine);
  };

  const recordHistory = useCallback(
    async (url: string, title: string) => {
      if (activeTab?.isIncognito) return; // DO NOT record history for incognito tabs!
      if (!url || url === 'about:blank' || url.startsWith('chrome://')) return;

      const entry = {
        id: generateUUID(),
        url,
        title: title || url,
        timestamp: Date.now(),
      };

      await window.electronAPI.db.addHistory(entry);

      const isSyncActive = localStorage.getItem('gemini-browser-sync-active') === 'true';
      if (isSyncActive) {
        // Queue Supabase sync
        await safeMutate(async () => {
          let syncUrl = url;
          let syncTitle = title || url;
          const isUnlocked = await window.electronAPI.passwords.isUnlocked();
          if (isUnlocked) {
            try {
              const payload = JSON.stringify({
                url,
                title: title || url,
                timestamp: Date.now()
              });
              const encrypted = await window.electronAPI.passwords.encryptSyncData(payload);
              syncUrl = `enc:${encrypted}`;
              syncTitle = 'Encrypted Payload';
            } catch (e) {
              console.error('Encryption of sync history failed:', e);
            }
          }
          const { error } = await supabase.from('browser_history').insert({
            url: syncUrl,
            title: syncTitle,
            created_at: new Date().toISOString(),
          });
          if (error) console.warn('Supabase history sync failed:', error);
        });
      }
    },
    [safeMutate, activeTab?.isIncognito]
  );

  const handleToggleBookmark = useCallback(
    async (url: string, title: string) => {
      const existing = bookmarks.find(b => b.url === url);
      if (existing) {
        setBookmarks(prev => prev.filter(b => b.url !== url));
        await window.electronAPI.db.deleteBookmark(existing.id);

        const isSyncActive = localStorage.getItem('gemini-browser-sync-active') === 'true';
        if (isSyncActive) {
          await safeMutate(async () => {
            const { error } = await supabase.from('browser_bookmarks').delete().eq('id', existing.id);
            if (error) console.error('Supabase error removing bookmark:', error);
          });
        }
      } else {
        const newBookmark: Bookmark = {
          id: generateUUID(),
          url,
          title,
          createdAt: Date.now(),
          updatedAt: Date.now(),
        };
        setBookmarks(prev => [...prev, newBookmark]);
        await window.electronAPI.db.addBookmark(newBookmark);

        const isSyncActive = localStorage.getItem('gemini-browser-sync-active') === 'true';
        if (isSyncActive) {
          await safeMutate(async () => {
            let syncUrl = url;
            let syncTitle = title;
            const isUnlocked = await window.electronAPI.passwords.isUnlocked();
            if (isUnlocked) {
              try {
                const payload = JSON.stringify({
                  id: newBookmark.id,
                  url,
                  title,
                  createdAt: newBookmark.createdAt
                });
                const encrypted = await window.electronAPI.passwords.encryptSyncData(payload);
                syncUrl = `enc:${encrypted}`;
                syncTitle = 'Encrypted Payload';
              } catch (e) {
                console.error('Encryption of sync bookmark failed:', e);
              }
            }
            const { error } = await supabase.from('browser_bookmarks').insert({
              id: newBookmark.id,
              url: syncUrl,
              title: syncTitle,
            });
            if (error) console.error('Supabase error saving bookmark:', error);
          });
        }
      }
    },
    [bookmarks, safeMutate]
  );

  const handleRestoreLastClosedTab = () => {
    if (closedTabsHistory.length === 0) return;
    const [lastEntry, ...remaining] = closedTabsHistory;
    setClosedTabsHistory(remaining);

    const newTabId = createTab(lastEntry.tab.url);
    handleUpdateTab(newTabId, {
      title: lastEntry.tab.title,
      torMode: lastEntry.tab.torMode,
      torSessionId: lastEntry.tab.torSessionId,
      isIncognito: lastEntry.tab.isIncognito,
    });

    setWorkspaces(prev => {
      const workspaceId = lastEntry.workspaceId;
      const wsExists = prev.some(w => w.id === workspaceId);
      const targetId = wsExists ? workspaceId : (prev[0]?.id || 'default');
      return prev.map(w => {
        if (w.id === targetId) {
          return { ...w, tabIds: [...w.tabIds, newTabId] };
        }
        return w;
      });
    });
  };

  const handleCreateTab = useCallback(async (url: string = 'about:blank', isIncognito?: boolean) => {
    const newTabId = createTab(url);
    setWorkspaces(prev => {
      if (prev.length === 0) {
        return [{ id: 'default', name: 'General', color: '#6366f1', tabIds: [newTabId] }];
      }
      const targetWorkspaceId = activeWorkspaceId === 'all' ? prev[0].id : activeWorkspaceId;
      return prev.map(ws => {
        if (ws.id === targetWorkspaceId) {
          return { ...ws, tabIds: [...ws.tabIds, newTabId] };
        }
        return ws;
      });
    });

    // Update the tab with Tor/Incognito settings
    const isTabIncognito = isIncognito !== undefined ? isIncognito : isWindowIncognito;
    const isTabTor = isTabIncognito ? true : torMode;
    const tabTorSessionId = isTabIncognito 
      ? `incognito-${generateUUID()}` 
      : (isTabTor ? (torSessionId || `tor-${generateUUID()}`) : undefined);
    
    handleUpdateTab(newTabId, {
      torMode: isTabTor,
      torSessionId: tabTorSessionId,
      isIncognito: isTabIncognito,
    });

    if (isTabIncognito) return; // DO NOT sync incognito tabs to cloud!

    await safeMutate(async () => {
      const { error } = await supabase.from('browser_tabs').insert({
        id: newTabId,
        url,
        title: 'New Tab',
        workspace_id: activeWorkspaceId === 'all' ? 'default' : activeWorkspaceId,
        active: true,
        created_at: new Date().toISOString(),
        tor_mode: torMode,
        tor_session_id: torMode ? torSessionId : null,
      });
      if (error) console.error('Supabase tab insert failed:', error);
    });
  }, [createTab, setWorkspaces, activeWorkspaceId, handleUpdateTab, torMode, torSessionId]);

  // Handle new tab creation triggered from window.open / target="_blank" popup clicks
  useEffect(() => {
    if (window.electronAPI?.onTabCreateFromPopup) {
      const unsubscribe = window.electronAPI.onTabCreateFromPopup(data => {
        if (data && data.url) {
          handleCreateTab(data.url);
        }
      });
      return () => unsubscribe();
    }
  }, []);

  const handleCloseTab = useCallback(async (id: string) => {
    const tab = tabs.find(t => t.id === id);
    if (tab) {
      const ws = workspaces.find(w => w.tabIds.includes(id));
      setClosedTabsHistory(prev => [{ tab, workspaceId: ws ? ws.id : 'default' }, ...prev].slice(0, 15));

      if (tab.isIncognito) {
        const partition = tab.torSessionId ? `incognito-tor-${tab.torSessionId}` : 'incognito-session';
        const otherIncognitoExists = tabs.some(t => t.id !== id && t.isIncognito && (t.torSessionId === tab.torSessionId));
        if (!otherIncognitoExists) {
          console.log(`[Incognito RAM Purge] Purging partition ${partition} since no tabs are remaining.`);
          window.electronAPI.session.purgeIncognito(partition).catch(() => {});
        }
      }

      // Forget me on close Brave Shields integration
      if (tab.url && !tab.url.startsWith('about:') && !tab.url.startsWith('chrome://')) {
        try {
          const hostname = new URL(tab.url).hostname;
          const savedShields = localStorage.getItem(`icrush-shields-${hostname}`);
          if (savedShields) {
            const shields = JSON.parse(savedShields);
            if (shields.forgetMe && shields.shieldsUp) {
              const partition = tab.isIncognito
                ? (tab.torSessionId ? `incognito-tor-${tab.torSessionId}` : 'incognito-session')
                : (tab.torSessionId ? `persist:tor-${tab.torSessionId}` : (tab.torMode ? 'persist:tor-global' : 'persist:main-profile'));
              console.log(`[Forget Me] Wiping storage for closed tab partition: ${partition}`);
              window.electronAPI.session.clearData(hostname, partition).catch(() => {});
            }
          }
        } catch (err) {
          console.warn('Failed to parse URL or check forgetMe on tab close:', err);
        }
      }
    }
    closeTab(id);
    setWorkspaces(prev =>
      prev.map(ws => ({
        ...ws,
        tabIds: ws.tabIds.filter(tid => tid !== id),
      }))
    );

    if (tab?.isIncognito) return; // DO NOT attempt to delete unsynced tab from Supabase

    await safeMutate(async () => {
      const { error } = await supabase.from('browser_tabs').delete().eq('id', id);
      if (error) console.error('Supabase tab delete failed:', error);
    });
  }, [tabs, workspaces, closeTab, setWorkspaces, setClosedTabsHistory]);

  const navigateToUrl = useCallback(
    (targetUrl: string) => {
      if (!activeId) return;
      const tab = tabs.find(t => t.id === activeId);
      if (!tab) return;

      const useTor = tab.isIncognito || tab.torMode || shouldUseTorForUrl(targetUrl, torMode);
      const isSpecial =
        tab.url === 'about:blank' ||
        tab.url === '' ||
        tab.url.startsWith('about:') ||
        tab.url.startsWith('chrome://');

      const patch: Partial<Tab> = {};
      if (useTor && !tab.torMode) {
        patch.torMode = true;
        patch.torSessionId = tab.isIncognito ? tab.torSessionId : (torSessionId || undefined);
      }

      patch.url = targetUrl;
      patch.loading = true;
      handleUpdateTab(activeId, patch);

      if (!isSpecial) {
        navigate(activeId, targetUrl);
      } else {
        // Homescreen→webview: webview must mount first, then navigate.
        // Use multiple retries to handle Electron timing edge cases.
        const attempt = (delay: number, retries: number) => {
          setTimeout(() => {
            navigate(activeId, targetUrl);
            if (retries > 0) {
              const wv = getWebview(activeId);
              if (!wv || wv.getURL() === 'about:blank' || wv.getURL() === '') {
                attempt(400, retries - 1);
              }
            }
          }, delay);
        };
        attempt(200, 3);
      }
    },
    [activeId, tabs, torMode, torSessionId, handleUpdateTab, navigate, getWebview]
  );

  const handleAddressNavigate = useCallback((input: string) => {
    if (!activeId) return;
    const targetUrl = normalizeUrl(input, searchEngine);
    navigateToUrl(targetUrl);
  }, [activeId, searchEngine, navigateToUrl]);

  const handleOpenAIChatWindow = useCallback((initialPrompt?: string) => {
    const url = initialPrompt ? `about:ai?q=${encodeURIComponent(initialPrompt)}` : 'about:ai';
    const currentActiveTab = tabs.find(t => t.id === activeId);
    if (currentActiveTab && (currentActiveTab.url === 'about:blank' || currentActiveTab.url === '')) {
      handleAddressNavigate(url);
    } else {
      handleCreateTab(url);
    }
  }, [tabs, activeId, searchEngine, navigateToUrl]);

  // API key handlers
  const handleSaveApiKeys = (keys: Record<string, string>) => {
    setApiKeys(keys);
    storage.setApiKeys(keys);
  };

  const handleSelectProvider = (provider: string) => {
    setActiveProvider(provider);
    storage.setActiveProvider(provider);
  };

  const handleContextMenuSettingsChange = (settings: ContextMenuSettings) => {
    setContextMenuSettings(settings);
    storage.setContextMenuSettings(settings);
  };

  // Helper: Event-driven webview load resolution (replaces static sleep timeouts)
  const waitForWebviewReady = useCallback((webview: Electron.WebviewTag, maxTimeoutMs: number = 7000): Promise<void> => {
    return new Promise((resolve) => {
      let completed = false;
      const onDone = () => {
        if (!completed) {
          completed = true;
          cleanup();
          resolve();
        }
      };

      const timer = setTimeout(onDone, maxTimeoutMs);
      const onStopLoading = () => onDone();
      const onDomReady = () => onDone();

      const cleanup = () => {
        clearTimeout(timer);
        try {
          webview.removeEventListener('did-stop-loading', onStopLoading);
          webview.removeEventListener('dom-ready', onDomReady);
        } catch (_) {}
      };

      webview.addEventListener('did-stop-loading', onStopLoading);
      webview.addEventListener('dom-ready', onDomReady);
    });
  }, []);

  // Deliver synthesized HTML reports into a newly created browser tab
  const handleOpenSynthesizedReport = useCallback((htmlContent: string, topic: string) => {
    const styledHtml = `
      <!DOCTYPE html>
      <html lang="en">
      <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Synthesis: ${topic}</title>
        <style>
          :root { --bg: #0d0e12; --card: #161822; --text: #f3f4f6; --accent: #6366f1; --accent-glow: rgba(99,102,241,0.25); --border: rgba(255,255,255,0.08); }
          body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; background: var(--bg); color: var(--text); padding: 40px 20px; margin: 0; line-height: 1.6; }
          .container { max-width: 960px; margin: 0 auto; }
          .header-badge { display: inline-flex; align-items: center; gap: 6px; padding: 4px 12px; border-radius: 999px; background: var(--accent-glow); border: 1px solid rgba(99,102,241,0.4); color: #818cf8; font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.1em; margin-bottom: 12px; }
          h1 { color: #ffffff; font-size: 28px; font-weight: 700; margin: 0 0 20px 0; }
          h2 { color: #e0e7ff; font-size: 20px; font-weight: 600; margin: 32px 0 12px 0; border-bottom: 1px solid var(--border); padding-bottom: 8px; }
          h3 { color: #c7d2fe; font-size: 16px; font-weight: 600; margin: 20px 0 8px 0; }
          p, li { color: #9ca3af; font-size: 14px; }
          .card { background: var(--card); border: 1px solid var(--border); border-radius: 12px; padding: 24px; margin-bottom: 20px; box-shadow: 0 8px 32px rgba(0,0,0,0.35); }
          table { width: 100%; border-collapse: collapse; margin: 20px 0; background: rgba(255,255,255,0.02); border-radius: 8px; overflow: hidden; border: 1px solid var(--border); }
          th, td { padding: 14px 16px; border-bottom: 1px solid var(--border); text-align: left; font-size: 14px; }
          th { background: rgba(255,255,255,0.05); color: #818cf8; font-weight: 600; text-transform: uppercase; font-size: 11px; letter-spacing: 0.05em; }
          tr:last-child td { border-bottom: none; }
          a { color: #818cf8; text-decoration: none; }
          a:hover { text-decoration: underline; }
          ul { padding-left: 20px; }
          li { margin-bottom: 6px; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header-badge">⚡ ICRUSH AI Research Synthesis</div>
          <h1>${topic}</h1>
          <div class="card">
            ${htmlContent}
          </div>
        </div>
      </body>
      </html>
    `;

    const dataUrl = `data:text/html;charset=utf-8,${encodeURIComponent(styledHtml)}`;
    handleCreateTab(dataUrl);
  }, [handleCreateTab]);

  // Webview scraping helper with recursive Shadow DOM traversal
  const getActivePageDetails = async () => {
    if (!activeId) return null;
    const webview = getWebview(activeId);
    if (!webview) return null;

    try {
      const currentUrl = webview.getURL();
      const title = webview.getTitle();
      
      const rawText = await webview.executeJavaScript(`
        (() => {
          function extractText(root = document.body) {
            if (!root) return '';
            let t = '';
            const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, null);
            let node;
            while ((node = walker.nextNode())) {
              const p = node.parentElement;
              if (p && p.tagName !== 'SCRIPT' && p.tagName !== 'STYLE' && p.tagName !== 'NOSCRIPT') {
                const val = node.nodeValue?.trim();
                if (val) t += val + ' ';
              }
            }
            const shadowHosts = Array.from(root.querySelectorAll('*')).filter(el => el.shadowRoot);
            for (const el of shadowHosts) {
              if (el.shadowRoot) t += ' ' + extractText(el.shadowRoot);
            }
            return t;
          }
          return extractText().substring(0, 5000);
        })()
      `);
      const pageText = typeof rawText === 'string' ? rawText : '';

      const rawLinks = await webview.executeJavaScript(`
        (() => {
          try {
            function queryAllDeep(sel, root = document) {
              let list = Array.from(root.querySelectorAll(sel));
              const shadowHosts = Array.from(root.querySelectorAll('*')).filter(el => el.shadowRoot);
              for (const el of shadowHosts) {
                if (el.shadowRoot) list = list.concat(queryAllDeep(sel, el.shadowRoot));
              }
              return list;
            }

            return queryAllDeep('a[href], ytd-rich-grid-media, ytd-video-renderer, [role="link"]')
              .slice(0, 30)
              .map(a => {
                const href = a.getAttribute('href') || a.querySelector('a')?.getAttribute('href') || (a as any).href || '';
                const fullHref = href.startsWith('/') ? window.location.origin + href : href;
                const linkText = (a.textContent || a.getAttribute('title') || a.getAttribute('aria-label') || '').replace(/\\s+/g, ' ').trim().substring(0, 100);
                return { text: linkText, url: fullHref };
              })
              .filter(l => l.text && l.url && l.url.startsWith('http') && !l.url.includes('#'));
          } catch(e) {
            return [];
          }
        })()
      `);
      const pageLinks = (rawLinks || []) as Array<{ text: string; url: string }>;

      return { pageText, pageLinks, currentUrl, title };
    } catch (e) {
      console.error('Scraping error:', e);
      return null;
    }
  };

  // AI Tab Auto-Grouping
  const handleAutoGroup = async (category?: string) => {
    if (tabs.length === 0) return;
    setAgentStatus('AI is organizing workspaces...');

    try {
      const tabsList = tabs.map(t => ({ id: t.id, title: t.title, url: t.url }));

      // Always use local AI for tab grouping (no cloud API needed)
      const result = await window.electronAPI.groupTabs(tabsList, '', 'local', category);

      if (result && Array.isArray(result)) {
        const newWorkspaces = result.map((item, idx) => ({
          id: `workspace-${Date.now()}-${idx}`,
          name: item.name,
          color: item.color || '#6366f1',
          tabIds: item.tabIds || [],
        }));
        // Preserve manually-named workspaces that don't overlap
        const manualWorkspaces = workspaces.filter(
          w => !w.id.startsWith('workspace-') || w.name !== 'New Workspace'
        );
        setWorkspaces([...manualWorkspaces, ...newWorkspaces]);
        if (newWorkspaces.length > 0) {
          setActiveWorkspaceId(newWorkspaces[0].id);
        }
      }
    } catch (err) {
      console.error('Failed to group tabs:', err);
      const errMsg = err instanceof Error ? err.message : String(err);
      alert(`AI Tab Grouping Failed:\n${errMsg}`);
    } finally {
      setAgentStatus('');
    }
  };

  const handleAutofillForm = async () => {
    if (!activeWebview) return;
    
    setAgentStatus('Scanning form inputs...');
    
    // 1. Scrape empty DOM structure from webview
    const layout = await activeWebview.executeJavaScript(`
      (() => {
        return Array.from(document.querySelectorAll('input, textarea, select'))
          .filter(el => {
            const rect = el.getBoundingClientRect();
            const style = window.getComputedStyle(el);
            return rect.width > 0 && rect.height > 0 && 
                   !el.disabled && el.type !== 'hidden' && 
                   el.type !== 'submit' && style.display !== 'none' && style.visibility !== 'hidden';
          })
          .map(el => {
            let labelText = '';
            if (el.labels && el.labels.length > 0) {
              labelText = el.labels[0].innerText;
            } else {
              labelText = el.placeholder || el.name || el.id || '';
            }
            return {
              id: el.id || '',
              name: el.name || '',
              type: el.type || 'text',
              placeholder: el.placeholder || '',
              label: labelText.trim()
            };
          });
      })()
    `);

    if (!layout || layout.length === 0) {
      setAgentStatus('');
      setMessages(prev => [
        ...prev,
        {
          id: generateUUID(),
          role: 'assistant',
          content: '🤖 No input fields found on this page to autofill.'
        }
      ]);
      return;
    }

    setAgentStatus('Planning secure autofill...');

    // 2. Fetch local credentials list securely (only domain matching)
    let matchedCredentials: any = null;
    try {
      const url = activeWebview.getURL();
      if (url && !url.startsWith('about:') && !url.startsWith('chrome://')) {
        const domain = new URL(url).hostname;
        const allEntries = await window.electronAPI.passwords.getAll();
        const match = allEntries.find(e => e.url && e.url.includes(domain));
        if (match) {
          matchedCredentials = await window.electronAPI.passwords.getEntry(match.id);
        }
      }
    } catch (err) {
      console.error('Failed to query Password Manager:', err);
    }

    // 3. Match inputs locally using simple regex mapping
    const resolvedMapping = layout.map((item: any) => {
      const lowerLabel = (item.label || '').toLowerCase();
      const lowerName = (item.name || '').toLowerCase();
      const lowerId = (item.id || '').toLowerCase();
      
      if (lowerLabel.includes('password') || lowerName.includes('password') || lowerId.includes('password') || item.type === 'password') {
        return { id: item.id, name: item.name, type: 'password' };
      }
      if (lowerLabel.includes('username') || lowerLabel.includes('email') || lowerLabel.includes('login') ||
          lowerName.includes('username') || lowerName.includes('email') || lowerName.includes('login') ||
          lowerId.includes('username') || lowerId.includes('email') || lowerId.includes('login')) {
        return { id: item.id, name: item.name, type: 'username' };
      }
      return null;
    }).filter(Boolean);

    // 4. Inject values locally
    let fieldsFilled = 0;
    for (const map of resolvedMapping) {
      if (!map) continue;
      let value = '';
      if (map.type === 'username') value = matchedCredentials?.username || '';
      if (map.type === 'password') value = matchedCredentials?.password || '';

      if (value) {
        // Inject securely using executeJavaScript with JSON.stringify for safe JS string serialization
        const safeValue = JSON.stringify(value);
        const safeId = JSON.stringify(map.id || '');
        const safeName = JSON.stringify(map.name || '');
        await activeWebview.executeJavaScript(`
          (() => {
            const el = document.getElementById(${safeId}) || document.querySelector(\`[name=\${${safeName}}]\`);
            if (el) {
              el.value = ${safeValue};
              el.dispatchEvent(new Event('input', { bubbles: true }));
              el.dispatchEvent(new Event('change', { bubbles: true }));
              return true;
            }
            return false;
          })()
        `);
        fieldsFilled++;
      }
    }

    setAgentStatus('');
    setMessages(prev => [
      ...prev,
      {
        id: generateUUID(),
        role: 'assistant',
        content: `🤖 Secure autofill completed. Filled ${fieldsFilled} fields locally (zero credentials sent to cloud).`
      }
    ]);
  };

  // Execute commands output by Gemini
  const handleExecuteCommands = useCallback(
    commands => {
      if (!commands || !Array.isArray(commands)) return;

      commands.forEach(cmd => {
        switch (cmd.action) {
          case 'navigate': {
            if (!activeId) break;
            const url = normalizeUrl(cmd.url, searchEngine);
            navigateToUrl(url);
            break;
          }
          case 'search': {
            if (!activeId) break;
            const url = normalizeUrl(cmd.query, searchEngine);
            navigateToUrl(url);
            break;
          }
          case 'goBack':
            if (activeId) goBack(activeId);
            break;
          case 'goForward':
            if (activeId) goForward(activeId);
            break;
          case 'refresh':
            if (activeId) reload(activeId);
            break;
          case 'newTab': {
            const url = cmd.url ? normalizeUrl(cmd.url, searchEngine) : 'https://www.google.com';
            handleCreateTab(url);
            break;
          }
          case 'closeTab':
            if (activeId) handleCloseTab(activeId);
            break;
          case 'autofillForm':
            handleAutofillForm();
            break;
          default:
            console.warn('Unhandled browser command action:', cmd.action);
        }
      });
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [activeId, searchEngine, navigateToUrl, goBack, goForward, reload, activeWebview]
  );

  const {
    messages,
    isLoading,
    setIsLoading,
    sendMessage,
    clearChat,
    clearGeminiError,
    setMessages,
    geminiError,
  } = useGemini({ onExecuteCommand: (cmds) => handleExecuteCommands(cmds), activeProvider });

  // Sync sidebar messages to shared AI sessions store so dashboard can see them
  useEffect(() => {
    if (messages.length > 0) {
      const SIDEBAR_SESSION_ID = 'sidebar-active-chat';
      const firstUserMsg = messages.find(m => m.role === 'user');
      const session: aiSessions.AISession = {
        id: SIDEBAR_SESSION_ID,
        title: firstUserMsg ? firstUserMsg.content.slice(0, 32) + (firstUserMsg.content.length > 32 ? '...' : '') : 'AI Sidebar Chat',
        timestamp: Date.now(),
        messages,
        model: 'gemini-2.5-flash',
        persona: 'general',
      };
      aiSessions.upsertSession(session);
    }
  }, [messages]);

  // Agent confirmation helper - prompts user before sensitive actions
  const promptAgentConfirmation = useCallback((type: string, description: string): Promise<boolean> => {
    return new Promise((resolve) => {
      setAgentConfirmAction({ type, description, resolve });
    });
  }, []);

  // Handle agent confirmation response
  const handleAgentConfirmResponse = useCallback((confirmed: boolean) => {
    if (agentConfirmAction) {
      agentConfirmAction.resolve(confirmed);
      setAgentConfirmAction(null);
    }
  }, [agentConfirmAction]);

  // Handle agent undo
  const handleAgentUndo = useCallback(async () => {
    try {
      const result = await window.electronAPI.agent.undoLastAction();
      if (result.success && result.undoJsCode && activeWebview) {
        await activeWebview.executeJavaScript(result.undoJsCode);
        setCanUndo(false);
        setMessages(prev => [...prev, {
          id: generateUUID(),
          role: 'assistant',
          content: `⏪ **Action Undone** (ID: ${result.actionId})`
        }]);
      } else if (!result.success) {
        setMessages(prev => [...prev, {
          id: generateUUID(),
          role: 'assistant',
          content: `⚠️ Nothing to undo: ${result.error || 'No reversible actions'}`
        }]);
      }
    } catch (err) {
      console.error('Undo error:', err);
    }
  }, [activeWebview, setMessages]);

  // Record agent action for undo capability
  const recordAgentAction = useCallback(async (
    stepNumber: number,
    goal: string,
    url: string,
    action: {
      type: string;
      selector?: string;
      value?: string;
      formFields?: Array<{ selector: string; value: string }>;
    }
  ) => {
    try {
      await window.electronAPI.agent.recordAction({
        stepNumber,
        goal,
        url,
        action: action as any,
      });
      setCanUndo(true);
    } catch (err) {
      console.warn('Failed to record action:', err);
    }
  }, []);

  // Cancel running agent
  const handleCancelAgent = useCallback(() => {
    if (agentAbortRef.current) {
      agentAbortRef.current.abort();
      agentAbortRef.current = null;
    }
    setAgentStatus('');
    setIsLoading(false);
    setMessages(prev => [...prev, {
      id: generateUUID(),
      role: 'assistant',
      content: '⏹️ **Agent stopped by user.**'
    }]);
  }, [setMessages]);

  // Autonomous Web Agent Execution Loop
  const handleRunAgent = async (goal: string) => {
    if (isLoading || agentStatus) return;

    const abortController = new AbortController();
    agentAbortRef.current = abortController;

    setIsLoading(true);
    setAgentStatus('Agent started. Analyzing goal...');

    const userMsgId = generateUUID();
    const assistantMsgId = generateUUID();

    const userMsg = { id: userMsgId, role: 'user' as const, content: `🤖 [Agent Goal] ${goal}` };
    let assistantMsg = {
      id: assistantMsgId,
      role: 'assistant' as const,
      content: `🤖 **Autonomous Browsing Agent Initialized**\nGoal: *"${goal}"*\nModel: *${activeProvider === 'local' ? 'Ollama Local' : activeProvider || 'Gemini'}*`,
      isStreaming: true,
    };

    setMessages(prev => [...prev, userMsg, assistantMsg]);

    const activeApiKey = apiKey;

    // --- HYBRID RESEARCH & MULTI-TAB SYNTHESIS FAST-TRACK ---
    const isMultiTabOrHeavyResearch = /summarize (all|open|these) tabs|compare tabs|deep research|research and compare|synthesize/i.test(goal);
    if (isMultiTabOrHeavyResearch) {
      setAgentStatus('🛡️ Local AI: Analyzing tab contexts & preparing synthesis...');
      
      const openTabsContent: Array<{ title: string; url: string; content: string }> = [];
      for (const t of tabs) {
        if (!t.url.startsWith('about:') && !t.isIncognito) {
          const wv = getWebview(t.id);
          if (wv) {
            try {
              const text = await wv.executeJavaScript('document.body.innerText');
              if (text && typeof text === 'string') {
                openTabsContent.push({
                  title: t.title || t.url,
                  url: t.url,
                  content: text.substring(0, 3000),
                });
              }
            } catch (_) {}
          }
        }
      }

      const tabsDataString = openTabsContent.map(tc => `Title: ${tc.title}\nURL: ${tc.url}\nExcerpt:\n${tc.content}`).join('\n\n---\n\n');
      const payloadContext = tabsDataString || goal;

      const isCloudProvider = activeProvider !== 'local' && !!activeApiKey;
      let shouldProceedWithCloud = isCloudProvider;

      if (isCloudProvider) {
        const confirmed = await promptAgentConfirmation(
          'cloud_synthesis',
          `Send sanitized context (${Math.max(1, Math.round(payloadContext.length / 1024))} KB) to ${activeProvider.toUpperCase()} for HTML report generation?`
        );
        shouldProceedWithCloud = confirmed;
      }

      if (shouldProceedWithCloud) {
        setAgentStatus('⚡ Cloud AI: Compiling comprehensive research report...');
        try {
          const htmlReport = await window.electronAPI.synthesizeResearch(
            goal,
            payloadContext,
            activeProvider,
            activeApiKey
          );
          if (htmlReport) {
            handleOpenSynthesizedReport(htmlReport, goal);
            setMessages(prev => [
              ...prev,
              {
                id: generateUUID(),
                role: 'assistant',
                content: `✅ **Research Synthesis Complete!**\n\nCompiled insights and opened dedicated interactive report in a new tab.`
              }
            ]);
            setAgentStatus('');
            setIsLoading(false);
            return;
          }
        } catch (err: any) {
          console.warn('Cloud synthesis error, falling back to standard agent loop:', err);
        }
      } else if (activeProvider === 'local') {
        setAgentStatus('🛡️ Local AI: Synthesizing report on-device...');
        try {
          const htmlReport = await window.electronAPI.synthesizeResearch(
            goal,
            payloadContext.substring(0, 4000),
            'local',
            ''
          );
          if (htmlReport) {
            handleOpenSynthesizedReport(htmlReport, goal);
            setMessages(prev => [
              ...prev,
              {
                id: generateUUID(),
                role: 'assistant',
                content: `🛡️ **Local Research Synthesis Complete!**\n\nReport generated 100% on-device and opened in a new tab.`
              }
            ]);
            setAgentStatus('');
            setIsLoading(false);
            return;
          }
        } catch (err: any) {
          console.warn('Local synthesis error:', err);
        }
      }
    }

    let stepNumber = 0;
    const maxSteps = 10;
    let isFinished = false;
    let agentHistoryLogs = '';

    while (!isFinished && stepNumber < maxSteps) {
      if (abortController.signal.aborted) {
        break;
      }
      stepNumber++;
      setAgentStatus(`Step ${stepNumber}/${maxSteps}: Reading active web view...`);

      if (activeWebview) {
        await waitForWebviewReady(activeWebview, 4000);
      } else {
        await new Promise(resolve => setTimeout(resolve, 600));
      }

      const pageDetails = await getActivePageDetails();
      const currentUrl = pageDetails?.currentUrl || 'https://www.google.com';
      const pageText = pageDetails?.pageText || 'No text extracted';
      const pageLinks = pageDetails?.pageLinks || [];

      setAgentStatus(`Step ${stepNumber}/${maxSteps}: Deciding next step...`);

      try {
        const decision = await window.electronAPI.executeAgentStep(
          {
            goal,
            currentUrl,
            pageText,
            pageLinks,
            stepNumber,
            history: agentHistoryLogs,
          },
          activeApiKey,
          activeProvider
        );

        // Build action description for history
        let actionDesc = decision.action;
        if (decision.url) actionDesc += ` -> ${decision.url}`;
        if (decision.query) actionDesc += ` "${decision.query}"`;
        if (decision.selector) actionDesc += ` [${decision.selector}]`;
        if (decision.text) actionDesc += ` text:"${decision.text}"`;

        agentHistoryLogs += `\nStep ${stepNumber}: Thought: ${decision.thought}\nAction: ${actionDesc}\n`;

        assistantMsg = {
          ...assistantMsg,
          content:
            assistantMsg.content +
            `\n\n**Step ${stepNumber}:** ${decision.thought}\n\`${actionDesc}\``,
        };
        setMessages(prev => prev.map(m => (m.id === assistantMsgId ? assistantMsg : m)));

        // Handle finish action
        if (decision.action === 'finish') {
          isFinished = true;
          assistantMsg = {
            ...assistantMsg,
            content: assistantMsg.content + `\n\n**Result:**\n${decision.answer}`,
            isStreaming: false,
          };
          setMessages(prev => prev.map(m => (m.id === assistantMsgId ? assistantMsg : m)));
          setAgentStatus('');
          break;
        }

        // Handle navigation actions
        if (decision.action === 'navigate' && decision.url) {
          setAgentStatus(`Step ${stepNumber}/${maxSteps}: Navigating to ${decision.url}...`);
          navigateToUrl(decision.url);
          if (activeWebview) {
            await waitForWebviewReady(activeWebview, 6000);
          } else {
            await new Promise(resolve => setTimeout(resolve, 1000));
          }
        } else if (decision.action === 'search' && decision.query) {
          setAgentStatus(`Step ${stepNumber}/${maxSteps}: Searching for "${decision.query}"...`);
          const searchUrl = normalizeUrl(decision.query, searchEngine);
          navigateToUrl(searchUrl);
          if (activeWebview) {
            await waitForWebviewReady(activeWebview, 6000);
          } else {
            await new Promise(resolve => setTimeout(resolve, 1000));
          }
        } else if (decision.action === 'scroll') {
          // Scroll action - execute in webview
          setAgentStatus(`Step ${stepNumber}/${maxSteps}: Scrolling ${decision.direction || 'down'}...`);
          if (activeWebview) {
            const jsResult = await window.electronAPI.agent.execute({
              type: 'scroll',
              direction: decision.direction || 'down',
              amount: decision.amount || 500,
            });
            if (jsResult.success && jsResult.jsCode) {
              try {
                await activeWebview.executeJavaScript(jsResult.jsCode);
              } catch (e) {
                console.warn('Scroll execution error:', e);
              }
            }
          }
          await new Promise(resolve => setTimeout(resolve, 1000));
        } else if (decision.action === 'click' && decision.selector) {
          // Visual feedback: highlight element before clicking
          if (activeWebview) {
            try {
              const highlightResult = await window.electronAPI.agent.highlight(decision.selector, '#6366f1', 2000);
              if (highlightResult.jsCode) await activeWebview.executeJavaScript(highlightResult.jsCode);
              const tooltipResult = await window.electronAPI.agent.tooltip(decision.selector, `Clicking: ${decision.selector}`);
              if (tooltipResult.jsCode) await activeWebview.executeJavaScript(tooltipResult.jsCode);
            } catch (e) { console.warn('Visual feedback error:', e); }
          }
          // Click action - record for undo, then execute in webview
          await recordAgentAction(stepNumber, goal, currentUrl, {
            type: 'click',
            selector: decision.selector,
          });
          setAgentStatus(`Step ${stepNumber}/${maxSteps}: Clicking "${decision.selector}"...`);
          if (activeWebview) {
            const jsResult = await window.electronAPI.agent.execute({
              type: 'click',
              selector: decision.selector,
            });
            if (jsResult.success && jsResult.jsCode) {
              try {
                const result = await activeWebview.executeJavaScript(jsResult.jsCode);
                const parsed = typeof result === 'string' ? JSON.parse(result) : result;
                if (!parsed.success) {
                  agentHistoryLogs += `  Click failed: ${parsed.error}\n`;
                }
                // Visual feedback: ripple effect after click
                try {
                  const rippleResult = await window.electronAPI.agent.clickRipple(100, 100, '#6366f1');
                  if (rippleResult.jsCode) await activeWebview.executeJavaScript(rippleResult.jsCode);
                } catch (e) { console.warn('Ripple error:', e); }
              } catch (e) {
                console.warn('Click execution error:', e);
              }
            }
          }
          await new Promise(resolve => setTimeout(resolve, 2000));
        } else if (decision.action === 'type' && decision.selector && decision.text) {
          // Type action - check for sensitive fields first
          const isSensitive = /pass|pwd|secret|token|auth|credential|ssn|credit|card|cvv|pin|otp|2fa|mfa/i.test(decision.selector);
          if (isSensitive) {
            const confirmed = await promptAgentConfirmation('type', `Type into sensitive field "${decision.selector}"`);
            if (!confirmed) {
              agentHistoryLogs += `  Skipped: User declined sensitive field type\n`;
              setMessages(prev => prev.map(m => m.id === assistantMsgId ? {
                ...assistantMsg,
                content: assistantMsg.content + `\n  ⏭️ Skipped typing into sensitive field (user declined)`
              } : m));
              await new Promise(resolve => setTimeout(resolve, 500));
              continue;
            }
          }
          // Type action - execute in webview
          setAgentStatus(`Step ${stepNumber}/${maxSteps}: Typing in "${decision.selector}"...`);
          if (activeWebview) {
            // Visual feedback: highlight and tooltip
            try {
              const highlightResult = await window.electronAPI.agent.highlight(decision.selector, '#6366f1', 2000);
              if (highlightResult.jsCode) await activeWebview.executeJavaScript(highlightResult.jsCode);
              const tooltipResult = await window.electronAPI.agent.tooltip(decision.selector, `Typing: ${decision.text?.substring(0, 20)}...`);
              if (tooltipResult.jsCode) await activeWebview.executeJavaScript(tooltipResult.jsCode);
            } catch (e) { console.warn('Visual feedback error:', e); }
            // Record action for undo
            await recordAgentAction(stepNumber, goal, currentUrl, {
              type: 'type',
              selector: decision.selector,
              value: decision.text,
            });
            const jsResult = await window.electronAPI.agent.execute({
              type: 'type',
              selector: decision.selector,
              text: decision.text,
            });
            if (jsResult.success && jsResult.jsCode) {
              try {
                await activeWebview.executeJavaScript(jsResult.jsCode);
              } catch (e) {
                console.warn('Type execution error:', e);
              }
            }
          }
          await new Promise(resolve => setTimeout(resolve, 500));
        } else if (decision.action === 'extract') {
          // Extract page data
          setAgentStatus(`Step ${stepNumber}/${maxSteps}: Extracting page data...`);
          if (activeWebview) {
            const jsResult = await window.electronAPI.agent.execute({ type: 'extract' });
            if (jsResult.success && jsResult.jsCode) {
              try {
                const extracted = await activeWebview.executeJavaScript(jsResult.jsCode);
                const parsed = typeof extracted === 'string' ? JSON.parse(extracted) : extracted;
                if (parsed.text) {
                  agentHistoryLogs += `  Extracted: ${parsed.text.substring(0, 500)}\n`;
                }
              } catch (e) {
                console.warn('Extract execution error:', e);
              }
            }
          }
          await new Promise(resolve => setTimeout(resolve, 1000));
        } else if (decision.action === 'fill_form' && decision.formFields) {
          // Fill form action - check for sensitive fields first
          const sensitiveFields = decision.formFields.filter(f =>
            /pass|pwd|secret|token|auth|credential|ssn|credit|card|cvv|pin|otp|2fa|mfa/i.test(f.selector)
          );
          if (sensitiveFields.length > 0) {
            const fieldNames = sensitiveFields.map(f => f.selector).join(', ');
            const confirmed = await promptAgentConfirmation('fill_form', `Fill sensitive fields: ${fieldNames}`);
            if (!confirmed) {
              agentHistoryLogs += `  Skipped: User declined sensitive form fill\n`;
              setMessages(prev => prev.map(m => m.id === assistantMsgId ? {
                ...assistantMsg,
                content: assistantMsg.content + `\n  ⏭️ Skipped filling sensitive fields (user declined)`
              } : m));
              await new Promise(resolve => setTimeout(resolve, 500));
              continue;
            }
          }
          // Fill form action - execute in webview
          setAgentStatus(`Step ${stepNumber}/${maxSteps}: Filling form...`);
          if (activeWebview) {
            // Visual feedback: highlight first field and show tooltip
            try {
              const firstField = decision.formFields[0];
              if (firstField) {
                const highlightResult = await window.electronAPI.agent.highlight(firstField.selector, '#6366f1', 2000);
                if (highlightResult.jsCode) await activeWebview.executeJavaScript(highlightResult.jsCode);
                const tooltipResult = await window.electronAPI.agent.tooltip(firstField.selector, `Filling ${decision.formFields.length} fields`);
                if (tooltipResult.jsCode) await activeWebview.executeJavaScript(tooltipResult.jsCode);
              }
            } catch (e) { console.warn('Visual feedback error:', e); }
            // Record action for undo
            await recordAgentAction(stepNumber, goal, currentUrl, {
              type: 'fill_form',
              formFields: decision.formFields,
            });
            const jsResult = await window.electronAPI.agent.execute({
              type: 'fill_form',
              formFields: decision.formFields,
            });
            if (jsResult.success && jsResult.jsCode) {
              try {
                await activeWebview.executeJavaScript(jsResult.jsCode);
              } catch (e) {
                console.warn('Fill form execution error:', e);
              }
            }
          }
          await new Promise(resolve => setTimeout(resolve, 1000));
        } else if (decision.action === 'select' && decision.selector && decision.value) {
          // Select dropdown action
          setAgentStatus(`Step ${stepNumber}/${maxSteps}: Selecting option...`);
          if (activeWebview) {
            const jsResult = await window.electronAPI.agent.execute({
              type: 'select',
              selector: decision.selector,
              value: decision.value,
            });
            if (jsResult.success && jsResult.jsCode) {
              try {
                await activeWebview.executeJavaScript(jsResult.jsCode);
              } catch (e) {
                console.warn('Select execution error:', e);
              }
            }
          }
          await new Promise(resolve => setTimeout(resolve, 1000));
        } else if (decision.action === 'press_key' && decision.keys) {
          // Press key action
          setAgentStatus(`Step ${stepNumber}/${maxSteps}: Pressing key "${decision.keys}"...`);
          if (activeWebview) {
            const jsResult = await window.electronAPI.agent.execute({
              type: 'press_key',
              keys: decision.keys,
            });
            if (jsResult.success && jsResult.jsCode) {
              try {
                await activeWebview.executeJavaScript(jsResult.jsCode);
              } catch (e) {
                console.warn('Press key execution error:', e);
              }
            }
          }
          await new Promise(resolve => setTimeout(resolve, 500));
        } else {
          // Unknown or unsupported action
          agentHistoryLogs += `  Warning: Unsupported action "${decision.action}"\n`;
          await new Promise(resolve => setTimeout(resolve, 500));
        }
      } catch (err) {
        console.error('Agent step error:', err);
        assistantMsg = {
          ...assistantMsg,
          content:
            assistantMsg.content + `\n\n❌ **Error:** ${err.message || err}`,
          isStreaming: false,
        };
        setMessages(prev => prev.map(m => (m.id === assistantMsgId ? assistantMsg : m)));
        isFinished = true;
      }
    }

    if (!isFinished) {
      assistantMsg = {
        ...assistantMsg,
        content:
          assistantMsg.content +
          `\n\n⚠️ **Agent reached step limit (${maxSteps}).**`,
        isStreaming: false,
      };
      setMessages(prev => prev.map(m => (m.id === assistantMsgId ? assistantMsg : m)));
    }

    agentAbortRef.current = null;
    setIsLoading(false);
    setAgentStatus('');
  };

  const handleToggleContext = (enabled: boolean) => {
    if (enabled && activeProvider !== 'local' && !cloudConsentGranted) {
      setPendingCloudAction({ type: 'toggleContext', enabled: true });
      setIsCloudConsentOpen(true);
      return;
    }
    setIncludeContext(enabled);
  };

  const handleToggleHistory = (enabled: boolean) => {
    if (enabled && activeProvider !== 'local' && !cloudConsentGranted) {
      setPendingCloudAction({ type: 'toggleHistory', enabled: true });
      setIsCloudConsentOpen(true);
      return;
    }
    setIncludeHistory(enabled);
  };

  const handleCloudConsentConfirm = () => {
    setCloudConsentGranted(true);
    localStorage.setItem('gemini-browser-cloud-consent', 'true');
    setIsCloudConsentOpen(false);
    
    if (pendingCloudAction) {
      if (pendingCloudAction.type === 'send' && pendingCloudAction.text) {
        handleSendMessage(pendingCloudAction.text);
      } else if (pendingCloudAction.type === 'summarize') {
        handleSummarizePage();
      } else if (pendingCloudAction.type === 'toggleContext') {
        setIncludeContext(true);
      } else if (pendingCloudAction.type === 'toggleHistory') {
        setIncludeHistory(true);
      }
      setPendingCloudAction(null);
    }
  };

  const handleCloudConsentCancel = () => {
    setIsCloudConsentOpen(false);
    setPendingCloudAction(null);
    if (pendingCloudAction?.type === 'toggleContext') {
      setIncludeContext(false);
    } else if (pendingCloudAction?.type === 'toggleHistory') {
      setIncludeHistory(false);
    }
  };

  const sanitizePrompt = (text: string): string => {
    let sanitized = text;
    sanitized = sanitized.replace(/\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/g, '[EMAIL]');
    sanitized = sanitized.replace(/\b[a-zA-Z]:\\[A-Za-z0-9._~\s\\-]+\b/g, '[FILE_PATH]');
    sanitized = sanitized.replace(/\b\/(?:[A-Za-z0-9._-]+\/)+[A-Za-z0-9._-]+\b/g, '[FILE_PATH]');
    sanitized = sanitized.replace(/(https?:\/\/)[^/\s:]+:[^/\s:]+@/g, '$1[CREDENTIALS]@');
    return sanitized;
  };

  const handleCloudAssist = async (task: string) => {
    if (!task.trim() || isLoading) return;
    
    const providers = ['gemini', 'anthropic', 'openai', 'groq', 'openrouter'];
    let cloudProvider = activeProvider !== 'local' ? activeProvider : '';
    let cloudKey = cloudProvider ? apiKeys[cloudProvider] : '';
    
    if (!cloudKey) {
      for (const p of providers) {
        if (apiKeys[p]) {
          cloudProvider = p;
          cloudKey = apiKeys[p];
          break;
        }
      }
    }

    if (!cloudKey) {
      alert("Please configure a Cloud AI API key in Settings (e.g. Gemini, Anthropic, OpenAI) to use Cloud Assist.");
      return;
    }

    setAgentStatus('Consulting Cloud AI for roadmap...');
    setIsLoading(true);

    const sanitizedTask = sanitizePrompt(task);

    try {
      const cloudPlan = await window.electronAPI.requestCloudPlan({
        prompt: sanitizedTask,
        provider: cloudProvider,
        apiKey: cloudKey
      });

      if (!cloudPlan) {
        throw new Error("No plan returned from cloud.");
      }

      setAgentStatus('Injecting cloud roadmap into local model...');
      
      const localPrompt = `Here is the execution plan generated by Cloud AI to guide your execution:\n\n${cloudPlan}\n\nUser request: ${task}\n\nPlease proceed to execute the task using the above plan.`;

      sendMessage(localPrompt, undefined, { forceLocal: true });
    } catch (err: any) {
      console.error('Cloud Assist failed:', err);
      sendMessage(task, undefined, { forceLocal: true });
    } finally {
      setIsLoading(false);
      setAgentStatus('');
    }
  };

  // Unified messaging router
  const handleSendMessage = async (
    text: string,
    files?: Array<{ inlineData: { mimeType: string; data: string } }>
  ) => {
    if (!text.trim() || isLoading) {
      return;
    }

    if (activeProvider !== 'local' && !cloudConsentGranted && (includeContext || includeHistory)) {
      setPendingCloudAction({ type: 'send', text });
      setIsCloudConsentOpen(true);
      return;
    }

    if (isAgentMode) {
      handleRunAgent(text.trim());
    } else {
      const activeApiKey = apiKey;

      let contextPrompt = '';
      const isTorTab = !!activeTab?.isIncognito || !!activeTab?.torMode;
      const torCloudRouting = localStorage.getItem('torCloudRouting') !== 'false';

      // 1. Lazy Context Loading: Pull background tabs context only if prompted
      const crossTabKeywords = ['other tab', 'workspace', 'compare tab', 'across my tab', 'all tabs', 'open tabs'];
      const isAskingAboutCrossTabs = crossTabKeywords.some(keyword => text.toLowerCase().includes(keyword));

      if (isAskingAboutCrossTabs && !isTorTab) {
        const tabsContext = tabs
          .map((t, idx) => `Tab ${idx + 1}: Title: "${t.title}" | URL: ${t.url}`)
          .join('\n');
        contextPrompt += `[WORKSPACE OTHER TABS CONTEXT]\n${tabsContext}\n\n`;
      }

      if (includeContext) {
        console.log('Reading active web page for context...');
        setAgentStatus('Reading active web page...');
        const pageDetails = await getActivePageDetails();
        setAgentStatus('');

        if (pageDetails) {
          console.log('Acquired page details. Wrapping prompt with context...');
          contextPrompt += `[ACTIVE PAGE CONTEXT]\nURL: ${pageDetails.currentUrl}\nTitle: ${pageDetails.title}\nText content:\n${pageDetails.pageText}\n\n`;
        } else {
          console.log('Failed to scrape active page.');
        }
      }

      if (includeHistory && !isTorTab) {
        console.log('Reading browser history for context...');
        let historyText = '';
        try {
          const historyEntries = await window.electronAPI.db.getHistory();
          if (historyEntries && historyEntries.length > 0) {
            const sorted = historyEntries
              .sort((a, b) => b.timestamp - a.timestamp)
              .slice(0, 100);
            historyText = sorted
              .map(
                h =>
                  `- Title: ${h.title || 'Untitled'} | URL: ${h.url} | Visited: ${new Date(
                    h.timestamp
                  ).toLocaleString()}`
              )
              .join('\n');
          }
        } catch (e) {
          console.error('Failed to parse browser history for context:', e);
        }
        contextPrompt += `[BROWSER HISTORY CONTEXT (Recent 100 visits)]\n${
          historyText || 'No history recorded.'
        }\n\n`;
      }
      
      // Closed tabs history injection
      const closedKeywords = ['closed', 'reopen', 'last tab', 'last three tabs', 'recent tabs', 'open last'];
      const isAskingAboutClosedTabs = closedKeywords.some(keyword => text.toLowerCase().includes(keyword));

      if (isAskingAboutClosedTabs) {
        const closedContext = closedTabsHistory
          .slice(0, 5)
          .map((c, idx) => `Closed Tab ${idx + 1}: Title: "${c.tab.title || 'Untitled'}" | URL: ${c.tab.url}`)
          .join('\n');
        contextPrompt += `[RECENTLY CLOSED TABS HISTORY]\n${closedContext || 'No recently closed tabs recorded.'}\n\n`;
      }

      // Detect history related questions when history is disabled
      const historyKeywords = ['history', 'visited', 'browsing', 'yesterday', 'websites', 'went to', 'searched'];
      const isAskingAboutHistory = historyKeywords.some(keyword => text.toLowerCase().includes(keyword));

      if (isAskingAboutHistory && !includeHistory && !isTorTab) {
        contextPrompt += `[SYSTEM NOTICE: The user is asking about their browsing history, but history access is currently disabled. Kindly remind them in your response that they can enable "History Context" securely in the sidebar tools strip to let you query recent visits.]\n\n`;
      }

      const options: {
        isTor?: boolean;
        torCloudRouting?: boolean;
        files?: Array<{ inlineData: { mimeType: string; data: string } }>;
      } = {
        isTor: isTorTab,
        torCloudRouting,
      };

      if (files && files.length > 0) {
        options.files = files;
      }

      if (contextPrompt) {
        contextPrompt += `[User Prompt]\n${text}`;
        sendMessage(contextPrompt, activeApiKey, options);
      } else {
        sendMessage(text, activeApiKey, options);
      }
    }
  };

  // Sidebar direct Page Summarization action
  const handleSummarizePage = async () => {
    if (!activeId || isLoading) return;
    
    if (activeProvider !== 'local' && !cloudConsentGranted) {
      setPendingCloudAction({ type: 'summarize' });
      setIsCloudConsentOpen(true);
      return;
    }

    setAgentStatus('Reading page for summary...');
    const pageDetails = await getActivePageDetails();
    setAgentStatus('');

    if (pageDetails) {
      handleSendMessage(`Please summarize the following webpage content:
URL: ${pageDetails.currentUrl}
Title: ${pageDetails.title}
Content:
${pageDetails.pageText}`);
    } else {
      handleSendMessage('Summarize this page.');
    }
  };

  const handleWebviewNavigate = useCallback(
    (id: string, url: string) => {
      const normalized = normalizeUrl(url, searchEngine);
      handleUpdateTab(id, { url: normalized });

      const tab = tabs.find(t => t.id === id);
      const title = tab?.title || normalized;
      setTimeout(() => recordHistory(normalized, title), 0);
    },
    [handleUpdateTab, tabs, recordHistory, searchEngine]
  );

  const handleWebviewTitle = useCallback(
    (id: string, title: string) => {
      handleUpdateTab(id, { title });
      const tab = tabs.find(t => t.id === id);
      if (tab) {
        try {
          const saved = localStorage.getItem('gemini-browser-history');
          const historyList = saved ? JSON.parse(saved) : [];
          if (historyList.length > 0 && historyList[0].url === tab.url) {
            historyList[0].title = title;
            localStorage.setItem('gemini-browser-history', JSON.stringify(historyList));
          }
        } catch (e) {
          // ignore
        }
      }
    },
    [handleUpdateTab, tabs]
  );

  const handleWebviewLoading = useCallback(
    (id: string, loading: boolean) => {
      handleUpdateTab(id, { loading });
    },
    [handleUpdateTab]
  );

  const handleWebviewCanGoBack = useCallback(
    (id: string, canGoBack: boolean) => {
      handleUpdateTab(id, { canGoBack });
    },
    [handleUpdateTab]
  );

  const handleWebviewCanGoForward = useCallback(
    (id: string, canGoForward: boolean) => {
      handleUpdateTab(id, { canGoForward });
    },
    [handleUpdateTab]
  );

  const handleAudioStatusChange = useCallback(
    (id: string, isAudible: boolean, isMuted: boolean) => {
      const tab = tabs.find(t => t.id === id);
      const currentVolume = tab?.volume !== undefined ? tab.volume : 1;
      handleUpdateTab(id, { isAudible, isMuted, volume: currentVolume });
    },
    [tabs, handleUpdateTab]
  );

  const handleSetMuted = useCallback(
    (id: string, muted: boolean) => {
      setTabMuted(id, muted);
      handleUpdateTab(id, { isMuted: muted });
    },
    [setTabMuted, handleUpdateTab]
  );

  const handleSetVolume = useCallback(
    (id: string, volume: number) => {
      setTabVolume(id, volume);
      handleUpdateTab(id, { volume });
    },
    [setTabVolume, handleUpdateTab]
  );

  const handleTogglePlayPause = useCallback(
    (id: string) => {
      toggleTabPlayPause(id);
    },
    [toggleTabPlayPause]
  );

  const handleContextMenuAction = useCallback(async (action: ContextMenuAction) => {
    const webview = activeWebview;
    const activeTabData = tabs.find(t => t.id === activeId);

    switch (action.type) {
      case 'back':
        if (activeId) goBack(activeId);
        break;
      case 'forward':
        if (activeId) goForward(activeId);
        break;
      case 'reload':
        if (activeId) reload(activeId);
        break;
      case 'print':
        if (webview) webview.print();
        break;
      case 'inspect': {
        if (webview && action.data) {
          const [ix, iy] = action.data.split(',').map(Number);
          webview.inspectElement(ix, iy);
        }
        break;
      }
      case 'copy':
        if (webview) webview.copy();
        break;
      case 'cut':
        if (webview) webview.cut();
        break;
      case 'paste':
        if (webview) webview.paste();
        break;
      case 'selectAll':
        if (webview) webview.selectAll();
        break;
      case 'openInNewTab':
        if (action.data) handleCreateTab(action.data);
        break;
      case 'openInIncognitoTab':
        if (action.data) handleCreateTab(action.data, true);
        break;
      case 'openImageInNewTab':
        if (action.data) handleCreateTab(action.data);
        break;
      case 'copyLink':
        if (action.data) {
          try { await navigator.clipboard.writeText(action.data); } catch { /* ignore */ }
        }
        break;
      case 'copyImageUrl':
        if (action.data) {
          try { await navigator.clipboard.writeText(action.data); } catch { /* ignore */ }
        }
        break;
      case 'saveImageAs':
      case 'saveVideoAs':
      case 'saveAudioAs':
        if (webview && action.data) webview.downloadURL(action.data);
        break;
      case 'copyVideoUrl':
      case 'copyAudioUrl':
        if (action.data) {
          try { await navigator.clipboard.writeText(action.data); } catch { /* ignore */ }
        }
        break;
      case 'pictureInPicture':
        if (webview) {
          webview.executeJavaScript(`document.querySelector('video')?.requestPictureInPicture()`).catch(() => {});
        }
        break;
      case 'searchGoogle':
        if (action.data) {
          const q = encodeURIComponent(action.data);
          handleCreateTab(`https://www.google.com/search?q=${q}`);
        }
        break;
      case 'googleLensImage':
        if (action.data) {
          handleCreateTab(`https://lens.google.com/uploadbyurl?url=${encodeURIComponent(action.data)}`);
        }
        break;
      case 'googleLensText':
        if (action.data) {
          handleCreateTab(`https://lens.google.com/searchbyimage?image_url=${encodeURIComponent(action.data)}`);
        }
        break;
      case 'copyCleanLink':
        if (action.data) {
          try {
            const clean = action.data.split('?')[0];
            await navigator.clipboard.writeText(clean);
          } catch { /* ignore */ }
        }
        break;
      case 'bookmarkPage':
        if (activeTabData) handleToggleBookmark(activeTabData.url, activeTabData.title);
        break;
      case 'readAloud':
        setIsTTSOpen(true);
        break;
      case 'sharePage':
        if (activeTabData && navigator.share) {
          try {
            await navigator.share({ title: activeTabData.title, url: activeTabData.url });
          } catch { /* user cancelled */ }
        }
        break;
      case 'qrCode':
        if (activeTabData) {
          const qrUrl = `https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent(activeTabData.url)}`;
          handleCreateTab(qrUrl);
        }
        break;
      case 'aiSummarize':
        handleSummarizePage();
        break;
      case 'aiExplain':
        if (action.data) handleSendMessage(`Explain this: ${action.data}`);
        break;
      case 'aiTranslate':
        if (action.data) handleSendMessage(`Translate this to English: ${action.data}`);
        break;
      case 'aiAsk':
        if (action.data) {
          handleSendMessage(`About this: ${action.data}`);
        } else if (activeTabData) {
          handleSendMessage(`About this page: ${activeTabData.title} - ${activeTabData.url}`);
        }
        break;
    }
  }, [activeId, activeWebview, goBack, goForward, reload, handleCreateTab, handleToggleBookmark, handleSendMessage, handleSummarizePage, tabs]);

  const handleContextMenuEvent = useCallback((params: any) => {
    setContextMenu({ visible: true, x: params.x, y: params.y, params });
  }, []);

  const handleCloseContextMenu = useCallback(() => {
    setContextMenu(prev => ({ ...prev, visible: false }));
  }, []);

  return (
    <div className={`app-container theme-${currentPalette}`}>
      {showRestorePrompt && (
        <div className="session-restore-banner animate-in" style={{
          position: 'fixed',
          top: '60px',
          left: '50%',
          transform: 'translateX(-50%)',
          zIndex: 9999,
          background: 'rgba(10, 10, 15, 0.85)',
          backdropFilter: 'blur(20px)',
          WebkitBackdropFilter: 'blur(20px)',
          border: '1px solid rgba(124, 58, 237, 0.3)',
          borderRadius: '12px',
          padding: '12px 20px',
          display: 'flex',
          alignItems: 'center',
          gap: '16px',
          boxShadow: '0 8px 32px rgba(0, 0, 0, 0.5), 0 0 20px rgba(124, 58, 237, 0.15)',
        }}>
          <div style={{ display: 'flex', flexDirection: 'column' }}>
            <span style={{ fontSize: '12px', fontWeight: '600', color: 'var(--text-primary)' }}>
              Restore previous session?
            </span>
            <span style={{ fontSize: '11px', color: 'var(--text-secondary)', marginTop: '2px' }}>
              Would you like to recover your tabs from the last session?
            </span>
          </div>
          <div style={{ display: 'flex', gap: '8px' }}>
            <button
              onClick={handleRestoreSession}
              style={{
                background: 'var(--color-primary)',
                border: 'none',
                color: '#fff',
                fontSize: '11px',
                fontWeight: '600',
                padding: '6px 14px',
                borderRadius: '6px',
                cursor: 'pointer',
                transition: 'opacity 0.2s',
              }}
              onMouseEnter={e => e.currentTarget.style.opacity = '0.9'}
              onMouseLeave={e => e.currentTarget.style.opacity = '1'}
            >
              Restore
            </button>
            <button
              onClick={handleDismissRestore}
              style={{
                background: 'rgba(255, 255, 255, 0.08)',
                border: 'none',
                color: 'var(--text-secondary)',
                fontSize: '11px',
                fontWeight: '600',
                padding: '6px 14px',
                borderRadius: '6px',
                cursor: 'pointer',
                transition: 'background 0.2s',
              }}
              onMouseEnter={e => e.currentTarget.style.background = 'rgba(255, 255, 255, 0.12)'}
              onMouseLeave={e => e.currentTarget.style.background = 'rgba(255, 255, 255, 0.08)'}
            >
              Dismiss
            </button>
          </div>
        </div>
      )}
      {/* Ambient background lightning */}
      <div className="background-lightning-container">
        <div className="lightning-blob blob-1" />
        <div className="lightning-blob blob-2" />
        <div className="lightning-blob blob-3" />
      </div>

      <div className={`browser-main ${tabLayout === 'sidebar' ? 'browser-main-sidebar' : ''}`}>
        <TabBar
          tabs={tabs}
          activeId={activeId}
          onFocusTab={focusTab}
          onCloseTab={handleCloseTab}
          onUpdateTab={handleUpdateTab}
          onCreateTab={handleCreateTab}
          workspaces={workspaces}
          adblockEnabled={adblockEnabled}
          activeWorkspaceId={activeWorkspaceId}
          onSelectWorkspace={setActiveWorkspaceId}
          onAutoGroup={handleAutoGroup}
          tabLayout={tabLayout}
          onSetTabLayout={(layout) => { setTabLayout(layout); storage.setTabLayout(layout); }}
          onOpenSettings={tab => {
            if (tab === 'history') {
              if (activeTab && activeTab.url !== 'about:blank') {
                handleCreateTab('about:history');
              } else {
                handleAddressNavigate('about:history');
              }
            } else {
              setSettingsInitialTab(tab || 'general');
              setIsSettingsOpen(true);
            }
          }}
          onOpenProfile={() => setIsProfileOpen(true)}
          onOpenHUD={() => setIsHUDOpen(true)}
          onOpenDownloads={() => setIsDownloadManagerOpen(true)}
          onOpenPasswords={() => setIsPasswordManagerOpen(true)}
          onToggleAISidebar={() => setIsSidebarOpen(prev => !prev)}
          onToggleTor={handleToggleTor}
          onOpenTorManager={() => setIsTorManagerOpen(true)}
          profilePic={profilePic}
          currentPalette={currentPalette}
          onSelectPalette={setCurrentPalette}
          onNavigate={handleAddressNavigate}
          syncStatus={syncStatus}
          onSetMuted={handleSetMuted}
          onSetVolume={handleSetVolume}
          onTogglePlayPause={handleTogglePlayPause}
          torMode={torMode}
          onTriggerSync={loadCloudSyncData}
          isIncognito={isWindowIncognito}
          onReloadTab={id => reload(id)}
        />

        <div className="browser-chrome">
          <AddressBar
            activeTab={activeTab}
            onNavigate={handleAddressNavigate}
            onGoBack={() => goBack(activeId)}
            onGoForward={() => goForward(activeId)}
            onReload={() => reload(activeId)}
            onBookmark={handleToggleBookmark}
            isBookmarked={!!activeTab && bookmarks.some(b => b.url === activeTab.url)}
            torMode={torMode}
            onToggleTor={handleToggleTor}
            onOpenTorManager={() => setIsTorManagerOpen(true)}
            isIncognito={isWindowIncognito}
            webview={activeWebview}
            onToggleFind={setIsFindOpen}
            isFindOpen={isFindOpen}
            adblockEnabled={adblockEnabled}
            onToggleAdblock={handleToggleAdblock}
            blockedCount={blockedCount}
            detectedScripts={detectedScripts[activeId || ''] || []}
          />
        </div>

        <BookmarkToolbar
          onNavigate={handleAddressNavigate}
          onOpenBookmarks={() => handleCreateTab('about:bookmarks')}
        />

        <WebviewContainer
          tabs={tabs}
          activeId={activeId}
          registerWebview={registerWebview}
          onNavigate={handleWebviewNavigate}
          onTitleChange={handleWebviewTitle}
          onLoadingChange={handleWebviewLoading}
          onCanGoBackChange={handleWebviewCanGoBack}
          onCanGoForwardChange={handleWebviewCanGoForward}
          onAudioStatusChange={handleAudioStatusChange}
          onGoBack={goBack}
          onOpenSettings={tab => {
            if (tab === 'history') {
              if (activeTab && activeTab.url !== 'about:blank') {
                handleCreateTab('about:history');
              } else {
                handleAddressNavigate('about:history');
              }
            } else {
              setSettingsInitialTab(tab || 'general');
              setIsSettingsOpen(true);
            }
          }}
          onOpenProfile={() => setIsProfileOpen(true)}
          onFocusAISidebar={() => {
            setIsSidebarOpen(true);
            localStorage.setItem('isSidebarOpen', 'true');
          }}
          onOpenAIChatWindow={handleOpenAIChatWindow}
          onToggleWorkspaces={() => handleAddressNavigate('about:workspaces')}
          onCreateTab={handleCreateTab}
          onContextMenu={handleContextMenuEvent}
          onUpdateTab={handleUpdateTab}
          onCloseTab={handleCloseTab}
          onFocusTab={focusTab}
          workspaces={workspaces}
          onUpdateWorkspaces={setWorkspaces}
          currentEngine={searchEngine}
          onSelectEngine={engine =>
            setSearchEngine(engine as 'google' | 'duckduckgo' | 'bing' | 'brave')
          }
          onSelectPalette={setCurrentPalette}
          onInlineMenuAction={(action, text) => {
            switch (action) {
              case 'search':
                handleCreateTab(`https://www.google.com/search?q=${encodeURIComponent(text)}`);
                break;
              case 'explain':
                setIsSidebarOpen(true);
                localStorage.setItem('isSidebarOpen', 'true');
                setTimeout(() => handleSendMessage(`Explain this: ${text}`), 100);
                break;
              case 'translate':
                setIsSidebarOpen(true);
                localStorage.setItem('isSidebarOpen', 'true');
                setTimeout(() => handleSendMessage(`Translate this to English: ${text}`), 100);
                break;
              case 'ask':
                setIsSidebarOpen(true);
                localStorage.setItem('isSidebarOpen', 'true');
                setTimeout(() => handleSendMessage(text), 100);
                break;
            }
          }}
          apiKeys={apiKeys}
          activeProvider={activeProvider}
        />
      </div>

      <AISidebar
        isOpen={isSidebarOpen}
        messages={messages}
        isLoading={isLoading}
        onSendMessage={handleSendMessage}
        onClearChat={clearChat}
        includeContext={includeContext}
        onToggleContext={handleToggleContext}
        includeHistory={includeHistory}
        onToggleHistory={handleToggleHistory}
        isAgentMode={isAgentMode}
        onToggleAgentMode={setIsAgentMode}
        onSummarizePage={handleSummarizePage}
        agentStatus={agentStatus}
        agentConfirmAction={agentConfirmAction}
        onAgentConfirmResponse={handleAgentConfirmResponse}
        onAgentUndo={handleAgentUndo}
        canUndo={canUndo}
        onCancelAgent={handleCancelAgent}
        onOpenSettings={() => {
          setSettingsInitialTab('general');
          setIsSettingsOpen(true);
        }}
        onCollapse={() => {
          setIsSidebarOpen(false);
          localStorage.setItem('isSidebarOpen', 'false');
        }}
        geminiError={geminiError}
        onClearGeminiError={clearGeminiError}
        onCreateTab={handleCreateTab}
        activeProvider={activeProvider}
        onCloudAssist={handleCloudAssist}
        isCloudAssistDisabled={isCloudAssistDisabled}
        cloudAssistTooltip={cloudAssistTooltip}
        onOpenCommandCenter={() => setIsCommandCenterOpen(true)}
        onOpenFullDashboard={() => handleCreateTab('about:ai')}
      />

      <CloudConsentModal
        isOpen={isCloudConsentOpen}
        onClose={handleCloudConsentCancel}
        onConfirm={handleCloudConsentConfirm}
      />

      {!isSidebarOpen && (
        <button
          className="sidebar-toggle-trigger"
          onClick={() => {
            setIsSidebarOpen(true);
            localStorage.setItem('isSidebarOpen', 'true');
          }}
          title="Open AI Sidebar (Alt+Space)"
          aria-label="Open AI Sidebar"
          style={{
            position: 'fixed',
            bottom: '22px',
            right: '22px',
            width: '38px',
            height: '38px',
            zIndex: 9990,
            background: 'rgba(14, 14, 20, 0.88)',
            border: '1px solid rgba(212, 175, 55, 0.4)',
            boxShadow: '0 8px 24px rgba(0, 0, 0, 0.65), 0 0 16px rgba(212, 175, 55, 0.25)',
            borderRadius: '50%',
            padding: 0,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: '#f2ca50',
            cursor: 'pointer',
            backdropFilter: 'blur(20px)',
            WebkitBackdropFilter: 'blur(20px)',
            transition: 'all 0.2s cubic-bezier(0.16, 1, 0.3, 1)',
          }}
          onMouseEnter={e => {
            e.currentTarget.style.transform = 'translateY(-2px) scale(1.08)';
            e.currentTarget.style.borderColor = '#f2ca50';
            e.currentTarget.style.boxShadow = '0 12px 32px rgba(0, 0, 0, 0.75), 0 0 24px rgba(212, 175, 55, 0.45)';
          }}
          onMouseLeave={e => {
            e.currentTarget.style.transform = 'translateY(0) scale(1)';
            e.currentTarget.style.borderColor = 'rgba(212, 175, 55, 0.4)';
            e.currentTarget.style.boxShadow = '0 8px 24px rgba(0, 0, 0, 0.65), 0 0 16px rgba(212, 175, 55, 0.25)';
          }}
        >
          <svg
            width="18"
            height="18"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.8"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M12 3c0 4.5-3.5 8-8 8 4.5 0 8 3.5 8 8 0-4.5 3.5-8 8-8-4.5 0-8-3.5-8-8z" fill="rgba(242, 202, 80, 0.15)" />
            <path d="M19 4v3M17.5 5.5h3" strokeWidth="1.5" />
          </svg>
        </button>
      )}

      <SettingsModal
        isOpen={isSettingsOpen}
        onClose={() => setIsSettingsOpen(false)}
        currentEngine={searchEngine}
        onSelectEngine={handleSelectEngine}
        apiKeys={apiKeys}
        onSaveApiKeys={handleSaveApiKeys}
        activeProvider={activeProvider}
        onSelectProvider={handleSelectProvider}
        currentPalette={currentPalette}
        onSelectPalette={setCurrentPalette}
        onNavigate={handleAddressNavigate}
        initialTab={settingsInitialTab}
        contextMenuSettings={contextMenuSettings}
        onContextMenuSettingsChange={handleContextMenuSettingsChange}
        tabLayout={tabLayout}
        onTabLayoutChange={(layout) => { setTabLayout(layout); storage.setTabLayout(layout); }}
      />

      <AgentCommandCenterModal
        isOpen={isCommandCenterOpen}
        onClose={() => setIsCommandCenterOpen(false)}
        onRunSkillGoal={handleSendMessage}
      />

      <AIChatWindowModal
        isOpen={isAIChatWindowOpen}
        onClose={() => setIsAIChatWindowOpen(false)}
        initialPrompt={aiChatInitialPrompt}
        initialFiles={aiChatInitialFiles}
        onSendMessage={handleSendMessage}
        messages={messages}
        isLoading={isLoading}
        onClearChat={clearChat}
        onOpenSettings={tab => {
          setSettingsInitialTab(tab || 'models');
          setIsSettingsOpen(true);
        }}
        onOpenCommandCenter={() => setIsCommandCenterOpen(true)}
        activeTabTitle={activeTab?.title}
        activeTabUrl={activeTab?.url}
        apiKeys={apiKeys}
      />

      <ProfileModal
        isOpen={isProfileOpen}
        onClose={() => setIsProfileOpen(false)}
        onSave={setProfilePic}
      />

      <DownloadManager
        isOpen={isDownloadManagerOpen}
        onClose={() => setIsDownloadManagerOpen(false)}
        onOpenFullDownloadsPage={() => {
          if (activeTab && (activeTab.url === 'about:blank' || activeTab.url === '')) {
            handleAddressNavigate('about:downloads');
          } else {
            handleCreateTab('about:downloads');
          }
        }}
      />

      <PasswordManager
        isOpen={isPasswordManagerOpen}
        onClose={() => setIsPasswordManagerOpen(false)}
      />

      <TorManager
        isOpen={isTorManagerOpen}
        onClose={() => setIsTorManagerOpen(false)}
        onToggleTorMode={handleToggleTor}
        torMode={torMode}
        onRunLeakTest={() => {
          handleCreateTab('https://dnsleaktest.com');
          setIsTorManagerOpen(false);
        }}
      />

      <SiteDataManager
        isOpen={isSiteDataManagerOpen}
        onClose={() => setIsSiteDataManagerOpen(false)}
        webview={activeWebview}
      />

      <ReaderMode
        isOpen={isReaderModeOpen}
        onClose={() => setIsReaderModeOpen(false)}
        webview={activeWebview}
      />

      <TextToSpeech
        isOpen={isTTSOpen}
        onClose={() => setIsTTSOpen(false)}
        webview={activeWebview}
      />

      <CommandHUD
        isOpen={isHUDOpen}
        onClose={() => setIsHUDOpen(false)}
        tabs={tabs}
        activeId={activeId}
        onFocusTab={focusTab}
        onCloseTab={handleCloseTab}
        onCreateTab={handleCreateTab}
        onSummarizePage={handleSummarizePage}
        includeContext={includeContext}
        onToggleContext={setIncludeContext}
        isAgentMode={isAgentMode}
        onToggleAgentMode={setIsAgentMode}
        onClearChat={clearChat}
        onOpenSettings={() => {
          setSettingsInitialTab('general');
          setIsSettingsOpen(true);
        }}
        onNavigate={handleAddressNavigate}
      />

      {isTabSearchOpen && (
        <TabSearch
          tabs={tabs}
          activeId={activeId}
          onSelectTab={id => {
            focusTab(id);
            const tab = tabs.find(t => t.id === id);
            if (tab) {
              navigateToUrl(tab.url === 'about:blank' ? '' : tab.url);
            }
          }}
          onClose={() => setIsTabSearchOpen(false)}
        />
      )}

      {contextMenu.visible && (
        <ContextMenu
          x={contextMenu.x}
          y={contextMenu.y}
          items={buildWebviewMenuItems(
            contextMenu.params,
            activeTab?.canGoBack ?? false,
            activeTab?.canGoForward ?? false,
            contextMenuSettings
          )}
          onClose={handleCloseContextMenu}
          onAction={handleContextMenuAction}
        />
      )}
    </div>
  );
}
