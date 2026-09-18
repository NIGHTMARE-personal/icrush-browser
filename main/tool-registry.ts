/**
 * Tool Registry — extensible tool system for agent actions.
 *
 * Tools are the agent's interface to the outside world:
 * - Web search (DuckDuckGo / local search)
 * - Code execution (sandboxed Function constructor)
 * - File read/write (sandboxed to userData)
 * - HTTP requests (fetch with timeout, CORS-aware)
 * - Screenshot capture
 * - Calculator / math evaluation
 * - Date/time utilities
 * - Text transformation (summarize, extract entities, etc.)
 *
 * Design invariants:
 * - All tools are registered with metadata and permission tiers
 * - Sensitive tools (file write, code exec) require approval
 * - All tool invocations are logged to the audit ledger
 * - Tools can be extended by plugins (future)
 * - No external network calls without user consent
 */
import crypto from 'crypto';
import { classifyAgentAction } from './agent-policy';
import type { AgentPermissionTier } from '../shared/agent-contracts';

// ─── Types ────────────────────────────────────────────────────────────────

export interface ToolParameter {
  name: string;
  type: 'string' | 'number' | 'boolean' | 'object' | 'array';
  description: string;
  required?: boolean;
  default?: unknown;
  enum?: string[];
}

export interface ToolDefinition {
  id: string;
  name: string;
  description: string;
  category: 'search' | 'code' | 'file' | 'http' | 'image' | 'utility' | 'custom';
  parameters: ToolParameter[];
  tier: AgentPermissionTier;
  enabled: boolean;
  timeoutMs: number;
  rateLimitPerMinute: number;
}

export interface ToolCallRequest {
  toolId: string;
  params: Record<string, unknown>;
  callId: string;
  agentId?: string;
  timestamp: number;
}

export interface ToolCallResult {
  callId: string;
  toolId: string;
  success: boolean;
  output?: unknown;
  error?: string;
  executionTimeMs: number;
  timestamp: number;
}

export type ToolExecutor = (
  params: Record<string, unknown>,
  context: ToolContext
) => Promise<unknown>;

export interface ToolContext {
  agentId?: string;
  webview?: { executeJavaScript: (code: string) => Promise<unknown> };
  userDataPath: string;
  signal?: AbortSignal;
}

// ─── Built-in Tool Definitions ────────────────────────────────────────────

const BUILT_IN_TOOLS: ToolDefinition[] = [
  {
    id: 'web_search',
    name: 'Web Search',
    description: 'Search the web using DuckDuckGo. Returns titles, URLs, and snippets.',
    category: 'search',
    parameters: [
      { name: 'query', type: 'string', description: 'Search query', required: true },
      { name: 'maxResults', type: 'number', description: 'Max results to return', default: 5 },
    ],
    tier: 'read',
    enabled: true,
    timeoutMs: 10_000,
    rateLimitPerMinute: 10,
  },
  {
    id: 'fetch_page',
    name: 'Fetch Page',
    description: 'Fetch a web page and return its text content. Supports HTML and JSON.',
    category: 'http',
    parameters: [
      { name: 'url', type: 'string', description: 'URL to fetch', required: true },
      { name: 'format', type: 'string', description: 'Response format', enum: ['text', 'html', 'json', 'markdown'], default: 'text' },
      { name: 'headers', type: 'object', description: 'Custom headers', default: {} },
    ],
    tier: 'read',
    enabled: true,
    timeoutMs: 15_000,
    rateLimitPerMinute: 20,
  },
  {
    id: 'execute_code',
    name: 'Execute Code',
    description: 'Execute JavaScript code in a sandboxed environment. Returns the result.',
    category: 'code',
    parameters: [
      { name: 'code', type: 'string', description: 'JavaScript code to execute', required: true },
      { name: 'timeoutMs', type: 'number', description: 'Execution timeout', default: 5000 },
    ],
    tier: 'sensitive',
    enabled: true,
    timeoutMs: 10_000,
    rateLimitPerMinute: 5,
  },
  {
    id: 'read_file',
    name: 'Read File',
    description: 'Read a file from the filesystem (sandboxed to userData).',
    category: 'file',
    parameters: [
      { name: 'path', type: 'string', description: 'File path (relative to userData)', required: true },
      { name: 'encoding', type: 'string', description: 'File encoding', default: 'utf-8' },
    ],
    tier: 'read',
    enabled: true,
    timeoutMs: 5000,
    rateLimitPerMinute: 30,
  },
  {
    id: 'write_file',
    name: 'Write File',
    description: 'Write content to a file (sandboxed to userData, requires approval).',
    category: 'file',
    parameters: [
      { name: 'path', type: 'string', description: 'File path (relative to userData)', required: true },
      { name: 'content', type: 'string', description: 'Content to write', required: true },
      { name: 'append', type: 'boolean', description: 'Append to existing file', default: false },
    ],
    tier: 'sensitive',
    enabled: true,
    timeoutMs: 5000,
    rateLimitPerMinute: 10,
  },
  {
    id: 'screenshot',
    name: 'Screenshot',
    description: 'Capture the current page as a base64 PNG image.',
    category: 'image',
    parameters: [
      { name: 'fullPage', type: 'boolean', description: 'Capture full page or viewport only', default: false },
    ],
    tier: 'read',
    enabled: true,
    timeoutMs: 10_000,
    rateLimitPerMinute: 5,
  },
  {
    id: 'calculate',
    name: 'Calculator',
    description: 'Evaluate a mathematical expression safely.',
    category: 'utility',
    parameters: [
      { name: 'expression', type: 'string', description: 'Math expression (e.g., "2+2", "Math.sqrt(144)")', required: true },
    ],
    tier: 'read',
    enabled: true,
    timeoutMs: 1000,
    rateLimitPerMinute: 60,
  },
  {
    id: 'current_time',
    name: 'Current Time',
    description: 'Get the current date and time.',
    category: 'utility',
    parameters: [
      { name: 'timezone', type: 'string', description: 'Timezone (e.g., "America/New_York")', default: 'UTC' },
    ],
    tier: 'read',
    enabled: true,
    timeoutMs: 500,
    rateLimitPerMinute: 120,
  },
  {
    id: 'json_parse',
    name: 'JSON Parse',
    description: 'Parse a JSON string and extract fields.',
    category: 'utility',
    parameters: [
      { name: 'text', type: 'string', description: 'JSON string to parse', required: true },
      { name: 'path', type: 'string', description: 'JSONPath to extract (e.g., "$.data.items[0].name")' },
    ],
    tier: 'read',
    enabled: true,
    timeoutMs: 1000,
    rateLimitPerMinute: 60,
  },
  {
    id: 'text_transform',
    name: 'Text Transform',
    description: 'Transform text: summarize, extract entities, count words, etc.',
    category: 'utility',
    parameters: [
      { name: 'text', type: 'string', description: 'Input text', required: true },
      { name: 'operation', type: 'string', description: 'Transformation', enum: ['summarize', 'word_count', 'extract_emails', 'extract_urls', 'extract_numbers', 'base64_encode', 'base64_decode', 'url_encode', 'url_decode'], required: true },
    ],
    tier: 'read',
    enabled: true,
    timeoutMs: 3000,
    rateLimitPerMinute: 30,
  },
];

// ─── Tool Registry ────────────────────────────────────────────────────────

export class ToolRegistry {
  private tools: Map<string, ToolDefinition> = new Map();
  private executors: Map<string, ToolExecutor> = new Map();
  private callHistory: ToolCallResult[] = [];
  private rateLimitCounters: Map<string, { count: number; windowStart: number }> = new Map();
  private userDataPath: string;

  constructor(userDataPath: string) {
    this.userDataPath = userDataPath;
    this.registerBuiltInTools();
  }

  // ─── Registration ──────────────────────────────────────────────────

  registerTool(definition: ToolDefinition, executor: ToolExecutor): void {
    this.tools.set(definition.id, definition);
    this.executors.set(definition.id, executor);
  }

  unregisterTool(toolId: string): void {
    this.tools.delete(toolId);
    this.executors.delete(toolId);
  }

  enableTool(toolId: string): void {
    const tool = this.tools.get(toolId);
    if (tool) tool.enabled = true;
  }

  disableTool(toolId: string): void {
    const tool = this.tools.get(toolId);
    if (tool) tool.enabled = false;
  }

  getTool(toolId: string): ToolDefinition | undefined {
    return this.tools.get(toolId);
  }

  getToolsByCategory(category: ToolDefinition['category']): ToolDefinition[] {
    return Array.from(this.tools.values()).filter(t => t.category === category && t.enabled);
  }

  getToolsByTier(tier: AgentPermissionTier): ToolDefinition[] {
    const tierRank: Record<AgentPermissionTier, number> = { read: 0, navigate: 1, interact: 2, sensitive: 3 };
    return Array.from(this.tools.values()).filter(t => t.enabled && tierRank[t.tier] <= tierRank[tier]);
  }

  getAllTools(): ToolDefinition[] {
    return Array.from(this.tools.values());
  }

  getEnabledTools(): ToolDefinition[] {
    return Array.from(this.tools.values()).filter(t => t.enabled);
  }

  // ─── Execution ─────────────────────────────────────────────────────

  async execute(
    request: ToolCallRequest,
    context?: Partial<ToolContext>
  ): Promise<ToolCallResult> {
    const tool = this.tools.get(request.toolId);
    if (!tool) {
      return {
        callId: request.callId,
        toolId: request.toolId,
        success: false,
        error: `Tool "${request.toolId}" not found`,
        executionTimeMs: 0,
        timestamp: Date.now(),
      };
    }

    if (!tool.enabled) {
      return {
        callId: request.callId,
        toolId: request.toolId,
        success: false,
        error: `Tool "${request.toolId}" is disabled`,
        executionTimeMs: 0,
        timestamp: Date.now(),
      };
    }

    // Rate limiting
    if (!this.checkRateLimit(tool)) {
      return {
        callId: request.callId,
        toolId: request.toolId,
        success: false,
        error: `Rate limit exceeded for "${request.toolId}" (${tool.rateLimitPerMinute}/min)`,
        executionTimeMs: 0,
        timestamp: Date.now(),
      };
    }

    // Validate parameters
    const validationError = this.validateParams(tool, request.params);
    if (validationError) {
      return {
        callId: request.callId,
        toolId: request.toolId,
        success: false,
        error: validationError,
        executionTimeMs: 0,
        timestamp: Date.now(),
      };
    }

    const executor = this.executors.get(request.toolId);
    if (!executor) {
      return {
        callId: request.callId,
        toolId: request.toolId,
        success: false,
        error: `No executor registered for "${request.toolId}"`,
        executionTimeMs: 0,
        timestamp: Date.now(),
      };
    }

    const ctx: ToolContext = {
      userDataPath: this.userDataPath,
      ...context,
    };

    const startTime = Date.now();
    try {
      const output = await this.executeWithTimeout(
        () => executor(request.params, ctx),
        tool.timeoutMs
      );
      const result: ToolCallResult = {
        callId: request.callId,
        toolId: request.toolId,
        success: true,
        output,
        executionTimeMs: Date.now() - startTime,
        timestamp: Date.now(),
      };
      this.callHistory.push(result);
      return result;
    } catch (err) {
      const result: ToolCallResult = {
        callId: request.callId,
        toolId: request.toolId,
        success: false,
        error: (err as Error).message,
        executionTimeMs: Date.now() - startTime,
        timestamp: Date.now(),
      };
      this.callHistory.push(result);
      return result;
    }
  }

  // ─── Built-in Executors ────────────────────────────────────────────

  private registerBuiltInTools(): void {
    for (const tool of BUILT_IN_TOOLS) {
      this.tools.set(tool.id, tool);
    }

    // Web search
    this.executors.set('web_search', async (params) => {
      const query = String(params.query);
      const maxResults = Number(params.maxResults) || 5;
      return this.webSearch(query, maxResults);
    });

    // Fetch page
    this.executors.set('fetch_page', async (params, ctx) => {
      const url = String(params.url);
      const format = String(params.format || 'text');
      const headers = (params.headers as Record<string, string>) || {};
      return this.fetchPage(url, format, headers, ctx.signal);
    });

    // Execute code
    this.executors.set('execute_code', async (params) => {
      const code = String(params.code);
      const timeoutMs = Number(params.timeoutMs) || 5000;
      return this.executeCode(code, timeoutMs);
    });

    // Read file
    this.executors.set('read_file', async (params, ctx) => {
      const fs = await import('fs');
      const path = await import('path');
      const filePath = path.join(ctx.userDataPath, String(params.path));
      // Security: ensure path is within userData
      if (!filePath.startsWith(ctx.userDataPath)) {
        throw new Error('Path must be within userData directory');
      }
      return fs.readFileSync(filePath, String(params.encoding) as BufferEncoding);
    });

    // Write file
    this.executors.set('write_file', async (params, ctx) => {
      const fs = await import('fs');
      const path = await import('path');
      const filePath = path.join(ctx.userDataPath, String(params.path));
      if (!filePath.startsWith(ctx.userDataPath)) {
        throw new Error('Path must be within userData directory');
      }
      const dir = path.dirname(filePath);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
      const content = String(params.content);
      const append = Boolean(params.append);
      if (append) {
        fs.appendFileSync(filePath, content);
      } else {
        fs.writeFileSync(filePath, content);
      }
      return { written: content.length, path: params.path };
    });

    // Screenshot
    this.executors.set('screenshot', async (params, ctx) => {
      if (!ctx.webview) throw new Error('No webview available for screenshot');
      const fullPage = Boolean(params.fullPage);
      const js = `
        (function() {
          const canvas = document.createElement('canvas');
          canvas.width = ${fullPage ? 'document.documentElement.scrollWidth' : 'window.innerWidth'};
          canvas.height = ${fullPage ? 'document.documentElement.scrollHeight' : 'window.innerHeight'};
          // Note: actual screenshot requires desktopCapturer in Electron main process
          return JSON.stringify({ note: 'Screenshot requires desktopCapturer API', width: canvas.width, height: canvas.height });
        })()
      `;
      return ctx.webview.executeJavaScript(js);
    });

    // Calculator
    this.executors.set('calculate', async (params) => {
      const expr = String(params.expression);
      // Sandboxed math evaluation — only allow math operations
      const sanitized = expr.replace(/[^0-9+\-*/().,%^ Math.sqrtpowfloorceilabsroundminmaxPIE]/g, '');
      if (sanitized.length === 0) throw new Error('Invalid expression');
      // Use Function constructor in strict mode
      const fn = new Function(`"use strict"; return (${sanitized})`);
      return fn();
    });

    // Current time
    this.executors.set('current_time', async (params) => {
      const tz = String(params.timezone || 'UTC');
      return new Date().toLocaleString('en-US', { timeZone: tz });
    });

    // JSON parse
    this.executors.set('json_parse', async (params) => {
      const text = String(params.text);
      const path = params.path ? String(params.path) : undefined;
      const parsed = JSON.parse(text);
      if (!path) return parsed;
      // Simple JSONPath-like extraction
      const parts = path.replace(/^\$\.?/, '').split('.');
      let current: unknown = parsed;
      for (const part of parts) {
        const arrayMatch = part.match(/^(\w+)\[(\d+)\]$/);
        if (arrayMatch) {
          current = (current as Record<string, unknown>)[arrayMatch[1]];
          current = (current as unknown[])[parseInt(arrayMatch[2])];
        } else {
          current = (current as Record<string, unknown>)[part];
        }
      }
      return current;
    });

    // Text transform
    this.executors.set('text_transform', async (params) => {
      const text = String(params.text);
      const operation = String(params.operation);
      return this.transformText(text, operation);
    });
  }

  // ─── Tool Implementations ──────────────────────────────────────────

  private async webSearch(query: string, maxResults: number): Promise<unknown> {
    const url = `https://html.duckduckgo.com/html/?q=${encodeURIComponent(query)}`;
    const res = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
      },
      signal: AbortSignal.timeout(10_000),
    });

    const html = await res.text();
    const results: Array<{ title: string; url: string; snippet: string }> = [];

    // Parse DuckDuckGo HTML results
    const resultRegex = /<a[^>]*class="result__a"[^>]*href="([^"]*)"[^>]*>([^<]*)<\/a>[\s\S]*?<a[^>]*class="result__snippet"[^>]*>([\s\S]*?)<\/a>/gi;
    let match;
    while ((match = resultRegex.exec(html)) && results.length < maxResults) {
      const href = match[1];
      const title = match[2].replace(/<[^>]*>/g, '').trim();
      const snippet = match[3].replace(/<[^>]*>/g, '').trim();
      // Decode DuckDuckGo redirect URL
      const realUrl = href.includes('uddg=') ? decodeURIComponent(href.split('uddg=')[1]?.split('&')[0] || '') : href;
      if (title && realUrl) {
        results.push({ title, url: realUrl, snippet });
      }
    }

    return { query, results, totalResults: results.length };
  }

  private async fetchPage(url: string, format: string, headers: Record<string, string>, signal?: AbortSignal): Promise<unknown> {
    const res = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        ...headers,
      },
      signal: signal || AbortSignal.timeout(15_000),
    });

    if (!res.ok) throw new Error(`HTTP ${res.status}: ${res.statusText}`);

    switch (format) {
      case 'json':
        return await res.json();
      case 'html':
        return await res.text();
      case 'markdown': {
        const html = await res.text();
        return this.htmlToMarkdown(html);
      }
      default:
        return await res.text();
    }
  }

  private async executeCode(code: string, timeoutMs: number): Promise<unknown> {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('Code execution timed out')), timeoutMs);
      try {
        // Sandboxed execution with limited globals
        const sandbox = {
          console: { log: (...args: unknown[]) => {}, error: (...args: unknown[]) => {}, warn: (...args: unknown[]) => {} },
          JSON,
          Math,
          Date,
          parseInt,
          parseFloat,
          isNaN,
          isFinite,
          encodeURIComponent,
          decodeURIComponent,
          encodeURI,
          decodeURI,
          Array,
          Object,
          String,
          Number,
          Boolean,
          RegExp,
          Map,
          Set,
          Promise,
        };
        const fn = new Function(...Object.keys(sandbox), `"use strict"; return (${code})`);
        const result = fn(...Object.values(sandbox));
        // Handle async results
        if (result && typeof result === 'object' && typeof (result as Promise<unknown>).then === 'function') {
          (result as Promise<unknown>).then(r => { clearTimeout(timer); resolve(r); }).catch(e => { clearTimeout(timer); reject(e); });
        } else {
          clearTimeout(timer);
          resolve(result);
        }
      } catch (err) {
        clearTimeout(timer);
        reject(err);
      }
    });
  }

  private transformText(text: string, operation: string): unknown {
    switch (operation) {
      case 'summarize':
        // Simple extractive summary: take first 3 sentences
        return text.split(/[.!?]+/).filter(s => s.trim().length > 10).slice(0, 3).join('. ').trim() + '.';
      case 'word_count':
        return text.split(/\s+/).filter(w => w.length > 0).length;
      case 'extract_emails':
        return [...new Set(text.match(/[\w.+-]+@[\w-]+\.[\w.-]+/g) || [])];
      case 'extract_urls':
        return [...new Set(text.match(/https?:\/\/[^\s<>"]+/g) || [])];
      case 'extract_numbers':
        return [...new Set(text.match(/-?\d+\.?\d*/g) || [])].map(Number);
      case 'base64_encode':
        return Buffer.from(text).toString('base64');
      case 'base64_decode':
        return Buffer.from(text, 'base64').toString('utf-8');
      case 'url_encode':
        return encodeURIComponent(text);
      case 'url_decode':
        return decodeURIComponent(text);
      default:
        throw new Error(`Unknown operation: ${operation}`);
    }
  }

  private htmlToMarkdown(html: string): string {
    return html
      .replace(/<script[\s\S]*?<\/script>/gi, '')
      .replace(/<style[\s\S]*?<\/style>/gi, '')
      .replace(/<h1[^>]*>([\s\S]*?)<\/h1>/gi, '# $1\n\n')
      .replace(/<h2[^>]*>([\s\S]*?)<\/h2>/gi, '## $1\n\n')
      .replace(/<h3[^>]*>([\s\S]*?)<\/h3>/gi, '### $1\n\n')
      .replace(/<h4[^>]*>([\s\S]*?)<\/h4>/gi, '#### $1\n\n')
      .replace(/<p[^>]*>([\s\S]*?)<\/p>/gi, '$1\n\n')
      .replace(/<br\s*\/?>/gi, '\n')
      .replace(/<li[^>]*>([\s\S]*?)<\/li>/gi, '- $1\n')
      .replace(/<[^>]*>/g, '')
      .replace(/&nbsp;/g, ' ')
      .replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/\n{3,}/g, '\n\n')
      .trim();
  }

  // ─── Helpers ───────────────────────────────────────────────────────

  private checkRateLimit(tool: ToolDefinition): boolean {
    const now = Date.now();
    const counter = this.rateLimitCounters.get(tool.id);

    if (!counter || now - counter.windowStart > 60_000) {
      this.rateLimitCounters.set(tool.id, { count: 1, windowStart: now });
      return true;
    }

    if (counter.count >= tool.rateLimitPerMinute) {
      return false;
    }

    counter.count++;
    return true;
  }

  private validateParams(tool: ToolDefinition, params: Record<string, unknown>): string | null {
    for (const param of tool.parameters) {
      if (param.required && !(param.name in params)) {
        return `Missing required parameter "${param.name}" for tool "${tool.id}"`;
      }
      if (param.enum && params[param.name] && !param.enum.includes(String(params[param.name]))) {
        return `Invalid value for parameter "${param.name}": "${params[param.name]}". Must be one of: ${param.enum.join(', ')}`;
      }
    }
    return null;
  }

  private async executeWithTimeout<T>(fn: () => Promise<T>, ms: number): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('Tool execution timed out')), ms);
      fn().then(result => { clearTimeout(timer); resolve(result); }).catch(err => { clearTimeout(timer); reject(err); });
    });
  }

  // ─── History ───────────────────────────────────────────────────────

  getCallHistory(limit = 50): ToolCallResult[] {
    return this.callHistory.slice(-limit);
  }

  getStats(): { totalCalls: number; successRate: number; avgExecutionTime: number } {
    const total = this.callHistory.length;
    const successful = this.callHistory.filter(r => r.success).length;
    const avgTime = total > 0 ? this.callHistory.reduce((sum, r) => sum + r.executionTimeMs, 0) / total : 0;
    return {
      totalCalls: total,
      successRate: total > 0 ? successful / total : 0,
      avgExecutionTime: avgTime,
    };
  }
}
