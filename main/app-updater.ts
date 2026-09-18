/**
 * Application auto-updater (main process).
 *
 * Wraps electron-updater with a persisted on/off setting, startup + interval
 * checks, and status broadcasts to the renderer. Degrades gracefully when
 * running unpackaged (dev) or without release metadata: status becomes
 * 'unavailable' instead of throwing.
 */
import { app, BrowserWindow } from 'electron';
import fs from 'fs';
import path from 'path';
import { autoUpdater } from 'electron-updater';
import type { ProgressInfo, UpdateInfo } from 'electron-updater';

export type UpdaterStatus =
  | 'idle'
  | 'checking'
  | 'available'
  | 'downloading'
  | 'downloaded'
  | 'up-to-date'
  | 'unavailable'
  | 'error';

export interface UpdaterState {
  status: UpdaterStatus;
  enabled: boolean;
  appVersion: string;
  version?: string;
  progress?: number;
  error?: string;
  lastChecked?: number;
}

type WindowGetter = () => BrowserWindow | null;

let windowGetter: WindowGetter = () => null;
let started = false;
let state: UpdaterState = {
  status: 'idle',
  enabled: true,
  appVersion: app.getVersion(),
};

function configPath(): string {
  return path.join(app.getPath('userData'), 'updater-config.json');
}

function loadEnabled(): boolean {
  try {
    const raw = JSON.parse(fs.readFileSync(configPath(), 'utf-8')) as unknown;
    if (typeof raw === 'object' && raw !== null && 'enabled' in raw) {
      return (raw as { enabled: unknown }).enabled !== false;
    }
  } catch {
    // missing config means default on
  }
  return true;
}

function saveEnabled(enabled: boolean): void {
  try {
    fs.writeFileSync(configPath(), JSON.stringify({ enabled }), 'utf-8');
  } catch (err) {
    console.error('[Updater] Failed to persist setting:', err);
  }
}

function broadcast(): void {
  try {
    const win = windowGetter();
    if (win && !win.isDestroyed()) {
      win.webContents.send('updater:status', { ...state });
    }
  } catch {
    // ignore broadcast failures
  }
}

function setState(patch: Partial<UpdaterState>): UpdaterState {
  state = { ...state, ...patch };
  broadcast();
  return { ...state };
}

export function getUpdaterState(): UpdaterState {
  return { ...state };
}

export function setUpdaterEnabled(enabled: boolean): UpdaterState {
  saveEnabled(enabled);
  return setState({ enabled });
}

export async function checkForAppUpdates(manual = false): Promise<UpdaterState> {
  if (!app.isPackaged) {
    return setState({ status: 'unavailable', error: 'Updates are only checked in packaged builds' });
  }
  if (!state.enabled && !manual) {
    return { ...state };
  }
  setState({ status: 'checking', error: undefined });
  try {
    await autoUpdater.checkForUpdates();
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('[Updater] Check failed:', message);
    return setState({ status: 'error', error: message });
  }
  return { ...state };
}

export function quitAndInstallUpdate(): void {
  try {
    autoUpdater.quitAndInstall(false, true);
  } catch (err) {
    console.error('[Updater] quitAndInstall failed:', err instanceof Error ? err.message : String(err));
  }
}

export function initAppUpdater(getter: WindowGetter): void {
  windowGetter = getter;
  state = { ...state, enabled: loadEnabled() };

  if (started) return;
  started = true;

  autoUpdater.autoDownload = true;
  autoUpdater.autoInstallOnAppQuit = true;

  autoUpdater.on('checking-for-update', () => {
    setState({ status: 'checking', error: undefined });
  });
  autoUpdater.on('update-available', (info: UpdateInfo) => {
    console.log(`[Updater] Update available: ${info.version}`);
    setState({ status: 'available', version: info.version, lastChecked: Date.now() });
  });
  autoUpdater.on('update-not-available', () => {
    setState({ status: 'up-to-date', lastChecked: Date.now() });
  });
  autoUpdater.on('download-progress', (progress: ProgressInfo) => {
    setState({ status: 'downloading', progress: Math.round(progress.percent || 0) });
  });
  autoUpdater.on('update-downloaded', (info: UpdateInfo) => {
    console.log(`[Updater] Update downloaded: ${info.version}`);
    setState({ status: 'downloaded', version: info.version, progress: 100 });
  });
  autoUpdater.on('error', (err: Error) => {
    console.error('[Updater] Error:', err?.message || String(err));
    // Missing release metadata (dev builds, no publish config) lands here.
    setState({ status: 'error', error: err?.message || 'Update error' });
  });

  // First check shortly after startup, then every 6 hours.
  setTimeout(() => {
    void checkForAppUpdates(false);
  }, 45000);
  setInterval(() => {
    void checkForAppUpdates(false);
  }, 6 * 60 * 60 * 1000);
}
