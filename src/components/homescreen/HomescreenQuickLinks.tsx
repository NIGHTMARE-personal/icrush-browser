import React, { useState, useEffect, useCallback } from 'react';
import { PromptModal } from '../PromptModal';

interface QuickLink {
  name: string;
  url: string;
}

interface Bookmark {
  name?: string;
  title?: string;
  url: string;
}

interface HomescreenQuickLinksProps {
  onNavigate: (url: string) => void;
  onCreateTab?: (url: string) => void;
}

const DEFAULT_LINKS: QuickLink[] = [
  { name: 'Google', url: 'https://www.google.com' },
  { name: 'YouTube', url: 'https://www.youtube.com' },
  { name: 'GitHub', url: 'https://github.com' },
  { name: 'Gmail', url: 'https://mail.google.com' },
  { name: 'Calendar', url: 'https://calendar.google.com' },
  { name: 'Docs', url: 'https://docs.google.com' },
  { name: 'Drive', url: 'https://drive.google.com' },
  { name: 'Slack', url: 'https://slack.com' },
];

function getDomain(url: string): string {
  try {
    const parsed = new URL(url);
    return parsed.hostname;
  } catch {
    return url;
  }
}

function getLetter(name: string): string {
  return ((name && name.charAt(0)) || '?').toUpperCase();
}

function getFaviconUrl(url: string): string {
  const domain = getDomain(url);
  return `https://www.google.com/s2/favicons?sz=64&domain=${domain}`;
}

export function HomescreenQuickLinks({ onNavigate, onCreateTab }: HomescreenQuickLinksProps) {
  const [links, setLinks] = useState<QuickLink[]>(DEFAULT_LINKS);
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; link: QuickLink } | null>(null);
  const [failingFavicons, setFailingFavicons] = useState<Set<string>>(new Set());
  const [addPromptOpen, setAddPromptOpen] = useState(false);
  const [addPromptValue, setAddPromptValue] = useState('');

  const handleAddPromptConfirm = useCallback((url: string) => {
    let finalUrl = url;
    if (!url.startsWith('http://') && !url.startsWith('https://')) {
      finalUrl = 'https://' + url;
    }
    const name = getDomain(finalUrl);
    setLinks(prev => {
      if (prev.some(l => l.url === finalUrl)) return prev;
      return [...prev, { name, url: finalUrl }];
    });
  }, []);

  const handleAdd = useCallback(() => {
    setAddPromptValue('');
    setAddPromptOpen(true);
  }, []);

  const handleAddPromptClose = useCallback(() => {
    setAddPromptOpen(false);
  }, []);

  useEffect(() => {
    const loadLinks = async () => {
      const allLinks: QuickLink[] = [];
      const seen = new Set<string>();

      try {
        if (window.electronAPI?.db?.getBookmarks) {
          const bookmarks: Bookmark[] = await window.electronAPI.db.getBookmarks();
          for (const bm of bookmarks) {
            if (bm.url && !seen.has(bm.url)) {
              seen.add(bm.url);
              allLinks.push({ name: bm.name || bm.title || getDomain(bm.url), url: bm.url });
            }
          }
        }
      } catch {
        // ignore
      }

      try {
        const stored = localStorage.getItem('gemini-browser-frequent-sites');
        if (stored) {
          const frequent: QuickLink[] = JSON.parse(stored);
          for (const fs of frequent) {
            if (fs.url && !seen.has(fs.url)) {
              seen.add(fs.url);
              allLinks.push({ name: fs.name || getDomain(fs.url), url: fs.url });
            }
          }
        }
      } catch {
        // ignore
      }

      if (allLinks.length > 0) {
        setLinks(allLinks.slice(0, 12));
      }
    };

    loadLinks();
  }, []);

  useEffect(() => {
    if (contextMenu) {
      const close = () => setContextMenu(null);
      window.addEventListener('click', close);
      window.addEventListener('contextmenu', close);
      return () => {
        window.removeEventListener('click', close);
        window.removeEventListener('contextmenu', close);
      };
    }
  }, [contextMenu]);

  const handleContextMenu = useCallback((e: React.MouseEvent, link: QuickLink) => {
    e.preventDefault();
    setContextMenu({ x: e.clientX, y: e.clientY, link });
  }, []);

  const handleFaviconError = useCallback((url: string) => {
    setFailingFavicons(prev => {
      const next = new Set(prev);
      next.add(url);
      return next;
    });
  }, []);

  const handleNewTab = useCallback(() => {
    if (contextMenu && onCreateTab) {
      onCreateTab(contextMenu.link.url);
    }
    setContextMenu(null);
  }, [contextMenu, onCreateTab]);

  const handleCopyUrl = useCallback(() => {
    if (contextMenu) {
      navigator.clipboard.writeText(contextMenu.link.url).catch(() => {});
    }
    setContextMenu(null);
  }, [contextMenu]);

  const handleRemove = useCallback(() => {
    if (contextMenu) {
      setLinks(prev => prev.filter(l => l.url !== contextMenu.link.url));
    }
    setContextMenu(null);
  }, [contextMenu]);

  return (
    <div className="homescreen-quicklinks">
      <div className="quicklinks-row">
        {links.map((link) => (
          <div
            key={link.url}
            className="quicklink-item"
            onClick={() => onNavigate(link.url)}
            onContextMenu={(e) => handleContextMenu(e, link)}
            title={link.name}
          >
            <div className="quicklink-favicon">
              {failingFavicons.has(link.url) ? (
                <span>{getLetter(link.name)}</span>
              ) : (
                <img
                  src={getFaviconUrl(link.url)}
                  alt=""
                  onError={() => handleFaviconError(link.url)}
                />
              )}
            </div>
            <span className="quicklink-name">{link.name}</span>
          </div>
        ))}
        <div className="quicklink-item" onClick={handleAdd} title="Add quick link">
          <div className="quicklink-add-btn">
            <span>+</span>
          </div>
          <span className="quicklink-name">Add</span>
        </div>
      </div>
      {contextMenu && (
        <div
          style={{ position: 'fixed', top: contextMenu.y, left: contextMenu.x, zIndex: 9999 }}
          onClick={(e) => e.stopPropagation()}
          onContextMenu={(e) => e.stopPropagation()}
        >
          {onCreateTab && (
            <div
              style={{ padding: '6px 16px', background: '#1a1a1a', color: '#fff', cursor: 'pointer', borderBottom: '1px solid rgba(255,255,255,0.08)' }}
              onClick={handleNewTab}
            >
              Open in New Tab
            </div>
          )}
          <div
            style={{ padding: '6px 16px', background: '#1a1a1a', color: '#fff', cursor: 'pointer', borderBottom: '1px solid rgba(255,255,255,0.08)' }}
            onClick={handleCopyUrl}
          >
            Copy URL
          </div>
          <div
            style={{ padding: '6px 16px', background: '#1a1a1a', color: '#ff5555', cursor: 'pointer' }}
            onClick={handleRemove}
          >
            Remove
          </div>
        </div>
      )}
      <PromptModal
        isOpen={addPromptOpen}
        onClose={handleAddPromptClose}
        onConfirm={handleAddPromptConfirm}
        title="Add Quick Link"
        message="Enter the website URL to add to your quick links"
        placeholder="https://example.com"
        defaultValue={addPromptValue}
        type="url"
      />
    </div>
  );
}
