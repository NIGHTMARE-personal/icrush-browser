import { useState, useEffect, useRef, useCallback } from 'react';

interface PomodoroState {
  mode: 'work' | 'shortBreak' | 'longBreak';
  timeLeft: number;
  isRunning: boolean;
  sessionCount: number;
}

const getDuration = (key: string, fallback: number) => {
  try {
    const val = parseInt(localStorage.getItem(key) || '', 10);
    return !isNaN(val) && val > 0 ? val * 60 : fallback;
  } catch { return fallback; }
};

const MODES = () => ({
  work: { duration: getDuration('chronos_focus_duration', 25 * 60), label: 'Work', color: '#d4af37' },
  shortBreak: { duration: getDuration('chronos_short_break', 5 * 60), label: 'Short Break', color: '#10b981' },
  longBreak: { duration: getDuration('chronos_long_break', 15 * 60), label: 'Long Break', color: '#6366f1' },
}) as const;

const SESSIONS_BEFORE_LONG_BREAK = 4;
const CIRCUMFERENCE = 2 * Math.PI * 54;
const STORAGE_KEY = 'homescreen-pomodoro';

const getInitialState = (): PomodoroState => {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) {
      const parsed = JSON.parse(saved);
      return {
        mode: parsed.mode || 'work',
        timeLeft: parsed.timeLeft ?? MODES().work.duration,
        isRunning: false,
        sessionCount: parsed.sessionCount || 1,
      };
    }
  } catch {}
  return {
    mode: 'work',
    timeLeft: MODES().work.duration,
    isRunning: false,
    sessionCount: 1,
  };
};

export const HomescreenPomodoro = () => {
  const [state, setState] = useState<PomodoroState>(getInitialState);
  const intervalRef = useRef<number | null>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const modes = MODES();

  const playBeep = useCallback(() => {
    try {
      if (!audioCtxRef.current) {
        audioCtxRef.current = new AudioContext();
      }
      const ctx = audioCtxRef.current;
      const oscillator = ctx.createOscillator();
      const gainNode = ctx.createGain();
      oscillator.connect(gainNode);
      gainNode.connect(ctx.destination);
      oscillator.type = 'sine';
      oscillator.frequency.setValueAtTime(800, ctx.currentTime);
      oscillator.frequency.setValueAtTime(600, ctx.currentTime + 0.1);
      oscillator.frequency.setValueAtTime(800, ctx.currentTime + 0.2);
      gainNode.gain.setValueAtTime(0.3, ctx.currentTime);
      gainNode.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.4);
      oscillator.start(ctx.currentTime);
      oscillator.stop(ctx.currentTime + 0.4);
    } catch {}
  }, []);

  const switchMode = useCallback(
    (currentMode: PomodoroState['mode'], sessionCount: number) => {
      let nextMode: PomodoroState['mode'];
      if (currentMode === 'work') {
        nextMode =
          sessionCount % SESSIONS_BEFORE_LONG_BREAK === 0
            ? 'longBreak'
            : 'shortBreak';
      } else {
        nextMode = 'work';
      }
      return {
        mode: nextMode,
        timeLeft: modes[nextMode].duration,
        isRunning: currentMode === 'work',
        sessionCount: nextMode === 'work' ? sessionCount + 1 : sessionCount,
      };
    },
    [],
  );

  useEffect(() => {
    try {
      localStorage.setItem(
        STORAGE_KEY,
        JSON.stringify({
          mode: state.mode,
          timeLeft: state.timeLeft,
          sessionCount: state.sessionCount,
        }),
      );
    } catch {}
  }, [state.mode, state.timeLeft, state.sessionCount]);

  useEffect(() => {
    if (state.isRunning && state.timeLeft > 0) {
      intervalRef.current = window.setInterval(() => {
        setState((prev) => {
          if (prev.timeLeft <= 1) {
            playBeep();
            return switchMode(prev.mode, prev.sessionCount);
          }
          return { ...prev, timeLeft: prev.timeLeft - 1 };
        });
      }, 1000);
    }
    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    };
  }, [state.isRunning, state.timeLeft, playBeep, switchMode]);

  const handleToggle = () => {
    setState((prev) => ({ ...prev, isRunning: !prev.isRunning }));
  };

  const handleReset = () => {
    setState((prev) => ({
      ...prev,
      timeLeft: modes[prev.mode].duration,
      isRunning: false,
    }));
  };

  const handleModeChange = (mode: PomodoroState['mode']) => {
    setState({
      mode,
      timeLeft: modes[mode].duration,
      isRunning: false,
      sessionCount: mode === 'work' ? state.sessionCount : state.sessionCount,
    });
  };

  const progress = state.timeLeft / modes[state.mode].duration;
  const strokeDashoffset = CIRCUMFERENCE * (1 - progress);
  const minutes = Math.floor(state.timeLeft / 60);
  const seconds = state.timeLeft % 60;
  const timeString = `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
  const color = modes[state.mode].color;

  return (
    <div className="homescreen-pomodoro">
      <div className="pomodoro-modes">
        {(Object.keys(modes) as Array<PomodoroState['mode']>).map((mode) => (
          <button
            key={mode}
            className={`pomodoro-mode-btn${state.mode === mode ? ' active' : ''}`}
            onClick={() => handleModeChange(mode)}
            style={
              state.mode === mode
                ? { borderColor: color }
                : undefined
            }
          >
            {modes[mode].label}
          </button>
        ))}
      </div>

      <div className="pomodoro-circle">
        <svg className="pomodoro-svg" width="128" height="128" viewBox="0 0 128 128">
          <circle
            cx="64"
            cy="64"
            r="54"
            stroke="rgba(255,255,255,0.08)"
            strokeWidth="4"
            fill="none"
          />
          <circle
            cx="64"
            cy="64"
            r="54"
            stroke={color}
            strokeWidth="4"
            fill="none"
            strokeLinecap="round"
            strokeDasharray={CIRCUMFERENCE}
            strokeDashoffset={strokeDashoffset}
            transform="rotate(-90 64 64)"
            style={{ transition: 'stroke-dashoffset 0.3s ease' }}
          />
        </svg>
        <div className="pomodoro-time">{timeString}</div>
      </div>

      <div className="pomodoro-controls">
        <button className="pomodoro-mode-btn" onClick={handleToggle}>
          {state.isRunning ? 'Pause' : 'Start'}
        </button>
        <button className="pomodoro-mode-btn" onClick={handleReset}>
          Reset
        </button>
      </div>

      <div className="pomodoro-session-count">
        Session {((state.sessionCount - 1) % SESSIONS_BEFORE_LONG_BREAK) + 1} of{' '}
        {SESSIONS_BEFORE_LONG_BREAK}
      </div>
    </div>
  );
};
