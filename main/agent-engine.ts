/**
 * Agent Execution Engine
 * Provides DOM interaction capabilities for the autonomous browsing agent.
 * Executes click, type, scroll, extract, and form-fill actions via webview JavaScript injection.
 */

export interface AgentAction {
  type: 'click' | 'type' | 'scroll' | 'extract' | 'fill_form' | 'select' | 'hover' | 'wait' | 'press_key';
  selector?: string;
  text?: string;
  value?: string;
  direction?: 'up' | 'down' | 'left' | 'right';
  amount?: number;
  keys?: string;
  formFields?: Array<{ selector: string; value: string }>;
}

export interface AgentActionResult {
  success: boolean;
  output?: string;
  error?: string;
  extractedData?: string;
}

/**
 * Sensitive field patterns that require user confirmation before filling.
 */
const SENSITIVE_FIELD_PATTERNS = [
  /pass/i, /pwd/i, /secret/i, /token/i, /auth/i, /credential/i,
  /ssn/i, /social.security/i, /credit.card/i, /card.number/i,
  /cvv/i, /pin/i, /otp/i, /2fa/i, /mfa/i,
];

/**
 * Check if a selector or field name indicates a sensitive field (password, credit card, etc.)
 */
export function isSensitiveField(selector: string, _value?: string): boolean {
  const lowerSelector = selector.toLowerCase();
  return SENSITIVE_FIELD_PATTERNS.some(pattern => pattern.test(lowerSelector));
}

/**
 * Check if any fields in a fill_form action are sensitive
 */
export function hasSensitiveFields(fields: Array<{ selector: string; value: string }>): string[] {
  return fields.filter(f => isSensitiveField(f.selector)).map(f => f.selector);
}

/**
 * Generate JavaScript code to detect sensitive fields on the current page
 */
export function generateSensitiveFieldDetectionJS(): string {
  return `
    (function() {
      const sensitivePatterns = /pass|pwd|secret|token|auth|credential|ssn|credit|card|cvv|pin|otp|2fa|mfa/i;
      const inputs = Array.from(document.querySelectorAll('input, textarea'));
      const sensitive = inputs.filter(el => {
        const name = (el.getAttribute('name') || '').toLowerCase();
        const id = (el.getAttribute('id') || '').toLowerCase();
        const placeholder = (el.getAttribute('placeholder') || '').toLowerCase();
        const type = (el.getAttribute('type') || '').toLowerCase();
        return type === 'password' || sensitivePatterns.test(name) || sensitivePatterns.test(id) || sensitivePatterns.test(placeholder);
      }).map(el => ({
        selector: el.id ? '#' + el.id : (el.getAttribute('name') ? '[name="' + el.getAttribute('name') + '"]' : el.tagName.toLowerCase()),
        type: el.getAttribute('type') || 'text',
        name: el.getAttribute('name') || '',
        placeholder: el.getAttribute('placeholder') || '',
      }));
      return JSON.stringify({ sensitiveFields: sensitive });
    })()
  `;
}

/**
 * Generate JavaScript to highlight an element with a visual feedback effect.
 * Used by the agent to show the user what element it's interacting with.
 */
export function generateHighlightJS(selector: string, color: string = '#6366f1', duration: number = 1500): string {
  return `
    (function() {
      function queryDeep(sel, root = document) {
        try { const d = root.querySelector(sel); if (d) return d; } catch (_) {}
        for (const el of Array.from(root.querySelectorAll('*'))) {
          if (el.shadowRoot) { const f = queryDeep(sel, el.shadowRoot); if (f) return f; }
        }
        return null;
      }
      const el = queryDeep(${JSON.stringify(selector)});
      if (!el) return { success: false, error: 'Element not found' };
      
      el.scrollIntoView({ behavior: 'smooth', block: 'center' });
      
      const originalOutline = el.style.outline;
      const originalBoxShadow = el.style.boxShadow;
      const originalTransition = el.style.transition;
      
      el.style.transition = 'outline 0.2s, box-shadow 0.2s';
      el.style.outline = '3px solid ${color}';
      el.style.boxShadow = '0 0 20px ${color}40, 0 0 40px ${color}20';
      
      setTimeout(() => {
        el.style.outline = originalOutline;
        el.style.boxShadow = originalBoxShadow;
        setTimeout(() => {
          el.style.transition = originalTransition;
        }, 200);
      }, ${duration});
      
      return { success: true, highlighted: el.tagName + ' ' + ${JSON.stringify(selector)} };
    })()
  `;
}

/**
 * Generate JavaScript to show a tooltip near an element.
 */
export function generateTooltipJS(selector: string, text: string, color: string = '#6366f1'): string {
  return `
    (function() {
      function queryDeep(sel, root = document) {
        try { const d = root.querySelector(sel); if (d) return d; } catch (_) {}
        for (const el of Array.from(root.querySelectorAll('*'))) {
          if (el.shadowRoot) { const f = queryDeep(sel, el.shadowRoot); if (f) return f; }
        }
        return null;
      }
      const el = queryDeep(${JSON.stringify(selector)});
      if (!el) return { success: false };
      
      const existing = document.getElementById('agent-tooltip');
      if (existing) existing.remove();
      
      const tooltip = document.createElement('div');
      tooltip.id = 'agent-tooltip';
      tooltip.textContent = ${JSON.stringify(text)};
      tooltip.style.cssText = \`
        position: fixed;
        z-index: 999999;
        padding: 6px 12px;
        border-radius: 6px;
        background: ${color};
        color: white;
        font-size: 12px;
        font-weight: 600;
        font-family: -apple-system, BlinkMacSystemFont, sans-serif;
        pointer-events: none;
        animation: agent-tooltip-fade 0.2s ease-out;
        box-shadow: 0 4px 12px rgba(0,0,0,0.3);
      \`;
      
      const rect = el.getBoundingClientRect();
      tooltip.style.left = rect.left + 'px';
      tooltip.style.top = (rect.top - 36) + 'px';
      
      if (!document.getElementById('agent-tooltip-style')) {
        const style = document.createElement('style');
        style.id = 'agent-tooltip-style';
        style.textContent = \`
          @keyframes agent-tooltip-fade {
            from { opacity: 0; transform: translateY(4px); }
            to { opacity: 1; transform: translateY(0); }
          }
        \`;
        document.head.appendChild(style);
      }
      
      document.body.appendChild(tooltip);
      setTimeout(() => tooltip.remove(), 2000);
      
      return { success: true };
    })()
  `;
}

/**
 * Generate JavaScript to show a click ripple effect at coordinates.
 */
export function generateClickRippleJS(x: number, y: number, color: string = '#6366f1'): string {
  return `
    (function() {
      const ripple = document.createElement('div');
      ripple.style.cssText = \`
        position: fixed;
        left: ${x}px;
        top: ${y}px;
        width: 40px;
        height: 40px;
        border-radius: 50%;
        border: 3px solid ${color};
        pointer-events: none;
        z-index: 999999;
        animation: agent-ripple 0.6s ease-out forwards;
      \`;
      
      if (!document.getElementById('agent-ripple-style')) {
        const style = document.createElement('style');
        style.id = 'agent-ripple-style';
        style.textContent = \`
          @keyframes agent-ripple {
            0% { transform: scale(0.5); opacity: 1; }
            100% { transform: scale(2.5); opacity: 0; }
          }
        \`;
        document.head.appendChild(style);
      }
      
      document.body.appendChild(ripple);
      setTimeout(() => ripple.remove(), 600);
      
      return { success: true };
    })()
  `;
}

/**
 * Shared Shadow DOM traversal helper — injected into every webview script.
 */
const SHADOW_DOM_HELPERS = `
  function queryDeep(sel, root = document) {
    try {
      const direct = root.querySelector(sel);
      if (direct) return direct;
    } catch (_) {}
    const all = Array.from(root.querySelectorAll('*'));
    for (const el of all) {
      if (el.shadowRoot) {
        const found = queryDeep(sel, el.shadowRoot);
        if (found) return found;
      }
    }
    return null;
  }
`;

/**
 * Generate JavaScript code to click an element by various selectors.
 * Supports Shadow DOM traversal, CSS selectors, text matching, aria-label, and synthetic MouseEvents.
 */
function generateClickJS(selector: string): string {
  return `
    (function() {
      ${SHADOW_DOM_HELPERS}

      function findByTextDeep(text, root = document) {
        const lower = text.toLowerCase().trim();
        const candidates = Array.from(root.querySelectorAll('a, button, input, [role="button"], [onclick], ytd-rich-grid-media, ytd-video-renderer, span, div, h1, h2, h3, h4'));
        for (const el of candidates) {
          const content = (el.textContent || '').trim().toLowerCase();
          const aria = (el.getAttribute('aria-label') || '').toLowerCase();
          const title = (el.getAttribute('title') || '').toLowerCase();
          if (content.includes(lower) || aria.includes(lower) || title.includes(lower)) {
            // Prefer interactive ancestor or direct element
            return el.closest('a, button, [role="button"], ytd-rich-grid-media, ytd-video-renderer') || el;
          }
          if (el.shadowRoot) {
            const shadowMatch = findByTextDeep(text, el.shadowRoot);
            if (shadowMatch) return shadowMatch;
          }
        }
        return null;
      }

      const isTextMatch = !/[.#[\]:>~+]/.test(${JSON.stringify(selector)});
      let target = isTextMatch ? findByTextDeep(${JSON.stringify(selector)}) : queryDeep(${JSON.stringify(selector)});
      
      if (!target && !isTextMatch) {
        target = findByTextDeep(${JSON.stringify(selector)});
      }

      if (!target) {
        return JSON.stringify({ success: false, error: 'Element not found: ' + ${JSON.stringify(selector)} });
      }

      target.scrollIntoView({ behavior: 'smooth', block: 'center' });
      target.focus?.();

      // Synthetic full pointer/mouse sequence for modern SPAs & Shadow DOM
      const opts = { bubbles: true, cancelable: true, view: window, buttons: 1 };
      target.dispatchEvent(new PointerEvent('pointerdown', opts));
      target.dispatchEvent(new MouseEvent('mousedown', opts));
      target.dispatchEvent(new PointerEvent('pointerup', opts));
      target.dispatchEvent(new MouseEvent('mouseup', opts));
      target.dispatchEvent(new MouseEvent('click', opts));
      target.click?.();

      const label = target.tagName + (target.textContent ? ': ' + target.textContent.trim().substring(0, 40) : '');
      return JSON.stringify({ success: true, clicked: label });
    })()
  `;
}

/**
 * Generate JavaScript code to type text into an input/textarea.
 */
function generateTypeJS(selector: string, text: string): string {
  if (!selector || selector.trim() === '') {
    // Type into the currently focused element
    return `
      (function() {
        const el = document.activeElement;
        if (!el || (el.tagName !== 'INPUT' && el.tagName !== 'TEXTAREA' && !el.isContentEditable)) {
          return JSON.stringify({ success: false, error: 'No active input element found' });
        }
        el.focus();
        const nativeInputValueSetter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')?.set
          || Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, 'value')?.set;
        if (nativeInputValueSetter) {
          nativeInputValueSetter.call(el, ${JSON.stringify(text)});
        } else {
          el.value = ${JSON.stringify(text)};
        }
        el.dispatchEvent(new Event('input', { bubbles: true }));
        el.dispatchEvent(new Event('change', { bubbles: true }));
        return JSON.stringify({ success: true, typed: ${JSON.stringify(text)} });
      })()
    `;
  }

  return `
    (function() {
      ${SHADOW_DOM_HELPERS}

      const el = queryDeep(${JSON.stringify(selector)});
      if (!el) return JSON.stringify({ success: false, error: 'Input not found: ' + ${JSON.stringify(selector)} });
      el.scrollIntoView({ behavior: 'smooth', block: 'center' });
      el.focus();
      const nativeInputValueSetter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')?.set
        || Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, 'value')?.set;
      if (nativeInputValueSetter) {
        nativeInputValueSetter.call(el, ${JSON.stringify(text)});
      } else {
        el.value = ${JSON.stringify(text)};
      }
      el.dispatchEvent(new Event('input', { bubbles: true }));
      el.dispatchEvent(new Event('change', { bubbles: true }));
      return JSON.stringify({ success: true, typed: ${JSON.stringify(text)} });
    })()
  `;
}

/**
 * Generate JavaScript code to fill a form with multiple fields.
 */
function generateFillFormJS(fields: Array<{ selector: string; value: string }>): string {
  return `
    (function() {
      ${SHADOW_DOM_HELPERS}
      const results = [];
      const fieldDefs = ${JSON.stringify(fields)};
      for (const field of fieldDefs) {
        try {
          const el = queryDeep(field.selector);
          if (!el) {
            results.push({ selector: field.selector, success: false, error: 'Not found' });
            continue;
          }
          el.scrollIntoView({ behavior: 'smooth', block: 'center' });
          el.focus();
          const nativeInputValueSetter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')?.set
            || Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, 'value')?.set;
          if (nativeInputValueSetter) {
            nativeInputValueSetter.call(el, field.value);
          } else {
            el.value = field.value;
          }
          el.dispatchEvent(new Event('input', { bubbles: true }));
          el.dispatchEvent(new Event('change', { bubbles: true }));
          el.blur();
          results.push({ selector: field.selector, success: true });
        } catch (e) {
          results.push({ selector: field.selector, success: false, error: String(e) });
        }
      }
      return JSON.stringify({ success: results.every(r => r.success), results });
    })()
  `;
}

/**
 * Generate JavaScript code to scroll the page.
 */
function generateScrollJS(direction: string, amount: number): string {
  const px = amount || 500;
  const yMap: Record<string, number> = { up: -px, down: px };
  const xMap: Record<string, number> = { left: -px, right: px };
  const x = xMap[direction] || 0;
  const y = yMap[direction] || px;

  return `
    (function() {
      window.scrollBy({ left: ${x}, top: ${y}, behavior: 'smooth' });
      return JSON.stringify({ success: true, scrolled: ${JSON.stringify(direction)}, pixels: ${px} });
    })()
  `;
}

/**
 * Generate JavaScript code to extract page content with Shadow DOM & rich web component support.
 */
function generateExtractJS(): string {
  return `
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
          if (parent && parent.tagName !== 'SCRIPT' && parent.tagName !== 'STYLE' && parent.tagName !== 'NOSCRIPT') {
            const val = node.nodeValue?.trim();
            if (val) text += val + ' ';
          }
        }
        // Also walk open shadow roots
        const elementsWithShadow = Array.from(root.querySelectorAll('*')).filter(el => el.shadowRoot);
        for (const el of elementsWithShadow) {
          if (el.shadowRoot) text += ' ' + extractAllText(el.shadowRoot);
        }
        return text;
      }

      function queryAllDeep(sel, root = document) {
        let list = Array.from(root.querySelectorAll(sel));
        const elementsWithShadow = Array.from(root.querySelectorAll('*')).filter(el => el.shadowRoot);
        for (const el of elementsWithShadow) {
          if (el.shadowRoot) list = list.concat(queryAllDeep(sel, el.shadowRoot));
        }
        return list;
      }

      const text = extractAllText().substring(0, 6000);

      // Extract all interactive and media links (YouTube videos, articles, buttons)
      const rawLinks = queryAllDeep('a[href], ytd-rich-grid-media, ytd-video-renderer, [role="link"]')
        .slice(0, 40)
        .map(a => {
          const href = a.getAttribute('href') || a.querySelector('a')?.getAttribute('href') || (a as any).href || '';
          const fullHref = href.startsWith('/') ? window.location.origin + href : href;
          const linkText = (a.textContent || a.getAttribute('title') || a.getAttribute('aria-label') || '').replace(/\\s+/g, ' ').trim().substring(0, 120);
          return { text: linkText, url: fullHref };
        })
        .filter(l => l.text && l.url && l.url.startsWith('http') && !l.url.includes('#'));

      const forms = Array.from(document.querySelectorAll('form')).map(f => ({
        action: f.action,
        method: f.method,
        fields: Array.from(f.querySelectorAll('input, textarea, select')).map(i => ({
          name: i.getAttribute('name') || i.getAttribute('id') || '',
          type: i.getAttribute('type') || i.tagName.toLowerCase(),
          placeholder: i.getAttribute('placeholder') || '',
          value: (i as HTMLInputElement).value || '',
        })),
      }));

      const inputs = queryAllDeep('input:not([type="hidden"]), textarea, select')
        .slice(0, 25)
        .map(i => ({
          tag: i.tagName,
          type: i.getAttribute('type') || '',
          name: i.getAttribute('name') || i.getAttribute('id') || '',
          placeholder: i.getAttribute('placeholder') || '',
          ariaLabel: i.getAttribute('aria-label') || '',
          selector: i.id ? '#' + i.id : (i.getAttribute('name') ? '[name="' + i.getAttribute('name') + '"]' : ''),
        }));

      return JSON.stringify({ title, url, text, links: rawLinks, forms, inputs });
    })()
  `;
}

/**
 * Generate JavaScript code to select an option in a <select> element.
 */
function generateSelectJS(selector: string, value: string): string {
  return `
    (function() {
      ${SHADOW_DOM_HELPERS}
      const el = queryDeep(${JSON.stringify(selector)});
      if (!el || el.tagName !== 'SELECT') return JSON.stringify({ success: false, error: 'Select element not found' });
      el.focus();
      const option = Array.from(el.options).find(o => o.value === ${JSON.stringify(value)} || o.text.toLowerCase().includes(${JSON.stringify(value.toLowerCase())}));
      if (!option) return JSON.stringify({ success: false, error: 'Option not found: ' + ${JSON.stringify(value)} });
      el.value = option.value;
      el.dispatchEvent(new Event('change', { bubbles: true }));
      return JSON.stringify({ success: true, selected: option.text });
    })()
  `;
}

/**
 * Generate JavaScript code to press a key combination.
 */
function generatePressKeyJS(keys: string): string {
  return `
    (function() {
      const keyMap = {
        'enter': { key: 'Enter', code: 'Enter' },
        'escape': { key: 'Escape', code: 'Escape' },
        'tab': { key: 'Tab', code: 'Tab' },
        'backspace': { key: 'Backspace', code: 'Backspace' },
        'delete': { key: 'Delete', code: 'Delete' },
        'arrowup': { key: 'ArrowUp', code: 'ArrowUp' },
        'arrowdown': { key: 'ArrowDown', code: 'ArrowDown' },
        'arrowleft': { key: 'ArrowLeft', code: 'ArrowLeft' },
        'arrowright': { key: 'ArrowRight', code: 'ArrowRight' },
        'home': { key: 'Home', code: 'Home' },
        'end': { key: 'End', code: 'End' },
        'pagedown': { key: 'PageDown', code: 'PageDown' },
        'pageup': { key: 'PageUp', code: 'PageUp' },
        'space': { key: ' ', code: 'Space' },
      };
      const keyDef = keyMap[${JSON.stringify(keys.toLowerCase())}];
      if (!keyDef) return JSON.stringify({ success: false, error: 'Unknown key: ' + ${JSON.stringify(keys)} });
      const el = document.activeElement || document.body;
      el.dispatchEvent(new KeyboardEvent('keydown', { key: keyDef.key, code: keyDef.code, bubbles: true }));
      el.dispatchEvent(new KeyboardEvent('keypress', { key: keyDef.key, code: keyDef.code, bubbles: true }));
      el.dispatchEvent(new KeyboardEvent('keyup', { key: keyDef.key, code: keyDef.code, bubbles: true }));
      return JSON.stringify({ success: true, pressed: keyDef.key });
    })()
  `;
}

/**
 * Execute an agent action by generating the appropriate JavaScript.
 * Returns the JS code string that should be evaluated in the webview.
 */
export function generateActionJS(action: AgentAction): string {
  switch (action.type) {
    case 'click':
      if (!action.selector) return 'JSON.stringify({ success: false, error: "No selector provided for click" })';
      return generateClickJS(action.selector);

    case 'type':
      return generateTypeJS(action.selector || '', action.text || '');

    case 'fill_form':
      if (!action.formFields || action.formFields.length === 0)
        return 'JSON.stringify({ success: false, error: "No form fields provided" })';
      return generateFillFormJS(action.formFields);

    case 'scroll':
      return generateScrollJS(action.direction || 'down', action.amount || 500);

    case 'extract':
      return generateExtractJS();

    case 'select':
      if (!action.selector) return 'JSON.stringify({ success: false, error: "No selector provided for select" })';
      return generateSelectJS(action.selector, action.value || '');

    case 'hover':
      if (!action.selector) return 'JSON.stringify({ success: false, error: "No selector provided for hover" })';
      return `
        (function() {
          ${SHADOW_DOM_HELPERS}
          const el = queryDeep(${JSON.stringify(action.selector)});
          if (!el) return JSON.stringify({ success: false, error: 'Element not found' });
          el.scrollIntoView({ behavior: 'smooth', block: 'center' });
          el.dispatchEvent(new MouseEvent('mouseenter', { bubbles: true }));
          el.dispatchEvent(new MouseEvent('mouseover', { bubbles: true }));
          return JSON.stringify({ success: true, hovered: el.tagName });
        })()
      `;

    case 'wait':
      return `
        (function() {
          return JSON.stringify({ success: true, waited: ${(action.amount || 1000)} });
        })()
      `;

    case 'press_key':
      if (!action.keys) return 'JSON.stringify({ success: false, error: "No keys provided" })';
      return generatePressKeyJS(action.keys);

    default:
      return 'JSON.stringify({ success: false, error: "Unknown action type" })';
  }
}

/**
 * Parse an agent action from the AI model's JSON response.
 * The AI returns a structured action object; we normalize it here.
 */
export function parseAgentAction(rawAction: Record<string, unknown>): AgentAction {
  const actionType = (rawAction.action_type || rawAction.type || rawAction.action || 'extract') as string;

  const validTypes = ['click', 'type', 'scroll', 'extract', 'fill_form', 'select', 'hover', 'wait', 'press_key'];
  const type = validTypes.includes(actionType) ? actionType as AgentAction['type'] : 'extract';

  return {
    type,
    selector: (rawAction.selector || rawAction.element || rawAction.target) as string | undefined,
    text: (rawAction.text || rawAction.content || rawAction.value) as string | undefined,
    value: (rawAction.value || rawAction.option) as string | undefined,
    direction: (rawAction.direction || 'down') as 'up' | 'down' | 'left' | 'right',
    amount: (rawAction.amount || rawAction.pixels || 500) as number,
    keys: (rawAction.keys || rawAction.key) as string | undefined,
    formFields: rawAction.formFields as Array<{ selector: string; value: string }> | undefined,
  };
}
