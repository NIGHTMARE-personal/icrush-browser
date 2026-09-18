"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.THREAT_CACHE_TTL_MS = exports.THREAT_FEED_SOURCES = void 0;
exports.parseTextFeed = parseTextFeed;
exports.hostnameOf = hostnameOf;
exports.emptyThreatIndex = emptyThreatIndex;
exports.buildThreatIndex = buildThreatIndex;
exports.matchThreatIndex = matchThreatIndex;
exports.loadThreatCache = loadThreatCache;
exports.saveThreatCache = saveThreatCache;
exports.isThreatCacheFresh = isThreatCacheFresh;
exports.fetchThreatFeeds = fetchThreatFeeds;
/**
 * Threat-feed aggregation (main process).
 *
 * Pulls plain-text URL feeds (URLhaus malware URLs, OpenPhish phishing URLs),
 * caches them in userData, and exposes a fast in-memory matcher used by the
 * security manager's navigation gate. Pure parsing/matching logic is Vitest
 * covered; fetching degrades gracefully to cache, then to built-in lists.
 */
const fs_1 = __importDefault(require("fs"));
const path_1 = __importDefault(require("path"));
exports.THREAT_FEED_SOURCES = [
    {
        id: 'urlhaus',
        label: 'URLhaus (abuse.ch)',
        url: 'https://urlhaus.abuse.ch/downloads/text/',
        reason: 'malware',
    },
    {
        id: 'openphish',
        label: 'OpenPhish Community',
        url: 'https://openphish.com/feed.txt',
        reason: 'phishing',
    },
];
exports.THREAT_CACHE_TTL_MS = 24 * 60 * 60 * 1000;
const MAX_ENTRIES_PER_FEED = 20000;
/** Parse a plain-text feed (one URL per line, `#` comments) into clean URLs. */
function parseTextFeed(text) {
    const out = [];
    for (const rawLine of text.split('\n')) {
        const line = rawLine.trim();
        if (!line || line.startsWith('#'))
            continue;
        if (!/^https?:\/\//i.test(line))
            continue;
        out.push(line);
        if (out.length >= MAX_ENTRIES_PER_FEED)
            break;
    }
    return out;
}
function hostnameOf(url) {
    try {
        const host = new URL(url).hostname.toLowerCase();
        return host.startsWith('www.') ? host.slice(4) : host;
    }
    catch {
        return '';
    }
}
function emptyThreatIndex() {
    return { updatedAt: 0, hosts: {}, urls: {}, sources: {} };
}
/** Merge per-feed URL lists into one lookup index. First feed wins on conflict. */
function buildThreatIndex(feeds) {
    const index = emptyThreatIndex();
    for (const [sourceId, feed] of Object.entries(feeds)) {
        let count = 0;
        for (const raw of feed.urls) {
            const url = raw.trim();
            if (!url)
                continue;
            const key = url.toLowerCase();
            if (!index.urls[key]) {
                index.urls[key] = feed.reason;
                count++;
            }
            const host = hostnameOf(url);
            if (host && !index.hosts[host]) {
                index.hosts[host] = feed.reason;
            }
        }
        index.sources[sourceId] = count;
    }
    index.updatedAt = Date.now();
    return index;
}
/** Fast sync lookup: exact URL first, then hostname. */
function matchThreatIndex(pageUrl, index) {
    let host = '';
    try {
        host = new URL(pageUrl).hostname.toLowerCase();
    }
    catch {
        return { matched: false };
    }
    const bare = host.startsWith('www.') ? host.slice(4) : host;
    const exact = index.urls[pageUrl.toLowerCase()] ?? index.urls[pageUrl.toLowerCase().replace(/\/$/, '')];
    if (exact)
        return { matched: true, reason: exact };
    const hostHit = index.hosts[bare] ?? index.hosts[host];
    if (hostHit)
        return { matched: true, reason: hostHit };
    return { matched: false };
}
function loadThreatCache(filePath) {
    try {
        if (!fs_1.default.existsSync(filePath))
            return null;
        const raw = JSON.parse(fs_1.default.readFileSync(filePath, 'utf-8'));
        if (typeof raw !== 'object' || raw === null)
            return null;
        const rec = raw;
        if (typeof rec.updatedAt !== 'number')
            return null;
        const index = emptyThreatIndex();
        index.updatedAt = rec.updatedAt;
        if (typeof rec.hosts === 'object' && rec.hosts !== null) {
            for (const [host, reason] of Object.entries(rec.hosts)) {
                if (reason === 'malware' || reason === 'phishing')
                    index.hosts[host.toLowerCase()] = reason;
            }
        }
        if (typeof rec.urls === 'object' && rec.urls !== null) {
            for (const [url, reason] of Object.entries(rec.urls)) {
                if (reason === 'malware' || reason === 'phishing')
                    index.urls[url.toLowerCase()] = reason;
            }
        }
        return index;
    }
    catch {
        return null;
    }
}
function saveThreatCache(filePath, index) {
    try {
        const dir = path_1.default.dirname(filePath);
        if (!fs_1.default.existsSync(dir))
            fs_1.default.mkdirSync(dir, { recursive: true });
        fs_1.default.writeFileSync(filePath, JSON.stringify(index), 'utf-8');
    }
    catch {
        // cache persistence is best-effort
    }
}
function isThreatCacheFresh(index, now = Date.now()) {
    if (!index || !index.updatedAt)
        return false;
    return now - index.updatedAt < exports.THREAT_CACHE_TTL_MS;
}
/** Fetch all feeds; a failed feed is simply absent from the result. */
async function fetchThreatFeeds(fetchImpl = fetch, timeoutMs = 15000) {
    const out = {};
    await Promise.all(exports.THREAT_FEED_SOURCES.map(async (source) => {
        try {
            const controller = new AbortController();
            const timer = setTimeout(() => controller.abort(), timeoutMs);
            try {
                const res = await fetchImpl(source.url, { signal: controller.signal });
                if (!res.ok)
                    return;
                const text = await res.text();
                const urls = parseTextFeed(text);
                if (urls.length > 0)
                    out[source.id] = { urls, reason: source.reason };
            }
            finally {
                clearTimeout(timer);
            }
        }
        catch {
            // offline or blocked — caller falls back to cache
        }
    }));
    return out;
}
