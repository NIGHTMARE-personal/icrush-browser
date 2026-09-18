/**
 * Page Understanding — structured analysis of web pages for agent reasoning.
 *
 * Provides:
 * - Accessibility tree with interaction scoring
 * - Visual layout analysis (viewport, element positions, fold detection)
 * - Form detection with field mapping and autofill hints
 * - Article content extraction with metadata
 * - Interactive element catalog (buttons, links, inputs, menus)
 * - Content classification (login form, search, article, listing, video, etc.)
 * - Page snapshot for LLM context
 *
 * Design invariants:
 * - All analysis happens via DOMEngine — no direct DOM access
 * - Snapshots are bounded (maxChars) to keep LLM context manageable
 * - Every analysis result is cacheable with TTL
 * - Privacy: no external service calls — all local
 */
import { DOMEngine, type PageState, type A11yNode, type MutationSnapshot } from './dom-engine';

// ─── Types ────────────────────────────────────────────────────────────────

export interface PageClassification {
  type: 'login' | 'search' | 'article' | 'listing' | 'video' | 'form' | 'dashboard' | 'social' | 'e-commerce' | 'error' | 'unknown';
  confidence: number;
  signals: string[];
}

export interface FormFieldInfo {
  selector: string;
  name: string;
  type: string;
  placeholder: string;
  label: string;
  required: boolean;
  value: string;
  autocomplete?: string;
  suggestions: string[];
  isSensitive: boolean;
  category: 'username' | 'password' | 'email' | 'phone' | 'address' | 'payment' | 'search' | 'text' | 'other';
}

export interface FormInfo {
  action: string;
  method: string;
  fields: FormFieldInfo[];
  submitButton?: { selector: string; text: string };
  isLogin: boolean;
  isSearch: boolean;
}

export interface InteractiveElement {
  selector: string;
  tag: string;
  role: string;
  text: string;
  ariaLabel: string;
  href?: string;
  disabled: boolean;
  visible: boolean;
  rect?: { x: number; y: number; width: number; height: number };
  inViewport: boolean;
  interactability: 'high' | 'medium' | 'low';
  score: number;
}

export interface VisualLayout {
  viewportWidth: number;
  viewportHeight: number;
  scrollHeight: number;
  scrollY: number;
  foldY: number;
  hasStickyNav: boolean;
  hasFooter: boolean;
  overlayDetected: boolean;
  cookieBannerDetected: boolean;
  elementCount: number;
  zIndexChanged: number;
}

export interface ArticleInfo {
  title: string;
  content: string;
  summary: string;
  author: string;
  date: string;
  wordCount: number;
  readingTimeMinutes: number;
  sections: Array<{ heading: string; content: string }>;
}

export interface PageUnderstanding {
  classification: PageClassification;
  layout: VisualLayout;
  forms: FormInfo[];
  interactiveElements: InteractiveElement[];
  article?: ArticleInfo;
  a11yTree?: A11yNode;
  state: PageState;
  snapshot: string; // LLM-ready context string
  snapshotTokens: number; // rough estimate
  mutations?: MutationSnapshot;
  timestamp: number;
}

export interface UnderstandingOptions {
  includeA11yTree?: boolean;
  includeInteractiveElements?: boolean;
  includeArticle?: boolean;
  includeMutationSnapshot?: boolean;
  maxInteractiveElements?: number;
  maxSnapshotChars?: number;
  classificationOnly?: boolean;
}

// ─── Constants ────────────────────────────────────────────────────────────

const INTERACTABLE_ROLES = new Set([
  'button', 'link', 'textbox', 'checkbox', 'radio', 'combobox',
  'menuitem', 'tab', 'option', 'searchbox', 'switch', 'slider',
  'spinbutton', 'treeitem', 'menuitemcheckbox', 'menuitemradio',
]);

const INTERACTABLE_TAGS = new Set([
  'A', 'BUTTON', 'INPUT', 'SELECT', 'TEXTAREA',
]);

const CATEGORY_PATTERNS: Record<string, RegExp> = {
  username: /user(name|.?id|.?name)?|login|account|email.?address|e.?mail/i,
  password: /pass(word|.?wd)?|secret|auth/i,
  email: /email|e.?mail|inbox/i,
  phone: /phone|tel|mobile|cell/i,
  address: /address|street|city|zip|postal|country/i,
  payment: /card|credit|debit|cvv|ccv|expir|payment/i,
  search: /search|query|find|q=/i,
};

// ─── Page Understanding Engine ────────────────────────────────────────────

export class PageUnderstandingEngine {
  private dom: DOMEngine;
  private cache: Map<string, { data: PageUnderstanding; time: number }> = new Map();
  private cacheTTL = 30_000; // 30s

  constructor(dom: DOMEngine) {
    this.dom = dom;
  }

  /**
   * Full page understanding analysis.
   */
  async analyze(options: UnderstandingOptions = {}): Promise<PageUnderstanding> {
    const opts = {
      includeA11yTree: false,
      includeInteractiveElements: true,
      includeArticle: true,
      includeMutationSnapshot: false,
      maxInteractiveElements: 30,
      maxSnapshotChars: 8000,
      ...options,
    };

    // Get base page state
    const state = await this.dom.getPageState();

    // Classify the page
    const classification = this.classifyPage(state);

    // Get visual layout
    const layout = await this.getVisualLayout();

    // Detect forms
    const forms = this.analyzeForms(state);

    // Interactive elements
    let interactiveElements: InteractiveElement[] = [];
    if (opts.includeInteractiveElements) {
      interactiveElements = await this.getInteractiveElements(opts.maxInteractiveElements!);
    }

    // Article extraction
    let article: ArticleInfo | undefined;
    if (opts.includeArticle && (classification.type === 'article' || classification.type === 'unknown')) {
      article = await this.extractArticle();
    }

    // A11y tree
    let a11yTree: A11yNode | undefined;
    if (opts.includeA11yTree) {
      a11yTree = (await this.dom.getAccessibilityTree()) || undefined;
    }

    // Mutation snapshot
    let mutations: MutationSnapshot | undefined;
    if (opts.includeMutationSnapshot) {
      mutations = await this.dom.getMutationSnapshot();
    }

    // Build LLM-ready snapshot
    const snapshot = this.buildSnapshot(state, classification, forms, interactiveElements, article, opts.maxSnapshotChars!);

    const understanding: PageUnderstanding = {
      classification,
      layout,
      forms,
      interactiveElements,
      article,
      a11yTree,
      state,
      snapshot,
      snapshotTokens: Math.ceil(snapshot.length / 4),
      mutations,
      timestamp: Date.now(),
    };

    return understanding;
  }

  /**
   * Quick classification only (fast, no deep analysis).
   */
  async classify(): Promise<PageClassification> {
    const state = await this.dom.getPageState();
    return this.classifyPage(state);
  }

  // ─── Classification ────────────────────────────────────────────────

  private classifyPage(state: PageState): PageClassification {
    const signals: string[] = [];
    let type: PageClassification['type'] = 'unknown';
    let confidence = 0.5;

    const url = state.url.toLowerCase();
    const text = state.text.toLowerCase();
    const title = state.title.toLowerCase();

    // Login detection
    const passwordFields = state.inputs.filter(i => i.type === 'password');
    const usernameFields = state.inputs.filter(i =>
      /user|email|login|account/i.test(i.name + i.placeholder)
    );
    if (passwordFields.length > 0 && usernameFields.length > 0) {
      type = 'login';
      confidence = 0.9;
      signals.push('password + username fields detected');
    }

    // Search detection
    const searchInputs = state.inputs.filter(i =>
      i.type === 'search' || /search|query|find/i.test(i.name + i.placeholder + i.type)
    );
    if (searchInputs.length > 0 && type === 'unknown') {
      type = 'search';
      confidence = 0.85;
      signals.push('search input detected');
    }

    // Article detection
    if (state.headings.length > 2 && state.text.length > 2000) {
      const articleSignals = state.headings.filter(h => h.level === 1 || h.level === 2).length;
      if (articleSignals >= 2) {
        type = 'article';
        confidence = 0.8;
        signals.push('multiple headings + long text content');
      }
    }

    // Video detection
    if (state.text.includes('youtube') || state.text.includes('video') ||
        url.includes('youtube.com') || url.includes('vimeo.com') ||
        state.inputs.some(i => /video|player/i.test(i.name))) {
      type = 'video';
      confidence = 0.85;
      signals.push('video platform or player detected');
    }

    // E-commerce detection
    if (state.text.includes('cart') || state.text.includes('price') ||
        state.text.includes('add to') || state.text.includes('buy now') ||
        /product|shop|store|price/i.test(title)) {
      type = 'e-commerce';
      confidence = 0.75;
      signals.push('shopping/cart/price signals');
    }

    // Listing detection
    if (state.links.length > 15 && state.forms.length <= 1) {
      type = 'listing';
      confidence = 0.7;
      signals.push('many links, few forms');
    }

    // Dashboard detection
    if (state.forms.length > 3 || state.tables.length > 2 ||
        /dashboard|admin|panel|settings/i.test(title)) {
      type = 'dashboard';
      confidence = 0.7;
      signals.push('multiple forms/tables or dashboard title');
    }

    // Social detection
    if (/facebook|twitter|reddit|instagram|linkedin|mastodon/i.test(url + text)) {
      type = 'social';
      confidence = 0.8;
      signals.push('social platform detected');
    }

    // Error detection
    if (/404|not found|error|page.*not.*available/i.test(title + text.substring(0, 500))) {
      type = 'error';
      confidence = 0.85;
      signals.push('error page indicators');
    }

    if (signals.length === 0) {
      signals.push('no specific pattern matched');
    }

    return { type, confidence, signals };
  }

  // ─── Visual Layout ─────────────────────────────────────────────────

  private async getVisualLayout(): Promise<VisualLayout> {
    const js = `
      (function() {
        const vw = window.innerWidth;
        const vh = window.innerHeight;
        const scrollH = document.documentElement.scrollHeight;
        const scrollY = window.scrollY;

        // Detect sticky nav
        const navs = Array.from(document.querySelectorAll('nav, header, [role="navigation"]'));
        const hasStickyNav = navs.some(n => {
          const cs = window.getComputedStyle(n);
          return cs.position === 'fixed' || cs.position === 'sticky';
        });

        // Detect footer
        const footer = document.querySelector('footer, [role="contentinfo"]');
        const hasFooter = footer ? (footer.getBoundingClientRect().top < scrollH) : false;

        // Detect overlays / modals
        const overlays = document.querySelectorAll('[role="dialog"], [role="alertdialog"], .modal, .overlay, [class*="modal"], [class*="overlay"]');
        const overlayDetected = overlays.length > 0;

        // Detect cookie banners
        const cookieBanner = /cookie|consent|privacy|gdpr/i;
        const allText = document.body?.innerText?.substring(0, 3000) || '';
        const cookieBannerDetected = cookieBanner.test(allText) &&
          document.querySelectorAll('button, [role="button"]').length > 0;

        const elementCount = document.querySelectorAll('*').length;
        const zIndexChanged = document.querySelectorAll('[style*="z-index"]').length;

        return JSON.stringify({
          viewportWidth: vw,
          viewportHeight: vh,
          scrollHeight: scrollH,
          scrollY,
          foldY: scrollY + vh,
          hasStickyNav,
          hasFooter,
          overlayDetected,
          cookieBannerDetected,
          elementCount,
          zIndexChanged,
        });
      })()
    `;

    const result = await this.dom.executeJS(js);
    try {
      return JSON.parse(String(result)) as VisualLayout;
    } catch {
      return {
        viewportWidth: 0,
        viewportHeight: 0,
        scrollHeight: 0,
        scrollY: 0,
        foldY: 0,
        hasStickyNav: false,
        hasFooter: false,
        overlayDetected: false,
        cookieBannerDetected: false,
        elementCount: 0,
        zIndexChanged: 0,
      };
    }
  }

  // ─── Form Analysis ─────────────────────────────────────────────────

  private analyzeForms(state: PageState): FormInfo[] {
    return state.forms.map(form => {
      const fields: FormFieldInfo[] = form.fields.map(f => {
        const category = this.categorizeField(f.name, f.placeholder, f.type);
        const isSensitive = /password|secret|token|auth|credit|card|cvv|pin/i.test(
          f.name + f.placeholder + f.type
        );
        return {
          selector: f.selector,
          name: f.name,
          type: f.type,
          placeholder: f.placeholder,
          label: f.name || f.placeholder,
          required: false,
          value: f.value,
          suggestions: [],
          isSensitive,
          category,
        };
      });

      const hasPassword = fields.some(f => f.type === 'password');
      const hasUsername = fields.some(f => f.category === 'username' || f.category === 'email');
      const hasSearch = fields.some(f => f.category === 'search');

      return {
        action: form.action,
        method: form.method,
        fields,
        isLogin: hasPassword && hasUsername,
        isSearch: hasSearch && fields.length <= 3,
      };
    });
  }

  private categorizeField(name: string, placeholder: string, type: string): FormFieldInfo['category'] {
    const combined = name + placeholder;
    if (type === 'password') return 'password';
    for (const [cat, pattern] of Object.entries(CATEGORY_PATTERNS)) {
      if (pattern.test(combined)) return cat as FormFieldInfo['category'];
    }
    if (type === 'email') return 'email';
    if (type === 'tel') return 'phone';
    if (type === 'search') return 'search';
    return 'text';
  }

  // ─── Interactive Elements ──────────────────────────────────────────

  private async getInteractiveElements(max: number): Promise<InteractiveElement[]> {
    const js = `
      (function() {
        const vw = window.innerWidth;
        const vh = window.innerHeight;
        const scrollY = window.scrollY;
        const elements = [];

        function addIfInteractive(el, root = document) {
          if (elements.length >= ${max}) return;
          const tag = el.tagName;
          const role = (el.getAttribute('role') || '').toLowerCase();
          const isInteractable = ['A','BUTTON','INPUT','SELECT','TEXTAREA'].includes(tag) ||
            INTERACTABLE_ROLES.has(role) ||
            el.hasAttribute('onclick') ||
            el.hasAttribute('tabindex');

          if (!isInteractable) return;

          const r = el.getBoundingClientRect();
          const visible = r.width > 0 && r.height > 0 && r.top < vh + 200 && r.bottom > -200;
          const inViewport = r.top >= 0 && r.top <= vh && r.left >= 0 && r.left <= vw;

          let interactability = 'low';
          if (visible && inViewport && !el.disabled) interactability = 'high';
          else if (visible && !el.disabled) interactability = 'medium';

          const text = (el.textContent || '').trim().substring(0, 80);
          const ariaLabel = el.getAttribute('aria-label') || '';

          let score = 0;
          if (inViewport) score += 30;
          if (visible) score += 20;
          if (tag === 'BUTTON' || tag === 'A') score += 15;
          if (role === 'button' || role === 'link') score += 15;
          if (text || ariaLabel) score += 10;
          if (!el.disabled) score += 10;

          elements.push({
            selector: el.id ? '#' + el.id : (el.getAttribute('name') ? '[name="' + el.getAttribute('name') + '"]' : tag.toLowerCase()),
            tag,
            role: role || tag.toLowerCase(),
            text,
            ariaLabel,
            href: el.getAttribute('href') || undefined,
            disabled: el.disabled,
            visible,
            rect: { x: r.x, y: r.y, width: r.width, height: r.height },
            inViewport,
            interactability,
            score,
          });

          // Recurse into shadow roots
          if (el.shadowRoot) {
            for (const child of Array.from(el.shadowRoot.querySelectorAll('*'))) {
              addIfInteractive(child, el.shadowRoot);
            }
          }
        }

        const INTERACTABLE_TAGS = new Set(['A','BUTTON','INPUT','SELECT','TEXTAREA']);
        const INTERACTABLE_ROLES = new Set(['button','link','textbox','checkbox','radio','combobox','menuitem','tab','option','searchbox','switch']);

        for (const el of Array.from(document.querySelectorAll('*'))) {
          if (elements.length >= ${max}) break;
          if (INTERACTABLE_TAGS.has(el.tagName) || el.hasAttribute('role') || el.hasAttribute('onclick') || el.hasAttribute('tabindex')) {
            addIfInteractive(el);
          }
        }

        elements.sort((a, b) => b.score - a.score);
        return JSON.stringify(elements.slice(0, ${max}));
      })()
    `;

    const result = await this.dom.executeJS(js);
    try {
      return JSON.parse(String(result)) as InteractiveElement[];
    } catch {
      return [];
    }
  }

  // ─── Article Extraction ────────────────────────────────────────────

  private async extractArticle(): Promise<ArticleInfo> {
    const raw = await this.dom.extractArticle();
    const sections = this.parseSections(raw.content);
    const readingTimeMinutes = Math.ceil(raw.wordCount / 200);
    const summary = raw.content.substring(0, 500).replace(/\s+/g, ' ').trim();

    return {
      title: raw.title,
      content: raw.content,
      summary,
      author: raw.author,
      date: raw.date,
      wordCount: raw.wordCount,
      readingTimeMinutes,
      sections,
    };
  }

  private parseSections(content: string): Array<{ heading: string; content: string }> {
    const sections: Array<{ heading: string; content: string }> = [];
    const lines = content.split('\n');
    let currentHeading = 'Introduction';
    let currentContent: string[] = [];

    for (const line of lines) {
      const trimmed = line.trim();
      if (/^(#{1,6}\s|TITLE:|HEADING:)/.test(trimmed)) {
        if (currentContent.length > 0) {
          sections.push({ heading: currentHeading, content: currentContent.join('\n').trim() });
        }
        currentHeading = trimmed.replace(/^(#{1,6}\s|TITLE:|HEADING:)/, '').trim();
        currentContent = [];
      } else if (trimmed) {
        currentContent.push(trimmed);
      }
    }

    if (currentContent.length > 0) {
      sections.push({ heading: currentHeading, content: currentContent.join('\n').trim() });
    }

    return sections;
  }

  // ─── Snapshot Builder ──────────────────────────────────────────────

  private buildSnapshot(
    state: PageState,
    classification: PageClassification,
    forms: FormInfo[],
    interactive: InteractiveElement[],
    article: ArticleInfo | undefined,
    maxChars: number
  ): string {
    const parts: string[] = [];

    parts.push(`# Page Snapshot`);
    parts.push(`URL: ${state.url}`);
    parts.push(`Title: ${state.title}`);
    parts.push(`Type: ${classification.type} (${(classification.confidence * 100).toFixed(0)}% confidence)`);
    parts.push('');

    // Headings
    if (state.headings.length > 0) {
      parts.push('## Headings');
      for (const h of state.headings.slice(0, 10)) {
        parts.push(`${'#'.repeat(h.level)} ${h.text}`);
      }
      parts.push('');
    }

    // Forms
    if (forms.length > 0) {
      parts.push('## Forms');
      for (const form of forms) {
        parts.push(`- ${form.isLogin ? '[LOGIN]' : form.isSearch ? '[SEARCH]' : '[FORM]'} action=${form.action}`);
        for (const f of form.fields) {
          parts.push(`  - ${f.selector} (${f.type}) name="${f.name}" placeholder="${f.placeholder}" ${f.isSensitive ? '⚠️ SENSITIVE' : ''}`);
        }
      }
      parts.push('');
    }

    // Interactive elements (top N)
    if (interactive.length > 0) {
      parts.push('## Interactive Elements (by relevance)');
      for (const el of interactive.slice(0, 15)) {
        parts.push(`- [${el.interactability.toUpperCase()}] <${el.tag}> role="${el.role}" text="${el.text}" selector="${el.selector}"`);
      }
      parts.push('');
    }

    // Article content (truncated)
    if (article) {
      parts.push('## Article');
      parts.push(`Author: ${article.author}`);
      parts.push(`Date: ${article.date}`);
      parts.push(`Reading time: ${article.readingTimeMinutes} min`);
      parts.push(`Word count: ${article.wordCount}`);
      parts.push('');
      parts.push(article.summary);
      parts.push('');
    }

    // Page text excerpt
    const textExcerpt = state.text.substring(0, 2000);
    if (textExcerpt) {
      parts.push('## Page Text (excerpt)');
      parts.push(textExcerpt);
      parts.push('');
    }

    // Truncate to maxChars
    let snapshot = parts.join('\n');
    if (snapshot.length > maxChars) {
      snapshot = snapshot.substring(0, maxChars) + '\n... [truncated]';
    }

    return snapshot;
  }
}
