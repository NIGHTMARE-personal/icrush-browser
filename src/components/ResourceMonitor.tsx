import React, { useState, useEffect } from 'react';

interface Tab {
  id: string;
  url: string;
  title: string;
  loading: boolean;
  isSuspended?: boolean;
}

interface ResourceMonitorProps {
  tabs: Tab[];
  forceCpuVisible?: boolean;
  forceRamVisible?: boolean;
}

export function ResourceMonitor({
  tabs,
  forceCpuVisible = true,
  forceRamVisible = true,
}: ResourceMonitorProps) {
  const [cpu, setCpu] = useState(12);
  const [ram, setRam] = useState(1800);
  const [totalSaved, setTotalSaved] = useState(0);

  useEffect(() => {
    // Load cumulative memory saved from localStorage
    const saved = localStorage.getItem('tabSuspensionTotalSaved');
    setTotalSaved(saved ? parseInt(saved) : 0);

    // Watch for updates
    const handleStorageUpdate = () => {
      const updated = localStorage.getItem('tabSuspensionTotalSaved');
      setTotalSaved(updated ? parseInt(updated) : 0);
    };
    window.addEventListener('storage', handleStorageUpdate);
    window.addEventListener('tab-suspended-confetti', handleStorageUpdate);

    return () => {
      window.removeEventListener('storage', handleStorageUpdate);
      window.removeEventListener('tab-suspended-confetti', handleStorageUpdate);
    };
  }, []);

  useEffect(() => {
    const interval = setInterval(() => {
      // CPU Jitter: base of 4% + 3% per active webview + random fluctuation
      const activeTabsCount = tabs.filter(
        t => !t.isSuspended && t.url !== 'about:blank' && t.url !== ''
      ).length;
      const baseCpu = 5 + activeTabsCount * 4;
      const jitter = Math.sin(Date.now() / 2000) * 2 + (Math.random() - 0.5) * 3;
      setCpu(Math.max(2, Math.min(99, Math.round(baseCpu + jitter))));

      // RAM Calculation: base 550MB + 160MB per active tab + 25MB per suspended tab
      const suspendedCount = tabs.filter(t => t.isSuspended).length;
      const calculatedRam = 550 + activeTabsCount * 160 + suspendedCount * 25;
      const ramJitter = Math.cos(Date.now() / 3000) * 15 + (Math.random() - 0.5) * 10;
      setRam(Math.round(calculatedRam + ramJitter));
    }, 2000);

    return () => clearInterval(interval);
  }, [tabs]);

  // SVG Progress Ring Parameters
  const radius = 28;
  const circumference = 2 * Math.PI * radius;
  const cpuOffset = circumference - (cpu / 100) * circumference;

  // Assuming 16GB total system memory (16384 MB)
  const ramPercent = Math.min(100, (ram / 16384) * 100);
  const ramOffset = circumference - (ramPercent / 100) * circumference;

  const formatSaved = (mb: number) => {
    if (mb >= 1024) {
      return `${(mb / 1024).toFixed(2)} GB`;
    }
    return `${mb} MB`;
  };

  const activeTabs = tabs.filter(t => !t.isSuspended && t.url !== 'about:blank' && t.url !== '');
  const suspendedTabs = tabs.filter(t => t.isSuspended);

  return (
    <div className="resource-monitor-card glassmorphic-card">
      <div className="monitor-header">
        <svg
          width="14"
          height="14"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.5"
          className="monitor-icon"
        >
          <rect x="2" y="2" width="20" height="20" rx="2" ry="2" />
          <line x1="6" y1="6" x2="6" y2="18" />
          <line x1="10" y1="10" x2="10" y2="18" />
          <line x1="14" y1="14" x2="14" y2="18" />
          <line x1="18" y1="6" x2="18" y2="18" />
        </svg>
        <h4>System Resource Monitor</h4>
      </div>

      <div className="monitor-gauges-row">
        {/* CPU circular progress gauge */}
        {forceCpuVisible && (
          <div className="gauge-container animate-in">
            <svg className="gauge-svg" width="70" height="70" viewBox="0 0 70 70">
              <circle className="gauge-bg" cx="35" cy="35" r={radius} strokeWidth="5" />
              <circle
                className="gauge-progress cpu-glow"
                cx="35"
                cy="35"
                r={radius}
                strokeWidth="5"
                strokeDasharray={circumference}
                strokeDashoffset={cpuOffset}
                strokeLinecap="round"
              />
            </svg>
            <div className="gauge-label">
              <span className="gauge-value">{cpu}%</span>
              <span className="gauge-name">CPU</span>
            </div>
          </div>
        )}

        {/* RAM circular progress gauge */}
        {forceRamVisible && (
          <div className="gauge-container animate-in">
            <svg className="gauge-svg" width="70" height="70" viewBox="0 0 70 70">
              <circle className="gauge-bg" cx="35" cy="35" r={radius} strokeWidth="5" />
              <circle
                className="gauge-progress ram-glow"
                cx="35"
                cy="35"
                r={radius}
                strokeWidth="5"
                strokeDasharray={circumference}
                strokeDashoffset={ramOffset}
                strokeLinecap="round"
              />
            </svg>
            <div className="gauge-label">
              <span className="gauge-value">{(ram / 1024).toFixed(1)}G</span>
              <span className="gauge-name">RAM</span>
            </div>
          </div>
        )}

        {!forceCpuVisible && !forceRamVisible && (
          <div
            className="gauges-hidden-text"
            style={{
              fontSize: '11px',
              color: 'var(--text-muted)',
              textAlign: 'center',
              width: '100%',
              padding: '16px 0',
            }}
          >
            Resource gauges hidden via customize mode.
          </div>
        )}
      </div>

      {/* Memory saved tracker section */}
      <div className="monitor-savings-box">
        <div className="savings-label-row">
          <span className="savings-title">Memory Freed by Suspension</span>
          <span className="savings-value glow-green">{formatSaved(totalSaved)}</span>
        </div>
        <div className="savings-progress-bar">
          <div
            className="savings-progress-fill"
            style={{ width: `${Math.min(100, (totalSaved / 5120) * 100)}%` }}
          />
        </div>
        <span className="savings-limit-text">Target: 5.0 GB total savings goal</span>
      </div>

      {/* Diagnostic layout list */}
      <div className="monitor-details-list">
        <div className="details-row">
          <span>Active Subprocesses</span>
          <span className="glow-blue">{activeTabs.length} tabs</span>
        </div>
        <div className="details-row">
          <span>Suspended (Sleeping)</span>
          <span className="glow-purple">{suspendedTabs.length} tabs</span>
        </div>
      </div>
    </div>
  );
}
