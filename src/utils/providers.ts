export interface ProviderConfig {
  id: string;
  name: string;
  keyPrefix: string[];
  placeholder: string;
  models: string[];
  defaultModel: string;
  baseUrl?: string;
}

export interface DetectedProvider {
  id: string;
  name: string;
  models: string[];
  defaultModel: string;
  hasKey: boolean;
}

export interface LocalModel {
  id: string;
  name: string;
  size?: string;
  parameterSize?: string;
  family?: string;
}

export const PROVIDERS: ProviderConfig[] = [
  {
    id: 'gemini',
    name: 'Google Gemini',
    keyPrefix: ['AIzaSy', 'AQ'],
    placeholder: 'AIzaSy... or AQ...',
    models: ['gemini-2.5-flash', 'gemini-2.5-pro'],
    defaultModel: 'gemini-2.5-flash',
  },
  {
    id: 'openai',
    name: 'OpenAI',
    keyPrefix: ['sk-'],
    placeholder: 'sk-...',
    models: ['gpt-4o', 'gpt-4o-mini'],
    defaultModel: 'gpt-4o',
  },
  {
    id: 'anthropic',
    name: 'Anthropic',
    keyPrefix: ['sk-ant-'],
    placeholder: 'sk-ant-...',
    models: ['claude-sonnet-4-20250514', 'claude-3-5-haiku-20241022'],
    defaultModel: 'claude-sonnet-4-20250514',
  },
  {
    id: 'groq',
    name: 'Groq',
    keyPrefix: ['gsk_'],
    placeholder: 'gsk_...',
    models: ['llama-3.3-70b-versatile'],
    defaultModel: 'llama-3.3-70b-versatile',
  },
  {
    id: 'openrouter',
    name: 'OpenRouter',
    keyPrefix: ['sk-or-'],
    placeholder: 'sk-or-...',
    models: ['google/gemini-2.5-flash'],
    defaultModel: 'google/gemini-2.5-flash',
  },
  {
    id: 'deepseek',
    name: 'DeepSeek',
    keyPrefix: ['sk-'],
    placeholder: 'sk-...',
    models: ['deepseek-chat'],
    defaultModel: 'deepseek-chat',
  },
];

export function detectProviderFromKey(apiKey: string): ProviderConfig | null {
  const trimmed = apiKey.trim();
  if (!trimmed) return null;

  for (const provider of PROVIDERS) {
    for (const prefix of provider.keyPrefix) {
      if (trimmed.startsWith(prefix)) {
        return provider;
      }
    }
  }

  if (trimmed.startsWith('sk-')) {
    const lower = trimmed.toLowerCase();
    if (lower.includes('ant')) {
      return PROVIDERS.find(p => p.id === 'anthropic') || null;
    }
    if (lower.includes('or')) {
      return PROVIDERS.find(p => p.id === 'openrouter') || null;
    }
  }

  return null;
}

export function getProviderById(id: string): ProviderConfig | undefined {
  return PROVIDERS.find(p => p.id === id);
}

export function getBestModelForProvider(providerId: string, availableModels: string[]): string {
  const config = PROVIDERS.find(p => p.id === providerId);
  if (!config) return availableModels[0] || 'unknown';

  for (const preferred of config.models) {
    if (availableModels.includes(preferred)) return preferred;
  }
  return availableModels[0] || config.defaultModel;
}

export async function detectLocalModels(): Promise<LocalModel[]> {
  try {
    const response = await fetch('http://localhost:11434/api/tags', {
      method: 'GET',
      signal: AbortSignal.timeout(3000),
    });
    if (!response.ok) return [];
    const data = await response.json();
    if (!data.models || !Array.isArray(data.models)) return [];

    return data.models.map((m: Record<string, unknown>) => ({
      id: m.name as string,
      name: (m.name as string).split(':')[0],
      size: m.size ? `${((m.size as number) / (1024 * 1024 * 1024)).toFixed(1)}GB` : undefined,
      parameterSize: (m.details as Record<string, unknown>)?.parameter_size as string | undefined,
      family: (m.details as Record<string, unknown>)?.family as string | undefined,
    }));
  } catch {
    return [];
  }
}

export function getLocalProviderConfig(): { id: string; name: string; baseUrl: string } {
  return {
    id: 'local',
    name: 'Local Ollama',
    baseUrl: 'http://localhost:11434',
  };
}
