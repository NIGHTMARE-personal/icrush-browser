import React from 'react';

interface BrandLogoProps {
  size?: number;
  className?: string;
  variant?: 'gold' | 'obsidian' | 'terracotta' | 'monochrome';
  showText?: boolean;
  subtitle?: string;
}

export function BrandLogo({
  size = 32,
  className = '',
  variant = 'gold',
  showText = false,
  subtitle = 'NIGHTMARE PROJECTS',
}: BrandLogoProps) {
  const isDark = (localStorage.getItem('homescreen-theme-mode') || 'deep-canvas') === 'deep-canvas';

  const primaryColor = variant === 'terracotta' ? '#C86D51' : variant === 'monochrome' ? (isDark ? '#fff' : '#000') : '#f2ca50';
  const secondaryColor = variant === 'terracotta' ? '#e28d73' : variant === 'monochrome' ? (isDark ? '#aaa' : '#444') : '#d4af37';
  const accentColor = variant === 'terracotta' ? '#f5efe6' : '#ffffff';

  return (
    <div
      className={`brand-logo-container ${className}`}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: '10px',
        userSelect: 'none',
      }}
    >
      <svg
        width={size}
        height={size}
        viewBox="0 0 48 48"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        style={{ flexShrink: 0 }}
      >
        <defs>
          {/* Radial Core Glow */}
          <radialGradient id="npCoreGlow" cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor={primaryColor} stopOpacity="0.45" />
            <stop offset="100%" stopColor={secondaryColor} stopOpacity="0" />
          </radialGradient>

          {/* Outer Prism Gradient */}
          <linearGradient id="npPrismGrad" x1="4" y1="4" x2="44" y2="44" gradientUnits="userSpaceOnUse">
            <stop offset="0%" stopColor={primaryColor} />
            <stop offset="50%" stopColor={secondaryColor} />
            <stop offset="100%" stopColor="#8a691e" />
          </linearGradient>

          {/* Inner Wing Gradients */}
          <linearGradient id="npWingLeft" x1="8" y1="12" x2="24" y2="36" gradientUnits="userSpaceOnUse">
            <stop offset="0%" stopColor={primaryColor} stopOpacity="0.85" />
            <stop offset="100%" stopColor={secondaryColor} stopOpacity="0.3" />
          </linearGradient>

          <linearGradient id="npWingRight" x1="40" y1="12" x2="24" y2="36" gradientUnits="userSpaceOnUse">
            <stop offset="0%" stopColor={accentColor} stopOpacity="0.9" />
            <stop offset="100%" stopColor={secondaryColor} stopOpacity="0.4" />
          </linearGradient>
        </defs>

        {/* Ambient Core Aura */}
        <circle cx="24" cy="24" r="20" fill="url(#npCoreGlow)" />

        {/* Outer Hexagonal Sovereign Crest */}
        <polygon
          points="24,3 43,14 43,34 24,45 5,34 5,14"
          stroke="url(#npPrismGrad)"
          strokeWidth="2.2"
          strokeLinejoin="round"
          fill="rgba(14, 14, 20, 0.4)"
        />

        {/* Kinetic Orbital Ring */}
        <ellipse
          cx="24"
          cy="24"
          rx="18"
          ry="7"
          transform="rotate(-25 24 24)"
          stroke={primaryColor}
          strokeWidth="1.2"
          strokeDasharray="4 3"
          strokeOpacity="0.7"
        />

        {/* Faceted Monogram Wings (N & Infinity Dynamic) */}
        <path
          d="M13 33V15L24 27V15"
          stroke="url(#npWingLeft)"
          strokeWidth="2.8"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <path
          d="M24 33V21L35 33V15"
          stroke="url(#npWingRight)"
          strokeWidth="2.8"
          strokeLinecap="round"
          strokeLinejoin="round"
        />

        {/* Central Radiant Neural Star Singularity */}
        <path
          d="M24 16c0 3.5-3 6.5-6.5 6.5 3.5 0 6.5 3 6.5 6.5 0-3.5 3-6.5 6.5-6.5-3.5 0-6.5-3-6.5-6.5z"
          fill={accentColor}
          opacity="0.95"
        />

        {/* Micro Singularity Sparkles */}
        <circle cx="24" cy="24" r="1.5" fill="#ffffff" />
        <circle cx="10" cy="14" r="1.2" fill={primaryColor} />
        <circle cx="38" cy="34" r="1.2" fill={primaryColor} />
      </svg>

      {showText && (
        <div style={{ display: 'flex', flexDirection: 'column' }}>
          <span
            style={{
              fontFamily: 'serif',
              fontSize: `${Math.max(13, size * 0.44)}px`,
              fontWeight: '700',
              letterSpacing: '0.04em',
              lineHeight: 1.1,
              color: isDark ? '#f9f6f0' : '#1a1715',
            }}
          >
            ICRUSH
          </span>
          <span
            style={{
              fontSize: `${Math.max(9, size * 0.26)}px`,
              fontWeight: '800',
              letterSpacing: '0.22em',
              textTransform: 'uppercase',
              color: primaryColor,
              marginTop: '1px',
            }}
          >
            {subtitle}
          </span>
        </div>
      )}
    </div>
  );
}
