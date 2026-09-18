"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.securityManager = void 0;
const electron_1 = require("electron");
const path_1 = __importDefault(require("path"));
const fs_1 = __importDefault(require("fs"));
const crypto_1 = __importDefault(require("crypto"));
const keytar_1 = __importDefault(require("keytar"));
const threat_feeds_1 = require("./threat-feeds");
const SERVICE_NAME = 'GeminiBrowser';
const VT_KEY_NAME = 'virustotal-api-key';
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
    constructor() {
        Object.defineProperty(this, "settings", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: {
                safeBrowsingEnabled: true,
                downloadScanningEnabled: true,
                useEnhancedProtection: false,
            }
        });
        Object.defineProperty(this, "configPath", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: void 0
        });
        Object.defineProperty(this, "bypassedUrls", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: new Set()
        });
        Object.defineProperty(this, "scanResults", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: new Map()
        });
        Object.defineProperty(this, "dynamicBlockedDomains", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: new Set()
        });
        Object.defineProperty(this, "blocklistPath", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: void 0
        });
        Object.defineProperty(this, "threatIndex", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: (0, threat_feeds_1.emptyThreatIndex)()
        });
        Object.defineProperty(this, "threatCachePath", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: void 0
        });
        this.configPath = path_1.default.join(electron_1.app.getPath('userData'), 'security-config.json');
        this.blocklistPath = path_1.default.join(electron_1.app.getPath('userData'), 'blocked-domains.json');
        this.threatCachePath = path_1.default.join(electron_1.app.getPath('userData'), 'threat-feeds.json');
        this.loadSettings();
        this.loadCachedBlocklist();
        this.loadThreatCache();
        this.seedUserApiKey();
        this.fetchThreatFeed();
        this.refreshThreatFeeds();
    }
    loadSettings() {
        try {
            if (fs_1.default.existsSync(this.configPath)) {
                const data = JSON.parse(fs_1.default.readFileSync(this.configPath, 'utf8'));
                this.settings = { ...this.settings, ...data };
            }
        }
        catch (err) {
            console.error('Failed to load security settings:', err);
        }
    }
    saveSettings() {
        try {
            fs_1.default.writeFileSync(this.configPath, JSON.stringify(this.settings, null, 2), 'utf8');
        }
        catch (err) {
            console.error('Failed to save security settings:', err);
        }
    }
    // Removed hardcoded API key seeding — users must provide their own via Settings
    async seedUserApiKey() {
        // No-op: API keys should be configured by the user through the Settings UI
    }
    async getApiKey() {
        try {
            return (await keytar_1.default.getPassword(SERVICE_NAME, VT_KEY_NAME)) || '';
        }
        catch {
            return '';
        }
    }
    async setApiKey(key) {
        try {
            if (key) {
                await keytar_1.default.setPassword(SERVICE_NAME, VT_KEY_NAME, key);
            }
            else {
                await keytar_1.default.deletePassword(SERVICE_NAME, VT_KEY_NAME);
            }
        }
        catch (err) {
            console.error('Failed to save VirusTotal API key to keytar:', err);
        }
    }
    getSettings() {
        return { ...this.settings };
    }
    updateSettings(updates) {
        this.settings = { ...this.settings, ...updates };
        this.saveSettings();
    }
    bypassUrl(url) {
        try {
            const parsed = new URL(url);
            this.bypassedUrls.add(parsed.hostname.toLowerCase());
        }
        catch {
            this.bypassedUrls.add(url.toLowerCase());
        }
    }
    isBypassed(url) {
        try {
            const parsed = new URL(url);
            return this.bypassedUrls.has(parsed.hostname.toLowerCase());
        }
        catch {
            return this.bypassedUrls.has(url.toLowerCase());
        }
    }
    loadCachedBlocklist() {
        try {
            if (fs_1.default.existsSync(this.blocklistPath)) {
                const content = fs_1.default.readFileSync(this.blocklistPath, 'utf8').trim();
                if (content) {
                    const list = JSON.parse(content);
                    this.dynamicBlockedDomains = new Set(list);
                }
                else {
                    console.warn('Cached blocklist is empty, deleting it.');
                    try {
                        fs_1.default.unlinkSync(this.blocklistPath);
                    }
                    catch (unlinkErr) {
                        console.error('Failed to delete empty cached blocklist:', unlinkErr);
                    }
                }
            }
        }
        catch (err) {
            console.error('Failed to load cached blocklist, deleting invalid cache file:', err);
            try {
                if (fs_1.default.existsSync(this.blocklistPath)) {
                    fs_1.default.unlinkSync(this.blocklistPath);
                }
            }
            catch (unlinkErr) {
                console.error('Failed to delete invalid cached blocklist:', unlinkErr);
            }
        }
    }
    loadThreatCache() {
        const cached = (0, threat_feeds_1.loadThreatCache)(this.threatCachePath);
        if (cached)
            this.threatIndex = cached;
    }
    /** Background refresh of URLhaus + OpenPhish; never blocks startup. */
    refreshThreatFeeds() {
        void (async () => {
            try {
                const feeds = await (0, threat_feeds_1.fetchThreatFeeds)();
                const ids = Object.keys(feeds);
                if (ids.length === 0)
                    return;
                this.threatIndex = (0, threat_feeds_1.buildThreatIndex)(feeds);
                (0, threat_feeds_1.saveThreatCache)(this.threatCachePath, this.threatIndex);
                console.log(`[ThreatFeeds] Refreshed: ${ids.map(id => `${id} (${feeds[id].urls.length})`).join(', ')}`);
            }
            catch (err) {
                console.log('[ThreatFeeds] Refresh failed, keeping cache:', err instanceof Error ? err.message : String(err));
            }
        })();
    }
    async fetchThreatFeed() {
        try {
            const response = await fetch('https://raw.githubusercontent.com/Spam404/lists/master/main-blacklist.txt');
            if (response.ok) {
                const text = await response.text();
                const lines = text.split('\n');
                const domains = [];
                for (let line of lines) {
                    line = line.trim();
                    if (line && !line.startsWith('#')) {
                        domains.push(line.toLowerCase());
                    }
                }
                if (domains.length > 0) {
                    this.dynamicBlockedDomains = new Set(domains);
                    fs_1.default.writeFileSync(this.blocklistPath, JSON.stringify(domains, null, 2), 'utf8');
                    console.log(`Successfully fetched and cached ${domains.length} dynamic threat domains.`);
                }
            }
        }
        catch (err) {
            console.log('Could not fetch dynamic threat feed (using cached/local lists):', err instanceof Error ? err.message : String(err));
        }
    }
    /**
     * Check if a URL represents a threat.
     */
    async checkUrl(url) {
        if (!this.settings.safeBrowsingEnabled) {
            return { safe: true };
        }
        if (this.isBypassed(url)) {
            return { safe: true };
        }
        let hostname = '';
        try {
            hostname = new URL(url).hostname.toLowerCase();
        }
        catch {
            hostname = url.toLowerCase();
        }
        // Check dynamic blocklist
        if (this.dynamicBlockedDomains.has(hostname) ||
            this.dynamicBlockedDomains.has(hostname.replace(/^www\./, ''))) {
            return { safe: false, reason: 'malware' };
        }
        // Check aggregated threat feeds (URLhaus malware, OpenPhish phishing)
        const feedHit = (0, threat_feeds_1.matchThreatIndex)(url, this.threatIndex);
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
    calculateHash(filePath) {
        return new Promise((resolve, reject) => {
            const hash = crypto_1.default.createHash('sha256');
            const stream = fs_1.default.createReadStream(filePath);
            stream.on('data', data => hash.update(data));
            stream.on('end', () => resolve(hash.digest('hex')));
            stream.on('error', err => reject(err));
        });
    }
    /**
     * Scan a completed download file.
     */
    async scanDownload(downloadId, filePath, filename) {
        if (!this.settings.downloadScanningEnabled) {
            return { status: 'unverified', details: 'Scanning is disabled' };
        }
        const ext = path_1.default.extname(filename).toLowerCase();
        const isDangerousExt = DANGEROUS_EXTENSIONS.includes(ext);
        this.scanResults.set(downloadId, { status: 'scanning' });
        try {
            if (!fs_1.default.existsSync(filePath)) {
                throw new Error('File does not exist');
            }
            // Calculate file hash
            const hash = await this.calculateHash(filePath);
            // Check for EICAR anti-malware test signature (read only first 256 bytes to avoid OOM on large files)
            const EICAR_SIG = 'X5O!P%@AP[4\\PZX54(P^)7CC)7}$EICAR-STANDARD-ANTIVIRUS-TEST-FILE!$H+H*';
            const fd = fs_1.default.openSync(filePath, 'r');
            const buf = Buffer.alloc(256);
            const bytesRead = fs_1.default.readSync(fd, buf, 0, 256, 0);
            fs_1.default.closeSync(fd);
            const head = buf.toString('utf8', 0, bytesRead);
            const isEicar = head.includes(EICAR_SIG);
            if (isEicar ||
                filename.toLowerCase().includes('eicar') ||
                filename.toLowerCase().endsWith('.virus')) {
                const result = {
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
                const result = {
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
                    const result = {
                        status: 'danger',
                        details: `VirusTotal: ${malicious} engine(s) flagged this file as malicious`,
                        maliciousCount: malicious,
                        suspiciousCount: suspicious,
                    };
                    this.scanResults.set(downloadId, result);
                    return result;
                }
                else {
                    const result = {
                        status: 'safe',
                        details: 'VirusTotal scan complete. Clean.',
                    };
                    this.scanResults.set(downloadId, result);
                    return result;
                }
            }
            else if (response.status === 404) {
                // Unknown file to VT (common for custom scripts/unpopular tools)
                const result = {
                    status: isDangerousExt ? 'unverified' : 'safe',
                    details: isDangerousExt
                        ? 'Unknown file hash (not in VirusTotal database)'
                        : 'Unknown safe file format',
                };
                this.scanResults.set(downloadId, result);
                return result;
            }
            else {
                throw new Error(`VirusTotal API returned HTTP ${response.status}`);
            }
        }
        catch (err) {
            console.error('Scan error:', err);
            const result = {
                status: isDangerousExt ? 'unverified' : 'safe',
                details: `Scan failed: ${err instanceof Error ? err.message : String(err)}`,
            };
            this.scanResults.set(downloadId, result);
            return result;
        }
    }
    getScanResult(downloadId) {
        return this.scanResults.get(downloadId);
    }
    initIPC(_mainWindow) {
        electron_1.ipcMain.handle('security:get-settings', async () => {
            return this.getSettings();
        });
        electron_1.ipcMain.handle('security:update-settings', async (_event, updates) => {
            this.updateSettings(updates);
            return this.getSettings();
        });
        electron_1.ipcMain.handle('security:get-api-key', async () => {
            // SECURITY: Never return the raw API key to the renderer.
            // Return a masked version for display purposes only.
            const key = await this.getApiKey();
            if (!key)
                return null;
            return key.slice(0, 4) + '***' + key.slice(-4);
        });
        electron_1.ipcMain.handle('security:set-api-key', async (_event, key) => {
            await this.setApiKey(key);
            return true;
        });
        electron_1.ipcMain.handle('security:bypass-url', async (_event, url) => {
            this.bypassUrl(url);
            return true;
        });
        electron_1.ipcMain.handle('security:scan-file', async (_event, downloadId, filePath, filename) => {
            const result = await this.scanDownload(downloadId, filePath, filename);
            const targetWin = electron_1.BrowserWindow.fromWebContents(_event.sender);
            targetWin?.webContents.send('download:updated', { id: downloadId, scanResult: result });
            return result;
        });
    }
}
exports.securityManager = new SecurityManager();
