import { useState, useEffect, useCallback } from "react";

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

interface ForecastDay {
  code: number;
  max: number;
  min: number;
  label: string;
}

const CACHE_KEY = "homescreen-weather-cache";
const CACHE_TTL = 30 * 60 * 1000;

const WEATHER_LABELS: Record<number, string> = {
  0: "Clear Sky",
  1: "Mainly Clear",
  2: "Partly Cloudy",
  3: "Overcast",
  45: "Fog",
  48: "Rime Fog",
  51: "Light Drizzle",
  53: "Moderate Drizzle",
  55: "Dense Drizzle",
  61: "Slight Rain",
  63: "Moderate Rain",
  65: "Heavy Rain",
  71: "Slight Snow",
  73: "Moderate Snow",
  75: "Heavy Snow",
  80: "Slight Showers",
  81: "Moderate Showers",
  82: "Violent Showers",
  95: "Thunderstorm",
  96: "Thunderstorm w/ Hail",
  99: "Thunderstorm w/ Heavy Hail",
};

function getLabel(code: number): string {
  return WEATHER_LABELS[code] ?? "Unknown";
}

function SunIcon(): JSX.Element {
  return (
    <svg width="32" height="32" viewBox="0 0 32 32" fill="none">
      <circle cx="16" cy="16" r="7" fill="#facc15" />
      {[0, 45, 90, 135, 180, 225, 270, 315].map((deg) => (
        <line
          key={deg}
          x1="16"
          y1="2"
          x2="16"
          y2="5"
          stroke="#facc15"
          strokeWidth="2"
          strokeLinecap="round"
          transform={`rotate(${deg} 16 16)`}
        />
      ))}
    </svg>
  );
}

function CloudIcon(): JSX.Element {
  return (
    <svg width="32" height="32" viewBox="0 0 32 32" fill="none">
      <path
        d="M8 24h18a6 6 0 0 0 0-12 6 6 0 0 0-5.8 4.3A5 5 0 0 0 16 14a5 5 0 0 0-5 5H8a4 4 0 0 0 0 5z"
        fill="#94a3b8"
      />
    </svg>
  );
}

function RainIcon(): JSX.Element {
  return (
    <svg width="32" height="32" viewBox="0 0 32 32" fill="none">
      <path
        d="M6 20h20a5 5 0 0 0 0-10 5 5 0 0 0-4.8 3.6A4.5 4.5 0 0 0 16 11a4.5 4.5 0 0 0-4.4 3.6A4 4 0 0 0 8 13.5 4 4 0 0 0 6 20z"
        fill="#60a5fa"
      />
      <line x1="11" y1="22" x2="9" y2="28" stroke="#60a5fa" strokeWidth="1.5" strokeLinecap="round" />
      <line x1="17" y1="22" x2="15" y2="28" stroke="#60a5fa" strokeWidth="1.5" strokeLinecap="round" />
      <line x1="23" y1="22" x2="21" y2="28" stroke="#60a5fa" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  );
}

function SnowIcon(): JSX.Element {
  return (
    <svg width="32" height="32" viewBox="0 0 32 32" fill="none">
      <path
        d="M6 20h20a5 5 0 0 0 0-10 5 5 0 0 0-4.8 3.6A4.5 4.5 0 0 0 16 11a4.5 4.5 0 0 0-4.4 3.6A4 4 0 0 0 8 13.5 4 4 0 0 0 6 20z"
        fill="#cbd5e1"
      />
      <circle cx="11" cy="24" r="1.5" fill="#e2e8f0" />
      <circle cx="17" cy="23" r="1.5" fill="#e2e8f0" />
      <circle cx="23" cy="24" r="1.5" fill="#e2e8f0" />
      <circle cx="14" cy="27" r="1.5" fill="#e2e8f0" />
      <circle cx="20" cy="27" r="1.5" fill="#e2e8f0" />
    </svg>
  );
}

function ThunderIcon(): JSX.Element {
  return (
    <svg width="32" height="32" viewBox="0 0 32 32" fill="none">
      <path
        d="M6 19h20a5 5 0 0 0 0-10 5 5 0 0 0-4.8 3.6A4.5 4.5 0 0 0 16 10a4.5 4.5 0 0 0-4.4 3.6A4 4 0 0 0 8 12.5 4 4 0 0 0 6 19z"
        fill="#a78bfa"
      />
      <path d="M18 18l-3 5h4l-3 5" stroke="#facc15" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function FogIcon(): JSX.Element {
  return (
    <svg width="32" height="32" viewBox="0 0 32 32" fill="none">
      <line x1="6" y1="14" x2="26" y2="14" stroke="#94a3b8" strokeWidth="2" strokeLinecap="round" />
      <line x1="8" y1="19" x2="24" y2="19" stroke="#94a3b8" strokeWidth="2" strokeLinecap="round" />
      <line x1="6" y1="24" x2="26" y2="24" stroke="#94a3b8" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}

function WeatherIcon({ code }: { code: number }): JSX.Element {
  if (code === 0 || code === 1) return <SunIcon />;
  if (code === 2 || code === 3) return <CloudIcon />;
  if (code === 45 || code === 48) return <FogIcon />;
  if ([51, 53, 55, 61, 63, 65, 80, 81, 82].includes(code)) return <RainIcon />;
  if ([71, 73, 75].includes(code)) return <SnowIcon />;
  if (code >= 95) return <ThunderIcon />;
  return <CloudIcon />;
}

function MiniWeatherIcon({ code }: { code: number }): JSX.Element {
  if (code === 0 || code === 1) return <SunIcon />;
  if (code === 2 || code === 3) return <CloudIcon />;
  if (code === 45 || code === 48) return <FogIcon />;
  if ([51, 53, 55, 61, 63, 65, 80, 81, 82].includes(code)) return <RainIcon />;
  if ([71, 73, 75].includes(code)) return <SnowIcon />;
  if (code >= 95) return <ThunderIcon />;
  return <CloudIcon />;
}

const DAY_NAMES = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

export function HomescreenWeather(): JSX.Element {
  const [weather, setWeather] = useState<WeatherData | null>(null);
  const [location, setLocation] = useState<string>("Loading...");
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  const fetchWeather = useCallback(async (lat: number, lon: number) => {
    const cacheRaw = localStorage.getItem(CACHE_KEY);
    if (cacheRaw) {
      try {
        const cache: CachedWeather = JSON.parse(cacheRaw);
        if (Date.now() - cache.timestamp < CACHE_TTL) {
          setWeather(cache.data);
          setLoading(false);
          return;
        }
      } catch {
        localStorage.removeItem(CACHE_KEY);
      }
    }

    const url = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&current=temperature_2m,relative_humidity_2m,apparent_temperature,weather_code,wind_speed_10m&daily=weather_code,temperature_2m_max,temperature_2m_min&timezone=auto&forecast_days=4`;
    try {
      const res = await fetch(url);
      if (!res.ok) throw new Error(`API ${res.status}`);
      const data: WeatherData = await res.json();
      setWeather(data);
      localStorage.setItem(CACHE_KEY, JSON.stringify({ data, timestamp: Date.now() }));
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Failed to fetch");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const DELHI_LAT = 28.6139;
    const DELHI_LON = 77.209;

    async function resolveLocation() {
      if (!navigator.geolocation) {
        setLocation("New Delhi");
        fetchWeather(DELHI_LAT, DELHI_LON);
        return;
      }

      try {
        const pos = await new Promise<GeolocationPosition>((resolve, reject) => {
          navigator.geolocation.getCurrentPosition(resolve, reject, { timeout: 5000 });
        });
        const { latitude, longitude } = pos.coords;

        const cacheRaw = localStorage.getItem("homescreen-location-cache");
        if (cacheRaw) {
          try {
            const cached: { name: string; lat: number; lon: number } = JSON.parse(cacheRaw);
            if (Math.abs(cached.lat - latitude) < 0.01 && Math.abs(cached.lon - longitude) < 0.01) {
              setLocation(cached.name);
              fetchWeather(latitude, longitude);
              return;
            }
          } catch {
            // fall through to reverse geocode
          }
        }

        try {
          const geoRes = await fetch(
            `https://geocoding-api.open-meteo.com/v1/search?latitude=${latitude}&longitude=${longitude}&count=1`
          );
          const geoData = await geoRes.json();
          const name =
            geoData?.results?.[0]?.name ??
            `${latitude.toFixed(2)}, ${longitude.toFixed(2)}`;
          setLocation(name);
          localStorage.setItem(
            "homescreen-location-cache",
            JSON.stringify({ name, lat: latitude, lon: longitude })
          );
        } catch {
          setLocation(`${latitude.toFixed(2)}, ${longitude.toFixed(2)}`);
        }

        fetchWeather(latitude, longitude);
      } catch {
        setLocation("New Delhi");
        fetchWeather(DELHI_LAT, DELHI_LON);
      }
    }

    resolveLocation();
  }, [fetchWeather]);

  const computedForecast: ForecastDay[] = (() => {
    if (!weather) return [];
    const today = new Date();
    const days: ForecastDay[] = [];
    for (let i = 1; i <= 3 && i < weather.daily.weather_code.length; i++) {
      const d = new Date(today);
      d.setDate(d.getDate() + i);
      days.push({
        code: weather.daily.weather_code[i],
        max: weather.daily.temperature_2m_max[i],
        min: weather.daily.temperature_2m_min[i],
        label: DAY_NAMES[d.getDay()],
      });
    }
    return days;
  })();

  if (loading) {
    return (
      <div className="homescreen-weather" style={styles.container}>
        <div style={{ color: "#94a3b8", fontSize: 14 }}>Loading weather...</div>
      </div>
    );
  }

  if (error || !weather) {
    return (
      <div className="homescreen-weather" style={styles.container}>
        <div style={{ color: "#94a3b8", fontSize: 14 }}>Weather unavailable</div>
      </div>
    );
  }

  const { current } = weather;
  const condLabel = getLabel(current.weather_code);

  return (
    <div className="homescreen-weather" style={styles.container}>
      <div className="weather-current" style={styles.current}>
        <div className="weather-condition" style={styles.locationLine}>
          {location}
        </div>
        <div style={styles.mainRow}>
          <div className="weather-temp-large" style={styles.tempLarge}>
            {Math.round(current.temperature_2m)}&deg;
          </div>
          <WeatherIcon code={current.weather_code} />
        </div>
        <div className="weather-condition" style={styles.condLabel}>
          {condLabel}
        </div>
      </div>

      <div className="weather-details-row" style={styles.detailsRow}>
        <div className="weather-detail-item" style={styles.detailItem}>
          <span style={styles.detailLabel}>Feels like</span>
          <span style={styles.detailValue}>
            {Math.round(current.apparent_temperature)}&deg;
          </span>
        </div>
        <div className="weather-detail-item" style={styles.detailItem}>
          <span style={styles.detailLabel}>Wind</span>
          <span style={styles.detailValue}>
            {Math.round(current.wind_speed_10m)} km/h
          </span>
        </div>
        <div className="weather-detail-item" style={styles.detailItem}>
          <span style={styles.detailLabel}>Humidity</span>
          <span style={styles.detailValue}>
            {current.relative_humidity_2m}%
          </span>
        </div>
      </div>

      <div className="weather-forecast" style={styles.forecast}>
        {computedForecast.map((day) => (
          <div className="weather-forecast-day" key={day.label} style={styles.forecastDay}>
            <span style={styles.forecastLabel}>{day.label}</span>
            <MiniWeatherIcon code={day.code} />
            <span style={styles.forecastTemps}>
              {Math.round(day.max)}&deg; / {Math.round(day.min)}&deg;
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  container: {
    background: "rgba(15,15,18,0.55)",
    backdropFilter: "blur(20px)",
    WebkitBackdropFilter: "blur(20px)",
    border: "1px solid rgba(255,255,255,0.05)",
    borderRadius: 16,
    padding: 20,
    color: "#f4f0ea",
    fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
    minWidth: 260,
  },
  current: {
    marginBottom: 16,
  },
  locationLine: {
    fontSize: 13,
    color: "#94a3b8",
    marginBottom: 4,
    letterSpacing: 0.3,
  },
  mainRow: {
    display: "flex",
    alignItems: "center",
    gap: 12,
  },
  tempLarge: {
    fontSize: 48,
    fontWeight: 700,
    lineHeight: 1,
    color: "#f4f0ea",
  },
  condLabel: {
    fontSize: 14,
    color: "#d4af37",
    marginTop: 2,
  },
  detailsRow: {
    display: "flex",
    gap: 16,
    marginBottom: 16,
  },
  detailItem: {
    display: "flex",
    flexDirection: "column",
    gap: 2,
  },
  detailLabel: {
    fontSize: 11,
    color: "#94a3b8",
    textTransform: "uppercase" as const,
    letterSpacing: 0.5,
  },
  detailValue: {
    fontSize: 14,
    fontWeight: 600,
    color: "#f4f0ea",
  },
  forecast: {
    display: "flex",
    gap: 12,
    borderTop: "1px solid rgba(255,255,255,0.06)",
    paddingTop: 14,
  },
  forecastDay: {
    flex: 1,
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    gap: 4,
    padding: "8px 4px",
    borderRadius: 10,
    background: "rgba(255,255,255,0.03)",
  },
  forecastLabel: {
    fontSize: 11,
    color: "#94a3b8",
    fontWeight: 500,
    textTransform: "uppercase" as const,
  },
  forecastTemps: {
    fontSize: 12,
    color: "#f4f0ea",
    fontWeight: 500,
  },
};
