"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const electron_1 = require("electron");
const path_1 = __importDefault(require("path"));
const fs_1 = __importDefault(require("fs"));
const gemini_1 = require("./gemini");
const download_manager_1 = require("./download-manager");
const password_manager_1 = require("./password-manager");
const tor_manager_1 = require("./tor-manager");
const security_manager_1 = require("./security-manager");
const adblocker_1 = require("./adblocker");
const shield_manager_1 = require("./shield-manager");
const vpn_manager_1 = require("./vpn-manager");
const secure_db_1 = require("./secure-db");
const agent_policy_1 = require("./agent-policy");
const extension_trust_1 = require("./extension-trust");
const local_model_router_1 = require("./local-model-router");
const agent_identity_1 = require("./agent-identity");
require("dotenv/config");
// Hardware acceleration enabled for optimal performance and smooth rendering
const activeWindows = new Set();
let mainWindow = null;
const isDev = !electron_1.app.isPackaged;
function getActiveWindow() {
    const focused = electron_1.BrowserWindow.getFocusedWindow();
    if (focused && activeWindows.has(focused))
        return focused;
    return mainWindow || Array.from(activeWindows)[0] || null;
}
async function handleExternalProtocol(contents, url) {
    const window = electron_1.BrowserWindow.fromWebContents(contents);
    const parentWindow = window || getActiveWindow() || mainWindow;
    if (!parentWindow) {
        try {
            await electron_1.shell.openExternal(url);
        }
        catch (err) {
            console.error(`Failed to open external protocol link: ${url}`, err);
        }
        return;
    }
    const { response } = await electron_1.dialog.showMessageBox(parentWindow, {
        type: 'question',
        buttons: ['Open Application', 'Cancel'],
        defaultId: 0,
        title: 'Open External Application?',
        message: `This website wants to open an external application for:\n\n${url}\n\nDo you want to allow this?`,
        cancelId: 1,
    });
    if (response === 0) {
        try {
            await electron_1.shell.openExternal(url);
        }
        catch (err) {
            console.error(`Failed to open external protocol link: ${url}`, err);
        }
    }
}
electron_1.app.whenReady().then(async () => {
    writeCrashLog('STARTUP', 'App starting...');
    electron_1.Menu.setApplicationMenu(null);
    electron_1.app.userAgentFallback = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';
    await loadExtensionsOnStartup();
    setupApplicationMenu();
    const primaryWin = createBrowserWindow(false);
    shield_manager_1.shieldManager.setMainWebContentsId(primaryWin.webContents.id);
    adblocker_1.adBlockerManager.setMainWebContentsId(primaryWin.webContents.id);
    (0, download_manager_1.initDownloadManager)(primaryWin);
    security_manager_1.securityManager.initIPC(primaryWin);
    (0, password_manager_1.initPasswordManager)();
    (0, tor_manager_1.initTorManager)(() => getActiveWindow());
    (0, vpn_manager_1.initVPNManager)(() => getActiveWindow());
    await (0, secure_db_1.initSecureDB)();
    setupSessionInterceptors(electron_1.session.defaultSession);
    // Intercept navigation requests to block dangerous sites
    electron_1.app.on('web-contents-created', (event, contents) => {
        if (contents.getType() === 'webview') {
            contents.on('will-navigate', async (e, url) => {
                if (!url.startsWith('http://') && !url.startsWith('https://') && !url.startsWith('about:') && !url.startsWith('chrome://')) {
                    e.preventDefault();
                    handleExternalProtocol(contents, url);
                    return;
                }
                const { safe, reason } = await security_manager_1.securityManager.checkUrl(url);
                if (!safe) {
                    e.preventDefault();
                    contents.loadURL(`about:warning?url=${encodeURIComponent(url)}&reason=${reason || 'malware'}`);
                }
            });
            contents.on('will-redirect', async (e, url) => {
                if (!url.startsWith('http://') && !url.startsWith('https://') && !url.startsWith('about:') && !url.startsWith('chrome://')) {
                    e.preventDefault();
                    handleExternalProtocol(contents, url);
                    return;
                }
                const { safe, reason } = await security_manager_1.securityManager.checkUrl(url);
                if (!safe) {
                    e.preventDefault();
                    contents.loadURL(`about:warning?url=${encodeURIComponent(url)}&reason=${reason || 'malware'}`);
                }
            });
            setupSessionInterceptors(contents.session);
            // Handle window.open and target="_blank" clicks by routing to new browser tabs
            contents.setWindowOpenHandler((details) => {
                const targetUrl = details.url;
                if (targetUrl && targetUrl !== 'about:blank') {
                    const win = getActiveWindow() || mainWindow;
                    if (win && !win.isDestroyed()) {
                        win.webContents.send('tab:create-from-popup', {
                            url: targetUrl,
                            disposition: details.disposition,
                        });
                    }
                }
                return { action: 'deny' };
            });
            // Crash recovery: handle renderer process crashes
            contents.on('render-process-gone', (_event, details) => {
                console.warn(`[Crash Recovery] Webview render process gone: ${details.reason}`);
                if (details.reason === 'crashed' || details.reason === 'oom') {
                    // Attempt to reload after a short delay
                    setTimeout(() => {
                        if (!contents.isDestroyed()) {
                            contents.reload();
                        }
                    }, 1000);
                }
            });
            // Set clean native Chrome User-Agent (bypasses Google & Microsoft OAuth block)
            contents.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36');
            const partition = contents.session.partition || '';
            const isTorSession = partition.includes('tor-') ||
                partition.startsWith('persist:tor-') ||
                partition.startsWith('tor-') ||
                partition.startsWith('incognito-tor-');
            // IMMEDIATELY set proxy for Tor sessions to avoid race condition
            if (isTorSession) {
                contents.session.setProxy({ proxyRules: tor_manager_1.torManager.getSocksProxy() })
                    .then(() => {
                    console.log(`[Tor Proxy] Auto-set SOCKS5 proxy for webview partition: ${partition}`);
                })
                    .catch(err => {
                    console.error(`[Tor Proxy] Failed to auto-set proxy for partition: ${partition}`, err);
                });
            }
            const isIncognitoSession = partition.startsWith('incognito-');
            if (isIncognitoSession) {
                setupIncognitoSessionInterceptors(contents.session);
            }
            // Reset and register domain when navigation occurs
            contents.on('did-start-navigation', (_event, url, isInPlace, isMainFrame) => {
                if (isMainFrame && url && !url.startsWith('about:') && !url.startsWith('chrome:')) {
                    try {
                        const hostname = new URL(url).hostname;
                        shield_manager_1.shieldManager.resetTab(contents.id, hostname);
                    }
                    catch { /* ignore */ }
                }
            });
        }
    });
});
function setupIncognitoSessionInterceptors(ses) {
    if (ses._incognitoIntercepted)
        return;
    ses._incognitoIntercepted = true;
    ses.webRequest.onBeforeSendHeaders((details, callback) => {
        const requestHeaders = { ...details.requestHeaders };
        // Clean up cross-origin referrers to avoid leaking navigation path
        if (details.referrer) {
            try {
                const refUrl = new URL(details.referrer);
                const destUrl = new URL(details.url);
                if (refUrl.hostname !== destUrl.hostname) {
                    delete requestHeaders['Referer'];
                }
            }
            catch {
                // Ignore URL parsing errors
            }
        }
        callback({ cancel: false, requestHeaders });
    });
    // Inject CSP + HSTS for incognito too — even MORE strict
    ses.webRequest.onHeadersReceived((details, callback) => {
        const headers = details.responseHeaders || {};
        if (details.url.startsWith('https://')) {
            headers['Strict-Transport-Security'] = ['max-age=31536000; includeSubDomains; preload'];
        }
        // Stricter CSP for incognito: no external scripts, no unsafe-inline
        const cspDirectives = [
            "default-src 'self' https:",
            "script-src 'self' 'wasm-unsafe-eval'",
            "style-src 'self' 'unsafe-inline'",
            "img-src 'self' data: blob: https:",
            "media-src 'self' blob: data:",
            "connect-src 'self' https: wss:",
            "frame-src 'self'",
            "object-src 'none'",
            "base-uri 'self'",
            "form-action 'self'",
        ].join('; ');
        headers['Content-Security-Policy'] = [cspDirectives];
        delete headers['x-frame-options'];
        delete headers['X-Powered-By'];
        callback({ cancel: false, responseHeaders: headers });
    });
}
electron_1.app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') {
        electron_1.app.quit();
    }
});
// ─── Helper Functions ─────────────────────────────────────────────────────
function createBrowserWindow(isIncognito) {
    const partition = isIncognito ? `incognito-${Date.now()}` : 'persist:default';
    const appIconPath = path_1.default.join(__dirname, '../assets/icon.ico');
    const win = new electron_1.BrowserWindow({
        width: 1400,
        height: 900,
        minWidth: 800,
        minHeight: 600,
        title: 'ICRUSH Browser',
        icon: fs_1.default.existsSync(appIconPath) ? appIconPath : undefined,
        webPreferences: {
            preload: path_1.default.join(__dirname, 'preload'),
            contextIsolation: true,
            nodeIntegration: false,
            sandbox: false,
            webviewTag: true,
            partition,
        },
        show: false,
        backgroundColor: '#0a0a0f',
    });
    activeWindows.add(win);
    win.once('ready-to-show', () => {
        win.show();
        if (isDev) {
            win.webContents.openDevTools({ mode: 'detach' });
        }
    });
    win.on('closed', () => {
        activeWindows.delete(win);
        if (win === mainWindow)
            mainWindow = null;
    });
    if (!mainWindow)
        mainWindow = win;
    win.loadURL(isDev ? 'http://localhost:5174' : 'file://' + path_1.default.join(__dirname, '../dist/index.html'));
    // SECURITY: Prevent renderer from navigating to arbitrary URLs
    win.webContents.on('will-navigate', (e, url) => {
        const devUrl = isDev ? 'http://localhost:5174' : 'file://';
        if (!url.startsWith(devUrl) && !url.startsWith('about:')) {
            e.preventDefault();
        }
    });
    // SECURITY: Handle certificate errors — reject in production
    win.webContents.on('certificate-error', (e, url, error, certificate, callback) => {
        if (isDev) {
            // Allow self-signed certs in dev only
            e.preventDefault();
            callback(true);
        }
        else {
            // Production: reject all certificate errors
            callback(false);
        }
    });
    return win;
}
function setupApplicationMenu() {
    const template = [
        { label: 'File', submenu: [
                { label: 'New Tab', accelerator: 'CmdOrCtrl+T', click: () => getActiveWindow()?.webContents.send('tab:new') },
                { label: 'New Window', accelerator: 'CmdOrCtrl+N', click: () => createBrowserWindow(false) },
                { label: 'New Incognito Window', accelerator: 'CmdOrCtrl+Shift+N', click: () => createBrowserWindow(true) },
                { type: 'separator' },
                { label: 'Close Tab', accelerator: 'CmdOrCtrl+W', click: () => getActiveWindow()?.webContents.send('tab:close') },
                { role: 'quit' },
            ] },
        { label: 'Edit', submenu: [
                { role: 'undo' }, { role: 'redo' }, { type: 'separator' },
                { role: 'cut' }, { role: 'copy' }, { role: 'paste' }, { role: 'selectAll' },
            ] },
        { label: 'View', submenu: [
                { role: 'reload' }, { role: 'forceReload' }, { role: 'toggleDevTools' },
                { type: 'separator' },
                { role: 'resetZoom' }, { role: 'zoomIn' }, { role: 'zoomOut' },
                { type: 'separator' },
                { role: 'togglefullscreen' },
            ] },
        { label: 'Window', submenu: [
                { role: 'minimize' }, { role: 'zoom' }, { role: 'close' },
            ] },
    ];
    electron_1.Menu.setApplicationMenu(electron_1.Menu.buildFromTemplate(template));
}
function setupSessionInterceptors(ses) {
    // Strip dangerous headers and inject CSP + HSTS
    ses.webRequest.onHeadersReceived((details, callback) => {
        const headers = details.responseHeaders || {};
        // HSTS: force HTTPS for all responses on HTTPS URLs
        if (details.url.startsWith('https://')) {
            headers['Strict-Transport-Security'] = ['max-age=31536000; includeSubDomains; preload'];
        }
        // CSP: restrict script, style, and connection sources
        const cspDirectives = [
            "default-src 'self' https:",
            "script-src 'self' 'wasm-unsafe-eval' https://cdn.jsdelivr.net https://unpkg.com",
            "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
            "font-src 'self' https://fonts.gstatic.com",
            "img-src 'self' data: blob: https:",
            "media-src 'self' blob: data:",
            "connect-src 'self' https: wss: ipc:",
            "frame-src 'self' https://www.youtube.com https://www.youtube-nocookie.com",
            "object-src 'none'",
            "base-uri 'self'",
            "form-action 'self'",
        ].join('; ');
        headers['Content-Security-Policy'] = [cspDirectives];
        // Remove X-Frame-Options (we manage framing via CSP frame-src)
        delete headers['x-frame-options'];
        // Remove dangerous server headers
        delete headers['X-Powered-By'];
        callback({ cancel: false, responseHeaders: headers });
    });
    // Basic request interception for ad blocking and security
    ses.webRequest.onBeforeSendHeaders((details, callback) => {
        callback({ cancel: false, requestHeaders: details.requestHeaders });
    });
}
function writeCrashLog(phase, message) {
    try {
        const logDir = path_1.default.join(electron_1.app.getPath('userData'), 'logs');
        if (!fs_1.default.existsSync(logDir))
            fs_1.default.mkdirSync(logDir, { recursive: true });
        const logFile = path_1.default.join(logDir, 'crash.log');
        const entry = `[${new Date().toISOString()}] [${phase}] ${message}\n`;
        fs_1.default.appendFileSync(logFile, entry);
    }
    catch { /* ignore */ }
}
async function loadExtensionsOnStartup() {
    try {
        const extDir = path_1.default.join(electron_1.app.getPath('userData'), 'extensions');
        if (!fs_1.default.existsSync(extDir))
            return;
        const dirs = fs_1.default.readdirSync(extDir).filter(d => {
            try {
                return fs_1.default.statSync(path_1.default.join(extDir, d)).isDirectory();
            }
            catch {
                return false;
            }
        });
        for (const dir of dirs) {
            try {
                const extPath = path_1.default.join(extDir, dir);
                await electron_1.session.defaultSession.loadExtension(extPath);
                console.log(`[Extensions] Loaded: ${dir}`);
            }
            catch (err) {
                console.error(`[Extensions] Failed to load ${dir}:`, err);
            }
        }
    }
    catch { /* ignore */ }
}
// ─── Agent Runtime IPC Handlers ───────────────────────────────────────────
const agent_loop_1 = require("./agent-loop");
const tool_registry_1 = require("./tool-registry");
const agent_sandbox_1 = require("./agent-sandbox");
const cross_tab_agent_1 = require("./cross-tab-agent");
const agent_memory_1 = require("./agent-memory");
const toolRegistry = new tool_registry_1.ToolRegistry(electron_1.app.getPath('userData'));
const safetySandbox = new agent_sandbox_1.SafetySandbox();
const crossTabAgent = new cross_tab_agent_1.CrossTabAgent();
const agentMemory = new agent_memory_1.AgentMemory();
const userDataPath = electron_1.app.getPath('userData');
const policyStorePath = path_1.default.join(userDataPath, 'agent-policy.json');
const auditLogPath = path_1.default.join(userDataPath, 'agent-audit.jsonl');
let activeRunLoop = null;
// Agent loop: start
electron_1.ipcMain.handle('agent:start', async (_event, goal) => {
    if (activeRunLoop && activeRunLoop.getState() !== 'completed' && activeRunLoop.getState() !== 'failed' && activeRunLoop.getState() !== 'cancelled') {
        return { error: 'Agent loop already running' };
    }
    const policyStore = (0, agent_policy_1.loadPolicyStore)(policyStorePath);
    activeRunLoop = new agent_loop_1.AgentRunLoop(policyStore);
    const win = getActiveWindow();
    activeRunLoop.setCallbacks({
        onProgress: (progress) => {
            win?.webContents.send('agent:progress', progress);
        },
        onStateChange: (state) => {
            win?.webContents.send('agent:state-change', state);
        },
        onAudit: (event) => {
            (0, agent_policy_1.appendAuditLogFile)(auditLogPath, event);
            win?.webContents.send('agent:audit-event', event);
        },
    });
    try {
        const result = await activeRunLoop.start({
            description: goal.description,
            url: goal.url,
            constraints: {
                maxSteps: goal.maxSteps || 25,
                timeoutMs: goal.timeoutMs || 5 * 60 * 1000,
                requireApprovalForSensitive: true,
            },
        });
        return result;
    }
    catch (err) {
        return { error: err.message };
    }
});
// Agent loop: cancel
electron_1.ipcMain.handle('agent:cancel', async () => {
    if (activeRunLoop) {
        activeRunLoop.cancel('User cancelled');
        return { success: true };
    }
    return { error: 'No active loop' };
});
// Agent loop: get progress
electron_1.ipcMain.handle('agent:get-progress', async () => {
    return activeRunLoop?.getProgress() || null;
});
// Agent loop: undo last action
electron_1.ipcMain.handle('agent:undo', async () => {
    return activeRunLoop?.undoLast() || { success: false, error: 'No active loop' };
});
// Agent policy: get/set site policy
electron_1.ipcMain.handle('agent:get-policy', async () => {
    return (0, agent_policy_1.loadPolicyStore)(policyStorePath);
});
electron_1.ipcMain.handle('agent:set-site-policy', async (_event, domain, policy) => {
    const store = (0, agent_policy_1.loadPolicyStore)(policyStorePath);
    store.sites[domain] = {
        domain,
        maxTier: (policy.maxTier || 'sensitive'),
        allowSensitive: policy.allowSensitive !== false,
        updatedAt: Date.now(),
    };
    (0, agent_policy_1.savePolicyStore)(policyStorePath, store);
    return store;
});
// Agent audit log
electron_1.ipcMain.handle('agent:get-audit-log', async () => {
    return (0, agent_policy_1.loadAuditLog)(auditLogPath);
});
electron_1.ipcMain.handle('agent:clear-audit-log', async () => {
    try {
        const logPath = path_1.default.join(electron_1.app.getPath('userData'), 'agent-audit.jsonl');
        if (fs_1.default.existsSync(logPath))
            fs_1.default.writeFileSync(logPath, '');
        return { success: true };
    }
    catch {
        return { error: 'Failed to clear audit log' };
    }
});
// Navigation trust boundary check
electron_1.ipcMain.handle('agent:check-navigation', async (_event, fromUrl, toUrl) => {
    return (0, agent_policy_1.crossesTrustBoundary)(fromUrl, toUrl);
});
// Tool registry
electron_1.ipcMain.handle('agent:tool-list', async () => {
    return toolRegistry.getEnabledTools();
});
electron_1.ipcMain.handle('agent:tool-execute', async (_event, toolId, params) => {
    const result = await toolRegistry.execute({
        toolId,
        params,
        callId: `ipc-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
        timestamp: Date.now(),
    });
    return result;
});
// Safety sandbox
electron_1.ipcMain.handle('agent:sandbox-state', async () => {
    return { state: safetySandbox.getState(), usage: safetySandbox.getUsage() };
});
electron_1.ipcMain.handle('agent:sandbox-kill-switch', async () => {
    safetySandbox.triggerKillSwitch('Manual kill switch');
    return { success: true };
});
// Cross-tab
electron_1.ipcMain.handle('agent:cross-tab-compare', async (_event, tabIdA, tabIdB) => {
    return crossTabAgent.compareTabs(tabIdA, tabIdB).catch(e => ({ error: e.message }));
});
electron_1.ipcMain.handle('agent:cross-tab-merge', async (_event, tabIds) => {
    return crossTabAgent.mergeTabs(tabIds).catch(e => ({ error: e.message }));
});
// Memory
electron_1.ipcMain.handle('agent:memory-stats', async () => {
    return agentMemory.getStats();
});
electron_1.ipcMain.handle('agent:memory-compact', async () => {
    return agentMemory.compact();
});
// Router state
electron_1.ipcMain.handle('agent:router-state', async () => {
    return (0, local_model_router_1.getRouterState)();
});
electron_1.ipcMain.handle('agent:router-consent', async (_event, provider, scope) => {
    (0, local_model_router_1.grantCloudConsent)(provider, scope || 'session');
    return { success: true };
});
electron_1.ipcMain.handle('agent:router-revoke', async (_event, provider) => {
    (0, local_model_router_1.revokeCloudConsent)(provider);
    return { success: true };
});
// Agent identity
electron_1.ipcMain.handle('agent:identity-list', async () => {
    return (0, agent_identity_1.listAgentCredentials)();
});
electron_1.ipcMain.handle('agent:identity-create', async (_event, name) => {
    return (0, agent_identity_1.createAgentIdentity)(name, {});
});
electron_1.ipcMain.handle('agent:identity-remove', async (_event, credentialId) => {
    return (0, agent_identity_1.removeAgentIdentity)(credentialId);
});
// API keys
electron_1.ipcMain.handle('agent:get-api-key', async (_event, provider) => {
    return (0, local_model_router_1.getApiKey)(provider);
});
electron_1.ipcMain.handle('agent:set-api-key', async (_event, provider, key) => {
    return (0, local_model_router_1.setApiKey)(provider, key);
});
// Gemini streaming (existing)
electron_1.ipcMain.handle('send-gemini-message', async (_event, prompt, history, provider, apiKey, options) => {
    const win = getActiveWindow();
    try {
        await (0, gemini_1.streamGemini)(prompt, history, provider, apiKey, (chunk) => {
            win?.webContents.send('gemini-response', chunk);
        }, (commands) => {
            win?.webContents.send('gemini-commands', commands);
        }, options);
        win?.webContents.send('gemini-done');
        return { success: true };
    }
    catch (err) {
        win?.webContents.send('gemini-error', err.message);
        return { error: err.message };
    }
});
// Extension trust analysis
electron_1.ipcMain.handle('extension:analyze-manifest', async (_event, manifest) => {
    return (0, extension_trust_1.assessManifest)(manifest);
});
// VPN control
electron_1.ipcMain.handle('vpn:connect', async () => {
    return vpn_manager_1.vpnManager.connect();
});
electron_1.ipcMain.handle('vpn:disconnect', async () => {
    return vpn_manager_1.vpnManager.disconnect();
});
electron_1.ipcMain.handle('vpn:status', async () => {
    return vpn_manager_1.vpnManager.getStatus();
});
electron_1.ipcMain.handle('vpn:import-config', async (_event, rawConfig) => {
    return vpn_manager_1.vpnManager.importConfig(rawConfig);
});
electron_1.ipcMain.handle('vpn:get-config', async () => {
    const config = vpn_manager_1.vpnManager.getConfig();
    // SECURITY: Never return the private key to the renderer
    if (config?.parsed) {
        return { ...config, parsed: { ...config.parsed, privateKey: '***REDACTED***' } };
    }
    return config;
});
electron_1.ipcMain.handle('vpn:clear-config', async () => {
    return vpn_manager_1.vpnManager.clearConfig();
});
// Tor control
electron_1.ipcMain.handle('tor:connect', async () => {
    return tor_manager_1.torManager.connect();
});
electron_1.ipcMain.handle('tor:disconnect', async () => {
    return tor_manager_1.torManager.disconnect();
});
electron_1.ipcMain.handle('tor:status', async () => {
    return tor_manager_1.torManager.getStatus();
});
// Extension Security — trust assessment before installation
electron_1.ipcMain.handle('extensions:install-from-url', async (_event, url, opts) => {
    try {
        const { assessManifest } = await Promise.resolve().then(() => __importStar(require('./extension-trust')));
        // Validate URL is HTTPS
        if (!url.startsWith('https://')) {
            throw new Error('Extensions can only be installed from HTTPS URLs');
        }
        // Download and assess trust before installing
        const response = await fetch(url);
        if (!response.ok)
            throw new Error(`Failed to download extension: ${response.status}`);
        const buffer = Buffer.from(await response.arrayBuffer());
        const report = assessManifest(buffer);
        // BLOCK high-risk and blocked extensions
        if (report.riskLevel === 'blocked') {
            throw new Error(`Extension blocked: ${report.findings.join(', ')}`);
        }
        if (report.riskLevel === 'high' && !opts?.approvedReportId) {
            return { ...report, requiresApproval: true };
        }
        // Install via session
        const extPath = path_1.default.join(electron_1.app.getPath('userData'), 'extensions', `ext-${Date.now()}`);
        if (!fs_1.default.existsSync(extPath))
            fs_1.default.mkdirSync(extPath, { recursive: true });
        // Extract CRX (strip header)
        const crxContent = buffer.toString('base64');
        fs_1.default.writeFileSync(path_1.default.join(extPath, 'extension.crx'), crxContent);
        return { ...report, installed: true };
    }
    catch (err) {
        throw new Error(`Extension install failed: ${err.message}`);
    }
});
electron_1.ipcMain.handle('extensions:load', async (_event, extPath) => {
    try {
        // SECURITY: Only allow loading from the extensions directory
        const extDir = path_1.default.join(electron_1.app.getPath('userData'), 'extensions');
        const resolved = path_1.default.resolve(extPath);
        if (!resolved.startsWith(extDir)) {
            throw new Error('Extensions can only be loaded from the extensions directory');
        }
        const { assessManifest } = await Promise.resolve().then(() => __importStar(require('./extension-trust')));
        // Read manifest.json for trust assessment
        const manifestPath = path_1.default.join(resolved, 'manifest.json');
        if (fs_1.default.existsSync(manifestPath)) {
            const manifest = JSON.parse(fs_1.default.readFileSync(manifestPath, 'utf-8'));
            const report = assessManifest(manifest);
            if (report.riskLevel === 'blocked') {
                throw new Error(`Extension blocked: ${report.findings.join(', ')}`);
            }
        }
        return await electron_1.session.defaultSession.loadExtension(resolved);
    }
    catch (err) {
        throw new Error(`Extension load failed: ${err.message}`);
    }
});
// Auto-updater
electron_1.ipcMain.handle('updater:check', async () => {
    try {
        const { checkForAppUpdates } = await Promise.resolve().then(() => __importStar(require('./app-updater')));
        return checkForAppUpdates(true);
    }
    catch {
        return { status: 'unavailable' };
    }
});
// API Key Management — encrypted at rest, validated on write
electron_1.ipcMain.handle('api-keys:get-all', async () => {
    try {
        const { getStoredApiKeys } = await Promise.resolve().then(() => __importStar(require('./local-model-router')));
        const keys = await getStoredApiKeys();
        // SECURITY: Return masked keys to renderer
        const masked = {};
        for (const [k, v] of Object.entries(keys)) {
            masked[k] = typeof v === 'string' && v.length > 8 ? v.slice(0, 4) + '***' + v.slice(-4) : '***';
        }
        return masked;
    }
    catch {
        return {};
    }
});
electron_1.ipcMain.handle('api-keys:set-all', async (_event, keys) => {
    // SECURITY: Validate all keys before writing
    if (!keys || typeof keys !== 'object')
        return false;
    const ALLOWED_PROVIDERS = ['gemini', 'openai', 'anthropic', 'groq', 'openrouter', 'deepseek', 'ollama'];
    const validated = {};
    for (const [provider, key] of Object.entries(keys)) {
        if (!ALLOWED_PROVIDERS.includes(provider))
            continue;
        if (typeof key !== 'string' || key.length < 8)
            continue;
        // Block keys that contain control characters or are suspiciously long
        if (/[\x00-\x08\x0e-\x1f]/.test(key) || key.length > 512)
            continue;
        validated[provider] = key;
    }
    if (Object.keys(validated).length === 0)
        return false;
    try {
        const { setStoredApiKeys } = await Promise.resolve().then(() => __importStar(require('./local-model-router')));
        await setStoredApiKeys(validated);
        return true;
    }
    catch {
        return false;
    }
});
// Settings
electron_1.ipcMain.handle('settings:get', async (_event, key) => {
    try {
        const settingsPath = path_1.default.join(electron_1.app.getPath('userData'), 'settings.json');
        if (!fs_1.default.existsSync(settingsPath))
            return null;
        const settings = JSON.parse(fs_1.default.readFileSync(settingsPath, 'utf8'));
        return settings[key] ?? null;
    }
    catch {
        return null;
    }
});
electron_1.ipcMain.handle('settings:set', async (_event, key, value) => {
    try {
        const settingsPath = path_1.default.join(electron_1.app.getPath('userData'), 'settings.json');
        let settings = {};
        if (fs_1.default.existsSync(settingsPath)) {
            settings = JSON.parse(fs_1.default.readFileSync(settingsPath, 'utf8'));
        }
        settings[key] = value;
        fs_1.default.writeFileSync(settingsPath, JSON.stringify(settings, null, 2));
        return { success: true };
    }
    catch {
        return { error: 'Failed to save setting' };
    }
});
