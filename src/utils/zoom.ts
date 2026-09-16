const ZOOM_STORAGE_KEY = 'icrush-site-zoom-levels';

export interface ZoomLevels {
  [domain: string]: number;
}

export const zoomStorage = {
  getAll: (): ZoomLevels => {
    try {
      const data = localStorage.getItem(ZOOM_STORAGE_KEY);
      return data ? JSON.parse(data) : {};
    } catch {
      return {};
    }
  },

  get: (domain: string): number => {
    try {
      const levels = zoomStorage.getAll();
      return levels[domain] || 100;
    } catch {
      return 100;
    }
  },

  set: (domain: string, zoom: number): void => {
    try {
      const levels = zoomStorage.getAll();
      levels[domain] = zoom;
      localStorage.setItem(ZOOM_STORAGE_KEY, JSON.stringify(levels));
    } catch (e) {
      console.error('Failed to save zoom level:', e);
    }
  },

  remove: (domain: string): void => {
    try {
      const levels = zoomStorage.getAll();
      delete levels[domain];
      localStorage.setItem(ZOOM_STORAGE_KEY, JSON.stringify(levels));
    } catch (e) {
      console.error('Failed to remove zoom level:', e);
    }
  },

  getDomain: (url: string): string => {
    try {
      return new URL(url).hostname;
    } catch {
      return '';
    }
  },
};
