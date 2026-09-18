import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('electron', () => ({
  app: {
    getPath: () => '/tmp/test-userdata',
    getName: () => 'test-app',
  },
  safeStorage: {
    isEncryptionAvailable: () => true,
    encryptString: (s: string) => Buffer.from(s),
    decryptString: (b: Buffer) => b.toString(),
  },
  BrowserWindow: vi.fn(),
  session: {
    defaultSession: {
      webRequest: {
        onBeforeRequest: vi.fn(),
      },
    },
  },
}));

import { VPNManager } from '@main/vpn-manager';

describe('VPNManager (BYOC)', () => {
  let vpn: VPNManager;

  beforeEach(() => {
    vpn = new VPNManager();
  });

  describe('parseWireGuardConfig', () => {
    const VALID_CONF = `[Interface]
PrivateKey = yAnz5TF+lXXJte14tji3zlMNq+hd2rYUIgJBgB3fBmk=
Address = 10.0.0.2/32
DNS = 1.1.1.1, 8.8.8.8
MTU = 1420

[Peer]
PublicKey = xTIBA5rboUvnH4htodjb6e697QjLERt1NAB4mZqp8Dg=
Endpoint = vpn.example.com:51820
AllowedIPs = 0.0.0.0/0, ::/0
PersistentKeepalive = 25`;

    it('should parse a valid WireGuard config', () => {
      const result = vpn.parseWireGuardConfig(VALID_CONF);
      expect(result).not.toBeNull();
      expect(result!.privateKey).toBe('yAnz5TF+lXXJte14tji3zlMNq+hd2rYUIgJBgB3fBmk=');
      expect(result!.address).toBe('10.0.0.2/32');
      expect(result!.dns).toEqual(['1.1.1.1', '8.8.8.8']);
      expect(result!.mtu).toBe(1420);
      expect(result!.peers).toHaveLength(1);
      expect(result!.peers[0].publicKey).toBe('xTIBA5rboUvnH4htodjb6e697QjLERt1NAB4mZqp8Dg=');
      expect(result!.peers[0].endpoint).toBe('vpn.example.com:51820');
      expect(result!.peers[0].allowedIps).toBe('0.0.0.0/0, ::/0');
      expect(result!.peers[0].persistentKeepalive).toBe(25);
    });

    it('should parse config with multiple peers', () => {
      const multiPeer = `[Interface]
PrivateKey = abc123
Address = 10.0.0.5/32

[Peer]
PublicKey = peer1key
Endpoint = server1.example.com:51820
AllowedIPs = 0.0.0.0/0

[Peer]
PublicKey = peer2key
Endpoint = server2.example.com:51820
AllowedIPs = 10.0.0.0/8`;

      const result = vpn.parseWireGuardConfig(multiPeer);
      expect(result).not.toBeNull();
      expect(result!.peers).toHaveLength(2);
      expect(result!.peers[0].publicKey).toBe('peer1key');
      expect(result!.peers[1].publicKey).toBe('peer2key');
      expect(result!.peers[1].allowedIps).toBe('10.0.0.0/8');
    });

    it('should return null if PrivateKey is missing', () => {
      const noKey = `[Interface]
Address = 10.0.0.2/32

[Peer]
PublicKey = xTIBA5rboUvnH4htodjb6e697QjLERt1NAB4mZqp8Dg=
Endpoint = vpn.example.com:51820`;

      expect(vpn.parseWireGuardConfig(noKey)).toBeNull();
    });

    it('should return null if no peers exist', () => {
      const noPeers = `[Interface]
PrivateKey = abc123
Address = 10.0.0.2/32`;

      expect(vpn.parseWireGuardConfig(noPeers)).toBeNull();
    });

    it('should return null for empty config', () => {
      expect(vpn.parseWireGuardConfig('')).toBeNull();
    });

    it('should handle comments in config', () => {
      const withComments = `# This is a comment
[Interface]
# Another comment
PrivateKey = abc123
Address = 10.0.0.2/32

[Peer]
PublicKey = def456
Endpoint = vpn.example.com:51820`;

      const result = vpn.parseWireGuardConfig(withComments);
      expect(result).not.toBeNull();
      expect(result!.privateKey).toBe('abc123');
    });

    it('should handle case-insensitive section headers', () => {
      const lowerCase = `[interface]
PrivateKey = abc123
Address = 10.0.0.2/32

[peer]
PublicKey = def456
Endpoint = vpn.example.com:51820`;

      const result = vpn.parseWireGuardConfig(lowerCase);
      expect(result).not.toBeNull();
      expect(result!.peers).toHaveLength(1);
    });

    it('should handle optional MTU defaulting to 1420', () => {
      const noMtu = `[Interface]
PrivateKey = abc123
Address = 10.0.0.2/32

[Peer]
PublicKey = def456
Endpoint = vpn.example.com:51820`;

      const result = vpn.parseWireGuardConfig(noMtu);
      expect(result).not.toBeNull();
      expect(result!.mtu).toBe(1420);
    });
  });

  describe('importConfig', () => {
    it('should accept and store a valid config', async () => {
      const conf = `[Interface]
PrivateKey = abc123
Address = 10.0.0.2/32

[Peer]
PublicKey = def456
Endpoint = vpn.example.com:51820
AllowedIPs = 0.0.0.0/0`;

      const result = await vpn.importConfig(conf);
      expect(result.privateKey).toBe('abc123');
      expect(result.peers[0].endpoint).toBe('vpn.example.com:51820');

      const stored = vpn.getImportedConfig();
      expect(stored).not.toBeNull();
      expect(stored!.privateKey).toBe('abc123');
    });

    it('should reject invalid config', async () => {
      await expect(vpn.importConfig('totally invalid')).rejects.toThrow('Invalid WireGuard config');
    });

    it('should update raw config on import', async () => {
      const conf = `[Interface]
PrivateKey = abc123
Address = 10.0.0.2/32

[Peer]
PublicKey = def456
Endpoint = vpn.example.com:51820`;

      await vpn.importConfig(conf);
      expect(vpn.getRawConfig()).toBe(conf);
    });
  });

  describe('clearConfig', () => {
    it('should clear stored config', async () => {
      const conf = `[Interface]
PrivateKey = abc123
Address = 10.0.0.2/32

[Peer]
PublicKey = def456
Endpoint = vpn.example.com:51820`;

      await vpn.importConfig(conf);
      expect(vpn.getImportedConfig()).not.toBeNull();

      vpn.clearConfig();
      expect(vpn.getImportedConfig()).toBeNull();
      expect(vpn.getRawConfig()).toBe('');
    });
  });

  describe('connect without config', () => {
    it('should fail if no config is imported', async () => {
      const result = await vpn.connect();
      expect(result).toBe(false);
    });
  });

  describe('kill switch', () => {
    it('should be enabled by default', () => {
      expect(vpn.isKillSwitchEnabled()).toBe(true);
    });

    it('should toggle kill switch', () => {
      vpn.setKillSwitch(false);
      expect(vpn.isKillSwitchEnabled()).toBe(false);
      vpn.setKillSwitch(true);
      expect(vpn.isKillSwitchEnabled()).toBe(true);
    });
  });

  describe('VPN mode', () => {
    it('should be disabled by default', () => {
      expect(vpn.isVPNMode()).toBe(false);
    });

    it('should toggle VPN mode', () => {
      vpn.setVPNMode(true);
      expect(vpn.isVPNMode()).toBe(true);
    });
  });
});
