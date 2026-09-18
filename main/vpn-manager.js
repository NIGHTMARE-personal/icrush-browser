"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
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
                serverName: '',
                serverLatency: 0,
                bandwidth: { up: 0, down: 0, total: 0 },
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
        Object.defineProperty(this, "currentInterfaceName", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: ''
        });
        Object.defineProperty(this, "currentConfigPath", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: ''
        });
        const userData = electron_1.app.getPath('userData');
        this.config = {
            dataDir: path_1.default.join(userData, 'vpn'),
            configDir: path_1.default.join(userData, 'vpn', 'configs'),
            binDir: path_1.default.join(userData, 'vpn', 'bin'),
            wireguardPath: '',
            importedConfig: null,
            importedConfigRaw: '',
            connectionTimeout: 30000,
        };
        this.loadSavedConfig();
    }
    loadSavedConfig() {
        try {
            const configPath = path_1.default.join(this.config.dataDir, 'wg-config.conf');
            const encPath = configPath + '.enc';
            // Prefer encrypted config
            if (fs_1.default.existsSync(encPath) && electron_1.safeStorage.isEncryptionAvailable()) {
                const encrypted = fs_1.default.readFileSync(encPath);
                const raw = electron_1.safeStorage.decryptString(encrypted);
                this.config.importedConfigRaw = raw;
                this.config.importedConfig = this.parseWireGuardConfig(raw);
            }
            else if (fs_1.default.existsSync(configPath)) {
                // Legacy plaintext fallback
                const raw = fs_1.default.readFileSync(configPath, 'utf-8');
                this.config.importedConfigRaw = raw;
                this.config.importedConfig = this.parseWireGuardConfig(raw);
                // Re-encrypt on next save
            }
        }
        catch (err) {
            console.error('[VPN] Failed to load saved config:', err);
        }
    }
    saveConfig(raw) {
        if (!fs_1.default.existsSync(this.config.dataDir)) {
            fs_1.default.mkdirSync(this.config.dataDir, { recursive: true });
        }
        const configPath = path_1.default.join(this.config.dataDir, 'wg-config.conf');
        // SECURITY: Encrypt WireGuard config (contains private key) before writing to disk
        if (electron_1.safeStorage.isEncryptionAvailable()) {
            const encrypted = electron_1.safeStorage.encryptString(raw);
            fs_1.default.writeFileSync(configPath + '.enc', encrypted);
            // Remove plaintext if it exists
            if (fs_1.default.existsSync(configPath))
                fs_1.default.unlinkSync(configPath);
        }
        else {
            // Fallback: write plaintext but log warning
            console.warn('[VPN] safeStorage unavailable — WireGuard config stored in plaintext!');
            fs_1.default.writeFileSync(configPath, raw, 'utf-8');
        }
        this.config.importedConfigRaw = raw;
        this.config.importedConfig = this.parseWireGuardConfig(raw);
    }
    parseWireGuardConfig(raw) {
        const lines = raw.split('\n').map(l => l.trim()).filter(l => l && !l.startsWith('#'));
        const result = {
            privateKey: '',
            address: '',
            dns: [],
            mtu: 1420,
            peers: [],
        };
        let currentSection = null;
        let currentPeer = null;
        for (const line of lines) {
            const sectionMatch = line.match(/^\[(\w+)\]$/i);
            if (sectionMatch) {
                const section = sectionMatch[1].toLowerCase();
                if (section === 'interface') {
                    currentSection = 'interface';
                    continue;
                }
                else if (section === 'peer') {
                    currentSection = 'peer';
                    if (currentPeer)
                        result.peers.push(currentPeer);
                    currentPeer = { publicKey: '', endpoint: '', allowedIps: '0.0.0.0/0', persistentKeepalive: 25 };
                    continue;
                }
            }
            const kvMatch = line.match(/^(\w+)\s*=\s*(.+)$/);
            if (!kvMatch)
                continue;
            const [, key, value] = kvMatch;
            const keyLower = key.toLowerCase();
            if (currentSection === 'interface') {
                switch (keyLower) {
                    case 'privatekey':
                        result.privateKey = value.trim();
                        break;
                    case 'address':
                        result.address = value.trim();
                        break;
                    case 'dns':
                        result.dns = value.split(',').map(d => d.trim()).filter(Boolean);
                        break;
                    case 'mtu':
                        result.mtu = parseInt(value, 10) || 1420;
                        break;
                }
            }
            else if (currentSection === 'peer' && currentPeer) {
                switch (keyLower) {
                    case 'publickey':
                        currentPeer.publicKey = value.trim();
                        break;
                    case 'endpoint':
                        currentPeer.endpoint = value.trim();
                        break;
                    case 'allowedips':
                        currentPeer.allowedIps = value.trim();
                        break;
                    case 'persistentkeepalive':
                        currentPeer.persistentKeepalive = parseInt(value, 10) || 25;
                        break;
                }
            }
        }
        if (currentPeer)
            result.peers.push(currentPeer);
        if (!result.privateKey || result.peers.length === 0)
            return null;
        return result;
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
    async importConfig(rawConfig) {
        const parsed = this.parseWireGuardConfig(rawConfig);
        if (!parsed) {
            throw new Error('Invalid WireGuard config. Must contain [Interface] with PrivateKey and at least one [Peer] with PublicKey and Endpoint.');
        }
        this.saveConfig(rawConfig);
        return parsed;
    }
    getImportedConfig() {
        return this.config.importedConfig;
    }
    getRawConfig() {
        return this.config.importedConfigRaw;
    }
    getConfig() {
        return {
            raw: this.config.importedConfigRaw,
            parsed: this.config.importedConfig,
        };
    }
    clearConfig() {
        this.config.importedConfig = null;
        this.config.importedConfigRaw = '';
        const configPath = path_1.default.join(this.config.dataDir, 'wg-config.conf');
        if (fs_1.default.existsSync(configPath)) {
            try {
                fs_1.default.unlinkSync(configPath);
            }
            catch { /* ignore */ }
        }
    }
    async writeConfigFile() {
        const parsed = this.config.importedConfig;
        if (!parsed)
            throw new Error('No WireGuard config imported. Go to Settings → VPN and import a .conf file.');
        if (!fs_1.default.existsSync(this.config.configDir)) {
            fs_1.default.mkdirSync(this.config.configDir, { recursive: true });
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
        const configPath = path_1.default.join(this.config.configDir, `${partition}.conf`);
        await fs_1.default.promises.writeFile(configPath, config);
        return configPath;
    }
    async startWireGuard(configPath, partition) {
        const wgPath = this.config.wireguardPath;
        const interfaceName = `wg-${partition.replace(/[^a-zA-Z0-9]/g, '')}`;
        this.currentInterfaceName = interfaceName;
        return new Promise((resolve, reject) => {
            const isWin = process.platform === 'win32';
            const args = isWin
                ? ['/installtunnelservice', configPath]
                : ['up', configPath];
            const cmd = isWin ? wgPath : 'wg-quick';
            this.vpnProcess = (0, child_process_1.spawn)(cmd, args, {
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
                    const msg = err.code === 'ENOENT'
                        ? 'WireGuard binary not found. Install WireGuard and place wireguard.exe in the bin/ directory.'
                        : `WireGuard error: ${err.message}`;
                    this.emitConnectionFailed(msg);
                    reject(new Error(msg));
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
                    const exitMessages = {
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
                if (handshake)
                    break;
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
            }
            else {
                throw new Error('WireGuard handshake failed after 10 seconds');
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
        return { ...this.status };
    }
    async connect() {
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
        const wgPath = this.config.wireguardPath;
        const interfaceName = this.currentInterfaceName || this.status.interfaceName;
        if (interfaceName && wgPath && fs_1.default.existsSync(wgPath)) {
            const isWin = process.platform === 'win32';
            if (isWin) {
                try {
                    const cp = await Promise.resolve().then(() => __importStar(require('child_process')));
                    cp.execFileSync(wgPath, ['/uninstalltunnelservice', interfaceName], { timeout: 5000 });
                }
                catch { /* tunnel may already be stopped */ }
            }
            else {
                if (this.vpnProcess) {
                    this.vpnProcess.kill('SIGTERM');
                }
            }
        }
        if (this.vpnProcess) {
            this.vpnProcess = null;
        }
        if (this.currentConfigPath && fs_1.default.existsSync(this.currentConfigPath)) {
            try {
                fs_1.default.unlinkSync(this.currentConfigPath);
            }
            catch { /* ignore */ }
        }
        if (this.killSwitchEnabled) {
            this.removeKillSwitch();
        }
        this.currentInterfaceName = '';
        this.currentConfigPath = '';
        this.updateStatus({ connected: false, interfaceName: '', localIP: '', endpointIP: '', serverName: '' });
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
        if (enabled && this.status.connected) {
            this.applyKillSwitch();
        }
        else if (!enabled) {
            this.removeKillSwitch();
        }
    }
    applyKillSwitch() {
        electron_1.session.defaultSession.webRequest.onBeforeRequest({ urls: ['<all_urls>'] }, (details, callback) => {
            if (this.killSwitchEnabled && !this.status.connected) {
                callback({ cancel: true });
            }
            else {
                callback({ cancel: false });
            }
        });
    }
    removeKillSwitch() {
        electron_1.session.defaultSession.webRequest.onBeforeRequest({ urls: ['<all_urls>'] }, (_details, callback) => {
            callback({ cancel: false });
        });
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
