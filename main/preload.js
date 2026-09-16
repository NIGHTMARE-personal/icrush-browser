"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const electron_1 = require("electron");
const electronAPI = {
    sendGeminiMessage: (message, history, activeProvider, customApiKey, options) => electron_1.ipcRenderer.send('gemini:send', { message, history, activeProvider, customApiKey, ...options }),
    requestCloudPlan: (payload) => electron_1.ipcRenderer.invoke('ai:request-cloud-plan', payload),
    onGeminiResponse: callback => {
        const handler = (_event, text) => callback(text);
        electron_1.ipcRenderer.on('gemini:stream', handler);
        return () => electron_1.ipcRenderer.off('gemini:stream', handler);
    },
    onGeminiDone: callback => {
        const handler = (_event) => callback();
        electron_1.ipcRenderer.on('gemini:done', handler);
        return () => electron_1.ipcRenderer.off('gemini:done', handler);
    },
    onGeminiError: callback => {
        const handler = (_event, error, info) => callback(error, info);
        electron_1.ipcRenderer.on('gemini:error', handler);
        return () => electron_1.ipcRenderer.off('gemini:error', handler);
    },
    onExecuteCommand: callback => {
        const handler = (_event, commands) => callback(commands);
        electron_1.ipcRenderer.on('browser:execute-commands', handler);
        return () => electron_1.ipcRenderer.off('browser:execute-commands', handler);
    },
    groupTabs: (tabsList, customApiKey, activeProvider, category) => electron_1.ipcRenderer.invoke('gemini:group', { tabsList, customApiKey, activeProvider, category }),
    toggleFullscreen: () => electron_1.ipcRenderer.invoke('window:toggle-fullscreen'),
    executeAgentStep: (stepData, customApiKey, activeProvider) => electron_1.ipcRenderer.invoke('gemini:agent-step', { stepData, customApiKey, activeProvider }),
    agent: {
        execute: (action) => electron_1.ipcRenderer.invoke('agent:execute', action),
        extractPage: () => electron_1.ipcRenderer.invoke('agent:extract-page'),
        getMemory: () => electron_1.ipcRenderer.invoke('agent:vault-list'),
        setMemory: (key, value, category) => electron_1.ipcRenderer.invoke('agent:vault-set', { key, value, category }),
        deleteMemory: (key) => electron_1.ipcRenderer.invoke('agent:vault-delete', key),
        getMemoryStats: () => electron_1.ipcRenderer.invoke('agent:vault-stats'),
        recordAction: (actionReq) => electron_1.ipcRenderer.invoke('agent:record-action', actionReq),
        undoLastAction: () => electron_1.ipcRenderer.invoke('agent:undo-last-action'),
        getUndoHistory: () => electron_1.ipcRenderer.invoke('agent:get-undo-history'),
        clearUndoHistory: () => electron_1.ipcRenderer.invoke('agent:clear-undo-history'),
        getSkills: () => electron_1.ipcRenderer.invoke('agent:get-skills'),
        saveSkill: (skill) => electron_1.ipcRenderer.invoke('agent:save-skill', skill),
        deleteSkill: (id) => electron_1.ipcRenderer.invoke('agent:delete-skill', id),
        runSkill: (skillId) => electron_1.ipcRenderer.invoke('agent:run-skill', skillId),
        detectSensitiveFields: () => electron_1.ipcRenderer.invoke('agent:detect-sensitive-fields'),
        highlight: (selector, color, duration) => electron_1.ipcRenderer.invoke('agent:highlight', { selector, color, duration }),
        tooltip: (selector, text, color) => electron_1.ipcRenderer.invoke('agent:tooltip', { selector, text, color }),
        clickRipple: (x, y, color) => electron_1.ipcRenderer.invoke('agent:click-ripple', { x, y, color }),
    },
    mcp: {
        listTools: () => electron_1.ipcRenderer.invoke('mcp:list-tools'),
        callTool: (toolId, params) => electron_1.ipcRenderer.invoke('mcp:call-tool', { toolId, params }),
        getServers: () => electron_1.ipcRenderer.invoke('mcp:get-servers'),
        configureServer: (config) => electron_1.ipcRenderer.invoke('mcp:configure-server', config),
        startOAuth: (serverId) => electron_1.ipcRenderer.invoke('mcp:start-oauth', serverId),
        oauthCallback: (code, serverId) => electron_1.ipcRenderer.invoke('mcp:oauth-callback', { code, serverId }),
        refreshToken: (serverId) => electron_1.ipcRenderer.invoke('mcp:refresh-token', serverId),
        getAuthStatus: (serverId) => electron_1.ipcRenderer.invoke('mcp:get-auth-status', serverId),
    },
    sensitiveFields: {
        confirmAction: (decision) => electron_1.ipcRenderer.invoke('agent:confirm-sensitive-action', decision),
        onPrompt: (callback) => {
            const handler = (_event, prompt) => callback(prompt);
            electron_1.ipcRenderer.on('agent:sensitive-field-prompt', handler);
            return () => electron_1.ipcRenderer.off('agent:sensitive-field-prompt', handler);
        },
    },
    subAgent: {
        create: (parentAgentId, goal) => electron_1.ipcRenderer.invoke('sub-agent:create', { parentAgentId, goal }),
        get: (agentId) => electron_1.ipcRenderer.invoke('sub-agent:get', agentId),
        getByParent: (parentId) => electron_1.ipcRenderer.invoke('sub-agent:get-by-parent', parentId),
        getAll: () => electron_1.ipcRenderer.invoke('sub-agent:get-all'),
        getStats: () => electron_1.ipcRenderer.invoke('sub-agent:get-stats'),
        cancel: (agentId) => electron_1.ipcRenderer.invoke('sub-agent:cancel', agentId),
    },
    scheduler: {
        addTask: (name, goal, cronExpression) => electron_1.ipcRenderer.invoke('scheduler:add-task', { name, goal, cronExpression }),
        removeTask: (taskId) => electron_1.ipcRenderer.invoke('scheduler:remove-task', taskId),
        updateTask: (taskId, updates) => electron_1.ipcRenderer.invoke('scheduler:update-task', { taskId, updates }),
        enableTask: (taskId) => electron_1.ipcRenderer.invoke('scheduler:enable-task', taskId),
        disableTask: (taskId) => electron_1.ipcRenderer.invoke('scheduler:disable-task', taskId),
        getTask: (taskId) => electron_1.ipcRenderer.invoke('scheduler:get-task', taskId),
        getAllTasks: () => electron_1.ipcRenderer.invoke('scheduler:get-all-tasks'),
        runNow: (taskId) => electron_1.ipcRenderer.invoke('scheduler:run-now', taskId),
    },
    getCloudPlan: (prompt, provider, apiKey) => electron_1.ipcRenderer.invoke('gemini:get-cloud-plan', { prompt, provider, apiKey }),
    synthesizeResearch: (topic, dataOrQuery, provider, apiKey) => electron_1.ipcRenderer.invoke('ai:synthesize-research', { topic, dataOrQuery, provider, apiKey }),
    extensions: {
        selectDirectory: () => electron_1.ipcRenderer.invoke('extensions:select-dir'),
        loadExtension: path => electron_1.ipcRenderer.invoke('extensions:load', path),
        removeExtension: id => electron_1.ipcRenderer.invoke('extensions:remove', id),
        toggleExtension: (id, enabled) => electron_1.ipcRenderer.invoke('extensions:toggle', { id, enabled }),
        getExtensions: () => electron_1.ipcRenderer.invoke('extensions:get-all'),
        installFromUrl: (url) => electron_1.ipcRenderer.invoke('extensions:install-from-url', url),
    },
    downloads: {
        getAll: () => electron_1.ipcRenderer.invoke('downloads:get-all'),
        pause: (id) => electron_1.ipcRenderer.invoke('downloads:pause', id),
        cancel: (id) => electron_1.ipcRenderer.invoke('downloads:cancel', id),
        retry: (id) => electron_1.ipcRenderer.invoke('downloads:retry', id),
        showInFolder: (id) => electron_1.ipcRenderer.invoke('downloads:show-in-folder', id),
        open: (id) => electron_1.ipcRenderer.invoke('downloads:open', id),
        remove: (id) => electron_1.ipcRenderer.invoke('downloads:remove', id),
        clearCompleted: () => electron_1.ipcRenderer.invoke('downloads:clear-completed'),
        getSaveDir: () => electron_1.ipcRenderer.invoke('downloads:get-save-dir'),
        setSaveDir: (dir) => electron_1.ipcRenderer.invoke('downloads:set-save-dir', dir),
        setPriority: (id, priority) => electron_1.ipcRenderer.invoke('downloads:set-priority', id, priority),
        onCreated: callback => {
            const handler = (_event, download) => callback(download);
            electron_1.ipcRenderer.on('download:created', handler);
            return () => electron_1.ipcRenderer.off('download:created', handler);
        },
        onUpdated: callback => {
            const handler = (_event, download) => callback(download);
            electron_1.ipcRenderer.on('download:updated', handler);
            return () => electron_1.ipcRenderer.off('download:updated', handler);
        },
    },
    passwords: {
        hasMaster: () => electron_1.ipcRenderer.invoke('password:has-master'),
        setMaster: (password) => electron_1.ipcRenderer.invoke('password:set-master', password),
        unlock: (password) => electron_1.ipcRenderer.invoke('password:unlock', password),
        lock: () => electron_1.ipcRenderer.invoke('password:lock'),
        isUnlocked: () => electron_1.ipcRenderer.invoke('password:is-unlocked'),
        getAll: () => electron_1.ipcRenderer.invoke('password:get-all'),
        getEntry: (id) => electron_1.ipcRenderer.invoke('password:get-entry', id),
        add: (entry) => electron_1.ipcRenderer.invoke('password:add', entry),
        update: (id, updates) => electron_1.ipcRenderer.invoke('password:update', id, updates),
        delete: (id) => electron_1.ipcRenderer.invoke('password:delete', id),
        generate: (length) => electron_1.ipcRenderer.invoke('password:generate', length),
        import: (data) => electron_1.ipcRenderer.invoke('password:import', data),
        export: () => electron_1.ipcRenderer.invoke('password:export'),
        changeMaster: (current, newPassword) => electron_1.ipcRenderer.invoke('password:change-master', current, newPassword),
        encryptSyncData: (plaintext) => electron_1.ipcRenderer.invoke('password:encrypt-sync-data', plaintext),
        decryptSyncData: (ciphertext) => electron_1.ipcRenderer.invoke('password:decrypt-sync-data', ciphertext),
    },
    tor: {
        getStatus: () => electron_1.ipcRenderer.invoke('tor:get-status'),
        connect: () => electron_1.ipcRenderer.invoke('tor:connect'),
        disconnect: () => electron_1.ipcRenderer.invoke('tor:disconnect'),
        cancelConnect: () => electron_1.ipcRenderer.invoke('tor:cancel-connect'),
        newCircuit: () => electron_1.ipcRenderer.invoke('tor:new-circuit'),
        registerPartition: (partition) => electron_1.ipcRenderer.invoke('tor:register-partition', partition),
        unregisterPartition: (partition) => electron_1.ipcRenderer.invoke('tor:unregister-partition', partition),
        onStatusChange: callback => {
            const handler = (_event, status) => callback(status);
            electron_1.ipcRenderer.on('tor:status-change', handler);
            return () => electron_1.ipcRenderer.off('tor:status-change', handler);
        },
        onConnectionFailed: callback => {
            const handler = (_event, data) => callback(data.error);
            electron_1.ipcRenderer.on('tor:connection-failed', handler);
            return () => electron_1.ipcRenderer.off('tor:connection-failed', handler);
        },
        isTorMode: () => electron_1.ipcRenderer.invoke('tor:is-mode'),
        setTorMode: (enabled) => electron_1.ipcRenderer.invoke('tor:set-mode', enabled),
        addBridge: (bridge) => electron_1.ipcRenderer.invoke('tor:add-bridge', bridge),
        removeBridge: (address) => electron_1.ipcRenderer.invoke('tor:remove-bridge', address),
        setBridges: (bridges) => electron_1.ipcRenderer.invoke('tor:set-bridges', bridges),
        setBridgeType: (type) => electron_1.ipcRenderer.invoke('tor:set-bridge-type', type),
        setUseBridges: (enabled) => electron_1.ipcRenderer.invoke('tor:set-use-bridges', enabled),
        getBridgeType: () => electron_1.ipcRenderer.invoke('tor:get-bridge-type'),
        isUsingBridges: () => electron_1.ipcRenderer.invoke('tor:is-using-bridges'),
        getBridgesList: () => electron_1.ipcRenderer.invoke('tor:get-bridges'),
        // Onion utilities
        isOnionAddress: (url) => electron_1.ipcRenderer.invoke('tor:is-onion', url),
        ensureOnionUrl: (url) => electron_1.ipcRenderer.invoke('tor:ensure-onion-url', url),
        shouldUseTor: (url, torMode) => electron_1.ipcRenderer.invoke('tor:should-use-tor', url, torMode),
    },
    security: {
        getSettings: () => electron_1.ipcRenderer.invoke('security:get-settings'),
        updateSettings: updates => electron_1.ipcRenderer.invoke('security:update-settings', updates),
        getApiKey: () => electron_1.ipcRenderer.invoke('security:get-api-key'),
        setApiKey: key => electron_1.ipcRenderer.invoke('security:set-api-key', key),
        bypassUrl: url => electron_1.ipcRenderer.invoke('security:bypass-url', url),
        scanFile: (downloadId, filePath, filename) => electron_1.ipcRenderer.invoke('security:scan-file', downloadId, filePath, filename),
    },
    adblocker: {
        toggle: enabled => electron_1.ipcRenderer.invoke('adblocker:toggle', enabled),
        isEnabled: () => electron_1.ipcRenderer.invoke('adblocker:is-enabled'),
        getBlockedCount: () => electron_1.ipcRenderer.invoke('adblocker:get-blocked-count'),
        resetCount: () => electron_1.ipcRenderer.invoke('adblocker:reset-count'),
        onCountUpdated: callback => {
            const handler = (_event, count) => callback(count);
            electron_1.ipcRenderer.on('adblocker:count-updated', handler);
            return () => electron_1.ipcRenderer.off('adblocker:count-updated', handler);
        },
    },
    shortcuts: {
        onNewTab: (callback) => {
            const handler = () => callback();
            electron_1.ipcRenderer.on('shortcut:new-tab', handler);
            return () => electron_1.ipcRenderer.off('shortcut:new-tab', handler);
        },
        onNewIncognitoTab: (callback) => {
            const handler = () => callback();
            electron_1.ipcRenderer.on('shortcut:new-incognito-tab', handler);
            return () => electron_1.ipcRenderer.off('shortcut:new-incognito-tab', handler);
        },
        onCloseTab: (callback) => {
            const handler = () => callback();
            electron_1.ipcRenderer.on('shortcut:close-tab', handler);
            return () => electron_1.ipcRenderer.off('shortcut:close-tab', handler);
        },
        onHistory: (callback) => {
            const handler = () => callback();
            electron_1.ipcRenderer.on('shortcut:history', handler);
            return () => electron_1.ipcRenderer.off('shortcut:history', handler);
        },
        onToggleAI: (callback) => {
            const handler = () => callback();
            electron_1.ipcRenderer.on('shortcut:toggle-ai', handler);
            return () => electron_1.ipcRenderer.off('shortcut:toggle-ai', handler);
        },
        onOpenHUD: (callback) => {
            const handler = () => callback();
            electron_1.ipcRenderer.on('shortcut:open-hud', handler);
            return () => electron_1.ipcRenderer.off('shortcut:open-hud', handler);
        },
        onFind: (callback) => {
            const handler = () => callback();
            electron_1.ipcRenderer.on('shortcut:find', handler);
            return () => electron_1.ipcRenderer.off('shortcut:find', handler);
        },
        onPrint: (callback) => {
            const handler = () => callback();
            electron_1.ipcRenderer.on('shortcut:print', handler);
            return () => electron_1.ipcRenderer.off('shortcut:print', handler);
        },
        onZoomIn: (callback) => {
            const handler = () => callback();
            electron_1.ipcRenderer.on('shortcut:zoom-in', handler);
            return () => electron_1.ipcRenderer.off('shortcut:zoom-in', handler);
        },
        onZoomOut: (callback) => {
            const handler = () => callback();
            electron_1.ipcRenderer.on('shortcut:zoom-out', handler);
            return () => electron_1.ipcRenderer.off('shortcut:zoom-out', handler);
        },
        onZoomReset: (callback) => {
            const handler = () => callback();
            electron_1.ipcRenderer.on('shortcut:zoom-reset', handler);
            return () => electron_1.ipcRenderer.off('shortcut:zoom-reset', handler);
        },
        onDevTools: (callback) => {
            const handler = () => callback();
            electron_1.ipcRenderer.on('shortcut:devtools', handler);
            return () => electron_1.ipcRenderer.off('shortcut:devtools', handler);
        },
    },
    session: {
        getCookies: (partition) => electron_1.ipcRenderer.invoke('session:get-cookies', partition),
        deleteCookie: (url, name, partition) => electron_1.ipcRenderer.invoke('session:delete-cookie', url, name, partition),
        clearData: (origin, partition) => electron_1.ipcRenderer.invoke('session:clear-data', origin, partition),
        purgeIncognito: (partition) => electron_1.ipcRenderer.invoke('session:purge-incognito', partition),
    },
    vpn: {
        getStatus: () => electron_1.ipcRenderer.invoke('vpn:get-status'),
        getServers: () => electron_1.ipcRenderer.invoke('vpn:get-servers'),
        getPlans: () => electron_1.ipcRenderer.invoke('vpn:get-plans'),
        getSelectedServer: () => electron_1.ipcRenderer.invoke('vpn:get-selected-server'),
        getSelectedPlan: () => electron_1.ipcRenderer.invoke('vpn:get-selected-plan'),
        setServer: (countryCode) => electron_1.ipcRenderer.invoke('vpn:set-server', countryCode),
        setPlan: (planId) => electron_1.ipcRenderer.invoke('vpn:set-plan', planId),
        connect: () => electron_1.ipcRenderer.invoke('vpn:connect'),
        disconnect: () => electron_1.ipcRenderer.invoke('vpn:disconnect'),
        isModeEnabled: () => electron_1.ipcRenderer.invoke('vpn:is-mode-enabled'),
        setModeEnabled: (enabled) => electron_1.ipcRenderer.invoke('vpn:set-mode-enabled', enabled),
        isKillSwitchEnabled: () => electron_1.ipcRenderer.invoke('vpn:is-killswitch-enabled'),
        setKillSwitchEnabled: (enabled) => electron_1.ipcRenderer.invoke('vpn:set-killswitch-enabled', enabled),
        onStatusChange: (callback) => {
            const handler = (_event, status) => callback(status);
            electron_1.ipcRenderer.on('vpn:status-change', handler);
            return () => electron_1.ipcRenderer.off('vpn:status-change', handler);
        },
        onConnectionFailed: (callback) => {
            const handler = (_event, data) => callback(data.error);
            electron_1.ipcRenderer.on('vpn:connection-failed', handler);
            return () => electron_1.ipcRenderer.off('vpn:connection-failed', handler);
        }
    },
    shields: {
        getSiteShields: (domain) => electron_1.ipcRenderer.invoke('shields:get-site-shields', domain),
        updateSiteShields: (domain, updates) => electron_1.ipcRenderer.invoke('shields:update-site-shields', domain, updates),
        getStats: (domain) => electron_1.ipcRenderer.invoke('shields:get-stats', domain),
        getDetectedScripts: (domain) => electron_1.ipcRenderer.invoke('shields:get-detected-scripts', domain),
        updateScriptRule: (domain, scriptUrl, action) => electron_1.ipcRenderer.invoke('shields:update-script-rule', domain, scriptUrl, action),
        updateDomainRule: (domain, targetDomain, action) => electron_1.ipcRenderer.invoke('shields:update-domain-rule', domain, targetDomain, action),
        updateBlockedScripts: (domain, blockedUrls) => electron_1.ipcRenderer.invoke('shields:update-blocked-scripts', domain, blockedUrls),
        recordScript: (domain, scriptUrl, blocked) => electron_1.ipcRenderer.invoke('shields:record-script', domain, scriptUrl, blocked),
        onShieldsUpdated: (callback) => {
            const handler = (_event, data) => callback(data);
            electron_1.ipcRenderer.on('shields:stats-updated', handler);
            return () => electron_1.ipcRenderer.off('shields:stats-updated', handler);
        },
    },
    db: {
        getHistory: () => electron_1.ipcRenderer.invoke('db:get-history'),
        addHistory: (entry) => electron_1.ipcRenderer.invoke('db:add-history', entry),
        clearHistory: () => electron_1.ipcRenderer.invoke('db:clear-history'),
        deleteHistory: (id) => electron_1.ipcRenderer.invoke('db:delete-history', id),
        getBookmarks: () => electron_1.ipcRenderer.invoke('db:get-bookmarks'),
        addBookmark: (bookmark) => electron_1.ipcRenderer.invoke('db:add-bookmark', bookmark),
        deleteBookmark: (id) => electron_1.ipcRenderer.invoke('db:delete-bookmark', id),
    },
    showContextMenu: (params) => electron_1.ipcRenderer.send('context-menu:show', params),
    onTabCreateFromPopup: (callback) => {
        const handler = (_event, data) => callback(data);
        electron_1.ipcRenderer.on('tab:create-from-popup', handler);
        return () => electron_1.ipcRenderer.off('tab:create-from-popup', handler);
    },
    apiKeys: {
        getAll: () => electron_1.ipcRenderer.invoke('api-keys:get-all'),
        setAll: (keys) => electron_1.ipcRenderer.invoke('api-keys:set-all', keys),
    },
};
electron_1.contextBridge.exposeInMainWorld('electronAPI', electronAPI);
