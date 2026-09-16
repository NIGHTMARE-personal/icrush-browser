import React, { useState, useEffect, useCallback } from 'react';
import { CircuitVisualization } from './CircuitVisualization';

interface BridgeConfig {
  type: 'obfs4' | 'snowflake' | 'meek';
  address: string;
  port: number;
  fingerprint?: string;
  cert?: string;
  iatMode?: number;
}

interface TorStatus {
  connected: boolean;
  ip: string;
  circuit: string;
  bootstrap: number;
  useBridges?: boolean;
  bridgeType?: string;
  bridges?: BridgeConfig[];
}

interface TorManagerProps {
  isOpen: boolean;
  onClose: () => void;
  onToggleTorMode: (enabled: boolean) => void;
  torMode: boolean;
  onRunLeakTest?: () => void;
}

const parseBridgeLine = (line: string): BridgeConfig | null => {
  const parts = line.trim().split(/\s+/);
  if (parts.length < 2) return null;

  const type: 'obfs4' | 'snowflake' | 'meek' = 'obfs4';
  let addrPart = parts[0];
  let nextIdx = 1;

  if (parts[0].toLowerCase() === 'obfs4') {
    addrPart = parts[1];
    nextIdx = 2;
  }

  const addrParts = addrPart.split(':');
  if (addrParts.length !== 2) return null;

  const address = addrParts[0];
  const port = parseInt(addrParts[1], 10);
  if (isNaN(port)) return null;

  let fingerprint = '';
  let cert = '';
  let iatMode = 0;

  for (let i = nextIdx; i < parts.length; i++) {
    const part = parts[i];
    if (part.startsWith('cert=')) {
      cert = part.substring(5);
    } else if (part.startsWith('iat-mode=')) {
      iatMode = parseInt(part.substring(9), 10) || 0;
    } else if (!part.includes('=')) {
      fingerprint = part;
    }
  }

  return { type, address, port, fingerprint, cert, iatMode };
};

export function TorManager({ isOpen, onClose, onToggleTorMode, ..._props }: TorManagerProps) {
  const [status, setStatus] = useState<TorStatus>({
    connected: false,
    ip: '',
    circuit: '',
    bootstrap: 0,
    useBridges: false,
    bridgeType: 'none',
    bridges: [],
  });
  const [connecting, setConnecting] = useState(false);
  const [customBridgeLine, setCustomBridgeLine] = useState('');
  const [addError, setAddError] = useState('');
  const [elapsed, setElapsed] = useState(0);
  const [connectionError, setConnectionError] = useState<string | null>(null);

  const loadStatus = useCallback(async () => {
    try {
      const status = await window.electronAPI.tor.getStatus();
      setStatus(status);
    } catch (err) {
      console.error('Failed to load Tor status:', err);
    }
  }, []);

  useEffect(() => {
    if (!isOpen) return;

    loadStatus();

    const unsubscribe = window.electronAPI.tor.onStatusChange(status => {
      setStatus(status);
      if (status.connected && connecting) setConnecting(false);
    });

    const unsubscribeFailed = window.electronAPI.tor.onConnectionFailed(error => {
      setConnectionError(error);
      setConnecting(false);
    });

    return () => {
      unsubscribe();
      unsubscribeFailed();
    };
  }, [isOpen, loadStatus, connecting]);

  const isBootstrapping = status.bootstrap > 0 && !status.connected;

  useEffect(() => {
    let interval: NodeJS.Timeout;
    if (isBootstrapping) {
      interval = setInterval(() => {
        setElapsed(prev => prev + 1);
      }, 1000);
    } else {
      setElapsed(0);
    }
    return () => clearInterval(interval);
  }, [isBootstrapping]);

  const handleConnect = async () => {
    setConnecting(true);
    setConnectionError(null);
    try {
      const result = await window.electronAPI.tor.connect();
      if (result.success) {
        await onToggleTorMode(true);
      } else {
        console.error('Failed to connect Tor:', result.error);
        setConnectionError(result.error || 'Connection failed');
        setConnecting(false);
      }
    } catch (err) {
      console.error('Failed to connect Tor:', err);
      setConnectionError('Connection failed');
      setConnecting(false);
    }
  };

  const handleCancelConnect = async () => {
    try {
      await window.electronAPI.tor.cancelConnect();
      setConnecting(false);
      setConnectionError('Connection cancelled');
    } catch (err) {
      console.error('Failed to cancel Tor connection:', err);
      setConnecting(false);
    }
  };

  const handleDisconnect = async () => {
    try {
      await window.electronAPI.tor.disconnect();
      await onToggleTorMode(false);
    } catch (err) {
      console.error('Failed to disconnect Tor:', err);
    }
  };

  const handleNewCircuit = async () => {
    try {
      await window.electronAPI.tor.newCircuit();
      loadStatus();
    } catch (err) {
      console.error('Failed to create new circuit:', err);
    }
  };

  const handleToggleBridges = async (enabled: boolean) => {
    try {
      await window.electronAPI.tor.setUseBridges(enabled);
      await loadStatus();
    } catch (err) {
      console.error('Failed to toggle bridges:', err);
    }
  };

  const handleBridgeTypeChange = async (type: 'obfs4' | 'snowflake' | 'none') => {
    try {
      await window.electronAPI.tor.setBridgeType(type);
      await loadStatus();
    } catch (err) {
      console.error('Failed to change bridge type:', err);
    }
  };

  const handleAddBridge = async (e: React.FormEvent) => {
    e.preventDefault();
    setAddError('');
    if (!customBridgeLine.trim()) return;

    const parsed = parseBridgeLine(customBridgeLine);
    if (!parsed) {
      setAddError('Invalid format. Example: IP:PORT FINGERPRINT cert=... iat-mode=0');
      return;
    }

    try {
      await window.electronAPI.tor.addBridge(parsed);
      setCustomBridgeLine('');
      await loadStatus();
    } catch (err) {
      console.error('Failed to add bridge:', err);
      setAddError('Failed to add bridge to Tor.');
    }
  };

  const handleRemoveBridge = async (address: string) => {
    try {
      await window.electronAPI.tor.removeBridge(address);
      await loadStatus();
    } catch (err) {
      console.error('Failed to remove bridge:', err);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="tor-manager-overlay" onClick={onClose}>
      <div className="tor-manager-panel" onClick={e => e.stopPropagation()}>
        {/* Header */}
        <div className="tor-header">
          <div className="tor-header-left">
            <svg
              width="22"
              height="22"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <circle cx="12" cy="12" r="10" />
              <path d="M12 6v6l4 2" />
              <path d="M8 14v-4" />
              <path d="M16 14v-4" />
            </svg>
            <span className="tor-title">Tor Private Network</span>
          </div>
          <button className="tor-close-btn" onClick={onClose} aria-label="Close panel">
            ✕
          </button>
        </div>

        {/* Content */}
        <div className="tor-content">
          {/* Connection Status Card */}
          <div className="tor-glass-card">
            <div className="tor-connection-status-panel">
              <div className="tor-status-indicator-row">
                <div className="tor-micro-label">Security Shield</div>
                <div className={`tor-status-badge ${status.connected ? 'connected' : 'disconnected'}`}>
                  <span className={`tor-status-pulse-dot ${status.connected ? 'connected' : 'disconnected'}`} />
                  {status.connected ? 'Protected' : 'Not Protected'}
                </div>
              </div>

              {status.connected && (
                <div className="tor-ip-credential" style={{ marginTop: '12px' }}>
                  <span className="tor-ip-label">Tor Exit IP</span>
                  <span className="tor-ip-value">{status.ip || '...'}</span>
                </div>
              )}
            </div>

            {/* Connection Controls */}
            <div style={{ marginTop: '18px' }}>
              {!status.connected ? (
                connectionError ? (
                  <div className="tor-error-state" style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', color: '#f87171', fontSize: '12px', gap: '8px' }}>
                      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ flexShrink: 0 }}>
                        <circle cx="12" cy="12" r="10" />
                        <line x1="12" y1="8" x2="12" y2="12" />
                        <line x1="12" y1="16" x2="12.01" y2="16" />
                      </svg>
                      <span>{connectionError}</span>
                    </div>
                    <div style={{ display: 'flex', gap: '8px' }}>
                      <button className="tor-pill-btn tor-pill-btn-primary" style={{ flex: 1 }} onClick={handleConnect} disabled={connecting}>
                        {connecting ? (
                          <>
                            <span className="tor-spinner" style={{ marginRight: '6px' }} />
                            Retrying...
                          </>
                        ) : (
                          'Retry Connection'
                        )}
                      </button>
                      <button className="tor-pill-btn tor-pill-btn-secondary" onClick={() => setConnectionError(null)}>
                        Dismiss
                      </button>
                    </div>
                  </div>
                ) : (
                  <div style={{ display: 'flex', gap: '8px' }}>
                    <button
                      className="tor-pill-btn tor-pill-btn-primary"
                      style={{ flex: 1 }}
                      onClick={handleConnect}
                      disabled={connecting}
                    >
                      {connecting ? (
                        <>
                          <span className="tor-spinner" style={{ marginRight: '6px' }} />
                          Connecting...
                        </>
                      ) : (
                        'Connect to Tor'
                      )}
                    </button>
                    {connecting && (
                      <button className="tor-pill-btn tor-pill-btn-secondary" onClick={handleCancelConnect}>
                        Cancel
                      </button>
                    )}
                  </div>
                )
              ) : (
                <div className="tor-controls-grid">
                  <button className="tor-pill-btn tor-pill-btn-secondary" onClick={handleDisconnect}>
                    Disconnect
                  </button>
                  <button className="tor-pill-btn tor-pill-btn-secondary" onClick={handleNewCircuit}>
                    New Circuit
                  </button>
                </div>
              )}
            </div>

            {/* Bootstrap Progress Bar */}
            {!status.connected && status.bootstrap > 0 && (
              <div className="tor-bootstrap-container" style={{ marginTop: '14px' }}>
                <div className="tor-bootstrap-bar-wrapper">
                  <div className="tor-bootstrap-bar-fill" style={{ width: `${status.bootstrap}%` }} />
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '10px' }}>
                  <span className="tor-bootstrap-subtext">Establishing secure tunnels... {status.bootstrap}%</span>
                  <span>
                    {elapsed > 0 &&
                      `Time: ${elapsed}s (Est: ${Math.max(5, Math.min(120, Math.round(((100 - status.bootstrap) / status.bootstrap) * elapsed)))}s)`}
                  </span>
                </div>
              </div>
            )}

            {/* Kill Switch Toggle */}
            <div style={{ marginTop: '16px', borderTop: '1px solid rgba(255, 255, 255, 0.05)', paddingTop: '14px' }}>
              <div className="tor-toggle-row">
                <div className="tor-toggle-text-col">
                  <span className="tor-toggle-label">Kill Switch Protection</span>
                  <span className="tor-toggle-desc">Blocks clear net leaks if connection is lost</span>
                </div>
                <div className="tor-switch-capsule">
                  <input type="checkbox" id="tor-kill-switch-cb" checked={true} readOnly />
                  <label htmlFor="tor-kill-switch-cb" className="tor-switch-capsule-slider" />
                </div>
              </div>
            </div>
          </div>

          {/* Circuit Visualization */}
          {status.connected && (
            <div className="tor-glass-card">
              <CircuitVisualization circuit={status.circuit} connected={status.connected} />
            </div>
          )}

          {/* Tor Bridges Configuration Card */}
          <div className="tor-glass-card">
            <div className="tor-toggle-row">
              <div className="tor-toggle-text-col">
                <span className="tor-toggle-label">Bridges Configuration</span>
                <span className="tor-toggle-desc">Bypass heavy local censorship blocks</span>
              </div>
              <div className="tor-switch-capsule">
                <input
                  type="checkbox"
                  id="tor-use-bridges"
                  checked={!!status.useBridges}
                  onChange={e => handleToggleBridges(e.target.checked)}
                />
                <label htmlFor="tor-use-bridges" className="tor-switch-capsule-slider" />
              </div>
            </div>

            {status.useBridges && (
              <div className="tor-bridge-settings">
                <div className="tor-bridge-type-selector">
                  <label htmlFor="tor-bridge-type" className="tor-micro-label" style={{ marginBottom: '2px' }}>
                    Bridge Protocol
                  </label>
                  <select
                    id="tor-bridge-type"
                    className="tor-select"
                    value={status.bridgeType || 'none'}
                    onChange={e =>
                      handleBridgeTypeChange(e.target.value as 'obfs4' | 'snowflake' | 'none')
                    }
                  >
                    <option value="snowflake">Snowflake (WebRTC Tunnel)</option>
                    <option value="obfs4">obfs4 (Obfuscated Packets)</option>
                  </select>
                </div>

                {status.bridgeType === 'snowflake' && (
                  <div className="tor-bridge-info-text">
                    Snowflake routes your traffic through temporary, user-run WebRTC proxies. No custom bridge lines required.
                  </div>
                )}

                {status.bridgeType === 'obfs4' && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                    <div className="tor-bridge-info-text">
                      obfs4 makes your Tor traffic look completely random. Enter custom bridge lines from <code>bridges.torproject.org</code>.
                    </div>

                    {status.bridges && status.bridges.length > 0 ? (
                      <div className="tor-bridge-list">
                        <div className="tor-bridge-list-header">Configured Bridges</div>
                        {status.bridges.map((b, idx) => (
                          <div key={idx} className="tor-bridge-item">
                            <span className="tor-bridge-addr">
                              {b.address}:{b.port}
                            </span>
                            <button
                              className="tor-remove-bridge-btn"
                              onClick={() => handleRemoveBridge(b.address)}
                            >
                              Remove
                            </button>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <div className="tor-bridge-list-empty">
                        Using default obfs4 relays.
                      </div>
                    )}

                    <form className="tor-add-bridge-form" onSubmit={handleAddBridge}>
                      <input
                        type="text"
                        className="tor-input"
                        placeholder="IP:PORT [FINGERPRINT] [cert=...]"
                        value={customBridgeLine}
                        onChange={e => setCustomBridgeLine(e.target.value)}
                      />
                      <button type="submit" className="tor-pill-btn tor-pill-btn-secondary" style={{ padding: '8px 14px' }}>
                        Add
                      </button>
                    </form>
                    {addError && <div className="tor-error-text" style={{ color: '#f87171', fontSize: '10.5px' }}>{addError}</div>}
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Leak Protection Grid */}
          <div className="tor-leak-protection-grid">
            <div className="tor-protection-pill">
              <svg
                width="14"
                height="14"
                viewBox="0 0 24 24"
                fill="none"
                stroke="#34d399"
                strokeWidth="2.5"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
              </svg>
              <span>DNS Leak Protection</span>
              <span className="tor-protection-status active">Active</span>
            </div>
            <div className="tor-protection-pill">
              <svg
                width="14"
                height="14"
                viewBox="0 0 24 24"
                fill="none"
                stroke="#34d399"
                strokeWidth="2.5"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24" />
                <line x1="1" y1="1" x2="23" y2="23" />
              </svg>
              <span>WebRTC Block Shield</span>
              <span className="tor-protection-status active">Active</span>
            </div>
            <div className="tor-protection-pill">
              <svg
                width="14"
                height="14"
                viewBox="0 0 24 24"
                fill="none"
                stroke="#34d399"
                strokeWidth="2.5"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
                <path d="M7 11V7a5 5 0 0 1 10 0v4" />
              </svg>
              <span>Sandboxed Route Isolation</span>
              <span className="tor-protection-status active">Active</span>
            </div>
          </div>

          {/* Advanced Details */}
          <details className="tor-advanced">
            <summary className="tor-micro-label">Developer Console</summary>
            <div className="tor-advanced-content">
              <div className="tor-detail">
                <span className="tor-detail-label">Proxy Protocol</span>
                <span className="tor-detail-value">socks5h://127.0.0.1:9050</span>
              </div>
              <div className="tor-detail">
                <span className="tor-detail-label">Tor Control Connection</span>
                <span className="tor-detail-value">127.0.0.1:9051</span>
              </div>
              <div className="tor-detail">
                <span className="tor-detail-label">Session Partition ID</span>
                <span className="tor-detail-value">
                  {status.useBridges ? `bridge:${status.bridgeType}` : 'Direct Routing'}
                </span>
              </div>
            </div>
          </details>
        </div>

        {/* Footer */}
        <div className="tor-footer">
          <span className="tor-version">Tor Daemon v0.4.8+ | ICRUSH Sandbox Shield</span>
        </div>
      </div>
    </div>
  );
}
