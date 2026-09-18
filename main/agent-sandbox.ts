/**
 * Safety Sandbox — resource quotas, network control, and mutation limits.
 *
 * Provides:
 * - Step budget enforcement (max actions per session)
 * - Time budget enforcement (max wall-clock time)
 * - Network egress control (allowed/blocked domains, HTTPS-only mode)
 * - DOM mutation limits (prevent runaway scripts)
 * - Memory usage tracking
 * - Rate limiting per action type
 * - Kill switch (immediate termination)
 * - Sensitive action rate limiting
 *
 * Design invariants:
 * - Sandbox is checked BEFORE every action — not after
 * - Sandbox violations are logged and reported to user
 * - Sandbox cannot be bypassed by the agent itself
 * - Defaults are conservative — user can relax but not escape
 */
import type { AgentPermissionTier } from '../shared/agent-contracts';

// ─── Types ────────────────────────────────────────────────────────────────

export interface SandboxConfig {
  // Resource budgets
  maxSteps: number;
  maxTimeMs: number;
  maxNavigations: number;
  maxNetworkRequests: number;
  maxDomMutations: number;
  maxMemoryBytes: number;

  // Rate limits (per minute)
  maxClicksPerMinute: number;
  maxTypesPerMinute: number;
  maxExtractsPerMinute: number;
  maxScrollsPerMinute: number;
  maxSensitiveActionsPerMinute: number;

  // Network control
  allowedDomains: string[];
  blockedDomains: string[];
  httpsOnly: boolean;
  blockWebRTC: boolean;
  blockDNSLeak: boolean;

  // DOM control
  maxSelectorDepth: number;
  maxTextExtractChars: number;
  blockCookieBanners: boolean;

  // Kill switch
  enableKillSwitch: boolean;
}

export interface SandboxState {
  // Counters
  stepsUsed: number;
  navigationsUsed: number;
  networkRequestsUsed: number;
  domMutationsUsed: number;
  startTime: number;

  // Rate limit counters
  clicksThisMinute: number;
  typesThisMinute: number;
  extractsThisMinute: number;
  scrollsThisMinute: number;
  sensitiveActionsThisMinute: number;
  rateLimitWindowStart: number;

  // Memory
  memoryBytesUsed: number;

  // Flags
  killSwitchTriggered: boolean;
  violations: SandboxViolation[];
}

export interface SandboxViolation {
  type: 'step_budget' | 'time_budget' | 'network_blocked' | 'rate_limit' | 'mutation_limit' | 'memory_limit' | 'kill_switch' | 'https_only' | 'selector_depth';
  message: string;
  timestamp: number;
  blocked: boolean;
}

export interface SandboxCheckResult {
  allowed: boolean;
  violation?: SandboxViolation;
}

// ─── Defaults ─────────────────────────────────────────────────────────────

const DEFAULT_CONFIG: SandboxConfig = {
  maxSteps: 50,
  maxTimeMs: 10 * 60 * 1000, // 10 minutes
  maxNavigations: 30,
  maxNetworkRequests: 100,
  maxDomMutations: 5000,
  maxMemoryBytes: 500 * 1024 * 1024, // 500MB

  maxClicksPerMinute: 20,
  maxTypesPerMinute: 15,
  maxExtractsPerMinute: 30,
  maxScrollsPerMinute: 30,
  maxSensitiveActionsPerMinute: 5,

  allowedDomains: [],
  blockedDomains: [],
  httpsOnly: true,
  blockWebRTC: true,
  blockDNSLeak: true,

  maxSelectorDepth: 10,
  maxTextExtractChars: 50000,
  blockCookieBanners: true,

  enableKillSwitch: true,
};

// ─── Sandbox ──────────────────────────────────────────────────────────────

export class SafetySandbox {
  private config: SandboxConfig;
  private state: SandboxState;
  private onViolation?: (violation: SandboxViolation) => void;

  constructor(config: Partial<SandboxConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.state = this.createInitialState();
  }

  setViolationHandler(handler: (violation: SandboxViolation) => void): void {
    this.onViolation = handler;
  }

  // ─── Pre-Action Checks ────────────────────────────────────────────

  /**
   * Check if a step action is allowed.
   */
  checkStep(): SandboxCheckResult {
    if (this.state.killSwitchTriggered) {
      return this.violation('kill_switch', 'Kill switch is active', true);
    }

    if (this.state.stepsUsed >= this.config.maxSteps) {
      return this.violation('step_budget', `Step budget exhausted (${this.state.stepsUsed}/${this.config.maxSteps})`, true);
    }

    const elapsed = Date.now() - this.state.startTime;
    if (elapsed >= this.config.maxTimeMs) {
      return this.violation('time_budget', `Time budget exhausted (${elapsed}ms/${this.config.maxTimeMs}ms)`, true);
    }

    return { allowed: true };
  }

  /**
   * Check if a navigation is allowed.
   */
  checkNavigation(domain: string): SandboxCheckResult {
    if (this.state.killSwitchTriggered) {
      return this.violation('kill_switch', 'Kill switch is active', true);
    }

    if (this.state.navigationsUsed >= this.config.maxNavigations) {
      return this.violation('step_budget', `Navigation budget exhausted`, true);
    }

    // Domain blocking
    if (this.config.blockedDomains.length > 0) {
      const isBlocked = this.config.blockedDomains.some(d =>
        domain === d || domain.endsWith('.' + d)
      );
      if (isBlocked) {
        return this.violation('network_blocked', `Domain "${domain}" is blocked`, true);
      }
    }

    // Domain allowlist (if set, only these are allowed)
    if (this.config.allowedDomains.length > 0) {
      const isAllowed = this.config.allowedDomains.some(d =>
        domain === d || domain.endsWith('.' + d)
      );
      if (!isAllowed) {
        return this.violation('network_blocked', `Domain "${domain}" is not in allowlist`, true);
      }
    }

    this.state.navigationsUsed++;
    return { allowed: true };
  }

  /**
   * Check if a network request is allowed.
   */
  checkNetworkRequest(domain: string, protocol: string): SandboxCheckResult {
    if (this.state.killSwitchTriggered) {
      return this.violation('kill_switch', 'Kill switch is active', true);
    }

    if (this.state.networkRequestsUsed >= this.config.maxNetworkRequests) {
      return this.violation('step_budget', `Network request budget exhausted`, true);
    }

    // HTTPS-only mode
    if (this.config.httpsOnly && protocol === 'http:') {
      return this.violation('https_only', `HTTP request blocked (HTTPS-only mode)`, true);
    }

    this.state.networkRequestsUsed++;
    return { allowed: true };
  }

  /**
   * Check if a DOM mutation is allowed.
   */
  checkDomMutation(): SandboxCheckResult {
    if (this.state.killSwitchTriggered) {
      return this.violation('kill_switch', 'Kill switch is active', true);
    }

    if (this.state.domMutationsUsed >= this.config.maxDomMutations) {
      return this.violation('mutation_limit', `DOM mutation limit reached (${this.state.domMutationsUsed}/${this.config.maxDomMutations})`, true);
    }

    this.state.domMutationsUsed++;
    return { allowed: true };
  }

  /**
   * Check rate limit for a specific action type.
   */
  checkRateLimit(actionType: 'click' | 'type' | 'extract' | 'scroll' | 'sensitive'): SandboxCheckResult {
    if (this.state.killSwitchTriggered) {
      return this.violation('kill_switch', 'Kill switch is active', true);
    }

    this.maybeResetRateWindow();

    switch (actionType) {
      case 'click':
        if (this.state.clicksThisMinute >= this.config.maxClicksPerMinute) {
          return this.violation('rate_limit', `Click rate limit exceeded (${this.config.maxClicksPerMinute}/min)`, true);
        }
        this.state.clicksThisMinute++;
        break;
      case 'type':
        if (this.state.typesThisMinute >= this.config.maxTypesPerMinute) {
          return this.violation('rate_limit', `Type rate limit exceeded (${this.config.maxTypesPerMinute}/min)`, true);
        }
        this.state.typesThisMinute++;
        break;
      case 'extract':
        if (this.state.extractsThisMinute >= this.config.maxExtractsPerMinute) {
          return this.violation('rate_limit', `Extract rate limit exceeded (${this.config.maxExtractsPerMinute}/min)`, true);
        }
        this.state.extractsThisMinute++;
        break;
      case 'scroll':
        if (this.state.scrollsThisMinute >= this.config.maxScrollsPerMinute) {
          return this.violation('rate_limit', `Scroll rate limit exceeded (${this.config.maxScrollsPerMinute}/min)`, true);
        }
        this.state.scrollsThisMinute++;
        break;
      case 'sensitive':
        if (this.state.sensitiveActionsThisMinute >= this.config.maxSensitiveActionsPerMinute) {
          return this.violation('rate_limit', `Sensitive action rate limit exceeded (${this.config.maxSensitiveActionsPerMinute}/min)`, true);
        }
        this.state.sensitiveActionsThisMinute++;
        break;
    }

    return { allowed: true };
  }

  /**
   * Check if a CSS selector is within depth limits.
   */
  checkSelectorDepth(selector: string): SandboxCheckResult {
    const depth = (selector.match(/[>~+ ]/g) || []).length + 1;
    if (depth > this.config.maxSelectorDepth) {
      return this.violation('selector_depth', `Selector depth ${depth} exceeds limit ${this.config.maxSelectorDepth}`, true);
    }
    return { allowed: true };
  }

  // ─── Recording ────────────────────────────────────────────────────

  recordStep(): void {
    this.state.stepsUsed++;
  }

  recordNavigation(): void {
    this.state.navigationsUsed++;
  }

  recordNetworkRequest(): void {
    this.state.networkRequestsUsed++;
  }

  recordMemoryUsage(bytes: number): void {
    this.state.memoryBytesUsed = bytes;
    if (bytes >= this.config.maxMemoryBytes) {
      this.violation('memory_limit', `Memory usage ${bytes} exceeds limit ${this.config.maxMemoryBytes}`, true);
    }
  }

  // ─── Kill Switch ──────────────────────────────────────────────────

  triggerKillSwitch(reason: string): void {
    this.state.killSwitchTriggered = true;
    this.violation('kill_switch', `Kill switch triggered: ${reason}`, true);
  }

  resetKillSwitch(): void {
    this.state.killSwitchTriggered = false;
  }

  // ─── State ────────────────────────────────────────────────────────

  getState(): Readonly<SandboxState> {
    return { ...this.state };
  }

  getConfig(): Readonly<SandboxConfig> {
    return { ...this.config };
  }

  getUsage(): {
    steps: { used: number; max: number; pct: number };
    time: { used: number; max: number; pct: number };
    navigations: { used: number; max: number };
    networkRequests: { used: number; max: number };
    domMutations: { used: number; max: number };
    memory: { used: number; max: number };
    violations: number;
  } {
    const elapsed = Date.now() - this.state.startTime;
    return {
      steps: { used: this.state.stepsUsed, max: this.config.maxSteps, pct: this.state.stepsUsed / this.config.maxSteps },
      time: { used: elapsed, max: this.config.maxTimeMs, pct: elapsed / this.config.maxTimeMs },
      navigations: { used: this.state.navigationsUsed, max: this.config.maxNavigations },
      networkRequests: { used: this.state.networkRequestsUsed, max: this.config.maxNetworkRequests },
      domMutations: { used: this.state.domMutationsUsed, max: this.config.maxDomMutations },
      memory: { used: this.state.memoryBytesUsed, max: this.config.maxMemoryBytes },
      violations: this.state.violations.length,
    };
  }

  getViolations(): SandboxViolation[] {
    return [...this.state.violations];
  }

  // ─── Reset ────────────────────────────────────────────────────────

  reset(): void {
    this.state = this.createInitialState();
  }

  updateConfig(config: Partial<SandboxConfig>): void {
    this.config = { ...this.config, ...config };
  }

  // ─── Internal ─────────────────────────────────────────────────────

  private violation(type: SandboxViolation['type'], message: string, blocked: boolean): SandboxCheckResult {
    const v: SandboxViolation = { type, message, timestamp: Date.now(), blocked };
    this.state.violations.push(v);

    // Cap violation history
    if (this.state.violations.length > 100) {
      this.state.violations = this.state.violations.slice(-100);
    }

    this.onViolation?.(v);

    return { allowed: false, violation: v };
  }

  private maybeResetRateWindow(): void {
    const now = Date.now();
    if (now - this.state.rateLimitWindowStart > 60_000) {
      this.state.clicksThisMinute = 0;
      this.state.typesThisMinute = 0;
      this.state.extractsThisMinute = 0;
      this.state.scrollsThisMinute = 0;
      this.state.sensitiveActionsThisMinute = 0;
      this.state.rateLimitWindowStart = now;
    }
  }

  private createInitialState(): SandboxState {
    return {
      stepsUsed: 0,
      navigationsUsed: 0,
      networkRequestsUsed: 0,
      domMutationsUsed: 0,
      startTime: Date.now(),
      clicksThisMinute: 0,
      typesThisMinute: 0,
      extractsThisMinute: 0,
      scrollsThisMinute: 0,
      sensitiveActionsThisMinute: 0,
      rateLimitWindowStart: Date.now(),
      memoryBytesUsed: 0,
      killSwitchTriggered: false,
      violations: [],
    };
  }
}
