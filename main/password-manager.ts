import { ipcMain } from 'electron';
import * as keytar from 'keytar';
import crypto from 'crypto';

const SERVICE_NAME = 'GeminiBrowser';
const VAULT_KEY = 'password-vault';
const MASTER_KEY_PREFIX = 'master-key-';

interface PasswordEntry {
  id: string;
  url: string;
  username: string;
  password: string;
  title?: string;
  notes?: string;
  createdAt: number;
  updatedAt: number;
  category?: string;
}

interface Vault {
  entries: PasswordEntry[];
  version: number;
}

let masterKeyHash: string | null = null;
let encryptionKey: Buffer | null = null;

function deriveKey(password: string, salt: Buffer): Buffer {
  return crypto.pbkdf2Sync(password, salt, 100000, 32, 'sha256');
}

function encrypt(data: string, key: Buffer): string {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  const encrypted = Buffer.concat([cipher.update(data, 'utf8'), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return iv.toString('hex') + ':' + authTag.toString('hex') + ':' + encrypted.toString('hex');
}

function decrypt(encryptedData: string, key: Buffer): string {
  const [ivHex, authTagHex, encryptedHex] = encryptedData.split(':');
  const iv = Buffer.from(ivHex, 'hex');
  const authTag = Buffer.from(authTagHex, 'hex');
  const encrypted = Buffer.from(encryptedHex, 'hex');
  const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
  decipher.setAuthTag(authTag);
  const decrypted = Buffer.concat([decipher.update(encrypted), decipher.final()]);
  return decrypted.toString('utf8');
}

async function getOrCreateSalt(): Promise<Buffer> {
  const saltKey = 'vault-salt';
  let saltHex = await keytar.getPassword(SERVICE_NAME, saltKey);
  if (!saltHex) {
    const salt = crypto.randomBytes(16);
    saltHex = salt.toString('hex');
    await keytar.setPassword(SERVICE_NAME, saltKey, saltHex);
  }
  return Buffer.from(saltHex, 'hex');
}

async function setMasterPassword(password: string): Promise<void> {
  const salt = await getOrCreateSalt();
  const key = deriveKey(password, salt);
  masterKeyHash = crypto.createHash('sha256').update(key).digest('hex');
  encryptionKey = key;
  await keytar.setPassword(SERVICE_NAME, MASTER_KEY_PREFIX + 'hash', masterKeyHash);
}

async function unlockVault(password: string): Promise<boolean> {
  try {
    if (!masterKeyHash) {
      return false;
    }
    const salt = await getOrCreateSalt();
    const key = deriveKey(password, salt);
    const hash = crypto.createHash('sha256').update(key).digest('hex');

    if (hash !== masterKeyHash) {
      return false;
    }

    encryptionKey = key;
    return true;
  } catch (err) {
    console.error('Unlock failed:', err);
    return false;
  }
}

function lockVault(): void {
  encryptionKey = null;
  masterKeyHash = null;
}

async function getVault(): Promise<Vault> {
  if (!encryptionKey) throw new Error('Vault locked');

  try {
    const vaultHex = await keytar.getPassword(SERVICE_NAME, VAULT_KEY);
    if (!vaultHex) {
      return { entries: [], version: 1 };
    }
    const decrypted = decrypt(vaultHex, encryptionKey);
    return JSON.parse(decrypted);
  } catch (err) {
    console.error('Failed to get vault:', err);
    return { entries: [], version: 1 };
  }
}

async function saveVault(vault: Vault): Promise<void> {
  if (!encryptionKey) throw new Error('Vault locked');
  const encrypted = encrypt(JSON.stringify(vault), encryptionKey);
  await keytar.setPassword(SERVICE_NAME, VAULT_KEY, encrypted);
}

export function initPasswordManager(): void {
  // Initialize master key hash from keytar
  keytar.getPassword(SERVICE_NAME, MASTER_KEY_PREFIX + 'hash').then(hash => {
    masterKeyHash = hash;
  });

  // IPC Handlers
  ipcMain.handle('password:has-master', async () => {
    return !!masterKeyHash;
  });

  ipcMain.handle('password:set-master', async (_event, password: string) => {
    await setMasterPassword(password);
    return true;
  });

  ipcMain.handle('password:unlock', async (_event, password: string) => {
    const success = await unlockVault(password);
    return success;
  });

  ipcMain.handle('password:lock', async () => {
    lockVault();
    return true;
  });

  ipcMain.handle('password:is-unlocked', async () => {
    return !!encryptionKey;
  });

  ipcMain.handle('password:get-all', async () => {
    if (!encryptionKey) throw new Error('Vault locked');
    const vault = await getVault();
    return vault.entries.map(e => ({ ...e, password: '[HIDDEN]' }));
  });

  ipcMain.handle('password:get-entry', async (_event, id: string) => {
    if (!encryptionKey) throw new Error('Vault locked');
    const vault = await getVault();
    const entry = vault.entries.find(e => e.id === id);
    if (!entry) return null;
    return { ...entry, password: decrypt(entry.password, encryptionKey) };
  });

  ipcMain.handle(
    'password:add',
    async (_event, entry: Omit<PasswordEntry, 'id' | 'createdAt' | 'updatedAt'>) => {
      if (!encryptionKey) throw new Error('Vault locked');
      const vault = await getVault();
      const newEntry: PasswordEntry = {
        ...entry,
        id: crypto.randomBytes(16).toString('hex'),
        password: encrypt(entry.password, encryptionKey),
        createdAt: Date.now(),
        updatedAt: Date.now(),
      };
      vault.entries.push(newEntry);
      await saveVault(vault);
      return { ...newEntry, password: '[HIDDEN]' };
    }
  );

  ipcMain.handle('password:update', async (_event, id: string, updates: Partial<PasswordEntry>) => {
    if (!encryptionKey) throw new Error('Vault locked');
    const vault = await getVault();
    const index = vault.entries.findIndex(e => e.id === id);
    if (index === -1) throw new Error('Entry not found');

    if (updates.password) {
      updates.password = encrypt(updates.password, encryptionKey);
    }
    vault.entries[index] = { ...vault.entries[index], ...updates, updatedAt: Date.now() };
    await saveVault(vault);
    return { ...vault.entries[index], password: '[HIDDEN]' };
  });

  ipcMain.handle('password:delete', async (_event, id: string) => {
    if (!encryptionKey) throw new Error('Vault locked');
    const vault = await getVault();
    vault.entries = vault.entries.filter(e => e.id !== id);
    await saveVault(vault);
    return true;
  });

  ipcMain.handle('password:generate', async (_event, length: number = 16) => {
    const charset = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789!@#$%^&*';
    const maxValid = Math.floor(256 / charset.length) * charset.length;
    let password = '';
    while (password.length < length) {
      const byte = crypto.randomBytes(1)[0];
      if (byte < maxValid) {
        password += charset[byte % charset.length];
      }
    }
    return password;
  });

  ipcMain.handle('password:import', async (_event, data: string) => {
    if (!encryptionKey) throw new Error('Vault locked');
    try {
      const imported = JSON.parse(data);
      if (!imported.entries || !Array.isArray(imported.entries)) {
        throw new Error('Invalid import format');
      }
      const vault = await getVault();
      let importedCount = 0;
      for (const entry of imported.entries) {
        if (!entry.url || typeof entry.url !== 'string') continue;
        if (!entry.username || typeof entry.username !== 'string') continue;
        if (!entry.password || typeof entry.password !== 'string') continue;
        if (entry.password && !entry.password.startsWith('encrypted:')) {
          entry.password = encrypt(entry.password, encryptionKey);
        }
        entry.id = crypto.randomBytes(16).toString('hex');
        entry.createdAt = Date.now();
        entry.updatedAt = Date.now();
        vault.entries.push(entry);
        importedCount++;
      }
      await saveVault(vault);
      return importedCount;
    } catch (err) {
      throw new Error('Import failed: ' + (err as Error).message);
    }
  });

  ipcMain.handle('password:export', async () => {
    if (!encryptionKey) throw new Error('Vault locked');
    const vault = await getVault();
    const exportable = {
      entries: vault.entries.map(e => ({
        ...e,
        password: decrypt(e.password, encryptionKey),
      })),
      exportedAt: Date.now(),
    };
    return JSON.stringify(exportable, null, 2);
  });

  ipcMain.handle(
    'password:change-master',
    async (_event, currentPassword: string, newPassword: string) => {
      const success = await unlockVault(currentPassword);
      if (!success) throw new Error('Current master password incorrect');

      // Re-encrypt all entries with new key BEFORE changing the master key
      const vault = await getVault();
      const oldKey = encryptionKey!;

      // Pre-derive the new key without committing it yet
      const salt = await getOrCreateSalt();
      const newKey = deriveKey(newPassword, salt);
      const newHash = crypto.createHash('sha256').update(newKey).digest('hex');

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
    }
  );

  ipcMain.handle('password:encrypt-sync-data', async (_event, plaintext: string) => {
    if (!encryptionKey) throw new Error('Vault locked');
    return encrypt(plaintext, encryptionKey);
  });

  ipcMain.handle('password:decrypt-sync-data', async (_event, ciphertext: string) => {
    if (!encryptionKey) throw new Error('Vault locked');
    try {
      return decrypt(ciphertext, encryptionKey);
    } catch {
      throw new Error('Decryption of sync data failed (incorrect master password or corrupted data)');
    }
  });
}
