/* eslint-disable @typescript-eslint/no-explicit-any */
import { app, BrowserWindow, session, ipcMain, shell } from 'electron';
import path from 'path';
import fs from 'fs';
import crypto from 'crypto';
import { securityManager, ScanResult } from './security-manager';

interface DownloadItem {
  id: string;
  url: string;
  filename: string;
  totalBytes: number;
  receivedBytes: number;
  state: 'progressing' | 'completed' | 'cancelled' | 'interrupted';
  startTime: number;
  endTime?: number;
  savePath: string;
  mimeType: string;
  scanResult?: ScanResult;
  priority?: 'high' | 'medium' | 'low';
  fileMissing?: boolean;
}

interface DownloadManagerState {
  downloads: Map<string, DownloadItem>;
  downloadDir: string;
}

const state: DownloadManagerState = {
  downloads: new Map(),
  downloadDir: path.join(app.getPath('downloads'), 'GeminiBrowser'),
};

function ensureDownloadDir() {
  if (!fs.existsSync(state.downloadDir)) {
    fs.mkdirSync(state.downloadDir, { recursive: true });
  }
}

function generateDownloadId(): string {
  return crypto.randomBytes(16).toString('hex');
}

function sanitizeFilename(filename: string): string {
  // eslint-disable-next-line no-control-regex
  return filename.replace(/[<>:"/\\|?*\x00-\x1F]/g, '_').substring(0, 255);
}

function getUniqueSavePath(filename: string): string {
  const sanitized = sanitizeFilename(filename);
  let savePath = path.join(state.downloadDir, sanitized);
  let counter = 1;
  const parsed = path.parse(sanitized);

  while (fs.existsSync(savePath)) {
    const newName = `${parsed.name} (${counter})${parsed.ext}`;
    savePath = path.join(state.downloadDir, newName);
    counter++;
  }
  return savePath;
}

async function checkRangeSupport(url: string): Promise<boolean> {
  try {
    const res = await fetch(url, {
      method: 'GET',
      headers: { Range: 'bytes=0-0' },
    });
    return res.status === 206;
  } catch (e) {
    return false;
  }
}

async function downloadSingleStream(
  downloadId: string,
  downloadItem: DownloadItem,
  mainWindow: BrowserWindow | null
) {
  let fd: number | null = null;
  try {
    fd = fs.openSync(downloadItem.savePath + '.download', 'w');
    const response = await fetch(downloadItem.url);
    if (!response.ok) throw new Error(`Status ${response.status}`);
    const reader = response.body?.getReader();
    if (!reader) throw new Error('Body not readable');

    let currentPos = 0;
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;

      const currentItem = state.downloads.get(downloadId);
      if (!currentItem || currentItem.state === 'cancelled') break;

      await new Promise<void>((resolve, reject) => {
        fs.write(fd!, value, 0, value.length, currentPos, err => {
          if (err) reject(err);
          else resolve();
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
      securityManager
        .scanDownload(downloadId, currentItem.savePath + '.download', currentItem.filename)
        .then(scanResult => {
          currentItem.scanResult = scanResult;
          if (scanResult.status === 'safe' || scanResult.status === 'unverified') {
            try {
              if (fs.existsSync(currentItem.savePath + '.download')) {
                fs.renameSync(currentItem.savePath + '.download', currentItem.savePath);
              }
            } catch (e) {
              console.error('Failed to rename quarantined file:', e);
            }
          } else if (scanResult.status === 'danger') {
            try {
              if (fs.existsSync(currentItem.savePath + '.download')) {
                fs.unlinkSync(currentItem.savePath + '.download');
              }
            } catch (e) {
              console.error('Failed to delete quarantined threat file:', e);
            }
          }
          mainWindow?.webContents.send('download:updated', { id: downloadId, ...currentItem });
        });
    }
  } catch (err) {
    console.error('Single stream download failed:', err);
    const currentItem = state.downloads.get(downloadId);
    if (currentItem && currentItem.state === 'progressing') {
      currentItem.state = 'interrupted';
      mainWindow?.webContents.send('download:updated', { id: downloadId, ...currentItem });
    }
  } finally {
    if (fd !== null) {
      try {
        fs.closeSync(fd);
      } catch (e) {
        // Ignore file descriptor close errors
      }
    }
    // Clean up state after 5 minutes (same as standard downloads)
    setTimeout(() => state.downloads.delete(downloadId), 5 * 60 * 1000);
  }
}

async function downloadParallel(
  downloadId: string,
  downloadItem: DownloadItem,
  mainWindow: BrowserWindow | null,
  totalBytes: number
) {
  let fd: number | null = null;
  try {
    fd = fs.openSync(downloadItem.savePath + '.download', 'w');
    const priority = downloadItem.priority || 'medium';
    const segmentCount = priority === 'high' ? 6 : priority === 'low' ? 2 : 4;
    const chunkSize = Math.ceil(totalBytes / segmentCount);
    const segments: Array<{ start: number; end: number; received: number }> = [];
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
      if (!reader) throw new Error('Segment body not readable');

      let currentPos = seg.start;
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;

        const currentItem = state.downloads.get(downloadId);
        if (!currentItem || currentItem.state === 'cancelled') break;

        await new Promise<void>((resolve, reject) => {
          fs.write(fd!, value, 0, value.length, currentPos, err => {
            if (err) reject(err);
            else resolve();
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
      securityManager
        .scanDownload(downloadId, currentItem.savePath + '.download', currentItem.filename)
        .then(scanResult => {
          currentItem.scanResult = scanResult;
          if (scanResult.status === 'safe' || scanResult.status === 'unverified') {
            try {
              if (fs.existsSync(currentItem.savePath + '.download')) {
                fs.renameSync(currentItem.savePath + '.download', currentItem.savePath);
              }
            } catch (e) {
              console.error('Failed to rename quarantined file:', e);
            }
          } else if (scanResult.status === 'danger') {
            try {
              if (fs.existsSync(currentItem.savePath + '.download')) {
                fs.unlinkSync(currentItem.savePath + '.download');
              }
            } catch (e) {
              console.error('Failed to delete quarantined threat file:', e);
            }
          }
          mainWindow?.webContents.send('download:updated', { id: downloadId, ...currentItem });
        });
    }
  } catch (err) {
    console.error('Parallel download failed:', err);
    const currentItem = state.downloads.get(downloadId);
    if (currentItem && currentItem.state === 'progressing') {
      currentItem.state = 'interrupted';
      mainWindow?.webContents.send('download:updated', { id: downloadId, ...currentItem });
    }
  } finally {
    if (fd !== null) {
      try {
        fs.closeSync(fd);
      } catch (e) {
        // Ignore file descriptor close errors
      }
    }
    // Clean up state after 5 minutes (same as standard downloads)
    setTimeout(() => state.downloads.delete(downloadId), 5 * 60 * 1000);
  }
}

export function initDownloadManager(mainWindow: BrowserWindow): void {
  ensureDownloadDir();

  const handleDownload = (event: any, item: any, _webContents: any) => {
    const targetWin = BrowserWindow.fromWebContents(_webContents) || mainWindow;
    const downloadId = generateDownloadId();
    const filename = item.getFilename();
    const savePath = getUniqueSavePath(filename);
    const totalBytes = item.getTotalBytes();

    const downloadItem: DownloadItem = {
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
        } else {
          console.log(`Starting single stream fetch download for: ${filename}`);
          downloadSingleStream(downloadId, downloadItem, targetWin);
        }
      });
    } else {
      // Small files: let standard Electron download handle it
      item.setSavePath(savePath + '.download');
      targetWin?.webContents.send('download:created', downloadItem);

      item.on('updated', (event: any, itemState: any) => {
        const download = state.downloads.get(downloadId);
        if (download) {
          download.receivedBytes = item.getReceivedBytes();
          if (itemState === 'interrupted') {
            download.state = 'interrupted';
          }
          targetWin?.webContents.send('download:updated', { id: downloadId, ...download });
        }
      });

      item.on('done', (event: any, itemState: any) => {
        const download = state.downloads.get(downloadId);
        if (download) {
          if (itemState === 'completed') {
            download.state = 'completed';
            download.endTime = Date.now();
            targetWin?.webContents.send('download:updated', { id: downloadId, ...download });
            securityManager
              .scanDownload(downloadId, download.savePath + '.download', download.filename)
              .then(scanResult => {
                download.scanResult = scanResult;
                if (scanResult.status === 'safe' || scanResult.status === 'unverified') {
                  try {
                    if (fs.existsSync(download.savePath + '.download')) {
                      fs.renameSync(download.savePath + '.download', download.savePath);
                    }
                  } catch (e) {
                    console.error('Failed to rename quarantined file:', e);
                  }
                } else if (scanResult.status === 'danger') {
                  try {
                    if (fs.existsSync(download.savePath + '.download')) {
                      fs.unlinkSync(download.savePath + '.download');
                    }
                  } catch (e) {
                    console.error('Failed to delete quarantined threat file:', e);
                  }
                }
                targetWin?.webContents.send('download:updated', { id: downloadId, ...download });
              });
          } else {
            download.state = 'cancelled';
            targetWin?.webContents.send('download:updated', { id: downloadId, ...download });
          }
          setTimeout(() => state.downloads.delete(downloadId), 5 * 60 * 1000);
        }
      });
    }
  };

  session.defaultSession.on('will-download', handleDownload);

  // Register download handler for dynamically-created incognito sessions
  downloadHandler = handleDownload;

  // IPC Handlers
  ipcMain.handle('downloads:get-all', () => {
    const list = Array.from(state.downloads.values());
    for (const item of list) {
      if (item.state === 'completed') {
        item.fileMissing = !fs.existsSync(item.savePath);
      }
    }
    return list;
  });

  ipcMain.handle(
    'downloads:set-priority',
    async (_event, id: string, priority: 'high' | 'medium' | 'low') => {
      const download = state.downloads.get(id);
      if (download) {
        download.priority = priority;
        mainWindow?.webContents.send('download:updated', { id, ...download });
      }
      return true;
    }
  );

  ipcMain.handle('downloads:pause', async (_event, id: string) => {
    const download = state.downloads.get(id);
    if (download) {
      download.state = 'interrupted';
      mainWindow?.webContents.send('download:updated', { id, ...download });
    }
    return true;
  });

  ipcMain.handle('downloads:cancel', async (_event, id: string) => {
    const download = state.downloads.get(id);
    if (download) {
      download.state = 'cancelled';
      mainWindow?.webContents.send('download:updated', { id, ...download });
    }
    return true;
  });

  ipcMain.handle('downloads:retry', async (_event, id: string) => {
    const download = state.downloads.get(id);
    if (download && download.state !== 'progressing') {
      download.state = 'progressing';
      download.receivedBytes = 0;
      download.startTime = Date.now();
      mainWindow?.webContents.send('download:updated', { id, ...download });

      checkRangeSupport(download.url).then(hasRangeSupport => {
        if (hasRangeSupport && download.totalBytes > 0) {
          downloadParallel(id, download, mainWindow, download.totalBytes);
        } else {
          downloadSingleStream(id, download, mainWindow);
        }
      });
    }
    return true;
  });

  ipcMain.handle('downloads:show-in-folder', async (_event, id: string) => {
    const download = state.downloads.get(id);
    if (download && fs.existsSync(download.savePath)) {
      shell.showItemInFolder(download.savePath);
    }
  });

  ipcMain.handle('downloads:open', async (_event, id: string) => {
    const download = state.downloads.get(id);
    if (download && fs.existsSync(download.savePath)) {
      shell.openPath(download.savePath);
    }
  });

  ipcMain.handle('downloads:remove', async (_event, id: string) => {
    const download = state.downloads.get(id);
    if (download) {
      if (fs.existsSync(download.savePath)) {
        try {
          fs.unlinkSync(download.savePath);
        } catch {
          // Ignore deletion error
        }
      }
      state.downloads.delete(id);
    }
    return true;
  });

  ipcMain.handle('downloads:clear-completed', () => {
    for (const [id, download] of state.downloads) {
      if (download.state === 'completed' || download.state === 'cancelled') {
        state.downloads.delete(id);
      }
    }
    return true;
  });

  ipcMain.handle('downloads:get-save-dir', () => state.downloadDir);

  ipcMain.handle('downloads:set-save-dir', async (_event, dir: string) => {
    if (fs.existsSync(dir)) {
      state.downloadDir = dir;
      return true;
    }
    return false;
  });
}

export function getDownloadState(): DownloadManagerState {
  return state;
}

let downloadHandler: ((event: any, item: any, webContents: any) => void) | null = null;

export function registerIncognitoDownloadHandler(partition: string): void {
  if (!downloadHandler) return;
  try {
    session.fromPartition(partition).on('will-download', downloadHandler);
  } catch (e) {
    console.error('Failed to register incognito download handler:', e);
  }
}
