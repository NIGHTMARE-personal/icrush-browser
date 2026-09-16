import { ipcMain, webContents } from 'electron';
import { ElectronBlocker, fromElectronDetails } from '@ghostery/adblocker-electron';

export class AdBlockerManager {
  private enabled = true;
  private blockedCounts = new Map<number, number>();
  private blocker: ElectronBlocker | null = null;
  private mainWebContentsId: number | null = null;

  constructor() {
    this.setupIPC();
    this.initializeBlocker();
    // Periodic cleanup of stale webContents entries every 5 minutes
    setInterval(() => this.cleanupStaleEntries(), 5 * 60 * 1000);
  }

  public setMainWebContentsId(id: number): void {
    this.mainWebContentsId = id;
  }

  private cleanupStaleEntries(): void {
    for (const [id] of this.blockedCounts) {
      const wc = webContents.fromId(id);
      if (!wc || wc.isDestroyed()) {
        this.blockedCounts.delete(id);
      }
    }
  }

  private getTotalBlockedCount(): number {
    let total = 0;
    for (const count of this.blockedCounts.values()) {
      total += count;
    }
    return total;
  }

  private sendCountToRenderer(count: number): void {
    if (this.mainWebContentsId) {
      const mainWc = webContents.fromId(this.mainWebContentsId);
      if (mainWc && !mainWc.isDestroyed()) {
        try {
          mainWc.send('adblocker:count-updated', count);
        } catch { /* ignore */ }
      }
    }
  }

  private async initializeBlocker(): Promise<void> {
    try {
      this.blocker = await ElectronBlocker.fromPrebuiltAdsAndTracking(fetch);
      console.log('[AdBlocker] Ghostery Blocker initialized successfully.');
      // Auto-update filter lists every 4 hours
      setInterval(() => this.updateFilterLists(), 4 * 60 * 60 * 1000);
    } catch (err) {
      console.error('[AdBlocker] Failed to initialize Ghostery Blocker:', err);
    }
  }

  private async updateFilterLists(): Promise<void> {
    try {
      const updated = await ElectronBlocker.fromPrebuiltAdsAndTracking(fetch);
      this.blocker = updated;
      console.log('[AdBlocker] Filter lists updated successfully.');
    } catch (err) {
      console.error('[AdBlocker] Failed to update filter lists:', err);
    }
  }

  public isEnabled(): boolean {
    return this.enabled;
  }

  public setEnabled(enabled: boolean): void {
    this.enabled = enabled;
  }

  public getBlockedCount(webContentsId: number): number {
    return this.blockedCounts.get(webContentsId) || 0;
  }

  public resetCount(webContentsId: number): void {
    this.blockedCounts.set(webContentsId, 0);
    this.sendCountToRenderer(0);
  }

  public incrementCount(webContentsId: number): void {
    const current = this.getBlockedCount(webContentsId);
    this.blockedCounts.set(webContentsId, current + 1);
    this.sendCountToRenderer(this.getTotalBlockedCount());
  }

  public shouldBlock(details: Electron.OnBeforeRequestListenerDetails): boolean {
    if (!this.enabled || !this.blocker) return false;

    try {
      const request = fromElectronDetails(details);
      const matchResult = this.blocker.match(request);
      if (matchResult && matchResult.match) {
        if (details.webContentsId) {
          this.incrementCount(details.webContentsId);
        }
        return true;
      }
    } catch (e) {
      // Fallback
    }

    return false;
  }

  public getCosmeticCSS(): string {
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

  public async injectCosmeticFilters(webview: Electron.WebviewTag): Promise<void> {
    if (!this.enabled) return;
    try {
      const css = this.getCosmeticCSS();
      await webview.insertCSS(css + ' { display: none !important; visibility: hidden !important; height: 0 !important; min-height: 0 !important; }');
    } catch { /* ignore */ }
  }

  private setupIPC(): void {
    ipcMain.handle('adblocker:toggle', (_event, enabled: boolean) => {
      this.setEnabled(enabled);
      return this.enabled;
    });

    ipcMain.handle('adblocker:is-enabled', () => {
      return this.isEnabled();
    });

    ipcMain.handle('adblocker:get-blocked-count', () => {
      return this.getTotalBlockedCount();
    });

    ipcMain.handle('adblocker:reset-count', event => {
      this.resetCount(event.sender.id);
      return 0;
    });
  }
}

export const adBlockerManager = new AdBlockerManager();
