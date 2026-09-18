import { useState, useEffect, useCallback, useRef } from 'react';
import { storage, ChatMessage } from '../utils/storage';
import { generateUUID } from '../utils/uuid';
import { supabase } from '../utils/supabase';

interface BrowserCommand {
  action: 'navigate' | 'search' | 'goBack' | 'goForward' | 'refresh' | 'newTab' | 'closeTab';
  url?: string;
  query?: string;
}

interface GeminiErrorInfo {
  shouldRetry: boolean;
  retryAfter?: number;
}

interface UseGeminiOptions {
  onExecuteCommand?: (commands: BrowserCommand[]) => void;
  onDone?: () => void;
  activeProvider?: string;
}

export function useGemini({ onExecuteCommand, onDone, activeProvider }: UseGeminiOptions = {}) {
  const [messages, setMessages] = useState<ChatMessage[]>(() => {
    return storage.getChatHistory();
  });
  const [isLoading, setIsLoading] = useState(false);
  const [geminiError, setGeminiError] = useState<GeminiErrorInfo | null>(null);
  const messagesRef = useRef<ChatMessage[]>(messages);

  useEffect(() => {
    messagesRef.current = messages;
    storage.setChatHistory(messages);
  }, [messages]);

  // Load chat history from Supabase on mount
  useEffect(() => {
    const loadChatHistory = async () => {
      try {
        const { data, error } = await supabase
          .from('chat_messages')
          .select('*')
          .order('created_at', { ascending: true });
        if (error) {
          console.error('Supabase error loading chat history:', error);
          return;
        }
        if (data && data.length > 0) {
          const loadedMessages: ChatMessage[] = data.map(m => ({
            id: m.id,
            role: m.role as 'user' | 'assistant',
            content: m.content,
            isError: m.is_error,
          }));
          setMessages(loadedMessages);
          storage.setChatHistory(loadedMessages);
        }
      } catch (err) {
        console.error('Failed to load chat history from Supabase:', err);
      }
    };
    loadChatHistory();
  }, []);

  const syncMessageToSupabase = async (message: ChatMessage) => {
    try {
      const { error } = await supabase.from('chat_messages').upsert({
        id: message.id,
        role: message.role,
        content: message.content,
        is_error: !!message.isError,
      });
      if (error) console.error('Supabase error syncing message:', error);
    } catch (err) {
      console.error('Failed to sync message to Supabase:', err);
    }
  };

  useEffect(() => {
    const unsubscribeStream = window.electronAPI.onGeminiResponse((text: string) => {
      setMessages(prev => {
        const last = prev[prev.length - 1];
        if (last && last.role === 'assistant') {
          return [...prev.slice(0, prev.length - 1), { ...last, content: text }];
        }
        return prev;
      });
    });

    const unsubscribeDone = window.electronAPI.onGeminiDone(() => {
      setMessages(prev => {
        const last = prev[prev.length - 1];
        if (last && last.role === 'assistant') {
          const finishedMessage = { ...last, isStreaming: false };
          syncMessageToSupabase(finishedMessage);
          return [...prev.slice(0, prev.length - 1), finishedMessage];
        }
        return prev;
      });
      setIsLoading(false);
      if (onDone) onDone();
    });

    const unsubscribeError = window.electronAPI.onGeminiError(
      (errorMessage: string, info?: GeminiErrorInfo) => {
        setGeminiError(info ?? { shouldRetry: false });
        setMessages(prev => {
          const last = prev[prev.length - 1];
          const errorMsg = `Error: ${errorMessage}`;
          let finalMessage: ChatMessage;
          let nextPrev = prev;
          if (last && last.role === 'assistant') {
            finalMessage = { ...last, content: errorMsg, isStreaming: false, isError: true };
            nextPrev = [...prev.slice(0, prev.length - 1)];
          } else {
            finalMessage = {
              id: generateUUID(),
              role: 'assistant',
              content: errorMsg,
              isError: true,
            };
          }
          syncMessageToSupabase(finalMessage);
          return [...nextPrev, finalMessage];
        });
        setIsLoading(false);
      }
    );

    const unsubscribeCommand = window.electronAPI.onExecuteCommand((commands: BrowserCommand[]) => {
      if (onExecuteCommand) {
        onExecuteCommand(commands);
      }
    });

    return () => {
      unsubscribeStream();
      unsubscribeDone();
      unsubscribeError();
      unsubscribeCommand();
    };
  }, [onExecuteCommand, onDone]);

  const sendMessage = useCallback(
    (
      content: string,
      customApiKey?: string,
      options?: {
        isTor?: boolean;
        forceLocal?: boolean;
        torCloudRouting?: boolean;
        files?: Array<{ inlineData: { mimeType: string; data: string } }>;
      }
    ) => {
      if (!content.trim() || isLoading) {
        return;
      }

      const userMessage: ChatMessage = {
        id: generateUUID(),
        role: 'user',
        content: content.trim(),
      };

      const assistantPlaceholder: ChatMessage = {
        id: generateUUID(),
        role: 'assistant',
        content: 'Thinking...',
        isStreaming: true,
      };

      syncMessageToSupabase(userMessage);

      const updatedMessages = [...messagesRef.current, userMessage];
      setMessages([...updatedMessages, assistantPlaceholder]);
      setIsLoading(true);
      setGeminiError(null);

      const historyForApi = updatedMessages
        .filter(m => !m.isError)
        .map(m => ({
          role: m.role,
          content: m.content,
        }));

      // Pre-extract content from all open tabs for AI context
      (async () => {
        let tabContext = '';
        try {
          const tabs = await window.electronAPI.tab.extractAllContent();
          if (tabs && tabs.length > 0) {
            tabContext = '\n\n--- OPEN TABS CONTENT ---\n' + tabs.map((t, i) =>
              `[Tab ${i + 1}: ${t.title} (${t.url})]\n${t.content.substring(0, 4000)}`
            ).join('\n\n') + '\n--- END TABS ---';
          }
        } catch { /* ignore extraction errors */ }

        const messageWithContext = tabContext
          ? userMessage.content + tabContext
          : userMessage.content;

        window.electronAPI.sendGeminiMessage(
          messageWithContext,
          historyForApi,
          activeProvider,
          customApiKey,
          options
        );
      })();
    },
    [isLoading, activeProvider]
  );

  const clearChat = useCallback(async () => {
    setMessages([]);
    storage.setChatHistory([]);
    setGeminiError(null);
    try {
      const { error } = await supabase.from('chat_messages').delete().neq('role', 'placeholder');
      if (error) console.error('Supabase error clearing chat:', error);
    } catch (err) {
      console.error('Failed to clear chat in Supabase:', err);
    }
  }, []);

  const clearGeminiError = useCallback(() => {
    setGeminiError(null);
  }, []);

  return {
    messages,
    isLoading,
    setIsLoading,
    sendMessage,
    clearChat,
    clearGeminiError,
    setMessages,
    geminiError,
  };
}
