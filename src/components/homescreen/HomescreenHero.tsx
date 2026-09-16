import { useState, useEffect } from 'react';

interface WeatherData {
  temperature: number;
  weatherCode: number;
  windSpeed: number;
  timestamp: number;
}

const CACHE_KEY = 'homescreen_weather_cache';
const CACHE_DURATION = 30 * 60 * 1000;

const DEFAULT_LATITUDE = 28.6139;
const DEFAULT_LONGITUDE = 77.2090;

const getWeatherDescription = (code: number): string => {
  if (code === 0) return 'Clear';
  if (code >= 1 && code <= 3) return 'Partly Cloudy';
  if (code >= 45 && code <= 48) return 'Fog';
  if (code >= 51 && code <= 55) return 'Drizzle';
  if (code >= 61 && code <= 65) return 'Rain';
  if (code >= 71 && code <= 77) return 'Snow';
  if (code >= 80 && code <= 82) return 'Rain Showers';
  if (code >= 95 && code <= 99) return 'Thunderstorm';
  return 'Unknown';
};

const getWeatherIcon = (code: number): string => {
  if (code >= 45 && code <= 48) {
    return `<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#94a3b8" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 10h-1.26A8 8 0 1 0 9 20h9a5 5 0 0 0 0-10z"/></svg>`;
  }
  if (code >= 61 && code <= 65 || code >= 80 && code <= 82) {
    return `<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#60a5fa" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 10h-1.26A8 8 0 1 0 9 20h9a5 5 0 0 0 0-10z"/><line x1="8" y1="22" x2="8" y2="24"/><line x1="12" y1="22" x2="12" y2="24"/><line x1="16" y1="22" x2="16" y2="24"/></svg>`;
  }
  if (code >= 95 && code <= 99) {
    return `<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#f59e0b" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 10h-1.26A8 8 0 1 0 9 20h9a5 5 0 0 0 0-10z"/><polyline points="16 16 12 12 8 16"/></svg>`;
  }
  if (code >= 71 && code <= 77) {
    return `<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#e2e8f0" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 10h-1.26A8 8 0 1 0 9 20h9a5 5 0 0 0 0-10z"/><line x1="8" y1="19" x2="8" y2="21"/><line x1="12" y1="19" x2="12" y2="21"/><line x1="16" y1="19" x2="16" y2="21"/></svg>`;
  }
  if (code <= 3) {
    return `<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#fbbf24" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="5"/><line x1="12" y1="1" x2="12" y2="3"/><line x1="12" y1="21" x2="12" y2="23"/><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/><line x1="1" y1="12" x2="3" y2="12"/><line x1="21" y1="12" x2="23" y2="12"/><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/></svg>`;
  }
  return `<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#fbbf24" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="5"/><line x1="12" y1="1" x2="12" y2="3"/><line x1="12" y1="21" x2="12" y2="23"/><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/><line x1="1" y1="12" x2="3" y2="12"/><line x1="21" y1="12" x2="23" y2="12"/><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/></svg>`;
};

const getGreeting = (): string => {
  const hour = new Date().getHours();
  if (hour < 12) return 'Good Morning';
  if (hour < 17) return 'Good Afternoon';
  return 'Good Evening';
};

const getUserName = (): string => {
  const stored = localStorage.getItem('icrush_username');
  if (stored) return stored;
  const fallback = 'Guest';
  localStorage.setItem('icrush_username', fallback);
  return fallback;
};

const formatDate = (): string => {
  const now = new Date();
  return now.toLocaleDateString('en-US', {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
  });
};

const formatTime = (): string => {
  const now = new Date();
  const hours = now.getHours().toString().padStart(2, '0');
  const minutes = now.getMinutes().toString().padStart(2, '0');
  const seconds = now.getSeconds().toString().padStart(2, '0');
  return `${hours}:${minutes}:${seconds}`;
};

const fetchWeather = async (latitude: number, longitude: number): Promise<WeatherData | null> => {
  try {
    const url = `https://api.open-meteo.com/v1/forecast?latitude=${latitude}&longitude=${longitude}&current=temperature_2m,weather_code,wind_speed_10m&timezone=Asia/Kolkata`;
    const response = await fetch(url);
    if (!response.ok) return null;
    const data = await response.json();
    if (!data.current) return null;
    return {
      temperature: Math.round(data.current.temperature_2m),
      weatherCode: data.current.weather_code,
      windSpeed: Math.round(data.current.wind_speed_10m),
      timestamp: Date.now(),
    };
  } catch {
    return null;
  }
};

const getCachedWeather = (): WeatherData | null => {
  try {
    const cached = localStorage.getItem(CACHE_KEY);
    if (!cached) return null;
    const data: WeatherData = JSON.parse(cached);
    if (Date.now() - data.timestamp > CACHE_DURATION) return null;
    return data;
  } catch {
    return null;
  }
};

const saveWeatherCache = (data: WeatherData): void => {
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify(data));
  } catch {}
};

export function HomescreenHero() {
  const [time, setTime] = useState(formatTime());
  const [weather, setWeather] = useState<WeatherData | null>(null);

  useEffect(() => {
    const interval = setInterval(() => {
      setTime(formatTime());
    }, 1000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    const loadWeather = async () => {
      const cached = getCachedWeather();
      if (cached) {
        setWeather(cached);
        return;
      }

      let latitude = DEFAULT_LATITUDE;
      let longitude = DEFAULT_LONGITUDE;

      try {
        const pos = await new Promise<GeolocationPosition>((resolve, reject) => {
          navigator.geolocation.getCurrentPosition(resolve, reject, {
            timeout: 5000,
            maximumAge: 600000,
          });
        });
        latitude = pos.coords.latitude;
        longitude = pos.coords.longitude;
      } catch {}

      const data = await fetchWeather(latitude, longitude);
      if (data) {
        setWeather(data);
        saveWeatherCache(data);
      }
    };

    loadWeather();
  }, []);

  const greeting = getGreeting();
  const userName = getUserName();
  const dateStr = formatDate();

  return (
    <div className="homescreen-hero">
      <div className="hero-greeting">{`${greeting}, ${userName}`}</div>
      <div className="hero-clock">{time}</div>
      <div className="hero-date">{dateStr}</div>
      {weather && (
        <div className="hero-weather">
          <span dangerouslySetInnerHTML={{ __html: getWeatherIcon(weather.weatherCode) }} />
          <span>{`${weather.temperature}°C`}</span>
          <span>{getWeatherDescription(weather.weatherCode)}</span>
          <span>{`${weather.windSpeed} km/h`}</span>
        </div>
      )}
    </div>
  );
}
