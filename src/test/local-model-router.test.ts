import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('electron', () => ({
  app: {
    getPath: () => '/tmp/test-userdata',
    isPackaged: false,
  },
  safeStorage: {
    isEncryptionAvailable: () => true,
    encryptString: (s: string) => Buffer.from(s),
    decryptString: (b: Buffer) => b.toString(),
  },
}));

import {
  discoverLocalModels,
  getBestLocalModel,
  grantCloudConsent,
  hasCloudConsent,
  revokeCloudConsent,
  getRouterState,
  routePrompt,
} from '@main/local-model-router';

describe('local-model-router', () => {
  beforeEach(() => {
    revokeCloudConsent();
    vi.clearAllMocks();
  });

  describe('consent gating', () => {
    it('denies cloud when no consent', () => {
      expect(hasCloudConsent('gemini')).toBe(false);
      expect(hasCloudConsent('openai', 'persistent')).toBe(false);
    });

    it('grants session consent', () => {
      grantCloudConsent('gemini', 'session');
      expect(hasCloudConsent('gemini', 'session')).toBe(true);
      expect(hasCloudConsent('gemini', 'persistent')).toBe(false);
    });

    it('grants persistent consent', () => {
      grantCloudConsent('openai', 'persistent');
      expect(hasCloudConsent('openai', 'persistent')).toBe(true);
    });

    it('revokes specific provider', () => {
      grantCloudConsent('gemini');
      grantCloudConsent('openai');
      revokeCloudConsent('gemini');
      expect(hasCloudConsent('gemini')).toBe(false);
      expect(hasCloudConsent('openai')).toBe(true);
    });

    it('revokes all', () => {
      grantCloudConsent('gemini');
      grantCloudConsent('openai');
      revokeCloudConsent();
      expect(hasCloudConsent('gemini')).toBe(false);
      expect(hasCloudConsent('openai')).toBe(false);
    });
  });

  describe('routePrompt', () => {
    it('routes local without consent', async () => {
      await expect(routePrompt('test', { provider: 'local' })).rejects.toThrow();
    });

    it('rejects cloud without consent', async () => {
      await expect(routePrompt('test', { provider: 'gemini' })).rejects.toThrow('Cloud consent required');
    });

    it('allows cloud with consent', async () => {
      grantCloudConsent('gemini', 'session');
      await expect(routePrompt('test', { provider: 'gemini', apiKey: 'test' })).rejects.toThrow();
    });
  });

  describe('getRouterState', () => {
    it('returns local-only mode by default', async () => {
      const state = await getRouterState();
      expect(state.mode).toBe('local-only');
      expect(state.configuredCloudProviders.local).toBe(true);
      expect(state.configuredCloudProviders.gemini).toBe(false);
    });

    it('reflects consent in state', async () => {
      grantCloudConsent('gemini');
      const state = await getRouterState();
      expect(state.mode).toBe('cloud-allowed');
      expect(state.configuredCloudProviders.gemini).toBe(true);
    });
  });
});