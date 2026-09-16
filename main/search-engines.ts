export const SEARCH_ENGINES = {
  google: 'https://www.google.com/search?q=',
  bing: 'https://www.bing.com/search?q=',
  duckduckgo: 'https://duckduckgo.com/?q=',
  brave: 'https://search.brave.com/search?q=',
} as const;

export type SearchEngineKey = keyof typeof SEARCH_ENGINES;

export function getSearchUrl(query: string, engine: SearchEngineKey = 'google'): string {
  const baseUrl = SEARCH_ENGINES[engine] || SEARCH_ENGINES.google;
  return baseUrl + encodeURIComponent(query);
}
