"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.vpnManager = exports.VPNManager = void 0;
exports.initVPNManager = initVPNManager;
const electron_1 = require("electron");
const path_1 = __importDefault(require("path"));
const fs_1 = __importDefault(require("fs"));
const child_process_1 = require("child_process");
const crypto_1 = __importDefault(require("crypto"));
class VPNManager {
    constructor() {
        Object.defineProperty(this, "vpnProcess", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: null
        });
        Object.defineProperty(this, "config", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: void 0
        });
        Object.defineProperty(this, "status", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: {
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
            }
        });
        Object.defineProperty(this, "statusCallbacks", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: new Set()
        });
        Object.defineProperty(this, "isShuttingDown", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: false
        });
        Object.defineProperty(this, "vpnModeEnabled", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: false
        });
        Object.defineProperty(this, "killSwitchEnabled", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: true
        });
        Object.defineProperty(this, "windowGetter", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: null
        });
        Object.defineProperty(this, "statusPollingInterval", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: null
        });
        Object.defineProperty(this, "connectionTimeout", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: null
        });
        Object.defineProperty(this, "CONNECTION_TIMEOUT_MS", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: 30000
        });
        const userData = electron_1.app.getPath('userData');
        this.config = {
            dataDir: path_1.default.join(userData, 'vpn'),
            configDir: path_1.default.join(userData, 'vpn', 'configs'),
            binDir: path_1.default.join(userData, 'vpn', 'bin'),
            wireguardPath: '',
            servers: this.getDefaultServers(),
            plans: this.getDefaultPlans(),
            selectedServer: null,
            selectedPlan: this.getDefaultPlans()[0],
            connectionTimeout: 30000,
        };
    }
    getDefaultServers() {
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
    getDefaultPlans() {
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
    setWindowGetter(getter) {
        this.windowGetter = getter;
    }
    emitConnectionFailed(errorMessage) {
        const win = this.windowGetter?.();
        if (win && !win.isDestroyed()) {
            win.webContents.send('vpn:connection-failed', { error: errorMessage });
        }
    }
    async ensureWireGuardBinary() {
        const binDir = this.config.binDir;
        if (!fs_1.default.existsSync(binDir)) {
            fs_1.default.mkdirSync(binDir, { recursive: true });
        }
        const wgBinaryName = process.platform === 'win32' ? 'wireguard.exe' : 'wg';
        const wgPath = path_1.default.join(binDir, wgBinaryName);
        if (fs_1.default.existsSync(wgPath)) {
            this.config.wireguardPath = wgPath;
            return;
        }
        const bundledBinPath = electron_1.app.isPackaged
            ? path_1.default.join(process.resourcesPath, 'bin')
            : path_1.default.join(electron_1.app.getAppPath(), 'bin');
        if (fs_1.default.existsSync(path_1.default.join(bundledBinPath, wgBinaryName))) {
            try {
                fs_1.default.cpSync(bundledBinPath, binDir, { recursive: true });
                this.config.wireguardPath = wgPath;
                return;
            }
            catch (err) {
                console.error('[VPN] Failed to copy bundled WireGuard binaries:', err);
            }
        }
        throw new Error('WireGuard binary not found. Please install WireGuard and place binaries in bin/ directory.');
    }
    async generateWireGuardConfig(server, partition) {
        const configDir = this.config.configDir;
        if (!fs_1.default.existsSync(configDir)) {
            fs_1.default.mkdirSync(configDir, { recursive: true });
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
        const configPath = path_1.default.join(configDir, `${partition}.conf`);
        await fs_1.default.promises.writeFile(configPath, config);
        return configPath;
    }
    generatePrivateKey() {
        return crypto_1.default.randomBytes(32).toString('base64');
    }
    generateLocalIP() {
        const randomBytes = crypto_1.default.randomBytes(2);
        const thirdOctet = (randomBytes[0] % 254) + 1;
        const fourthOctet = (randomBytes[1] % 254) + 1;
        return `10.${thirdOctet}.${fourthOctet}.1`;
    }
    async startWireGuard(configPath, partition) {
        const wgPath = this.config.wireguardPath;
        const interfaceName = `wg-${partition.replace(/[^a-zA-Z0-9]/g, '')}`;
        return new Promise((resolve, reject) => {
            this.vpnProcess = (0, child_process_1.spawn)(wgPath, ['up', configPath, '--interface', interfaceName], {
                stdio: ['ignore', 'pipe', 'pipe'],
            });
            this.vpnProcess.stdout?.on('data', (data) => {
                console.log('[VPN]', data.toString());
            });
            this.vpnProcess.stderr?.on('data', (data) => {
                console.error('[VPN ERR]', data.toString());
            });
            this.vpnProcess.on('error', (err) => {
                console.error('WireGuard process error:', err);
                if (!this.isShuttingDown) {
                    this.emitConnectionFailed(err.message);
                    reject(err);
                }
            });
            this.vpnProcess.on('exit', (code) => {
                console.log('WireGuard exited with code:', code);
                if (this.isShuttingDown)
                    return;
                if (code === 0) {
                    resolve();
                }
                else {
                    this.updateStatus({ connected: false });
                    this.emitConnectionFailed(`WireGuard process exited with code ${code}`);
                    reject(new Error(`WireGuard process exited with code ${code}`));
                }
            });
        }).then(async () => {
            await new Promise((r) => setTimeout(r, 3000));
            const handshake = await this.checkHandshake(interfaceName);
            if (handshake) {
                this.updateStatus({
                    connected: true,
                    interfaceName,
                    localIP: this.extractLocalIP(configPath),
                    endpointIP: this.config.selectedServer?.endpoint.split(':')[0] || '',
                    lastHandshake: Date.now(),
                });
            }
            else {
                throw new Error('WireGuard handshake failed');
            }
        });
    }
    async checkHandshake(interfaceName) {
        try {
            const wgPath = this.config.wireguardPath;
            return new Promise((resolve) => {
                const proc = (0, child_process_1.spawn)(wgPath, ['show', interfaceName, 'latest-handshakes'], {
                    stdio: ['ignore', 'pipe', 'pipe'],
                });
                let output = '';
                proc.stdout?.on('data', (data) => {
                    output += data.toString();
                });
                proc.on('exit', () => {
                    resolve(output.trim().length > 0);
                });
            });
        }
        catch {
            return false;
        }
    }
    extractLocalIP(configPath) {
        try {
            const config = fs_1.default.readFileSync(configPath, 'utf-8');
            const match = config.match(/Address\s*=\s*([0-9.]+)/);
            return match ? match[1] : '';
        }
        catch {
            return '';
        }
    }
    updateStatus(partial) {
        this.status = { ...this.status, ...partial };
        this.statusCallbacks.forEach((cb) => cb(this.status));
    }
    onStatusChange(cb) {
        this.statusCallbacks.add(cb);
        return () => this.statusCallbacks.delete(cb);
    }
    getStatus() {
        return {
            ...this.status,
            currentPlan: this.config.selectedPlan,
        };
    }
    getServers() {
        return this.config.servers;
    }
    getPlans() {
        return this.config.plans;
    }
    getSelectedServer() {
        return this.config.selectedServer;
    }
    getSelectedPlan() {
        return this.config.selectedPlan;
    }
    async setServer(countryCode) {
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
    async setPlan(planId) {
        const plan = this.config.plans.find((p) => p.id === planId);
        if (plan) {
            this.config.selectedPlan = plan;
            this.updateStatus({ currentPlan: plan });
        }
    }
    async connect() {
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
            await this.startWireGuard(configPath, partition);
            this.startStatusPolling();
            return true;
        }
        catch (err) {
            console.error('VPN connect failed:', err);
            this.emitConnectionFailed(err.message);
            return false;
        }
    }
    async disconnect() {
        this.isShuttingDown = true;
        if (this.statusPollingInterval) {
            clearInterval(this.statusPollingInterval);
            this.statusPollingInterval = null;
        }
        if (this.vpnProcess) {
            this.vpnProcess.kill('SIGTERM');
            this.vpnProcess = null;
        }
        this.updateStatus({ connected: false, interfaceName: '', localIP: '', endpointIP: '' });
        return true;
    }
    startStatusPolling() {
        if (this.statusPollingInterval) {
            clearInterval(this.statusPollingInterval);
        }
        this.statusPollingInterval = setInterval(async () => {
            if (this.status.connected && this.vpnProcess) {
                await this.fetchBandwidth();
            }
        }, 5000);
    }
    async fetchBandwidth() {
        try {
            if (!this.status.interfaceName)
                return;
            const wgPath = this.config.wireguardPath;
            const proc = (0, child_process_1.spawn)(wgPath, ['show', this.status.interfaceName, 'transfer'], {
                stdio: ['ignore', 'pipe', 'pipe'],
            });
            let output = '';
            proc.stdout?.on('data', (data) => {
                output += data.toString();
            });
            proc.on('exit', () => {
                const lines = output.trim().split('\n');
                for (const line of lines) {
                    if (line.includes('received') || line.includes('sent')) {
                        const parts = line.split(/\s+/);
                        if (parts.length >= 3) {
                            const received = parseInt(parts[1], 10) || 0;
                            const sent = parseInt(parts[2], 10) || 0;
                            this.updateStatus({
                                bandwidth: {
                                    up: sent,
                                    down: received,
                                    total: sent + received,
                                },
                            });
                        }
                    }
                }
            });
        }
        catch (err) {
            console.error('Failed to fetch VPN bandwidth:', err);
        }
    }
    isVPNMode() {
        return this.vpnModeEnabled;
    }
    setVPNMode(enabled) {
        this.vpnModeEnabled = enabled;
    }
    isKillSwitchEnabled() {
        return this.killSwitchEnabled;
    }
    setKillSwitch(enabled) {
        this.killSwitchEnabled = enabled;
    }
    async shutdown() {
        await this.disconnect();
    }
}
exports.VPNManager = VPNManager;
exports.vpnManager = new VPNManager();
function initVPNManager(windowGetter = () => null) {
    exports.vpnManager.setWindowGetter(windowGetter);
    exports.vpnManager.onStatusChange((status) => {
        const win = windowGetter();
        if (win && !win.isDestroyed()) {
            win.webContents.send('vpn:status-change', status);
        }
    });
}
