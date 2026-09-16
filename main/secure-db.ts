import { app, ipcMain } from 'electron';
import Database from 'better-sqlite3';
import path from 'path';
import fs from 'fs';
import crypto from 'crypto';
import * as keytar from 'keytar';

const SERVICE_NAME = 'GeminiBrowserDevice';
const KEY_NAME = 'local-db-key';
let dbEncryptionKey: Buffer | null = null;
let db: Database.Database | null = null;

async function getOrCreateEncryptionKey(): Promise<Buffer> {
  if (dbEncryptionKey) return dbEncryptionKey;
  let keyHex = await keytar.getPassword(SERVICE_NAME, KEY_NAME);
  if (!keyHex) {
    const randomKey = crypto.randomBytes(32);
    keyHex = randomKey.toString('hex');
    await keytar.setPassword(SERVICE_NAME, KEY_NAME, keyHex);
  }
  dbEncryptionKey = Buffer.from(keyHex, 'hex');
  return dbEncryptionKey;
}

function encrypt(text: string, key: Buffer): string {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  const encrypted = Buffer.concat([cipher.update(text, 'utf8'), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return iv.toString('hex') + ':' + authTag.toString('hex') + ':' + encrypted.toString('hex');
}

function decrypt(encryptedData: string, key: Buffer): string {
  const [ivHex, authTagHex, encryptedHex] = encryptedData.split(':');
  if (!ivHex || !authTagHex || !encryptedHex) return '';
  const iv = Buffer.from(ivHex, 'hex');
  const authTag = Buffer.from(authTagHex, 'hex');
  const encrypted = Buffer.from(encryptedHex, 'hex');
  const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
  decipher.setAuthTag(authTag);
  const decrypted = Buffer.concat([decipher.update(encrypted), decipher.final()]);
  return decrypted.toString('utf8');
}

export async function initSecureDB(): Promise<void> {
  const key = await getOrCreateEncryptionKey();
  const userData = app.getPath('userData');
  const dbDir = path.join(userData, 'db');
  if (!fs.existsSync(dbDir)) {
    fs.mkdirSync(dbDir, { recursive: true });
  }
  const dbPath = path.join(dbDir, 'gemini-browser.db');
  db = new Database(dbPath);

  // Create tables
  db.exec(`
    CREATE TABLE IF NOT EXISTS secure_history (
      id TEXT PRIMARY KEY,
      url_enc TEXT NOT NULL,
      title_enc TEXT,
      timestamp INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS secure_bookmarks (
      id TEXT PRIMARY KEY,
      url_enc TEXT NOT NULL,
      title_enc TEXT,
      folder_id_enc TEXT,
      created_at INTEGER NOT NULL
    );
  `);

  // IPC Handlers
  ipcMain.handle('db:get-history', async () => {
    if (!db) return [];
    try {
      const stmt = db.prepare('SELECT * FROM secure_history ORDER BY timestamp DESC LIMIT 200');
      const rows = stmt.all() as any[];
      return rows.map(row => {
        try {
          return {
            id: row.id,
            url: decrypt(row.url_enc, key),
            title: row.title_enc ? decrypt(row.title_enc, key) : '',
            timestamp: row.timestamp,
          };
        } catch {
          return null;
        }
      }).filter(Boolean);
    } catch (e) {
      console.error('[SecureDB] get-history error:', e);
      return [];
    }
  });

  ipcMain.handle('db:add-history', async (_event, entry: { id: string; url: string; title: string; timestamp: number }) => {
    if (!db) return false;
    try {
      const urlEnc = encrypt(entry.url, key);
      const titleEnc = entry.title ? encrypt(entry.title, key) : '';
      
      // Prevent duplicates by checking if the last entry matches this url
      const lastRows = db.prepare('SELECT * FROM secure_history ORDER BY timestamp DESC LIMIT 5').all() as any[];
      const duplicate = lastRows.some(row => {
        try {
          return decrypt(row.url_enc, key) === entry.url;
        } catch {
          return false;
        }
      });
      if (duplicate) return true;

      const stmt = db.prepare('INSERT INTO secure_history (id, url_enc, title_enc, timestamp) VALUES (?, ?, ?, ?)');
      stmt.run(entry.id, urlEnc, titleEnc, entry.timestamp);
      return true;
    } catch (e) {
      console.error('[SecureDB] add-history error:', e);
      return false;
    }
  });

  ipcMain.handle('db:clear-history', async () => {
    if (!db) return false;
    try {
      db.prepare('DELETE FROM secure_history').run();
      return true;
    } catch (e) {
      console.error('[SecureDB] clear-history error:', e);
      return false;
    }
  });

  ipcMain.handle('db:delete-history', async (_event, id: string) => {
    if (!db) return false;
    try {
      db.prepare('DELETE FROM secure_history WHERE id = ?').run(id);
      return true;
    } catch (e) {
      console.error('[SecureDB] delete-history error:', e);
      return false;
    }
  });

  ipcMain.handle('db:get-bookmarks', async () => {
    if (!db) return [];
    try {
      const stmt = db.prepare('SELECT * FROM secure_bookmarks ORDER BY created_at DESC');
      const rows = stmt.all() as any[];
      return rows.map(row => {
        try {
          return {
            id: row.id,
            url: decrypt(row.url_enc, key),
            title: row.title_enc ? decrypt(row.title_enc, key) : '',
            folderId: row.folder_id_enc ? decrypt(row.folder_id_enc, key) : 'root',
            createdAt: row.created_at,
            updatedAt: row.created_at,
          };
        } catch {
          return null;
        }
      }).filter(Boolean);
    } catch (e) {
      console.error('[SecureDB] get-bookmarks error:', e);
      return [];
    }
  });

  ipcMain.handle('db:add-bookmark', async (_event, bookmark: { id: string; url: string; title: string; folderId?: string; createdAt: number }) => {
    if (!db) return false;
    try {
      const urlEnc = encrypt(bookmark.url, key);
      const titleEnc = bookmark.title ? encrypt(bookmark.title, key) : '';
      const folderIdEnc = bookmark.folderId ? encrypt(bookmark.folderId, key) : encrypt('root', key);

      // Check if bookmark with this URL already exists
      const allRows = db.prepare('SELECT * FROM secure_bookmarks').all() as any[];
      const exists = allRows.some(row => {
        try {
          return decrypt(row.url_enc, key) === bookmark.url;
        } catch {
          return false;
        }
      });
      if (exists) return true;

      const stmt = db.prepare('INSERT INTO secure_bookmarks (id, url_enc, title_enc, folder_id_enc, created_at) VALUES (?, ?, ?, ?, ?)');
      stmt.run(bookmark.id, urlEnc, titleEnc, folderIdEnc, bookmark.createdAt);
      return true;
    } catch (e) {
      console.error('[SecureDB] add-bookmark error:', e);
      return false;
    }
  });

  ipcMain.handle('db:delete-bookmark', async (_event, id: string) => {
    if (!db) return false;
    try {
      db.prepare('DELETE FROM secure_bookmarks WHERE id = ?').run(id);
      return true;
    } catch (e) {
      console.error('[SecureDB] delete-bookmark error:', e);
      return false;
    }
  });
}
