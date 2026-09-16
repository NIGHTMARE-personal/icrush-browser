import { app, safeStorage } from 'electron';
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import type { EncryptedMemoryEntry, VaultStats } from '../src/types/agent-contracts';

/**
 * Encrypted Agent Memory Vault (AES-256 / DPAPI at Rest)
 */
class AgentMemoryVault {
  private vaultPath: string;
  private legacyPath: string;
  private cache: Map<string, EncryptedMemoryEntry> = new Map();
  private isLoaded = false;

  constructor() {
    const userData = app.getPath('userData');
    this.vaultPath = path.join(userData, 'agent-memory.vault');
    this.legacyPath = path.join(userData, 'agent-memory.json');
  }

  private getFallbackKey(): Buffer {
    const machineId = `${process.env.COMPUTERNAME || 'host'}-${process.env.USERNAME || 'user'}-icrush-vault`;
    return crypto.pbkdf2Sync(machineId, 'icrush-salt-v1', 100000, 32, 'sha256');
  }

  private encrypt(plainText: string): string {
    if (safeStorage.isEncryptionAvailable()) {
      const buffer = safeStorage.encryptString(plainText);
      return `safe:${buffer.toString('base64')}`;
    }
    // Fallback AES-256-GCM
    const iv = crypto.randomBytes(12);
    const cipher = crypto.createCipheriv('aes-256-gcm', this.getFallbackKey(), iv);
    const encrypted = Buffer.concat([cipher.update(plainText, 'utf8'), cipher.final()]);
    const tag = cipher.getAuthTag();
    return `gcm:${iv.toString('hex')}:${tag.toString('hex')}:${encrypted.toString('base64')}`;
  }

  private decrypt(cipherText: string): string {
    try {
      if (cipherText.startsWith('safe:')) {
        const raw = Buffer.from(cipherText.slice(5), 'base64');
        return safeStorage.decryptString(raw);
      }
      if (cipherText.startsWith('gcm:')) {
        const [, ivHex, tagHex, dataB64] = cipherText.split(':');
        const iv = Buffer.from(ivHex, 'hex');
        const tag = Buffer.from(tagHex, 'hex');
        const data = Buffer.from(dataB64, 'base64');
        const decipher = crypto.createDecipheriv('aes-256-gcm', this.getFallbackKey(), iv);
        decipher.setAuthTag(tag);
        return decipher.update(data, undefined, 'utf8') + decipher.final('utf8');
      }
      // If unencrypted legacy string
      return cipherText;
    } catch (err) {
      console.error('[AgentVault] Failed to decrypt entry:', err);
      return '';
    }
  }

  public init(): void {
    if (this.isLoaded) return;
    this.cache.clear();

    // 1. Read encrypted vault file
    if (fs.existsSync(this.vaultPath)) {
      try {
        const raw = fs.readFileSync(this.vaultPath, 'utf8');
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
      } catch (err) {
        console.error('[AgentVault] Failed to read vault file:', err);
      }
    }

    // 2. Migrate legacy plaintext JSON if exists
    if (fs.existsSync(this.legacyPath)) {
      try {
        const legacyRaw = fs.readFileSync(this.legacyPath, 'utf8');
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
        fs.unlinkSync(this.legacyPath);
        console.log('[AgentVault] Migrated legacy unencrypted agent memory into secure vault.');
      } catch (err) {
        console.error('[AgentVault] Error during legacy migration:', err);
      }
    }

    this.isLoaded = true;
  }

  private save(): void {
    try {
      const serialized = Array.from(this.cache.values()).map(entry => ({
        key: entry.key,
        value: this.encrypt(entry.value),
        category: entry.category,
        updatedAt: entry.updatedAt,
      }));
      fs.writeFileSync(this.vaultPath, JSON.stringify(serialized, null, 2), 'utf8');
    } catch (err) {
      console.error('[AgentVault] Failed to save vault to disk:', err);
    }
  }

  public get(key: string): string | null {
    this.init();
    const entry = this.cache.get(key);
    return entry ? entry.value : null;
  }

  public set(key: string, value: string, category: EncryptedMemoryEntry['category'] = 'task_state'): boolean {
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

  public delete(key: string): boolean {
    this.init();
    if (this.cache.has(key)) {
      this.cache.delete(key);
      this.save();
      return true;
    }
    return false;
  }

  public list(): Record<string, string> {
    this.init();
    const result: Record<string, string> = {};
    for (const [k, v] of this.cache.entries()) {
      result[k] = v.value;
    }
    return result;
  }

  public getStats(): VaultStats {
    this.init();
    return {
      totalKeys: this.cache.size,
      isEncryptionAvailable: safeStorage.isEncryptionAvailable(),
      storagePath: this.vaultPath,
      lastUpdated: Date.now(),
    };
  }
}

export const agentVault = new AgentMemoryVault();
export const agentMemoryVault = agentVault;
