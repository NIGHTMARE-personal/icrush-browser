import React from 'react';

interface Tab {
  id: string;
  url: string;
  title: string;
  loading: boolean;
  canGoBack: boolean;
  canGoForward: boolean;
  isAudible?: boolean;
  isMuted?: boolean;
  volume?: number;
}

interface AudioControlPaneProps {
  isOpen: boolean;
  onClose: () => void;
  tabs: Tab[];
  activeId: string | null;
  onFocusTab: (id: string) => void;
  onSetMuted: (id: string, muted: boolean) => void;
  onSetVolume: (id: string, volume: number) => void;
  onTogglePlayPause: (id: string) => void;
}

export function AudioControlPane({
  isOpen,
  onClose,
  tabs,
  activeId,
  onFocusTab,
  onSetMuted,
  onSetVolume,
  onTogglePlayPause,
}: AudioControlPaneProps) {
  if (!isOpen) return null;

  // Filter tabs that are currently making sound
  const audibleTabs = tabs.filter(t => t.isAudible);

  // Sort: Active tab first if audible
  const sortedTabs = [...audibleTabs].sort((a, b) => {
    if (a.id === activeId) return -1;
    if (b.id === activeId) return 1;
    return 0;
  });

  const getDomain = (url: string) => {
    try {
      const parsed = new URL(url);
      return parsed.hostname.replace('www.', '');
    } catch {
      return 'Web Page';
    }
  };

  return (
    <>
      <div
        className="audio-pane-overlay"
        onClick={onClose}
        style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          zIndex: 998,
          background: 'transparent',
        }}
      />
      <div
        className="audio-control-pane"
        style={{
          position: 'absolute',
          top: '42px',
          right: '80px',
          width: '320px',
          background: 'rgba(30, 30, 45, 0.85)',
          backdropFilter: 'blur(16px)',
          WebkitBackdropFilter: 'blur(16px)',
          border: '1px solid rgba(255, 255, 255, 0.08)',
          borderRadius: '12px',
          padding: '16px',
          boxShadow: '0 10px 30px rgba(0, 0, 0, 0.5), inset 0 1px 1px rgba(255, 255, 255, 0.1)',
          zIndex: 999,
          color: '#ffffff',
          animation: 'fadeIn 0.2s cubic-bezier(0.16, 1, 0.3, 1)',
        }}
      >
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            marginBottom: '14px',
            borderBottom: '1px solid rgba(255,255,255,0.06)',
            paddingBottom: '8px',
          }}
        >
          <span
            style={{
              fontSize: '13px',
              fontWeight: 600,
              letterSpacing: '0.5px',
              color: 'var(--text-primary, #ffffff)',
            }}
          >
            MEDIA CONTROLS
          </span>
          <button
            onClick={onClose}
            style={{
              background: 'none',
              border: 'none',
              color: 'rgba(255,255,255,0.4)',
              cursor: 'pointer',
              padding: '4px',
              borderRadius: '4px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              transition: 'all 0.2s',
            }}
            onMouseOver={e => (e.currentTarget.style.color = '#ffffff')}
            onMouseOut={e => (e.currentTarget.style.color = 'rgba(255,255,255,0.4)')}
            title="Close Panel"
          >
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
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>

        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            gap: '12px',
            maxHeight: '300px',
            overflowY: 'auto',
          }}
        >
          {sortedTabs.length === 0 ? (
            <div
              style={{
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                padding: '24px 0',
                gap: '8px',
                color: 'rgba(255,255,255,0.4)',
              }}
            >
              <svg
                width="24"
                height="24"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.5"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M11 5 6 9 2 9 2 15 6 15 11 19 11 5z" />
                <line x1="23" y1="9" x2="17" y2="15" />
                <line x1="17" y1="9" x2="23" y2="15" />
              </svg>
              <span style={{ fontSize: '11px' }}>No active media playing</span>
            </div>
          ) : (
            sortedTabs.map(tab => {
              const isTabMuted = tab.isMuted || false;
              const currentVolume = tab.volume !== undefined ? tab.volume : 1;
              const isActiveTab = tab.id === activeId;

              return (
                <div
                  key={tab.id}
                  style={{
                    background: isActiveTab
                      ? 'rgba(255, 255, 255, 0.05)'
                      : 'rgba(255, 255, 255, 0.02)',
                    border: isActiveTab
                      ? '1px solid rgba(255, 255, 255, 0.1)'
                      : '1px solid rgba(255, 255, 255, 0.03)',
                    borderRadius: '8px',
                    padding: '10px 12px',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '8px',
                    transition: 'border-color 0.2s',
                  }}
                >
                  <div
                    style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                      gap: '10px',
                    }}
                  >
                    <div
                      onClick={() => onFocusTab(tab.id)}
                      style={{ flex: 1, minWidth: 0, cursor: 'pointer' }}
                    >
                      <div
                        style={{
                          fontSize: '12px',
                          fontWeight: 500,
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          whiteSpace: 'nowrap',
                          color: '#ffffff',
                        }}
                      >
                        {tab.title || 'New Tab'}
                      </div>
                      <div
                        style={{
                          fontSize: '10px',
                          color: 'rgba(255,255,255,0.4)',
                          marginTop: '2px',
                        }}
                      >
                        {getDomain(tab.url)} {isActiveTab && '• Active'}
                      </div>
                    </div>

                    <div style={{ display: 'flex', gap: '6px' }}>
                      {/* Play/Pause Button */}
                      <button
                        className="control-btn"
                        onClick={() => onTogglePlayPause(tab.id)}
                        style={{
                          background: 'rgba(255,255,255,0.06)',
                          border: 'none',
                          color: '#ffffff',
                          cursor: 'pointer',
                          width: '26px',
                          height: '26px',
                          borderRadius: '6px',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          transition: 'background 0.2s',
                        }}
                        onMouseOver={e =>
                          (e.currentTarget.style.background = 'rgba(255,255,255,0.15)')
                        }
                        onMouseOut={e =>
                          (e.currentTarget.style.background = 'rgba(255,255,255,0.06)')
                        }
                        title="Play / Pause"
                      >
                        <svg
                          width="12"
                          height="12"
                          viewBox="0 0 24 24"
                          fill="currentColor"
                          stroke="currentColor"
                          strokeWidth="2"
                        >
                          <rect x="6" y="4" width="4" height="16" rx="1" />
                          <rect x="14" y="4" width="4" height="16" rx="1" />
                        </svg>
                      </button>

                      {/* Mute Button */}
                      <button
                        className="control-btn"
                        onClick={() => onSetMuted(tab.id, !isTabMuted)}
                        style={{
                          background: isTabMuted
                            ? 'rgba(239, 68, 68, 0.15)'
                            : 'rgba(255,255,255,0.06)',
                          border: 'none',
                          color: isTabMuted ? '#ef4444' : '#ffffff',
                          cursor: 'pointer',
                          width: '26px',
                          height: '26px',
                          borderRadius: '6px',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          transition: 'background 0.2s',
                        }}
                        onMouseOver={e =>
                          (e.currentTarget.style.background = isTabMuted
                            ? 'rgba(239, 68, 68, 0.25)'
                            : 'rgba(255,255,255,0.15)')
                        }
                        onMouseOut={e =>
                          (e.currentTarget.style.background = isTabMuted
                            ? 'rgba(239, 68, 68, 0.15)'
                            : 'rgba(255,255,255,0.06)')
                        }
                        title={isTabMuted ? 'Unmute Tab' : 'Mute Tab'}
                      >
                        {isTabMuted ? (
                          <svg
                            width="12"
                            height="12"
                            viewBox="0 0 24 24"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth="2.5"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                          >
                            <path d="M11 5 6 9 2 9 2 15 6 15 11 19 11 5z" />
                            <line x1="23" y1="9" x2="17" y2="15" />
                            <line x1="17" y1="9" x2="23" y2="15" />
                          </svg>
                        ) : (
                          <svg
                            width="12"
                            height="12"
                            viewBox="0 0 24 24"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth="2.5"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                          >
                            <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" />
                            <path d="M19.07 4.93a10 10 0 0 1 0 14.14M15.54 8.46a5 5 0 0 1 0 7.07" />
                          </svg>
                        )}
                      </button>
                    </div>
                  </div>

                  {/* Volume Slider Section */}
                  <div
                    style={{ display: 'flex', alignItems: 'center', gap: '8px', marginTop: '2px' }}
                  >
                    <svg
                      width="10"
                      height="10"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2.5"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      style={{ opacity: 0.4 }}
                    >
                      <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" />
                    </svg>
                    <input
                      type="range"
                      min="0"
                      max="1"
                      step="0.05"
                      value={isTabMuted ? 0 : currentVolume}
                      disabled={isTabMuted}
                      onChange={e => onSetVolume(tab.id, parseFloat(e.target.value))}
                      style={{
                        flex: 1,
                        height: '3px',
                        borderRadius: '2px',
                        background: 'rgba(255,255,255,0.15)',
                        outline: 'none',
                        cursor: isTabMuted ? 'not-allowed' : 'pointer',
                        accentColor: '#6366f1',
                      }}
                    />
                    <span
                      style={{
                        fontSize: '9px',
                        width: '22px',
                        textAlign: 'right',
                        color: 'rgba(255,255,255,0.4)',
                      }}
                    >
                      {isTabMuted ? 0 : Math.round(currentVolume * 100)}%
                    </span>
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
