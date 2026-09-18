"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.getUpdaterState = getUpdaterState;
exports.setUpdaterEnabled = setUpdaterEnabled;
exports.checkForAppUpdates = checkForAppUpdates;
exports.quitAndInstallUpdate = quitAndInstallUpdate;
exports.initAppUpdater = initAppUpdater;
/**
 * Application auto-updater (main process).
 *
 * Wraps electron-updater with a persisted on/off setting, startup + interval
 * checks, and status broadcasts to the renderer. Degrades gracefully when
 * running unpackaged (dev) or without release metadata: status becomes
 * 'unavailable' instead of throwing.
 */
const electron_1 = require("electron");
const fs_1 = __importDefault(require("fs"));
const path_1 = __importDefault(require("path"));
const electron_updater_1 = require("electron-updater");
let windowGetter = () => null;
let started = false;
let state = {
    status: 'idle',
    enabled: true,
    appVersion: electron_1.app.getVersion(),
};
function configPath() {
    return path_1.default.join(electron_1.app.getPath('userData'), 'updater-config.json');
}
function loadEnabled() {
    try {
        const raw = JSON.parse(fs_1.default.readFileSync(configPath(), 'utf-8'));
        if (typeof raw === 'object' && raw !== null && 'enabled' in raw) {
            return raw.enabled !== false;
        }
    }
    catch {
        // missing config means default on
    }
    return true;
}
function saveEnabled(enabled) {
    try {
        fs_1.default.writeFileSync(configPath(), JSON.stringify({ enabled }), 'utf-8');
    }
    catch (err) {
        console.error('[Updater] Failed to persist setting:', err);
    }
}
function broadcast() {
    try {
        const win = windowGetter();
        if (win && !win.isDestroyed()) {
            win.webContents.send('updater:status', { ...state });
        }
    }
    catch {
        // ignore broadcast failures
    }
}
function setState(patch) {
    state = { ...state, ...patch };
    broadcast();
    return { ...state };
}
function getUpdaterState() {
    return { ...state };
}
function setUpdaterEnabled(enabled) {
    saveEnabled(enabled);
    return setState({ enabled });
}
async function checkForAppUpdates(manual = false) {
    if (!electron_1.app.isPackaged) {
        return setState({ status: 'unavailable', error: 'Updates are only checked in packaged builds' });
    }
    if (!state.enabled && !manual) {
        return { ...state };
    }
    setState({ status: 'checking', error: undefined });
    try {
        await electron_updater_1.autoUpdater.checkForUpdates();
    }
    catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        console.error('[Updater] Check failed:', message);
        return setState({ status: 'error', error: message });
    }
    return { ...state };
}
function quitAndInstallUpdate() {
    try {
        electron_updater_1.autoUpdater.quitAndInstall(false, true);
    }
    catch (err) {
        console.error('[Updater] quitAndInstall failed:', err instanceof Error ? err.message : String(err));
    }
}
function initAppUpdater(getter) {
    windowGetter = getter;
    state = { ...state, enabled: loadEnabled() };
    if (started)
        return;
    started = true;
    electron_updater_1.autoUpdater.autoDownload = true;
    electron_updater_1.autoUpdater.autoInstallOnAppQuit = true;
    electron_updater_1.autoUpdater.on('checking-for-update', () => {
        setState({ status: 'checking', error: undefined });
    });
    electron_updater_1.autoUpdater.on('update-available', (info) => {
        console.log(`[Updater] Update available: ${info.version}`);
        setState({ status: 'available', version: info.version, lastChecked: Date.now() });
    });
    electron_updater_1.autoUpdater.on('update-not-available', () => {
        setState({ status: 'up-to-date', lastChecked: Date.now() });
    });
    electron_updater_1.autoUpdater.on('download-progress', (progress) => {
        setState({ status: 'downloading', progress: Math.round(progress.percent || 0) });
    });
    electron_updater_1.autoUpdater.on('update-downloaded', (info) => {
        console.log(`[Updater] Update downloaded: ${info.version}`);
        setState({ status: 'downloaded', version: info.version, progress: 100 });
    });
    electron_updater_1.autoUpdater.on('error', (err) => {
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
