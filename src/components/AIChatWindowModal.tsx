import React, { useState, useRef, useEffect } from 'react';
import { ChatMessage } from '../utils/storage';
import { PROVIDERS } from '../utils/providers';
import { useToast } from './Toast';

interface AIChatWindowModalProps {
  isOpen: boolean;
  onClose: () => void;
  initialPrompt?: string;
  initialFiles?: Array<{ inlineData: { mimeType: string; data: string } }>;
  onSendMessage: (message: string, files?: Array<{ inlineData: { mimeType: string; data: string } }>) => void;
  messages: ChatMessage[];
  isLoading: boolean;
  onClearChat: () => void;
  onOpenSettings: (tab?: string) => void;
  onOpenCommandCenter?: () => void;
  activeTabTitle?: string;
  activeTabUrl?: string;
  apiKeys?: Record<string, string>;
}

const QUICK_ACTIONS = [
  { id: 'summarize', label: 'Summarize Tab', prompt: 'Summarize the key takeaways and crucial data points from the currently active web page.', icon: 'file-text' },
  { id: 'code', label: 'Explain Code', prompt: 'Explain the technical architecture and logic of this code step-by-step with examples.', icon: 'code' },
  { id: 'email', label: 'Draft Executive Email', prompt: 'Draft a concise, professional executive email summarizing the latest project progress.', icon: 'mail' },
  { id: 'research', label: 'Deep Web Research', prompt: 'Conduct a comprehensive research analysis on the following topic with cited sources:', icon: 'search' },
  { id: 'agent-shop', label: 'Autonomous Web Shop', prompt: 'Agent: Search the web, compare top rated options under $50, and identify the highest value purchase.', icon: 'shopping-cart' },
];

export function AIChatWindowModal({
  isOpen,
  onClose,
  initialPrompt = '',
  initialFiles,
  onSendMessage,
  messages,
  isLoading,
  onClearChat,
  onOpenSettings,
  onOpenCommandCenter,
  activeTabTitle,
  activeTabUrl,
  apiKeys = {},
}: AIChatWindowModalProps) {
  const { error } = useToast();
  const [input, setInput] = useState(initialPrompt);
  const [attachedFiles, setAttachedFiles] = useState<Array<{ name: string; data: string; mimeType: string }>>([]);
  const [selectedModel, setSelectedModel] = useState(() => {
    const hasCloudKeys = Object.keys(apiKeys).some(k => k !== 'local' && apiKeys[k]);
    return hasCloudKeys ? 'gemini-2.5-flash' : 'ollama-local';
  });
  const [showModelDropdown, setShowModelDropdown] = useState(false);
  const [isAgentMode, setIsAgentMode] = useState(false);
  const [includePageContext, setIncludePageContext] = useState(true);
  const [includeHistory, setIncludeHistory] = useState(false);
  const [webGrounding, setWebGrounding] = useState(true);
  const [windowSize, setWindowSize] = useState<'normal' | 'fullscreen' | 'compact'>('normal');
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [isVoiceListening, setIsVoiceListening] = useState(false);

  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const modelMenuRef = useRef<HTMLDivElement>(null);

  // Sync initial prompt if passed
  useEffect(() => {
    if (initialPrompt) {
      setInput(initialPrompt);
    }
  }, [initialPrompt]);

  // Handle escape key to close
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isOpen) {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  // Scroll to bottom on new messages
  useEffect(() => {
    if (isOpen) {
      messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages, isLoading, isOpen]);

  // Close model menu when clicked outside
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (modelMenuRef.current && !modelMenuRef.current.contains(e.target as Node)) {
        setShowModelDropdown(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  if (!isOpen) return null;

  const handleSend = (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if ((!input.trim() && attachedFiles.length === 0) || isLoading) return;

    let finalPrompt = input.trim();
    if (isAgentMode && !finalPrompt.toLowerCase().startsWith('agent:')) {
      finalPrompt = `Agent: ${finalPrompt}`;
    }

    const filesPayload = attachedFiles.length > 0
      ? attachedFiles.map(f => ({ inlineData: { mimeType: f.mimeType, data: f.data } }))
      : undefined;

    onSendMessage(finalPrompt, filesPayload);
    setInput('');
    setAttachedFiles([]);
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 15 * 1024 * 1024) {
      error('Attachment too large. Maximum file size is 15MB.');
      return;
    }
    const mimeType = file.type || 'image/png';
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result as string;
      const base64 = result.split(',')[1];
      setAttachedFiles(prev => [...prev, { name: file.name, data: base64, mimeType }]);
    };
    reader.readAsDataURL(file);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const handleCopyMessage = (id: string, text: string) => {
    navigator.clipboard.writeText(text).then(() => {
      setCopiedId(id);
      setTimeout(() => setCopiedId(null), 2000);
    });
  };

  const recognitionRef = useRef<SpeechRecognition | null>(null);

  const handleVoiceToggle = () => {
    if (isVoiceListening) {
      recognitionRef.current?.stop();
      setIsVoiceListening(false);
      return;
    }

    const SpeechRecognitionAPI = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognitionAPI) {
      error('Speech recognition is not supported in this browser.');
      return;
    }

    const recognition = new SpeechRecognitionAPI();
    recognition.continuous = false;
    recognition.interimResults = true;
    recognition.lang = 'en-US';

    recognition.onresult = (event: SpeechRecognitionEvent) => {
      let transcript = '';
      for (let i = 0; i < event.results.length; i++) {
        transcript += event.results[i][0].transcript;
      }
      setInput(prev => prev + transcript);
    };

    recognition.onend = () => {
      setIsVoiceListening(false);
      recognitionRef.current = null;
    };

    recognition.onerror = (event: SpeechRecognitionErrorEvent) => {
      if (event.error !== 'aborted') {
        error(`Speech recognition error: ${event.error}`);
      }
      setIsVoiceListening(false);
      recognitionRef.current = null;
    };

    recognitionRef.current = recognition;
    recognition.start();
    setIsVoiceListening(true);
  };

  const currentModel = (() => {
    for (const p of PROVIDERS) {
      const found = p.models.find(m => m === selectedModel);
      if (found) return { id: found, name: found, provider: p.name, badge: p.name };
    }
    return { id: selectedModel, name: selectedModel, provider: 'AI', badge: 'AI' };
  })();

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 99999,
        background: 'rgba(5, 5, 8, 0.75)',
        backdropFilter: 'blur(16px)',
        WebkitBackdropFilter: 'blur(16px)',
        display: 'flex',
        alignItems: windowSize === 'compact' ? 'flex-end' : 'center',
        justifyContent: 'center',
        padding: windowSize === 'fullscreen' ? '0' : windowSize === 'compact' ? '24px' : '28px',
        animation: 'fadeIn 0.2s ease',
      }}
    >
      <div
        style={{
          width: windowSize === 'fullscreen' ? '100vw' : windowSize === 'compact' ? '460px' : '880px',
          height: windowSize === 'fullscreen' ? '100vh' : windowSize === 'compact' ? '560px' : '720px',
          maxHeight: windowSize === 'fullscreen' ? '100vh' : '90vh',
          background: 'rgba(13, 13, 17, 0.96)',
          border: '1px solid rgba(212, 175, 55, 0.25)',
          borderRadius: windowSize === 'fullscreen' ? '0' : '24px',
          boxShadow: '0 32px 80px rgba(0, 0, 0, 0.9), 0 0 1px 1px rgba(255, 255, 255, 0.1)',
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
          color: '#e5e5e5',
          fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
          position: 'relative',
        }}
      >
        {/* ─── Top Window Navigation Chrome ─── */}
        <header
          style={{
            padding: '14px 20px',
            borderBottom: '1px solid rgba(255, 255, 255, 0.08)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            background: 'rgba(18, 18, 24, 0.8)',
            backdropFilter: 'blur(12px)',
          }}
        >
          {/* Brand & Model Selector */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <div
                style={{
                  width: '28px',
                  height: '28px',
                  borderRadius: '8px',
                  background: 'linear-gradient(135deg, #d4af37, #f2ca50)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  color: '#000',
                  boxShadow: '0 0 14px rgba(212, 175, 55, 0.4)',
                }}
              >
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                  <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
                </svg>
              </div>
              <span
                style={{
                  fontFamily: 'Playfair Display, Georgia, serif',
                  fontSize: '16px',
                  fontWeight: '700',
                  letterSpacing: '0.02em',
                  color: '#ffffff',
                }}
              >
                ICRUSH AI Studio
              </span>
            </div>

            {/* Model Dropdown Trigger */}
            <div style={{ position: 'relative' }} ref={modelMenuRef}>
              <button
                type="button"
                onClick={() => setShowModelDropdown(!showModelDropdown)}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px',
                  background: 'rgba(255, 255, 255, 0.05)',
                  border: '1px solid rgba(255, 255, 255, 0.12)',
                  borderRadius: '9999px',
                  padding: '4px 12px',
                  fontSize: '11px',
                  fontWeight: '600',
                  color: '#d4af37',
                  cursor: 'pointer',
                  transition: 'all 0.15s ease',
                }}
              >
                <span>{currentModel.name}</span>
                <span
                  style={{
                    fontSize: '9px',
                    padding: '1px 5px',
                    borderRadius: '9999px',
                    background: 'rgba(212, 175, 55, 0.15)',
                    color: '#f2ca50',
                    textTransform: 'uppercase',
                    letterSpacing: '0.08em',
                  }}
                >
                  {currentModel.badge}
                </span>
                <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                  <polyline points="6 9 12 15 18 9" />
                </svg>
              </button>

              {showModelDropdown && (
                <div
                  style={{
                    position: 'absolute',
                    top: 'calc(100% + 8px)',
                    left: 0,
                    width: '260px',
                    background: 'rgba(18, 18, 24, 0.98)',
                    border: '1px solid rgba(212, 175, 55, 0.3)',
                    borderRadius: '16px',
                    boxShadow: '0 16px 48px rgba(0, 0, 0, 0.9)',
                    padding: '6px',
                    zIndex: 100,
                  }}
                >
                  <div style={{ padding: '6px 10px', fontSize: '10px', fontWeight: '700', textTransform: 'uppercase', letterSpacing: '0.2em', color: '#71717a' }}>
                    Select Neural Engine
                  </div>
                  {PROVIDERS.filter(p => p.id !== 'local' && apiKeys[p.id]).map(p => (
                    <React.Fragment key={p.id}>
                      <div style={{ padding: '4px 10px', fontSize: '9px', fontWeight: '700', textTransform: 'uppercase', letterSpacing: '0.15em', color: '#555', marginTop: '4px' }}>
                        {p.name}
                      </div>
                      {p.models.map(m => (
                        <button
                          key={m}
                          type="button"
                          onClick={() => {
                            setSelectedModel(m);
                            setShowModelDropdown(false);
                          }}
                          style={{
                            width: '100%',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'space-between',
                            padding: '8px 10px',
                            borderRadius: '10px',
                            background: m === selectedModel ? 'rgba(212, 175, 55, 0.15)' : 'transparent',
                            border: m === selectedModel ? '1px solid rgba(212, 175, 55, 0.3)' : '1px solid transparent',
                            color: m === selectedModel ? '#ffffff' : '#a1a1aa',
                            fontSize: '12px',
                            fontWeight: '500',
                            cursor: 'pointer',
                            textAlign: 'left',
                          }}
                        >
                          <div>
                            <div>{m}</div>
                          </div>
                        </button>
                      ))}
                    </React.Fragment>
                  ))}
                  <button
                    type="button"
                    onClick={() => {
                      setSelectedModel('ollama-local');
                      setShowModelDropdown(false);
                    }}
                    style={{
                      width: '100%',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      padding: '8px 10px',
                      borderRadius: '10px',
                      background: selectedModel === 'ollama-local' ? 'rgba(212, 175, 55, 0.15)' : 'transparent',
                      border: selectedModel === 'ollama-local' ? '1px solid rgba(212, 175, 55, 0.3)' : '1px solid transparent',
                      color: selectedModel === 'ollama-local' ? '#ffffff' : '#a1a1aa',
                      fontSize: '12px',
                      fontWeight: '500',
                      cursor: 'pointer',
                      textAlign: 'left',
                    }}
                  >
                    <div>
                      <div>Local Ollama</div>
                      <div style={{ fontSize: '10px', color: '#71717a' }}>Auto-detect installed model</div>
                    </div>
                  </button>
                </div>
              )}
            </div>

            {/* Aura Nexus Command Center Button */}
            {onOpenCommandCenter && (
              <button
                type="button"
                onClick={onOpenCommandCenter}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px',
                  background: 'rgba(16, 185, 129, 0.12)',
                  border: '1px solid rgba(16, 185, 129, 0.35)',
                  borderRadius: '9999px',
                  padding: '3px 10px',
                  fontSize: '10px',
                  fontWeight: '700',
                  color: '#10b981',
                  cursor: 'pointer',
                  letterSpacing: '0.04em',
                }}
                title="Open Agent Skills, Vault, MCP & Task Scheduler"
              >
                <span style={{ width: '6px', height: '6px', borderRadius: '50%', background: '#10b981', boxShadow: '0 0 6px #10b981' }} />
                Aura Nexus Engine
              </button>
            )}
          </div>

          {/* Window Actions */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <button
              type="button"
              onClick={onClearChat}
              title="Clear Conversation"
              style={{
                width: '28px',
                height: '28px',
                borderRadius: '8px',
                background: 'rgba(255, 255, 255, 0.05)',
                border: '1px solid rgba(255, 255, 255, 0.1)',
                color: '#a1a1aa',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <polyline points="3 6 5 6 21 6" />
                <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
              </svg>
            </button>

            <button
              type="button"
              onClick={() => onOpenSettings('models')}
              title="Settings"
              style={{
                width: '28px',
                height: '28px',
                borderRadius: '8px',
                background: 'rgba(255, 255, 255, 0.05)',
                border: '1px solid rgba(255, 255, 255, 0.1)',
                color: '#a1a1aa',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <circle cx="12" cy="12" r="3" />
                <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
              </svg>
            </button>

            <button
              type="button"
              onClick={() => setWindowSize(prev => prev === 'fullscreen' ? 'normal' : 'fullscreen')}
              title={windowSize === 'fullscreen' ? 'Restore Size' : 'Expand Fullscreen'}
              style={{
                width: '28px',
                height: '28px',
                borderRadius: '8px',
                background: 'rgba(255, 255, 255, 0.05)',
                border: '1px solid rgba(255, 255, 255, 0.1)',
                color: '#a1a1aa',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                {windowSize === 'fullscreen' ? (
                  <path d="M8 3v3a2 2 0 0 1-2 2H3m18 0h-3a2 2 0 0 1-2-2V3m0 18v-3a2 2 0 0 1 2-2h3M3 16h3a2 2 0 0 1 2 2v3" />
                ) : (
                  <path d="M15 3h6v6M9 21H3v-6M21 3l-7 7M3 21l7-7" />
                )}
              </svg>
            </button>

            <button
              type="button"
              onClick={onClose}
              title="Close (Esc)"
              style={{
                width: '28px',
                height: '28px',
                borderRadius: '8px',
                background: 'rgba(239, 68, 68, 0.15)',
                border: '1px solid rgba(239, 68, 68, 0.3)',
                color: '#f87171',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                marginLeft: '4px',
              }}
            >
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                <line x1="18" y1="6" x2="6" y2="18" />
                <line x1="6" y1="6" x2="18" y2="18" />
              </svg>
            </button>
          </div>
        </header>

        {/* ─── Mode & Context Control Strip ─── */}
        <div
          style={{
            padding: '8px 20px',
            background: 'rgba(10, 10, 14, 0.7)',
            borderBottom: '1px solid rgba(255, 255, 255, 0.05)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            flexWrap: 'wrap',
            gap: '8px',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            {/* Agent Mode Toggle */}
            <button
              type="button"
              onClick={() => setIsAgentMode(!isAgentMode)}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '5px',
                background: isAgentMode ? 'rgba(212, 175, 55, 0.2)' : 'rgba(255, 255, 255, 0.04)',
                border: isAgentMode ? '1px solid rgba(212, 175, 55, 0.6)' : '1px solid rgba(255, 255, 255, 0.08)',
                borderRadius: '9999px',
                padding: '4px 10px',
                fontSize: '11px',
                fontWeight: '600',
                color: isAgentMode ? '#f2ca50' : '#a1a1aa',
                cursor: 'pointer',
                transition: 'all 0.15s ease',
              }}
            >
              <span style={{ width: '6px', height: '6px', borderRadius: '50%', background: isAgentMode ? '#f2ca50' : '#71717a' }} />
              ⚡ Agent Mode
            </button>

            {/* Page Context Toggle */}
            <button
              type="button"
              onClick={() => setIncludePageContext(!includePageContext)}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '5px',
                background: includePageContext ? 'rgba(59, 130, 246, 0.15)' : 'rgba(255, 255, 255, 0.04)',
                border: includePageContext ? '1px solid rgba(59, 130, 246, 0.4)' : '1px solid rgba(255, 255, 255, 0.08)',
                borderRadius: '9999px',
                padding: '4px 10px',
                fontSize: '11px',
                fontWeight: '600',
                color: includePageContext ? '#60a5fa' : '#a1a1aa',
                cursor: 'pointer',
                transition: 'all 0.15s ease',
              }}
            >
              <span style={{ width: '6px', height: '6px', borderRadius: '50%', background: includePageContext ? '#60a5fa' : '#71717a' }} />
              🌐 Page Context
            </button>

            {/* Web Grounding Toggle */}
            <button
              type="button"
              onClick={() => setWebGrounding(!webGrounding)}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '5px',
                background: webGrounding ? 'rgba(16, 185, 129, 0.15)' : 'rgba(255, 255, 255, 0.04)',
                border: webGrounding ? '1px solid rgba(16, 185, 129, 0.4)' : '1px solid rgba(255, 255, 255, 0.08)',
                borderRadius: '9999px',
                padding: '4px 10px',
                fontSize: '11px',
                fontWeight: '600',
                color: webGrounding ? '#34d399' : '#a1a1aa',
                cursor: 'pointer',
                transition: 'all 0.15s ease',
              }}
            >
              <span style={{ width: '6px', height: '6px', borderRadius: '50%', background: webGrounding ? '#34d399' : '#71717a' }} />
              🔍 Web Search
            </button>
          </div>

          {activeTabTitle && (
            <div
              style={{
                fontSize: '11px',
                color: '#71717a',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
                maxWidth: '280px',
              }}
              title={activeTabUrl}
            >
              Linked: <span style={{ color: '#d4d4d8' }}>{activeTabTitle}</span>
            </div>
          )}
        </div>

        {/* ─── Main Conversation Area ─── */}
        <div
          style={{
            flex: 1,
            overflowY: 'auto',
            padding: '24px 20px',
            display: 'flex',
            flexDirection: 'column',
            gap: '18px',
          }}
        >
          {messages.length === 0 ? (
            /* Empty State: Aurelian Obsidian Welcome Screen */
            <div
              style={{
                margin: 'auto 0',
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                textAlign: 'center',
                padding: '20px 10px',
              }}
            >
              <div
                style={{
                  width: '56px',
                  height: '56px',
                  borderRadius: '50%',
                  background: 'rgba(212, 175, 55, 0.1)',
                  border: '1px solid rgba(212, 175, 55, 0.4)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  color: '#d4af37',
                  marginBottom: '16px',
                  boxShadow: '0 0 24px rgba(212, 175, 55, 0.25)',
                }}
              >
                <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
                </svg>
              </div>

              <h2
                style={{
                  fontFamily: 'Playfair Display, Georgia, serif',
                  fontSize: '24px',
                  fontWeight: '700',
                  color: '#ffffff',
                  marginBottom: '6px',
                  letterSpacing: '0.01em',
                }}
              >
                How may I assist your workflow?
              </h2>

              <p
                style={{
                  fontSize: '13px',
                  color: '#a1a1aa',
                  maxWidth: '480px',
                  lineHeight: '1.5',
                  marginBottom: '24px',
                }}
              >
                Query information, generate code, summarize web pages, or activate autonomous browsing agents.
              </p>

              {/* Quick Action Chips Grid */}
              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
                  gap: '10px',
                  width: '100%',
                  maxWidth: '680px',
                }}
              >
                {QUICK_ACTIONS.map(action => (
                  <button
                    key={action.id}
                    type="button"
                    onClick={() => {
                      setInput(action.prompt);
                      if (action.id.startsWith('agent')) {
                        setIsAgentMode(true);
                      }
                      textareaRef.current?.focus();
                    }}
                    style={{
                      background: 'rgba(255, 255, 255, 0.03)',
                      border: '1px solid rgba(255, 255, 255, 0.08)',
                      borderRadius: '14px',
                      padding: '12px 14px',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '10px',
                      color: '#d4d4d8',
                      fontSize: '12px',
                      fontWeight: '600',
                      cursor: 'pointer',
                      textAlign: 'left',
                      transition: 'all 0.2s ease',
                    }}
                    onMouseEnter={e => {
                      e.currentTarget.style.background = 'rgba(212, 175, 55, 0.08)';
                      e.currentTarget.style.borderColor = 'rgba(212, 175, 55, 0.3)';
                    }}
                    onMouseLeave={e => {
                      e.currentTarget.style.background = 'rgba(255, 255, 255, 0.03)';
                      e.currentTarget.style.borderColor = 'rgba(255, 255, 255, 0.08)';
                    }}
                  >
                    <span style={{ color: '#d4af37', display: 'flex' }}>
                      {action.icon === 'file-text' && (
                        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                          <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><polyline points="14 2 14 8 20 8" />
                        </svg>
                      )}
                      {action.icon === 'code' && (
                        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                          <polyline points="16 18 22 12 16 6" /><polyline points="8 6 2 12 8 18" />
                        </svg>
                      )}
                      {action.icon === 'mail' && (
                        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                          <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z" /><polyline points="22,6 12,13 2,6" />
                        </svg>
                      )}
                      {action.icon === 'search' && (
                        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                          <circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" />
                        </svg>
                      )}
                      {action.icon === 'shopping-cart' && (
                        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                          <circle cx="9" cy="21" r="1" /><circle cx="20" cy="21" r="1" />
                          <path d="M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6" />
                        </svg>
                      )}
                    </span>
                    <span>{action.label}</span>
                  </button>
                ))}
              </div>
            </div>
          ) : (
            /* Render Messages */
            messages.map(msg => (
              <div
                key={msg.id}
                style={{
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: msg.role === 'user' ? 'flex-end' : 'flex-start',
                  gap: '4px',
                }}
              >
                <div
                  style={{
                    fontSize: '10px',
                    fontWeight: '700',
                    textTransform: 'uppercase',
                    letterSpacing: '0.2em',
                    color: msg.role === 'user' ? '#d4af37' : '#10b981',
                    marginBottom: '2px',
                    paddingLeft: msg.role === 'user' ? '0' : '4px',
                    paddingRight: msg.role === 'user' ? '4px' : '0',
                  }}
                >
                  {msg.role === 'user' ? 'You' : `${currentModel.name}`}
                </div>

                <div
                  style={{
                    maxWidth: '82%',
                    background:
                      msg.role === 'user'
                        ? 'rgba(212, 175, 55, 0.12)'
                        : 'rgba(24, 24, 32, 0.92)',
                    border:
                      msg.role === 'user'
                        ? '1px solid rgba(212, 175, 55, 0.35)'
                        : '1px solid rgba(255, 255, 255, 0.08)',
                    borderRadius:
                      msg.role === 'user'
                        ? '18px 18px 4px 18px'
                        : '18px 18px 18px 4px',
                    padding: '12px 16px',
                    color: '#f4f4f5',
                    fontSize: '13.5px',
                    lineHeight: '1.6',
                    whiteSpace: 'pre-wrap',
                    wordBreak: 'break-word',
                    boxShadow: '0 4px 16px rgba(0, 0, 0, 0.3)',
                    position: 'relative',
                  }}
                >
                  {msg.content}
                </div>

                {/* Message Action Bar */}
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '6px',
                    paddingLeft: msg.role === 'user' ? '0' : '4px',
                    paddingRight: msg.role === 'user' ? '4px' : '0',
                  }}
                >
                  <button
                    type="button"
                    onClick={() => handleCopyMessage(msg.id, msg.content)}
                    style={{
                      background: 'transparent',
                      border: 'none',
                      color: copiedId === msg.id ? '#10b981' : '#71717a',
                      fontSize: '10px',
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '4px',
                      padding: '2px 4px',
                    }}
                  >
                    <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
                      <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
                    </svg>
                    <span>{copiedId === msg.id ? 'Copied' : 'Copy'}</span>
                  </button>
                </div>
              </div>
            ))
          )}

          {/* Loading streaming indicator */}
          {isLoading && (
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '8px 12px', background: 'rgba(16, 185, 129, 0.1)', border: '1px solid rgba(16, 185, 129, 0.3)', borderRadius: '12px', width: 'fit-content' }}>
              <div style={{ width: '8px', height: '8px', borderRadius: '50%', background: '#10b981', boxShadow: '0 0 8px #10b981', animation: 'pulse 1.2s infinite' }} />
              <span style={{ fontSize: '11px', color: '#10b981', fontWeight: '600' }}>
                {isAgentMode ? 'Mimo Agent executing autonomous action...' : `${currentModel.name} generating response...`}
              </span>
            </div>
          )}
          <div ref={messagesEndRef} />
        </div>

        {/* ─── Bottom Multi-Modal Input Capsule ─── */}
        <div
          style={{
            padding: '16px 20px',
            background: 'rgba(15, 15, 20, 0.95)',
            borderTop: '1px solid rgba(255, 255, 255, 0.08)',
          }}
        >
          {/* File attachment preview bar */}
          {attachedFiles.length > 0 && (
            <div style={{ display: 'flex', gap: '8px', marginBottom: '10px', flexWrap: 'wrap' }}>
              {attachedFiles.map((file, idx) => (
                <div
                  key={idx}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '6px',
                    background: 'rgba(212, 175, 55, 0.15)',
                    border: '1px solid rgba(212, 175, 55, 0.4)',
                    borderRadius: '8px',
                    padding: '4px 8px',
                    fontSize: '11px',
                    color: '#ffffff',
                  }}
                >
                  <img
                    src={`data:${file.mimeType};base64,${file.data}`}
                    alt=""
                    style={{ width: '16px', height: '16px', borderRadius: '4px', objectFit: 'cover' }}
                  />
                  <span style={{ maxWidth: '140px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{file.name}</span>
                  <button
                    type="button"
                    onClick={() => setAttachedFiles(prev => prev.filter((_, i) => i !== idx))}
                    style={{ background: 'none', border: 'none', color: '#f87171', cursor: 'pointer', padding: 0 }}
                  >
                    ✕
                  </button>
                </div>
              ))}
            </div>
          )}

          <form
            onSubmit={handleSend}
            style={{
              display: 'flex',
              alignItems: 'flex-end',
              gap: '10px',
              background: 'rgba(24, 24, 32, 0.8)',
              border: '1px solid rgba(255, 255, 255, 0.12)',
              borderRadius: '16px',
              padding: '8px 12px',
              transition: 'border-color 0.2s ease',
            }}
          >
            {/* Attachment Button */}
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              style={{
                width: '32px',
                height: '32px',
                borderRadius: '8px',
                background: 'rgba(255, 255, 255, 0.05)',
                border: 'none',
                color: '#a1a1aa',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                flexShrink: 0,
              }}
              title="Attach Image / Document"
            >
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48" />
              </svg>
            </button>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*,.pdf,.txt,.js,.ts,.json"
              style={{ display: 'none' }}
              onChange={handleFileChange}
            />

            {/* Voice Dictation Button */}
            <button
              type="button"
              onClick={handleVoiceToggle}
              style={{
                width: '32px',
                height: '32px',
                borderRadius: '8px',
                background: isVoiceListening ? 'rgba(239, 68, 68, 0.2)' : 'rgba(255, 255, 255, 0.05)',
                border: isVoiceListening ? '1px solid #ef4444' : 'none',
                color: isVoiceListening ? '#ef4444' : '#a1a1aa',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                flexShrink: 0,
              }}
              title={isVoiceListening ? 'Listening...' : 'Voice Dictation'}
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z" />
                <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
                <line x1="12" y1="19" x2="12" y2="23" />
                <line x1="8" y1="23" x2="16" y2="23" />
              </svg>
            </button>

            {/* Auto-resizing Textarea */}
            <textarea
              ref={textareaRef}
              value={input}
              onChange={e => {
                setInput(e.target.value);
                e.target.style.height = 'auto';
                e.target.style.height = `${Math.min(e.target.scrollHeight, 140)}px`;
              }}
              onKeyDown={e => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  handleSend();
                }
              }}
              placeholder={isAgentMode ? "Instruct Agent (e.g. 'Shop on Amazon for best noise cancelling headphones under $100')..." : "Ask anything or command neural models (Shift+Enter for newline)..."}
              rows={1}
              style={{
                flex: 1,
                background: 'transparent',
                border: 'none',
                color: '#ffffff',
                fontSize: '13.5px',
                lineHeight: '1.5',
                resize: 'none',
                outline: 'none',
                maxHeight: '140px',
                padding: '6px 4px',
                fontFamily: 'inherit',
              }}
            />

            {/* Send Button */}
            <button
              type="submit"
              disabled={(!input.trim() && attachedFiles.length === 0) || isLoading}
              style={{
                height: '34px',
                padding: '0 16px',
                borderRadius: '10px',
                background: (input.trim() || attachedFiles.length > 0) && !isLoading ? '#d4af37' : 'rgba(255, 255, 255, 0.08)',
                border: 'none',
                color: (input.trim() || attachedFiles.length > 0) && !isLoading ? '#000000' : '#71717a',
                fontSize: '12px',
                fontWeight: '700',
                letterSpacing: '0.04em',
                cursor: (input.trim() || attachedFiles.length > 0) && !isLoading ? 'pointer' : 'default',
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
                transition: 'all 0.15s ease',
                flexShrink: 0,
              }}
            >
              <span>Send</span>
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                <line x1="22" y1="2" x2="11" y2="13" />
                <polygon points="22 2 15 22 11 13 2 9 22 2" />
              </svg>
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
