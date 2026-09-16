import React, { useState, useEffect, useRef } from 'react';

interface ChronosDashboardProps {
  onClose?: () => void;
  onNavigate?: (url: string) => void;
  onOpenSettings?: (tab?: string) => void;
  isDark?: boolean;
}

interface ProjectItem {
  id: string;
  name: string;
  color: string;
}

interface TaskItem {
  id: string;
  title: string;
  date: string;
  projectId: string;
  durationMinutes: number;
  completed: boolean;
}

interface SessionLog {
  id: string;
  projectId: string;
  durationMinutes: number;
  timestamp: number;
}

const DEFAULT_PROJECTS: ProjectItem[] = [
  { id: 'general', name: 'General', color: '#94a3b8' },
  { id: 'inbox', name: 'Inbox', color: '#f87171' },
  { id: 'dev', name: 'Engineering & Code', color: '#38bdf8' },
  { id: 'research', name: 'Deep Research', color: '#a78bfa' },
];

const DEFAULT_TASKS: TaskItem[] = [
  { id: '1', title: 'System Architecture Audit', date: '2026-08-22', projectId: 'dev', durationMinutes: 25, completed: false },
  { id: '2', title: 'Compile & Package Production Binaries', date: '2026-08-22', projectId: 'dev', durationMinutes: 15, completed: false },
  { id: '3', title: 'Review Research Papers on Neural Quantization', date: '2026-08-22', projectId: 'research', durationMinutes: 30, completed: false },
];

const HISTORICAL_DATABASE: Record<string, { holiday?: string; festival?: string; discovery?: string }> = {
  '8-22': {
    holiday: 'International Day Commemorating the Victims of Acts of Violence',
    festival: 'Late Summer Cultural & Innovation Sprints',
    discovery: '1851: The yacht America won the first America\'s Cup race around the Isle of Wight.',
  },
  '8-23': {
    holiday: 'International Day for the Remembrance of the Slave Trade and its Abolition',
    festival: 'Sun Enters Virgo Astrological Transit',
    discovery: '1966: Lunar Orbiter 1 took the first photograph of Earth from the orbit of the Moon.',
  },
  '8-24': {
    holiday: 'Vesuvius Memorial Day',
    festival: 'International Strange Music & Synthesis Day',
    discovery: '1995: Microsoft released Windows 95, revolutionizing desktop graphical user interfaces.',
  },
  '8-25': {
    holiday: 'National Park Service Founders Day',
    festival: 'Late Summer Astronomy Gala',
    discovery: '1609: Galileo Galilei demonstrated his first telescope to Venetian lawmakers and astronomers.',
  },
};

/* ─────────────────────────────────────────────────────────────
   Crisp Minimal SVG Icons (Zero Emojis)
   ───────────────────────────────────────────────────────────── */

const IconArrowLeft = () => (
  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
    <line x1="19" y1="12" x2="5" y2="12" /><polyline points="12 19 5 12 12 5" />
  </svg>
);

const IconSettings = () => (
  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="12" cy="12" r="3" />
    <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
  </svg>
);

const IconCheck = () => (
  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
    <polyline points="20 6 9 17 4 12" />
  </svg>
);

const IconTrash = () => (
  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <polyline points="3 6 5 6 21 6" /><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
  </svg>
);

const IconSparkles = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M12 3l1.912 5.885L20 10.8l-4.756 4.635L16.36 21 12 17.67 7.64 21l1.116-5.565L4 10.8l6.088-1.915L12 3z" />
  </svg>
);

export function ChronosDashboard({
  onClose,
  onNavigate,
  onOpenSettings,
  isDark = true,
}: ChronosDashboardProps) {
  const [activeTab, setActiveTab] = useState<'timer' | 'calendar'>('timer');

  // Preset modes: 'focus' (25m), 'short' (5m), 'long' (15m), 'intense' (50m)
  type TimerMode = 'focus' | 'short' | 'long' | 'intense';
  const [timerMode, setTimerMode] = useState<TimerMode>('focus');
  const [durationSeconds, setDurationSeconds] = useState(25 * 60);
  const [timeLeft, setTimeLeft] = useState(25 * 60);
  const [isRunning, setIsRunning] = useState(false);
  const [round, setRound] = useState(1);
  const [activeTaskName, setActiveTaskName] = useState('—');
  const [selectedProjectId, setSelectedProjectId] = useState('general');

  // Projects State
  const [projects, setProjects] = useState<ProjectItem[]>(() => {
    try {
      const stored = localStorage.getItem('chronos_projects');
      return stored ? JSON.parse(stored) : DEFAULT_PROJECTS;
    } catch {
      return DEFAULT_PROJECTS;
    }
  });
  const [newProjectName, setNewProjectName] = useState('');

  // Tasks State
  const [tasks, setTasks] = useState<TaskItem[]>(() => {
    try {
      const stored = localStorage.getItem('chronos_tasks_list');
      return stored ? JSON.parse(stored) : DEFAULT_TASKS;
    } catch {
      return DEFAULT_TASKS;
    }
  });
  const [newTaskTitle, setNewTaskTitle] = useState('');
  const [newTaskDate, setNewTaskDate] = useState(() => new Date().toISOString().split('T')[0]);

  // Session Logs & Stats State
  const [sessionLogs, setSessionLogs] = useState<SessionLog[]>(() => {
    try {
      const stored = localStorage.getItem('chronos_session_logs');
      return stored ? JSON.parse(stored) : [];
    } catch {
      return [];
    }
  });
  const [statsPeriod, setStatsPeriod] = useState<'week' | 'month'>('week');
  const [statsProjectFilter, setStatsProjectFilter] = useState('all');

  // Calendar State
  const [currentCalendarDate, setCurrentCalendarDate] = useState(new Date(2026, 7, 22)); // Aug 2026
  const [selectedDate, setSelectedDate] = useState(new Date(2026, 7, 22));
  const [calendarNotes, setCalendarNotes] = useState<Record<string, string>>(() => {
    try {
      const stored = localStorage.getItem('chronos_calendar_notes');
      return stored ? JSON.parse(stored) : {};
    } catch {
      return {};
    }
  });
  const [dateNoteInput, setDateNoteInput] = useState('');

  // Timer Tick Engine
  useEffect(() => {
    let interval: any = null;
    if (isRunning && timeLeft > 0) {
      interval = setInterval(() => {
        setTimeLeft(prev => {
          if (prev <= 1) {
            setIsRunning(false);
            handleCommitSession();
            return 0;
          }
          return prev - 1;
        });
      }, 1000);
    }
    return () => clearInterval(interval);
  }, [isRunning, timeLeft]);

  // Change preset mode
  const handleSelectMode = (mode: TimerMode) => {
    setTimerMode(mode);
    setIsRunning(false);
    let seconds = 25 * 60;
    if (mode === 'focus') seconds = 25 * 60;
    else if (mode === 'short') seconds = 5 * 60;
    else if (mode === 'long') seconds = 15 * 60;
    else if (mode === 'intense') seconds = 50 * 60;
    setDurationSeconds(seconds);
    setTimeLeft(seconds);
  };

  const handleResetTimer = () => {
    setIsRunning(false);
    setTimeLeft(durationSeconds);
  };

  const handleCommitSession = () => {
    const minutesCompleted = Math.round((durationSeconds - timeLeft) / 60) || Math.round(durationSeconds / 60);
    if (minutesCompleted <= 0) return;

    const newLog: SessionLog = {
      id: `log-${Date.now()}`,
      projectId: selectedProjectId,
      durationMinutes: minutesCompleted,
      timestamp: Date.now(),
    };

    const updated = [newLog, ...sessionLogs];
    setSessionLogs(updated);
    localStorage.setItem('chronos_session_logs', JSON.stringify(updated));

    setRound(prev => (prev < 4 ? prev + 1 : 1));
    handleResetTimer();
  };

  // Format MM:SS
  const formatTimerDigits = (totalSecs: number) => {
    const m = Math.floor(totalSecs / 60).toString().padStart(2, '0');
    const s = (totalSecs % 60).toString().padStart(2, '0');
    return `${m}:${s}`;
  };

  // Add Project
  const handleAddProject = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newProjectName.trim()) return;
    const colors = ['#38bdf8', '#a78bfa', '#34d399', '#f43f5e', '#fbbf24', '#f97316'];
    const newProj: ProjectItem = {
      id: `proj-${Date.now()}`,
      name: newProjectName.trim(),
      color: colors[projects.length % colors.length],
    };
    const updated = [...projects, newProj];
    setProjects(updated);
    localStorage.setItem('chronos_projects', JSON.stringify(updated));
    setNewProjectName('');
  };

  // Add Task
  const handleAddTask = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTaskTitle.trim()) return;
    const newTask: TaskItem = {
      id: `task-${Date.now()}`,
      title: newTaskTitle.trim(),
      date: newTaskDate || new Date().toISOString().split('T')[0],
      projectId: selectedProjectId,
      durationMinutes: 25,
      completed: false,
    };
    const updated = [newTask, ...tasks];
    setTasks(updated);
    localStorage.setItem('chronos_tasks_list', JSON.stringify(updated));
    setNewTaskTitle('');
  };

  const handleToggleTask = (id: string) => {
    const updated = tasks.map(t => (t.id === id ? { ...t, completed: !t.completed } : t));
    setTasks(updated);
    localStorage.setItem('chronos_tasks_list', JSON.stringify(updated));
  };

  const handleDeleteTask = (id: string) => {
    const updated = tasks.filter(t => t.id !== id);
    setTasks(updated);
    localStorage.setItem('chronos_tasks_list', JSON.stringify(updated));
  };

  const handleRunTaskTimer = (task: TaskItem) => {
    setActiveTaskName(task.title);
    setSelectedProjectId(task.projectId);
    setTimerMode('focus');
    const secs = (task.durationMinutes || 25) * 60;
    setDurationSeconds(secs);
    setTimeLeft(secs);
    setIsRunning(true);
  };

  // Compute Stats
  const todayMinutes = sessionLogs.reduce((acc, log) => {
    const isToday = new Date(log.timestamp).toDateString() === new Date().toDateString();
    if (isToday && (statsProjectFilter === 'all' || log.projectId === statsProjectFilter)) {
      return acc + log.durationMinutes;
    }
    return acc;
  }, 0);

  const totalSets = sessionLogs.filter(log => statsProjectFilter === 'all' || log.projectId === statsProjectFilter).length;
  const totalMinutesAll = sessionLogs.reduce((acc, log) => {
    if (statsProjectFilter === 'all' || log.projectId === statsProjectFilter) {
      return acc + log.durationMinutes;
    }
    return acc;
  }, 0);

  const totalHoursFormatted = `${Math.floor(totalMinutesAll / 60).toString().padStart(2, '0')}:${(totalMinutesAll % 60).toString().padStart(2, '0')}`;

  // Weekly Graph Data
  const DAYS_LABEL = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
  const MOCK_GRAPH_DATA = [
    { day: 'Mon', minutes: 25 },
    { day: 'Tue', minutes: 50 },
    { day: 'Wed', minutes: 35 },
    { day: 'Thu', minutes: 60 },
    { day: 'Fri', minutes: 40 },
    { day: 'Sat', minutes: 15 },
    { day: 'Sun', minutes: todayMinutes || 20 },
  ];

  // Calendar Helpers
  const year = currentCalendarDate.getFullYear();
  const month = currentCalendarDate.getMonth();
  const firstDayIndex = new Date(year, month, 1).getDay();
  const totalDaysInMonth = new Date(year, month + 1, 0).getDate();
  const monthTitle = currentCalendarDate.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });

  const selectedDateKey = `${selectedDate.getMonth() + 1}-${selectedDate.getDate()}`;
  const selectedDateInfo = HISTORICAL_DATABASE[selectedDateKey] || {
    holiday: 'International Science & Productivity Day',
    festival: 'Global Technology & Engineering Focus',
    discovery: 'Notable achievements in scientific computing and outer space exploration recorded on this day.',
  };

  const selectedDateFormatted = selectedDate.toLocaleDateString('en-US', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });

  const handleSaveCalendarNote = () => {
    if (!dateNoteInput.trim()) return;
    const key = selectedDate.toISOString().split('T')[0];
    const updated = { ...calendarNotes, [key]: dateNoteInput.trim() };
    setCalendarNotes(updated);
    localStorage.setItem('chronos_calendar_notes', JSON.stringify(updated));
    setDateNoteInput('');
  };

  const activeDayNoteKey = selectedDate.toISOString().split('T')[0];
  const activeDayNote = calendarNotes[activeDayNoteKey];

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 100,
        background: isDark
          ? 'radial-gradient(ellipse at top left, #0e1e38 0%, #080d1a 50%, #04070d 100%)'
          : 'radial-gradient(ellipse at top left, #EAE5D9 0%, #F4F0E8 50%, #F9F6F0 100%)',
        color: isDark ? '#ffffff' : '#1e1b18',
        fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden',
        userSelect: 'none',
      }}
    >
      {/* ─────────────────────────────────────────────────────────────
          TOP BAR (Matching Screenshot media_1787402167277.png)
          ───────────────────────────────────────────────────────────── */}
      <header
        style={{
          padding: '16px 28px',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          borderBottom: isDark ? '1px solid rgba(255, 255, 255, 0.08)' : '1px solid rgba(0, 0, 0, 0.08)',
          background: isDark ? 'rgba(8, 13, 26, 0.65)' : 'rgba(255, 255, 255, 0.7)',
          backdropFilter: 'blur(20px)',
        }}
      >
        {/* Left Side: Back Arrow + Segmented Switch [ Timer ] [ Calendar ] */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <button
            type="button"
            onClick={onClose}
            title="Back to Browser"
            style={{
              width: '36px',
              height: '36px',
              borderRadius: '50%',
              background: isDark ? 'rgba(255, 255, 255, 0.08)' : 'rgba(0, 0, 0, 0.06)',
              border: isDark ? '1px solid rgba(255, 255, 255, 0.12)' : '1px solid rgba(0, 0, 0, 0.1)',
              color: isDark ? '#ffffff' : '#000000',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              cursor: 'pointer',
              transition: 'all 0.15s ease',
            }}
          >
            <IconArrowLeft />
          </button>

          {/* Segmented Switch */}
          <div
            style={{
              display: 'inline-flex',
              background: isDark ? 'rgba(255, 255, 255, 0.06)' : 'rgba(0, 0, 0, 0.06)',
              border: isDark ? '1px solid rgba(255, 255, 255, 0.1)' : '1px solid rgba(0, 0, 0, 0.08)',
              borderRadius: '9999px',
              padding: '3px',
              gap: '4px',
            }}
          >
            <button
              type="button"
              onClick={() => setActiveTab('timer')}
              style={{
                padding: '6px 20px',
                borderRadius: '9999px',
                background: activeTab === 'timer' ? (isDark ? 'rgba(255, 255, 255, 0.18)' : '#ffffff') : 'transparent',
                border: activeTab === 'timer' ? (isDark ? '1px solid rgba(255, 255, 255, 0.25)' : '1px solid rgba(0, 0, 0, 0.1)') : '1px solid transparent',
                color: activeTab === 'timer' ? (isDark ? '#ffffff' : '#000000') : (isDark ? '#94a3b8' : '#64748b'),
                fontSize: '12px',
                fontWeight: '700',
                cursor: 'pointer',
                transition: 'all 0.15s ease',
              }}
            >
              Timer
            </button>

            <button
              type="button"
              onClick={() => setActiveTab('calendar')}
              style={{
                padding: '6px 20px',
                borderRadius: '9999px',
                background: activeTab === 'calendar' ? (isDark ? 'rgba(255, 255, 255, 0.18)' : '#ffffff') : 'transparent',
                border: activeTab === 'calendar' ? (isDark ? '1px solid rgba(255, 255, 255, 0.25)' : '1px solid rgba(0, 0, 0, 0.1)') : '1px solid transparent',
                color: activeTab === 'calendar' ? (isDark ? '#ffffff' : '#000000') : (isDark ? '#94a3b8' : '#64748b'),
                fontSize: '12px',
                fontWeight: '700',
                cursor: 'pointer',
                transition: 'all 0.15s ease',
              }}
            >
              Calendar
            </button>
          </div>
        </div>

        {/* Right Side: Settings Button */}
        <button
          type="button"
          onClick={() => onOpenSettings?.('general')}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '6px',
            background: isDark ? 'rgba(255, 255, 255, 0.08)' : 'rgba(0, 0, 0, 0.06)',
            border: isDark ? '1px solid rgba(255, 255, 255, 0.12)' : '1px solid rgba(0, 0, 0, 0.1)',
            borderRadius: '9999px',
            padding: '7px 18px',
            color: isDark ? '#ffffff' : '#000000',
            fontSize: '12px',
            fontWeight: '600',
            cursor: 'pointer',
          }}
        >
          <IconSettings />
          <span>Settings</span>
        </button>
      </header>

      {/* ─────────────────────────────────────────────────────────────
          MAIN CONTENT AREA
          ───────────────────────────────────────────────────────────── */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '28px 36px' }} className="no-scrollbar">
        {activeTab === 'timer' ? (
          /* ════════════════════════════════════════════════════════════
             TIMER & STATS DASHBOARD (Exact Match to Screenshot)
             ════════════════════════════════════════════════════════════ */
          <div style={{ maxWidth: '1380px', margin: '0 auto', display: 'grid', gridTemplateColumns: '7fr 5fr', gap: '24px' }}>
            {/* ─── Left Column: Focus Timer & Tasks Hub ─── */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
              {/* Main Timer Glass Card */}
              <div
                style={{
                  background: isDark ? 'rgba(16, 28, 54, 0.55)' : 'rgba(255, 255, 255, 0.85)',
                  border: isDark ? '1px solid rgba(255, 255, 255, 0.12)' : '1px solid rgba(0, 0, 0, 0.08)',
                  borderRadius: '24px',
                  padding: '28px 32px',
                  boxShadow: isDark ? '0 20px 50px rgba(0, 0, 0, 0.5)' : '0 12px 32px rgba(0, 0, 0, 0.06)',
                  backdropFilter: 'blur(30px)',
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  position: 'relative',
                }}
              >
                {/* Top Preset Mode Pills */}
                <div style={{ display: 'flex', gap: '8px', width: '100%', justifyContent: 'flex-start', marginBottom: '24px' }}>
                  {(['focus', 'short', 'long', 'intense'] as const).map(mode => (
                    <button
                      key={mode}
                      type="button"
                      onClick={() => handleSelectMode(mode)}
                      style={{
                        padding: '6px 16px',
                        borderRadius: '9999px',
                        background: timerMode === mode ? (isDark ? 'rgba(255, 255, 255, 0.22)' : '#1e1b18') : isDark ? 'rgba(255, 255, 255, 0.06)' : 'rgba(0, 0, 0, 0.05)',
                        border: timerMode === mode ? (isDark ? '1px solid rgba(255, 255, 255, 0.35)' : 'none') : '1px solid transparent',
                        color: timerMode === mode ? '#ffffff' : isDark ? '#94a3b8' : '#64748b',
                        fontSize: '12px',
                        fontWeight: '700',
                        textTransform: 'capitalize',
                        cursor: 'pointer',
                        transition: 'all 0.15s ease',
                      }}
                    >
                      {mode}
                    </button>
                  ))}
                </div>

                {/* Big Center Digital Clock */}
                <div
                  style={{
                    fontSize: '96px',
                    fontWeight: '800',
                    letterSpacing: '0.02em',
                    lineHeight: '1',
                    fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
                    color: '#ffffff',
                    margin: '12px 0 24px 0',
                    textShadow: isDark ? '0 8px 30px rgba(0, 0, 0, 0.6)' : '0 4px 16px rgba(0, 0, 0, 0.15)',
                  }}
                >
                  {formatTimerDigits(timeLeft)}
                </div>

                {/* Action Buttons: [ Start ] [ Reset ] [ Commit ] */}
                <div style={{ display: 'flex', gap: '12px', marginBottom: '20px' }}>
                  <button
                    type="button"
                    onClick={() => setIsRunning(!isRunning)}
                    style={{
                      padding: '8px 24px',
                      borderRadius: '9999px',
                      background: isDark ? 'rgba(255, 255, 255, 0.2)' : '#1e1b18',
                      border: isDark ? '1px solid rgba(255, 255, 255, 0.3)' : 'none',
                      color: '#ffffff',
                      fontSize: '13px',
                      fontWeight: '700',
                      cursor: 'pointer',
                    }}
                  >
                    {isRunning ? 'Pause' : 'Start'}
                  </button>

                  <button
                    type="button"
                    onClick={handleResetTimer}
                    style={{
                      padding: '8px 24px',
                      borderRadius: '9999px',
                      background: isDark ? 'rgba(30, 41, 59, 0.6)' : 'rgba(0, 0, 0, 0.08)',
                      border: isDark ? '1px solid rgba(255, 255, 255, 0.15)' : 'none',
                      color: isDark ? '#cbd5e1' : '#334155',
                      fontSize: '13px',
                      fontWeight: '700',
                      cursor: 'pointer',
                    }}
                  >
                    Reset
                  </button>

                  <button
                    type="button"
                    onClick={handleCommitSession}
                    style={{
                      padding: '8px 24px',
                      borderRadius: '9999px',
                      background: '#10b981',
                      border: 'none',
                      color: '#ffffff',
                      fontSize: '13px',
                      fontWeight: '700',
                      cursor: 'pointer',
                      boxShadow: '0 4px 14px rgba(16, 185, 129, 0.35)',
                    }}
                  >
                    Commit
                  </button>
                </div>

                {/* Status Pills */}
                <div style={{ display: 'flex', gap: '8px', marginBottom: '16px', flexWrap: 'wrap', justifyContent: 'center' }}>
                  <span
                    style={{
                      padding: '4px 14px',
                      borderRadius: '9999px',
                      background: isDark ? 'rgba(255, 255, 255, 0.08)' : 'rgba(0, 0, 0, 0.06)',
                      fontSize: '11px',
                      fontWeight: '700',
                      color: isDark ? '#94a3b8' : '#475569',
                    }}
                  >
                    Round {round}/4
                  </span>
                  <span
                    style={{
                      padding: '4px 14px',
                      borderRadius: '9999px',
                      background: isDark ? 'rgba(255, 255, 255, 0.08)' : 'rgba(0, 0, 0, 0.06)',
                      fontSize: '11px',
                      fontWeight: '700',
                      color: isDark ? '#94a3b8' : '#475569',
                    }}
                  >
                    Task: {activeTaskName}
                  </span>
                  <span
                    style={{
                      padding: '4px 14px',
                      borderRadius: '9999px',
                      background: isRunning ? 'rgba(16, 185, 129, 0.2)' : isDark ? 'rgba(255, 255, 255, 0.08)' : 'rgba(0, 0, 0, 0.06)',
                      fontSize: '11px',
                      fontWeight: '700',
                      color: isRunning ? '#34d399' : isDark ? '#94a3b8' : '#475569',
                    }}
                  >
                    {isRunning ? 'Running' : timeLeft === 0 ? 'Finished' : 'Ready'}
                  </span>
                </div>

                {/* Project Tag Dropdown */}
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '12px', color: isDark ? '#cbd5e1' : '#334155' }}>
                  <span>Project</span>
                  <select
                    value={selectedProjectId}
                    onChange={e => setSelectedProjectId(e.target.value)}
                    style={{
                      background: isDark ? 'rgba(255, 255, 255, 0.08)' : '#ffffff',
                      border: isDark ? '1px solid rgba(255, 255, 255, 0.12)' : '1px solid rgba(0, 0, 0, 0.1)',
                      borderRadius: '9999px',
                      padding: '4px 12px',
                      color: isDark ? '#ffffff' : '#000000',
                      fontSize: '12px',
                      fontWeight: '600',
                      outline: 'none',
                      cursor: 'pointer',
                    }}
                  >
                    {projects.map(p => (
                      <option key={p.id} value={p.id} style={{ background: isDark ? '#0f172a' : '#ffffff', color: isDark ? '#ffffff' : '#000000' }}>
                        {p.name}
                      </option>
                    ))}
                  </select>
                  <span
                    style={{
                      width: '8px',
                      height: '8px',
                      borderRadius: '50%',
                      background: projects.find(p => p.id === selectedProjectId)?.color || '#94a3b8',
                    }}
                  />
                </div>
              </div>

              {/* TASKS Glass Bar / Hub (Matching Screenshot) */}
              <div
                style={{
                  background: isDark ? 'rgba(16, 28, 54, 0.55)' : 'rgba(255, 255, 255, 0.85)',
                  border: isDark ? '1px solid rgba(255, 255, 255, 0.12)' : '1px solid rgba(0, 0, 0, 0.08)',
                  borderRadius: '24px',
                  padding: '24px 28px',
                  boxShadow: isDark ? '0 20px 50px rgba(0, 0, 0, 0.5)' : '0 12px 32px rgba(0, 0, 0, 0.06)',
                  backdropFilter: 'blur(30px)',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '16px',
                }}
              >
                <div style={{ fontSize: '11px', fontWeight: '800', textTransform: 'uppercase', letterSpacing: '0.14em', color: isDark ? '#94a3b8' : '#475569' }}>
                  TASKS
                </div>

                {/* Add Task Input Form */}
                <form onSubmit={handleAddTask} style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                  <input
                    type="text"
                    placeholder="Add a task"
                    value={newTaskTitle}
                    onChange={e => setNewTaskTitle(e.target.value)}
                    style={{
                      flex: 1,
                      background: isDark ? 'rgba(255, 255, 255, 0.06)' : 'rgba(0, 0, 0, 0.04)',
                      border: isDark ? '1px solid rgba(255, 255, 255, 0.1)' : '1px solid rgba(0, 0, 0, 0.1)',
                      borderRadius: '12px',
                      padding: '10px 14px',
                      color: isDark ? '#ffffff' : '#000000',
                      fontSize: '12.5px',
                      outline: 'none',
                    }}
                  />

                  <input
                    type="date"
                    value={newTaskDate}
                    onChange={e => setNewTaskDate(e.target.value)}
                    style={{
                      background: isDark ? 'rgba(255, 255, 255, 0.06)' : 'rgba(0, 0, 0, 0.04)',
                      border: isDark ? '1px solid rgba(255, 255, 255, 0.1)' : '1px solid rgba(0, 0, 0, 0.1)',
                      borderRadius: '12px',
                      padding: '8px 12px',
                      color: isDark ? '#ffffff' : '#000000',
                      fontSize: '12px',
                      outline: 'none',
                      cursor: 'pointer',
                    }}
                  />

                  <button
                    type="submit"
                    style={{
                      background: isDark ? 'rgba(255, 255, 255, 0.18)' : '#1e1b18',
                      border: isDark ? '1px solid rgba(255, 255, 255, 0.25)' : 'none',
                      borderRadius: '12px',
                      padding: '10px 20px',
                      color: '#ffffff',
                      fontSize: '12px',
                      fontWeight: '700',
                      cursor: 'pointer',
                    }}
                  >
                    Add
                  </button>
                </form>

                {/* Tasks List */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', maxHeight: '180px', overflowY: 'auto' }} className="no-scrollbar">
                  {tasks.length === 0 ? (
                    <div style={{ fontSize: '12px', color: isDark ? '#64748b' : '#94a3b8', padding: '8px 0' }}>
                      No tasks scheduled. Add your first goal above.
                    </div>
                  ) : (
                    tasks.map(t => (
                      <div
                        key={t.id}
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'space-between',
                          padding: '8px 12px',
                          borderRadius: '10px',
                          background: isDark ? 'rgba(255, 255, 255, 0.03)' : 'rgba(0, 0, 0, 0.02)',
                          border: isDark ? '1px solid rgba(255, 255, 255, 0.06)' : '1px solid rgba(0, 0, 0, 0.05)',
                        }}
                      >
                        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                          <button
                            type="button"
                            onClick={() => handleToggleTask(t.id)}
                            style={{
                              width: '18px',
                              height: '18px',
                              borderRadius: '5px',
                              border: isDark ? '1px solid rgba(255, 255, 255, 0.2)' : '1px solid rgba(0, 0, 0, 0.2)',
                              background: t.completed ? '#10b981' : 'transparent',
                              color: '#fff',
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              cursor: 'pointer',
                              padding: 0,
                            }}
                          >
                            {t.completed && <IconCheck />}
                          </button>
                          <div>
                            <div style={{ fontSize: '12.5px', fontWeight: '600', textDecoration: t.completed ? 'line-through' : 'none', color: t.completed ? (isDark ? '#64748b' : '#94a3b8') : (isDark ? '#f1f5f9' : '#0f172a') }}>
                              {t.title}
                            </div>
                            <span style={{ fontSize: '10px', color: isDark ? '#94a3b8' : '#64748b' }}>
                              📅 {t.date} • {t.durationMinutes}m
                            </span>
                          </div>
                        </div>

                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                          <button
                            type="button"
                            onClick={() => handleRunTaskTimer(t)}
                            style={{
                              padding: '4px 10px',
                              borderRadius: '6px',
                              background: isDark ? 'rgba(255, 255, 255, 0.12)' : 'rgba(0, 0, 0, 0.08)',
                              border: 'none',
                              color: isDark ? '#ffffff' : '#000000',
                              fontSize: '11px',
                              fontWeight: '700',
                              cursor: 'pointer',
                            }}
                          >
                            Run
                          </button>
                          <button
                            type="button"
                            onClick={() => handleDeleteTask(t.id)}
                            style={{ background: 'none', border: 'none', color: isDark ? '#64748b' : '#94a3b8', cursor: 'pointer', padding: '4px' }}
                          >
                            <IconTrash />
                          </button>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>
            </div>

            {/* ─── Right Column: PROJECTS & STATS Hub (Stacked) ─── */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
              {/* Card 1: PROJECTS (Matching Screenshot) */}
              <div
                style={{
                  background: isDark ? 'rgba(16, 28, 54, 0.55)' : 'rgba(255, 255, 255, 0.85)',
                  border: isDark ? '1px solid rgba(255, 255, 255, 0.12)' : '1px solid rgba(0, 0, 0, 0.08)',
                  borderRadius: '24px',
                  padding: '24px 28px',
                  boxShadow: isDark ? '0 20px 50px rgba(0, 0, 0, 0.5)' : '0 12px 32px rgba(0, 0, 0, 0.06)',
                  backdropFilter: 'blur(30px)',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '14px',
                }}
              >
                <div style={{ fontSize: '11px', fontWeight: '800', textTransform: 'uppercase', letterSpacing: '0.14em', color: isDark ? '#94a3b8' : '#475569' }}>
                  PROJECTS
                </div>

                {/* Add Project Form */}
                <form onSubmit={handleAddProject} style={{ display: 'flex', gap: '8px' }}>
                  <input
                    type="text"
                    placeholder="Project Name"
                    value={newProjectName}
                    onChange={e => setNewProjectName(e.target.value)}
                    style={{
                      flex: 1,
                      background: isDark ? 'rgba(255, 255, 255, 0.06)' : 'rgba(0, 0, 0, 0.04)',
                      border: isDark ? '1px solid rgba(255, 255, 255, 0.1)' : '1px solid rgba(0, 0, 0, 0.1)',
                      borderRadius: '12px',
                      padding: '8px 14px',
                      color: isDark ? '#ffffff' : '#000000',
                      fontSize: '12px',
                      outline: 'none',
                    }}
                  />
                  <button
                    type="submit"
                    style={{
                      background: isDark ? 'rgba(255, 255, 255, 0.18)' : '#1e1b18',
                      border: isDark ? '1px solid rgba(255, 255, 255, 0.25)' : 'none',
                      borderRadius: '12px',
                      padding: '8px 16px',
                      color: '#ffffff',
                      fontSize: '12px',
                      fontWeight: '700',
                      cursor: 'pointer',
                    }}
                  >
                    Add
                  </button>
                </form>

                {/* Projects List */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', maxHeight: '140px', overflowY: 'auto' }} className="no-scrollbar">
                  {projects.map(p => (
                    <div
                      key={p.id}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        padding: '8px 14px',
                        borderRadius: '12px',
                        background: selectedProjectId === p.id ? (isDark ? 'rgba(255, 255, 255, 0.12)' : 'rgba(0, 0, 0, 0.08)') : isDark ? 'rgba(255, 255, 255, 0.03)' : 'rgba(0, 0, 0, 0.02)',
                        border: isDark ? '1px solid rgba(255, 255, 255, 0.06)' : '1px solid rgba(0, 0, 0, 0.05)',
                      }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                        <span style={{ width: '8px', height: '8px', borderRadius: '50%', background: p.color }} />
                        <span style={{ fontSize: '13px', fontWeight: '600', color: isDark ? '#ffffff' : '#000000' }}>
                          {p.name}
                        </span>
                      </div>

                      <button
                        type="button"
                        onClick={() => setSelectedProjectId(p.id)}
                        style={{
                          background: 'none',
                          border: 'none',
                          color: selectedProjectId === p.id ? '#38bdf8' : (isDark ? '#94a3b8' : '#64748b'),
                          fontSize: '12px',
                          fontWeight: '700',
                          cursor: 'pointer',
                        }}
                      >
                        {selectedProjectId === p.id ? 'Active' : 'Use'}
                      </button>
                    </div>
                  ))}
                </div>
              </div>

              {/* Card 2: STATS (Matching Screenshot) */}
              <div
                style={{
                  background: isDark ? 'rgba(16, 28, 54, 0.55)' : 'rgba(255, 255, 255, 0.85)',
                  border: isDark ? '1px solid rgba(255, 255, 255, 0.12)' : '1px solid rgba(0, 0, 0, 0.08)',
                  borderRadius: '24px',
                  padding: '24px 28px',
                  boxShadow: isDark ? '0 20px 50px rgba(0, 0, 0, 0.5)' : '0 12px 32px rgba(0, 0, 0, 0.06)',
                  backdropFilter: 'blur(30px)',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '16px',
                }}
              >
                <div style={{ fontSize: '11px', fontWeight: '800', textTransform: 'uppercase', letterSpacing: '0.14em', color: isDark ? '#94a3b8' : '#475569' }}>
                  STATS
                </div>

                {/* 3 Metric Summary Boxes */}
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '10px' }}>
                  <div
                    style={{
                      background: isDark ? 'rgba(255, 255, 255, 0.06)' : 'rgba(0, 0, 0, 0.04)',
                      borderRadius: '14px',
                      padding: '12px 8px',
                      textAlign: 'center',
                    }}
                  >
                    <div style={{ fontSize: '10px', fontWeight: '800', textTransform: 'uppercase', color: isDark ? '#94a3b8' : '#64748b' }}>
                      TODAY
                    </div>
                    <div style={{ fontSize: '18px', fontWeight: '800', color: isDark ? '#ffffff' : '#000000', marginTop: '2px' }}>
                      {todayMinutes} min
                    </div>
                  </div>

                  <div
                    style={{
                      background: isDark ? 'rgba(255, 255, 255, 0.06)' : 'rgba(0, 0, 0, 0.04)',
                      borderRadius: '14px',
                      padding: '12px 8px',
                      textAlign: 'center',
                    }}
                  >
                    <div style={{ fontSize: '10px', fontWeight: '800', textTransform: 'uppercase', color: isDark ? '#94a3b8' : '#64748b' }}>
                      SETS
                    </div>
                    <div style={{ fontSize: '18px', fontWeight: '800', color: isDark ? '#ffffff' : '#000000', marginTop: '2px' }}>
                      {totalSets}
                    </div>
                  </div>

                  <div
                    style={{
                      background: isDark ? 'rgba(255, 255, 255, 0.06)' : 'rgba(0, 0, 0, 0.04)',
                      borderRadius: '14px',
                      padding: '12px 8px',
                      textAlign: 'center',
                    }}
                  >
                    <div style={{ fontSize: '10px', fontWeight: '800', textTransform: 'uppercase', color: isDark ? '#94a3b8' : '#64748b' }}>
                      TOTAL
                    </div>
                    <div style={{ fontSize: '18px', fontWeight: '800', color: isDark ? '#ffffff' : '#000000', marginTop: '2px' }}>
                      {totalHoursFormatted}
                    </div>
                  </div>
                </div>

                {/* Filters Row: [ Week ] [ Month ] + [ All projects ▼ ] */}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div style={{ display: 'flex', gap: '6px' }}>
                    <button
                      type="button"
                      onClick={() => setStatsPeriod('week')}
                      style={{
                        padding: '4px 12px',
                        borderRadius: '9999px',
                        background: statsPeriod === 'week' ? (isDark ? 'rgba(255, 255, 255, 0.2)' : '#1e1b18') : 'transparent',
                        border: 'none',
                        color: statsPeriod === 'week' ? '#ffffff' : isDark ? '#94a3b8' : '#64748b',
                        fontSize: '11px',
                        fontWeight: '700',
                        cursor: 'pointer',
                      }}
                    >
                      Week
                    </button>
                    <button
                      type="button"
                      onClick={() => setStatsPeriod('month')}
                      style={{
                        padding: '4px 12px',
                        borderRadius: '9999px',
                        background: statsPeriod === 'month' ? (isDark ? 'rgba(255, 255, 255, 0.2)' : '#1e1b18') : 'transparent',
                        border: 'none',
                        color: statsPeriod === 'month' ? '#ffffff' : isDark ? '#94a3b8' : '#64748b',
                        fontSize: '11px',
                        fontWeight: '700',
                        cursor: 'pointer',
                      }}
                    >
                      Month
                    </button>
                  </div>

                  <select
                    value={statsProjectFilter}
                    onChange={e => setStatsProjectFilter(e.target.value)}
                    style={{
                      background: 'none',
                      border: 'none',
                      color: isDark ? '#94a3b8' : '#64748b',
                      fontSize: '11px',
                      fontWeight: '700',
                      outline: 'none',
                      cursor: 'pointer',
                    }}
                  >
                    <option value="all" style={{ background: isDark ? '#0f172a' : '#fff' }}>All projects</option>
                    {projects.map(p => (
                      <option key={p.id} value={p.id} style={{ background: isDark ? '#0f172a' : '#fff' }}>{p.name}</option>
                    ))}
                  </select>
                </div>

                {/* Minutes Graph Area (Matching Screenshot Y-Axis Labels) */}
                <div style={{ display: 'flex', gap: '8px', height: '140px', alignItems: 'stretch' }}>
                  {/* Y-Axis Labels */}
                  <div style={{ display: 'flex', flexDirection: 'column', justifyContent: 'space-between', fontSize: '10px', color: isDark ? '#64748b' : '#94a3b8', textAlign: 'right', width: '32px' }}>
                    <span>60min</span>
                    <span>40min</span>
                    <span>20min</span>
                    <span>0min</span>
                  </div>

                  {/* Graph Canvas / Bars */}
                  <div
                    style={{
                      flex: 1,
                      borderLeft: isDark ? '1px solid rgba(255, 255, 255, 0.1)' : '1px solid rgba(0, 0, 0, 0.1)',
                      borderBottom: isDark ? '1px solid rgba(255, 255, 255, 0.1)' : '1px solid rgba(0, 0, 0, 0.1)',
                      display: 'flex',
                      alignItems: 'flex-end',
                      justifyContent: 'space-around',
                      padding: '0 8px',
                    }}
                  >
                    {MOCK_GRAPH_DATA.map(item => {
                      const heightPercent = Math.min(100, (item.minutes / 60) * 100);
                      return (
                        <div key={item.day} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '6px', height: '100%', justifyContent: 'flex-end' }}>
                          <div
                            style={{
                              width: '16px',
                              height: `${Math.max(8, heightPercent)}%`,
                              borderRadius: '4px 4px 0 0',
                              background: isDark ? 'rgba(56, 189, 248, 0.7)' : 'rgba(200, 109, 81, 0.8)',
                              transition: 'all 0.3s ease',
                            }}
                            title={`${item.day}: ${item.minutes} min`}
                          />
                          <span style={{ fontSize: '9.5px', color: isDark ? '#94a3b8' : '#64748b' }}>
                            {item.day}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>
            </div>
          </div>
        ) : (
          /* ════════════════════════════════════════════════════════════
             CALENDAR VIEW (Matching Clean Separation)
             ════════════════════════════════════════════════════════════ */
          <div style={{ maxWidth: '1280px', margin: '0 auto', display: 'grid', gridTemplateColumns: '7fr 5fr', gap: '24px' }}>
            {/* Left 7 Columns: Monthly Calendar Grid */}
            <div
              style={{
                background: isDark ? 'rgba(16, 28, 54, 0.55)' : 'rgba(255, 255, 255, 0.85)',
                border: isDark ? '1px solid rgba(255, 255, 255, 0.12)' : '1px solid rgba(0, 0, 0, 0.08)',
                borderRadius: '24px',
                padding: '28px 32px',
                boxShadow: isDark ? '0 20px 50px rgba(0, 0, 0, 0.5)' : '0 12px 32px rgba(0, 0, 0, 0.06)',
                backdropFilter: 'blur(30px)',
              }}
            >
              {/* Month Header Navigation */}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }}>
                <h3 style={{ fontFamily: 'Playfair Display, Georgia, serif', fontSize: '24px', fontWeight: '700', margin: 0, color: isDark ? '#ffffff' : '#000000' }}>
                  {monthTitle}
                </h3>
                <div style={{ display: 'flex', gap: '6px' }}>
                  <button
                    type="button"
                    onClick={() => setCurrentCalendarDate(new Date(year, month - 1, 1))}
                    style={{
                      background: isDark ? 'rgba(255, 255, 255, 0.08)' : 'rgba(0, 0, 0, 0.06)',
                      border: isDark ? '1px solid rgba(255, 255, 255, 0.12)' : 'none',
                      borderRadius: '8px',
                      padding: '6px 12px',
                      color: isDark ? '#fff' : '#000',
                      cursor: 'pointer',
                    }}
                  >
                    ←
                  </button>
                  <button
                    type="button"
                    onClick={() => setCurrentCalendarDate(new Date(year, month + 1, 1))}
                    style={{
                      background: isDark ? 'rgba(255, 255, 255, 0.08)' : 'rgba(0, 0, 0, 0.06)',
                      border: isDark ? '1px solid rgba(255, 255, 255, 0.12)' : 'none',
                      borderRadius: '8px',
                      padding: '6px 12px',
                      color: isDark ? '#fff' : '#000',
                      cursor: 'pointer',
                    }}
                  >
                    →
                  </button>
                </div>
              </div>

              {/* Day Headers */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: '8px', textAlign: 'center', marginBottom: '12px' }}>
                {['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'].map(d => (
                  <span key={d} style={{ fontSize: '10.5px', fontWeight: '800', color: isDark ? '#94a3b8' : '#64748b' }}>
                    {d}
                  </span>
                ))}
              </div>

              {/* Calendar Grid Cells */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: '8px' }}>
                {Array.from({ length: firstDayIndex }).map((_, i) => (
                  <div key={`empty-${i}`} />
                ))}
                {Array.from({ length: totalDaysInMonth }).map((_, i) => {
                  const dayNum = i + 1;
                  const isSelected = selectedDate.getDate() === dayNum && selectedDate.getMonth() === month && selectedDate.getFullYear() === year;
                  const isToday = dayNum === 22 && month === 7 && year === 2026;

                  return (
                    <button
                      key={dayNum}
                      type="button"
                      onClick={() => setSelectedDate(new Date(year, month, dayNum))}
                      style={{
                        height: '48px',
                        borderRadius: '14px',
                        background: isSelected
                          ? '#38bdf8'
                          : isToday
                          ? 'rgba(56, 189, 248, 0.18)'
                          : isDark
                          ? 'rgba(255, 255, 255, 0.04)'
                          : 'rgba(0, 0, 0, 0.03)',
                        border: isSelected
                          ? 'none'
                          : isToday
                          ? '1px solid rgba(56, 189, 248, 0.45)'
                          : isDark
                          ? '1px solid rgba(255, 255, 255, 0.06)'
                          : '1px solid rgba(0, 0, 0, 0.05)',
                        color: isSelected ? '#000000' : isDark ? '#ffffff' : '#000000',
                        fontWeight: isSelected || isToday ? '800' : '600',
                        fontSize: '13px',
                        cursor: 'pointer',
                        display: 'flex',
                        flexDirection: 'column',
                        alignItems: 'center',
                        justifyContent: 'center',
                        transition: 'all 0.15s ease',
                      }}
                    >
                      <span>{dayNum}</span>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Right 5 Columns: Date Intelligence & Milestones */}
            <div
              style={{
                background: isDark ? 'rgba(16, 28, 54, 0.55)' : 'rgba(255, 255, 255, 0.85)',
                border: isDark ? '1px solid rgba(255, 255, 255, 0.12)' : '1px solid rgba(0, 0, 0, 0.08)',
                borderRadius: '24px',
                padding: '28px',
                boxShadow: isDark ? '0 20px 50px rgba(0, 0, 0, 0.5)' : '0 12px 32px rgba(0, 0, 0, 0.06)',
                backdropFilter: 'blur(30px)',
                display: 'flex',
                flexDirection: 'column',
                gap: '18px',
              }}
            >
              <div>
                <span style={{ fontSize: '10.5px', fontWeight: '800', textTransform: 'uppercase', letterSpacing: '0.16em', color: isDark ? '#38bdf8' : '#C86D51' }}>
                  Date Intelligence
                </span>
                <h3 style={{ margin: '4px 0 0 0', fontFamily: 'Playfair Display, Georgia, serif', fontSize: '20px', fontWeight: '700', color: isDark ? '#ffffff' : '#000000' }}>
                  {selectedDateFormatted}
                </h3>
              </div>

              {/* Observances & Holidays */}
              <div style={{ background: isDark ? 'rgba(255, 255, 255, 0.04)' : 'rgba(0, 0, 0, 0.03)', borderRadius: '14px', padding: '14px', border: isDark ? '1px solid rgba(255, 255, 255, 0.06)' : '1px solid rgba(0, 0, 0, 0.05)' }}>
                <div style={{ fontSize: '10px', fontWeight: '800', textTransform: 'uppercase', color: '#38bdf8', marginBottom: '4px' }}>
                  Global Observance & Holiday
                </div>
                <div style={{ fontSize: '13px', fontWeight: '600' }}>
                  {selectedDateInfo.holiday || 'Productive Standard Workday'}
                </div>
              </div>

              {/* Cultural Festivals */}
              <div style={{ background: isDark ? 'rgba(255, 255, 255, 0.04)' : 'rgba(0, 0, 0, 0.03)', borderRadius: '14px', padding: '14px', border: isDark ? '1px solid rgba(255, 255, 255, 0.06)' : '1px solid rgba(0, 0, 0, 0.05)' }}>
                <div style={{ fontSize: '10px', fontWeight: '800', textTransform: 'uppercase', color: '#10b981', marginBottom: '4px' }}>
                  Cultural Milestones
                </div>
                <div style={{ fontSize: '13px', fontWeight: '600' }}>
                  {selectedDateInfo.festival || 'Global Science & Technology Season'}
                </div>
              </div>

              {/* Science & Historical Discovery */}
              <div style={{ background: isDark ? 'rgba(56, 189, 248, 0.12)' : 'rgba(200, 109, 81, 0.12)', borderRadius: '14px', padding: '14px', border: isDark ? '1px solid rgba(56, 189, 248, 0.3)' : '1px solid rgba(200, 109, 81, 0.3)' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '10px', fontWeight: '800', textTransform: 'uppercase', color: isDark ? '#38bdf8' : '#C86D51', marginBottom: '4px' }}>
                  <IconSparkles />
                  <span>On This Day in History & Science</span>
                </div>
                <div style={{ fontSize: '12.5px', lineHeight: '1.5' }}>
                  {selectedDateInfo.discovery}
                </div>
              </div>

              {/* Date Notes */}
              <div>
                <div style={{ fontSize: '10.5px', fontWeight: '800', textTransform: 'uppercase', color: isDark ? '#94a3b8' : '#64748b', marginBottom: '6px' }}>
                  Date Notes
                </div>
                {activeDayNote && (
                  <div style={{ padding: '8px 12px', borderRadius: '8px', background: isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.05)', fontSize: '12px', marginBottom: '8px' }}>
                    {activeDayNote}
                  </div>
                )}
                <div style={{ display: 'flex', gap: '6px' }}>
                  <input
                    type="text"
                    placeholder="Add memo for this date..."
                    value={dateNoteInput}
                    onChange={e => setDateNoteInput(e.target.value)}
                    style={{
                      flex: 1,
                      background: isDark ? 'rgba(255, 255, 255, 0.04)' : 'rgba(0, 0, 0, 0.03)',
                      border: isDark ? '1px solid rgba(255, 255, 255, 0.08)' : '1px solid rgba(0, 0, 0, 0.08)',
                      borderRadius: '10px',
                      padding: '8px 12px',
                      color: isDark ? '#ffffff' : '#000000',
                      fontSize: '12px',
                      outline: 'none',
                    }}
                  />
                  <button
                    type="button"
                    onClick={handleSaveCalendarNote}
                    style={{
                      background: '#38bdf8',
                      border: 'none',
                      borderRadius: '10px',
                      padding: '0 16px',
                      color: '#000000',
                      fontWeight: '700',
                      fontSize: '12px',
                      cursor: 'pointer',
                    }}
                  >
                    Save
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
