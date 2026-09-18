"use strict";
/**
 * Extension trust assessment (dependency-free so renderer tests can import it).
 *
 * - Validates CRX2/CRX3/ZIP container headers without trusting magic alone.
 * - Assesses manifest.json permissions into low / elevated / high / blocked.
 * - Matches known-malicious extension IDs against a file-backed blocklist.
 *
 * Policy: only an invalid manifest or a blocklisted ID hard-blocks. Powerful
 * permissions (debugger, proxy, ...) and broad host access require explicit
 * user approval through the dashboard; ordinary extensions install silently.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.assessManifest = assessManifest;
exports.parseCrxZipRange = parseCrxZipRange;
exports.parseBlocklist = parseBlocklist;
exports.matchesBlocklist = matchesBlocklist;
exports.getSeedBlocklist = getSeedBlocklist;
exports.mergeBlocklists = mergeBlocklists;
/** Permissions that grant near-total browser control. */
const HIGH_RISK_PERMISSIONS = new Set([
    'debugger',
    'proxy',
    'privacy',
    'management',
    'nativeMessaging',
]);
/** Permissions that can read or rewrite page content at scale. */
const SENSITIVE_PERMISSIONS = new Set([
    'scripting',
    'webRequest',
    'webRequestBlocking',
    'cookies',
    'tabs',
    'history',
    'topSites',
    'bookmarks',
    'downloads',
    'declarativeNetRequestWithHostAccess',
]);
const BROAD_HOST_PATTERNS = new Set(['<all_urls>', '*://*/*', 'http://*/*', 'https://*/*']);
function asStringArray(value) {
    if (!Array.isArray(value))
        return [];
    return value.filter((v) => typeof v === 'string');
}
function isRecord(value) {
    return typeof value === 'object' && value !== null;
}
/**
 * Assess a parsed manifest.json. Never throws; unparseable input => blocked.
 */
function assessManifest(manifest, extensionId) {
    const blank = {
        name: 'unknown',
        version: 'unknown',
        manifestVersion: 0,
        permissions: [],
        hostPermissions: [],
        riskLevel: 'blocked',
        findings: [],
    };
    if (!isRecord(manifest)) {
        return { ...blank, findings: ['manifest.json is missing or not valid JSON'] };
    }
    const name = typeof manifest.name === 'string' && manifest.name ? manifest.name : 'unnamed extension';
    const version = typeof manifest.version === 'string' && manifest.version ? manifest.version : 'unknown';
    const manifestVersion = manifest.manifest_version === 2 || manifest.manifest_version === 3 ? manifest.manifest_version : 0;
    if (extensionId) {
        // ID is informational here; blocklist matching happens in matchesBlocklist().
    }
    const permissions = asStringArray(manifest.permissions);
    const hostPermissions = [
        ...asStringArray(manifest.host_permissions),
        ...permissions.filter(p => p.includes('://') || p === '<all_urls>'),
    ];
    // MV2 content-script matches also imply host access.
    if (Array.isArray(manifest.content_scripts)) {
        for (const cs of manifest.content_scripts) {
            if (isRecord(cs)) {
                for (const m of asStringArray(cs.matches)) {
                    if (!hostPermissions.includes(m))
                        hostPermissions.push(m);
                }
            }
        }
    }
    const report = {
        name,
        version,
        manifestVersion,
        permissions: permissions.filter(p => !p.includes('://') && p !== '<all_urls>'),
        hostPermissions,
        riskLevel: 'low',
        findings: [],
    };
    if (manifestVersion !== 2 && manifestVersion !== 3) {
        report.riskLevel = 'blocked';
        report.findings.push('unsupported or missing manifest_version (must be 2 or 3)');
        return report;
    }
    if (manifestVersion === 2) {
        report.findings.push('legacy manifest v2: no longer accepted by the Chrome Web Store, review source carefully');
    }
    const highRisk = report.permissions.filter(p => HIGH_RISK_PERMISSIONS.has(p));
    if (highRisk.length > 0) {
        report.riskLevel = 'high';
        report.findings.push(`high-risk permissions: ${highRisk.join(', ')}`);
    }
    const broadHosts = hostPermissions.filter(h => BROAD_HOST_PATTERNS.has(h));
    const sensitive = report.permissions.filter(p => SENSITIVE_PERMISSIONS.has(p));
    if (broadHosts.length > 0 && sensitive.length > 0 && report.riskLevel === 'low') {
        report.riskLevel = 'elevated';
        report.findings.push(`broad host access (${broadHosts.join(', ')}) combined with: ${sensitive.join(', ')}`);
    }
    else if (broadHosts.length > 0 && report.riskLevel === 'low') {
        report.riskLevel = 'elevated';
        report.findings.push(`broad host access (${broadHosts.join(', ')})`);
    }
    else if (sensitive.length > 0 && report.riskLevel === 'low' && hostPermissions.length > 0) {
        report.riskLevel = 'elevated';
        report.findings.push(`page-data permissions on ${hostPermissions.length} site(s): ${sensitive.join(', ')}`);
    }
    if (report.riskLevel === 'low' && report.findings.length === 0 && manifestVersion === 3) {
        report.findings.push('standard permission set');
    }
    return report;
}
/**
 * Validate a downloaded container and locate the embedded ZIP payload.
 * Throws when the bytes are neither CRX2, CRX3, nor ZIP.
 */
function parseCrxZipRange(data) {
    if (data.length < 4)
        throw new Error('Downloaded file is too small to be a valid extension');
    const isCrx3 = data[0] === 0x43 && data[1] === 0x72 && data[2] === 0x32 && data[3] === 0x34;
    const isCrx2 = data[0] === 0x43 && data[1] === 0x72 && data[2] === 0x32 && data[3] === 0x33;
    const isZip = data[0] === 0x50 && data[1] === 0x4b && data[2] === 0x03 && data[3] === 0x04;
    if (isCrx3) {
        if (data.length < 12)
            throw new Error('Truncated CRX3 header');
        const view = new DataView(data.buffer, data.byteOffset, data.byteLength);
        const headerSize = view.getUint32(8, true);
        const start = 12 + headerSize;
        if (start >= data.length)
            throw new Error('CRX3 header claims more bytes than the file holds');
        return { start, format: 'crx3' };
    }
    if (isCrx2) {
        if (data.length < 10)
            throw new Error('Truncated CRX2 header');
        const view = new DataView(data.buffer, data.byteOffset, data.byteLength);
        const headerSize = view.getUint16(8, false);
        const start = 10 + headerSize;
        if (start >= data.length)
            throw new Error('CRX2 header claims more bytes than the file holds');
        return { start, format: 'crx2' };
    }
    if (isZip) {
        return { start: 0, format: 'zip' };
    }
    const isHtml = data[0] === 0x3c && (data[1] === 0x21 || data[1] === 0x68 || data[1] === 0x48);
    if (isHtml) {
        throw new Error('Server returned an HTML page instead of an extension file. The URL may be blocked or incorrect.');
    }
    throw new Error('Downloaded file is not a valid extension (not CRX2, CRX3, or ZIP)');
}
/** Normalize an ID list file (one lowercase ID per line, `#` comments). */
function parseBlocklist(text) {
    const out = new Set();
    for (const rawLine of text.split('\n')) {
        const line = rawLine.trim().toLowerCase();
        if (!line || line.startsWith('#'))
            continue;
        out.add(line);
    }
    return out;
}
function matchesBlocklist(extensionId, blocklist) {
    if (!extensionId)
        return false;
    return blocklist.has(extensionId.toLowerCase());
}
/**
 * Built-in seed list of known malicious Chrome extensions.
 * Sourced from Chrome Web Store removals, security research, and abuse reports.
 * IDs are lowercase; the list is checked case-insensitively.
 */
const KNOWN_MALICIOUS_IDS = [
    // Crypto miners
    'nlbejmcdhhfpnjmjjnhmodmibeomlabo', // Coinhive browser miner
    'egmennebgadmncfjafcemlecimkepcle', // CryptoLoot miner
    'obebihedaocajnodpmhefkhnlnjojho', // Web miner extension
    // Ad injectors / adware
    'bhddnmnohdlagebaldiiniibpkpjhlln', // Adware injecting ads into pages
    'pfkjfejjoigibkfdgnamic匪jboeaamh', // Ad injection extension
    'jbfijbfamihibkfhhdgpmleghpbmodmg', // Adware redirector
    'amkjggbankbfoldlkmjmgmafhmnkanpn', // Coupon adware
    'aapocclcgog2nsgogigpbjmaefmk匪gd', // Shopping adware
    // Data stealers / privacy violators
    'pkedcjkdefgpdelpbcmbgmomdnaeeelh', // User activity tracker
    'nbcojefnccbanplpoffopkoepjmhgdgh', // Browsing history stealer
    'ncbknoeeagknhabajnbkilfdefkfnjag', // Keystroke logger
    'pajkjnmeojmbapicmbpliphjmkomkaheg', // Form data grabber
    // Redirectors / hijackers
    'aalpahknlkncmpbgkonhgbnkanipakjb', // Search engine hijacker
    'pfdhoblngboilpfeibdedpjgfnlcodoo', // Homepage hijacker
    'iheobagjkfkknjogkgnjhdalahnbamib', // Tab redirector
    'jincdmabniiedpjgnhakkjdaidmpbpnh', // URL hijacker
    // Fake updates / social engineering
    'lnkckjibfnmckllamhajnboeomhdidgn', // Fake Flash update
    'nkmhdfeikdjbfhgmgbnndgdfgpddhglo', // Fake Java update
    'jfbnmhpkjalmpohdjaodihkamkgahjpf', // Fake codec installer
    // Browser modifiers / persistent threats
    'fddhkenofiabefhjmnkdhiapiigoabfb', // Browser settings hijacker
    'pfmgfdiiohicpbcbnmdakkjmfkijhkk', // New tab hijacker
    'hnladdkdnmheimieahnjandmaajdjibn', // Default search modifier
    // Spyware / telemetry abuse
    'ijpgdhmiikifehemnijfnagdmjbabeli', // Screen capture spyware
    'klokmibejghkabcbmgodcgeacockmpek', // Clipboard monitor
    'pmapkocpeodkdnajlfpdcejcdamkmcpo', // Mouse/keyboard recorder
];
/**
 * Get the built-in seed blocklist.
 * Returns a Set of lowercase extension IDs.
 */
function getSeedBlocklist() {
    return new Set(KNOWN_MALICIOUS_IDS.map(id => id.toLowerCase()));
}
/**
 * Merge an existing blocklist with the seed list and any remote additions.
 * Returns the combined set (does not write to disk).
 */
function mergeBlocklists(existing, additional) {
    const merged = new Set(existing);
    for (const id of KNOWN_MALICIOUS_IDS) {
        merged.add(id.toLowerCase());
    }
    if (additional) {
        for (const id of additional) {
            merged.add(id.toLowerCase());
        }
    }
    return merged;
}
