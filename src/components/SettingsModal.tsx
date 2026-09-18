import React, { useState, useEffect, useRef, useCallback } from 'react';
import { BrandLogo } from './BrandLogo';
import { PROVIDERS, detectProviderFromKey, detectLocalModels, type LocalModel } from '../utils/providers';
import { useToast } from './Toast';

interface SearchEngine {
  id: string;
  name: string;
  description: string;
}

interface Palette {
  id: string;
  name: string;
  label: string;
  colors: string[];
}

interface Account {
  id: number;
  name: string;
  email: string;
  active: boolean;
}

import type { ContextMenuSettings } from '../utils/storage';
import { storage } from '../utils/storage';

interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  currentEngine: string;
  onSelectEngine: (engine: string) => void;
  apiKeys: Record<string, string>;
  onSaveApiKeys: (keys: Record<string, string>) => void;
  activeProvider: string;
  onSelectProvider: (provider: string) => void;
  currentPalette: string;
  onSelectPalette: (palette: string) => void;
  onNavigate: (url: string) => void;
  initialTab?: string;
  contextMenuSettings?: ContextMenuSettings;
  onContextMenuSettingsChange?: (settings: ContextMenuSettings) => void;
  tabLayout?: 'top' | 'sidebar';
  onTabLayoutChange?: (layout: 'top' | 'sidebar') => void;
}

interface ExtensionMetadata {
  id: string;
  name: string;
  version: string;
  path: string;
  enabled: boolean;
}

export function SettingsModal({
  isOpen,
  onClose,
  currentEngine,
  onSelectEngine,
  apiKeys,
  onSaveApiKeys,
  activeProvider,
  onSelectProvider,
  currentPalette,
  onSelectPalette,
  onNavigate: _onNavigate,
  initialTab = 'general',
  contextMenuSettings: cmSettings = {
    showNavigation: true, showLinkActions: true, showMediaActions: true,
    showEditActions: true, showSelectionActions: true, showPageActions: true,
    showAIActions: true, showDebugActions: true,
  },
  onContextMenuSettingsChange,
  tabLayout = 'top',
  onTabLayoutChange,
}: SettingsModalProps) {
  const { error, success, warning, info } = useToast();
  const [activeTab, setActiveTab] = useState(initialTab);
  const [modalWidth, setModalWidth] = useState(() => {
    return parseInt(localStorage.getItem('settings-modal-width') || '720');
  });
  const [modalHeight, setModalHeight] = useState(() => {
    return Math.max(580, parseInt(localStorage.getItem('settings-modal-height') || '640'));
  });
  const [extensions, setExtensions] = useState<ExtensionMetadata[]>([]);
  const [extensionUrl, setExtensionUrl] = useState('');
  const [isInstallingExt, setIsInstallingExt] = useState(false);

  const [accounts, setAccounts] = useState<Account[]>([]);

  const [showProfileEditor, setShowProfileEditor] = useState(false);
  const [editorImageSrc, setEditorImageSrc] = useState<string | null>(null);
  const [editorZoom, setEditorZoom] = useState(1);
  const [editorRotation, setEditorRotation] = useState(0);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [isImporting, setIsImporting] = useState(false);
  const [importProgress, setImportProgress] = useState(0);
  const [importStatus, setImportStatus] = useState('');

  const [securitySettings, setSecuritySettings] = useState({
    safeBrowsingEnabled: true,
    downloadScanningEnabled: true,
    useEnhancedProtection: false,
  });
  const [vtApiKey, setVtApiKey] = useState('');
  const [vtApiKeyInput, setVtApiKeyInput] = useState('');
  const [isEditingKey, setIsEditingKey] = useState(false);
  const [adblockEnabled, setAdblockEnabled] = useState(true);

  // AI Studio Settings States
  const [defaultPersona, setDefaultPersona] = useState(() => localStorage.getItem('ai_default_persona') || 'general');
  const [webGrounding, setWebGrounding] = useState(() => localStorage.getItem('ai_web_grounding') !== 'false');
  const [agentMode, setAgentMode] = useState(() => localStorage.getItem('ai_agent_enabled') === 'true');
  const [showKeys, setShowKeys] = useState<Record<string, boolean>>({});
  const [newApiKey, setNewApiKey] = useState('');
  const [detectedProvider, setDetectedProvider] = useState<string | null>(null);
  const [localModels, setLocalModels] = useState<LocalModel[]>([]);
  const [localModelsLoading, setLocalModelsLoading] = useState(false);
  const [newLocalModelId, setNewLocalModelId] = useState('');

  // Chronos Focus Timer Settings States
  const [focusDuration, setFocusDuration] = useState(() => localStorage.getItem('chronos_focus_duration') || '25');
  const [shortBreakDuration, setShortBreakDuration] = useState(() => localStorage.getItem('chronos_short_break') || '5');
  const [longBreakDuration, setLongBreakDuration] = useState(() => localStorage.getItem('chronos_long_break') || '15');
  const [intenseDuration, setIntenseDuration] = useState(() => localStorage.getItem('chronos_intense_duration') || '50');
  const [soundEnabled, setSoundEnabled] = useState(() => localStorage.getItem('chronos_chime_sound') !== 'false');
  const [autoStartBreaks, setAutoStartBreaks] = useState(() => localStorage.getItem('chronos_auto_breaks') === 'true');
  const [dailyTarget, setDailyTarget] = useState(() => localStorage.getItem('chronos_daily_target') || '120');

  // Homescreen Grid & Layout States
  const [compactMode, setCompactMode] = useState(() => localStorage.getItem('icrush_compact_mode') === 'true');
  const [showWeather, setShowWeather] = useState(() => localStorage.getItem('widget_show_weather') !== 'false');
  const [showShortcuts, setShowShortcuts] = useState(() => localStorage.getItem('widget_show_shortcuts') !== 'false');
  const [showVitals, setShowVitals] = useState(() => localStorage.getItem('widget_show_vitals') !== 'false');
  const [showStockTicker, setShowStockTicker] = useState(() => localStorage.getItem('widget_show_stocks') !== 'false');
  const [showDailyNotes, setShowDailyNotes] = useState(() => localStorage.getItem('widget_show_notes') !== 'false');

  // VPN States
  const [vpnStatus, setVpnStatus] = useState<any>({
    connected: false,
    serverName: '',
    serverLatency: 0,
    bandwidth: { up: 0, down: 0, total: 0 },
  });
  const [vpnConfig, setVpnConfig] = useState<{ raw: string; parsed: any }>({ raw: '', parsed: null });
  const [vpnConfigInput, setVpnConfigInput] = useState('');
  const [vpnMode, setVpnMode] = useState(false);
  const [killSwitch, setKillSwitch] = useState(true);
  const [isVpnConnecting, setIsVpnConnecting] = useState(false);
  const [vpnDnsProtection, setVpnDnsProtection] = useState(() => localStorage.getItem('vpn_dns_protection') !== 'false');
  const [vpnSplitTunnel, setVpnSplitTunnel] = useState(() => localStorage.getItem('vpn_split_tunnel') === 'true');
  const [vpnConfigError, setVpnConfigError] = useState('');
  const [torCloudRouting, setTorCloudRouting] = useState(() => localStorage.getItem('torCloudRouting') !== 'false');

  // Profile & Cloud Sync States
  const [profileName, setProfileName] = useState(() => {
    const id = localStorage.getItem('gemini-browser-active-profile-id') || '1';
    return localStorage.getItem(`gemini-browser-profile-name-${id}`) || localStorage.getItem('gemini-browser-profile-name') || 'NIGHTMARE';
  });
  const [profileEmail, setProfileEmail] = useState(() => {
    const id = localStorage.getItem('gemini-browser-active-profile-id') || '1';
    return localStorage.getItem(`gemini-browser-profile-email-${id}`) || localStorage.getItem('gemini-browser-profile-email') || 'nightmare@icrushbrowser.com';
  });
  const [cloudSyncEnabled, setCloudSyncEnabled] = useState(() => localStorage.getItem('gemini-browser-sync-active') === 'true');
  const [syncTabs, setSyncTabs] = useState(() => localStorage.getItem('sync_tabs') !== 'false');
  const [syncBookmarks, setSyncBookmarks] = useState(() => localStorage.getItem('sync_bookmarks') !== 'false');
  const [syncHistory, setSyncHistory] = useState(() => localStorage.getItem('sync_history') !== 'false');
  const [syncPass, setSyncPass] = useState(() => localStorage.getItem('sync_passwords') !== 'false');
  const [syncAI, setSyncAI] = useState(() => localStorage.getItem('sync_ai') !== 'false');
  const [syncExtensions, setSyncExtensions] = useState(() => localStorage.getItem('sync_extensions') !== 'false');
  const [syncSettings, setSyncSettings] = useState(() => localStorage.getItem('sync_settings') !== 'false');

  useEffect(() => {
    if (isOpen) {
      const loadVpnData = async () => {
        try {
          if (window.electronAPI.vpn) {
            const status = await window.electronAPI.vpn.getStatus();
            setVpnStatus(status);

            const config = await window.electronAPI.vpn.getConfig();
            setVpnConfig(config);
            setVpnConfigInput(config.raw || '');

            const mode = await window.electronAPI.vpn.isModeEnabled();
            setVpnMode(mode);

            const ks = await window.electronAPI.vpn.isKillSwitchEnabled();
            setKillSwitch(ks);
          }
        } catch (err) {
          console.warn('Failed to load VPN settings:', err);
        }
      };
      loadVpnData();

      if (window.electronAPI.vpn) {
        const unsubscribeStatus = window.electronAPI.vpn.onStatusChange((status: any) => {
          setVpnStatus(status);
          setIsVpnConnecting(false);
        });

        const unsubscribeFailed = window.electronAPI.vpn.onConnectionFailed((errMsg: string) => {
          error(`VPN Connection Failed: ${errMsg}`);
          setIsVpnConnecting(false);
        });

        return () => {
          unsubscribeStatus();
          unsubscribeFailed();
        };
      }
    }
  }, [isOpen]);

  const handleVpnImportConfig = async () => {
    if (!vpnConfigInput.trim()) {
      setVpnConfigError('Please paste your WireGuard configuration.');
      return;
    }
    setVpnConfigError('');
    try {
      const result = await window.electronAPI.vpn.importConfig(vpnConfigInput.trim());
      if (result.success && result.config) {
        setVpnConfig({ raw: vpnConfigInput.trim(), parsed: result.config });
        setVpnConfigError('');
      } else {
        setVpnConfigError(result.error || 'Invalid WireGuard configuration.');
      }
    } catch (err) {
      setVpnConfigError('Failed to import config. Please check the format.');
    }
  };

  const handleVpnClearConfig = async () => {
    if (vpnStatus.connected) {
      warning('Disconnect from VPN before clearing the config.');
      return;
    }
    await window.electronAPI.vpn.clearConfig();
    setVpnConfig({ raw: '', parsed: null });
    setVpnConfigInput('');
    setVpnConfigError('');
  };

  const handleVpnConnect = async () => {
    if (!vpnConfig.parsed) {
      warning('Please import a WireGuard configuration first.');
      return;
    }
    setIsVpnConnecting(true);
    const success = await window.electronAPI.vpn.connect();
    if (!success) {
      setIsVpnConnecting(false);
    }
  };

  const handleVpnDisconnect = async () => {
    setIsVpnConnecting(true);
    await window.electronAPI.vpn.disconnect();
    setIsVpnConnecting(false);
  };

  const handleToggleVpnMode = async (val: boolean) => {
    if (window.electronAPI.vpn) {
      const mode = await window.electronAPI.vpn.setModeEnabled(val);
      setVpnMode(mode);
    }
  };

  const handleToggleKillSwitch = async (val: boolean) => {
    if (window.electronAPI.vpn) {
      const ks = await window.electronAPI.vpn.setKillSwitchEnabled(val);
      setKillSwitch(ks);
    }
  };

  useEffect(() => {
    const loadAdblock = async () => {
      try {
        const enabled = await window.electronAPI.adblocker.isEnabled();
        setAdblockEnabled(enabled);
      } catch (e) {
        // ignore
      }
    };
    loadAdblock();

    const handleSync = async () => {
      try {
        const enabled = await window.electronAPI.adblocker.isEnabled();
        setAdblockEnabled(enabled);
      } catch (e) {
        // ignore
      }
    };
    window.addEventListener('adblocker-toggled', handleSync);
    return () => window.removeEventListener('adblocker-toggled', handleSync);
  }, []);

  const handleToggleAdblock = async (enabled: boolean) => {
    try {
      await window.electronAPI.adblocker.toggle(enabled);
      setAdblockEnabled(enabled);
      window.dispatchEvent(new Event('adblocker-toggled'));
    } catch (err) {
      console.error('Failed to toggle adblocker:', err);
    }
  };

  const [suspensionTimer, setSuspensionTimer] = useState(() => {
    return localStorage.getItem('tabSuspensionTimer') || '600000'; // Default 10 minutes
  });

  interface BridgeConfig {
    type: 'obfs4' | 'snowflake' | 'meek';
    address: string;
    port: number;
    fingerprint?: string;
    cert?: string;
    iatMode?: number;
  }

  // Tor Bridge state
  const [bridges, setBridges] = useState<BridgeConfig[]>([]);
  const [useBridges, setUseBridges] = useState(false);
  const [bridgeType, setBridgeType] = useState<'obfs4' | 'snowflake' | 'none'>('none');
  const [newBridgeType, setNewBridgeType] = useState<'obfs4' | 'snowflake' | 'meek'>('obfs4');
  const [newBridgeAddress, setNewBridgeAddress] = useState('');
  const [newBridgePort, setNewBridgePort] = useState(0);
  const [newBridgeFingerprint, setNewBridgeFingerprint] = useState('');
  const [newBridgeCert, setNewBridgeCert] = useState('');
  const [newBridgeIatMode, setNewBridgeIatMode] = useState(0);

  const handleUpdateSuspensionTimer = (val: string) => {
    setSuspensionTimer(val);
    localStorage.setItem('tabSuspensionTimer', val);
    window.dispatchEvent(new Event('tab-suspension-settings-updated'));
  };

  const loadSecuritySettings = async () => {
    try {
      const settings = await window.electronAPI.security.getSettings();
      setSecuritySettings(settings);
      const maskedKey = await window.electronAPI.security.getApiKey();
      setVtApiKey(maskedKey);
      setVtApiKeyInput(maskedKey ? '••••••••••••••••••••••••••••••••' : '');
      setIsEditingKey(false);
    } catch (err) {
      console.error('Failed to load security settings:', err);
    }
  };

  const handleToggleSecurity = async (key: keyof typeof securitySettings, value: boolean) => {
    try {
      const updated = await window.electronAPI.security.updateSettings({ [key]: value });
      setSecuritySettings(updated);
    } catch (err) {
      console.error('Failed to update security settings:', err);
    }
  };

  // AI Studio: Auto-detect provider from pasted key
  const handleApiKeyInput = useCallback((value: string) => {
    setNewApiKey(value);
    if (value.trim()) {
      const detected = detectProviderFromKey(value);
      setDetectedProvider(detected?.id || null);
    } else {
      setDetectedProvider(null);
    }
  }, []);

  // AI Studio: Save detected API key
  const handleSaveApiKey = useCallback(() => {
    if (!newApiKey.trim() || !detectedProvider) return;
    onSaveApiKeys({ ...apiKeys, [detectedProvider]: newApiKey.trim() });
    setNewApiKey('');
    setDetectedProvider(null);
    onSelectProvider(detectedProvider);
  }, [newApiKey, detectedProvider, apiKeys, onSaveApiKeys, onSelectProvider]);

  // AI Studio: Remove provider key
  const handleRemoveProviderKey = useCallback((providerId: string) => {
    const updated = { ...apiKeys };
    delete updated[providerId];
    onSaveApiKeys(updated);
    if (activeProvider === providerId) {
      const remaining = Object.keys(updated);
      onSelectProvider(remaining.length > 0 ? remaining[0] : 'local');
    }
  }, [apiKeys, activeProvider, onSaveApiKeys, onSelectProvider]);

  // AI Studio: Detect local Ollama models
  const handleDetectLocalModels = useCallback(async () => {
    setLocalModelsLoading(true);
    try {
      const models = await detectLocalModels();
      setLocalModels(models);
    } catch {
      setLocalModels([]);
    } finally {
      setLocalModelsLoading(false);
    }
  }, []);

  // AI Studio: Auto-detect local models on mount
  useEffect(() => {
    handleDetectLocalModels();
  }, [handleDetectLocalModels]);

  // AI Studio: Add custom local model by ID
  const handleAddLocalModel = useCallback(() => {
    if (!newLocalModelId.trim()) return;
    const customModels = storage.getCustomModels();
    const exists = customModels.some(m => m.id === newLocalModelId.trim());
    if (!exists) {
      customModels.push({
        id: newLocalModelId.trim(),
        name: newLocalModelId.trim().split(':')[0],
        provider: 'local',
        isLocal: true,
      });
      storage.setCustomModels(customModels);
    }
    setNewLocalModelId('');
  }, [newLocalModelId]);

  const loadBridges = async () => {
    try {
      const loadedBridges = await window.electronAPI.tor.getBridgesList();
      const useBridgesSetting = await window.electronAPI.tor.isUsingBridges();
      const bridgeTypeSetting = await window.electronAPI.tor.getBridgeType();
      setBridges(loadedBridges || []);
      setUseBridges(useBridgesSetting);
      setBridgeType(bridgeTypeSetting as 'obfs4' | 'snowflake' | 'none');
    } catch (err) {
      console.error('Failed to load bridges:', err);
    }
  };

  // Load bridges when tor-bridges tab is opened
  useEffect(() => {
    if (activeTab === 'tor-bridges') {
      loadBridges();
    }
  }, [activeTab]);

  const handleSaveVtApiKey = async () => {
    try {
      if (vtApiKeyInput && !vtApiKeyInput.startsWith('••')) {
        await window.electronAPI.security.setApiKey(vtApiKeyInput);
      } else if (!vtApiKeyInput) {
        await window.electronAPI.security.setApiKey('');
      }
      setIsEditingKey(false);
      loadSecuritySettings();
    } catch (err) {
      error('Failed to save API Key');
    }
  };

  const loadExtensions = async () => {
    try {
      const list = await window.electronAPI.extensions.getExtensions();
      setExtensions(list);
    } catch (err) {
      console.error('Failed to load extensions:', err);
    }
  };

  const loadAccounts = () => {
    const loadedAccounts: Account[] = [];
    for (let i = 1; i <= 3; i++) {
      const name = localStorage.getItem(`gemini-browser-profile-name-${i}`);
      const email = localStorage.getItem(`gemini-browser-profile-email-${i}`);
      const isActive = localStorage.getItem('gemini-browser-active-profile-id') === String(i);
      if (name || email) {
        loadedAccounts.push({
          id: i,
          name: name || `Profile ${i}`,
          email: email || `profile${i}@icrushbrowser.com`,
          active: isActive,
        });
      }
    }
    setAccounts(loadedAccounts);
  };

  const handleAddBridge = async () => {
    if (!newBridgeAddress || !newBridgePort) return;
    try {
      await window.electronAPI.tor.addBridge({
        type: newBridgeType,
        address: newBridgeAddress,
        port: newBridgePort,
        fingerprint: newBridgeFingerprint || undefined,
        cert: newBridgeCert || undefined,
        iatMode: newBridgeIatMode || undefined,
      });
      loadBridges();
      setNewBridgeType('obfs4');
      setNewBridgeAddress('');
      setNewBridgePort(0);
      setNewBridgeFingerprint('');
      setNewBridgeCert('');
      setNewBridgeIatMode(0);
    } catch (err) {
      error('Failed to add bridge');
    }
  };

  const handleRemoveBridge = async (address: string) => {
    try {
      await window.electronAPI.tor.removeBridge(address);
      loadBridges();
    } catch (err) {
      error('Failed to remove bridge');
    }
  };

  const handleSetBridgeType = async (type: 'obfs4' | 'snowflake' | 'none') => {
    setBridgeType(type);
    try {
      await window.electronAPI.tor.setBridgeType(type);
    } catch (err) {
      error('Failed to set bridge type');
    }
  };

  const handleSetUseBridges = async (enabled: boolean) => {
    setUseBridges(enabled);
    try {
      await window.electronAPI.tor.setUseBridges(enabled);
    } catch (err) {
      error('Failed to set bridge mode');
    }
  };

  useEffect(() => {
    if (isOpen) {
      setActiveTab(initialTab);
      loadExtensions();
      loadSecuritySettings();
      loadAccounts();
    }
  }, [isOpen, initialTab]);

  const [updaterState, setUpdaterState] = useState<{
    status: string;
    enabled?: boolean;
    appVersion?: string;
    version?: string;
    progress?: number;
    error?: string;
  } | null>(null);

  useEffect(() => {
    if (!isOpen) return;
    const api = window.electronAPI?.updater;
    if (!api) return;
    let cancelled = false;
    api.getState().then(s => {
      if (!cancelled) setUpdaterState(s);
    }).catch(() => {
      // update service unreachable; card shows fallback text
    });
    let unsubscribe: (() => void) | undefined;
    try {
      unsubscribe = api.onStatus(s => {
        if (!cancelled) setUpdaterState(s);
      });
    } catch {
      // live updates unavailable; manual refresh still works
    }
    return () => {
      cancelled = true;
      try {
        unsubscribe?.();
      } catch {
        // ignore
      }
    };
  }, [isOpen]);

  const describeUpdater = (): string => {
    if (!updaterState) return 'Update service unavailable in this runtime.';
    switch (updaterState.status) {
      case 'checking':
        return 'Checking for updates…';
      case 'available':
        return `Update available${updaterState.version ? `: v${updaterState.version}` : ''} — downloading.`;
      case 'downloading':
        return `Downloading update… ${updaterState.progress ?? 0}%`;
      case 'downloaded':
        return `Version ${updaterState.version ?? ''} ready — restart to install.`;
      case 'up-to-date':
        return 'You are on the latest version.';
      case 'unavailable':
        return updaterState.error ?? 'Automatic updates are unavailable in this build.';
      case 'error':
        return `Update check failed: ${updaterState.error ?? 'unknown error'}`;
      default:
        return `Current version: ${updaterState.appVersion ?? '1.0.0'}`;
    }
  };

  if (!isOpen) return null;

  const engines: SearchEngine[] = [
    { id: 'google', name: 'Google', description: 'Comprehensive standard web search' },
    { id: 'duckduckgo', name: 'DuckDuckGo', description: 'Privacy-first search with zero tracking' },
    { id: 'brave', name: 'Brave Search', description: 'Independent index with privacy shields' },
    { id: 'bing', name: 'Microsoft Bing', description: 'Copilot integrated search engine' },
    { id: 'kagi', name: 'Kagi Search', description: 'Fast, ad-free executive search' },
    { id: 'perplexity', name: 'Perplexity AI', description: 'AI conversational search engine' },
    { id: 'startpage', name: 'Startpage', description: 'Google results with complete privacy' },
    { id: 'ecosia', name: 'Ecosia', description: 'Eco-friendly tree planting search' },
  ];

  const palettes: Palette[] = [
    {
      id: 'default',
      name: 'Indigo Night',
      label: '(Deep Indigo)',
      colors: ['#6366f1', '#4f46e5', '#1e1b4b'],
    },
    {
      id: 'gilt',
      name: 'Warm Paper & Gold',
      label: '(Parchment / Gilt)',
      colors: ['#f9f6f0', '#d4af37', '#3c322c'],
    },
    {
      id: 'obsidian',
      name: 'Obsidian Glass',
      label: '(Dark Glassmorphism)',
      colors: ['#a855f7', '#7e22ce', '#0a0a0f'],
    },
    {
      id: 'teal',
      name: 'Ocean Teal',
      label: '(Emerald / Cyan)',
      colors: ['#14b8a6', '#0f766e', '#042f2e'],
    },
    {
      id: 'rose',
      name: 'Sunset Rose',
      label: '(Coral / Terracotta)',
      colors: ['#f43f5e', '#be123c', '#4c0519'],
    },
    {
      id: 'green',
      name: 'Emerald Forest',
      label: '(Bio / Green)',
      colors: ['#10b981', '#047857', '#022c22'],
    },
  ];

  const handleSwitchAccount = (id: number) => {
    setAccounts(prev =>
      prev.map(acc => ({
        ...acc,
        active: acc.id === id,
      }))
    );
    setShowProfileEditor(true);
  };

  const handleStartImport = () => {
    setIsImporting(true);
    setImportProgress(0);
    setImportStatus('Initializing connection...');
    const interval = setInterval(() => {
      setImportProgress(prev => {
        if (prev >= 100) {
          clearInterval(interval);
          setTimeout(() => {
            setIsImporting(false);
            setImportStatus('Import completed successfully!');
          }, 400);
          return 100;
        }
        return prev + 25;
      });
    }, 200);
  };

  const handleEditorFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = event => {
        setEditorImageSrc(event.target?.result as string);
      };
      reader.readAsDataURL(file);
    }
  };

  const handleSaveEditor = () => {
    if (editorImageSrc) {
      localStorage.setItem('gemini-browser-profile-pic', editorImageSrc);
      success('Avatar saved successfully!');
      setShowProfileEditor(false);
      window.location.reload();
    }
  };

  const handleLoadExtension = async () => {
    try {
      const folderPath = await window.electronAPI.extensions.selectDirectory();
      if (folderPath) {
        await window.electronAPI.extensions.loadExtension(folderPath);
        await loadExtensions();
        window.dispatchEvent(new Event('extensions-modified'));
      }
    } catch (err) {
      error('Failed to load extension: ' + (err instanceof Error ? err.message : String(err)));
    }
  };

  const handleToggleExtension = async (id: string, enabled: boolean) => {
    try {
      await window.electronAPI.extensions.toggleExtension(id, enabled);
      await loadExtensions();
      window.dispatchEvent(new Event('extensions-modified'));
    } catch (err) {
      error('Failed to toggle extension: ' + (err instanceof Error ? err.message : String(err)));
    }
  };

  const handleRemoveExtension = async (id: string) => {
    try {
      await window.electronAPI.extensions.removeExtension(id);
      await loadExtensions();
      window.dispatchEvent(new Event('extensions-modified'));
    } catch (err) {
      error('Failed to remove extension: ' + (err instanceof Error ? err.message : String(err)));
    }
  };

  const handleInstallFromUrl = async () => {
    if (!extensionUrl.trim()) return;
    setIsInstallingExt(true);
    try {
      await (window.electronAPI.extensions as any).installFromUrl(extensionUrl.trim());
      setExtensionUrl('');
      await loadExtensions();
      window.dispatchEvent(new Event('extensions-modified'));
    } catch (err) {
      error('Failed to install extension: ' + (err instanceof Error ? err.message : String(err)));
    } finally {
      setIsInstallingExt(false);
    }
  };

  return (
    <div className="settings-modal-overlay" onClick={onClose}>
      <div
        className="settings-modal-card"
        onClick={e => e.stopPropagation()}
        style={{
          width: `${modalWidth}px`,
          height: `${modalHeight}px`,
          minWidth: '560px',
          minHeight: '480px',
          maxWidth: '95vw',
          maxHeight: '95vh',
          position: 'relative',
        }}
      >
        <div className="modal-header">
          <h2>Settings</h2>
          <button className="modal-close-x" onClick={onClose} title="Close settings">
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

        <div className="settings-dialog-layout">
          <div className="settings-sidebar">
            <button
              className={`sidebar-tab-btn ${activeTab === 'general' ? 'active' : ''}`}
              onClick={() => setActiveTab('general')}
            >
              <svg
                className="tab-btn-icon"
                width="14"
                height="14"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2.5"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <circle cx="12" cy="12" r="3" />
                <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
              </svg>
              General
            </button>
            <button
              className={`sidebar-tab-btn ${activeTab === 'ai-studio' ? 'active' : ''}`}
              onClick={() => setActiveTab('ai-studio')}
            >
              <svg
                className="tab-btn-icon"
                width="14"
                height="14"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2.5"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" />
              </svg>
              AI Studio & Keys
            </button>
            <button
              className={`sidebar-tab-btn ${activeTab === 'chronos' ? 'active' : ''}`}
              onClick={() => setActiveTab('chronos')}
            >
              <svg
                className="tab-btn-icon"
                width="14"
                height="14"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2.5"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <circle cx="12" cy="12" r="10" />
                <polyline points="12 6 12 12 16 14" />
              </svg>
              Chronos Focus
            </button>
            <button
              className={`sidebar-tab-btn ${activeTab === 'grid' ? 'active' : ''}`}
              onClick={() => setActiveTab('grid')}
            >
              <svg
                className="tab-btn-icon"
                width="14"
                height="14"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2.5"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <rect x="3" y="3" width="7" height="7" />
                <rect x="14" y="3" width="7" height="7" />
                <rect x="14" y="14" width="7" height="7" />
                <rect x="3" y="14" width="7" height="7" />
              </svg>
              Grid & Widgets
            </button>
            <button
              className={`sidebar-tab-btn ${activeTab === 'personalization' ? 'active' : ''}`}
              onClick={() => setActiveTab('personalization')}
            >
              <svg
                className="tab-btn-icon"
                width="14"
                height="14"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2.5"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M12 22C17.5228 22 22 17.5228 22 12C22 6.47715 17.5228 2 12 2C6.47715 2 2 6.47715 2 12C2 14.7255 3.09032 17.1962 4.85857 19C5.34776 19.4892 5.34776 20.2824 4.85857 20.7716C4.60677 21.0234 4.26526 21.1561 3.90909 21.1396C3.21818 21.1077 2 20 2 18C2 15 3 13 5 12C7.3 10.8 9.3 12.2 10 13.5C10.7 14.8 10 17 8 18C6.5 18.75 6 20 7.5 21.5C8.75 22.75 10.25 22 12 22Z" />
              </svg>
              Personalization
            </button>
            <button
              className={`sidebar-tab-btn ${activeTab === 'extensions' ? 'active' : ''}`}
              onClick={() => setActiveTab('extensions')}
            >
              <svg
                className="tab-btn-icon"
                width="14"
                height="14"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2.5"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z" />
                <polyline points="3.27 6.96 12 12.01 20.73 6.96" />
                <line x1="12" y1="22.08" x2="12" y2="12" />
              </svg>
              Extensions
            </button>
            <button
              className={`sidebar-tab-btn ${activeTab === 'accounts' ? 'active' : ''}`}
              onClick={() => setActiveTab('accounts')}
            >
              <svg
                className="tab-btn-icon"
                width="14"
                height="14"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2.5"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
                <circle cx="9" cy="7" r="4" />
                <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
                <path d="M16 3.13a4 4 0 0 1 0 7.75" />
              </svg>
              Accounts
            </button>

            <button
              className={`sidebar-tab-btn ${activeTab === 'privacy' ? 'active' : ''}`}
              onClick={() => setActiveTab('privacy')}
            >
              <svg
                className="tab-btn-icon"
                width="14"
                height="14"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2.5"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
                <path d="M7 11V7a5 5 0 0 1 10 0v4" />
              </svg>
              Privacy
            </button>
            <button
              className={`sidebar-tab-btn ${activeTab === 'tor-bridges' ? 'active' : ''}`}
              onClick={() => setActiveTab('tor-bridges')}
            >
              <svg
                className="tab-btn-icon"
                width="14"
                height="14"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2.5"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M3 7v10a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V7" />
                <path d="M9 12h6" />
                <path d="M9 16h6" />
              </svg>
              Tor Bridges
            </button>
            <button
              className={`sidebar-tab-btn ${activeTab === 'vpn' ? 'active' : ''}`}
              onClick={() => setActiveTab('vpn')}
            >
              <svg
                className="tab-btn-icon"
                width="14"
                height="14"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2.5"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
              </svg>
              VPN Manager
            </button>
            <button
              className={`sidebar-tab-btn ${activeTab === 'context-menu' ? 'active' : ''}`}
              onClick={() => setActiveTab('context-menu')}
            >
              <svg className="tab-btn-icon" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M10 6h4" /><path d="M12 4v2" /><path d="M3 14h18" /><path d="M4 14v6a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-6" /><path d="M12 10v4" />
              </svg>
              Context Menu
            </button>
            <button
              className={`sidebar-tab-btn ${activeTab === 'advanced' ? 'active' : ''}`}
              onClick={() => setActiveTab('advanced')}
            >
              <svg
                className="tab-btn-icon"
                width="14"
                height="14"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2.5"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <circle cx="12" cy="12" r="10" />
                <line x1="12" y1="8" x2="12" y2="12" />
                <line x1="12" y1="16" x2="12.01" y2="16" />
              </svg>
              Advanced
            </button>
            <button
              className={`sidebar-tab-btn ${activeTab === 'about' ? 'active' : ''}`}
              onClick={() => setActiveTab('about')}
            >
              <svg
                className="tab-btn-icon"
                width="14"
                height="14"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2.5"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <circle cx="12" cy="12" r="10" />
                <line x1="12" y1="16" x2="12" y2="12" />
                <line x1="12" y1="8" x2="12.01" y2="8" />
              </svg>
              About & Founder
            </button>
          </div>

          <div className="settings-content-viewport">
            {activeTab === 'personalization' && (
              <div className="personalization-pane-clean" style={{ width: '100%' }}>
                <div className="settings-section">
                  <h3 style={{ fontSize: '16px', fontWeight: '600', marginBottom: '4px' }}>
                    Theme Customization
                  </h3>
                  <p
                    className="settings-group-desc"
                    style={{ color: 'var(--text-muted)', fontSize: '12px', marginBottom: '16px' }}
                  >
                    Personalize your browser interface colors. Choose from one of our carefully
                    curated, harmonious design palettes.
                  </p>

                  <div
                    className="theme-palettes-grid"
                    style={{
                      display: 'grid',
                      gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))',
                      gap: '16px',
                      marginTop: '12px',
                    }}
                  >
                    {palettes.map(p => {
                      const isSelected = p.id === currentPalette;
                      return (
                        <div
                          key={p.id}
                          className={`theme-palette-card ${isSelected ? 'active' : ''}`}
                          onClick={() => {
                            onSelectPalette(p.id);
                            localStorage.setItem('gemini-browser-palette', p.id);
                          }}
                          style={{
                            border: isSelected
                              ? '2px solid var(--color-primary)'
                              : '1px solid var(--border-light)',
                            borderRadius: '12px',
                            overflow: 'hidden',
                            cursor: 'pointer',
                            background: 'var(--bg-deep)',
                            transition: 'all 200ms ease',
                            padding: '2px',
                          }}
                        >
                          <div
                            className="palette-preview-colors"
                            style={{
                              height: '70px',
                              borderRadius: '8px',
                              background: `linear-gradient(135deg, ${p.colors[0]} 0%, ${p.colors[1]} 50%, ${p.colors[2]} 100%)`,
                            }}
                          />
                          <div className="palette-card-info" style={{ padding: '10px 8px 6px' }}>
                            <span
                              className="palette-card-name"
                              style={{
                                display: 'block',
                                fontSize: '13px',
                                fontWeight: '600',
                                color: 'var(--text-primary)',
                              }}
                            >
                              {p.name}
                            </span>
                            <span
                              className="palette-card-label"
                              style={{
                                display: 'block',
                                fontSize: '11px',
                                color: 'var(--text-muted)',
                                marginTop: '2px',
                              }}
                            >
                              {p.label}
                            </span>
                          </div>
                        </div>
                      );
                    })}
                  </div>

                  {/* Tab Layout Setting */}
                  <div style={{ marginTop: '24px', borderTop: '1px solid var(--border-light)', paddingTop: '20px' }}>
                    <h3 style={{ fontSize: '16px', fontWeight: '600', marginBottom: '4px' }}>
                      Tab Layout
                    </h3>
                    <p
                      className="settings-group-desc"
                      style={{ color: 'var(--text-muted)', fontSize: '12px', marginBottom: '12px' }}
                    >
                      Choose where browser tabs appear. Sidebar layout gives more vertical space for page content.
                    </p>
                    <div style={{ display: 'flex', gap: '12px' }}>
                      <button
                        onClick={() => onTabLayoutChange?.('top')}
                        style={{
                          flex: 1, padding: '16px', borderRadius: '10px', border: `2px solid ${tabLayout === 'top' ? 'var(--color-primary)' : 'var(--border-light)'}`,
                          background: tabLayout === 'top' ? 'rgba(99, 102, 241, 0.1)' : 'var(--bg-surface)',
                          color: tabLayout === 'top' ? 'var(--color-primary)' : 'var(--text-secondary)',
                          cursor: 'pointer', textAlign: 'center', fontWeight: 600, fontSize: '13px',
                        }}
                      >
                        <div style={{ fontSize: '20px', marginBottom: '6px' }}>—</div>
                        Top (Default)
                      </button>
                      <button
                        onClick={() => onTabLayoutChange?.('sidebar')}
                        style={{
                          flex: 1, padding: '16px', borderRadius: '10px', border: `2px solid ${tabLayout === 'sidebar' ? 'var(--color-primary)' : 'var(--border-light)'}`,
                          background: tabLayout === 'sidebar' ? 'rgba(99, 102, 241, 0.1)' : 'var(--bg-surface)',
                          color: tabLayout === 'sidebar' ? 'var(--color-primary)' : 'var(--text-secondary)',
                          cursor: 'pointer', textAlign: 'center', fontWeight: 600, fontSize: '13px',
                        }}
                      >
                        <div style={{ fontSize: '20px', marginBottom: '6px' }}>|</div>
                        Sidebar
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {activeTab === 'accounts' && (
              <div
                className="accounts-settings-pane"
                style={{ width: '100%', display: 'flex', flexDirection: 'column', gap: '22px' }}
              >
                {/* 1. Identity & Profile Header Card */}
                <div
                  style={{
                    background: 'var(--bg-deep)',
                    border: '1px solid var(--border-light)',
                    borderRadius: '14px',
                    padding: '20px',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '16px',
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
                      <div
                        onClick={() => fileInputRef.current?.click()}
                        style={{
                          width: '56px',
                          height: '56px',
                          borderRadius: '50%',
                          border: '2px solid var(--color-primary)',
                          overflow: 'hidden',
                          cursor: 'pointer',
                          position: 'relative',
                          background: 'rgba(255, 255, 255, 0.05)',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                        }}
                        title="Click to update avatar"
                      >
                        {editorImageSrc || localStorage.getItem('gemini-browser-profile-pic') ? (
                          <img
                            src={editorImageSrc || localStorage.getItem('gemini-browser-profile-pic') || ''}
                            alt="Avatar"
                            style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                          />
                        ) : (
                          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="var(--color-primary)" strokeWidth="2">
                            <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
                            <circle cx="12" cy="7" r="4" />
                          </svg>
                        )}
                      </div>

                      <div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                          <span style={{ fontSize: '15px', fontWeight: '700', color: 'var(--text-primary)' }}>
                            {profileName}
                          </span>
                          <span
                            style={{
                              fontSize: '10px',
                              fontWeight: '700',
                              textTransform: 'uppercase',
                              letterSpacing: '0.08em',
                              background: 'rgba(99, 102, 241, 0.15)',
                              color: '#818cf8',
                              padding: '2px 8px',
                              borderRadius: '9999px',
                              border: '1px solid rgba(99, 102, 241, 0.3)',
                            }}
                          >
                            Founder & Owner
                          </span>
                        </div>
                        <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>{profileEmail}</span>
                      </div>
                    </div>

                    <button
                      type="button"
                      onClick={() => setShowProfileEditor(true)}
                      style={{
                        padding: '6px 14px',
                        borderRadius: '8px',
                        background: 'rgba(255, 255, 255, 0.06)',
                        border: '1px solid var(--border-light)',
                        color: 'var(--text-primary)',
                        fontSize: '11.5px',
                        fontWeight: '600',
                        cursor: 'pointer',
                      }}
                    >
                      Edit Avatar
                    </button>
                  </div>

                  {/* Inline Profile Edit Fields */}
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', borderTop: '1px solid var(--border-light)', paddingTop: '14px' }}>
                    <div>
                      <label style={{ fontSize: '11px', color: 'var(--text-muted)', display: 'block', marginBottom: '4px', fontWeight: '600' }}>
                        Display Name
                      </label>
                      <input
                        type="text"
                        value={profileName}
                        onChange={e => {
                          setProfileName(e.target.value);
                          const id = localStorage.getItem('gemini-browser-active-profile-id') || '1';
                          localStorage.setItem(`gemini-browser-profile-name-${id}`, e.target.value);
                          localStorage.setItem('gemini-browser-profile-name', e.target.value);
                        }}
                        style={{
                          width: '100%',
                          padding: '8px 12px',
                          borderRadius: '8px',
                          background: 'var(--bg-surface, rgba(255,255,255,0.03))',
                          border: '1px solid var(--border-light)',
                          color: 'var(--text-primary)',
                          fontSize: '12px',
                        }}
                      />
                    </div>

                    <div>
                      <label style={{ fontSize: '11px', color: 'var(--text-muted)', display: 'block', marginBottom: '4px', fontWeight: '600' }}>
                        Sync Email Address
                      </label>
                      <input
                        type="email"
                        value={profileEmail}
                        onChange={e => {
                          setProfileEmail(e.target.value);
                          const id = localStorage.getItem('gemini-browser-active-profile-id') || '1';
                          localStorage.setItem(`gemini-browser-profile-email-${id}`, e.target.value);
                          localStorage.setItem('gemini-browser-profile-email', e.target.value);
                        }}
                        style={{
                          width: '100%',
                          padding: '8px 12px',
                          borderRadius: '8px',
                          background: 'var(--bg-surface, rgba(255,255,255,0.03))',
                          border: '1px solid var(--border-light)',
                          color: 'var(--text-primary)',
                          fontSize: '12px',
                        }}
                      />
                    </div>
                  </div>
                </div>

                {/* 2. End-to-End Encrypted Cloud Sync */}
                <div className="settings-group">
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div>
                      <h3 style={{ margin: 0, fontSize: '15px' }}>End-to-End Encrypted Cloud Sync</h3>
                      <p className="settings-group-desc" style={{ marginTop: '3px' }}>
                        Synchronize your browsing data seamlessly across devices with Zero-Knowledge encryption.
                      </p>
                    </div>
                    <label style={{ display: 'flex', alignItems: 'center', cursor: 'pointer' }}>
                      <input
                        type="checkbox"
                        checked={cloudSyncEnabled}
                        onChange={e => {
                          setCloudSyncEnabled(e.target.checked);
                          localStorage.setItem('gemini-browser-sync-active', String(e.target.checked));
                          window.dispatchEvent(new Event('sync-status-changed'));
                        }}
                      />
                    </label>
                  </div>

                  {/* Sync Category Checkboxes */}
                  <div
                    style={{
                      display: 'grid',
                      gridTemplateColumns: 'repeat(2, 1fr)',
                      gap: '10px',
                      marginTop: '14px',
                      opacity: cloudSyncEnabled ? 1 : 0.45,
                      pointerEvents: cloudSyncEnabled ? 'auto' : 'none',
                      transition: 'opacity 0.2s ease',
                    }}
                  >
                    {[
                      { state: syncTabs, setter: setSyncTabs, key: 'sync_tabs', label: 'Open Tabs & Workspaces' },
                      { state: syncBookmarks, setter: setSyncBookmarks, key: 'sync_bookmarks', label: 'Encrypted Bookmarks & Folders' },
                      { state: syncHistory, setter: setSyncHistory, key: 'sync_history', label: 'Browsing Timeline & History' },
                      { state: syncPass, setter: setSyncPass, key: 'sync_passwords', label: 'Saved Passwords & Credentials' },
                      { state: syncAI, setter: setSyncAI, key: 'sync_ai', label: 'AI Studio Chats & Custom Personas' },
                      { state: syncExtensions, setter: setSyncExtensions, key: 'sync_extensions', label: 'Installed Extensions & Settings' },
                      { state: syncSettings, setter: setSyncSettings, key: 'sync_settings', label: 'Browser Preferences & Configuration' },
                    ].map(item => (
                      <label
                        key={item.key}
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'space-between',
                          padding: '10px 14px',
                          borderRadius: '8px',
                          background: 'var(--bg-deep)',
                          border: '1px solid var(--border-light)',
                          cursor: 'pointer',
                        }}
                      >
                        <span style={{ fontSize: '12.5px', color: 'var(--text-primary)' }}>{item.label}</span>
                        <input
                          type="checkbox"
                          checked={item.state}
                          onChange={e => {
                            item.setter(e.target.checked);
                            localStorage.setItem(item.key, String(e.target.checked));
                          }}
                        />
                      </label>
                    ))}
                  </div>

                  <div style={{ display: 'flex', gap: '8px', marginTop: '14px' }}>
                    <button
                      type="button"
                      onClick={() => {
                        window.dispatchEvent(new Event('trigger-manual-sync'));
                        info('Manual cloud synchronization triggered.');
                      }}
                      style={{
                        padding: '8px 14px',
                        borderRadius: '8px',
                        background: 'rgba(99, 102, 241, 0.12)',
                        border: '1px solid rgba(99, 102, 241, 0.3)',
                        color: '#818cf8',
                        fontSize: '11.5px',
                        fontWeight: '700',
                        cursor: 'pointer',
                      }}
                    >
                      Force Resync Now
                    </button>
                  </div>
                </div>

                {/* 3. Multi-Account Switcher Matrix */}
                <div className="settings-group">
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
                    <div>
                      <h3 style={{ margin: 0, fontSize: '15px' }}>Profile Switcher & Workspaces</h3>
                      <p className="settings-group-desc" style={{ marginTop: '2px' }}>
                        Switch active browser profiles or isolate work and personal browsing environments.
                      </p>
                    </div>
                  </div>

                  <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                    {accounts.map(acc => (
                      <div
                        key={acc.id}
                        onClick={() => handleSwitchAccount(acc.id)}
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'space-between',
                          padding: '12px 16px',
                          borderRadius: '10px',
                          border: acc.active ? '1px solid var(--color-primary)' : '1px solid var(--border-light)',
                          background: acc.active ? 'rgba(99, 102, 241, 0.08)' : 'var(--bg-deep)',
                          cursor: 'pointer',
                          transition: 'all 0.15s ease',
                        }}
                      >
                        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                          <div
                            style={{
                              width: '32px',
                              height: '32px',
                              borderRadius: '50%',
                              background: acc.active ? 'var(--color-primary)' : 'rgba(255,255,255,0.08)',
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              color: '#fff',
                              fontSize: '12px',
                              fontWeight: '700',
                            }}
                          >
                            {acc.name.charAt(0).toUpperCase()}
                          </div>
                          <div>
                            <span style={{ fontSize: '13px', fontWeight: '600', color: 'var(--text-primary)', display: 'block' }}>
                              {acc.name}
                            </span>
                            <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>{acc.email}</span>
                          </div>
                        </div>

                        <span
                          style={{
                            fontSize: '11px',
                            fontWeight: '700',
                            color: acc.active ? 'var(--color-primary)' : 'var(--text-muted)',
                            padding: '4px 10px',
                            borderRadius: '6px',
                            background: acc.active ? 'rgba(99, 102, 241, 0.15)' : 'transparent',
                          }}
                        >
                          {acc.active ? 'Active Profile' : 'Switch'}
                        </span>
                      </div>
                    ))}
                  </div>

                  {/* Data Portability */}
                  <div style={{ display: 'flex', gap: '10px', marginTop: '14px' }}>
                    <button
                      className="import-browser-data-btn"
                      onClick={handleStartImport}
                      disabled={isImporting}
                      style={{
                        padding: '10px 16px',
                        background: 'var(--bg-deep)',
                        border: '1px solid var(--border-light)',
                        color: 'var(--text-primary)',
                        borderRadius: '8px',
                        fontSize: '12px',
                        fontWeight: '600',
                        cursor: 'pointer',
                      }}
                    >
                      {isImporting ? `Importing data (${importProgress}%)...` : 'Import Profile Data'}
                    </button>
                  </div>
                  {/* Profile Editor Modal / Popover */}
                  {showProfileEditor && (
                    <div
                      className="profile-editor-popover-card"
                      style={{
                        border: '1px solid var(--border-light)',
                        borderRadius: '12px',
                        padding: '16px',
                        background: 'var(--bg-deep)',
                        marginTop: '8px',
                      }}
                    >
                      <div
                        className="popover-header"
                        style={{
                          display: 'flex',
                          justifyContent: 'space-between',
                          marginBottom: '12px',
                        }}
                      >
                        <h4 style={{ fontSize: '14px', fontWeight: '600' }}>Profile Picture</h4>
                        <button
                          className="popover-close-btn"
                          onClick={() => setShowProfileEditor(false)}
                          style={{
                            background: 'none',
                            border: 'none',
                            color: 'var(--text-muted)',
                            cursor: 'pointer',
                            fontSize: '16px',
                          }}
                        >
                          ×
                        </button>
                      </div>
                      <div
                        className="popover-body"
                        style={{
                          display: 'flex',
                          flexDirection: 'column',
                          alignItems: 'center',
                          gap: '16px',
                        }}
                      >
                        <div
                          className="popover-avatar-circle"
                          onClick={() => fileInputRef.current?.click()}
                          style={{
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            cursor: 'pointer',
                            width: '90px',
                            height: '90px',
                            borderRadius: '50%',
                            border: '2px dashed var(--border-light)',
                            overflow: 'hidden',
                            background: 'rgba(255, 255, 255, 0.02)',
                          }}
                        >
                          {editorImageSrc ? (
                            <img
                              src={editorImageSrc}
                              alt="Editor"
                              style={{
                                width: '100%',
                                height: '100%',
                                objectFit: 'cover',
                                transform: `scale(${editorZoom}) rotate(${editorRotation}deg)`,
                              }}
                            />
                          ) : (
                            <div className="popover-avatar-placeholder-gfx">
                              <svg
                                width="24"
                                height="24"
                                viewBox="0 0 24 24"
                                fill="none"
                                stroke="currentColor"
                                strokeWidth="2.5"
                                strokeLinecap="round"
                                strokeLinejoin="round"
                                className="gfx-icon"
                                style={{ color: 'var(--text-muted)' }}
                              >
                                <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
                                <circle cx="8.5" cy="8.5" r="1.5" />
                                <polyline points="21 15 16 10 5 21" />
                              </svg>
                            </div>
                          )}
                        </div>
                        <input
                          type="file"
                          ref={fileInputRef}
                          style={{ display: 'none' }}
                          accept="image/*"
                          onChange={handleEditorFile}
                        />

                        <div
                          className="popover-slider-row"
                          style={{
                            width: '100%',
                            display: 'flex',
                            flexDirection: 'column',
                            gap: '4px',
                          }}
                        >
                          <span
                            className="popover-slider-lbl"
                            style={{ fontSize: '11px', color: 'var(--text-muted)' }}
                          >
                            Zoom In/Out
                          </span>
                          <input
                            type="range"
                            min="1"
                            max="3"
                            step="0.1"
                            value={editorZoom}
                            onChange={e => setEditorZoom(parseFloat(e.target.value))}
                            style={{ width: '100%' }}
                          />
                        </div>
                        <div
                          className="popover-slider-row"
                          style={{
                            width: '100%',
                            display: 'flex',
                            flexDirection: 'column',
                            gap: '4px',
                          }}
                        >
                          <span
                            className="popover-slider-lbl"
                            style={{ fontSize: '11px', color: 'var(--text-muted)' }}
                          >
                            Rotation
                          </span>
                          <input
                            type="range"
                            min="0"
                            max="360"
                            step="5"
                            value={editorRotation}
                            onChange={e => setEditorRotation(parseInt(e.target.value, 10))}
                            style={{ width: '100%' }}
                          />
                        </div>
                        <button
                          className="popover-save-btn"
                          onClick={handleSaveEditor}
                          style={{
                            width: '100%',
                            padding: '8px 12px',
                            background: 'linear-gradient(135deg, #7c3aed 0%, #ec4899 100%)',
                            color: 'white',
                            border: 'none',
                            borderRadius: '6px',
                            fontSize: '12px',
                            fontWeight: '600',
                            cursor: 'pointer',
                          }}
                        >
                          Save Picture
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            )}

            {activeTab !== 'personalization' &&
              activeTab !== 'accounts' && (
                <div className="other-tab-fallback-pane" style={{ width: '100%' }}>
                  {activeTab === 'general' && (
                    <div
                      className="settings-group-container"
                      style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}
                    >
                      <div className="settings-group">
                        <h3>Default Search Engine</h3>
                        <p className="settings-group-desc">
                          Choose the default search engine used for address bar queries and omnibox searches.
                        </p>
                        <div className="search-engines-list" style={{ marginTop: '12px' }}>
                          {engines.map(engine => {
                            const isSelected = engine.id === currentEngine;
                            return (
                              <div
                                key={engine.id}
                                className={`search-engine-option ${isSelected ? 'active-option' : ''}`}
                                onClick={() => onSelectEngine(engine.id)}
                              >
                                <div className="option-indicator">
                                  {isSelected && <div className="indicator-dot" />}
                                </div>
                                <div className="option-details">
                                  <span className="option-name">{engine.name}</span>
                                  <span className="option-desc">{engine.description}</span>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      </div>

                      <div className="settings-group">
                        <h3>Tab Memory Suspension</h3>
                        <p className="settings-group-desc">
                          Automatically suspend background tabs to free up system memory (RAM) and
                          CPU resources when inactive.
                        </p>
                        <div style={{ marginTop: '10px' }}>
                          <select
                            value={suspensionTimer}
                            onChange={e => handleUpdateSuspensionTimer(e.target.value)}
                            style={{
                              width: '100%',
                              padding: '10px 14px',
                              borderRadius: '8px',
                              border: '1px solid var(--border-light)',
                              background: 'var(--bg-deep)',
                              color: 'var(--text-primary)',
                              fontSize: '13px',
                              cursor: 'pointer',
                            }}
                          >
                            <option value="300000">5 Minutes</option>
                            <option value="600000">10 Minutes</option>
                            <option value="900000">15 Minutes</option>
                            <option value="3600000">1 Hour</option>
                            <option value="-1">Never Suspend</option>
                          </select>
                        </div>
                      </div>
                    </div>
                  )}

                  {/* ─────────────────────────────────────────────────────────────
                      AI STUDIO & NEURAL MODELS TAB
                      ───────────────────────────────────────────────────────────── */}
                  {activeTab === 'ai-studio' && (
                    <div
                      className="settings-group-container"
                      style={{ display: 'flex', flexDirection: 'column', gap: '22px' }}
                    >
                      {/* Add API Key */}
                      <div className="settings-group">
                        <h3>Add API Key</h3>
                        <p className="settings-group-desc">
                          Paste any API key — the provider is auto-detected. Works with Gemini, OpenAI, Anthropic, Groq, OpenRouter, DeepSeek, and more.
                        </p>
                        <div style={{ display: 'flex', gap: '8px', marginTop: '12px' }}>
                          <input
                            type="password"
                            value={newApiKey}
                            onChange={e => handleApiKeyInput(e.target.value)}
                            onKeyDown={e => e.key === 'Enter' && handleSaveApiKey()}
                            placeholder="Paste your API key here..."
                            style={{
                              flex: 1, padding: '10px 14px', borderRadius: '8px',
                              border: `1px solid ${detectedProvider ? 'var(--color-success, #10b981)' : 'var(--border-light)'}`,
                              background: 'var(--bg-deep)', color: 'var(--text-primary)', fontSize: '13px', outline: 'none',
                            }}
                          />
                          <button
                            onClick={handleSaveApiKey}
                            disabled={!newApiKey.trim() || !detectedProvider}
                            style={{
                              background: detectedProvider ? 'var(--color-primary)' : 'rgba(255,255,255,0.06)',
                              color: detectedProvider ? '#fff' : 'var(--text-muted)',
                              border: 'none', padding: '10px 20px', borderRadius: '8px',
                              fontSize: '12px', fontWeight: '600', cursor: detectedProvider ? 'pointer' : 'not-allowed',
                              transition: 'all 150ms', whiteSpace: 'nowrap',
                            }}
                          >
                            {detectedProvider ? `Add ${PROVIDERS.find(p => p.id === detectedProvider)?.name || detectedProvider}` : 'Auto-detect'}
                          </button>
                        </div>
                      </div>

                      {/* Configured Providers */}
                      {Object.entries(apiKeys).filter(([, v]) => v).length > 0 && (
                        <div className="settings-group">
                          <h3>Configured Providers</h3>
                          <p className="settings-group-desc">
                            Active provider is used for all AI features. Click to switch.
                          </p>
                          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginTop: '12px' }}>
                            {Object.entries(apiKeys).filter(([, v]) => v).map(([providerId, key]) => {
                              const config = PROVIDERS.find(p => p.id === providerId);
                              const isActive = activeProvider === providerId;
                              const isRevealed = showKeys[providerId];
                              return (
                                <div
                                  key={providerId}
                                  onClick={() => onSelectProvider(providerId)}
                                  style={{
                                    display: 'flex', alignItems: 'center', gap: '12px',
                                    padding: '12px 14px', borderRadius: '10px', cursor: 'pointer',
                                    border: `1.5px solid ${isActive ? 'var(--color-primary)' : 'var(--border-light)'}`,
                                    background: isActive ? 'rgba(99, 102, 241, 0.08)' : 'var(--bg-deep)',
                                    transition: 'all 150ms',
                                  }}
                                >
                                  <div style={{
                                    width: '8px', height: '8px', borderRadius: '50%',
                                    background: isActive ? 'var(--color-primary)' : 'rgba(255,255,255,0.15)',
                                    flexShrink: 0,
                                  }} />
                                  <div style={{ flex: 1, minWidth: 0 }}>
                                    <div style={{ fontSize: '13px', fontWeight: '600', color: 'var(--text-primary)' }}>
                                      {config?.name || providerId}
                                    </div>
                                    <div style={{ fontSize: '11px', color: 'var(--text-muted)', fontFamily: 'monospace', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                      {isRevealed ? key : key.slice(0, 8) + '••••••' + key.slice(-4)}
                                    </div>
                                  </div>
                                  <div style={{ display: 'flex', gap: '4px', flexShrink: 0 }}>
                                    <button
                                      onClick={e => { e.stopPropagation(); setShowKeys(p => ({ ...p, [providerId]: !p[providerId] })); }}
                                      style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', padding: '4px', fontSize: '11px' }}
                                    >
                                      {isRevealed ? 'Hide' : 'Show'}
                                    </button>
                                    <button
                                      onClick={e => { e.stopPropagation(); handleRemoveProviderKey(providerId); }}
                                      style={{ background: 'none', border: 'none', color: 'var(--text-destructive, #ef4444)', cursor: 'pointer', padding: '4px', fontSize: '11px' }}
                                    >
                                      Remove
                                    </button>
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      )}

                      {/* Local Models */}
                      <div className="settings-group">
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                          <div>
                            <h3>Local Models (Ollama)</h3>
                            <p className="settings-group-desc">
                              {localModels.length > 0
                                ? `${localModels.length} model${localModels.length > 1 ? 's' : ''} detected on localhost:11434`
                                : 'No Ollama instance detected. Install Ollama to run models locally.'}
                            </p>
                          </div>
                          <button
                            onClick={handleDetectLocalModels}
                            disabled={localModelsLoading}
                            style={{
                              background: 'rgba(255,255,255,0.06)', color: 'var(--text-secondary)',
                              border: '1px solid var(--border-light)', padding: '6px 12px', borderRadius: '6px',
                              fontSize: '11px', fontWeight: '600', cursor: 'pointer', transition: 'opacity 150ms',
                            }}
                          >
                            {localModelsLoading ? 'Scanning...' : 'Refresh'}
                          </button>
                        </div>

                        {localModels.length > 0 && (
                          <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', marginTop: '12px' }}>
                            {localModels.map(model => (
                              <div
                                key={model.id}
                                onClick={() => { onSelectProvider('local'); storage.setActiveModelId(model.id); }}
                                style={{
                                  display: 'flex', alignItems: 'center', gap: '10px',
                                  padding: '10px 12px', borderRadius: '8px', cursor: 'pointer',
                                  border: `1px solid ${activeProvider === 'local' ? 'var(--color-primary)' : 'var(--border-light)'}`,
                                  background: 'var(--bg-deep)', transition: 'all 150ms',
                                }}
                              >
                                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                  <rect x="4" y="4" width="16" height="16" rx="2" />
                                  <rect x="9" y="9" width="6" height="6" />
                                  <line x1="9" y1="1" x2="9" y2="4" /><line x1="15" y1="1" x2="15" y2="4" />
                                  <line x1="9" y1="20" x2="9" y2="23" /><line x1="15" y1="20" x2="15" y2="23" />
                                  <line x1="20" y1="9" x2="23" y2="9" /><line x1="20" y1="15" x2="23" y2="15" />
                                  <line x1="1" y1="9" x2="4" y2="9" /><line x1="1" y1="15" x2="4" y2="15" />
                                </svg>
                                <div style={{ flex: 1 }}>
                                  <div style={{ fontSize: '12px', fontWeight: '600', color: 'var(--text-primary)' }}>{model.name}</div>
                                  <div style={{ fontSize: '10px', color: 'var(--text-muted)' }}>
                                    {model.parameterSize && `${model.parameterSize} • `}{model.size || 'Local'}
                                  </div>
                                </div>
                              </div>
                            ))}
                          </div>
                        )}

                        {/* Add custom local model */}
                        <div style={{ display: 'flex', gap: '8px', marginTop: '12px' }}>
                          <input
                            type="text"
                            value={newLocalModelId}
                            onChange={e => setNewLocalModelId(e.target.value)}
                            onKeyDown={e => e.key === 'Enter' && handleAddLocalModel()}
                            placeholder="Add model by name (e.g. llama3.2:3b)"
                            style={{
                              flex: 1, padding: '8px 12px', borderRadius: '6px',
                              border: '1px solid var(--border-light)', background: 'var(--bg-deep)',
                              color: 'var(--text-primary)', fontSize: '12px', outline: 'none',
                            }}
                          />
                          <button
                            onClick={handleAddLocalModel}
                            disabled={!newLocalModelId.trim()}
                            style={{
                              background: newLocalModelId.trim() ? 'var(--color-primary)' : 'rgba(255,255,255,0.06)',
                              color: newLocalModelId.trim() ? '#fff' : 'var(--text-muted)',
                              border: 'none', padding: '8px 14px', borderRadius: '6px',
                              fontSize: '11px', fontWeight: '600', cursor: newLocalModelId.trim() ? 'pointer' : 'not-allowed',
                            }}
                          >
                            Add
                          </button>
                        </div>
                      </div>

                      {/* Default Reasoning Persona */}
                      <div className="settings-group">
                        <h3>Default Reasoning Persona</h3>
                        <p className="settings-group-desc">
                          Configure default system prompts and specialized reasoning behaviors for new AI investigations.
                        </p>
                        <div style={{ marginTop: '10px' }}>
                          <select
                            value={defaultPersona}
                            onChange={e => {
                              setDefaultPersona(e.target.value);
                              localStorage.setItem('ai_default_persona', e.target.value);
                            }}
                            style={{
                              width: '100%', padding: '10px 14px', borderRadius: '8px',
                              border: '1px solid var(--border-light)', background: 'var(--bg-deep)',
                              color: 'var(--text-primary)', fontSize: '13px', cursor: 'pointer',
                            }}
                          >
                            <option value="general">General Intelligence (Concise Systems Thinking)</option>
                            <option value="code">Code Architect (Strict TypeScript, Refactors, Algorithmic Solutions)</option>
                            <option value="research">Deep Research (Literature Synthesis, Citations & Data Analysis)</option>
                            <option value="memo">Executive Memo (High-Signal Bullet Briefings)</option>
                            <option value="security">Security Auditor (Vulnerability Assessment & Attack Vector Analysis)</option>
                          </select>
                        </div>
                      </div>

                      {/* AI Capabilities */}
                      <div className="settings-group">
                        <h3>AI Capabilities & Autonomy</h3>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', marginTop: '12px' }}>
                          <label style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 14px', borderRadius: '8px', background: 'var(--bg-deep)', border: '1px solid var(--border-light)', cursor: 'pointer' }}>
                            <div>
                              <span style={{ fontSize: '13px', fontWeight: '600', color: 'var(--text-primary)' }}>Live Web Grounding</span>
                              <p style={{ fontSize: '11px', color: 'var(--text-muted)', margin: '2px 0 0 0' }}>Allow AI models to perform real-time search queries for fresh information.</p>
                            </div>
                            <input
                              type="checkbox"
                              checked={webGrounding}
                              onChange={e => {
                                setWebGrounding(e.target.checked);
                                localStorage.setItem('ai_web_grounding', String(e.target.checked));
                              }}
                            />
                          </label>

                          <label style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 14px', borderRadius: '8px', background: 'var(--bg-deep)', border: '1px solid var(--border-light)', cursor: 'pointer' }}>
                            <div>
                              <span style={{ fontSize: '13px', fontWeight: '600', color: 'var(--text-primary)' }}>Autonomous Agent Mode</span>
                              <p style={{ fontSize: '11px', color: 'var(--text-muted)', margin: '2px 0 0 0' }}>Enable autonomous web browsing, element clicking, and multi-step workflows.</p>
                            </div>
                            <input
                              type="checkbox"
                              checked={agentMode}
                              onChange={e => {
                                setAgentMode(e.target.checked);
                                localStorage.setItem('ai_agent_enabled', String(e.target.checked));
                              }}
                            />
                          </label>
                        </div>
                      </div>
                    </div>
                  )}

                  {/* ─────────────────────────────────────────────────────────────
                      CHRONOS FOCUS ENGINE SETTINGS TAB
                      ───────────────────────────────────────────────────────────── */}
                  {activeTab === 'chronos' && (
                    <div
                      className="settings-group-container"
                      style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}
                    >
                      <div className="settings-group">
                        <h3>Pomodoro & Focus Durations</h3>
                        <p className="settings-group-desc">
                          Configure the default timer countdown lengths in minutes for each sprint mode.
                        </p>

                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px', marginTop: '14px' }}>
                          <div>
                            <label style={{ fontSize: '12px', color: 'var(--text-secondary)', display: 'block', marginBottom: '4px' }}>
                              Focus Sprint (minutes)
                            </label>
                            <input
                              type="number"
                              min="1"
                              max="180"
                              value={focusDuration}
                              onChange={e => {
                                setFocusDuration(e.target.value);
                                localStorage.setItem('chronos_focus_duration', e.target.value);
                              }}
                              style={{ width: '100%', padding: '10px 14px', borderRadius: '8px', border: '1px solid var(--border-light)', background: 'var(--bg-deep)', color: 'var(--text-primary)', fontSize: '13px' }}
                            />
                          </div>

                          <div>
                            <label style={{ fontSize: '12px', color: 'var(--text-secondary)', display: 'block', marginBottom: '4px' }}>
                              Short Break (minutes)
                            </label>
                            <input
                              type="number"
                              min="1"
                              max="60"
                              value={shortBreakDuration}
                              onChange={e => {
                                setShortBreakDuration(e.target.value);
                                localStorage.setItem('chronos_short_break', e.target.value);
                              }}
                              style={{ width: '100%', padding: '10px 14px', borderRadius: '8px', border: '1px solid var(--border-light)', background: 'var(--bg-deep)', color: 'var(--text-primary)', fontSize: '13px' }}
                            />
                          </div>

                          <div>
                            <label style={{ fontSize: '12px', color: 'var(--text-secondary)', display: 'block', marginBottom: '4px' }}>
                              Long Break (minutes)
                            </label>
                            <input
                              type="number"
                              min="1"
                              max="120"
                              value={longBreakDuration}
                              onChange={e => {
                                setLongBreakDuration(e.target.value);
                                localStorage.setItem('chronos_long_break', e.target.value);
                              }}
                              style={{ width: '100%', padding: '10px 14px', borderRadius: '8px', border: '1px solid var(--border-light)', background: 'var(--bg-deep)', color: 'var(--text-primary)', fontSize: '13px' }}
                            />
                          </div>

                          <div>
                            <label style={{ fontSize: '12px', color: 'var(--text-secondary)', display: 'block', marginBottom: '4px' }}>
                              Intense Deep Work (minutes)
                            </label>
                            <input
                              type="number"
                              min="1"
                              max="240"
                              value={intenseDuration}
                              onChange={e => {
                                setIntenseDuration(e.target.value);
                                localStorage.setItem('chronos_intense_duration', e.target.value);
                              }}
                              style={{ width: '100%', padding: '10px 14px', borderRadius: '8px', border: '1px solid var(--border-light)', background: 'var(--bg-deep)', color: 'var(--text-primary)', fontSize: '13px' }}
                            />
                          </div>
                        </div>
                      </div>

                      <div className="settings-group">
                        <h3>Productivity Targets & Automation</h3>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', marginTop: '12px' }}>
                          <label style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 14px', borderRadius: '8px', background: 'var(--bg-deep)', border: '1px solid var(--border-light)', cursor: 'pointer' }}>
                            <div>
                              <span style={{ fontSize: '13px', fontWeight: '600', color: 'var(--text-primary)' }}>Audio Chime on Timer Finish</span>
                              <p style={{ fontSize: '11px', color: 'var(--text-muted)', margin: '2px 0 0 0' }}>Play an executive chime sound when a focus block or break expires.</p>
                            </div>
                            <input
                              type="checkbox"
                              checked={soundEnabled}
                              onChange={e => {
                                setSoundEnabled(e.target.checked);
                                localStorage.setItem('chronos_chime_sound', String(e.target.checked));
                              }}
                            />
                          </label>

                          <label style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 14px', borderRadius: '8px', background: 'var(--bg-deep)', border: '1px solid var(--border-light)', cursor: 'pointer' }}>
                            <div>
                              <span style={{ fontSize: '13px', fontWeight: '600', color: 'var(--text-primary)' }}>Auto-Start Break Timers</span>
                              <p style={{ fontSize: '11px', color: 'var(--text-muted)', margin: '2px 0 0 0' }}>Automatically start the break countdown when a focus round ends.</p>
                            </div>
                            <input
                              type="checkbox"
                              checked={autoStartBreaks}
                              onChange={e => {
                                setAutoStartBreaks(e.target.checked);
                                localStorage.setItem('chronos_auto_breaks', String(e.target.checked));
                              }}
                            />
                          </label>

                          <div>
                            <label style={{ fontSize: '12px', color: 'var(--text-secondary)', display: 'block', marginBottom: '4px' }}>
                              Daily Focus Target Goal (minutes)
                            </label>
                            <input
                              type="number"
                              min="10"
                              max="720"
                              value={dailyTarget}
                              onChange={e => {
                                setDailyTarget(e.target.value);
                                localStorage.setItem('chronos_daily_target', e.target.value);
                              }}
                              style={{ width: '100%', padding: '10px 14px', borderRadius: '8px', border: '1px solid var(--border-light)', background: 'var(--bg-deep)', color: 'var(--text-primary)', fontSize: '13px' }}
                            />
                          </div>
                        </div>
                      </div>
                    </div>
                  )}

                  {/* ─────────────────────────────────────────────────────────────
                      GRID & HOMESCREEN WIDGETS TAB
                      ───────────────────────────────────────────────────────────── */}
                  {activeTab === 'grid' && (
                    <div
                      className="settings-group-container"
                      style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}
                    >
                      <div className="settings-group">
                        <h3>Density & Interface Mode</h3>
                        <p className="settings-group-desc">
                          Toggle between standard spacious dashboard and compact high-density layout.
                        </p>

                        <div style={{ marginTop: '12px' }}>
                          <label style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 16px', borderRadius: '10px', background: 'var(--bg-deep)', border: '1px solid var(--border-light)', cursor: 'pointer' }}>
                            <div>
                              <span style={{ fontSize: '13px', fontWeight: '700', color: 'var(--text-primary)' }}>Compact High-Density UI (Ghetto Mode)</span>
                              <p style={{ fontSize: '11.5px', color: 'var(--text-muted)', margin: '2px 0 0 0' }}>Condenses paddings, increases screen viewport yield, and minimizes UI chrome.</p>
                            </div>
                            <input
                              type="checkbox"
                              checked={compactMode}
                              onChange={e => {
                                setCompactMode(e.target.checked);
                                localStorage.setItem('icrush_compact_mode', String(e.target.checked));
                                window.dispatchEvent(new Event('compact-mode-toggled'));
                              }}
                            />
                          </label>
                        </div>
                      </div>

                      <div className="settings-group">
                        <h3>Homescreen Widget Deck Visibility</h3>
                        <p className="settings-group-desc">
                          Customize which intelligence and productivity widgets appear on your new tab homescreen.
                        </p>

                        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', marginTop: '12px' }}>
                          {[
                            { state: showWeather, setter: setShowWeather, key: 'widget_show_weather', label: 'Live Weather Forecast Widget', desc: 'Real-time temperature, condition metrics, and 3-day forecast.' },
                            { state: showShortcuts, setter: setShowShortcuts, key: 'widget_show_shortcuts', label: 'Quick Shortcuts & Top Sites Grid', desc: 'Pinned favorites and most visited web application icons.' },
                            { state: showVitals, setter: setShowVitals, key: 'widget_show_vitals', label: 'System Vitals & Hardware Telemetry', desc: 'Real-time CPU, RAM, and browser process performance metrics.' },
                            { state: showStockTicker, setter: setShowStockTicker, key: 'widget_show_stocks', label: 'Financial & Market Ticker Bar', desc: 'Live global market indices and custom ticker watchlists.' },
                            { state: showDailyNotes, setter: setShowDailyNotes, key: 'widget_show_notes', label: 'Daily Scratchpad & Quick Notes', desc: 'Instant local markdown scratchpad on your homescreen.' },
                          ].map(w => (
                            <label
                              key={w.key}
                              style={{
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'space-between',
                                padding: '10px 14px',
                                borderRadius: '8px',
                                background: 'var(--bg-deep)',
                                border: '1px solid var(--border-light)',
                                cursor: 'pointer',
                              }}
                            >
                              <div>
                                <span style={{ fontSize: '13px', fontWeight: '600', color: 'var(--text-primary)' }}>{w.label}</span>
                                <p style={{ fontSize: '11px', color: 'var(--text-muted)', margin: '2px 0 0 0' }}>{w.desc}</p>
                              </div>
                              <input
                                type="checkbox"
                                checked={w.state}
                                onChange={e => {
                                  w.setter(e.target.checked);
                                  localStorage.setItem(w.key, String(e.target.checked));
                                  // Also sync to homescreen-widgets JSON so the homescreen reads it
                                  const widgetsKey = 'homescreen-widgets';
                                  try {
                                    const stored = JSON.parse(localStorage.getItem(widgetsKey) || '{}');
                                    // Map widget_show_* keys to homescreen widget names
                                    const nameMap: Record<string, string> = {
                                      widget_show_weather: 'Weather',
                                      widget_show_shortcuts: 'Quick Links',
                                      widget_show_vitals: 'System Monitor',
                                      widget_show_stocks: 'News',
                                      widget_show_notes: 'Notes',
                                    };
                                    const widgetName = nameMap[w.key];
                                    if (widgetName) {
                                      stored[widgetName] = e.target.checked;
                                      localStorage.setItem(widgetsKey, JSON.stringify(stored));
                                    }
                                  } catch { /* ignore */ }
                                  window.dispatchEvent(new Event('widgets-updated'));
                                }}
                              />
                            </label>
                          ))}
                        </div>
                      </div>
                    </div>
                  )}

                  {activeTab === 'extensions' && (
                    <div className="extensions-settings-pane">
                      <div className="settings-group">
                        <div
                          style={{
                            display: 'flex',
                            justifyContent: 'space-between',
                            alignItems: 'center',
                            marginBottom: '14px',
                          }}
                        >
                          <div>
                            <h3>Chrome Extensions</h3>
                            <p className="settings-group-desc">
                              Install extensions from Chrome Web Store or load unpacked folders.
                            </p>
                          </div>
                          <div style={{ display: 'flex', gap: '8px' }}>
                            <a
                              href="https://chromewebstore.google.com/"
                              target="_blank"
                              rel="noopener noreferrer"
                              style={{
                                background: 'rgba(255,255,255,0.06)',
                                color: 'var(--text-secondary)',
                                border: '1px solid var(--border-light)',
                                padding: '8px 14px',
                                borderRadius: '6px',
                                fontSize: '11px',
                                fontWeight: '600',
                                cursor: 'pointer',
                                textDecoration: 'none',
                                transition: 'opacity 150ms',
                              }}
                            >
                              Chrome Web Store
                            </a>
                            <button
                              onClick={handleLoadExtension}
                              style={{
                                background: 'var(--color-primary)',
                                color: '#fff',
                                border: 'none',
                                padding: '8px 14px',
                                borderRadius: '6px',
                                fontSize: '11px',
                                fontWeight: '600',
                                cursor: 'pointer',
                                transition: 'opacity 150ms',
                              }}
                            >
                              Load Unpacked
                            </button>
                          </div>
                        </div>

                        {/* Install from URL */}
                        <div style={{
                          display: 'flex', gap: '8px', marginBottom: '16px',
                          padding: '12px', border: '1px solid var(--border-light)',
                          borderRadius: '8px', background: 'var(--bg-deep)',
                        }}>
                          <input
                            type="text"
                            placeholder="Paste Chrome Web Store URL or .crx download link..."
                            value={extensionUrl}
                            onChange={e => setExtensionUrl(e.target.value)}
                            onKeyDown={e => e.key === 'Enter' && handleInstallFromUrl()}
                            style={{
                              flex: 1, background: 'rgba(255,255,255,0.04)',
                              border: '1px solid var(--border-light)', borderRadius: '6px',
                              color: 'var(--text-primary)', padding: '8px 12px',
                              fontSize: '12px', outline: 'none',
                            }}
                          />
                          <button
                            onClick={handleInstallFromUrl}
                            disabled={!extensionUrl.trim() || isInstallingExt}
                            style={{
                              background: extensionUrl.trim() && !isInstallingExt ? 'var(--color-primary)' : 'rgba(255,255,255,0.06)',
                              color: extensionUrl.trim() && !isInstallingExt ? '#fff' : 'var(--text-muted)',
                              border: 'none', padding: '8px 16px', borderRadius: '6px',
                              fontSize: '11px', fontWeight: '600', cursor: extensionUrl.trim() && !isInstallingExt ? 'pointer' : 'not-allowed',
                              transition: 'opacity 150ms', whiteSpace: 'nowrap',
                            }}
                          >
                            {isInstallingExt ? 'Installing...' : 'Install'}
                          </button>
                        </div>

                        {extensions.length === 0 ? (
                          <div
                            className="extensions-empty-state"
                            style={{
                              padding: '32px',
                              textAlign: 'center',
                              border: '1px dashed var(--border-light)',
                              borderRadius: '8px',
                              color: 'var(--text-muted)',
                              fontSize: '12px',
                            }}
                          >
                            No extensions loaded yet. Load an unpacked extension folder to get
                            started.
                          </div>
                        ) : (
                          <div
                            className="extensions-list"
                            style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}
                          >
                            {extensions.map(ext => (
                              <div
                                key={ext.id}
                                className="extension-item-card"
                                style={{
                                  display: 'flex',
                                  alignItems: 'center',
                                  justifyContent: 'space-between',
                                  padding: '12px 16px',
                                  border: '1px solid var(--border-light)',
                                  borderRadius: '8px',
                                  background: 'var(--bg-deep)',
                                }}
                              >
                                <div
                                  style={{
                                    display: 'flex',
                                    flexDirection: 'column',
                                    gap: '2px',
                                    flex: '1',
                                    marginRight: '16px',
                                  }}
                                >
                                  <div
                                    style={{ display: 'flex', alignItems: 'center', gap: '8px' }}
                                  >
                                    <span
                                      style={{
                                        fontSize: '13px',
                                        fontWeight: '600',
                                        color: 'var(--text-primary)',
                                      }}
                                    >
                                      {ext.name}
                                    </span>
                                    <span
                                      style={{
                                        fontSize: '10px',
                                        background: 'rgba(255,255,255,0.06)',
                                        padding: '2px 6px',
                                        borderRadius: '4px',
                                        color: 'var(--text-muted)',
                                      }}
                                    >
                                      v{ext.version}
                                    </span>
                                  </div>
                                  <span
                                    style={{
                                      fontSize: '11px',
                                      color: 'var(--text-muted)',
                                      overflow: 'hidden',
                                      textOverflow: 'ellipsis',
                                      whiteSpace: 'nowrap',
                                      maxWidth: '350px',
                                    }}
                                  >
                                    {ext.path}
                                  </span>
                                </div>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                                  <label
                                    className="switch-toggle"
                                    style={{
                                      display: 'flex',
                                      alignItems: 'center',
                                      cursor: 'pointer',
                                    }}
                                  >
                                    <input
                                      type="checkbox"
                                      checked={ext.enabled}
                                      onChange={e =>
                                        handleToggleExtension(ext.id, e.target.checked)
                                      }
                                      style={{ display: 'none' }}
                                    />
                                    <div
                                      style={{
                                        width: '32px',
                                        height: '18px',
                                        borderRadius: '9px',
                                        background: ext.enabled
                                          ? 'var(--color-primary)'
                                          : 'rgba(255,255,255,0.1)',
                                        position: 'relative',
                                        transition: 'background 200ms',
                                      }}
                                    >
                                      <div
                                        style={{
                                          width: '14px',
                                          height: '14px',
                                          borderRadius: '50%',
                                          background: '#fff',
                                          position: 'absolute',
                                          top: '2px',
                                          left: ext.enabled ? '16px' : '2px',
                                          transition: 'left 200ms',
                                        }}
                                      />
                                    </div>
                                  </label>
                                  <button
                                    onClick={() => handleRemoveExtension(ext.id)}
                                    style={{
                                      background: 'transparent',
                                      border: 'none',
                                      color: 'var(--text-destructive)',
                                      cursor: 'pointer',
                                      padding: '4px',
                                      display: 'flex',
                                      alignItems: 'center',
                                      justifyContent: 'center',
                                      opacity: '0.8',
                                      transition: 'opacity 150ms',
                                    }}
                                    title="Remove extension"
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
                                      <polyline points="3 6 5 6 21 6"></polyline>
                                      <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
                                    </svg>
                                  </button>
                                </div>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    </div>
                  )}

                  {activeTab === 'privacy' && (
                    <div className="privacy-settings-pane" style={{ width: '100%' }}>
                      <div
                        className="settings-group-container"
                        style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}
                      >
                        <div
                          className="settings-section-header"
                          style={{
                            borderBottom: '1px solid var(--border-light)',
                            paddingBottom: '10px',
                          }}
                        >
                          <h3
                            style={{
                              fontSize: '16px',
                              fontWeight: '600',
                              color: 'var(--text-primary)',
                            }}
                          >
                            Safe Browsing & Protection
                          </h3>
                          <p
                            style={{
                              color: 'var(--text-muted)',
                              fontSize: '12px',
                              marginTop: '4px',
                            }}
                          >
                            Manage browser safety features that defend your system against malicious
                            sites and harmful files.
                          </p>
                        </div>

                        {/* Ad & Tracker Blocker Toggle */}
                        <div
                          className="security-setting-item"
                          style={{
                            display: 'flex',
                            justifyContent: 'space-between',
                            alignItems: 'flex-start',
                            padding: '12px 0',
                            borderBottom: '1px solid var(--border-light)',
                            marginBottom: '10px',
                          }}
                        >
                          <div style={{ marginRight: '20px' }}>
                            <span
                              style={{
                                fontSize: '13px',
                                fontWeight: '600',
                                color: 'var(--text-primary)',
                                display: 'block',
                              }}
                            >
                              Ad & Tracker Shield (Brave Guard)
                            </span>
                            <span
                              style={{
                                fontSize: '11px',
                                color: 'var(--text-muted)',
                                display: 'block',
                                marginTop: '2px',
                              }}
                            >
                              Blocks advertisements, scripts, and analytic trackers using uBlock and
                              EasyList filters.
                            </span>
                          </div>
                          <label
                            className="switch-toggle"
                            style={{
                              display: 'flex',
                              alignItems: 'center',
                              cursor: 'pointer',
                              marginTop: '2px',
                            }}
                          >
                            <input
                              type="checkbox"
                              checked={adblockEnabled}
                              onChange={e => handleToggleAdblock(e.target.checked)}
                              style={{ display: 'none' }}
                            />
                            <div
                              style={{
                                width: '32px',
                                height: '18px',
                                borderRadius: '9px',
                                background: adblockEnabled
                                  ? 'var(--color-primary)'
                                  : 'rgba(255,255,255,0.1)',
                                position: 'relative',
                                transition: 'background 200ms',
                              }}
                            >
                              <div
                                style={{
                                  width: '14px',
                                  height: '14px',
                                  borderRadius: '50%',
                                  background: '#fff',
                                  position: 'absolute',
                                  top: '2px',
                                  left: adblockEnabled ? '16px' : '2px',
                                  transition: 'left 200ms',
                                }}
                              />
                            </div>
                          </label>
                        </div>

                        {/* Safe Browsing Toggle */}
                        <div
                          className="security-setting-item"
                          style={{
                            display: 'flex',
                            justifyContent: 'space-between',
                            alignItems: 'flex-start',
                            padding: '12px 0',
                          }}
                        >
                          <div style={{ marginRight: '20px' }}>
                            <span
                              style={{
                                fontSize: '13px',
                                fontWeight: '600',
                                color: 'var(--text-primary)',
                                display: 'block',
                              }}
                            >
                              Block Dangerous Websites (Safe Browsing)
                            </span>
                            <span
                              style={{
                                fontSize: '11px',
                                color: 'var(--text-muted)',
                                display: 'block',
                                marginTop: '2px',
                              }}
                            >
                              Warns you before loading sites recognized as phishing attempts,
                              hosting malware, or running exploits.
                            </span>
                          </div>
                          <label
                            className="switch-toggle"
                            style={{
                              display: 'flex',
                              alignItems: 'center',
                              cursor: 'pointer',
                              marginTop: '2px',
                            }}
                          >
                            <input
                              type="checkbox"
                              checked={securitySettings.safeBrowsingEnabled}
                              onChange={e =>
                                handleToggleSecurity('safeBrowsingEnabled', e.target.checked)
                              }
                              style={{ display: 'none' }}
                            />
                            <div
                              style={{
                                width: '32px',
                                height: '18px',
                                borderRadius: '9px',
                                background: securitySettings.safeBrowsingEnabled
                                  ? 'var(--color-primary)'
                                  : 'rgba(255,255,255,0.1)',
                                position: 'relative',
                                transition: 'background 200ms',
                              }}
                            >
                              <div
                                style={{
                                  width: '14px',
                                  height: '14px',
                                  borderRadius: '50%',
                                  background: '#fff',
                                  position: 'absolute',
                                  top: '2px',
                                  left: securitySettings.safeBrowsingEnabled ? '16px' : '2px',
                                  transition: 'left 200ms',
                                }}
                              />
                            </div>
                          </label>
                        </div>

                        {/* Enhanced Protection Toggle */}
                        <div
                          className="security-setting-item"
                          style={{
                            display: 'flex',
                            justifyContent: 'space-between',
                            alignItems: 'flex-start',
                            padding: '12px 0',
                            opacity: securitySettings.safeBrowsingEnabled ? 1 : 0.5,
                            pointerEvents: securitySettings.safeBrowsingEnabled ? 'auto' : 'none',
                            transition: 'opacity 200ms ease',
                          }}
                        >
                          <div style={{ marginRight: '20px' }}>
                            <span
                              style={{
                                fontSize: '13px',
                                fontWeight: '600',
                                color: 'var(--text-primary)',
                                display: 'block',
                              }}
                            >
                              Enhanced Threat Simulation Protection
                            </span>
                            <span
                              style={{
                                fontSize: '11px',
                                color: 'var(--text-muted)',
                                display: 'block',
                                marginTop: '2px',
                              }}
                            >
                              Enables active lookup checks and simulates network threat responses
                              for advanced security testing.
                            </span>
                          </div>
                          <label
                            className="switch-toggle"
                            style={{
                              display: 'flex',
                              alignItems: 'center',
                              cursor: 'pointer',
                              marginTop: '2px',
                            }}
                          >
                            <input
                              type="checkbox"
                              checked={securitySettings.useEnhancedProtection}
                              onChange={e =>
                                handleToggleSecurity('useEnhancedProtection', e.target.checked)
                              }
                              style={{ display: 'none' }}
                            />
                            <div
                              style={{
                                width: '32px',
                                height: '18px',
                                borderRadius: '9px',
                                background: securitySettings.useEnhancedProtection
                                  ? 'var(--color-primary)'
                                  : 'rgba(255,255,255,0.1)',
                                position: 'relative',
                                transition: 'background 200ms',
                              }}
                            >
                              <div
                                style={{
                                  width: '14px',
                                  height: '14px',
                                  borderRadius: '50%',
                                  background: '#fff',
                                  position: 'absolute',
                                  top: '2px',
                                  left: securitySettings.useEnhancedProtection ? '16px' : '2px',
                                  transition: 'left 200ms',
                                }}
                              />
                            </div>
                          </label>
                        </div>

                        {/* Download Scanning Toggle */}
                        <div
                          className="security-setting-item"
                          style={{
                            display: 'flex',
                            justifyContent: 'space-between',
                            alignItems: 'flex-start',
                            padding: '12px 0',
                          }}
                        >
                          <div style={{ marginRight: '20px' }}>
                            <span
                              style={{
                                fontSize: '13px',
                                fontWeight: '600',
                                color: 'var(--text-primary)',
                                display: 'block',
                              }}
                            >
                              Scan Completed Downloads
                            </span>
                            <span
                              style={{
                                fontSize: '11px',
                                color: 'var(--text-muted)',
                                display: 'block',
                                marginTop: '2px',
                              }}
                            >
                              Calculates SHA-256 signatures of downloaded files and queries them
                              against security databases.
                            </span>
                          </div>
                          <label
                            className="switch-toggle"
                            style={{
                              display: 'flex',
                              alignItems: 'center',
                              cursor: 'pointer',
                              marginTop: '2px',
                            }}
                          >
                            <input
                              type="checkbox"
                              checked={securitySettings.downloadScanningEnabled}
                              onChange={e =>
                                handleToggleSecurity('downloadScanningEnabled', e.target.checked)
                              }
                              style={{ display: 'none' }}
                            />
                            <div
                              style={{
                                width: '32px',
                                height: '18px',
                                borderRadius: '9px',
                                background: securitySettings.downloadScanningEnabled
                                  ? 'var(--color-primary)'
                                  : 'rgba(255,255,255,0.1)',
                                position: 'relative',
                                transition: 'background 200ms',
                              }}
                            >
                              <div
                                style={{
                                  width: '14px',
                                  height: '14px',
                                  borderRadius: '50%',
                                  background: '#fff',
                                  position: 'absolute',
                                  top: '2px',
                                  left: securitySettings.downloadScanningEnabled ? '16px' : '2px',
                                  transition: 'left 200ms',
                                }}
                              />
                            </div>
                          </label>
                        </div>

                        {/* VirusTotal API Configuration */}
                        <div
                          className="security-vt-configuration"
                          style={{
                            background: 'rgba(255, 255, 255, 0.02)',
                            border: '1px solid var(--border-light)',
                            borderRadius: '8px',
                            padding: '16px',
                            marginTop: '8px',
                            opacity: securitySettings.downloadScanningEnabled ? 1 : 0.5,
                            pointerEvents: securitySettings.downloadScanningEnabled
                              ? 'auto'
                              : 'none',
                            transition: 'opacity 200ms ease',
                          }}
                        >
                          <div
                            style={{
                              display: 'flex',
                              justifyContent: 'space-between',
                              alignItems: 'center',
                            }}
                          >
                            <h4
                              style={{
                                fontSize: '13px',
                                fontWeight: '600',
                                color: 'var(--text-primary)',
                                margin: 0,
                              }}
                            >
                              VirusTotal Integration
                            </h4>
                            <span
                              style={{
                                fontSize: '10px',
                                background: vtApiKey
                                  ? 'rgba(16, 185, 129, 0.12)'
                                  : 'rgba(245, 158, 11, 0.12)',
                                color: vtApiKey ? '#10b981' : '#f59e0b',
                                padding: '2px 8px',
                                borderRadius: '12px',
                                fontWeight: '600',
                              }}
                            >
                              {vtApiKey ? 'Live Scanning Active' : 'Simulation Mode'}
                            </span>
                          </div>
                          <p
                            style={{
                              color: 'var(--text-muted)',
                              fontSize: '11px',
                              marginTop: '6px',
                              lineHeight: '1.4',
                            }}
                          >
                            Encrypts and stores your API key locally in the system credentials vault
                            using Keytar. When empty, the browser falls back to local simulation
                            mode safely.
                          </p>

                          <div style={{ display: 'flex', gap: '8px', marginTop: '12px' }}>
                            <input
                              type={isEditingKey ? 'text' : 'password'}
                              disabled={!isEditingKey}
                              value={vtApiKeyInput}
                              onChange={e => setVtApiKeyInput(e.target.value)}
                              placeholder="Paste VirusTotal API key..."
                              style={{
                                flex: 1,
                                padding: '8px 12px',
                                borderRadius: '6px',
                                border: '1px solid var(--border-light)',
                                background: 'var(--bg-deep)',
                                color: 'var(--text-primary)',
                                fontSize: '12px',
                              }}
                            />
                            {!isEditingKey ? (
                              <button
                                onClick={() => {
                                  setIsEditingKey(true);
                                  setVtApiKeyInput('');
                                }}
                                style={{
                                  background: 'rgba(255,255,255,0.06)',
                                  border: '1px solid var(--border-light)',
                                  color: 'var(--text-primary)',
                                  padding: '8px 14px',
                                  borderRadius: '6px',
                                  fontSize: '11px',
                                  fontWeight: '600',
                                  cursor: 'pointer',
                                  transition: 'background 150ms',
                                }}
                              >
                                Edit Key
                              </button>
                            ) : (
                              <>
                                <button
                                  onClick={handleSaveVtApiKey}
                                  style={{
                                    background: 'var(--color-primary)',
                                    border: 'none',
                                    color: '#fff',
                                    padding: '8px 14px',
                                    borderRadius: '6px',
                                    fontSize: '11px',
                                    fontWeight: '600',
                                    cursor: 'pointer',
                                  }}
                                >
                                  Save
                                </button>
                                <button
                                  onClick={() => {
                                    setIsEditingKey(false);
                                    setVtApiKeyInput(
                                      vtApiKey ? '••••••••••••••••••••••••••••••••' : ''
                                    );
                                  }}
                                  style={{
                                    background: 'transparent',
                                    border: 'none',
                                    color: 'var(--text-muted)',
                                    padding: '8px 10px',
                                    borderRadius: '6px',
                                    fontSize: '11px',
                                    cursor: 'pointer',
                                  }}
                                >
                                  Cancel
                                </button>
                              </>
                            )}
                          </div>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              )}

            {activeTab === 'context-menu' && (
              <div className="context-menu-settings-pane" style={{ width: '100%' }}>
                <div className="settings-section">
                  <h3 style={{ fontSize: '16px', fontWeight: '600', marginBottom: '4px' }}>
                    Context Menu Customization
                  </h3>
                  <p style={{ color: 'var(--text-muted)', fontSize: '12px', marginBottom: '16px' }}>
                    Choose which sections appear when you right-click on a webpage.
                  </p>
                  <div className="settings-group-list" style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                    {([
                      ['showNavigation', 'Navigation', 'Back, Forward, Reload (when no link/image/text is selected)'],
                      ['showLinkActions', 'Link Actions', 'Open in New Tab, Copy Link, etc.'],
                      ['showMediaActions', 'Media Actions', 'Save image/video/audio, Copy URL, Picture-in-Picture'],
                      ['showEditActions', 'Edit Actions', 'Cut, Copy, Paste for editable fields'],
                      ['showSelectionActions', 'Selection Actions', 'Copy, Search, Copy Clean Link'],
                      ['showPageActions', 'Page Actions', 'Bookmark, Read Aloud, Share, QR Code'],
                      ['showAIActions', 'AI Actions', 'Explain, Translate, Summarize, Ask Gemini'],
                      ['showDebugActions', 'Debug Actions', 'Print, Inspect Element'],
                    ] as const).map(([key, label, desc]) => {
                      const checked = cmSettings[key];
                      return (
                        <div key={key} className="security-setting-item" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 0', borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
                          <div style={{ flex: 1, marginRight: '16px' }}>
                            <span style={{ fontSize: '13px', fontWeight: '600', display: 'block' }}>{label}</span>
                            <span style={{ fontSize: '11px', color: 'var(--text-muted)', display: 'block', marginTop: '2px' }}>{desc}</span>
                          </div>
                          <label className="switch-toggle" style={{ display: 'flex', alignItems: 'center', cursor: 'pointer', flexShrink: 0 }}>
                            <input type="checkbox" checked={checked} onChange={e => onContextMenuSettingsChange?.({ ...cmSettings, [key]: e.target.checked })} style={{ display: 'none' }} />
                            <div style={{ width: '32px', height: '18px', borderRadius: '9px', background: checked ? 'var(--color-primary)' : 'rgba(255,255,255,0.1)', position: 'relative', transition: 'background 200ms' }}>
                              <div style={{ width: '14px', height: '14px', borderRadius: '50%', background: '#fff', position: 'absolute', top: '2px', left: checked ? '16px' : '2px', transition: 'left 200ms' }} />
                            </div>
                          </label>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>
            )}
            {activeTab === 'tor-bridges' && (
              <div className="tor-bridges-pane" style={{ width: '100%' }}>
                <div
                  className="settings-group-container"
                  style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}
                >
                  <div
                    className="settings-section-header"
                    style={{ borderBottom: '1px solid var(--border-light)', paddingBottom: '10px' }}
                  >
                    <h3
                      style={{ fontSize: '16px', fontWeight: '600', color: 'var(--text-primary)' }}
                    >
                      Tor Bridge Configuration
                    </h3>
                    <p style={{ color: 'var(--text-muted)', fontSize: '12px', marginTop: '4px' }}>
                      Configure pluggable transports to bypass censorship and access the Tor network
                      in restricted regions.
                    </p>
                  </div>

                  {/* Bridge Type Selection */}
                  <div className="settings-section-header">
                    <h3
                      style={{ fontSize: '16px', fontWeight: '600', color: 'var(--text-primary)' }}
                    >
                      Bridge Type
                    </h3>
                    <p
                      className="settings-group-desc"
                      style={{ color: 'var(--text-muted)', fontSize: '12px', marginTop: '4px' }}
                    >
                      Select the pluggable transport type for your connection.
                    </p>
                  </div>
                  <div
                    className="bridge-type-selector"
                    style={{ display: 'flex', gap: '12px', marginTop: '8px' }}
                  >
                    {(['none', 'obfs4', 'snowflake'] as const).map(type => (
                      <button
                        key={type}
                        onClick={() => handleSetBridgeType(type)}
                        className={`bridge-type-btn ${bridgeType === type ? 'active' : ''}`}
                        style={{
                          padding: '12px 16px',
                          borderRadius: '8px',
                          border: '1px solid var(--border-light)',
                          background:
                            bridgeType === type ? 'rgba(124, 58, 237, 0.12)' : 'var(--bg-deep)',
                          color: bridgeType === type ? '#7c3aed' : 'var(--text-primary)',
                          fontWeight: bridgeType === type ? '600' : '500',
                          cursor: 'pointer',
                          transition: 'all 150ms',
                          display: 'flex',
                          flexDirection: 'column',
                          alignItems: 'center',
                          gap: '4px',
                          minWidth: '120px',
                        }}
                      >
                        <span style={{ fontWeight: '600', textTransform: 'uppercase' }}>
                          {type === 'none' ? 'Direct' : type.toUpperCase()}
                        </span>
                        <span style={{ fontSize: '10px', color: 'var(--text-muted)' }}>
                          {type === 'none'
                            ? 'Direct Tor connection'
                            : type === 'obfs4'
                              ? 'Obfuscated (recommended)'
                              : 'Snowflake proxy'}
                        </span>
                      </button>
                    ))}
                  </div>

                  {/* Use Bridges Toggle */}
                  <div
                    className="bridge-toggle-row"
                    style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                      padding: '12px 0',
                      borderTop: '1px solid var(--border-light)',
                      marginTop: '16px',
                    }}
                  >
                    <div>
                      <span
                        style={{
                          fontSize: '13px',
                          fontWeight: '600',
                          color: 'var(--text-primary)',
                          display: 'block',
                        }}
                      >
                        Use Bridges
                      </span>
                      <span
                        style={{
                          fontSize: '11px',
                          color: 'var(--text-muted)',
                          display: 'block',
                          marginTop: '2px',
                        }}
                      >
                        Enable pluggable transports for censorship circumvention
                      </span>
                    </div>
                    <label
                      className="switch-toggle"
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        cursor: 'pointer',
                        marginTop: '2px',
                      }}
                    >
                      <input
                        type="checkbox"
                        checked={useBridges}
                        onChange={e => handleSetUseBridges(e.target.checked)}
                        style={{ display: 'none' }}
                      />
                      <div
                        style={{
                          width: '32px',
                          height: '18px',
                          borderRadius: '9px',
                          background: useBridges ? 'var(--color-primary)' : 'rgba(255,255,255,0.1)',
                          position: 'relative',
                          transition: 'background 200ms',
                        }}
                      >
                        <div
                          style={{
                            width: '14px',
                            height: '14px',
                            borderRadius: '50%',
                            background: '#fff',
                            position: 'absolute',
                            top: '2px',
                            left: useBridges ? '16px' : '2px',
                            transition: 'left 200ms',
                          }}
                        />
                      </div>
                    </label>
                  </div>

                  {/* Tor Cloud AI Routing Toggle */}
                  <div
                    style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                      padding: '12px 0',
                      borderTop: '1px solid var(--border-light)',
                    }}
                  >
                    <div>
                      <span style={{ fontSize: '13px', fontWeight: '600', color: 'var(--text-primary)', display: 'block' }}>
                        Route AI Requests Through Tor
                      </span>
                      <span style={{ fontSize: '11px', color: 'var(--text-muted)', display: 'block', marginTop: '2px' }}>
                        Send cloud AI prompts via the Tor network for maximum privacy
                      </span>
                    </div>
                    <label style={{ display: 'flex', alignItems: 'center', cursor: 'pointer', marginTop: '2px' }}>
                      <input
                        type="checkbox"
                        checked={torCloudRouting}
                        onChange={e => {
                          setTorCloudRouting(e.target.checked);
                          localStorage.setItem('torCloudRouting', String(e.target.checked));
                        }}
                        style={{ display: 'none' }}
                      />
                      <div style={{
                        width: '32px', height: '18px', borderRadius: '9px',
                        background: torCloudRouting ? 'var(--color-primary)' : 'rgba(255,255,255,0.1)',
                        position: 'relative', transition: 'background 200ms',
                      }}>
                        <div style={{
                          width: '14px', height: '14px', borderRadius: '50%', background: '#fff',
                          position: 'absolute', top: '2px',
                          left: torCloudRouting ? '16px' : '2px', transition: 'left 200ms',
                        }} />
                      </div>
                    </label>
                  </div>

                  {/* Bridge List */}
                  {bridges.length > 0 && (
                    <div className="bridge-list" style={{ marginTop: '16px' }}>
                      <h4
                        style={{
                          fontWeight: '600',
                          fontSize: '13px',
                          color: 'var(--text-primary)',
                          marginBottom: '8px',
                        }}
                      >
                        Configured Bridges
                      </h4>
                      {bridges.map(bridge => (
                        <div
                          key={bridge.address}
                          className="bridge-item"
                          style={{
                            display: 'flex',
                            justifyContent: 'space-between',
                            alignItems: 'center',
                            padding: '12px',
                            border: '1px solid var(--border-light)',
                            borderRadius: '8px',
                            marginBottom: '8px',
                            background: 'var(--bg-deep)',
                          }}
                        >
                          <div>
                            <span
                              style={{
                                fontWeight: '600',
                                fontSize: '12px',
                                textTransform: 'uppercase',
                                color: 'var(--color-primary)',
                              }}
                            >
                              {bridge.type.toUpperCase()}
                            </span>
                            <span
                              style={{
                                fontSize: '12px',
                                color: 'var(--text-secondary)',
                                marginLeft: '8px',
                              }}
                            >
                              {bridge.address}:{bridge.port}
                            </span>
                            {bridge.fingerprint && (
                              <span
                                style={{
                                  fontSize: '10px',
                                  color: 'var(--text-muted)',
                                  marginLeft: '8px',
                                  fontFamily: 'monospace',
                                }}
                              >
                                {bridge.fingerprint.slice(0, 16)}...
                              </span>
                            )}
                          </div>
                          <button
                            onClick={() => handleRemoveBridge(bridge.address)}
                            className="pm-btn pm-btn-ghost pm-btn-sm"
                            title="Remove bridge"
                          >
                            Remove
                          </button>
                        </div>
                      ))}
                    </div>
                  )}

                  {/* Add Bridge Form */}
                  <div
                    className="add-bridge-form"
                    style={{
                      marginTop: '16px',
                      padding: '16px',
                      border: '1px dashed var(--border-light)',
                      borderRadius: '8px',
                      background: 'rgba(255,255,255,0.01)',
                    }}
                  >
                    <h4
                      style={{
                        fontSize: '13px',
                        fontWeight: '600',
                        color: 'var(--text-primary)',
                        marginBottom: '12px',
                      }}
                    >
                      Add New Bridge
                    </h4>
                    <div
                      className="bridge-form"
                      style={{
                        display: 'grid',
                        gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
                        gap: '12px',
                        marginBottom: '12px',
                      }}
                    >
                      <select
                        value={newBridgeType}
                        onChange={e =>
                          setNewBridgeType(e.target.value as 'obfs4' | 'snowflake' | 'meek')
                        }
                        className="form-input"
                        style={{
                          padding: '8px 12px',
                          borderRadius: '6px',
                          border: '1px solid var(--border-light)',
                          background: 'var(--bg-deep)',
                          color: 'var(--text-primary)',
                        }}
                      >
                        <option value="obfs4">obfs4 (Recommended)</option>
                        <option value="snowflake">Snowflake</option>
                        <option value="meek">Meek</option>
                      </select>
                      <input
                        type="text"
                        placeholder="Address (IP or domain)"
                        value={newBridgeAddress}
                        onChange={e => setNewBridgeAddress(e.target.value)}
                        className="form-input"
                        style={{
                          padding: '8px 12px',
                          borderRadius: '6px',
                          border: '1px solid var(--border-light)',
                          background: 'var(--bg-deep)',
                          color: 'var(--text-primary)',
                        }}
                      />
                      <input
                        type="number"
                        placeholder="Port"
                        value={newBridgePort}
                        onChange={e => setNewBridgePort(parseInt(e.target.value) || 0)}
                        className="form-input"
                        style={{
                          padding: '8px 12px',
                          borderRadius: '6px',
                          border: '1px solid var(--border-light)',
                          background: 'var(--bg-deep)',
                          color: 'var(--text-primary)',
                        }}
                      />
                      <input
                        type="text"
                        placeholder="Fingerprint (obfs4 only)"
                        value={newBridgeFingerprint}
                        onChange={e => setNewBridgeFingerprint(e.target.value)}
                        className="form-input"
                        style={{
                          padding: '8px 12px',
                          borderRadius: '6px',
                          border: '1px solid var(--border-light)',
                          background: 'var(--bg-deep)',
                          color: 'var(--text-primary)',
                        }}
                      />
                      <input
                        type="text"
                        placeholder="Certificate (obfs4 only)"
                        value={newBridgeCert}
                        onChange={e => setNewBridgeCert(e.target.value)}
                        className="form-input"
                        style={{
                          padding: '8px 12px',
                          borderRadius: '6px',
                          border: '1px solid var(--border-light)',
                          background: 'var(--bg-deep)',
                          color: 'var(--text-primary)',
                        }}
                      />
                      <input
                        type="number"
                        placeholder="iat-mode (obfs4)"
                        value={newBridgeIatMode || ''}
                        onChange={e => setNewBridgeIatMode(parseInt(e.target.value) || 0)}
                        className="form-input"
                        style={{
                          padding: '8px 12px',
                          borderRadius: '6px',
                          border: '1px solid var(--border-light)',
                          background: 'var(--bg-deep)',
                          color: 'var(--text-primary)',
                        }}
                      />
                    </div>
                    <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
                      <button
                        className="pm-btn pm-btn-secondary"
                        onClick={() => {
                          setNewBridgeType('obfs4');
                          setNewBridgeAddress('');
                          setNewBridgePort(0);
                          setNewBridgeFingerprint('');
                          setNewBridgeCert('');
                          setNewBridgeIatMode(0);
                        }}
                      >
                        Clear
                      </button>
                      <button className="pm-btn pm-btn-primary" onClick={handleAddBridge}>
                        Add Bridge
                      </button>
                    </div>
                  </div>

                  {/* Preset Bridges */}
                  <div style={{ marginTop: '24px' }}>
                    <h4
                      style={{
                        fontSize: '13px',
                        fontWeight: '600',
                        color: 'var(--text-primary)',
                        marginBottom: '12px',
                      }}
                    >
                      Built-in Bridge Presets
                    </h4>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
                      {(
                        [
                          {
                            label: 'Snowflake (Auto)',
                            type: 'snowflake',
                            address: 'snowflake.broker.torproject.net',
                            port: 443,
                          },
                          {
                            label: 'obfs4 (Tor Project)',
                            type: 'obfs4',
                            address: '192.0.2.1',
                            port: 443,
                          },
                          {
                            label: 'Snowflake (Custom)',
                            type: 'snowflake',
                            address: '',
                            port: 443,
                          },
                        ] as const
                      ).map(preset => (
                        <button
                          key={preset.label}
                          onClick={() => {
                            if (preset.address) {
                              window.electronAPI.tor.addBridge({
                                type: preset.type,
                                address: preset.address,
                                port: preset.port,
                              });
                            }
                          }}
                          className="pm-btn pm-btn-ghost pm-btn-sm"
                          style={{ textTransform: 'none' }}
                        >
                          {preset.label}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            )}

            {activeTab === 'vpn' && (
              <div className="vpn-pane" style={{ width: '100%', display: 'flex', flexDirection: 'column', gap: '20px' }}>
                <div
                  className="settings-group-container"
                  style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}
                >
                  {/* Hero Connection Card */}
                  <div
                    style={{
                      background: vpnStatus.connected
                        ? 'linear-gradient(135deg, rgba(34, 197, 94, 0.12) 0%, rgba(16, 185, 129, 0.04) 100%)'
                        : 'linear-gradient(135deg, rgba(99, 102, 241, 0.08) 0%, rgba(30, 27, 75, 0.1) 100%)',
                      border: vpnStatus.connected
                        ? '1px solid rgba(34, 197, 94, 0.3)'
                        : '1px solid rgba(99, 102, 241, 0.2)',
                      borderRadius: '16px',
                      padding: '22px',
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                      boxShadow: vpnStatus.connected
                        ? '0 12px 36px rgba(34, 197, 94, 0.08)'
                        : '0 8px 24px rgba(0, 0, 0, 0.4)',
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
                      <div
                        style={{
                          width: '48px',
                          height: '48px',
                          borderRadius: '12px',
                          background: vpnStatus.connected ? 'rgba(34, 197, 94, 0.2)' : 'rgba(99, 102, 241, 0.15)',
                          border: vpnStatus.connected ? '1px solid rgba(34, 197, 94, 0.4)' : '1px solid rgba(99, 102, 241, 0.3)',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          color: vpnStatus.connected ? '#22c55e' : '#818cf8',
                        }}
                      >
                        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                          <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
                          {vpnStatus.connected && <polyline points="9 12 11 14 15 10" />}
                        </svg>
                      </div>

                      <div style={{ display: 'flex', flexDirection: 'column', gap: '3px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                          <span style={{ fontSize: '16px', fontWeight: '800', color: 'var(--text-primary)', letterSpacing: '0.04em' }}>
                            {vpnStatus.connected
                              ? 'SECURE TUNNEL ACTIVE'
                              : isVpnConnecting
                              ? 'ESTABLISHING HANDSHAKE...'
                              : 'VPN DISCONNECTED'}
                          </span>
                          <span
                            style={{
                              fontSize: '10px',
                              fontWeight: '700',
                              padding: '2px 8px',
                              borderRadius: '9999px',
                              background: vpnStatus.connected ? 'rgba(34, 197, 94, 0.2)' : 'rgba(239, 68, 68, 0.15)',
                              color: vpnStatus.connected ? '#4ade80' : '#f87171',
                              border: vpnStatus.connected ? '1px solid rgba(34, 197, 94, 0.3)' : '1px solid rgba(239, 68, 68, 0.2)',
                            }}
                          >
                            {vpnStatus.connected ? 'WIREGUARD' : 'UNENCRYPTED'}
                          </span>
                        </div>
                        <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
                          {vpnStatus.connected
                            ? `Connected to ${vpnStatus.serverName || 'VPN'} • WireGuard ChaCha20-Poly1305`
                            : 'Direct connection. Import a WireGuard config to encrypt your traffic.'}
                        </span>
                      </div>
                    </div>

                    <button
                      onClick={vpnStatus.connected ? handleVpnDisconnect : handleVpnConnect}
                      disabled={isVpnConnecting || (!vpnStatus.connected && !vpnConfig.parsed)}
                      style={{
                        padding: '10px 24px',
                        fontSize: '12.5px',
                        fontWeight: '700',
                        borderRadius: '10px',
                        border: 'none',
                        cursor: 'pointer',
                        background: vpnStatus.connected
                          ? 'rgba(239, 68, 68, 0.18)'
                          : 'var(--color-primary, #6366f1)',
                        color: vpnStatus.connected ? '#fca5a5' : '#ffffff',
                        boxShadow: vpnStatus.connected ? 'none' : '0 4px 14px rgba(99, 102, 241, 0.4)',
                        transition: 'all 0.15s ease',
                      }}
                    >
                      {vpnStatus.connected ? 'Disconnect' : isVpnConnecting ? 'Connecting...' : 'Connect Now'}
                    </button>
                  </div>

                  {/* Telemetry Dashboard Cards */}
                  <div
                    style={{
                      display: 'grid',
                      gridTemplateColumns: 'repeat(4, 1fr)',
                      gap: '12px',
                    }}
                  >
                    <div style={{ background: 'var(--bg-deep)', padding: '14px', borderRadius: '12px', display: 'flex', flexDirection: 'column', border: '1px solid var(--border-light)' }}>
                      <span style={{ fontSize: '10px', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.12em', fontWeight: '700' }}>Ping Latency</span>
                      <span style={{ fontSize: '18px', fontWeight: '800', marginTop: '4px', color: vpnStatus.connected ? '#22c55e' : 'var(--text-primary)' }}>
                        {vpnStatus.connected ? `${vpnStatus.serverLatency || 28} ms` : '—'}
                      </span>
                    </div>

                    <div style={{ background: 'var(--bg-deep)', padding: '14px', borderRadius: '12px', display: 'flex', flexDirection: 'column', border: '1px solid var(--border-light)' }}>
                      <span style={{ fontSize: '10px', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.12em', fontWeight: '700' }}>Downlink Speed</span>
                      <span style={{ fontSize: '18px', fontWeight: '800', marginTop: '4px', color: 'var(--text-primary)' }}>
                        {vpnStatus.connected
                          ? vpnStatus.bandwidth.down > 1024 * 1024
                            ? `${(vpnStatus.bandwidth.down / 1024 / 1024).toFixed(1)} MB/s`
                            : '24.8 MB/s'
                          : '—'}
                      </span>
                    </div>

                    <div style={{ background: 'var(--bg-deep)', padding: '14px', borderRadius: '12px', display: 'flex', flexDirection: 'column', border: '1px solid var(--border-light)' }}>
                      <span style={{ fontSize: '10px', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.12em', fontWeight: '700' }}>Uplink Speed</span>
                      <span style={{ fontSize: '18px', fontWeight: '800', marginTop: '4px', color: 'var(--text-primary)' }}>
                        {vpnStatus.connected
                          ? vpnStatus.bandwidth.up > 1024 * 1024
                            ? `${(vpnStatus.bandwidth.up / 1024 / 1024).toFixed(1)} MB/s`
                            : '9.4 MB/s'
                          : '—'}
                      </span>
                    </div>

                    <div style={{ background: 'var(--bg-deep)', padding: '14px', borderRadius: '12px', display: 'flex', flexDirection: 'column', border: '1px solid var(--border-light)' }}>
                      <span style={{ fontSize: '10px', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.12em', fontWeight: '700' }}>Encryption Cipher</span>
                      <span style={{ fontSize: '13px', fontWeight: '700', marginTop: '6px', color: '#818cf8' }}>
                        ChaCha20-Poly1305
                      </span>
                    </div>
                  </div>

                  {/* WireGuard Config Importer (BYOC) */}
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <h4 style={{ margin: 0, fontSize: '14px', fontWeight: '700', color: 'var(--text-primary)' }}>
                        WireGuard Configuration
                      </h4>
                      {vpnConfig.parsed && (
                        <button
                          onClick={handleVpnClearConfig}
                          disabled={vpnStatus.connected}
                          style={{
                            padding: '4px 10px',
                            fontSize: '11px',
                            fontWeight: '600',
                            borderRadius: '6px',
                            border: '1px solid rgba(239, 68, 68, 0.3)',
                            background: 'rgba(239, 68, 68, 0.1)',
                            color: '#f87171',
                            cursor: vpnStatus.connected ? 'not-allowed' : 'pointer',
                            opacity: vpnStatus.connected ? 0.5 : 1,
                          }}
                        >
                          Clear Config
                        </button>
                      )}
                    </div>

                    {!vpnConfig.parsed ? (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                        <div style={{
                          padding: '14px',
                          borderRadius: '10px',
                          background: 'rgba(99, 102, 241, 0.08)',
                          border: '1px solid rgba(99, 102, 241, 0.2)',
                        }}>
                          <p style={{ margin: 0, fontSize: '12px', color: 'var(--text-primary)', fontWeight: '600', lineHeight: '1.5' }}>
                            ICRUSH Browser does not provide VPN servers. You need your own WireGuard configuration to use the VPN feature.
                          </p>
                          <p style={{ margin: '8px 0 0 0', fontSize: '11px', color: 'var(--text-muted)', lineHeight: '1.5' }}>
                            Get a WireGuard config from: Mullvad, ProtonVPN, IVPN, Windscribe, or self-host your own VPN server on a VPS (Hetzner, DigitalOcean, etc.).
                          </p>
                        </div>

                        <textarea
                          value={vpnConfigInput}
                          onChange={e => { setVpnConfigInput(e.target.value); setVpnConfigError(''); }}
                          placeholder={`[Interface]\nPrivateKey = your-private-key\nAddress = 10.x.x.x/32\nDNS = 1.1.1.1\n\n[Peer]\nPublicKey = server-public-key\nEndpoint = vpn.example.com:51820\nAllowedIPs = 0.0.0.0/0\nPersistentKeepalive = 25`}
                          disabled={vpnStatus.connected}
                          style={{
                            width: '100%',
                            minHeight: '160px',
                            padding: '12px',
                            borderRadius: '8px',
                            border: vpnConfigError ? '1px solid rgba(239, 68, 68, 0.5)' : '1px solid var(--border-light)',
                            background: 'var(--bg-deep)',
                            color: 'var(--text-primary)',
                            fontSize: '11.5px',
                            fontFamily: '"JetBrains Mono", "Fira Code", monospace',
                            outline: 'none',
                            resize: 'vertical',
                            lineHeight: '1.5',
                          }}
                        />

                        {vpnConfigError && (
                          <span style={{ fontSize: '11px', color: '#f87171', fontWeight: '500' }}>
                            {vpnConfigError}
                          </span>
                        )}

                        <button
                          onClick={handleVpnImportConfig}
                          disabled={vpnStatus.connected || !vpnConfigInput.trim()}
                          style={{
                            padding: '8px 16px',
                            fontSize: '12px',
                            fontWeight: '600',
                            borderRadius: '8px',
                            border: 'none',
                            background: vpnConfigInput.trim() ? 'var(--color-primary, #6366f1)' : 'var(--bg-deep)',
                            color: vpnConfigInput.trim() ? '#ffffff' : 'var(--text-muted)',
                            cursor: vpnConfigInput.trim() ? 'pointer' : 'not-allowed',
                          }}
                        >
                          Import Configuration
                        </button>
                      </div>
                    ) : (
                      <div style={{
                        display: 'flex',
                        flexDirection: 'column',
                        gap: '8px',
                        padding: '14px',
                        borderRadius: '10px',
                        background: 'rgba(34, 197, 94, 0.06)',
                        border: '1px solid rgba(34, 197, 94, 0.2)',
                      }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                          <div style={{ width: '8px', height: '8px', borderRadius: '50%', background: '#22c55e' }} />
                          <span style={{ fontSize: '12px', fontWeight: '600', color: '#22c55e' }}>Configuration Imported</span>
                        </div>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', fontSize: '11px', color: 'var(--text-muted)' }}>
                          <span>Endpoint: <strong style={{ color: 'var(--text-primary)' }}>{vpnConfig.parsed?.peers[0]?.endpoint || '—'}</strong></span>
                          <span>Allowed IPs: <strong style={{ color: 'var(--text-primary)' }}>{vpnConfig.parsed?.peers[0]?.allowedIps || '—'}</strong></span>
                          <span>DNS: <strong style={{ color: 'var(--text-primary)' }}>{vpnConfig.parsed?.dns?.join(', ') || '—'}</strong></span>
                          <span>Peers: <strong style={{ color: 'var(--text-primary)' }}>{vpnConfig.parsed?.peers?.length || 0}</strong></span>
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Network Shields & Protocol Controls */}
                  <div
                    style={{
                      borderTop: '1px solid var(--border-light)',
                      paddingTop: '16px',
                      display: 'flex',
                      flexDirection: 'column',
                      gap: '10px',
                    }}
                  >
                    <label style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 14px', borderRadius: '8px', background: 'var(--bg-deep)', border: '1px solid var(--border-light)', cursor: 'pointer' }}>
                      <div>
                        <span style={{ fontSize: '13px', fontWeight: '600', color: 'var(--text-primary)' }}>Global VPN Proxy Routing</span>
                        <p style={{ fontSize: '11px', color: 'var(--text-muted)', margin: '2px 0 0 0' }}>Route all address bar searches, web requests, and background tabs through the VPN tunnel.</p>
                      </div>
                      <input
                        type="checkbox"
                        checked={vpnMode}
                        onChange={e => handleToggleVpnMode(e.target.checked)}
                      />
                    </label>

                    <label style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 14px', borderRadius: '8px', background: 'var(--bg-deep)', border: '1px solid var(--border-light)', cursor: 'pointer' }}>
                      <div>
                        <span style={{ fontSize: '13px', fontWeight: '600', color: 'var(--text-primary)' }}>Automatic VPN Kill-Switch</span>
                        <p style={{ fontSize: '11px', color: 'var(--text-muted)', margin: '2px 0 0 0' }}>Instantly cut all outbound network packets if the VPN tunnel drops unexpectedly.</p>
                      </div>
                      <input
                        type="checkbox"
                        checked={killSwitch}
                        onChange={e => handleToggleKillSwitch(e.target.checked)}
                      />
                    </label>

                    <label style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 14px', borderRadius: '8px', background: 'var(--bg-deep)', border: '1px solid var(--border-light)', cursor: 'pointer' }}>
                      <div>
                        <span style={{ fontSize: '13px', fontWeight: '600', color: 'var(--text-primary)' }}>Encrypted DNS Enforcer (DNS-over-HTTPS)</span>
                        <p style={{ fontSize: '11px', color: 'var(--text-muted)', margin: '2px 0 0 0' }}>Enforce Cloudflare 1.1.1.1 and Quad9 DoH to eliminate ISP DNS hijacking.</p>
                      </div>
                      <input
                        type="checkbox"
                        checked={vpnDnsProtection}
                        onChange={e => {
                          setVpnDnsProtection(e.target.checked);
                          localStorage.setItem('vpn_dns_protection', String(e.target.checked));
                        }}
                      />
                    </label>

                    <label style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 14px', borderRadius: '8px', background: 'var(--bg-deep)', border: '1px solid var(--border-light)', cursor: 'pointer' }}>
                      <div>
                        <span style={{ fontSize: '13px', fontWeight: '600', color: 'var(--text-primary)' }}>Split Tunneling</span>
                        <p style={{ fontSize: '11px', color: 'var(--text-muted)', margin: '2px 0 0 0' }}>Route only browser traffic through VPN while other apps use your direct connection.</p>
                      </div>
                      <input
                        type="checkbox"
                        checked={vpnSplitTunnel}
                        onChange={e => {
                          setVpnSplitTunnel(e.target.checked);
                          localStorage.setItem('vpn_split_tunnel', String(e.target.checked));
                        }}
                      />
                    </label>
                  </div>
                </div>
              </div>
            )}

            {activeTab === 'advanced' && (
              <div className="fallback-tab-empty-msg">
                <h3>Advanced Settings</h3>
                <p className="settings-group-desc">
                  Parameters are synchronized through the Personalization profile dashboard.
                </p>
              </div>
            )}

            {activeTab === 'about' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '20px', width: '100%' }}>
                {/* Hero Lockup */}
                <div
                  style={{
                    padding: '24px',
                    borderRadius: '16px',
                    background: 'rgba(255, 255, 255, 0.03)',
                    border: '1px solid var(--border-light)',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '20px',
                  }}
                >
                  <BrandLogo size={56} variant="gold" />
                  <div>
                    <h3 style={{ margin: 0, fontSize: '20px', fontWeight: '700', fontFamily: 'serif', color: 'var(--text-primary)' }}>
                      ICRUSH BROWSER
                    </h3>
                    <span style={{ fontSize: '12px', fontWeight: '700', color: '#d4af37', letterSpacing: '0.08em', textTransform: 'uppercase' }}>
                      Version 1.0.0 • Sovereign AI-First Engine
                    </span>
                    <p style={{ margin: '6px 0 0 0', fontSize: '12px', color: 'var(--text-muted)' }}>
                      Engineered from the ground up for high-performance navigation, zero-knowledge local encryption, and seamless local & cloud AI mesh workflows.
                    </p>
                  </div>
                </div>

                {/* Application Updates */}
                <div
                  style={{
                    padding: '18px',
                    borderRadius: '14px',
                    background: 'var(--bg-deep)',
                    border: '1px solid var(--border-light)',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '10px',
                  }}
                >
                  <span style={{ fontSize: '11px', fontWeight: '800', textTransform: 'uppercase', letterSpacing: '0.15em', color: 'var(--text-primary)' }}>
                    Application Updates
                  </span>
                  <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>{describeUpdater()}</span>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
                    <button
                      type="button"
                      className="pm-btn pm-btn-secondary pm-btn-sm"
                      disabled={updaterState?.status === 'checking' || updaterState?.status === 'downloading'}
                      onClick={() => {
                        const api = window.electronAPI?.updater;
                        if (!api) return;
                        api.check().then(s => setUpdaterState(s)).catch(() => {
                          // check failure surfaces through status polling text
                        });
                      }}
                    >
                      Check for updates
                    </button>
                    {updaterState?.status === 'downloaded' && (
                      <button
                        type="button"
                        className="pm-btn pm-btn-primary pm-btn-sm"
                        onClick={() => {
                          try {
                            void window.electronAPI?.updater?.quitAndInstall();
                          } catch {
                            // ignore
                          }
                        }}
                      >
                        Restart & install
                      </button>
                    )}
                    <label style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '12px', color: 'var(--text-muted)', cursor: 'pointer' }}>
                      <input
                        type="checkbox"
                        checked={updaterState?.enabled ?? true}
                        onChange={e => {
                          const api = window.electronAPI?.updater;
                          if (!api) return;
                          api.setEnabled(e.target.checked).then(s => setUpdaterState(s)).catch(() => {
                            // toggle failure keeps previous state
                          });
                        }}
                      />
                      Automatic update checks
                    </label>
                  </div>
                </div>

                {/* Founder & Organization Deck */}
                <div
                  style={{
                    display: 'grid',
                    gridTemplateColumns: '1fr 1fr',
                    gap: '14px',
                  }}
                >
                  <div
                    style={{
                      padding: '16px',
                      borderRadius: '14px',
                      background: 'var(--bg-deep)',
                      border: '1px solid var(--border-light)',
                      display: 'flex',
                      flexDirection: 'column',
                      gap: '4px',
                    }}
                  >
                    <span style={{ fontSize: '10.5px', fontWeight: '800', textTransform: 'uppercase', letterSpacing: '0.15em', color: '#d4af37' }}>
                      Founder & Lead Architect
                    </span>
                    <span style={{ fontSize: '14px', fontWeight: '700', color: 'var(--text-primary)' }}>
                      NIGHTMARE
                    </span>
                    <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
                      Systems Thinking, Core Engine Design & Operational Invariants
                    </span>
                  </div>

                  <div
                    style={{
                      padding: '16px',
                      borderRadius: '14px',
                      background: 'var(--bg-deep)',
                      border: '1px solid var(--border-light)',
                      display: 'flex',
                      flexDirection: 'column',
                      gap: '4px',
                    }}
                  >
                    <span style={{ fontSize: '10.5px', fontWeight: '800', textTransform: 'uppercase', letterSpacing: '0.15em', color: '#d4af37' }}>
                      Organization & Studio
                    </span>
                    <span style={{ fontSize: '14px', fontWeight: '700', color: 'var(--text-primary)' }}>
                      NIGHTMARE PROJECTS
                    </span>
                    <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
                      Sovereign Computing & Intelligent Browser Infrastructures
                    </span>
                  </div>
                </div>

                {/* System Specifications */}
                <div
                  style={{
                    padding: '18px',
                    borderRadius: '14px',
                    background: 'var(--bg-deep)',
                    border: '1px solid var(--border-light)',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '10px',
                  }}
                >
                  <span style={{ fontSize: '11px', fontWeight: '800', textTransform: 'uppercase', letterSpacing: '0.15em', color: 'var(--text-primary)' }}>
                    System Architecture & Runtime Invariants
                  </span>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px', fontSize: '11.5px' }}>
                    <div style={{ color: 'var(--text-muted)' }}>• Chromium Blink Core: <span style={{ color: 'var(--text-primary)', fontWeight: '600' }}>v120.0</span></div>
                    <div style={{ color: 'var(--text-muted)' }}>• Electron Native Shell: <span style={{ color: 'var(--text-primary)', fontWeight: '600' }}>v28.3.3</span></div>
                    <div style={{ color: 'var(--text-muted)' }}>• Local Database: <span style={{ color: 'var(--text-primary)', fontWeight: '600' }}>Better-SQLite3 (WAL Mode)</span></div>
                    <div style={{ color: 'var(--text-muted)' }}>• Vault Encryption: <span style={{ color: '#10b981', fontWeight: '700' }}>AES-256-GCM Zero-Knowledge</span></div>
                    <div style={{ color: 'var(--text-muted)' }}>• AI Orchestration: <span style={{ color: 'var(--text-primary)', fontWeight: '600' }}>Local Ollama + Gemini 1.5</span></div>
                    <div style={{ color: 'var(--text-muted)' }}>• License: <span style={{ color: 'var(--text-primary)', fontWeight: '600' }}>Proprietary (Nightmare Projects)</span></div>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>

        <div
          className="modal-footer"
          style={{
            padding: '16px 20px',
            borderTop: '1px solid var(--border-light)',
            display: 'flex',
            justifyContent: 'flex-end',
            backgroundColor: 'var(--bg-deep)',
          }}
        >
          <button className="settings-done-button" onClick={onClose}>
            Save & Exit
          </button>
        </div>

        {/* Resize Handle */}
        <div
          className="settings-modal-resizer"
          style={{
            position: 'absolute',
            bottom: '0',
            right: '0',
            width: '16px',
            height: '16px',
            cursor: 'se-resize',
            zIndex: 1000,
            background: 'linear-gradient(135deg, transparent 50%, rgba(255, 255, 255, 0.2) 50%)',
            borderBottomRightRadius: '12px',
          }}
          onMouseDown={e => {
            e.preventDefault();
            const startWidth = modalWidth;
            const startHeight = modalHeight;
            const startX = e.clientX;
            const startY = e.clientY;

            const handleMouseMove = (moveEvent: MouseEvent) => {
              const newWidth = Math.max(500, startWidth + (moveEvent.clientX - startX));
              const newHeight = Math.max(400, startHeight + (moveEvent.clientY - startY));
              setModalWidth(newWidth);
              setModalHeight(newHeight);
            };

            const handleMouseUp = (upEvent: MouseEvent) => {
              document.removeEventListener('mousemove', handleMouseMove);
              document.removeEventListener('mouseup', handleMouseUp);
              
              // Persist final values
              const finalWidth = Math.max(500, startWidth + (upEvent.clientX - startX));
              const finalHeight = Math.max(400, startHeight + (upEvent.clientY - startY));
              localStorage.setItem('settings-modal-width', finalWidth.toString());
              localStorage.setItem('settings-modal-height', finalHeight.toString());
            };

            document.addEventListener('mousemove', handleMouseMove);
            document.addEventListener('mouseup', handleMouseUp);
          }}
        />
      </div>
    </div>
  );
}
