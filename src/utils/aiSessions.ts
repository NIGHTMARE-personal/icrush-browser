import { ChatMessage } from './storage';

const STORAGE_KEY = 'icrush_ai_sessions';

export interface AISession {
  id: string;
  title: string;
  timestamp: number;
  messages: ChatMessage[];
  model: string;
  persona: string;
}

type Listener = (sessions: AISession[]) => void;

const listeners: Set<Listener> = new Set();

function notify() {
  const sessions = load();
  listeners.forEach(fn => fn(sessions));
}

export function load(): AISession[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

export function save(sessions: AISession[]) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(sessions));
  notify();
}

export function subscribe(fn: Listener): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

export function upsertSession(session: AISession) {
  const all = load();
  const idx = all.findIndex(s => s.id === session.id);
  if (idx >= 0) {
    all[idx] = session;
  } else {
    all.unshift(session);
  }
  save(all);
}

export function appendMessage(sessionId: string, msg: ChatMessage) {
  const all = load();
  const session = all.find(s => s.id === sessionId);
  if (session) {
    session.messages = [...session.messages, msg];
    save(all);
  }
}

export function updateLastAssistantMessage(sessionId: string, content: string, isStreaming = true) {
  const all = load();
  const session = all.find(s => s.id === sessionId);
  if (session && session.messages.length > 0) {
    const last = session.messages[session.messages.length - 1];
    if (last.role === 'assistant') {
      session.messages[session.messages.length - 1] = { ...last, content, isStreaming };
      save(all);
    }
  }
}

export function finishStreaming(sessionId: string) {
  const all = load();
  const session = all.find(s => s.id === sessionId);
  if (session && session.messages.length > 0) {
    const last = session.messages[session.messages.length - 1];
    if (last.role === 'assistant' && last.isStreaming) {
      session.messages[session.messages.length - 1] = { ...last, isStreaming: false };
      save(all);
    }
  }
}

export function deleteSession(sessionId: string) {
  const all = load().filter(s => s.id !== sessionId);
  save(all);
}

export function createSession(title: string, model: string, persona: string): AISession {
  const session: AISession = {
    id: `session-${Date.now()}`,
    title,
    timestamp: Date.now(),
    messages: [],
    model,
    persona,
  };
  upsertSession(session);
  return session;
}
