export interface Bookmark {
  id: string;
  title: string;
  url: string;
  folderId?: string;
  tags?: string[];
  createdAt: number;
  updatedAt: number;
}

export interface BookmarkFolder {
  id: string;
  name: string;
  parentId?: string;
  createdAt: number;
  children?: BookmarkFolder[];
}

const BOOKMARKS_KEY = 'gemini-browser-bookmarks';
const BOOKMARK_FOLDERS_KEY = 'gemini-browser-bookmark-folders';

export const bookmarkStorage = {
  getBookmarks: (): Bookmark[] => {
    try {
      const data = localStorage.getItem(BOOKMARKS_KEY);
      return data ? JSON.parse(data) : [];
    } catch (e) {
      console.error('Failed to load bookmarks:', e);
      return [];
    }
  },

  setBookmarks: (bookmarks: Bookmark[]): void => {
    try {
      localStorage.setItem(BOOKMARKS_KEY, JSON.stringify(bookmarks));
    } catch (e) {
      console.error('Failed to save bookmarks:', e);
    }
  },

  addBookmark: (bookmark: Omit<Bookmark, 'id' | 'createdAt' | 'updatedAt'>): Bookmark => {
    const bookmarks = bookmarkStorage.getBookmarks();
    const newBookmark: Bookmark = {
      ...bookmark,
      id: crypto.randomUUID(),
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };
    bookmarkStorage.setBookmarks([newBookmark, ...bookmarks]);
    if (window.electronAPI?.db?.addBookmark) {
      window.electronAPI.db.addBookmark({
        id: newBookmark.id,
        url: newBookmark.url,
        title: newBookmark.title,
        folderId: newBookmark.folderId,
        createdAt: newBookmark.createdAt,
        updatedAt: newBookmark.updatedAt,
      }).catch(console.error);
    }
    return newBookmark;
  },

  updateBookmark: (id: string, updates: Partial<Bookmark>): Bookmark | null => {
    const bookmarks = bookmarkStorage.getBookmarks();
    const index = bookmarks.findIndex(b => b.id === id);
    if (index === -1) return null;
    const updated = { ...bookmarks[index], ...updates, updatedAt: Date.now() };
    bookmarks[index] = updated;
    bookmarkStorage.setBookmarks(bookmarks);
    // Secure DB doesn't have update-bookmark, but we can delete and re-add if needed,
    // though update is rarely called and mostly handled in state/sync.
    return updated;
  },

  deleteBookmark: (id: string): boolean => {
    const bookmarks = bookmarkStorage.getBookmarks();
    const filtered = bookmarks.filter(b => b.id !== id);
    if (filtered.length === bookmarks.length) return false;
    bookmarkStorage.setBookmarks(filtered);
    if (window.electronAPI?.db?.deleteBookmark) {
      window.electronAPI.db.deleteBookmark(id).catch(console.error);
    }
    return true;
  },

  getFolders: (): BookmarkFolder[] => {
    try {
      const data = localStorage.getItem(BOOKMARK_FOLDERS_KEY);
      return data
        ? JSON.parse(data)
        : [{ id: 'root', name: 'Bookmarks Bar', createdAt: Date.now() }];
    } catch (e) {
      console.error('Failed to load bookmark folders:', e);
      return [{ id: 'root', name: 'Bookmarks Bar', createdAt: Date.now() }];
    }
  },

  setFolders: (folders: BookmarkFolder[]): void => {
    try {
      localStorage.setItem(BOOKMARK_FOLDERS_KEY, JSON.stringify(folders));
    } catch (e) {
      console.error('Failed to save bookmark folders:', e);
    }
  },

  addFolder: (folder: Omit<BookmarkFolder, 'id' | 'createdAt'>): BookmarkFolder => {
    const folders = bookmarkStorage.getFolders();
    const newFolder: BookmarkFolder = {
      ...folder,
      id: crypto.randomUUID(),
      createdAt: Date.now(),
    };
    bookmarkStorage.setFolders([...folders, newFolder]);
    return newFolder;
  },

  importFromHTML: (html: string): number => {
    const parser = new DOMParser();
    const doc = parser.parseFromString(html, 'text/html');
    const links = doc.querySelectorAll('a');
    let count = 0;

    links.forEach(link => {
      const url = link.href;
      const title = link.textContent?.trim() || url;
      if (url && url.startsWith('http')) {
        bookmarkStorage.addBookmark({ title, url });
        count++;
      }
    });

    return count;
  },

  exportToHTML: (): string => {
    const bookmarks = bookmarkStorage.getBookmarks();
    const folders = bookmarkStorage.getFolders();
    let html = `<!DOCTYPE NETSCAPE-Bookmark-file-1>
<META HTTP-EQUIV="Content-Type" CONTENT="text/html; charset=UTF-8">
<TITLE>Bookmarks</TITLE>
<H1>Bookmarks</H1>
<DL><p>`;

    folders.forEach(folder => {
      if (folder.id !== 'root') {
        html += `<DT><H3>${folder.name}</H3>\n<DL><p>\n`;
        bookmarks
          .filter(b => b.folderId === folder.id)
          .forEach(b => {
            html += `<DT><A HREF="${b.url}" ADD_DATE="${Math.floor(b.createdAt / 1000)}">${b.title}</A>\n`;
          });
        html += `</DL><p>\n`;
      }
    });

    // Root level bookmarks
    const rootBookmarks = bookmarks.filter(b => !b.folderId || b.folderId === 'root');
    if (rootBookmarks.length > 0) {
      rootBookmarks.forEach(b => {
        html += `<DT><A HREF="${b.url}" ADD_DATE="${Math.floor(b.createdAt / 1000)}">${b.title}</A>\n`;
      });
    }

    html += `</DL><p>`;
    return html;
  },

  getBookmarksByTag: (tag: string): Bookmark[] => {
    return bookmarkStorage.getBookmarks().filter(b => b.tags?.includes(tag));
  },

  getAllTags: (): string[] => {
    const tags = new Set<string>();
    bookmarkStorage.getBookmarks().forEach(b => {
      b.tags?.forEach(t => tags.add(t));
    });
    return Array.from(tags);
  },
};
