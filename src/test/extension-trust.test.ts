import { describe, it, expect } from 'vitest';
import {
  parseCrxZipRange,
  assessManifest,
  parseBlocklist,
  matchesBlocklist,
  getSeedBlocklist,
  mergeBlocklists,
} from '@main/extension-trust';

describe('parseCrxZipRange', () => {
  it('should throw on files smaller than 4 bytes', () => {
    expect(() => parseCrxZipRange(new Uint8Array([0x43, 0x72, 0x32]))).toThrow('too small');
  });

  it('should detect CRX3 format', () => {
    // CRX3 magic: Cr24 (0x43 0x72 0x32 0x34) + version(4) + header_size(4 LE)
    const headerSize = 100;
    const data = new Uint8Array(12 + headerSize + 10);
    data[0] = 0x43; data[1] = 0x72; data[2] = 0x32; data[3] = 0x34; // magic
    data[3] = 0x34;
    // version at offset 4-7 (uint32 LE)
    const view = new DataView(data.buffer);
    view.setUint32(4, 3, true); // version 3
    view.setUint32(8, headerSize, true); // header size LE
    const result = parseCrxZipRange(data);
    expect(result.format).toBe('crx3');
    expect(result.start).toBe(12 + headerSize);
  });

  it('should throw on truncated CRX3', () => {
    const data = new Uint8Array([0x43, 0x72, 0x32, 0x34, 0, 0, 0, 0, 0, 0, 0, 0]);
    // header size = 200 but file is only 12 bytes
    const view = new DataView(data.buffer);
    view.setUint32(8, 200, true);
    expect(() => parseCrxZipRange(data)).toThrow('claims more bytes');
  });

  it('should detect CRX2 format', () => {
    // CRX2 magic: Cr23 (0x43 0x72 0x32 0x33) + version(4) + header_size(2 BE)
    const headerSize = 50;
    const data = new Uint8Array(10 + headerSize + 10);
    data[0] = 0x43; data[1] = 0x72; data[2] = 0x32; data[3] = 0x33;
    const view = new DataView(data.buffer);
    view.setUint32(4, 2, true); // version 2
    view.setUint16(8, headerSize, false); // header size BE
    const result = parseCrxZipRange(data);
    expect(result.format).toBe('crx2');
    expect(result.start).toBe(10 + headerSize);
  });

  it('should throw on truncated CRX2', () => {
    const data = new Uint8Array([0x43, 0x72, 0x32, 0x33, 0, 0, 0, 0, 0, 0]);
    const view = new DataView(data.buffer);
    view.setUint16(8, 500, false);
    expect(() => parseCrxZipRange(data)).toThrow('claims more bytes');
  });

  it('should detect plain ZIP format', () => {
    const data = new Uint8Array([0x50, 0x4b, 0x03, 0x04, 0, 0, 0, 0]);
    const result = parseCrxZipRange(data);
    expect(result.format).toBe('zip');
    expect(result.start).toBe(0);
  });

  it('should detect HTML error page and throw', () => {
    // "<!" (HTML doctype)
    const data = new Uint8Array([0x3c, 0x21, 0x44, 0x4f]);
    expect(() => parseCrxZipRange(data)).toThrow('HTML page');
    // "<html"
    const data2 = new Uint8Array([0x3c, 0x68, 0x74, 0x6d]);
    expect(() => parseCrxZipRange(data2)).toThrow('HTML page');
    // "<HTML"
    const data3 = new Uint8Array([0x3c, 0x48, 0x54, 0x4d]);
    expect(() => parseCrxZipRange(data3)).toThrow('HTML page');
  });

  it('should throw for unknown binary format', () => {
    const data = new Uint8Array([0xff, 0xd8, 0xff, 0xe0]); // JPEG
    expect(() => parseCrxZipRange(data)).toThrow('not a valid extension');
  });
});

describe('assessManifest', () => {
  it('should block non-object manifests', () => {
    const report = assessManifest(null);
    expect(report.riskLevel).toBe('blocked');
    expect(report.findings[0]).toContain('missing');
  });

  it('should block manifests without manifest_version', () => {
    const report = assessManifest({ name: 'Test' });
    expect(report.riskLevel).toBe('blocked');
    expect(report.findings.some(f => f.includes('manifest_version'))).toBe(true);
  });

  it('should assess MV3 extension with no permissions as low risk', () => {
    const report = assessManifest({
      name: 'Simple Ext',
      version: '1.0',
      manifest_version: 3,
    });
    expect(report.riskLevel).toBe('low');
    expect(report.name).toBe('Simple Ext');
    expect(report.version).toBe('1.0');
  });

  it('should assess MV2 as low risk with legacy warning', () => {
    const report = assessManifest({
      name: 'Old Ext',
      version: '0.5',
      manifest_version: 2,
      permissions: ['storage'],
    });
    expect(report.riskLevel).toBe('low');
    expect(report.findings.some(f => f.includes('legacy manifest v2'))).toBe(true);
  });

  it('should flag high-risk permissions', () => {
    const report = assessManifest({
      name: 'Risky',
      version: '1.0',
      manifest_version: 3,
      permissions: ['debugger', 'proxy'],
    });
    expect(report.riskLevel).toBe('high');
    expect(report.findings.some(f => f.includes('debugger'))).toBe(true);
  });

  it('should flag broad host access as elevated', () => {
    const report = assessManifest({
      name: 'Broad',
      version: '1.0',
      manifest_version: 3,
      permissions: ['storage'],
      host_permissions: ['<all_urls>'],
    });
    expect(report.riskLevel).toBe('elevated');
    expect(report.findings.some(f => f.includes('<all_urls>'))).toBe(true);
  });

  it('should extract host permissions from content_scripts matches', () => {
    const report = assessManifest({
      name: 'Content',
      version: '1.0',
      manifest_version: 3,
      permissions: ['storage'],
      content_scripts: [{ matches: ['https://*.google.com/*'] }],
    });
    expect(report.hostPermissions).toContain('https://*.google.com/*');
  });

  it('should handle missing name/version gracefully', () => {
    const report = assessManifest({ manifest_version: 3 });
    expect(report.name).toBe('unnamed extension');
    expect(report.version).toBe('unknown');
  });
});

describe('parseBlocklist', () => {
  it('should parse one ID per line', () => {
    const list = parseBlocklist('abc123\ndef456\n');
    expect(list.size).toBe(2);
    expect(list.has('abc123')).toBe(true);
    expect(list.has('def456')).toBe(true);
  });

  it('should skip comments and empty lines', () => {
    const list = parseBlocklist('# comment\n\nabc123\n  \ndef456\n');
    expect(list.size).toBe(2);
  });

  it('should lowercase all IDs', () => {
    const list = parseBlocklist('ABC123\n');
    expect(list.has('abc123')).toBe(true);
  });
});

describe('matchesBlocklist', () => {
  it('should match case-insensitively', () => {
    const blocklist = new Set(['abc123']);
    expect(matchesBlocklist('ABC123', blocklist)).toBe(true);
    expect(matchesBlocklist('abc123', blocklist)).toBe(true);
  });

  it('should return false for undefined ID', () => {
    expect(matchesBlocklist(undefined, new Set(['abc']))).toBe(false);
  });

  it('should return false for non-matching ID', () => {
    expect(matchesBlocklist('xyz789', new Set(['abc123']))).toBe(false);
  });
});

describe('getSeedBlocklist', () => {
  it('should return a non-empty Set', () => {
    const seed = getSeedBlocklist();
    expect(seed.size).toBeGreaterThan(10);
  });

  it('should contain known malicious IDs', () => {
    const seed = getSeedBlocklist();
    expect(seed.has('nlbejmcdhhfpnjmjjnhmodmibeomlabo')).toBe(true);
    expect(seed.has('pkedcjkdefgpdelpbcmbgmomdnaeeelh')).toBe(true);
  });

  it('should return all lowercase IDs', () => {
    const seed = getSeedBlocklist();
    for (const id of seed) {
      expect(id).toBe(id.toLowerCase());
    }
  });
});

describe('mergeBlocklists', () => {
  it('should merge existing with seed', () => {
    const existing = new Set(['customid123']);
    const merged = mergeBlocklists(existing);
    expect(merged.has('customid123')).toBe(true);
    expect(merged.size).toBeGreaterThan(1);
  });

  it('should include additional IDs', () => {
    const existing = new Set<string>();
    const additional = new Set(['extra456', 'extra789']);
    const merged = mergeBlocklists(existing, additional);
    expect(merged.has('extra456')).toBe(true);
    expect(merged.has('extra789')).toBe(true);
  });

  it('should deduplicate', () => {
    const existing = new Set(['nlbejmcdhhfpnjmjjnhmodmibeomlabo']);
    const merged = mergeBlocklists(existing);
    const seed = getSeedBlocklist();
    expect(merged.size).toBe(seed.size);
  });
});
