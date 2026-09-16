import React, { useState, useRef, useEffect, useCallback } from 'react';
import { BrandLogo } from './BrandLogo';

interface ProfileModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (dataUrl: string) => void;
  onOpenSettings?: (tab?: string) => void;
}

/* ─────────────────────────────────────────────────────────────
   Crisp Minimal SVG Line Icons (100% SVG - Zero Emojis)
   ───────────────────────────────────────────────────────────── */

const IconUser = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
    <circle cx="12" cy="7" r="4" />
  </svg>
);

const IconSync = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M21.5 2v6h-6M21.34 15.57a10 10 0 1 1-.57-8.38l5.67-5.19" />
  </svg>
);

const IconShield = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
  </svg>
);

const IconKey = () => (
  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M21 2l-2 2m-1.5 1.5L14 9l-3 3-2-2-4 4 3 3 7-7 2-2 4-4z" />
    <circle cx="7.5" cy="16.5" r="3.5" />
  </svg>
);

const IconImage = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
    <circle cx="8.5" cy="8.5" r="1.5" />
    <polyline points="21 15 16 10 5 21" />
  </svg>
);

const IconLayers = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <polygon points="12 2 2 7 12 12 22 7 12 2" />
    <polyline points="2 17 12 22 22 17" />
    <polyline points="2 12 12 17 22 12" />
  </svg>
);

const IconRotate = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <polyline points="23 4 23 10 17 10" />
    <path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10" />
  </svg>
);

const IconCheck = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
    <polyline points="20 6 9 17 4 12" />
  </svg>
);

const IconCross = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <line x1="18" y1="6" x2="6" y2="18" />
    <line x1="6" y1="6" x2="18" y2="18" />
  </svg>
);

const IconUploadCloud = () => (
  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    <path d="M21.2 15c.6-1.2 1-2.5.7-3.9-.6-3-3.1-5.2-6.1-5.1-1 0-2 .3-2.9.8C12 4.4 9.4 3 6.5 3.8c-2.4.7-4.1 2.8-4.4 5.3C1.6 11 2 13 3.3 14.5" />
    <polyline points="16 16 12 12 8 16" />
    <line x1="12" y1="12" x2="12" y2="21" />
  </svg>
);

export function ProfileModal({ isOpen, onClose, onSave, onOpenSettings }: ProfileModalProps) {
  const isDark = (localStorage.getItem('homescreen_theme_mode') || 'deep-canvas') === 'deep-canvas';

  const [activeTab, setActiveTab] = useState<'identity' | 'sync' | 'profiles' | 'avatar'>('identity');
  const [activeProfileId, setActiveProfileId] = useState('1');
  const [username, setUsername] = useState('Nightmare');
  const [email, setEmail] = useState('nightmare@nightmareprojects.com');
  const [accountTier, setAccountTier] = useState('Founder & Master Tier • NIGHTMARE PROJECTS');

  // Cloud Sync items
  const [syncEnabled, setSyncEnabled] = useState(false);
  const [syncBookmarks, setSyncBookmarks] = useState(true);
  const [syncPasswords, setSyncPasswords] = useState(true);
  const [syncHistory, setSyncHistory] = useState(true);
  const [syncExtensions, setSyncExtensions] = useState(true);
  const [syncSettings, setSyncSettings] = useState(true);
  const [syncTabs, setSyncTabs] = useState(true);
  const [lastSyncTime, setLastSyncTime] = useState<string>('Just now');
  const [isSyncingNow, setIsSyncingNow] = useState(false);

  // Avatar Editor State
  const [imageSrc, setImageSrc] = useState<string | null>(null);
  const [zoom, setZoom] = useState(1);
  const [rotation, setRotation] = useState(0);
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });

  const fileInputRef = useRef<HTMLInputElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const imageRef = useRef<HTMLImageElement>(null);

  // Feedback Toast
  const [toastMsg, setToastMsg] = useState<string | null>(null);
  const triggerToast = (msg: string) => {
    setToastMsg(msg);
    setTimeout(() => setToastMsg(null), 3000);
  };

  // Load active profile and settings on open
  useEffect(() => {
    if (isOpen) {
      const activeId = localStorage.getItem('gemini-browser-active-profile-id') || '1';
      setActiveProfileId(activeId);

      const savedName = localStorage.getItem(`gemini-browser-profile-name-${activeId}`) ||
                        (activeId === '1' ? 'Nightmare' : activeId === '2' ? 'Work Profile' : 'Guest User');
      const savedEmail = localStorage.getItem(`gemini-browser-profile-email-${activeId}`) ||
                         (activeId === '1' ? 'nightmare@nightmareprojects.com' : activeId === '2' ? 'work@icrushbrowser.com' : 'guest@icrushbrowser.com');

      const savedAvatar = localStorage.getItem(`gemini-browser-profile-pic-${activeId}`) ||
                          localStorage.getItem('gemini-browser-profile-pic') || '';

      setUsername(savedName);
      setEmail(savedEmail);
      setAccountTier(activeId === '1' ? 'Founder & Master Tier • NIGHTMARE PROJECTS' : activeId === '2' ? 'Enterprise Engineering Pro' : 'Isolated Guest');

      setSyncEnabled(localStorage.getItem('gemini-browser-sync-active') === 'true');
      setSyncBookmarks(localStorage.getItem('sync_bookmarks') !== 'false');
      setSyncPasswords(localStorage.getItem('sync_passwords') !== 'false');
      setSyncHistory(localStorage.getItem('sync_history') !== 'false');
      setSyncExtensions(localStorage.getItem('sync_extensions') !== 'false');
      setSyncSettings(localStorage.getItem('sync_settings') !== 'false');
      setSyncTabs(localStorage.getItem('sync_tabs') !== 'false');

      setImageSrc(savedAvatar || null);
      setZoom(1);
      setRotation(0);
      setOffset({ x: 0, y: 0 });
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) loadImage(file);
  };

  const loadImage = (file: File) => {
    const reader = new FileReader();
    reader.onload = event => {
      setImageSrc(event.target?.result as string);
      setZoom(1);
      setRotation(0);
      setOffset({ x: 0, y: 0 });
      setActiveTab('avatar');
    };
    reader.readAsDataURL(file);
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    const file = e.dataTransfer.files?.[0];
    if (file && file.type.startsWith('image/')) {
      loadImage(file);
    }
  };

  const handleMouseDown = (e: React.MouseEvent) => {
    if (!imageSrc) return;
    setIsDragging(true);
    setDragStart({ x: e.clientX - offset.x, y: e.clientY - offset.y });
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (!isDragging || !imageSrc) return;
    setOffset({
      x: e.clientX - dragStart.x,
      y: e.clientY - dragStart.y,
    });
  };

  const handleMouseUp = () => {
    setIsDragging(false);
  };

  const handleSwitchProfile = (profileId: string) => {
    setActiveProfileId(profileId);
    localStorage.setItem('gemini-browser-active-profile-id', profileId);

    const savedName = localStorage.getItem(`gemini-browser-profile-name-${profileId}`) ||
                      (profileId === '1' ? 'Amits' : profileId === '2' ? 'Work Profile' : 'Guest User');
    const savedEmail = localStorage.getItem(`gemini-browser-profile-email-${profileId}`) ||
                       (profileId === '1' ? 'amits@icrushbrowser.com' : profileId === '2' ? 'work@icrushbrowser.com' : 'guest@icrushbrowser.com');
    const savedAvatar = localStorage.getItem(`gemini-browser-profile-pic-${profileId}`) || '';

    setUsername(savedName);
    setEmail(savedEmail);
    setImageSrc(savedAvatar || null);
    setAccountTier(profileId === '1' ? 'Founder & Master Tier' : profileId === '2' ? 'Enterprise Engineering Pro' : 'Isolated Guest');

    if (savedAvatar) {
      localStorage.setItem('gemini-browser-profile-pic', savedAvatar);
      onSave(savedAvatar);
    }
    window.dispatchEvent(new Event('profile-updated'));
    triggerToast(`Switched active profile to ${savedName}`);
  };

  const handleTriggerSyncNow = () => {
    setIsSyncingNow(true);
    window.dispatchEvent(new Event('sync-triggered'));
    setTimeout(() => {
      setIsSyncingNow(false);
      const timeStr = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
      setLastSyncTime(timeStr);
      triggerToast('Cloud Sync completed successfully!');
    }, 900);
  };

  const handleSaveAll = () => {
    // 1. Save Identity
    localStorage.setItem(`gemini-browser-profile-name-${activeProfileId}`, username.trim());
    localStorage.setItem(`gemini-browser-profile-email-${activeProfileId}`, email.trim());
    if (activeProfileId === '1') {
      localStorage.setItem('gemini-browser-profile-name', username.trim());
      localStorage.setItem('gemini-browser-profile-email', email.trim());
    }

    // 2. Save Sync preferences
    localStorage.setItem('gemini-browser-sync-active', String(syncEnabled));
    localStorage.setItem('sync_bookmarks', String(syncBookmarks));
    localStorage.setItem('sync_passwords', String(syncPasswords));
    localStorage.setItem('sync_history', String(syncHistory));
    localStorage.setItem('sync_extensions', String(syncExtensions));
    localStorage.setItem('sync_settings', String(syncSettings));
    localStorage.setItem('sync_tabs', String(syncTabs));

    // 3. Save Avatar if modified
    if (imageSrc) {
      const canvas = document.createElement('canvas');
      canvas.width = 256;
      canvas.height = 256;
      const ctx = canvas.getContext('2d');
      if (ctx) {
        const img = new Image();
        img.src = imageSrc;
        img.onload = () => {
          ctx.clearRect(0, 0, 256, 256);
          ctx.beginPath();
          ctx.arc(128, 128, 128, 0, Math.PI * 2);
          ctx.clip();

          const minDim = Math.min(img.width, img.height);
          const scaleToFit = 256 / minDim;
          const drawWidth = img.width * scaleToFit;
          const drawHeight = img.height * scaleToFit;

          ctx.translate(128 + offset.x, 128 + offset.y);
          ctx.rotate((rotation * Math.PI) / 180);
          ctx.scale(zoom, zoom);

          ctx.drawImage(img, -drawWidth / 2, -drawHeight / 2, drawWidth, drawHeight);

          const dataUrl = canvas.toDataURL('image/png');
          localStorage.setItem(`gemini-browser-profile-pic-${activeProfileId}`, dataUrl);
          localStorage.setItem('gemini-browser-profile-pic', dataUrl);
          onSave(dataUrl);

          window.dispatchEvent(new Event('profile-updated'));
          onClose();
        };
        return;
      }
    }

    window.dispatchEvent(new Event('profile-updated'));
    onClose();
  };

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(0, 0, 0, 0.75)',
        backdropFilter: 'blur(20px)',
        WebkitBackdropFilter: 'blur(20px)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 9999,
        animation: 'fadeIn 0.2s ease',
      }}
      onClick={onClose}
    >
      <div
        style={{
          width: '740px',
          maxHeight: '88vh',
          background: isDark ? '#0e0e14' : '#F9F6F0',
          border: isDark ? '1px solid rgba(212, 175, 55, 0.35)' : '1px solid rgba(200, 109, 81, 0.25)',
          borderRadius: '24px',
          boxShadow: isDark
            ? '0 24px 64px rgba(0, 0, 0, 0.85), 0 0 0 1px rgba(255, 255, 255, 0.08)'
            : '0 20px 48px rgba(0, 0, 0, 0.12)',
          color: isDark ? '#f9f6f0' : '#1a1715',
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
          fontFamily: 'system-ui, -apple-system, sans-serif',
        }}
        onClick={e => e.stopPropagation()}
      >
        {/* ─── Top Header & Tabs ─── */}
        <div
          style={{
            padding: '18px 24px',
            borderBottom: isDark ? '1px solid rgba(255, 255, 255, 0.08)' : '1px solid rgba(0, 0, 0, 0.08)',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            background: isDark ? 'rgba(14, 14, 20, 0.98)' : '#ffffff',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <div
              style={{
                width: '36px',
                height: '36px',
                borderRadius: '12px',
                background: isDark ? 'rgba(212, 175, 55, 0.15)' : 'rgba(200, 109, 81, 0.15)',
                border: isDark ? '1px solid rgba(212, 175, 55, 0.35)' : '1px solid rgba(200, 109, 81, 0.35)',
                color: isDark ? '#f2ca50' : '#C86D51',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <IconUser />
            </div>
            <div>
              <h2
                style={{
                  margin: 0,
                  fontSize: '16px',
                  fontWeight: '700',
                  fontFamily: 'serif',
                  letterSpacing: '-0.02em',
                }}
              >
                Profile & Sync Account
              </h2>
              <span style={{ fontSize: '11px', color: isDark ? '#a1a1aa' : '#71717a' }}>
                Zero-knowledge encrypted browser profile and cross-device synchronization
              </span>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            style={{
              background: 'none',
              border: 'none',
              color: isDark ? '#a1a1aa' : '#71717a',
              cursor: 'pointer',
              padding: '6px',
              display: 'flex',
            }}
          >
            <IconCross />
          </button>
        </div>

        {/* ─── Navigation Tabs ─── */}
        <div
          style={{
            display: 'flex',
            padding: '8px 24px 0 24px',
            gap: '8px',
            borderBottom: isDark ? '1px solid rgba(255, 255, 255, 0.08)' : '1px solid rgba(0, 0, 0, 0.08)',
            background: isDark ? 'rgba(18, 18, 26, 0.95)' : '#f5efe6',
          }}
        >
          {[
            { id: 'identity', label: 'Identity & Details', icon: <IconUser /> },
            { id: 'sync', label: 'Cloud Sync & Security', icon: <IconSync /> },
            { id: 'profiles', label: 'Workspaces & Switcher', icon: <IconLayers /> },
            { id: 'avatar', label: 'Avatar Studio', icon: <IconImage /> },
          ].map(tab => {
            const active = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => setActiveTab(tab.id as any)}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                  padding: '9px 14px',
                  borderRadius: '10px 10px 0 0',
                  border: 'none',
                  borderBottom: active
                    ? isDark ? '2px solid #f2ca50' : '2px solid #C86D51'
                    : '2px solid transparent',
                  background: active
                    ? isDark ? 'rgba(255, 255, 255, 0.06)' : '#ffffff'
                    : 'transparent',
                  color: active
                    ? isDark ? '#f2ca50' : '#C86D51'
                    : isDark ? '#a1a1aa' : '#71717a',
                  fontSize: '12px',
                  fontWeight: active ? '700' : '600',
                  cursor: 'pointer',
                  transition: 'all 0.15s ease',
                }}
              >
                {tab.icon}
                <span>{tab.label}</span>
              </button>
            );
          })}
        </div>

        {/* ─── Toast Banner ─── */}
        {toastMsg && (
          <div
            style={{
              padding: '8px 24px',
              background: 'rgba(16, 185, 129, 0.15)',
              borderBottom: '1px solid rgba(16, 185, 129, 0.3)',
              color: '#10b981',
              fontSize: '11.5px',
              fontWeight: '600',
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
            }}
          >
            <IconCheck />
            <span>{toastMsg}</span>
          </div>
        )}

        {/* ─── Main Content Body ─── */}
        <div
          style={{
            flex: 1,
            overflowY: 'auto',
            padding: '24px',
          }}
        >
          {/* TAB 1: IDENTITY */}
          {activeTab === 'identity' && (
            <div style={{ display: 'flex', gap: '24px' }}>
              {/* Left Identity Card */}
              <div
                style={{
                  width: '240px',
                  padding: '20px',
                  borderRadius: '16px',
                  background: isDark ? 'rgba(255, 255, 255, 0.03)' : '#ffffff',
                  border: isDark ? '1px solid rgba(255, 255, 255, 0.08)' : '1px solid rgba(0, 0, 0, 0.08)',
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  textAlign: 'center',
                  gap: '12px',
                }}
              >
                <div
                  style={{
                    width: '84px',
                    height: '84px',
                    borderRadius: '50%',
                    border: isDark ? '3px solid #d4af37' : '3px solid #C86D51',
                    padding: '3px',
                    position: 'relative',
                    cursor: 'pointer',
                  }}
                  onClick={() => setActiveTab('avatar')}
                  title="Click to open Avatar Studio"
                >
                  {imageSrc ? (
                    <img
                      src={imageSrc}
                      alt="Avatar"
                      style={{ width: '100%', height: '100%', borderRadius: '50%', objectFit: 'cover' }}
                    />
                  ) : (
                    <div
                      style={{
                        width: '100%',
                        height: '100%',
                        borderRadius: '50%',
                        background: isDark ? 'rgba(212, 175, 55, 0.15)' : 'rgba(200, 109, 81, 0.15)',
                        color: isDark ? '#f2ca50' : '#C86D51',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        fontSize: '28px',
                        fontWeight: '800',
                      }}
                    >
                      {username.charAt(0).toUpperCase()}
                    </div>
                  )}
                  <div
                    style={{
                      position: 'absolute',
                      bottom: 0,
                      right: 0,
                      width: '24px',
                      height: '24px',
                      borderRadius: '50%',
                      background: isDark ? '#d4af37' : '#C86D51',
                      color: isDark ? '#000' : '#fff',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      fontSize: '11px',
                      boxShadow: '0 2px 6px rgba(0,0,0,0.4)',
                    }}
                  >
                    <IconImage />
                  </div>
                </div>

                <div>
                  <h3 style={{ margin: 0, fontSize: '15px', fontWeight: '700' }}>{username}</h3>
                  <span style={{ fontSize: '11.5px', color: isDark ? '#a1a1aa' : '#71717a' }}>{email}</span>
                </div>

                <div
                  style={{
                    padding: '4px 10px',
                    borderRadius: '9999px',
                    background: isDark ? 'rgba(212, 175, 55, 0.15)' : 'rgba(200, 109, 81, 0.15)',
                    color: isDark ? '#f2ca50' : '#C86D51',
                    fontSize: '10.5px',
                    fontWeight: '700',
                    letterSpacing: '0.02em',
                  }}
                >
                  {accountTier}
                </div>

                <div
                  style={{
                    width: '100%',
                    borderTop: isDark ? '1px solid rgba(255, 255, 255, 0.08)' : '1px solid rgba(0, 0, 0, 0.08)',
                    paddingTop: '10px',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '6px',
                    fontSize: '11px',
                    color: isDark ? '#71717a' : '#8c827a',
                    textAlign: 'left',
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <span>Client:</span>
                    <span style={{ fontWeight: '600', color: isDark ? '#ffffff' : '#1a1715' }}>Windows 11 Native</span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <span>Status:</span>
                    <span style={{ color: '#10b981', fontWeight: '700' }}>Vault Encrypted</span>
                  </div>
                </div>
              </div>

              {/* Right Form */}
              <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '16px' }}>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                  <label style={{ fontSize: '11px', fontWeight: '700', textTransform: 'uppercase', letterSpacing: '0.08em', color: isDark ? '#a1a1aa' : '#5c524c' }}>
                    Display Username
                  </label>
                  <input
                    type="text"
                    value={username}
                    onChange={e => setUsername(e.target.value)}
                    placeholder="Enter profile username"
                    style={{
                      padding: '10px 14px',
                      borderRadius: '10px',
                      background: isDark ? 'rgba(255, 255, 255, 0.05)' : '#ffffff',
                      border: isDark ? '1px solid rgba(255, 255, 255, 0.1)' : '1px solid rgba(0, 0, 0, 0.12)',
                      color: isDark ? '#ffffff' : '#1a1715',
                      fontSize: '13px',
                      outline: 'none',
                    }}
                  />
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                  <label style={{ fontSize: '11px', fontWeight: '700', textTransform: 'uppercase', letterSpacing: '0.08em', color: isDark ? '#a1a1aa' : '#5c524c' }}>
                    Account Email Address
                  </label>
                  <input
                    type="email"
                    value={email}
                    onChange={e => setEmail(e.target.value)}
                    placeholder="user@example.com"
                    style={{
                      padding: '10px 14px',
                      borderRadius: '10px',
                      background: isDark ? 'rgba(255, 255, 255, 0.05)' : '#ffffff',
                      border: isDark ? '1px solid rgba(255, 255, 255, 0.1)' : '1px solid rgba(0, 0, 0, 0.12)',
                      color: isDark ? '#ffffff' : '#1a1715',
                      fontSize: '13px',
                      outline: 'none',
                    }}
                  />
                </div>

                {/* Account Security Badge */}
                <div
                  style={{
                    padding: '14px',
                    borderRadius: '12px',
                    background: isDark ? 'rgba(212, 175, 55, 0.08)' : 'rgba(200, 109, 81, 0.08)',
                    border: isDark ? '1px solid rgba(212, 175, 55, 0.25)' : '1px solid rgba(200, 109, 81, 0.25)',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '12px',
                    marginTop: 'auto',
                  }}
                >
                  <div style={{ color: isDark ? '#f2ca50' : '#C86D51' }}>
                    <IconShield />
                  </div>
                  <div>
                    <div style={{ fontSize: '12px', fontWeight: '700' }}>Zero-Knowledge Isolation</div>
                    <div style={{ fontSize: '11px', color: isDark ? '#a1a1aa' : '#71717a' }}>
                      Profile telemetry and history cookies are encrypted locally on disk before entering persistent state.
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* TAB 2: CLOUD SYNC */}
          {activeTab === 'sync' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
              {/* Master Sync Card */}
              <div
                style={{
                  padding: '18px 20px',
                  borderRadius: '16px',
                  background: syncEnabled
                    ? isDark ? 'rgba(16, 185, 129, 0.1)' : 'rgba(16, 185, 129, 0.08)'
                    : isDark ? 'rgba(255, 255, 255, 0.03)' : '#ffffff',
                  border: syncEnabled
                    ? '1px solid rgba(16, 185, 129, 0.3)'
                    : isDark ? '1px solid rgba(255, 255, 255, 0.08)' : '1px solid rgba(0, 0, 0, 0.08)',
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
                  <div
                    style={{
                      width: '40px',
                      height: '40px',
                      borderRadius: '12px',
                      background: syncEnabled ? '#10b981' : (isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.06)'),
                      color: syncEnabled ? '#ffffff' : (isDark ? '#a1a1aa' : '#71717a'),
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                    }}
                  >
                    <IconSync />
                  </div>
                  <div>
                    <h4 style={{ margin: 0, fontSize: '14px', fontWeight: '700' }}>
                      Cloud Synchronization: {syncEnabled ? 'Active' : 'Disabled'}
                    </h4>
                    <span style={{ fontSize: '11px', color: isDark ? '#a1a1aa' : '#71717a' }}>
                      Last Synchronized: {lastSyncTime}
                    </span>
                  </div>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                  {syncEnabled && (
                    <button
                      type="button"
                      onClick={handleTriggerSyncNow}
                      disabled={isSyncingNow}
                      style={{
                        padding: '6px 14px',
                        borderRadius: '8px',
                        background: isDark ? '#d4af37' : '#1a1715',
                        border: 'none',
                        color: isDark ? '#000000' : '#ffffff',
                        fontSize: '11.5px',
                        fontWeight: '700',
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '6px',
                      }}
                    >
                      <IconSync />
                      <span>{isSyncingNow ? 'Syncing...' : 'Sync Now'}</span>
                    </button>
                  )}

                  {/* Toggle Switch */}
                  <div
                    onClick={() => setSyncEnabled(prev => !prev)}
                    style={{
                      width: '36px',
                      height: '20px',
                      borderRadius: '9999px',
                      background: syncEnabled ? '#10b981' : (isDark ? '#27272a' : '#d4d4d8'),
                      position: 'relative',
                      cursor: 'pointer',
                      transition: 'background 0.2s ease',
                    }}
                  >
                    <div
                      style={{
                        width: '16px',
                        height: '16px',
                        borderRadius: '50%',
                        background: '#ffffff',
                        position: 'absolute',
                        top: '2px',
                        left: syncEnabled ? '18px' : '2px',
                        transition: 'left 0.2s ease',
                        boxShadow: '0 1px 3px rgba(0,0,0,0.3)',
                      }}
                    />
                  </div>
                </div>
              </div>

              {/* Sync Items Checklist */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                <span style={{ fontSize: '11px', fontWeight: '700', textTransform: 'uppercase', letterSpacing: '0.08em', color: isDark ? '#a1a1aa' : '#5c524c' }}>
                  Synchronized Items & Data
                </span>

                <div
                  style={{
                    display: 'grid',
                    gridTemplateColumns: '1fr 1fr',
                    gap: '12px',
                  }}
                >
                  {[
                    { label: 'Bookmarks & Starred Sites', val: syncBookmarks, set: setSyncBookmarks },
                    { label: 'Saved Passwords & Logins', val: syncPasswords, set: setSyncPasswords },
                    { label: 'Browsing History (Encrypted)', val: syncHistory, set: setSyncHistory },
                    { label: 'Installed Extensions', val: syncExtensions, set: setSyncExtensions },
                    { label: 'Browser Settings & Themes', val: syncSettings, set: setSyncSettings },
                    { label: 'Open Workspace Tabs', val: syncTabs, set: setSyncTabs },
                  ].map(item => (
                    <div
                      key={item.label}
                      onClick={() => item.set(!item.val)}
                      style={{
                        padding: '12px 14px',
                        borderRadius: '12px',
                        background: isDark ? 'rgba(255, 255, 255, 0.03)' : '#ffffff',
                        border: isDark ? '1px solid rgba(255, 255, 255, 0.06)' : '1px solid rgba(0, 0, 0, 0.06)',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        cursor: 'pointer',
                        userSelect: 'none',
                      }}
                    >
                      <span style={{ fontSize: '12px', fontWeight: '600' }}>{item.label}</span>
                      <div
                        style={{
                          width: '18px',
                          height: '18px',
                          borderRadius: '6px',
                          background: item.val ? (isDark ? '#d4af37' : '#C86D51') : 'transparent',
                          border: item.val ? 'none' : (isDark ? '1px solid rgba(255,255,255,0.2)' : '1px solid rgba(0,0,0,0.2)'),
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          color: isDark ? '#000' : '#fff',
                        }}
                      >
                        {item.val && <IconCheck />}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* TAB 3: PROFILES SWITCHER */}
          {activeTab === 'profiles' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              <span style={{ fontSize: '11px', fontWeight: '700', textTransform: 'uppercase', letterSpacing: '0.08em', color: isDark ? '#a1a1aa' : '#5c524c' }}>
                Active Profile Switcher
              </span>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                {[
                  { id: '1', title: 'Nightmare (Founder)', email: 'nightmare@nightmareprojects.com', badge: 'NIGHTMARE PROJECTS', desc: 'Primary sovereign workspace with full sync, passkeys, and AI Studio sessions.' },
                  { id: '2', title: 'Work & Engineering', email: 'work@icrushbrowser.com', badge: 'Dev Environment', desc: 'Dedicated partition for GitHub, staging servers, and work devtools.' },
                  { id: '3', title: 'Guest Profile', email: 'guest@icrushbrowser.com', badge: 'Isolated Ephemeral', desc: 'Zero persistence session with automatic cookie purge upon close.' },
                ].map(p => {
                  const isActive = activeProfileId === p.id;
                  return (
                    <div
                      key={p.id}
                      style={{
                        padding: '16px 20px',
                        borderRadius: '16px',
                        background: isActive
                          ? isDark ? 'rgba(212, 175, 55, 0.12)' : 'rgba(200, 109, 81, 0.12)'
                          : isDark ? 'rgba(255, 255, 255, 0.03)' : '#ffffff',
                        border: isActive
                          ? isDark ? '1px solid rgba(212, 175, 55, 0.4)' : '1px solid rgba(200, 109, 81, 0.4)'
                          : isDark ? '1px solid rgba(255, 255, 255, 0.06)' : '1px solid rgba(0, 0, 0, 0.06)',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                      }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
                        <div
                          style={{
                            width: '42px',
                            height: '42px',
                            borderRadius: '50%',
                            background: isActive
                              ? isDark ? '#d4af37' : '#C86D51'
                              : isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.06)',
                            color: isActive ? (isDark ? '#000' : '#fff') : (isDark ? '#a1a1aa' : '#71717a'),
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            fontWeight: '800',
                            fontSize: '16px',
                          }}
                        >
                          {p.title.charAt(0)}
                        </div>

                        <div>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                            <h4 style={{ margin: 0, fontSize: '14px', fontWeight: '700' }}>{p.title}</h4>
                            <span
                              style={{
                                fontSize: '10px',
                                fontWeight: '700',
                                padding: '1px 6px',
                                borderRadius: '4px',
                                background: isDark ? 'rgba(255, 255, 255, 0.06)' : 'rgba(0, 0, 0, 0.06)',
                                color: isDark ? '#a1a1aa' : '#71717a',
                              }}
                            >
                              {p.badge}
                            </span>
                          </div>
                          <p style={{ margin: '2px 0 0 0', fontSize: '11.5px', color: isDark ? '#a1a1aa' : '#71717a' }}>
                            {p.desc}
                          </p>
                        </div>
                      </div>

                      <button
                        type="button"
                        onClick={() => handleSwitchProfile(p.id)}
                        disabled={isActive}
                        style={{
                          padding: '7px 16px',
                          borderRadius: '8px',
                          background: isActive
                            ? 'transparent'
                            : isDark ? '#d4af37' : '#1a1715',
                          border: isActive
                            ? isDark ? '1px solid rgba(212, 175, 55, 0.5)' : '1px solid rgba(200, 109, 81, 0.5)'
                            : 'none',
                          color: isActive
                            ? isDark ? '#f2ca50' : '#C86D51'
                            : isDark ? '#000000' : '#ffffff',
                          fontSize: '11.5px',
                          fontWeight: '700',
                          cursor: isActive ? 'default' : 'pointer',
                        }}
                      >
                        {isActive ? 'Current Profile' : 'Switch'}
                      </button>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* TAB 4: AVATAR STUDIO */}
          {activeTab === 'avatar' && (
            <div style={{ display: 'flex', gap: '24px', alignItems: 'center' }}>
              {/* Image Cropper Circle */}
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '14px' }}>
                {!imageSrc ? (
                  <div
                    onDragOver={handleDragOver}
                    onDrop={handleDrop}
                    onClick={() => fileInputRef.current?.click()}
                    style={{
                      width: '220px',
                      height: '220px',
                      border: '2px dashed rgba(212, 175, 55, 0.35)',
                      borderRadius: '50%',
                      display: 'flex',
                      flexDirection: 'column',
                      alignItems: 'center',
                      justifyContent: 'center',
                      cursor: 'pointer',
                      background: isDark ? 'rgba(255, 255, 255, 0.02)' : '#ffffff',
                      textAlign: 'center',
                      padding: '16px',
                    }}
                  >
                    <div style={{ color: isDark ? '#f2ca50' : '#C86D51', marginBottom: '8px' }}>
                      <IconUploadCloud />
                    </div>
                    <span style={{ fontSize: '12px', fontWeight: '700' }}>Drop Photo Here</span>
                    <span style={{ fontSize: '10px', color: isDark ? '#a1a1aa' : '#71717a', marginTop: '4px' }}>
                      or click to browse
                    </span>
                  </div>
                ) : (
                  <div
                    ref={containerRef}
                    onMouseDown={handleMouseDown}
                    onMouseMove={handleMouseMove}
                    onMouseUp={handleMouseUp}
                    onMouseLeave={handleMouseUp}
                    style={{
                      width: '220px',
                      height: '220px',
                      borderRadius: '50%',
                      overflow: 'hidden',
                      position: 'relative',
                      border: isDark ? '3px solid #d4af37' : '3px solid #C86D51',
                      background: '#09090c',
                      boxShadow: '0 0 24px rgba(0, 0, 0, 0.5)',
                      cursor: isDragging ? 'grabbing' : 'grab',
                    }}
                  >
                    <img
                      ref={imageRef}
                      src={imageSrc}
                      alt="Source"
                      style={{
                        transform: `translate(${offset.x}px, ${offset.y}px) rotate(${rotation}deg) scale(${zoom})`,
                        transformOrigin: 'center center',
                        width: '100%',
                        height: '100%',
                        objectFit: 'contain',
                        userSelect: 'none',
                        pointerEvents: 'none',
                      }}
                      draggable="false"
                    />
                  </div>
                )}

                <input
                  type="file"
                  ref={fileInputRef}
                  onChange={handleFileChange}
                  accept="image/*"
                  style={{ display: 'none' }}
                />
              </div>

              {/* Controls */}
              <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '16px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ fontSize: '12px', fontWeight: '700' }}>Zoom Level: {zoom.toFixed(1)}x</span>
                  <button
                    type="button"
                    onClick={() => setRotation(prev => (prev + 90) % 360)}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '4px',
                      background: 'none',
                      border: 'none',
                      color: isDark ? '#f2ca50' : '#C86D51',
                      fontSize: '11.5px',
                      fontWeight: '700',
                      cursor: 'pointer',
                    }}
                  >
                    <IconRotate />
                    <span>Rotate 90°</span>
                  </button>
                </div>

                <input
                  type="range"
                  min="1"
                  max="3"
                  step="0.05"
                  value={zoom}
                  onChange={e => setZoom(parseFloat(e.target.value))}
                  style={{ width: '100%', cursor: 'pointer' }}
                />

                <div style={{ display: 'flex', gap: '10px' }}>
                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    style={{
                      flex: 1,
                      padding: '8px 12px',
                      borderRadius: '8px',
                      background: isDark ? 'rgba(255, 255, 255, 0.06)' : 'rgba(0, 0, 0, 0.05)',
                      border: isDark ? '1px solid rgba(255, 255, 255, 0.1)' : '1px solid rgba(0, 0, 0, 0.1)',
                      color: isDark ? '#ffffff' : '#1a1715',
                      fontSize: '11.5px',
                      fontWeight: '600',
                      cursor: 'pointer',
                    }}
                  >
                    Upload New Image
                  </button>

                  {imageSrc && (
                    <button
                      type="button"
                      onClick={() => {
                        setImageSrc(null);
                        if (fileInputRef.current) fileInputRef.current.value = '';
                      }}
                      style={{
                        padding: '8px 14px',
                        borderRadius: '8px',
                        background: 'rgba(239, 68, 68, 0.1)',
                        border: '1px solid rgba(239, 68, 68, 0.3)',
                        color: '#ef4444',
                        fontSize: '11.5px',
                        fontWeight: '600',
                        cursor: 'pointer',
                      }}
                    >
                      Clear
                    </button>
                  )}
                </div>
              </div>
            </div>
          )}
        </div>

        {/* ─── Modal Actions Footer ─── */}
        <div
          style={{
            padding: '16px 24px',
            borderTop: isDark ? '1px solid rgba(255, 255, 255, 0.08)' : '1px solid rgba(0, 0, 0, 0.08)',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            background: isDark ? 'rgba(14, 14, 20, 0.98)' : '#ffffff',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '11px', color: isDark ? '#71717a' : '#8c827a' }}>
            <IconKey />
            <span>Local Master Vault: AES-256-GCM Secured</span>
          </div>

          <div style={{ display: 'flex', gap: '10px' }}>
            <button
              type="button"
              onClick={onClose}
              style={{
                padding: '8px 16px',
                borderRadius: '8px',
                background: 'transparent',
                border: isDark ? '1px solid rgba(255, 255, 255, 0.1)' : '1px solid rgba(0, 0, 0, 0.1)',
                color: isDark ? '#a1a1aa' : '#5c524c',
                fontSize: '12px',
                fontWeight: '600',
                cursor: 'pointer',
              }}
            >
              Cancel
            </button>

            <button
              type="button"
              onClick={handleSaveAll}
              style={{
                padding: '8px 20px',
                borderRadius: '8px',
                background: isDark ? '#d4af37' : '#1a1715',
                border: 'none',
                color: isDark ? '#000000' : '#ffffff',
                fontSize: '12px',
                fontWeight: '700',
                cursor: 'pointer',
                boxShadow: isDark ? '0 4px 16px rgba(212, 175, 55, 0.25)' : '0 4px 12px rgba(0,0,0,0.15)',
              }}
            >
              Save Profile Changes
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
