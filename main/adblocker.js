"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.adBlockerManager = exports.AdBlockerManager = void 0;
const electron_1 = require("electron");
const adblocker_electron_1 = require("@ghostery/adblocker-electron");
class AdBlockerManager {
    constructor() {
        Object.defineProperty(this, "enabled", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: true
        });
        Object.defineProperty(this, "blockedCounts", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: new Map()
        });
        Object.defineProperty(this, "blocker", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: null
        });
        Object.defineProperty(this, "mainWebContentsId", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: null
        });
        this.setupIPC();
        this.initializeBlocker();
        // Periodic cleanup of stale webContents entries every 5 minutes
        setInterval(() => this.cleanupStaleEntries(), 5 * 60 * 1000);
    }
    setMainWebContentsId(id) {
        this.mainWebContentsId = id;
    }
    cleanupStaleEntries() {
        for (const [id] of this.blockedCounts) {
            const wc = electron_1.webContents.fromId(id);
            if (!wc || wc.isDestroyed()) {
                this.blockedCounts.delete(id);
            }
        }
    }
    getTotalBlockedCount() {
        let total = 0;
        for (const count of this.blockedCounts.values()) {
            total += count;
        }
        return total;
    }
    sendCountToRenderer(count) {
        if (this.mainWebContentsId) {
            const mainWc = electron_1.webContents.fromId(this.mainWebContentsId);
            if (mainWc && !mainWc.isDestroyed()) {
                try {
                    mainWc.send('adblocker:count-updated', count);
                }
                catch { /* ignore */ }
            }
        }
    }
    async initializeBlocker() {
        try {
            this.blocker = await adblocker_electron_1.ElectronBlocker.fromPrebuiltAdsAndTracking(fetch);
            console.log('[AdBlocker] Ghostery Blocker initialized successfully.');
            // Auto-update filter lists every 4 hours
            setInterval(() => this.updateFilterLists(), 4 * 60 * 60 * 1000);
        }
        catch (err) {
            console.error('[AdBlocker] Failed to initialize Ghostery Blocker:', err);
        }
    }
    async updateFilterLists() {
        try {
            const updated = await adblocker_electron_1.ElectronBlocker.fromPrebuiltAdsAndTracking(fetch);
            this.blocker = updated;
            console.log('[AdBlocker] Filter lists updated successfully.');
        }
        catch (err) {
            console.error('[AdBlocker] Failed to update filter lists:', err);
        }
    }
    isEnabled() {
        return this.enabled;
    }
    setEnabled(enabled) {
        this.enabled = enabled;
    }
    getBlockedCount(webContentsId) {
        return this.blockedCounts.get(webContentsId) || 0;
    }
    resetCount(webContentsId) {
        this.blockedCounts.set(webContentsId, 0);
        this.sendCountToRenderer(0);
    }
    incrementCount(webContentsId) {
        const current = this.getBlockedCount(webContentsId);
        this.blockedCounts.set(webContentsId, current + 1);
        this.sendCountToRenderer(this.getTotalBlockedCount());
    }
    shouldBlock(details) {
        if (!this.enabled || !this.blocker)
            return false;
        try {
            const request = (0, adblocker_electron_1.fromElectronDetails)(details);
            const matchResult = this.blocker.match(request);
            if (matchResult && matchResult.match) {
                if (details.webContentsId) {
                    this.incrementCount(details.webContentsId);
                }
                return true;
            }
        }
        catch (e) {
            // Fallback
        }
        return false;
    }
    getCosmeticCSS() {
        return [
            '[id*="ad-"], [class*="ad-"], [id*="ads-"], [class*="ads-"]',
            '[id*="advert"], [class*="advert"], [id*="promo"], [class*="promo"]',
            '[id*="sponsor"], [class*="sponsor"], [id*="banner"], [class*="banner"]',
            '[id*="google_ad"], [class*="google_ad"], [id*="googletag"], [class*="googletag"]',
            '[id*="taboola"], [class*="taboola"], [id*="outbrain"], [class*="outbrain"]',
            '[id*="criteo"], [class*="criteo"], [id*="amazon-ad"], [class*="amazon-ad"]',
            'ins.adsbygoogle, .adsbygoogle, [id*="pubexchange"], [class*="pubexchange"]',
            '[data-ad], [data-ad-slot], [data-ad-unit], [data-ad-unit-id]',
            '[id*="super-ad"], [class*="super-ad"], [id*="sticky-ad"], [class*="sticky-ad"]',
            '[id*="footer-ad"], [class*="footer-ad"], [id*="sidebar-ad"], [class*="sidebar-ad"]',
            '[id*="popup-ad"], [class*="popup-ad"], [id*="overlay-ad"], [class*="overlay-ad"]',
            '[id*="video-ad"], [class*="video-ad"], [id*="native-ad"], [class*="native-ad"]',
            '.ad-container, .ad-wrapper, .ad-slot, .ad-unit, .ad-block',
            '.ads-container, .ads-wrapper, .ads-slot, .ads-unit',
            '.advertisement, .advertising, .sponsored-content',
            '[aria-label="advertisement"], [aria-label="ad"]',
        ].join(', ');
    }
    async injectCosmeticFilters(webview) {
        if (!this.enabled)
            return;
        try {
            const css = this.getCosmeticCSS();
            await webview.insertCSS(css + ' { display: none !important; visibility: hidden !important; height: 0 !important; min-height: 0 !important; }');
        }
        catch { /* ignore */ }
    }
    setupIPC() {
        electron_1.ipcMain.handle('adblocker:toggle', (_event, enabled) => {
            this.setEnabled(enabled);
            return this.enabled;
        });
        electron_1.ipcMain.handle('adblocker:is-enabled', () => {
            return this.isEnabled();
        });
        electron_1.ipcMain.handle('adblocker:get-blocked-count', () => {
            return this.getTotalBlockedCount();
        });
        electron_1.ipcMain.handle('adblocker:reset-count', event => {
            this.resetCount(event.sender.id);
            return 0;
        });
    }
}
exports.AdBlockerManager = AdBlockerManager;
exports.adBlockerManager = new AdBlockerManager();
