import React, { useState, useCallback, useEffect, useRef } from 'react';

interface NewsItem {
  id: string;
  title: string;
  source: string;
  url: string;
  timeAgo: string;
  category: 'tech' | 'ai' | 'finance' | 'world';
}

type Category = NewsItem['category'];

const CATEGORY_LABELS: Record<Category, string> = {
  tech: 'Tech',
  ai: 'AI & ML',
  finance: 'Finance',
  world: 'World',
};

const CATEGORY_ORDER: Category[] = ['tech', 'ai', 'finance', 'world'];

const FALLBACK_NEWS: Record<Category, NewsItem[]> = {
  tech: [
    { id: 't1', title: 'Loading tech news...', source: '', url: '', timeAgo: '', category: 'tech' },
  ],
  ai: [
    { id: 'a1', title: 'Loading AI news...', source: '', url: '', timeAgo: '', category: 'ai' },
  ],
  finance: [
    { id: 'f1', title: 'Loading finance news...', source: '', url: '', timeAgo: '', category: 'finance' },
  ],
  world: [
    { id: 'w1', title: 'Loading world news...', source: '', url: '', timeAgo: '', category: 'world' },
  ],
};

interface HomescreenNewsFeedProps {
  onNavigate?: (url: string) => void;
}

export function HomescreenNewsFeed({ onNavigate }: HomescreenNewsFeedProps) {
  const [activeTab, setActiveTab] = useState<Category>('tech');
  const [news, setNews] = useState<Record<Category, NewsItem[]>>(FALLBACK_NEWS);
  const [loading, setLoading] = useState<Record<Category, boolean>>({
    tech: false, ai: false, finance: false, world: false,
  });
  const fetchedRef = useRef<Set<Category>>(new Set());

  const fetchFeed = useCallback(async (category: Category) => {
    if (fetchedRef.current.has(category)) return;
    fetchedRef.current.add(category);

    setLoading(prev => ({ ...prev, [category]: true }));
    try {
      const items = await window.electronAPI.news.fetchFeed(category);
      if (items && items.length > 0) {
        setNews(prev => ({ ...prev, [category]: items as NewsItem[] }));
      }
    } catch {
      // Keep fallback data
    } finally {
      setLoading(prev => ({ ...prev, [category]: false }));
    }
  }, []);

  // Fetch on mount for the active tab
  useEffect(() => {
    fetchFeed(activeTab);
  }, [activeTab, fetchFeed]);

  const handleTabChange = useCallback((tab: Category) => {
    setActiveTab(tab);
  }, []);

  const handleItemClick = useCallback(
    (url: string) => {
      if (!url) return;
      if (onNavigate) {
        onNavigate(url);
      } else {
        window.open(url, '_blank');
      }
    },
    [onNavigate]
  );

  const handleRefresh = useCallback(() => {
    fetchedRef.current.delete(activeTab);
    fetchFeed(activeTab);
  }, [activeTab, fetchFeed]);

  const filteredNews = news[activeTab] || [];
  const isLoading = loading[activeTab];

  return (
    <div className="homescreen-newsfeed">
      <div className="newsfeed-header">
        <span className="newsfeed-header-title">Headlines</span>
        <button
          className="newsfeed-refresh"
          onClick={handleRefresh}
          disabled={isLoading}
          title="Refresh feed"
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ transform: isLoading ? 'spin 1s linear infinite' : 'none' }}>
            <polyline points="23 4 23 10 17 10" />
            <path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10" />
          </svg>
        </button>
      </div>
      <div className="newsfeed-tabs">
        {CATEGORY_ORDER.map((cat) => (
          <button
            key={cat}
            className={`newsfeed-tab ${activeTab === cat ? 'active' : ''}`}
            onClick={() => handleTabChange(cat)}
          >
            {CATEGORY_LABELS[cat]}
          </button>
        ))}
      </div>
      <div className="newsfeed-list">
        {filteredNews.length === 0 && !isLoading && (
          <div className="newsfeed-empty">No articles found</div>
        )}
        {filteredNews.map((item) => (
          <button
            key={item.id}
            className="newsfeed-item"
            onClick={() => handleItemClick(item.url)}
            disabled={!item.url}
          >
            <div className="newsfeed-item-title">{item.title}</div>
            <div className="newsfeed-item-meta">
              {item.source && <span className="newsfeed-item-source">{item.source}</span>}
              {item.timeAgo && <span className="newsfeed-item-time">{item.timeAgo} ago</span>}
            </div>
          </button>
        ))}
      </div>
      <style>{`
        .homescreen-newsfeed {
          background: rgba(15, 15, 18, 0.55);
          backdrop-filter: blur(20px);
          -webkit-backdrop-filter: blur(20px);
          border: 1px solid rgba(255, 255, 255, 0.05);
          border-radius: 16px;
          padding: 20px;
          color: #f4f0ea;
          max-height: 320px;
          overflow-y: auto;
        }

        .homescreen-newsfeed::-webkit-scrollbar {
          width: 4px;
        }

        .homescreen-newsfeed::-webkit-scrollbar-track {
          background: transparent;
        }

        .homescreen-newsfeed::-webkit-scrollbar-thumb {
          background: rgba(255, 255, 255, 0.1);
          border-radius: 2px;
        }

        .newsfeed-header {
          display: flex;
          align-items: center;
          justify-content: space-between;
          margin-bottom: 16px;
        }

        .newsfeed-header-title {
          font-size: 14px;
          font-weight: 600;
          letter-spacing: 0.5px;
          color: #f4f0ea;
        }

        .newsfeed-refresh {
          background: none;
          border: none;
          color: #94a3b8;
          cursor: pointer;
          padding: 4px;
          border-radius: 4px;
          display: flex;
          align-items: center;
          justify-content: center;
          transition: color 0.15s, background 0.15s;
        }

        .newsfeed-refresh:hover {
          color: #f4f0ea;
          background: rgba(255, 255, 255, 0.06);
        }

        .newsfeed-refresh:disabled {
          opacity: 0.5;
          cursor: not-allowed;
        }

        @keyframes spin {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }

        .newsfeed-tabs {
          display: flex;
          gap: 4px;
          margin-bottom: 16px;
        }

        .newsfeed-tab {
          padding: 6px 14px;
          border-radius: 20px;
          font-size: 12px;
          font-weight: 500;
          color: #94a3b8;
          background: transparent;
          border: none;
          cursor: pointer;
          transition: color 0.2s, background 0.2s;
          position: relative;
        }

        .newsfeed-tab:hover {
          color: #f4f0ea;
          background: rgba(255, 255, 255, 0.05);
        }

        .newsfeed-tab.active {
          color: #f4f0ea;
          background: rgba(255, 255, 255, 0.08);
        }

        .newsfeed-tab.active::after {
          content: '';
          position: absolute;
          bottom: -8px;
          left: 50%;
          transform: translateX(-50%);
          width: 16px;
          height: 2px;
          background: #d4af37;
          border-radius: 1px;
        }

        .newsfeed-list {
          display: flex;
          flex-direction: column;
        }

        .newsfeed-empty {
          text-align: center;
          padding: 20px;
          color: #94a3b8;
          font-size: 12px;
        }

        .newsfeed-item {
          display: flex;
          flex-direction: column;
          gap: 6px;
          padding: 10px 0;
          border-bottom: 1px solid rgba(255, 255, 255, 0.04);
          background: none;
          border-left: none;
          border-right: none;
          border-top: none;
          cursor: pointer;
          text-align: left;
          width: 100%;
          color: #f4f0ea;
          transition: background 0.15s;
          border-radius: 6px;
        }

        .newsfeed-item:last-child {
          border-bottom: none;
        }

        .newsfeed-item:hover {
          background: rgba(255, 255, 255, 0.03);
        }

        .newsfeed-item:disabled {
          cursor: default;
        }

        .newsfeed-item-title {
          font-size: 13px;
          font-weight: 500;
          line-height: 1.4;
          color: #f4f0ea;
          display: -webkit-box;
          -webkit-line-clamp: 2;
          -webkit-box-orient: vertical;
          overflow: hidden;
        }

        .newsfeed-item-meta {
          display: flex;
          align-items: center;
          gap: 8px;
        }

        .newsfeed-item-source {
          font-size: 10px;
          font-weight: 600;
          padding: 2px 6px;
          background: rgba(212, 175, 55, 0.15);
          color: #d4af37;
          border-radius: 4px;
          letter-spacing: 0.3px;
        }

        .newsfeed-item-time {
          font-size: 11px;
          color: #94a3b8;
        }
      `}</style>
    </div>
  );
}
