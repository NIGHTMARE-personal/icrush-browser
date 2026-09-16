const SEARCH_ENGINES = {
  google: 'https://www.google.com/search?q=',
  bing: 'https://www.bing.com/search?q=',
  duckduckgo: 'https://duckduckgo.com/?q=',
  brave: 'https://search.brave.com/search?q=',
} as const;

// Common sites that should be navigated to directly, not searched
const COMMON_SITES: Record<string, string> = {
  reddit: 'https://www.reddit.com',
  youtube: 'https://www.youtube.com',
  google: 'https://www.google.com',
  twitter: 'https://www.twitter.com',
  x: 'https://www.x.com',
  facebook: 'https://www.facebook.com',
  instagram: 'https://www.instagram.com',
  github: 'https://www.github.com',
  stackoverflow: 'https://stackoverflow.com',
  'stack overflow': 'https://stackoverflow.com',
  amazon: 'https://www.amazon.com',
  netflix: 'https://www.netflix.com',
  wikipedia: 'https://www.wikipedia.org',
  wiki: 'https://www.wikipedia.org',
  linkedin: 'https://www.linkedin.com',
  discord: 'https://discord.com',
  twitch: 'https://www.twitch.tv',
  medium: 'https://medium.com',
  quora: 'https://www.quora.com',
  pinterest: 'https://www.pinterest.com',
  tiktok: 'https://www.tiktok.com',
  openai: 'https://chat.openai.com',
  chatgpt: 'https://chat.openai.com',
  claude: 'https://claude.ai',
  gemini: 'https://gemini.google.com',
  bing: 'https://www.bing.com',
  yahoo: 'https://www.yahoo.com',
  ebay: 'https://www.ebay.com',
  walmart: 'https://www.walmart.com',
  spotify: 'https://open.spotify.com',
  'apple music': 'https://music.apple.com',
  steam: 'https://store.steampowered.com',
  imdb: 'https://www.imdb.com',
  'new york times': 'https://www.nytimes.com',
  nytimes: 'https://www.nytimes.com',
  bbc: 'https://www.bbc.com',
  cnn: 'https://www.cnn.com',
  espn: 'https://www.espn.com',
};

export type SearchEngineKey = keyof typeof SEARCH_ENGINES;

export function isOnionAddress(url: string): boolean {
  try {
    const urlObj = new URL(url.startsWith('http') ? url : 'http://' + url);
    return urlObj.hostname.endsWith('.onion');
  } catch {
    return false;
  }
}

export function ensureOnionUrl(url: string): string {
  if (!url.startsWith('http://') && !url.startsWith('https://')) {
    return 'http://' + url;
  }
  return url;
}

export function shouldUseTorForUrl(url: string, torMode: boolean): boolean {
  if (isOnionAddress(url)) return true;
  return torMode;
}

/**
 * Checks if a string is likely a search query or a valid URL/domain
 */
export function isSearchQuery(input: string): boolean {
  const trimmed = input.trim();
  if (!trimmed) return true;

  // Common protocol checks
  if (/^(https?|file|about|chrome|localhost):/i.test(trimmed)) return false;

  // Check for .onion addresses
  if (isOnionAddress(trimmed)) return false;

  // Basic regex check for domain.com, domain.org, etc. (must have at least one dot, and no spaces, and valid chars)
  // e.g., google.com, github.com, localhost:3000, 192.168.1.1
  const domainRegex = /^[a-z0-9-]+(\.[a-z0-9-]+)+(:[0-9]+)?(\/.*)?$/i;
  const ipRegex = /^[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}(:[0-9]+)?(\/.*)?$/;
  const localhostRegex = /^localhost(:[0-9]+)?(\/.*)?$/i;

  if (domainRegex.test(trimmed) || ipRegex.test(trimmed) || localhostRegex.test(trimmed)) {
    return false;
  }

  // Check if it's a known site name (single word like "reddit", "youtube", etc.)
  const lower = trimmed.toLowerCase();
  if (COMMON_SITES[lower]) return false;

  // If it contains spaces and is NOT a known site, it's a search query
  if (trimmed.includes(' ')) return true;

  return true;
}

/**
 * Normalizes input text into a proper URL.
 * Converts search queries into the selected search engine URL.
 */
export function normalizeUrl(input: string, searchEngine: SearchEngineKey = 'google'): string {
  const trimmed = input.trim();
  if (!trimmed || trimmed === 'about:blank') return 'about:blank';

  // Auto-correct search query parameter typos like search?q-keyword or search?q:keyword -> search?q=keyword
  let cleanInput = trimmed;
  cleanInput = cleanInput.replace(/search\?q[-:]/i, 'search?q=');

  // If input already contains search?q=, extract search query or return valid search URL directly
  if (/^https?:\/\/[^/]+\/search\?q=/i.test(cleanInput)) {
    return cleanInput;
  }
  if (/^([a-z0-9-]+\.)+[a-z]{2,}\/search\?q=/i.test(cleanInput)) {
    return 'https://' + cleanInput;
  }
  if (/^search\?q=/i.test(cleanInput)) {
    const query = cleanInput.replace(/^search\?q=/i, '');
    const baseUrl = SEARCH_ENGINES[searchEngine] || SEARCH_ENGINES.google;
    return baseUrl + encodeURIComponent(query);
  }

  // Handle .onion addresses
  if (isOnionAddress(cleanInput)) {
    return ensureOnionUrl(cleanInput);
  }

  // If it's a search query, wrap in the selected search engine query URL
  if (isSearchQuery(cleanInput)) {
    // YouTube site-specific search → go directly to YouTube
    const ytMatch = cleanInput.match(/^(.+?)\s+site:youtube\.com$/i);
    if (ytMatch) {
      return `https://www.youtube.com/results?search_query=${encodeURIComponent(ytMatch[1])}`;
    }
    const baseUrl = SEARCH_ENGINES[searchEngine] || SEARCH_ENGINES.google;
    return baseUrl + encodeURIComponent(cleanInput);
  }

  // If it doesn't start with a protocol, default to https://
  if (!/^(https?|about|chrome|file):/i.test(cleanInput)) {
    return 'https://' + cleanInput;
  }

  return cleanInput;
}

/**
 * Helper to display clean URLs in the address bar (e.g. stripping protocols)
 */
export function formatUrlForDisplay(url: string): string {
  if (!url) return '';
  if (url === 'about:blank') return '';
  return url;
}
