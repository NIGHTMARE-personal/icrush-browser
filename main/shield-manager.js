"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.shieldManager = exports.ShieldManager = exports.DEFAULT_SITE_SHIELDS = void 0;
const electron_1 = require("electron");
const path_1 = __importDefault(require("path"));
const fs_1 = __importDefault(require("fs"));
const adblocker_1 = require("./adblocker");
exports.DEFAULT_SITE_SHIELDS = {
    shieldsUp: true,
    blockTrackers: 'standard',
    upgradeHttps: true,
    blockScripts: false,
    allowFirstPartyScripts: false, // When blockScripts is enabled, block all scripts by default unless 1st-party is opted in
    blockedScripts: [],
    allowedScripts: [],
    blockedDomains: [],
    allowedDomains: [],
    blockFingerprinting: true,
    fingerprintingProtections: {
        canvas: true,
        audio: true,
        webgl: true,
        hardwareConcurrency: true,
        deviceMemory: true,
        webrtc: true,
        font: true,
    },
    blockCookies: 'third-party',
    forgetMe: false,
};
// Known tracker and ad domains for real-time script classification
const TRACKER_DOMAINS = [
    // Google
    'google-analytics.com',
    'googletagmanager.com',
    'doubleclick.net',
    'googleadservices.com',
    'googlesyndication.com',
    'googleadservices.com',
    'googletagservices.com',
    'googlesyndication.com',
    'google.com/pagead',
    'adservice.google.com',
    'pagead2.googlesyndication.com',
    // Facebook / Meta
    'facebook.net',
    'connect.facebook.net',
    'facebook.com/tr',
    'pixel.facebook.com',
    // Twitter / X
    'analytics.twitter.com',
    'ads-twitter.com',
    'static.ads-twitter.com',
    // Microsoft / LinkedIn
    'snap.licdn.com',
    'px.ads.linkedin.com',
    'bing.com/bat.js',
    'clarity.ms',
    'msecnd.net',
    // TikTok
    'tiktok.com/analytics',
    'analytics.tiktok.com',
    'mon.tiktokv.com',
    // Programmatic Ads
    'criteo.com',
    'criteo.net',
    'criteo.com/vj3ctag.js',
    'taboola.com',
    'outbrain.com',
    'amazon-adsystem.com',
    'media.net',
    'yieldmo.com',
    'sharethrough.com',
    'spotxchange.com',
    'spotx.tv',
    // Ad Networks
    'rubiconproject.com',
    'pubmatic.com',
    'openx.net',
    'casalemedia.com',
    'adnxs.com',
    'appnexus.com',
    'adsrvr.org',
    'moatads.com',
    'adroll.com',
    'quantserve.com',
    'scorecardresearch.com',
    'demdex.net',
    'everesttech.net',
    'adskeeper.com',
    'adform.net',
    'adform.com',
    'bidswitch.net',
    'bidswitch.com',
    'turn.com',
    'mathtag.com',
    'serving-sys.com',
    'advertising.com',
    'doubleverify.com',
    'verified-data.net',
    'integral-ad-science.com',
    'adsafeprotected.com',
    // Analytics & Tracking
    'hotjar.com',
    'mixpanel.com',
    'segment.io',
    'segment.com',
    'amplitude.com',
    'fullstory.com',
    'mouseflow.com',
    'crazyegg.com',
    'optimizely.com',
    'heap.io',
    'mouseflow.com',
    'luckyorange.com',
    'smartlook.com',
    'contentsquare.com',
    'etracker.com',
    'webtrekk.net',
    'matomo.org',
    'piwik.pro',
    // Session Recording
    'logrocket.com',
    'hotjar.com',
    'usabilla.com',
    'qualaroo.com',
    'abtasty.com',
    'vwo.com',
    'optimizely.com',
    // Fingerprinting
    'fingerprintjs.com',
    'fpjs.io',
    'ipc.js',
    'canvas.fingerprinting',
    // Cryptomining
    'coinhive.com',
    'coin-hive.com',
    'cryptaloot.pro',
    'jsecoin.com',
    // Chinese Trackers
    'bdstatic.com',
    'baidu.com/hm.js',
    'cnzz.com',
    '51.la',
    'tongji.baidu.com',
    'hm.baidu.com',
    // Russian Trackers
    'yandex.ru',
    'mc.yandex.ru',
    'metrika.yandex.ru',
    'mail.ru/top',
    'top.mail.ru',
    // Other
    'statcounter.com',
    'newrelic.com',
    'nr-data.net',
    'sentry.io',
    'bugsnag.com',
    'branch.io',
    'adjust.com',
    'appsflyer.com',
    'kochava.com',
    'singular.net',
    'installs.com',
    'hasoffers.com',
    'impact.com',
    'partnerstack.com',
];
// Known CDN & library hosts
const CDN_DOMAINS = [
    'cdnjs.cloudflare.com',
    'cdn.jsdelivr.net',
    'unpkg.com',
    'ajax.googleapis.com',
    'fonts.googleapis.com',
    'code.jquery.com',
    'cdn.bootcdn.net',
    'cdn.staticfile.org',
    'stackpath.bootstrapcdn.com',
    'maxcdn.bootstrapcdn.com',
    'fastly.net',
    'cdn.jsdelivr.com',
    'esm.sh',
    'cdn.skypack.dev',
];
class ShieldManager {
    constructor() {
        Object.defineProperty(this, "configPath", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: void 0
        });
        Object.defineProperty(this, "siteShieldsMap", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: new Map()
        });
        Object.defineProperty(this, "detectedScriptsMap", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: new Map()
        }); // domain -> url -> script
        Object.defineProperty(this, "statsMap", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: new Map()
        }); // domain -> stats
        Object.defineProperty(this, "tabToDomainMap", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: new Map()
        }); // webContentsId -> domain
        Object.defineProperty(this, "mainWebContentsId", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: null
        });
        this.configPath = path_1.default.join(electron_1.app.getPath('userData'), 'site-shields.json');
        this.loadSettings();
        this.setupIPC();
    }
    setMainWebContentsId(id) {
        this.mainWebContentsId = id;
    }
    loadSettings() {
        try {
            if (fs_1.default.existsSync(this.configPath)) {
                const raw = fs_1.default.readFileSync(this.configPath, 'utf8');
                const data = JSON.parse(raw);
                for (const [domain, config] of Object.entries(data)) {
                    this.siteShieldsMap.set(domain, { ...exports.DEFAULT_SITE_SHIELDS, ...config });
                }
            }
        }
        catch (err) {
            console.error('[ShieldManager] Failed to load site shields:', err);
        }
    }
    saveSettings() {
        try {
            const obj = {};
            for (const [domain, config] of this.siteShieldsMap.entries()) {
                obj[domain] = config;
            }
            fs_1.default.writeFileSync(this.configPath, JSON.stringify(obj, null, 2), 'utf8');
        }
        catch (err) {
            console.error('[ShieldManager] Failed to save site shields:', err);
        }
    }
    getSiteShields(domain) {
        if (!domain || domain === 'about:blank' || domain === 'unknown-site') {
            return { ...exports.DEFAULT_SITE_SHIELDS };
        }
        const normalized = domain.toLowerCase().replace(/^www\./, '');
        return this.siteShieldsMap.get(normalized) || { ...exports.DEFAULT_SITE_SHIELDS };
    }
    updateSiteShields(domain, updates) {
        if (!domain || domain === 'about:blank' || domain === 'unknown-site') {
            return { ...exports.DEFAULT_SITE_SHIELDS };
        }
        const normalized = domain.toLowerCase().replace(/^www\./, '');
        const current = this.getSiteShields(normalized);
        const updated = {
            ...current,
            ...updates,
            fingerprintingProtections: {
                ...current.fingerprintingProtections,
                ...(updates.fingerprintingProtections || {}),
            },
        };
        this.siteShieldsMap.set(normalized, updated);
        this.saveSettings();
        this.notifyRenderer(normalized);
        return updated;
    }
    getStats(domain) {
        const normalized = domain.toLowerCase().replace(/^www\./, '');
        return this.statsMap.get(normalized) || {
            trackersBlocked: 0,
            scriptsBlocked: 0,
            httpsUpgrades: 0,
            fingerprintsFoiled: 0,
        };
    }
    incrementStat(domain, statKey, amount = 1) {
        const normalized = domain.toLowerCase().replace(/^www\./, '');
        const stats = this.getStats(normalized);
        stats[statKey] = (stats[statKey] || 0) + amount;
        this.statsMap.set(normalized, stats);
        this.notifyRenderer(normalized);
    }
    resetTab(webContentsId, domain) {
        const normalized = domain.toLowerCase().replace(/^www\./, '');
        this.tabToDomainMap.set(webContentsId, normalized);
        if (!this.detectedScriptsMap.has(normalized)) {
            this.detectedScriptsMap.set(normalized, new Map());
        }
    }
    getDomainForTab(webContentsId) {
        return this.tabToDomainMap.get(webContentsId) || '';
    }
    classifyScript(scriptUrl, rootDomain) {
        try {
            const scriptHost = new URL(scriptUrl).hostname.toLowerCase().replace(/^www\./, '');
            const cleanRoot = rootDomain.toLowerCase().replace(/^www\./, '');
            if (scriptHost === cleanRoot || scriptHost.endsWith('.' + cleanRoot)) {
                return 'first-party';
            }
            for (const tracker of TRACKER_DOMAINS) {
                if (scriptHost === tracker || scriptHost.endsWith('.' + tracker) || scriptUrl.includes(tracker)) {
                    return 'tracker';
                }
            }
            for (const cdn of CDN_DOMAINS) {
                if (scriptHost === cdn || scriptHost.endsWith('.' + cdn)) {
                    return 'cdn';
                }
            }
            return 'third-party';
        }
        catch {
            return 'third-party';
        }
    }
    recordDetectedScript(rootDomain, scriptUrl, blocked) {
        const normalizedRoot = rootDomain.toLowerCase().replace(/^www\./, '');
        if (!this.detectedScriptsMap.has(normalizedRoot)) {
            this.detectedScriptsMap.set(normalizedRoot, new Map());
        }
        let scriptHost = '';
        let origin = '';
        try {
            const parsed = new URL(scriptUrl);
            scriptHost = parsed.hostname;
            origin = parsed.origin;
        }
        catch {
            scriptHost = normalizedRoot;
            origin = normalizedRoot;
        }
        const category = this.classifyScript(scriptUrl, normalizedRoot);
        const entry = {
            url: scriptUrl,
            domain: scriptHost,
            origin: origin,
            category: category,
            status: blocked ? 'blocked' : 'allowed',
            timestamp: Date.now(),
        };
        this.detectedScriptsMap.get(normalizedRoot).set(scriptUrl, entry);
        this.notifyRenderer(normalizedRoot);
        return entry;
    }
    getDetectedScripts(domain) {
        const normalized = domain.toLowerCase().replace(/^www\./, '');
        const map = this.detectedScriptsMap.get(normalized);
        if (!map)
            return [];
        return Array.from(map.values()).sort((a, b) => b.timestamp - a.timestamp);
    }
    updateScriptRule(domain, scriptUrl, action) {
        const shields = this.getSiteShields(domain);
        const blocked = new Set(shields.blockedScripts || []);
        const allowed = new Set(shields.allowedScripts || []);
        if (action === 'block') {
            blocked.add(scriptUrl);
            allowed.delete(scriptUrl);
        }
        else if (action === 'allow') {
            allowed.add(scriptUrl);
            blocked.delete(scriptUrl);
        }
        else {
            blocked.delete(scriptUrl);
            allowed.delete(scriptUrl);
        }
        this.updateSiteShields(domain, {
            blockedScripts: Array.from(blocked),
            allowedScripts: Array.from(allowed),
        });
        const scripts = this.detectedScriptsMap.get(domain.toLowerCase().replace(/^www\./, ''));
        if (scripts && scripts.has(scriptUrl)) {
            const s = scripts.get(scriptUrl);
            s.status = action === 'block' ? 'blocked' : 'allowed';
        }
    }
    updateDomainRule(domain, targetDomain, action) {
        const shields = this.getSiteShields(domain);
        const blocked = new Set(shields.blockedDomains || []);
        const allowed = new Set(shields.allowedDomains || []);
        if (action === 'block') {
            blocked.add(targetDomain);
            allowed.delete(targetDomain);
        }
        else if (action === 'allow') {
            allowed.add(targetDomain);
            blocked.delete(targetDomain);
        }
        else {
            blocked.delete(targetDomain);
            allowed.delete(targetDomain);
        }
        this.updateSiteShields(domain, {
            blockedDomains: Array.from(blocked),
            allowedDomains: Array.from(allowed),
        });
    }
    /**
     * Main evaluation logic for intercepted web requests
     */
    evaluateRequest(details, rootDomain) {
        if (!rootDomain || rootDomain === 'about:blank' || details.url.startsWith('chrome:') || details.url.startsWith('about:') || details.url.startsWith('devtools:')) {
            return { cancel: false };
        }
        const shields = this.getSiteShields(rootDomain);
        if (!shields.shieldsUp) {
            return { cancel: false };
        }
        // 1. HTTPS Upgrade
        if (shields.upgradeHttps && details.url.startsWith('http://')) {
            try {
                const parsed = new URL(details.url);
                if (parsed.hostname !== 'localhost' && !parsed.hostname.endsWith('.local') && !parsed.hostname.endsWith('.onion')) {
                    const upgraded = details.url.replace(/^http:/, 'https:');
                    this.incrementStat(rootDomain, 'httpsUpgrades');
                    console.log(`[Shield] Upgraded to HTTPS: ${details.url} -> ${upgraded}`);
                    return { cancel: false, redirectURL: upgraded };
                }
            }
            catch { /* ignore */ }
        }
        // 2. Script Blocking Check
        const isScript = details.resourceType === 'script' ||
            details.url.endsWith('.js') ||
            details.url.includes('.js?') ||
            details.url.includes('/js/') ||
            details.url.includes('javascript') ||
            details.url.includes('/static/js/');
        if (isScript) {
            const category = this.classifyScript(details.url, rootDomain);
            let scriptHost = '';
            try {
                scriptHost = new URL(details.url).hostname.toLowerCase().replace(/^www\./, '');
            }
            catch {
                scriptHost = rootDomain;
            }
            const isExplicitlyAllowedScript = (shields.allowedScripts || []).some(pattern => details.url.includes(pattern));
            const isExplicitlyBlockedScript = (shields.blockedScripts || []).some(pattern => details.url.includes(pattern));
            const isExplicitlyAllowedDomain = (shields.allowedDomains || []).some(d => scriptHost === d || scriptHost.endsWith('.' + d));
            const isExplicitlyBlockedDomain = (shields.blockedDomains || []).some(d => scriptHost === d || scriptHost.endsWith('.' + d));
            let shouldBlockScript = false;
            if (isExplicitlyBlockedScript || isExplicitlyBlockedDomain) {
                shouldBlockScript = true;
            }
            else if (isExplicitlyAllowedScript || isExplicitlyAllowedDomain) {
                shouldBlockScript = false;
            }
            else if (shields.blockScripts) {
                // Master script blocking is ON:
                // If allowFirstPartyScripts is enabled and script is first party, allow it.
                // Otherwise, block ALL scripts automatically!
                if (category === 'first-party' && shields.allowFirstPartyScripts) {
                    shouldBlockScript = false;
                }
                else {
                    shouldBlockScript = true;
                }
            }
            this.recordDetectedScript(rootDomain, details.url, shouldBlockScript);
            if (shouldBlockScript) {
                this.incrementStat(rootDomain, 'scriptsBlocked');
                console.log(`[Shield] Blocked script (${category}): ${details.url} on site ${rootDomain}`);
                return { cancel: true };
            }
        }
        // 3. Ad & Tracker Blocking Check
        if (shields.blockTrackers !== 'off' && adblocker_1.adBlockerManager.isEnabled()) {
            if (adblocker_1.adBlockerManager.shouldBlock(details)) {
                this.incrementStat(rootDomain, 'trackersBlocked');
                return { cancel: true };
            }
        }
        return { cancel: false };
    }
    /**
     * Cookie & Header interceptor evaluation
     */
    evaluateHeaders(requestUrl, rootDomain, headers) {
        const shields = this.getSiteShields(rootDomain);
        if (!shields.shieldsUp || shields.blockCookies === 'none') {
            return { cancel: false };
        }
        let isThirdParty = false;
        try {
            const reqHost = new URL(requestUrl).hostname.toLowerCase().replace(/^www\./, '');
            const rootHost = rootDomain.toLowerCase().replace(/^www\./, '');
            isThirdParty = reqHost !== rootHost && !reqHost.endsWith('.' + rootHost);
        }
        catch {
            isThirdParty = false;
        }
        if (shields.blockCookies === 'all' || (shields.blockCookies === 'third-party' && isThirdParty)) {
            const cleaned = {};
            for (const [k, v] of Object.entries(headers)) {
                if (k.toLowerCase() !== 'cookie') {
                    cleaned[k] = v;
                }
            }
            return { cancel: false, requestHeaders: cleaned };
        }
        return { cancel: false };
    }
    notifyRenderer(domain) {
        if (this.mainWebContentsId) {
            const wc = electron_1.webContents.fromId(this.mainWebContentsId);
            if (wc && !wc.isDestroyed()) {
                try {
                    wc.send('shields:stats-updated', {
                        domain,
                        shields: this.getSiteShields(domain),
                        stats: this.getStats(domain),
                        detectedScripts: this.getDetectedScripts(domain),
                    });
                }
                catch { /* ignore */ }
            }
        }
    }
    setupIPC() {
        electron_1.ipcMain.handle('shields:get-site-shields', (_event, domain) => {
            return this.getSiteShields(domain);
        });
        electron_1.ipcMain.handle('shields:update-site-shields', (_event, domain, updates) => {
            return this.updateSiteShields(domain, updates);
        });
        electron_1.ipcMain.handle('shields:get-stats', (_event, domain) => {
            return this.getStats(domain);
        });
        electron_1.ipcMain.handle('shields:get-detected-scripts', (_event, domain) => {
            return this.getDetectedScripts(domain);
        });
        electron_1.ipcMain.handle('shields:update-script-rule', (_event, domain, scriptUrl, action) => {
            this.updateScriptRule(domain, scriptUrl, action);
            return true;
        });
        electron_1.ipcMain.handle('shields:update-domain-rule', (_event, domain, targetDomain, action) => {
            this.updateDomainRule(domain, targetDomain, action);
            return true;
        });
        electron_1.ipcMain.handle('shields:update-blocked-scripts', (_event, domain, blockedUrls) => {
            this.updateSiteShields(domain, { blockedScripts: blockedUrls });
            return true;
        });
        electron_1.ipcMain.handle('shields:record-script', (_event, domain, scriptUrl, blocked) => {
            this.recordDetectedScript(domain, scriptUrl, blocked);
            return true;
        });
    }
}
exports.ShieldManager = ShieldManager;
exports.shieldManager = new ShieldManager();
