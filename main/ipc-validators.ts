import { session } from 'electron';

export function validateString(input: unknown, maxLen = 2048): { success: boolean; data?: string; error?: string } {
  if (typeof input !== 'string') return { success: false, error: 'Expected string' };
  if (input.length > maxLen) return { success: false, error: `String too long (max ${maxLen})` };
  if (!input.trim()) return { success: false, error: 'String cannot be empty' };
  return { success: true, data: input.trim() };
}

export function validateBoolean(input: unknown): { success: boolean; data?: boolean; error?: string } {
  if (typeof input !== 'boolean') return { success: false, error: 'Expected boolean' };
  return { success: true, data: input };
}

export function validateNumber(input: unknown, min?: number, max?: number): { success: boolean; data?: number; error?: string } {
  if (typeof input !== 'number' || !Number.isFinite(input)) return { success: false, error: 'Expected finite number' };
  if (min !== undefined && input < min) return { success: false, error: `Number must be >= ${min}` };
  if (max !== undefined && input > max) return { success: false, error: `Number must be <= ${max}` };
  return { success: true, data: input };
}

export function validateUrl(input: unknown): { success: boolean; data?: string; error?: string } {
  const s = validateString(input, 2048);
  if (!s.success) return s;
  try {
    const u = new URL(s.data!);
    if (!['http:', 'https:', 'about:', 'chrome:'].includes(u.protocol)) {
      return { success: false, error: 'Invalid protocol' };
    }
    return { success: true, data: s.data! };
  } catch {
    return { success: false, error: 'Invalid URL' };
  }
}

export function validatePartition(input: unknown): { success: boolean; data?: string; error?: string } {
  const s = validateString(input, 256);
  if (!s.success) return s;
  const p = s.data!;
  if (!/^(persist:|incognito-|tor-)/.test(p)) {
    return { success: false, error: 'Invalid partition format' };
  }
  if (!/^[a-zA-Z0-9:_-]+$/.test(p)) {
    return { success: false, error: 'Partition contains invalid characters' };
  }
  try {
    session.fromPartition(p);
  } catch {
    return { success: false, error: 'Session creation failed' };
  }
  return { success: true, data: p };
}

export function validateBridgeConfig(input: unknown): { success: boolean; data?: { type: 'obfs4' | 'snowflake' | 'meek'; address: string; port: number; fingerprint?: string; cert?: string; iatMode?: number }; error?: string } {
  if (!input || typeof input !== 'object') return { success: false, error: 'Expected object' };
  const o = input as Record<string, unknown>;
  if (!['obfs4', 'snowflake', 'meek'].includes(o.type as string)) {
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
      type: o.type as 'obfs4' | 'snowflake' | 'meek',
      address: o.address.trim(),
      port: o.port,
      fingerprint: typeof o.fingerprint === 'string' ? o.fingerprint.trim() : undefined,
      cert: typeof o.cert === 'string' ? o.cert.trim() : undefined,
      iatMode: typeof o.iatMode === 'number' ? o.iatMode : undefined,
    },
  };
}

export function validateOrigin(input: unknown): { success: boolean; data?: string; error?: string } {
  const s = validateString(input, 256);
  if (!s.success) return s;
  try {
    new URL(s.data!);
    return { success: true, data: s.data! };
  } catch {
    return { success: false, error: 'Invalid origin URL' };
  }
}

export function validateObject<T>(input: unknown, schema: Record<string, (v: unknown) => { success: boolean; data?: T; error?: string }>): { success: boolean; data?: T; error?: string } {
  if (!input || typeof input !== 'object') return { success: false, error: 'Expected object' };
  const o = input as Record<string, unknown>;
  const result: Record<string, T> = {};
  for (const [key, validator] of Object.entries(schema)) {
    const res = validator(o[key]);
    if (!res.success) return { success: false, error: `${key}: ${res.error}` };
    result[key] = res.data!;
  }
  return { success: true, data: result as T };
}

export function validateArray<T>(input: unknown, itemValidator: (v: unknown) => { success: boolean; data?: T; error?: string }, maxLen = 1000): { success: boolean; data?: T[]; error?: string } {
  if (!Array.isArray(input)) return { success: false, error: 'Expected array' };
  if (input.length > maxLen) return { success: false, error: `Array too long (max ${maxLen})` };
  const result: T[] = [];
  for (let i = 0; i < input.length; i++) {
    const res = itemValidator(input[i]);
    if (!res.success) return { success: false, error: `[${i}]: ${res.error}` };
    result.push(res.data!);
  }
  return { success: true, data: result };
}

export function validateTorPartitionMap(input: unknown): { success: boolean; data?: Map<string, string>; error?: string } {
  if (!input || typeof input !== 'object') return { success: false, error: 'Expected object' };
  const o = input as Record<string, unknown>;
  const map = new Map<string, string>();
  for (const [k, v] of Object.entries(o)) {
    const vp = validatePartition(k);
    if (!vp.success) return { success: false, error: `key: ${vp.error}` };
    const vs = validateString(v);
    if (!vs.success) return { success: false, error: `value: ${vs.error}` };
    map.set(vp.data!, vs.data!);
  }
  return { success: true, data: map };
}

export async function getTorManager() {
  const m = await import('./tor-manager.js');
  return m.torManager;
}