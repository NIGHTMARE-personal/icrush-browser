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
exports.initSecureDB = initSecureDB;
const electron_1 = require("electron");
const better_sqlite3_1 = __importDefault(require("better-sqlite3"));
const path_1 = __importDefault(require("path"));
const fs_1 = __importDefault(require("fs"));
const crypto_1 = __importDefault(require("crypto"));
const keytar = __importStar(require("keytar"));
const SERVICE_NAME = 'GeminiBrowserDevice';
const KEY_NAME = 'local-db-key';
let dbEncryptionKey = null;
let db = null;
async function getOrCreateEncryptionKey() {
    if (dbEncryptionKey)
        return dbEncryptionKey;
    let keyHex = await keytar.getPassword(SERVICE_NAME, KEY_NAME);
    if (!keyHex) {
        const randomKey = crypto_1.default.randomBytes(32);
        keyHex = randomKey.toString('hex');
        await keytar.setPassword(SERVICE_NAME, KEY_NAME, keyHex);
    }
    dbEncryptionKey = Buffer.from(keyHex, 'hex');
    return dbEncryptionKey;
}
function encrypt(text, key) {
    const iv = crypto_1.default.randomBytes(12);
    const cipher = crypto_1.default.createCipheriv('aes-256-gcm', key, iv);
    const encrypted = Buffer.concat([cipher.update(text, 'utf8'), cipher.final()]);
    const authTag = cipher.getAuthTag();
    return iv.toString('hex') + ':' + authTag.toString('hex') + ':' + encrypted.toString('hex');
}
function decrypt(encryptedData, key) {
    const [ivHex, authTagHex, encryptedHex] = encryptedData.split(':');
    if (!ivHex || !authTagHex || !encryptedHex)
        return '';
    const iv = Buffer.from(ivHex, 'hex');
    const authTag = Buffer.from(authTagHex, 'hex');
    const encrypted = Buffer.from(encryptedHex, 'hex');
    const decipher = crypto_1.default.createDecipheriv('aes-256-gcm', key, iv);
    decipher.setAuthTag(authTag);
    const decrypted = Buffer.concat([decipher.update(encrypted), decipher.final()]);
    return decrypted.toString('utf8');
}
async function initSecureDB() {
    const key = await getOrCreateEncryptionKey();
    const userData = electron_1.app.getPath('userData');
    const dbDir = path_1.default.join(userData, 'db');
    if (!fs_1.default.existsSync(dbDir)) {
        fs_1.default.mkdirSync(dbDir, { recursive: true });
    }
    const dbPath = path_1.default.join(dbDir, 'gemini-browser.db');
    db = new better_sqlite3_1.default(dbPath);
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
    electron_1.ipcMain.handle('db:get-history', async () => {
        if (!db)
            return [];
        try {
            const stmt = db.prepare('SELECT * FROM secure_history ORDER BY timestamp DESC LIMIT 200');
            const rows = stmt.all();
            return rows.map(row => {
                try {
                    return {
                        id: row.id,
                        url: decrypt(row.url_enc, key),
                        title: row.title_enc ? decrypt(row.title_enc, key) : '',
                        timestamp: row.timestamp,
                    };
                }
                catch {
                    return null;
                }
            }).filter(Boolean);
        }
        catch (e) {
            console.error('[SecureDB] get-history error:', e);
            return [];
        }
    });
    electron_1.ipcMain.handle('db:add-history', async (_event, entry) => {
        if (!db)
            return false;
        try {
            const urlEnc = encrypt(entry.url, key);
            const titleEnc = entry.title ? encrypt(entry.title, key) : '';
            // Prevent duplicates by checking if the last entry matches this url
            const lastRows = db.prepare('SELECT * FROM secure_history ORDER BY timestamp DESC LIMIT 5').all();
            const duplicate = lastRows.some(row => {
                try {
                    return decrypt(row.url_enc, key) === entry.url;
                }
                catch {
                    return false;
                }
            });
            if (duplicate)
                return true;
            const stmt = db.prepare('INSERT INTO secure_history (id, url_enc, title_enc, timestamp) VALUES (?, ?, ?, ?)');
            stmt.run(entry.id, urlEnc, titleEnc, entry.timestamp);
            return true;
        }
        catch (e) {
            console.error('[SecureDB] add-history error:', e);
            return false;
        }
    });
    electron_1.ipcMain.handle('db:clear-history', async () => {
        if (!db)
            return false;
        try {
            db.prepare('DELETE FROM secure_history').run();
            return true;
        }
        catch (e) {
            console.error('[SecureDB] clear-history error:', e);
            return false;
        }
    });
    electron_1.ipcMain.handle('db:delete-history', async (_event, id) => {
        if (!db)
            return false;
        try {
            db.prepare('DELETE FROM secure_history WHERE id = ?').run(id);
            return true;
        }
        catch (e) {
            console.error('[SecureDB] delete-history error:', e);
            return false;
        }
    });
    electron_1.ipcMain.handle('db:get-bookmarks', async () => {
        if (!db)
            return [];
        try {
            const stmt = db.prepare('SELECT * FROM secure_bookmarks ORDER BY created_at DESC');
            const rows = stmt.all();
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
                }
                catch {
                    return null;
                }
            }).filter(Boolean);
        }
        catch (e) {
            console.error('[SecureDB] get-bookmarks error:', e);
            return [];
        }
    });
    electron_1.ipcMain.handle('db:add-bookmark', async (_event, bookmark) => {
        if (!db)
            return false;
        try {
            const urlEnc = encrypt(bookmark.url, key);
            const titleEnc = bookmark.title ? encrypt(bookmark.title, key) : '';
            const folderIdEnc = bookmark.folderId ? encrypt(bookmark.folderId, key) : encrypt('root', key);
            // Check if bookmark with this URL already exists
            const allRows = db.prepare('SELECT * FROM secure_bookmarks').all();
            const exists = allRows.some(row => {
                try {
                    return decrypt(row.url_enc, key) === bookmark.url;
                }
                catch {
                    return false;
                }
            });
            if (exists)
                return true;
            const stmt = db.prepare('INSERT INTO secure_bookmarks (id, url_enc, title_enc, folder_id_enc, created_at) VALUES (?, ?, ?, ?, ?)');
            stmt.run(bookmark.id, urlEnc, titleEnc, folderIdEnc, bookmark.createdAt);
            return true;
        }
        catch (e) {
            console.error('[SecureDB] add-bookmark error:', e);
            return false;
        }
    });
    electron_1.ipcMain.handle('db:delete-bookmark', async (_event, id) => {
        if (!db)
            return false;
        try {
            db.prepare('DELETE FROM secure_bookmarks WHERE id = ?').run(id);
            return true;
        }
        catch (e) {
            console.error('[SecureDB] delete-bookmark error:', e);
            return false;
        }
    });
}
