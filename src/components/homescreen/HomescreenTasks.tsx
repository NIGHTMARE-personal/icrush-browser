import { useState, useEffect, useCallback } from 'react';

interface Task {
  id: string;
  text: string;
  completed: boolean;
  createdAt: number;
}

const STORAGE_KEY = 'homescreen-tasks';

function generateId(): string {
  return crypto.randomUUID();
}

export function HomescreenTasks() {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [inputValue, setInputValue] = useState('');

  useEffect(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored) {
        setTasks(JSON.parse(stored));
      }
    } catch {
      setTasks([]);
    }
  }, []);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(tasks));
  }, [tasks]);

  const addTask = useCallback(() => {
    const text = inputValue.trim();
    if (!text) return;
    setTasks(prev => [...prev, { id: generateId(), text, completed: false, createdAt: Date.now() }]);
    setInputValue('');
  }, [inputValue]);

  const toggleTask = useCallback((id: string) => {
    setTasks(prev => prev.map(t => (t.id === id ? { ...t, completed: !t.completed } : t)));
  }, []);

  const deleteTask = useCallback((id: string) => {
    setTasks(prev => prev.filter(t => t.id !== id));
  }, []);

  const moveTask = useCallback((id: string, direction: -1 | 1) => {
    setTasks(prev => {
      const idx = prev.findIndex(t => t.id === id);
      if (idx === -1) return prev;
      const newIdx = idx + direction;
      if (newIdx < 0 || newIdx >= prev.length) return prev;
      const next = [...prev];
      [next[idx], next[newIdx]] = [next[newIdx], next[idx]];
      return next;
    });
  }, []);

  const clearCompleted = useCallback(() => {
    setTasks(prev => prev.filter(t => !t.completed));
  }, []);

  const completedCount = tasks.filter(t => t.completed).length;
  const totalCount = tasks.length;

  return (
    <div className="homescreen-tasks">
      <style>{`
        .homescreen-tasks {
          background: rgba(15, 15, 18, 0.55);
          backdrop-filter: blur(20px);
          -webkit-backdrop-filter: blur(20px);
          border: 1px solid rgba(255, 255, 255, 0.05);
          border-radius: 16px;
          padding: 20px;
          color: #f4f0ea;
          font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
        }
        .tasks-header {
          display: flex;
          align-items: center;
          justify-content: space-between;
          margin-bottom: 14px;
        }
        .tasks-header h3 {
          margin: 0;
          font-size: 15px;
          font-weight: 600;
          letter-spacing: 0.3px;
        }
        .tasks-progress {
          font-size: 12px;
          color: #94a3b8;
          font-weight: 500;
        }
        .tasks-input-row {
          display: flex;
          gap: 8px;
          margin-bottom: 14px;
        }
        .tasks-input-row input {
          flex: 1;
          background: rgba(255, 255, 255, 0.05);
          border: none;
          border-radius: 8px;
          padding: 10px 14px;
          color: #f4f0ea;
          font-size: 13px;
          outline: none;
          transition: background 0.2s;
        }
        .tasks-input-row input::placeholder {
          color: #94a3b8;
        }
        .tasks-input-row input:focus {
          background: rgba(255, 255, 255, 0.08);
        }
        .tasks-input-row button {
          background: rgba(212, 175, 55, 0.15);
          border: 1px solid rgba(212, 175, 55, 0.3);
          border-radius: 8px;
          padding: 10px 16px;
          color: #d4af37;
          font-size: 13px;
          font-weight: 600;
          cursor: pointer;
          transition: all 0.2s;
        }
        .tasks-input-row button:hover {
          background: rgba(212, 175, 55, 0.25);
        }
        .tasks-list {
          list-style: none;
          margin: 0;
          padding: 0;
          max-height: 280px;
          overflow-y: auto;
        }
        .tasks-list::-webkit-scrollbar {
          width: 4px;
        }
        .tasks-list::-webkit-scrollbar-track {
          background: transparent;
        }
        .tasks-list::-webkit-scrollbar-thumb {
          background: rgba(255, 255, 255, 0.1);
          border-radius: 2px;
        }
        .tasks-item {
          display: flex;
          align-items: center;
          gap: 10px;
          padding: 8px 10px;
          border-radius: 8px;
          transition: background 0.15s;
        }
        .tasks-item:hover {
          background: rgba(255, 255, 255, 0.03);
        }
        .tasks-item.completed .tasks-text {
          text-decoration: line-through;
          opacity: 0.5;
        }
        .tasks-checkbox {
          appearance: none;
          -webkit-appearance: none;
          width: 18px;
          height: 18px;
          border: 2px solid rgba(255, 255, 255, 0.15);
          border-radius: 50%;
          cursor: pointer;
          position: relative;
          flex-shrink: 0;
          transition: all 0.2s;
        }
        .tasks-checkbox:checked {
          background: #d4af37;
          border-color: #d4af37;
        }
        .tasks-checkbox:checked::after {
          content: '';
          position: absolute;
          left: 5px;
          top: 2px;
          width: 4px;
          height: 8px;
          border: solid #0f0f12;
          border-width: 0 2px 2px 0;
          transform: rotate(45deg);
        }
        .tasks-checkbox:hover {
          border-color: rgba(212, 175, 55, 0.5);
        }
        .tasks-text {
          flex: 1;
          font-size: 13px;
          line-height: 1.4;
          word-break: break-word;
        }
        .tasks-move-btns {
          display: flex;
          gap: 2px;
          opacity: 0;
          transition: opacity 0.15s;
        }
        .tasks-item:hover .tasks-move-btns {
          opacity: 1;
        }
        .tasks-move-btns button {
          background: none;
          border: none;
          color: #94a3b8;
          cursor: pointer;
          padding: 2px 4px;
          font-size: 11px;
          border-radius: 4px;
          transition: all 0.15s;
          line-height: 1;
        }
        .tasks-move-btns button:hover {
          color: #f4f0ea;
          background: rgba(255, 255, 255, 0.08);
        }
        .tasks-delete {
          background: none;
          border: none;
          color: #94a3b8;
          cursor: pointer;
          padding: 4px;
          font-size: 14px;
          opacity: 0;
          transition: all 0.15s;
          border-radius: 4px;
          line-height: 1;
        }
        .tasks-item:hover .tasks-delete {
          opacity: 1;
        }
        .tasks-delete:hover {
          color: #ef4444;
          background: rgba(239, 68, 68, 0.1);
        }
        .tasks-footer {
          display: flex;
          justify-content: flex-end;
          margin-top: 12px;
          padding-top: 12px;
          border-top: 1px solid rgba(255, 255, 255, 0.05);
        }
        .tasks-footer button {
          background: none;
          border: none;
          color: #94a3b8;
          cursor: pointer;
          font-size: 12px;
          padding: 4px 8px;
          border-radius: 6px;
          transition: all 0.2s;
        }
        .tasks-footer button:hover {
          color: #ef4444;
          background: rgba(239, 68, 68, 0.08);
        }
        .tasks-footer button:disabled {
          opacity: 0.3;
          cursor: not-allowed;
        }
        .tasks-footer button:disabled:hover {
          color: #94a3b8;
          background: none;
        }
        .tasks-progress-bar {
          width: 100%;
          height: 3px;
          background: rgba(255, 255, 255, 0.05);
          border-radius: 2px;
          margin-top: 14px;
          overflow: hidden;
        }
        .tasks-progress-fill {
          height: 100%;
          background: linear-gradient(90deg, #d4af37, #f0d060);
          border-radius: 2px;
          transition: width 0.3s ease;
        }
      `}</style>

      <div className="tasks-header">
        <h3>Tasks</h3>
        {totalCount > 0 && (
          <span className="tasks-progress">{completedCount} of {totalCount} completed</span>
        )}
      </div>

      <div className="tasks-input-row">
        <input
          type="text"
          value={inputValue}
          onChange={e => setInputValue(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter') addTask(); }}
          placeholder="Add a new task..."
        />
        <button onClick={addTask}>Add</button>
      </div>

      {tasks.length === 0 ? (
        <div className="tasks-empty-state" style={{ padding: '24px', textAlign: 'center', color: 'var(--text-muted)', fontSize: '13px' }}>
          No tasks yet — add one above!
        </div>
      ) : (
        <ul className="tasks-list">
          {tasks.map(task => (
            <li key={task.id} className={`tasks-item${task.completed ? ' completed' : ''}`}>
              <input
                type="checkbox"
                className="tasks-checkbox"
                checked={task.completed}
                onChange={() => toggleTask(task.id)}
              />
              <span className="tasks-text">{task.text}</span>
              <div className="tasks-move-btns">
                <button onClick={() => moveTask(task.id, -1)} title="Move up">▲</button>
                <button onClick={() => moveTask(task.id, 1)} title="Move down">▼</button>
              </div>
              <button className="tasks-delete" onClick={() => deleteTask(task.id)} title="Delete task">✕</button>
            </li>
          ))}
        </ul>
      )}

      {totalCount > 0 && (
        <div className="tasks-progress-bar">
          <div
            className="tasks-progress-fill"
            style={{ width: `${totalCount > 0 ? (completedCount / totalCount) * 100 : 0}%` }}
          />
        </div>
      )}

      {completedCount > 0 && (
        <div className="tasks-footer">
          <button onClick={clearCompleted}>Clear completed ({completedCount})</button>
        </div>
      )}
    </div>
  );
}
