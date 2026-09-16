import { app, BrowserWindow, session } from 'electron';
import path from 'path';
import fs from 'fs';
import { spawn } from 'child_process';
import crypto from 'crypto';

export interface VPNServer {
  countryCode: string;
  countryName: string;
  flag: string;
  endpoint: string;
  publicKey: string;
  allowedIps: string;
  dnsServers: string[];
  mtu: number;
  persistentKeepalive: number;
  ping: number;
  uptime: number;
}

export interface VPNPlan {
  id: string;
  name: string;
  currency: string;
  price: number;
  period: 'daily' | 'monthly' | 'yearly';
  dataLimit: number;
  features: string[];
}

export interface VPNStatus {
  connected: boolean;
  countryCode: string;
  countryName: string;
  serverLatency: number;
  bandwidth: { up: number; down: number; total: number };
  currentPlan: VPNPlan | null;
  interfaceName: string;
  localIP: string;
  endpointIP: string;
  lastHandshake: number;
}

interface VPNConfig {
  dataDir: string;
  configDir: string;
  binDir: string;
  wireguardPath: string;
  servers: VPNServer[];
  plans: VPNPlan[];
  selectedServer: VPNServer | null;
  selectedPlan: VPNPlan;
  connectionTimeout: number;
}

export class VPNManager {
  private vpnProcess: ReturnType<typeof spawn> | null = null;
  private config: VPNConfig;
  private status: VPNStatus = {
    connected: false,
    countryCode: '',
    countryName: '',
    serverLatency: 0,
    bandwidth: { up: 0, down: 0, total: 0 },
    currentPlan: null,
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
  private connectionTimeout: ReturnType<typeof setTimeout> | null = null;
  private CONNECTION_TIMEOUT_MS = 30000;
  private currentInterfaceName = '';
  private currentConfigPath = '';

  constructor() {
    const userData = app.getPath('userData');
    this.config = {
      dataDir: path.join(userData, 'vpn'),
      configDir: path.join(userData, 'vpn', 'configs'),
      binDir: path.join(userData, 'vpn', 'bin'),
      wireguardPath: '',
      servers: this.getDefaultServers(),
      plans: this.getDefaultPlans(),
      selectedServer: null,
      selectedPlan: this.getDefaultPlans()[0],
      connectionTimeout: 30000,
    };
  }

  private getDefaultServers(): VPNServer[] {
    return [
      {
        countryCode: 'us',
        countryName: 'United States',
        flag: '\uD83C\uDDFA\uD83C\uDDF8',
        endpoint: 'us.wireguard.example.com:51820',
        publicKey: 'US_SERVER_PUBLIC_KEY_PLACEHOLDER',
        allowedIps: '0.0.0.0/0',
        dnsServers: ['1.1.1.1', '8.8.8.8'],
        mtu: 1420,
        persistentKeepalive: 25,
        ping: 45,
        uptime: 99.9,
      },
      {
        countryCode: 'de',
        countryName: 'Germany',
        flag: '\uD83C\uDDE9\uD83C\uDDEA',
        endpoint: 'de.wireguard.example.com:51820',
        publicKey: 'DE_SERVER_PUBLIC_KEY_PLACEHOLDER',
        allowedIps: '0.0.0.0/0',
        dnsServers: ['1.1.1.1', '8.8.8.8'],
        mtu: 1420,
        persistentKeepalive: 25,
        ping: 25,
        uptime: 99.9,
      },
      {
        countryCode: 'nl',
        countryName: 'Netherlands',
        flag: '\uD83C\uDDF3\uD83C\uDDF1',
        endpoint: 'nl.wireguard.example.com:51820',
        publicKey: 'NL_SERVER_PUBLIC_KEY_PLACEHOLDER',
        allowedIps: '0.0.0.0/0',
        dnsServers: ['1.1.1.1', '8.8.8.8'],
        mtu: 1420,
        persistentKeepalive: 25,
        ping: 20,
        uptime: 99.9,
      },
      {
        countryCode: 'sg',
        countryName: 'Singapore',
        flag: '\uD83C\uDDF8\uD83C\uDDEC',
        endpoint: 'sg.wireguard.example.com:51820',
        publicKey: 'SG_SERVER_PUBLIC_KEY_PLACEHOLDER',
        allowedIps: '0.0.0.0/0',
        dnsServers: ['1.1.1.1', '8.8.8.8'],
        mtu: 1420,
        persistentKeepalive: 25,
        ping: 180,
        uptime: 99.5,
      },
      {
        countryCode: 'jp',
        countryName: 'Japan',
        flag: '\uD83C\uDDEF\uD83C\uDDF5',
        endpoint: 'jp.wireguard.example.com:51820',
        publicKey: 'JP_SERVER_PUBLIC_KEY_PLACEHOLDER',
        allowedIps: '0.0.0.0/0',
        dnsServers: ['1.1.1.1', '8.8.8.8'],
        mtu: 1420,
        persistentKeepalive: 25,
        ping: 160,
        uptime: 99.5,
      },
      {
        countryCode: 'ch',
        countryName: 'Switzerland',
        flag: '\uD83C\uDDE8\uD83C\uDDED',
        endpoint: 'ch.wireguard.example.com:51820',
        publicKey: 'CH_SERVER_PUBLIC_KEY_PLACEHOLDER',
        allowedIps: '0.0.0.0/0',
        dnsServers: ['1.1.1.1', '8.8.8.8'],
        mtu: 1420,
        persistentKeepalive: 25,
        ping: 30,
        uptime: 99.9,
      },
    ];
  }

  private getDefaultPlans(): VPNPlan[] {
    return [
      {
        id: 'free',
        name: 'Free',
        currency: 'USD',
        price: 0,
        period: 'daily',
        dataLimit: 1024,
        features: ['1GB/day', '3 locations', 'Standard speed'],
      },
      {
        id: 'basic',
        name: 'Basic',
        currency: 'USD',
        price: 4.99,
        period: 'monthly',
        dataLimit: 51200,
        features: ['50GB/month', 'All locations', 'High speed', 'No logs'],
      },
      {
        id: 'pro',
        name: 'Pro',
        currency: 'USD',
        price: 9.99,
        period: 'monthly',
        dataLimit: 0,
        features: ['Unlimited data', 'All locations', 'Max speed', 'No logs', 'Multi-hop'],
      },
    ];
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

  async generateWireGuardConfig(server: VPNServer, partition: string): Promise<string> {
    const configDir = this.config.configDir;
    if (!fs.existsSync(configDir)) {
      fs.mkdirSync(configDir, { recursive: true });
    }

    const privateKey = this.generatePrivateKey();
    const localIP = this.generateLocalIP();

    const config = `[Interface]
PrivateKey = ${privateKey}
Address = ${localIP}/24
DNS = ${server.dnsServers.join(', ')}
MTU = ${server.mtu}

[Peer]
PublicKey = ${server.publicKey}
Endpoint = ${server.endpoint}
AllowedIPs = ${server.allowedIps}
PersistentKeepalive = ${server.persistentKeepalive}
`;

    const configPath = path.join(configDir, `${partition}.conf`);
    await fs.promises.writeFile(configPath, config);
    return configPath;
  }

  private generatePrivateKey(): string {
    return crypto.randomBytes(32).toString('base64');
  }

  private generateLocalIP(): string {
    const randomBytes = crypto.randomBytes(2);
    const thirdOctet = (randomBytes[0] % 254) + 1;
    const fourthOctet = (randomBytes[1] % 254) + 1;
    return `10.${thirdOctet}.${fourthOctet}.1`;
  }

  async startWireGuard(configPath: string, partition: string): Promise<void> {
    const wgPath = this.config.wireguardPath;
    const interfaceName = `wg-${partition.replace(/[^a-zA-Z0-9]/g, '')}`;
    this.currentInterfaceName = interfaceName;

    return new Promise<void>((resolve, reject) => {
      const isWin = process.platform === 'win32';

      // Windows: wireguard.exe /installtunnelservice <configPath>
      // Linux/macOS: wg-quick up <configPath>
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

      this.vpnProcess.on('error', (err: Error) => {
        console.error('WireGuard process error:', err);
        if (!this.isShuttingDown) {
          this.emitConnectionFailed(err.message);
          reject(err);
        }
      });

      this.vpnProcess.on('exit', (code: number | null) => {
        console.log('WireGuard exited with code:', code);
        if (this.isShuttingDown) return;
        if (code === 0) {
          resolve();
        } else {
          this.updateStatus({ connected: false });
          this.emitConnectionFailed(`WireGuard process exited with code ${code}`);
          reject(new Error(`WireGuard process exited with code ${code}`));
        }
      });
    }).then(async () => {
      // Poll for handshake instead of fixed sleep
      let handshake = false;
      for (let attempt = 0; attempt < 10; attempt++) {
        await new Promise(r => setTimeout(r, 1000));
        handshake = await this.checkHandshake(interfaceName);
        if (handshake) break;
      }

      if (handshake) {
        this.updateStatus({
          connected: true,
          interfaceName,
          localIP: this.extractLocalIP(configPath),
          endpointIP: this.config.selectedServer?.endpoint.split(':')[0] || '',
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
    return {
      ...this.status,
      currentPlan: this.config.selectedPlan,
    };
  }

  getServers(): VPNServer[] {
    return this.config.servers;
  }

  getPlans(): VPNPlan[] {
    return this.config.plans;
  }

  getSelectedServer(): VPNServer | null {
    return this.config.selectedServer;
  }

  getSelectedPlan(): VPNPlan {
    return this.config.selectedPlan;
  }

  async setServer(countryCode: string): Promise<void> {
    const server = this.config.servers.find((s) => s.countryCode === countryCode);
    if (server) {
      this.config.selectedServer = server;
      this.updateStatus({
        countryCode: server.countryCode,
        countryName: server.countryName,
        serverLatency: server.ping,
      });
    }
  }

  async setPlan(planId: string): Promise<void> {
    const plan = this.config.plans.find((p) => p.id === planId);
    if (plan) {
      this.config.selectedPlan = plan;
      this.updateStatus({ currentPlan: plan });
    }
  }

  async connect(): Promise<boolean> {
    try {
      this.isShuttingDown = false;
      await this.ensureWireGuardBinary();

      if (!this.config.selectedServer) {
        throw new Error('No server selected. Please choose a country first.');
      }

      if (!this.config.selectedPlan) {
        throw new Error('No plan selected.');
      }

      const partition = `vpn-${Date.now()}`;
      const configPath = await this.generateWireGuardConfig(this.config.selectedServer, partition);
      this.currentConfigPath = configPath;
      await this.startWireGuard(configPath, partition);
      this.startStatusPolling();

      // Apply kill switch if enabled
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
        // Windows: wireguard.exe /uninstalltunnelservice <interfaceName>
        try {
          const cp = await import('child_process');
          cp.execFileSync(wgPath, ['/uninstalltunnelservice', interfaceName], { timeout: 5000 });
        } catch { /* tunnel may already be stopped */ }
      } else {
        // Linux/macOS: wg-quick down <configPath> — kill the process for now
        if (this.vpnProcess) {
          this.vpnProcess.kill('SIGTERM');
        }
      }
    }

    if (this.vpnProcess) {
      this.vpnProcess = null;
    }

    // Clean up config file
    if (this.currentConfigPath && fs.existsSync(this.currentConfigPath)) {
      try { fs.unlinkSync(this.currentConfigPath); } catch { /* ignore */ }
    }

    // Remove kill switch interceptor if active
    if (this.killSwitchEnabled) {
      this.removeKillSwitch();
    }

    this.currentInterfaceName = '';
    this.currentConfigPath = '';
    this.updateStatus({ connected: false, interfaceName: '', localIP: '', endpointIP: '' });
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
        // Format: <public_key>\t<bytes-received>\t<bytes-sent> (one line per peer)
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
    // When VPN drops with kill switch on, block all web requests
    session.defaultSession.webRequest.onBeforeRequest(
      { urls: ['<all_urls>'] },
      (details, callback) => {
        if (this.killSwitchEnabled && !this.status.connected) {
          // Kill switch active and VPN is down — block request
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
