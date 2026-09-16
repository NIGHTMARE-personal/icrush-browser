import { describe, it, expect, vi, beforeEach } from 'vitest';
import { normalizeUrl, isSearchQuery, formatUrlForDisplay } from '../utils/url';
import { storage } from '../utils/storage';
import { generateUUID } from '../utils/uuid';

describe('URL Utilities', () => {
  describe('isSearchQuery', () => {
    it('should return true for empty string', () => {
      expect(isSearchQuery('')).toBe(true);
    });

    it('should return true for strings with spaces', () => {
      expect(isSearchQuery('hello world')).toBe(true);
      expect(isSearchQuery('search query')).toBe(true);
    });

    it('should return false for valid URLs with protocol', () => {
      expect(isSearchQuery('https://example.com')).toBe(false);
      expect(isSearchQuery('http://example.com')).toBe(false);
      expect(isSearchQuery('file:///path')).toBe(false);
    });

    it('should return false for valid domains', () => {
      expect(isSearchQuery('example.com')).toBe(false);
      expect(isSearchQuery('github.com')).toBe(false);
      expect(isSearchQuery('sub.domain.com')).toBe(false);
    });

    it('should return false for IP addresses', () => {
      expect(isSearchQuery('192.168.1.1')).toBe(false);
      expect(isSearchQuery('127.0.0.1')).toBe(false);
    });

    it('should return false for localhost', () => {
      expect(isSearchQuery('localhost')).toBe(false);
      expect(isSearchQuery('localhost:3000')).toBe(false);
    });
  });

  describe('normalizeUrl', () => {
    it('should return about:blank for empty input', () => {
      expect(normalizeUrl('')).toBe('about:blank');
      expect(normalizeUrl('   ')).toBe('about:blank');
    });

    it('should add https:// to domains without protocol', () => {
      expect(normalizeUrl('example.com')).toBe('https://example.com');
      expect(normalizeUrl('github.com')).toBe('https://github.com');
    });

    it('should keep URLs with protocol as-is', () => {
      expect(normalizeUrl('https://example.com')).toBe('https://example.com');
      expect(normalizeUrl('http://example.com')).toBe('http://example.com');
    });

    it('should convert search queries to Google search URLs', () => {
      expect(normalizeUrl('hello world')).toBe('https://www.google.com/search?q=hello%20world');
      expect(normalizeUrl('test query')).toBe('https://www.google.com/search?q=test%20query');
    });

    it('should use specified search engine', () => {
      expect(normalizeUrl('test', 'duckduckgo')).toBe('https://duckduckgo.com/?q=test');
      expect(normalizeUrl('test', 'bing')).toBe('https://www.bing.com/search?q=test');
      expect(normalizeUrl('test', 'brave')).toBe('https://search.brave.com/search?q=test');
    });
  });

  describe('formatUrlForDisplay', () => {
    it('should return empty string for about:blank', () => {
      expect(formatUrlForDisplay('about:blank')).toBe('');
    });

    it('should return empty string for null/undefined', () => {
      expect(formatUrlForDisplay(null as unknown as string)).toBe('');
      expect(formatUrlForDisplay(undefined as unknown as string)).toBe('');
    });

    it('should return URL as-is for display', () => {
      expect(formatUrlForDisplay('https://example.com')).toBe('https://example.com');
    });
  });
});

describe('Storage Utilities', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
  });

  describe('tabs', () => {
    it('should return empty array when no tabs stored', () => {
      expect(storage.getTabs()).toEqual([]);
    });

    it('should save and retrieve tabs', () => {
      const tabs = [
        {
          id: '1',
          url: 'https://example.com',
          title: 'Example',
          loading: false,
          canGoBack: false,
          canGoForward: false,
        },
      ];
      storage.setTabs(tabs);
      expect(storage.getTabs()).toEqual(tabs);
    });

    it('should save and retrieve tabs with suspension properties', () => {
      const tabs = [
        {
          id: '1',
          url: 'https://example.com',
          title: 'Example',
          loading: false,
          canGoBack: false,
          canGoForward: false,
          isSuspended: true,
          lastActiveTime: 123456789,
        },
      ];
      storage.setTabs(tabs);
      expect(storage.getTabs()).toEqual(tabs);
    });
  });

  describe('active tab ID', () => {
    it('should return null when no active tab', () => {
      expect(storage.getActiveTabId()).toBeNull();
    });

    it('should save and retrieve active tab ID', () => {
      storage.setActiveTabId('tab-1');
      expect(storage.getActiveTabId()).toBe('tab-1');

      storage.setActiveTabId(null);
      expect(storage.getActiveTabId()).toBeNull();
    });
  });

  describe('search engine', () => {
    it('should default to google', () => {
      expect(storage.getSearchEngine()).toBe('google');
    });

    it('should save and retrieve search engine', () => {
      storage.setSearchEngine('duckduckgo');
      expect(storage.getSearchEngine()).toBe('duckduckgo');
    });
  });

  describe('chat history', () => {
    it('should return empty array when no history', () => {
      expect(storage.getChatHistory()).toEqual([]);
    });

    it('should save and retrieve chat history', () => {
      const history = [
        { id: '1', role: 'user' as const, content: 'Hello' },
        { id: '2', role: 'assistant' as const, content: 'Hi there!' },
      ];
      storage.setChatHistory(history);
      expect(storage.getChatHistory()).toEqual(history);
    });
  });

  describe('model management', () => {
    it('should default to gemini-2.5-flash', () => {
      expect(storage.getActiveModelId()).toBe('gemini-2.5-flash');
    });

    it('should save and retrieve active model', () => {
      storage.setActiveModelId('gemini-1.5-pro');
      expect(storage.getActiveModelId()).toBe('gemini-1.5-pro');
    });

    it('should handle custom models', () => {
      const models = [{ id: 'custom-1', name: 'Custom Model' }];
      storage.setCustomModels(models);
      expect(storage.getCustomModels()).toEqual(models);
    });

    it('should handle API keys', async () => {
      const keys = { 'gemini-1.5-flash': 'test-key' };
      await storage.setApiKeys(keys);
      expect(await storage.getApiKeys()).toEqual(keys);
    });
  });
});

describe('UUID Generation', () => {
  it('should generate a valid UUID format', () => {
    const uuid = generateUUID();
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
    expect(uuid).toMatch(uuidRegex);
  });

  it('should generate unique UUIDs', () => {
    const uuids = new Set();
    for (let i = 0; i < 100; i++) {
      uuids.add(generateUUID());
    }
    expect(uuids.size).toBe(100);
  });
});

describe('Bookmark Storage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
  });

  it('should add and retrieve bookmarks', async () => {
    const { bookmarkStorage } = await import('../utils/bookmarks');
    const bookmark = bookmarkStorage.addBookmark({ title: 'Test', url: 'https://test.com' });
    expect(bookmark.title).toBe('Test');
    expect(bookmark.url).toBe('https://test.com');
    expect(bookmark.id).toBeDefined();

    const bookmarks = bookmarkStorage.getBookmarks();
    expect(bookmarks).toHaveLength(1);
    expect(bookmarks[0].id).toBe(bookmark.id);
  });

  it('should update bookmark', async () => {
    const { bookmarkStorage } = await import('../utils/bookmarks');
    const bookmark = bookmarkStorage.addBookmark({ title: 'Original', url: 'https://test.com' });
    const updated = bookmarkStorage.updateBookmark(bookmark.id, { title: 'Updated' });
    expect(updated?.title).toBe('Updated');
  });

  it('should delete bookmark', async () => {
    const { bookmarkStorage } = await import('../utils/bookmarks');
    const bookmark = bookmarkStorage.addBookmark({ title: 'To Delete', url: 'https://test.com' });
    const deleted = bookmarkStorage.deleteBookmark(bookmark.id);
    expect(deleted).toBe(true);
    expect(bookmarkStorage.getBookmarks()).toHaveLength(0);
  });

  it('should support folders and tags', async () => {
    const { bookmarkStorage } = await import('../utils/bookmarks');
    const folder = bookmarkStorage.addFolder({ name: 'News', parentId: 'root' });
    expect(folder.name).toBe('News');
    expect(folder.id).toBeDefined();

    const folders = bookmarkStorage.getFolders();
    expect(folders.some(f => f.id === folder.id)).toBe(true);

    const bookmark = bookmarkStorage.addBookmark({
      title: 'Hacker News',
      url: 'https://news.ycombinator.com',
      folderId: folder.id,
      tags: ['tech', 'news'],
    });

    expect(bookmark.folderId).toBe(folder.id);
    expect(bookmark.tags).toEqual(['tech', 'news']);

    const techBookmarks = bookmarkStorage.getBookmarksByTag('tech');
    expect(techBookmarks).toHaveLength(1);
    expect(techBookmarks[0].id).toBe(bookmark.id);

    const allTags = bookmarkStorage.getAllTags();
    expect(allTags).toContain('tech');
    expect(allTags).toContain('news');
  });

  it('should support HTML import and export', async () => {
    const { bookmarkStorage } = await import('../utils/bookmarks');
    bookmarkStorage.addBookmark({ title: 'Google', url: 'https://google.com' });
    bookmarkStorage.addBookmark({ title: 'Bing', url: 'https://bing.com' });

    const html = bookmarkStorage.exportToHTML();
    expect(html).toContain('https://google.com');
    expect(html).toContain('Google');
    expect(html).toContain('https://bing.com');
    expect(html).toContain('Bing');

    // Clear bookmarks
    bookmarkStorage.setBookmarks([]);
    expect(bookmarkStorage.getBookmarks()).toHaveLength(0);

    // Re-import
    const count = bookmarkStorage.importFromHTML(html);
    expect(count).toBe(2);
    expect(bookmarkStorage.getBookmarks()).toHaveLength(2);
  });
});
