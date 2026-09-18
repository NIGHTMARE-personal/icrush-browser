import { describe, it, expect, vi } from 'vitest';

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
  listAgentCredentials,
  removeAgentIdentity,
} from '@main/agent-identity';

describe('agent-identity', () => {
  describe('credential storage', () => {
    it('starts empty', () => {
      expect(listAgentCredentials().length).toBe(0);
    });
  });

  describe('exported functions', () => {
    it('can remove credentials', () => {
      expect(removeAgentIdentity('test-cred-2')).toBe(true);
    });

    it('returns true for non-existent removal', () => {
      expect(removeAgentIdentity('non-existent')).toBe(true);
    });
  });
});