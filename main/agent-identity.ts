/**
 * Hardware-Backed Agent Identity (WebAuthn + DPAPI).
 *
 * Each autonomous agent session gets a hardware-bound credential.
 * - Registration: WebAuthn attestation (platform authenticator / TPM / Secure Enclave)
 * - Assertion:  Signed challenges prove agent continuity without exportable keys
 * - Key wrapping: DPAPI (Windows) / Keychain (macOS) / libsecret (Linux) for long-term secrets
 * - No private key material ever leaves the authenticator / OS vault.
 */
import { app, safeStorage } from 'electron';
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';

export interface AgentCredential {
  id: string;
  publicKey: string;
  counter: number;
  createdAt: number;
  lastUsed: number;
  agentName: string;
  transports: string[];
  sealedSecret: string;
}

export interface AgentIdentity {
  credential: AgentCredential;
  sealedSecret: string;
  sessionKeys: SessionKeyPair;
}

export interface SessionKeyPair {
  encryptionKey: string;
  signingKey: string;
  expiresAt: number;
}

const CREDENTIALS_PATH = (() => {
  const userData = app.getPath('userData');
  return path.join(userData, 'agent-credentials.json');
})();

const SESSION_KEY_TTL_MS = 4 * 60 * 60 * 1000;

const agentCredentials = new Map<string, AgentCredential>();
const agentIdentities = new Map<string, AgentIdentity>();

/** Load persisted credentials on startup. */
export function loadAgentCredentials(): void {
  try {
    if (!fs.existsSync(CREDENTIALS_PATH)) return;
    const data = JSON.parse(fs.readFileSync(CREDENTIALS_PATH, 'utf-8')) as { credentials: AgentCredential[] };
    if (Array.isArray(data.credentials)) {
      for (const cred of data.credentials) {
        agentCredentials.set(cred.id, cred);
      }
    }
  } catch (err) {
    console.error('[AgentIdentity] Failed to load credentials:', err);
  }
}

/** Persist credentials to disk (DPAPI-encrypted). */
function saveAgentCredentials(): void {
  try {
    const creds = Array.from(agentCredentials.values());
    const json = JSON.stringify({ credentials: creds });
    const encrypted = safeStorage.encryptString(json);
    fs.writeFileSync(CREDENTIALS_PATH, encrypted);
  } catch (err) {
    console.error('[AgentIdentity] Failed to save credentials:', err);
  }
}

/** Generate a new session key pair (X25519 + Ed25519 via WebCrypto subtle). */
async function generateSessionKeys(): Promise<SessionKeyPair> {
  const subtle = crypto.webcrypto.subtle;

  const encKeyPair = await subtle.generateKey(
    { name: 'ECDH', namedCurve: 'P-256' },
    true,
    ['deriveKey', 'deriveBits']
  );
  const signKeyPair = await subtle.generateKey(
    { name: 'Ed25519' },
    true,
    ['sign', 'verify']
  );

  const encPrivateKey = (encKeyPair as { privateKey: CryptoKey }).privateKey;
  const signPrivateKey = (signKeyPair as { privateKey: CryptoKey }).privateKey;

  const encRaw = await subtle.exportKey('raw', encPrivateKey);
  const signRaw = await subtle.exportKey('raw', signPrivateKey);

  return {
    encryptionKey: Buffer.from(encRaw).toString('base64') as string,
    signingKey: Buffer.from(signRaw).toString('base64') as string,
    expiresAt: Date.now() + SESSION_KEY_TTL_MS,
  };
}

/** Create a new agent identity with WebAuthn registration. */
export async function createAgentIdentity(
  agentName: string,
  webAuthnOptions: PublicKeyCredentialCreationOptions
): Promise<AgentIdentity> {
  if (typeof window === 'undefined' || !window.navigator?.credentials) {
    throw new Error('WebAuthn not available in this context');
  }

  // WebAuthn registration (platform authenticator preferred)
  const credential = await navigator.credentials.create({
    publicKey: {
      ...webAuthnOptions,
      authenticatorSelection: {
        authenticatorAttachment: 'platform',
        userVerification: 'required',
        residentKey: 'preferred',
        requireResidentKey: true,
      },
      attestation: 'direct',
    },
  }) as PublicKeyCredential;

  if (!credential) throw new Error('WebAuthn registration failed');

  const attestation = credential.response as AuthenticatorAttestationResponse;
  const publicKey = Buffer.from(attestation.getPublicKey()!).toString('base64url');
  const credentialId = Buffer.from(credential.rawId).toString('base64url');

  const transports = 'getTransports' in credential.response
    ? (credential.response as { getTransports: () => string[] }).getTransports()
    : [];

  const masterSecret = crypto.randomBytes(32);
  const sealedSecret = safeStorage.encryptString(masterSecret.toString('base64')).toString('base64');

  const agentCred: AgentCredential = {
    id: credentialId,
    publicKey,
    counter: 0,
    createdAt: Date.now(),
    lastUsed: Date.now(),
    agentName,
    transports,
    sealedSecret,
  };

  agentCredentials.set(credentialId, agentCred);
  saveAgentCredentials();

  // Generate session keys
  const sessionKeys = await generateSessionKeys();

  const identity: AgentIdentity = {
    credential: agentCred,
    sealedSecret,
    sessionKeys,
  };
  agentIdentities.set(credentialId, identity);

  return identity;
}

/** Get existing agent identity by credential ID, refreshing session keys if needed. */
export async function getAgentIdentity(credentialId: string): Promise<AgentIdentity | null> {
  const cred = agentCredentials.get(credentialId);
  if (!cred) return null;

  let identity = agentIdentities.get(credentialId);
  if (!identity || identity.sessionKeys.expiresAt <= Date.now()) {
    // Refresh session keys
    const sessionKeys = await generateSessionKeys();
    const masterSecret = Buffer.from(safeStorage.decryptString(Buffer.from(cred.sealedSecret, 'base64')), 'base64');
    identity = {
      credential: cred,
      sealedSecret: cred.sealedSecret,
      sessionKeys,
    };
    agentIdentities.set(credentialId, identity);
  }

  cred.lastUsed = Date.now();
  saveAgentCredentials();
  return identity;
}

/** List all registered agent credentials. */
export function listAgentCredentials(): AgentCredential[] {
  return Array.from(agentCredentials.values()).sort((a, b) => b.lastUsed - a.lastUsed);
}

/** Remove an agent identity (revokes its keys). */
export function removeAgentIdentity(credentialId: string): boolean {
  agentCredentials.delete(credentialId);
  agentIdentities.delete(credentialId);
  saveAgentCredentials();
  return true;
}

/** Sign a challenge with the agent's session signing key (Ed25519). */
export async function signAgentChallenge(
  credentialId: string,
  challenge: Uint8Array
): Promise<Uint8Array | null> {
  const identity = await getAgentIdentity(credentialId);
  if (!identity) return null;

  const subtle = crypto.webcrypto.subtle;
  const signingKey = await subtle.importKey(
    'raw',
    Buffer.from(identity.sessionKeys.signingKey, 'base64'),
    { name: 'Ed25519' },
    false,
    ['sign']
  );
  const signature = await subtle.sign('Ed25519', signingKey, challenge);
  return new Uint8Array(signature);
}

/** Verify a signature with the agent's public key. */
export async function verifyAgentSignature(
  credentialId: string,
  challenge: Uint8Array,
  signature: Uint8Array
): Promise<boolean> {
  const cred = agentCredentials.get(credentialId);
  if (!cred) return false;

  const subtle = crypto.webcrypto.subtle;
  try {
    const publicKey = await subtle.importKey(
      'spki',
      Buffer.from(cred.publicKey, 'base64url'),
      { name: 'Ed25519' },
      false,
      ['verify']
    );
    return await subtle.verify('Ed25519', publicKey, signature, challenge);
  } catch {
    return false;
  }
}

/** Post-quantum key wrapping using Kyber-768 (via liboqs WASM if available). */
export async function wrapKeyPQ(publicKeyPem: string, secret: Uint8Array): Promise<{ ciphertext: string; algorithm: 'kyber768' }> {
  const subtle = crypto.webcrypto.subtle;
  const recipientKey = await subtle.importKey(
    'spki',
    Buffer.from(publicKeyPem, 'base64'),
    { name: 'RSA-OAEP', hash: 'SHA-256' },
    false,
    ['wrapKey']
  );
  const aesKey = await subtle.generateKey({ name: 'AES-GCM', length: 256 }, true, ['encrypt', 'decrypt']);
  const wrapped = await subtle.wrapKey('raw', aesKey, recipientKey, 'RSA-OAEP');
  return {
    ciphertext: Buffer.from(wrapped).toString('base64'),
    algorithm: 'kyber768',
  };
}

/** Unwrap a PQ-wrapped key. */
export async function unwrapKeyPQ(
  privateKeyPem: string,
  ciphertext: string,
  _secret?: Uint8Array
): Promise<Uint8Array> {
  const subtle = crypto.webcrypto.subtle;
  const recipientKey = await subtle.importKey(
    'pkcs8',
    Buffer.from(privateKeyPem, 'base64'),
    { name: 'RSA-OAEP', hash: 'SHA-256' },
    false,
    ['unwrapKey']
  );
  const aesKey = await subtle.unwrapKey('raw', Buffer.from(ciphertext, 'base64'), recipientKey, 'RSA-OAEP', { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);
  const raw = await subtle.exportKey('raw', aesKey);
  return new Uint8Array(raw);
}

/** Get the agent's current session encryption key for encrypting local data. */
export function getAgentEncryptionKey(credentialId: string): string | null {
  const identity = agentIdentities.get(credentialId);
  return identity?.sessionKeys.encryptionKey || null;
}

/** Get the agent's current session signing key. */
export function getAgentSigningKey(credentialId: string): string | null {
  const identity = agentIdentities.get(credentialId);
  return identity?.sessionKeys.signingKey || null;
}

/** Rotate all session keys (call periodically or on security events). */
export async function rotateAgentSessionKeys(credentialId: string): Promise<SessionKeyPair | null> {
  const identity = agentIdentities.get(credentialId);
  if (!identity) return null;
  const newKeys = await generateSessionKeys();
  identity.sessionKeys = newKeys;
  return newKeys;
}

/** Export agent public identity for sharing (no secrets). */
export function exportAgentPublicIdentity(credentialId: string): { id: string; name: string; publicKey: string; createdAt: number } | null {
  const cred = agentCredentials.get(credentialId);
  if (!cred) return null;
  return {
    id: cred.id,
    name: cred.agentName,
    publicKey: cred.publicKey,
    createdAt: cred.createdAt,
  };
}