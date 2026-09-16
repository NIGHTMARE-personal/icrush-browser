import React, { useState, useRef, useEffect } from 'react';
import { storage } from '../utils/storage';
import { PROVIDERS } from '../utils/providers';

interface AISearchBarProps {
  onNavigate: (url: string) => void;
  onFocusAISidebar: () => void;
  onOpenSettings: (tab?: string) => void;
  onOpenAIChatWindow?: (initialPrompt?: string, files?: Array<{ inlineData: { mimeType: string; data: string } }>) => void;
  currentEngine?: string;
  onSelectEngine?: (engine: string) => void;
  isEditing?: boolean;
}

type SearchMode = 'web' | 'ai';

const SUGGESTIONS = [
  { label: 'Browse Hacker News', prompt: 'Go to news.ycombinator.com' },
  { label: 'Search latest AI news', prompt: 'Search for latest AI news 2026' },
  { label: 'Summarize this page', prompt: 'Summarize the current page content for me' },
  { label: 'Draft an email', prompt: 'Draft a professional email about a new project collaboration' },
];

export function AISearchBar({
  onNavigate,
  onFocusAISidebar,
  onOpenSettings,
  onOpenAIChatWindow,
  currentEngine = 'google',
  onSelectEngine,
  isEditing = false,
}: AISearchBarProps) {
  const [mode, setMode] = useState<SearchMode>('web');
  const [searchValue, setSearchValue] = useState('');
  const [promptValue, setPromptValue] = useState('');
  const [attachedFile, setAttachedFile] = useState<{ name: string; data: string; mimeType: string } | null>(null);
  const [activeProvider, setActiveProvider] = useState(() => storage.getActiveProvider());
  const [showProviderMenu, setShowProviderMenu] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const providerMenuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      if (providerMenuRef.current && !providerMenuRef.current.contains(e.target as Node)) {
        setShowProviderMenu(false);
      }
    };
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, []);

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (searchValue.trim()) {
      onNavigate(searchValue.trim());
    }
  };

  const handlePromptSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!promptValue.trim() && !attachedFile) return;

    const finalPrompt = promptValue.trim();
    const files = attachedFile
      ? [{ inlineData: { mimeType: attachedFile.mimeType, data: attachedFile.data } }]
      : undefined;

    if (onOpenAIChatWindow) {
      onOpenAIChatWindow(finalPrompt, files);
    } else {
      onFocusAISidebar();
      requestAnimationFrame(() => {
        window.dispatchEvent(
          new CustomEvent('ai-execute-prompt', { detail: { prompt: finalPrompt, files } })
        );
      });
    }
    setPromptValue('');
    setAttachedFile(null);
  };

  const handleFilePick = () => {
    fileInputRef.current?.click();
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.size > 10 * 1024 * 1024) {
      alert('File too large. Maximum size is 10MB.');
      return;
    }

    const mimeType = file.type || 'image/png';
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result as string;
      const base64 = result.split(',')[1];
      setAttachedFile({ name: file.name, data: base64, mimeType });
    };
    reader.readAsDataURL(file);
  };

  const handleRemoveFile = () => {
    setAttachedFile(null);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const handleSuggestionClick = (prompt: string) => {
    if (onOpenAIChatWindow) {
      onOpenAIChatWindow(prompt);
    } else {
      onFocusAISidebar();
      setTimeout(() => {
        window.dispatchEvent(new CustomEvent('ai-execute-prompt', { detail: { prompt } }));
      }, 150);
    }
  };

  const handleProviderSelect = (providerId: string) => {
    setActiveProvider(providerId);
    storage.setActiveProvider(providerId);
    setShowProviderMenu(false);
  };

  const autoResizeTextarea = () => {
    const ta = textareaRef.current;
    if (ta) {
      ta.style.height = 'auto';
      ta.style.height = `${Math.min(ta.scrollHeight, 160)}px`;
    }
  };

  if (isEditing) return null;

  return (
    <div className="aisearchbar-container">
      <div className="aisearchbar-mode-toggle">
        <button
          className={`aisearchbar-mode-btn ${mode === 'web' ? 'active' : ''}`}
          onClick={() => setMode('web')}
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="11" cy="11" r="8" />
            <line x1="21" y1="21" x2="16.65" y2="16.65" />
          </svg>
          <span>Web Search</span>
        </button>
        <button
          className={`aisearchbar-mode-btn ${mode === 'ai' ? 'active' : ''}`}
          onClick={() => setMode('ai')}
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
          </svg>
          <span>AI Prompt</span>
        </button>
      </div>

      {mode === 'web' ? (
        <form className="aisearchbar-web-form" onSubmit={handleSearchSubmit}>
          <div className="aisearchbar-input-wrapper">
            {onSelectEngine && (
              <div className="aisearchbar-engine-select">
                <select
                  value={currentEngine}
                  onChange={e => onSelectEngine(e.target.value)}
                >
                  <option value="google">Google</option>
                  <option value="duckduckgo">DuckDuckGo</option>
                  <option value="bing">Bing</option>
                  <option value="brave">Brave</option>
                </select>
              </div>
            )}
            <svg className="aisearchbar-search-icon" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="11" cy="11" r="8" />
              <line x1="21" y1="21" x2="16.65" y2="16.65" />
            </svg>
            <input
              type="text"
              className="aisearchbar-input"
              value={searchValue}
              onChange={e => setSearchValue(e.target.value)}
              placeholder="Type a URL or search..."
            />
            <span className="aisearchbar-keycap-hint">ESC</span>
          </div>
        </form>
      ) : (
        <form className="aisearchbar-ai-form" onSubmit={handlePromptSubmit}>
          <div className="aisearchbar-ai-top-row">
            <div className="aisearchbar-provider-selector" ref={providerMenuRef}>
              <button
                type="button"
                className="aisearchbar-provider-btn"
                onClick={() => setShowProviderMenu(!showProviderMenu)}
              >
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
                </svg>
                <span>{PROVIDERS.find(p => p.id === activeProvider)?.name || 'Gemini'}</span>
                <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="6 9 12 15 18 9" />
                </svg>
              </button>
              {showProviderMenu && (
                <div className="aisearchbar-provider-dropdown">
                  {PROVIDERS.map(p => (
                    <button
                      key={p.id}
                      type="button"
                      className={`aisearchbar-provider-option ${p.id === activeProvider ? 'active' : ''}`}
                      onClick={() => handleProviderSelect(p.id)}
                    >
                      {p.name}
                      {p.id === activeProvider && (
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                          <polyline points="20 6 9 17 4 12" />
                        </svg>
                      )}
                    </button>
                  ))}
                </div>
              )}
            </div>
            <button
              type="button"
              className="aisearchbar-settings-btn"
              onClick={() => onOpenSettings('models')}
              title="AI Settings"
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="3" />
                <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
              </svg>
            </button>
          </div>

          <div className="aisearchbar-textarea-wrapper">
            <textarea
              ref={textareaRef}
              className="aisearchbar-textarea"
              value={promptValue}
              onChange={e => {
                setPromptValue(e.target.value);
                autoResizeTextarea();
              }}
              placeholder="Ask anything or describe what you want to do..."
              rows={1}
              onKeyDown={e => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  handlePromptSubmit(e);
                }
              }}
            />
            {attachedFile && (
              <div className="aisearchbar-file-chip">
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                  <polyline points="14 2 14 8 20 8" />
                  <line x1="16" y1="13" x2="8" y2="13" />
                  <line x1="16" y1="17" x2="8" y2="17" />
                </svg>
                <span className="aisearchbar-file-name">{attachedFile.name}</span>
                <button type="button" className="aisearchbar-file-remove" onClick={handleRemoveFile}>
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                    <line x1="18" y1="6" x2="6" y2="18" />
                    <line x1="6" y1="6" x2="18" y2="18" />
                  </svg>
                </button>
              </div>
            )}
          </div>

          <div className="aisearchbar-ai-actions">
            <div className="aisearchbar-ai-actions-left">
              <button
                type="button"
                className="aisearchbar-action-btn"
                onClick={handleFilePick}
                title="Attach image"
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48" />
                </svg>
                <span>Attach</span>
              </button>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/png,image/jpeg,image/gif,image/webp"
                style={{ display: 'none' }}
                onChange={handleFileChange}
              />
              {promptValue && (
                <button
                  type="button"
                  className="aisearchbar-action-btn"
                  onClick={() => setPromptValue('')}
                  title="Clear"
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <polyline points="3 6 5 6 21 6" />
                    <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                  </svg>
                </button>
              )}
            </div>
            <button
              type="submit"
              className="aisearchbar-send-btn"
              disabled={!promptValue.trim() && !attachedFile}
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <line x1="22" y1="2" x2="11" y2="13" />
                <polygon points="22 2 15 22 11 13 2 9 22 2" />
              </svg>
              <span>Send</span>
            </button>
          </div>

          <div className="aisearchbar-suggestions">
            {SUGGESTIONS.map((s, i) => (
              <button
                key={i}
                type="button"
                className="aisearchbar-suggestion-chip"
                onClick={() => handleSuggestionClick(s.prompt)}
              >
                {s.label}
              </button>
            ))}
          </div>
        </form>
      )}
    </div>
  );
}
