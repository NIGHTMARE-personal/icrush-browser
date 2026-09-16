import React, { useState, useEffect, useRef, useCallback } from 'react';

interface TorButtonProps {
  torMode: boolean;
  onToggle: (enabled: boolean) => void;
  onOpenManager: () => void;
  onCreateIncognitoTab?: () => void;
}

export function TorButton({ torMode, onToggle, onOpenManager, onCreateIncognitoTab }: TorButtonProps) {
  const [showManager, setShowManager] = useState(false);
  const [status, setStatus] = useState<{
    connected: boolean;
    ip: string;
    bootstrap: number;
  }>({ connected: false, ip: '', bootstrap: 0 });
  const buttonRef = useRef<HTMLButtonElement>(null);

  const loadStatus = useCallback(async () => {
    try {
      const status = await window.electronAPI.tor.getStatus();
      setStatus(status);
    } catch (err) {
      console.error('Failed to load Tor status:', err);
    }
  }, []);

  useEffect(() => {
    loadStatus();
    const unsubscribe = window.electronAPI.tor.onStatusChange(s => setStatus(s));
    return () => unsubscribe();
  }, [loadStatus]);

  const handleClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    setShowManager(!showManager);
  };

  const handleContextMenu = (e: React.MouseEvent) => {
    e.preventDefault();
    onOpenManager();
  };

  const handleMouseEnter = () => {
    // Could show tooltip
  };

  if (!torMode && !status.connected) {
    return (
      <button
        ref={buttonRef}
        className="tor-button"
        onClick={handleClick}
        onContextMenu={handleContextMenu}
        onMouseEnter={handleMouseEnter}
        title="Tor Privacy Mode (Right-click for options)"
        aria-label="Tor Privacy Mode"
      >
        <svg
          width="16"
          height="16"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          className="onion-svg"
        >
          <path d="M12 22c-4.42 0-8-3.58-8-8c0-5.5 8-12 8-12s8 6.5 8 12c0 4.42-3.58 8-8 8z" />
          <path d="M12 22c-2.2 0-4-3.58-4-8c0-5.5 4-12 4-12s4 6.5 4 8c0 4.42-1.8 8-4 8z" />
          <line x1="12" y1="2" x2="12" y2="22" />
        </svg>
      </button>
    );
  }

  return (
    <div className="tor-button-wrapper">
      <button
        ref={buttonRef}
        className={`tor-button ${status.connected ? 'connected' : 'disconnected'} ${torMode ? 'active' : ''}`}
        onClick={handleClick}
        onContextMenu={handleContextMenu}
        title={status.connected ? `Tor: ${status.ip}` : 'Tor Disconnected'}
        aria-label={status.connected ? 'Tor Connected' : 'Tor Disconnected'}
      >
        <svg
          width="16"
          height="16"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          className="onion-svg"
        >
          <path d="M12 22c-4.42 0-8-3.58-8-8c0-5.5 8-12 8-12s8 6.5 8 12c0 4.42-3.58 8-8 8z" />
          <path d="M12 22c-2.2 0-4-3.58-4-8c0-5.5 4-12 4-12s4 6.5 4 8c0 4.42-1.8 8-4 8z" />
          <line x1="12" y1="2" x2="12" y2="22" />
        </svg>
        {status.connected && (
          <span className="tor-status-indicator">
            <span className={`tor-dot ${status.connected ? 'connected' : 'disconnected'}`} />
          </span>
        )}
      </button>

      {showManager && (
        <div className="tor-dropdown" onClick={e => e.stopPropagation()}>
          <div className="tor-dropdown-header">
            <span className="tor-dropdown-title">Tor Privacy</span>
            <button className="tor-dropdown-close" onClick={() => setShowManager(false)}>
              ✕
            </button>
          </div>

          <div className="tor-dropdown-content">
            <div className={`tor-status ${status.connected ? 'connected' : 'disconnected'}`}>
              <span className="tor-status-dot" />
              <span>{status.connected ? 'Protected' : 'Not Protected'}</span>
            </div>

            {status.connected && (
              <div className="tor-ip-display">
                <span className="tor-ip-label">Exit IP</span>
                <span className="tor-ip-value">{status.ip}</span>
              </div>
            )}

            <div className="tor-dropdown-actions" style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              {onCreateIncognitoTab && (
                <button
                  className="tor-dropdown-btn primary"
                  style={{ background: 'var(--color-primary, #a855f7)', color: '#fff' }}
                  onClick={() => {
                    onCreateIncognitoTab();
                    setShowManager(false);
                  }}
                >
                  New Incognito Tab
                </button>
              )}
              {!status.connected ? (
                <button
                  className="tor-dropdown-btn primary"
                  onClick={async () => {
                    const result = await window.electronAPI.tor.connect();
                    if (result.success) await onToggle(true);
                  }}
                >
                  Connect
                </button>
              ) : (
                <>
                  <button
                    className="tor-dropdown-btn secondary"
                    onClick={async () => {
                      await window.electronAPI.tor.newCircuit();
                    }}
                  >
                    New Circuit
                  </button>
                  <button
                    className="tor-dropdown-btn secondary"
                    onClick={async () => {
                      await window.electronAPI.tor.disconnect();
                      await onToggle(false);
                    }}
                  >
                    Disconnect
                  </button>
                </>
              )}
            </div>

            <div className="tor-dropdown-footer">
              <details>
                <summary>Advanced</summary>
                <div className="tor-advanced-links">
                  <button onClick={() => window.electronAPI.tor.newCircuit()}>New Circuit</button>
                  <button onClick={async () => { const r = await window.electronAPI.tor.connect(); if (r.success) await onToggle(true); }}>Reconnect</button>
                </div>
              </details>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
