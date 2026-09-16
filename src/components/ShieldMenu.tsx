import React, { useState, useEffect, useRef, useMemo } from 'react';
import { ModernSlideToggle } from './ModernSlideToggle';
import { ScriptBranchTree, DetectedScriptItem } from './ScriptBranchTree';

export interface SiteShields {
  shieldsUp: boolean;
  blockTrackers: 'standard' | 'aggressive' | 'off';
  upgradeHttps: boolean;
  blockScripts: boolean;
  allowFirstPartyScripts: boolean;
  blockedScripts: string[];
  allowedScripts: string[];
  blockedDomains: string[];
  allowedDomains: string[];
  blockFingerprinting: boolean;
  fingerprintingProtections: {
    canvas: boolean;
    audio: boolean;
    webgl: boolean;
    hardwareConcurrency: boolean;
    deviceMemory: boolean;
    webrtc: boolean;
    font: boolean;
  };
  blockCookies: 'third-party' | 'all' | 'none';
  forgetMe: boolean;
}

export interface ShieldStats {
  trackersBlocked: number;
  scriptsBlocked: number;
  httpsUpgrades: number;
  fingerprintsFoiled: number;
}

interface ShieldMenuProps {
  activeUrl: string;
  blockedCount: number;
  isEnabled: boolean;
  onToggle: (enabled: boolean) => void;
  onClose: () => void;
  detectedScripts?: DetectedScriptItem[] | string[];
}

const DEFAULT_SHIELDS: SiteShields = {
  shieldsUp: true,
  blockTrackers: 'standard',
  upgradeHttps: true,
  blockScripts: false,
  allowFirstPartyScripts: false,
  blockedScripts: [],
  allowedScripts: [],
  blockedDomains: [],
  allowedDomains: [],
  blockFingerprinting: true,
  fingerprintingProtections: {
    canvas: true,
    audio: true,
    webgl: true,
    hardwareConcurrency: true,
    deviceMemory: true,
    webrtc: true,
    font: true,
  },
  blockCookies: 'third-party',
  forgetMe: false,
};

export function ShieldMenu({
  activeUrl,
  blockedCount,
  isEnabled,
  onToggle,
  onClose,
  detectedScripts = [],
}: ShieldMenuProps) {
  const [domain, setDomain] = useState('unknown-site');
  const [shields, setShields] = useState<SiteShields>({ ...DEFAULT_SHIELDS, shieldsUp: isEnabled });
  const [stats, setStats] = useState<ShieldStats>({
    trackersBlocked: blockedCount || 0,
    scriptsBlocked: 0,
    httpsUpgrades: 0,
    fingerprintsFoiled: 0,
  });
  const [liveDetectedScripts, setLiveDetectedScripts] = useState<DetectedScriptItem[]>([]);
  const [isScriptsOpen, setIsScriptsOpen] = useState(false);
  const [isFingerprintingOpen, setIsFingerprintingOpen] = useState(false);
  const [needsReload, setNeedsReload] = useState(false);
  const [isAutoReloading, setIsAutoReloading] = useState(false);

  const menuRef = useRef<HTMLDivElement>(null);
  const reloadTimerRef = useRef<NodeJS.Timeout | null>(null);

  const triggerAutoReload = (delay = 250) => {
    if (reloadTimerRef.current) {
      clearTimeout(reloadTimerRef.current);
    }
    setIsAutoReloading(true);
    reloadTimerRef.current = setTimeout(() => {
      window.dispatchEvent(new CustomEvent('shields-reload-webview'));
      setTimeout(() => setIsAutoReloading(false), 600);
    }, delay);
  };

  useEffect(() => {
    return () => {
      if (reloadTimerRef.current) {
        clearTimeout(reloadTimerRef.current);
      }
    };
  }, []);

  // Close on outside click
  useEffect(() => {
    const handleOutsideClick = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        onClose();
      }
    };
    document.addEventListener('mousedown', handleOutsideClick);
    return () => document.removeEventListener('mousedown', handleOutsideClick);
  }, [onClose]);

  // Extract clean hostname from active URL
  useEffect(() => {
    try {
      if (activeUrl && activeUrl !== 'about:blank' && !activeUrl.startsWith('about:') && !activeUrl.startsWith('chrome:')) {
        const parsed = new URL(activeUrl);
        setDomain(parsed.hostname.toLowerCase().replace(/^www\./, ''));
      } else {
        setDomain('about:blank');
      }
    } catch {
      setDomain('unknown-site');
    }
  }, [activeUrl]);

  // Fetch shields & stats for active domain from electronAPI
  useEffect(() => {
    if (domain !== 'unknown-site' && domain !== 'about:blank') {
      const loadShieldData = async () => {
        try {
          if (window.electronAPI?.shields?.getSiteShields) {
            const siteShields = await window.electronAPI.shields.getSiteShields(domain);
            if (siteShields) {
              setShields(siteShields);
            }
          }
          if (window.electronAPI?.shields?.getStats) {
            const siteStats = await window.electronAPI.shields.getStats(domain);
            if (siteStats) {
              setStats(siteStats);
            }
          }
          if (window.electronAPI?.shields?.getDetectedScripts) {
            const scripts = await window.electronAPI.shields.getDetectedScripts(domain);
            if (Array.isArray(scripts) && scripts.length > 0) {
              setLiveDetectedScripts(scripts);
            }
          }
        } catch {
          // Fallback to localStorage
          const saved = localStorage.getItem(`icrush-shields-${domain}`);
          if (saved) {
            try {
              setShields(JSON.parse(saved));
            } catch { /* ignore */ }
          }
        }
      };

      loadShieldData();

      // Listen for live updates
      if (window.electronAPI?.shields?.onShieldsUpdated) {
        const unsub = window.electronAPI.shields.onShieldsUpdated((data) => {
          if (data && data.domain === domain) {
            if (data.shields) setShields(data.shields);
            if (data.stats) setStats(data.stats);
            if (data.detectedScripts) setLiveDetectedScripts(data.detectedScripts);
          }
        });
        return () => unsub();
      }
    }
  }, [domain]);

  // Merge detectedScripts prop with liveDetectedScripts
  const allDetectedScripts = useMemo(() => {
    if (liveDetectedScripts.length > 0) return liveDetectedScripts;
    return detectedScripts;
  }, [liveDetectedScripts, detectedScripts]);

  const saveShields = (updated: SiteShields, triggerReload = false) => {
    setShields(updated);
    if (domain !== 'unknown-site' && domain !== 'about:blank') {
      localStorage.setItem(`icrush-shields-${domain}`, JSON.stringify(updated));
      if (window.electronAPI?.shields?.updateSiteShields) {
        window.electronAPI.shields.updateSiteShields(domain, updated);
      }
    }
    if (triggerReload) {
      triggerAutoReload(250);
    }
  };

  const handleToggleMasterShields = (val: boolean) => {
    const updated = { ...shields, shieldsUp: val };
    saveShields(updated, true);
    onToggle(val);
  };

  const handleUpdateField = <K extends keyof SiteShields>(key: K, value: SiteShields[K], triggerReload = false) => {
    const updated = { ...shields, [key]: value };
    saveShields(updated, triggerReload);
  };

  const handleUpdateFingerprint = (key: keyof SiteShields['fingerprintingProtections'], value: boolean) => {
    const updated: SiteShields = {
      ...shields,
      fingerprintingProtections: {
        ...shields.fingerprintingProtections,
        [key]: value,
      },
    };
    saveShields(updated, true);
  };

  // Individual script toggle
  const handleToggleScript = (scriptUrl: string, newStatus: 'blocked' | 'allowed') => {
    const blockedSet = new Set(shields.blockedScripts || []);
    const allowedSet = new Set(shields.allowedScripts || []);

    if (newStatus === 'blocked') {
      blockedSet.add(scriptUrl);
      allowedSet.delete(scriptUrl);
    } else {
      allowedSet.add(scriptUrl);
      blockedSet.delete(scriptUrl);
    }

    const updated: SiteShields = {
      ...shields,
      blockedScripts: Array.from(blockedSet),
      allowedScripts: Array.from(allowedSet),
    };
    saveShields(updated, true);

    if (window.electronAPI?.shields?.updateScriptRule) {
      window.electronAPI.shields.updateScriptRule(domain, scriptUrl, newStatus === 'blocked' ? 'block' : 'allow');
    }
  };

  // Toggle entire branch / origin
  const handleToggleBranch = (originDomain: string, scriptUrls: string[], action: 'block' | 'allow') => {
    const blockedSet = new Set(shields.blockedScripts || []);
    const allowedSet = new Set(shields.allowedScripts || []);
    const blockedDomains = new Set(shields.blockedDomains || []);
    const allowedDomains = new Set(shields.allowedDomains || []);

    if (action === 'block') {
      blockedDomains.add(originDomain);
      allowedDomains.delete(originDomain);
      for (const url of scriptUrls) {
        blockedSet.add(url);
        allowedSet.delete(url);
      }
    } else {
      allowedDomains.add(originDomain);
      blockedDomains.delete(originDomain);
      for (const url of scriptUrls) {
        allowedSet.add(url);
        blockedSet.delete(url);
      }
    }

    const updated: SiteShields = {
      ...shields,
      blockedScripts: Array.from(blockedSet),
      allowedScripts: Array.from(allowedSet),
      blockedDomains: Array.from(blockedDomains),
      allowedDomains: Array.from(allowedDomains),
    };
    saveShields(updated, true);

    if (window.electronAPI?.shields?.updateDomainRule) {
      window.electronAPI.shields.updateDomainRule(domain, originDomain, action);
    }
  };

  const handleBlockAllThirdParty = () => {
    const updated: SiteShields = {
      ...shields,
      blockScripts: true,
      allowFirstPartyScripts: true,
    };
    saveShields(updated, true);
  };

  const handleAllowAllScripts = () => {
    const updated: SiteShields = {
      ...shields,
      blockScripts: false,
      blockedScripts: [],
      blockedDomains: [],
    };
    saveShields(updated, true);
  };

  const handleBlockAllScripts = () => {
    const updated: SiteShields = {
      ...shields,
      blockScripts: true,
      allowFirstPartyScripts: false,
    };
    saveShields(updated, true);
  };

  const handleReloadPage = () => {
    setNeedsReload(false);
    window.dispatchEvent(new CustomEvent('shields-reload-webview'));
  };

  return (
    <>
      {/* Backdrop */}
      <div
        style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          zIndex: 9998,
        }}
        onClick={onClose}
      />

      {/* Main Glassmorphism Shield Menu Container */}
      <div
        ref={menuRef}
        style={{
          position: 'absolute',
          top: '46px',
          right: '16px',
          width: '380px',
          maxHeight: 'calc(100vh - 70px)',
          overflowY: 'auto',
          background: 'rgba(15, 15, 20, 0.96)',
          border: '1px solid rgba(212, 175, 55, 0.28)',
          borderRadius: '20px',
          boxShadow: '0 24px 60px rgba(0, 0, 0, 0.88), inset 0 1px 0 rgba(255, 255, 255, 0.12)',
          backdropFilter: 'blur(28px)',
          WebkitBackdropFilter: 'blur(28px)',
          padding: '16px',
          display: 'flex',
          flexDirection: 'column',
          gap: '12px',
          zIndex: 9999,
          color: '#ffffff',
          fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
          animation: 'fadeInSlideDown 0.2s cubic-bezier(0.16, 1, 0.3, 1)',
        }}
      >
        {/* Hero Card Banner */}
        <div
          style={{
            background: shields.shieldsUp
              ? 'linear-gradient(135deg, rgba(212, 175, 55, 0.14) 0%, rgba(16, 185, 129, 0.08) 100%)'
              : 'rgba(255, 255, 255, 0.03)',
            border: shields.shieldsUp
              ? '1px solid rgba(212, 175, 55, 0.35)'
              : '1px solid rgba(255, 255, 255, 0.08)',
            borderRadius: '16px',
            padding: '14px',
            display: 'flex',
            flexDirection: 'column',
            gap: '12px',
            boxShadow: shields.shieldsUp
              ? '0 8px 24px rgba(212, 175, 55, 0.08), inset 0 1px 0 rgba(255, 255, 255, 0.1)'
              : 'none',
          }}
        >
          {/* Top Row: Domain & Master Slide Switch */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', overflow: 'hidden' }}>
              <div
                style={{
                  width: '36px',
                  height: '36px',
                  borderRadius: '50%',
                  background: shields.shieldsUp
                    ? 'radial-gradient(circle, rgba(212, 175, 55, 0.3) 0%, rgba(16, 185, 129, 0.15) 100%)'
                    : 'rgba(255, 255, 255, 0.06)',
                  border: shields.shieldsUp ? '1.5px solid #d4af37' : '1px solid rgba(255, 255, 255, 0.2)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  boxShadow: shields.shieldsUp ? '0 0 14px rgba(212, 175, 55, 0.45)' : 'none',
                  flexShrink: 0,
                  transition: 'all 0.3s ease',
                }}
              >
                <svg
                  width="20"
                  height="20"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke={shields.shieldsUp ? '#d4af37' : '#94a3b8'}
                  strokeWidth="2.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
                </svg>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
                <div
                  style={{
                    fontSize: '13px',
                    fontWeight: 700,
                    color: '#ffffff',
                    letterSpacing: '0.01em',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                    maxWidth: '180px',
                  }}
                  title={domain}
                >
                  {domain}
                </div>
                <div
                  style={{
                    fontSize: '10px',
                    color: shields.shieldsUp ? '#10b981' : '#94a3b8',
                    fontWeight: 600,
                    display: 'flex',
                    alignItems: 'center',
                    gap: '4px',
                    marginTop: '2px',
                  }}
                >
                  <span
                    style={{
                      width: '6px',
                      height: '6px',
                      borderRadius: '50%',
                      background: shields.shieldsUp ? '#10b981' : '#64748b',
                    }}
                  />
                  {shields.shieldsUp ? 'Shields Active' : 'Shields Down'}
                </div>
              </div>
            </div>

            {/* Master Slide Switch */}
            <ModernSlideToggle
              checked={shields.shieldsUp}
              onChange={handleToggleMasterShields}
              size="lg"
              variant="gold"
              ariaLabel="Master Shields Toggle"
            />
          </div>

          {/* 4-Metric Real Counter Grid */}
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(4, 1fr)',
              gap: '6px',
              borderTop: '1px solid rgba(255, 255, 255, 0.08)',
              paddingTop: '10px',
            }}
          >
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', background: 'rgba(0, 0, 0, 0.25)', padding: '6px 4px', borderRadius: '8px' }}>
              <span style={{ fontSize: '14px', fontWeight: 800, color: '#d4af37' }}>
                {stats.trackersBlocked || blockedCount || 0}
              </span>
              <span style={{ fontSize: '8px', color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.05em', textAlign: 'center' }}>
                Ads/Trackers
              </span>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', background: 'rgba(0, 0, 0, 0.25)', padding: '6px 4px', borderRadius: '8px' }}>
              <span style={{ fontSize: '14px', fontWeight: 800, color: '#f59e0b' }}>
                {stats.scriptsBlocked || 0}
              </span>
              <span style={{ fontSize: '8px', color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.05em', textAlign: 'center' }}>
                Scripts
              </span>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', background: 'rgba(0, 0, 0, 0.25)', padding: '6px 4px', borderRadius: '8px' }}>
              <span style={{ fontSize: '14px', fontWeight: 800, color: '#10b981' }}>
                {stats.httpsUpgrades || (shields.upgradeHttps ? 1 : 0)}
              </span>
              <span style={{ fontSize: '8px', color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.05em', textAlign: 'center' }}>
                HTTPS
              </span>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', background: 'rgba(0, 0, 0, 0.25)', padding: '6px 4px', borderRadius: '8px' }}>
              <span style={{ fontSize: '14px', fontWeight: 800, color: '#38bdf8' }}>
                {shields.blockFingerprinting ? 7 : 0}
              </span>
              <span style={{ fontSize: '8px', color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.05em', textAlign: 'center' }}>
                Defenses
              </span>
            </div>
          </div>
        </div>

        {/* Auto-Reload Notification & Status Banner */}
        {isAutoReloading ? (
          <div
            style={{
              background: 'linear-gradient(135deg, rgba(16, 185, 129, 0.2) 0%, rgba(212, 175, 55, 0.15) 100%)',
              border: '1px solid rgba(16, 185, 129, 0.4)',
              borderRadius: '12px',
              padding: '8px 12px',
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              animation: 'fadeIn 0.2s ease',
            }}
          >
            <span style={{ fontSize: '13px' }}>⚡</span>
            <span style={{ fontSize: '11px', color: '#a7f3d0', fontWeight: 600 }}>
              Applying rules & auto-reloading page...
            </span>
          </div>
        ) : needsReload ? (
          <div
            style={{
              background: 'linear-gradient(135deg, rgba(245, 158, 11, 0.2) 0%, rgba(212, 175, 55, 0.15) 100%)',
              border: '1px solid rgba(245, 158, 11, 0.4)',
              borderRadius: '12px',
              padding: '8px 12px',
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              animation: 'fadeIn 0.2s ease',
            }}
          >
            <span style={{ fontSize: '11px', color: '#fef3c7', fontWeight: 500 }}>
              🔄 Reload page to apply changes
            </span>
            <button
              type="button"
              onClick={handleReloadPage}
              style={{
                padding: '4px 10px',
                borderRadius: '9999px',
                background: '#f59e0b',
                color: '#000000',
                border: 'none',
                fontSize: '10px',
                fontWeight: 700,
                cursor: 'pointer',
                boxShadow: '0 2px 8px rgba(245, 158, 11, 0.3)',
              }}
            >
              Reload
            </button>
          </div>
        ) : null}

        {/* Protection Controls List */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
          {/* Trackers & Ads Segmented Slider */}
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              background: 'rgba(255, 255, 255, 0.03)',
              padding: '10px 12px',
              borderRadius: '12px',
              border: '1px solid rgba(255, 255, 255, 0.06)',
            }}
          >
            <div style={{ display: 'flex', flexDirection: 'column' }}>
              <span style={{ fontSize: '12px', color: '#ffffff', fontWeight: 600 }}>
                Trackers & Ads Blocking
              </span>
              <span style={{ fontSize: '10px', color: '#94a3b8' }}>
                Ghostery & Threat Feed Engine
              </span>
            </div>

            {/* 3-State Segmented Pill Slider */}
            <div
              style={{
                display: 'flex',
                background: 'rgba(0, 0, 0, 0.5)',
                borderRadius: '8px',
                padding: '2px',
                border: '1px solid rgba(255, 255, 255, 0.1)',
              }}
            >
              {(['standard', 'aggressive', 'off'] as const).map((mode) => (
                <button
                  key={mode}
                  type="button"
                  onClick={() => handleUpdateField('blockTrackers', mode, true)}
                  disabled={!shields.shieldsUp}
                  style={{
                    padding: '3px 8px',
                    borderRadius: '6px',
                    border: 'none',
                    background: shields.blockTrackers === mode && shields.shieldsUp
                      ? '#d4af37'
                      : 'transparent',
                    color: shields.blockTrackers === mode && shields.shieldsUp
                      ? '#000000'
                      : '#94a3b8',
                    fontSize: '10px',
                    fontWeight: 700,
                    cursor: !shields.shieldsUp ? 'not-allowed' : 'pointer',
                    transition: 'all 0.2s ease',
                    textTransform: 'capitalize',
                  }}
                >
                  {mode}
                </button>
              ))}
            </div>
          </div>

          {/* Upgrade HTTP to HTTPS */}
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              background: 'rgba(255, 255, 255, 0.03)',
              padding: '10px 12px',
              borderRadius: '12px',
              border: '1px solid rgba(255, 255, 255, 0.06)',
            }}
          >
            <div style={{ display: 'flex', flexDirection: 'column' }}>
              <span style={{ fontSize: '12px', color: '#ffffff', fontWeight: 600 }}>
                Upgrade Connections to HTTPS
              </span>
              <span style={{ fontSize: '10px', color: '#94a3b8' }}>
                Automatic TLS/SSL rewriting
              </span>
            </div>
            <ModernSlideToggle
              checked={shields.upgradeHttps}
              onChange={(val) => {
                handleUpdateField('upgradeHttps', val, true);
                setTimeout(() => handleReloadPage(), 300);
              }}
              disabled={!shields.shieldsUp}
              variant="emerald"
            />
          </div>

          {/* Block Scripts with In-Place Branch Accordion */}
          <div
            style={{
              display: 'flex',
              flexDirection: 'column',
              gap: '8px',
              background: 'rgba(255, 255, 255, 0.03)',
              padding: '10px 12px',
              borderRadius: '12px',
              border: '1px solid rgba(255, 255, 255, 0.06)',
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div style={{ display: 'flex', flexDirection: 'column' }}>
                <span style={{ fontSize: '12px', color: '#ffffff', fontWeight: 600 }}>
                  Block Scripts
                </span>
                <button
                  type="button"
                  onClick={() => setIsScriptsOpen(!isScriptsOpen)}
                  style={{
                    background: 'transparent',
                    border: 'none',
                    padding: 0,
                    display: 'flex',
                    alignItems: 'center',
                    gap: '4px',
                    fontSize: '10px',
                    color: '#d4af37',
                    fontWeight: 600,
                    cursor: 'pointer',
                    textAlign: 'left',
                    marginTop: '2px',
                  }}
                >
                  <span>{allDetectedScripts.length} scripts detected</span>
                  <span style={{ transform: isScriptsOpen ? 'rotate(90deg)' : 'rotate(0deg)', transition: 'transform 0.2s ease', display: 'inline-block' }}>
                    ▶
                  </span>
                </button>
              </div>

              <ModernSlideToggle
                checked={shields.blockScripts}
                onChange={(val) => {
                  if (val) {
                    // When blocking scripts, default to blocking all scripts automatically
                    saveShields({ ...shields, blockScripts: true, allowFirstPartyScripts: false }, true);
                  } else {
                    saveShields({ ...shields, blockScripts: false }, true);
                  }
                  // Auto-reload to apply script blocking changes immediately
                  setTimeout(() => handleReloadPage(), 300);
                }}
                disabled={!shields.shieldsUp}
                variant="amber"
              />
            </div>

            {/* In-Place Embedded Script Branch Tree Accordion */}
            {isScriptsOpen && (
              <div style={{ marginTop: '4px' }}>
                <ScriptBranchTree
                  detectedScripts={allDetectedScripts}
                  blockedScripts={shields.blockedScripts}
                  allowedScripts={shields.allowedScripts}
                  allowFirstPartyScripts={shields.allowFirstPartyScripts}
                  blockScriptsMaster={shields.blockScripts}
                  rootDomain={domain}
                  onToggleScript={handleToggleScript}
                  onToggleBranch={handleToggleBranch}
                  onToggleAllowFirstParty={(allow) => handleUpdateField('allowFirstPartyScripts', allow, true)}
                  onBlockAllThirdParty={handleBlockAllThirdParty}
                  onAllowAll={handleAllowAllScripts}
                  onBlockAll={handleBlockAllScripts}
                />
              </div>
            )}
          </div>

          {/* Block Fingerprinting with In-Place Defenses Accordion */}
          <div
            style={{
              display: 'flex',
              flexDirection: 'column',
              gap: '8px',
              background: 'rgba(255, 255, 255, 0.03)',
              padding: '10px 12px',
              borderRadius: '12px',
              border: '1px solid rgba(255, 255, 255, 0.06)',
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div style={{ display: 'flex', flexDirection: 'column' }}>
                <span style={{ fontSize: '12px', color: '#ffffff', fontWeight: 600 }}>
                  Block Fingerprinting
                </span>
                <button
                  type="button"
                  onClick={() => setIsFingerprintingOpen(!isFingerprintingOpen)}
                  style={{
                    background: 'transparent',
                    border: 'none',
                    padding: 0,
                    display: 'flex',
                    alignItems: 'center',
                    gap: '4px',
                    fontSize: '10px',
                    color: '#38bdf8',
                    fontWeight: 600,
                    cursor: 'pointer',
                    textAlign: 'left',
                    marginTop: '2px',
                  }}
                >
                  <span>Active defenses (Canvas, Audio, WebGL)</span>
                  <span style={{ transform: isFingerprintingOpen ? 'rotate(90deg)' : 'rotate(0deg)', transition: 'transform 0.2s ease', display: 'inline-block' }}>
                    ▶
                  </span>
                </button>
              </div>

              <ModernSlideToggle
                checked={shields.blockFingerprinting}
                onChange={(val) => {
                  handleUpdateField('blockFingerprinting', val, true);
                  setTimeout(() => handleReloadPage(), 300);
                }}
                disabled={!shields.shieldsUp}
                variant="gold"
              />
            </div>

            {/* In-Place Fingerprint Defenses Accordion */}
            {isFingerprintingOpen && (
              <div
                style={{
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '6px',
                  background: 'rgba(0, 0, 0, 0.35)',
                  borderRadius: '12px',
                  padding: '10px',
                  border: '1px solid rgba(255, 255, 255, 0.07)',
                  marginTop: '4px',
                }}
              >
                {(
                  [
                    { key: 'canvas', label: 'Canvas Hash Poisoning', desc: 'Adds subtle micro-noise to toDataURL' },
                    { key: 'audio', label: 'AudioContext Jitter', desc: 'Prevents audio frequency fingerprinting' },
                    { key: 'webgl', label: 'WebGL GPU Masking', desc: 'Masks unmasked vendor & renderer info' },
                    { key: 'hardwareConcurrency', label: 'Hardware Masking', desc: 'Spoofs CPU threads and memory' },
                    { key: 'webrtc', label: 'WebRTC Leak Guard', desc: 'Stops local IP address leakage' },
                    { key: 'font', label: 'Font Metric Protection', desc: 'Prevents system font enumeration' },
                  ] as const
                ).map(({ key, label, desc }) => (
                  <div
                    key={key}
                    style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                      background: 'rgba(255, 255, 255, 0.02)',
                      padding: '6px 8px',
                      borderRadius: '8px',
                    }}
                  >
                    <div style={{ display: 'flex', flexDirection: 'column' }}>
                      <span style={{ fontSize: '11px', color: '#e2e8f0', fontWeight: 500 }}>
                        {label}
                      </span>
                      <span style={{ fontSize: '9px', color: '#64748b' }}>{desc}</span>
                    </div>
                    <ModernSlideToggle
                      checked={shields.fingerprintingProtections[key]}
                      onChange={(val) => handleUpdateFingerprint(key, val)}
                      disabled={!shields.shieldsUp || !shields.blockFingerprinting}
                      size="sm"
                      variant="gold"
                    />
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Block Cookies Segmented Slider */}
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              background: 'rgba(255, 255, 255, 0.03)',
              padding: '10px 12px',
              borderRadius: '12px',
              border: '1px solid rgba(255, 255, 255, 0.06)',
            }}
          >
            <div style={{ display: 'flex', flexDirection: 'column' }}>
              <span style={{ fontSize: '12px', color: '#ffffff', fontWeight: 600 }}>
                Cross-Site Cookie Shield
              </span>
              <span style={{ fontSize: '10px', color: '#94a3b8' }}>
                Header stripping & isolation
              </span>
            </div>

            <div
              style={{
                display: 'flex',
                background: 'rgba(0, 0, 0, 0.5)',
                borderRadius: '8px',
                padding: '2px',
                border: '1px solid rgba(255, 255, 255, 0.1)',
              }}
            >
              {[
                { val: 'third-party', label: '3rd-Party' },
                { val: 'all', label: 'All' },
                { val: 'none', label: 'Allow' },
              ].map(({ val, label }) => (
                <button
                  key={val}
                  type="button"
                  onClick={() => handleUpdateField('blockCookies', val as any, true)}
                  disabled={!shields.shieldsUp}
                  style={{
                    padding: '3px 7px',
                    borderRadius: '6px',
                    border: 'none',
                    background: shields.blockCookies === val && shields.shieldsUp
                      ? '#d4af37'
                      : 'transparent',
                    color: shields.blockCookies === val && shields.shieldsUp
                      ? '#000000'
                      : '#94a3b8',
                    fontSize: '10px',
                    fontWeight: 700,
                    cursor: !shields.shieldsUp ? 'not-allowed' : 'pointer',
                    transition: 'all 0.2s ease',
                  }}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>

          {/* Forget Me on Close */}
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              background: 'rgba(255, 255, 255, 0.03)',
              padding: '10px 12px',
              borderRadius: '12px',
              border: '1px solid rgba(255, 255, 255, 0.06)',
            }}
          >
            <div style={{ display: 'flex', flexDirection: 'column' }}>
              <span style={{ fontSize: '12px', color: '#ffffff', fontWeight: 600 }}>
                Forget Me On Close
              </span>
              <span style={{ fontSize: '10px', color: '#94a3b8' }}>
                Wipe cookies and cache when closed
              </span>
            </div>
            <ModernSlideToggle
              checked={shields.forgetMe}
              onChange={(val) => handleUpdateField('forgetMe', val, false)}
              disabled={!shields.shieldsUp}
              variant="amber"
            />
          </div>
        </div>
      </div>
    </>
  );
}
