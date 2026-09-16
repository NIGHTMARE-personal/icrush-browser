"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.proxyManager = exports.ProxyManager = void 0;
exports.initProxyManager = initProxyManager;
const electron_1 = require("electron");
const path_1 = __importDefault(require("path"));
const fs_1 = __importDefault(require("fs"));
const net_1 = __importDefault(require("net"));
const STORAGE_KEY = 'icrush-proxy-config';
class ProxyManager {
    constructor() {
        Object.defineProperty(this, "proxies", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: []
        });
        Object.defineProperty(this, "activeProxyId", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: null
        });
        Object.defineProperty(this, "directMode", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: true
        });
        Object.defineProperty(this, "status", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: {
                active: false,
                proxy: null,
                directMode: true,
                proxyLatency: 0,
                externalIP: '',
            }
        });
        Object.defineProperty(this, "statusCallbacks", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: new Set()
        });
        Object.defineProperty(this, "windowGetter", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: null
        });
        this.loadConfig();
    }
    setWindowGetter(getter) {
        this.windowGetter = getter;
    }
    onStatusChange(cb) {
        this.statusCallbacks.add(cb);
        return () => this.statusCallbacks.delete(cb);
    }
    emitStatus() {
        this.statusCallbacks.forEach(cb => cb(this.getStatus()));
    }
    emitConnectionFailed(error) {
        const win = this.windowGetter?.();
        if (win && !win.isDestroyed()) {
            win.webContents.send('proxy:connection-failed', { error });
        }
    }
    loadConfig() {
        try {
            const configPath = path_1.default.join(electron_1.app.getPath('userData'), 'proxy-config.json');
            if (fs_1.default.existsSync(configPath)) {
                const data = JSON.parse(fs_1.default.readFileSync(configPath, 'utf-8'));
                this.proxies = data.proxies || [];
                this.activeProxyId = data.activeProxyId;
                this.directMode = data.directMode !== false;
                this.updateStatusFromConfig();
            }
        }
        catch {
            // Ignore
        }
    }
    saveConfig() {
        try {
            const configPath = path_1.default.join(electron_1.app.getPath('userData'), 'proxy-config.json');
            const data = {
                proxies: this.proxies,
                activeProxyId: this.activeProxyId,
                directMode: this.directMode,
            };
            fs_1.default.writeFileSync(configPath, JSON.stringify(data, null, 2));
        }
        catch {
            // Ignore
        }
    }
    updateStatusFromConfig() {
        const activeProxy = this.activeProxyId
            ? this.proxies.find(p => p.id === this.activeProxyId) || null
            : null;
        this.status = {
            active: !this.directMode && !!activeProxy,
            proxy: activeProxy,
            directMode: this.directMode,
            proxyLatency: this.status.proxyLatency,
            externalIP: this.status.externalIP,
        };
    }
    getProxyRule(proxy) {
        const protocol = proxy.type === 'socks5' || proxy.type === 'socks5h' ? proxy.type : proxy.type;
        return `${protocol}://${proxy.host}:${proxy.port}`;
    }
    getProxyForSession(proxy) {
        return {
            proxyRules: this.getProxyRule(proxy),
        };
    }
    async testProxy(proxy) {
        const startTime = Date.now();
        return new Promise(resolve => {
            const timeout = setTimeout(() => {
                socket.destroy();
                resolve({ success: false, latency: 0, ip: '', error: 'Connection timeout (5s)' });
            }, 5000);
            const socket = net_1.default.createConnection({
                host: proxy.host,
                port: proxy.port,
            }, () => {
                const latency = Date.now() - startTime;
                clearTimeout(timeout);
                socket.destroy();
                // For SOCKS5, do a full handshake + connect test
                if (proxy.type === 'socks5' || proxy.type === 'socks5h') {
                    this.testSocks5(proxy, startTime).then(result => {
                        resolve(result);
                    });
                }
                else {
                    resolve({ success: true, latency, ip: proxy.host });
                }
            });
            socket.on('error', (err) => {
                clearTimeout(timeout);
                resolve({ success: false, latency: 0, ip: '', error: err.message });
            });
        });
    }
    async testSocks5(proxy, startTime) {
        return new Promise(resolve => {
            const timeout = setTimeout(() => {
                socket.destroy();
                resolve({ success: false, latency: 0, ip: '', error: 'SOCKS5 handshake timeout' });
            }, 5000);
            const socket = net_1.default.createConnection({
                host: proxy.host,
                port: proxy.port,
            });
            let step = 0;
            let buffer = Buffer.alloc(0);
            socket.on('connect', () => {
                // SOCKS5 greeting: version 5, 1 auth method (no auth)
                socket.write(Buffer.from([0x05, 0x01, 0x00]));
            });
            socket.on('data', (data) => {
                buffer = Buffer.concat([buffer, data]);
                if (step === 0 && buffer.length >= 2) {
                    // Greeting response
                    if (buffer[0] !== 0x05 || buffer[1] !== 0x00) {
                        clearTimeout(timeout);
                        socket.destroy();
                        resolve({ success: false, latency: 0, ip: '', error: `SOCKS5 auth failed: ${buffer[1]}` });
                        return;
                    }
                    step = 1;
                    buffer = buffer.subarray(2);
                    // SOCKS5 CONNECT request to checkmyip
                    const connectReq = Buffer.alloc(10);
                    connectReq[0] = 0x05; // version
                    connectReq[1] = 0x01; // CONNECT
                    connectReq[2] = 0x00; // reserved
                    connectReq[3] = 0x03; // DOMAINNAME
                    const domain = 'api.ipify.org';
                    connectReq[4] = domain.length;
                    connectReq.write(domain, 5, 'ascii');
                    connectReq.writeUInt16BE(80, 5 + domain.length); // port 80
                    socket.write(connectReq);
                }
                else if (step === 1 && buffer.length >= 4) {
                    // CONNECT response
                    if (buffer[1] === 0x00) {
                        const latency = Date.now() - startTime;
                        clearTimeout(timeout);
                        socket.destroy();
                        // For a proper test, fetch external IP via HTTP
                        this.fetchExternalIPViaProxy(proxy).then(ip => {
                            resolve({ success: true, latency, ip: ip || proxy.host });
                        });
                    }
                    else {
                        clearTimeout(timeout);
                        socket.destroy();
                        resolve({ success: false, latency: 0, ip: '', error: `SOCKS5 connect failed: code ${buffer[1]}` });
                    }
                }
            });
            socket.on('error', (err) => {
                clearTimeout(timeout);
                resolve({ success: false, latency: 0, ip: '', error: err.message });
            });
        });
    }
    async fetchExternalIPViaProxy(_proxy) {
        // Skip external IP check for now — basic connectivity is verified by SOCKS5 handshake
        return '';
    }
    // Alias for getSocksProxy compatibility with existing torManager pattern
    getSocksProxy() {
        if (this.directMode || !this.status.proxy)
            return 'direct://';
        return this.getProxyRule(this.status.proxy);
    }
    getStatus() {
        return { ...this.status };
    }
    getProxies() {
        return [...this.proxies];
    }
    getActiveProxy() {
        return this.status.proxy;
    }
    isDirectMode() {
        return this.directMode;
    }
    async addProxy(config) {
        const proxy = {
            ...config,
            id: `proxy-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        };
        this.proxies.push(proxy);
        this.saveConfig();
        return proxy;
    }
    async updateProxy(id, updates) {
        const idx = this.proxies.findIndex(p => p.id === id);
        if (idx === -1)
            return false;
        this.proxies[idx] = { ...this.proxies[idx], ...updates };
        if (this.activeProxyId === id) {
            this.updateStatusFromConfig();
            this.emitStatus();
        }
        this.saveConfig();
        return true;
    }
    async removeProxy(id) {
        const idx = this.proxies.findIndex(p => p.id === id);
        if (idx === -1)
            return false;
        this.proxies.splice(idx, 1);
        if (this.activeProxyId === id) {
            this.activeProxyId = null;
            this.directMode = true;
            this.updateStatusFromConfig();
            await this.applyToAllSessions();
            this.emitStatus();
        }
        this.saveConfig();
        return true;
    }
    async setActiveProxy(id) {
        if (id && !this.proxies.find(p => p.id === id))
            return false;
        this.activeProxyId = id;
        this.directMode = !id;
        this.updateStatusFromConfig();
        await this.applyToAllSessions();
        this.emitStatus();
        return true;
    }
    async setDirectMode(direct) {
        this.directMode = direct;
        if (direct) {
            this.activeProxyId = null;
        }
        this.updateStatusFromConfig();
        await this.applyToAllSessions();
        this.emitStatus();
    }
    async applyToAllSessions() {
        const defaultSession = electron_1.session.defaultSession;
        if (this.directMode || !this.status.proxy) {
            await defaultSession.setProxy({ mode: 'direct' });
            console.log('[Proxy] Direct mode applied to default session');
        }
        else {
            await defaultSession.setProxy(this.getProxyForSession(this.status.proxy));
            console.log(`[Proxy] Proxy ${this.status.proxy.name} applied to default session`);
        }
    }
    async applyToPartition(partition) {
        try {
            const sess = partition.startsWith('persist:') || partition.startsWith('incognito-')
                ? electron_1.session.fromPartition(partition)
                : electron_1.session.fromPartition(`persist:${partition}`);
            if (this.directMode || !this.status.proxy) {
                await sess.setProxy({ mode: 'direct' });
            }
            else {
                await sess.setProxy(this.getProxyForSession(this.status.proxy));
            }
            return true;
        }
        catch (err) {
            console.error(`[Proxy] Failed to apply proxy to partition ${partition}:`, err);
            return false;
        }
    }
    async connectProxy(id) {
        const proxy = this.proxies.find(p => p.id === id);
        if (!proxy) {
            this.emitConnectionFailed('Proxy not found');
            return false;
        }
        console.log(`[Proxy] Connecting to proxy: ${proxy.name} (${proxy.type}://${proxy.host}:${proxy.port})`);
        const testResult = await this.testProxy(proxy);
        if (!testResult.success) {
            this.emitConnectionFailed(`Proxy ${proxy.name} failed: ${testResult.error}`);
            return false;
        }
        this.status.proxyLatency = testResult.latency;
        this.status.externalIP = testResult.ip;
        this.activeProxyId = id;
        this.directMode = false;
        this.updateStatusFromConfig();
        this.status.proxyLatency = testResult.latency;
        this.status.externalIP = testResult.ip;
        await this.applyToAllSessions();
        this.emitStatus();
        this.saveConfig();
        console.log(`[Proxy] Connected to ${proxy.name}, IP: ${testResult.ip}, latency: ${testResult.latency}ms`);
        return true;
    }
    async disconnectProxy() {
        this.directMode = true;
        this.activeProxyId = null;
        this.updateStatusFromConfig();
        await this.applyToAllSessions();
        this.emitStatus();
        this.saveConfig();
        console.log('[Proxy] Disconnected, now in direct mode');
        return true;
    }
    async connect() {
        if (!this.activeProxyId)
            return false;
        return this.connectProxy(this.activeProxyId);
    }
    async disconnect() {
        return this.disconnectProxy();
    }
}
exports.ProxyManager = ProxyManager;
exports.proxyManager = new ProxyManager();
function initProxyManager(windowGetter = () => null) {
    exports.proxyManager.setWindowGetter(windowGetter);
    exports.proxyManager.onStatusChange((status) => {
        const win = windowGetter();
        if (win && !win.isDestroyed()) {
            win.webContents.send('proxy:status-change', status);
        }
    });
}
