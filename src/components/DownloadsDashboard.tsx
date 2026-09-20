import React, { useState, useEffect, useMemo } from 'react';

export interface ScanResult {
  status: 'safe' | 'danger' | 'unverified' | 'scanning';
  details?: string;
  maliciousCount?: number;
  suspiciousCount?: number;
}

export interface DownloadItem {
  id: string;
  url: string;
  filename: string;
  totalBytes: number;
  receivedBytes: number;
  state: 'progressing' | 'completed' | 'cancelled' | 'interrupted' | 'paused';
  startTime: number;
  endTime?: number;
  savePath: string;
  mimeType: string;
  scanResult?: ScanResult;
  priority?: 'high' | 'medium' | 'low';
  fileMissing?: boolean;
}

interface DownloadsDashboardProps {
  onCreateTab?: (url?: string) => void;
  onNavigate?: (url: string) => void;
}

/* ─────────────────────────────────────────────────────────────
   Crisp SVG Line Icons (No Emojis - Obsidian Minimalist Style)
   ───────────────────────────────────────────────────────────── */

const IconDownload = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
    <polyline points="7 10 12 15 17 10" />
    <line x1="12" y1="15" x2="12" y2="3" />
  </svg>
);

const IconFolder = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
  </svg>
);

const IconFile = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
    <polyline points="14 2 14 8 20 8" />
  </svg>
);

const IconSearch = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="11" cy="11" r="8" />
    <line x1="21" y1="21" x2="16.65" y2="16.65" />
  </svg>
);

const IconTrash = () => (
  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <polyline points="3 6 5 6 21 6" />
    <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
  </svg>
);

const IconCopy = () => (
  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
    <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
  </svg>
);

const IconExternalLink = () => (
  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
    <polyline points="15 3 21 3 21 9" />
    <line x1="10" y1="14" x2="21" y2="3" />
  </svg>
);

const IconCancel = () => (
  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
    <line x1="18" y1="6" x2="6" y2="18" />
    <line x1="6" y1="6" x2="18" y2="18" />
  </svg>
);

const IconShield = () => (
  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
  </svg>
);

export function DownloadsDashboard({ onCreateTab }: DownloadsDashboardProps) {
  const [downloads, setDownloads] = useState<DownloadItem[]>([]);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'progressing' | 'completed' | 'cancelled'>('all');
  const [typeFilter, setTypeFilter] = useState<'all' | 'media' | 'doc' | 'archive' | 'app'>('all');
  const [sortBy, setSortBy] = useState<'newest' | 'oldest' | 'largest' | 'smallest'>('newest');
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [saveDirectory, setSaveDirectory] = useState<string>('');

  const loadDownloads = async () => {
    if (window.electronAPI?.downloads) {
      const data = await window.electronAPI.downloads.getAll();
      setDownloads(data || []);
      try {
        const dir = await window.electronAPI.downloads.getSaveDir();
        setSaveDirectory(dir || '');
      } catch {
        // ignore
      }
    }
  };

  useEffect(() => {
    loadDownloads();

    const unsubCreated = window.electronAPI?.downloads?.onCreated?.((item: DownloadItem) => {
      setDownloads(prev => [item, ...prev.filter(d => d.id !== item.id)]);
    });
    const unsubUpdated = window.electronAPI?.downloads?.onUpdated?.((patch: Partial<DownloadItem> & { id: string }) => {
      setDownloads(prev => prev.map(d => (d.id === patch.id ? { ...d, ...patch } : d)));
    });

    return () => {
      unsubCreated?.();
      unsubUpdated?.();
    };
  }, []);

  const formatBytes = (bytes: number) => {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
  };

  const handleCopyLink = async (id: string, url: string) => {
    try {
      await navigator.clipboard.writeText(url);
      setCopiedId(id);
      setTimeout(() => setCopiedId(null), 2000);
    } catch {
      // ignore
    }
  };

  const handleClearCompleted = async () => {
    if (window.electronAPI?.downloads) {
      await window.electronAPI.downloads.clearCompleted();
      loadDownloads();
    }
  };

  const handleOpenFolder = (id?: string) => {
    if (id && window.electronAPI?.downloads?.showInFolder) {
      window.electronAPI.downloads.showInFolder(id);
    } else if (saveDirectory && window.electronAPI?.downloads?.showInFolder) {
      // fallback
      window.electronAPI.downloads.showInFolder('');
    }
  };

  // Filtered & Sorted downloads
  const filteredDownloads = useMemo(() => {
    return downloads
      .filter(item => {
        const matchesSearch =
          item.filename.toLowerCase().includes(search.toLowerCase()) ||
          item.url.toLowerCase().includes(search.toLowerCase());

        const matchesStatus =
          statusFilter === 'all'
            ? true
            : statusFilter === 'progressing'
            ? item.state === 'progressing' || item.state === 'paused'
            : item.state === statusFilter;

        let matchesType = true;
        const ext = item.filename.split('.').pop()?.toLowerCase() || '';
        if (typeFilter === 'media') {
          matchesType = ['mp4', 'mkv', 'avi', 'mp3', 'wav', 'png', 'jpg', 'jpeg', 'gif', 'webm'].includes(ext);
        } else if (typeFilter === 'doc') {
          matchesType = ['pdf', 'doc', 'docx', 'txt', 'csv', 'xlsx', 'pptx', 'md'].includes(ext);
        } else if (typeFilter === 'archive') {
          matchesType = ['zip', 'rar', '7z', 'tar', 'gz', 'iso'].includes(ext);
        } else if (typeFilter === 'app') {
          matchesType = ['exe', 'msi', 'dmg', 'apk', 'deb', 'rpm'].includes(ext);
        }

        return matchesSearch && matchesStatus && matchesType;
      })
      .sort((a, b) => {
        if (sortBy === 'newest') return (b.startTime || 0) - (a.startTime || 0);
        if (sortBy === 'oldest') return (a.startTime || 0) - (b.startTime || 0);
        if (sortBy === 'largest') return (b.totalBytes || 0) - (a.totalBytes || 0);
        if (sortBy === 'smallest') return (a.totalBytes || 0) - (b.totalBytes || 0);
        return 0;
      });
  }, [downloads, search, statusFilter, typeFilter, sortBy]);

  // Compute summary stats
  const totalCompletedBytes = useMemo(() => {
    return downloads
      .filter(d => d.state === 'completed')
      .reduce((acc, d) => acc + (d.totalBytes || d.receivedBytes || 0), 0);
  }, [downloads]);

  const activeCount = downloads.filter(d => d.state === 'progressing').length;
  const completedCount = downloads.filter(d => d.state === 'completed').length;

  return (
    <div
      style={{
        flex: 1,
        height: '100%',
        overflowY: 'auto',
        background: '#0a0a0d',
        color: '#ffffff',
        padding: '48px 60px',
        fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
      }}
    >
      <div style={{ maxWidth: '1080px', margin: '0 auto' }}>
        {/* ─── Hero Header Strip ─── */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '32px' }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '6px' }}>
              <span
                style={{
                  fontSize: '10px',
                  fontWeight: '800',
                  textTransform: 'uppercase',
                  letterSpacing: '0.28em',
                  color: '#d4af37',
                }}
              >
                Local Storage Vault
              </span>
              <span style={{ width: '4px', height: '4px', borderRadius: '50%', background: '#d4af37' }} />
              <span style={{ fontSize: '11px', color: '#71717a' }}>{downloads.length} Total Files</span>
            </div>

            <h1
              style={{
                fontFamily: 'Playfair Display, Georgia, serif',
                fontSize: '34px',
                fontWeight: '700',
                margin: 0,
                color: '#f9f6f0',
                letterSpacing: '0.01em',
              }}
            >
              Downloads Archive
            </h1>
            <p style={{ fontSize: '13.5px', color: '#a1a1aa', margin: '6px 0 0 0', lineHeight: '1.5' }}>
              Inspect real-time transfer streams, virus protection integrity, and session download archives.
            </p>
          </div>

          {/* Top Actions */}
          <div style={{ display: 'flex', gap: '10px' }}>
            <button
              type="button"
              onClick={handleClearCompleted}
              disabled={completedCount === 0}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
                background: 'rgba(255, 255, 255, 0.04)',
                border: '1px solid rgba(255, 255, 255, 0.08)',
                borderRadius: '12px',
                padding: '9px 16px',
                color: completedCount > 0 ? '#d4d4d8' : '#52525b',
                fontSize: '12px',
                fontWeight: '600',
                cursor: completedCount > 0 ? 'pointer' : 'default',
                transition: 'all 0.15s ease',
              }}
            >
              <IconTrash />
              <span>Clear Completed</span>
            </button>

            <button
              type="button"
              onClick={() => handleOpenFolder()}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
                background: 'rgba(212, 175, 55, 0.12)',
                border: '1px solid rgba(212, 175, 55, 0.35)',
                borderRadius: '12px',
                padding: '9px 18px',
                color: '#f2ca50',
                fontSize: '12px',
                fontWeight: '700',
                cursor: 'pointer',
                transition: 'all 0.15s ease',
              }}
            >
              <IconFolder />
              <span>Open Downloads Folder</span>
            </button>
          </div>
        </div>

        {/* ─── HUD Metrics Grid ─── */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '14px', marginBottom: '28px' }}>
          {[
            { label: 'Active Streams', value: `${activeCount}`, sub: activeCount > 0 ? 'Transfers running' : 'Idle', highlight: activeCount > 0 ? '#10b981' : '#a1a1aa' },
            { label: 'Completed Files', value: `${completedCount}`, sub: 'Saved to disk', highlight: '#f2ca50' },
            { label: 'Total Volume', value: formatBytes(totalCompletedBytes), sub: 'Disk footprint', highlight: '#ffffff' },
            { label: 'Protection Scan', value: 'Active', sub: 'Threat scan enabled', highlight: '#10b981' },
          ].map((stat, i) => (
            <div
              key={i}
              style={{
                background: 'rgba(18, 18, 24, 0.7)',
                border: '1px solid rgba(255, 255, 255, 0.08)',
                borderRadius: '16px',
                padding: '16px 20px',
                boxShadow: '0 8px 24px rgba(0, 0, 0, 0.4)',
              }}
            >
              <div style={{ fontSize: '10px', fontWeight: '800', textTransform: 'uppercase', letterSpacing: '0.2em', color: '#71717a', marginBottom: '4px' }}>
                {stat.label}
              </div>
              <div style={{ fontSize: '22px', fontWeight: '700', color: stat.highlight, fontFamily: 'monospace' }}>
                {stat.value}
              </div>
              <div style={{ fontSize: '11px', color: '#52525b', marginTop: '2px' }}>
                {stat.sub}
              </div>
            </div>
          ))}
        </div>

        {/* ─── Search, Filters & Sorter Bar ─── */}
        <div style={{ display: 'flex', gap: '12px', marginBottom: '20px', alignItems: 'center', flexWrap: 'wrap' }}>
          {/* Search Box */}
          <div
            style={{
              flex: 1,
              minWidth: '260px',
              background: 'rgba(24, 24, 32, 0.8)',
              border: '1px solid rgba(255, 255, 255, 0.1)',
              borderRadius: '14px',
              padding: '10px 14px',
              display: 'flex',
              alignItems: 'center',
              gap: '10px',
            }}
          >
            <span style={{ color: '#71717a' }}><IconSearch /></span>
            <input
              type="text"
              placeholder="Search downloaded files, URLs, or file extensions..."
              value={search}
              onChange={e => setSearch(e.target.value)}
              style={{ flex: 1, background: 'none', border: 'none', color: '#ffffff', fontSize: '13px', outline: 'none' }}
            />
            {search && (
              <button
                type="button"
                onClick={() => setSearch('')}
                style={{ background: 'none', border: 'none', color: '#71717a', cursor: 'pointer', padding: 0 }}
              >
                <IconCancel />
              </button>
            )}
          </div>

          {/* Status Pills */}
          <div style={{ display: 'flex', gap: '6px', background: 'rgba(18, 18, 24, 0.6)', padding: '4px', borderRadius: '14px', border: '1px solid rgba(255, 255, 255, 0.06)' }}>
            {(['all', 'progressing', 'completed', 'cancelled'] as const).map(status => (
              <button
                key={status}
                type="button"
                onClick={() => setStatusFilter(status)}
                style={{
                  padding: '6px 14px',
                  borderRadius: '10px',
                  background: statusFilter === status ? 'rgba(212, 175, 55, 0.18)' : 'transparent',
                  border: statusFilter === status ? '1px solid rgba(212, 175, 55, 0.45)' : '1px solid transparent',
                  color: statusFilter === status ? '#f2ca50' : '#a1a1aa',
                  fontSize: '11.5px',
                  fontWeight: '600',
                  textTransform: 'capitalize',
                  cursor: 'pointer',
                  transition: 'all 0.15s ease',
                }}
              >
                {status === 'progressing' ? 'Active' : status}
              </button>
            ))}
          </div>

          {/* Sort Selector */}
          <select
            value={sortBy}
            onChange={e => setSortBy(e.target.value as any)}
            style={{
              background: 'rgba(24, 24, 32, 0.8)',
              border: '1px solid rgba(255, 255, 255, 0.1)',
              borderRadius: '12px',
              padding: '10px 14px',
              color: '#d4af37',
              fontSize: '12px',
              fontWeight: '600',
              outline: 'none',
              cursor: 'pointer',
            }}
          >
            <option value="newest" style={{ background: '#121216', color: '#fff' }}>Newest First</option>
            <option value="oldest" style={{ background: '#121216', color: '#fff' }}>Oldest First</option>
            <option value="largest" style={{ background: '#121216', color: '#fff' }}>Largest Size</option>
            <option value="smallest" style={{ background: '#121216', color: '#fff' }}>Smallest Size</option>
          </select>
        </div>

        {/* ─── Type Filter Chips ─── */}
        <div style={{ display: 'flex', gap: '8px', marginBottom: '24px' }}>
          {[
            { id: 'all', label: 'All Files' },
            { id: 'media', label: 'Media (Video / Audio / Images)' },
            { id: 'doc', label: 'Documents (PDF / Office)' },
            { id: 'archive', label: 'Archives (ZIP / RAR)' },
            { id: 'app', label: 'Installers & Apps' },
          ].map(type => (
            <button
              key={type.id}
              type="button"
              onClick={() => setTypeFilter(type.id as any)}
              style={{
                padding: '4px 12px',
                borderRadius: '9999px',
                background: typeFilter === type.id ? 'rgba(255, 255, 255, 0.1)' : 'rgba(255, 255, 255, 0.02)',
                border: typeFilter === type.id ? '1px solid rgba(255, 255, 255, 0.2)' : '1px solid rgba(255, 255, 255, 0.05)',
                color: typeFilter === type.id ? '#ffffff' : '#71717a',
                fontSize: '11px',
                fontWeight: '600',
                cursor: 'pointer',
                transition: 'all 0.15s ease',
              }}
            >
              {type.label}
            </button>
          ))}
        </div>

        {/* ─── Downloads List Matrix ─── */}
        <div
          style={{
            background: 'rgba(18, 18, 24, 0.8)',
            border: '1px solid rgba(255, 255, 255, 0.08)',
            borderRadius: '20px',
            overflow: 'hidden',
            boxShadow: '0 20px 50px rgba(0, 0, 0, 0.6)',
          }}
        >
          {filteredDownloads.length === 0 ? (
            <div style={{ padding: '80px 20px', textAlign: 'center', color: '#71717a' }}>
              <div style={{ marginBottom: '12px', opacity: 0.5 }}>
                <IconDownload />
              </div>
              <div style={{ fontSize: '14px', fontWeight: '600', color: '#d4d4d8' }}>
                No Downloads Found
              </div>
              <div style={{ fontSize: '12px', color: '#71717a', marginTop: '4px' }}>
                Files downloaded in the browser will appear automatically in this dashboard.
              </div>
            </div>
          ) : (
            filteredDownloads.map(item => {
              const progress = item.totalBytes > 0 ? Math.round((item.receivedBytes / item.totalBytes) * 100) : 0;
              const isDone = item.state === 'completed';
              const isProgressing = item.state === 'progressing' || item.state === 'paused';
              const isCancelled = item.state === 'cancelled' || item.state === 'interrupted';

              return (
                <div
                  key={item.id}
                  style={{
                    padding: '18px 24px',
                    borderBottom: '1px solid rgba(255, 255, 255, 0.04)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    gap: '24px',
                    transition: 'background 0.15s ease',
                  }}
                  onMouseEnter={e => (e.currentTarget.style.background = 'rgba(255, 255, 255, 0.02)')}
                  onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
                >
                  {/* Left Info */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: '16px', flex: 1, minWidth: 0 }}>
                    <div
                      style={{
                        width: '40px',
                        height: '40px',
                        borderRadius: '12px',
                        background: isDone
                          ? 'rgba(16, 185, 129, 0.12)'
                          : isProgressing
                          ? 'rgba(212, 175, 55, 0.12)'
                          : 'rgba(239, 68, 68, 0.12)',
                        border: isDone
                          ? '1px solid rgba(16, 185, 129, 0.3)'
                          : isProgressing
                          ? '1px solid rgba(212, 175, 55, 0.3)'
                          : '1px solid rgba(239, 68, 68, 0.3)',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        color: isDone ? '#10b981' : isProgressing ? '#d4af37' : '#f87171',
                        flexShrink: 0,
                      }}
                    >
                      <IconFile />
                    </div>

                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
                        <span
                          style={{
                            fontSize: '14px',
                            fontWeight: '700',
                            color: '#ffffff',
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                            whiteSpace: 'nowrap',
                            maxWidth: '420px',
                          }}
                          title={item.filename}
                        >
                          {item.filename}
                        </span>

                        <span
                          style={{
                            fontSize: '9.5px',
                            fontWeight: '800',
                            textTransform: 'uppercase',
                            letterSpacing: '0.1em',
                            padding: '2px 8px',
                            borderRadius: '9999px',
                            background: isDone
                              ? 'rgba(16, 185, 129, 0.15)'
                              : isProgressing
                              ? 'rgba(212, 175, 55, 0.15)'
                              : 'rgba(239, 68, 68, 0.15)',
                            color: isDone ? '#10b981' : isProgressing ? '#f2ca50' : '#f87171',
                          }}
                        >
                          {isDone ? 'Completed' : isProgressing ? `${progress}%` : 'Cancelled'}
                        </span>

                        {item.scanResult && (
                          <span
                            style={{
                              display: 'flex',
                              alignItems: 'center',
                              gap: '4px',
                              fontSize: '9px',
                              fontWeight: '700',
                              color: item.scanResult.status === 'safe' ? '#10b981' : '#f87171',
                            }}
                          >
                            <IconShield />
                            <span>{(item.scanResult.status || 'safe').toUpperCase()}</span>
                          </span>
                        )}
                      </div>

                      <div style={{ fontSize: '11px', color: '#71717a', marginTop: '4px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        <span>Source: {item.url}</span>
                        {item.startTime && (
                          <span style={{ marginLeft: '12px' }}>
                            {new Date(item.startTime).toLocaleString()}
                          </span>
                        )}
                      </div>

                      {/* Progress Bar */}
                      {isProgressing && (
                        <div style={{ width: '320px', height: '4px', background: 'rgba(255, 255, 255, 0.08)', borderRadius: '2px', marginTop: '8px', overflow: 'hidden' }}>
                          <div
                            style={{
                              width: `${progress}%`,
                              height: '100%',
                              background: 'linear-gradient(90deg, #d4af37, #10b981)',
                              transition: 'width 0.2s ease',
                            }}
                          />
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Right Actions Hub */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: '14px', flexShrink: 0 }}>
                    <div style={{ textAlign: 'right' }}>
                      <div style={{ fontSize: '12.5px', fontWeight: '700', color: '#e4e4e7', fontFamily: 'monospace' }}>
                        {formatBytes(item.receivedBytes || item.totalBytes)}
                      </div>
                      {item.totalBytes > 0 && item.totalBytes !== item.receivedBytes && (
                        <div style={{ fontSize: '10px', color: '#71717a' }}>
                          of {formatBytes(item.totalBytes)}
                        </div>
                      )}
                    </div>

                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                      {isDone && (
                        <>
                          <button
                            type="button"
                            onClick={() => window.electronAPI?.downloads?.open(item.id)}
                            style={{
                              background: 'rgba(212, 175, 55, 0.15)',
                              border: '1px solid rgba(212, 175, 55, 0.4)',
                              borderRadius: '8px',
                              padding: '6px 14px',
                              color: '#d4af37',
                              fontSize: '11px',
                              fontWeight: '700',
                              cursor: 'pointer',
                              display: 'flex',
                              alignItems: 'center',
                              gap: '4px',
                            }}
                            title="Open File"
                          >
                            <span>Open</span>
                          </button>

                          <button
                            type="button"
                            onClick={() => window.electronAPI?.downloads?.showInFolder(item.id)}
                            style={{
                              background: 'rgba(255, 255, 255, 0.04)',
                              border: '1px solid rgba(255, 255, 255, 0.08)',
                              borderRadius: '8px',
                              padding: '6px 12px',
                              color: '#a1a1aa',
                              fontSize: '11px',
                              fontWeight: '600',
                              cursor: 'pointer',
                              display: 'flex',
                              alignItems: 'center',
                              gap: '4px',
                            }}
                            title="Show in Folder"
                          >
                            <IconFolder />
                            <span>Folder</span>
                          </button>
                        </>
                      )}

                      {isProgressing && (
                        <button
                          type="button"
                          onClick={() => window.electronAPI?.downloads?.cancel(item.id)}
                          style={{
                            background: 'rgba(239, 68, 68, 0.15)',
                            border: '1px solid rgba(239, 68, 68, 0.4)',
                            borderRadius: '8px',
                            padding: '6px 14px',
                            color: '#f87171',
                            fontSize: '11px',
                            fontWeight: '700',
                            cursor: 'pointer',
                            display: 'flex',
                            alignItems: 'center',
                            gap: '4px',
                          }}
                        >
                          <IconCancel />
                          <span>Cancel</span>
                        </button>
                      )}

                      <button
                        type="button"
                        onClick={() => handleCopyLink(item.id, item.url)}
                        style={{
                          background: 'transparent',
                          border: 'none',
                          color: copiedId === item.id ? '#10b981' : '#71717a',
                          padding: '6px',
                          borderRadius: '6px',
                          cursor: 'pointer',
                          display: 'flex',
                        }}
                        title="Copy Source URL"
                      >
                        <IconCopy />
                      </button>

                      {onCreateTab && (
                        <button
                          type="button"
                          onClick={() => onCreateTab(item.url)}
                          style={{
                            background: 'transparent',
                            border: 'none',
                            color: '#71717a',
                            padding: '6px',
                            borderRadius: '6px',
                            cursor: 'pointer',
                            display: 'flex',
                          }}
                          title="Open URL in New Tab"
                        >
                          <IconExternalLink />
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
}
