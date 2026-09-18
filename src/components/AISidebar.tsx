import React, { useState, useRef, useEffect, memo } from 'react';
import { ChatMessage } from '../utils/storage';

interface GeminiErrorInfo {
  shouldRetry: boolean;
  retryAfter?: number;
}

interface FilePart {
  inlineData: {
    mimeType: string;
    data: string;
  };
}

interface AISidebarProps {
  isOpen: boolean;
  messages: ChatMessage[];
  isLoading: boolean;
  onSendMessage: (text: string, files?: FilePart[]) => void;
  onClearChat: () => void;
  includeContext: boolean;
  onToggleContext: (value: boolean) => void;
  includeHistory: boolean;
  onToggleHistory: (value: boolean) => void;
  isAgentMode: boolean;
  onToggleAgentMode: (value: boolean) => void;
  onSummarizePage: () => void;
  agentStatus: string;
  agentConfirmAction: {
    type: string;
    description: string;
    resolve: (confirmed: boolean) => void;
  } | null;
  onAgentConfirmResponse: (confirmed: boolean) => void;
  onAgentUndo?: () => void;
  canUndo?: boolean;
  onCancelAgent?: () => void;
  onOpenSettings: () => void;
  onCollapse: () => void;
  geminiError: GeminiErrorInfo | null;
  onClearGeminiError: () => void;
  onCreateTab?: (url: string) => void;
  activeProvider: string;
  onCloudAssist?: (text: string) => void;
  isCloudAssistDisabled?: boolean;
  cloudAssistTooltip?: string;
  onOpenCommandCenter?: () => void;
  onOpenFullDashboard?: () => void;
}

/* ─────────────────────────────────────────────────────────────
   Crisp Minimal SVG Line Icons (No Emojis - Professional Style)
   ───────────────────────────────────────────────────────────── */

const IconCpu = () => (
  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <rect x="4" y="4" width="16" height="16" rx="2" />
    <rect x="9" y="9" width="6" height="6" />
    <line x1="9" y1="1" x2="9" y2="4" /><line x1="15" y1="1" x2="15" y2="4" />
    <line x1="9" y1="20" x2="9" y2="23" /><line x1="15" y1="20" x2="15" y2="23" />
    <line x1="20" y1="9" x2="23" y2="9" /><line x1="20" y1="15" x2="23" y2="15" />
    <line x1="1" y1="9" x2="4" y2="9" /><line x1="1" y1="15" x2="4" y2="15" />
  </svg>
);

const IconSettings = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="12" cy="12" r="3" />
    <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
  </svg>
);

const IconNewChat = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M12 5v14M5 12h14" />
  </svg>
);

const IconExpand = () => (
  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <polyline points="15 3 21 3 21 9" />
    <polyline points="9 21 3 21 3 15" />
    <line x1="21" y1="3" x2="14" y2="10" />
    <line x1="3" y1="21" x2="10" y2="14" />
  </svg>
);

const IconClose = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
  </svg>
);

const IconSend = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
    <line x1="22" y1="2" x2="11" y2="13" />
    <polygon points="22 2 15 22 11 13 2 9 22 2" />
  </svg>
);

const IconPaperclip = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48" />
  </svg>
);

const IconSparkles = () => (
  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" />
  </svg>
);

const IconFileText = () => (
  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
    <polyline points="14 2 14 8 20 8" /><line x1="16" y1="13" x2="8" y2="13" /><line x1="16" y1="17" x2="8" y2="17" />
  </svg>
);

const IconCode = () => (
  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <polyline points="16 18 22 12 16 6" /><polyline points="8 6 2 12 8 18" />
  </svg>
);

const IconSearch = () => (
  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" />
  </svg>
);

const IconShield = () => (
  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
  </svg>
);

const IconCopy = () => (
  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
    <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
  </svg>
);

const IconCheck = () => (
  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
    <polyline points="20 6 9 17 4 12" />
  </svg>
);

export const AISidebar = memo(function AISidebar({
  isOpen,
  messages,
  isLoading,
  onSendMessage,
  onClearChat,
  includeContext,
  onToggleContext,
  includeHistory,
  onToggleHistory,
  isAgentMode,
  onToggleAgentMode,
  onSummarizePage,
  agentStatus,
  agentConfirmAction,
  onAgentConfirmResponse,
  onAgentUndo,
  canUndo,
  onCancelAgent,
  onOpenSettings,
  onCollapse,
  geminiError,
  onClearGeminiError,
  onCreateTab,
  activeProvider,
  onCloudAssist,
  isCloudAssistDisabled,
  cloudAssistTooltip,
  onOpenCommandCenter,
  onOpenFullDashboard,
}: AISidebarProps) {
  const [inputText, setInputText] = useState('');
  const [attachedFiles, setAttachedFiles] = useState<FilePart[]>([]);
  const [copiedIndex, setCopiedIndex] = useState<number | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, isLoading]);

  useEffect(() => {
    const handlePrepopulate = (e: CustomEvent<{ prompt: string }>) => {
      if (e.detail && e.detail.prompt) {
        setInputText(e.detail.prompt);
        textareaRef.current?.focus();
      }
    };
    window.addEventListener('ai-prepopulate-prompt' as any, handlePrepopulate as any);
    return () => {
      window.removeEventListener('ai-prepopulate-prompt' as any, handlePrepopulate as any);
    };
  }, []);

  const handleSend = () => {
    if (!inputText.trim() && attachedFiles.length === 0) return;
    onSendMessage(inputText, attachedFiles.length > 0 ? attachedFiles : undefined);
    setInputText('');
    setAttachedFiles([]);
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files) return;

    Array.from(files).forEach(file => {
      const reader = new FileReader();
      reader.onload = () => {
        const base64 = (reader.result as string).split(',')[1];
        setAttachedFiles(prev => [
          ...prev,
          {
            inlineData: {
              mimeType: file.type,
              data: base64,
            },
          },
        ]);
      };
      reader.readAsDataURL(file);
    });
  };

  const copyToClipboard = (text: string, index: number) => {
    navigator.clipboard.writeText(text);
    setCopiedIndex(index);
    setTimeout(() => setCopiedIndex(null), 2000);
  };

  const handleOpenFullTab = () => {
    if (onOpenFullDashboard) {
      onOpenFullDashboard();
    } else if (onCreateTab) {
      onCreateTab('about:ai');
    }
  };

  if (!isOpen) return null;

  return (
    <aside
      className="ai-sidebar"
      style={{
        width: '390px',
        height: '100%',
        background: 'rgba(10, 10, 14, 0.96)',
        borderLeft: '1px solid rgba(255, 255, 255, 0.1)',
        display: 'flex',
        flexDirection: 'column',
        boxShadow: '-12px 0 40px rgba(0, 0, 0, 0.7)',
        backdropFilter: 'blur(24px)',
        WebkitBackdropFilter: 'blur(24px)',
        zIndex: 50,
        userSelect: 'none',
      }}
    >
      {/* ─── Top Control Header ─── */}
      <div
        style={{
          padding: '12px 16px',
          borderBottom: '1px solid rgba(255, 255, 255, 0.08)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          background: 'rgba(18, 18, 24, 0.85)',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <button
            type="button"
            onClick={onOpenCommandCenter}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              background: 'rgba(212, 175, 55, 0.12)',
              border: '1px solid rgba(212, 175, 55, 0.35)',
              borderRadius: '9999px',
              padding: '4px 10px',
              color: '#f2ca50',
              cursor: 'pointer',
              fontSize: '11px',
              fontWeight: '700',
              letterSpacing: '0.04em',
              transition: 'all 0.15s ease',
            }}
            title="Open Neural Command Center"
          >
            <IconCpu />
            <span>Neural Studio</span>
          </button>

          <span
            style={{
              fontSize: '10px',
              fontWeight: '700',
              textTransform: 'uppercase',
              color: '#71717a',
              letterSpacing: '0.12em',
            }}
          >
            {activeProvider.toUpperCase()}
          </span>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
          <button
            type="button"
            onClick={onClearChat}
            title="New Conversation / Clear"
            style={{
              background: 'transparent',
              border: 'none',
              color: '#a1a1aa',
              padding: '6px',
              borderRadius: '6px',
              cursor: 'pointer',
              display: 'flex',
            }}
          >
            <IconNewChat />
          </button>
          <button
            type="button"
            onClick={handleOpenFullTab}
            title="Open Fullscreen in New Tab (about:ai)"
            style={{
              background: 'transparent',
              border: 'none',
              color: '#a1a1aa',
              padding: '6px',
              borderRadius: '6px',
              cursor: 'pointer',
              display: 'flex',
            }}
          >
            <IconExpand />
          </button>
          <button
            type="button"
            onClick={onOpenSettings}
            title="AI Model & API Keys Settings"
            style={{
              background: 'transparent',
              border: 'none',
              color: '#a1a1aa',
              padding: '6px',
              borderRadius: '6px',
              cursor: 'pointer',
              display: 'flex',
            }}
          >
            <IconSettings />
          </button>
          <button
            type="button"
            onClick={onCollapse}
            title="Collapse Sidebar"
            style={{
              background: 'transparent',
              border: 'none',
              color: '#a1a1aa',
              padding: '6px',
              borderRadius: '6px',
              cursor: 'pointer',
              display: 'flex',
            }}
          >
            <IconClose />
          </button>
        </div>
      </div>

      {/* ─── Context & Mode Badges Bar ─── */}
      <div
        style={{
          padding: '8px 14px',
          borderBottom: '1px solid rgba(255, 255, 255, 0.05)',
          background: 'rgba(14, 14, 18, 0.6)',
          display: 'flex',
          alignItems: 'center',
          gap: '6px',
          overflowX: 'auto',
          scrollbarWidth: 'none',
        }}
      >
        <button
          type="button"
          onClick={() => onToggleContext(!includeContext)}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '5px',
            padding: '3px 8px',
            borderRadius: '9999px',
            background: includeContext ? 'rgba(59, 130, 246, 0.18)' : 'rgba(255, 255, 255, 0.03)',
            border: includeContext ? '1px solid rgba(59, 130, 246, 0.45)' : '1px solid rgba(255, 255, 255, 0.06)',
            color: includeContext ? '#60a5fa' : '#71717a',
            fontSize: '10.5px',
            fontWeight: '600',
            cursor: 'pointer',
            whiteSpace: 'nowrap',
          }}
          title="Include active webpage text in reasoning"
        >
          <span style={{ fontSize: '9px' }}>●</span>
          <span>Tab Context</span>
        </button>

        <button
          type="button"
          onClick={() => onToggleHistory(!includeHistory)}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '5px',
            padding: '3px 8px',
            borderRadius: '9999px',
            background: includeHistory ? 'rgba(16, 185, 129, 0.18)' : 'rgba(255, 255, 255, 0.03)',
            border: includeHistory ? '1px solid rgba(16, 185, 129, 0.45)' : '1px solid rgba(255, 255, 255, 0.06)',
            color: includeHistory ? '#34d399' : '#71717a',
            fontSize: '10.5px',
            fontWeight: '600',
            cursor: 'pointer',
            whiteSpace: 'nowrap',
          }}
          title="Include recent browsing history context"
        >
          <span style={{ fontSize: '9px' }}>●</span>
          <span>History Context</span>
        </button>

        <button
          type="button"
          onClick={() => onToggleAgentMode(!isAgentMode)}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '5px',
            padding: '3px 8px',
            borderRadius: '9999px',
            background: isAgentMode ? 'rgba(212, 175, 55, 0.2)' : 'rgba(255, 255, 255, 0.03)',
            border: isAgentMode ? '1px solid rgba(212, 175, 55, 0.5)' : '1px solid rgba(255, 255, 255, 0.06)',
            color: isAgentMode ? '#f2ca50' : '#71717a',
            fontSize: '10.5px',
            fontWeight: '700',
            cursor: 'pointer',
            whiteSpace: 'nowrap',
          }}
          title="Autonomous web browsing and form automation mode"
        >
          <IconSparkles />
          <span>Agent Mode</span>
        </button>
      </div>

      {/* ─── Fast Workflow Chips ─── */}
      <div
        style={{
          padding: '8px 14px',
          display: 'flex',
          gap: '6px',
          overflowX: 'auto',
          scrollbarWidth: 'none',
          borderBottom: '1px solid rgba(255, 255, 255, 0.04)',
        }}
      >
        <button
          type="button"
          onClick={onSummarizePage}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '4px',
            padding: '4px 8px',
            borderRadius: '6px',
            background: 'rgba(255, 255, 255, 0.03)',
            border: '1px solid rgba(255, 255, 255, 0.06)',
            color: '#d4d4d8',
            fontSize: '10.5px',
            fontWeight: '600',
            cursor: 'pointer',
            whiteSpace: 'nowrap',
          }}
        >
          <IconFileText />
          <span>Summarize Tab</span>
        </button>

        <button
          type="button"
          onClick={() => onSendMessage('Explain the architecture, algorithms, and key functions of the code on this page with clean breakdown.')}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '4px',
            padding: '4px 8px',
            borderRadius: '6px',
            background: 'rgba(255, 255, 255, 0.03)',
            border: '1px solid rgba(255, 255, 255, 0.06)',
            color: '#d4d4d8',
            fontSize: '10.5px',
            fontWeight: '600',
            cursor: 'pointer',
            whiteSpace: 'nowrap',
          }}
        >
          <IconCode />
          <span>Explain Code</span>
        </button>

        <button
          type="button"
          onClick={() => onSendMessage('Perform a deep research synthesis on this topic with key evidence and counterpoints:')}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '4px',
            padding: '4px 8px',
            borderRadius: '6px',
            background: 'rgba(255, 255, 255, 0.03)',
            border: '1px solid rgba(255, 255, 255, 0.06)',
            color: '#d4d4d8',
            fontSize: '10.5px',
            fontWeight: '600',
            cursor: 'pointer',
            whiteSpace: 'nowrap',
          }}
        >
          <IconSearch />
          <span>Deep Research</span>
        </button>

        <button
          type="button"
          onClick={() => onSendMessage('Audit this web application for privacy leaks, excessive cookies, security vulnerabilities, and script trackers.')}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '4px',
            padding: '4px 8px',
            borderRadius: '6px',
            background: 'rgba(255, 255, 255, 0.03)',
            border: '1px solid rgba(255, 255, 255, 0.06)',
            color: '#d4d4d8',
            fontSize: '10.5px',
            fontWeight: '600',
            cursor: 'pointer',
            whiteSpace: 'nowrap',
          }}
        >
          <IconShield />
          <span>Security Audit</span>
        </button>
      </div>

      {/* ─── Chat Message Stream ─── */}
      <div
        style={{
          flex: 1,
          overflowY: 'auto',
          padding: '16px',
          display: 'flex',
          flexDirection: 'column',
          gap: '14px',
        }}
        className="no-scrollbar"
      >
        {messages.length === 0 ? (
          <div
            style={{
              flex: 1,
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              textAlign: 'center',
              padding: '24px 16px',
              color: '#71717a',
            }}
          >
            <div
              style={{
                width: '44px',
                height: '44px',
                borderRadius: '50%',
                background: 'rgba(212, 175, 55, 0.12)',
                border: '1px solid rgba(212, 175, 55, 0.3)',
                color: '#f2ca50',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                marginBottom: '12px',
              }}
            >
              <IconSparkles />
            </div>
            <div style={{ fontSize: '14px', fontWeight: '700', color: '#f4f4f5', marginBottom: '4px' }}>
              ICRUSH Intelligence Studio
            </div>
            <p style={{ fontSize: '12px', lineHeight: '1.5', margin: 0, maxWidth: '260px' }}>
              High-performance AI reasoning with live web context, code synthesis, and deep research.
            </p>
          </div>
        ) : (
          messages.map((msg, i) => {
            const isUser = msg.role === 'user';
            return (
              <div
                key={i}
                style={{
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: isUser ? 'flex-end' : 'flex-start',
                  gap: '4px',
                }}
              >
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '6px',
                    fontSize: '10px',
                    fontWeight: '700',
                    textTransform: 'uppercase',
                    letterSpacing: '0.1em',
                    color: isUser ? '#d4af37' : '#94a3b8',
                  }}
                >
                  <span>{isUser ? 'You' : 'Intelligence'}</span>
                </div>

                <div
                  style={{
                    maxWidth: '92%',
                    padding: '10px 14px',
                    borderRadius: isUser ? '16px 16px 4px 16px' : '16px 16px 16px 4px',
                    background: isUser ? 'rgba(212, 175, 55, 0.14)' : 'rgba(255, 255, 255, 0.04)',
                    border: isUser ? '1px solid rgba(212, 175, 55, 0.3)' : '1px solid rgba(255, 255, 255, 0.08)',
                    color: '#f4f4f5',
                    fontSize: '12.5px',
                    lineHeight: '1.55',
                    wordBreak: 'break-word',
                    userSelect: 'text',
                  }}
                >
                  <div style={{ whiteSpace: 'pre-wrap' }}>{msg.content}</div>

                  {!isUser && (
                    <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '8px' }}>
                      <button
                        type="button"
                        onClick={() => copyToClipboard(msg.content, i)}
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: '4px',
                          background: 'transparent',
                          border: 'none',
                          color: copiedIndex === i ? '#10b981' : '#71717a',
                          fontSize: '10px',
                          fontWeight: '600',
                          cursor: 'pointer',
                          padding: '2px 6px',
                          borderRadius: '4px',
                        }}
                      >
                        {copiedIndex === i ? <IconCheck /> : <IconCopy />}
                        <span>{copiedIndex === i ? 'Copied' : 'Copy'}</span>
                      </button>
                    </div>
                  )}
                </div>
              </div>
            );
          })
        )}

        {isLoading && (
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '8px 12px', background: 'rgba(255, 255, 255, 0.03)', borderRadius: '10px', width: 'fit-content' }}>
            <span style={{ width: '6px', height: '6px', borderRadius: '50%', background: '#d4af37', animation: 'pulse 1s infinite' }} />
            <span style={{ fontSize: '11.5px', color: '#a1a1aa' }}>
              {agentStatus || 'Synthesizing response...'}
            </span>
          </div>
        )}

        {geminiError && (
          <div
            style={{
              padding: '10px 14px',
              borderRadius: '12px',
              background: 'rgba(239, 68, 68, 0.12)',
              border: '1px solid rgba(239, 68, 68, 0.3)',
              color: '#fca5a5',
              fontSize: '11.5px',
            }}
          >
            <div style={{ fontWeight: '700', marginBottom: '2px' }}>AI Error Notice</div>
            <div>{geminiError.retryAfter ? `Rate limit exceeded. Retry after ${geminiError.retryAfter}s` : 'Failed to generate response.'}</div>
            <button
              type="button"
              onClick={onClearGeminiError}
              style={{
                marginTop: '6px',
                background: 'rgba(239, 68, 68, 0.2)',
                border: 'none',
                borderRadius: '4px',
                padding: '3px 8px',
                color: '#fff',
                fontSize: '10.5px',
                cursor: 'pointer',
              }}
            >
              Dismiss
            </button>
          </div>
        )}

        {agentConfirmAction && (
          <div
            style={{
              padding: '12px',
              borderRadius: '14px',
              background: 'rgba(212, 175, 55, 0.12)',
              border: '1px solid rgba(212, 175, 55, 0.35)',
              display: 'flex',
              flexDirection: 'column',
              gap: '8px',
            }}
          >
            <div style={{ fontSize: '11px', fontWeight: '800', color: '#f2ca50', textTransform: 'uppercase' }}>
              Autonomous Action Approval
            </div>
            <div style={{ fontSize: '12px', color: '#f4f4f5' }}>{agentConfirmAction.description}</div>
            <div style={{ display: 'flex', gap: '8px' }}>
              <button
                type="button"
                onClick={() => onAgentConfirmResponse(true)}
                style={{
                  flex: 1,
                  padding: '6px',
                  background: '#d4af37',
                  border: 'none',
                  borderRadius: '6px',
                  color: '#000',
                  fontWeight: '700',
                  fontSize: '11px',
                  cursor: 'pointer',
                }}
              >
                Approve
              </button>
              <button
                type="button"
                onClick={() => onAgentConfirmResponse(false)}
                style={{
                  flex: 1,
                  padding: '6px',
                  background: 'rgba(255, 255, 255, 0.05)',
                  border: '1px solid rgba(255, 255, 255, 0.1)',
                  borderRadius: '6px',
                  color: '#a1a1aa',
                  fontWeight: '600',
                  fontSize: '11px',
                  cursor: 'pointer',
                }}
              >
                Reject
              </button>
            </div>
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* ─── Bottom Prompt Input Studio ─── */}
      <div
        style={{
          padding: '12px 14px',
          borderTop: '1px solid rgba(255, 255, 255, 0.08)',
          background: 'rgba(14, 14, 20, 0.95)',
        }}
      >
        {attachedFiles.length > 0 && (
          <div style={{ display: 'flex', gap: '6px', marginBottom: '8px', flexWrap: 'wrap' }}>
            {attachedFiles.map((_, idx) => (
              <span
                key={idx}
                style={{
                  padding: '2px 8px',
                  borderRadius: '4px',
                  background: 'rgba(212, 175, 55, 0.2)',
                  color: '#f2ca50',
                  fontSize: '10.5px',
                  fontWeight: '600',
                }}
              >
                File Attachment #{idx + 1}
              </span>
            ))}
          </div>
        )}

        <div
          style={{
            display: 'flex',
            alignItems: 'flex-end',
            gap: '8px',
            background: 'rgba(255, 255, 255, 0.04)',
            border: '1px solid rgba(255, 255, 255, 0.1)',
            borderRadius: '16px',
            padding: '8px 12px',
          }}
        >
          <input
            type="file"
            ref={fileInputRef}
            onChange={handleFileChange}
            multiple
            style={{ display: 'none' }}
          />

          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            title="Attach image or text file"
            style={{
              background: 'transparent',
              border: 'none',
              color: '#a1a1aa',
              cursor: 'pointer',
              padding: '4px',
              display: 'flex',
            }}
          >
            <IconPaperclip />
          </button>

          <textarea
            ref={textareaRef}
            value={inputText}
            onChange={e => setInputText(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Ask neural model, draft prompt, or audit..."
            rows={1}
            style={{
              flex: 1,
              background: 'transparent',
              border: 'none',
              color: '#ffffff',
              fontSize: '12.5px',
              lineHeight: '1.4',
              outline: 'none',
              resize: 'none',
              maxHeight: '120px',
              fontFamily: 'inherit',
            }}
          />

          <button
            type="button"
            onClick={handleSend}
            disabled={(!inputText.trim() && attachedFiles.length === 0) || isLoading}
            style={{
              background: (!inputText.trim() && attachedFiles.length === 0) || isLoading ? 'rgba(255, 255, 255, 0.05)' : '#d4af37',
              border: 'none',
              borderRadius: '10px',
              width: '28px',
              height: '28px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: (!inputText.trim() && attachedFiles.length === 0) || isLoading ? '#71717a' : '#000000',
              cursor: (!inputText.trim() && attachedFiles.length === 0) || isLoading ? 'default' : 'pointer',
              transition: 'all 0.15s ease',
            }}
          >
            <IconSend />
          </button>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', marginTop: '6px', fontSize: '10px', color: '#71717a' }}>
          <span>Enter to Send • Shift+Enter for newline</span>
        </div>
      </div>
    </aside>
  );
});
