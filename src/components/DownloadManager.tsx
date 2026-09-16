import React, { useState, useEffect, useCallback } from 'react';

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

interface DownloadManagerProps {
  isOpen: boolean;
  onClose: () => void;
  onOpenFullDownloadsPage?: () => void;
}

/* ─────────────────────────────────────────────────────────────
   Crisp SVG Line Icons (No Emojis - Obsidian Minimalist Style)
   ───────────────────────────────────────────────────────────── */

const IconDownload = () => (
  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
    <polyline points="7 10 12 15 17 10" />
    <line x1="12" y1="15" x2="12" y2="3" />
  </svg>
);

const IconFolder = () => (
  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
  </svg>
);

const IconFile = () => (
  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
    <polyline points="14 2 14 8 20 8" />
  </svg>
);

const IconExternalLink = () => (
  <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
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

const IconTrash = () => (
  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <polyline points="3 6 5 6 21 6" />
    <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
  </svg>
);

export function DownloadManager({ isOpen, onClose, onOpenFullDownloadsPage }: DownloadManagerProps) {
  const [downloads, setDownloads] = useState<DownloadItem[]>([]);
  const [filter, setFilter] = useState<'all' | 'progressing' | 'completed'>('all');

  const loadDownloads = useCallback(async () => {
    try {
      if (window.electronAPI?.downloads) {
        const list = await window.electronAPI.downloads.getAll();
        setDownloads(list || []);
      }
    } catch (err) {
      console.error('Failed to load downloads:', err);
    }
  }, []);

  useEffect(() => {
    if (!isOpen) return;
    loadDownloads();

    const unsubCreated = window.electronAPI?.downloads?.onCreated?.((download: DownloadItem) => {
      setDownloads(prev => [download, ...prev.filter(d => d.id !== download.id)]);
    });

    const unsubUpdated = window.electronAPI?.downloads?.onUpdated?.((patch: Partial<DownloadItem> & { id: string }) => {
      setDownloads(prev => prev.map(d => (d.id === patch.id ? { ...d, ...patch } : d)));
    });

    return () => {
      unsubCreated?.();
      unsubUpdated?.();
    };
  }, [isOpen, loadDownloads]);

  if (!isOpen) return null;

  const formatBytes = (bytes: number) => {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
  };

  const handleClearCompleted = async () => {
    if (window.electronAPI?.downloads) {
      await window.electronAPI.downloads.clearCompleted();
      loadDownloads();
    }
  };

  const activeDownloads = downloads.filter(d => d.state === 'progressing' || d.state === 'paused');
  const filteredDownloads = downloads.filter(d => {
    if (filter === 'progressing') return d.state === 'progressing' || d.state === 'paused';
    if (filter === 'completed') return d.state === 'completed';
    return true;
  });

  return (
    <>
      {/* Backdrop */}
      <div
        style={{ position: 'fixed', inset: 0, zIndex: 9998 }}
        onClick={onClose}
      />

      {/* Floating Flyout Popover */}
      <div
        style={{
          position: 'fixed',
          top: '42px',
          right: '80px',
          zIndex: 9999,
          width: '390px',
          maxHeight: '520px',
          background: 'rgba(12, 12, 16, 0.98)',
          border: '1px solid rgba(212, 175, 55, 0.35)',
          borderRadius: '18px',
          boxShadow: '0 24px 60px rgba(0, 0, 0, 0.85), inset 0 1px 0 rgba(255, 255, 255, 0.1)',
          backdropFilter: 'blur(24px)',
          WebkitBackdropFilter: 'blur(24px)',
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
          color: '#e5e5e5',
          fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
          animation: 'fadeInDown 0.15s cubic-bezier(0.16, 1, 0.3, 1)',
        }}
      >
        {/* Header Strip */}
        <header
          style={{
            padding: '12px 16px',
            borderBottom: '1px solid rgba(255, 255, 255, 0.08)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            background: 'rgba(18, 18, 24, 0.9)',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span style={{ color: '#d4af37' }}><IconDownload /></span>
            <span
              style={{
                fontFamily: 'Playfair Display, Georgia, serif',
                fontSize: '15px',
                fontWeight: '700',
                color: '#ffffff',
                letterSpacing: '0.01em',
              }}
            >
              Downloads
            </span>
            {activeDownloads.length > 0 && (
              <span
                style={{
                  fontSize: '9px',
                  fontWeight: '800',
                  textTransform: 'uppercase',
                  letterSpacing: '0.12em',
                  padding: '2px 7px',
                  borderRadius: '9999px',
                  background: 'rgba(16, 185, 129, 0.15)',
                  border: '1px solid rgba(16, 185, 129, 0.4)',
                  color: '#10b981',
                }}
              >
                {activeDownloads.length} Active
              </span>
            )}
          </div>

          {/* Full Dashboard Button */}
          {onOpenFullDownloadsPage && (
            <button
              type="button"
              onClick={() => {
                onClose();
                onOpenFullDownloadsPage();
              }}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '5px',
                background: 'rgba(212, 175, 55, 0.14)',
                border: '1px solid rgba(212, 175, 55, 0.4)',
                borderRadius: '8px',
                padding: '4px 10px',
                color: '#f2ca50',
                fontSize: '11px',
                fontWeight: '700',
                cursor: 'pointer',
                transition: 'all 0.15s ease',
              }}
              title="Open Full Downloads Dashboard (about:downloads)"
            >
              <span>View All</span>
              <IconExternalLink />
            </button>
          )}
        </header>

        {/* Filter Navigation Tabs */}
        <div
          style={{
            padding: '6px 12px',
            background: 'rgba(10, 10, 14, 0.7)',
            borderBottom: '1px solid rgba(255, 255, 255, 0.05)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
          }}
        >
          <div style={{ display: 'flex', gap: '4px' }}>
            {(['all', 'progressing', 'completed'] as const).map(tab => (
              <button
                key={tab}
                type="button"
                onClick={() => setFilter(tab)}
                style={{
                  padding: '4px 10px',
                  borderRadius: '9999px',
                  background: filter === tab ? 'rgba(212, 175, 55, 0.18)' : 'transparent',
                  border: filter === tab ? '1px solid rgba(212, 175, 55, 0.45)' : '1px solid transparent',
                  color: filter === tab ? '#f2ca50' : '#a1a1aa',
                  fontSize: '11px',
                  fontWeight: '600',
                  textTransform: 'capitalize',
                  cursor: 'pointer',
                  transition: 'all 0.15s ease',
                }}
              >
                {tab === 'progressing' ? 'Active' : tab}
              </button>
            ))}
          </div>

          {downloads.some(d => d.state === 'completed') && (
            <button
              type="button"
              onClick={handleClearCompleted}
              style={{
                background: 'none',
                border: 'none',
                color: '#71717a',
                fontSize: '10.5px',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: '3px',
                padding: '2px 4px',
              }}
              title="Clear Completed Downloads"
            >
              <IconTrash />
              <span>Clear</span>
            </button>
          )}
        </div>

        {/* Download Items List */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '10px' }}>
          {filteredDownloads.length === 0 ? (
            <div style={{ padding: '36px 16px', textAlign: 'center', color: '#71717a', fontSize: '12px' }}>
              No downloads in this view.
            </div>
          ) : (
            filteredDownloads.slice(0, 10).map(item => {
              const progress = item.totalBytes > 0 ? Math.round((item.receivedBytes / item.totalBytes) * 100) : 0;
              const isDone = item.state === 'completed';
              const isProgressing = item.state === 'progressing' || item.state === 'paused';

              return (
                <div
                  key={item.id}
                  style={{
                    padding: '10px 12px',
                    borderRadius: '12px',
                    background: 'rgba(255, 255, 255, 0.02)',
                    border: '1px solid rgba(255, 255, 255, 0.05)',
                    marginBottom: '8px',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '6px',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flex: 1, minWidth: 0 }}>
                      <span style={{ color: isDone ? '#10b981' : '#d4af37', display: 'flex', flexShrink: 0 }}>
                        <IconFile />
                      </span>
                      <span
                        style={{
                          fontSize: '12px',
                          fontWeight: '600',
                          color: '#ffffff',
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          whiteSpace: 'nowrap',
                        }}
                        title={item.filename}
                      >
                        {item.filename}
                      </span>
                    </div>

                    <span
                      style={{
                        fontSize: '10px',
                        fontWeight: '700',
                        color: isDone ? '#10b981' : isProgressing ? '#d4af37' : '#ef4444',
                        flexShrink: 0,
                        marginLeft: '8px',
                      }}
                    >
                      {isDone ? 'Done' : isProgressing ? `${progress}%` : item.state}
                    </span>
                  </div>

                  {/* Progress Bar for Active Downloads */}
                  {isProgressing && (
                    <div style={{ width: '100%', height: '3px', background: 'rgba(255, 255, 255, 0.08)', borderRadius: '2px', overflow: 'hidden' }}>
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

                  {/* Footer Stats & Actions */}
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '10.5px', color: '#71717a' }}>
                    <span>
                      {formatBytes(item.receivedBytes || item.totalBytes)}
                      {item.totalBytes > 0 && item.totalBytes !== item.receivedBytes && ` / ${formatBytes(item.totalBytes)}`}
                    </span>

                    <div style={{ display: 'flex', gap: '8px' }}>
                      {isDone && (
                        <>
                          <button
                            type="button"
                            onClick={() => window.electronAPI?.downloads?.open(item.id)}
                            style={{ background: 'none', border: 'none', color: '#d4af37', cursor: 'pointer', fontWeight: '700', padding: 0 }}
                          >
                            Open
                          </button>
                          <button
                            type="button"
                            onClick={() => window.electronAPI?.downloads?.showInFolder(item.id)}
                            style={{ background: 'none', border: 'none', color: '#a1a1aa', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '3px', padding: 0 }}
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
                          style={{ background: 'none', border: 'none', color: '#f87171', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '3px', padding: 0 }}
                        >
                          <IconCancel />
                          <span>Cancel</span>
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
    </>
  );
}
