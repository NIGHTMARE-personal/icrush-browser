import React, { useState } from 'react';

interface IncognitoHomescreenProps {
  onNavigate: (url: string) => void;
  onCreateTab?: () => void;
}

export function IncognitoHomescreen({ onNavigate }: IncognitoHomescreenProps) {
  const [searchValue, setSearchValue] = useState('');

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!searchValue.trim()) return;

    let targetUrl = searchValue.trim();
    const isDomain = targetUrl.includes('.') && !targetUrl.includes(' ') && !targetUrl.startsWith('http');
    const isUrl = targetUrl.startsWith('http://') || targetUrl.startsWith('https://') || targetUrl.startsWith('file:///');

    if (!isUrl) {
      if (isDomain) {
        targetUrl = 'https://' + targetUrl;
      } else {
        targetUrl = `https://duckduckgo.com/?q=${encodeURIComponent(targetUrl)}`;
      }
    }
    onNavigate(targetUrl);
  };

  return (
    <div className="incognito-homescreen-container">
      <div className="incognito-ambient-glow" />
      <div className="incognito-content-card">
        {/* Luxury Glowing Wings/Eye Logo */}
        <div className="incognito-logo-wrapper animate-pulse-subtle">
          <svg
            width="64"
            height="64"
            viewBox="0 0 24 24"
            fill="none"
            stroke="url(#incognito-gold-grad)"
            strokeWidth="1.5"
            strokeLinecap="round"
            strokeLinejoin="round"
            className="incognito-svg-icon"
          >
            <defs>
              <linearGradient id="incognito-gold-grad" x1="0%" y1="0%" x2="100%" y2="100%">
                <stop offset="0%" stopColor="#ffd700" />
                <stop offset="50%" stopColor="#d4af37" />
                <stop offset="100%" stopColor="#aa7c11" />
              </linearGradient>
              <linearGradient id="incognito-purple-grad" x1="0%" y1="0%" x2="100%" y2="100%">
                <stop offset="0%" stopColor="#c084fc" />
                <stop offset="100%" stopColor="#6366f1" />
              </linearGradient>
            </defs>
            <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
            <path d="M8 11a2 2 0 1 0 0-4 2 2 0 0 0 0 4z" />
            <path d="M16 11a2 2 0 1 0 0-4 2 2 0 0 0 0 4z" />
            <path d="M9.5 9h5" />
          </svg>
        </div>

        <h1 className="incognito-title">You've gone Incognito</h1>
        <p className="incognito-subtitle">
          Now you can browse privately, and other people who use this device won't see your activity.
        </p>

        {/* Private Search Console */}
        <form onSubmit={handleSearchSubmit} className="incognito-search-form">
          <div className="incognito-search-box-wrapper">
            <svg
              className="incognito-search-icon"
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <circle cx="11" cy="11" r="8" />
              <line x1="21" y1="21" x2="16.65" y2="16.65" />
            </svg>
            <input
              type="text"
              placeholder="Search privately on DuckDuckGo or enter URL..."
              value={searchValue}
              onChange={e => setSearchValue(e.target.value)}
              className="incognito-search-input"
            />
            <button type="submit" className="incognito-search-btn">
              Go
            </button>
          </div>
        </form>

        {/* Split details layout */}
        <div className="incognito-details-grid">
          <div className="incognito-detail-column">
            <div className="incognito-column-header">
              <span className="dot dot-red" />
              <h3>What Incognito does NOT save</h3>
            </div>
            <ul>
              <li>
                <span className="bullet-icon">✕</span> Your browsing history in this window
              </li>
              <li>
                <span className="bullet-icon">✕</span> Cookies and site data from visited sites
              </li>
              <li>
                <span className="bullet-icon">✕</span> Information entered in forms (autocomplete)
              </li>
              <li>
                <span className="bullet-icon">✕</span> Sync activity back to the cloud/database
              </li>
            </ul>
          </div>

          <div className="incognito-detail-column">
            <div className="incognito-column-header">
              <span className="dot dot-green" />
              <h3>What remains visible or saved</h3>
            </div>
            <ul>
              <li>
                <span className="bullet-icon">✓</span> Bookmarks you manually add
              </li>
              <li>
                <span className="bullet-icon">✓</span> Files you explicitly download (saved locally)
              </li>
              <li>
                <span className="bullet-icon">✓</span> Your activity might still be visible to websites you visit
              </li>
              <li>
                <span className="bullet-icon">✓</span> Your employer, school, or internet service provider (ISP)
              </li>
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
}
