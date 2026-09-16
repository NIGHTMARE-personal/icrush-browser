import React, { useState, useEffect } from 'react';

interface CircuitNode {
  id: string;
  type: 'entry' | 'middle' | 'exit';
  fingerprint: string;
  nickname: string;
  address: string;
  port: number;
  country: string;
  isGuard: boolean;
  isExit: boolean;
  bandwidth: number;
  uptime: number;
  flags: string[];
}

interface CircuitVisualizationProps {
  circuit: string;
  connected: boolean;
  bandwidth?: { read: number; write: number; total: number };
  latency?: number;
  circuitDetails?: Array<{
    id: string;
    type: 'entry' | 'middle' | 'exit';
    fingerprint: string;
    nickname: string;
    address: string;
    port: number;
    country: string;
    bandwidth: number;
    uptime: number;
  }>;
}

export function CircuitVisualization({
  circuit,
  connected,
  bandwidth,
  latency,
  circuitDetails,
}: CircuitVisualizationProps) {
  const [nodes, setNodes] = useState<CircuitNode[]>([]);
  const [animating, setAnimating] = useState(false);

  useEffect(() => {
    if (!connected) {
      setNodes([]);
      return;
    }

    // Parse circuit string (format: "Entry -> Middle -> Exit" with fingerprints)
    const parseCircuit = (circuitStr: string): CircuitNode[] => {
      if (!circuitStr || circuitStr === 'Building...') {
        return [
          {
            id: '1',
            type: 'entry',
            fingerprint: '',
            nickname: 'Connecting...',
            address: '',
            port: 0,
            country: '',
            isGuard: false,
            isExit: false,
            bandwidth: 0,
            uptime: 0,
            flags: [],
          },
          {
            id: '2',
            type: 'middle',
            fingerprint: '',
            nickname: 'Connecting...',
            address: '',
            port: 0,
            country: '',
            isGuard: false,
            isExit: false,
            bandwidth: 0,
            uptime: 0,
            flags: [],
          },
          {
            id: '3',
            type: 'exit',
            fingerprint: '',
            nickname: 'Connecting...',
            address: '',
            port: 0,
            country: '',
            isGuard: false,
            isExit: false,
            bandwidth: 0,
            uptime: 0,
            flags: [],
          },
        ];
      }

      // Parse real circuit data
      const parts = circuitStr.split(' -> ');
      return parts.map((part, i) => {
        const [nickname, fingerprint] = part.includes('(')
          ? part.split('(').map(s => s.trim().replace(')', ''))
          : [part, ''];

        // Find matching circuit detail for bandwidth info
        const detail = circuitDetails?.find(
          d =>
            (d.type === 'entry' && i === 0) ||
            (d.type === 'exit' && i === parts.length - 1) ||
            (d.type === 'middle' && i > 0 && i < parts.length - 1)
        );

        return {
          id: String(i + 1),
          type: i === 0 ? 'entry' : i === parts.length - 1 ? 'exit' : 'middle',
          fingerprint: fingerprint || '',
          nickname: nickname || `Node ${i + 1}`,
          address: '',
          port: 0,
          country: '??',
          isGuard: i === 0,
          isExit: i === parts.length - 1,
          bandwidth: detail?.bandwidth || 0,
          uptime: detail?.uptime || 0,
          flags: [],
        };
      });
    };

    setNodes(parseCircuit(circuit));
    setAnimating(true);
    setTimeout(() => setAnimating(false), 500);
  }, [circuit, connected, circuitDetails]);

  const nodeColors = {
    entry: '#10b981', // green
    middle: '#3b82f6', // blue
    exit: '#ef4444', // red
  };

  const nodeLabels = {
    entry: 'ENTRY NODE',
    middle: 'MIDDLE NODE',
    exit: 'EXIT NODE',
  };

  if (!connected) {
    return (
      <div className="circuit-disconnected">
        <svg
          width="48"
          height="48"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.5"
        >
          <circle cx="12" cy="12" r="10" />
          <path d="M12 6v6l4 2" />
        </svg>
        <p>Not connected to Tor</p>
        <p className="circuit-hint">Connect to Tor to see circuit</p>
      </div>
    );
  }

  const formatBandwidth = (bytes: number): string => {
    if (bytes === 0) return '0 B/s';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i] + '/s';
  };

  return (
    <div className="circuit-visualization">
      <div className="circuit-header">
        <h3>Tor Circuit</h3>
        <span className="circuit-status">Active</span>
        {bandwidth && (
          <div className="circuit-bandwidth">
            <span>
              ↓ {formatBandwidth(bandwidth.read)} ↑ {formatBandwidth(bandwidth.write)}
            </span>
          </div>
        )}
        {latency && <div className="circuit-latency">{latency} ms</div>}
      </div>

      <div className="circuit-path">
        {nodes.map((node, index) => (
          <React.Fragment key={node.id}>
            <div
              className={`circuit-node ${node.type} ${animating ? 'animate-in' : ''}`}
              style={{ '--node-color': nodeColors[node.type] } as React.CSSProperties}
            >
              <div className="node-ring" />
              <div className="node-icon">
                {node.type === 'entry' && (
                  <svg
                    width="12"
                    height="12"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2.5"
                    className="node-svg-icon"
                  >
                    <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
                  </svg>
                )}
                {node.type === 'middle' && (
                  <svg
                    width="12"
                    height="12"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2.5"
                    className="node-svg-icon"
                  >
                    <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" />
                    <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" />
                  </svg>
                )}
                {node.type === 'exit' && (
                  <svg
                    width="12"
                    height="12"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2.5"
                    className="node-svg-icon"
                  >
                    <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
                    <polyline points="16 17 21 12 16 7" />
                    <line x1="21" y1="12" x2="9" y2="12" />
                  </svg>
                )}
              </div>
              <div className="node-label">{nodeLabels[node.type]}</div>
              <div className="node-nickname">{node.nickname}</div>
              {node.fingerprint && (
                <div className="node-fingerprint">{node.fingerprint.slice(0, 16)}...</div>
              )}
              {node.bandwidth > 0 && (
                <div className="node-bandwidth">{formatBandwidth(node.bandwidth)}</div>
              )}
            </div>
            {index < nodes.length - 1 && (
              <div className="circuit-link">
                <div className="link-line" />
                <div className="link-arrow">→</div>
              </div>
            )}
          </React.Fragment>
        ))}
      </div>

      <div className="circuit-legend">
        <div className="legend-item">
          <span className="legend-dot entry" />
          <span>Entry (Guard)</span>
        </div>
        <div className="legend-item">
          <span className="legend-dot middle" />
          <span>Middle</span>
        </div>
        <div className="legend-item">
          <span className="legend-dot exit" />
          <span>Exit</span>
        </div>
      </div>

      {circuitDetails && circuitDetails.length > 0 && (
        <details className="circuit-details">
          <summary>Circuit Details</summary>
          <div className="circuit-details-content">
            {circuitDetails.map(detail => (
              <div key={detail.id} className="circuit-detail-item">
                <span className="detail-type">{detail.type.toUpperCase()}</span>
                <span className="detail-nickname">{detail.nickname}</span>
                <span className="detail-fingerprint">{detail.fingerprint.slice(0, 16)}...</span>
                <span className="detail-bandwidth">
                  {detail.bandwidth > 0 ? formatBandwidth(detail.bandwidth) : 'N/A'}
                </span>
              </div>
            ))}
          </div>
        </details>
      )}

      <button
        className="circuit-refresh-btn"
        onClick={() => window.electronAPI.tor.newCircuit()}
        title="New Circuit (NEWNYM)"
      >
        <svg
          width="14"
          height="14"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
        >
          <path d="M21.5 2v6h-6M21.34 15.57a10 10 0 1 1-.57-8.38l5.67-5.67" />
        </svg>
        New Circuit
      </button>
    </div>
  );
}
