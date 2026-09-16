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
const gemini_js_1 = require("./gemini.js");
const generative_ai_1 = require("@google/generative-ai");
const download_manager_js_1 = require("./download-manager.js");
const password_manager_js_1 = require("./password-manager.js");
const tor_manager_js_1 = require("./tor-manager.js");
const security_manager_js_1 = require("./security-manager.js");
const adblocker_js_1 = require("./adblocker.js");
const shield_manager_js_1 = require("./shield-manager.js");
const vpn_manager_js_1 = require("./vpn-manager.js");
const secure_db_js_1 = require("./secure-db.js");
const ipc_validators_js_1 = require("./ipc-validators.js");
const agent_engine_js_1 = require("./agent-engine.js");
const agent_memory_vault_js_1 = require("./agent-memory-vault.js");
const agent_undo_stack_js_1 = require("./agent-undo-stack.js");
const mcp_bridge_js_1 = require("./mcp-bridge.js");
const sub_agent_pool_js_1 = require("./sub-agent-pool.js");
const agent_scheduler_js_1 = require("./agent-scheduler.js");
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
const extensionsConfigPath = path_1.default.join(electron_1.app.getPath('userData'), 'extensions-config.json');
function getSavedExtensions() {
    try {
        if (fs_1.default.existsSync(extensionsConfigPath)) {
            return JSON.parse(fs_1.default.readFileSync(extensionsConfigPath, 'utf8'));
        }
    }
    catch (err) {
        console.error('Failed to read extensions config:', err);
    }
    return [];
}
function saveExtensions(extensions) {
    try {
        fs_1.default.writeFileSync(extensionsConfigPath, JSON.stringify(extensions, null, 2), 'utf8');
    }
    catch (err) {
        console.error('Failed to write extensions config:', err);
    }
}
async function loadExtensionsOnStartup() {
    const list = getSavedExtensions();
    for (const ext of list) {
        if (ext.enabled) {
            try {
                await electron_1.session.defaultSession.loadExtension(ext.path, { allowFileAccess: true });
                console.log(`Loaded extension on startup: ${ext.name} (${ext.id})`);
            }
            catch (err) {
                console.error(`Failed to load extension at ${ext.path} on startup:`, err);
            }
        }
    }
}
function setupApplicationMenu() {
    // Menu disabled; accelerators handled by global keyboard listeners in renderer
    electron_1.Menu.setApplicationMenu(null);
}
function createBrowserWindow(isIncognito = false) {
    // Content Security Policy - strict in production, relaxed in dev for Vite HMR
    const isDevMode = !electron_1.app.isPackaged;
    const csp = isDevMode ? [
        "default-src 'self' data: blob: http://localhost:*;",
        "script-src 'self' 'unsafe-inline' 'unsafe-eval' http://localhost:*;",
        "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com;",
        "font-src 'self' data: https://fonts.gstatic.com;",
        "img-src 'self' data: blob: https:;",
        "connect-src 'self' http://localhost:* ws://localhost:* https://generativelanguage.googleapis.com https://api.openai.com https://api.groq.com https://openrouter.ai https://api.anthropic.com https://www.virustotal.com;",
        "frame-src 'self';",
        "media-src 'self' blob:;",
        "worker-src 'self' blob:;",
    ].join(' ') : [
        "default-src 'self' data: blob:;",
        "script-src 'self';",
        "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com;",
        "font-src 'self' data: https://fonts.gstatic.com;",
        "img-src 'self' data: blob: https:;",
        "connect-src 'self' https://generativelanguage.googleapis.com https://api.openai.com https://api.groq.com https://openrouter.ai https://api.anthropic.com https://www.virustotal.com;",
        "frame-src 'self';",
        "media-src 'self' blob:;",
        "worker-src 'self' blob:;",
    ].join(' ');
    const partition = isIncognito ? `incognito-${Date.now()}-${Math.random().toString(36).slice(2)}` : undefined;
    const win = new electron_1.BrowserWindow({
        width: 1600,
        height: 1000,
        title: isIncognito ? 'ICRUSH BROWSER (Incognito)' : 'ICRUSH BROWSER',
        icon: path_1.default.join(__dirname, '..', 'assets', 'icon.png'),
        show: false,
        autoHideMenuBar: true,
        webPreferences: {
            preload: path_1.default.join(__dirname, 'preload.js'),
            webviewTag: true,
            contextIsolation: true,
            nodeIntegration: false,
            sandbox: true, // Enable sandbox for additional security
            webSecurity: true,
            allowRunningInsecureContent: false,
            experimentalFeatures: false,
            partition: partition, // Apply in-memory partition for incognito
        },
        backgroundColor: isIncognito ? '#09090b' : '#0c0c0e',
    });
    win.setMenu(null);
    win.setMenuBarVisibility(false);
    win.setAutoHideMenuBar(true);
    activeWindows.add(win);
    if (!mainWindow) {
        mainWindow = win;
        adblocker_js_1.adBlockerManager.setMainWebContentsId(win.webContents.id);
    }
    // Set CSP header (only apply to the main browser UI window)
    const currentSession = isIncognito ? electron_1.session.fromPartition(partition) : electron_1.session.defaultSession;
    // Remove any previous CSP listener to prevent stacking
    currentSession.webRequest.onHeadersReceived(null);
    currentSession.webRequest.onHeadersReceived((details, callback) => {
        if (details.webContentsId === win.webContents.id) {
            callback({
                responseHeaders: {
                    ...details.responseHeaders,
                    'Content-Security-Policy': [csp],
                    'X-Content-Type-Options': ['nosniff'],
                    'X-Frame-Options': ['DENY'],
                    'X-XSS-Protection': ['1; mode=block'],
                    'Referrer-Policy': ['strict-origin-when-cross-origin'],
                },
            });
        }
        else {
            callback({ responseHeaders: details.responseHeaders });
        }
    });
    const queryStr = isIncognito ? '?incognito=true' : '';
    if (isDev) {
        win.loadURL(`http://localhost:5174${queryStr}`);
        if (!isIncognito) {
            win.webContents.openDevTools({ mode: 'detach' });
        }
    }
    else {
        win.loadFile(path_1.default.join(__dirname, '../dist/index.html'), { query: { incognito: isIncognito ? 'true' : 'false' } });
    }
    win.removeMenu();
    win.setMenu(null);
    win.setMenuBarVisibility(false);
    win.setAutoHideMenuBar(true);
    win.once('ready-to-show', () => {
        win.show();
    });
    win.on('closed', () => {
        activeWindows.delete(win);
        if (mainWindow === win) {
            mainWindow = Array.from(activeWindows)[0] || null;
        }
    });
    return win;
}
// Set global WebRTC IP handling policy switch to prevent local/public IP leaks on all sessions
electron_1.app.commandLine.appendSwitch('force-webrtc-ip-handling-policy', 'disable_non_proxied_udp');
electron_1.app.whenReady().then(async () => {
    electron_1.Menu.setApplicationMenu(null);
    electron_1.app.userAgentFallback = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';
    await loadExtensionsOnStartup();
    setupApplicationMenu();
    const primaryWin = createBrowserWindow(false);
    shield_manager_js_1.shieldManager.setMainWebContentsId(primaryWin.webContents.id);
    adblocker_js_1.adBlockerManager.setMainWebContentsId(primaryWin.webContents.id);
    (0, download_manager_js_1.initDownloadManager)(primaryWin);
    security_manager_js_1.securityManager.initIPC(primaryWin);
    (0, password_manager_js_1.initPasswordManager)();
    (0, tor_manager_js_1.initTorManager)(() => getActiveWindow());
    (0, vpn_manager_js_1.initVPNManager)(() => getActiveWindow());
    await (0, secure_db_js_1.initSecureDB)();
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
                const { safe, reason } = await security_manager_js_1.securityManager.checkUrl(url);
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
                const { safe, reason } = await security_manager_js_1.securityManager.checkUrl(url);
                if (!safe) {
                    e.preventDefault();
                    contents.loadURL(`about:warning?url=${encodeURIComponent(url)}&reason=${reason || 'malware'}`);
                }
            });
        }
    });
});
// Tor session tracking for proxy routing and kill switch
const torPartitions = new Set();
// Register a partition for Tor proxy routing (called from renderer)
electron_1.ipcMain.handle('tor:register-partition', async (_event, partition) => {
    const valid = (0, ipc_validators_js_1.validatePartition)(partition);
    if (!valid.success) {
        console.error(`[Tor Proxy] Invalid partition: ${valid.error}`);
        return false;
    }
    const isTor = valid.data.includes('tor-');
    if (!isTor) {
        try {
            const sess = valid.data.startsWith('persist:') || valid.data.startsWith('incognito-')
                ? electron_1.session.fromPartition(valid.data)
                : electron_1.session.fromPartition(`persist:${valid.data}`);
            await sess.setProxy({ mode: 'direct' });
            console.log(`[Proxy] Direct mode set for non-Tor partition: ${valid.data}`);
            return true;
        }
        catch (err) {
            console.error(`[Proxy] Failed to set direct mode for partition: ${valid.data}`, err);
            return false;
        }
    }
    torPartitions.add(valid.data);
    try {
        const sess = valid.data.startsWith('persist:') || valid.data.startsWith('incognito-')
            ? electron_1.session.fromPartition(valid.data)
            : electron_1.session.fromPartition(`persist:${valid.data}`);
        await sess.setProxy({ proxyRules: tor_manager_js_1.torManager.getSocksProxy() });
        console.log(`[Tor Proxy] Proxy set for partition: ${valid.data}`);
        return true;
    }
    catch (err) {
        console.error(`[Tor Proxy] Failed to set proxy for partition: ${valid.data}`, err);
        return false;
    }
});
electron_1.ipcMain.handle('tor:unregister-partition', async (_event, partition) => {
    const valid = (0, ipc_validators_js_1.validatePartition)(partition);
    if (!valid.success)
        return;
    torPartitions.delete(valid.data);
});
electron_1.ipcMain.handle('session:purge-incognito', async (_event, partition) => {
    const valid = (0, ipc_validators_js_1.validatePartition)(partition);
    if (!valid.success)
        return false;
    try {
        const ses = electron_1.session.fromPartition(valid.data);
        await ses.clearStorageData();
        await ses.clearCache();
        console.log(`[RAM Purge] Purged storage and cache for session: ${valid.data}`);
        return true;
    }
    catch (err) {
        console.error(`Failed to purge session ${valid.data}:`, err);
        return false;
    }
});
const interceptedSessions = new WeakSet();
function setupSessionInterceptors(ses) {
    if (interceptedSessions.has(ses))
        return;
    interceptedSessions.add(ses);
    const domainCache = new Map();
    const partitionTorCache = new Map();
    const resolveDomain = (webContentsId) => {
        if (!webContentsId)
            return '';
        const cached = domainCache.get(webContentsId);
        if (cached)
            return cached;
        const fromShield = shield_manager_js_1.shieldManager.getDomainForTab(webContentsId);
        if (fromShield) {
            domainCache.set(webContentsId, fromShield);
            return fromShield;
        }
        try {
            const wc = electron_1.webContents.fromId(webContentsId);
            if (wc && !wc.isDestroyed()) {
                const url = wc.getURL();
                if (url && !url.startsWith('about:') && !url.startsWith('chrome:')) {
                    const host = new URL(url).hostname;
                    domainCache.set(webContentsId, host);
                    return host;
                }
            }
        }
        catch { /* ignore */ }
        return '';
    };
    ses.webRequest.onBeforeRequest({ urls: ['<all_urls>'] }, (details, callback) => {
        if (details.resourceType && !['mainFrame', 'script', 'xhr', 'fetch'].includes(details.resourceType)) {
            callback({ cancel: false });
            return;
        }
        let rootDomain = resolveDomain(details.webContentsId);
        if (!rootDomain && details.url && !details.url.startsWith('about:') && !details.url.startsWith('chrome:')) {
            try {
                rootDomain = new URL(details.url).hostname;
            }
            catch { /* ignore */ }
        }
        if (rootDomain) {
            const shieldResult = shield_manager_js_1.shieldManager.evaluateRequest(details, rootDomain);
            if (shieldResult.cancel) {
                callback({ cancel: true });
                return;
            }
            if (shieldResult.redirectURL) {
                callback({ redirectURL: shieldResult.redirectURL });
                return;
            }
        }
        try {
            const partition = ses.partition || '';
            let isTorSession = partitionTorCache.get(partition);
            if (isTorSession === undefined) {
                isTorSession = torPartitions.has(partition) ||
                    partition.includes('tor-') ||
                    partition.startsWith('persist:tor-') ||
                    partition.startsWith('tor-') ||
                    partition.startsWith('incognito-tor-');
                partitionTorCache.set(partition, isTorSession);
            }
            if (isTorSession && !tor_manager_js_1.torManager.getStatus().connected &&
                !details.url.startsWith('chrome://') && !details.url.startsWith('about:')) {
                callback({ cancel: true });
                return;
            }
        }
        catch { /* ignore */ }
        callback({ cancel: false });
    });
    // 2. Cookie Protection & Header Stripping
    ses.webRequest.onBeforeSendHeaders({ urls: ['<all_urls>'] }, (details, callback) => {
        if (details.resourceType && !['mainFrame', 'script', 'xhr', 'fetch'].includes(details.resourceType)) {
            callback({ requestHeaders: details.requestHeaders });
            return;
        }
        const rootDomain = resolveDomain(details.webContentsId);
        if (rootDomain) {
            const headerEval = shield_manager_js_1.shieldManager.evaluateHeaders(details.url, rootDomain, details.requestHeaders);
            if (headerEval.requestHeaders) {
                callback({ requestHeaders: headerEval.requestHeaders });
                return;
            }
        }
        callback({ requestHeaders: details.requestHeaders });
    });
}
// Kill Switch & Ad/Tracker Blocker: Intercept all webview requests
electron_1.app.on('web-contents-created', (event, contents) => {
    if (contents.getType() !== 'webview')
        return;
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
        contents.session.setProxy({ proxyRules: tor_manager_js_1.torManager.getSocksProxy() })
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
                shield_manager_js_1.shieldManager.resetTab(contents.id, hostname);
            }
            catch { /* ignore */ }
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
    ses.webRequest.onHeadersReceived((details, callback) => {
        callback({ cancel: false, responseHeaders: details.responseHeaders });
    });
}
electron_1.app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') {
        electron_1.app.quit();
    }
});
function isGeminiApiError(error) {
    return (error instanceof Error &&
        ('status' in error || 'statusText' in error || 'errorDetails' in error));
}
function getGeminiErrorMessage(error) {
    if (isGeminiApiError(error)) {
        const status = error.status;
        if (status === 404) {
            return {
                userMessage: 'The requested AI model was not found. Please check your API key and ensure you have access to the selected model.',
                shouldRetry: false,
            };
        }
        if (status === 429) {
            const retryAfter = error.errorDetails?.find(d => d['@type']?.includes('RetryInfo'));
            const delaySeconds = retryAfter?.retryDelay
                ? parseInt(retryAfter.retryDelay.replace('s', ''), 10)
                : 60;
            return {
                userMessage: `API quota exceeded. Please wait ${delaySeconds} seconds before trying again, or check your billing at https://ai.google.dev/gemini-api/docs/rate-limits.`,
                shouldRetry: true,
                retryAfter: delaySeconds * 1000,
            };
        }
        if (status === 401 || status === 403) {
            return {
                userMessage: 'Invalid API key or insufficient permissions. Please verify your API key in Settings.',
                shouldRetry: false,
            };
        }
    }
    if (error instanceof Error) {
        if (error.message.includes('404') || error.message.includes('not found')) {
            return {
                userMessage: 'AI model not found. The model may have been deprecated or requires a different API version.',
                shouldRetry: false,
            };
        }
        if (error.message.includes('429') ||
            error.message.includes('quota') ||
            error.message.includes('rate limit')) {
            return {
                userMessage: 'API rate limit exceeded. Please wait a moment and try again.',
                shouldRetry: true,
                retryAfter: 60000,
            };
        }
        if (error.message.includes('401') ||
            error.message.includes('403') ||
            error.message.includes('API key')) {
            return {
                userMessage: 'Invalid or missing API key. Please configure your API key in Settings.',
                shouldRetry: false,
            };
        }
    }
    return {
        userMessage: error instanceof Error ? error.message : 'An unknown error occurred with the AI service.',
        shouldRetry: false,
    };
}
electron_1.ipcMain.on('gemini:send', async (event, payload) => {
    const senderWebContents = event.sender;
    try {
        await (0, gemini_js_1.streamGemini)(payload.message, payload.history, payload.activeProvider, payload.customApiKey, textChunk => {
            if (!senderWebContents.isDestroyed()) {
                senderWebContents.send('gemini:stream', textChunk);
            }
        }, commands => {
            if (!senderWebContents.isDestroyed()) {
                senderWebContents.send('browser:execute-commands', commands);
            }
        }, {
            isTor: payload.isTor,
            forceLocal: payload.forceLocal,
            torCloudRouting: payload.torCloudRouting,
            files: payload.files,
            systemInstruction: payload.systemInstruction,
        });
        if (!senderWebContents.isDestroyed()) {
            senderWebContents.send('gemini:done');
        }
    }
    catch (error) {
        console.error('Error during Gemini API call:', error);
        const { userMessage, shouldRetry, retryAfter } = getGeminiErrorMessage(error);
        if (!senderWebContents.isDestroyed()) {
            senderWebContents.send('gemini:error', userMessage, { shouldRetry, retryAfter });
        }
    }
});
electron_1.ipcMain.handle('ai:request-cloud-plan', async (_event, payload) => {
    return await (0, gemini_js_1.getCloudPlan)(payload.prompt, payload.provider, payload.apiKey);
});
async function callProviderModel(apiKey, prompt, provider = 'gemini', modelName, responseMimeType = 'application/json') {
    if (provider === 'local') {
        return await (0, gemini_js_1.callLocalOllama)(prompt, responseMimeType === 'application/json' ? 'json' : undefined);
    }
    const model = modelName || await (0, gemini_js_1.autoDetectModel)(provider, apiKey);
    if (provider === 'gemini') {
        const genAI = new generative_ai_1.GoogleGenerativeAI(apiKey);
        const modelInstance = genAI.getGenerativeModel({
            model: model,
            generationConfig: { responseMimeType },
        });
        const result = await modelInstance.generateContent(prompt);
        const responseText = result.response.text();
        let cleanText = responseText.trim();
        if (cleanText.startsWith('```')) {
            cleanText = cleanText
                .replace(/^```json\s*/i, '')
                .replace(/```$/, '')
                .trim();
        }
        return cleanText;
    }
    if (provider === 'openai' || provider === 'groq' || provider === 'openrouter') {
        let endpoint = 'https://api.openai.com/v1/chat/completions';
        if (provider === 'groq')
            endpoint = 'https://api.groq.com/openai/v1/chat/completions';
        if (provider === 'openrouter')
            endpoint = 'https://openrouter.ai/api/v1/chat/completions';
        const response = await fetch(endpoint, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                Authorization: `Bearer ${apiKey}`,
                ...(provider === 'openrouter'
                    ? {
                        'HTTP-Referer': 'https://github.com/google-antigravity/gemini-browser',
                        'X-Title': 'Gemini Browser',
                    }
                    : {}),
            },
            body: JSON.stringify({
                model: model,
                messages: [{ role: 'user', content: prompt }],
                response_format: responseMimeType === 'application/json' ? { type: 'json_object' } : undefined,
            }),
        });
        if (!response.ok) {
            const errText = await response.text();
            throw new Error(`API error (${response.status}): ${errText}`);
        }
        const data = (await response.json());
        let cleanText = (data.choices?.[0]?.message?.content || '').trim();
        if (cleanText.startsWith('```')) {
            cleanText = cleanText
                .replace(/^```json\s*/i, '')
                .replace(/```$/, '')
                .trim();
        }
        return cleanText;
    }
    if (provider === 'anthropic') {
        const response = await fetch('https://api.anthropic.com/v1/messages', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'x-api-key': apiKey,
                'anthropic-version': '2023-06-01',
            },
            body: JSON.stringify({
                model: model,
                max_tokens: 4000,
                messages: [{ role: 'user', content: prompt }],
            }),
        });
        if (!response.ok) {
            const errText = await response.text();
            throw new Error(`Anthropic error (${response.status}): ${errText}`);
        }
        const data = (await response.json());
        let cleanText = (data.content?.[0]?.text || '').trim();
        if (cleanText.startsWith('```')) {
            cleanText = cleanText
                .replace(/^```json\s*/i, '')
                .replace(/```$/, '')
                .trim();
        }
        return cleanText;
    }
    throw new Error(`Unsupported provider: ${provider}`);
}
electron_1.ipcMain.handle('gemini:group', async (_event, { tabsList, customApiKey, activeProvider, category, }) => {
    const provider = activeProvider || 'gemini';
    let apiKey = customApiKey;
    if (!apiKey) {
        if (provider === 'gemini')
            apiKey = process.env.GEMINI_API_KEY;
        else if (provider === 'openai')
            apiKey = process.env.OPENAI_API_KEY;
        else if (provider === 'anthropic')
            apiKey = process.env.ANTHROPIC_API_KEY;
        else if (provider === 'groq')
            apiKey = process.env.GROQ_API_KEY;
        else if (provider === 'openrouter')
            apiKey = process.env.OPENROUTER_API_KEY;
    }
    if (provider !== 'local') {
        if (!apiKey || apiKey === 'your_gemini_api_key_here' || apiKey === '') {
            throw new Error(`API key for ${provider} is not configured. Please add your API key in settings.`);
        }
    }
    try {
        const categoryInstruction = category === 'By Domain'
            ? 'Group tabs by their domain (e.g., all github.com tabs together, all youtube.com tabs together). Name each workspace after the domain.'
            : category === 'By Topic'
                ? 'Group tabs by their topic/content (e.g., cooking, programming, travel, gaming). Use descriptive topic names.'
                : category === 'By Type'
                    ? 'Group tabs by media/content type (e.g., Video, Social Media, News, Shopping, Documentation, Tools).'
                    : 'Group into 2 to 4 logical and distinct workspaces based on their URLs and page titles.';
        const prompt = `You are a professional web browser tab organizer. ${categoryInstruction}

For each workspace, generate:
1. "name": A concise, thematic title (e.g., "Developer Tools", "Social Media").
2. "color": A distinct, vibrant hex color code (e.g., green: #10b981, red: #ef4444, blue: #3b82f6, orange: #f59e0b, purple: #8b5cf6, pink: #ec4899).
3. "tabIds": An array containing the IDs of the tabs assigned to this workspace. Ensure every tab ID in the input list is assigned to exactly one workspace.

Input tabs:
${JSON.stringify(tabsList, null, 2)}

Response JSON format:
[
  { "name": "Workspace Name", "color": "#hexcolor", "tabIds": ["tab-id-1", "tab-id-2"] },
  ...]`;
        const detectedModel = provider === 'local' ? 'qwen2.5:3b' : await (0, gemini_js_1.autoDetectModel)(provider, apiKey || '');
        const responseText = await callProviderModel(apiKey || '', prompt, provider, detectedModel, 'application/json');
        const parsed = JSON.parse(responseText);
        return parsed.map((item, idx) => ({
            id: `workspace-${idx}`,
            name: item.name,
            color: item.color || '#6366f1',
            tabIds: item.tabIds || [],
        }));
    }
    catch (error) {
        console.error('Error during silent tab auto-grouping:', error);
        const { userMessage } = getGeminiErrorMessage(error);
        throw new Error(userMessage);
    }
});
electron_1.ipcMain.handle('window:toggle-fullscreen', () => {
    const win = getActiveWindow();
    if (win) {
        win.setFullScreen(!win.isFullScreen());
    }
});
electron_1.ipcMain.handle('gemini:agent-step', async (_event, { stepData, customApiKey, activeProvider }) => {
    const provider = activeProvider || 'gemini';
    let apiKey = customApiKey;
    if (!apiKey) {
        if (provider === 'gemini')
            apiKey = process.env.GEMINI_API_KEY;
        else if (provider === 'openai')
            apiKey = process.env.OPENAI_API_KEY;
        else if (provider === 'anthropic')
            apiKey = process.env.ANTHROPIC_API_KEY;
        else if (provider === 'groq')
            apiKey = process.env.GROQ_API_KEY;
        else if (provider === 'openrouter')
            apiKey = process.env.OPENROUTER_API_KEY;
    }
    if (provider !== 'local') {
        if (!apiKey || apiKey === 'your_gemini_api_key_here' || apiKey === '') {
            throw new Error(`API key for ${provider} is not configured. Please add your API key in settings.`);
        }
    }
    try {
        const prompt = `You are an autonomous AI web browsing agent running inside a custom web browser.
Your overall goal is: "${stepData.goal}"
You are currently on Step ${stepData.stepNumber} of 10.

Current Browser URL: ${stepData.currentUrl}
Current Page Text Content (truncated):
${stepData.pageText}

First 30 Links available on this page:
${JSON.stringify(stepData.pageLinks, null, 2)}

History of previous actions in this run:
${stepData.history}

Your task is to analyze the page and choose the next logical step to accomplish the goal.
You must return a valid JSON object matching this schema:
{
  "thought": "A concise explanation of what you see on the page and why you are choosing the next action.",
  "action": "navigate" | "search" | "click" | "type" | "scroll" | "extract" | "fill_form" | "select" | "press_key" | "finish",
  "url": "If action is navigate, specify the absolute URL to go to.",
  "query": "If action is search, specify the text to search with.",
  "selector": "For click/type/select/fill_form: CSS selector, text content, aria-label, or element description (e.g. 'Sign In button', '#email-input', 'Login')",
  "text": "For type action: the text to type into the input field",
  "value": "For select action: the option value or text to select",
  "direction": "For scroll action: 'up' or 'down' (default: 'down')",
  "amount": "For scroll action: pixels to scroll (default: 500)",
  "keys": "For press_key action: key name like 'enter', 'escape', 'tab', 'arrowdown'",
  "formFields": "For fill_form action: array of {selector, value} objects",
  "answer": "If action is finish, provide the final compiled answer to the user's goal"
}

Available Actions:
- "navigate": Go to a specific URL. Set "url" to the full URL.
- "search": Search Google for a query. Set "query" to the search text.
- "click": Click an element on the page. Set "selector" to CSS selector, text content, or description (e.g. "Sign In", "#submit-btn", "a[href='/login']").
- "type": Type text into an input field. Set "selector" to find the input, "text" to type.
- "scroll": Scroll the page. Set "direction" (up/down) and "amount" (pixels).
- "extract": Extract structured data from the current page (returns title, links, forms, inputs).
- "fill_form": Fill multiple form fields at once. Set "formFields" array with {selector, value} pairs.
- "select": Select an option from a dropdown. Set "selector" and "value".
- "press_key": Press a keyboard key. Set "keys" (enter, escape, tab, arrowdown, etc).
- "finish": Task is complete. Set "answer" with the final result.

Rules:
1. If you can see the answer to the goal on the page, extract it and choose "finish".
2. If you need to click a link or button, choose "click" with the element's text or selector.
3. If you need to fill a form, use "type" for individual fields or "fill_form" for multiple.
4. If you need to scroll to see more content, use "scroll".
5. If you need to search for something else, choose "search".
6. Extract page data first with "extract" if you need to understand the page structure.
7. Keep actions focused on the user's specific goal.
8. Use specific selectors when possible (text content like "Sign In" is more reliable than CSS).`;
        const detectedModel = provider === 'local' ? 'qwen2.5:3b' : await (0, gemini_js_1.autoDetectModel)(provider, apiKey || '');
        const responseText = await callProviderModel(apiKey || '', prompt, provider, detectedModel, 'application/json');
        return JSON.parse(responseText);
    }
    catch (error) {
        console.error('Error during autonomous agent step:', error);
        const { userMessage } = getGeminiErrorMessage(error);
        throw new Error(userMessage);
    }
});
electron_1.ipcMain.handle('ai:synthesize-research', async (_event, payload) => {
    const provider = payload.provider || 'gemini';
    let apiKey = payload.apiKey;
    if (!apiKey) {
        if (provider === 'gemini')
            apiKey = process.env.GEMINI_API_KEY;
        else if (provider === 'openai')
            apiKey = process.env.OPENAI_API_KEY;
        else if (provider === 'anthropic')
            apiKey = process.env.ANTHROPIC_API_KEY;
        else if (provider === 'groq')
            apiKey = process.env.GROQ_API_KEY;
        else if (provider === 'openrouter')
            apiKey = process.env.OPENROUTER_API_KEY;
    }
    return await (0, gemini_js_1.synthesizeResearchReport)(payload.topic, payload.dataOrQuery, provider, apiKey || '');
});
// Agent Execution Engine IPC Handlers
electron_1.ipcMain.handle('agent:execute', async (_event, action) => {
    try {
        const jsCode = (0, agent_engine_js_1.generateActionJS)((0, agent_engine_js_1.parseAgentAction)(action));
        return { success: true, jsCode };
    }
    catch (error) {
        return { success: false, error: String(error) };
    }
});
electron_1.ipcMain.handle('agent:extract-page', async () => {
    try {
        const jsCode = (0, agent_engine_js_1.generateActionJS)({ type: 'extract' });
        return { success: true, jsCode };
    }
    catch (error) {
        return { success: false, error: String(error) };
    }
});
// Encrypted Agent Memory Vault (AES-256 DPAPI at rest)
electron_1.ipcMain.handle('agent:vault-list', async () => {
    return agent_memory_vault_js_1.agentVault.list();
});
electron_1.ipcMain.handle('agent:vault-get', async (_event, key) => {
    return agent_memory_vault_js_1.agentVault.get(key);
});
electron_1.ipcMain.handle('agent:vault-set', async (_event, { key, value, category }) => {
    return agent_memory_vault_js_1.agentVault.set(key, value, category);
});
electron_1.ipcMain.handle('agent:vault-delete', async (_event, key) => {
    return agent_memory_vault_js_1.agentVault.delete(key);
});
electron_1.ipcMain.handle('agent:vault-stats', async () => {
    return agent_memory_vault_js_1.agentVault.getStats();
});
// Backward-compatible aliases
electron_1.ipcMain.handle('agent:get-memory', async () => {
    return agent_memory_vault_js_1.agentVault.list();
});
electron_1.ipcMain.handle('agent:set-memory', async (_event, { key, value }) => {
    return agent_memory_vault_js_1.agentVault.set(key, value);
});
// Agent Action Undo & Reversible Operations Stack
electron_1.ipcMain.handle('agent:record-action', async (_event, actionReq) => {
    return agent_undo_stack_js_1.agentUndoStack.record(actionReq);
});
electron_1.ipcMain.handle('agent:undo-last-action', async () => {
    return agent_undo_stack_js_1.agentUndoStack.popUndo();
});
electron_1.ipcMain.handle('agent:get-undo-history', async () => {
    return agent_undo_stack_js_1.agentUndoStack.getHistory();
});
electron_1.ipcMain.handle('agent:clear-undo-history', async () => {
    agent_undo_stack_js_1.agentUndoStack.clear();
    return true;
});
// Model Context Protocol (MCP) Bridge Handlers
electron_1.ipcMain.handle('mcp:list-tools', async () => {
    return mcp_bridge_js_1.mcpBridge.listTools();
});
electron_1.ipcMain.handle('mcp:call-tool', async (_event, { toolId, params }) => {
    return mcp_bridge_js_1.mcpBridge.callTool(toolId, params);
});
electron_1.ipcMain.handle('mcp:get-servers', async () => {
    return mcp_bridge_js_1.mcpBridge.getServers();
});
electron_1.ipcMain.handle('mcp:configure-server', async (_event, config) => {
    return mcp_bridge_js_1.mcpBridge.configureServer(config);
});
// MCP OAuth IPC Handlers
electron_1.ipcMain.handle('mcp:start-oauth', async (_event, serverId) => {
    return mcp_bridge_js_1.mcpBridge.startOAuthFlow(serverId);
});
electron_1.ipcMain.handle('mcp:oauth-callback', async (_event, { code, serverId }) => {
    return mcp_bridge_js_1.mcpBridge.handleOAuthCallback(code, serverId);
});
electron_1.ipcMain.handle('mcp:refresh-token', async (_event, serverId) => {
    return mcp_bridge_js_1.mcpBridge.refreshAccessToken(serverId);
});
electron_1.ipcMain.handle('mcp:get-auth-status', async (_event, serverId) => {
    return mcp_bridge_js_1.mcpBridge.getAuthStatus(serverId);
});
// Sensitive Field User Confirmation
electron_1.ipcMain.handle('agent:confirm-sensitive-action', async (_event, decision) => {
    console.log(`[AgentSecurity] User decision for sensitive action prompt ${decision.promptId}: approved=${decision.approved}`);
    return decision.approved;
});
// Agent Sensitive Field Detection
electron_1.ipcMain.handle('agent:detect-sensitive-fields', async () => {
    return { jsCode: (0, agent_engine_js_1.generateSensitiveFieldDetectionJS)() };
});
// Agent Visual Feedback
electron_1.ipcMain.handle('agent:highlight', async (_event, { selector, color, duration }) => {
    return { jsCode: (0, agent_engine_js_1.generateHighlightJS)(selector, color, duration) };
});
electron_1.ipcMain.handle('agent:tooltip', async (_event, { selector, text, color }) => {
    return { jsCode: (0, agent_engine_js_1.generateTooltipJS)(selector, text, color) };
});
electron_1.ipcMain.handle('agent:click-ripple', async (_event, { x, y, color }) => {
    return { jsCode: (0, agent_engine_js_1.generateClickRippleJS)(x, y, color) };
});
// Agent Skills (saved workflows)
const agentSkillsPath = path_1.default.join(electron_1.app.getPath('userData'), 'agent-skills.json');
function loadAgentSkills() {
    try {
        if (fs_1.default.existsSync(agentSkillsPath)) {
            return JSON.parse(fs_1.default.readFileSync(agentSkillsPath, 'utf-8'));
        }
    }
    catch { /* ignore */ }
    return [];
}
function saveAgentSkills(skills) {
    try {
        fs_1.default.writeFileSync(agentSkillsPath, JSON.stringify(skills, null, 2), 'utf-8');
    }
    catch (err) {
        console.error('Failed to save agent skills:', err);
    }
}
electron_1.ipcMain.handle('agent:get-skills', async () => {
    return loadAgentSkills();
});
electron_1.ipcMain.handle('agent:save-skill', async (_event, skill) => {
    const skills = loadAgentSkills();
    const newSkill = {
        id: `skill-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        ...skill,
        createdAt: Date.now(),
    };
    skills.push(newSkill);
    saveAgentSkills(skills);
    return newSkill;
});
electron_1.ipcMain.handle('agent:delete-skill', async (_event, skillId) => {
    const skills = loadAgentSkills();
    const filtered = skills.filter(s => s.id !== skillId);
    if (filtered.length === skills.length)
        return false;
    saveAgentSkills(filtered);
    return true;
});
electron_1.ipcMain.handle('agent:run-skill', async (_event, skillId) => {
    const skills = loadAgentSkills();
    const skill = skills.find(s => s.id === skillId);
    if (!skill)
        throw new Error('Skill not found');
    // Return the skill's goal so the frontend can trigger handleRunAgent
    return { goal: skill.goal, steps: skill.steps };
});
// Chrome Extensions IPC Handlers
electron_1.ipcMain.handle('extensions:select-dir', async () => {
    if (!mainWindow)
        return null;
    const result = await electron_1.dialog.showOpenDialog(mainWindow, {
        properties: ['openDirectory'],
        title: 'Select Unpacked Chrome Extension Folder',
    });
    if (result.canceled)
        return null;
    return result.filePaths[0];
});
electron_1.ipcMain.handle('extensions:load', async (_event, extPath) => {
    try {
        const ext = await electron_1.session.defaultSession.loadExtension(extPath, { allowFileAccess: true });
        const list = getSavedExtensions();
        const existingIdx = list.findIndex(e => e.id === ext.id);
        const meta = {
            id: ext.id,
            name: ext.name,
            version: ext.version,
            path: extPath,
            enabled: true,
        };
        if (existingIdx >= 0) {
            list[existingIdx] = meta;
        }
        else {
            list.push(meta);
        }
        saveExtensions(list);
        return meta;
    }
    catch (err) {
        console.error('Failed to load extension:', err);
        throw err;
    }
});
electron_1.ipcMain.handle('extensions:remove', async (_event, id) => {
    try {
        electron_1.session.defaultSession.removeExtension(id);
        const list = getSavedExtensions();
        const updated = list.filter(e => e.id !== id);
        saveExtensions(updated);
    }
    catch (err) {
        console.error('Failed to remove extension:', err);
        throw err;
    }
});
electron_1.ipcMain.handle('extensions:toggle', async (_event, { id, enabled }) => {
    try {
        const list = getSavedExtensions();
        const ext = list.find(e => e.id === id);
        if (!ext)
            throw new Error('Extension not found in config');
        if (enabled) {
            await electron_1.session.defaultSession.loadExtension(ext.path, { allowFileAccess: true });
        }
        else {
            electron_1.session.defaultSession.removeExtension(id);
        }
        ext.enabled = enabled;
        saveExtensions(list);
        return list;
    }
    catch (err) {
        console.error('Failed to toggle extension:', err);
        throw err;
    }
});
electron_1.ipcMain.handle('extensions:get-all', async () => {
    const list = getSavedExtensions();
    const loadedList = electron_1.session.defaultSession.getAllExtensions();
    return list.map(item => ({
        ...item,
        isActive: loadedList.some(le => le.id === item.id),
    }));
});
// Install extension from URL (Chrome Web Store or .crx)
electron_1.ipcMain.handle('extensions:install-from-url', async (_event, url) => {
    try {
        // Parse Chrome Web Store URL to get extension ID
        let extensionId = '';
        let downloadUrl = url;
        const cwsMatch = url.match(/chrome\.google\.com\/webstore\/detail\/[^/]+\/([a-z]+)/i);
        if (cwsMatch) {
            extensionId = cwsMatch[1];
            downloadUrl = `https://clients2.google.com/service/update2/crx?response=redirect&prodversion=120.0&acceptformat=crx2,crx3&x=id%3D${extensionId}%26uc`;
        }
        // Download the .crx file
        const response = await fetch(downloadUrl, {
            headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36' }
        });
        if (!response.ok)
            throw new Error(`Download failed: ${response.status}`);
        const buffer = await response.arrayBuffer();
        const data = Buffer.from(buffer);
        // Check if it's a CRX2/CRX3 file (starts with "Cr24" or "Cr23")
        const isCrx = data[0] === 0x43 && data[1] === 0x72 && (data[2] === 0x32 || data[2] === 0x33);
        // Create extensions directory
        const extensionsDir = path_1.default.join(electron_1.app.getPath('userData'), 'extensions');
        if (!fs_1.default.existsSync(extensionsDir)) {
            fs_1.default.mkdirSync(extensionsDir, { recursive: true });
        }
        const extId = extensionId || `ext-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
        const extDir = path_1.default.join(extensionsDir, extId);
        if (isCrx) {
            // CRX3 format: skip header to find ZIP
            // CRX3 header: magic(4) + version(4) + header_size(4) + header(header_size)
            const headerSize = data.readUInt32LE(8);
            const zipStart = 12 + headerSize;
            const zipData = data.slice(zipStart);
            if (!fs_1.default.existsSync(extDir))
                fs_1.default.mkdirSync(extDir, { recursive: true });
            fs_1.default.writeFileSync(path_1.default.join(extDir, 'extension.crx'), zipData);
            // Extract ZIP using adm-zip or child_process Expand-Archive
            try {
                const req = typeof require !== 'undefined' ? require : undefined;
                const AdmZip = req ? req('adm-zip') : undefined;
                if (AdmZip) {
                    const zip = new AdmZip(zipData);
                    zip.extractAllTo(extDir, true);
                }
                else {
                    throw new Error('AdmZip not loaded');
                }
            }
            catch {
                // Fallback: use PowerShell Expand-Archive
                const cp = await Promise.resolve().then(() => __importStar(require('child_process')));
                try {
                    cp.execSync(`powershell -Command "Expand-Archive -Path '${path_1.default.join(extDir, 'extension.crx')}' -DestinationPath '${extDir}' -Force"`, { timeout: 15000 });
                }
                catch {
                    throw new Error('Failed to extract extension. PowerShell Expand-Archive failed.');
                }
            }
        }
        else {
            // Assume it's a ZIP file
            if (!fs_1.default.existsSync(extDir))
                fs_1.default.mkdirSync(extDir, { recursive: true });
            fs_1.default.writeFileSync(path_1.default.join(extDir, 'extension.zip'), data);
            try {
                const req = typeof require !== 'undefined' ? require : undefined;
                const AdmZip = req ? req('adm-zip') : undefined;
                if (AdmZip) {
                    const zip = new AdmZip(data);
                    zip.extractAllTo(extDir, true);
                }
                else {
                    throw new Error('AdmZip not loaded');
                }
            }
            catch {
                const cp = await Promise.resolve().then(() => __importStar(require('child_process')));
                try {
                    cp.execSync(`powershell -Command "Expand-Archive -Path '${path_1.default.join(extDir, 'extension.zip')}' -DestinationPath '${extDir}' -Force"`, { timeout: 15000 });
                }
                catch {
                    throw new Error('Failed to extract extension. PowerShell Expand-Archive failed.');
                }
            }
        }
        // Load the extension
        const ext = await electron_1.session.defaultSession.loadExtension(extDir, { allowFileAccess: true });
        const list = getSavedExtensions();
        const meta = {
            id: ext.id,
            name: ext.name,
            version: ext.version,
            path: extDir,
            enabled: true,
        };
        const existingIdx = list.findIndex(e => e.id === ext.id);
        if (existingIdx >= 0) {
            list[existingIdx] = meta;
        }
        else {
            list.push(meta);
        }
        saveExtensions(list);
        return meta;
    }
    catch (err) {
        console.error('Failed to install extension from URL:', err);
        throw err;
    }
});
// Removed gemini:get-env-key — API keys should only be accessed through the encrypted api-keys store
// to prevent potential XSS exfiltration from the renderer process
electron_1.ipcMain.handle('gemini:get-cloud-plan', async (_event, { prompt, provider, apiKey }) => {
    return (0, gemini_js_1.getCloudPlan)(prompt, provider, apiKey);
});
// Tor IPC Handlers
electron_1.ipcMain.handle('tor:get-status', async () => {
    const { torManager } = await Promise.resolve().then(() => __importStar(require('./tor-manager.js')));
    return torManager.getStatus();
});
electron_1.ipcMain.handle('tor:connect', async () => {
    const { torManager } = await Promise.resolve().then(() => __importStar(require('./tor-manager.js')));
    try {
        const result = await torManager.connect();
        if (result) {
            return { success: true };
        }
        const errorMsg = torManager.getLastConnectError?.() || 'Connection failed';
        return { success: false, error: errorMsg };
    }
    catch (err) {
        console.error('tor:connect failed:', err);
        return { success: false, error: err.message };
    }
});
electron_1.ipcMain.handle('tor:cancel-connect', async () => {
    const { torManager } = await Promise.resolve().then(() => __importStar(require('./tor-manager.js')));
    await torManager.cancelConnect();
    return { success: true };
});
electron_1.ipcMain.handle('tor:disconnect', async () => {
    const { torManager } = await Promise.resolve().then(() => __importStar(require('./tor-manager.js')));
    return torManager.disconnect();
});
electron_1.ipcMain.handle('tor:new-circuit', async () => {
    const { torManager } = await Promise.resolve().then(() => __importStar(require('./tor-manager.js')));
    return torManager.newCircuit();
});
electron_1.ipcMain.handle('tor:is-mode', async () => {
    const { torManager } = await Promise.resolve().then(() => __importStar(require('./tor-manager.js')));
    return torManager.isTorMode();
});
electron_1.ipcMain.handle('tor:set-mode', async (_event, enabled) => {
    const { torManager } = await Promise.resolve().then(() => __importStar(require('./tor-manager.js')));
    return torManager.setTorMode(enabled);
});
// Bridge Management IPC Handlers
electron_1.ipcMain.handle('tor:add-bridge', async (_event, bridge) => {
    const { torManager } = await Promise.resolve().then(() => __importStar(require('./tor-manager.js')));
    return torManager.addBridge(bridge);
});
electron_1.ipcMain.handle('tor:remove-bridge', async (_event, address) => {
    const { torManager } = await Promise.resolve().then(() => __importStar(require('./tor-manager.js')));
    return torManager.removeBridge(address);
});
electron_1.ipcMain.handle('tor:set-bridges', async (_event, bridges) => {
    const { torManager } = await Promise.resolve().then(() => __importStar(require('./tor-manager.js')));
    return torManager.setBridges(bridges);
});
electron_1.ipcMain.handle('tor:set-bridge-type', async (_event, type) => {
    const { torManager } = await Promise.resolve().then(() => __importStar(require('./tor-manager.js')));
    return torManager.setBridgeType(type);
});
electron_1.ipcMain.handle('tor:set-use-bridges', async (_event, enabled) => {
    const { torManager } = await Promise.resolve().then(() => __importStar(require('./tor-manager.js')));
    return torManager.setUseBridges(enabled);
});
electron_1.ipcMain.handle('tor:get-bridges', async () => {
    const { torManager } = await Promise.resolve().then(() => __importStar(require('./tor-manager.js')));
    return torManager.getBridges();
});
electron_1.ipcMain.handle('tor:get-bridge-type', async () => {
    const { torManager } = await Promise.resolve().then(() => __importStar(require('./tor-manager.js')));
    return torManager.getBridgeType();
});
electron_1.ipcMain.handle('tor:is-using-bridges', async () => {
    const { torManager } = await Promise.resolve().then(() => __importStar(require('./tor-manager.js')));
    return torManager.isUsingBridges();
});
// Onion Service (.onion) IPC Handlers
electron_1.ipcMain.handle('tor:is-onion', async (_event, url) => {
    const { TorManager } = await Promise.resolve().then(() => __importStar(require('./tor-manager.js')));
    return TorManager.isOnionAddress(url);
});
electron_1.ipcMain.handle('tor:ensure-onion-url', async (_event, url) => {
    const { TorManager } = await Promise.resolve().then(() => __importStar(require('./tor-manager.js')));
    return TorManager.ensureOnionUrl(url);
});
electron_1.ipcMain.handle('tor:should-use-tor', async (_event, url, torMode) => {
    const { TorManager } = await Promise.resolve().then(() => __importStar(require('./tor-manager.js')));
    return TorManager.shouldUseTor(url, torMode);
});
// Get cookies for a partition
electron_1.ipcMain.handle('session:get-cookies', async (_event, partition) => {
    try {
        const targetSession = partition ? electron_1.session.fromPartition(partition) : electron_1.session.defaultSession;
        const cookies = await targetSession.cookies.get({});
        return cookies.map(c => ({
            name: c.name,
            value: c.value,
            domain: c.domain,
            path: c.path,
            expires: c.expirationDate,
            httpOnly: c.httpOnly,
            secure: c.secure,
            session: c.session,
        }));
    }
    catch (err) {
        console.error('[Session] Failed to get cookies:', err);
        return [];
    }
});
// Delete a specific cookie
electron_1.ipcMain.handle('session:delete-cookie', async (_event, url, name, partition) => {
    try {
        const targetSession = partition ? electron_1.session.fromPartition(partition) : electron_1.session.defaultSession;
        await targetSession.cookies.remove(url, name);
        return true;
    }
    catch (err) {
        console.error('[Session] Failed to delete cookie:', err);
        return false;
    }
});
// Clear storage/cookies for a partition (e.g. for Forget Me shields feature)
electron_1.ipcMain.handle('session:clear-data', async (_event, originOrPartition, partition) => {
    try {
        // If only an origin URL is provided (no explicit partition), find the webview's actual session
        let part;
        if (partition) {
            part = partition;
        }
        else {
            // Try to find the webContents that matches this origin and get its session partition
            const allContents = electron_1.webContents.getAllWebContents();
            let foundPartition = null;
            for (const wc of allContents) {
                if (wc.getURL().startsWith(originOrPartition)) {
                    // Found the webContents - use a persist partition based on origin
                    foundPartition = `persist:${originOrPartition.replace(/[^a-zA-Z0-9]/g, '_')}`;
                    break;
                }
            }
            part = foundPartition || `persist:${originOrPartition.replace(/[^a-zA-Z0-9]/g, '_')}`;
        }
        const targetSession = electron_1.session.fromPartition(part);
        await targetSession.clearStorageData({
            storages: ['cookies', 'filesystem', 'indexdb', 'localstorage', 'shadercache', 'websql', 'serviceworkers', 'cachestorage']
        });
        console.log(`[Session] Wiped all storage data for partition: ${part}`);
        return true;
    }
    catch (err) {
        console.error(`[Session] Failed to clear storage for partition:`, err);
        return false;
    }
});
// Encrypted API Key Storage IPC Handlers
// Uses Electron's safeStorage for encrypting API keys at rest
const apiKeysPath = path_1.default.join(electron_1.app.getPath('userData'), 'api-keys.enc');
electron_1.ipcMain.handle('api-keys:get-all', async () => {
    try {
        if (!fs_1.default.existsSync(apiKeysPath)) {
            return {};
        }
        const encrypted = fs_1.default.readFileSync(apiKeysPath);
        const decrypted = electron_1.safeStorage.decryptString(encrypted);
        return JSON.parse(decrypted);
    }
    catch (err) {
        console.error('Failed to load API keys:', err);
        return {};
    }
});
electron_1.ipcMain.handle('api-keys:set-all', async (_event, keys) => {
    try {
        const json = JSON.stringify(keys);
        const encrypted = electron_1.safeStorage.encryptString(json);
        fs_1.default.writeFileSync(apiKeysPath, encrypted);
        return true;
    }
    catch (err) {
        console.error('Failed to save API keys:', err);
        return false;
    }
});
// VPN Manager IPC Handlers
electron_1.ipcMain.handle('vpn:get-status', () => vpn_manager_js_1.vpnManager.getStatus());
electron_1.ipcMain.handle('vpn:get-servers', () => vpn_manager_js_1.vpnManager.getServers());
electron_1.ipcMain.handle('vpn:get-plans', () => vpn_manager_js_1.vpnManager.getPlans());
electron_1.ipcMain.handle('vpn:get-selected-server', () => vpn_manager_js_1.vpnManager.getSelectedServer());
electron_1.ipcMain.handle('vpn:get-selected-plan', () => vpn_manager_js_1.vpnManager.getSelectedPlan());
electron_1.ipcMain.handle('vpn:set-server', (_event, countryCode) => vpn_manager_js_1.vpnManager.setServer(countryCode));
electron_1.ipcMain.handle('vpn:set-plan', (_event, planId) => vpn_manager_js_1.vpnManager.setPlan(planId));
electron_1.ipcMain.handle('vpn:connect', () => vpn_manager_js_1.vpnManager.connect());
electron_1.ipcMain.handle('vpn:disconnect', () => vpn_manager_js_1.vpnManager.disconnect());
electron_1.ipcMain.handle('vpn:is-mode-enabled', () => vpn_manager_js_1.vpnManager.isVPNMode());
electron_1.ipcMain.handle('vpn:set-mode-enabled', (_event, enabled) => {
    vpn_manager_js_1.vpnManager.setVPNMode(enabled);
    return vpn_manager_js_1.vpnManager.isVPNMode();
});
electron_1.ipcMain.handle('vpn:is-killswitch-enabled', () => vpn_manager_js_1.vpnManager.isKillSwitchEnabled());
electron_1.ipcMain.handle('vpn:set-killswitch-enabled', (_event, enabled) => {
    vpn_manager_js_1.vpnManager.setKillSwitch(enabled);
    return vpn_manager_js_1.vpnManager.isKillSwitchEnabled();
});
// Sub-Agent Pool IPC Handlers
electron_1.ipcMain.handle('sub-agent:create', async (_event, { parentAgentId, goal }) => {
    return sub_agent_pool_js_1.subAgentPool.createAgent(parentAgentId, goal);
});
electron_1.ipcMain.handle('sub-agent:get', async (_event, agentId) => {
    return sub_agent_pool_js_1.subAgentPool.getAgent(agentId);
});
electron_1.ipcMain.handle('sub-agent:get-by-parent', async (_event, parentId) => {
    return sub_agent_pool_js_1.subAgentPool.getAgentsByParent(parentId);
});
electron_1.ipcMain.handle('sub-agent:get-all', async () => {
    return sub_agent_pool_js_1.subAgentPool.getAllAgents();
});
electron_1.ipcMain.handle('sub-agent:get-stats', async () => {
    return sub_agent_pool_js_1.subAgentPool.getStats();
});
electron_1.ipcMain.handle('sub-agent:cancel', async (_event, agentId) => {
    sub_agent_pool_js_1.subAgentPool.cancelAgent(agentId);
    return true;
});
// Agent Scheduler IPC Handlers
electron_1.ipcMain.handle('scheduler:add-task', async (_event, { name, goal, cronExpression }) => {
    return agent_scheduler_js_1.agentScheduler.addTask(name, goal, cronExpression);
});
electron_1.ipcMain.handle('scheduler:remove-task', async (_event, taskId) => {
    return agent_scheduler_js_1.agentScheduler.removeTask(taskId);
});
electron_1.ipcMain.handle('scheduler:update-task', async (_event, { taskId, updates }) => {
    return agent_scheduler_js_1.agentScheduler.updateTask(taskId, updates);
});
electron_1.ipcMain.handle('scheduler:enable-task', async (_event, taskId) => {
    return agent_scheduler_js_1.agentScheduler.enableTask(taskId);
});
electron_1.ipcMain.handle('scheduler:disable-task', async (_event, taskId) => {
    return agent_scheduler_js_1.agentScheduler.disableTask(taskId);
});
electron_1.ipcMain.handle('scheduler:get-task', async (_event, taskId) => {
    return agent_scheduler_js_1.agentScheduler.getTask(taskId);
});
electron_1.ipcMain.handle('scheduler:get-all-tasks', async () => {
    return agent_scheduler_js_1.agentScheduler.getAllTasks();
});
electron_1.ipcMain.handle('scheduler:run-now', async (_event, taskId) => {
    return agent_scheduler_js_1.agentScheduler.runTaskNow(taskId);
});
