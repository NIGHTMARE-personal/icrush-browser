export interface Tab {
  id: string;
  url: string;
  title: string;
  loading: boolean;
  canGoBack: boolean;
  canGoForward: boolean;
  isAudible?: boolean;
  isMuted?: boolean;
  volume?: number;
  isSuspended?: boolean;
  lastActiveTime?: number;
  torMode?: boolean;
  torSessionId?: string;
  isIncognito?: boolean;
  loadTimeMs?: number;
  isPinned?: boolean;
}

export interface AttachedMedia {
  name: string;
  mimeType: string;
  data: string;
  size?: number;
}

export interface WebCitation {
  title: string;
  url: string;
  snippet?: string;
}

export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  isStreaming?: boolean;
  isError?: boolean;
  timestamp?: number;
  modelId?: string;
  provider?: string;
  reasoning?: string;
  citations?: WebCitation[];
  files?: AttachedMedia[];
}

export interface ChatSession {
  id: string;
  title: string;
  createdAt: number;
  updatedAt: number;
  messages: ChatMessage[];
  modelId: string;
  provider: string;
  gemId?: string;
  isPinned?: boolean;
}

export interface ChatAISettings {
  fontFamily: 'serif' | 'sans' | 'mono' | 'georgia' | 'nunito';
  fontSize: 'compact' | 'standard' | 'large' | 'editorial';
  backgroundTint: 'warm-cream' | 'ivory-parchment' | 'crisp-sand' | 'soft-alabaster' | 'warm-linen';
  temperature: number;
  reasoningDepth: 'standard' | 'deep' | 'maximum';
  bubbleDensity: 'minimal' | 'cards';
  webGroundingDefault: boolean;
}

const DEFAULT_AI_SETTINGS: ChatAISettings = {
  fontFamily: 'serif',
  fontSize: 'standard',
  backgroundTint: 'warm-cream',
  temperature: 0.7,
  reasoningDepth: 'deep',
  bubbleDensity: 'minimal',
  webGroundingDefault: false,
};

interface CustomModel {
  id: string;
  name: string;
  description?: string;
  provider?: string;
  isLocal?: boolean;
}

interface ApiKeys {
  [key: string]: string;
}

const STORAGE_KEYS = {
  TABS: 'gemini-browser-tabs',
  ACTIVE_TAB_ID: 'gemini-browser-active-tab-id',
  SEARCH_ENGINE: 'gemini-browser-search-engine',
  CHAT_HISTORY: 'gemini-browser-chat-history',
  CHAT_SESSIONS: 'gemini-browser-chat-sessions',
  ACTIVE_CHAT_SESSION_ID: 'gemini-browser-active-chat-session-id',
  CHAT_AI_SETTINGS: 'gemini-browser-chat-ai-settings',
  ACTIVE_MODEL: 'gemini-browser-active-model',
  ACTIVE_PROVIDER: 'gemini-browser-active-provider',
  CUSTOM_MODELS: 'gemini-browser-custom-models',
  API_KEYS: 'gemini-browser-api-keys',
} as const;

export const storage = {
  getTabs: (): Tab[] => {
    try {
      const data = localStorage.getItem(STORAGE_KEYS.TABS);
      return data ? JSON.parse(data) : [];
    } catch (e) {
      console.error('Failed to load tabs from localStorage:', e);
      return [];
    }
  },

  setTabs: (tabs: Tab[]): void => {
    try {
      localStorage.setItem(STORAGE_KEYS.TABS, JSON.stringify(tabs));
    } catch (e) {
      console.error('Failed to save tabs to localStorage:', e);
    }
  },

  getActiveTabId: (): string | null => {
    return localStorage.getItem(STORAGE_KEYS.ACTIVE_TAB_ID);
  },

  setActiveTabId: (id: string | null): void => {
    if (id) {
      localStorage.setItem(STORAGE_KEYS.ACTIVE_TAB_ID, id);
    } else {
      localStorage.removeItem(STORAGE_KEYS.ACTIVE_TAB_ID);
    }
  },

  getSearchEngine: (): string => {
    return localStorage.getItem(STORAGE_KEYS.SEARCH_ENGINE) || 'google';
  },

  setSearchEngine: (engine: string): void => {
    localStorage.setItem(STORAGE_KEYS.SEARCH_ENGINE, engine);
  },

  getChatHistory: (): ChatMessage[] => {
    try {
      const data = localStorage.getItem(STORAGE_KEYS.CHAT_HISTORY);
      return data ? JSON.parse(data) : [];
    } catch (e) {
      console.error('Failed to load chat history from localStorage:', e);
      return [];
    }
  },

  setChatHistory: (history: ChatMessage[]): void => {
    try {
      localStorage.setItem(STORAGE_KEYS.CHAT_HISTORY, JSON.stringify(history));
    } catch (e) {
      console.error('Failed to save chat history to localStorage:', e);
    }
  },

  getChatSessions: (): ChatSession[] => {
    try {
      const data = localStorage.getItem(STORAGE_KEYS.CHAT_SESSIONS);
      if (data) {
        const parsed = JSON.parse(data);
        if (Array.isArray(parsed)) return parsed;
      }
      // Migrate from single chat history if present
      const legacyHistory = storage.getChatHistory();
      if (legacyHistory.length > 0) {
        const initialSession: ChatSession = {
          id: 'session-default-1',
          title: legacyHistory[0]?.content?.slice(0, 36) || 'General Research & Synthesis',
          createdAt: Date.now() - 3600000,
          updatedAt: Date.now(),
          messages: legacyHistory,
          modelId: storage.getActiveModelId(),
          provider: storage.getActiveProvider(),
          gemId: 'researcher',
          isPinned: false,
        };
        localStorage.setItem(STORAGE_KEYS.CHAT_SESSIONS, JSON.stringify([initialSession]));
        return [initialSession];
      }
      return [];
    } catch (e) {
      console.error('Failed to load chat sessions:', e);
      return [];
    }
  },

  setChatSessions: (sessions: ChatSession[]): void => {
    try {
      localStorage.setItem(STORAGE_KEYS.CHAT_SESSIONS, JSON.stringify(sessions));
    } catch (e) {
      console.error('Failed to save chat sessions:', e);
    }
  },

  getActiveChatSessionId: (): string | null => {
    return localStorage.getItem(STORAGE_KEYS.ACTIVE_CHAT_SESSION_ID);
  },

  setActiveChatSessionId: (id: string | null): void => {
    if (id) {
      localStorage.setItem(STORAGE_KEYS.ACTIVE_CHAT_SESSION_ID, id);
    } else {
      localStorage.removeItem(STORAGE_KEYS.ACTIVE_CHAT_SESSION_ID);
    }
  },

  getChatAISettings: (): ChatAISettings => {
    try {
      const data = localStorage.getItem(STORAGE_KEYS.CHAT_AI_SETTINGS);
      return data ? { ...DEFAULT_AI_SETTINGS, ...JSON.parse(data) } : DEFAULT_AI_SETTINGS;
    } catch {
      return DEFAULT_AI_SETTINGS;
    }
  },

  setChatAISettings: (settings: Partial<ChatAISettings>): void => {
    try {
      const current = storage.getChatAISettings();
      const updated = { ...current, ...settings };
      localStorage.setItem(STORAGE_KEYS.CHAT_AI_SETTINGS, JSON.stringify(updated));
    } catch (e) {
      console.error('Failed to save AI chat settings:', e);
    }
  },

  getActiveModelId: (): string => {
    return localStorage.getItem(STORAGE_KEYS.ACTIVE_MODEL) || 'gemini-2.5-flash';
  },

  setActiveModelId: (modelId: string): void => {
    localStorage.setItem(STORAGE_KEYS.ACTIVE_MODEL, modelId);
  },

  getCustomModels: (): CustomModel[] => {
    try {
      const data = localStorage.getItem(STORAGE_KEYS.CUSTOM_MODELS);
      return data ? JSON.parse(data) : [];
    } catch (e) {
      return [];
    }
  },

  setCustomModels: (models: CustomModel[]): void => {
    localStorage.setItem(STORAGE_KEYS.CUSTOM_MODELS, JSON.stringify(models));
  },

  getApiKeys: async (): Promise<ApiKeys> => {
    try {
      if (window.electronAPI?.apiKeys) {
        return await window.electronAPI.apiKeys.getAll();
      }
      const data = localStorage.getItem(STORAGE_KEYS.API_KEYS);
      return data ? JSON.parse(data) : {};
    } catch (e) {
      return {};
    }
  },

  setApiKeys: async (keys: ApiKeys): Promise<void> => {
    try {
      if (window.electronAPI?.apiKeys) {
        await window.electronAPI.apiKeys.setAll(keys);
        return;
      }
      localStorage.setItem(STORAGE_KEYS.API_KEYS, JSON.stringify(keys));
    } catch (e) {
      console.error('Failed to save API keys:', e);
    }
  },

  getApiKey: (): string => {
    return localStorage.getItem('gemini-browser-api-key') || '';
  },

  setApiKey: (key: string): void => {
    localStorage.setItem('gemini-browser-api-key', key);
  },

  getActiveProvider: (): string => {
    return localStorage.getItem('gemini-browser-active-provider') || 'local';
  },

  setActiveProvider: (provider: string): void => {
    localStorage.setItem('gemini-browser-active-provider', provider);
  },

  getContextMenuSettings: (): ContextMenuSettings => {
    try {
      const data = localStorage.getItem('gemini-browser-context-menu-settings');
      return data ? JSON.parse(data) : DEFAULT_CONTEXT_MENU_SETTINGS;
    } catch {
      return { ...DEFAULT_CONTEXT_MENU_SETTINGS };
    }
  },

  setContextMenuSettings: (settings: ContextMenuSettings): void => {
    localStorage.setItem('gemini-browser-context-menu-settings', JSON.stringify(settings));
  },

  getTabLayout: (): 'top' | 'sidebar' => {
    return (localStorage.getItem('gemini-browser-tab-layout') as 'top' | 'sidebar') || 'top';
  },

  setTabLayout: (layout: 'top' | 'sidebar'): void => {
    localStorage.setItem('gemini-browser-tab-layout', layout);
  },
};

export interface ContextMenuSettings {
  showNavigation: boolean;
  showLinkActions: boolean;
  showMediaActions: boolean;
  showEditActions: boolean;
  showSelectionActions: boolean;
  showPageActions: boolean;
  showAIActions: boolean;
  showDebugActions: boolean;
}

const DEFAULT_CONTEXT_MENU_SETTINGS: ContextMenuSettings = {
  showNavigation: true,
  showLinkActions: true,
  showMediaActions: true,
  showEditActions: true,
  showSelectionActions: true,
  showPageActions: true,
  showAIActions: true,
  showDebugActions: true,
};

// Session storage for tab state restoration
export const sessionStorageUtil = {
  saveTabState: (
    tabId: string,
    state: { scrollX: number; scrollY: number; formData?: Record<string, string> }
  ): void => {
    try {
      const key = `gemini-browser-tab-state-${tabId}`;
      sessionStorage.setItem(key, JSON.stringify(state));
    } catch (e) {
      console.error('Failed to save tab state:', e);
    }
  },

  getTabState: (
    tabId: string
  ): { scrollX: number; scrollY: number; formData?: Record<string, string> } | null => {
    try {
      const key = `gemini-browser-tab-state-${tabId}`;
      const data = sessionStorage.getItem(key);
      return data ? JSON.parse(data) : null;
    } catch (e) {
      return null;
    }
  },

  clearTabState: (tabId: string): void => {
    try {
      const key = `gemini-browser-tab-state-${tabId}`;
      sessionStorage.removeItem(key);
    } catch (e) {
      console.error('Failed to clear tab state:', e);
    }
  },

  saveSession: (tabs: Tab[], activeTabId: string | null): void => {
    try {
      const session = {
        tabs: tabs.map(t => ({ id: t.id, url: t.url, title: t.title })),
        activeTabId,
        timestamp: Date.now(),
      };
      localStorage.setItem('gemini-browser-session', JSON.stringify(session));
    } catch (e) {
      console.error('Failed to save session:', e);
    }
  },

  getSession: (): {
    tabs: Array<{ id: string; url: string; title: string }>;
    activeTabId: string | null;
    timestamp: number;
  } | null => {
    try {
      const data = localStorage.getItem('gemini-browser-session');
      return data ? JSON.parse(data) : null;
    } catch (e) {
      return null;
    }
  },

  clearSession: (): void => {
    localStorage.removeItem('gemini-browser-session');
  },
};
