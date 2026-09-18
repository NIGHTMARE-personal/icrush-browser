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
exports.initPasswordManager = initPasswordManager;
const electron_1 = require("electron");
const keytar = __importStar(require("keytar"));
const crypto_1 = __importDefault(require("crypto"));
const fs_1 = __importDefault(require("fs"));
const SERVICE_NAME = 'GeminiBrowser';
const VAULT_KEY = 'password-vault';
const MASTER_KEY_PREFIX = 'master-key-';
let masterKeyHash = null;
let encryptionKey = null;
function deriveKey(password, salt) {
    return crypto_1.default.pbkdf2Sync(password, salt, 100000, 32, 'sha256');
}
function encrypt(data, key) {
    const iv = crypto_1.default.randomBytes(12);
    const cipher = crypto_1.default.createCipheriv('aes-256-gcm', key, iv);
    const encrypted = Buffer.concat([cipher.update(data, 'utf8'), cipher.final()]);
    const authTag = cipher.getAuthTag();
    return iv.toString('hex') + ':' + authTag.toString('hex') + ':' + encrypted.toString('hex');
}
function decrypt(encryptedData, key) {
    const [ivHex, authTagHex, encryptedHex] = encryptedData.split(':');
    const iv = Buffer.from(ivHex, 'hex');
    const authTag = Buffer.from(authTagHex, 'hex');
    const encrypted = Buffer.from(encryptedHex, 'hex');
    const decipher = crypto_1.default.createDecipheriv('aes-256-gcm', key, iv);
    decipher.setAuthTag(authTag);
    const decrypted = Buffer.concat([decipher.update(encrypted), decipher.final()]);
    return decrypted.toString('utf8');
}
async function getOrCreateSalt() {
    const saltKey = 'vault-salt';
    let saltHex = await keytar.getPassword(SERVICE_NAME, saltKey);
    if (!saltHex) {
        const salt = crypto_1.default.randomBytes(16);
        saltHex = salt.toString('hex');
        await keytar.setPassword(SERVICE_NAME, saltKey, saltHex);
    }
    return Buffer.from(saltHex, 'hex');
}
async function setMasterPassword(password) {
    const salt = await getOrCreateSalt();
    const key = deriveKey(password, salt);
    masterKeyHash = crypto_1.default.createHash('sha256').update(key).digest('hex');
    encryptionKey = key;
    await keytar.setPassword(SERVICE_NAME, MASTER_KEY_PREFIX + 'hash', masterKeyHash);
}
async function unlockVault(password) {
    try {
        if (!masterKeyHash) {
            return false;
        }
        const salt = await getOrCreateSalt();
        const key = deriveKey(password, salt);
        const hash = crypto_1.default.createHash('sha256').update(key).digest('hex');
        if (hash !== masterKeyHash) {
            return false;
        }
        encryptionKey = key;
        return true;
    }
    catch (err) {
        console.error('Unlock failed:', err);
        return false;
    }
}
function lockVault() {
    encryptionKey = null;
    masterKeyHash = null;
}
async function getVault() {
    if (!encryptionKey)
        throw new Error('Vault locked');
    try {
        const vaultHex = await keytar.getPassword(SERVICE_NAME, VAULT_KEY);
        if (!vaultHex) {
            return { entries: [], version: 1 };
        }
        const decrypted = decrypt(vaultHex, encryptionKey);
        return JSON.parse(decrypted);
    }
    catch (err) {
        console.error('Failed to get vault:', err);
        return { entries: [], version: 1 };
    }
}
async function saveVault(vault) {
    if (!encryptionKey)
        throw new Error('Vault locked');
    const encrypted = encrypt(JSON.stringify(vault), encryptionKey);
    await keytar.setPassword(SERVICE_NAME, VAULT_KEY, encrypted);
}
function initPasswordManager() {
    // Initialize master key hash from keytar
    keytar.getPassword(SERVICE_NAME, MASTER_KEY_PREFIX + 'hash').then(hash => {
        masterKeyHash = hash;
    });
    // IPC Handlers
    electron_1.ipcMain.handle('password:has-master', async () => {
        return !!masterKeyHash;
    });
    electron_1.ipcMain.handle('password:set-master', async (_event, password) => {
        await setMasterPassword(password);
        return true;
    });
    electron_1.ipcMain.handle('password:unlock', async (_event, password) => {
        const success = await unlockVault(password);
        return success;
    });
    electron_1.ipcMain.handle('password:lock', async () => {
        lockVault();
        return true;
    });
    electron_1.ipcMain.handle('password:is-unlocked', async () => {
        return !!encryptionKey;
    });
    electron_1.ipcMain.handle('password:get-all', async () => {
        if (!encryptionKey)
            throw new Error('Vault locked');
        const vault = await getVault();
        return vault.entries.map(e => ({ ...e, password: '[HIDDEN]' }));
    });
    electron_1.ipcMain.handle('password:get-entry', async (_event, id) => {
        if (!encryptionKey)
            throw new Error('Vault locked');
        const vault = await getVault();
        const entry = vault.entries.find(e => e.id === id);
        if (!entry)
            return null;
        return { ...entry, password: decrypt(entry.password, encryptionKey) };
    });
    electron_1.ipcMain.handle('password:add', async (_event, entry) => {
        if (!encryptionKey)
            throw new Error('Vault locked');
        const vault = await getVault();
        const newEntry = {
            ...entry,
            id: crypto_1.default.randomBytes(16).toString('hex'),
            password: encrypt(entry.password, encryptionKey),
            createdAt: Date.now(),
            updatedAt: Date.now(),
        };
        vault.entries.push(newEntry);
        await saveVault(vault);
        return { ...newEntry, password: '[HIDDEN]' };
    });
    electron_1.ipcMain.handle('password:update', async (_event, id, updates) => {
        if (!encryptionKey)
            throw new Error('Vault locked');
        const vault = await getVault();
        const index = vault.entries.findIndex(e => e.id === id);
        if (index === -1)
            throw new Error('Entry not found');
        if (updates.password) {
            updates.password = encrypt(updates.password, encryptionKey);
        }
        vault.entries[index] = { ...vault.entries[index], ...updates, updatedAt: Date.now() };
        await saveVault(vault);
        return { ...vault.entries[index], password: '[HIDDEN]' };
    });
    electron_1.ipcMain.handle('password:delete', async (_event, id) => {
        if (!encryptionKey)
            throw new Error('Vault locked');
        const vault = await getVault();
        vault.entries = vault.entries.filter(e => e.id !== id);
        await saveVault(vault);
        return true;
    });
    electron_1.ipcMain.handle('password:generate', async (_event, length = 16) => {
        const charset = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789!@#$%^&*';
        const maxValid = Math.floor(256 / charset.length) * charset.length;
        let password = '';
        while (password.length < length) {
            const byte = crypto_1.default.randomBytes(1)[0];
            if (byte < maxValid) {
                password += charset[byte % charset.length];
            }
        }
        return password;
    });
    electron_1.ipcMain.handle('password:import', async (_event, data) => {
        if (!encryptionKey)
            throw new Error('Vault locked');
        try {
            const imported = JSON.parse(data);
            if (!imported.entries || !Array.isArray(imported.entries)) {
                throw new Error('Invalid import format');
            }
            const vault = await getVault();
            let importedCount = 0;
            for (const entry of imported.entries) {
                if (!entry.url || typeof entry.url !== 'string')
                    continue;
                if (!entry.username || typeof entry.username !== 'string')
                    continue;
                if (!entry.password || typeof entry.password !== 'string')
                    continue;
                if (entry.password && !entry.password.startsWith('encrypted:')) {
                    entry.password = encrypt(entry.password, encryptionKey);
                }
                entry.id = crypto_1.default.randomBytes(16).toString('hex');
                entry.createdAt = Date.now();
                entry.updatedAt = Date.now();
                vault.entries.push(entry);
                importedCount++;
            }
            await saveVault(vault);
            return importedCount;
        }
        catch (err) {
            throw new Error('Import failed: ' + err.message);
        }
    });
    electron_1.ipcMain.handle('password:export', async () => {
        if (!encryptionKey)
            throw new Error('Vault locked');
        const vault = await getVault();
        const exportable = {
            entries: vault.entries.map(e => ({
                ...e,
                password: decrypt(e.password, encryptionKey),
            })),
            exportedAt: Date.now(),
        };
        // SECURITY: Never return plaintext passwords to renderer.
        // Save to file and return the file path instead.
        const { dialog } = require('electron');
        const win = require('electron').BrowserWindow.getFocusedWindow();
        const result = await dialog.showSaveDialog(win, {
            title: 'Export Passwords',
            defaultPath: `passwords-export-${new Date().toISOString().slice(0, 10)}.json`,
            filters: [{ name: 'JSON', extensions: ['json'] }],
        });
        if (result.canceled || !result.filePath)
            return null;
        fs_1.default.writeFileSync(result.filePath, JSON.stringify(exportable, null, 2), 'utf-8');
        return result.filePath;
    });
    electron_1.ipcMain.handle('password:change-master', async (_event, currentPassword, newPassword) => {
        const success = await unlockVault(currentPassword);
        if (!success)
            throw new Error('Current master password incorrect');
        // Re-encrypt all entries with new key BEFORE changing the master key
        const vault = await getVault();
        const oldKey = encryptionKey;
        // Pre-derive the new key without committing it yet
        const salt = await getOrCreateSalt();
        const newKey = deriveKey(newPassword, salt);
        const newHash = crypto_1.default.createHash('sha256').update(newKey).digest('hex');
        // Re-encrypt all entries with the new key first (dry run)
        const reEncryptedEntries = vault.entries.map(entry => {
            const decrypted = decrypt(entry.password, oldKey);
            return { ...entry, password: encrypt(decrypted, newKey) };
        });
        // Only commit after all re-encryption succeeds
        vault.entries = reEncryptedEntries;
        encryptionKey = newKey;
        masterKeyHash = newHash;
        await keytar.setPassword(SERVICE_NAME, MASTER_KEY_PREFIX + 'hash', newHash);
        await saveVault(vault);
        return true;
    });
    electron_1.ipcMain.handle('password:encrypt-sync-data', async (_event, plaintext) => {
        if (!encryptionKey)
            throw new Error('Vault locked');
        return encrypt(plaintext, encryptionKey);
    });
    electron_1.ipcMain.handle('password:decrypt-sync-data', async (_event, ciphertext) => {
        if (!encryptionKey)
            throw new Error('Vault locked');
        try {
            return decrypt(ciphertext, encryptionKey);
        }
        catch {
            throw new Error('Decryption of sync data failed (incorrect master password or corrupted data)');
        }
    });
}
