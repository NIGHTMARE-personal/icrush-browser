import React, { useState, useEffect, useRef, useCallback } from 'react';
import { IncognitoHomescreen } from './IncognitoHomescreen';
import { ChronosDashboard } from './ChronosDashboard';
import { BrandLogo } from './BrandLogo';

interface Tab {
  id: string;
  url: string;
  title: string;
  loading: boolean;
  isSuspended?: boolean;
}

interface IcrushBrowserHomescreenProps {
  tabs: Tab[];
  onNavigate: (url: string) => void;
  onOpenSettings: (tab?: string) => void;
  onOpenProfile: () => void;
  onFocusAISidebar: () => void;
  onOpenAIChatWindow?: (initialPrompt?: string) => void;
  onToggleWorkspaces: () => void;
  onCreateTab: (url?: string) => void;
  currentEngine?: string;
  onSelectEngine?: (engine: string) => void;
  isIncognito?: boolean;
  onSelectPalette?: (palette: string) => void;
}

interface QuickLink {
  name: string;
  url: string;
}

interface TaskItem {
  id: string;
  text: string;
  completed: boolean;
}

interface WeatherData {
  current: {
    temperature_2m: number;
    relative_humidity_2m: number;
    apparent_temperature: number;
    weather_code: number;
    wind_speed_10m: number;
  };
  daily: {
    weather_code: number[];
    temperature_2m_max: number[];
    temperature_2m_min: number[];
  };
  timezone: string;
}

interface CachedWeather {
  data: WeatherData;
  timestamp: number;
}

const WEATHER_CODE_LABELS: Record<number, string> = {
  0: 'Clear Sky', 1: 'Mainly Clear', 2: 'Partly Cloudy', 3: 'Overcast',
  45: 'Fog', 48: 'Rime Fog', 51: 'Light Drizzle', 53: 'Moderate Drizzle',
  55: 'Dense Drizzle', 61: 'Slight Rain', 63: 'Moderate Rain', 65: 'Heavy Rain',
  71: 'Slight Snow', 73: 'Moderate Snow', 75: 'Heavy Snow',
  80: 'Slight Showers', 81: 'Moderate Showers', 82: 'Violent Showers',
  95: 'Thunderstorm', 96: 'Thunderstorm w/ Hail', 99: 'Thunderstorm w/ Heavy Hail',
};

const WEATHER_CACHE_KEY = 'icrush-homescreen-weather';
const WEATHER_CACHE_TTL = 30 * 60 * 1000;

/* ─────────────────────────────────────────────────────────────
   Crisp Minimal SVG Line Icons (No Emojis)
   ───────────────────────────────────────────────────────────── */

const IconUser = () => (
  <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
    <circle cx="12" cy="7" r="4" />
  </svg>
);

const IconGrid = () => (
  <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <rect x="3" y="3" width="7" height="7" /><rect x="14" y="3" width="7" height="7" />
    <rect x="14" y="14" width="7" height="7" /><rect x="3" y="14" width="7" height="7" />
  </svg>
);

const IconTimer = () => (
  <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="12" cy="12" r="10" />
    <polyline points="12 6 12 12 16 14" />
  </svg>
);

const IconSettings = () => (
  <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="12" cy="12" r="3" />
    <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z" />
  </svg>
);

const IconHelp = () => (
  <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="12" cy="12" r="10" />
    <path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3" /><line x1="12" y1="17" x2="12.01" y2="17" />
  </svg>
);

const IconSearch = () => (
  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" />
  </svg>
);

const IconSparkles = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M12 3l1.912 5.885L20 10.8l-4.756 4.635L16.36 21 12 17.67 7.64 21l1.116-5.565L4 10.8l6.088-1.915L12 3z" />
  </svg>
);

const IconGlobe = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="12" cy="12" r="10" /><line x1="2" y1="12" x2="22" y2="12" />
    <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" />
  </svg>
);

const IconSunCloud = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M6.34 17.66l-1.41 1.41M19.07 4.93l-1.41 1.41" />
    <path d="M17.5 19H9a5 5 0 0 1-.8-9.94A6.5 6.5 0 0 1 19.5 13a4.5 4.5 0 0 1-2 6z" />
  </svg>
);

const IconChevronDown = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
    <polyline points="6 9 12 15 18 9" />
  </svg>
);

const IconPalette = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="13.5" cy="6.5" r=".5" fill="currentColor" /><circle cx="17.5" cy="10.5" r=".5" fill="currentColor" />
    <circle cx="8.5" cy="7.5" r=".5" fill="currentColor" /><circle cx="6.5" cy="12.5" r=".5" fill="currentColor" />
    <path d="M12 2C6.5 2 2 6.5 2 12s4.5 10 10 10c.926 0 1.648-.746 1.648-1.688 0-.437-.18-.835-.437-1.125-.29-.289-.438-.652-.438-1.125a1.64 1.64 0 0 1 1.668-1.668h1.996c3.051 0 5.563-2.512 5.563-5.563C22 6.5 17.5 2 12 2z" />
  </svg>
);

const IconPlus = () => (
  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
    <line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" />
  </svg>
);

const IconTrash = () => (
  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <polyline points="3 6 5 6 21 6" /><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
  </svg>
);

const IconCheck = () => (
  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
    <polyline points="20 6 9 17 4 12" />
  </svg>
);

const AI_MODELS = [
  { id: 'chatgpt', name: 'ChatGPT', url: 'https://chatgpt.com', color: '#10a37f' },
  { id: 'gemini', name: 'Gemini', url: 'https://gemini.google.com', color: '#3b82f6' },
  { id: 'copilot', name: 'Copilot', url: 'https://copilot.microsoft.com', color: '#0078d4' },
  { id: 'claude', name: 'Claude', url: 'https://claude.ai', color: '#d97706' },
  { id: 'deepseek', name: 'DeepSeek', url: 'https://chat.deepseek.com', color: '#4f46e5' },
  { id: 'perplexity', name: 'Perplexity', url: 'https://perplexity.ai', color: '#06b6d4' },
  { id: 'grok', name: 'Grok', url: 'https://x.com/i/grok', color: '#ffffff' },
  { id: 'meta_ai', name: 'Meta AI', url: 'https://meta.ai', color: '#0284c7' },
  { id: 'qwen', name: 'Qwen', url: 'https://chat.qwen.ai', color: '#8b5cf6' },
  { id: 'adobe_firefly', name: 'Adobe Firefly', url: 'https://firefly.adobe.com', color: '#ec4899' },
  { id: 'mistral', name: 'Mistral Le Chat', url: 'https://chat.mistral.ai', color: '#f97316' },
  { id: 'huggingface', name: 'HuggingFace', url: 'https://huggingface.co/chat', color: '#fbbf24' },
];

const SEARCH_ENGINES = [
  { id: 'google', name: 'Google', searchUrl: 'https://www.google.com/search?q=' },
  { id: 'duckduckgo', name: 'DuckDuckGo', searchUrl: 'https://duckduckgo.com/?q=' },
  { id: 'brave', name: 'Brave', searchUrl: 'https://search.brave.com/search?q=' },
  { id: 'bing', name: 'Bing', searchUrl: 'https://www.bing.com/search?q=' },
];

const DEFAULT_FAVORITES: QuickLink[] = [
  { name: 'YouTube', url: 'https://www.youtube.com' },
  { name: 'GitHub', url: 'https://github.com' },
  { name: 'Figma', url: 'https://figma.com' },
  { name: 'Instagram', url: 'https://instagram.com' },
  { name: 'Notion', url: 'https://notion.so' },
  { name: 'Gmail', url: 'https://mail.google.com' },
];

export function IcrushBrowserHomescreen({
  onNavigate,
  onOpenSettings,
  onOpenProfile,
  onFocusAISidebar,
  onOpenAIChatWindow,
  onCreateTab,
  currentEngine = 'google',
  onSelectEngine,
  isIncognito = false,
}: IcrushBrowserHomescreenProps) {
  // Theme State
  const [themeMode, setThemeMode] = useState<'deep-canvas' | 'warm-paper'>(() => {
    return (localStorage.getItem('homescreen_theme_mode') as any) || 'deep-canvas';
  });

  // Mode: 'web' vs 'ai'
  const [searchMode, setSearchMode] = useState<'web' | 'ai'>('web');
  const [query, setQuery] = useState('');
  const [activeEngine, setActiveEngine] = useState(currentEngine);

  // Time & Clock Settings
  const [is12Hour, setIs12Hour] = useState(() => localStorage.getItem('hs_12h') === 'true');
  const [timeStr, setTimeStr] = useState('');
  const [secondsTimeStr, setSecondsTimeStr] = useState('');
  const [dateStr, setDateStr] = useState('');
  const [dayUpper, setDayUpper] = useState('');
  const [dateUpper, setDateUpper] = useState('');

  // Chronos & Timer Dashboard State
  const [isChronosOpen, setIsChronosOpen] = useState(false);

  // Floating Help HUD Modal
  const [isHelpOpen, setIsHelpOpen] = useState(false);
  const [helpCategory, setHelpCategory] = useState<'all' | 'tabs' | 'ai' | 'dashboards' | 'navigation'>('all');
  const [helpSearch, setHelpSearch] = useState('');

  // AI Tools Dock State
  const [isAITrayOpen, setIsAITrayOpen] = useState(true);
  const aiSliderRef = useRef<HTMLDivElement>(null);

  // Bento Widgets State
  const [favorites, setFavorites] = useState<QuickLink[]>(() => {
    try {
      const stored = localStorage.getItem('homescreen_favorites');
      return stored ? JSON.parse(stored) : DEFAULT_FAVORITES;
    } catch {
      return DEFAULT_FAVORITES;
    }
  });

  const [tasks, setTasks] = useState<TaskItem[]>(() => {
    try {
      const stored = localStorage.getItem('homescreen_tasks');
      return stored ? JSON.parse(stored) : [];
    } catch {
      return [];
    }
  });
  const [taskFilter, setTaskFilter] = useState<'all' | 'inbox'>('all');
  const [newTaskText, setNewTaskText] = useState('');
  const [notes, setNotes] = useState(() => localStorage.getItem('homescreen_notes') || '');

  const widgetDeckRef = useRef<HTMLDivElement>(null);

  // Weather State
  const [weather, setWeather] = useState<WeatherData | null>(null);
  const [weatherLocation, setWeatherLocation] = useState('Loading...');
  const [weatherLoading, setWeatherLoading] = useState(true);

  const fetchWeather = useCallback(async (lat: number, lon: number) => {
    const cacheRaw = localStorage.getItem(WEATHER_CACHE_KEY);
    if (cacheRaw) {
      try {
        const cache: CachedWeather = JSON.parse(cacheRaw);
        if (Date.now() - cache.timestamp < WEATHER_CACHE_TTL) {
          setWeather(cache.data);
          setWeatherLoading(false);
          return;
        }
      } catch { localStorage.removeItem(WEATHER_CACHE_KEY); }
    }

    const url = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&current=temperature_2m,relative_humidity_2m,apparent_temperature,weather_code,wind_speed_10m&daily=weather_code,temperature_2m_max,temperature_2m_min&timezone=auto&forecast_days=3`;
    try {
      const res = await fetch(url);
      if (!res.ok) throw new Error(`API ${res.status}`);
      const data: WeatherData = await res.json();
      setWeather(data);
      localStorage.setItem(WEATHER_CACHE_KEY, JSON.stringify({ data, timestamp: Date.now() }));
    } catch {
      setWeather(null);
    } finally {
      setWeatherLoading(false);
    }
  }, []);

  useEffect(() => {
    const DELHI_LAT = 28.6139, DELHI_LON = 77.209;
    async function resolve() {
      if (!navigator.geolocation) {
        setWeatherLocation('New Delhi');
        fetchWeather(DELHI_LAT, DELHI_LON);
        return;
      }
      try {
        const pos = await new Promise<GeolocationPosition>((resolve, reject) => {
          navigator.geolocation.getCurrentPosition(resolve, reject, { timeout: 5000 });
        });
        const { latitude, longitude } = pos.coords;
        try {
          const geoRes = await fetch(`https://geocoding-api.open-meteo.com/v1/search?latitude=${latitude}&longitude=${longitude}&count=1`);
          const geoData = await geoRes.json();
          setWeatherLocation(geoData?.results?.[0]?.name ?? `${latitude.toFixed(2)}, ${longitude.toFixed(2)}`);
        } catch {
          setWeatherLocation(`${latitude.toFixed(2)}, ${longitude.toFixed(2)}`);
        }
        fetchWeather(latitude, longitude);
      } catch {
        setWeatherLocation('New Delhi');
        fetchWeather(DELHI_LAT, DELHI_LON);
      }
    }
    resolve();
  }, [fetchWeather]);

  const getWeatherLabel = (code: number) => WEATHER_CODE_LABELS[code] ?? 'Unknown';

  const DAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

  // Clock Update
  useEffect(() => {
    const updateTime = () => {
      const now = new Date();
      let hours = now.getHours();
      if (is12Hour) {
        hours = hours % 12 || 12;
      }
      const hoursStr = hours.toString().padStart(2, '0');
      const minutes = now.getMinutes().toString().padStart(2, '0');
      const seconds = now.getSeconds().toString().padStart(2, '0');
      setTimeStr(`${hoursStr}:${minutes}`);
      setSecondsTimeStr(`${hoursStr}:${minutes}:${seconds}`);

      setDateStr(
        now.toLocaleDateString('en-US', {
          weekday: 'long',
          day: 'numeric',
          month: 'long',
        })
      );

      setDayUpper(now.toLocaleDateString('en-US', { weekday: 'long' }).toUpperCase());
      setDateUpper(
        `${now.getDate()} ${now.toLocaleDateString('en-US', { month: 'short' }).toUpperCase()}`
      );
    };

    updateTime();
    const interval = setInterval(updateTime, 1000);
    return () => clearInterval(interval);
  }, [is12Hour]);

  const toggleTheme = () => {
    const next = themeMode === 'deep-canvas' ? 'warm-paper' : 'deep-canvas';
    setThemeMode(next);
    localStorage.setItem('homescreen_theme_mode', next);
  };

  const handleEngineChange = (engineId: string) => {
    setActiveEngine(engineId);
    if (onSelectEngine) onSelectEngine(engineId);
  };

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!query.trim()) return;

    if (searchMode === 'ai') {
      if (onOpenAIChatWindow) {
        onOpenAIChatWindow(query.trim());
      } else {
        onFocusAISidebar();
        setTimeout(() => {
          window.dispatchEvent(
            new CustomEvent('ai-execute-prompt', { detail: { prompt: query.trim() } })
          );
        }, 150);
      }
      setQuery('');
      return;
    }

    const raw = query.trim();
    if (raw.startsWith('http://') || raw.startsWith('https://') || raw.startsWith('about:')) {
      onNavigate(raw);
    } else if (raw.includes('.') && !raw.includes(' ')) {
      onNavigate(`https://${raw}`);
    } else {
      const selected = SEARCH_ENGINES.find(e => e.id === activeEngine) || SEARCH_ENGINES[0];
      onNavigate(`${selected.searchUrl}${encodeURIComponent(raw)}`);
    }
  };

  const scrollToWidgetDeck = () => {
    widgetDeckRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  const handleAddTask = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTaskText.trim()) return;
    const newTask: TaskItem = {
      id: Date.now().toString(),
      text: newTaskText.trim(),
      completed: false,
    };
    const nextTasks = [newTask, ...tasks];
    setTasks(nextTasks);
    localStorage.setItem('homescreen_tasks', JSON.stringify(nextTasks));
    setNewTaskText('');
  };

  const toggleTask = (id: string) => {
    const nextTasks = tasks.map(t => (t.id === id ? { ...t, completed: !t.completed } : t));
    setTasks(nextTasks);
    localStorage.setItem('homescreen_tasks', JSON.stringify(nextTasks));
  };

  const deleteTask = (id: string) => {
    const nextTasks = tasks.filter(t => t.id !== id);
    setTasks(nextTasks);
    localStorage.setItem('homescreen_tasks', JSON.stringify(nextTasks));
  };

  const handleNotesChange = (val: string) => {
    setNotes(val);
    localStorage.setItem('homescreen_notes', val);
  };

  const handleAddFavorite = () => {
    const url = prompt('Enter website URL (e.g. https://github.com):');
    if (!url) return;
    const name = prompt('Enter website name:', url.replace('https://', '').replace('http://', '').split('/')[0]) || 'Site';
    const next = [...favorites, { name, url }];
    setFavorites(next);
    localStorage.setItem('homescreen_favorites', JSON.stringify(next));
  };

  if (isIncognito) {
    return <IncognitoHomescreen onNavigate={onNavigate} onCreateTab={onCreateTab} />;
  }

  const isDark = themeMode === 'deep-canvas';

  return (
    <div
      className={`homescreen-root ${isDark ? 'theme-deep-canvas' : 'theme-warm-paper'}`}
      style={{
        width: '100%',
        height: '100%',
        overflowY: 'auto',
        scrollBehavior: 'smooth',
        background: isDark ? '#0a0a0e' : '#F9F6F0',
        color: isDark ? '#f9f6f0' : '#3C322C',
        fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
        position: 'relative',
        userSelect: 'none',
      }}
    >
      {/* ─────────────────────────────────────────────────────────────
          FLOATING GLASS CAPSULE (MATCHING SCREENSHOT media_1787212074939.png)
          Overlay only — Never resizes or shrinks the main screen
          ───────────────────────────────────────────────────────────── */}
      <aside
        style={{
          position: 'fixed',
          left: '20px',
          top: '50%',
          transform: 'translateY(-50%)',
          zIndex: 40,
          background: isDark ? 'rgba(18, 18, 24, 0.65)' : 'rgba(255, 255, 255, 0.75)',
          border: isDark ? '1px solid rgba(255, 255, 255, 0.12)' : '1px solid rgba(0, 0, 0, 0.08)',
          borderRadius: '9999px',
          padding: '10px 6px',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          gap: '8px',
          boxShadow: isDark ? '0 16px 40px rgba(0, 0, 0, 0.6)' : '0 12px 30px rgba(0, 0, 0, 0.08)',
          backdropFilter: 'blur(24px)',
          pointerEvents: 'auto',
        }}
      >
        {/* 1. Profile / Account Trigger */}
        <button
          type="button"
          onClick={onOpenProfile}
          title="Account Profile"
          style={{
            width: '38px',
            height: '38px',
            borderRadius: '50%',
            background: isDark ? 'rgba(212, 175, 55, 0.18)' : 'rgba(200, 109, 81, 0.18)',
            border: isDark ? '1px solid rgba(212, 175, 55, 0.35)' : '1px solid rgba(200, 109, 81, 0.35)',
            color: isDark ? '#f2ca50' : '#C86D51',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            cursor: 'pointer',
            transition: 'all 0.15s ease',
          }}
        >
          <IconUser />
        </button>

        {/* Separator Line */}
        <div style={{ width: '20px', height: '1px', background: isDark ? 'rgba(255, 255, 255, 0.1)' : 'rgba(0, 0, 0, 0.08)', margin: '2px 0' }} />

        {/* 2. Grid & Widgets Deck Trigger */}
        <button
          type="button"
          onClick={scrollToWidgetDeck}
          title="Grid & Widgets Hub"
          style={{
            width: '38px',
            height: '38px',
            borderRadius: '50%',
            background: 'transparent',
            border: 'none',
            color: isDark ? '#e4e4e7' : '#3f3f46',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            cursor: 'pointer',
            transition: 'all 0.15s ease',
          }}
          onMouseEnter={e => (e.currentTarget.style.background = isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.06)')}
          onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
        >
          <IconGrid />
        </button>

        {/* 3. Chronos Timer & Calendar Dashboard Trigger */}
        <button
          type="button"
          onClick={() => setIsChronosOpen(true)}
          title="Open Focus Timers & Smart Calendar Studio"
          style={{
            width: '38px',
            height: '38px',
            borderRadius: '50%',
            background: isChronosOpen ? (isDark ? 'rgba(212, 175, 55, 0.25)' : 'rgba(200, 109, 81, 0.25)') : 'transparent',
            border: isChronosOpen ? (isDark ? '1px solid rgba(212, 175, 55, 0.5)' : '1px solid rgba(200, 109, 81, 0.5)') : 'none',
            color: isChronosOpen ? (isDark ? '#f2ca50' : '#C86D51') : (isDark ? '#e4e4e7' : '#3f3f46'),
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            cursor: 'pointer',
            transition: 'all 0.15s ease',
          }}
          onMouseEnter={e => (e.currentTarget.style.background = isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.06)')}
          onMouseLeave={e => {
            if (!isChronosOpen) e.currentTarget.style.background = 'transparent';
          }}
        >
          <IconTimer />
        </button>

        {/* 4. Full-Screen Settings Dashboard Trigger */}
        <button
          type="button"
          onClick={() => onOpenSettings('general')}
          title="Open Full-Screen Settings Dashboard"
          style={{
            width: '38px',
            height: '38px',
            borderRadius: '50%',
            background: 'transparent',
            border: 'none',
            color: isDark ? '#e4e4e7' : '#3f3f46',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            cursor: 'pointer',
            transition: 'all 0.15s ease',
          }}
          onMouseEnter={e => (e.currentTarget.style.background = isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.06)')}
          onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
        >
          <IconSettings />
        </button>

        {/* 5. Help / Shortcut Info Trigger */}
        <button
          type="button"
          onClick={() => setIsHelpOpen(true)}
          title="Help & Shortcuts"
          style={{
            width: '38px',
            height: '38px',
            borderRadius: '50%',
            background: 'transparent',
            border: 'none',
            color: isDark ? '#a1a1aa' : '#71717a',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            cursor: 'pointer',
            transition: 'all 0.15s ease',
          }}
          onMouseEnter={e => (e.currentTarget.style.background = isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.06)')}
          onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
        >
          <IconHelp />
        </button>
      </aside>

      {/* ─────────────────────────────────────────────────────────────
          CHRONOS & CALENDAR DASHBOARD MODAL/OVERLAY
          ───────────────────────────────────────────────────────────── */}
      {isChronosOpen && (
        <ChronosDashboard
          onClose={() => setIsChronosOpen(false)}
          onNavigate={onNavigate}
          onOpenSettings={onOpenSettings}
          isDark={isDark}
        />
      )}

      {/* ─────────────────────────────────────────────────────────────
          HELP / SHORTCUTS & PRODUCTIVITY COMMAND MATRIX MODAL
          ───────────────────────────────────────────────────────────── */}
      {isHelpOpen && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            zIndex: 80,
            background: 'rgba(0, 0, 0, 0.65)',
            backdropFilter: 'blur(16px)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '20px',
          }}
          onClick={() => setIsHelpOpen(false)}
        >
          <div
            style={{
              maxWidth: '680px',
              width: '100%',
              maxHeight: '85vh',
              background: isDark ? 'rgba(18, 18, 24, 0.95)' : 'rgba(255, 255, 255, 0.98)',
              border: isDark ? '1px solid rgba(255, 255, 255, 0.12)' : '1px solid rgba(0, 0, 0, 0.1)',
              borderRadius: '24px',
              padding: '28px',
              boxShadow: isDark ? '0 30px 80px rgba(0, 0, 0, 0.7)' : '0 20px 60px rgba(0, 0, 0, 0.12)',
              display: 'flex',
              flexDirection: 'column',
              gap: '18px',
              userSelect: 'none',
            }}
            onClick={e => e.stopPropagation()}
          >
            {/* Header */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
              <div>
                <span style={{ fontSize: '10.5px', fontWeight: '800', textTransform: 'uppercase', letterSpacing: '0.2em', color: isDark ? '#d4af37' : '#C86D51' }}>
                  Productivity Cheat Sheet
                </span>
                <h3 style={{ margin: '4px 0 0 0', fontSize: '20px', fontWeight: '700', fontFamily: 'Playfair Display, Georgia, serif', color: isDark ? '#ffffff' : '#1e1b18' }}>
                  Keyboard Shortcuts & Command Matrix
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setIsHelpOpen(false)}
                style={{
                  width: '32px',
                  height: '32px',
                  borderRadius: '50%',
                  background: isDark ? 'rgba(255, 255, 255, 0.08)' : 'rgba(0, 0, 0, 0.06)',
                  border: 'none',
                  color: isDark ? '#cbd5e1' : '#475569',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: '14px',
                }}
              >
                ✕
              </button>
            </div>

            {/* Search Input Bar */}
            <div style={{ position: 'relative' }}>
              <input
                type="text"
                placeholder="Search shortcuts, actions, or keys (e.g. AI, Tab, Timer, Zoom)..."
                value={helpSearch}
                onChange={e => setHelpSearch(e.target.value)}
                style={{
                  width: '100%',
                  background: isDark ? 'rgba(255, 255, 255, 0.05)' : 'rgba(0, 0, 0, 0.04)',
                  border: isDark ? '1px solid rgba(255, 255, 255, 0.1)' : '1px solid rgba(0, 0, 0, 0.1)',
                  borderRadius: '12px',
                  padding: '10px 16px',
                  color: isDark ? '#ffffff' : '#000000',
                  fontSize: '12.5px',
                  outline: 'none',
                }}
              />
            </div>

            {/* Category Filter Pills */}
            <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
              {[
                { id: 'all', label: 'All Shortcuts' },
                { id: 'tabs', label: 'Tabs & Navigation' },
                { id: 'ai', label: 'Neural AI Studio' },
                { id: 'dashboards', label: 'Focus & Studios' },
                { id: 'navigation', label: 'Page & DevTools' },
              ].map(cat => (
                <button
                  key={cat.id}
                  type="button"
                  onClick={() => setHelpCategory(cat.id as any)}
                  style={{
                    padding: '5px 14px',
                    borderRadius: '9999px',
                    background: helpCategory === cat.id ? (isDark ? 'rgba(255, 255, 255, 0.2)' : '#1e1b18') : isDark ? 'rgba(255, 255, 255, 0.04)' : 'rgba(0, 0, 0, 0.04)',
                    border: helpCategory === cat.id ? (isDark ? '1px solid rgba(255, 255, 255, 0.3)' : 'none') : '1px solid transparent',
                    color: helpCategory === cat.id ? '#ffffff' : isDark ? '#94a3b8' : '#64748b',
                    fontSize: '11px',
                    fontWeight: '700',
                    cursor: 'pointer',
                    transition: 'all 0.15s ease',
                  }}
                >
                  {cat.label}
                </button>
              ))}
            </div>

            {/* Shortcuts List Viewport */}
            <div
              style={{
                flex: 1,
                overflowY: 'auto',
                display: 'flex',
                flexDirection: 'column',
                gap: '8px',
                paddingRight: '4px',
                maxHeight: '380px',
              }}
              className="no-scrollbar"
            >
              {[
                // Tabs & Navigation
                { category: 'tabs', action: 'New Tab', keys: ['Ctrl', 'T'], description: 'Opens a clean new tab homescreen viewport' },
                { category: 'tabs', action: 'Close Active Tab', keys: ['Ctrl', 'W'], description: 'Closes the currently active browser tab' },
                { category: 'tabs', action: 'Reopen Last Closed Tab', keys: ['Ctrl', 'Shift', 'T'], description: 'Restores the most recently closed tab with full history state' },
                { category: 'tabs', action: 'New Incognito / Private Tab', keys: ['Ctrl', 'Shift', 'N'], description: 'Opens an isolated private session with partitioned memory' },
                { category: 'tabs', action: 'Cycle Next Tab', keys: ['Ctrl', 'Tab'], description: 'Switches to the adjacent tab on the right' },
                { category: 'tabs', action: 'Cycle Previous Tab', keys: ['Ctrl', 'Shift', 'Tab'], description: 'Switches to the adjacent tab on the left' },
                { category: 'tabs', action: 'Search Open Tabs', keys: ['Ctrl', 'Shift', 'A'], description: 'Opens the fast fuzzy search popup across all workspace tabs' },
                { category: 'tabs', action: 'Focus Address Bar / Omnibox', keys: ['Ctrl', 'L'], description: 'Highlights and focuses the URL address bar' },
                { category: 'tabs', action: 'Alternate Omnibox Focus', keys: ['Alt', 'D'], description: 'Alternative quick jump to search input' },

                // Neural AI Studio
                { category: 'ai', action: 'Toggle AI Sidebar', keys: ['Alt', 'Space'], description: 'Slides in the Neural Assistant context sidebar' },
                { category: 'ai', action: 'Alternate AI Trigger', keys: ['Ctrl', 'B'], description: 'Secondary keyboard shortcut to open AI Assistant' },
                { category: 'ai', action: 'Full-Screen AI Studio', keys: ['about:ai'], description: 'Opens dedicated full-tab Neural Workspace with multi-model switchers' },
                { category: 'ai', action: 'Execute AI Prompt', keys: ['Enter'], description: 'Sends query to active neural model engine' },
                { category: 'ai', action: 'Insert Linebreak in Prompt', keys: ['Shift', 'Enter'], description: 'Creates a line break without executing the prompt' },
                { category: 'ai', action: 'AI Command Center', keys: ['Ctrl', 'K'], description: 'Opens global AI action palette and quick commands' },

                // Focus & Studios
                { category: 'dashboards', action: 'Chronos Focus Studio', keys: ['about:timer'], description: 'Opens Pomodoro timers, task matrix, and weekly stats' },
                { category: 'dashboards', action: 'Smart Calendar Hub', keys: ['about:calendar'], description: 'Opens monthly grid with date intelligence & milestone history' },
                { category: 'dashboards', action: 'Global Spotlight HUD', keys: ['Ctrl', 'Space'], description: 'Instant productivity launcher and system runner' },
                { category: 'dashboards', action: 'Smart History Studio', keys: ['Ctrl', 'H'], description: 'Visual timeline of all past web investigations' },
                { category: 'dashboards', action: 'Downloads Manager', keys: ['Ctrl', 'J'], description: 'Dedicated files, speed gauges, and downloads monitor' },
                { category: 'dashboards', action: 'Bookmark Current Page', keys: ['Ctrl', 'D'], description: 'Saves active page to encrypted bookmark collection' },
                { category: 'dashboards', action: 'Bookmarks Manager', keys: ['about:bookmarks'], description: 'Full-screen bookmark folder hierarchy & search' },
                { category: 'dashboards', action: 'Workspaces Mind Map', keys: ['about:workspaces'], description: 'Visual tree of tab groups, sessions, and workspaces' },
                { category: 'dashboards', action: 'Visual Nodes Canvas', keys: ['about:nodes'], description: 'Infinite spatial canvas for web research nodes' },
                { category: 'dashboards', action: 'Full Settings Studio', keys: ['Capsule ⚙'], description: 'Executive configuration for search, AI models, Tor & VPN' },

                // Page & DevTools
                { category: 'navigation', action: 'Reload Page', keys: ['F5'], description: 'Refreshes current web page content' },
                { category: 'navigation', action: 'Hard Reload (Bypass Cache)', keys: ['Ctrl', 'Shift', 'R'], description: 'Forces server refresh bypassing browser cache' },
                { category: 'navigation', action: 'Find on Page', keys: ['Ctrl', 'F'], description: 'Searches text keywords inside the active page DOM' },
                { category: 'navigation', action: 'Print Web Page', keys: ['Ctrl', 'P'], description: 'Generates print-ready document or PDF preview' },
                { category: 'navigation', action: 'Zoom In Page', keys: ['Ctrl', '+'], description: 'Increases viewport scaling in 10% increments' },
                { category: 'navigation', action: 'Zoom Out Page', keys: ['Ctrl', '-'], description: 'Decreases viewport scaling in 10% increments' },
                { category: 'navigation', action: 'Reset Page Zoom', keys: ['Ctrl', '0'], description: 'Resets webview scaling back to 100% standard' },
                { category: 'navigation', action: 'Toggle Fullscreen', keys: ['F11'], description: 'Enters or exits borderless full-screen display' },
                { category: 'navigation', action: 'Chromium DevTools', keys: ['Ctrl', 'Shift', 'I'], description: 'Inspects DOM elements, console logs, and network traffic' },
                { category: 'navigation', action: 'Alternate DevTools', keys: ['F12'], description: 'Alternative toggle for Chromium developer console' },
              ]
                .filter(item => helpCategory === 'all' || item.category === helpCategory)
                .filter(item => {
                  if (!helpSearch.trim()) return true;
                  const q = helpSearch.toLowerCase();
                  return (
                    item.action.toLowerCase().includes(q) ||
                    item.description.toLowerCase().includes(q) ||
                    item.keys.some(k => k.toLowerCase().includes(q))
                  );
                })
                .map(item => (
                  <div
                    key={item.action}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      padding: '10px 14px',
                      borderRadius: '12px',
                      background: isDark ? 'rgba(255, 255, 255, 0.03)' : 'rgba(0, 0, 0, 0.02)',
                      border: isDark ? '1px solid rgba(255, 255, 255, 0.06)' : '1px solid rgba(0, 0, 0, 0.05)',
                    }}
                  >
                    <div>
                      <div style={{ fontSize: '13px', fontWeight: '700', color: isDark ? '#ffffff' : '#000000' }}>
                        {item.action}
                      </div>
                      <div style={{ fontSize: '11px', color: isDark ? '#94a3b8' : '#64748b', marginTop: '2px' }}>
                        {item.description}
                      </div>
                    </div>

                    <div style={{ display: 'flex', gap: '4px', alignItems: 'center' }}>
                      {item.keys.map(k => (
                        <kbd
                          key={k}
                          style={{
                            background: isDark ? 'rgba(255, 255, 255, 0.1)' : 'rgba(0, 0, 0, 0.08)',
                            border: isDark ? '1px solid rgba(255, 255, 255, 0.15)' : '1px solid rgba(0, 0, 0, 0.12)',
                            borderRadius: '6px',
                            padding: '3px 8px',
                            fontSize: '11px',
                            fontWeight: '700',
                            fontFamily: 'monospace',
                            color: isDark ? '#f1f5f9' : '#0f172a',
                            boxShadow: isDark ? '0 2px 4px rgba(0,0,0,0.4)' : '0 1px 2px rgba(0,0,0,0.08)',
                          }}
                        >
                          {k}
                        </kbd>
                      ))}
                    </div>
                  </div>
                ))}
            </div>
          </div>
        </div>
      )}

      {/* ─────────────────────────────────────────────────────────────
          TIER 1: MAIN FOCAL VIEWPORT (Full uncompressed width)
          ───────────────────────────────────────────────────────────── */}
      <section
        style={{
          minHeight: '100%',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'space-between',
          padding: '24px 36px 16px 36px',
          boxSizing: 'border-box',
          position: 'relative',
        }}
      >
        {/* Top Header Controls */}
        <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <button
              type="button"
              onClick={toggleTheme}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
                background: isDark ? 'rgba(255, 255, 255, 0.04)' : 'rgba(0, 0, 0, 0.04)',
                border: isDark ? '1px solid rgba(255, 255, 255, 0.08)' : '1px solid rgba(0, 0, 0, 0.08)',
                borderRadius: '9999px',
                padding: '6px 14px',
                color: isDark ? '#d4af37' : '#C86D51',
                fontSize: '11px',
                fontWeight: '700',
                cursor: 'pointer',
                transition: 'all 0.2s ease',
              }}
              title="Toggle Theme (Deep Canvas / Warm Paper)"
            >
              <IconPalette />
              <span>{isDark ? 'Deep Canvas' : 'Warm Paper'}</span>
            </button>

            <BrandLogo size={24} showText={true} subtitle="NIGHTMARE PROJECTS" />
          </div>

          {/* Right Header Navigation */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <button
              type="button"
              onClick={() => onNavigate('about:bookmarks')}
              style={{
                background: 'transparent',
                border: 'none',
                color: isDark ? '#a1a1aa' : '#5c524c',
                fontSize: '12px',
                fontWeight: '600',
                cursor: 'pointer',
                padding: '6px 10px',
                borderRadius: '8px',
              }}
            >
              Bookmarks
            </button>
            <button
              type="button"
              onClick={() => onNavigate('about:history')}
              style={{
                background: 'transparent',
                border: 'none',
                color: isDark ? '#a1a1aa' : '#5c524c',
                fontSize: '12px',
                fontWeight: '600',
                cursor: 'pointer',
                padding: '6px 10px',
                borderRadius: '8px',
              }}
            >
              History
            </button>
            <button
              type="button"
              onClick={() => onOpenSettings('general')}
              style={{
                background: 'transparent',
                border: 'none',
                color: isDark ? '#a1a1aa' : '#5c524c',
                fontSize: '12px',
                fontWeight: '600',
                cursor: 'pointer',
                padding: '6px 10px',
                borderRadius: '8px',
              }}
            >
              Settings
            </button>
            <button
              type="button"
              onClick={onOpenProfile}
              style={{
                background: isDark ? 'rgba(212, 175, 55, 0.15)' : 'rgba(200, 109, 81, 0.15)',
                border: isDark ? '1px solid rgba(212, 175, 55, 0.35)' : '1px solid rgba(200, 109, 81, 0.35)',
                borderRadius: '9999px',
                width: '32px',
                height: '32px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: isDark ? '#d4af37' : '#C86D51',
                fontSize: '12px',
                fontWeight: '700',
                cursor: 'pointer',
              }}
              title="Profile"
            >
              N
            </button>
          </div>
        </header>

        {/* Center Hero Lockup & Search Hub */}
        <div style={{ maxWidth: '680px', width: '100%', margin: '0 auto', textAlign: 'center' }}>
          {/* Typographic Digital Clock & Weather Glyph */}
          <div style={{ marginBottom: '28px' }}>
            <div
              onClick={() => setIsChronosOpen(true)}
              style={{
                fontFamily: 'Playfair Display, Georgia, serif',
                fontSize: '64px',
                fontWeight: '700',
                letterSpacing: '0.02em',
                lineHeight: '1',
                color: isDark ? '#f9f6f0' : '#1a1715',
                marginBottom: '8px',
                cursor: 'pointer',
                transition: 'opacity 0.2s ease',
              }}
              title="Click to open Focus Timers & Smart Calendar"
            >
              {timeStr}
            </div>

              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '12px', fontSize: '13.5px', color: isDark ? '#a1a1aa' : '#6c625c' }}>
              <span>{dateStr}</span>
              <span style={{ width: '4px', height: '4px', borderRadius: '50%', background: isDark ? '#d4af37' : '#C86D51' }} />
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                <span style={{ color: isDark ? '#f2ca50' : '#C86D51' }}><IconSunCloud /></span>
                {weatherLoading ? (
                  <span>Loading weather...</span>
                ) : weather ? (
                  <span>{Math.round(weather.current.temperature_2m)}°C • {getWeatherLabel(weather.current.weather_code)}</span>
                ) : (
                  <span>Weather unavailable</span>
                )}
              </div>
            </div>
          </div>

          {/* Mode Switcher Bar */}
          <div
            style={{
              display: 'inline-flex',
              background: isDark ? 'rgba(255, 255, 255, 0.04)' : 'rgba(0, 0, 0, 0.04)',
              border: isDark ? '1px solid rgba(255, 255, 255, 0.08)' : '1px solid rgba(0, 0, 0, 0.08)',
              borderRadius: '9999px',
              padding: '3px',
              marginBottom: '14px',
            }}
          >
            <button
              type="button"
              onClick={() => setSearchMode('web')}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
                padding: '6px 18px',
                borderRadius: '9999px',
                background: searchMode === 'web' ? (isDark ? 'rgba(212, 175, 55, 0.2)' : 'rgba(200, 109, 81, 0.2)') : 'transparent',
                border: searchMode === 'web' ? (isDark ? '1px solid rgba(212, 175, 55, 0.45)' : '1px solid rgba(200, 109, 81, 0.45)') : '1px solid transparent',
                color: searchMode === 'web' ? (isDark ? '#f2ca50' : '#C86D51') : (isDark ? '#a1a1aa' : '#7c726c'),
                fontSize: '12px',
                fontWeight: '700',
                cursor: 'pointer',
                transition: 'all 0.15s ease',
              }}
            >
              <IconGlobe />
              <span>Web Search</span>
            </button>

            <button
              type="button"
              onClick={() => setSearchMode('ai')}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
                padding: '6px 18px',
                borderRadius: '9999px',
                background: searchMode === 'ai' ? (isDark ? 'rgba(212, 175, 55, 0.2)' : 'rgba(200, 109, 81, 0.2)') : 'transparent',
                border: searchMode === 'ai' ? (isDark ? '1px solid rgba(212, 175, 55, 0.45)' : '1px solid rgba(200, 109, 81, 0.45)') : '1px solid transparent',
                color: searchMode === 'ai' ? (isDark ? '#f2ca50' : '#C86D51') : (isDark ? '#a1a1aa' : '#7c726c'),
                fontSize: '12px',
                fontWeight: '700',
                cursor: 'pointer',
                transition: 'all 0.15s ease',
              }}
            >
              <IconSparkles />
              <span>AI Chat</span>
            </button>
          </div>

          {/* Omnibar Input Form */}
          <form onSubmit={handleSearchSubmit} style={{ position: 'relative', width: '100%', marginBottom: '16px' }}>
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '12px',
                background: isDark ? 'rgba(18, 18, 24, 0.85)' : '#ffffff',
                border: isDark ? '1px solid rgba(212, 175, 55, 0.35)' : '1px solid rgba(0, 0, 0, 0.12)',
                borderRadius: '9999px',
                padding: '12px 20px',
                boxShadow: isDark
                  ? '0 16px 40px rgba(0, 0, 0, 0.6), inset 0 1px 0 rgba(255, 255, 255, 0.08)'
                  : '0 12px 32px rgba(0, 0, 0, 0.06)',
                backdropFilter: 'blur(20px)',
              }}
            >
              <span style={{ color: isDark ? '#d4af37' : '#C86D51' }}>
                {searchMode === 'web' ? <IconSearch /> : <IconSparkles />}
              </span>

              <input
                type="text"
                value={query}
                onChange={e => setQuery(e.target.value)}
                placeholder={
                  searchMode === 'web'
                    ? `Search ${activeEngine.toUpperCase()}, type URL, or enter query...`
                    : 'Ask anything, explore ideas, or formulate code prompts...'
                }
                style={{
                  flex: 1,
                  background: 'none',
                  border: 'none',
                  color: isDark ? '#ffffff' : '#1a1715',
                  fontSize: '14px',
                  outline: 'none',
                }}
                autoFocus
              />

              <button
                type="submit"
                style={{
                  background: isDark ? 'rgba(212, 175, 55, 0.2)' : '#1a1715',
                  border: isDark ? '1px solid rgba(212, 175, 55, 0.4)' : 'none',
                  color: isDark ? '#f2ca50' : '#ffffff',
                  padding: '6px 14px',
                  borderRadius: '9999px',
                  fontSize: '11.5px',
                  fontWeight: '700',
                  cursor: 'pointer',
                  letterSpacing: '0.04em',
                }}
              >
                {searchMode === 'web' ? 'Search' : 'Ask AI'}
              </button>
            </div>
          </form>

          {/* Search Engine Selector Pills */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px', flexWrap: 'wrap' }}>
            <span
              style={{
                fontSize: '10px',
                fontWeight: '800',
                textTransform: 'uppercase',
                letterSpacing: '0.2em',
                color: isDark ? '#71717a' : '#8c827a',
                marginRight: '4px',
              }}
            >
              Search With:
            </span>
            {SEARCH_ENGINES.map(engine => (
              <button
                key={engine.id}
                type="button"
                onClick={() => handleEngineChange(engine.id)}
                style={{
                  padding: '4px 12px',
                  borderRadius: '9999px',
                  background:
                    activeEngine === engine.id
                      ? isDark
                        ? 'rgba(212, 175, 55, 0.18)'
                        : 'rgba(200, 109, 81, 0.18)'
                      : isDark
                      ? 'rgba(255, 255, 255, 0.03)'
                      : 'rgba(0, 0, 0, 0.03)',
                  border:
                    activeEngine === engine.id
                      ? isDark
                        ? '1px solid rgba(212, 175, 55, 0.45)'
                        : '1px solid rgba(200, 109, 81, 0.45)'
                      : isDark
                      ? '1px solid rgba(255, 255, 255, 0.06)'
                      : '1px solid rgba(0, 0, 0, 0.06)',
                  color:
                    activeEngine === engine.id
                      ? isDark
                        ? '#f2ca50'
                        : '#C86D51'
                      : isDark
                      ? '#a1a1aa'
                      : '#6c625c',
                  fontSize: '11px',
                  fontWeight: '600',
                  cursor: 'pointer',
                  transition: 'all 0.15s ease',
                }}
              >
                {engine.name}
              </button>
            ))}
          </div>
        </div>

        {/* Bottom Rail: AI Tools Slidable Model Dock & Slide-Down Trigger */}
        <div>
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '12px',
              background: isDark ? 'rgba(18, 18, 24, 0.7)' : 'rgba(255, 255, 255, 0.8)',
              border: isDark ? '1px solid rgba(255, 255, 255, 0.08)' : '1px solid rgba(0, 0, 0, 0.08)',
              borderRadius: '9999px',
              padding: '6px 14px',
              boxShadow: '0 8px 24px rgba(0, 0, 0, 0.1)',
              backdropFilter: 'blur(16px)',
            }}
          >
            {/* AI Tools Toggle Button */}
            <button
              type="button"
              onClick={() => setIsAITrayOpen(!isAITrayOpen)}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
                background: isDark ? 'rgba(212, 175, 55, 0.15)' : 'rgba(200, 109, 81, 0.15)',
                border: isDark ? '1px solid rgba(212, 175, 55, 0.4)' : '1px solid rgba(200, 109, 81, 0.4)',
                borderRadius: '9999px',
                padding: '6px 14px',
                color: isDark ? '#f2ca50' : '#C86D51',
                fontSize: '11px',
                fontWeight: '800',
                textTransform: 'uppercase',
                letterSpacing: '0.12em',
                cursor: 'pointer',
                flexShrink: 0,
              }}
            >
              <IconSparkles />
              <span>AI Tools</span>
            </button>

            {/* Horizontally Slidable AI Models Tray */}
            {isAITrayOpen && (
              <div
                ref={aiSliderRef}
                style={{
                  display: 'flex',
                  gap: '8px',
                  overflowX: 'auto',
                  scrollbarWidth: 'none',
                  flex: 1,
                  padding: '2px 0',
                }}
                className="no-scrollbar"
              >
                {AI_MODELS.map(model => (
                  <button
                    key={model.id}
                    type="button"
                    onClick={() => {
                      if (onCreateTab) {
                        onCreateTab(model.url);
                      } else {
                        onNavigate(model.url);
                      }
                    }}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '6px',
                      padding: '5px 12px',
                      borderRadius: '9999px',
                      background: isDark ? 'rgba(255, 255, 255, 0.03)' : 'rgba(0, 0, 0, 0.03)',
                      border: isDark ? '1px solid rgba(255, 255, 255, 0.06)' : '1px solid rgba(0, 0, 0, 0.06)',
                      color: isDark ? '#e4e4e7' : '#27272a',
                      fontSize: '11.5px',
                      fontWeight: '600',
                      cursor: 'pointer',
                      whiteSpace: 'nowrap',
                      flexShrink: 0,
                      transition: 'all 0.15s ease',
                    }}
                    title={`Open ${model.name} (${model.url})`}
                    onMouseEnter={e => {
                      e.currentTarget.style.background = isDark ? 'rgba(212, 175, 55, 0.15)' : 'rgba(200, 109, 81, 0.15)';
                      e.currentTarget.style.borderColor = isDark ? 'rgba(212, 175, 55, 0.4)' : 'rgba(200, 109, 81, 0.4)';
                    }}
                    onMouseLeave={e => {
                      e.currentTarget.style.background = isDark ? 'rgba(255, 255, 255, 0.03)' : 'rgba(0, 0, 0, 0.03)';
                      e.currentTarget.style.borderColor = isDark ? 'rgba(255, 255, 255, 0.06)' : 'rgba(0, 0, 0, 0.06)';
                    }}
                  >
                    <span style={{ color: model.color }}>●</span>
                    <span>{model.name}</span>
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Slide-Down Chevron Trigger */}
          <div style={{ textAlign: 'center', marginTop: '10px' }}>
            <button
              type="button"
              onClick={scrollToWidgetDeck}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '6px',
                background: 'transparent',
                border: 'none',
                color: isDark ? '#71717a' : '#8c827a',
                fontSize: '10.5px',
                fontWeight: '700',
                textTransform: 'uppercase',
                letterSpacing: '0.2em',
                cursor: 'pointer',
                padding: '4px 10px',
              }}
            >
              <span>Scroll for Widgets</span>
              <IconChevronDown />
            </button>
          </div>
        </div>
      </section>

      {/* ─────────────────────────────────────────────────────────────
          TIER 2: MODULAR BENTO WIDGET DECK (GNTD ORIENTATION)
          ───────────────────────────────────────────────────────────── */}
      <section
        ref={widgetDeckRef}
        style={{
          minHeight: '100%',
          padding: '48px 60px',
          boxSizing: 'border-box',
          background: isDark ? '#0e0e13' : '#F4F0E8',
          borderTop: isDark ? '1px solid rgba(255, 255, 255, 0.06)' : '1px solid rgba(0, 0, 0, 0.06)',
        }}
      >
        <div style={{ maxWidth: '1120px', margin: '0 auto' }}>
          {/* Tier 2 Header */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '28px' }}>
            <div>
              <div style={{ fontSize: '10px', fontWeight: '800', textTransform: 'uppercase', letterSpacing: '0.28em', color: isDark ? '#d4af37' : '#C86D51', marginBottom: '4px' }}>
                Productivity Canvas
              </div>
              <h2 style={{ fontFamily: 'Playfair Display, Georgia, serif', fontSize: '28px', fontWeight: '700', margin: 0, color: isDark ? '#f9f6f0' : '#1a1715' }}>
                Bento Widget Deck
              </h2>
            </div>

            <button
              type="button"
              onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}
              style={{
                background: isDark ? 'rgba(255, 255, 255, 0.04)' : 'rgba(0, 0, 0, 0.04)',
                border: isDark ? '1px solid rgba(255, 255, 255, 0.08)' : '1px solid rgba(0, 0, 0, 0.08)',
                borderRadius: '10px',
                padding: '6px 14px',
                color: isDark ? '#a1a1aa' : '#5c524c',
                fontSize: '11.5px',
                fontWeight: '600',
                cursor: 'pointer',
              }}
            >
              Back to Search ↑
            </button>
          </div>

          {/* Bento Grid Suite */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(12, 1fr)', gap: '16px' }}>
            {/* 1. Favorites 3x3 Hub (4 columns) */}
            <div
              style={{
                gridColumn: 'span 4',
                background: isDark ? 'rgba(18, 18, 24, 0.7)' : '#ffffff',
                border: isDark ? '1px solid rgba(255, 255, 255, 0.08)' : '1px solid rgba(0, 0, 0, 0.08)',
                borderRadius: '20px',
                padding: '20px',
                boxShadow: isDark ? '0 12px 30px rgba(0, 0, 0, 0.4)' : '0 8px 24px rgba(0, 0, 0, 0.04)',
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '14px' }}>
                <span style={{ fontSize: '11px', fontWeight: '800', textTransform: 'uppercase', letterSpacing: '0.2em', color: isDark ? '#71717a' : '#8c827a' }}>
                  Favorites
                </span>
                <button
                  type="button"
                  onClick={handleAddFavorite}
                  style={{ background: 'none', border: 'none', color: isDark ? '#d4af37' : '#C86D51', cursor: 'pointer', display: 'flex', padding: 0 }}
                  title="Add Favorite Shortcut"
                >
                  <IconPlus />
                </button>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '10px' }}>
                {favorites.map((fav, i) => (
                  <button
                    key={i}
                    type="button"
                    onClick={() => onNavigate(fav.url)}
                    style={{
                      display: 'flex',
                      flexDirection: 'column',
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: '6px',
                      background: isDark ? 'rgba(255, 255, 255, 0.02)' : 'rgba(0, 0, 0, 0.02)',
                      border: isDark ? '1px solid rgba(255, 255, 255, 0.05)' : '1px solid rgba(0, 0, 0, 0.05)',
                      borderRadius: '14px',
                      padding: '12px 6px',
                      cursor: 'pointer',
                      transition: 'all 0.15s ease',
                    }}
                  >
                    <div
                      style={{
                        width: '28px',
                        height: '28px',
                        borderRadius: '8px',
                        background: isDark ? 'rgba(212, 175, 55, 0.15)' : 'rgba(200, 109, 81, 0.15)',
                        color: isDark ? '#d4af37' : '#C86D51',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        fontSize: '12px',
                        fontWeight: '800',
                      }}
                    >
                      {fav.name.charAt(0)}
                    </div>
                    <span style={{ fontSize: '10.5px', fontWeight: '600', color: isDark ? '#d4d4d8' : '#3f3f46', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '65px' }}>
                      {fav.name}
                    </span>
                  </button>
                ))}
              </div>
            </div>

            {/* 2. Date Bento Tile (2 columns) */}
            <div
              style={{
                gridColumn: 'span 2',
                background: isDark ? 'rgba(18, 18, 24, 0.7)' : '#ffffff',
                border: isDark ? '1px solid rgba(255, 255, 255, 0.08)' : '1px solid rgba(0, 0, 0, 0.08)',
                borderRadius: '20px',
                padding: '20px',
                display: 'flex',
                flexDirection: 'column',
                justifyContent: 'center',
                boxShadow: isDark ? '0 12px 30px rgba(0, 0, 0, 0.4)' : '0 8px 24px rgba(0, 0, 0, 0.04)',
              }}
            >
              <div style={{ fontSize: '11px', fontWeight: '800', textTransform: 'uppercase', letterSpacing: '0.2em', color: isDark ? '#71717a' : '#8c827a', marginBottom: '8px' }}>
                {dayUpper}
              </div>
              <div style={{ fontFamily: 'Playfair Display, serif', fontSize: '32px', fontWeight: '700', color: isDark ? '#f9f6f0' : '#1a1715', lineHeight: '1.1' }}>
                {dateUpper}
              </div>
            </div>

            {/* 3. Digital Clock Seconds Tile (2 columns) */}
            <div
              style={{
                gridColumn: 'span 2',
                background: isDark ? 'rgba(18, 18, 24, 0.7)' : '#ffffff',
                border: isDark ? '1px solid rgba(255, 255, 255, 0.08)' : '1px solid rgba(0, 0, 0, 0.08)',
                borderRadius: '20px',
                padding: '20px',
                display: 'flex',
                flexDirection: 'column',
                justifyContent: 'center',
                boxShadow: isDark ? '0 12px 30px rgba(0, 0, 0, 0.4)' : '0 8px 24px rgba(0, 0, 0, 0.04)',
              }}
            >
              <div style={{ fontSize: '11px', fontWeight: '800', textTransform: 'uppercase', letterSpacing: '0.2em', color: isDark ? '#d4af37' : '#C86D51', marginBottom: '8px' }}>
                LIVE SECONDS
              </div>
              <div style={{ fontFamily: 'monospace', fontSize: '24px', fontWeight: '700', color: isDark ? '#ffffff' : '#1a1715' }}>
                {secondsTimeStr}
              </div>
            </div>

            {/* 4. To-Do / Task Matrix (4 columns) */}
            <div
              style={{
                gridColumn: 'span 4',
                background: isDark ? 'rgba(18, 18, 24, 0.7)' : '#ffffff',
                border: isDark ? '1px solid rgba(255, 255, 255, 0.08)' : '1px solid rgba(0, 0, 0, 0.08)',
                borderRadius: '20px',
                padding: '20px',
                display: 'flex',
                flexDirection: 'column',
                boxShadow: isDark ? '0 12px 30px rgba(0, 0, 0, 0.4)' : '0 8px 24px rgba(0, 0, 0, 0.04)',
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
                <span style={{ fontSize: '11px', fontWeight: '800', textTransform: 'uppercase', letterSpacing: '0.2em', color: isDark ? '#71717a' : '#8c827a' }}>
                  To-Do Tasks
                </span>
                <div style={{ display: 'flex', gap: '4px' }}>
                  {(['all', 'inbox'] as const).map(f => (
                    <button
                      key={f}
                      type="button"
                      onClick={() => setTaskFilter(f)}
                      style={{
                        background: taskFilter === f ? (isDark ? 'rgba(212, 175, 55, 0.2)' : 'rgba(200, 109, 81, 0.2)') : 'transparent',
                        border: 'none',
                        borderRadius: '9999px',
                        padding: '2px 8px',
                        color: taskFilter === f ? (isDark ? '#f2ca50' : '#C86D51') : (isDark ? '#71717a' : '#8c827a'),
                        fontSize: '10px',
                        fontWeight: '700',
                        textTransform: 'uppercase',
                        cursor: 'pointer',
                      }}
                    >
                      {f} ({tasks.length})
                    </button>
                  ))}
                </div>
              </div>

              {/* Task Form */}
              <form onSubmit={handleAddTask} style={{ display: 'flex', gap: '6px', marginBottom: '10px' }}>
                <input
                  type="text"
                  placeholder="Add a new task..."
                  value={newTaskText}
                  onChange={e => setNewTaskText(e.target.value)}
                  style={{
                    flex: 1,
                    background: isDark ? 'rgba(255, 255, 255, 0.03)' : 'rgba(0, 0, 0, 0.03)',
                    border: isDark ? '1px solid rgba(255, 255, 255, 0.08)' : '1px solid rgba(0, 0, 0, 0.08)',
                    borderRadius: '8px',
                    padding: '6px 10px',
                    color: isDark ? '#fff' : '#000',
                    fontSize: '11.5px',
                    outline: 'none',
                  }}
                />
                <button
                  type="submit"
                  style={{
                    background: isDark ? 'rgba(212, 175, 55, 0.2)' : '#1a1715',
                    border: 'none',
                    borderRadius: '8px',
                    padding: '0 10px',
                    color: isDark ? '#f2ca50' : '#ffffff',
                    cursor: 'pointer',
                  }}
                >
                  <IconPlus />
                </button>
              </form>

              {/* Tasks List */}
              <div style={{ flex: 1, maxHeight: '120px', overflowY: 'auto' }} className="no-scrollbar">
                {tasks.length === 0 ? (
                  <div style={{ color: isDark ? '#52525b' : '#a1a1aa', fontSize: '11px', textAlign: 'center', padding: '16px 0' }}>
                    No pending tasks.
                  </div>
                ) : (
                  tasks.map(t => (
                    <div
                      key={t.id}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        padding: '4px 0',
                        fontSize: '11.5px',
                        borderBottom: isDark ? '1px solid rgba(255, 255, 255, 0.03)' : '1px solid rgba(0, 0, 0, 0.03)',
                      }}
                    >
                      <div
                        onClick={() => toggleTask(t.id)}
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: '8px',
                          cursor: 'pointer',
                          textDecoration: t.completed ? 'line-through' : 'none',
                          color: t.completed ? (isDark ? '#52525b' : '#a1a1aa') : (isDark ? '#e4e4e7' : '#27272a'),
                        }}
                      >
                        <span
                          style={{
                            width: '14px',
                            height: '14px',
                            borderRadius: '4px',
                            border: isDark ? '1px solid rgba(255, 255, 255, 0.2)' : '1px solid rgba(0, 0, 0, 0.2)',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            background: t.completed ? '#10b981' : 'transparent',
                            color: '#fff',
                          }}
                        >
                          {t.completed && <IconCheck />}
                        </span>
                        <span>{t.text}</span>
                      </div>

                      <button
                        type="button"
                        onClick={() => deleteTask(t.id)}
                        style={{ background: 'none', border: 'none', color: isDark ? '#52525b' : '#a1a1aa', cursor: 'pointer', padding: 0 }}
                      >
                        <IconTrash />
                      </button>
                    </div>
                  ))
                )}
              </div>
            </div>

            {/* 5. Live Geolocation Weather Widget (6 columns) */}
            <div
              style={{
                gridColumn: 'span 6',
                background: isDark ? 'rgba(18, 18, 24, 0.7)' : '#ffffff',
                border: isDark ? '1px solid rgba(255, 255, 255, 0.08)' : '1px solid rgba(0, 0, 0, 0.08)',
                borderRadius: '20px',
                padding: '24px',
                boxShadow: isDark ? '0 12px 30px rgba(0, 0, 0, 0.4)' : '0 8px 24px rgba(0, 0, 0, 0.04)',
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '16px' }}>
                <div>
                  <div style={{ fontSize: '10px', fontWeight: '800', textTransform: 'uppercase', letterSpacing: '0.2em', color: isDark ? '#71717a' : '#8c827a' }}>
                    Weather & Atmospheric Metrics
                  </div>
                  {weatherLoading ? (
                    <div style={{ fontFamily: 'Playfair Display, serif', fontSize: '24px', fontWeight: '700', color: isDark ? '#f9f6f0' : '#1a1715', marginTop: '2px' }}>
                      Loading weather...
                    </div>
                  ) : weather ? (
                    <div style={{ fontFamily: 'Playfair Display, serif', fontSize: '24px', fontWeight: '700', color: isDark ? '#f9f6f0' : '#1a1715', marginTop: '2px' }}>
                      {weatherLocation} &bull; {getWeatherLabel(weather.current.weather_code)}
                    </div>
                  ) : (
                    <div style={{ fontFamily: 'Playfair Display, serif', fontSize: '24px', fontWeight: '700', color: isDark ? '#f9f6f0' : '#1a1715', marginTop: '2px' }}>
                      Weather unavailable
                    </div>
                  )}
                </div>

                <div style={{ textAlign: 'right' }}>
                  <span style={{ fontSize: '32px', fontWeight: '700', color: isDark ? '#f2ca50' : '#C86D51', fontFamily: 'Playfair Display, serif' }}>
                    {weather ? `${Math.round(weather.current.temperature_2m)}°C` : '--°C'}
                  </span>
                </div>
              </div>

              {/* Metrics Pills */}
              <div style={{ display: 'flex', gap: '12px', marginBottom: '16px' }}>
                <div style={{ flex: 1, background: isDark ? 'rgba(255, 255, 255, 0.03)' : 'rgba(0, 0, 0, 0.03)', padding: '8px 12px', borderRadius: '12px' }}>
                  <div style={{ fontSize: '10px', color: isDark ? '#71717a' : '#8c827a', fontWeight: '700' }}>HUMIDITY</div>
                  <div style={{ fontSize: '13px', fontWeight: '700', color: isDark ? '#ffffff' : '#1a1715' }}>{weather ? `${weather.current.relative_humidity_2m}%` : '--%'}</div>
                </div>
                <div style={{ flex: 1, background: isDark ? 'rgba(255, 255, 255, 0.03)' : 'rgba(0, 0, 0, 0.03)', padding: '8px 12px', borderRadius: '12px' }}>
                  <div style={{ fontSize: '10px', color: isDark ? '#71717a' : '#8c827a', fontWeight: '700' }}>FEELS LIKE</div>
                  <div style={{ fontSize: '13px', fontWeight: '700', color: isDark ? '#ffffff' : '#1a1715' }}>{weather ? `${Math.round(weather.current.apparent_temperature)}°C` : '--°C'}</div>
                </div>
                <div style={{ flex: 1, background: isDark ? 'rgba(255, 255, 255, 0.03)' : 'rgba(0, 0, 0, 0.03)', padding: '8px 12px', borderRadius: '12px' }}>
                  <div style={{ fontSize: '10px', color: isDark ? '#71717a' : '#8c827a', fontWeight: '700' }}>WIND SPEED</div>
                  <div style={{ fontSize: '13px', fontWeight: '700', color: isDark ? '#ffffff' : '#1a1715' }}>{weather ? `${Math.round(weather.current.wind_speed_10m)} km/h` : '-- km/h'}</div>
                </div>
              </div>

              {/* Forecast */}
              <div style={{ display: 'flex', gap: '12px' }}>
                {weather && weather.daily.weather_code.length >= 3 ? (
                  [1, 2].map(i => {
                    const d = new Date();
                    d.setDate(d.getDate() + i);
                    const dayName = DAY_NAMES[d.getDay()];
                    return (
                      <div key={i} style={{ flex: 1, borderTop: isDark ? '1px solid rgba(255, 255, 255, 0.06)' : '1px solid rgba(0, 0, 0, 0.06)', paddingTop: '10px', display: 'flex', justifyContent: 'space-between', fontSize: '12px' }}>
                        <span style={{ color: isDark ? '#a1a1aa' : '#5c524c' }}>{dayName}</span>
                        <span style={{ fontWeight: '700', color: isDark ? '#f2ca50' : '#C86D51' }}>{Math.round(weather.daily.temperature_2m_max[i])}°C &bull; {getWeatherLabel(weather.daily.weather_code[i])}</span>
                      </div>
                    );
                  })
                ) : (
                  <>
                    <div style={{ flex: 1, borderTop: isDark ? '1px solid rgba(255, 255, 255, 0.06)' : '1px solid rgba(0, 0, 0, 0.06)', paddingTop: '10px', display: 'flex', justifyContent: 'space-between', fontSize: '12px' }}>
                      <span style={{ color: isDark ? '#a1a1aa' : '#5c524c' }}>Tomorrow</span>
                      <span style={{ fontWeight: '700', color: isDark ? '#f2ca50' : '#C86D51' }}>--°C</span>
                    </div>
                    <div style={{ flex: 1, borderTop: isDark ? '1px solid rgba(255, 255, 255, 0.06)' : '1px solid rgba(0, 0, 0, 0.06)', paddingTop: '10px', display: 'flex', justifyContent: 'space-between', fontSize: '12px' }}>
                      <span style={{ color: isDark ? '#a1a1aa' : '#5c524c' }}>Day After</span>
                      <span style={{ fontWeight: '700', color: isDark ? '#f2ca50' : '#C86D51' }}>--°C</span>
                    </div>
                  </>
                )}
              </div>
            </div>

            {/* 6. Notes Scratchpad Widget (6 columns) */}
            <div
              style={{
                gridColumn: 'span 6',
                background: isDark ? 'rgba(18, 18, 24, 0.7)' : '#ffffff',
                border: isDark ? '1px solid rgba(255, 255, 255, 0.08)' : '1px solid rgba(0, 0, 0, 0.08)',
                borderRadius: '20px',
                padding: '24px',
                display: 'flex',
                flexDirection: 'column',
                boxShadow: isDark ? '0 12px 30px rgba(0, 0, 0, 0.4)' : '0 8px 24px rgba(0, 0, 0, 0.04)',
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
                <span style={{ fontSize: '10px', fontWeight: '800', textTransform: 'uppercase', letterSpacing: '0.2em', color: isDark ? '#71717a' : '#8c827a' }}>
                  Scratchpad & Notes (Auto-saved)
                </span>
                <span style={{ fontSize: '10px', color: '#10b981', fontWeight: '700' }}>
                  Synced Locally
                </span>
              </div>

              <textarea
                value={notes}
                onChange={e => handleNotesChange(e.target.value)}
                placeholder="Jot down quick ideas, commands, meeting notes, or links..."
                style={{
                  flex: 1,
                  minHeight: '140px',
                  background: isDark ? 'rgba(255, 255, 255, 0.02)' : 'rgba(0, 0, 0, 0.02)',
                  border: isDark ? '1px solid rgba(255, 255, 255, 0.06)' : '1px solid rgba(0, 0, 0, 0.06)',
                  borderRadius: '12px',
                  padding: '12px',
                  color: isDark ? '#f9f6f0' : '#1a1715',
                  fontSize: '12.5px',
                  lineHeight: '1.6',
                  outline: 'none',
                  resize: 'none',
                  fontFamily: 'inherit',
                }}
              />
            </div>
          </div>

          {/* Footer Brand & Founder Insignia */}
          <footer
            style={{
              marginTop: '40px',
              paddingTop: '20px',
              borderTop: isDark ? '1px solid rgba(255, 255, 255, 0.06)' : '1px solid rgba(0, 0, 0, 0.06)',
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              fontSize: '11px',
              color: isDark ? '#71717a' : '#8c827a',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <BrandLogo size={18} variant={isDark ? 'gold' : 'terracotta'} />
              <span>
                <strong>ICRUSH BROWSER</strong> • Built under <strong>NIGHTMARE PROJECTS</strong>
              </span>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
              <span
                style={{
                  padding: '3px 8px',
                  borderRadius: '9999px',
                  background: isDark ? 'rgba(212, 175, 55, 0.12)' : 'rgba(200, 109, 81, 0.12)',
                  color: isDark ? '#f2ca50' : '#C86D51',
                  fontWeight: '700',
                  letterSpacing: '0.04em',
                }}
              >
                Founder: Nightmare
              </span>
              <button
                type="button"
                onClick={() => onOpenSettings('about')}
                style={{
                  background: 'none',
                  border: 'none',
                  color: 'inherit',
                  cursor: 'pointer',
                  fontSize: '11px',
                  fontWeight: '600',
                }}
              >
                System Architecture
              </button>
            </div>
          </footer>
        </div>
      </section>
    </div>
  );
}
