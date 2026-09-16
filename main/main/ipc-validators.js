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
Object.defineProperty(exports, "__esModule", { value: true });
exports.validateString = validateString;
exports.validateBoolean = validateBoolean;
exports.validateNumber = validateNumber;
exports.validateUrl = validateUrl;
exports.validatePartition = validatePartition;
exports.validateBridgeConfig = validateBridgeConfig;
exports.validateOrigin = validateOrigin;
exports.validateObject = validateObject;
exports.validateArray = validateArray;
exports.validateTorPartitionMap = validateTorPartitionMap;
exports.getTorManager = getTorManager;
const electron_1 = require("electron");
function validateString(input, maxLen = 2048) {
    if (typeof input !== 'string')
        return { success: false, error: 'Expected string' };
    if (input.length > maxLen)
        return { success: false, error: `String too long (max ${maxLen})` };
    if (!input.trim())
        return { success: false, error: 'String cannot be empty' };
    return { success: true, data: input.trim() };
}
function validateBoolean(input) {
    if (typeof input !== 'boolean')
        return { success: false, error: 'Expected boolean' };
    return { success: true, data: input };
}
function validateNumber(input, min, max) {
    if (typeof input !== 'number' || !Number.isFinite(input))
        return { success: false, error: 'Expected finite number' };
    if (min !== undefined && input < min)
        return { success: false, error: `Number must be >= ${min}` };
    if (max !== undefined && input > max)
        return { success: false, error: `Number must be <= ${max}` };
    return { success: true, data: input };
}
function validateUrl(input) {
    const s = validateString(input, 2048);
    if (!s.success)
        return s;
    try {
        const u = new URL(s.data);
        if (!['http:', 'https:', 'about:', 'chrome:'].includes(u.protocol)) {
            return { success: false, error: 'Invalid protocol' };
        }
        return { success: true, data: s.data };
    }
    catch {
        return { success: false, error: 'Invalid URL' };
    }
}
function validatePartition(input) {
    const s = validateString(input, 256);
    if (!s.success)
        return s;
    const p = s.data;
    if (!/^(persist:|incognito-|tor-)/.test(p)) {
        return { success: false, error: 'Invalid partition format' };
    }
    if (!/^[a-zA-Z0-9:_-]+$/.test(p)) {
        return { success: false, error: 'Partition contains invalid characters' };
    }
    try {
        electron_1.session.fromPartition(p);
    }
    catch {
        return { success: false, error: 'Session creation failed' };
    }
    return { success: true, data: p };
}
function validateBridgeConfig(input) {
    if (!input || typeof input !== 'object')
        return { success: false, error: 'Expected object' };
    const o = input;
    if (!['obfs4', 'snowflake', 'meek'].includes(o.type)) {
        return { success: false, error: 'Invalid bridge type' };
    }
    if (typeof o.address !== 'string' || !o.address.trim()) {
        return { success: false, error: 'Invalid address' };
    }
    if (typeof o.port !== 'number' || o.port < 1 || o.port > 65535) {
        return { success: false, error: 'Invalid port' };
    }
    return {
        success: true,
        data: {
            type: o.type,
            address: o.address.trim(),
            port: o.port,
            fingerprint: typeof o.fingerprint === 'string' ? o.fingerprint.trim() : undefined,
            cert: typeof o.cert === 'string' ? o.cert.trim() : undefined,
            iatMode: typeof o.iatMode === 'number' ? o.iatMode : undefined,
        },
    };
}
function validateOrigin(input) {
    const s = validateString(input, 256);
    if (!s.success)
        return s;
    try {
        new URL(s.data);
        return { success: true, data: s.data };
    }
    catch {
        return { success: false, error: 'Invalid origin URL' };
    }
}
function validateObject(input, schema) {
    if (!input || typeof input !== 'object')
        return { success: false, error: 'Expected object' };
    const o = input;
    const result = {};
    for (const [key, validator] of Object.entries(schema)) {
        const res = validator(o[key]);
        if (!res.success)
            return { success: false, error: `${key}: ${res.error}` };
        result[key] = res.data;
    }
    return { success: true, data: result };
}
function validateArray(input, itemValidator, maxLen = 1000) {
    if (!Array.isArray(input))
        return { success: false, error: 'Expected array' };
    if (input.length > maxLen)
        return { success: false, error: `Array too long (max ${maxLen})` };
    const result = [];
    for (let i = 0; i < input.length; i++) {
        const res = itemValidator(input[i]);
        if (!res.success)
            return { success: false, error: `[${i}]: ${res.error}` };
        result.push(res.data);
    }
    return { success: true, data: result };
}
function validateTorPartitionMap(input) {
    if (!input || typeof input !== 'object')
        return { success: false, error: 'Expected object' };
    const o = input;
    const map = new Map();
    for (const [k, v] of Object.entries(o)) {
        const vp = validatePartition(k);
        if (!vp.success)
            return { success: false, error: `key: ${vp.error}` };
        const vs = validateString(v);
        if (!vs.success)
            return { success: false, error: `value: ${vs.error}` };
        map.set(vp.data, vs.data);
    }
    return { success: true, data: map };
}
async function getTorManager() {
    const m = await Promise.resolve().then(() => __importStar(require('./tor-manager.js')));
    return m.torManager;
}
