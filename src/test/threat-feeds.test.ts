import { describe, it, expect } from 'vitest';
import {
  parseTextFeed,
  hostnameOf,
  buildThreatIndex,
  matchThreatIndex,
  emptyThreatIndex,
  isThreatCacheFresh,
  fetchThreatFeeds,
} from '../../main/threat-feeds.js';

describe('threat-feeds', () => {
  describe('parseTextFeed', () => {
    it('skips comments, blanks, and non-URL lines', () => {
      const text = '# comment\n\nhttps://evil.example/a\nnot-a-url\nhttp://bad.example/b\n';
      expect(parseTextFeed(text)).toEqual(['https://evil.example/a', 'http://bad.example/b']);
    });

    it('caps entries to bound memory', () => {
      const text = Array.from({ length: 25000 }, (_, i) => `https://x.example/${i}`).join('\n');
      expect(parseTextFeed(text).length).toBeLessThanOrEqual(20000);
    });
  });

  describe('hostnameOf', () => {
    it('normalizes www and case', () => {
      expect(hostnameOf('https://WWW.Example.COM/path')).toBe('example.com');
      expect(hostnameOf('not a url')).toBe('');
    });
  });

  describe('buildThreatIndex + matchThreatIndex', () => {
    const index = buildThreatIndex({
      urlhaus: { urls: ['https://mal.example/payload.exe'], reason: 'malware' },
      openphish: { urls: ['https://phish.example/login'], reason: 'phishing' },
    });

    it('matches exact URLs with the right reason', () => {
      expect(matchThreatIndex('https://mal.example/payload.exe', index)).toEqual({
        matched: true,
        reason: 'malware',
      });
      expect(matchThreatIndex('https://phish.example/login', index)).toEqual({
        matched: true,
        reason: 'phishing',
      });
    });

    it('matches any page on a listed host', () => {
      expect(matchThreatIndex('https://mal.example/other', index).matched).toBe(true);
      expect(matchThreatIndex('https://www.mal.example/other', index).matched).toBe(true);
    });

    it('passes clean URLs', () => {
      expect(matchThreatIndex('https://example.com/', index)).toEqual({ matched: false });
      expect(matchThreatIndex('not a url', index)).toEqual({ matched: false });
    });
  });

  describe('isThreatCacheFresh', () => {
    it('rejects missing and stale caches', () => {
      expect(isThreatCacheFresh(null)).toBe(false);
      expect(isThreatCacheFresh(emptyThreatIndex())).toBe(false);
      expect(isThreatCacheFresh({ ...emptyThreatIndex(), updatedAt: Date.now() - 25 * 3600 * 1000 })).toBe(false);
      expect(isThreatCacheFresh({ ...emptyThreatIndex(), updatedAt: Date.now() })).toBe(true);
    });
  });

  describe('fetchThreatFeeds', () => {
    it('skips failed feeds and keeps the rest', async () => {
      const fakeFetch = async (url: string) => {
        if (url.includes('urlhaus')) {
          return { ok: true, text: async () => 'https://a.example/x\n' };
        }
        return { ok: false, text: async () => '' };
      };
      const feeds = await fetchThreatFeeds(fakeFetch);
      expect(Object.keys(feeds)).toEqual(['urlhaus']);
      expect(feeds.urlhaus.reason).toBe('malware');
    });
  });
});
