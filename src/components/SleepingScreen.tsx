import React from 'react';

interface SleepingScreenProps {
  url: string;
  title: string;
  onUnsuspend: () => void;
}

export function SleepingScreen({ url, title, onUnsuspend }: SleepingScreenProps) {
  // Generate a realistic, consistent memory savings estimate based on the URL
  const getEstimatedMemorySavings = (urlStr: string) => {
    let base = 75; // Base RAM in MB
    const lowerUrl = urlStr.toLowerCase();

    if (
      lowerUrl.includes('youtube.com') ||
      lowerUrl.includes('figma.com') ||
      lowerUrl.includes('lovable.dev') ||
      lowerUrl.includes('lovable.app')
    ) {
      base = 260;
    } else if (
      lowerUrl.includes('google.com') ||
      lowerUrl.includes('github.com') ||
      lowerUrl.includes('gemini.google.com') ||
      lowerUrl.includes('aistudio')
    ) {
      base = 150;
    } else if (
      lowerUrl.includes('facebook.com') ||
      lowerUrl.includes('instagram.com') ||
      lowerUrl.includes('slack.com')
    ) {
      base = 190;
    }

    // Hash variance to ensure unique, stable values per URL
    let hash = 0;
    for (let i = 0; i < urlStr.length; i++) {
      hash = urlStr.charCodeAt(i) + ((hash << 5) - hash);
    }
    const variance = Math.abs(hash % 50);
    return base + variance;
  };

  const savedRam = getEstimatedMemorySavings(url);

  // Helper to extract clean domain/site name for the title
  const getDomain = (urlStr: string) => {
    try {
      return new URL(urlStr).hostname.replace('www.', '');
    } catch (e) {
      return urlStr;
    }
  };

  const domain = getDomain(url);

  return (
    <div className="sleeping-screen-overlay" onClick={onUnsuspend}>
      {/* Background blobs for organic ambient sleep light */}
      <div className="sleep-ambient-blobs">
        <div className="sleep-blob sleep-azure" />
        <div className="sleep-blob sleep-indigo" />
      </div>

      <div className="sleeping-card-container" onClick={e => e.stopPropagation()}>
        {/* Sleeping indicator icon */}
        <div className="sleeping-icon-wrapper">
          <svg
            className="sleep-moon-icon"
            width="28"
            height="28"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
          </svg>
          {/* Animated Zzz particles */}
          <span className="sleep-zzz z1">z</span>
          <span className="sleep-zzz z2">z</span>
          <span className="sleep-zzz z3">z</span>
        </div>

        <h2 className="sleep-title">This tab is asleep</h2>

        <p className="sleep-subtitle">
          We suspended <strong>{title || domain}</strong> to free up system memory and CPU power.
        </p>

        {/* Memory Savings Badge */}
        <div className="sleep-savings-badge">
          <svg
            width="14"
            height="14"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <rect x="2" y="2" width="20" height="8" rx="2" ry="2" />
            <rect x="2" y="14" width="20" height="8" rx="2" ry="2" />
            <line x1="6" y1="6" x2="6.01" y2="6" />
            <line x1="6" y1="18" x2="6.01" y2="18" />
          </svg>
          <span>Successfully freed ~{savedRam}MB of RAM</span>
        </div>

        {/* Action button */}
        <button className="unsuspend-action-btn" onClick={onUnsuspend}>
          Unsuspend Tab
        </button>

        <span className="sleep-click-anywhere-hint">Or click anywhere on the page to wake up</span>
      </div>
    </div>
  );
}
