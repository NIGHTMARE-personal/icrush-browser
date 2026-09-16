"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.SEARCH_ENGINES = void 0;
exports.getSearchUrl = getSearchUrl;
exports.SEARCH_ENGINES = {
    google: 'https://www.google.com/search?q=',
    bing: 'https://www.bing.com/search?q=',
    duckduckgo: 'https://duckduckgo.com/?q=',
    brave: 'https://search.brave.com/search?q=',
};
function getSearchUrl(query, engine = 'google') {
    const baseUrl = exports.SEARCH_ENGINES[engine] || exports.SEARCH_ENGINES.google;
    return baseUrl + encodeURIComponent(query);
}
