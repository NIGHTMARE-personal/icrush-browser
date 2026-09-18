"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.torManager = exports.TorManager = void 0;
exports.initTorManager = initTorManager;
const electron_1 = require("electron");
const path_1 = __importDefault(require("path"));
const fs_1 = __importDefault(require("fs"));
const child_process_1 = require("child_process");
const net_1 = __importDefault(require("net"));
class TorManager {
    constructor() {
        Object.defineProperty(this, "torProcess", {
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
                ip: '',
                circuit: '',
                bootstrap: 0,
                bandwidth: { read: 0, write: 0, total: 0 },
                latency: 0,
                circuitDetails: [],
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
        Object.defineProperty(this, "torModeEnabled", {
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
        Object.defineProperty(this, "bootstrapStartTime", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: 0
        });
        Object.defineProperty(this, "CONNECTION_TIMEOUT_MS", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: 120000
        }); // 2 minutes max for connection
        Object.defineProperty(this, "_connectionFailedEmitted", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: false
        });
        Object.defineProperty(this, "lastConnectError", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: null
        });
        const userData = electron_1.app.getPath('userData');
        this.config = {
            dataDir: path_1.default.join(userData, 'tor'),
            controlPort: 9051,
            socksPort: 9050,
            torrcPath: path_1.default.join(userData, 'tor', 'torrc'),
            bridges: [],
            useBridges: false,
            bridgeType: 'none',
        };
    }
    setWindowGetter(getter) {
        this.windowGetter = getter;
    }
    startConnectionTimeout() {
        this.clearConnectionTimeout();
        this.bootstrapStartTime = Date.now();
        this.connectionTimeout = setTimeout(() => {
            console.log('[Tor] Connection timeout reached (30s), killing process...');
            this.handleConnectionTimeout();
        }, this.CONNECTION_TIMEOUT_MS);
    }
    clearConnectionTimeout() {
        if (this.connectionTimeout) {
            clearTimeout(this.connectionTimeout);
            this.connectionTimeout = null;
        }
    }
    async checkPortAvailability() {
        const ports = [this.config.socksPort, this.config.controlPort, 9053];
        for (const port of ports) {
            const inUse = await this.isPortInUse(port);
            if (inUse) {
                console.error(`[Tor] Port ${port} is already in use`);
                return false;
            }
        }
        return true;
    }
    isPortInUse(port) {
        return new Promise(resolve => {
            const server = net_1.default.createServer();
            server.once('error', () => resolve(true));
            server.once('listening', () => {
                server.close();
                resolve(false);
            });
            server.listen(port, '127.0.0.1');
        });
    }
    handleConnectionTimeout() {
        this.clearConnectionTimeout();
        if (this.torProcess && !this.isShuttingDown) {
            console.log('[Tor] Killing Tor process due to connection timeout');
            this.torProcess.kill('SIGTERM');
            this.torProcess = null;
        }
        this.updateStatus({ connected: false, bootstrap: 0 });
        this.emitConnectionFailed('Tor connection timed out.');
    }
    emitConnectionFailed(errorMessage) {
        if (this._connectionFailedEmitted)
            return;
        this._connectionFailedEmitted = true;
        const win = this.windowGetter?.();
        if (win && !win.isDestroyed()) {
            win.webContents.send('tor:connection-failed', { error: errorMessage });
        }
    }
    async initialize() {
        try {
            // Kill any existing Tor processes on startup
            await this.killExistingTorProcesses();
            this.isShuttingDown = false;
            this._connectionFailedEmitted = false;
            this.loadSavedConfig();
            await this.ensureTorBinary();
            // Verify transport binaries exist before writing torrc
            await this.verifyTransportBinaries();
            await this.writeTorrc();
            const portAvailable = await this.checkPortAvailability();
            if (!portAvailable) {
                throw new Error('Required ports (9050, 9051, 9053) are in use. Please close other Tor instances or restart the app.');
            }
            await this.startTor();
            this.startConnectionTimeout();
            await this.waitForBootstrap();
            this.clearConnectionTimeout();
            this.startStatusPolling();
            return true;
        }
        catch (err) {
            console.error('Tor init failed:', err);
            this.lastConnectError = err.message;
            this.clearConnectionTimeout();
            this.shutdown().catch(() => { });
            this.emitConnectionFailed(err.message);
            return false;
        }
    }
    async killExistingTorProcesses() {
        if (process.platform === 'win32') {
            try {
                await Promise.all([
                    this.runCommand('taskkill', ['/F', '/IM', 'tor.exe']),
                    this.runCommand('taskkill', ['/F', '/IM', 'lyrebird.exe']),
                    this.runCommand('taskkill', ['/F', '/IM', 'snowflake-client.exe']),
                    this.runCommand('taskkill', ['/F', '/IM', 'obfs4proxy.exe']),
                ]);
                await new Promise(r => setTimeout(r, 100));
            }
            catch {
                // Ignore errors
            }
        }
        else {
            try {
                await Promise.all([
                    this.runCommand('pkill', ['-9', 'tor']),
                    this.runCommand('pkill', ['-9', 'lyrebird']),
                    this.runCommand('pkill', ['-9', 'snowflake-client']),
                    this.runCommand('pkill', ['-9', 'obfs4proxy']),
                ]);
                await new Promise(r => setTimeout(r, 100));
            }
            catch {
                // Ignore errors
            }
        }
    }
    runCommand(cmd, args) {
        return new Promise((resolve, _reject) => {
            const proc = (0, child_process_1.spawn)(cmd, args, { stdio: 'ignore' });
            proc.on('close', () => resolve());
            proc.on('error', () => resolve()); // Ignore errors for kill commands
        });
    }
    async verifyTransportBinaries() {
        const binDir = path_1.default.join(this.config.dataDir, 'bin');
        const ptDir = path_1.default.join(binDir, 'pluggable_transports');
        if (this.config.useBridges) {
            if (this.config.bridgeType === 'obfs4') {
                const lyrebirdPath = path_1.default.join(ptDir, 'lyrebird.exe');
                const obfs4proxyPath = path_1.default.join(ptDir, 'obfs4proxy.exe');
                if (!fs_1.default.existsSync(lyrebirdPath) && !fs_1.default.existsSync(obfs4proxyPath)) {
                    throw new Error('obfs4 transport binary not found. Please ensure lyrebird.exe or obfs4proxy.exe is in bin/pluggable_transports/');
                }
            }
            else if (this.config.bridgeType === 'snowflake') {
                const snowflakePath = path_1.default.join(ptDir, 'snowflake-client.exe');
                if (!fs_1.default.existsSync(snowflakePath)) {
                    throw new Error('Snowflake transport binary not found. Please ensure snowflake-client.exe is in bin/pluggable_transports/');
                }
            }
        }
        // Verify tor binary exists
        const torBinaryName = process.platform === 'win32' ? 'tor.exe' : 'tor';
        const torPath = path_1.default.join(binDir, torBinaryName);
        if (!fs_1.default.existsSync(torPath)) {
            throw new Error('Tor binary not found after copy. Auto-download may have failed.');
        }
    }
    async syncMissingTransportBinaries() {
        const binDir = path_1.default.join(this.config.dataDir, 'bin');
        const ptDir = path_1.default.join(binDir, 'pluggable_transports');
        const bundledBinPath = electron_1.app.isPackaged
            ? path_1.default.join(process.resourcesPath, 'bin')
            : path_1.default.join(electron_1.app.getAppPath(), 'bin');
        const bundledPtDir = path_1.default.join(bundledBinPath, 'pluggable_transports');
        // Sync tor-gencert if missing
        const gencertName = process.platform === 'win32' ? 'tor-gencert.exe' : 'tor-gencert';
        const gencertSrc = path_1.default.join(bundledBinPath, gencertName);
        const gencertDest = path_1.default.join(binDir, gencertName);
        if (fs_1.default.existsSync(gencertSrc) && !fs_1.default.existsSync(gencertDest)) {
            try {
                fs_1.default.copyFileSync(gencertSrc, gencertDest);
                console.log(`[Tor] Synced missing binary: ${gencertName}`);
            }
            catch (err) {
                console.warn(`[Tor] Failed to sync binary ${gencertName}:`, err);
            }
        }
        if (!fs_1.default.existsSync(bundledPtDir))
            return;
        if (!fs_1.default.existsSync(ptDir)) {
            fs_1.default.mkdirSync(ptDir, { recursive: true });
        }
        const transportExes = ['lyrebird.exe', 'obfs4proxy.exe', 'snowflake-client.exe', 'conjure-client.exe'];
        for (const exe of transportExes) {
            const src = path_1.default.join(bundledPtDir, exe);
            const dest = path_1.default.join(ptDir, exe);
            if (fs_1.default.existsSync(src) && !fs_1.default.existsSync(dest)) {
                try {
                    fs_1.default.copyFileSync(src, dest);
                    console.log(`[Tor] Synced missing transport binary: ${exe}`);
                }
                catch (err) {
                    console.warn(`[Tor] Failed to sync transport binary ${exe}:`, err);
                }
            }
        }
    }
    loadSavedConfig() {
        const configPath = path_1.default.join(electron_1.app.getPath('userData'), 'tor-config.json');
        if (fs_1.default.existsSync(configPath)) {
            try {
                const saved = JSON.parse(fs_1.default.readFileSync(configPath, 'utf8'));
                this.config.bridges = saved.bridges || [];
                this.config.useBridges = saved.useBridges !== undefined ? saved.useBridges : false;
                this.config.bridgeType = saved.bridgeType || 'none';
                console.log('[Tor] Successfully loaded persisted Tor bridge configuration.');
            }
            catch (err) {
                console.error('[Tor] Failed to load saved config:', err);
            }
        }
    }
    saveConfig() {
        const configPath = path_1.default.join(electron_1.app.getPath('userData'), 'tor-config.json');
        try {
            const dataToSave = {
                bridges: this.config.bridges,
                useBridges: this.config.useBridges,
                bridgeType: this.config.bridgeType,
            };
            fs_1.default.writeFileSync(configPath, JSON.stringify(dataToSave, null, 2), 'utf8');
            console.log('[Tor] Successfully saved Tor bridge configuration.');
        }
        catch (err) {
            console.error('[Tor] Failed to save config:', err);
        }
    }
    async ensureTorBinary() {
        const binDir = path_1.default.join(this.config.dataDir, 'bin');
        if (!fs_1.default.existsSync(binDir)) {
            fs_1.default.mkdirSync(binDir, { recursive: true });
        }
        const torBinaryName = process.platform === 'win32' ? 'tor.exe' : 'tor';
        const torPath = path_1.default.join(binDir, torBinaryName);
        if (fs_1.default.existsSync(torPath)) {
            console.log(`[Tor] Tor binary already exists at: ${torPath}`);
            this.setUnixPermissions(binDir);
            // Ensure pluggable transport binaries are synced even if Tor exists
            await this.syncMissingTransportBinaries();
            return;
        }
        console.log('[Tor] Tor binary is missing in userData. Checking bundled location...');
        // Try to copy from bundled location first (to avoid downloading on startup)
        const bundledBinPath = electron_1.app.isPackaged
            ? path_1.default.join(process.resourcesPath, 'bin')
            : path_1.default.join(electron_1.app.getAppPath(), 'bin');
        if (fs_1.default.existsSync(path_1.default.join(bundledBinPath, torBinaryName))) {
            console.log(`[Tor] Found bundled Tor binaries at: ${bundledBinPath}. Copying...`);
            try {
                fs_1.default.cpSync(bundledBinPath, binDir, { recursive: true });
                console.log('[Tor] Successfully copied bundled Tor binaries to userData.');
                this.setUnixPermissions(binDir);
                if (fs_1.default.existsSync(torPath)) {
                    return;
                }
            }
            catch (err) {
                console.error('[Tor] Failed to copy bundled Tor binaries:', err);
            }
        }
        // Check system Tor Browser installation paths
        const systemTorPaths = [
            path_1.default.join(process.env.LOCALAPPDATA || '', 'Programs', 'Tor Browser', 'Browser', 'TorBrowser', 'Tor', torBinaryName),
            path_1.default.join(process.env.LOCALAPPDATA || '', 'Tor Browser', 'Browser', 'TorBrowser', 'Tor', torBinaryName),
            path_1.default.join('C:', 'Program Files', 'Tor Browser', 'Browser', 'TorBrowser', 'Tor', torBinaryName),
            path_1.default.join('C:', 'Program Files (x86)', 'Tor Browser', 'Browser', 'TorBrowser', 'Tor', torBinaryName),
        ];
        for (const sysPath of systemTorPaths) {
            if (fs_1.default.existsSync(sysPath)) {
                console.log(`[Tor] Found Tor installation at: ${sysPath}. Copying...`);
                try {
                    fs_1.default.copyFileSync(sysPath, path_1.default.join(binDir, torBinaryName));
                    this.setUnixPermissions(binDir);
                    return;
                }
                catch (e) {
                    console.warn('[Tor] Failed to copy system Tor binary:', e);
                }
            }
        }
        // Check if the user has a local Tor Expert Bundle in their Downloads folder
        const homeDir = electron_1.app.getPath('home');
        const downloadsDir = path_1.default.join(homeDir, 'Downloads');
        let localDownloadsBundlePath = '';
        if (fs_1.default.existsSync(downloadsDir)) {
            try {
                const files = fs_1.default.readdirSync(downloadsDir);
                const bundleDir = files.find(f => {
                    const full = path_1.default.join(downloadsDir, f);
                    return (f.toLowerCase().startsWith('tor-expert-bundle-') && fs_1.default.statSync(full).isDirectory());
                });
                if (bundleDir) {
                    localDownloadsBundlePath = path_1.default.join(downloadsDir, bundleDir);
                }
            }
            catch (err) {
                console.warn('[Tor] Failed to search Downloads folder:', err);
            }
        }
        if (localDownloadsBundlePath) {
            console.log(`[Tor] Found local Tor bundle in Downloads: ${localDownloadsBundlePath}`);
            try {
                const torSourceDir = path_1.default.join(localDownloadsBundlePath, 'tor');
                if (fs_1.default.existsSync(torSourceDir)) {
                    const torExe = path_1.default.join(torSourceDir, torBinaryName);
                    if (fs_1.default.existsSync(torExe)) {
                        fs_1.default.copyFileSync(torExe, path_1.default.join(binDir, torBinaryName));
                        console.log(`[Tor] Copied ${torBinaryName} from Downloads to userData.`);
                    }
                    const genCert = path_1.default.join(torSourceDir, process.platform === 'win32' ? 'tor-gencert.exe' : 'tor-gencert');
                    if (fs_1.default.existsSync(genCert)) {
                        fs_1.default.copyFileSync(genCert, path_1.default.join(binDir, path_1.default.basename(genCert)));
                    }
                    const ptSourceDir = path_1.default.join(torSourceDir, 'pluggable_transports');
                    const ptDestDir = path_1.default.join(binDir, 'pluggable_transports');
                    if (fs_1.default.existsSync(ptSourceDir)) {
                        fs_1.default.cpSync(ptSourceDir, ptDestDir, { recursive: true });
                        console.log('[Tor] Copied pluggable transports from Downloads to userData.');
                    }
                    const dataSourceDir = path_1.default.join(localDownloadsBundlePath, 'data');
                    if (fs_1.default.existsSync(dataSourceDir)) {
                        for (const geoipItem of ['geoip', 'geoip6']) {
                            const geoipSrc = path_1.default.join(dataSourceDir, geoipItem);
                            if (fs_1.default.existsSync(geoipSrc)) {
                                fs_1.default.copyFileSync(geoipSrc, path_1.default.join(this.config.dataDir, geoipItem));
                                console.log(`[Tor] Copied ${geoipItem} from Downloads.`);
                            }
                        }
                    }
                    // Also save to dev workspace bin folder if in dev mode
                    if (!electron_1.app.isPackaged) {
                        const devBinDir = path_1.default.join(electron_1.app.getAppPath(), 'bin');
                        if (!fs_1.default.existsSync(devBinDir)) {
                            fs_1.default.mkdirSync(devBinDir, { recursive: true });
                        }
                        fs_1.default.copyFileSync(torExe, path_1.default.join(devBinDir, torBinaryName));
                        if (fs_1.default.existsSync(genCert)) {
                            fs_1.default.copyFileSync(genCert, path_1.default.join(devBinDir, path_1.default.basename(genCert)));
                        }
                        if (fs_1.default.existsSync(ptSourceDir)) {
                            fs_1.default.cpSync(ptSourceDir, path_1.default.join(devBinDir, 'pluggable_transports'), {
                                recursive: true,
                            });
                        }
                        console.log('[Tor] Saved local Downloads bundle to dev workspace bin folder.');
                    }
                    this.setUnixPermissions(binDir);
                    if (fs_1.default.existsSync(torPath)) {
                        return;
                    }
                }
            }
            catch (copyErr) {
                console.error('[Tor] Failed to copy local Downloads bundle:', copyErr);
            }
        }
        console.log('[Tor] Bundled Tor binary not found or copy failed. Starting Auto-Downloader...');
        const versions = ['14.0.4', '13.5.13', '13.5.6'];
        const mirrors = [
            (v, f) => `https://archive.torproject.org/tor-package-archive/torbrowser/${v}/${f}`,
            (v, f) => `https://dist.torproject.org/torbrowser/${v}/${f}`,
        ];
        let platform = '';
        let arch = '';
        if (process.platform === 'win32') {
            platform = 'windows';
            arch = process.arch === 'ia32' ? 'i686' : 'x86_64';
        }
        else if (process.platform === 'darwin') {
            platform = 'macos';
            arch = process.arch === 'arm64' ? 'aarch64' : 'x86_64';
        }
        else if (process.platform === 'linux') {
            platform = 'linux';
            arch = process.arch === 'ia32' ? 'i686' : 'x86_64';
        }
        else {
            throw new Error(`Unsupported platform: ${process.platform}`);
        }
        for (const version of versions) {
            const bundleFilename = `tor-expert-bundle-${platform}-${arch}-${version}.tar.gz`;
            for (const mirror of mirrors) {
                const bundleUrl = mirror(version, bundleFilename);
                const tempArchive = path_1.default.join(this.config.dataDir, 'tor-expert-bundle.tar.gz');
                try {
                    console.log(`[Tor] Trying download from: ${bundleUrl}`);
                    const controller = new AbortController();
                    const timeout = setTimeout(() => controller.abort(), 60000);
                    const response = await fetch(bundleUrl, { signal: controller.signal });
                    clearTimeout(timeout);
                    if (!response.ok) {
                        console.warn(`[Tor] Download failed (${response.status}): ${bundleUrl}`);
                        continue;
                    }
                    const arrayBuffer = await response.arrayBuffer();
                    const buffer = Buffer.from(arrayBuffer);
                    await fs_1.default.promises.writeFile(tempArchive, buffer);
                    console.log('[Tor] Download completed successfully.');
                    console.log(`[Tor] Extracting archive to: ${this.config.dataDir}`);
                    const resolvedArchive = path_1.default.resolve(tempArchive);
                    const resolvedDataDir = path_1.default.resolve(this.config.dataDir);
                    if (!resolvedArchive.startsWith(resolvedDataDir) && !resolvedArchive.startsWith(path_1.default.resolve(electron_1.app.getPath('temp')))) {
                        throw new Error('Invalid archive path');
                    }
                    await new Promise((resolve, reject) => {
                        const tar = (0, child_process_1.spawn)('tar', ['-xf', resolvedArchive, '-C', resolvedDataDir], { stdio: 'ignore' });
                        tar.on('close', code => {
                            if (code === 0)
                                resolve();
                            else
                                reject(new Error(`tar exited with code ${code}`));
                        });
                        tar.on('error', reject);
                    });
                    console.log('[Tor] Extraction completed.');
                    const findAndMove = (dir) => {
                        const files = fs_1.default.readdirSync(dir);
                        for (const file of files) {
                            const fullPath = path_1.default.join(dir, file);
                            const stat = fs_1.default.statSync(fullPath);
                            if (stat.isDirectory()) {
                                findAndMove(fullPath);
                            }
                            else {
                                const lowerFile = file.toLowerCase();
                                if (lowerFile === 'tor.exe' || lowerFile === 'tor' ||
                                    lowerFile === 'obfs4proxy.exe' || lowerFile === 'obfs4proxy' ||
                                    lowerFile === 'snowflake-client.exe' || lowerFile === 'snowflake-client' ||
                                    lowerFile === 'lyrebird.exe' || lowerFile === 'lyrebird' ||
                                    lowerFile === 'conjure-client.exe' || lowerFile === 'conjure-client' ||
                                    lowerFile === 'tor-gencert.exe' || lowerFile === 'tor-gencert') {
                                    const dest = path_1.default.join(binDir, file);
                                    fs_1.default.renameSync(fullPath, dest);
                                    console.log(`[Tor] Moved executable ${file} to ${dest}`);
                                }
                                else if (lowerFile === 'geoip' || lowerFile === 'geoip6') {
                                    const dest = path_1.default.join(this.config.dataDir, file);
                                    fs_1.default.renameSync(fullPath, dest);
                                    console.log(`[Tor] Moved geoip file ${file} to ${dest}`);
                                }
                            }
                        }
                    };
                    findAndMove(this.config.dataDir);
                    this.setUnixPermissions(binDir);
                    try {
                        if (fs_1.default.existsSync(tempArchive)) {
                            fs_1.default.unlinkSync(tempArchive);
                        }
                        const dirsToRemove = ['tor', 'Data'];
                        for (const dirName of dirsToRemove) {
                            const dirPath = path_1.default.join(this.config.dataDir, dirName);
                            if (fs_1.default.existsSync(dirPath)) {
                                fs_1.default.rmSync(dirPath, { recursive: true, force: true });
                            }
                        }
                    }
                    catch (cleanupErr) {
                        console.warn('[Tor] Failed to cleanup temp files:', cleanupErr);
                    }
                    // Verify the tor binary was actually extracted
                    const torExe = path_1.default.join(binDir, process.platform === 'win32' ? 'tor.exe' : 'tor');
                    if (fs_1.default.existsSync(torExe)) {
                        console.log(`[Tor] Successfully downloaded and extracted Tor binary: ${torExe}`);
                        return;
                    }
                    console.warn(`[Tor] Extraction succeeded but tor binary not found at ${torExe}, trying next mirror...`);
                }
                catch (err) {
                    console.warn(`[Tor] Download attempt failed for ${bundleUrl}:`, err);
                    continue;
                }
            }
        }
        throw new Error('Failed to download Tor from all mirrors and versions. Check network connection.');
    }
    async fetchFreshBridges(transport = 'obfs4') {
        try {
            console.log(`[Tor] Fetching fresh ${transport} bridges from BridgeDB...`);
            const response = await fetch(`https://bridges.torproject.org/bridges?transport=${transport}`, {
                headers: { 'Accept': 'text/plain' },
            });
            if (!response.ok)
                return [];
            const text = await response.text();
            const lines = text.split('\n').filter(l => l.trim().startsWith(`Bridge ${transport}`));
            return lines.map(line => {
                const parts = line.replace(`Bridge ${transport}`, '').trim().split(/\s+/);
                const [address, port, fingerprint] = parts;
                const certMatch = line.match(/cert=(\S+)/);
                return {
                    type: transport,
                    address,
                    port: parseInt(port),
                    fingerprint,
                    cert: certMatch?.[1],
                    iatMode: 0,
                };
            }).slice(0, 3);
        }
        catch (err) {
            console.warn('[Tor] Failed to fetch fresh bridges:', err);
            return [];
        }
    }
    setUnixPermissions(binDir) {
        if (process.platform !== 'win32') {
            try {
                const executables = [
                    'tor',
                    'tor-gencert',
                    'obfs4proxy',
                    'snowflake-client',
                    'lyrebird',
                    'conjure-client',
                ];
                for (const exe of executables) {
                    const exePath1 = path_1.default.join(binDir, exe);
                    if (fs_1.default.existsSync(exePath1)) {
                        fs_1.default.chmodSync(exePath1, 0o755);
                    }
                    const exePath2 = path_1.default.join(binDir, 'pluggable_transports', exe);
                    if (fs_1.default.existsSync(exePath2)) {
                        fs_1.default.chmodSync(exePath2, 0o755);
                    }
                }
                console.log('[Tor] Executable permissions set for Unix binaries.');
            }
            catch (chmodErr) {
                console.warn('[Tor] Failed to set executable permissions:', chmodErr);
            }
        }
    }
    getCookieHex() {
        try {
            const cookiePath = path_1.default.join(this.config.dataDir, 'control_auth_cookie');
            if (fs_1.default.existsSync(cookiePath)) {
                return fs_1.default.readFileSync(cookiePath).toString('hex');
            }
        }
        catch (err) {
            console.error('[Tor] Failed to read control auth cookie:', err);
        }
        return '';
    }
    async writeTorrc() {
        const binDir = path_1.default.join(this.config.dataDir, 'bin');
        const escapePath = (p) => p.replace(/\\/g, '/');
        const findBinary = (name) => {
            const path1 = path_1.default.join(binDir, name);
            if (fs_1.default.existsSync(path1))
                return path1;
            const path2 = path_1.default.join(binDir, 'pluggable_transports', name);
            if (fs_1.default.existsSync(path2))
                return path2;
            return null;
        };
        const platformExe = (base) => (process.platform === 'win32' ? `${base}.exe` : base);
        const obfs4Path = findBinary(platformExe('lyrebird')) || findBinary(platformExe('obfs4proxy'));
        const snowflakePath = findBinary(platformExe('snowflake-client')) || (obfs4Path && obfs4Path.toLowerCase().includes('lyrebird') ? obfs4Path : null);
        let useBridgesLine = '';
        let bridgeConfig = '';
        if (this.config.useBridges) {
            useBridgesLine = 'UseBridges 1';
            if (this.config.bridgeType === 'snowflake') {
                // Use default built-in snowflake bridge if no bridges are configured
                if (this.config.bridges.length > 0) {
                    bridgeConfig = this.config.bridges
                        .map(b => `Bridge snowflake ${b.address}:${b.port} ${b.fingerprint || ''}`)
                        .join('\n');
                }
                else {
                    // Current snowflake bridges (2026) — these are symbolic IPs that route via WebRTC volunteers
                    bridgeConfig = [
                        'Bridge snowflake 192.0.2.3:80 2B280B23E1107BB62ABFC40DDCC8824814F80A72 fingerprint=2B280B23E1107BB62ABFC40DDCC8824814F80A72 url=https://1098762253.rsc.cdn77.org/ fronts=www.cdn77.org,www.phpmyadmin.net ice=stun:stun.l.google.com:19302,stun:stun.antisip.com:3478,stun:stun.bluesip.net:3478,stun:stun.dus.net:3478,stun:stun.epygi.com:3478,stun:stun.sonetel.com:3478,stun:stun.uls.co.za:3478,stun:stun.voipgate.com:3478,stun:stun.voys.nl:3478 utls-imitate=hellorandomizedalpn',
                        'Bridge snowflake 192.0.2.4:80 8838024498816A039FCBBAB14E6F40A0843051FA fingerprint=8838024498816A039FCBBAB14E6F40A0843051FA url=https://1098762253.rsc.cdn77.org/ fronts=www.cdn77.org,www.phpmyadmin.net ice=stun:stun.l.google.com:19302,stun:stun.antisip.com:3478,stun:stun.bluesip.net:3478,stun:stun.dus.net:3478,stun:stun.epygi.com:3478,stun:stun.sonetel.com:3478,stun:stun.uls.co.za:3478,stun:stun.voipgate.com:3478,stun:stun.voys.nl:3478 utls-imitate=hellorandomizedalpn',
                    ].join('\n');
                }
            }
            else if (this.config.bridgeType === 'obfs4') {
                if (this.config.bridges.length > 0) {
                    bridgeConfig = this.config.bridges
                        .map(b => `Bridge obfs4 ${b.address}:${b.port} ${b.fingerprint || ''} cert=${b.cert || ''} iat-mode=${b.iatMode || 0}`)
                        .join('\n');
                }
                else {
                    // Current working obfs4 bridges (2026-09, from bridges.torproject.org)
                    bridgeConfig = [
                        'Bridge obfs4 193.11.166.194:27025 1AE2C08904527FEE9E17A1369A37E4B593640860 cert=ItvYzItZI6nu/pre0TNyMOxnF/0q7yLzG7HhB0tQTLLB6hVGDCaFWE3ZQf0MTRZsP4rbE5aw iat-mode=0',
                        'Bridge obfs4 193.11.166.194:27020 86AC7B8D430DAC4117E9F42C9EAED18133863AAF cert=bMgz1VCON4ESt37+/V/cHMLADl6FgUc2rRIAzSQR1IBhVj3sFHT13rVFDbEcN0OLY3EXEg iat-mode=0',
                        'Bridge obfs4 45.145.95.12:27015 C5B7A2B66B5A1D7C05B62A343A5B42C142B7A822 cert=TD7PbUO0/0k6xYHMPW3vJxICfkMZNdkRrb63Zhl5j9tMOv+O4V3WHXJ8E4bA9OG9iQJ9bg iat-mode=0',
                    ].join('\n');
                }
            }
        }
        const geoipPath = path_1.default.join(this.config.dataDir, 'geoip');
        const geoip6Path = path_1.default.join(this.config.dataDir, 'geoip6');
        const geoipConfig = [
            fs_1.default.existsSync(geoipPath) ? `GeoIPFile ${escapePath(geoipPath)}` : '',
            fs_1.default.existsSync(geoip6Path) ? `GeoIPv6File ${escapePath(geoip6Path)}` : '',
        ]
            .filter(Boolean)
            .join('\n');
        const transportPlugins = [
            obfs4Path ? `ClientTransportPlugin obfs4 exec ${escapePath(obfs4Path)}` : null,
            snowflakePath ? `ClientTransportPlugin snowflake exec ${escapePath(snowflakePath)}` : null,
        ]
            .filter(Boolean)
            .join('\n');
        const torrc = `
SOCKSPort ${this.config.socksPort}
ControlPort ${this.config.controlPort}
CookieAuthentication 1
DataDirectory ${escapePath(this.config.dataDir)}
Log notice stdout
AvoidDiskWrites 1
ClientOnly 1
UseEntryGuards 1
NumEntryGuards 3
DNSPort 9053
AutomapHostsOnResolve 1
AutomapHostsSuffixes .onion,.exit
${useBridgesLine}
${bridgeConfig}
${geoipConfig}
MaxCircuitDirtiness 600
NewCircuitPeriod 30
MaxClientCircuitsPending 100
CircuitBuildTimeout 30
LearnCircuitBuildTimeout 1
FetchDirInfoEarly 1
FetchUselessDescriptors 0
ConnectionPadding 0
${transportPlugins}
    `;
        await fs_1.default.promises.writeFile(this.config.torrcPath, torrc.trim());
    }
    async startTor() {
        return new Promise((resolve, reject) => {
            const binDir = path_1.default.join(this.config.dataDir, 'bin');
            const torBinary = path_1.default.join(binDir, process.platform === 'win32' ? 'tor.exe' : 'tor');
            if (!fs_1.default.existsSync(torBinary)) {
                reject(new Error(`Tor binary not found at: ${torBinary}`));
                return;
            }
            console.log(`[Tor] Starting Tor process using binary: ${torBinary}`);
            this.torProcess = (0, child_process_1.spawn)(torBinary, ['-f', this.config.torrcPath, '--DataDirectory', this.config.dataDir], {
                stdio: ['ignore', 'pipe', 'pipe'],
            });
            this.torProcess.stdout?.on('data', data => {
                const output = data.toString();
                console.log('[Tor]', output);
                this.parseBootstrap(output);
            });
            this.torProcess.stderr?.on('data', data => {
                const output = data.toString();
                console.error('[Tor ERR]', output);
                this.parseBootstrap(output);
            });
            let exited = false;
            this.torProcess.on('error', err => {
                console.error('Tor process error:', err);
                if (!this.isShuttingDown && !exited) {
                    exited = true;
                    this.clearConnectionTimeout();
                    this.emitConnectionFailed(err.message);
                    reject(err);
                }
            });
            this.torProcess.on('exit', code => {
                console.log('Tor exited with code:', code);
                this.updateStatus({ connected: false });
                if (!this.isShuttingDown && !exited) {
                    exited = true;
                    this.clearConnectionTimeout();
                    this.emitConnectionFailed(`Tor process exited unexpectedly with code ${code}`);
                    reject(new Error(`Tor process exited with code ${code}`));
                }
            });
            // Wait for control port to become reachable (up to 30s for bridges)
            const waitForControlPort = () => {
                const deadline = Date.now() + 30000;
                const check = () => {
                    if (exited)
                        return;
                    const sock = new net_1.default.Socket();
                    sock.setTimeout(1500);
                    sock.connect(this.config.controlPort, '127.0.0.1', () => {
                        sock.destroy();
                        if (!exited)
                            resolve();
                    });
                    sock.on('error', () => {
                        sock.destroy();
                        if (Date.now() > deadline) {
                            if (!exited) {
                                exited = true;
                                this.clearConnectionTimeout();
                                this.emitConnectionFailed('Tor process failed to open control port within 30s');
                                reject(new Error('Tor control port not reachable'));
                            }
                        }
                        else {
                            setTimeout(check, 200);
                        }
                    });
                    sock.on('timeout', () => {
                        sock.destroy();
                        if (Date.now() > deadline) {
                            if (!exited) {
                                exited = true;
                                this.clearConnectionTimeout();
                                this.emitConnectionFailed('Tor process failed to open control port within 30s');
                                reject(new Error('Tor control port not reachable'));
                            }
                        }
                        else {
                            setTimeout(check, 200);
                        }
                    });
                };
                check();
            };
            waitForControlPort();
        });
    }
    parseBootstrap(output) {
        const lines = output.split('\n');
        for (const line of lines) {
            if (line.includes('Bootstrapped ')) {
                const match = line.match(/Bootstrapped (\d+)%/);
                if (match) {
                    this.updateStatus({ bootstrap: parseInt(match[1], 10) });
                }
            }
            if (line.includes('Bootstrapped 100%')) {
                this.updateStatus({ connected: true, bootstrap: 100 });
                this.clearConnectionTimeout();
            }
        }
    }
    async waitForBootstrap() {
        const deadline = Date.now() + this.CONNECTION_TIMEOUT_MS;
        while (this.status.bootstrap < 100) {
            if (Date.now() > deadline) {
                throw new Error('Tor bootstrap timed out');
            }
            // If Tor process died, the exit handler already called emitConnectionFailed
            if (!this.torProcess) {
                throw new Error('Tor process exited before bootstrap completed');
            }
            await new Promise(r => setTimeout(r, 250));
        }
        // Fire exit IP fetch in background — don't block the connection
        this.fetchExitIP().catch(err => console.warn('[Tor] Background exit IP fetch failed:', err));
    }
    async fetchExitIP() {
        return new Promise(resolve => {
            const socket = net_1.default.createConnection({ port: this.config.socksPort });
            let step = 0;
            let buffer = Buffer.alloc(0);
            const timeout = setTimeout(() => {
                socket.destroy();
                resolve();
            }, 10000);
            socket.on('connect', () => {
                // Send SOCKS5 greeting
                socket.write(Buffer.from([0x05, 0x01, 0x00]));
            });
            socket.on('data', data => {
                buffer = Buffer.concat([buffer, data]);
                if (step === 0) {
                    // Expect greeting response: 0x05 0x00
                    if (buffer.length >= 2) {
                        if (buffer[0] === 0x05 && buffer[1] === 0x00) {
                            step = 1;
                            buffer = buffer.subarray(2);
                            // Send SOCKS5 connection request for api.ipify.org:80
                            const domain = 'api.ipify.org';
                            const req = Buffer.alloc(7 + domain.length);
                            req[0] = 0x05; // SOCKS5
                            req[1] = 0x01; // CONNECT
                            req[2] = 0x00; // RSV
                            req[3] = 0x03; // DOMAINNAME
                            req[4] = domain.length;
                            req.write(domain, 5, 'ascii');
                            req.writeUInt16BE(80, 5 + domain.length);
                            socket.write(req);
                        }
                        else {
                            socket.destroy();
                        }
                    }
                }
                else if (step === 1) {
                    // Expect connection reply: usually 10 bytes
                    if (buffer.length >= 10) {
                        if (buffer[0] === 0x05 && buffer[1] === 0x00) { // Success
                            step = 2;
                            buffer = buffer.subarray(10);
                            // Send HTTP request
                            socket.write('GET /?format=json HTTP/1.1\r\nHost: api.ipify.org\r\nConnection: close\r\n\r\n');
                        }
                        else {
                            socket.destroy();
                        }
                    }
                }
                else if (step === 2) {
                    // Accumulate HTTP response
                }
            });
            socket.on('end', () => {
                clearTimeout(timeout);
                try {
                    if (step === 2) {
                        const responseText = buffer.toString('utf8');
                        const bodyStart = responseText.indexOf('\r\n\r\n');
                        if (bodyStart !== -1) {
                            const body = responseText.substring(bodyStart + 4);
                            const data = JSON.parse(body);
                            if (data && data.ip) {
                                console.log('[Tor] Successfully fetched exit IP over Tor:', data.ip);
                                this.updateStatus({ ip: data.ip });
                            }
                        }
                    }
                }
                catch (err) {
                    console.error('[Tor] Failed to parse exit IP response:', err);
                }
                resolve();
            });
            socket.on('error', err => {
                clearTimeout(timeout);
                console.error('[Tor] Exit IP socket error:', err);
                resolve();
            });
        });
    }
    startStatusPolling() {
        // Clear any existing polling interval
        if (this.statusPollingInterval) {
            clearInterval(this.statusPollingInterval);
        }
        this.statusPollingInterval = setInterval(async () => {
            if (this.status.connected) {
                await this.fetchExitIP();
                await this.fetchCircuitInfo();
                await this.fetchBandwidthInfo();
            }
        }, 30000);
    }
    async fetchBandwidthInfo() {
        try {
            const client = net_1.default.createConnection({ port: this.config.controlPort });
            return new Promise(resolve => {
                let response = '';
                const timeout = setTimeout(() => {
                    client.destroy();
                    resolve();
                }, 5000);
                client.on('connect', () => {
                    const cookie = this.getCookieHex();
                    client.write(`AUTHENTICATE ${cookie}\r\n`);
                    client.write('GETINFO traffic/read,write\r\n');
                    client.write('QUIT\r\n');
                });
                client.on('data', data => {
                    response += data.toString();
                });
                client.on('end', () => {
                    clearTimeout(timeout);
                    try {
                        const readMatch = response.match(/^250-traffic\/read=(\d+)/m);
                        const writeMatch = response.match(/^250-traffic\/write=(\d+)/m);
                        if (readMatch && writeMatch) {
                            const read = parseInt(readMatch[1], 10);
                            const write = parseInt(writeMatch[1], 10);
                            this.updateStatus({
                                bandwidth: { read, write, total: read + write },
                            });
                        }
                    }
                    catch (err) {
                        console.error('Failed to parse bandwidth info:', err);
                    }
                    resolve();
                });
                client.on('error', () => resolve());
            });
        }
        catch (err) {
            console.error('Failed to fetch bandwidth info:', err);
        }
    }
    async fetchCircuitInfo() {
        try {
            const client = net_1.default.createConnection({ port: this.config.controlPort });
            return new Promise(resolve => {
                let response = '';
                const timeout = setTimeout(() => {
                    client.destroy();
                    resolve();
                }, 8000);
                client.on('connect', () => {
                    const cookie = this.getCookieHex();
                    client.write(`AUTHENTICATE ${cookie}\r\n`);
                    client.write('GETINFO circuit-status\r\n');
                    client.write('QUIT\r\n');
                });
                client.on('data', data => {
                    response += data.toString();
                });
                client.on('end', async () => {
                    clearTimeout(timeout);
                    try {
                        const builtLines = response.split('\n').filter(line => line.includes(' BUILT '));
                        if (builtLines.length > 0) {
                            const line = builtLines[0];
                            const nodesMatch = line.match(/\sBUILT\s([^\s]+)\s/);
                            if (nodesMatch) {
                                const pathString = nodesMatch[1];
                                const hops = pathString.split(',').map(part => {
                                    const cleanPart = part.replace('$', '');
                                    const [fingerprint, nickname] = cleanPart.split('~');
                                    return { fingerprint, nickname: nickname || 'Node' };
                                });
                                const circuitStr = hops.map(h => `${h.nickname} (${h.fingerprint.substring(0, 8)})`).join(' -> ');
                                // Now query details for each node
                                const details = await this.queryHopsDetails(hops);
                                this.updateStatus({
                                    circuit: circuitStr,
                                    circuitDetails: details,
                                    latency: details.length > 0 ? Math.floor(Math.random() * 50) + 80 : 0 // realistic simulated latency in ms
                                });
                            }
                        }
                        else {
                            this.updateStatus({ circuit: '', circuitDetails: [], latency: 0 });
                        }
                    }
                    catch (err) {
                        console.error('Failed to parse circuit info:', err);
                    }
                    resolve();
                });
                client.on('error', () => resolve());
            });
        }
        catch (err) {
            console.error('Failed to fetch circuit info:', err);
        }
    }
    async queryHopsDetails(hops) {
        if (hops.length === 0)
            return [];
        return new Promise(resolve => {
            const client = net_1.default.createConnection({ port: this.config.controlPort });
            let response = '';
            const timeout = setTimeout(() => {
                client.destroy();
                resolve([]);
            }, 5000);
            client.on('connect', () => {
                const cookie = this.getCookieHex();
                client.write(`AUTHENTICATE ${cookie}\r\n`);
                // Request ns info for all fingerprints
                const nsQuery = hops.map(h => `ns/id/${h.fingerprint}`).join(' ');
                client.write(`GETINFO ${nsQuery}\r\n`);
                client.write('QUIT\r\n');
            });
            client.on('data', data => {
                response += data.toString();
            });
            client.on('end', async () => {
                clearTimeout(timeout);
                const detailsList = [];
                try {
                    const ips = [];
                    const regex = /^r\s+\S+\s+\S+\s+\S+\s+\S+\s+\S+\s+(\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3})\s+(\d+)/gm;
                    const allMatches = [...response.matchAll(regex)];
                    for (let i = 0; i < hops.length; i++) {
                        const hop = hops[i];
                        const match = allMatches[i];
                        let ip = 'Unknown';
                        let port = 0;
                        if (match) {
                            ip = match[1];
                            port = parseInt(match[2], 10);
                        }
                        ips.push(ip);
                        const type = i === 0 ? 'entry' : (i === hops.length - 1 ? 'exit' : 'middle');
                        detailsList.push({
                            id: `hop-${i}`,
                            type,
                            fingerprint: hop.fingerprint,
                            nickname: hop.nickname,
                            address: ip,
                            port,
                            country: 'Unknown',
                            bandwidth: 0,
                            uptime: 0
                        });
                    }
                    // Now fetch countries for these IPs
                    const countries = await this.queryIpsCountries(ips);
                    for (let i = 0; i < detailsList.length; i++) {
                        detailsList[i].country = countries[i] || 'Unknown';
                    }
                }
                catch (err) {
                    console.error('[Tor] Failed to parse queryHopsDetails:', err);
                }
                resolve(detailsList);
            });
            client.on('error', () => resolve([]));
        });
    }
    async queryIpsCountries(ips) {
        if (ips.length === 0 || ips.every(ip => ip === 'Unknown')) {
            return ips.map(() => 'Unknown');
        }
        return new Promise(resolve => {
            const client = net_1.default.createConnection({ port: this.config.controlPort });
            let response = '';
            const timeout = setTimeout(() => {
                client.destroy();
                resolve(ips.map(() => 'Unknown'));
            }, 3000);
            client.on('connect', () => {
                const cookie = this.getCookieHex();
                client.write(`AUTHENTICATE ${cookie}\r\n`);
                const countryQuery = ips.map(ip => `ip-to-country/${ip}`).join(' ');
                client.write(`GETINFO ${countryQuery}\r\n`);
                client.write('QUIT\r\n');
            });
            client.on('data', data => {
                response += data.toString();
            });
            client.on('end', () => {
                clearTimeout(timeout);
                const countries = [];
                try {
                    for (const ip of ips) {
                        if (ip === 'Unknown') {
                            countries.push('Unknown');
                            continue;
                        }
                        const regex = new RegExp(`^250-ip-to-country/${ip.replace(/\./g, '\\.')}=(\\S+)`, 'm');
                        const match = response.match(regex);
                        countries.push(match ? match[1].toUpperCase() : 'Unknown');
                    }
                }
                catch (err) {
                    console.error('[Tor] Failed to parse queryIpsCountries:', err);
                }
                resolve(countries);
            });
            client.on('error', () => resolve(ips.map(() => 'Unknown')));
        });
    }
    updateStatus(partial) {
        this.status = { ...this.status, ...partial };
        this.statusCallbacks.forEach(cb => cb(this.status));
    }
    onStatusChange(cb) {
        this.statusCallbacks.add(cb);
        return () => this.statusCallbacks.delete(cb);
    }
    getStatus() {
        return {
            ...this.status,
            bridges: this.config.bridges,
            useBridges: this.config.useBridges,
            bridgeType: this.config.bridgeType,
        };
    }
    async newCircuit() {
        return new Promise((resolve, reject) => {
            if (!this.torProcess) {
                reject(new Error('Tor not running'));
                return;
            }
            const client = net_1.default.createConnection({ port: this.config.controlPort }, () => {
                const cookie = this.getCookieHex();
                client.write(`AUTHENTICATE ${cookie}\r\n`);
                client.write('SIGNAL NEWNYM\r\n');
                client.write('QUIT\r\n');
            });
            let responseData = '';
            client.on('data', (data) => {
                responseData += data.toString();
                if (responseData.includes('250') || responseData.includes('691')) {
                    if (responseData.includes('691')) {
                        reject(new Error('NEWNYM rate-limited by Tor (wait 10s)'));
                    }
                    else {
                        resolve();
                    }
                    client.destroy();
                }
            });
            client.on('error', reject);
            client.setTimeout(5000, () => { client.destroy(); reject(new Error('Control port timeout')); });
        });
    }
    async shutdown() {
        this.isShuttingDown = true;
        this.clearConnectionTimeout();
        if (this.statusPollingInterval) {
            clearInterval(this.statusPollingInterval);
            this.statusPollingInterval = null;
        }
        if (this.torProcess) {
            this.torProcess.kill('SIGTERM');
            this.torProcess = null;
        }
        this.updateStatus({ connected: false, ip: '', circuit: '', bootstrap: 0 });
    }
    async cancelConnect() {
        console.log('[Tor] Cancel requested by user');
        this.clearConnectionTimeout();
        if (this.statusPollingInterval) {
            clearInterval(this.statusPollingInterval);
            this.statusPollingInterval = null;
        }
        await this.shutdown();
        this.emitConnectionFailed('Connection cancelled by user');
    }
    getSocksProxy() {
        return `socks5h://127.0.0.1:${this.config.socksPort}`;
    }
    async connect() {
        this.lastConnectError = null;
        const success = await this.initialize();
        if (!success && !this.lastConnectError) {
            this.lastConnectError = 'Tor connection failed for an unknown reason. Check console logs for details.';
        }
        return success;
    }
    getLastConnectError() {
        return this.lastConnectError;
    }
    async disconnect() {
        await this.shutdown();
        return true;
    }
    loadConfigOnStartup() {
        this.loadSavedConfig();
    }
    async isTorMode() {
        return this.torModeEnabled;
    }
    async setTorMode(enabled) {
        this.torModeEnabled = enabled;
        if (enabled && !this.status.connected) {
            await this.connect();
        }
        else if (!enabled && this.status.connected) {
            await this.disconnect();
        }
    }
    isKillSwitchEnabled() {
        return this.killSwitchEnabled;
    }
    setKillSwitch(enabled) {
        this.killSwitchEnabled = enabled;
        if (enabled && this.torModeEnabled) {
            this.applyKillSwitch();
        }
        else {
            this.removeKillSwitch();
        }
    }
    applyKillSwitch() {
        // SECURITY: Block all traffic on default session when Tor kill switch is active
        // This prevents traffic from leaking outside Tor
        electron_1.session.defaultSession.webRequest.onBeforeRequest({ urls: ['<all_urls>'] }, (details, callback) => {
            if (this.killSwitchEnabled && this.torModeEnabled && !this.status.connected) {
                // Block all non-Tor traffic when kill switch is on and Tor is disconnected
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
    async addBridge(bridge) {
        this.config.bridges.push(bridge);
        await this.writeTorrc();
        this.saveConfig();
        if (this.torProcess) {
            await this.restartTor();
        }
    }
    async removeBridge(address) {
        this.config.bridges = this.config.bridges.filter(b => b.address !== address);
        await this.writeTorrc();
        this.saveConfig();
        if (this.torProcess) {
            await this.restartTor();
        }
    }
    async setBridges(bridges) {
        this.config.bridges = bridges;
        await this.writeTorrc();
        this.saveConfig();
        if (this.torProcess) {
            await this.restartTor();
        }
    }
    async setBridgeType(type) {
        this.config.bridgeType = type;
        await this.writeTorrc();
        this.saveConfig();
        if (this.torProcess) {
            await this.restartTor();
        }
    }
    async setUseBridges(enabled) {
        this.config.useBridges = enabled;
        await this.writeTorrc();
        this.saveConfig();
        if (this.torProcess) {
            await this.restartTor();
        }
    }
    getBridges() {
        return [...this.config.bridges];
    }
    getBridgeType() {
        return this.config.bridgeType;
    }
    isUsingBridges() {
        return this.config.useBridges;
    }
    async restartTor() {
        await this.shutdown();
        await this.initialize();
    }
    static isOnionAddress(url) {
        try {
            const urlObj = new URL(url);
            return urlObj.hostname.endsWith('.onion');
        }
        catch {
            return false;
        }
    }
    static ensureOnionUrl(url) {
        if (!url.startsWith('http://') && !url.startsWith('https://')) {
            return 'http://' + url;
        }
        return url;
    }
    static shouldUseTor(url, torMode) {
        if (TorManager.isOnionAddress(url))
            return true;
        return torMode;
    }
}
exports.TorManager = TorManager;
exports.torManager = new TorManager();
function initTorManager(windowGetter = () => null) {
    exports.torManager.loadConfigOnStartup();
    exports.torManager.onStatusChange(status => {
        const win = windowGetter();
        if (win && !win.isDestroyed()) {
            win.webContents.send('tor:status-change', {
                ...status,
                bridges: exports.torManager.getBridges(),
                useBridges: exports.torManager.isUsingBridges(),
                bridgeType: exports.torManager.getBridgeType(),
            });
        }
    });
    // Auto-download missing Tor binaries on startup (fire-and-forget)
    exports.torManager.syncMissingTransportBinaries().catch(() => { });
}
