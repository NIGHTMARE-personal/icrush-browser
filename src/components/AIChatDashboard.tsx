import React, { useState, useRef, useEffect, useMemo } from 'react';
import { ChatMessage } from '../utils/storage';
import { PROVIDERS, detectLocalModels, type LocalModel } from '../utils/providers';
import * as aiSessions from '../utils/aiSessions';

interface AIChatDashboardProps {
  onNavigate?: (url: string) => void;
  onOpenSettings?: (tab?: string) => void;
  initialPrompt?: string;
  apiKeys?: Record<string, string>;
}

const PERSONAS = [
  { id: 'general', name: 'General Reasoning', iconType: 'brain', promptPrefix: 'You are ICRUSH Intelligence, an ultra-precise, high-signal AI assistant.' },
  { id: 'coder', name: 'Code Architect', iconType: 'code', promptPrefix: 'You are a Principal Software Architect. Output clean, modular, production-ready code with zero fluff.' },
  { id: 'research', name: 'Deep Research', iconType: 'search', promptPrefix: 'Conduct exhaustive analytical research, cite primary sources, and compare trade-offs.' },
  { id: 'executive', name: 'Executive Memo', iconType: 'memo', promptPrefix: 'Formulate crisp executive summaries using structured tables, bullet points, and actionable outcomes.' },
  { id: 'security', name: 'Security Auditor', iconType: 'shield', promptPrefix: 'Analyze threat vectors, cryptographic posture, and vulnerability layers.' },
];

function getProviderForModel(modelId: string): string {
  for (const p of PROVIDERS) {
    if (p.models.includes(modelId)) return p.id;
  }
  if (modelId.startsWith('gemini')) return 'gemini';
  if (modelId.startsWith('claude')) return 'anthropic';
  if (modelId.startsWith('gpt')) return 'openai';
  if (modelId.startsWith('deepseek')) return 'openrouter';
  if (modelId === 'ollama-local') return 'local';
  // Actual Ollama model IDs (e.g. qwen2.5:3b, llama3.2:1b, dolphin-phi:latest)
  if (modelId.includes(':') || modelId.includes('llama') || modelId.includes('qwen') || modelId.includes('dolphin') || modelId.includes('phi') || modelId.includes('mixtral') || modelId.includes('gemma') || modelId.includes('aureus')) return 'local';
  return 'gemini';
}

const PROMPT_CARDS = [
  {
    title: 'Code Architecture & Refactor',
    subtitle: 'System Design',
    prompt: 'Design a high-throughput, fault-tolerant event processing architecture using TypeScript and WebSockets.',
    persona: 'coder',
  },
  {
    title: 'Security Vulnerability Audit',
    subtitle: 'Threat Analysis',
    prompt: 'Perform a comprehensive security audit of browser sandbox isolation and CSP headers.',
    persona: 'security',
  },
  {
    title: 'Executive Roadmap Briefing',
    subtitle: 'Strategy & Ops',
    prompt: 'Draft an executive briefing outlining quarterly OKRs for browser engine performance and privacy.',
    persona: 'executive',
  },
  {
    title: 'Deep Scientific Synthesis',
    subtitle: 'Research & ML',
    prompt: 'Synthesize the latest breakthroughs in local LLM inference quantization and memory caching algorithms.',
    persona: 'research',
  },
];

/* ─────────────────────────────────────────────────────────────
   Crisp Minimal SVG Line Icons (No Emojis - Professional Style)
   ───────────────────────────────────────────────────────────── */

const IconSparkles = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" />
  </svg>
);

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

const IconBrain = () => (
  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M9.5 2A2.5 2.5 0 0 1 12 4.5v15a2.5 2.5 0 0 1-4.96.44 2.5 2.5 0 0 1-2.96-3.08 3 3 0 0 1-.34-5.58 2.5 2.5 0 0 1 1.32-4.24 2.5 2.5 0 0 1 4.44-5.04z" />
    <path d="M14.5 2A2.5 2.5 0 0 0 12 4.5v15a2.5 2.5 0 0 0 4.96.44 2.5 2.5 0 0 0 2.96-3.08 3 3 0 0 0 .34-5.58 2.5 2.5 0 0 0-1.32-4.24 2.5 2.5 0 0 0-4.44-5.04z" />
  </svg>
);

const IconCode = () => (
  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <polyline points="16 18 22 12 16 6" /><polyline points="8 6 2 12 8 18" />
  </svg>
);

const IconSearch = () => (
  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" />
  </svg>
);

const IconFileText = () => (
  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
    <polyline points="14 2 14 8 20 8" /><line x1="16" y1="13" x2="8" y2="13" /><line x1="16" y1="17" x2="8" y2="17" />
  </svg>
);

const IconShield = () => (
  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
  </svg>
);

const IconSend = () => (
  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
    <line x1="22" y1="2" x2="11" y2="13" />
    <polygon points="22 2 15 22 11 13 2 9 22 2" />
  </svg>
);

const IconPlus = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
    <line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" />
  </svg>
);

const IconTrash = () => (
  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <polyline points="3 6 5 6 21 6" /><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
  </svg>
);

const IconCopy = () => (
  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
    <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
  </svg>
);

const IconCheck = () => (
  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
    <polyline points="20 6 9 17 4 12" />
  </svg>
);

const IconSettings = () => (
  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="12" cy="12" r="3" />
    <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
  </svg>
);

const IconGlobe = () => (
  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="12" cy="12" r="10" /><line x1="2" y1="12" x2="22" y2="12" />
    <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" />
  </svg>
);

const IconPaperclip = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48" />
  </svg>
);

const IconUpload = () => (
  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
    <polyline points="17 8 12 3 7 8" />
    <line x1="12" y1="3" x2="12" y2="15" />
  </svg>
);

const IconCloud = () => (
  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M18 10h-1.26A8 8 0 1 0 9 20h9a5 5 0 0 0 0-10z" />
  </svg>
);

const IconFolder = () => (
  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
  </svg>
);

const IconImage = () => (
  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
    <circle cx="8.5" cy="8.5" r="1.5" />
    <polyline points="21 15 16 10 5 21" />
  </svg>
);

const IconVideo = () => (
  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <polygon points="23 7 16 12 23 17 23 7" />
    <rect x="1" y="5" width="15" height="14" rx="2" ry="2" />
  </svg>
);

const IconMusic = () => (
  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M9 18V5l12-2v13" />
    <circle cx="6" cy="18" r="3" />
    <circle cx="18" cy="16" r="3" />
  </svg>
);

const IconCanvas = () => (
  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <rect x="3" y="3" width="18" height="18" rx="2" />
    <path d="M3 9h18" /><path d="M9 21V9" />
  </svg>
);

const IconBookOpen = () => (
  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z" />
    <path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z" />
  </svg>
);

const IconUser = () => (
  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
    <circle cx="12" cy="7" r="4" />
  </svg>
);

const IconFlask = () => (
  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M10 2v7.31L4.65 19.55A2 2 0 0 0 6.38 22h11.24a2 2 0 0 0 1.73-2.45L14 9.31V2" />
    <line x1="8.5" y1="2" x2="15.5" y2="2" />
    <line x1="6.8" y1="15" x2="17.2" y2="15" />
  </svg>
);

const renderPersonaIcon = (type: string) => {
  switch (type) {
    case 'brain': return <IconBrain />;
    case 'code': return <IconCode />;
    case 'search': return <IconSearch />;
    case 'memo': return <IconFileText />;
    case 'shield': return <IconShield />;
    default: return <IconSparkles />;
  }
};

const ATTACH_SECTIONS = [
  {
    category: 'Uploads',
    items: [
      { id: 'upload_files', label: 'Upload files', icon: <IconUpload />, action: 'upload' },
      { id: 'add_drive', label: 'Add from Drive', icon: <IconCloud />, action: 'drive' },
      { id: 'more_uploads', label: 'More uploads', icon: <IconFolder />, action: 'more_uploads' },
    ],
  },
  {
    category: 'Creative Studio',
    items: [
      { id: 'create_image', label: 'Create image', icon: <IconImage />, action: 'image' },
      { id: 'create_video', label: 'Create video', icon: <IconVideo />, action: 'video' },
      { id: 'create_music', label: 'Create music', icon: <IconMusic />, action: 'music' },
      { id: 'canvas', label: 'Canvas', icon: <IconCanvas />, action: 'canvas' },
    ],
  },
  {
    category: 'Deep Tools & Labs',
    items: [
      { id: 'deep_research', label: 'Deep research', icon: <IconSearch />, action: 'research' },
      { id: 'guided_learning', label: 'Guided learning', icon: <IconBookOpen />, action: 'learning' },
      { id: 'personal_intelligence', label: 'Personal Intelligence', icon: <IconUser />, action: 'personal' },
      { id: 'labs', label: 'Labs', icon: <IconFlask />, action: 'labs' },
    ],
  },
];

export function AIChatDashboard({
  onNavigate,
  onOpenSettings,
  initialPrompt = '',
  apiKeys = {},
}: AIChatDashboardProps) {
  // Theme state
  const isDark = (localStorage.getItem('homescreen-theme-mode') || 'deep-canvas') === 'deep-canvas';

  // Sessions and Active Chat — synced with sidebar via shared store
  const [sessions, setSessions] = useState<aiSessions.AISession[]>(() => aiSessions.load());

  useEffect(() => {
    return aiSessions.subscribe(updated => setSessions(updated));
  }, []);

  const [activeSessionId, setActiveSessionId] = useState<string | null>(null);
  const [selectedModel, setSelectedModel] = useState(() => {
    const hasCloudKeys = Object.keys(apiKeys).some(k => k !== 'local' && apiKeys[k]);
    return hasCloudKeys ? 'gemini-2.5-flash' : 'ollama-local';
  });
  const [selectedPersona, setSelectedPersona] = useState('general');
  const [webGrounding, setWebGrounding] = useState(true);
  const [includeTabContext, setIncludeTabContext] = useState(false);
  const [localModels, setLocalModels] = useState<LocalModel[]>([]);

  useEffect(() => {
    detectLocalModels().then(models => setLocalModels(models));
  }, []);

  const [inputPrompt, setInputPrompt] = useState(initialPrompt);
  const [attachedFiles, setAttachedFiles] = useState<Array<{ name: string; data: string; mimeType: string }>>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const attachMenuRef = useRef<HTMLDivElement>(null);
  const [showAttachMenu, setShowAttachMenu] = useState(false);

  // Close attach menu on outside click or Escape
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (attachMenuRef.current && !attachMenuRef.current.contains(e.target as Node)) {
        setShowAttachMenu(false);
      }
    };
    const handleEscKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setShowAttachMenu(false);
    };
    if (showAttachMenu) {
      document.addEventListener('mousedown', handleClickOutside);
      document.addEventListener('keydown', handleEscKey);
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleEscKey);
    };
  }, [showAttachMenu]);

  const handleAttachOptionClick = (action: string) => {
    setShowAttachMenu(false);
    switch (action) {
      case 'upload':
      case 'more_uploads':
        fileInputRef.current?.click();
        break;
      case 'drive':
        setInputPrompt(prev => (prev ? `${prev} [Google Drive Context: attached]` : '[Google Drive Context: attached] '));
        textareaRef.current?.focus();
        break;
      case 'image':
        setInputPrompt(prev => (prev ? `${prev}\n/image ` : '/image '));
        textareaRef.current?.focus();
        break;
      case 'video':
        setInputPrompt(prev => (prev ? `${prev}\n/video ` : '/video '));
        textareaRef.current?.focus();
        break;
      case 'music':
        setInputPrompt(prev => (prev ? `${prev}\n/music ` : '/music '));
        textareaRef.current?.focus();
        break;
      case 'canvas':
        setSelectedPersona('coder');
        setInputPrompt(prev => (prev ? `${prev}\n/canvas ` : '/canvas '));
        textareaRef.current?.focus();
        break;
      case 'research':
        setSelectedPersona('research');
        setInputPrompt(prev => (prev ? `${prev}\n/deep-research ` : '/deep-research '));
        textareaRef.current?.focus();
        break;
      case 'learning':
        setInputPrompt(prev => (prev ? `${prev}\n/guided-learning ` : '/guided-learning '));
        textareaRef.current?.focus();
        break;
      case 'personal':
        setInputPrompt(prev => (prev ? `${prev}\n/personal-intelligence ` : '/personal-intelligence '));
        textareaRef.current?.focus();
        break;
      case 'labs':
        setInputPrompt(prev => (prev ? `${prev}\n/labs ` : '/labs '));
        textareaRef.current?.focus();
        break;
      default:
        break;
    }
  };

  // Active Session computation
  const currentSession = sessions.find(s => s.id === activeSessionId);
  const messages: ChatMessage[] = useMemo(() => currentSession?.messages || [], [currentSession?.messages]);

  // Check URL query parameters for initial prompt on mount
  useEffect(() => {
    try {
      const hash = window.location.hash || '';
      const search = window.location.search || '';
      const params = new URLSearchParams(search || hash.split('?')[1] || '');
      const q = params.get('q');
      if (q && !inputPrompt) {
        setInputPrompt(decodeURIComponent(q));
      }
    } catch {
      // Ignore URL parse errors
    }
  }, []);

  // Auto-scroll on new messages
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, isLoading]);

  // Streaming IPC listeners — real AI responses
  useEffect(() => {
    const unsubStream = window.electronAPI.onGeminiResponse((text: string) => {
      setSessions(prev => {
        const activeId = prev.find(s => s.messages.some(m => m.role === 'assistant' && m.isStreaming))?.id;
        if (!activeId) return prev;
        return prev.map(s => {
          if (s.id !== activeId) return s;
          const msgs = s.messages.map((m, i) =>
            i === s.messages.length - 1 && m.role === 'assistant'
              ? { ...m, content: text }
              : m
          );
          return { ...s, messages: msgs };
        });
      });
    });

    const unsubDone = window.electronAPI.onGeminiDone(() => {
      setSessions(prev => {
        const activeId = prev.find(s => s.messages.some(m => m.role === 'assistant' && m.isStreaming))?.id;
        if (!activeId) return prev;
        const updated = prev.map(s => {
          if (s.id !== activeId) return s;
          const msgs = s.messages.map(m =>
            m.role === 'assistant' && m.isStreaming ? { ...m, isStreaming: false } : m
          );
          return { ...s, messages: msgs };
        });
        aiSessions.save(updated);
        return updated;
      });
      setIsLoading(false);
    });

    const unsubError = window.electronAPI.onGeminiError((errorMessage: string) => {
      setSessions(prev => {
        const activeId = prev.find(s => s.messages.some(m => m.role === 'assistant' && m.isStreaming))?.id;
        if (!activeId) return prev;
        const updated = prev.map(s => {
          if (s.id !== activeId) return s;
          const msgs = s.messages.map(m =>
            m.role === 'assistant' && m.isStreaming
              ? { ...m, content: `Error: ${errorMessage}`, isStreaming: false, isError: true }
              : m
          );
          return { ...s, messages: msgs };
        });
        aiSessions.save(updated);
        return updated;
      });
      setIsLoading(false);
    });

    return () => {
      unsubStream();
      unsubDone();
      unsubError();
    };
  }, []);

  // Create a new session
  const handleNewSession = () => {
    const newSession: aiSessions.AISession = {
      id: `session-${Date.now()}`,
      title: 'New Investigation',
      timestamp: Date.now(),
      messages: [],
      model: selectedModel,
      persona: selectedPersona,
    };
    const updated = [newSession, ...sessions];
    setSessions(updated);
    setActiveSessionId(newSession.id);
    aiSessions.save(updated);
  };

  const handleDeleteSession = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    const updated = sessions.filter(s => s.id !== id);
    setSessions(updated);
    if (activeSessionId === id) {
      setActiveSessionId(updated.length > 0 ? updated[0].id : null);
    }
    aiSessions.save(updated);
  };

  const handleSendMessage = async (textToSend?: string) => {
    const text = textToSend || inputPrompt;
    if (!text.trim() && attachedFiles.length === 0) return;

    let targetSession = currentSession;
    let targetId = activeSessionId;

    if (!targetSession || !targetId) {
      const newSession: aiSessions.AISession = {
        id: `session-${Date.now()}`,
        title: text.slice(0, 32) + (text.length > 32 ? '...' : ''),
        timestamp: Date.now(),
        messages: [],
        model: selectedModel,
        persona: selectedPersona,
      };
      targetSession = newSession;
      targetId = newSession.id;
      setActiveSessionId(newSession.id);
    }

    const userMsg: ChatMessage = {
      id: `user-${Date.now()}`,
      role: 'user',
      content: text.trim(),
      timestamp: Date.now(),
    };

    const assistantPlaceholder: ChatMessage = {
      id: `assistant-${Date.now()}`,
      role: 'assistant',
      content: '',
      isStreaming: true,
      timestamp: Date.now(),
    };

    const updatedMessages = [...(targetSession.messages || []), userMsg];

    // Update Session with user message
    const updatedSessions = sessions.map(s => {
      if (s.id === targetId) {
        return {
          ...s,
          messages: updatedMessages,
          title: s.messages.length === 0 ? text.slice(0, 32) + (text.length > 32 ? '...' : '') : s.title,
        };
      }
      return s;
    });

    if (!sessions.some(s => s.id === targetId)) {
      updatedSessions.unshift({
        ...targetSession,
        messages: updatedMessages,
      });
    }

    // Show user message + streaming placeholder immediately
    const withPlaceholder = updatedSessions.map(s =>
      s.id === targetId ? { ...s, messages: [...updatedMessages, assistantPlaceholder] } : s
    );
    setSessions(withPlaceholder);
    aiSessions.save(withPlaceholder);

    setInputPrompt('');
    setAttachedFiles([]);
    setIsLoading(true);

    // Call real backend via streaming IPC
    try {
      const activePersonaConfig = PERSONAS.find(p => p.id === selectedPersona);
      const systemInstruction = activePersonaConfig?.promptPrefix || 'You are ICRUSH Intelligence Studio.';
      const provider = getProviderForModel(selectedModel);

      const historyForApi = updatedMessages
        .filter(m => !m.isError)
        .map(m => ({ role: m.role, content: m.content }));

      // Build file attachments for multimodal
      const files = attachedFiles.length > 0
        ? attachedFiles.map(f => ({
            inlineData: { mimeType: f.mimeType, data: f.data }
          }))
        : undefined;

      window.electronAPI.sendGeminiMessage(
        text.trim(),
        historyForApi,
        provider,
        apiKeys[provider] || undefined,
        { files, systemInstruction, modelName: selectedModel }
      );
      // Response arrives via onGeminiResponse / onGeminiDone / onGeminiError listeners
    } catch (err: any) {
      const errorMsg: ChatMessage = {
        id: `err-${Date.now()}`,
        role: 'assistant',
        content: `❌ **AI Execution Error:** ${err?.message || 'Failed to communicate with provider API.'}`,
        timestamp: Date.now(),
      };
      const finalMessages = [...updatedMessages, errorMsg];
      const finalSessions = updatedSessions.map(s => (s.id === targetId ? { ...s, messages: finalMessages } : s));
      setSessions(finalSessions);
      aiSessions.save(finalSessions);
      setIsLoading(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSendMessage();
    }
  };

  const handleCopyText = (content: string, id: string) => {
    navigator.clipboard.writeText(content);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  return (
    <div
      style={{
        width: '100%',
        height: '100%',
        display: 'flex',
        background: isDark ? '#09090d' : '#F9F6F0',
        color: isDark ? '#f9f6f0' : '#3C322C',
        fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
        overflow: 'hidden',
        position: 'relative',
      }}
    >
      {/* ─────────────────────────────────────────────────────────────
          LEFT STUDIO SIDEBAR (280px)
          ───────────────────────────────────────────────────────────── */}
      <aside
        style={{
          width: '290px',
          height: '100%',
          background: isDark ? 'rgba(14, 14, 20, 0.95)' : '#ffffff',
          borderRight: isDark ? '1px solid rgba(255, 255, 255, 0.08)' : '1px solid rgba(0, 0, 0, 0.08)',
          display: 'flex',
          flexDirection: 'column',
          boxSizing: 'border-box',
          padding: '16px',
          gap: '16px',
        }}
      >
        {/* Brand & New Chat Button */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <div
                style={{
                  width: '28px',
                  height: '28px',
                  borderRadius: '8px',
                  background: isDark ? 'rgba(212, 175, 55, 0.18)' : 'rgba(200, 109, 81, 0.18)',
                  border: isDark ? '1px solid rgba(212, 175, 55, 0.4)' : '1px solid rgba(200, 109, 81, 0.4)',
                  color: isDark ? '#f2ca50' : '#C86D51',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                <IconSparkles />
              </div>
              <span style={{ fontSize: '12px', fontWeight: '800', textTransform: 'uppercase', letterSpacing: '0.14em', color: isDark ? '#f9f6f0' : '#1a1715' }}>
                Neural Studio
              </span>
            </div>

            {onOpenSettings && (
              <button
                type="button"
                onClick={() => onOpenSettings('models')}
                style={{ background: 'none', border: 'none', color: isDark ? '#a1a1aa' : '#71717a', cursor: 'pointer', padding: '4px' }}
                title="Model & Key Settings"
              >
                <IconSettings />
              </button>
            )}
          </div>

          <button
            type="button"
            onClick={handleNewSession}
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '8px',
              width: '100%',
              padding: '10px 14px',
              borderRadius: '12px',
              background: isDark ? '#d4af37' : '#1a1715',
              border: 'none',
              color: isDark ? '#000000' : '#ffffff',
              fontSize: '12px',
              fontWeight: '700',
              cursor: 'pointer',
              boxShadow: isDark ? '0 4px 14px rgba(212, 175, 55, 0.25)' : '0 4px 12px rgba(0,0,0,0.1)',
            }}
          >
            <IconPlus />
            <span>New Investigation</span>
          </button>
        </div>

        {/* Model Selector Dropdown */}
        <div>
          <div style={{ fontSize: '10px', fontWeight: '800', textTransform: 'uppercase', letterSpacing: '0.16em', color: isDark ? '#71717a' : '#8c827a', marginBottom: '6px' }}>
            Active Engine
          </div>
          <select
            value={selectedModel}
            onChange={e => setSelectedModel(e.target.value)}
            style={{
              width: '100%',
              padding: '8px 10px',
              borderRadius: '10px',
              background: isDark ? 'rgba(255, 255, 255, 0.04)' : 'rgba(0, 0, 0, 0.04)',
              border: isDark ? '1px solid rgba(255, 255, 255, 0.08)' : '1px solid rgba(0, 0, 0, 0.08)',
              color: isDark ? '#f9f6f0' : '#1a1715',
              fontSize: '12px',
              fontWeight: '600',
              outline: 'none',
              cursor: 'pointer',
            }}
          >
            {PROVIDERS.filter(p => p.id !== 'local' && apiKeys[p.id]).map(p => (
              <optgroup key={p.id} label={p.name}>
                {p.models.map(m => (
                  <option key={m} value={m} style={{ background: isDark ? '#121218' : '#ffffff', color: isDark ? '#fff' : '#000' }}>
                    {m}
                  </option>
                ))}
              </optgroup>
            ))}
            <optgroup label="Local Ollama">
              {localModels.length > 0 ? (
                localModels.map(m => (
                  <option key={m.id} value={m.id} style={{ background: isDark ? '#121218' : '#ffffff', color: isDark ? '#fff' : '#000' }}>
                    {m.name}{m.parameterSize ? ` (${m.parameterSize})` : ''}{m.size ? ` ${m.size}` : ''}
                  </option>
                ))
              ) : (
                <option value="ollama-local" style={{ background: isDark ? '#121218' : '#ffffff', color: isDark ? '#fff' : '#000' }}>
                  Auto-detect installed model
                </option>
              )}
            </optgroup>
          </select>
        </div>

        {/* Persona Mode Pills */}
        <div>
          <div style={{ fontSize: '10px', fontWeight: '800', textTransform: 'uppercase', letterSpacing: '0.16em', color: isDark ? '#71717a' : '#8c827a', marginBottom: '6px' }}>
            Reasoning Persona
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
            {PERSONAS.map(p => (
              <button
                key={p.id}
                type="button"
                onClick={() => setSelectedPersona(p.id)}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  padding: '7px 10px',
                  borderRadius: '8px',
                  background: selectedPersona === p.id ? (isDark ? 'rgba(212, 175, 55, 0.15)' : 'rgba(200, 109, 81, 0.15)') : 'transparent',
                  border: selectedPersona === p.id ? (isDark ? '1px solid rgba(212, 175, 55, 0.35)' : '1px solid rgba(200, 109, 81, 0.35)') : '1px solid transparent',
                  color: selectedPersona === p.id ? (isDark ? '#f2ca50' : '#C86D51') : (isDark ? '#a1a1aa' : '#5c524c'),
                  fontSize: '11.5px',
                  fontWeight: '600',
                  cursor: 'pointer',
                  textAlign: 'left',
                  transition: 'all 0.12s ease',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <span style={{ display: 'flex', alignItems: 'center', opacity: selectedPersona === p.id ? 1 : 0.7 }}>
                    {renderPersonaIcon(p.iconType)}
                  </span>
                  <span>{p.name}</span>
                </div>
              </button>
            ))}
          </div>
        </div>

        {/* Thread History Archives */}
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minHeight: '120px' }}>
          <div style={{ fontSize: '10px', fontWeight: '800', textTransform: 'uppercase', letterSpacing: '0.16em', color: isDark ? '#71717a' : '#8c827a', marginBottom: '6px' }}>
            Saved Threads ({sessions.length})
          </div>
          <div style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '4px' }} className="no-scrollbar">
            {sessions.length === 0 ? (
              <div style={{ fontSize: '11px', color: isDark ? '#52525b' : '#a1a1aa', padding: '8px 4px' }}>
                No past sessions yet.
              </div>
            ) : (
              sessions.map(s => (
                <div
                  key={s.id}
                  onClick={() => setActiveSessionId(s.id)}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    padding: '8px 10px',
                    borderRadius: '8px',
                    background: activeSessionId === s.id ? (isDark ? 'rgba(255, 255, 255, 0.06)' : 'rgba(0, 0, 0, 0.05)') : 'transparent',
                    cursor: 'pointer',
                    fontSize: '11.5px',
                    color: activeSessionId === s.id ? (isDark ? '#ffffff' : '#000000') : (isDark ? '#a1a1aa' : '#71717a'),
                  }}
                >
                  <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '180px' }}>
                    {s.title}
                  </span>
                  <button
                    type="button"
                    onClick={e => handleDeleteSession(s.id, e)}
                    style={{ background: 'none', border: 'none', color: isDark ? '#52525b' : '#a1a1aa', cursor: 'pointer', padding: '2px' }}
                    title="Delete thread"
                  >
                    <IconTrash />
                  </button>
                </div>
              ))
            )}
          </div>
        </div>

        {/* Studio Grounding Controls */}
        <div style={{ borderTop: isDark ? '1px solid rgba(255, 255, 255, 0.06)' : '1px solid rgba(0, 0, 0, 0.06)', paddingTop: '12px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '11px' }}>
            <span style={{ color: isDark ? '#a1a1aa' : '#71717a' }}>Live Web Grounding</span>
            <input
              type="checkbox"
              checked={webGrounding}
              onChange={e => setWebGrounding(e.target.checked)}
              style={{ cursor: 'pointer' }}
            />
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '11px' }}>
            <span style={{ color: isDark ? '#a1a1aa' : '#71717a' }}>Include Tab Context</span>
            <input
              type="checkbox"
              checked={includeTabContext}
              onChange={e => setIncludeTabContext(e.target.checked)}
              style={{ cursor: 'pointer' }}
            />
          </div>
        </div>
      </aside>

      {/* ─────────────────────────────────────────────────────────────
          MAIN CHAT & PROMPT STUDIO CANVAS
          ───────────────────────────────────────────────────────────── */}
      <main
        style={{
          flex: 1,
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          position: 'relative',
        }}
      >
        {/* Top Header Controls */}
        <header
          style={{
            padding: '14px 28px',
            borderBottom: isDark ? '1px solid rgba(255, 255, 255, 0.06)' : '1px solid rgba(0, 0, 0, 0.06)',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            background: isDark ? 'rgba(12, 12, 16, 0.8)' : 'rgba(255, 255, 255, 0.8)',
            backdropFilter: 'blur(16px)',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
                background: isDark ? 'rgba(212, 175, 55, 0.12)' : 'rgba(200, 109, 81, 0.12)',
                border: isDark ? '1px solid rgba(212, 175, 55, 0.35)' : '1px solid rgba(200, 109, 81, 0.35)',
                borderRadius: '9999px',
                padding: '4px 10px',
                color: isDark ? '#f2ca50' : '#C86D51',
                fontSize: '11px',
                fontWeight: '700',
                letterSpacing: '0.04em',
              }}
            >
              <IconCpu />
              <span>@ Neural Studio</span>
            </div>

            <h2 style={{ margin: 0, fontSize: '15px', fontWeight: '700', color: isDark ? '#f9f6f0' : '#1a1715' }}>
              {currentSession?.title || 'Interactive Intelligence Canvas'}
            </h2>
            <span
              style={{
                fontSize: '10.5px',
                fontWeight: '700',
                padding: '2px 8px',
                borderRadius: '9999px',
                background: isDark ? 'rgba(212, 175, 55, 0.15)' : 'rgba(200, 109, 81, 0.15)',
                color: isDark ? '#f2ca50' : '#C86D51',
              }}
            >
              {selectedModel}
            </span>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <button
              type="button"
              onClick={() => onNavigate?.('about:blank')}
              style={{
                background: isDark ? 'rgba(255, 255, 255, 0.04)' : 'rgba(0, 0, 0, 0.04)',
                border: isDark ? '1px solid rgba(255, 255, 255, 0.08)' : '1px solid rgba(0, 0, 0, 0.08)',
                borderRadius: '8px',
                padding: '6px 12px',
                fontSize: '11.5px',
                fontWeight: '600',
                color: isDark ? '#a1a1aa' : '#5c524c',
                cursor: 'pointer',
              }}
            >
              Back to Homescreen
            </button>
          </div>
        </header>

        {/* Message Stream or Empty Hero */}
        <div
          style={{
            flex: 1,
            overflowY: 'auto',
            padding: '32px 48px',
            display: 'flex',
            flexDirection: 'column',
            gap: '24px',
          }}
          className="no-scrollbar"
        >
          {messages.length === 0 ? (
            /* ─── Hero Launcher Deck ─── */
            <div style={{ maxWidth: '820px', margin: 'auto', textAlign: 'center', padding: '24px 0' }}>
              <div
                style={{
                  fontSize: '10.5px',
                  fontWeight: '800',
                  textTransform: 'uppercase',
                  letterSpacing: '0.28em',
                  color: isDark ? '#d4af37' : '#C86D51',
                  marginBottom: '8px',
                }}
              >
                Executive Neural Terminal
              </div>
              <h1
                style={{
                  fontFamily: 'Playfair Display, Georgia, serif',
                  fontSize: '36px',
                  fontWeight: '700',
                  margin: '0 0 12px 0',
                  color: isDark ? '#f9f6f0' : '#1a1715',
                }}
              >
                ICRUSH Intelligence Workspace
              </h1>
              <p
                style={{
                  fontSize: '14px',
                  color: isDark ? '#a1a1aa' : '#6c625c',
                  maxWidth: '540px',
                  margin: '0 auto 36px auto',
                  lineHeight: '1.6',
                }}
              >
                Full-viewport reasoning studio engineered for rapid code architecture, security audits, and multi-source research synthesis.
              </p>

              {/* 4 Prompt Launch Cards */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '16px', textAlign: 'left' }}>
                {PROMPT_CARDS.map((card, i) => (
                  <div
                    key={i}
                    onClick={() => {
                      setSelectedPersona(card.persona);
                      handleSendMessage(card.prompt);
                    }}
                    style={{
                      background: isDark ? 'rgba(18, 18, 24, 0.75)' : '#ffffff',
                      border: isDark ? '1px solid rgba(255, 255, 255, 0.08)' : '1px solid rgba(0, 0, 0, 0.08)',
                      borderRadius: '16px',
                      padding: '18px 20px',
                      cursor: 'pointer',
                      boxShadow: isDark ? '0 12px 28px rgba(0, 0, 0, 0.4)' : '0 8px 20px rgba(0, 0, 0, 0.04)',
                      transition: 'all 0.15s ease',
                    }}
                    onMouseEnter={e => {
                      e.currentTarget.style.borderColor = isDark ? 'rgba(212, 175, 55, 0.4)' : 'rgba(200, 109, 81, 0.4)';
                    }}
                    onMouseLeave={e => {
                      e.currentTarget.style.borderColor = isDark ? 'rgba(255, 255, 255, 0.08)' : 'rgba(0, 0, 0, 0.08)';
                    }}
                  >
                    <div style={{ fontSize: '10.5px', fontWeight: '800', textTransform: 'uppercase', letterSpacing: '0.14em', color: isDark ? '#d4af37' : '#C86D51', marginBottom: '4px' }}>
                      {card.subtitle}
                    </div>
                    <div style={{ fontSize: '14px', fontWeight: '700', color: isDark ? '#ffffff' : '#1a1715', marginBottom: '6px' }}>
                      {card.title}
                    </div>
                    <div style={{ fontSize: '12px', color: isDark ? '#a1a1aa' : '#71717a', lineHeight: '1.4' }}>
                      {card.prompt}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ) : (
            /* ─── Active Message Flow ─── */
            <div style={{ maxWidth: '860px', width: '100%', margin: '0 auto', display: 'flex', flexDirection: 'column', gap: '20px' }}>
              {messages.map((msg, idx) => {
                const isUser = msg.role === 'user';
                return (
                  <div
                    key={msg.id || idx}
                    style={{
                      display: 'flex',
                      flexDirection: 'column',
                      alignItems: isUser ? 'flex-end' : 'flex-start',
                      gap: '6px',
                    }}
                  >
                    <div
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: '6px',
                        fontSize: '10.5px',
                        fontWeight: '800',
                        textTransform: 'uppercase',
                        letterSpacing: '0.12em',
                        color: isUser ? (isDark ? '#d4af37' : '#C86D51') : (isDark ? '#94a3b8' : '#64748b'),
                      }}
                    >
                      <span>{isUser ? 'Operator' : 'Intelligence Studio'}</span>
                    </div>

                    <div
                      style={{
                        maxWidth: '85%',
                        padding: '16px 20px',
                        borderRadius: isUser ? '20px 20px 4px 20px' : '20px 20px 20px 4px',
                        background: isUser
                          ? isDark
                            ? 'rgba(212, 175, 55, 0.14)'
                            : 'rgba(200, 109, 81, 0.14)'
                          : isDark
                          ? 'rgba(18, 18, 24, 0.85)'
                          : '#ffffff',
                        border: isUser
                          ? isDark
                            ? '1px solid rgba(212, 175, 55, 0.3)'
                            : '1px solid rgba(200, 109, 81, 0.3)'
                          : isDark
                          ? '1px solid rgba(255, 255, 255, 0.08)'
                          : '1px solid rgba(0, 0, 0, 0.08)',
                        color: isDark ? '#f9f6f0' : '#1a1715',
                        fontSize: '13.5px',
                        lineHeight: '1.65',
                        boxShadow: isDark ? '0 12px 30px rgba(0, 0, 0, 0.4)' : '0 8px 24px rgba(0, 0, 0, 0.04)',
                        userSelect: 'text',
                      }}
                    >
                      <div style={{ whiteSpace: 'pre-wrap' }}>{msg.content}</div>

                      {!isUser && (
                        <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '12px', borderTop: isDark ? '1px solid rgba(255,255,255,0.05)' : '1px solid rgba(0,0,0,0.05)', paddingTop: '8px' }}>
                          <button
                            type="button"
                            onClick={() => handleCopyText(msg.content, msg.id || idx.toString())}
                            style={{
                              display: 'flex',
                              alignItems: 'center',
                              gap: '4px',
                              background: 'none',
                              border: 'none',
                              color: copiedId === (msg.id || idx.toString()) ? '#10b981' : (isDark ? '#a1a1aa' : '#71717a'),
                              fontSize: '11px',
                              fontWeight: '600',
                              cursor: 'pointer',
                            }}
                          >
                            {copiedId === (msg.id || idx.toString()) ? <IconCheck /> : <IconCopy />}
                            <span>{copiedId === (msg.id || idx.toString()) ? 'Copied' : 'Copy Output'}</span>
                          </button>
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}

              {isLoading && (
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '12px 18px', background: isDark ? 'rgba(18, 18, 24, 0.6)' : '#fff', borderRadius: '14px', width: 'fit-content' }}>
                  <span style={{ width: '8px', height: '8px', borderRadius: '50%', background: isDark ? '#d4af37' : '#C86D51', animation: 'pulse 1s infinite' }} />
                  <span style={{ fontSize: '13px', color: isDark ? '#a1a1aa' : '#71717a' }}>
                    Reasoning across knowledge matrix...
                  </span>
                </div>
              )}

              <div ref={messagesEndRef} />
            </div>
          )}
        </div>

        {/* ─── Bottom Floating Prompt Studio Capsule ─── */}
        <div
          style={{
            padding: '16px 48px 24px 48px',
            background: isDark ? 'linear-gradient(to top, #09090d 80%, transparent)' : 'linear-gradient(to top, #F9F6F0 80%, transparent)',
          }}
        >
          <div style={{ maxWidth: '860px', margin: '0 auto', display: 'flex', flexDirection: 'column', gap: '8px' }}>
            {/* Attached Files Badge */}
            {attachedFiles.length > 0 && (
              <div style={{ display: 'flex', gap: '8px' }}>
                {attachedFiles.map((file, idx) => (
                  <div
                    key={idx}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '6px',
                      padding: '4px 10px',
                      borderRadius: '6px',
                      background: isDark ? 'rgba(212, 175, 55, 0.18)' : 'rgba(200, 109, 81, 0.18)',
                      color: isDark ? '#f2ca50' : '#C86D51',
                      fontSize: '11px',
                      fontWeight: '700',
                    }}
                  >
                    <IconPaperclip />
                    <span>{file.name}</span>
                  </div>
                ))}
              </div>
            )}

            {/* Main Prompt Bar */}
            <div
              style={{
                display: 'flex',
                alignItems: 'flex-end',
                gap: '12px',
                background: isDark ? 'rgba(18, 18, 24, 0.85)' : '#ffffff',
                border: isDark ? '1px solid rgba(212, 175, 55, 0.35)' : '1px solid rgba(0, 0, 0, 0.12)',
                borderRadius: '24px',
                padding: '12px 18px',
                boxShadow: isDark ? '0 16px 40px rgba(0, 0, 0, 0.6)' : '0 12px 32px rgba(0, 0, 0, 0.08)',
                backdropFilter: 'blur(20px)',
              }}
            >
              <input
                type="file"
                ref={fileInputRef}
                style={{ display: 'none' }}
                onChange={e => {
                  const files = e.target.files;
                  if (!files) return;
                  Array.from(files).forEach(f => {
                    const reader = new FileReader();
                    reader.onload = () => {
                      setAttachedFiles(prev => [...prev, { name: f.name, data: reader.result as string, mimeType: f.type }]);
                    };
                    reader.readAsDataURL(f);
                  });
                }}
                multiple
              />

              <div style={{ position: 'relative' }} ref={attachMenuRef}>
                <button
                  type="button"
                  onClick={() => setShowAttachMenu(prev => !prev)}
                  title="Tools & Attachments"
                  style={{
                    background: showAttachMenu ? (isDark ? 'rgba(212, 175, 55, 0.2)' : 'rgba(200, 109, 81, 0.2)') : 'none',
                    border: 'none',
                    borderRadius: '8px',
                    color: showAttachMenu ? (isDark ? '#f2ca50' : '#C86D51') : (isDark ? '#a1a1aa' : '#71717a'),
                    cursor: 'pointer',
                    padding: '6px',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    transition: 'all 0.15s ease',
                  }}
                >
                  <IconPaperclip />
                </button>

                {showAttachMenu && (
                  <div
                    style={{
                      position: 'absolute',
                      bottom: 'calc(100% + 14px)',
                      left: 0,
                      width: '240px',
                      maxHeight: '380px',
                      overflowY: 'auto',
                      background: isDark ? 'rgba(18, 18, 24, 0.98)' : 'rgba(255, 255, 255, 0.98)',
                      border: isDark ? '1px solid rgba(212, 175, 55, 0.3)' : '1px solid rgba(0, 0, 0, 0.12)',
                      borderRadius: '16px',
                      padding: '8px',
                      boxShadow: isDark
                        ? '0 20px 48px rgba(0, 0, 0, 0.85), 0 0 0 1px rgba(255, 255, 255, 0.08)'
                        : '0 16px 36px rgba(0, 0, 0, 0.15)',
                      backdropFilter: 'blur(24px)',
                      WebkitBackdropFilter: 'blur(24px)',
                      zIndex: 120,
                      display: 'flex',
                      flexDirection: 'column',
                      gap: '4px',
                    }}
                    className="no-scrollbar"
                  >
                    {ATTACH_SECTIONS.map((sec, secIdx) => (
                      <div key={sec.category} style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                        {secIdx > 0 && (
                          <div
                            style={{
                              height: '1px',
                              background: isDark ? 'rgba(255, 255, 255, 0.08)' : 'rgba(0, 0, 0, 0.08)',
                              margin: '4px 6px',
                            }}
                          />
                        )}
                        <div
                          style={{
                            fontSize: '9.5px',
                            fontWeight: '800',
                            textTransform: 'uppercase',
                            letterSpacing: '0.14em',
                            color: isDark ? '#71717a' : '#8c827a',
                            padding: '4px 8px 2px 8px',
                          }}
                        >
                          {sec.category}
                        </div>
                        {sec.items.map(item => (
                          <button
                            key={item.id}
                            type="button"
                            onClick={() => handleAttachOptionClick(item.action)}
                            style={{
                              display: 'flex',
                              alignItems: 'center',
                              gap: '10px',
                              width: '100%',
                              padding: '7px 10px',
                              borderRadius: '8px',
                              background: 'transparent',
                              border: 'none',
                              color: isDark ? '#e4e4e7' : '#27272a',
                              fontSize: '12px',
                              fontWeight: '600',
                              cursor: 'pointer',
                              textAlign: 'left',
                              transition: 'all 0.12s ease',
                            }}
                            onMouseEnter={e => {
                              e.currentTarget.style.background = isDark ? 'rgba(255, 255, 255, 0.08)' : 'rgba(0, 0, 0, 0.05)';
                              e.currentTarget.style.color = isDark ? '#f2ca50' : '#C86D51';
                            }}
                            onMouseLeave={e => {
                              e.currentTarget.style.background = 'transparent';
                              e.currentTarget.style.color = isDark ? '#e4e4e7' : '#27272a';
                            }}
                          >
                            <span style={{ display: 'flex', alignItems: 'center', opacity: 0.85 }}>
                              {item.icon}
                            </span>
                            <span>{item.label}</span>
                          </button>
                        ))}
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <textarea
                ref={textareaRef}
                value={inputPrompt}
                onChange={e => setInputPrompt(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder={`Ask ${selectedModel}, formulate code specifications, or draft technical briefs...`}
                rows={1}
                style={{
                  flex: 1,
                  background: 'none',
                  border: 'none',
                  color: isDark ? '#ffffff' : '#1a1715',
                  fontSize: '13.5px',
                  lineHeight: '1.5',
                  outline: 'none',
                  resize: 'none',
                  maxHeight: '160px',
                  fontFamily: 'inherit',
                }}
              />

              <button
                type="button"
                onClick={() => handleSendMessage()}
                disabled={!inputPrompt.trim() && attachedFiles.length === 0}
                style={{
                  background: inputPrompt.trim() || attachedFiles.length > 0 ? (isDark ? '#d4af37' : '#1a1715') : isDark ? 'rgba(255, 255, 255, 0.06)' : 'rgba(0, 0, 0, 0.06)',
                  border: 'none',
                  borderRadius: '9999px',
                  padding: '8px 18px',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px',
                  color: inputPrompt.trim() || attachedFiles.length > 0 ? (isDark ? '#000000' : '#ffffff') : isDark ? '#71717a' : '#a1a1aa',
                  fontSize: '12px',
                  fontWeight: '700',
                  cursor: inputPrompt.trim() || attachedFiles.length > 0 ? 'pointer' : 'default',
                  transition: 'all 0.15s ease',
                }}
              >
                <IconSend />
                <span>Execute</span>
              </button>
            </div>

            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0 8px', fontSize: '10.5px', color: isDark ? '#71717a' : '#8c827a' }}>
              <span>Press <kbd style={{ background: isDark ? '#1a1a24' : '#e4e4e7', padding: '1px 6px', borderRadius: '4px', fontFamily: 'monospace' }}>Enter</kbd> to run • <kbd style={{ background: isDark ? '#1a1a24' : '#e4e4e7', padding: '1px 6px', borderRadius: '4px', fontFamily: 'monospace' }}>Shift + Enter</kbd> for newline</span>
              <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                <IconGlobe />
                <span>Web Grounding Active</span>
              </span>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
