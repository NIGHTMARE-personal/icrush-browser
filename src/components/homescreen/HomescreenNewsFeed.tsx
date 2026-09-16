import React, { useState, useCallback } from 'react';

interface NewsItem {
  id: string;
  title: string;
  source: string;
  url: string;
  timeAgo: string;
  category: 'tech' | 'ai' | 'finance' | 'world';
}

type Category = NewsItem['category'];

const NEWS_DATA: NewsItem[] = [
  { id: 't1', title: 'Apple Vision Pro 2 reportedly in mass production with slimmer design', source: 'The Verge', url: 'https://www.theverge.com', timeAgo: '12m', category: 'tech' },
  { id: 't2', title: 'Qualcomm Snapdragon X Elite laptops dominate Q3 sales charts', source: 'Ars Technica', url: 'https://arstechnica.com', timeAgo: '34m', category: 'tech' },
  { id: 't3', title: 'Firefox 140 ships with major performance overhaul for JavaScript engine', source: 'Mozilla Blog', url: 'https://blog.mozilla.org', timeAgo: '1h', category: 'tech' },
  { id: 't4', title: 'Steam Deck 2 leaks reveal 120Hz OLED and double the battery life', source: 'PC Gamer', url: 'https://www.pcgamer.com', timeAgo: '2h', category: 'tech' },
  { id: 't5', title: 'Linux 7.0 kernel merges native Rust driver support for GPU modules', source: 'Phoronix', url: 'https://www.phoronix.com', timeAgo: '3h', category: 'tech' },
  { id: 't6', title: 'React 20 introduces zero-bundle streaming server components', source: 'React Blog', url: 'https://react.dev/blog', timeAgo: '4h', category: 'tech' },

  { id: 'a1', title: 'OpenAI announces GPT-5 with real-time reasoning and 1M token context', source: 'TechCrunch', url: 'https://techcrunch.com', timeAgo: '18m', category: 'ai' },
  { id: 'a2', title: 'DeepMind solves new protein folding benchmark with 99.8% accuracy', source: 'Nature', url: 'https://www.nature.com', timeAgo: '45m', category: 'ai' },
  { id: 'a3', title: 'Anthropic releases Claude Agent Framework for autonomous tool use', source: 'VentureBeat', url: 'https://venturebeat.com', timeAgo: '1h', category: 'ai' },
  { id: 'a4', title: 'Stable Diffusion 5 generates photorealistic video from a single image', source: 'MIT Tech Review', url: 'https://www.technologyreview.com', timeAgo: '2h', category: 'ai' },
  { id: 'a5', title: 'EU passes AI Act enforcement framework with fines up to 7% of revenue', source: 'Reuters', url: 'https://www.reuters.com', timeAgo: '3h', category: 'ai' },
  { id: 'a6', title: 'Meta releases open-source multimodal model rivaling GPT-5 benchmarks', source: 'AI News', url: 'https://www.artificialintelligence-news.com', timeAgo: '5h', category: 'ai' },

  { id: 'f1', title: 'Fed signals rate pause as inflation cools to 2.3% in latest CPI report', source: 'Bloomberg', url: 'https://www.bloomberg.com', timeAgo: '25m', category: 'finance' },
  { id: 'f2', title: 'Bitcoin breaks $125,000 following institutional ETF inflow record week', source: 'CoinDesk', url: 'https://www.coindesk.com', timeAgo: '1h', category: 'finance' },
  { id: 'f3', title: 'S&P 500 hits all-time high as tech earnings beat expectations across board', source: 'CNBC', url: 'https://www.cnbc.com', timeAgo: '2h', category: 'finance' },
  { id: 'f4', title: 'Toyota announces $30B investment in solid-state battery manufacturing', source: 'Financial Times', url: 'https://www.ft.com', timeAgo: '3h', category: 'finance' },
  { id: 'f5', title: 'India surpasses Japan as third-largest economy by nominal GDP', source: 'The Economist', url: 'https://www.economist.com', timeAgo: '4h', category: 'finance' },
  { id: 'f6', title: 'NVIDIA market cap briefly touches $5 trillion on AI chip demand surge', source: 'MarketWatch', url: 'https://www.marketwatch.com', timeAgo: '6h', category: 'finance' },

  { id: 'w1', title: 'UN Security Council votes unanimously on Gaza ceasefire framework', source: 'BBC News', url: 'https://www.bbc.com', timeAgo: '15m', category: 'world' },
  { id: 'w2', title: 'Japan and South Korea announce joint semiconductor supply chain pact', source: 'NHK World', url: 'https://www3.nhk.or.jp/nhkworld', timeAgo: '1h', category: 'world' },
  { id: 'w3', title: 'Brazil leads Amazon reforestation initiative with $5B international fund', source: 'Al Jazeera', url: 'https://www.aljazeera.com', timeAgo: '2h', category: 'world' },
  { id: 'w4', title: 'SpaceX Starship completes first orbital flight to Mars staging orbit', source: 'Space.com', url: 'https://www.space.com', timeAgo: '3h', category: 'world' },
  { id: 'w5', title: 'WHO declares end to mpox global health emergency after vaccination push', source: 'The Guardian', url: 'https://www.theguardian.com', timeAgo: '5h', category: 'world' },
  { id: 'w6', title: 'European Parliament approves sweeping digital identity regulation', source: 'Politico Europe', url: 'https://www.politico.eu', timeAgo: '7h', category: 'world' },
];

const CATEGORY_LABELS: Record<Category, string> = {
  tech: 'Tech',
  ai: 'AI & ML',
  finance: 'Finance',
  world: 'World',
};

const CATEGORY_ORDER: Category[] = ['tech', 'ai', 'finance', 'world'];

interface HomescreenNewsFeedProps {
  onNavigate?: (url: string) => void;
}

export function HomescreenNewsFeed({ onNavigate }: HomescreenNewsFeedProps) {
  const [activeTab, setActiveTab] = useState<Category>('tech');

  const handleTabChange = useCallback((tab: Category) => {
    setActiveTab(tab);
  }, []);

  const handleItemClick = useCallback(
    (url: string) => {
      if (onNavigate) {
        onNavigate(url);
      } else {
        window.open(url, '_blank');
      }
    },
    [onNavigate]
  );

  const filteredNews = NEWS_DATA.filter((item) => item.category === activeTab);

  return (
    <div className="homescreen-newsfeed">
      <div className="newsfeed-header">
        <span className="newsfeed-header-title">Headlines</span>
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
        {filteredNews.map((item) => (
          <button
            key={item.id}
            className="newsfeed-item"
            onClick={() => handleItemClick(item.url)}
          >
            <div className="newsfeed-item-title">{item.title}</div>
            <div className="newsfeed-item-meta">
              <span className="newsfeed-item-source">{item.source}</span>
              <span className="newsfeed-item-time">{item.timeAgo} ago</span>
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
          margin-bottom: 16px;
        }

        .newsfeed-header-title {
          font-size: 14px;
          font-weight: 600;
          letter-spacing: 0.5px;
          color: #f4f0ea;
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
