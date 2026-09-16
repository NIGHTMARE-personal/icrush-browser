import React, { useState, useEffect, useCallback } from 'react';

interface AIAction {
  label: string;
  prompt: string;
  type: 'email' | 'brainstorm' | 'summarize' | 'code' | 'write' | 'plan';
}

interface HomescreenAIActionsProps {
  onOpenAIChatWindow?: (prompt?: string) => void;
  onFocusAISidebar?: () => void;
  isEditing?: boolean;
}

const DEFAULT_ACTIONS: AIAction[] = [
  { label: 'Draft Email', prompt: 'Draft a professional email for me', type: 'email' },
  { label: 'Brainstorm', prompt: 'Help me brainstorm ideas for a new project', type: 'brainstorm' },
  { label: 'Summarize Page', prompt: 'Summarize the current page content for me', type: 'summarize' },
  { label: 'Explain Code', prompt: 'Explain the code on the current page in detail', type: 'code' },
  { label: 'Write Blog Post', prompt: 'Write a blog post on the current topic', type: 'write' },
  { label: 'Create Plan', prompt: 'Create a detailed plan and action items', type: 'plan' },
];

const TYPE_ICONS: Record<AIAction['type'], string> = {
  email: '✉',
  brainstorm: '💡',
  summarize: '📄',
  code: '💻',
  write: '✏',
  plan: '📋',
};

const STORAGE_KEY = 'homescreen-ai-actions';

export function HomescreenAIActions({
  onOpenAIChatWindow,
  onFocusAISidebar,
  isEditing = false,
}: HomescreenAIActionsProps) {
  const [actions, setActions] = useState<AIAction[]>(DEFAULT_ACTIONS);
  const [editingIndex, setEditingIndex] = useState<number | null>(null);
  const [editLabel, setEditLabel] = useState('');
  const [editPrompt, setEditPrompt] = useState('');

  useEffect(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored) {
        const parsed = JSON.parse(stored);
        if (Array.isArray(parsed) && parsed.length > 0) {
          setActions(parsed);
        }
      }
    } catch {
      // ignore
    }
  }, []);

  useEffect(() => {
    if (!isEditing) {
      setEditingIndex(null);
    }
  }, [isEditing]);

  const persist = useCallback((next: AIAction[]) => {
    setActions(next);
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    } catch {
      // ignore
    }
  }, []);

  const handleActionClick = useCallback(
    (action: AIAction) => {
      if (isEditing) return;
      if (onOpenAIChatWindow) {
        onOpenAIChatWindow(action.prompt);
      } else if (onFocusAISidebar) {
        onFocusAISidebar();
      } else {
        window.dispatchEvent(
          new CustomEvent('ai-execute-prompt', { detail: { prompt: action.prompt } })
        );
      }
    },
    [isEditing, onOpenAIChatWindow, onFocusAISidebar]
  );

  const handleStartEdit = useCallback(
    (index: number) => {
      if (!isEditing) return;
      setEditingIndex(index);
      setEditLabel(actions[index].label);
      setEditPrompt(actions[index].prompt);
    },
    [isEditing, actions]
  );

  const handleSaveEdit = useCallback(() => {
    if (editingIndex === null) return;
    const trimmedLabel = editLabel.trim();
    const trimmedPrompt = editPrompt.trim();
    if (!trimmedLabel || !trimmedPrompt) return;
    const next = actions.map((a, i) =>
      i === editingIndex ? { ...a, label: trimmedLabel, prompt: trimmedPrompt } : a
    );
    persist(next);
    setEditingIndex(null);
  }, [editingIndex, editLabel, editPrompt, actions, persist]);

  const handleCancelEdit = useCallback(() => {
    setEditingIndex(null);
  }, []);

  const handleAddAction = useCallback(() => {
    const newAction: AIAction = {
      label: 'New Action',
      prompt: 'Enter your prompt here',
      type: 'brainstorm',
    };
    persist([...actions, newAction]);
    setEditingIndex(actions.length);
    setEditLabel(newAction.label);
    setEditPrompt(newAction.prompt);
  }, [actions, persist]);

  const handleRemoveAction = useCallback(
    (index: number) => {
      const next = actions.filter((_, i) => i !== index);
      persist(next);
      setEditingIndex(null);
    },
    [actions, persist]
  );

  if (isEditing && editingIndex !== null) {
    return (
      <div className="homescreen-ai-actions">
        <div className="ai-actions-header">
          <span>Edit AI Action</span>
        </div>
        <div className="ai-actions-edit-list">
          <input
            type="text"
            value={editLabel}
            onChange={(e) => setEditLabel(e.target.value)}
            placeholder="Label"
            style={{
              width: '100%',
              padding: '8px 10px',
              background: 'rgba(255,255,255,0.05)',
              border: '1px solid rgba(255,255,255,0.1)',
              borderRadius: '8px',
              color: '#f4f0ea',
              fontSize: '13px',
              marginBottom: '8px',
              outline: 'none',
            }}
          />
          <textarea
            value={editPrompt}
            onChange={(e) => setEditPrompt(e.target.value)}
            placeholder="Prompt"
            rows={3}
            style={{
              width: '100%',
              padding: '8px 10px',
              background: 'rgba(255,255,255,0.05)',
              border: '1px solid rgba(255,255,255,0.1)',
              borderRadius: '8px',
              color: '#f4f0ea',
              fontSize: '13px',
              marginBottom: '8px',
              outline: 'none',
              resize: 'vertical',
            }}
          />
          <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
            <button
              onClick={() => handleRemoveAction(editingIndex)}
              style={{
                padding: '6px 14px',
                background: 'rgba(220,60,60,0.15)',
                border: '1px solid rgba(220,60,60,0.3)',
                borderRadius: '8px',
                color: '#ff6b6b',
                fontSize: '12px',
                cursor: 'pointer',
              }}
            >
              Remove
            </button>
            <button
              onClick={handleCancelEdit}
              style={{
                padding: '6px 14px',
                background: 'rgba(255,255,255,0.05)',
                border: '1px solid rgba(255,255,255,0.1)',
                borderRadius: '8px',
                color: '#f4f0ea',
                fontSize: '12px',
                cursor: 'pointer',
              }}
            >
              Cancel
            </button>
            <button
              onClick={handleSaveEdit}
              style={{
                padding: '6px 14px',
                background: 'rgba(212,175,55,0.15)',
                border: '1px solid rgba(212,175,55,0.3)',
                borderRadius: '8px',
                color: '#d4af37',
                fontSize: '12px',
                cursor: 'pointer',
              }}
            >
              Save
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="homescreen-ai-actions">
      <div className="ai-actions-header">
        <span>AI Quick Actions</span>
        {isEditing && (
          <button
            onClick={handleAddAction}
            style={{
              background: 'rgba(212,175,55,0.15)',
              border: '1px solid rgba(212,175,55,0.3)',
              borderRadius: '8px',
              color: '#d4af37',
              fontSize: '12px',
              padding: '4px 10px',
              cursor: 'pointer',
            }}
          >
            + Add
          </button>
        )}
      </div>
      <div className="ai-actions-grid">
        {actions.map((action, index) => (
          <div
            key={`${action.type}-${index}`}
            className="ai-action-card"
            onClick={() => (isEditing ? handleStartEdit(index) : handleActionClick(action))}
          >
            <div className="ai-action-icon">{TYPE_ICONS[action.type]}</div>
            <div className="ai-action-label">{action.label}</div>
          </div>
        ))}
      </div>
    </div>
  );
}
