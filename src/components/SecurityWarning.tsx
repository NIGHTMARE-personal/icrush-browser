import React from 'react';

interface SecurityWarningProps {
  url: string;
  reason: string;
  onGoBack: () => void;
  onProceed: () => void;
}

export function SecurityWarning({ url, reason, onGoBack, onProceed }: SecurityWarningProps) {
  const displayHost = (() => {
    try {
      return new URL(url).hostname;
    } catch {
      return url;
    }
  })();

  const reasonTitle = reason === 'phishing' ? 'Deceptive Site Ahead' : 'Malware Threat Detected';
  const reasonText =
    reason === 'phishing'
      ? 'Attackers on this site might try to trick you into doing something dangerous like installing software or revealing your personal info (for example, passwords, phone numbers, or credit cards).'
      : 'This site contains malware. It might try to install dangerous apps or programs that steal or delete your personal info (for example, photos, passwords, messages, and credit cards).';

  return (
    <div
      className="security-warning-overlay"
      style={{
        width: '100%',
        height: '100%',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: '#07090e',
        position: 'relative',
        overflow: 'hidden',
        color: '#f8fafc',
        fontFamily: "'Inter', sans-serif",
      }}
    >
      {/* Ambient background crimson glow */}
      <div
        className="warning-glow"
        style={{
          position: 'absolute',
          width: '500px',
          height: '500px',
          borderRadius: '50%',
          background:
            'radial-gradient(circle, rgba(220, 38, 38, 0.15) 0%, rgba(220, 38, 38, 0) 70%)',
          top: '50%',
          left: '50%',
          transform: 'translate(-50%, -50%)',
          zIndex: 1,
          pointerEvents: 'none',
        }}
      />

      <div
        className="warning-card"
        style={{
          zIndex: 2,
          maxWidth: '560px',
          width: '90%',
          background: 'rgba(15, 23, 42, 0.65)',
          border: '1px solid rgba(220, 38, 38, 0.3)',
          borderRadius: '16px',
          padding: '40px',
          boxShadow: '0 20px 40px rgba(0, 0, 0, 0.5), inset 0 1px 0 rgba(255, 255, 255, 0.05)',
          backdropFilter: 'blur(12px)',
          textAlign: 'left',
        }}
      >
        {/* Warning Shield Icon (SVG) */}
        <div
          className="warning-icon-container"
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            width: '64px',
            height: '64px',
            borderRadius: '16px',
            background: 'rgba(220, 38, 38, 0.12)',
            color: '#ef4444',
            marginBottom: '28px',
            border: '1px solid rgba(220, 38, 38, 0.25)',
          }}
        >
          <svg
            width="32"
            height="32"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
            <line x1="12" y1="8" x2="12" y2="12" />
            <line x1="12" y1="16" x2="12.01" y2="16" />
          </svg>
        </div>

        <h1
          style={{
            fontSize: '26px',
            fontWeight: '700',
            marginBottom: '12px',
            color: '#f8fafc',
            letterSpacing: '-0.02em',
          }}
        >
          {reasonTitle}
        </h1>

        <p
          style={{
            fontSize: '14px',
            color: '#94a3b8',
            lineHeight: '1.6',
            marginBottom: '24px',
          }}
        >
          The website at{' '}
          <strong style={{ color: '#ef4444', wordBreak: 'break-all' }}>{displayHost}</strong> has
          been flagged as unsafe by ICRUSH Safe Browsing.
        </p>

        <div
          style={{
            padding: '16px',
            background: 'rgba(220, 38, 38, 0.05)',
            borderLeft: '4px solid #ef4444',
            borderRadius: '4px',
            marginBottom: '32px',
          }}
        >
          <p
            style={{
              fontSize: '13.5px',
              color: '#cbd5e1',
              lineHeight: '1.5',
              margin: 0,
            }}
          >
            {reasonText}
          </p>
        </div>

        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            flexWrap: 'wrap',
            gap: '16px',
          }}
        >
          {/* Proceed Link */}
          <button
            onClick={onProceed}
            style={{
              background: 'none',
              border: 'none',
              color: '#64748b',
              fontSize: '13px',
              textDecoration: 'underline',
              cursor: 'pointer',
              padding: '8px 0',
              transition: 'color 150ms ease',
            }}
            onMouseOver={e => (e.currentTarget.style.color = '#ef4444')}
            onMouseOut={e => (e.currentTarget.style.color = '#64748b')}
          >
            Proceed anyway (unsafe)
          </button>

          {/* Go Back button (CTA) */}
          <button
            onClick={onGoBack}
            className="btn-primary"
            style={{
              background: '#ef4444',
              color: '#ffffff',
              padding: '12px 24px',
              borderRadius: '8px',
              fontWeight: '600',
              fontSize: '14px',
              border: 'none',
              cursor: 'pointer',
              boxShadow: '0 4px 12px rgba(239, 68, 68, 0.25)',
              transition: 'all 200ms ease',
            }}
            onMouseOver={e => {
              e.currentTarget.style.background = '#dc2626';
              e.currentTarget.style.transform = 'translateY(-1px)';
            }}
            onMouseOut={e => {
              e.currentTarget.style.background = '#ef4444';
              e.currentTarget.style.transform = 'translateY(0)';
            }}
          >
            Back to Safety
          </button>
        </div>
      </div>
    </div>
  );
}
