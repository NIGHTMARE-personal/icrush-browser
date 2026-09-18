"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.initDownloadManager = initDownloadManager;
exports.getDownloadState = getDownloadState;
exports.registerIncognitoDownloadHandler = registerIncognitoDownloadHandler;
/* eslint-disable @typescript-eslint/no-explicit-any */
const electron_1 = require("electron");
const path_1 = __importDefault(require("path"));
const fs_1 = __importDefault(require("fs"));
const crypto_1 = __importDefault(require("crypto"));
const security_manager_1 = require("./security-manager");
const state = {
    downloads: new Map(),
    downloadDir: path_1.default.join(electron_1.app.getPath('downloads'), 'GeminiBrowser'),
};
function ensureDownloadDir() {
    if (!fs_1.default.existsSync(state.downloadDir)) {
        fs_1.default.mkdirSync(state.downloadDir, { recursive: true });
    }
}
function generateDownloadId() {
    return crypto_1.default.randomBytes(16).toString('hex');
}
function sanitizeFilename(filename) {
    // eslint-disable-next-line no-control-regex
    return filename.replace(/[<>:"/\\|?*\x00-\x1F]/g, '_').substring(0, 255);
}
function getUniqueSavePath(filename) {
    const sanitized = sanitizeFilename(filename);
    let savePath = path_1.default.join(state.downloadDir, sanitized);
    let counter = 1;
    const parsed = path_1.default.parse(sanitized);
    while (fs_1.default.existsSync(savePath)) {
        const newName = `${parsed.name} (${counter})${parsed.ext}`;
        savePath = path_1.default.join(state.downloadDir, newName);
        counter++;
    }
    return savePath;
}
async function checkRangeSupport(url) {
    try {
        const res = await fetch(url, {
            method: 'GET',
            headers: { Range: 'bytes=0-0' },
        });
        return res.status === 206;
    }
    catch (e) {
        return false;
    }
}
async function downloadSingleStream(downloadId, downloadItem, mainWindow) {
    let fd = null;
    try {
        fd = fs_1.default.openSync(downloadItem.savePath + '.download', 'w');
        const response = await fetch(downloadItem.url);
        if (!response.ok)
            throw new Error(`Status ${response.status}`);
        const reader = response.body?.getReader();
        if (!reader)
            throw new Error('Body not readable');
        let currentPos = 0;
        for (;;) {
            const { done, value } = await reader.read();
            if (done)
                break;
            const currentItem = state.downloads.get(downloadId);
            if (!currentItem || currentItem.state === 'cancelled')
                break;
            await new Promise((resolve, reject) => {
                fs_1.default.write(fd, value, 0, value.length, currentPos, err => {
                    if (err)
                        reject(err);
                    else
                        resolve();
                });
            });
            currentPos += value.length;
            currentItem.receivedBytes = currentPos;
            mainWindow?.webContents.send('download:updated', { id: downloadId, ...currentItem });
        }
        const currentItem = state.downloads.get(downloadId);
        if (currentItem && currentItem.state === 'progressing') {
            currentItem.state = 'completed';
            currentItem.endTime = Date.now();
            mainWindow?.webContents.send('download:updated', { id: downloadId, ...currentItem });
            security_manager_1.securityManager
                .scanDownload(downloadId, currentItem.savePath + '.download', currentItem.filename)
                .then(scanResult => {
                currentItem.scanResult = scanResult;
                if (scanResult.status === 'safe' || scanResult.status === 'unverified') {
                    try {
                        if (fs_1.default.existsSync(currentItem.savePath + '.download')) {
                            fs_1.default.renameSync(currentItem.savePath + '.download', currentItem.savePath);
                        }
                    }
                    catch (e) {
                        console.error('Failed to rename quarantined file:', e);
                    }
                }
                else if (scanResult.status === 'danger') {
                    try {
                        if (fs_1.default.existsSync(currentItem.savePath + '.download')) {
                            fs_1.default.unlinkSync(currentItem.savePath + '.download');
                        }
                    }
                    catch (e) {
                        console.error('Failed to delete quarantined threat file:', e);
                    }
                }
                mainWindow?.webContents.send('download:updated', { id: downloadId, ...currentItem });
            });
        }
    }
    catch (err) {
        console.error('Single stream download failed:', err);
        const currentItem = state.downloads.get(downloadId);
        if (currentItem && currentItem.state === 'progressing') {
            currentItem.state = 'interrupted';
            mainWindow?.webContents.send('download:updated', { id: downloadId, ...currentItem });
        }
    }
    finally {
        if (fd !== null) {
            try {
                fs_1.default.closeSync(fd);
            }
            catch (e) {
                // Ignore file descriptor close errors
            }
        }
        // Clean up state after 5 minutes (same as standard downloads)
        setTimeout(() => state.downloads.delete(downloadId), 5 * 60 * 1000);
    }
}
async function downloadParallel(downloadId, downloadItem, mainWindow, totalBytes) {
    let fd = null;
    try {
        fd = fs_1.default.openSync(downloadItem.savePath + '.download', 'w');
        const priority = downloadItem.priority || 'medium';
        const segmentCount = priority === 'high' ? 6 : priority === 'low' ? 2 : 4;
        const chunkSize = Math.ceil(totalBytes / segmentCount);
        const segments = [];
        for (let i = 0; i < segmentCount; i++) {
            const start = i * chunkSize;
            const end = Math.min((i + 1) * chunkSize - 1, totalBytes - 1);
            segments.push({ start, end, received: 0 });
        }
        const promises = segments.map(async (seg, index) => {
            const response = await fetch(downloadItem.url, {
                headers: { Range: `bytes=${seg.start}-${seg.end}` },
            });
            if (!response.ok && response.status !== 206) {
                throw new Error(`Segment ${index} status ${response.status}`);
            }
            const reader = response.body?.getReader();
            if (!reader)
                throw new Error('Segment body not readable');
            let currentPos = seg.start;
            for (;;) {
                const { done, value } = await reader.read();
                if (done)
                    break;
                const currentItem = state.downloads.get(downloadId);
                if (!currentItem || currentItem.state === 'cancelled')
                    break;
                await new Promise((resolve, reject) => {
                    fs_1.default.write(fd, value, 0, value.length, currentPos, err => {
                        if (err)
                            reject(err);
                        else
                            resolve();
                    });
                });
                currentPos += value.length;
                seg.received += value.length;
                const totalReceived = segments.reduce((sum, s) => sum + s.received, 0);
                const itemUpdate = state.downloads.get(downloadId);
                if (itemUpdate && itemUpdate.state === 'progressing') {
                    itemUpdate.receivedBytes = totalReceived;
                    mainWindow?.webContents.send('download:updated', { id: downloadId, ...itemUpdate });
                }
            }
        });
        await Promise.all(promises);
        const currentItem = state.downloads.get(downloadId);
        if (currentItem && currentItem.state === 'progressing') {
            currentItem.state = 'completed';
            currentItem.endTime = Date.now();
            mainWindow?.webContents.send('download:updated', { id: downloadId, ...currentItem });
            security_manager_1.securityManager
                .scanDownload(downloadId, currentItem.savePath + '.download', currentItem.filename)
                .then(scanResult => {
                currentItem.scanResult = scanResult;
                if (scanResult.status === 'safe' || scanResult.status === 'unverified') {
                    try {
                        if (fs_1.default.existsSync(currentItem.savePath + '.download')) {
                            fs_1.default.renameSync(currentItem.savePath + '.download', currentItem.savePath);
                        }
                    }
                    catch (e) {
                        console.error('Failed to rename quarantined file:', e);
                    }
                }
                else if (scanResult.status === 'danger') {
                    try {
                        if (fs_1.default.existsSync(currentItem.savePath + '.download')) {
                            fs_1.default.unlinkSync(currentItem.savePath + '.download');
                        }
                    }
                    catch (e) {
                        console.error('Failed to delete quarantined threat file:', e);
                    }
                }
                mainWindow?.webContents.send('download:updated', { id: downloadId, ...currentItem });
            });
        }
    }
    catch (err) {
        console.error('Parallel download failed:', err);
        const currentItem = state.downloads.get(downloadId);
        if (currentItem && currentItem.state === 'progressing') {
            currentItem.state = 'interrupted';
            mainWindow?.webContents.send('download:updated', { id: downloadId, ...currentItem });
        }
    }
    finally {
        if (fd !== null) {
            try {
                fs_1.default.closeSync(fd);
            }
            catch (e) {
                // Ignore file descriptor close errors
            }
        }
        // Clean up state after 5 minutes (same as standard downloads)
        setTimeout(() => state.downloads.delete(downloadId), 5 * 60 * 1000);
    }
}
function initDownloadManager(mainWindow) {
    ensureDownloadDir();
    const handleDownload = (event, item, _webContents) => {
        const targetWin = electron_1.BrowserWindow.fromWebContents(_webContents) || mainWindow;
        const downloadId = generateDownloadId();
        const filename = item.getFilename();
        const savePath = getUniqueSavePath(filename);
        const totalBytes = item.getTotalBytes();
        const downloadItem = {
            id: downloadId,
            url: item.getURL(),
            filename,
            totalBytes: totalBytes > 0 ? totalBytes : 0,
            receivedBytes: 0,
            state: 'progressing',
            startTime: Date.now(),
            savePath,
            mimeType: item.getMimeType(),
            priority: 'medium',
            fileMissing: false,
        };
        state.downloads.set(downloadId, downloadItem);
        // If file size > 5MB, intercept and run custom downloading (segmented or single stream fetch)
        const threshold = 5 * 1024 * 1024; // 5 MB
        if (totalBytes > threshold) {
            event.preventDefault(); // Cancel default Electron download
            // Notify renderer about the new download
            targetWin?.webContents.send('download:created', downloadItem);
            // Async check and start download
            checkRangeSupport(downloadItem.url).then(hasRangeSupport => {
                if (hasRangeSupport) {
                    console.log(`Starting parallel segmented download for: ${filename}`);
                    downloadParallel(downloadId, downloadItem, targetWin, totalBytes);
                }
                else {
                    console.log(`Starting single stream fetch download for: ${filename}`);
                    downloadSingleStream(downloadId, downloadItem, targetWin);
                }
            });
        }
        else {
            // Small files: let standard Electron download handle it
            item.setSavePath(savePath + '.download');
            targetWin?.webContents.send('download:created', downloadItem);
            item.on('updated', (event, itemState) => {
                const download = state.downloads.get(downloadId);
                if (download) {
                    download.receivedBytes = item.getReceivedBytes();
                    if (itemState === 'interrupted') {
                        download.state = 'interrupted';
                    }
                    targetWin?.webContents.send('download:updated', { id: downloadId, ...download });
                }
            });
            item.on('done', (event, itemState) => {
                const download = state.downloads.get(downloadId);
                if (download) {
                    if (itemState === 'completed') {
                        download.state = 'completed';
                        download.endTime = Date.now();
                        targetWin?.webContents.send('download:updated', { id: downloadId, ...download });
                        security_manager_1.securityManager
                            .scanDownload(downloadId, download.savePath + '.download', download.filename)
                            .then(scanResult => {
                            download.scanResult = scanResult;
                            if (scanResult.status === 'safe' || scanResult.status === 'unverified') {
                                try {
                                    if (fs_1.default.existsSync(download.savePath + '.download')) {
                                        fs_1.default.renameSync(download.savePath + '.download', download.savePath);
                                    }
                                }
                                catch (e) {
                                    console.error('Failed to rename quarantined file:', e);
                                }
                            }
                            else if (scanResult.status === 'danger') {
                                try {
                                    if (fs_1.default.existsSync(download.savePath + '.download')) {
                                        fs_1.default.unlinkSync(download.savePath + '.download');
                                    }
                                }
                                catch (e) {
                                    console.error('Failed to delete quarantined threat file:', e);
                                }
                            }
                            targetWin?.webContents.send('download:updated', { id: downloadId, ...download });
                        });
                    }
                    else {
                        download.state = 'cancelled';
                        targetWin?.webContents.send('download:updated', { id: downloadId, ...download });
                    }
                    setTimeout(() => state.downloads.delete(downloadId), 5 * 60 * 1000);
                }
            });
        }
    };
    electron_1.session.defaultSession.on('will-download', handleDownload);
    // Register download handler for dynamically-created incognito sessions
    downloadHandler = handleDownload;
    // IPC Handlers
    electron_1.ipcMain.handle('downloads:get-all', () => {
        const list = Array.from(state.downloads.values());
        for (const item of list) {
            if (item.state === 'completed') {
                item.fileMissing = !fs_1.default.existsSync(item.savePath);
            }
        }
        return list;
    });
    electron_1.ipcMain.handle('downloads:set-priority', async (_event, id, priority) => {
        const download = state.downloads.get(id);
        if (download) {
            download.priority = priority;
            mainWindow?.webContents.send('download:updated', { id, ...download });
        }
        return true;
    });
    electron_1.ipcMain.handle('downloads:pause', async (_event, id) => {
        const download = state.downloads.get(id);
        if (download) {
            download.state = 'interrupted';
            mainWindow?.webContents.send('download:updated', { id, ...download });
        }
        return true;
    });
    electron_1.ipcMain.handle('downloads:cancel', async (_event, id) => {
        const download = state.downloads.get(id);
        if (download) {
            download.state = 'cancelled';
            mainWindow?.webContents.send('download:updated', { id, ...download });
        }
        return true;
    });
    electron_1.ipcMain.handle('downloads:retry', async (_event, id) => {
        const download = state.downloads.get(id);
        if (download && download.state !== 'progressing') {
            download.state = 'progressing';
            download.receivedBytes = 0;
            download.startTime = Date.now();
            mainWindow?.webContents.send('download:updated', { id, ...download });
            checkRangeSupport(download.url).then(hasRangeSupport => {
                if (hasRangeSupport && download.totalBytes > 0) {
                    downloadParallel(id, download, mainWindow, download.totalBytes);
                }
                else {
                    downloadSingleStream(id, download, mainWindow);
                }
            });
        }
        return true;
    });
    electron_1.ipcMain.handle('downloads:show-in-folder', async (_event, id) => {
        const download = state.downloads.get(id);
        if (download && fs_1.default.existsSync(download.savePath)) {
            electron_1.shell.showItemInFolder(download.savePath);
        }
    });
    electron_1.ipcMain.handle('downloads:open', async (_event, id) => {
        const download = state.downloads.get(id);
        if (download && fs_1.default.existsSync(download.savePath)) {
            electron_1.shell.openPath(download.savePath);
        }
    });
    electron_1.ipcMain.handle('downloads:remove', async (_event, id) => {
        const download = state.downloads.get(id);
        if (download) {
            if (fs_1.default.existsSync(download.savePath)) {
                try {
                    fs_1.default.unlinkSync(download.savePath);
                }
                catch {
                    // Ignore deletion error
                }
            }
            state.downloads.delete(id);
        }
        return true;
    });
    electron_1.ipcMain.handle('downloads:clear-completed', () => {
        for (const [id, download] of state.downloads) {
            if (download.state === 'completed' || download.state === 'cancelled') {
                state.downloads.delete(id);
            }
        }
        return true;
    });
    electron_1.ipcMain.handle('downloads:get-save-dir', () => state.downloadDir);
    electron_1.ipcMain.handle('downloads:set-save-dir', async (_event, dir) => {
        if (fs_1.default.existsSync(dir)) {
            state.downloadDir = dir;
            return true;
        }
        return false;
    });
}
function getDownloadState() {
    return state;
}
let downloadHandler = null;
function registerIncognitoDownloadHandler(partition) {
    if (!downloadHandler)
        return;
    try {
        electron_1.session.fromPartition(partition).on('will-download', downloadHandler);
    }
    catch (e) {
        console.error('Failed to register incognito download handler:', e);
    }
}
