"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.PageUnderstandingEngine = void 0;
// ─── Constants ────────────────────────────────────────────────────────────
const INTERACTABLE_ROLES = new Set([
    'button', 'link', 'textbox', 'checkbox', 'radio', 'combobox',
    'menuitem', 'tab', 'option', 'searchbox', 'switch', 'slider',
    'spinbutton', 'treeitem', 'menuitemcheckbox', 'menuitemradio',
]);
const INTERACTABLE_TAGS = new Set([
    'A', 'BUTTON', 'INPUT', 'SELECT', 'TEXTAREA',
]);
const CATEGORY_PATTERNS = {
    username: /user(name|.?id|.?name)?|login|account|email.?address|e.?mail/i,
    password: /pass(word|.?wd)?|secret|auth/i,
    email: /email|e.?mail|inbox/i,
    phone: /phone|tel|mobile|cell/i,
    address: /address|street|city|zip|postal|country/i,
    payment: /card|credit|debit|cvv|ccv|expir|payment/i,
    search: /search|query|find|q=/i,
};
// ─── Page Understanding Engine ────────────────────────────────────────────
class PageUnderstandingEngine {
    constructor(dom) {
        Object.defineProperty(this, "dom", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: void 0
        });
        Object.defineProperty(this, "cache", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: new Map()
        });
        Object.defineProperty(this, "cacheTTL", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: 30000
        }); // 30s
        this.dom = dom;
    }
    /**
     * Full page understanding analysis.
     */
    async analyze(options = {}) {
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
        let interactiveElements = [];
        if (opts.includeInteractiveElements) {
            interactiveElements = await this.getInteractiveElements(opts.maxInteractiveElements);
        }
        // Article extraction
        let article;
        if (opts.includeArticle && (classification.type === 'article' || classification.type === 'unknown')) {
            article = await this.extractArticle();
        }
        // A11y tree
        let a11yTree;
        if (opts.includeA11yTree) {
            a11yTree = (await this.dom.getAccessibilityTree()) || undefined;
        }
        // Mutation snapshot
        let mutations;
        if (opts.includeMutationSnapshot) {
            mutations = await this.dom.getMutationSnapshot();
        }
        // Build LLM-ready snapshot
        const snapshot = this.buildSnapshot(state, classification, forms, interactiveElements, article, opts.maxSnapshotChars);
        const understanding = {
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
    async classify() {
        const state = await this.dom.getPageState();
        return this.classifyPage(state);
    }
    // ─── Classification ────────────────────────────────────────────────
    classifyPage(state) {
        const signals = [];
        let type = 'unknown';
        let confidence = 0.5;
        const url = state.url.toLowerCase();
        const text = state.text.toLowerCase();
        const title = state.title.toLowerCase();
        // Login detection
        const passwordFields = state.inputs.filter(i => i.type === 'password');
        const usernameFields = state.inputs.filter(i => /user|email|login|account/i.test(i.name + i.placeholder));
        if (passwordFields.length > 0 && usernameFields.length > 0) {
            type = 'login';
            confidence = 0.9;
            signals.push('password + username fields detected');
        }
        // Search detection
        const searchInputs = state.inputs.filter(i => i.type === 'search' || /search|query|find/i.test(i.name + i.placeholder + i.type));
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
    async getVisualLayout() {
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
            return JSON.parse(String(result));
        }
        catch {
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
    analyzeForms(state) {
        return state.forms.map(form => {
            const fields = form.fields.map(f => {
                const category = this.categorizeField(f.name, f.placeholder, f.type);
                const isSensitive = /password|secret|token|auth|credit|card|cvv|pin/i.test(f.name + f.placeholder + f.type);
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
    categorizeField(name, placeholder, type) {
        const combined = name + placeholder;
        if (type === 'password')
            return 'password';
        for (const [cat, pattern] of Object.entries(CATEGORY_PATTERNS)) {
            if (pattern.test(combined))
                return cat;
        }
        if (type === 'email')
            return 'email';
        if (type === 'tel')
            return 'phone';
        if (type === 'search')
            return 'search';
        return 'text';
    }
    // ─── Interactive Elements ──────────────────────────────────────────
    async getInteractiveElements(max) {
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
            return JSON.parse(String(result));
        }
        catch {
            return [];
        }
    }
    // ─── Article Extraction ────────────────────────────────────────────
    async extractArticle() {
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
    parseSections(content) {
        const sections = [];
        const lines = content.split('\n');
        let currentHeading = 'Introduction';
        let currentContent = [];
        for (const line of lines) {
            const trimmed = line.trim();
            if (/^(#{1,6}\s|TITLE:|HEADING:)/.test(trimmed)) {
                if (currentContent.length > 0) {
                    sections.push({ heading: currentHeading, content: currentContent.join('\n').trim() });
                }
                currentHeading = trimmed.replace(/^(#{1,6}\s|TITLE:|HEADING:)/, '').trim();
                currentContent = [];
            }
            else if (trimmed) {
                currentContent.push(trimmed);
            }
        }
        if (currentContent.length > 0) {
            sections.push({ heading: currentHeading, content: currentContent.join('\n').trim() });
        }
        return sections;
    }
    // ─── Snapshot Builder ──────────────────────────────────────────────
    buildSnapshot(state, classification, forms, interactive, article, maxChars) {
        const parts = [];
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
exports.PageUnderstandingEngine = PageUnderstandingEngine;
