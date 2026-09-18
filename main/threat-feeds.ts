/**
 * Threat-feed aggregation (main process).
 *
 * Pulls plain-text URL feeds (URLhaus malware URLs, OpenPhish phishing URLs),
 * caches them in userData, and exposes a fast in-memory matcher used by the
 * security manager's navigation gate. Pure parsing/matching logic is Vitest
 * covered; fetching degrades gracefully to cache, then to built-in lists.
 */
import fs from 'fs';
import path from 'path';

export interface ThreatFeedSource {
  id: 'urlhaus' | 'openphish';
  label: string;
  url: string;
  reason: 'malware' | 'phishing';
}

export const THREAT_FEED_SOURCES: ThreatFeedSource[] = [
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

export const THREAT_CACHE_TTL_MS = 24 * 60 * 60 * 1000;
const MAX_ENTRIES_PER_FEED = 20000;

/** Parse a plain-text feed (one URL per line, `#` comments) into clean URLs. */
export function parseTextFeed(text: string): string[] {
  const out: string[] = [];
  for (const rawLine of text.split('\n')) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;
    if (!/^https?:\/\//i.test(line)) continue;
    out.push(line);
    if (out.length >= MAX_ENTRIES_PER_FEED) break;
  }
  return out;
}

export function hostnameOf(url: string): string {
  try {
    const host = new URL(url).hostname.toLowerCase();
    return host.startsWith('www.') ? host.slice(4) : host;
  } catch {
    return '';
  }
}

export interface ThreatFeedIndex {
  updatedAt: number;
  /** host -> 'malware' | 'phishing' */
  hosts: Record<string, 'malware' | 'phishing'>;
  /** exact normalized URL -> 'malware' | 'phishing' */
  urls: Record<string, 'malware' | 'phishing'>;
  sources: Record<string, number>;
}

export function emptyThreatIndex(): ThreatFeedIndex {
  return { updatedAt: 0, hosts: {}, urls: {}, sources: {} };
}

/** Merge per-feed URL lists into one lookup index. First feed wins on conflict. */
export function buildThreatIndex(feeds: Record<string, { urls: string[]; reason: 'malware' | 'phishing' }>): ThreatFeedIndex {
  const index = emptyThreatIndex();
  for (const [sourceId, feed] of Object.entries(feeds)) {
    let count = 0;
    for (const raw of feed.urls) {
      const url = raw.trim();
      if (!url) continue;
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

export interface ThreatMatch {
  matched: boolean;
  reason?: 'malware' | 'phishing';
}

/** Fast sync lookup: exact URL first, then hostname. */
export function matchThreatIndex(pageUrl: string, index: ThreatFeedIndex): ThreatMatch {
  let host = '';
  try {
    host = new URL(pageUrl).hostname.toLowerCase();
  } catch {
    return { matched: false };
  }
  const bare = host.startsWith('www.') ? host.slice(4) : host;
  const exact = index.urls[pageUrl.toLowerCase()] ?? index.urls[pageUrl.toLowerCase().replace(/\/$/, '')];
  if (exact) return { matched: true, reason: exact };
  const hostHit = index.hosts[bare] ?? index.hosts[host];
  if (hostHit) return { matched: true, reason: hostHit };
  return { matched: false };
}

export function loadThreatCache(filePath: string): ThreatFeedIndex | null {
  try {
    if (!fs.existsSync(filePath)) return null;
    const raw = JSON.parse(fs.readFileSync(filePath, 'utf-8')) as unknown;
    if (typeof raw !== 'object' || raw === null) return null;
    const rec = raw as Record<string, unknown>;
    if (typeof rec.updatedAt !== 'number') return null;
    const index = emptyThreatIndex();
    index.updatedAt = rec.updatedAt;
    if (typeof rec.hosts === 'object' && rec.hosts !== null) {
      for (const [host, reason] of Object.entries(rec.hosts as Record<string, unknown>)) {
        if (reason === 'malware' || reason === 'phishing') index.hosts[host.toLowerCase()] = reason;
      }
    }
    if (typeof rec.urls === 'object' && rec.urls !== null) {
      for (const [url, reason] of Object.entries(rec.urls as Record<string, unknown>)) {
        if (reason === 'malware' || reason === 'phishing') index.urls[url.toLowerCase()] = reason;
      }
    }
    return index;
  } catch {
    return null;
  }
}

export function saveThreatCache(filePath: string, index: ThreatFeedIndex): void {
  try {
    const dir = path.dirname(filePath);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(filePath, JSON.stringify(index), 'utf-8');
  } catch {
    // cache persistence is best-effort
  }
}

export function isThreatCacheFresh(index: ThreatFeedIndex | null, now = Date.now()): boolean {
  if (!index || !index.updatedAt) return false;
  return now - index.updatedAt < THREAT_CACHE_TTL_MS;
}

type FetchImpl = (url: string, init?: { signal?: AbortSignal }) => Promise<{ ok: boolean; text: () => Promise<string> }>;

/** Fetch all feeds; a failed feed is simply absent from the result. */
export async function fetchThreatFeeds(
  fetchImpl: FetchImpl = fetch as unknown as FetchImpl,
  timeoutMs = 15000
): Promise<Record<string, { urls: string[]; reason: 'malware' | 'phishing' }>> {
  const out: Record<string, { urls: string[]; reason: 'malware' | 'phishing' }> = {};
  await Promise.all(
    THREAT_FEED_SOURCES.map(async source => {
      try {
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), timeoutMs);
        try {
          const res = await fetchImpl(source.url, { signal: controller.signal });
          if (!res.ok) return;
          const text = await res.text();
          const urls = parseTextFeed(text);
          if (urls.length > 0) out[source.id] = { urls, reason: source.reason };
        } finally {
          clearTimeout(timer);
        }
      } catch {
        // offline or blocked — caller falls back to cache
      }
    })
  );
  return out;
}
