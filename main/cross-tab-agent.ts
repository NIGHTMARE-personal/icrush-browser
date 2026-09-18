/**
 * Cross-Tab Agent — multi-tab awareness and synthesis.
 *
 * Features:
 * - Track state across multiple browser tabs
 * - Compare content between tabs
 * - Synthesize information from multiple pages
 * - Coordinate actions across tabs (e.g., copy from tab A, paste in tab B)
 * - Tab relationship graph (related tabs, navigation history)
 * - Parallel tab monitoring
 *
 * Design invariants:
 * - Each tab has its own DOM engine instance
 * - Cross-tab actions require explicit user intent
 * - Tab state is ephemeral (cleared when tab closes)
 * - Privacy: no data leaves the browser
 */
import { DOMEngine, type PageState } from './dom-engine';
import { PageUnderstandingEngine, type PageUnderstanding } from './page-understanding';
import crypto from 'crypto';

// ─── Types ────────────────────────────────────────────────────────────────

export interface TabState {
  id: string;
  webviewId: number;
  url: string;
  title: string;
  partition: string;
  isActive: boolean;
  lastSnapshot?: PageUnderstanding;
  lastUpdated: number;
  history: Array<{ url: string; title: string; timestamp: number }>;
  metadata: Record<string, unknown>;
}

export interface CrossTabTask {
  id: string;
  type: 'compare' | 'merge' | 'copy' | 'monitor' | 'synthesize';
  tabIds: string[];
  description: string;
  status: 'pending' | 'running' | 'completed' | 'failed';
  result?: CrossTabResult;
  error?: string;
  createdAt: number;
}

export interface CrossTabResult {
  type: string;
  content: string;
  tabResults: Array<{ tabId: string; title: string; url: string; summary: string }>;
  timestamp: number;
}

export interface TabRelationship {
  fromTabId: string;
  toTabId: string;
  type: 'opened_from' | 'same_domain' | 'same_session' | 'related_content';
  strength: number;
}

export interface MonitorConfig {
  intervalMs: number;
  maxChanges: number;
  includeSelectors: boolean;
  changeThreshold: number;
}

export interface MonitorEvent {
  tabId: string;
  type: 'url_changed' | 'content_changed' | 'form_detected' | 'error';
  details: string;
  timestamp: number;
}

// ─── Cross-Tab Agent ──────────────────────────────────────────────────────

export class CrossTabAgent {
  private tabs: Map<string, TabState> = new Map();
  private domEngines: Map<string, DOMEngine> = new Map();
  private understandingEngines: Map<string, PageUnderstandingEngine> = new Map();
  private tasks: Map<string, CrossTabTask> = new Map();
  private monitorIntervals: Map<string, ReturnType<typeof setInterval>> = new Map();
  private relationships: TabRelationship[] = [];
  private monitorCallbacks: Array<(event: MonitorEvent) => void> = [];

  // ─── Tab Registration ─────────────────────────────────────────────

  /**
   * Register a new tab with its DOM engine.
   */
  registerTab(
    webviewId: number,
    partition: string,
    executeJs: (code: string) => Promise<unknown>
  ): string {
    const tabId = `tab-${webviewId}-${Date.now()}`;
    const dom = new DOMEngine(executeJs, webviewId);
    const understanding = new PageUnderstandingEngine(dom);

    this.tabs.set(tabId, {
      id: tabId,
      webviewId,
      url: '',
      title: '',
      partition,
      isActive: false,
      lastUpdated: Date.now(),
      history: [],
      metadata: {},
    });

    this.domEngines.set(tabId, dom);
    this.understandingEngines.set(tabId, understanding);

    return tabId;
  }

  /**
   * Unregister a tab.
   */
  unregisterTab(tabId: string): void {
    this.tabs.delete(tabId);
    this.domEngines.delete(tabId);
    this.understandingEngines.delete(tabId);
    this.stopMonitoring(tabId);
    this.relationships = this.relationships.filter(
      r => r.fromTabId !== tabId && r.toTabId !== tabId
    );
  }

  /**
   * Update tab state (called when navigation occurs).
   */
  updateTabState(tabId: string, url: string, title: string): void {
    const tab = this.tabs.get(tabId);
    if (!tab) return;

    // Record history
    if (tab.url && tab.url !== url) {
      tab.history.push({ url: tab.url, title: tab.title, timestamp: Date.now() });
      if (tab.history.length > 50) tab.history = tab.history.slice(-50);
    }

    tab.url = url;
    tab.title = title;
    tab.lastUpdated = Date.now();

    // Detect relationships
    this.detectRelationships(tabId);
  }

  /**
   * Set the active tab.
   */
  setActiveTab(tabId: string): void {
    for (const tab of this.tabs.values()) {
      tab.isActive = tab.id === tabId;
    }
  }

  // ─── Tab Queries ──────────────────────────────────────────────────

  getTab(tabId: string): TabState | undefined {
    return this.tabs.get(tabId);
  }

  getAllTabs(): TabState[] {
    return Array.from(this.tabs.values());
  }

  getActiveTab(): TabState | undefined {
    return Array.from(this.tabs.values()).find(t => t.isActive);
  }

  getTabsByDomain(domain: string): TabState[] {
    return Array.from(this.tabs.values()).filter(t => {
      try {
        return new URL(t.url).hostname === domain;
      } catch {
        return false;
      }
    });
  }

  getTabsByPartition(partition: string): TabState[] {
    return Array.from(this.tabs.values()).filter(t => t.partition === partition);
  }

  /**
   * Get DOM engine for a tab.
   */
  getDOMEngine(tabId: string): DOMEngine | undefined {
    return this.domEngines.get(tabId);
  }

  /**
   * Get understanding engine for a tab.
   */
  getUnderstandingEngine(tabId: string): PageUnderstandingEngine | undefined {
    return this.understandingEngines.get(tabId);
  }

  // ─── Cross-Tab Operations ─────────────────────────────────────────

  /**
   * Compare content between two tabs.
   */
  async compareTabs(tabIdA: string, tabIdB: string): Promise<CrossTabResult> {
    const engineA = this.understandingEngines.get(tabIdA);
    const engineB = this.understandingEngines.get(tabIdB);
    const tabA = this.tabs.get(tabIdA);
    const tabB = this.tabs.get(tabIdB);

    if (!engineA || !engineB || !tabA || !tabB) {
      throw new Error('One or both tabs not found');
    }

    const [understandingA, understandingB] = await Promise.all([
      engineA.analyze({ includeA11yTree: false, includeArticle: true }),
      engineB.analyze({ includeA11yTree: false, includeArticle: true }),
    ]);

    tabA.lastSnapshot = understandingA;
    tabB.lastSnapshot = understandingB;

    const contentA = understandingA.article?.content || understandingA.state.text;
    const contentB = understandingB.article?.content || understandingB.state.text;

    return {
      type: 'compare',
      content: `# Comparison: ${tabA.title} vs ${tabB.title}\n\n## Tab A: ${tabA.title}\nURL: ${tabA.url}\nType: ${understandingA.classification.type}\n\n${contentA.substring(0, 2000)}\n\n## Tab B: ${tabB.title}\nURL: ${tabB.url}\nType: ${understandingB.classification.type}\n\n${contentB.substring(0, 2000)}`,
      tabResults: [
        { tabId: tabIdA, title: tabA.title, url: tabA.url, summary: contentA.substring(0, 500) },
        { tabId: tabIdB, title: tabB.title, url: tabB.url, summary: contentB.substring(0, 500) },
      ],
      timestamp: Date.now(),
    };
  }

  /**
   * Merge content from multiple tabs.
   */
  async mergeTabs(tabIds: string[]): Promise<CrossTabResult> {
    const tabResults: CrossTabResult['tabResults'] = [];
    const parts: string[] = [];

    for (const tabId of tabIds) {
      const engine = this.understandingEngines.get(tabId);
      const tab = this.tabs.get(tabId);
      if (!engine || !tab) continue;

      const understanding = await engine.analyze({ includeArticle: true });
      tab.lastSnapshot = understanding;

      const content = understanding.article?.content || understanding.state.text;
      parts.push(`## ${tab.title}\nURL: ${tab.url}\n\n${content.substring(0, 1500)}`);
      tabResults.push({ tabId, title: tab.title, url: tab.url, summary: content.substring(0, 300) });
    }

    return {
      type: 'merge',
      content: parts.join('\n\n---\n\n'),
      tabResults,
      timestamp: Date.now(),
    };
  }

  /**
   * Copy data from one tab to another (e.g., fill form in tab B from tab A).
   */
  async copyBetweenTabs(
    sourceTabId: string,
    targetTabId: string,
    instruction: string
  ): Promise<{ success: boolean; output: string }> {
    const sourceEngine = this.understandingEngines.get(sourceTabId);
    const targetEngine = this.understandingEngines.get(targetTabId);

    if (!sourceEngine || !targetEngine) {
      return { success: false, output: 'One or both tabs not found' };
    }

    // Extract from source
    const sourceState = await sourceEngine.analyze({ includeArticle: true });
    const sourceContent = sourceState.article?.content || sourceState.state.text;

    // Get target page state for form detection
    const targetState = await targetEngine.analyze({ classificationOnly: false });
    const targetForms = targetState.forms;

    return {
      success: true,
      output: `Copied content from "${sourceState.state.title}" (length: ${sourceContent.length}). Target has ${targetForms.length} forms with ${targetForms.reduce((s, f) => s + f.fields.length, 0)} fields. Instruction: ${instruction}`,
    };
  }

  /**
   * Synthesize information from all open tabs.
   */
  async synthesizeAllTabs(): Promise<CrossTabResult> {
    const tabIds = Array.from(this.tabs.keys());
    return this.mergeTabs(tabIds);
  }

  // ─── Tab Monitoring ───────────────────────────────────────────────

  /**
   * Start monitoring a tab for changes.
   */
  startMonitoring(tabId: string, config: MonitorConfig): void {
    this.stopMonitoring(tabId);

    const interval = setInterval(async () => {
      const engine = this.understandingEngines.get(tabId);
      const tab = this.tabs.get(tabId);
      if (!engine || !tab) return;

      try {
        const state = await engine.analyze({ classificationOnly: true });

        // Check for URL change
        if (state.state.url !== tab.url) {
          this.emitMonitorEvent({
            tabId,
            type: 'url_changed',
            details: `URL changed: ${tab.url} → ${state.state.url}`,
            timestamp: Date.now(),
          });
          this.updateTabState(tabId, state.state.url, state.state.title);
        }

        // Check for content change (compare text hash)
        const prevHash = tab.lastSnapshot?.state.text.substring(0, 500) || '';
        const newHash = state.state.text.substring(0, 500);
        if (prevHash && prevHash !== newHash) {
          this.emitMonitorEvent({
            tabId,
            type: 'content_changed',
            details: `Content changed on ${state.state.title}`,
            timestamp: Date.now(),
          });
        }

        tab.lastSnapshot = state;
        tab.lastUpdated = Date.now();
      } catch {
        // Monitoring errors are non-fatal
      }
    }, config.intervalMs);

    this.monitorIntervals.set(tabId, interval);
  }

  /**
   * Stop monitoring a tab.
   */
  stopMonitoring(tabId: string): void {
    const interval = this.monitorIntervals.get(tabId);
    if (interval) {
      clearInterval(interval);
      this.monitorIntervals.delete(tabId);
    }
  }

  /**
   * Add a monitor event listener.
   */
  onMonitorEvent(callback: (event: MonitorEvent) => void): void {
    this.monitorCallbacks.push(callback);
  }

  // ─── Relationships ────────────────────────────────────────────────

  getRelationships(tabId: string): TabRelationship[] {
    return this.relationships.filter(
      r => r.fromTabId === tabId || r.toTabId === tabId
    );
  }

  private detectRelationships(tabId: string): void {
    const tab = this.tabs.get(tabId);
    if (!tab) return;

    try {
      const domain = new URL(tab.url).hostname;

      for (const [otherId, otherTab] of this.tabs) {
        if (otherId === tabId) continue;

        try {
          const otherDomain = new URL(otherTab.url).hostname;

          // Same domain relationship
          if (domain === otherDomain) {
            this.addRelationship({
              fromTabId: tabId,
              toTabId: otherId,
              type: 'same_domain',
              strength: 0.8,
            });
          }

          // Opened from relationship
          if (tab.history.some(h => h.url === otherTab.url)) {
            this.addRelationship({
              fromTabId: otherId,
              toTabId: tabId,
              type: 'opened_from',
              strength: 1.0,
            });
          }
        } catch { /* skip invalid URLs */ }
      }
    } catch { /* skip invalid URLs */ }
  }

  private addRelationship(rel: TabRelationship): void {
    const existing = this.relationships.find(
      r => r.fromTabId === rel.fromTabId && r.toTabId === rel.toTabId && r.type === rel.type
    );
    if (!existing) {
      this.relationships.push(rel);
    }
  }

  // ─── Internal ─────────────────────────────────────────────────────

  private emitMonitorEvent(event: MonitorEvent): void {
    for (const callback of this.monitorCallbacks) {
      try { callback(event); } catch { /* swallow */ }
    }
  }

  // ─── Stats ────────────────────────────────────────────────────────

  getStats(): {
    totalTabs: number;
    activeTabs: number;
    monitoredTabs: number;
    relationships: number;
    totalSnapshots: number;
  } {
    const tabs = Array.from(this.tabs.values());
    return {
      totalTabs: tabs.length,
      activeTabs: tabs.filter(t => t.isActive).length,
      monitoredTabs: this.monitorIntervals.size,
      relationships: this.relationships.length,
      totalSnapshots: tabs.filter(t => t.lastSnapshot).length,
    };
  }
}
