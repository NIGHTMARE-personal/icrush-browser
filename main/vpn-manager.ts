import { app, BrowserWindow, session, safeStorage } from 'electron';
import path from 'path';
import fs from 'fs';
import { spawn } from 'child_process';

export interface VPNConfigData {
  privateKey: string;
  address: string;
  dns: string[];
  mtu: number;
  peers: Array<{
    publicKey: string;
    endpoint: string;
    allowedIps: string;
    persistentKeepalive: number;
  }>;
}

export interface VPNStatus {
  connected: boolean;
  serverName: string;
  serverLatency: number;
  bandwidth: { up: number; down: number; total: number };
  interfaceName: string;
  localIP: string;
  endpointIP: string;
  lastHandshake: number;
}

interface VPNManagerConfig {
  dataDir: string;
  configDir: string;
  binDir: string;
  wireguardPath: string;
  importedConfig: VPNConfigData | null;
  importedConfigRaw: string;
  connectionTimeout: number;
}

export class VPNManager {
  private vpnProcess: ReturnType<typeof spawn> | null = null;
  private config: VPNManagerConfig;
  private status: VPNStatus = {
    connected: false,
    serverName: '',
    serverLatency: 0,
    bandwidth: { up: 0, down: 0, total: 0 },
    interfaceName: '',
    localIP: '',
    endpointIP: '',
    lastHandshake: 0,
  };
  private statusCallbacks: Set<(status: VPNStatus) => void> = new Set();
  private isShuttingDown = false;
  private vpnModeEnabled = false;
  private killSwitchEnabled = true;
  private windowGetter: (() => BrowserWindow | null) | null = null;
  private statusPollingInterval: ReturnType<typeof setInterval> | null = null;
  private currentInterfaceName = '';
  private currentConfigPath = '';

  constructor() {
    const userData = app.getPath('userData');
    this.config = {
      dataDir: path.join(userData, 'vpn'),
      configDir: path.join(userData, 'vpn', 'configs'),
      binDir: path.join(userData, 'vpn', 'bin'),
      wireguardPath: '',
      importedConfig: null,
      importedConfigRaw: '',
      connectionTimeout: 30000,
    };
    this.loadSavedConfig();
  }

  private loadSavedConfig(): void {
    try {
      const configPath = path.join(this.config.dataDir, 'wg-config.conf');
      const encPath = configPath + '.enc';
      // Prefer encrypted config
      if (fs.existsSync(encPath) && safeStorage.isEncryptionAvailable()) {
        const encrypted = fs.readFileSync(encPath);
        const raw = safeStorage.decryptString(encrypted);
        this.config.importedConfigRaw = raw;
        this.config.importedConfig = this.parseWireGuardConfig(raw);
      } else if (fs.existsSync(configPath)) {
        // Legacy plaintext fallback
        const raw = fs.readFileSync(configPath, 'utf-8');
        this.config.importedConfigRaw = raw;
        this.config.importedConfig = this.parseWireGuardConfig(raw);
        // Re-encrypt on next save
      }
    } catch (err) {
      console.error('[VPN] Failed to load saved config:', err);
    }
  }

  private saveConfig(raw: string): void {
    if (!fs.existsSync(this.config.dataDir)) {
      fs.mkdirSync(this.config.dataDir, { recursive: true });
    }
    const configPath = path.join(this.config.dataDir, 'wg-config.conf');
    // SECURITY: Encrypt WireGuard config (contains private key) before writing to disk
    if (safeStorage.isEncryptionAvailable()) {
      const encrypted = safeStorage.encryptString(raw);
      fs.writeFileSync(configPath + '.enc', encrypted);
      // Remove plaintext if it exists
      if (fs.existsSync(configPath)) fs.unlinkSync(configPath);
    } else {
      // Fallback: write plaintext but log warning
      console.warn('[VPN] safeStorage unavailable — WireGuard config stored in plaintext!');
      fs.writeFileSync(configPath, raw, 'utf-8');
    }
    this.config.importedConfigRaw = raw;
    this.config.importedConfig = this.parseWireGuardConfig(raw);
  }

  parseWireGuardConfig(raw: string): VPNConfigData | null {
    const lines = raw.split('\n').map(l => l.trim()).filter(l => l && !l.startsWith('#'));
    const result: VPNConfigData = {
      privateKey: '',
      address: '',
      dns: [],
      mtu: 1420,
      peers: [],
    };

    let currentSection: 'interface' | 'peer' | null = null;
    let currentPeer: VPNConfigData['peers'][0] | null = null;

    for (const line of lines) {
      const sectionMatch = line.match(/^\[(\w+)\]$/i);
      if (sectionMatch) {
        const section = sectionMatch[1].toLowerCase();
        if (section === 'interface') {
          currentSection = 'interface';
          continue;
        } else if (section === 'peer') {
          currentSection = 'peer';
          if (currentPeer) result.peers.push(currentPeer);
          currentPeer = { publicKey: '', endpoint: '', allowedIps: '0.0.0.0/0', persistentKeepalive: 25 };
          continue;
        }
      }

      const kvMatch = line.match(/^(\w+)\s*=\s*(.+)$/);
      if (!kvMatch) continue;

      const [, key, value] = kvMatch;
      const keyLower = key.toLowerCase();

      if (currentSection === 'interface') {
        switch (keyLower) {
          case 'privatekey': result.privateKey = value.trim(); break;
          case 'address': result.address = value.trim(); break;
          case 'dns': result.dns = value.split(',').map(d => d.trim()).filter(Boolean); break;
          case 'mtu': result.mtu = parseInt(value, 10) || 1420; break;
        }
      } else if (currentSection === 'peer' && currentPeer) {
        switch (keyLower) {
          case 'publickey': currentPeer.publicKey = value.trim(); break;
          case 'endpoint': currentPeer.endpoint = value.trim(); break;
          case 'allowedips': currentPeer.allowedIps = value.trim(); break;
          case 'persistentkeepalive': currentPeer.persistentKeepalive = parseInt(value, 10) || 25; break;
        }
      }
    }

    if (currentPeer) result.peers.push(currentPeer);

    if (!result.privateKey || result.peers.length === 0) return null;
    return result;
  }

  setWindowGetter(getter: () => BrowserWindow | null): void {
    this.windowGetter = getter;
  }

  private emitConnectionFailed(errorMessage: string): void {
    const win = this.windowGetter?.();
    if (win && !win.isDestroyed()) {
      win.webContents.send('vpn:connection-failed', { error: errorMessage });
    }
  }

  async ensureWireGuardBinary(): Promise<void> {
    const binDir = this.config.binDir;
    if (!fs.existsSync(binDir)) {
      fs.mkdirSync(binDir, { recursive: true });
    }

    const wgBinaryName = process.platform === 'win32' ? 'wireguard.exe' : 'wg';
    const wgPath = path.join(binDir, wgBinaryName);

    if (fs.existsSync(wgPath)) {
      this.config.wireguardPath = wgPath;
      return;
    }

    const bundledBinPath = app.isPackaged
      ? path.join(process.resourcesPath, 'bin')
      : path.join(app.getAppPath(), 'bin');

    if (fs.existsSync(path.join(bundledBinPath, wgBinaryName))) {
      try {
        fs.cpSync(bundledBinPath, binDir, { recursive: true });
        this.config.wireguardPath = wgPath;
        return;
      } catch (err) {
        console.error('[VPN] Failed to copy bundled WireGuard binaries:', err);
      }
    }

    throw new Error('WireGuard binary not found. Please install WireGuard and place binaries in bin/ directory.');
  }

  async importConfig(rawConfig: string): Promise<VPNConfigData> {
    const parsed = this.parseWireGuardConfig(rawConfig);
    if (!parsed) {
      throw new Error('Invalid WireGuard config. Must contain [Interface] with PrivateKey and at least one [Peer] with PublicKey and Endpoint.');
    }
    this.saveConfig(rawConfig);
    return parsed;
  }

  getImportedConfig(): VPNConfigData | null {
    return this.config.importedConfig;
  }

  getRawConfig(): string {
    return this.config.importedConfigRaw;
  }

  getConfig(): { raw: string; parsed: VPNConfigData | null } {
    return {
      raw: this.config.importedConfigRaw,
      parsed: this.config.importedConfig,
    };
  }

  clearConfig(): void {
    this.config.importedConfig = null;
    this.config.importedConfigRaw = '';
    const configPath = path.join(this.config.dataDir, 'wg-config.conf');
    if (fs.existsSync(configPath)) {
      try { fs.unlinkSync(configPath); } catch { /* ignore */ }
    }
  }

  private async writeConfigFile(): Promise<string> {
    const parsed = this.config.importedConfig;
    if (!parsed) throw new Error('No WireGuard config imported. Go to Settings → VPN and import a .conf file.');

    if (!fs.existsSync(this.config.configDir)) {
      fs.mkdirSync(this.config.configDir, { recursive: true });
    }

    const config = `[Interface]
PrivateKey = ${parsed.privateKey}
Address = ${parsed.address}
DNS = ${parsed.dns.join(', ')}
MTU = ${parsed.mtu}

${parsed.peers.map(p => `[Peer]
PublicKey = ${p.publicKey}
Endpoint = ${p.endpoint}
AllowedIPs = ${p.allowedIps}
PersistentKeepalive = ${p.persistentKeepalive}`).join('\n\n')}
`;

    const partition = `vpn-${Date.now()}`;
    const configPath = path.join(this.config.configDir, `${partition}.conf`);
    await fs.promises.writeFile(configPath, config);
    return configPath;
  }

  async startWireGuard(configPath: string, partition: string): Promise<void> {
    const wgPath = this.config.wireguardPath;
    const interfaceName = `wg-${partition.replace(/[^a-zA-Z0-9]/g, '')}`;
    this.currentInterfaceName = interfaceName;

    return new Promise<void>((resolve, reject) => {
      const isWin = process.platform === 'win32';

      const args = isWin
        ? ['/installtunnelservice', configPath]
        : ['up', configPath];

      const cmd = isWin ? wgPath : 'wg-quick';

      this.vpnProcess = spawn(cmd, args, {
        stdio: ['ignore', 'pipe', 'pipe'],
      });

      this.vpnProcess.stdout?.on('data', (data: Buffer) => {
        console.log('[VPN]', data.toString());
      });

      this.vpnProcess.stderr?.on('data', (data: Buffer) => {
        console.error('[VPN ERR]', data.toString());
      });

      this.vpnProcess.on('error', (err: NodeJS.ErrnoException) => {
        console.error('WireGuard process error:', err);
        if (!this.isShuttingDown) {
          const msg = err.code === 'ENOENT'
            ? 'WireGuard binary not found. Install WireGuard and place wireguard.exe in the bin/ directory.'
            : `WireGuard error: ${err.message}`;
          this.emitConnectionFailed(msg);
          reject(new Error(msg));
        }
      });

      this.vpnProcess.on('exit', (code: number | null) => {
        console.log('WireGuard exited with code:', code);
        if (this.isShuttingDown) return;
        if (code === 0) {
          resolve();
        } else {
          this.updateStatus({ connected: false });
          const exitMessages: Record<number, string> = {
            1: 'WireGuard configuration error — check your imported config (keys, endpoint, etc.)',
            2: 'WireGuard binary not found or not executable',
            3: 'Network interface creation failed — try running as administrator',
            5: 'Permission denied — run as administrator',
          };
          const msg = exitMessages[code] || `WireGuard process exited with code ${code}`;
          this.emitConnectionFailed(msg);
          reject(new Error(msg));
        }
      });
    }).then(async () => {
      let handshake = false;
      for (let attempt = 0; attempt < 10; attempt++) {
        await new Promise(r => setTimeout(r, 1000));
        handshake = await this.checkHandshake(interfaceName);
        if (handshake) break;
      }

      if (handshake) {
        const endpoint = this.config.importedConfig?.peers[0]?.endpoint || '';
        const endpointHost = endpoint.split(':')[0] || '';
        this.updateStatus({
          connected: true,
          interfaceName,
          localIP: this.extractLocalIP(configPath),
          endpointIP: endpointHost,
          serverName: endpointHost,
          lastHandshake: Date.now(),
        });
      } else {
        throw new Error('WireGuard handshake failed after 10 seconds');
      }
    });
  }

  private async checkHandshake(interfaceName: string): Promise<boolean> {
    try {
      const wgPath = this.config.wireguardPath;
      return new Promise((resolve) => {
        const proc = spawn(wgPath, ['show', interfaceName, 'latest-handshakes'], {
          stdio: ['ignore', 'pipe', 'pipe'],
        });
        let output = '';
        proc.stdout?.on('data', (data: Buffer) => {
          output += data.toString();
        });
        proc.on('exit', () => {
          resolve(output.trim().length > 0);
        });
      });
    } catch {
      return false;
    }
  }

  private extractLocalIP(configPath: string): string {
    try {
      const config = fs.readFileSync(configPath, 'utf-8');
      const match = config.match(/Address\s*=\s*([0-9.]+)/);
      return match ? match[1] : '';
    } catch {
      return '';
    }
  }

  updateStatus(partial: Partial<VPNStatus>): void {
    this.status = { ...this.status, ...partial };
    this.statusCallbacks.forEach((cb) => cb(this.status));
  }

  onStatusChange(cb: (status: VPNStatus) => void): () => void {
    this.statusCallbacks.add(cb);
    return () => this.statusCallbacks.delete(cb);
  }

  getStatus(): VPNStatus {
    return { ...this.status };
  }

  async connect(): Promise<boolean> {
    try {
      this.isShuttingDown = false;

      if (!this.config.importedConfig) {
        throw new Error('No WireGuard config imported. Go to Settings → VPN and import a .conf file.');
      }

      await this.ensureWireGuardBinary();

      const configPath = await this.writeConfigFile();
      this.currentConfigPath = configPath;
      await this.startWireGuard(configPath, `vpn-${Date.now()}`);
      this.startStatusPolling();

      if (this.killSwitchEnabled) {
        this.applyKillSwitch();
      }

      return true;
    } catch (err) {
      console.error('VPN connect failed:', err);
      this.emitConnectionFailed((err as Error).message);
      return false;
    }
  }

  async disconnect(): Promise<boolean> {
    this.isShuttingDown = true;

    if (this.statusPollingInterval) {
      clearInterval(this.statusPollingInterval);
      this.statusPollingInterval = null;
    }

    const wgPath = this.config.wireguardPath;
    const interfaceName = this.currentInterfaceName || this.status.interfaceName;

    if (interfaceName && wgPath && fs.existsSync(wgPath)) {
      const isWin = process.platform === 'win32';
      if (isWin) {
        try {
          const cp = await import('child_process');
          cp.execFileSync(wgPath, ['/uninstalltunnelservice', interfaceName], { timeout: 5000 });
        } catch { /* tunnel may already be stopped */ }
      } else {
        if (this.vpnProcess) {
          this.vpnProcess.kill('SIGTERM');
        }
      }
    }

    if (this.vpnProcess) {
      this.vpnProcess = null;
    }

    if (this.currentConfigPath && fs.existsSync(this.currentConfigPath)) {
      try { fs.unlinkSync(this.currentConfigPath); } catch { /* ignore */ }
    }

    if (this.killSwitchEnabled) {
      this.removeKillSwitch();
    }

    this.currentInterfaceName = '';
    this.currentConfigPath = '';
    this.updateStatus({ connected: false, interfaceName: '', localIP: '', endpointIP: '', serverName: '' });
    return true;
  }

  private startStatusPolling(): void {
    if (this.statusPollingInterval) {
      clearInterval(this.statusPollingInterval);
    }

    this.statusPollingInterval = setInterval(async () => {
      if (this.status.connected && this.vpnProcess) {
        await this.fetchBandwidth();
      }
    }, 5000);
  }

  private async fetchBandwidth(): Promise<void> {
    try {
      if (!this.status.interfaceName) return;

      const wgPath = this.config.wireguardPath;
      const proc = spawn(wgPath, ['show', this.status.interfaceName, 'transfer'], {
        stdio: ['ignore', 'pipe', 'pipe'],
      });

      let output = '';
      proc.stdout?.on('data', (data: Buffer) => {
        output += data.toString();
      });

      proc.on('exit', () => {
        const lines = output.trim().split('\n').filter(Boolean);
        let totalRx = 0;
        let totalTx = 0;
        for (const line of lines) {
          const parts = line.split(/\s+/);
          if (parts.length >= 3) {
            totalRx += parseInt(parts[1], 10) || 0;
            totalTx += parseInt(parts[2], 10) || 0;
          }
        }
        if (totalRx > 0 || totalTx > 0) {
          this.updateStatus({
            bandwidth: {
              up: totalTx,
              down: totalRx,
              total: totalTx + totalRx,
            },
          });
        }
      });
    } catch (err) {
      console.error('Failed to fetch VPN bandwidth:', err);
    }
  }

  isVPNMode(): boolean {
    return this.vpnModeEnabled;
  }

  setVPNMode(enabled: boolean): void {
    this.vpnModeEnabled = enabled;
  }

  isKillSwitchEnabled(): boolean {
    return this.killSwitchEnabled;
  }

  setKillSwitch(enabled: boolean): void {
    this.killSwitchEnabled = enabled;
    if (enabled && this.status.connected) {
      this.applyKillSwitch();
    } else if (!enabled) {
      this.removeKillSwitch();
    }
  }

  private applyKillSwitch(): void {
    session.defaultSession.webRequest.onBeforeRequest(
      { urls: ['<all_urls>'] },
      (details, callback) => {
        if (this.killSwitchEnabled && !this.status.connected) {
          callback({ cancel: true });
        } else {
          callback({ cancel: false });
        }
      }
    );
  }

  private removeKillSwitch(): void {
    session.defaultSession.webRequest.onBeforeRequest(
      { urls: ['<all_urls>'] },
      (_details, callback) => {
        callback({ cancel: false });
      }
    );
  }

  async shutdown(): Promise<void> {
    await this.disconnect();
  }
}

export const vpnManager = new VPNManager();

export function initVPNManager(windowGetter: () => BrowserWindow | null = () => null): void {
  vpnManager.setWindowGetter(windowGetter);
  vpnManager.onStatusChange((status) => {
    const win = windowGetter();
    if (win && !win.isDestroyed()) {
      win.webContents.send('vpn:status-change', status);
    }
  });
}
