import { app, ipcMain, webContents } from 'electron';
import path from 'path';
import fs from 'fs';
import { adBlockerManager } from './adblocker';

export interface SiteShields {
  shieldsUp: boolean;
  blockTrackers: 'standard' | 'aggressive' | 'off';
  upgradeHttps: boolean;
  blockScripts: boolean;
  allowFirstPartyScripts: boolean;
  blockedScripts: string[];
  allowedScripts: string[];
  blockedDomains: string[];
  allowedDomains: string[];
  blockFingerprinting: boolean;
  fingerprintingProtections: {
    canvas: boolean;
    audio: boolean;
    webgl: boolean;
    hardwareConcurrency: boolean;
    deviceMemory: boolean;
    webrtc: boolean;
    font: boolean;
  };
  blockCookies: 'third-party' | 'all' | 'none';
  forgetMe: boolean;
}

export interface ShieldStats {
  trackersBlocked: number;
  scriptsBlocked: number;
  httpsUpgrades: number;
  fingerprintsFoiled: number;
}

export interface DetectedScript {
  url: string;
  domain: string;
  origin: string;
  category: 'first-party' | 'tracker' | 'cdn' | 'third-party';
  status: 'blocked' | 'allowed';
  timestamp: number;
}

export const DEFAULT_SITE_SHIELDS: SiteShields = {
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

export class ShieldManager {
  private configPath: string;
  private siteShieldsMap = new Map<string, SiteShields>();
  private detectedScriptsMap = new Map<string, Map<string, DetectedScript>>(); // domain -> url -> script
  private statsMap = new Map<string, ShieldStats>(); // domain -> stats
  private tabToDomainMap = new Map<number, string>(); // webContentsId -> domain
  private mainWebContentsId: number | null = null;

  constructor() {
    this.configPath = path.join(app.getPath('userData'), 'site-shields.json');
    this.loadSettings();
    this.setupIPC();
  }

  public setMainWebContentsId(id: number): void {
    this.mainWebContentsId = id;
  }

  private loadSettings(): void {
    try {
      if (fs.existsSync(this.configPath)) {
        const raw = fs.readFileSync(this.configPath, 'utf8');
        const data = JSON.parse(raw);
        for (const [domain, config] of Object.entries(data)) {
          this.siteShieldsMap.set(domain, { ...DEFAULT_SITE_SHIELDS, ...(config as any) });
        }
      }
    } catch (err) {
      console.error('[ShieldManager] Failed to load site shields:', err);
    }
  }

  private saveSettings(): void {
    try {
      const obj: Record<string, SiteShields> = {};
      for (const [domain, config] of this.siteShieldsMap.entries()) {
        obj[domain] = config;
      }
      fs.writeFileSync(this.configPath, JSON.stringify(obj, null, 2), 'utf8');
    } catch (err) {
      console.error('[ShieldManager] Failed to save site shields:', err);
    }
  }

  public getSiteShields(domain: string): SiteShields {
    if (!domain || domain === 'about:blank' || domain === 'unknown-site') {
      return { ...DEFAULT_SITE_SHIELDS };
    }
    const normalized = domain.toLowerCase().replace(/^www\./, '');
    return this.siteShieldsMap.get(normalized) || { ...DEFAULT_SITE_SHIELDS };
  }

  public updateSiteShields(domain: string, updates: Partial<SiteShields>): SiteShields {
    if (!domain || domain === 'about:blank' || domain === 'unknown-site') {
      return { ...DEFAULT_SITE_SHIELDS };
    }
    const normalized = domain.toLowerCase().replace(/^www\./, '');
    const current = this.getSiteShields(normalized);
    const updated: SiteShields = {
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

  public getStats(domain: string): ShieldStats {
    const normalized = domain.toLowerCase().replace(/^www\./, '');
    return this.statsMap.get(normalized) || {
      trackersBlocked: 0,
      scriptsBlocked: 0,
      httpsUpgrades: 0,
      fingerprintsFoiled: 0,
    };
  }

  public incrementStat(domain: string, statKey: keyof ShieldStats, amount = 1): void {
    const normalized = domain.toLowerCase().replace(/^www\./, '');
    const stats = this.getStats(normalized);
    stats[statKey] = (stats[statKey] || 0) + amount;
    this.statsMap.set(normalized, stats);
    this.notifyRenderer(normalized);
  }

  public resetTab(webContentsId: number, domain: string): void {
    const normalized = domain.toLowerCase().replace(/^www\./, '');
    this.tabToDomainMap.set(webContentsId, normalized);
    if (!this.detectedScriptsMap.has(normalized)) {
      this.detectedScriptsMap.set(normalized, new Map());
    }
  }

  public getDomainForTab(webContentsId: number): string {
    return this.tabToDomainMap.get(webContentsId) || '';
  }

  public classifyScript(scriptUrl: string, rootDomain: string): 'first-party' | 'tracker' | 'cdn' | 'third-party' {
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
    } catch {
      return 'third-party';
    }
  }

  public recordDetectedScript(
    rootDomain: string,
    scriptUrl: string,
    blocked: boolean
  ): DetectedScript {
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
    } catch {
      scriptHost = normalizedRoot;
      origin = normalizedRoot;
    }

    const category = this.classifyScript(scriptUrl, normalizedRoot);
    const entry: DetectedScript = {
      url: scriptUrl,
      domain: scriptHost,
      origin: origin,
      category: category,
      status: blocked ? 'blocked' : 'allowed',
      timestamp: Date.now(),
    };

    this.detectedScriptsMap.get(normalizedRoot)!.set(scriptUrl, entry);
    this.notifyRenderer(normalizedRoot);
    return entry;
  }

  public getDetectedScripts(domain: string): DetectedScript[] {
    const normalized = domain.toLowerCase().replace(/^www\./, '');
    const map = this.detectedScriptsMap.get(normalized);
    if (!map) return [];
    return Array.from(map.values()).sort((a, b) => b.timestamp - a.timestamp);
  }

  public updateScriptRule(
    domain: string,
    scriptUrl: string,
    action: 'block' | 'allow' | 'default'
  ): void {
    const shields = this.getSiteShields(domain);
    const blocked = new Set(shields.blockedScripts || []);
    const allowed = new Set(shields.allowedScripts || []);

    if (action === 'block') {
      blocked.add(scriptUrl);
      allowed.delete(scriptUrl);
    } else if (action === 'allow') {
      allowed.add(scriptUrl);
      blocked.delete(scriptUrl);
    } else {
      blocked.delete(scriptUrl);
      allowed.delete(scriptUrl);
    }

    this.updateSiteShields(domain, {
      blockedScripts: Array.from(blocked),
      allowedScripts: Array.from(allowed),
    });

    const scripts = this.detectedScriptsMap.get(domain.toLowerCase().replace(/^www\./, ''));
    if (scripts && scripts.has(scriptUrl)) {
      const s = scripts.get(scriptUrl)!;
      s.status = action === 'block' ? 'blocked' : 'allowed';
    }
  }

  public updateDomainRule(
    domain: string,
    targetDomain: string,
    action: 'block' | 'allow' | 'default'
  ): void {
    const shields = this.getSiteShields(domain);
    const blocked = new Set(shields.blockedDomains || []);
    const allowed = new Set(shields.allowedDomains || []);

    if (action === 'block') {
      blocked.add(targetDomain);
      allowed.delete(targetDomain);
    } else if (action === 'allow') {
      allowed.add(targetDomain);
      blocked.delete(targetDomain);
    } else {
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
  public evaluateRequest(
    details: Electron.OnBeforeRequestListenerDetails,
    rootDomain: string
  ): { cancel: boolean; redirectURL?: string } {
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
      } catch { /* ignore */ }
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
      } catch {
        scriptHost = rootDomain;
      }

      const isExplicitlyAllowedScript = (shields.allowedScripts || []).some(pattern => details.url.includes(pattern));
      const isExplicitlyBlockedScript = (shields.blockedScripts || []).some(pattern => details.url.includes(pattern));
      const isExplicitlyAllowedDomain = (shields.allowedDomains || []).some(d => scriptHost === d || scriptHost.endsWith('.' + d));
      const isExplicitlyBlockedDomain = (shields.blockedDomains || []).some(d => scriptHost === d || scriptHost.endsWith('.' + d));

      let shouldBlockScript = false;

      if (isExplicitlyBlockedScript || isExplicitlyBlockedDomain) {
        shouldBlockScript = true;
      } else if (isExplicitlyAllowedScript || isExplicitlyAllowedDomain) {
        shouldBlockScript = false;
      } else if (shields.blockScripts) {
        // Master script blocking is ON:
        // If allowFirstPartyScripts is enabled and script is first party, allow it.
        // Otherwise, block ALL scripts automatically!
        if (category === 'first-party' && shields.allowFirstPartyScripts) {
          shouldBlockScript = false;
        } else {
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
    if (shields.blockTrackers !== 'off' && adBlockerManager.isEnabled()) {
      if (adBlockerManager.shouldBlock(details)) {
        this.incrementStat(rootDomain, 'trackersBlocked');
        return { cancel: true };
      }
    }

    return { cancel: false };
  }

  /**
   * Cookie & Header interceptor evaluation
   */
  public evaluateHeaders(
    requestUrl: string,
    rootDomain: string,
    headers: Record<string, string | string[]>
  ): { cancel: boolean; requestHeaders?: Record<string, string | string[]> } {
    const shields = this.getSiteShields(rootDomain);
    if (!shields.shieldsUp || shields.blockCookies === 'none') {
      return { cancel: false };
    }

    let isThirdParty = false;
    try {
      const reqHost = new URL(requestUrl).hostname.toLowerCase().replace(/^www\./, '');
      const rootHost = rootDomain.toLowerCase().replace(/^www\./, '');
      isThirdParty = reqHost !== rootHost && !reqHost.endsWith('.' + rootHost);
    } catch {
      isThirdParty = false;
    }

    if (shields.blockCookies === 'all' || (shields.blockCookies === 'third-party' && isThirdParty)) {
      const cleaned: Record<string, string | string[]> = {};
      for (const [k, v] of Object.entries(headers)) {
        if (k.toLowerCase() !== 'cookie') {
          cleaned[k] = v;
        }
      }
      return { cancel: false, requestHeaders: cleaned };
    }

    return { cancel: false };
  }

  private notifyRenderer(domain: string): void {
    if (this.mainWebContentsId) {
      const wc = webContents.fromId(this.mainWebContentsId);
      if (wc && !wc.isDestroyed()) {
        try {
          wc.send('shields:stats-updated', {
            domain,
            shields: this.getSiteShields(domain),
            stats: this.getStats(domain),
            detectedScripts: this.getDetectedScripts(domain),
          });
        } catch { /* ignore */ }
      }
    }
  }

  private setupIPC(): void {
    ipcMain.handle('shields:get-site-shields', (_event, domain: string) => {
      return this.getSiteShields(domain);
    });

    ipcMain.handle('shields:update-site-shields', (_event, domain: string, updates: Partial<SiteShields>) => {
      return this.updateSiteShields(domain, updates);
    });

    ipcMain.handle('shields:get-stats', (_event, domain: string) => {
      return this.getStats(domain);
    });

    ipcMain.handle('shields:get-detected-scripts', (_event, domain: string) => {
      return this.getDetectedScripts(domain);
    });

    ipcMain.handle('shields:update-script-rule', (_event, domain: string, scriptUrl: string, action: 'block' | 'allow' | 'default') => {
      this.updateScriptRule(domain, scriptUrl, action);
      return true;
    });

    ipcMain.handle('shields:update-domain-rule', (_event, domain: string, targetDomain: string, action: 'block' | 'allow' | 'default') => {
      this.updateDomainRule(domain, targetDomain, action);
      return true;
    });

    ipcMain.handle('shields:update-blocked-scripts', (_event, domain: string, blockedUrls: string[]) => {
      this.updateSiteShields(domain, { blockedScripts: blockedUrls });
      return true;
    });

    ipcMain.handle('shields:record-script', (_event, domain: string, scriptUrl: string, blocked: boolean) => {
      this.recordDetectedScript(domain, scriptUrl, blocked);
      return true;
    });
  }
}

export const shieldManager = new ShieldManager();
