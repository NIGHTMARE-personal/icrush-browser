export interface TabState {
  id: string;
  url: string;
  lastActiveTime?: number;
  isSuspended?: boolean;
}

export class TabMemoryManager {
  private static MAX_ACTIVE_TABS = 8;
  private static INACTIVE_TIMEOUT_MS = 15 * 60 * 1000; // 15 minutes

  public static evaluateTabSuspensions(
    tabs: TabState[],
    activeId: string | null,
    onSuspendTab: (tabId: string) => void
  ): void {
    if (!tabs || tabs.length <= 1) return;

    const now = Date.now();
    let currentActiveCount = tabs.filter(t => !t.isSuspended).length;

    // Filter candidate tabs for suspension
    const candidates = tabs.filter(t => {
      if (t.id === activeId || t.isSuspended) return false;
      if (t.url.startsWith('about:') || t.url.startsWith('chrome:') || t.url.startsWith('icrush:')) return false;
      return true;
    });

    // Sort LRU: oldest lastActiveTime first
    candidates.sort((a, b) => {
      const timeA = a.lastActiveTime || 0;
      const timeB = b.lastActiveTime || 0;
      return timeA - timeB;
    });

    candidates.forEach(tab => {
      const lastActive = tab.lastActiveTime || now;
      const isInactive = now - lastActive > this.INACTIVE_TIMEOUT_MS;
      const exceedsMaxTabs = currentActiveCount > this.MAX_ACTIVE_TABS;

      if (isInactive || exceedsMaxTabs) {
        onSuspendTab(tab.id);
        currentActiveCount--;
      }
    });
  }
}
