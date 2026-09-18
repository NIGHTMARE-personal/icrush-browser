/* eslint-disable @typescript-eslint/no-unused-vars */
// Mock for window.electronAPI when running in a standard web browser (e.g. Playwright E2E tests)
if (typeof window !== 'undefined' && !window.electronAPI) {
  console.warn('[Mock] Running outside of Electron. Polyfilling window.electronAPI.');

  // Helper to create simple unsubscribe returners
  const dummyUnsubscribe = () => () => {};

  window.electronAPI = {
    showContextMenu: (params) => {
      console.log('[Mock] showContextMenu:', params);
    },
    sendGeminiMessage: (message, history, activeProvider, customApiKey, options) => {
      console.log('[Mock] sendGeminiMessage:', { message, history, activeProvider, customApiKey, options });
    },
    requestCloudPlan: async (payload) => {
      console.log('[Mock] requestCloudPlan:', payload);
      return 'Mock plan: step 1, step 2';
    },
    getCloudPlan: async (prompt, provider, apiKey) => {
      console.log('[Mock] getCloudPlan:', { prompt, provider });
      return 'Mock plan: step 1, step 2';
    },
    synthesizeResearch: async (topic, dataOrQuery, provider, apiKey) => {
      console.log('[Mock] synthesizeResearch:', { topic, provider });
      return '<h2>Mock Synthesis</h2><p>Mock research content</p>';
    },
    onGeminiResponse: (callback) => {
      // Simulate some response stream for tests if necessary
      return dummyUnsubscribe();
    },
    onGeminiDone: (callback) => dummyUnsubscribe(),
    onGeminiError: (callback) => dummyUnsubscribe(),
    onExecuteCommand: (callback) => dummyUnsubscribe(),
    
    groupTabs: async (tabsList, customApiKey, activeProvider) => {
      console.log('[Mock] groupTabs called with:', tabsList);
      return [];
    },
    
    toggleFullscreen: async () => {},

    executeAgentStep: async (stepData, customApiKey, activeProvider) => {
      console.log('[Mock] executeAgentStep called');
      return { thought: 'Agent mock thinking...', action: 'finish', answer: 'Success' };
    },
    
    agent: {
      execute: async (action) => {
        console.log('[Mock] agent.execute:', action);
        return { success: true, jsCode: 'JSON.stringify({ success: true })' };
      },
      extractPage: async () => {
        return JSON.stringify({ title: 'Mock Page', url: 'about:blank', text: '', links: [], forms: [], inputs: [] });
      },
      getMemory: async () => ({}),
      setMemory: async (key, value) => true,
      deleteMemory: async (key) => true,
      getMemoryStats: async () => ({
        totalKeys: 0,
        isEncryptionAvailable: false,
        storagePath: '/mock/path',
        lastUpdated: Date.now(),
      }),
      recordAction: async (req) => ({
        id: 'mock-action-' + Date.now(),
        stepNumber: req.stepNumber,
        timestamp: Date.now(),
        goal: req.goal,
        url: req.url,
        action: req.action,
        canUndo: true,
      }),
      undoLastAction: async () => ({
        success: true,
        actionId: 'mock-action',
        undoJsCode: undefined,
      }),
      getUndoHistory: async () => [],
      clearUndoHistory: async () => true,
      getSkills: async () => [],
      saveSkill: async (skill) => ({ ...skill, id: 'mock-skill', createdAt: Date.now() }),
      deleteSkill: async (id) => true,
      detectSensitiveFields: async () => ({ jsCode: '' }),
      highlight: async () => ({ jsCode: '' }),
      tooltip: async () => ({ jsCode: '' }),
      clickRipple: async () => ({ jsCode: '' }),
      runSkill: async (skillId) => ({ thought: 'Running skill', action: 'finish', answer: 'Done' }),
      getPolicy: async () => ({ version: 1, defaultMaxTier: 'sensitive', sites: {} }),
      setSitePolicy: async (policy) => ({ ...policy, updatedAt: Date.now() }),
      getAuditLog: async () => [],
      clearAuditLog: async () => true,
      checkNavigation: async () => ({ crosses: false, reasons: [] }),
      onAuditEvent: (callback) => dummyUnsubscribe(),
    },

    mcp: {
      listTools: async () => [],
      callTool: async (toolId, params) => ({ success: true, toolId, output: null, executionTimeMs: 1 }),
      getServers: async () => [],
      configureServer: async (config) => true,
      startOAuth: async () => ({ authUrl: '', state: '' }),
      oauthCallback: async () => true,
      refreshToken: async () => true,
      getAuthStatus: async () => ({ authenticated: false, scopes: [] }),
    },

    subAgent: {
      create: async () => 'mock-sub-agent',
      get: async () => undefined,
      getByParent: async () => [],
      getAll: async () => [],
      getStats: async () => ({ total: 0, running: 0, completed: 0, failed: 0, queued: 0 }),
      cancel: async () => true,
    },

    scheduler: {
      addTask: async () => 'mock-task',
      removeTask: async () => true,
      updateTask: async () => true,
      enableTask: async () => true,
      disableTask: async () => true,
      getTask: async () => undefined,
      getAllTasks: async () => [],
      runNow: async () => true,
    },

    sensitiveFields: {
      confirmAction: async (decision) => true,
      onPrompt: (callback) => () => {},
    },
    
    extensions: {
      selectDirectory: async () => 'C:/MockExtensionPath',
      loadExtension: async (path: string) => ({
        id: 'mock-ext-1',
        name: 'React Developer Tools',
        version: '4.28.5',
        path,
        enabled: true,
      }),
      removeExtension: async (_id: string) => {},
      toggleExtension: async (_id: string, _enabled: boolean) => [],
      getExtensions: async () => [
        {
          id: 'fmkadmapgofadopljbjfkapdkoienihi',
          name: 'React Developer Tools',
          version: '5.3.1',
          path: 'C:/Users/AppData/Local/icrush/extensions/react-devtools',
          enabled: true,
          description: 'Adds React debugging tools to the Developer Tools panel.',
        },
        {
          id: 'cjpalhdlnbpafiamejdnhcphjbkeiagm',
          name: 'uBlock Origin Hardened',
          version: '1.58.0',
          path: 'C:/Users/AppData/Local/icrush/extensions/ublock-origin',
          enabled: true,
          description: 'An efficient wide-spectrum content blocker that is easy on CPU and memory.',
        },
        {
          id: 'eimadpbcbfnmbkopoojfekhnkhdbieeh',
          name: 'Dark Reader Pro',
          version: '4.9.86',
          path: 'C:/Users/AppData/Local/icrush/extensions/dark-reader',
          enabled: false,
          description: 'Dark mode for every website. Care for your eyes, use dark theme for night and daily browsing.',
        },
      ],
      installFromUrl: async (url: string) => ({
        id: `ext-${Date.now()}`,
        name: 'Web Store Extension',
        version: '1.0.0',
        path: url,
        enabled: true,
      }),
      analyzeUrl: async (url: string) => ({
        reportId: `rep-mock-${Date.now()}`,
        report: {
          name: 'Web Store Extension',
          version: '1.0.0',
          manifestVersion: 3,
          permissions: ['storage'],
          hostPermissions: [],
          riskLevel: 'low',
          findings: ['standard permission set'],
        },
      }),
    },
    
    downloads: {
      getAll: async () => [],
      pause: async (id) => true,
      cancel: async (id) => true,
      retry: async (id) => true,
      showInFolder: async (id) => {},
      open: async (id) => {},
      remove: async (id) => true,
      clearCompleted: async () => true,
      getSaveDir: async () => '~/Downloads',
      setSaveDir: async (dir) => true,
      setPriority: async (id, priority) => true,
      onCreated: (callback) => dummyUnsubscribe(),
      onUpdated: (callback) => dummyUnsubscribe(),
    },
    
    passwords: {
      hasMaster: async () => false,
      setMaster: async (password) => true,
      unlock: async (password) => true,
      lock: async () => true,
      isUnlocked: async () => true,
      getAll: async () => [],
      getEntry: async (id) => null,
      add: async (entry) => ({
        ...entry,
        id: 'mock-pwd-id',
        createdAt: Date.now(),
        updatedAt: Date.now(),
      }),
      update: async (id, updates) => ({
        id,
        url: 'http://example.com',
        username: 'admin',
        createdAt: Date.now(),
        updatedAt: Date.now(),
        ...updates,
      }),
      delete: async (id) => true,
      generate: async (length = 12) => 'MockPwd123!@#',
      import: async (data) => 0,
      export: async () => '',
      changeMaster: async (current, newPassword) => true,
      encryptSyncData: async (plaintext) => plaintext,
      decryptSyncData: async (ciphertext) => ciphertext,
    },
    
    tor: {
      getStatus: async () => ({
        connected: false,
        ip: '127.0.0.1',
        circuit: '',
        bootstrap: 0,
        bandwidth: { read: 0, write: 0, total: 0 },
        latency: 0,
        circuitDetails: [],
      }),
      connect: async () => ({ success: true }),
      disconnect: async () => true,
      cancelConnect: async () => {},
      newCircuit: async () => {},
      onStatusChange: (callback) => dummyUnsubscribe(),
      onConnectionFailed: (callback) => dummyUnsubscribe(),
      isTorMode: async () => false,
      setTorMode: async (enabled) => {},
      addBridge: async (bridge) => {},
      removeBridge: async (address) => {},
      setBridges: async (bridges) => {},
      setBridgeType: async (type) => {},
      setUseBridges: async (enabled) => {},
      getBridgeType: async () => 'none',
      isUsingBridges: async () => false,
      getBridgesList: async () => [],
      isOnionAddress: async (url) => false,
      ensureOnionUrl: async (url) => url,
      shouldUseTor: async (url, torMode) => false,
      registerPartition: async (_partition) => true,
      unregisterPartition: async (_partition) => {},
    },
    
    security: {
      getSettings: async () => ({
        safeBrowsingEnabled: true,
        downloadScanningEnabled: true,
        useEnhancedProtection: false,
      }),
      updateSettings: async (updates) => ({
        safeBrowsingEnabled: true,
        downloadScanningEnabled: true,
        useEnhancedProtection: false,
        ...updates,
      }),
      getApiKey: async () => 'mock-vt-key',
      setApiKey: async (key) => true,
      bypassUrl: async (url) => true,
      scanFile: async (downloadId, filePath, filename) => ({ status: 'safe' }),
    },
    
    adblocker: {
      toggle: async (enabled) => true,
      isEnabled: async () => true,
      getBlockedCount: async () => 0,
      resetCount: async () => 0,
      onCountUpdated: (callback) => dummyUnsubscribe(),
    },
    vpn: {
      getStatus: async (): Promise<any> => ({
        connected: false,
        countryCode: '',
        countryName: '',
        serverLatency: 0,
        bandwidth: { up: 0, down: 0, total: 0 },
        currentPlan: null,
        interfaceName: '',
        localIP: '',
        endpointIP: '',
        lastHandshake: 0,
      }),
      getServers: async (): Promise<any[]> => [
        { countryCode: 'us', countryName: 'United States', flag: '🇺🇸', endpoint: 'us.wireguard.example.com:51820', publicKey: 'US_KEY', allowedIps: '0.0.0.0/0', dnsServers: ['1.1.1.1'], mtu: 1420, persistentKeepalive: 25, ping: 45, uptime: 99.9 },
        { countryCode: 'de', countryName: 'Germany', flag: '🇩🇪', endpoint: 'de.wireguard.example.com:51820', publicKey: 'DE_KEY', allowedIps: '0.0.0.0/0', dnsServers: ['1.1.1.1'], mtu: 1420, persistentKeepalive: 25, ping: 25, uptime: 99.9 },
      ],
      getPlans: async () => [
        { id: 'free', name: 'Free', currency: 'USD', price: 0, period: 'daily', dataLimit: 1024, features: ['1GB/day', '3 locations'] },
      ],
      getSelectedServer: async () => null,
      getSelectedPlan: async () => null,
      setServer: async (countryCode) => {},
      setPlan: async (planId) => {},
      connect: async () => true,
      disconnect: async () => true,
      isModeEnabled: async () => false,
      setModeEnabled: async (enabled) => enabled,
      isKillSwitchEnabled: async () => true,
      setKillSwitchEnabled: async (enabled) => enabled,
      onStatusChange: (callback) => dummyUnsubscribe(),
      onConnectionFailed: (callback) => dummyUnsubscribe(),
    },
    shields: {
      getSiteShields: async (_domain) => ({
        shieldsUp: true,
        blockTrackers: 'standard',
        upgradeHttps: true,
        blockScripts: false,
        allowFirstPartyScripts: false,
        blockedScripts: [],
        allowedScripts: [],
        blockedDomains: [],
        allowedDomains: [],
        blockFingerprinting: true,
        fingerprintingProtections: {
          canvas: true,
          audio: true,
          webgl: true,
          hardwareConcurrency: true,
          deviceMemory: true,
          webrtc: true,
          font: true,
        },
        blockCookies: 'third-party',
        forgetMe: false,
      }),
      updateSiteShields: async (_domain, updates) => ({
        shieldsUp: true,
        blockTrackers: 'standard',
        upgradeHttps: true,
        blockScripts: false,
        allowFirstPartyScripts: false,
        blockedScripts: [],
        allowedScripts: [],
        blockedDomains: [],
        allowedDomains: [],
        blockFingerprinting: true,
        fingerprintingProtections: {
          canvas: true,
          audio: true,
          webgl: true,
          hardwareConcurrency: true,
          deviceMemory: true,
          webrtc: true,
          font: true,
        },
        blockCookies: 'third-party',
        forgetMe: false,
        ...updates,
      } as any),
      getStats: async (_domain) => ({
        trackersBlocked: 0,
        scriptsBlocked: 0,
        httpsUpgrades: 0,
        fingerprintsFoiled: 0,
      }),
      getDetectedScripts: async (_domain) => [],
      updateScriptRule: async (_domain, _scriptUrl, _action) => true,
      updateDomainRule: async (_domain, _targetDomain, _action) => true,
      updateBlockedScripts: async (_domain, _blockedUrls) => true,
      recordScript: async (_domain, _scriptUrl, _blocked) => true,
      onShieldsUpdated: (_callback) => dummyUnsubscribe(),
    },
    session: {
      getCookies: async (partition) => [],
      deleteCookie: async (url, name, partition) => true,
      clearData: async (origin, partition) => true,
      purgeIncognito: async (partition) => true,
    },
    db: {
      getHistory: async () => [],
      addHistory: async (entry) => true,
      clearHistory: async () => true,
      deleteHistory: async (id) => true,
      getBookmarks: async () => [],
      addBookmark: async (bookmark) => true,
      deleteBookmark: async (id) => true,
    },
    apiKeys: {
      getAll: async () => ({}),
      setAll: async (keys) => true,
    },
    shortcuts: {
      onNewTab: (callback) => dummyUnsubscribe(),
      onNewIncognitoTab: (callback) => dummyUnsubscribe(),
      onCloseTab: (callback) => dummyUnsubscribe(),
      onHistory: (callback) => dummyUnsubscribe(),
      onToggleAI: (callback) => dummyUnsubscribe(),
      onOpenHUD: (callback) => dummyUnsubscribe(),
      onFind: (callback) => dummyUnsubscribe(),
      onPrint: (callback) => dummyUnsubscribe(),
      onZoomIn: (callback) => dummyUnsubscribe(),
      onZoomOut: (callback) => dummyUnsubscribe(),
      onZoomReset: (callback) => dummyUnsubscribe(),
      onDevTools: (callback) => dummyUnsubscribe(),
    },
    updater: {
      getState: async () => ({ status: 'unavailable', enabled: true, appVersion: '1.0.0-mock' }),
      check: async () => ({ status: 'unavailable', enabled: true, appVersion: '1.0.0-mock' }),
      setEnabled: async (enabled) => ({ status: 'unavailable', enabled, appVersion: '1.0.0-mock' }),
      quitAndInstall: async () => true,
      onStatus: (callback) => dummyUnsubscribe(),
    },
  } as any;
}
