import { app, ipcMain, BrowserWindow } from 'electron';
import path from 'path';
import fs from 'fs';
import crypto from 'crypto';
import keytar from 'keytar';
import {
  buildThreatIndex,
  emptyThreatIndex,
  fetchThreatFeeds,
  loadThreatCache,
  matchThreatIndex,
  saveThreatCache,
} from './threat-feeds';
import type { ThreatFeedIndex } from './threat-feeds';

const SERVICE_NAME = 'GeminiBrowser';
const VT_KEY_NAME = 'virustotal-api-key';

export interface SecuritySettings {
  safeBrowsingEnabled: boolean;
  downloadScanningEnabled: boolean;
  useEnhancedProtection: boolean; // Enables remote API URL checking if wanted
}

export interface ScanResult {
  status: 'safe' | 'danger' | 'unverified' | 'scanning';
  details?: string;
  maliciousCount?: number;
  suspiciousCount?: number;
}

// Local mock list of blocked regex patterns for testing Safe Browsing
const BLOCKED_DOMAINS = [
  /unsafe-phishing-test\.com/i,
  /malware-test-site\.org/i,
  /dangerous-downloads\.net/i,
  /phishing-simulation-gemini\.com/i,
];

// Dangerous file extensions that require warnings/verification
const DANGEROUS_EXTENSIONS = [
  '.exe',
  '.msi',
  '.bat',
  '.cmd',
  '.sh',
  '.scr',
  '.vbs',
  '',
  '.vbe',
  '.jse',
  '.wsf',
  '.wsh',
  '.ps1',
  '.app',
  '.dmg',
  '.pkg',
  '.jar',
];

class SecurityManager {
  private settings: SecuritySettings = {
    safeBrowsingEnabled: true,
    downloadScanningEnabled: true,
    useEnhancedProtection: false,
  };
  private configPath: string;
  private bypassedUrls: Set<string> = new Set();
  private scanResults: Map<string, ScanResult> = new Map();
  private dynamicBlockedDomains: Set<string> = new Set();
  private blocklistPath: string;
  private threatIndex: ThreatFeedIndex = emptyThreatIndex();
  private threatCachePath: string;

  constructor() {
    this.configPath = path.join(app.getPath('userData'), 'security-config.json');
    this.blocklistPath = path.join(app.getPath('userData'), 'blocked-domains.json');
    this.threatCachePath = path.join(app.getPath('userData'), 'threat-feeds.json');
    this.loadSettings();
    this.loadCachedBlocklist();
    this.loadThreatCache();
    this.seedUserApiKey();
    this.fetchThreatFeed();
    this.refreshThreatFeeds();
  }

  private loadSettings() {
    try {
      if (fs.existsSync(this.configPath)) {
        const data = JSON.parse(fs.readFileSync(this.configPath, 'utf8'));
        this.settings = { ...this.settings, ...data };
      }
    } catch (err) {
      console.error('Failed to load security settings:', err);
    }
  }

  private saveSettings() {
    try {
      fs.writeFileSync(this.configPath, JSON.stringify(this.settings, null, 2), 'utf8');
    } catch (err) {
      console.error('Failed to save security settings:', err);
    }
  }

  // Removed hardcoded API key seeding — users must provide their own via Settings
  private async seedUserApiKey() {
    // No-op: API keys should be configured by the user through the Settings UI
  }

  public async getApiKey(): Promise<string> {
    try {
      return (await keytar.getPassword(SERVICE_NAME, VT_KEY_NAME)) || '';
    } catch {
      return '';
    }
  }

  public async setApiKey(key: string): Promise<void> {
    try {
      if (key) {
        await keytar.setPassword(SERVICE_NAME, VT_KEY_NAME, key);
      } else {
        await keytar.deletePassword(SERVICE_NAME, VT_KEY_NAME);
      }
    } catch (err) {
      console.error('Failed to save VirusTotal API key to keytar:', err);
    }
  }

  public getSettings(): SecuritySettings {
    return { ...this.settings };
  }

  public updateSettings(updates: Partial<SecuritySettings>) {
    this.settings = { ...this.settings, ...updates };
    this.saveSettings();
  }

  public bypassUrl(url: string) {
    try {
      const parsed = new URL(url);
      this.bypassedUrls.add(parsed.hostname.toLowerCase());
    } catch {
      this.bypassedUrls.add(url.toLowerCase());
    }
  }

  public isBypassed(url: string): boolean {
    try {
      const parsed = new URL(url);
      return this.bypassedUrls.has(parsed.hostname.toLowerCase());
    } catch {
      return this.bypassedUrls.has(url.toLowerCase());
    }
  }

  private loadCachedBlocklist() {
    try {
      if (fs.existsSync(this.blocklistPath)) {
        const content = fs.readFileSync(this.blocklistPath, 'utf8').trim();
        if (content) {
          const list = JSON.parse(content);
          this.dynamicBlockedDomains = new Set(list);
        } else {
          console.warn('Cached blocklist is empty, deleting it.');
          try {
            fs.unlinkSync(this.blocklistPath);
          } catch (unlinkErr) {
            console.error('Failed to delete empty cached blocklist:', unlinkErr);
          }
        }
      }
    } catch (err) {
      console.error('Failed to load cached blocklist, deleting invalid cache file:', err);
      try {
        if (fs.existsSync(this.blocklistPath)) {
          fs.unlinkSync(this.blocklistPath);
        }
      } catch (unlinkErr) {
        console.error('Failed to delete invalid cached blocklist:', unlinkErr);
      }
    }
  }

  private loadThreatCache(): void {
    const cached = loadThreatCache(this.threatCachePath);
    if (cached) this.threatIndex = cached;
  }

  /** Background refresh of URLhaus + OpenPhish; never blocks startup. */
  private refreshThreatFeeds(): void {
    void (async () => {
      try {
        const feeds = await fetchThreatFeeds();
        const ids = Object.keys(feeds);
        if (ids.length === 0) return;
        this.threatIndex = buildThreatIndex(feeds);
        saveThreatCache(this.threatCachePath, this.threatIndex);
        console.log(
          `[ThreatFeeds] Refreshed: ${ids.map(id => `${id} (${feeds[id].urls.length})`).join(', ')}`
        );
      } catch (err) {
        console.log(
          '[ThreatFeeds] Refresh failed, keeping cache:',
          err instanceof Error ? err.message : String(err)
        );
      }
    })();
  }

  private async fetchThreatFeed() {
    try {
      const response = await fetch(
        'https://raw.githubusercontent.com/Spam404/lists/master/main-blacklist.txt'
      );
      if (response.ok) {
        const text = await response.text();
        const lines = text.split('\n');
        const domains: string[] = [];
        for (let line of lines) {
          line = line.trim();
          if (line && !line.startsWith('#')) {
            domains.push(line.toLowerCase());
          }
        }
        if (domains.length > 0) {
          this.dynamicBlockedDomains = new Set(domains);
          fs.writeFileSync(this.blocklistPath, JSON.stringify(domains, null, 2), 'utf8');
          console.log(`Successfully fetched and cached ${domains.length} dynamic threat domains.`);
        }
      }
    } catch (err) {
      console.log(
        'Could not fetch dynamic threat feed (using cached/local lists):',
        err instanceof Error ? err.message : String(err)
      );
    }
  }

  /**
   * Check if a URL represents a threat.
   */
  public async checkUrl(url: string): Promise<{ safe: boolean; reason?: 'phishing' | 'malware' }> {
    if (!this.settings.safeBrowsingEnabled) {
      return { safe: true };
    }

    if (this.isBypassed(url)) {
      return { safe: true };
    }

    let hostname = '';
    try {
      hostname = new URL(url).hostname.toLowerCase();
    } catch {
      hostname = url.toLowerCase();
    }

    // Check dynamic blocklist
    if (
      this.dynamicBlockedDomains.has(hostname) ||
      this.dynamicBlockedDomains.has(hostname.replace(/^www\./, ''))
    ) {
      return { safe: false, reason: 'malware' };
    }

    // Check aggregated threat feeds (URLhaus malware, OpenPhish phishing)
    const feedHit = matchThreatIndex(url, this.threatIndex);
    if (feedHit.matched) {
      return { safe: false, reason: feedHit.reason ?? 'malware' };
    }

    // 1. Check local blocklist patterns (immediate match)
    for (const pattern of BLOCKED_DOMAINS) {
      if (pattern.test(url)) {
        return { safe: false, reason: 'phishing' };
      }
    }

    // 2. Optional: Enhanced Protection API lookup (simulated threat for demonstration)
    if (this.settings.useEnhancedProtection) {
      if (url.includes('enhanced-threat-simulation')) {
        return { safe: false, reason: 'malware' };
      }
    }

    return { safe: true };
  }

  /**
   * Computes the SHA-256 hash of a file.
   */
  private calculateHash(filePath: string): Promise<string> {
    return new Promise((resolve, reject) => {
      const hash = crypto.createHash('sha256');
      const stream = fs.createReadStream(filePath);

      stream.on('data', data => hash.update(data));
      stream.on('end', () => resolve(hash.digest('hex')));
      stream.on('error', err => reject(err));
    });
  }

  /**
   * Scan a completed download file.
   */
  public async scanDownload(
    downloadId: string,
    filePath: string,
    filename: string
  ): Promise<ScanResult> {
    if (!this.settings.downloadScanningEnabled) {
      return { status: 'unverified', details: 'Scanning is disabled' };
    }

    const ext = path.extname(filename).toLowerCase();
    const isDangerousExt = DANGEROUS_EXTENSIONS.includes(ext);

    this.scanResults.set(downloadId, { status: 'scanning' });

    try {
      if (!fs.existsSync(filePath)) {
        throw new Error('File does not exist');
      }

      // Calculate file hash
      const hash = await this.calculateHash(filePath);

      // Check for EICAR anti-malware test signature (read only first 256 bytes to avoid OOM on large files)
      const EICAR_SIG = 'X5O!P%@AP[4\\PZX54(P^)7CC)7}$EICAR-STANDARD-ANTIVIRUS-TEST-FILE!$H+H*';
      const fd = fs.openSync(filePath, 'r');
      const buf = Buffer.alloc(256);
      const bytesRead = fs.readSync(fd, buf, 0, 256, 0);
      fs.closeSync(fd);
      const head = buf.toString('utf8', 0, bytesRead);
      const isEicar = head.includes(EICAR_SIG);

      if (
        isEicar ||
        filename.toLowerCase().includes('eicar') ||
        filename.toLowerCase().endsWith('.virus')
      ) {
        const result: ScanResult = {
          status: 'danger',
          details: 'Simulated EICAR threat detected',
          maliciousCount: 1,
        };
        this.scanResults.set(downloadId, result);
        return result;
      }

      // Check VirusTotal API
      const apiKey = await this.getApiKey();
      if (!apiKey) {
        // No key, fallback to extension warning or unverified
        const result: ScanResult = {
          status: isDangerousExt ? 'unverified' : 'safe',
          details: isDangerousExt ? 'Unverified file format' : 'Scanned locally',
        };
        this.scanResults.set(downloadId, result);
        return result;
      }

      // Real VirusTotal request
      console.log(`Scanning file hash ${hash} via VirusTotal API...`);
      const response = await fetch(`https://www.virustotal.com/api/v3/files/${hash}`, {
        method: 'GET',
        headers: { 'x-apikey': apiKey },
      });

      if (response.status === 200) {
        const data = await response.json();
        const stats = data?.data?.attributes?.last_analysis_stats;
        const malicious = stats?.malicious || 0;
        const suspicious = stats?.suspicious || 0;

        if (malicious + suspicious > 0) {
          const result: ScanResult = {
            status: 'danger',
            details: `VirusTotal: ${malicious} engine(s) flagged this file as malicious`,
            maliciousCount: malicious,
            suspiciousCount: suspicious,
          };
          this.scanResults.set(downloadId, result);
          return result;
        } else {
          const result: ScanResult = {
            status: 'safe',
            details: 'VirusTotal scan complete. Clean.',
          };
          this.scanResults.set(downloadId, result);
          return result;
        }
      } else if (response.status === 404) {
        // Unknown file to VT (common for custom scripts/unpopular tools)
        const result: ScanResult = {
          status: isDangerousExt ? 'unverified' : 'safe',
          details: isDangerousExt
            ? 'Unknown file hash (not in VirusTotal database)'
            : 'Unknown safe file format',
        };
        this.scanResults.set(downloadId, result);
        return result;
      } else {
        throw new Error(`VirusTotal API returned HTTP ${response.status}`);
      }
    } catch (err) {
      console.error('Scan error:', err);
      const result: ScanResult = {
        status: isDangerousExt ? 'unverified' : 'safe',
        details: `Scan failed: ${err instanceof Error ? err.message : String(err)}`,
      };
      this.scanResults.set(downloadId, result);
      return result;
    }
  }

  public getScanResult(downloadId: string): ScanResult | undefined {
    return this.scanResults.get(downloadId);
  }

  public initIPC(_mainWindow: BrowserWindow) {
    ipcMain.handle('security:get-settings', async () => {
      return this.getSettings();
    });

    ipcMain.handle(
      'security:update-settings',
      async (_event, updates: Partial<SecuritySettings>) => {
        this.updateSettings(updates);
        return this.getSettings();
      }
    );

    ipcMain.handle('security:get-api-key', async () => {
      // SECURITY: Never return the raw API key to the renderer.
      // Return a masked version for display purposes only.
      const key = await this.getApiKey();
      if (!key) return null;
      return key.slice(0, 4) + '***' + key.slice(-4);
    });

    ipcMain.handle('security:set-api-key', async (_event, key: string) => {
      await this.setApiKey(key);
      return true;
    });

    ipcMain.handle('security:bypass-url', async (_event, url: string) => {
      this.bypassUrl(url);
      return true;
    });

    ipcMain.handle(
      'security:scan-file',
      async (_event, downloadId: string, filePath: string, filename: string) => {
        const result = await this.scanDownload(downloadId, filePath, filename);
        const targetWin = BrowserWindow.fromWebContents(_event.sender);
        targetWin?.webContents.send('download:updated', { id: downloadId, scanResult: result });
        return result;
      }
    );
  }
}

export const securityManager = new SecurityManager();
