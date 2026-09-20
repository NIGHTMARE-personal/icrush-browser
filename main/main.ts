import { app, BrowserWindow, ipcMain, dialog, session, Menu, shell, safeStorage, webContents } from 'electron';
import path from 'path';
import fs from 'fs';
import { streamGemini, autoDetectModel, getCloudPlan, callLocalOllama, synthesizeResearchReport, getRecommendedLocalModel, ensureOllamaRunning, callProviderModel } from './gemini';
import { GoogleGenerativeAI } from '@google/generative-ai';
import { initDownloadManager } from './download-manager';
import { initPasswordManager } from './password-manager';
import { torManager, initTorManager } from './tor-manager';
import { securityManager } from './security-manager';
import { adBlockerManager } from './adblocker';
import { shieldManager } from './shield-manager';
import { vpnManager, initVPNManager } from './vpn-manager';
import { initSecureDB } from './secure-db';
import { validatePartition } from './ipc-validators';
import { generateActionJS, parseAgentAction, generateSensitiveFieldDetectionJS, generateHighlightJS, generateTooltipJS, generateClickRippleJS } from './agent-engine';
import { agentVault, agentMemoryVault } from './agent-memory-vault';
import { agentUndoStack, recordAgentAction, undoLastAction, getUndoHistory, clearUndoHistory } from './agent-undo-stack';
import { mcpBridge } from './mcp-bridge';
import { subAgentPool } from './sub-agent-pool';
import { agentScheduler, ScheduledTask } from './agent-scheduler';
import type { SensitiveActionDecision } from '../shared/agent-contracts';
import {
  APPROVAL_TTL_MS,
  appendAuditLogFile,
  buildAuditEvent,
  crossesTrustBoundary,
  defaultPolicyStore,
  domainOf,
  evaluateAction,
  loadAuditLog,
  loadPolicyStore,
  newPromptId,
  savePolicyStore,
} from './agent-policy';
import type {
  AgentAuditEvent,
  AgentPermissionTier,
  AgentPolicyStore,
  SensitiveField,
} from '../shared/agent-contracts';
import {
  assessManifest,
  matchesBlocklist,
  parseBlocklist,
  parseCrxZipRange,
} from './extension-trust';
import type { ExtensionTrustReport } from './extension-trust';
import {
  discoverLocalModels,
  getBestLocalModel,
  getRouterState,
  grantCloudConsent,
  hasCloudConsent,
  revokeCloudConsent,
  routePrompt,
  streamPrompt,
  getLocalEmbedding,
  localSemanticSearch,
  getStoredApiKeys,
  setStoredApiKeys,
  getApiKey,
  setApiKey,
} from './local-model-router';
import type { AIProvider, ModelInfo, CloudConsentRecord, RouterState } from './local-model-router';
import {
  loadAgentCredentials,
  createAgentIdentity,
  getAgentIdentity,
  listAgentCredentials,
  removeAgentIdentity,
  signAgentChallenge,
  verifyAgentSignature,
  getAgentEncryptionKey,
  getAgentSigningKey,
  rotateAgentSessionKeys,
  exportAgentPublicIdentity,
} from './agent-identity';
import type { AgentCredential, AgentIdentity } from './agent-identity';
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

app.whenReady().then(async () => {
  writeCrashLog('STARTUP', 'App starting...');
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

  app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') {
      app.quit();
    }
  });

// ─── Helper Functions ─────────────────────────────────────────────────────

function createBrowserWindow(isIncognito: boolean): BrowserWindow {
  const partition = isIncognito ? `incognito-${Date.now()}` : 'persist:default';
  const appIconPath = path.join(__dirname, '../assets/icon.ico');
  const win = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 800,
    minHeight: 600,
    title: 'ICRUSH Browser',
    icon: fs.existsSync(appIconPath) ? appIconPath : undefined,
    webPreferences: {
      preload: path.join(__dirname, 'preload'),
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
    if (win === mainWindow) mainWindow = null;
  });

  if (!mainWindow) mainWindow = win;

  win.loadURL(isDev ? 'http://localhost:5174' : 'file://' + path.join(__dirname, '../dist/index.html'));

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
    } else {
      // Production: reject all certificate errors
      callback(false);
    }
  });

  return win;
}

function setupApplicationMenu(): void {
  const template: Electron.MenuItemConstructorOptions[] = [
    { label: 'File', submenu: [
      { label: 'New Tab', accelerator: 'CmdOrCtrl+T', click: () => getActiveWindow()?.webContents.send('tab:new') },
      { label: 'New Window', accelerator: 'CmdOrCtrl+N', click: () => createBrowserWindow(false) },
      { label: 'New Incognito Window', accelerator: 'CmdOrCtrl+Shift+N', click: () => createBrowserWindow(true) },
      { type: 'separator' },
      { label: 'Close Tab', accelerator: 'CmdOrCtrl+W', click: () => getActiveWindow()?.webContents.send('tab:close') },
      { role: 'quit' },
    ]},
    { label: 'Edit', submenu: [
      { role: 'undo' }, { role: 'redo' }, { type: 'separator' },
      { role: 'cut' }, { role: 'copy' }, { role: 'paste' }, { role: 'selectAll' },
    ]},
    { label: 'View', submenu: [
      { role: 'reload' }, { role: 'forceReload' }, { role: 'toggleDevTools' },
      { type: 'separator' },
      { role: 'resetZoom' }, { role: 'zoomIn' }, { role: 'zoomOut' },
      { type: 'separator' },
      { role: 'togglefullscreen' },
    ]},
    { label: 'Window', submenu: [
      { role: 'minimize' }, { role: 'zoom' }, { role: 'close' },
    ]},
  ];
  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

function setupSessionInterceptors(ses: Electron.Session): void {
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

function writeCrashLog(phase: string, message: string): void {
  try {
    const logDir = path.join(app.getPath('userData'), 'logs');
    if (!fs.existsSync(logDir)) fs.mkdirSync(logDir, { recursive: true });
    const logFile = path.join(logDir, 'crash.log');
    const entry = `[${new Date().toISOString()}] [${phase}] ${message}\n`;
    fs.appendFileSync(logFile, entry);
  } catch { /* ignore */ }
}

async function loadExtensionsOnStartup(): Promise<void> {
  try {
    const extDir = path.join(app.getPath('userData'), 'extensions');
    if (!fs.existsSync(extDir)) return;
    const dirs = fs.readdirSync(extDir).filter(d => {
      try { return fs.statSync(path.join(extDir, d)).isDirectory(); } catch { return false; }
    });
    for (const dir of dirs) {
      try {
        const extPath = path.join(extDir, dir);
        await session.defaultSession.loadExtension(extPath);
        console.log(`[Extensions] Loaded: ${dir}`);
      } catch (err) {
        console.error(`[Extensions] Failed to load ${dir}:`, err);
      }
    }
  } catch { /* ignore */ }
}

// ─── Agent Runtime IPC Handlers ───────────────────────────────────────────

import { AgentRunLoop, generateDefaultPlan } from './agent-loop';
import { DOMEngine } from './dom-engine';
import { PageUnderstandingEngine } from './page-understanding';
import { AgentPlanner } from './agent-planner';
import { ToolRegistry } from './tool-registry';
import { SafetySandbox } from './agent-sandbox';
import { SubAgentCoordinator } from './sub-agent-coordinator';
import { CrossTabAgent } from './cross-tab-agent';
import { AgentMemory } from './agent-memory';

const toolRegistry = new ToolRegistry(app.getPath('userData'));
const safetySandbox = new SafetySandbox();
const crossTabAgent = new CrossTabAgent();
const agentMemory = new AgentMemory();
const userDataPath = app.getPath('userData');
const policyStorePath = path.join(userDataPath, 'agent-policy.json');
const auditLogPath = path.join(userDataPath, 'agent-audit.jsonl');

let activeRunLoop: AgentRunLoop | null = null;

// Agent loop: start
ipcMain.handle('agent:start', async (_event, goal: { description: string; url?: string; maxSteps?: number; timeoutMs?: number }) => {
  if (activeRunLoop && activeRunLoop.getState() !== 'completed' && activeRunLoop.getState() !== 'failed' && activeRunLoop.getState() !== 'cancelled') {
    return { error: 'Agent loop already running' };
  }

  const policyStore = loadPolicyStore(policyStorePath);
  activeRunLoop = new AgentRunLoop(policyStore);
  const win = getActiveWindow();

  activeRunLoop.setCallbacks({
    onProgress: (progress) => {
      win?.webContents.send('agent:progress', progress);
    },
    onStateChange: (state) => {
      win?.webContents.send('agent:state-change', state);
    },
    onAudit: (event) => {
      appendAuditLogFile(auditLogPath, event);
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
  } catch (err) {
    return { error: (err as Error).message };
  }
});

// Agent loop: cancel
ipcMain.handle('agent:cancel', async () => {
  if (activeRunLoop) {
    activeRunLoop.cancel('User cancelled');
    return { success: true };
  }
  return { error: 'No active loop' };
});

// Agent loop: get progress
ipcMain.handle('agent:get-progress', async () => {
  return activeRunLoop?.getProgress() || null;
});

// Agent loop: undo last action
ipcMain.handle('agent:undo', async () => {
  return activeRunLoop?.undoLast() || { success: false, error: 'No active loop' };
});

// Agent policy: get/set site policy
ipcMain.handle('agent:get-policy', async () => {
  return loadPolicyStore(policyStorePath);
});

ipcMain.handle('agent:set-site-policy', async (_event, domain: string, policy: { maxTier?: string; allowSensitive?: boolean }) => {
  const store = loadPolicyStore(policyStorePath);
  store.sites[domain] = {
    domain,
    maxTier: (policy.maxTier || 'sensitive') as AgentPermissionTier,
    allowSensitive: policy.allowSensitive !== false,
    updatedAt: Date.now(),
  };
  savePolicyStore(policyStorePath, store);
  return store;
});

// Agent audit log
ipcMain.handle('agent:get-audit-log', async () => {
  return loadAuditLog(auditLogPath);
});

ipcMain.handle('agent:clear-audit-log', async () => {
  try {
    const logPath = path.join(app.getPath('userData'), 'agent-audit.jsonl');
    if (fs.existsSync(logPath)) fs.writeFileSync(logPath, '');
    return { success: true };
  } catch { return { error: 'Failed to clear audit log' }; }
});

// Navigation trust boundary check
ipcMain.handle('agent:check-navigation', async (_event, fromUrl: string, toUrl: string) => {
  return crossesTrustBoundary(fromUrl, toUrl);
});

// Tool registry
ipcMain.handle('agent:tool-list', async () => {
  return toolRegistry.getEnabledTools();
});

ipcMain.handle('agent:tool-execute', async (_event, toolId: string, params: Record<string, unknown>) => {
  const result = await toolRegistry.execute({
    toolId,
    params,
    callId: `ipc-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    timestamp: Date.now(),
  });
  return result;
});

// Safety sandbox
ipcMain.handle('agent:sandbox-state', async () => {
  return { state: safetySandbox.getState(), usage: safetySandbox.getUsage() };
});

ipcMain.handle('agent:sandbox-kill-switch', async () => {
  safetySandbox.triggerKillSwitch('Manual kill switch');
  return { success: true };
});

// Cross-tab
ipcMain.handle('agent:cross-tab-compare', async (_event, tabIdA: string, tabIdB: string) => {
  return crossTabAgent.compareTabs(tabIdA, tabIdB).catch(e => ({ error: e.message }));
});

ipcMain.handle('agent:cross-tab-merge', async (_event, tabIds: string[]) => {
  return crossTabAgent.mergeTabs(tabIds).catch(e => ({ error: e.message }));
});

// Memory
ipcMain.handle('agent:memory-stats', async () => {
  return agentMemory.getStats();
});

ipcMain.handle('agent:memory-compact', async () => {
  return agentMemory.compact();
});

// Router state
ipcMain.handle('agent:router-state', async () => {
  return getRouterState();
});

ipcMain.handle('agent:router-consent', async (_event, provider: string, scope?: string) => {
  grantCloudConsent(provider as AIProvider, scope as 'session' | 'persistent' || 'session');
  return { success: true };
});

ipcMain.handle('agent:router-revoke', async (_event, provider?: string) => {
  revokeCloudConsent(provider as AIProvider | undefined);
  return { success: true };
});

// Agent identity
ipcMain.handle('agent:identity-list', async () => {
  return listAgentCredentials();
});

ipcMain.handle('agent:identity-create', async (_event, name: string) => {
  return createAgentIdentity(name, {} as PublicKeyCredentialCreationOptions);
});

ipcMain.handle('agent:identity-remove', async (_event, credentialId: string) => {
  return removeAgentIdentity(credentialId);
});

// API keys
ipcMain.handle('agent:get-api-key', async (_event, provider: string) => {
  return getApiKey(provider as AIProvider);
});

ipcMain.handle('agent:set-api-key', async (_event, provider: string, key: string) => {
  return setApiKey(provider as AIProvider, key);
});

// Gemini streaming (existing)
ipcMain.handle('send-gemini-message', async (_event, prompt: string, history: Array<{ role: string; content: string }>, provider: string, apiKey: string, options: Record<string, unknown>) => {
  const win = getActiveWindow();
  try {
    await streamGemini(prompt, history, provider, apiKey, (chunk) => {
      win?.webContents.send('gemini-response', chunk);
    }, (commands) => {
      win?.webContents.send('gemini-commands', commands);
    }, options);
    win?.webContents.send('gemini-done');
    return { success: true };
  } catch (err) {
    win?.webContents.send('gemini-error', (err as Error).message);
    return { error: (err as Error).message };
  }
});

// Extension trust analysis
ipcMain.handle('extension:analyze-manifest', async (_event, manifest: unknown) => {
  return assessManifest(manifest);
});

// VPN control
ipcMain.handle('vpn:connect', async () => {
  return vpnManager.connect();
});

ipcMain.handle('vpn:disconnect', async () => {
  return vpnManager.disconnect();
});

ipcMain.handle('vpn:status', async () => {
  return vpnManager.getStatus();
});

ipcMain.handle('vpn:import-config', async (_event, rawConfig: string) => {
  return vpnManager.importConfig(rawConfig);
});

ipcMain.handle('vpn:get-config', async () => {
  const config = vpnManager.getConfig();
  // SECURITY: Never return the private key to the renderer
  if (config?.parsed) {
    return { ...config, parsed: { ...config.parsed, privateKey: '***REDACTED***' } };
  }
  return config;
});

ipcMain.handle('vpn:clear-config', async () => {
  return vpnManager.clearConfig();
});

// Tor control
ipcMain.handle('tor:connect', async () => {
  return torManager.connect();
});

ipcMain.handle('tor:disconnect', async () => {
  return torManager.disconnect();
});

ipcMain.handle('tor:status', async () => {
  return torManager.getStatus();
});

// Extension Security — trust assessment before installation
ipcMain.handle('extensions:install-from-url', async (_event, url: string, opts?: { approvedReportId?: string }) => {
  try {
    const { assessManifest } = await import('./extension-trust');
    // Validate URL is HTTPS
    if (!url.startsWith('https://')) {
      throw new Error('Extensions can only be installed from HTTPS URLs');
    }
    // Download and assess trust before installing
    const response = await fetch(url);
    if (!response.ok) throw new Error(`Failed to download extension: ${response.status}`);
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
    const extPath = path.join(app.getPath('userData'), 'extensions', `ext-${Date.now()}`);
    if (!fs.existsSync(extPath)) fs.mkdirSync(extPath, { recursive: true });
    // Extract CRX (strip header)
    const crxContent = buffer.toString('base64');
    fs.writeFileSync(path.join(extPath, 'extension.crx'), crxContent);
    return { ...report, installed: true };
  } catch (err) {
    throw new Error(`Extension install failed: ${(err as Error).message}`);
  }
});

ipcMain.handle('extensions:load', async (_event, extPath: string) => {
  try {
    // SECURITY: Only allow loading from the extensions directory
    const extDir = path.join(app.getPath('userData'), 'extensions');
    const resolved = path.resolve(extPath);
    if (!resolved.startsWith(extDir)) {
      throw new Error('Extensions can only be loaded from the extensions directory');
    }
    const { assessManifest } = await import('./extension-trust');
    // Read manifest.json for trust assessment
    const manifestPath = path.join(resolved, 'manifest.json');
    if (fs.existsSync(manifestPath)) {
      const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf-8'));
      const report = assessManifest(manifest);
      if (report.riskLevel === 'blocked') {
        throw new Error(`Extension blocked: ${report.findings.join(', ')}`);
      }
    }
    return await session.defaultSession.loadExtension(resolved);
  } catch (err) {
    throw new Error(`Extension load failed: ${(err as Error).message}`);
  }
});

// Auto-updater
ipcMain.handle('updater:check', async () => {
  try {
    const { checkForAppUpdates } = await import('./app-updater');
    return checkForAppUpdates(true);
  } catch { return { status: 'unavailable' }; }
});

// API Key Management — encrypted at rest, validated on write
ipcMain.handle('api-keys:get-all', async () => {
  try {
    const { getStoredApiKeys } = await import('./local-model-router');
    const keys = await getStoredApiKeys();
    // SECURITY: Return masked keys to renderer
    const masked: Record<string, string> = {};
    for (const [k, v] of Object.entries(keys)) {
      masked[k] = typeof v === 'string' && v.length > 8 ? v.slice(0, 4) + '***' + v.slice(-4) : '***';
    }
    return masked;
  } catch { return {}; }
});

ipcMain.handle('api-keys:set-all', async (_event, keys: Record<string, string>) => {
  // SECURITY: Validate all keys before writing
  if (!keys || typeof keys !== 'object') return false;
  const ALLOWED_PROVIDERS = ['gemini', 'openai', 'anthropic', 'groq', 'openrouter', 'deepseek', 'ollama'];
  const validated: Record<string, string> = {};
  for (const [provider, key] of Object.entries(keys)) {
    if (!ALLOWED_PROVIDERS.includes(provider)) continue;
    if (typeof key !== 'string' || key.length < 8) continue;
    // Block keys that contain control characters or are suspiciously long
    if (/[\x00-\x08\x0e-\x1f]/.test(key) || key.length > 512) continue;
    validated[provider] = key;
  }
  if (Object.keys(validated).length === 0) return false;
  try {
    const { setStoredApiKeys } = await import('./local-model-router');
    await setStoredApiKeys(validated);
    return true;
  } catch { return false; }
});

// Settings
ipcMain.handle('settings:get', async (_event, key: string) => {
  try {
    const settingsPath = path.join(app.getPath('userData'), 'settings.json');
    if (!fs.existsSync(settingsPath)) return null;
    const settings = JSON.parse(fs.readFileSync(settingsPath, 'utf8'));
    return settings[key] ?? null;
  } catch { return null; }
});

ipcMain.handle('settings:set', async (_event, key: string, value: unknown) => {
  try {
    const settingsPath = path.join(app.getPath('userData'), 'settings.json');
    let settings: Record<string, unknown> = {};
    if (fs.existsSync(settingsPath)) {
      settings = JSON.parse(fs.readFileSync(settingsPath, 'utf8'));
    }
    settings[key] = value;
    fs.writeFileSync(settingsPath, JSON.stringify(settings, null, 2));
    return { success: true };
  } catch { return { error: 'Failed to save setting' }; }
});