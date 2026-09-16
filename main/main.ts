import { app, BrowserWindow, ipcMain, dialog, session, Menu, shell, safeStorage, webContents } from 'electron';
import path from 'path';
import fs from 'fs';
import { streamGemini, autoDetectModel, getCloudPlan, callLocalOllama, synthesizeResearchReport } from './gemini.js';
import { GoogleGenerativeAI } from '@google/generative-ai';
import { initDownloadManager } from './download-manager.js';
import { initPasswordManager } from './password-manager.js';
import { torManager, initTorManager } from './tor-manager.js';
import { securityManager } from './security-manager.js';
import { adBlockerManager } from './adblocker.js';
import { shieldManager } from './shield-manager.js';
import { vpnManager, initVPNManager } from './vpn-manager.js';
import { initSecureDB } from './secure-db.js';
import { validatePartition } from './ipc-validators.js';
import { generateActionJS, parseAgentAction, generateSensitiveFieldDetectionJS, generateHighlightJS, generateTooltipJS, generateClickRippleJS } from './agent-engine.js';
import { agentVault, agentMemoryVault } from './agent-memory-vault.js';
import { agentUndoStack, recordAgentAction, undoLastAction, getUndoHistory, clearUndoHistory } from './agent-undo-stack.js';
import { mcpBridge } from './mcp-bridge.js';
import { subAgentPool } from './sub-agent-pool.js';
import { agentScheduler, ScheduledTask } from './agent-scheduler.js';
import type { SensitiveActionDecision } from '../src/types/agent-contracts.js';
import 'dotenv/config';
// Hardware acceleration enabled for optimal performance and smooth rendering
const activeWindows = new Set<BrowserWindow>();
let mainWindow: BrowserWindow | null = null;
const isDev = !app.isPackaged;

function getActiveWindow(): BrowserWindow | null {
  const focused = BrowserWindow.getFocusedWindow();
  if (focused && activeWindows.has(focused)) return focused;
  return mainWindow || Array.from(activeWindows)[0] || null;
}

async function handleExternalProtocol(contents: Electron.WebContents, url: string): Promise<void> {
  const window = BrowserWindow.fromWebContents(contents);
  const parentWindow = window || getActiveWindow() || mainWindow;
  if (!parentWindow) {
    try {
      await shell.openExternal(url);
    } catch (err) {
      console.error(`Failed to open external protocol link: ${url}`, err);
    }
    return;
  }

  const { response } = await dialog.showMessageBox(parentWindow, {
    type: 'question',
    buttons: ['Open Application', 'Cancel'],
    defaultId: 0,
    title: 'Open External Application?',
    message: `This website wants to open an external application for:\n\n${url}\n\nDo you want to allow this?`,
    cancelId: 1,
  });

  if (response === 0) {
    try {
      await shell.openExternal(url);
    } catch (err) {
      console.error(`Failed to open external protocol link: ${url}`, err);
    }
  }
}

const extensionsConfigPath = path.join(app.getPath('userData'), 'extensions-config.json');

interface ExtensionMetadata {
  id: string;
  name: string;
  version: string;
  path: string;
  enabled: boolean;
}

function getSavedExtensions(): ExtensionMetadata[] {
  try {
    if (fs.existsSync(extensionsConfigPath)) {
      return JSON.parse(fs.readFileSync(extensionsConfigPath, 'utf8'));
    }
  } catch (err) {
    console.error('Failed to read extensions config:', err);
  }
  return [];
}

function saveExtensions(extensions: ExtensionMetadata[]) {
  try {
    fs.writeFileSync(extensionsConfigPath, JSON.stringify(extensions, null, 2), 'utf8');
  } catch (err) {
    console.error('Failed to write extensions config:', err);
  }
}

async function loadExtensionsOnStartup() {
  const list = getSavedExtensions();
  for (const ext of list) {
    if (ext.enabled) {
      try {
        await session.defaultSession.loadExtension(ext.path, { allowFileAccess: true });
        console.log(`Loaded extension on startup: ${ext.name} (${ext.id})`);
      } catch (err) {
        console.error(`Failed to load extension at ${ext.path} on startup:`, err);
      }
    }
  }
}

function setupApplicationMenu(): void {
  // Menu disabled; accelerators handled by global keyboard listeners in renderer
  Menu.setApplicationMenu(null);
}

function createBrowserWindow(isIncognito: boolean = false): BrowserWindow {
  // Content Security Policy - strict in production, relaxed in dev for Vite HMR
  const isDevMode = !app.isPackaged;
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

  const win = new BrowserWindow({
    width: 1600,
    height: 1000,
    title: isIncognito ? 'ICRUSH BROWSER (Incognito)' : 'ICRUSH BROWSER',
    icon: path.join(__dirname, '..', 'assets', 'icon.png'),
    show: false,
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
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
    adBlockerManager.setMainWebContentsId(win.webContents.id);
  }

  // Set CSP header (only apply to the main browser UI window)
  const currentSession = isIncognito ? session.fromPartition(partition!) : session.defaultSession;
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
    } else {
      callback({ responseHeaders: details.responseHeaders });
    }
  });

  const queryStr = isIncognito ? '?incognito=true' : '';
  if (isDev) {
    win.loadURL(`http://localhost:5174${queryStr}`);
    if (!isIncognito) {
      win.webContents.openDevTools({ mode: 'detach' });
    }
  } else {
    win.loadFile(path.join(__dirname, '../dist/index.html'), { query: { incognito: isIncognito ? 'true' : 'false' } });
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
app.commandLine.appendSwitch('force-webrtc-ip-handling-policy', 'disable_non_proxied_udp');

app.whenReady().then(async () => {
  Menu.setApplicationMenu(null);
  app.userAgentFallback = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';
  await loadExtensionsOnStartup();
  setupApplicationMenu();
  const primaryWin = createBrowserWindow(false);
  shieldManager.setMainWebContentsId(primaryWin.webContents.id);
  adBlockerManager.setMainWebContentsId(primaryWin.webContents.id);
  initDownloadManager(primaryWin);
  securityManager.initIPC(primaryWin);
  initPasswordManager();
  initTorManager(() => getActiveWindow());
  initVPNManager(() => getActiveWindow());
  await initSecureDB();
  setupSessionInterceptors(session.defaultSession);

  // Intercept navigation requests to block dangerous sites
  app.on('web-contents-created', (event, contents) => {
    if (contents.getType() === 'webview') {
      contents.on('will-navigate', async (e, url) => {
        if (!url.startsWith('http://') && !url.startsWith('https://') && !url.startsWith('about:') && !url.startsWith('chrome://')) {
          e.preventDefault();
          handleExternalProtocol(contents, url);
          return;
        }

        const { safe, reason } = await securityManager.checkUrl(url);
        if (!safe) {
          e.preventDefault();
          contents.loadURL(
            `about:warning?url=${encodeURIComponent(url)}&reason=${reason || 'malware'}`
          );
        }
      });

      contents.on('will-redirect', async (e, url) => {
        if (!url.startsWith('http://') && !url.startsWith('https://') && !url.startsWith('about:') && !url.startsWith('chrome://')) {
          e.preventDefault();
          handleExternalProtocol(contents, url);
          return;
        }

        const { safe, reason } = await securityManager.checkUrl(url);
        if (!safe) {
          e.preventDefault();
          contents.loadURL(
            `about:warning?url=${encodeURIComponent(url)}&reason=${reason || 'malware'}`
          );
        }
      });
    }
  });
});

// Tor session tracking for proxy routing and kill switch
const torPartitions = new Set<string>();

// Register a partition for Tor proxy routing (called from renderer)
ipcMain.handle('tor:register-partition', async (_event, partition: string) => {
  const valid = validatePartition(partition);
  if (!valid.success) {
    console.error(`[Tor Proxy] Invalid partition: ${valid.error}`);
    return false;
  }
  const isTor = valid.data!.includes('tor-');
  if (!isTor) {
    try {
      const sess = valid.data!.startsWith('persist:') || valid.data!.startsWith('incognito-')
        ? session.fromPartition(valid.data!)
        : session.fromPartition(`persist:${valid.data!}`);
      await sess.setProxy({ mode: 'direct' });
      console.log(`[Proxy] Direct mode set for non-Tor partition: ${valid.data!}`);
      return true;
    } catch (err) {
      console.error(`[Proxy] Failed to set direct mode for partition: ${valid.data!}`, err);
      return false;
    }
  }

  torPartitions.add(valid.data!);
  try {
    const sess = valid.data!.startsWith('persist:') || valid.data!.startsWith('incognito-')
      ? session.fromPartition(valid.data!)
      : session.fromPartition(`persist:${valid.data!}`);
    await sess.setProxy({ proxyRules: torManager.getSocksProxy() });
    console.log(`[Tor Proxy] Proxy set for partition: ${valid.data!}`);
    return true;
  } catch (err) {
    console.error(`[Tor Proxy] Failed to set proxy for partition: ${valid.data!}`, err);
    return false;
  }
});

ipcMain.handle('tor:unregister-partition', async (_event, partition: string) => {
  const valid = validatePartition(partition);
  if (!valid.success) return;
  torPartitions.delete(valid.data!);
});

ipcMain.handle('session:purge-incognito', async (_event, partition: string) => {
  const valid = validatePartition(partition);
  if (!valid.success) return false;
  try {
    const ses = session.fromPartition(valid.data!);
    await ses.clearStorageData();
    await ses.clearCache();
    console.log(`[RAM Purge] Purged storage and cache for session: ${valid.data!}`);
    return true;
  } catch (err) {
    console.error(`Failed to purge session ${valid.data!}:`, err);
    return false;
  }
});

const interceptedSessions = new WeakSet<Electron.Session>();

function setupSessionInterceptors(ses: Electron.Session) {
  if (interceptedSessions.has(ses)) return;
  interceptedSessions.add(ses);

  const domainCache = new Map<number, string>();
  const partitionTorCache = new Map<string, boolean>();

  const resolveDomain = (webContentsId?: number): string => {
    if (!webContentsId) return '';
    const cached = domainCache.get(webContentsId);
    if (cached) return cached;
    const fromShield = shieldManager.getDomainForTab(webContentsId);
    if (fromShield) { domainCache.set(webContentsId, fromShield); return fromShield; }
    try {
      const wc = webContents.fromId(webContentsId);
      if (wc && !wc.isDestroyed()) {
        const url = wc.getURL();
        if (url && !url.startsWith('about:') && !url.startsWith('chrome:')) {
          const host = new URL(url).hostname;
          domainCache.set(webContentsId, host);
          return host;
        }
      }
    } catch { /* ignore */ }
    return '';
  };

  ses.webRequest.onBeforeRequest({ urls: ['<all_urls>'] }, (details, callback) => {
    if (details.resourceType && !['mainFrame', 'script', 'xhr', 'fetch'].includes(details.resourceType)) {
      callback({ cancel: false });
      return;
    }

    let rootDomain = resolveDomain(details.webContentsId);
    if (!rootDomain && details.url && !details.url.startsWith('about:') && !details.url.startsWith('chrome:')) {
      try { rootDomain = new URL(details.url).hostname; } catch { /* ignore */ }
    }

    if (rootDomain) {
      const shieldResult = shieldManager.evaluateRequest(details, rootDomain);
      if (shieldResult.cancel) { callback({ cancel: true }); return; }
      if (shieldResult.redirectURL) { callback({ redirectURL: shieldResult.redirectURL }); return; }
    }

    try {
      const partition = ((ses as unknown) as { partition?: string }).partition || '';
      let isTorSession = partitionTorCache.get(partition);
      if (isTorSession === undefined) {
        isTorSession = torPartitions.has(partition) ||
                       partition.includes('tor-') ||
                       partition.startsWith('persist:tor-') ||
                       partition.startsWith('tor-') ||
                       partition.startsWith('incognito-tor-');
        partitionTorCache.set(partition, isTorSession);
      }
      if (isTorSession && !torManager.getStatus().connected &&
          !details.url.startsWith('chrome://') && !details.url.startsWith('about:')) {
        callback({ cancel: true });
        return;
      }
    } catch { /* ignore */ }

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
      const headerEval = shieldManager.evaluateHeaders(details.url, rootDomain, details.requestHeaders);
      if (headerEval.requestHeaders) {
        callback({ requestHeaders: headerEval.requestHeaders });
        return;
      }
    }
    callback({ requestHeaders: details.requestHeaders });
  });
}

// Kill Switch & Ad/Tracker Blocker: Intercept all webview requests
app.on('web-contents-created', (event, contents) => {
  if (contents.getType() !== 'webview') return;

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

  const partition = ((contents.session as unknown) as { partition?: string }).partition || '';
  const isTorSession = partition.includes('tor-') ||
                       partition.startsWith('persist:tor-') ||
                       partition.startsWith('tor-') ||
                       partition.startsWith('incognito-tor-');

  // IMMEDIATELY set proxy for Tor sessions to avoid race condition
  if (isTorSession) {
    contents.session.setProxy({ proxyRules: torManager.getSocksProxy() })
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
        shieldManager.resetTab(contents.id, hostname);
      } catch { /* ignore */ }
    }
  });
});

function setupIncognitoSessionInterceptors(ses: Electron.Session) {
  if ((ses as any)._incognitoIntercepted) return;
  (ses as any)._incognitoIntercepted = true;

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
      } catch {
          // Ignore URL parsing errors
        }
    }

    callback({ cancel: false, requestHeaders });
  });

  ses.webRequest.onHeadersReceived((details, callback) => {
    callback({ cancel: false, responseHeaders: details.responseHeaders });
  });
}

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

interface FilePart {
  inlineData: {
    mimeType: string;
    data: string;
  };
}

interface GeminiSendPayload {
  message: string;
  history: Array<{ role: string; content: string }>;
  activeProvider?: string;
  customApiKey?: string;
  isTor?: boolean;
  forceLocal?: boolean;
  torCloudRouting?: boolean;
  files?: FilePart[];
  systemInstruction?: string;
}

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

interface AgentStepPayload {
  stepData: {
    goal: string;
    stepNumber: number;
    currentUrl: string;
    pageText: string;
    pageLinks: Array<{ text: string; url: string }>;
    history: string;
  };
  activeProvider?: string;
  customApiKey?: string;
}

interface AgentDecision {
  thought: string;
  action: 'navigate' | 'search' | 'click' | 'type' | 'scroll' | 'extract' | 'fill_form' | 'select' | 'press_key' | 'finish';
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

interface GeminiApiError extends Error {
  status?: number;
  statusText?: string;
  errorDetails?: Array<{ '@type': string; [key: string]: unknown }>;
}

function isGeminiApiError(error: unknown): error is GeminiApiError {
  return (
    error instanceof Error &&
    ('status' in error || 'statusText' in error || 'errorDetails' in error)
  );
}

function getGeminiErrorMessage(error: unknown): {
  userMessage: string;
  shouldRetry: boolean;
  retryAfter?: number;
} {
  if (isGeminiApiError(error)) {
    const status = error.status;
    if (status === 404) {
      return {
        userMessage:
          'The requested AI model was not found. Please check your API key and ensure you have access to the selected model.',
        shouldRetry: false,
      };
    }
    if (status === 429) {
      const retryAfter = error.errorDetails?.find(d => d['@type']?.includes('RetryInfo')) as
        | { retryDelay?: string }
        | undefined;
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
        userMessage:
          'Invalid API key or insufficient permissions. Please verify your API key in Settings.',
        shouldRetry: false,
      };
    }
  }
  if (error instanceof Error) {
    if (error.message.includes('404') || error.message.includes('not found')) {
      return {
        userMessage:
          'AI model not found. The model may have been deprecated or requires a different API version.',
        shouldRetry: false,
      };
    }
    if (
      error.message.includes('429') ||
      error.message.includes('quota') ||
      error.message.includes('rate limit')
    ) {
      return {
        userMessage: 'API rate limit exceeded. Please wait a moment and try again.',
        shouldRetry: true,
        retryAfter: 60000,
      };
    }
    if (
      error.message.includes('401') ||
      error.message.includes('403') ||
      error.message.includes('API key')
    ) {
      return {
        userMessage: 'Invalid or missing API key. Please configure your API key in Settings.',
        shouldRetry: false,
      };
    }
  }
  return {
    userMessage:
      error instanceof Error ? error.message : 'An unknown error occurred with the AI service.',
    shouldRetry: false,
  };
}

ipcMain.on('gemini:send', async (event, payload: GeminiSendPayload) => {
  const senderWebContents = event.sender;
  try {
    await streamGemini(
      payload.message,
      payload.history,
      payload.activeProvider,
      payload.customApiKey,
      textChunk => {
        if (!senderWebContents.isDestroyed()) {
          senderWebContents.send('gemini:stream', textChunk);
        }
      },
      commands => {
        if (!senderWebContents.isDestroyed()) {
          senderWebContents.send('browser:execute-commands', commands);
        }
      },
      {
        isTor: payload.isTor,
        forceLocal: payload.forceLocal,
        torCloudRouting: payload.torCloudRouting,
        files: payload.files,
        systemInstruction: payload.systemInstruction,
      }
    );
    if (!senderWebContents.isDestroyed()) {
      senderWebContents.send('gemini:done');
    }
  } catch (error) {
    console.error('Error during Gemini API call:', error);
    const { userMessage, shouldRetry, retryAfter } = getGeminiErrorMessage(error);
    if (!senderWebContents.isDestroyed()) {
      senderWebContents.send('gemini:error', userMessage, { shouldRetry, retryAfter });
    }
  }
});

ipcMain.handle('ai:request-cloud-plan', async (_event, payload: { prompt: string; provider: string; apiKey: string }) => {
  return await getCloudPlan(payload.prompt, payload.provider, payload.apiKey);
});

async function callProviderModel(
  apiKey: string,
  prompt: string,
  provider: string = 'gemini',
  modelName?: string,
  responseMimeType: string = 'application/json'
): Promise<string> {
  if (provider === 'local') {
    return await callLocalOllama(
      prompt,
      responseMimeType === 'application/json' ? 'json' : undefined
    );
  }

  const model = modelName || await autoDetectModel(provider, apiKey);

  if (provider === 'gemini') {
    const genAI = new GoogleGenerativeAI(apiKey);
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
    if (provider === 'groq') endpoint = 'https://api.groq.com/openai/v1/chat/completions';
    if (provider === 'openrouter') endpoint = 'https://openrouter.ai/api/v1/chat/completions';

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
        response_format:
          responseMimeType === 'application/json' ? { type: 'json_object' } : undefined,
      }),
    });

    if (!response.ok) {
      const errText = await response.text();
      throw new Error(`API error (${response.status}): ${errText}`);
    }

    const data = (await response.json()) as { choices?: Array<{ message?: { content?: string } }> };
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

    const data = (await response.json()) as { content?: Array<{ text?: string }> };
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

ipcMain.handle(
  'gemini:group',
  async (
    _event,
    {
      tabsList,
      customApiKey,
      activeProvider,
      category,
    }: { tabsList: TabInfo[]; customApiKey?: string; activeProvider?: string; category?: string }
  ): Promise<WorkspaceGroup[]> => {
    const provider = activeProvider || 'gemini';
    let apiKey = customApiKey;
    if (!apiKey) {
      if (provider === 'gemini') apiKey = process.env.GEMINI_API_KEY;
      else if (provider === 'openai') apiKey = process.env.OPENAI_API_KEY;
      else if (provider === 'anthropic') apiKey = process.env.ANTHROPIC_API_KEY;
      else if (provider === 'groq') apiKey = process.env.GROQ_API_KEY;
      else if (provider === 'openrouter') apiKey = process.env.OPENROUTER_API_KEY;
    }

    if (provider !== 'local') {
      if (!apiKey || apiKey === 'your_gemini_api_key_here' || apiKey === '') {
        throw new Error(
          `API key for ${provider} is not configured. Please add your API key in settings.`
        );
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

      const detectedModel = provider === 'local' ? 'qwen2.5:3b' : await autoDetectModel(provider, apiKey || '');
      const responseText = await callProviderModel(
        apiKey || '',
        prompt,
        provider,
        detectedModel,
        'application/json'
      );
      const parsed = JSON.parse(responseText);
      return parsed.map((item: { name: string; color: string; tabIds: string[] }, idx: number) => ({
        id: `workspace-${idx}`,
        name: item.name,
        color: item.color || '#6366f1',
        tabIds: item.tabIds || [],
      }));
    } catch (error) {
      console.error('Error during silent tab auto-grouping:', error);
      const { userMessage } = getGeminiErrorMessage(error);
      throw new Error(userMessage);
    }
  }
);

ipcMain.handle('window:toggle-fullscreen', () => {
  const win = getActiveWindow();
  if (win) {
    win.setFullScreen(!win.isFullScreen());
  }
});

ipcMain.handle(
  'gemini:agent-step',
  async (
    _event,
    { stepData, customApiKey, activeProvider }: AgentStepPayload
  ): Promise<AgentDecision> => {
    const provider = activeProvider || 'gemini';
    let apiKey = customApiKey;
    if (!apiKey) {
      if (provider === 'gemini') apiKey = process.env.GEMINI_API_KEY;
      else if (provider === 'openai') apiKey = process.env.OPENAI_API_KEY;
      else if (provider === 'anthropic') apiKey = process.env.ANTHROPIC_API_KEY;
      else if (provider === 'groq') apiKey = process.env.GROQ_API_KEY;
      else if (provider === 'openrouter') apiKey = process.env.OPENROUTER_API_KEY;
    }

    if (provider !== 'local') {
      if (!apiKey || apiKey === 'your_gemini_api_key_here' || apiKey === '') {
        throw new Error(
          `API key for ${provider} is not configured. Please add your API key in settings.`
        );
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

      const detectedModel = provider === 'local' ? 'qwen2.5:3b' : await autoDetectModel(provider, apiKey || '');
      const responseText = await callProviderModel(
        apiKey || '',
        prompt,
        provider,
        detectedModel,
        'application/json'
      );
      return JSON.parse(responseText);
    } catch (error) {
      console.error('Error during autonomous agent step:', error);
      const { userMessage } = getGeminiErrorMessage(error);
      throw new Error(userMessage);
    }
  }
);

ipcMain.handle(
  'ai:synthesize-research',
  async (
    _event,
    payload: { topic: string; dataOrQuery: string; provider?: string; apiKey?: string }
  ) => {
    const provider = payload.provider || 'gemini';
    let apiKey = payload.apiKey;
    if (!apiKey) {
      if (provider === 'gemini') apiKey = process.env.GEMINI_API_KEY;
      else if (provider === 'openai') apiKey = process.env.OPENAI_API_KEY;
      else if (provider === 'anthropic') apiKey = process.env.ANTHROPIC_API_KEY;
      else if (provider === 'groq') apiKey = process.env.GROQ_API_KEY;
      else if (provider === 'openrouter') apiKey = process.env.OPENROUTER_API_KEY;
    }
    return await synthesizeResearchReport(
      payload.topic,
      payload.dataOrQuery,
      provider,
      apiKey || ''
    );
  }
);

// Agent Execution Engine IPC Handlers
ipcMain.handle(
  'agent:execute',
  async (_event, action: { type: string; selector?: string; text?: string; value?: string; direction?: string; amount?: number; keys?: string; formFields?: Array<{ selector: string; value: string }> }) => {
    try {
      const jsCode = generateActionJS(parseAgentAction(action));
      return { success: true, jsCode };
    } catch (error) {
      return { success: false, error: String(error) };
    }
  }
);

ipcMain.handle('agent:extract-page', async () => {
  try {
    const jsCode = generateActionJS({ type: 'extract' });
    return { success: true, jsCode };
  } catch (error) {
    return { success: false, error: String(error) };
  }
});

// Encrypted Agent Memory Vault (AES-256 DPAPI at rest)
ipcMain.handle('agent:vault-list', async () => {
  return agentVault.list();
});

ipcMain.handle('agent:vault-get', async (_event, key: string) => {
  return agentVault.get(key);
});

ipcMain.handle('agent:vault-set', async (_event, { key, value, category }: { key: string; value: string; category?: any }) => {
  return agentVault.set(key, value, category);
});

ipcMain.handle('agent:vault-delete', async (_event, key: string) => {
  return agentVault.delete(key);
});

ipcMain.handle('agent:vault-stats', async () => {
  return agentVault.getStats();
});

// Backward-compatible aliases
ipcMain.handle('agent:get-memory', async () => {
  return agentVault.list();
});

ipcMain.handle('agent:set-memory', async (_event, { key, value }: { key: string; value: string }) => {
  return agentVault.set(key, value);
});

// Agent Action Undo & Reversible Operations Stack
ipcMain.handle('agent:record-action', async (_event, actionReq: any) => {
  return agentUndoStack.record(actionReq);
});

ipcMain.handle('agent:undo-last-action', async () => {
  return agentUndoStack.popUndo();
});

ipcMain.handle('agent:get-undo-history', async () => {
  return agentUndoStack.getHistory();
});

ipcMain.handle('agent:clear-undo-history', async () => {
  agentUndoStack.clear();
  return true;
});

// Model Context Protocol (MCP) Bridge Handlers
ipcMain.handle('mcp:list-tools', async () => {
  return mcpBridge.listTools();
});

ipcMain.handle('mcp:call-tool', async (_event, { toolId, params }: { toolId: string; params: Record<string, unknown> }) => {
  return mcpBridge.callTool(toolId, params);
});

ipcMain.handle('mcp:get-servers', async () => {
  return mcpBridge.getServers();
});

ipcMain.handle('mcp:configure-server', async (_event, config: any) => {
  return mcpBridge.configureServer(config);
});

// MCP OAuth IPC Handlers
ipcMain.handle('mcp:start-oauth', async (_event, serverId: string) => {
  return mcpBridge.startOAuthFlow(serverId);
});

ipcMain.handle('mcp:oauth-callback', async (_event, { code, serverId }: { code: string; serverId: string }) => {
  return mcpBridge.handleOAuthCallback(code, serverId);
});

ipcMain.handle('mcp:refresh-token', async (_event, serverId: string) => {
  return mcpBridge.refreshAccessToken(serverId);
});

ipcMain.handle('mcp:get-auth-status', async (_event, serverId: string) => {
  return mcpBridge.getAuthStatus(serverId);
});

// Sensitive Field User Confirmation
ipcMain.handle('agent:confirm-sensitive-action', async (_event, decision: SensitiveActionDecision) => {
  console.log(`[AgentSecurity] User decision for sensitive action prompt ${decision.promptId}: approved=${decision.approved}`);
  return decision.approved;
});

// Agent Sensitive Field Detection
ipcMain.handle('agent:detect-sensitive-fields', async () => {
  return { jsCode: generateSensitiveFieldDetectionJS() };
});

// Agent Visual Feedback
ipcMain.handle('agent:highlight', async (_event, { selector, color, duration }: { selector: string; color?: string; duration?: number }) => {
  return { jsCode: generateHighlightJS(selector, color, duration) };
});

ipcMain.handle('agent:tooltip', async (_event, { selector, text, color }: { selector: string; text: string; color?: string }) => {
  return { jsCode: generateTooltipJS(selector, text, color) };
});

ipcMain.handle('agent:click-ripple', async (_event, { x, y, color }: { x: number; y: number; color?: string }) => {
  return { jsCode: generateClickRippleJS(x, y, color) };
});

// Agent Skills (saved workflows)
const agentSkillsPath = path.join(app.getPath('userData'), 'agent-skills.json');

function loadAgentSkills(): Array<{ id: string; name: string; description: string; goal: string; steps: string; createdAt: number }> {
  try {
    if (fs.existsSync(agentSkillsPath)) {
      return JSON.parse(fs.readFileSync(agentSkillsPath, 'utf-8'));
    }
  } catch { /* ignore */ }
  return [];
}

function saveAgentSkills(skills: Array<{ id: string; name: string; description: string; goal: string; steps: string; createdAt: number }>): void {
  try {
    fs.writeFileSync(agentSkillsPath, JSON.stringify(skills, null, 2), 'utf-8');
  } catch (err) {
    console.error('Failed to save agent skills:', err);
  }
}

ipcMain.handle('agent:get-skills', async () => {
  return loadAgentSkills();
});

ipcMain.handle(
  'agent:save-skill',
  async (_event, skill: { name: string; description: string; goal: string; steps: string }) => {
    const skills = loadAgentSkills();
    const newSkill = {
      id: `skill-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      ...skill,
      createdAt: Date.now(),
    };
    skills.push(newSkill);
    saveAgentSkills(skills);
    return newSkill;
  }
);

ipcMain.handle('agent:delete-skill', async (_event, skillId: string) => {
  const skills = loadAgentSkills();
  const filtered = skills.filter(s => s.id !== skillId);
  if (filtered.length === skills.length) return false;
  saveAgentSkills(filtered);
  return true;
});

ipcMain.handle('agent:run-skill', async (_event, skillId: string) => {
  const skills = loadAgentSkills();
  const skill = skills.find(s => s.id === skillId);
  if (!skill) throw new Error('Skill not found');
  // Return the skill's goal so the frontend can trigger handleRunAgent
  return { goal: skill.goal, steps: skill.steps };
});

// Chrome Extensions IPC Handlers
ipcMain.handle('extensions:select-dir', async () => {
  if (!mainWindow) return null;
  const result = await dialog.showOpenDialog(mainWindow, {
    properties: ['openDirectory'],
    title: 'Select Unpacked Chrome Extension Folder',
  });
  if (result.canceled) return null;
  return result.filePaths[0];
});

ipcMain.handle('extensions:load', async (_event, extPath: string) => {
  try {
    const ext = await session.defaultSession.loadExtension(extPath, { allowFileAccess: true });
    const list = getSavedExtensions();
    const existingIdx = list.findIndex(e => e.id === ext.id);
    const meta: ExtensionMetadata = {
      id: ext.id,
      name: ext.name,
      version: ext.version,
      path: extPath,
      enabled: true,
    };
    if (existingIdx >= 0) {
      list[existingIdx] = meta;
    } else {
      list.push(meta);
    }
    saveExtensions(list);
    return meta;
  } catch (err) {
    console.error('Failed to load extension:', err);
    throw err;
  }
});

ipcMain.handle('extensions:remove', async (_event, id: string) => {
  try {
    session.defaultSession.removeExtension(id);
    const list = getSavedExtensions();
    const updated = list.filter(e => e.id !== id);
    saveExtensions(updated);
  } catch (err) {
    console.error('Failed to remove extension:', err);
    throw err;
  }
});

ipcMain.handle(
  'extensions:toggle',
  async (_event, { id, enabled }: { id: string; enabled: boolean }) => {
    try {
      const list = getSavedExtensions();
      const ext = list.find(e => e.id === id);
      if (!ext) throw new Error('Extension not found in config');

      if (enabled) {
        await session.defaultSession.loadExtension(ext.path, { allowFileAccess: true });
      } else {
        session.defaultSession.removeExtension(id);
      }
      ext.enabled = enabled;
      saveExtensions(list);
      return list;
    } catch (err) {
      console.error('Failed to toggle extension:', err);
      throw err;
    }
  }
);

ipcMain.handle('extensions:get-all', async () => {
  const list = getSavedExtensions();
  const loadedList = session.defaultSession.getAllExtensions();
  return list.map(item => ({
    ...item,
    isActive: loadedList.some(le => le.id === item.id),
  }));
});

// Install extension from URL (Chrome Web Store or .crx)
ipcMain.handle('extensions:install-from-url', async (_event, url: string) => {
  const extensionsDir = path.join(app.getPath('userData'), 'extensions');
  if (!fs.existsSync(extensionsDir)) {
    fs.mkdirSync(extensionsDir, { recursive: true });
  }

  let extDir = '';
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
    if (!response.ok) throw new Error(`Download failed: ${response.status}`);

    const buffer = await response.arrayBuffer();
    const data = Buffer.from(buffer);

    if (data.length < 4) throw new Error('Downloaded file is too small to be a valid extension');

    const extId = extensionId || `ext-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    extDir = path.join(extensionsDir, extId);
    if (!fs.existsSync(extDir)) fs.mkdirSync(extDir, { recursive: true });

    let zipData: Buffer;

    // CRX3: magic "Cr24" + version(4) + header_size(4 LE) + header + ZIP
    const isCrx3 = data[0] === 0x43 && data[1] === 0x72 && data[2] === 0x32 && data[3] === 0x34;
    // CRX2: magic "Cr23" + version(4) + header_size(2 BE) + header + ZIP
    const isCrx2 = data[0] === 0x43 && data[1] === 0x72 && data[2] === 0x32 && data[3] === 0x33;
    // ZIP: magic "PK\x03\x04"
    const isZip = data[0] === 0x50 && data[1] === 0x4B && data[2] === 0x03 && data[3] === 0x04;

    if (isCrx3) {
      const headerSize = data.readUInt32LE(8);
      zipData = data.slice(12 + headerSize);
    } else if (isCrx2) {
      const headerSize = data.readUInt16BE(8);
      zipData = data.slice(10 + headerSize);
    } else if (isZip) {
      zipData = data;
    } else {
      throw new Error('Downloaded file is not a valid extension (not CRX2, CRX3, or ZIP)');
    }

    // Extract using adm-zip
    const AdmZip = (await import('adm-zip')).default;
    const zip = new AdmZip(zipData);
    zip.extractAllTo(extDir, true);

    // Load the extension
    const ext = await session.defaultSession.loadExtension(extDir, { allowFileAccess: true });
    const list = getSavedExtensions();
    const meta: ExtensionMetadata = {
      id: ext.id,
      name: ext.name,
      version: ext.version,
      path: extDir,
      enabled: true,
    };
    const existingIdx = list.findIndex(e => e.id === ext.id);
    if (existingIdx >= 0) {
      list[existingIdx] = meta;
    } else {
      list.push(meta);
    }
    saveExtensions(list);
    return meta;
  } catch (err) {
    // Cleanup on failure
    if (extDir && fs.existsSync(extDir)) {
      try { fs.rmSync(extDir, { recursive: true, force: true }); } catch { /* ignore cleanup errors */ }
    }
    console.error('Failed to install extension from URL:', err);
    throw err;
  }
});

// Removed gemini:get-env-key — API keys should only be accessed through the encrypted api-keys store
// to prevent potential XSS exfiltration from the renderer process

ipcMain.handle('gemini:get-cloud-plan', async (_event, { prompt, provider, apiKey }: { prompt: string; provider: string; apiKey: string }) => {
  return getCloudPlan(prompt, provider, apiKey);
});

// Tor IPC Handlers
ipcMain.handle('tor:get-status', async () => {
  const { torManager } = await import('./tor-manager.js');
  return torManager.getStatus();
});

ipcMain.handle('tor:connect', async () => {
  const { torManager } = await import('./tor-manager.js');
  try {
    const result = await torManager.connect();
    if (result) {
      return { success: true };
    }
    const errorMsg = torManager.getLastConnectError?.() || 'Connection failed';
    return { success: false, error: errorMsg };
  } catch (err) {
    console.error('tor:connect failed:', err);
    return { success: false, error: (err as Error).message };
  }
});

ipcMain.handle('tor:cancel-connect', async () => {
  const { torManager } = await import('./tor-manager.js');
  await torManager.cancelConnect();
  return { success: true };
});

ipcMain.handle('tor:disconnect', async () => {
  const { torManager } = await import('./tor-manager.js');
  return torManager.disconnect();
});

ipcMain.handle('tor:new-circuit', async () => {
  const { torManager } = await import('./tor-manager.js');
  return torManager.newCircuit();
});

ipcMain.handle('tor:is-mode', async () => {
  const { torManager } = await import('./tor-manager.js');
  return torManager.isTorMode();
});

ipcMain.handle('tor:set-mode', async (_event, enabled: boolean) => {
  const { torManager } = await import('./tor-manager.js');
  return torManager.setTorMode(enabled);
});

// Bridge Management IPC Handlers
ipcMain.handle(
  'tor:add-bridge',
  async (
    _event,
    bridge: {
      type: 'obfs4' | 'snowflake' | 'meek';
      address: string;
      port: number;
      fingerprint?: string;
      cert?: string;
      iatMode?: number;
    }
  ) => {
    const { torManager } = await import('./tor-manager.js');
    return torManager.addBridge(bridge);
  }
);

ipcMain.handle('tor:remove-bridge', async (_event, address: string) => {
  const { torManager } = await import('./tor-manager.js');
  return torManager.removeBridge(address);
});

ipcMain.handle(
  'tor:set-bridges',
  async (
    _event,
    bridges: {
      type: 'obfs4' | 'snowflake' | 'meek';
      address: string;
      port: number;
      fingerprint?: string;
      cert?: string;
      iatMode?: number;
    }[]
  ) => {
    const { torManager } = await import('./tor-manager.js');
    return torManager.setBridges(bridges);
  }
);

ipcMain.handle('tor:set-bridge-type', async (_event, type: 'obfs4' | 'snowflake' | 'none') => {
  const { torManager } = await import('./tor-manager.js');
  return torManager.setBridgeType(type);
});

ipcMain.handle('tor:set-use-bridges', async (_event, enabled: boolean) => {
  const { torManager } = await import('./tor-manager.js');
  return torManager.setUseBridges(enabled);
});

ipcMain.handle('tor:get-bridges', async () => {
  const { torManager } = await import('./tor-manager.js');
  return torManager.getBridges();
});

ipcMain.handle('tor:get-bridge-type', async () => {
  const { torManager } = await import('./tor-manager.js');
  return torManager.getBridgeType();
});

ipcMain.handle('tor:is-using-bridges', async () => {
  const { torManager } = await import('./tor-manager.js');
  return torManager.isUsingBridges();
});

// Onion Service (.onion) IPC Handlers
ipcMain.handle('tor:is-onion', async (_event, url: string) => {
  const { TorManager } = await import('./tor-manager.js');
  return TorManager.isOnionAddress(url);
});

ipcMain.handle('tor:ensure-onion-url', async (_event, url: string) => {
  const { TorManager } = await import('./tor-manager.js');
  return TorManager.ensureOnionUrl(url);
});

ipcMain.handle('tor:should-use-tor', async (_event, url: string, torMode: boolean) => {
  const { TorManager } = await import('./tor-manager.js');
  return TorManager.shouldUseTor(url, torMode);
});

// Get cookies for a partition
ipcMain.handle('session:get-cookies', async (_event, partition?: string) => {
  try {
    const targetSession = partition ? session.fromPartition(partition) : session.defaultSession;
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
  } catch (err) {
    console.error('[Session] Failed to get cookies:', err);
    return [];
  }
});

// Delete a specific cookie
ipcMain.handle('session:delete-cookie', async (_event, url: string, name: string, partition?: string) => {
  try {
    const targetSession = partition ? session.fromPartition(partition) : session.defaultSession;
    await targetSession.cookies.remove(url, name);
    return true;
  } catch (err) {
    console.error('[Session] Failed to delete cookie:', err);
    return false;
  }
});

// Clear storage/cookies for a partition (e.g. for Forget Me shields feature)
ipcMain.handle('session:clear-data', async (_event, originOrPartition: string, partition?: string) => {
  try {
    // If only an origin URL is provided (no explicit partition), find the webview's actual session
    let part: string;
    if (partition) {
      part = partition;
    } else {
      // Try to find the webContents that matches this origin and get its session partition
      const allContents = webContents.getAllWebContents();
      let foundPartition: string | null = null;
      for (const wc of allContents) {
        if (wc.getURL().startsWith(originOrPartition)) {
          // Found the webContents - use a persist partition based on origin
          foundPartition = `persist:${originOrPartition.replace(/[^a-zA-Z0-9]/g, '_')}`;
          break;
        }
      }
      part = foundPartition || `persist:${originOrPartition.replace(/[^a-zA-Z0-9]/g, '_')}`;
    }
    const targetSession = session.fromPartition(part);
    await targetSession.clearStorageData({
      storages: ['cookies', 'filesystem', 'indexdb', 'localstorage', 'shadercache', 'websql', 'serviceworkers', 'cachestorage']
    });
    console.log(`[Session] Wiped all storage data for partition: ${part}`);
    return true;
  } catch (err) {
    console.error(`[Session] Failed to clear storage for partition:`, err);
    return false;
  }
});



// Encrypted API Key Storage IPC Handlers
// Uses Electron's safeStorage for encrypting API keys at rest
const apiKeysPath = path.join(app.getPath('userData'), 'api-keys.enc');

ipcMain.handle('api-keys:get-all', async () => {
  try {
    if (!fs.existsSync(apiKeysPath)) {
      return {};
    }
    const encrypted = fs.readFileSync(apiKeysPath);
    const decrypted = safeStorage.decryptString(encrypted);
    return JSON.parse(decrypted);
  } catch (err) {
    console.error('Failed to load API keys:', err);
    return {};
  }
});

ipcMain.handle('api-keys:set-all', async (_event, keys: Record<string, string>) => {
  try {
    const json = JSON.stringify(keys);
    const encrypted = safeStorage.encryptString(json);
    fs.writeFileSync(apiKeysPath, encrypted);
    return true;
  } catch (err) {
    console.error('Failed to save API keys:', err);
    return false;
  }
});

// VPN Manager IPC Handlers
ipcMain.handle('vpn:get-status', () => vpnManager.getStatus());
ipcMain.handle('vpn:get-servers', () => vpnManager.getServers());
ipcMain.handle('vpn:get-plans', () => vpnManager.getPlans());
ipcMain.handle('vpn:get-selected-server', () => vpnManager.getSelectedServer());
ipcMain.handle('vpn:get-selected-plan', () => vpnManager.getSelectedPlan());
ipcMain.handle('vpn:set-server', (_event, countryCode: string) => vpnManager.setServer(countryCode));
ipcMain.handle('vpn:set-plan', (_event, planId: string) => vpnManager.setPlan(planId));
ipcMain.handle('vpn:connect', () => vpnManager.connect());
ipcMain.handle('vpn:disconnect', () => vpnManager.disconnect());
ipcMain.handle('vpn:is-mode-enabled', () => vpnManager.isVPNMode());
ipcMain.handle('vpn:set-mode-enabled', (_event, enabled: boolean) => {
  vpnManager.setVPNMode(enabled);
  return vpnManager.isVPNMode();
});
ipcMain.handle('vpn:is-killswitch-enabled', () => vpnManager.isKillSwitchEnabled());
ipcMain.handle('vpn:set-killswitch-enabled', (_event, enabled: boolean) => {
  vpnManager.setKillSwitch(enabled);
  return vpnManager.isKillSwitchEnabled();
});

// Sub-Agent Pool IPC Handlers
ipcMain.handle('sub-agent:create', async (_event, { parentAgentId, goal }: { parentAgentId: string; goal: string }) => {
  return subAgentPool.createAgent(parentAgentId, goal);
});

ipcMain.handle('sub-agent:get', async (_event, agentId: string) => {
  return subAgentPool.getAgent(agentId);
});

ipcMain.handle('sub-agent:get-by-parent', async (_event, parentId: string) => {
  return subAgentPool.getAgentsByParent(parentId);
});

ipcMain.handle('sub-agent:get-all', async () => {
  return subAgentPool.getAllAgents();
});

ipcMain.handle('sub-agent:get-stats', async () => {
  return subAgentPool.getStats();
});

ipcMain.handle('sub-agent:cancel', async (_event, agentId: string) => {
  subAgentPool.cancelAgent(agentId);
  return true;
});

// Agent Scheduler IPC Handlers
ipcMain.handle('scheduler:add-task', async (_event, { name, goal, cronExpression }: { name: string; goal: string; cronExpression: string }) => {
  return agentScheduler.addTask(name, goal, cronExpression);
});

ipcMain.handle('scheduler:remove-task', async (_event, taskId: string) => {
  return agentScheduler.removeTask(taskId);
});

ipcMain.handle('scheduler:update-task', async (_event, { taskId, updates }: { taskId: string; updates: Partial<ScheduledTask> }) => {
  return agentScheduler.updateTask(taskId, updates);
});

ipcMain.handle('scheduler:enable-task', async (_event, taskId: string) => {
  return agentScheduler.enableTask(taskId);
});

ipcMain.handle('scheduler:disable-task', async (_event, taskId: string) => {
  return agentScheduler.disableTask(taskId);
});

ipcMain.handle('scheduler:get-task', async (_event, taskId: string) => {
  return agentScheduler.getTask(taskId);
});

ipcMain.handle('scheduler:get-all-tasks', async () => {
  return agentScheduler.getAllTasks();
});

ipcMain.handle('scheduler:run-now', async (_event, taskId: string) => {
  return agentScheduler.runTaskNow(taskId);
});
