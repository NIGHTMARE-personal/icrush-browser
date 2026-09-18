import { contextBridge, ipcRenderer, IpcRendererEvent } from 'electron';
import type {
  MCPServerConfig,
  MCPTool,
  MCPToolCallResult,
  EncryptedMemoryEntry,
  VaultStats,
  AgentRecordedAction,
  AgentUndoResult,
  SensitiveActionPrompt,
  SensitiveActionDecision,
  AgentAuditEvent,
  AgentPermissionTier,
  AgentPolicyStore,
  SiteAgentPolicy,
} from '../shared/agent-contracts';

interface TabInfo {
  id: string;
  title: string;
  url: string;
}

interface WorkspaceGroup {
  name: string;
  color: string;
  tabIds: string[];
}

interface AgentStepData {
  goal: string;
  stepNumber: number;
  currentUrl: string;
  pageText: string;
  pageLinks: Array<{ text: string; url: string }>;
  history: string;
}

interface AgentDecision {
  thought: string;
  action: 'navigate' | 'search' | 'finish' | 'click' | 'type' | 'scroll' | 'extract' | 'fill_form' | 'select' | 'press_key';
  url?: string;
  query?: string;
  answer?: string;
  selector?: string;
  text?: string;
  value?: string;
  direction?: string;
  amount?: number;
  keys?: string;
  formFields?: Array<{ selector: string; value: string }>;
}

interface AgentActionRequest {
  type: string;
  selector?: string;
  text?: string;
  value?: string;
  direction?: string;
  amount?: number;
  keys?: string;
  formFields?: Array<{ selector: string; value: string }>;
  url?: string;
  approvedPromptId?: string;
  actor?: string;
}

interface AgentActionResult {
  success: boolean;
  output?: string;
  error?: string;
  extractedData?: string;
  jsCode?: string;
  blocked?: boolean;
  requiresApproval?: boolean;
  promptId?: string;
  approved?: boolean;
  tier?: AgentPermissionTier;
  reasons?: string[];
}

interface Skill {
  id: string;
  name: string;
  description: string;
  goal: string;
  steps: string;
  createdAt: number;
}

interface BrowserCommand {
  action: 'navigate' | 'search' | 'goBack' | 'goForward' | 'refresh' | 'newTab' | 'closeTab' | 'type' | 'click' | 'fill' | 'extract' | 'press' | 'openHtml';
  url?: string;
  query?: string;
  selector?: string;
  text?: string;
  value?: string;
  key?: string;
  html?: string;
}

interface GeminiErrorInfo {
  shouldRetry: boolean;
  retryAfter?: number;
}

interface ExtensionMetadata {
  id: string;
  name: string;
  version: string;
  path: string;
  enabled: boolean;
}

interface ExtensionTrustReport {
  name: string;
  version: string;
  manifestVersion: number;
  permissions: string[];
  hostPermissions: string[];
  riskLevel: 'low' | 'elevated' | 'high' | 'blocked';
  findings: string[];
}

export interface SiteShields {
  shieldsUp: boolean;
  blockTrackers: 'standard' | 'aggressive' | 'off';
  upgradeHttps: boolean;
  blockScripts: boolean;
  allowFirstPartyScripts: boolean;
  blockedScripts: string[];
  allowedScripts: string[];
  blockedDomains: string[];
  allowedDomains: string[];
  blockFingerprinting: boolean;
  fingerprintingProtections: {
    canvas: boolean;
    audio: boolean;
    webgl: boolean;
    hardwareConcurrency: boolean;
    deviceMemory: boolean;
    webrtc: boolean;
    font: boolean;
  };
  blockCookies: 'third-party' | 'all' | 'none';
  forgetMe: boolean;
}

export interface ShieldStats {
  trackersBlocked: number;
  scriptsBlocked: number;
  httpsUpgrades: number;
  fingerprintsFoiled: number;
}

export interface DetectedScript {
  url: string;
  domain: string;
  origin: string;
  category: 'first-party' | 'tracker' | 'cdn' | 'third-party';
  status: 'blocked' | 'allowed';
  timestamp: number;
}

export interface ShieldUpdateEvent {
  domain: string;
  shields: SiteShields;
  stats: ShieldStats;
  detectedScripts: DetectedScript[];
}

export interface SecuritySettings {
  safeBrowsingEnabled: boolean;
  downloadScanningEnabled: boolean;
  useEnhancedProtection: boolean;
}

export interface ScanResult {
  status: 'safe' | 'danger' | 'unverified' | 'scanning';
  details?: string;
  maliciousCount?: number;
  suspiciousCount?: number;
}

interface DownloadItem {
  id: string;
  url: string;
  filename: string;
  totalBytes: number;
  receivedBytes: number;
  state: 'progressing' | 'completed' | 'cancelled' | 'interrupted';
  startTime: number;
  endTime?: number;
  savePath: string;
  mimeType: string;
  scanResult?: ScanResult;
  priority?: 'high' | 'medium' | 'low';
  fileMissing?: boolean;
}

interface PasswordEntry {
  id: string;
  url: string;
  username: string;
  password: string;
  title?: string;
  notes?: string;
  createdAt: number;
  updatedAt: number;
  category?: string;
}

export interface BridgeConfig {
  type: 'obfs4' | 'snowflake' | 'meek';
  address: string;
  port: number;
  fingerprint?: string;
  cert?: string;
  iatMode?: number;
}

export interface TorStatus {
  connected: boolean;
  ip: string;
  circuit: string;
  bootstrap: number;
  bandwidth: {
    read: number;
    write: number;
    total: number;
  };
  latency: number;
  circuitDetails: Array<{
    id: string;
    type: 'entry' | 'middle' | 'exit';
    fingerprint: string;
    nickname: string;
    address: string;
    port: number;
    country: string;
    bandwidth: number;
    uptime: number;
  }>;
  bridges?: BridgeConfig[];
  useBridges?: boolean;
  bridgeType?: string;
}

interface VPNStatus {
  connected: boolean;
  serverName: string;
  serverLatency: number;
  bandwidth: { up: number; down: number; total: number };
  interfaceName: string;
  localIP: string;
  endpointIP: string;
  lastHandshake: number;
}

interface VPNConfigData {
  privateKey: string;
  address: string;
  dns: string[];
  mtu: number;
  peers: Array<{
    publicKey: string;
    endpoint: string;
    allowedIps: string;
    persistentKeepalive: number;
  }>;
}

interface Cookie {
  name: string;
  value: string;
  domain: string;
  path: string;
  expires: number;
  httpOnly: boolean;
  secure: boolean;
  sameSite: 'unspecified' | 'no_restriction' | 'lax' | 'strict';
  url?: string;
  expirationDate?: number;
  session?: boolean;
}

interface HistoryEntry {
  id: string;
  url: string;
  title: string;
  timestamp: number;
}

export interface UpdaterState {
  status: 'idle' | 'checking' | 'available' | 'downloading' | 'downloaded' | 'up-to-date' | 'unavailable' | 'error';
  enabled: boolean;
  appVersion: string;
  version?: string;
  progress?: number;
  error?: string;
  lastChecked?: number;
}

interface BookmarkEntry {
  id: string;
  url: string;
  title: string;
  folderId?: string;
  createdAt: number;
  updatedAt: number;
}

interface ElectronAPI {
  sendGeminiMessage: (
    message: string,
    history: Array<{ role: string; content: string }>,
    activeProvider?: string,
    customApiKey?: string,
    options?: {
      isTor?: boolean;
      forceLocal?: boolean;
      torCloudRouting?: boolean;
      files?: Array<{ inlineData: { mimeType: string; data: string } }>;
      systemInstruction?: string;
      modelName?: string;
    }
  ) => void;
  requestCloudPlan: (payload: { prompt: string; provider: string; apiKey: string }) => Promise<string>;
  onGeminiResponse: (callback: (text: string) => void) => () => void;
  onGeminiDone: (callback: () => void) => () => void;
  onGeminiError: (callback: (error: string, info?: GeminiErrorInfo) => void) => () => void;
  onExecuteCommand: (callback: (commands: BrowserCommand[]) => void) => () => void;
  groupTabs: (
    tabsList: TabInfo[],
    customApiKey?: string,
    activeProvider?: string,
    category?: string
  ) => Promise<WorkspaceGroup[]>;
  toggleFullscreen?: () => Promise<void>;
  executeAgentStep: (
    stepData: AgentStepData,
    customApiKey?: string,
    activeProvider?: string
  ) => Promise<AgentDecision>;
  agent: {
    execute: (action: AgentActionRequest) => Promise<AgentActionResult>;
    extractPage: () => Promise<string>;
    getMemory: () => Promise<Record<string, string>>;
    setMemory: (key: string, value: string, category?: EncryptedMemoryEntry['category']) => Promise<boolean>;
    deleteMemory: (key: string) => Promise<boolean>;
    getMemoryStats: () => Promise<VaultStats>;
    recordAction: (actionReq: {
      stepNumber: number;
      goal: string;
      url: string;
      action: AgentRecordedAction['action'];
    }) => Promise<AgentRecordedAction>;
    undoLastAction: () => Promise<AgentUndoResult>;
    getUndoHistory: () => Promise<AgentRecordedAction[]>;
    clearUndoHistory: () => Promise<boolean>;
    getSkills: () => Promise<Skill[]>;
    saveSkill: (skill: Omit<Skill, 'id' | 'createdAt'>) => Promise<Skill>;
    deleteSkill: (id: string) => Promise<boolean>;
    runSkill: (skillId: string) => Promise<AgentDecision>;
    detectSensitiveFields: () => Promise<{ jsCode: string }>;
    highlight: (selector: string, color?: string, duration?: number) => Promise<{ jsCode: string }>;
    tooltip: (selector: string, text: string, color?: string) => Promise<{ jsCode: string }>;
    clickRipple: (x: number, y: number, color?: string) => Promise<{ jsCode: string }>;
    getPolicy: () => Promise<AgentPolicyStore>;
    setSitePolicy: (policy: { domain: string; maxTier: AgentPermissionTier; allowSensitive: boolean }) => Promise<SiteAgentPolicy>;
    getAuditLog: () => Promise<AgentAuditEvent[]>;
    clearAuditLog: () => Promise<boolean>;
    checkNavigation: (fromUrl: string, toUrl: string) => Promise<{ crosses: boolean; reasons: string[] }>;
    onAuditEvent: (callback: (event: AgentAuditEvent) => void) => () => void;
  };
  mcp: {
    listTools: () => Promise<MCPTool[]>;
    callTool: (toolId: string, params: Record<string, unknown>) => Promise<MCPToolCallResult>;
    getServers: () => Promise<MCPServerConfig[]>;
    configureServer: (config: MCPServerConfig) => Promise<boolean>;
    startOAuth: (serverId: string) => Promise<{ authUrl: string; state: string }>;
    oauthCallback: (code: string, serverId: string) => Promise<boolean>;
    refreshToken: (serverId: string) => Promise<boolean>;
    getAuthStatus: (serverId: string) => Promise<{ authenticated: boolean; scopes: string[] }>;
  };
  sensitiveFields: {
    confirmAction: (decision: SensitiveActionDecision) => Promise<boolean>;
    onPrompt: (callback: (prompt: SensitiveActionPrompt) => void) => () => void;
  };
  subAgent: {
    create: (parentAgentId: string, goal: string) => Promise<string>;
    get: (agentId: string) => Promise<{ id: string; parentAgentId: string; status: string; goal: string; result?: string; error?: string; startedAt: number; completedAt?: number } | undefined>;
    getByParent: (parentId: string) => Promise<Array<{ id: string; parentAgentId: string; status: string; goal: string }>>;
    getAll: () => Promise<Array<{ id: string; parentAgentId: string; status: string; goal: string }>>;
    getStats: () => Promise<{ total: number; running: number; completed: number; failed: number; queued: number }>;
    cancel: (agentId: string) => Promise<boolean>;
  };
  scheduler: {
    addTask: (name: string, goal: string, cronExpression: string) => Promise<string>;
    removeTask: (taskId: string) => Promise<boolean>;
    updateTask: (taskId: string, updates: Record<string, unknown>) => Promise<boolean>;
    enableTask: (taskId: string) => Promise<boolean>;
    disableTask: (taskId: string) => Promise<boolean>;
    getTask: (taskId: string) => Promise<{ id: string; name: string; goal: string; cronExpression: string; enabled: boolean; lastRun?: number; nextRun: number; createdAt: number } | undefined>;
    getAllTasks: () => Promise<Array<{ id: string; name: string; goal: string; cronExpression: string; enabled: boolean; lastRun?: number; nextRun: number }>>;
    runNow: (taskId: string) => Promise<boolean>;
  };
  getCloudPlan: (prompt: string, provider: string, apiKey: string) => Promise<string>;
  synthesizeResearch: (topic: string, dataOrQuery: string, provider: string, apiKey: string) => Promise<string>;
  extensions: {
    selectDirectory: () => Promise<string | null>;
    loadExtension: (path: string) => Promise<ExtensionMetadata>;
    removeExtension: (id: string) => Promise<void>;
    toggleExtension: (id: string, enabled: boolean) => Promise<ExtensionMetadata[]>;
    getExtensions: () => Promise<ExtensionMetadata[]>;
    installFromUrl: (url: string, opts?: { approvedReportId?: string }) => Promise<ExtensionMetadata>;
    analyzeUrl: (url: string) => Promise<{ reportId: string; report: ExtensionTrustReport }>;
  };
  news: {
    fetchFeed: (category: string) => Promise<Array<{ id: string; title: string; source: string; url: string; timeAgo: string; category: string }>>;
  };
  downloads: {
    getAll: () => Promise<DownloadItem[]>;
    pause: (id: string) => Promise<boolean>;
    cancel: (id: string) => Promise<boolean>;
    retry: (id: string) => Promise<boolean>;
    showInFolder: (id: string) => Promise<void>;
    open: (id: string) => Promise<void>;
    remove: (id: string) => Promise<boolean>;
    clearCompleted: () => Promise<boolean>;
    getSaveDir: () => Promise<string>;
    setSaveDir: (dir: string) => Promise<boolean>;
    setPriority: (id: string, priority: 'high' | 'medium' | 'low') => Promise<boolean>;
    onCreated: (callback: (download: DownloadItem) => void) => () => void;
    onUpdated: (callback: (download: Partial<DownloadItem> & { id: string }) => void) => () => void;
  };
  passwords: {
    hasMaster: () => Promise<boolean>;
    setMaster: (password: string) => Promise<boolean>;
    unlock: (password: string) => Promise<boolean>;
    lock: () => Promise<boolean>;
    isUnlocked: () => Promise<boolean>;
    getAll: () => Promise<Omit<PasswordEntry, 'password'>[]>;
    getEntry: (id: string) => Promise<PasswordEntry | null>;
    add: (
      entry: Omit<PasswordEntry, 'id' | 'createdAt' | 'updatedAt'>
    ) => Promise<Omit<PasswordEntry, 'password'>>;
    update: (
      id: string,
      updates: Partial<PasswordEntry>
    ) => Promise<Omit<PasswordEntry, 'password'>>;
    delete: (id: string) => Promise<boolean>;
    generate: (length?: number) => Promise<string>;
    import: (data: string) => Promise<number>;
    export: () => Promise<string>;
    changeMaster: (current: string, newPassword: string) => Promise<boolean>;
    encryptSyncData: (plaintext: string) => Promise<string>;
    decryptSyncData: (ciphertext: string) => Promise<string>;
  };
  tor: {
    getStatus: () => Promise<TorStatus>;
    connect: () => Promise<{ success: boolean; error?: string }>;
    disconnect: () => Promise<boolean>;
    cancelConnect: () => Promise<void>;
    newCircuit: () => Promise<void>;
    registerPartition: (partition: string) => Promise<boolean>;
    unregisterPartition: (partition: string) => Promise<void>;
    onStatusChange: (callback: (status: TorStatus) => void) => () => void;
    onConnectionFailed: (callback: (error: string) => void) => () => void;
    isTorMode: () => Promise<boolean>;
    setTorMode: (enabled: boolean) => Promise<void>;
    addBridge: (bridge: BridgeConfig) => Promise<void>;
    removeBridge: (address: string) => Promise<void>;
    setBridges: (bridges: BridgeConfig[]) => Promise<void>;
    setBridgeType: (type: 'obfs4' | 'snowflake' | 'none') => Promise<void>;
    setUseBridges: (enabled: boolean) => Promise<void>;
    getBridgeType: () => Promise<'obfs4' | 'snowflake' | 'none'>;
    isUsingBridges: () => Promise<boolean>;
    getBridgesList: () => Promise<BridgeConfig[]>;
    isOnionAddress: (url: string) => Promise<boolean>;
    ensureOnionUrl: (url: string) => Promise<string>;
    fetchBridges: (transport: 'obfs4' | 'snowflake') => Promise<Array<{type: 'obfs4' | 'snowflake' | 'meek'; address: string; port: number; fingerprint: string; cert?: string; iatMode?: number}>>;
    syncBinaries: () => Promise<void>;
    shouldUseTor: (url: string, torMode: boolean) => Promise<boolean>;
  };
  security: {
    getSettings: () => Promise<SecuritySettings>;
    updateSettings: (updates: Partial<SecuritySettings>) => Promise<SecuritySettings>;
    getApiKey: () => Promise<string>;
    setApiKey: (key: string) => Promise<boolean>;
    bypassUrl: (url: string) => Promise<boolean>;
    scanFile: (downloadId: string, filePath: string, filename: string) => Promise<ScanResult>;
  };
  adblocker: {
    toggle: (enabled: boolean) => Promise<boolean>;
    isEnabled: () => Promise<boolean>;
    getBlockedCount: () => Promise<number>;
    resetCount: () => Promise<number>;
    onCountUpdated: (callback: (count: number) => void) => () => void;
  };
  session: {
    getCookies: (partition?: string) => Promise<Cookie[]>;
    deleteCookie: (url: string, name: string, partition?: string) => Promise<boolean>;
    clearData: (origin: string, partition?: string) => Promise<boolean>;
    purgeIncognito: (partition: string) => Promise<boolean>;
  };
  vpn: {
    getStatus: () => Promise<VPNStatus>;
    importConfig: (rawConfig: string) => Promise<{ success: boolean; config?: VPNConfigData; error?: string }>;
    getConfig: () => Promise<{ raw: string; parsed: VPNConfigData | null }>;
    clearConfig: () => Promise<boolean>;
    connect: () => Promise<boolean>;
    disconnect: () => Promise<boolean>;
    isModeEnabled: () => Promise<boolean>;
    setModeEnabled: (enabled: boolean) => Promise<boolean>;
    isKillSwitchEnabled: () => Promise<boolean>;
    setKillSwitchEnabled: (enabled: boolean) => Promise<boolean>;
    onStatusChange: (callback: (status: VPNStatus) => void) => () => void;
    onConnectionFailed: (callback: (error: string) => void) => () => void;
  };
  shields: {
    getSiteShields: (domain: string) => Promise<SiteShields>;
    updateSiteShields: (domain: string, updates: Partial<SiteShields>) => Promise<SiteShields>;
    getStats: (domain: string) => Promise<ShieldStats>;
    getDetectedScripts: (domain: string) => Promise<DetectedScript[]>;
    updateScriptRule: (domain: string, scriptUrl: string, action: 'block' | 'allow' | 'default') => Promise<boolean>;
    updateDomainRule: (domain: string, targetDomain: string, action: 'block' | 'allow' | 'default') => Promise<boolean>;
    updateBlockedScripts: (domain: string, blockedUrls: string[]) => Promise<boolean>;
    recordScript: (domain: string, scriptUrl: string, blocked: boolean) => Promise<boolean>;
    onShieldsUpdated: (callback: (data: ShieldUpdateEvent) => void) => () => void;
  };
  db: {
    getHistory: () => Promise<HistoryEntry[]>;
    addHistory: (entry: HistoryEntry) => Promise<boolean>;
    clearHistory: () => Promise<boolean>;
    deleteHistory: (id: string) => Promise<boolean>;
    getBookmarks: () => Promise<BookmarkEntry[]>;
    addBookmark: (bookmark: BookmarkEntry) => Promise<boolean>;
    deleteBookmark: (id: string) => Promise<boolean>;
  };
  shortcuts: {
    onNewTab: (callback: () => void) => () => void;
    onNewIncognitoTab: (callback: () => void) => () => void;
    onCloseTab: (callback: () => void) => () => void;
    onHistory: (callback: () => void) => () => void;
    onToggleAI: (callback: () => void) => () => void;
    onOpenHUD: (callback: () => void) => () => void;
    onFind: (callback: () => void) => () => void;
    onPrint: (callback: () => void) => () => void;
    onZoomIn: (callback: () => void) => () => void;
    onZoomOut: (callback: () => void) => () => void;
    onZoomReset: (callback: () => void) => () => void;
    onDevTools: (callback: () => void) => () => void;
  };
  onTabCreateFromPopup?: (callback: (data: { url: string; disposition?: string }) => void) => () => void;
  showContextMenu: (params: { x: number; y: number; items: Array<{ label: string; action: string; icon?: string; disabled?: boolean; separator?: boolean }> }) => void;
  apiKeys: {
    getAll: () => Promise<Record<string, string>>;
    setAll: (keys: Record<string, string>) => Promise<boolean>;
  };
  ollama: {
    listModels: () => Promise<Array<{ id: string; name: string; size?: string; parameterSize?: string; family?: string }>>;
  };
  tab: {
    extractContent: (tabId: string) => Promise<{ title: string; url: string; content: string }>;
    extractAllContent: () => Promise<Array<{ id?: string; title: string; url: string; content: string }>>;
  };
  updater: {
    getState: () => Promise<UpdaterState>;
    check: () => Promise<UpdaterState>;
    setEnabled: (enabled: boolean) => Promise<UpdaterState>;
    quitAndInstall: () => Promise<boolean>;
    onStatus: (callback: (state: UpdaterState) => void) => () => void;
  };
}

const electronAPI: ElectronAPI = {
  sendGeminiMessage: (message, history, activeProvider, customApiKey, options) =>
    ipcRenderer.send('gemini:send', { message, history, activeProvider, customApiKey, ...options }),

  requestCloudPlan: (payload) => ipcRenderer.invoke('ai:request-cloud-plan', payload),

  onGeminiResponse: callback => {
    const handler = (_event: IpcRendererEvent, text: string) => callback(text);
    ipcRenderer.on('gemini:stream', handler);
    return () => ipcRenderer.off('gemini:stream', handler);
  },

  onGeminiDone: callback => {
    const handler = (_event: IpcRendererEvent) => callback();
    ipcRenderer.on('gemini:done', handler);
    return () => ipcRenderer.off('gemini:done', handler);
  },

  onGeminiError: callback => {
    const handler = (_event: IpcRendererEvent, error: string, info?: GeminiErrorInfo) =>
      callback(error, info);
    ipcRenderer.on('gemini:error', handler);
    return () => ipcRenderer.off('gemini:error', handler);
  },

  onExecuteCommand: callback => {
    const handler = (_event: IpcRendererEvent, commands: BrowserCommand[]) => callback(commands);
    ipcRenderer.on('browser:execute-commands', handler);
    return () => ipcRenderer.off('browser:execute-commands', handler);
  },

  groupTabs: (tabsList, customApiKey, activeProvider, category) =>
    ipcRenderer.invoke('gemini:group', { tabsList, customApiKey, activeProvider, category }),

  toggleFullscreen: () => ipcRenderer.invoke('window:toggle-fullscreen'),

  executeAgentStep: (stepData, customApiKey, activeProvider) =>
    ipcRenderer.invoke('gemini:agent-step', { stepData, customApiKey, activeProvider }),

  agent: {
    execute: (action) => ipcRenderer.invoke('agent:execute', action),
    extractPage: () => ipcRenderer.invoke('agent:extract-page'),
    getMemory: () => ipcRenderer.invoke('agent:vault-list'),
    setMemory: (key, value, category) => ipcRenderer.invoke('agent:vault-set', { key, value, category }),
    deleteMemory: (key) => ipcRenderer.invoke('agent:vault-delete', key),
    getMemoryStats: () => ipcRenderer.invoke('agent:vault-stats'),
    recordAction: (actionReq) => ipcRenderer.invoke('agent:record-action', actionReq),
    undoLastAction: () => ipcRenderer.invoke('agent:undo-last-action'),
    getUndoHistory: () => ipcRenderer.invoke('agent:get-undo-history'),
    clearUndoHistory: () => ipcRenderer.invoke('agent:clear-undo-history'),
    getSkills: () => ipcRenderer.invoke('agent:get-skills'),
    saveSkill: (skill) => ipcRenderer.invoke('agent:save-skill', skill),
    deleteSkill: (id) => ipcRenderer.invoke('agent:delete-skill', id),
    runSkill: (skillId) => ipcRenderer.invoke('agent:run-skill', skillId),
    detectSensitiveFields: () => ipcRenderer.invoke('agent:detect-sensitive-fields'),
    highlight: (selector: string, color?: string, duration?: number) => ipcRenderer.invoke('agent:highlight', { selector, color, duration }),
    tooltip: (selector: string, text: string, color?: string) => ipcRenderer.invoke('agent:tooltip', { selector, text, color }),
    clickRipple: (x: number, y: number, color?: string) => ipcRenderer.invoke('agent:click-ripple', { x, y, color }),
    getPolicy: () => ipcRenderer.invoke('agent:get-policy'),
    setSitePolicy: (policy: { domain: string; maxTier: AgentPermissionTier; allowSensitive: boolean }) =>
      ipcRenderer.invoke('agent:set-site-policy', policy),
    getAuditLog: () => ipcRenderer.invoke('agent:get-audit-log'),
    clearAuditLog: () => ipcRenderer.invoke('agent:clear-audit-log'),
    checkNavigation: (fromUrl: string, toUrl: string) =>
      ipcRenderer.invoke('agent:check-navigation', { fromUrl, toUrl }),
    onAuditEvent: (callback: (event: AgentAuditEvent) => void) => {
      const handler = (_event: IpcRendererEvent, event: AgentAuditEvent) => callback(event);
      ipcRenderer.on('agent:audit-event', handler);
      return () => ipcRenderer.off('agent:audit-event', handler);
    },
  },

  mcp: {
    listTools: () => ipcRenderer.invoke('mcp:list-tools'),
    callTool: (toolId, params) => ipcRenderer.invoke('mcp:call-tool', { toolId, params }),
    getServers: () => ipcRenderer.invoke('mcp:get-servers'),
    configureServer: (config) => ipcRenderer.invoke('mcp:configure-server', config),
    startOAuth: (serverId: string) => ipcRenderer.invoke('mcp:start-oauth', serverId),
    oauthCallback: (code: string, serverId: string) => ipcRenderer.invoke('mcp:oauth-callback', { code, serverId }),
    refreshToken: (serverId: string) => ipcRenderer.invoke('mcp:refresh-token', serverId),
    getAuthStatus: (serverId: string) => ipcRenderer.invoke('mcp:get-auth-status', serverId),
  },

  sensitiveFields: {
    confirmAction: (decision) => ipcRenderer.invoke('agent:confirm-sensitive-action', decision),
    onPrompt: (callback) => {
      const handler = (_event: IpcRendererEvent, prompt: SensitiveActionPrompt) => callback(prompt);
      ipcRenderer.on('agent:sensitive-field-prompt', handler);
      return () => ipcRenderer.off('agent:sensitive-field-prompt', handler);
    },
  },

  subAgent: {
    create: (parentAgentId: string, goal: string) => ipcRenderer.invoke('sub-agent:create', { parentAgentId, goal }),
    get: (agentId: string) => ipcRenderer.invoke('sub-agent:get', agentId),
    getByParent: (parentId: string) => ipcRenderer.invoke('sub-agent:get-by-parent', parentId),
    getAll: () => ipcRenderer.invoke('sub-agent:get-all'),
    getStats: () => ipcRenderer.invoke('sub-agent:get-stats'),
    cancel: (agentId: string) => ipcRenderer.invoke('sub-agent:cancel', agentId),
  },

  scheduler: {
    addTask: (name: string, goal: string, cronExpression: string) => ipcRenderer.invoke('scheduler:add-task', { name, goal, cronExpression }),
    removeTask: (taskId: string) => ipcRenderer.invoke('scheduler:remove-task', taskId),
    updateTask: (taskId: string, updates: Record<string, unknown>) => ipcRenderer.invoke('scheduler:update-task', { taskId, updates }),
    enableTask: (taskId: string) => ipcRenderer.invoke('scheduler:enable-task', taskId),
    disableTask: (taskId: string) => ipcRenderer.invoke('scheduler:disable-task', taskId),
    getTask: (taskId: string) => ipcRenderer.invoke('scheduler:get-task', taskId),
    getAllTasks: () => ipcRenderer.invoke('scheduler:get-all-tasks'),
    runNow: (taskId: string) => ipcRenderer.invoke('scheduler:run-now', taskId),
  },

  getCloudPlan: (prompt, provider, apiKey) =>
    ipcRenderer.invoke('gemini:get-cloud-plan', { prompt, provider, apiKey }),

  synthesizeResearch: (topic, dataOrQuery, provider, apiKey) =>
    ipcRenderer.invoke('ai:synthesize-research', { topic, dataOrQuery, provider, apiKey }),

  extensions: {
    selectDirectory: () => ipcRenderer.invoke('extensions:select-dir'),
    loadExtension: path => ipcRenderer.invoke('extensions:load', path),
    removeExtension: id => ipcRenderer.invoke('extensions:remove', id),
    toggleExtension: (id, enabled) => ipcRenderer.invoke('extensions:toggle', { id, enabled }),
    getExtensions: () => ipcRenderer.invoke('extensions:get-all'),
    installFromUrl: (url: string, opts?: { approvedReportId?: string }) =>
      ipcRenderer.invoke('extensions:install-from-url', url, opts),
    analyzeUrl: (url: string) => ipcRenderer.invoke('extensions:analyze-url', url),
  },
  news: {
    fetchFeed: (category: string) => ipcRenderer.invoke('news:fetch-feed', category),
  },
  downloads: {
    getAll: () => ipcRenderer.invoke('downloads:get-all'),
    pause: (id: string) => ipcRenderer.invoke('downloads:pause', id),
    cancel: (id: string) => ipcRenderer.invoke('downloads:cancel', id),
    retry: (id: string) => ipcRenderer.invoke('downloads:retry', id),
    showInFolder: (id: string) => ipcRenderer.invoke('downloads:show-in-folder', id),
    open: (id: string) => ipcRenderer.invoke('downloads:open', id),
    remove: (id: string) => ipcRenderer.invoke('downloads:remove', id),
    clearCompleted: () => ipcRenderer.invoke('downloads:clear-completed'),
    getSaveDir: () => ipcRenderer.invoke('downloads:get-save-dir'),
    setSaveDir: (dir: string) => ipcRenderer.invoke('downloads:set-save-dir', dir),
    setPriority: (id: string, priority: 'high' | 'medium' | 'low') =>
      ipcRenderer.invoke('downloads:set-priority', id, priority),
    onCreated: callback => {
      const handler = (_event: IpcRendererEvent, download: DownloadItem) => callback(download);
      ipcRenderer.on('download:created', handler);
      return () => ipcRenderer.off('download:created', handler);
    },
    onUpdated: callback => {
      const handler = (
        _event: IpcRendererEvent,
        download: Partial<DownloadItem> & { id: string }
      ) => callback(download);
      ipcRenderer.on('download:updated', handler);
      return () => ipcRenderer.off('download:updated', handler);
    },
  },
  passwords: {
    hasMaster: () => ipcRenderer.invoke('password:has-master'),
    setMaster: (password: string) => ipcRenderer.invoke('password:set-master', password),
    unlock: (password: string) => ipcRenderer.invoke('password:unlock', password),
    lock: () => ipcRenderer.invoke('password:lock'),
    isUnlocked: () => ipcRenderer.invoke('password:is-unlocked'),
    getAll: () => ipcRenderer.invoke('password:get-all'),
    getEntry: (id: string) => ipcRenderer.invoke('password:get-entry', id),
    add: (entry: Omit<PasswordEntry, 'id' | 'createdAt' | 'updatedAt'>) =>
      ipcRenderer.invoke('password:add', entry),
    update: (id: string, updates: Partial<PasswordEntry>) =>
      ipcRenderer.invoke('password:update', id, updates),
    delete: (id: string) => ipcRenderer.invoke('password:delete', id),
    generate: (length?: number) => ipcRenderer.invoke('password:generate', length),
    import: (data: string) => ipcRenderer.invoke('password:import', data),
    export: () => ipcRenderer.invoke('password:export'),
    changeMaster: (current: string, newPassword: string) =>
      ipcRenderer.invoke('password:change-master', current, newPassword),
    encryptSyncData: (plaintext: string) => ipcRenderer.invoke('password:encrypt-sync-data', plaintext),
    decryptSyncData: (ciphertext: string) => ipcRenderer.invoke('password:decrypt-sync-data', ciphertext),
  },
  tor: {
    getStatus: () => ipcRenderer.invoke('tor:get-status'),
    connect: () => ipcRenderer.invoke('tor:connect'),
    disconnect: () => ipcRenderer.invoke('tor:disconnect'),
    cancelConnect: () => ipcRenderer.invoke('tor:cancel-connect'),
    newCircuit: () => ipcRenderer.invoke('tor:new-circuit'),
    registerPartition: (partition: string) => ipcRenderer.invoke('tor:register-partition', partition),
    unregisterPartition: (partition: string) => ipcRenderer.invoke('tor:unregister-partition', partition),
    onStatusChange: callback => {
      const handler = (_event: IpcRendererEvent, status: TorStatus) => callback(status);
      ipcRenderer.on('tor:status-change', handler);
      return () => ipcRenderer.off('tor:status-change', handler);
    },
    onConnectionFailed: callback => {
      const handler = (_event: IpcRendererEvent, data: { error: string }) => callback(data.error);
      ipcRenderer.on('tor:connection-failed', handler);
      return () => ipcRenderer.off('tor:connection-failed', handler);
    },
    isTorMode: () => ipcRenderer.invoke('tor:is-mode'),
    setTorMode: (enabled: boolean) => ipcRenderer.invoke('tor:set-mode', enabled),
    addBridge: (bridge: BridgeConfig) => ipcRenderer.invoke('tor:add-bridge', bridge),
    removeBridge: (address: string) => ipcRenderer.invoke('tor:remove-bridge', address),
    setBridges: (bridges: BridgeConfig[]) => ipcRenderer.invoke('tor:set-bridges', bridges),
    setBridgeType: (type: 'obfs4' | 'snowflake' | 'none') =>
      ipcRenderer.invoke('tor:set-bridge-type', type),
    setUseBridges: (enabled: boolean) => ipcRenderer.invoke('tor:set-use-bridges', enabled),
    getBridgeType: () => ipcRenderer.invoke('tor:get-bridge-type'),
    isUsingBridges: () => ipcRenderer.invoke('tor:is-using-bridges'),
    getBridgesList: () => ipcRenderer.invoke('tor:get-bridges'),
    // Onion utilities
    isOnionAddress: (url: string) => ipcRenderer.invoke('tor:is-onion', url),
    ensureOnionUrl: (url: string) => ipcRenderer.invoke('tor:ensure-onion-url', url),

    fetchBridges: (transport: 'obfs4' | 'snowflake') => ipcRenderer.invoke('tor:fetch-bridges', transport),

    syncBinaries: () => ipcRenderer.invoke('tor:sync-binaries'),
    shouldUseTor: (url: string, torMode: boolean) =>
      ipcRenderer.invoke('tor:should-use-tor', url, torMode),
  },
  security: {
    getSettings: () => ipcRenderer.invoke('security:get-settings'),
    updateSettings: updates => ipcRenderer.invoke('security:update-settings', updates),
    getApiKey: () => ipcRenderer.invoke('security:get-api-key'),
    setApiKey: key => ipcRenderer.invoke('security:set-api-key', key),
    bypassUrl: url => ipcRenderer.invoke('security:bypass-url', url),
    scanFile: (downloadId, filePath, filename) =>
      ipcRenderer.invoke('security:scan-file', downloadId, filePath, filename),
  },
  adblocker: {
    toggle: enabled => ipcRenderer.invoke('adblocker:toggle', enabled),
    isEnabled: () => ipcRenderer.invoke('adblocker:is-enabled'),
    getBlockedCount: () => ipcRenderer.invoke('adblocker:get-blocked-count'),
    resetCount: () => ipcRenderer.invoke('adblocker:reset-count'),
    onCountUpdated: callback => {
      const handler = (_event: IpcRendererEvent, count: number) => callback(count);
      ipcRenderer.on('adblocker:count-updated', handler);
      return () => ipcRenderer.off('adblocker:count-updated', handler);
    },
  },
  shortcuts: {
    onNewTab: (callback: () => void) => {
      const handler = () => callback();
      ipcRenderer.on('shortcut:new-tab', handler);
      return () => ipcRenderer.off('shortcut:new-tab', handler);
    },
    onNewIncognitoTab: (callback: () => void) => {
      const handler = () => callback();
      ipcRenderer.on('shortcut:new-incognito-tab', handler);
      return () => ipcRenderer.off('shortcut:new-incognito-tab', handler);
    },
    onCloseTab: (callback: () => void) => {
      const handler = () => callback();
      ipcRenderer.on('shortcut:close-tab', handler);
      return () => ipcRenderer.off('shortcut:close-tab', handler);
    },
    onHistory: (callback: () => void) => {
      const handler = () => callback();
      ipcRenderer.on('shortcut:history', handler);
      return () => ipcRenderer.off('shortcut:history', handler);
    },
    onToggleAI: (callback: () => void) => {
      const handler = () => callback();
      ipcRenderer.on('shortcut:toggle-ai', handler);
      return () => ipcRenderer.off('shortcut:toggle-ai', handler);
    },
    onOpenHUD: (callback: () => void) => {
      const handler = () => callback();
      ipcRenderer.on('shortcut:open-hud', handler);
      return () => ipcRenderer.off('shortcut:open-hud', handler);
    },
    onFind: (callback: () => void) => {
      const handler = () => callback();
      ipcRenderer.on('shortcut:find', handler);
      return () => ipcRenderer.off('shortcut:find', handler);
    },
    onPrint: (callback: () => void) => {
      const handler = () => callback();
      ipcRenderer.on('shortcut:print', handler);
      return () => ipcRenderer.off('shortcut:print', handler);
    },
    onZoomIn: (callback: () => void) => {
      const handler = () => callback();
      ipcRenderer.on('shortcut:zoom-in', handler);
      return () => ipcRenderer.off('shortcut:zoom-in', handler);
    },
    onZoomOut: (callback: () => void) => {
      const handler = () => callback();
      ipcRenderer.on('shortcut:zoom-out', handler);
      return () => ipcRenderer.off('shortcut:zoom-out', handler);
    },
    onZoomReset: (callback: () => void) => {
      const handler = () => callback();
      ipcRenderer.on('shortcut:zoom-reset', handler);
      return () => ipcRenderer.off('shortcut:zoom-reset', handler);
    },
    onDevTools: (callback: () => void) => {
      const handler = () => callback();
      ipcRenderer.on('shortcut:devtools', handler);
      return () => ipcRenderer.off('shortcut:devtools', handler);
    },
  },
  session: {
    getCookies: (partition?: string) => ipcRenderer.invoke('session:get-cookies', partition),
    deleteCookie: (url: string, name: string, partition?: string) => ipcRenderer.invoke('session:delete-cookie', url, name, partition),
    clearData: (origin: string, partition?: string) => ipcRenderer.invoke('session:clear-data', origin, partition),
    purgeIncognito: (partition: string) => ipcRenderer.invoke('session:purge-incognito', partition),
  },
  vpn: {
    getStatus: () => ipcRenderer.invoke('vpn:get-status'),
    importConfig: (rawConfig) => ipcRenderer.invoke('vpn:import-config', rawConfig),
    getConfig: () => ipcRenderer.invoke('vpn:get-config'),
    clearConfig: () => ipcRenderer.invoke('vpn:clear-config'),
    connect: () => ipcRenderer.invoke('vpn:connect'),
    disconnect: () => ipcRenderer.invoke('vpn:disconnect'),
    isModeEnabled: () => ipcRenderer.invoke('vpn:is-mode-enabled'),
    setModeEnabled: (enabled) => ipcRenderer.invoke('vpn:set-mode-enabled', enabled),
    isKillSwitchEnabled: () => ipcRenderer.invoke('vpn:is-killswitch-enabled'),
    setKillSwitchEnabled: (enabled) => ipcRenderer.invoke('vpn:set-killswitch-enabled', enabled),
    onStatusChange: (callback) => {
      const handler = (_event: IpcRendererEvent, status: VPNStatus) => callback(status);
      ipcRenderer.on('vpn:status-change', handler);
      return () => ipcRenderer.off('vpn:status-change', handler);
    },
    onConnectionFailed: (callback) => {
      const handler = (_event: IpcRendererEvent, data: { error: string }) => callback(data.error);
      ipcRenderer.on('vpn:connection-failed', handler);
      return () => ipcRenderer.off('vpn:connection-failed', handler);
    }
  },
  shields: {
    getSiteShields: (domain: string) => ipcRenderer.invoke('shields:get-site-shields', domain),
    updateSiteShields: (domain: string, updates: Partial<SiteShields>) => ipcRenderer.invoke('shields:update-site-shields', domain, updates),
    getStats: (domain: string) => ipcRenderer.invoke('shields:get-stats', domain),
    getDetectedScripts: (domain: string) => ipcRenderer.invoke('shields:get-detected-scripts', domain),
    updateScriptRule: (domain: string, scriptUrl: string, action: 'block' | 'allow' | 'default') => ipcRenderer.invoke('shields:update-script-rule', domain, scriptUrl, action),
    updateDomainRule: (domain: string, targetDomain: string, action: 'block' | 'allow' | 'default') => ipcRenderer.invoke('shields:update-domain-rule', domain, targetDomain, action),
    updateBlockedScripts: (domain: string, blockedUrls: string[]) => ipcRenderer.invoke('shields:update-blocked-scripts', domain, blockedUrls),
    recordScript: (domain: string, scriptUrl: string, blocked: boolean) => ipcRenderer.invoke('shields:record-script', domain, scriptUrl, blocked),
    onShieldsUpdated: (callback: (data: ShieldUpdateEvent) => void) => {
      const handler = (_event: IpcRendererEvent, data: ShieldUpdateEvent) => callback(data);
      ipcRenderer.on('shields:stats-updated', handler);
      return () => ipcRenderer.off('shields:stats-updated', handler);
    },
  },
  db: {
    getHistory: () => ipcRenderer.invoke('db:get-history'),
    addHistory: (entry) => ipcRenderer.invoke('db:add-history', entry),
    clearHistory: () => ipcRenderer.invoke('db:clear-history'),
    deleteHistory: (id) => ipcRenderer.invoke('db:delete-history', id),
    getBookmarks: () => ipcRenderer.invoke('db:get-bookmarks'),
    addBookmark: (bookmark) => ipcRenderer.invoke('db:add-bookmark', bookmark),
    deleteBookmark: (id) => ipcRenderer.invoke('db:delete-bookmark', id),
  },
  showContextMenu: (params) => ipcRenderer.send('context-menu:show', params),
  onTabCreateFromPopup: (callback) => {
    const handler = (_event: IpcRendererEvent, data: { url: string; disposition?: string }) => callback(data);
    ipcRenderer.on('tab:create-from-popup', handler);
    return () => ipcRenderer.off('tab:create-from-popup', handler);
  },
  apiKeys: {
    getAll: () => ipcRenderer.invoke('api-keys:get-all'),
    setAll: (keys) => ipcRenderer.invoke('api-keys:set-all', keys),
  },
  ollama: {
    listModels: () => ipcRenderer.invoke('ollama:list-models'),
  },
  tab: {
    extractContent: (tabId) => ipcRenderer.invoke('tab:extract-content', tabId),
    extractAllContent: () => ipcRenderer.invoke('tab:extract-all-content'),
  },
  updater: {
    getState: () => ipcRenderer.invoke('updater:get-state'),
    check: () => ipcRenderer.invoke('updater:check'),
    setEnabled: (enabled: boolean) => ipcRenderer.invoke('updater:set-enabled', enabled),
    quitAndInstall: () => ipcRenderer.invoke('updater:quit-and-install'),
    onStatus: (callback: (state: UpdaterState) => void) => {
      const handler = (_event: IpcRendererEvent, state: UpdaterState) => callback(state);
      ipcRenderer.on('updater:status', handler);
      return () => ipcRenderer.off('updater:status', handler);
    },
  },
};

contextBridge.exposeInMainWorld('electronAPI', electronAPI);

declare global {
  interface Window {
    electronAPI: ElectronAPI;
  }
}
