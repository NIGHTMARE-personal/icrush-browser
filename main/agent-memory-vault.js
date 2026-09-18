"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.agentMemoryVault = exports.agentVault = void 0;
const electron_1 = require("electron");
const fs_1 = __importDefault(require("fs"));
const path_1 = __importDefault(require("path"));
const crypto_1 = __importDefault(require("crypto"));
/**
 * Encrypted Agent Memory Vault (AES-256 / DPAPI at Rest)
 */
class AgentMemoryVault {
    constructor() {
        Object.defineProperty(this, "vaultPath", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: void 0
        });
        Object.defineProperty(this, "legacyPath", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: void 0
        });
        Object.defineProperty(this, "cache", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: new Map()
        });
        Object.defineProperty(this, "isLoaded", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: false
        });
        const userData = electron_1.app.getPath('userData');
        this.vaultPath = path_1.default.join(userData, 'agent-memory.vault');
        this.legacyPath = path_1.default.join(userData, 'agent-memory.json');
    }
    getFallbackKey() {
        // SECURITY: Use a random key stored on disk instead of predictable env vars
        const keyPath = path_1.default.join(electron_1.app.getPath('userData'), '.vault-key');
        try {
            if (fs_1.default.existsSync(keyPath)) {
                return Buffer.from(fs_1.default.readFileSync(keyPath, 'hex'));
            }
        }
        catch { /* fall through to generate new key */ }
        // Generate a new random key and save it
        const key = crypto_1.default.randomBytes(32);
        try {
            fs_1.default.writeFileSync(keyPath, key.toString('hex'), { mode: 0o600 });
        }
        catch { /* best effort — will regenerate next time */ }
        return key;
    }
    encrypt(plainText) {
        if (electron_1.safeStorage.isEncryptionAvailable()) {
            const buffer = electron_1.safeStorage.encryptString(plainText);
            return `safe:${buffer.toString('base64')}`;
        }
        // Fallback AES-256-GCM
        const iv = crypto_1.default.randomBytes(12);
        const cipher = crypto_1.default.createCipheriv('aes-256-gcm', this.getFallbackKey(), iv);
        const encrypted = Buffer.concat([cipher.update(plainText, 'utf8'), cipher.final()]);
        const tag = cipher.getAuthTag();
        return `gcm:${iv.toString('hex')}:${tag.toString('hex')}:${encrypted.toString('base64')}`;
    }
    decrypt(cipherText) {
        try {
            if (cipherText.startsWith('safe:')) {
                const raw = Buffer.from(cipherText.slice(5), 'base64');
                return electron_1.safeStorage.decryptString(raw);
            }
            if (cipherText.startsWith('gcm:')) {
                const [, ivHex, tagHex, dataB64] = cipherText.split(':');
                const iv = Buffer.from(ivHex, 'hex');
                const tag = Buffer.from(tagHex, 'hex');
                const data = Buffer.from(dataB64, 'base64');
                const decipher = crypto_1.default.createDecipheriv('aes-256-gcm', this.getFallbackKey(), iv);
                decipher.setAuthTag(tag);
                return decipher.update(data, undefined, 'utf8') + decipher.final('utf8');
            }
            // If unencrypted legacy string
            return cipherText;
        }
        catch (err) {
            console.error('[AgentVault] Failed to decrypt entry:', err);
            return '';
        }
    }
    init() {
        if (this.isLoaded)
            return;
        this.cache.clear();
        // 1. Read encrypted vault file
        if (fs_1.default.existsSync(this.vaultPath)) {
            try {
                const raw = fs_1.default.readFileSync(this.vaultPath, 'utf8');
                const parsed = JSON.parse(raw);
                if (Array.isArray(parsed)) {
                    for (const item of parsed) {
                        this.cache.set(item.key, {
                            key: item.key,
                            value: this.decrypt(item.value),
                            category: item.category || 'task_state',
                            updatedAt: item.updatedAt || Date.now(),
                            isEncrypted: true,
                        });
                    }
                }
            }
            catch (err) {
                console.error('[AgentVault] Failed to read vault file:', err);
            }
        }
        // 2. Migrate legacy plaintext JSON if exists
        if (fs_1.default.existsSync(this.legacyPath)) {
            try {
                const legacyRaw = fs_1.default.readFileSync(this.legacyPath, 'utf8');
                const legacyObj = JSON.parse(legacyRaw);
                for (const [k, v] of Object.entries(legacyObj)) {
                    if (!this.cache.has(k)) {
                        this.cache.set(k, {
                            key: k,
                            value: String(v),
                            category: 'task_state',
                            updatedAt: Date.now(),
                            isEncrypted: true,
                        });
                    }
                }
                this.save();
                // Remove legacy file after successful migration
                fs_1.default.unlinkSync(this.legacyPath);
                console.log('[AgentVault] Migrated legacy unencrypted agent memory into secure vault.');
            }
            catch (err) {
                console.error('[AgentVault] Error during legacy migration:', err);
            }
        }
        this.isLoaded = true;
    }
    save() {
        try {
            const serialized = Array.from(this.cache.values()).map(entry => ({
                key: entry.key,
                value: this.encrypt(entry.value),
                category: entry.category,
                updatedAt: entry.updatedAt,
            }));
            fs_1.default.writeFileSync(this.vaultPath, JSON.stringify(serialized, null, 2), 'utf8');
        }
        catch (err) {
            console.error('[AgentVault] Failed to save vault to disk:', err);
        }
    }
    get(key) {
        this.init();
        const entry = this.cache.get(key);
        return entry ? entry.value : null;
    }
    set(key, value, category = 'task_state') {
        this.init();
        this.cache.set(key, {
            key,
            value,
            category,
            updatedAt: Date.now(),
            isEncrypted: true,
        });
        this.save();
        return true;
    }
    delete(key) {
        this.init();
        if (this.cache.has(key)) {
            this.cache.delete(key);
            this.save();
            return true;
        }
        return false;
    }
    list() {
        this.init();
        const result = {};
        for (const [k, v] of this.cache.entries()) {
            result[k] = v.value;
        }
        return result;
    }
    getStats() {
        this.init();
        return {
            totalKeys: this.cache.size,
            isEncryptionAvailable: electron_1.safeStorage.isEncryptionAvailable(),
            storagePath: this.vaultPath,
            lastUpdated: Date.now(),
        };
    }
}
exports.agentVault = new AgentMemoryVault();
exports.agentMemoryVault = exports.agentVault;
