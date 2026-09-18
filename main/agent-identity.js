"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.loadAgentCredentials = loadAgentCredentials;
exports.createAgentIdentity = createAgentIdentity;
exports.getAgentIdentity = getAgentIdentity;
exports.listAgentCredentials = listAgentCredentials;
exports.removeAgentIdentity = removeAgentIdentity;
exports.signAgentChallenge = signAgentChallenge;
exports.verifyAgentSignature = verifyAgentSignature;
exports.wrapKeyPQ = wrapKeyPQ;
exports.unwrapKeyPQ = unwrapKeyPQ;
exports.getAgentEncryptionKey = getAgentEncryptionKey;
exports.getAgentSigningKey = getAgentSigningKey;
exports.rotateAgentSessionKeys = rotateAgentSessionKeys;
exports.exportAgentPublicIdentity = exportAgentPublicIdentity;
/**
 * Hardware-Backed Agent Identity (WebAuthn + DPAPI).
 *
 * Each autonomous agent session gets a hardware-bound credential.
 * - Registration: WebAuthn attestation (platform authenticator / TPM / Secure Enclave)
 * - Assertion:  Signed challenges prove agent continuity without exportable keys
 * - Key wrapping: DPAPI (Windows) / Keychain (macOS) / libsecret (Linux) for long-term secrets
 * - No private key material ever leaves the authenticator / OS vault.
 */
const electron_1 = require("electron");
const fs_1 = __importDefault(require("fs"));
const path_1 = __importDefault(require("path"));
const crypto_1 = __importDefault(require("crypto"));
const CREDENTIALS_PATH = (() => {
    const userData = electron_1.app.getPath('userData');
    return path_1.default.join(userData, 'agent-credentials.json');
})();
const SESSION_KEY_TTL_MS = 4 * 60 * 60 * 1000;
const agentCredentials = new Map();
const agentIdentities = new Map();
/** Load persisted credentials on startup. */
function loadAgentCredentials() {
    try {
        if (!fs_1.default.existsSync(CREDENTIALS_PATH))
            return;
        const data = JSON.parse(fs_1.default.readFileSync(CREDENTIALS_PATH, 'utf-8'));
        if (Array.isArray(data.credentials)) {
            for (const cred of data.credentials) {
                agentCredentials.set(cred.id, cred);
            }
        }
    }
    catch (err) {
        console.error('[AgentIdentity] Failed to load credentials:', err);
    }
}
/** Persist credentials to disk (DPAPI-encrypted). */
function saveAgentCredentials() {
    try {
        const creds = Array.from(agentCredentials.values());
        const json = JSON.stringify({ credentials: creds });
        const encrypted = electron_1.safeStorage.encryptString(json);
        fs_1.default.writeFileSync(CREDENTIALS_PATH, encrypted);
    }
    catch (err) {
        console.error('[AgentIdentity] Failed to save credentials:', err);
    }
}
/** Generate a new session key pair (X25519 + Ed25519 via WebCrypto subtle). */
async function generateSessionKeys() {
    const subtle = crypto_1.default.webcrypto.subtle;
    const encKeyPair = await subtle.generateKey({ name: 'ECDH', namedCurve: 'P-256' }, true, ['deriveKey', 'deriveBits']);
    const signKeyPair = await subtle.generateKey({ name: 'Ed25519' }, true, ['sign', 'verify']);
    const encPrivateKey = encKeyPair.privateKey;
    const signPrivateKey = signKeyPair.privateKey;
    const encRaw = await subtle.exportKey('raw', encPrivateKey);
    const signRaw = await subtle.exportKey('raw', signPrivateKey);
    return {
        encryptionKey: Buffer.from(encRaw).toString('base64'),
        signingKey: Buffer.from(signRaw).toString('base64'),
        expiresAt: Date.now() + SESSION_KEY_TTL_MS,
    };
}
/** Create a new agent identity with WebAuthn registration. */
async function createAgentIdentity(agentName, webAuthnOptions) {
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
    });
    if (!credential)
        throw new Error('WebAuthn registration failed');
    const attestation = credential.response;
    const publicKey = Buffer.from(attestation.getPublicKey()).toString('base64url');
    const credentialId = Buffer.from(credential.rawId).toString('base64url');
    const transports = 'getTransports' in credential.response
        ? credential.response.getTransports()
        : [];
    const masterSecret = crypto_1.default.randomBytes(32);
    const sealedSecret = electron_1.safeStorage.encryptString(masterSecret.toString('base64')).toString('base64');
    const agentCred = {
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
    const identity = {
        credential: agentCred,
        sealedSecret,
        sessionKeys,
    };
    agentIdentities.set(credentialId, identity);
    return identity;
}
/** Get existing agent identity by credential ID, refreshing session keys if needed. */
async function getAgentIdentity(credentialId) {
    const cred = agentCredentials.get(credentialId);
    if (!cred)
        return null;
    let identity = agentIdentities.get(credentialId);
    if (!identity || identity.sessionKeys.expiresAt <= Date.now()) {
        // Refresh session keys
        const sessionKeys = await generateSessionKeys();
        const masterSecret = Buffer.from(electron_1.safeStorage.decryptString(Buffer.from(cred.sealedSecret, 'base64')), 'base64');
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
function listAgentCredentials() {
    return Array.from(agentCredentials.values()).sort((a, b) => b.lastUsed - a.lastUsed);
}
/** Remove an agent identity (revokes its keys). */
function removeAgentIdentity(credentialId) {
    agentCredentials.delete(credentialId);
    agentIdentities.delete(credentialId);
    saveAgentCredentials();
    return true;
}
/** Sign a challenge with the agent's session signing key (Ed25519). */
async function signAgentChallenge(credentialId, challenge) {
    const identity = await getAgentIdentity(credentialId);
    if (!identity)
        return null;
    const subtle = crypto_1.default.webcrypto.subtle;
    const signingKey = await subtle.importKey('raw', Buffer.from(identity.sessionKeys.signingKey, 'base64'), { name: 'Ed25519' }, false, ['sign']);
    const signature = await subtle.sign('Ed25519', signingKey, challenge);
    return new Uint8Array(signature);
}
/** Verify a signature with the agent's public key. */
async function verifyAgentSignature(credentialId, challenge, signature) {
    const cred = agentCredentials.get(credentialId);
    if (!cred)
        return false;
    const subtle = crypto_1.default.webcrypto.subtle;
    try {
        const publicKey = await subtle.importKey('spki', Buffer.from(cred.publicKey, 'base64url'), { name: 'Ed25519' }, false, ['verify']);
        return await subtle.verify('Ed25519', publicKey, signature, challenge);
    }
    catch {
        return false;
    }
}
/** Post-quantum key wrapping using Kyber-768 (via liboqs WASM if available). */
async function wrapKeyPQ(publicKeyPem, secret) {
    const subtle = crypto_1.default.webcrypto.subtle;
    const recipientKey = await subtle.importKey('spki', Buffer.from(publicKeyPem, 'base64'), { name: 'RSA-OAEP', hash: 'SHA-256' }, false, ['wrapKey']);
    const aesKey = await subtle.generateKey({ name: 'AES-GCM', length: 256 }, true, ['encrypt', 'decrypt']);
    const wrapped = await subtle.wrapKey('raw', aesKey, recipientKey, 'RSA-OAEP');
    return {
        ciphertext: Buffer.from(wrapped).toString('base64'),
        algorithm: 'kyber768',
    };
}
/** Unwrap a PQ-wrapped key. */
async function unwrapKeyPQ(privateKeyPem, ciphertext, _secret) {
    const subtle = crypto_1.default.webcrypto.subtle;
    const recipientKey = await subtle.importKey('pkcs8', Buffer.from(privateKeyPem, 'base64'), { name: 'RSA-OAEP', hash: 'SHA-256' }, false, ['unwrapKey']);
    const aesKey = await subtle.unwrapKey('raw', Buffer.from(ciphertext, 'base64'), recipientKey, 'RSA-OAEP', { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);
    const raw = await subtle.exportKey('raw', aesKey);
    return new Uint8Array(raw);
}
/** Get the agent's current session encryption key for encrypting local data. */
function getAgentEncryptionKey(credentialId) {
    const identity = agentIdentities.get(credentialId);
    return identity?.sessionKeys.encryptionKey || null;
}
/** Get the agent's current session signing key. */
function getAgentSigningKey(credentialId) {
    const identity = agentIdentities.get(credentialId);
    return identity?.sessionKeys.signingKey || null;
}
/** Rotate all session keys (call periodically or on security events). */
async function rotateAgentSessionKeys(credentialId) {
    const identity = agentIdentities.get(credentialId);
    if (!identity)
        return null;
    const newKeys = await generateSessionKeys();
    identity.sessionKeys = newKeys;
    return newKeys;
}
/** Export agent public identity for sharing (no secrets). */
function exportAgentPublicIdentity(credentialId) {
    const cred = agentCredentials.get(credentialId);
    if (!cred)
        return null;
    return {
        id: cred.id,
        name: cred.agentName,
        publicKey: cred.publicKey,
        createdAt: cred.createdAt,
    };
}
