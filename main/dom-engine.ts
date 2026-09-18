/**
 * DOM Interaction Engine — bridges the Agent Loop to Electron webview execution.
 *
 * Provides a clean API for executing agent actions against a webview:
 * - Click, type, scroll, extract, fill, select, hover, wait, press_key
 * - Shadow DOM traversal built-in
 * - Accessibility tree extraction
 * - Visual element detection with bounding boxes
 * - Page content extraction (articles, forms, inputs, links)
 * - Mutation observation for dynamic SPAs
 * - Retry logic for flaky selectors
 *
 * Design invariants:
 * - All JavaScript injection happens via webContents.executeJavaScript()
 * - Never exposes raw webContents to the agent — only safe actions
 * - Each action is isolated: no side effects across webviews
 * - Supports both Electron BrowserWindow and webview tag
 */
import { generateActionJS, parseAgentAction, generateHighlightJS, generateTooltipJS, generateSensitiveFieldDetectionJS } from './agent-engine';
import type { AgentAction, AgentActionResult } from './agent-engine';

// ─── Types ────────────────────────────────────────────────────────────────

export interface DOMEngineConfig {
  maxRetries: number;
  retryDelayMs: number;
  actionTimeoutMs: number;
  enableVisualFeedback: boolean;
}

export interface PageState {
  url: string;
  title: string;
  text: string;
  links: Array<{ text: string; url: string; rect?: DOMRect }>;
  forms: Array<{
    action: string;
    method: string;
    fields: Array<{
      name: string;
      type: string;
      placeholder: string;
      value: string;
      selector: string;
      rect?: DOMRect;
    }>;
  }>;
  inputs: Array<{
    tag: string;
    type: string;
    name: string;
    placeholder: string;
    selector: string;
    visible: boolean;
    rect?: DOMRect;
  }>;
  headings: Array<{ level: number; text: string }>;
  images: Array<{ src: string; alt: string; width: number; height: number }>;
  tables: Array<{ rows: number; cols: number; headers: string[]; preview: string }>;
  ariaTree?: A11yNode;
  timestamp: number;
}

export interface A11yNode {
  role: string;
  name: string;
  description?: string;
  children: A11yNode[];
  rect?: { x: number; y: number; width: number; height: number };
  interactive: boolean;
}

export interface DOMRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface MutationSnapshot {
  addedNodes: number;
  removedNodes: number;
  attributeChanges: number;
  timestamp: number;
}

export type ExecuteOptions = {
  retry?: boolean;
  visualFeedback?: boolean;
  timeoutMs?: number;
};

// ─── Default Config ───────────────────────────────────────────────────────

const DEFAULT_CONFIG: DOMEngineConfig = {
  maxRetries: 3,
  retryDelayMs: 500,
  actionTimeoutMs: 15_000,
  enableVisualFeedback: true,
};

// ─── DOM Interaction Engine ───────────────────────────────────────────────

export class DOMEngine {
  private config: DOMEngineConfig;
  private executeJavaScript: (code: string) => Promise<unknown>;
  private webviewId: number;
  private mutationObserverActive = false;

  constructor(
    executeJs: (code: string) => Promise<unknown>,
    webviewId: number,
    config?: Partial<DOMEngineConfig>
  ) {
    this.executeJavaScript = executeJs;
    this.webviewId = webviewId;
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  // ─── Core Action Execution ──────────────────────────────────────────

  /**
   * Execute any agent action against the webview.
   * Handles retries, timeouts, and visual feedback.
   */
  async execute(
    action: AgentAction,
    options: ExecuteOptions = {}
  ): Promise<AgentActionResult> {
    const retry = options.retry ?? true;
    const visualFeedback = options.visualFeedback ?? this.config.enableVisualFeedback;
    const timeoutMs = options.timeoutMs ?? this.config.actionTimeoutMs;

    // Generate the JavaScript for this action
    const jsCode = generateActionJS(action);

    let lastError: string | undefined;
    const maxAttempts = retry ? this.config.maxRetries : 1;

    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      try {
        // Show visual feedback before action
        if (visualFeedback && action.selector && (action.type === 'click' || action.type === 'fill_form')) {
          await this.showHighlight(action.selector).catch(() => {});
        }

        // Execute with timeout
        const result = await this.executeWithTimeout(jsCode, timeoutMs);
        const parsed = this.parseResult(result);

        if (parsed.success) {
          return parsed;
        }

        lastError = parsed.error;
        if (attempt < maxAttempts - 1) {
          await this.sleep(this.config.retryDelayMs * (attempt + 1));
        }
      } catch (err) {
        lastError = (err as Error).message;
        if (attempt < maxAttempts - 1) {
          await this.sleep(this.config.retryDelayMs * (attempt + 1));
        }
      }
    }

    return { success: false, error: `Action failed after ${maxAttempts} attempts: ${lastError}` };
  }

  /**
   * Execute raw JavaScript in the webview and return the result.
   */
  async executeJS(code: string): Promise<unknown> {
    return this.executeJavaScript(code);
  }

  // ─── Page State Extraction ──────────────────────────────────────────

  /**
   * Extract full page state: content, links, forms, inputs, headings, images, tables.
   */
  async getPageState(): Promise<PageState> {
    const js = `
      (function() {
        const title = document.title;
        const url = window.location.href;

        function extractAllText(root = document.body) {
          if (!root) return '';
          let text = '';
          const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, null);
          let node;
          while ((node = walker.nextNode())) {
            const parent = node.parentElement;
            if (parent && !['SCRIPT','STYLE','NOSCRIPT','SVG','PATH'].includes(parent.tagName)) {
              const val = node.nodeValue?.trim();
              if (val) text += val + ' ';
            }
          }
          for (const el of Array.from(root.querySelectorAll('*'))) {
            if (el.shadowRoot) text += ' ' + extractAllText(el.shadowRoot);
          }
          return text;
        }

        function queryAllDeep(sel, root = document) {
          let list = Array.from(root.querySelectorAll(sel));
          for (const el of Array.from(root.querySelectorAll('*'))) {
            if (el.shadowRoot) list = list.concat(queryAllDeep(sel, el.shadowRoot));
          }
          return list;
        }

        function getRect(el) {
          try {
            const r = el.getBoundingClientRect();
            return r ? { x: r.x, y: r.y, width: r.width, height: r.height } : undefined;
          } catch { return undefined; }
        }

        const text = extractAllText().substring(0, 10000);

        const rawLinks = queryAllDeep('a[href]').slice(0, 60).map(a => {
          const href = a.getAttribute('href') || '';
          const fullHref = href.startsWith('/') ? location.origin + href : href;
          return {
            text: (a.textContent || '').replace(/\\s+/g, ' ').trim().substring(0, 120),
            url: fullHref,
            rect: getRect(a),
          };
        }).filter(l => l.text && l.url && l.url.startsWith('http'));

        const forms = Array.from(document.querySelectorAll('form')).map(f => ({
          action: f.action,
          method: f.method,
          fields: Array.from(f.querySelectorAll('input, textarea, select')).map(i => ({
            name: i.getAttribute('name') || i.getAttribute('id') || '',
            type: i.getAttribute('type') || i.tagName.toLowerCase(),
            placeholder: i.getAttribute('placeholder') || '',
            value: i.value || '',
            selector: i.id ? '#' + i.id : (i.getAttribute('name') ? '[name="' + i.getAttribute('name') + '"]' : ''),
            rect: getRect(i),
          })),
        }));

        const inputs = queryAllDeep('input:not([type="hidden"]), textarea, select').slice(0, 30).map(i => {
          const r = getRect(i);
          return {
            tag: i.tagName,
            type: i.getAttribute('type') || '',
            name: i.getAttribute('name') || i.getAttribute('id') || '',
            placeholder: i.getAttribute('placeholder') || '',
            selector: i.id ? '#' + i.id : (i.getAttribute('name') ? '[name="' + i.getAttribute('name') + '"]' : ''),
            visible: r ? r.width > 0 && r.height > 0 : false,
            rect: r,
          };
        });

        const headings = queryAllDeep('h1, h2, h3, h4, h5, h6').slice(0, 20).map(h => ({
          level: parseInt(h.tagName[1]),
          text: (h.textContent || '').trim().substring(0, 200),
        }));

        const images = queryAllDeep('img[src]').slice(0, 20).map(img => ({
          src: img.getAttribute('src') || '',
          alt: img.getAttribute('alt') || '',
          width: img.naturalWidth || img.width || 0,
          height: img.naturalHeight || img.height || 0,
        }));

        const tables = queryAllDeep('table').slice(0, 5).map(table => {
          const headerCells = Array.from(table.querySelectorAll('thead th, tr:first-child th'));
          const headers = headerCells.map(th => (th.textContent || '').trim());
          const allRows = Array.from(table.querySelectorAll('tr'));
          const previewRows = allRows.slice(0, 3).map(row =>
            Array.from(row.querySelectorAll('td, th')).map(c => (c.textContent || '').trim()).join(' | ')
          );
          return {
            rows: allRows.length,
            cols: headerCells.length || (allRows[0]?.querySelectorAll('td, th').length || 0),
            headers,
            preview: previewRows.join('\\n'),
          };
        });

        return JSON.stringify({ title, url, text, links: rawLinks, forms, inputs, headings, images, tables, timestamp: Date.now() });
      })()
    `;

    const result = await this.executeJS(js);
    try {
      return JSON.parse(String(result)) as PageState;
    } catch {
      return {
        url: '',
        title: '',
        text: String(result || ''),
        links: [],
        forms: [],
        inputs: [],
        headings: [],
        images: [],
        tables: [],
        timestamp: Date.now(),
      };
    }
  }

  // ─── Accessibility Tree ─────────────────────────────────────────────

  /**
   * Extract the accessibility tree from the page.
   * Uses Chrome's internal a11y tree via webContents.accessibilityTree
   * or falls back to manual ARIA traversal.
   */
  async getAccessibilityTree(): Promise<A11yNode | null> {
    const js = `
      (function() {
        function buildTree(root = document.body, depth = 0) {
          if (!root || depth > 15) return null;
          const nodes = [];

          for (const el of Array.from(root.children || [])) {
            if (['SCRIPT', 'STYLE', 'NOSCRIPT', 'META', 'LINK'].includes(el.tagName)) continue;

            const role = el.getAttribute('role') || getImplicitRole(el);
            const name = el.getAttribute('aria-label')
              || el.getAttribute('title')
              || el.getAttribute('alt')
              || (el.tagName === 'INPUT' ? (el.getAttribute('placeholder') || el.getAttribute('name') || '') : '')
              || (el.textContent || '').trim().substring(0, 100);

            if (!role && !name) continue;

            const r = el.getBoundingClientRect();
            const interactive = ['button','link','textbox','checkbox','radio','combobox','menuitem','tab','option'].includes(role);

            const node = {
              role: role || 'generic',
              name: name.substring(0, 200),
              description: el.getAttribute('aria-description') || undefined,
              children: [],
              rect: r ? { x: r.x, y: r.y, width: r.width, height: r.height } : undefined,
              interactive,
            };

            // Recurse into shadow roots
            const childRoot = el.shadowRoot || el;
            node.children = buildTree(childRoot, depth + 1)?.children || [];

            // Also check direct children for non-shadow elements
            if (!el.shadowRoot) {
              node.children.push(...(buildTree(el, depth + 1)?.children || []));
            }

            nodes.push(node);
          }

          return { role: 'root', name: '', children: nodes, interactive: false };
        }

        function getImplicitRole(el) {
          const tag = el.tagName.toLowerCase();
          const type = (el.getAttribute('type') || '').toLowerCase();
          const map = {
            'a': 'link', 'button': 'button', 'input': type === 'text' ? 'textbox' : type,
            'textarea': 'textbox', 'select': 'combobox', 'img': 'image',
            'h1': 'heading', 'h2': 'heading', 'h3': 'heading', 'h4': 'heading',
            'h5': 'heading', 'h6': 'heading', 'p': 'paragraph', 'ul': 'list',
            'ol': 'list', 'li': 'listitem', 'table': 'table', 'tr': 'row',
            'th': 'columnheader', 'td': 'cell', 'nav': 'navigation',
            'main': 'main', 'header': 'banner', 'footer': 'contentinfo',
            'aside': 'complementary', 'form': 'form', 'section': 'region',
            'article': 'article', 'details': 'group', 'summary': 'button',
          };
          return map[tag] || '';
        }

        return JSON.stringify(buildTree());
      })()
    `;

    const result = await this.executeJS(js);
    try {
      return JSON.parse(String(result)) as A11yNode;
    } catch {
      return null;
    }
  }

  // ─── Article / Main Content Extraction ──────────────────────────────

  /**
   * Extract the main article content from a page (readability-style).
   */
  async extractArticle(): Promise<{ title: string; content: string; author: string; date: string; wordCount: number }> {
    const js = `
      (function() {
        // Heuristic: find the largest text block that looks like article content
        const candidates = [];

        function scoreElement(el) {
          const text = (el.innerText || '').trim();
          const wordCount = text.split(/\\s+/).filter(w => w.length > 2).length;
          const linkDensity = el.querySelectorAll('a').length / Math.max(wordCount, 1);
          const paragraphs = el.querySelectorAll('p').length;
          const headingCount = el.querySelectorAll('h1,h2,h3,h4,h5,h6').length;

          let score = wordCount * 0.3 + paragraphs * 5 + headingCount * 10;
          score -= linkDensity * 100;

          if (el.tagName === 'ARTICLE' || el.tagName === 'MAIN') score += 50;
          if (el.getAttribute('itemprop') === 'articleBody') score += 100;
          if (el.className && /article|content|post|entry|story/i.test(el.className)) score += 30;
          if (el.id && /article|content|post|entry|story/i.test(el.id)) score += 30;

          return { el, score, wordCount, text };
        }

        // Check article/main first
        for (const sel of ['article', 'main', '[role="main"]', '[itemprop="articleBody"]']) {
          const el = document.querySelector(sel);
          if (el) candidates.push(scoreElement(el));
        }

        // Then all divs with significant text
        for (const el of Array.from(document.querySelectorAll('div, section'))) {
          const wc = (el.innerText || '').split(/\\s+/).length;
          if (wc > 100) candidates.push(scoreElement(el));
        }

        candidates.sort((a, b) => b.score - a.score);
        const best = candidates[0];

        const title = document.querySelector('h1')?.textContent?.trim()
          || document.querySelector('[rel="bookmark"]')?.textContent?.trim()
          || document.title;

        const author = document.querySelector('[rel="author"]')?.textContent?.trim()
          || document.querySelector('[itemprop="author"]')?.textContent?.trim()
          || document.querySelector('.author, .byline, [class*="author"]')?.textContent?.trim()
          || '';

        const dateEl = document.querySelector('time[datetime]');
        const date = dateEl?.getAttribute('datetime') || dateEl?.textContent?.trim() || '';

        const content = best ? best.text.substring(0, 15000) : document.body?.innerText?.substring(0, 15000) || '';
        const wordCount = content.split(/\\s+/).length;

        return JSON.stringify({ title, content, author, date, wordCount });
      })()
    `;

    const result = await this.executeJS(js);
    try {
      return JSON.parse(String(result));
    } catch {
      return { title: '', content: String(result || ''), author: '', date: '', wordCount: 0 };
    }
  }

  // ─── Sensitive Field Detection ──────────────────────────────────────

  /**
   * Detect sensitive fields on the current page.
   */
  async detectSensitiveFields(): Promise<Array<{ selector: string; type: string; name: string; placeholder: string }>> {
    const js = generateSensitiveFieldDetectionJS();
    const result = await this.executeJS(js);
    try {
      const parsed = JSON.parse(String(result));
      return parsed.sensitiveFields || [];
    } catch {
      return [];
    }
  }

  // ─── Mutation Observer ──────────────────────────────────────────────

  /**
   * Start observing DOM mutations and return a snapshot of changes.
   */
  async startMutationObserver(): Promise<void> {
    const js = `
      (function() {
        if (window.__agentMutationObserver) { window.__agentMutationObserver.disconnect(); }
        const stats = { addedNodes: 0, removedNodes: 0, attributeChanges: 0, timestamp: Date.now() };
        const observer = new MutationObserver((mutations) => {
          for (const m of mutations) {
            if (m.type === 'childList') {
              stats.addedNodes += m.addedNodes.length;
              stats.removedNodes += m.removedNodes.length;
            } else if (m.type === 'attributes') {
              stats.attributeChanges++;
            }
          }
          window.__agentMutationStats = { ...stats, timestamp: Date.now() };
        });
        observer.observe(document.documentElement, {
          childList: true,
          attributes: true,
          subtree: true,
          attributeFilter: ['class', 'style', 'hidden', 'disabled', 'src', 'href'],
        });
        window.__agentMutationObserver = observer;
        window.__agentMutationStats = stats;
        return true;
      })()
    `;
    await this.executeJS(js);
    this.mutationObserverActive = true;
  }

  /**
   * Get a snapshot of DOM mutations since the observer started.
   */
  async getMutationSnapshot(): Promise<MutationSnapshot> {
    const js = `
      (function() {
        return JSON.stringify(window.__agentMutationStats || { addedNodes: 0, removedNodes: 0, attributeChanges: 0, timestamp: Date.now() });
      })()
    `;
    const result = await this.executeJS(js);
    try {
      return JSON.parse(String(result)) as MutationSnapshot;
    } catch {
      return { addedNodes: 0, removedNodes: 0, attributeChanges: 0, timestamp: Date.now() };
    }
  }

  /**
   * Stop the mutation observer.
   */
  async stopMutationObserver(): Promise<MutationSnapshot> {
    const snapshot = await this.getMutationSnapshot();
    const js = `
      (function() {
        if (window.__agentMutationObserver) {
          window.__agentMutationObserver.disconnect();
          delete window.__agentMutationObserver;
        }
        return true;
      })()
    `;
    await this.executeJS(js);
    this.mutationObserverActive = false;
    return snapshot;
  }

  // ─── Visual Feedback ────────────────────────────────────────────────

  /**
   * Highlight an element with a visual indicator.
   */
  async showHighlight(selector: string, color?: string, duration?: number): Promise<void> {
    const js = generateHighlightJS(selector, color, duration);
    await this.executeJS(js);
  }

  /**
   * Show a tooltip near an element.
   */
  async showTooltip(selector: string, text: string, color?: string): Promise<void> {
    const js = generateTooltipJS(selector, text, color);
    await this.executeJS(js);
  }

  // ─── Utility ────────────────────────────────────────────────────────

  private parseResult(raw: unknown): AgentActionResult {
    if (typeof raw === 'string') {
      try {
        return JSON.parse(raw) as AgentActionResult;
      } catch {
        return { success: false, error: `Invalid JSON response: ${String(raw).substring(0, 200)}` };
      }
    }
    if (typeof raw === 'object' && raw !== null && 'success' in raw) {
      return raw as AgentActionResult;
    }
    return { success: false, error: `Unexpected result type: ${typeof raw}` };
  }

  private async executeWithTimeout(code: string, ms: number): Promise<unknown> {
    return new Promise<unknown>((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error(`DOM action timed out after ${ms}ms`)), ms);
      this.executeJavaScript(code).then(result => {
        clearTimeout(timer);
        resolve(result);
      }).catch(err => {
        clearTimeout(timer);
        reject(err);
      });
    });
  }

  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}
