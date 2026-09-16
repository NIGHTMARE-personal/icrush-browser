import React, { useState, useEffect, useCallback } from 'react';

export interface ExtensionMetadata {
  id: string;
  name: string;
  version: string;
  path: string;
  enabled: boolean;
  description?: string;
  homepageUrl?: string;
  permissions?: string[];
}

interface ExtensionsDashboardProps {
  onNavigate?: (url: string) => void;
  onCreateTab?: (url: string) => void;
  onOpenSettings?: (tab?: string) => void;
}

/* ─────────────────────────────────────────────────────────────
   Crisp Minimal SVG Line Icons (No Emojis - Professional Style)
   ───────────────────────────────────────────────────────────── */

const IconPuzzle = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M20.5 11H19V7a2 2 0 0 0-2-2h-4V3.5a2.5 2.5 0 0 0-5 0V5H4a2 2 0 0 0-2 2v3.8h1.5a2.5 2.5 0 0 1 0 5H2v4a2 2 0 0 0 2 2h3.8v-1.5a2.5 2.5 0 0 1 5 0V22H17a2 2 0 0 0 2-2v-4h1.5a2.5 2.5 0 0 0 0-5z" />
  </svg>
);

const IconSearch = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="11" cy="11" r="8" />
    <line x1="21" y1="21" x2="16.65" y2="16.65" />
  </svg>
);

const IconUpload = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
    <polyline points="17 8 12 3 7 8" />
    <line x1="12" y1="3" x2="12" y2="15" />
  </svg>
);

const IconDownload = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
    <polyline points="7 10 12 15 17 10" />
    <line x1="12" y1="15" x2="12" y2="3" />
  </svg>
);

const IconRefresh = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <polyline points="23 4 23 10 17 10" />
    <polyline points="1 20 1 14 7 14" />
    <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15" />
  </svg>
);

const IconTrash = () => (
  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <polyline points="3 6 5 6 21 6" />
    <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
  </svg>
);

const IconExternalLink = () => (
  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
    <polyline points="15 3 21 3 21 9" />
    <line x1="10" y1="14" x2="21" y2="3" />
  </svg>
);

const IconCheck = () => (
  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
    <polyline points="20 6 9 17 4 12" />
  </svg>
);

const IconCross = () => (
  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <line x1="18" y1="6" x2="6" y2="18" />
    <line x1="6" y1="6" x2="18" y2="18" />
  </svg>
);

export function ExtensionsDashboard({
  onNavigate,
  onCreateTab,
  onOpenSettings,
}: ExtensionsDashboardProps) {
  const isDark = (localStorage.getItem('homescreen_theme_mode') || 'deep-canvas') === 'deep-canvas';

  const [extensions, setExtensions] = useState<ExtensionMetadata[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [devMode, setDevMode] = useState<boolean>(() => {
    return localStorage.getItem('extensions_dev_mode') === 'true';
  });

  const [isLoading, setIsLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  // URL install modal state
  const [showUrlModal, setShowUrlModal] = useState(false);
  const [installUrl, setInstallUrl] = useState('');
  const [isInstallingUrl, setIsInstallingUrl] = useState(false);

  // Details drawer state
  const [detailsExt, setDetailsExt] = useState<ExtensionMetadata | null>(null);

  const notifyToast = (msg: string, isError = false) => {
    if (isError) {
      setErrorMsg(msg);
      setTimeout(() => setErrorMsg(null), 5000);
    } else {
      setSuccessMsg(msg);
      setTimeout(() => setSuccessMsg(null), 3500);
    }
  };

  // Real backend loader
  const loadExtensions = useCallback(async () => {
    setIsLoading(true);
    try {
      if (window.electronAPI?.extensions?.getExtensions) {
        const list = await window.electronAPI.extensions.getExtensions();
        setExtensions(Array.isArray(list) ? list : []);
      }
    } catch (err: any) {
      console.error('Failed to load extensions:', err);
      notifyToast('Failed to load extensions: ' + (err?.message || String(err)), true);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    loadExtensions();

    const handleExtModified = () => {
      loadExtensions();
    };

    window.addEventListener('extensions-modified', handleExtModified);
    return () => {
      window.removeEventListener('extensions-modified', handleExtModified);
    };
  }, [loadExtensions]);

  const handleToggleDevMode = () => {
    setDevMode(prev => {
      const next = !prev;
      localStorage.setItem('extensions_dev_mode', String(next));
      return next;
    });
  };

  // Real toggle enable/disable
  const handleToggleExtension = async (ext: ExtensionMetadata) => {
    const nextState = !ext.enabled;
    try {
      // Optimistic UI update
      setExtensions(prev =>
        prev.map(e => (e.id === ext.id ? { ...e, enabled: nextState } : e))
      );

      if (window.electronAPI?.extensions?.toggleExtension) {
        await window.electronAPI.extensions.toggleExtension(ext.id, nextState);
        window.dispatchEvent(new Event('extensions-modified'));
        notifyToast(`${ext.name} ${nextState ? 'enabled' : 'disabled'}.`);
      }
    } catch (err: any) {
      // Revert
      setExtensions(prev =>
        prev.map(e => (e.id === ext.id ? { ...e, enabled: ext.enabled } : e))
      );
      notifyToast(`Failed to toggle ${ext.name}: ` + (err?.message || String(err)), true);
    }
  };

  // Real remove extension
  const handleRemoveExtension = async (ext: ExtensionMetadata) => {
    if (!window.confirm(`Are you sure you want to remove "${ext.name}"?`)) return;

    try {
      if (window.electronAPI?.extensions?.removeExtension) {
        await window.electronAPI.extensions.removeExtension(ext.id);
        setExtensions(prev => prev.filter(e => e.id !== ext.id));
        if (detailsExt?.id === ext.id) setDetailsExt(null);
        window.dispatchEvent(new Event('extensions-modified'));
        notifyToast(`Removed extension "${ext.name}".`);
      }
    } catch (err: any) {
      notifyToast(`Failed to remove "${ext.name}": ` + (err?.message || String(err)), true);
    }
  };

  // Real reload extension from folder
  const handleReloadExtension = async (ext: ExtensionMetadata) => {
    try {
      if (window.electronAPI?.extensions?.loadExtension && ext.path) {
        await window.electronAPI.extensions.loadExtension(ext.path);
        await loadExtensions();
        window.dispatchEvent(new Event('extensions-modified'));
        notifyToast(`Reloaded "${ext.name}" from disk.`);
      }
    } catch (err: any) {
      notifyToast(`Failed to reload "${ext.name}": ` + (err?.message || String(err)), true);
    }
  };

  // Real Load Unpacked from Directory
  const handleLoadUnpacked = async () => {
    try {
      if (!window.electronAPI?.extensions?.selectDirectory) {
        notifyToast('Directory selection is only available inside Electron desktop runtime.', true);
        return;
      }

      const dir = await window.electronAPI.extensions.selectDirectory();
      if (!dir) return;

      setIsLoading(true);
      const ext = await window.electronAPI.extensions.loadExtension(dir);
      await loadExtensions();
      window.dispatchEvent(new Event('extensions-modified'));
      notifyToast(`Loaded unpacked extension "${ext?.name || 'Extension'}"!`);
    } catch (err: any) {
      notifyToast('Failed to load unpacked extension: ' + (err?.message || String(err)), true);
    } finally {
      setIsLoading(false);
    }
  };

  // Real Install from URL
  const handleInstallFromUrl = async () => {
    if (!installUrl.trim()) return;
    setIsInstallingUrl(true);
    try {
      const extApi: any = window.electronAPI?.extensions;
      if (extApi?.installFromUrl) {
        await extApi.installFromUrl(installUrl.trim());
        setInstallUrl('');
        setShowUrlModal(false);
        await loadExtensions();
        window.dispatchEvent(new Event('extensions-modified'));
        notifyToast('Extension installed and loaded successfully!');
      } else {
        throw new Error('Install from URL is not supported in this runtime.');
      }
    } catch (err: any) {
      notifyToast('Installation failed: ' + (err?.message || String(err)), true);
    } finally {
      setIsInstallingUrl(false);
    }
  };

  // Filtered extensions
  const filteredExtensions = extensions.filter(ext => {
    const q = searchQuery.toLowerCase().trim();
    if (!q) return true;
    return (
      ext.name.toLowerCase().includes(q) ||
      ext.id.toLowerCase().includes(q) ||
      (ext.description && ext.description.toLowerCase().includes(q))
    );
  });

  const activeCount = extensions.filter(e => e.enabled).length;

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        height: '100%',
        width: '100%',
        background: isDark ? '#0c0c10' : '#F9F6F0',
        color: isDark ? '#f9f6f0' : '#1a1715',
        overflow: 'hidden',
        fontFamily: 'system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
      }}
    >
      {/* ─── Top Control Navigation Header ─── */}
      <header
        style={{
          padding: '16px 36px',
          borderBottom: isDark ? '1px solid rgba(255, 255, 255, 0.08)' : '1px solid rgba(0, 0, 0, 0.08)',
          background: isDark ? 'rgba(14, 14, 20, 0.95)' : 'rgba(255, 255, 255, 0.95)',
          backdropFilter: 'blur(20px)',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          gap: '24px',
          zIndex: 20,
        }}
      >
        {/* Left: Branding & Breadcrumb */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
          <div
            style={{
              width: '38px',
              height: '38px',
              borderRadius: '12px',
              background: isDark ? 'rgba(212, 175, 55, 0.15)' : 'rgba(200, 109, 81, 0.15)',
              border: isDark ? '1px solid rgba(212, 175, 55, 0.35)' : '1px solid rgba(200, 109, 81, 0.35)',
              color: isDark ? '#f2ca50' : '#C86D51',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <IconPuzzle />
          </div>

          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <h1
                style={{
                  margin: 0,
                  fontSize: '18px',
                  fontWeight: '700',
                  fontFamily: 'serif',
                  letterSpacing: '-0.02em',
                }}
              >
                Extensions
              </h1>
              <span
                style={{
                  fontSize: '10.5px',
                  fontWeight: '700',
                  padding: '2px 8px',
                  borderRadius: '9999px',
                  background: isDark ? 'rgba(255, 255, 255, 0.06)' : 'rgba(0, 0, 0, 0.06)',
                  color: isDark ? '#a1a1aa' : '#71717a',
                }}
              >
                {activeCount} Active • {extensions.length} Installed
              </span>
            </div>
            <p style={{ margin: 0, fontSize: '11px', color: isDark ? '#71717a' : '#8c827a' }}>
              Manage installed add-ons, runtime capabilities, and developer extensions
            </p>
          </div>
        </div>

        {/* Center: Search Box */}
        <div
          style={{
            flex: 1,
            maxWidth: '460px',
            position: 'relative',
            display: 'flex',
            alignItems: 'center',
          }}
        >
          <div
            style={{
              position: 'absolute',
              left: '12px',
              display: 'flex',
              alignItems: 'center',
              color: isDark ? '#71717a' : '#a1a1aa',
              pointerEvents: 'none',
            }}
          >
            <IconSearch />
          </div>
          <input
            type="text"
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            placeholder="Search extensions by name, ID, or keyword..."
            style={{
              width: '100%',
              padding: '8px 14px 8px 36px',
              borderRadius: '9999px',
              background: isDark ? 'rgba(255, 255, 255, 0.04)' : 'rgba(0, 0, 0, 0.04)',
              border: isDark ? '1px solid rgba(255, 255, 255, 0.08)' : '1px solid rgba(0, 0, 0, 0.08)',
              color: isDark ? '#ffffff' : '#1a1715',
              fontSize: '12.5px',
              outline: 'none',
              transition: 'border-color 0.15s ease',
            }}
          />
          {searchQuery && (
            <button
              type="button"
              onClick={() => setSearchQuery('')}
              style={{
                position: 'absolute',
                right: '10px',
                background: 'none',
                border: 'none',
                color: isDark ? '#71717a' : '#a1a1aa',
                cursor: 'pointer',
                padding: '2px',
                display: 'flex',
              }}
            >
              <IconCross />
            </button>
          )}
        </div>

        {/* Right: Actions & Dev Mode Toggle */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
          {/* Developer Mode Switch */}
          <div
            onClick={handleToggleDevMode}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              cursor: 'pointer',
              userSelect: 'none',
              padding: '6px 12px',
              borderRadius: '10px',
              background: devMode ? (isDark ? 'rgba(212, 175, 55, 0.12)' : 'rgba(200, 109, 81, 0.12)') : 'transparent',
              border: devMode ? (isDark ? '1px solid rgba(212, 175, 55, 0.3)' : '1px solid rgba(200, 109, 81, 0.3)') : '1px solid transparent',
              transition: 'all 0.15s ease',
            }}
            title="Toggle Developer mode to load unpacked extensions, inspect views, and access extension IDs"
          >
            <span
              style={{
                fontSize: '11.5px',
                fontWeight: '700',
                letterSpacing: '0.02em',
                color: devMode ? (isDark ? '#f2ca50' : '#C86D51') : (isDark ? '#a1a1aa' : '#5c524c'),
              }}
            >
              Developer mode
            </span>
            <div
              style={{
                width: '32px',
                height: '18px',
                borderRadius: '9999px',
                background: devMode ? (isDark ? '#d4af37' : '#C86D51') : (isDark ? '#27272a' : '#d4d4d8'),
                position: 'relative',
                transition: 'background 0.2s ease',
              }}
            >
              <div
                style={{
                  width: '14px',
                  height: '14px',
                  borderRadius: '50%',
                  background: '#ffffff',
                  position: 'absolute',
                  top: '2px',
                  left: devMode ? '16px' : '2px',
                  transition: 'left 0.2s ease',
                  boxShadow: '0 1px 3px rgba(0,0,0,0.3)',
                }}
              />
            </div>
          </div>

          <button
            type="button"
            onClick={() => onNavigate?.('about:blank')}
            style={{
              background: isDark ? 'rgba(255, 255, 255, 0.05)' : 'rgba(0, 0, 0, 0.05)',
              border: isDark ? '1px solid rgba(255, 255, 255, 0.08)' : '1px solid rgba(0, 0, 0, 0.08)',
              borderRadius: '8px',
              padding: '6px 12px',
              fontSize: '11.5px',
              fontWeight: '600',
              color: isDark ? '#a1a1aa' : '#5c524c',
              cursor: 'pointer',
            }}
          >
            Done
          </button>
        </div>
      </header>

      {/* ─── Developer Mode Action Ribbon ─── */}
      {devMode && (
        <div
          style={{
            padding: '10px 36px',
            background: isDark ? 'rgba(18, 18, 26, 0.9)' : '#f3ede4',
            borderBottom: isDark ? '1px solid rgba(212, 175, 55, 0.2)' : '1px solid rgba(200, 109, 81, 0.2)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: '12px',
            animation: 'fadeIn 0.15s ease',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <button
              type="button"
              onClick={handleLoadUnpacked}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
                padding: '6px 14px',
                borderRadius: '8px',
                background: isDark ? 'rgba(212, 175, 55, 0.15)' : 'rgba(200, 109, 81, 0.15)',
                border: isDark ? '1px solid rgba(212, 175, 55, 0.35)' : '1px solid rgba(200, 109, 81, 0.35)',
                color: isDark ? '#f2ca50' : '#C86D51',
                fontSize: '11.5px',
                fontWeight: '700',
                cursor: 'pointer',
              }}
            >
              <IconUpload />
              <span>Load unpacked</span>
            </button>

            <button
              type="button"
              onClick={() => setShowUrlModal(true)}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
                padding: '6px 14px',
                borderRadius: '8px',
                background: isDark ? 'rgba(255, 255, 255, 0.06)' : 'rgba(0, 0, 0, 0.05)',
                border: isDark ? '1px solid rgba(255, 255, 255, 0.1)' : '1px solid rgba(0, 0, 0, 0.1)',
                color: isDark ? '#f9f6f0' : '#1a1715',
                fontSize: '11.5px',
                fontWeight: '600',
                cursor: 'pointer',
              }}
            >
              <IconDownload />
              <span>Install from URL / Web Store</span>
            </button>

            <button
              type="button"
              onClick={() => {
                loadExtensions();
                notifyToast('Refreshed extension catalog from disk.');
              }}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
                padding: '6px 14px',
                borderRadius: '8px',
                background: isDark ? 'rgba(255, 255, 255, 0.06)' : 'rgba(0, 0, 0, 0.05)',
                border: isDark ? '1px solid rgba(255, 255, 255, 0.1)' : '1px solid rgba(0, 0, 0, 0.1)',
                color: isDark ? '#f9f6f0' : '#1a1715',
                fontSize: '11.5px',
                fontWeight: '600',
                cursor: 'pointer',
              }}
            >
              <IconRefresh />
              <span>Update All</span>
            </button>
          </div>

          <div style={{ fontSize: '11px', color: isDark ? '#a1a1aa' : '#71717a' }}>
            Inspect views, reload unpacked files, and debug background service workers.
          </div>
        </div>
      )}

      {/* ─── Toast Notifications ─── */}
      {successMsg && (
        <div
          style={{
            margin: '12px 36px 0 36px',
            padding: '10px 16px',
            borderRadius: '10px',
            background: 'rgba(16, 185, 129, 0.12)',
            border: '1px solid rgba(16, 185, 129, 0.3)',
            color: '#10b981',
            fontSize: '12px',
            fontWeight: '600',
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
          }}
        >
          <IconCheck />
          <span>{successMsg}</span>
        </div>
      )}

      {errorMsg && (
        <div
          style={{
            margin: '12px 36px 0 36px',
            padding: '10px 16px',
            borderRadius: '10px',
            background: 'rgba(239, 68, 68, 0.12)',
            border: '1px solid rgba(239, 68, 68, 0.3)',
            color: '#ef4444',
            fontSize: '12px',
            fontWeight: '600',
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
          }}
        >
          <IconCross />
          <span>{errorMsg}</span>
        </div>
      )}

      {/* ─── Main Extension Grid Area ─── */}
      <main
        style={{
          flex: 1,
          overflowY: 'auto',
          padding: '24px 36px 48px 36px',
          display: 'flex',
          flexDirection: 'column',
          gap: '24px',
        }}
      >
        {filteredExtensions.length === 0 ? (
          /* Empty / No Matches State */
          <div
            style={{
              maxWidth: '540px',
              margin: '60px auto',
              textAlign: 'center',
              padding: '40px 32px',
              borderRadius: '24px',
              background: isDark ? 'rgba(18, 18, 24, 0.75)' : '#ffffff',
              border: isDark ? '1px solid rgba(255, 255, 255, 0.08)' : '1px solid rgba(0, 0, 0, 0.08)',
              boxShadow: isDark ? '0 16px 40px rgba(0,0,0,0.6)' : '0 12px 32px rgba(0,0,0,0.06)',
            }}
          >
            <div
              style={{
                width: '54px',
                height: '54px',
                borderRadius: '18px',
                background: isDark ? 'rgba(212, 175, 55, 0.15)' : 'rgba(200, 109, 81, 0.15)',
                border: isDark ? '1px solid rgba(212, 175, 55, 0.3)' : '1px solid rgba(200, 109, 81, 0.3)',
                color: isDark ? '#f2ca50' : '#C86D51',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                margin: '0 auto 16px auto',
              }}
            >
              <IconPuzzle />
            </div>

            <h3 style={{ margin: '0 0 8px 0', fontSize: '17px', fontWeight: '700', fontFamily: 'serif' }}>
              {searchQuery ? 'No Extensions Found' : 'No Extensions Installed Yet'}
            </h3>
            <p style={{ margin: '0 0 24px 0', fontSize: '12.5px', color: isDark ? '#a1a1aa' : '#71717a', lineHeight: '1.5' }}>
              {searchQuery
                ? `No installed extension matches "${searchQuery}". Try searching by another keyword.`
                : 'Supercharge your browser with Chrome Web Store add-ons, adblockers, developer tools, or load unpacked extension directories directly from your local filesystem.'}
            </p>

            <div style={{ display: 'flex', justifyContent: 'center', gap: '10px', flexWrap: 'wrap' }}>
              <button
                type="button"
                onClick={handleLoadUnpacked}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px',
                  padding: '9px 18px',
                  borderRadius: '10px',
                  background: isDark ? '#d4af37' : '#1a1715',
                  border: 'none',
                  color: isDark ? '#000000' : '#ffffff',
                  fontSize: '12px',
                  fontWeight: '700',
                  cursor: 'pointer',
                }}
              >
                <IconUpload />
                <span>Load Unpacked Extension</span>
              </button>

              <button
                type="button"
                onClick={() => onCreateTab?.('https://chromewebstore.google.com')}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px',
                  padding: '9px 18px',
                  borderRadius: '10px',
                  background: isDark ? 'rgba(255, 255, 255, 0.06)' : 'rgba(0, 0, 0, 0.05)',
                  border: isDark ? '1px solid rgba(255, 255, 255, 0.1)' : '1px solid rgba(0, 0, 0, 0.1)',
                  color: isDark ? '#ffffff' : '#1a1715',
                  fontSize: '12px',
                  fontWeight: '600',
                  cursor: 'pointer',
                }}
              >
                <IconExternalLink />
                <span>Open Chrome Web Store</span>
              </button>
            </div>
          </div>
        ) : (
          /* Grid of Extension Cards */
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fill, minmax(360px, 1fr))',
              gap: '20px',
            }}
          >
            {filteredExtensions.map(ext => (
              <div
                key={ext.id}
                style={{
                  background: isDark ? 'rgba(18, 18, 24, 0.85)' : '#ffffff',
                  border: ext.enabled
                    ? isDark
                      ? '1px solid rgba(212, 175, 55, 0.25)'
                      : '1px solid rgba(200, 109, 81, 0.25)'
                    : isDark
                    ? '1px solid rgba(255, 255, 255, 0.06)'
                    : '1px solid rgba(0, 0, 0, 0.06)',
                  borderRadius: '18px',
                  padding: '20px',
                  display: 'flex',
                  flexDirection: 'column',
                  justifyContent: 'space-between',
                  gap: '16px',
                  boxShadow: isDark
                    ? '0 12px 32px rgba(0, 0, 0, 0.5)'
                    : '0 8px 24px rgba(0, 0, 0, 0.04)',
                  backdropFilter: 'blur(16px)',
                  transition: 'all 0.2s ease',
                  opacity: ext.enabled ? 1 : 0.72,
                }}
              >
                {/* Card Top: Icon, Title, Version, Status */}
                <div>
                  <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '12px', marginBottom: '10px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                      <div
                        style={{
                          width: '42px',
                          height: '42px',
                          borderRadius: '12px',
                          background: isDark ? 'rgba(255, 255, 255, 0.05)' : 'rgba(0, 0, 0, 0.04)',
                          border: isDark ? '1px solid rgba(255, 255, 255, 0.1)' : '1px solid rgba(0, 0, 0, 0.08)',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          color: ext.enabled
                            ? isDark ? '#f2ca50' : '#C86D51'
                            : isDark ? '#71717a' : '#a1a1aa',
                          fontSize: '16px',
                          fontWeight: '800',
                        }}
                      >
                        {ext.name.charAt(0).toUpperCase()}
                      </div>

                      <div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                          <h4 style={{ margin: 0, fontSize: '14px', fontWeight: '700' }}>
                            {ext.name}
                          </h4>
                          <span
                            style={{
                              fontSize: '10px',
                              fontWeight: '700',
                              padding: '1px 6px',
                              borderRadius: '6px',
                              background: isDark ? 'rgba(255, 255, 255, 0.06)' : 'rgba(0, 0, 0, 0.06)',
                              color: isDark ? '#a1a1aa' : '#71717a',
                            }}
                          >
                            v{ext.version || '1.0.0'}
                          </span>
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginTop: '2px' }}>
                          <span
                            style={{
                              width: '6px',
                              height: '6px',
                              borderRadius: '50%',
                              background: ext.enabled ? '#10b981' : '#71717a',
                            }}
                          />
                          <span style={{ fontSize: '10.5px', color: ext.enabled ? '#10b981' : (isDark ? '#71717a' : '#8c827a'), fontWeight: '600' }}>
                            {ext.enabled ? 'Active & Loaded' : 'Disabled'}
                          </span>
                        </div>
                      </div>
                    </div>

                    {/* Enable / Disable Switch */}
                    <div
                      onClick={() => handleToggleExtension(ext)}
                      style={{
                        width: '36px',
                        height: '20px',
                        borderRadius: '9999px',
                        background: ext.enabled
                          ? isDark ? '#d4af37' : '#C86D51'
                          : isDark ? '#27272a' : '#d4d4d8',
                        position: 'relative',
                        cursor: 'pointer',
                        transition: 'background 0.2s ease',
                      }}
                      title={ext.enabled ? 'Click to disable' : 'Click to enable'}
                    >
                      <div
                        style={{
                          width: '16px',
                          height: '16px',
                          borderRadius: '50%',
                          background: '#ffffff',
                          position: 'absolute',
                          top: '2px',
                          left: ext.enabled ? '18px' : '2px',
                          transition: 'left 0.2s ease',
                          boxShadow: '0 1px 3px rgba(0,0,0,0.3)',
                        }}
                      />
                    </div>
                  </div>

                  <p
                    style={{
                      margin: '0 0 12px 0',
                      fontSize: '12px',
                      color: isDark ? '#a1a1aa' : '#5c524c',
                      lineHeight: '1.45',
                      minHeight: '34px',
                      overflow: 'hidden',
                      display: '-webkit-box',
                      WebkitLineClamp: 2,
                      WebkitBoxOrient: 'vertical',
                    }}
                  >
                    {ext.description || 'Custom browser extension running inside standard partition environment.'}
                  </p>

                  {/* Dev Mode Inspector Info */}
                  {devMode && (
                    <div
                      style={{
                        padding: '8px 10px',
                        borderRadius: '8px',
                        background: isDark ? 'rgba(0, 0, 0, 0.4)' : '#f4eee5',
                        border: isDark ? '1px solid rgba(255, 255, 255, 0.05)' : '1px solid rgba(0, 0, 0, 0.05)',
                        fontSize: '10.5px',
                        display: 'flex',
                        flexDirection: 'column',
                        gap: '4px',
                        fontFamily: 'monospace',
                        color: isDark ? '#a1a1aa' : '#5c524c',
                        marginBottom: '12px',
                      }}
                    >
                      <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                        <span>ID:</span>
                        <span style={{ color: isDark ? '#f2ca50' : '#C86D51', wordBreak: 'break-all' }}>{ext.id}</span>
                      </div>
                      {ext.path && (
                        <div style={{ display: 'flex', justifyContent: 'space-between', gap: '8px' }}>
                          <span>Path:</span>
                          <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '240px' }} title={ext.path}>
                            {ext.path}
                          </span>
                        </div>
                      )}
                    </div>
                  )}
                </div>

                {/* Card Bottom Actions */}
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    borderTop: isDark ? '1px solid rgba(255, 255, 255, 0.06)' : '1px solid rgba(0, 0, 0, 0.06)',
                    paddingTop: '12px',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <button
                      type="button"
                      onClick={() => setDetailsExt(ext)}
                      style={{
                        background: 'transparent',
                        border: isDark ? '1px solid rgba(255, 255, 255, 0.1)' : '1px solid rgba(0, 0, 0, 0.1)',
                        borderRadius: '6px',
                        padding: '4px 10px',
                        fontSize: '11px',
                        fontWeight: '600',
                        color: isDark ? '#e4e4e7' : '#27272a',
                        cursor: 'pointer',
                      }}
                    >
                      Details
                    </button>

                    <button
                      type="button"
                      onClick={() => handleRemoveExtension(ext)}
                      style={{
                        background: 'transparent',
                        border: 'none',
                        color: '#ef4444',
                        padding: '4px 8px',
                        fontSize: '11px',
                        fontWeight: '600',
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '4px',
                      }}
                    >
                      <IconTrash />
                      <span>Remove</span>
                    </button>
                  </div>

                  {devMode && (
                    <button
                      type="button"
                      onClick={() => handleReloadExtension(ext)}
                      title="Reload extension files from disk"
                      style={{
                        background: isDark ? 'rgba(255, 255, 255, 0.06)' : 'rgba(0, 0, 0, 0.05)',
                        border: 'none',
                        borderRadius: '6px',
                        padding: '4px 8px',
                        color: isDark ? '#a1a1aa' : '#5c524c',
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '4px',
                        fontSize: '10.5px',
                        fontWeight: '600',
                      }}
                    >
                      <IconRefresh />
                      <span>Reload</span>
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </main>

      {/* ─── Install from URL Modal ─── */}
      {showUrlModal && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0, 0, 0, 0.75)',
            backdropFilter: 'blur(16px)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 100,
          }}
          onClick={() => setShowUrlModal(false)}
        >
          <div
            style={{
              width: '480px',
              background: isDark ? 'rgba(18, 18, 24, 0.98)' : '#ffffff',
              border: isDark ? '1px solid rgba(212, 175, 55, 0.35)' : '1px solid rgba(0, 0, 0, 0.12)',
              borderRadius: '20px',
              padding: '24px',
              boxShadow: '0 24px 60px rgba(0,0,0,0.7)',
              display: 'flex',
              flexDirection: 'column',
              gap: '16px',
            }}
            onClick={e => e.stopPropagation()}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <h3 style={{ margin: 0, fontSize: '16px', fontWeight: '700', fontFamily: 'serif' }}>
                Install Extension from URL
              </h3>
              <button
                type="button"
                onClick={() => setShowUrlModal(false)}
                style={{ background: 'none', border: 'none', color: isDark ? '#a1a1aa' : '#71717a', cursor: 'pointer' }}
              >
                <IconCross />
              </button>
            </div>

            <p style={{ margin: 0, fontSize: '12px', color: isDark ? '#a1a1aa' : '#71717a', lineHeight: '1.45' }}>
              Enter a direct Chrome Web Store URL, GitHub release ZIP URL, or CRX file URL to download and install into the browser.
            </p>

            <input
              type="text"
              value={installUrl}
              onChange={e => setInstallUrl(e.target.value)}
              placeholder="https://chromewebstore.google.com/detail/... or .crx / .zip link"
              style={{
                width: '100%',
                padding: '10px 14px',
                borderRadius: '10px',
                background: isDark ? 'rgba(255, 255, 255, 0.05)' : 'rgba(0, 0, 0, 0.04)',
                border: isDark ? '1px solid rgba(255, 255, 255, 0.1)' : '1px solid rgba(0, 0, 0, 0.12)',
                color: isDark ? '#ffffff' : '#1a1715',
                fontSize: '12.5px',
                outline: 'none',
              }}
            />

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', marginTop: '8px' }}>
              <button
                type="button"
                onClick={() => setShowUrlModal(false)}
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
                onClick={handleInstallFromUrl}
                disabled={!installUrl.trim() || isInstallingUrl}
                style={{
                  padding: '8px 18px',
                  borderRadius: '8px',
                  background: isDark ? '#d4af37' : '#1a1715',
                  border: 'none',
                  color: isDark ? '#000000' : '#ffffff',
                  fontSize: '12px',
                  fontWeight: '700',
                  cursor: installUrl.trim() && !isInstallingUrl ? 'pointer' : 'default',
                  opacity: installUrl.trim() && !isInstallingUrl ? 1 : 0.6,
                }}
              >
                {isInstallingUrl ? 'Downloading & Extracting...' : 'Install Extension'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ─── Details Drawer ─── */}
      {detailsExt && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0, 0, 0, 0.65)',
            backdropFilter: 'blur(12px)',
            display: 'flex',
            justifyContent: 'flex-end',
            zIndex: 110,
          }}
          onClick={() => setDetailsExt(null)}
        >
          <div
            style={{
              width: '420px',
              height: '100%',
              background: isDark ? '#101016' : '#ffffff',
              borderLeft: isDark ? '1px solid rgba(255, 255, 255, 0.1)' : '1px solid rgba(0, 0, 0, 0.1)',
              padding: '28px',
              display: 'flex',
              flexDirection: 'column',
              justifyContent: 'space-between',
              boxShadow: '-16px 0 48px rgba(0,0,0,0.6)',
              overflowY: 'auto',
            }}
            onClick={e => e.stopPropagation()}
          >
            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
                <span style={{ fontSize: '11px', fontWeight: '800', textTransform: 'uppercase', letterSpacing: '0.14em', color: isDark ? '#f2ca50' : '#C86D51' }}>
                  Extension Details
                </span>
                <button
                  type="button"
                  onClick={() => setDetailsExt(null)}
                  style={{ background: 'none', border: 'none', color: isDark ? '#a1a1aa' : '#71717a', cursor: 'pointer' }}
                >
                  <IconCross />
                </button>
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '16px' }}>
                <div
                  style={{
                    width: '44px',
                    height: '44px',
                    borderRadius: '12px',
                    background: isDark ? 'rgba(212, 175, 55, 0.15)' : 'rgba(200, 109, 81, 0.15)',
                    color: isDark ? '#f2ca50' : '#C86D51',
                    fontSize: '18px',
                    fontWeight: '800',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                >
                  {detailsExt.name.charAt(0).toUpperCase()}
                </div>
                <div>
                  <h3 style={{ margin: 0, fontSize: '16px', fontWeight: '700' }}>{detailsExt.name}</h3>
                  <span style={{ fontSize: '11.5px', color: isDark ? '#a1a1aa' : '#71717a' }}>Version {detailsExt.version || '1.0.0'}</span>
                </div>
              </div>

              <p style={{ fontSize: '12.5px', color: isDark ? '#d4d4d8' : '#3f3f46', lineHeight: '1.5', marginBottom: '20px' }}>
                {detailsExt.description || 'No description provided by extension manifest.'}
              </p>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '14px', fontSize: '12px' }}>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                  <span style={{ fontSize: '10px', fontWeight: '700', textTransform: 'uppercase', color: isDark ? '#71717a' : '#8c827a' }}>
                    Extension ID
                  </span>
                  <span style={{ fontFamily: 'monospace', color: isDark ? '#f2ca50' : '#C86D51', wordBreak: 'break-all' }}>
                    {detailsExt.id}
                  </span>
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                  <span style={{ fontSize: '10px', fontWeight: '700', textTransform: 'uppercase', color: isDark ? '#71717a' : '#8c827a' }}>
                    Source Path
                  </span>
                  <span style={{ fontFamily: 'monospace', color: isDark ? '#a1a1aa' : '#5c524c', wordBreak: 'break-all' }}>
                    {detailsExt.path || 'Built-in extension directory'}
                  </span>
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                  <span style={{ fontSize: '10px', fontWeight: '700', textTransform: 'uppercase', color: isDark ? '#71717a' : '#8c827a' }}>
                    Execution Environment
                  </span>
                  <span style={{ color: isDark ? '#a1a1aa' : '#5c524c' }}>
                    Standard Browser Partition (Isolated Sandbox)
                  </span>
                </div>
              </div>
            </div>

            <div style={{ borderTop: isDark ? '1px solid rgba(255, 255, 255, 0.08)' : '1px solid rgba(0, 0, 0, 0.08)', paddingTop: '16px', display: 'flex', gap: '10px' }}>
              <button
                type="button"
                onClick={() => handleToggleExtension(detailsExt)}
                style={{
                  flex: 1,
                  padding: '9px',
                  borderRadius: '8px',
                  background: detailsExt.enabled ? (isDark ? 'rgba(239, 68, 68, 0.15)' : 'rgba(239, 68, 68, 0.1)') : (isDark ? '#d4af37' : '#1a1715'),
                  border: 'none',
                  color: detailsExt.enabled ? '#ef4444' : (isDark ? '#000000' : '#ffffff'),
                  fontSize: '12px',
                  fontWeight: '700',
                  cursor: 'pointer',
                }}
              >
                {detailsExt.enabled ? 'Disable Extension' : 'Enable Extension'}
              </button>

              <button
                type="button"
                onClick={() => handleRemoveExtension(detailsExt)}
                style={{
                  padding: '9px 14px',
                  borderRadius: '8px',
                  background: 'transparent',
                  border: '1px solid #ef4444',
                  color: '#ef4444',
                  fontSize: '12px',
                  fontWeight: '700',
                  cursor: 'pointer',
                }}
              >
                Remove
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
