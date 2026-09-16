import { useState, useEffect, useMemo } from 'react';

interface CalendarEvent {
  title: string;
  time: string;
  color: string;
}

type EventStore = { [dateKey: string]: CalendarEvent[] };

const STORAGE_KEY = 'homescreen-calendar-events';
const DEFAULT_COLORS = ['#d4af37', '#6366f1', '#10b981', '#f43f5e', '#8b5cf6'];
const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

function getDaysInMonth(year: number, month: number): number {
  return new Date(year, month + 1, 0).getDate();
}

function getFirstDayOfMonth(year: number, month: number): number {
  return new Date(year, month, 1).getDay();
}

function dateKey(year: number, month: number, day: number): string {
  return `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

function loadEvents(): EventStore {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

function saveEvents(events: EventStore): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(events));
}

export function HomescreenCalendar() {
  const today = new Date();
  const [currentYear, setCurrentYear] = useState(today.getFullYear());
  const [currentMonth, setCurrentMonth] = useState(today.getMonth());
  const [events, setEvents] = useState<EventStore>(loadEvents);
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [eventTitle, setEventTitle] = useState('');
  const [eventTime, setEventTime] = useState('');
  const [eventColor, setEventColor] = useState(DEFAULT_COLORS[0]);

  useEffect(() => {
    saveEvents(events);
  }, [events]);

  const daysInMonth = useMemo(() => getDaysInMonth(currentYear, currentMonth), [currentYear, currentMonth]);
  const firstDay = useMemo(() => getFirstDayOfMonth(currentYear, currentMonth), [currentYear, currentMonth]);

  const todayKey = dateKey(today.getFullYear(), today.getMonth(), today.getDate());

  const calendarDays = useMemo(() => {
    const days: (number | null)[] = [];
    for (let i = 0; i < firstDay; i++) {
      days.push(null);
    }
    for (let d = 1; d <= daysInMonth; d++) {
      days.push(d);
    }
    return days;
  }, [firstDay, daysInMonth]);

  const monthName = new Date(currentYear, currentMonth).toLocaleString('default', { month: 'long' });

  function goToPrevMonth() {
    if (currentMonth === 0) {
      setCurrentMonth(11);
      setCurrentYear(currentYear - 1);
    } else {
      setCurrentMonth(currentMonth - 1);
    }
    setSelectedDate(null);
    setShowForm(false);
  }

  function goToNextMonth() {
    if (currentMonth === 11) {
      setCurrentMonth(0);
      setCurrentYear(currentYear + 1);
    } else {
      setCurrentMonth(currentMonth + 1);
    }
    setSelectedDate(null);
    setShowForm(false);
  }

  function handleDayClick(day: number) {
    const key = dateKey(currentYear, currentMonth, day);
    if (selectedDate === key) {
      setShowForm(!showForm);
    } else {
      setSelectedDate(key);
      setShowForm(true);
      setEventTitle('');
      setEventTime('');
      setEventColor(DEFAULT_COLORS[0]);
    }
  }

  function handleSaveEvent() {
    if (!selectedDate || !eventTitle.trim()) return;
    const newEvent: CalendarEvent = {
      title: eventTitle.trim(),
      time: eventTime || '00:00',
      color: eventColor,
    };
    setEvents((prev) => ({
      ...prev,
      [selectedDate]: [...(prev[selectedDate] || []), newEvent],
    }));
    setEventTitle('');
    setEventTime('');
    setEventColor(DEFAULT_COLORS[0]);
  }

  function handleDeleteEvent(dateStr: string, index: number) {
    setEvents((prev) => {
      const updated = { ...prev };
      const arr = [...(updated[dateStr] || [])];
      arr.splice(index, 1);
      if (arr.length === 0) {
        delete updated[dateStr];
      } else {
        updated[dateStr] = arr;
      }
      return updated;
    });
  }

  return (
    <div className="homescreen-calendar">
      <div className="calendar-header">
        <button onClick={goToPrevMonth} className="calendar-nav-btn">
          &#8249;
        </button>
        <span className="calendar-month-label">
          {monthName} {currentYear}
        </span>
        <button onClick={goToNextMonth} className="calendar-nav-btn">
          &#8250;
        </button>
      </div>

      <div className="calendar-weekdays">
        {WEEKDAYS.map((wd) => (
          <div key={wd} className="calendar-weekday">
            {wd}
          </div>
        ))}
      </div>

      <div className="calendar-grid">
        {calendarDays.map((day, idx) => {
          if (day === null) {
            return <div key={`empty-${idx}`} className="calendar-day empty" />;
          }
          const key = dateKey(currentYear, currentMonth, day);
          const isToday = key === todayKey;
          const isSelected = key === selectedDate;
          const dayEvents = events[key] || [];
          const hasEvents = dayEvents.length > 0;

          return (
            <div
              key={key}
              className={`calendar-day${isToday ? ' today' : ''}${isSelected ? ' selected' : ''}${hasEvents ? ' has-events' : ''}`}
              onClick={() => handleDayClick(day)}
            >
              <span className="calendar-day-number">{day}</span>
              {hasEvents && (
                <div className="calendar-event-dots">
                  {dayEvents.slice(0, 3).map((ev, i) => (
                    <span
                      key={i}
                      className="calendar-event-dot"
                      style={{ backgroundColor: ev.color }}
                    />
                  ))}
                  {dayEvents.length > 3 && (
                    <span className="calendar-event-more">+{dayEvents.length - 3}</span>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {selectedDate && showForm && (
        <div className="calendar-add-form">
          <div className="calendar-form-events">
            {(events[selectedDate] || []).map((ev, idx) => (
              <div key={idx} className="calendar-event-chip">
                <span className="calendar-event-chip-dot" style={{ backgroundColor: ev.color }} />
                <span className="calendar-event-chip-time">{ev.time}</span>
                <span className="calendar-event-chip-title">{ev.title}</span>
                <button
                  className="calendar-event-chip-delete"
                  onClick={() => handleDeleteEvent(selectedDate, idx)}
                >
                  ×
                </button>
              </div>
            ))}
          </div>
          <div className="calendar-form-row">
            <input
              type="text"
              className="calendar-input"
              placeholder="Event title"
              value={eventTitle}
              onChange={(e) => setEventTitle(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleSaveEvent()}
            />
          </div>
          <div className="calendar-form-row">
            <input
              type="time"
              className="calendar-input calendar-time-input"
              value={eventTime}
              onChange={(e) => setEventTime(e.target.value)}
            />
            <div className="calendar-color-picker">
              {DEFAULT_COLORS.map((c) => (
                <button
                  key={c}
                  className={`calendar-color-swatch${eventColor === c ? ' active' : ''}`}
                  style={{ backgroundColor: c }}
                  onClick={() => setEventColor(c)}
                />
              ))}
            </div>
          </div>
          <div className="calendar-form-row">
            <button className="calendar-save-btn" onClick={handleSaveEvent} disabled={!eventTitle.trim()}>
              Add Event
            </button>
          </div>
        </div>
      )}

      <style>{`
        .homescreen-calendar {
          background: rgba(15,15,18,0.55);
          backdrop-filter: blur(20px);
          -webkit-backdrop-filter: blur(20px);
          border: 1px solid rgba(255,255,255,0.05);
          border-radius: 16px;
          padding: 20px;
          color: #f4f0ea;
          width: 100%;
          max-width: 320px;
          font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
        }

        .calendar-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          margin-bottom: 16px;
        }

        .calendar-month-label {
          font-size: 15px;
          font-weight: 600;
          color: #f4f0ea;
          letter-spacing: 0.3px;
        }

        .calendar-nav-btn {
          background: rgba(255,255,255,0.06);
          border: 1px solid rgba(255,255,255,0.08);
          border-radius: 8px;
          color: #f4f0ea;
          width: 32px;
          height: 32px;
          display: flex;
          align-items: center;
          justify-content: center;
          cursor: pointer;
          font-size: 18px;
          transition: background 0.15s ease;
          line-height: 1;
          padding: 0;
        }

        .calendar-nav-btn:hover {
          background: rgba(255,255,255,0.12);
        }

        .calendar-weekdays {
          display: grid;
          grid-template-columns: repeat(7, 1fr);
          gap: 2px;
          margin-bottom: 6px;
        }

        .calendar-weekday {
          text-align: center;
          font-size: 11px;
          color: #94a3b8;
          font-weight: 500;
          padding: 4px 0;
          text-transform: uppercase;
          letter-spacing: 0.5px;
        }

        .calendar-grid {
          display: grid;
          grid-template-columns: repeat(7, 1fr);
          gap: 2px;
        }

        .calendar-day {
          width: 36px;
          height: 36px;
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          border-radius: 50%;
          cursor: pointer;
          position: relative;
          transition: background 0.15s ease;
          margin: 0 auto;
        }

        .calendar-day.empty {
          cursor: default;
        }

        .calendar-day:not(.empty):hover {
          background: rgba(255,255,255,0.08);
        }

        .calendar-day.today {
          background: rgba(212,175,55,0.2);
          border: 1px solid #d4af37;
        }

        .calendar-day.selected {
          background: rgba(212,175,55,0.35);
          border: 1px solid #d4af37;
        }

        .calendar-day.today .calendar-day-number {
          color: #d4af37;
          font-weight: 700;
        }

        .calendar-day-number {
          font-size: 13px;
          font-weight: 500;
          color: #f4f0ea;
          line-height: 1;
        }

        .calendar-event-dots {
          display: flex;
          gap: 3px;
          position: absolute;
          bottom: 2px;
        }

        .calendar-event-dot {
          width: 4px;
          height: 4px;
          border-radius: 50%;
        }

        .calendar-event-more {
          font-size: 8px;
          color: #94a3b8;
          line-height: 1;
        }

        .calendar-add-form {
          margin-top: 16px;
          padding-top: 16px;
          border-top: 1px solid rgba(255,255,255,0.06);
          display: flex;
          flex-direction: column;
          gap: 10px;
        }

        .calendar-form-events {
          display: flex;
          flex-direction: column;
          gap: 6px;
          max-height: 120px;
          overflow-y: auto;
        }

        .calendar-form-events::-webkit-scrollbar {
          width: 4px;
        }

        .calendar-form-events::-webkit-scrollbar-thumb {
          background: rgba(255,255,255,0.1);
          border-radius: 2px;
        }

        .calendar-event-chip {
          display: flex;
          align-items: center;
          gap: 8px;
          background: rgba(255,255,255,0.05);
          border-radius: 8px;
          padding: 6px 10px;
          font-size: 12px;
        }

        .calendar-event-chip-dot {
          width: 6px;
          height: 6px;
          border-radius: 50%;
          flex-shrink: 0;
        }

        .calendar-event-chip-time {
          color: #94a3b8;
          font-variant-numeric: tabular-nums;
          flex-shrink: 0;
        }

        .calendar-event-chip-title {
          color: #f4f0ea;
          flex: 1;
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
        }

        .calendar-event-chip-delete {
          background: none;
          border: none;
          color: #94a3b8;
          cursor: pointer;
          font-size: 14px;
          padding: 0 2px;
          line-height: 1;
          opacity: 0;
          transition: opacity 0.15s ease, color 0.15s ease;
        }

        .calendar-event-chip:hover .calendar-event-chip-delete {
          opacity: 1;
        }

        .calendar-event-chip-delete:hover {
          color: #f43f5e;
        }

        .calendar-form-row {
          display: flex;
          gap: 8px;
          align-items: center;
        }

        .calendar-input {
          flex: 1;
          background: rgba(255,255,255,0.06);
          border: 1px solid rgba(255,255,255,0.08);
          border-radius: 8px;
          padding: 8px 12px;
          color: #f4f0ea;
          font-size: 13px;
          outline: none;
          transition: border-color 0.15s ease;
        }

        .calendar-input:focus {
          border-color: rgba(212,175,55,0.5);
        }

        .calendar-input::placeholder {
          color: #94a3b8;
        }

        .calendar-time-input {
          width: 90px;
          flex: none;
        }

        .calendar-color-picker {
          display: flex;
          gap: 6px;
        }

        .calendar-color-swatch {
          width: 18px;
          height: 18px;
          border-radius: 50%;
          border: 2px solid transparent;
          cursor: pointer;
          transition: border-color 0.15s ease, transform 0.15s ease;
          padding: 0;
        }

        .calendar-color-swatch:hover {
          transform: scale(1.15);
        }

        .calendar-color-swatch.active {
          border-color: #f4f0ea;
          transform: scale(1.15);
        }

        .calendar-save-btn {
          flex: 1;
          background: rgba(212,175,55,0.2);
          border: 1px solid rgba(212,175,55,0.4);
          border-radius: 8px;
          padding: 8px 12px;
          color: #d4af37;
          font-size: 13px;
          font-weight: 600;
          cursor: pointer;
          transition: background 0.15s ease, opacity 0.15s ease;
        }

        .calendar-save-btn:hover:not(:disabled) {
          background: rgba(212,175,55,0.35);
        }

        .calendar-save-btn:disabled {
          opacity: 0.4;
          cursor: not-allowed;
        }
      `}</style>
    </div>
  );
}
