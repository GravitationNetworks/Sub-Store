import { isPresent } from './utils';

const targetPlatform = 'Ring';

export class RingUnsupportedProxyError extends Error {
    constructor(message) {
        super(message);
        this.name = 'RingUnsupportedProxyError';
    }
}

function unsupported(message) {
    return new RingUnsupportedProxyError(message);
}

function stripQuotes(value) {
    if (typeof value !== 'string') return value;
    const trimmed = value.trim();
    if (
        trimmed.length >= 2 &&
        ((trimmed.startsWith('"') && trimmed.endsWith('"')) ||
            (trimmed.startsWith("'") && trimmed.endsWith("'")))
    ) {
        return trimmed.slice(1, -1);
    }
    return trimmed;
}

function quoteRingValue(value) {
    if (value === undefined || value === null) return '';
    const str = String(stripQuotes(value));
    if (/[\s,=#"]/.test(str)) {
        return `"${str.replace(/"/g, '\\"')}"`;
    }
    return str;
}

function formatAlpns(alpn) {
    if (!alpn) return '';
    const values = Array.isArray(alpn)
        ? alpn
        : stripQuotes(String(alpn)).split(',');
    return values
        .filter((item) => item != null)
        .map((item) => String(stripQuotes(item)).trim())
        .filter((item) => item !== '')
        .join(',');
}

function appendAlpns(options, proxy) {
    const alpnVal = proxy.alpns || proxy.alpn;
    const formatted = formatAlpns(alpnVal);
    if (formatted) {
        options.push(`alpns=${quoteRingValue(formatted)}`);
    }
}

const validRingIpVersions = new Set([
    'dual',
    'ipv4-only',
    'ipv6-only',
    'prefer-ipv4',
    'prefer-ipv6',
]);

const ipVersionsMap = {
    dual: 'dual',
    dual_stack: 'dual',
    'dual-stack': 'dual',
    ipv4: 'ipv4-only',
    'ipv4-only': 'ipv4-only',
    'v4-only': 'ipv4-only',
    v4_only: 'ipv4-only',
    ipv6: 'ipv6-only',
    'ipv6-only': 'ipv6-only',
    'v6-only': 'ipv6-only',
    v6_only: 'ipv6-only',
    'ipv4-prefer': 'prefer-ipv4',
    'prefer-ipv4': 'prefer-ipv4',
    'prefer-v4': 'prefer-ipv4',
    prefer_v4: 'prefer-ipv4',
    v4_prefer: 'prefer-ipv4',
    'ipv6-prefer': 'prefer-ipv6',
    'prefer-ipv6': 'prefer-ipv6',
    'prefer-v6': 'prefer-ipv6',
    prefer_v6: 'prefer-ipv6',
    v6_prefer: 'prefer-ipv6',
};

function formatRingIpVersion(val) {
    if (!val) return undefined;
    const lower = String(stripQuotes(val)).trim().toLowerCase();
    const mapped = ipVersionsMap[lower];
    if (mapped && validRingIpVersions.has(mapped)) {
        return mapped;
    }
    if (validRingIpVersions.has(lower)) {
        return lower;
    }
    return undefined;
}

function appendSingMuxOptions(options, proxy) {
    const smux = proxy.smux || {};
    const multiplex = proxy.multiplex || {};

    const isEnabled =
        proxy['sing-mux'] === true ||
        proxy['sing-mux'] === 'true' ||
        proxy.sing_mux === true ||
        proxy.sing_mux === 'true' ||
        proxy.mux === true ||
        proxy.mux === 'true' ||
        smux.enabled === true ||
        multiplex.enabled === true;

    const isExplicitlyDisabled =
        proxy['sing-mux'] === false ||
        proxy['sing-mux'] === 'false' ||
        proxy.sing_mux === false ||
        smux.enabled === false ||
        multiplex.enabled === false;

    if (isEnabled) {
        options.push('sing-mux=true');

        // sing-mux-stream-num-per-conn
        const streamNum =
            proxy['sing-mux-stream-num-per-conn'] ??
            proxy['stream-num-per-conn'] ??
            smux['max-streams'] ??
            smux.max_streams ??
            multiplex['max-streams'] ??
            multiplex.max_streams ??
            proxy['max-streams'];
        if (streamNum != null && !Number.isNaN(Number(streamNum))) {
            const parsed = parseInt(streamNum, 10);
            if (parsed > 0) {
                options.push(`sing-mux-stream-num-per-conn=${parsed}`);
            }
        }

        // sing-mux-max-connections
        const maxConnections =
            proxy['sing-mux-max-connections'] ??
            proxy['max-connections'] ??
            smux['max-connections'] ??
            smux.max_connections ??
            multiplex['max-connections'] ??
            multiplex.max_connections;
        if (maxConnections != null && !Number.isNaN(Number(maxConnections))) {
            const parsed = parseInt(maxConnections, 10);
            if (parsed > 0) {
                options.push(`sing-mux-max-connections=${parsed}`);
            }
        }

        // sing-mux-padding
        const padding =
            proxy['sing-mux-padding'] ??
            proxy.padding ??
            smux.padding ??
            multiplex.padding;
        if (padding != null) {
            if (padding === true || padding === 'true') {
                options.push('sing-mux-padding=true');
            } else if (padding === false || padding === 'false') {
                options.push('sing-mux-padding=false');
            }
        }

        // sing-mux-idle-timeout
        const idleTimeout =
            proxy['sing-mux-idle-timeout'] ??
            proxy['idle-timeout'] ??
            smux['idle-timeout'] ??
            smux.idle_timeout ??
            multiplex['idle-timeout'] ??
            multiplex.idle_timeout;
        if (idleTimeout != null && !Number.isNaN(Number(idleTimeout))) {
            const parsed = parseInt(idleTimeout, 10);
            if (parsed >= 0) {
                options.push(`sing-mux-idle-timeout=${parsed}`);
            }
        }
    } else if (isExplicitlyDisabled) {
        options.push('sing-mux=false');
    }
}

function appendCommonOptions(options, proxy) {
    if (proxy.tfo === true || proxy.tfo === 'true') {
        options.push('tfo=true');
    } else if (proxy.tfo === false || proxy.tfo === 'false') {
        options.push('tfo=false');
    }

    const rawIpVersion = proxy['ip-version'] || proxy['ip-preference'];
    const ipVersion = formatRingIpVersion(rawIpVersion);
    if (ipVersion) {
        options.push(`ip-version=${quoteRingValue(ipVersion)}`);
    }

    const iface = proxy.interface || proxy['interface-name'];
    if (iface != null && `${iface}`.trim().length > 0) {
        options.push(`interface=${quoteRingValue(iface)}`);
    }

    const testUrl = proxy['override-test-url'] || proxy['test-url'];
    if (testUrl != null && `${testUrl}`.trim().length > 0) {
        options.push(`override-test-url=${quoteRingValue(testUrl)}`);
    }

    appendSingMuxOptions(options, proxy);

    const underlying =
        proxy['underlying-proxy'] ||
        proxy['dialer-proxy'] ||
        proxy.detour ||
        proxy.prev_hop;
    if (underlying != null && `${underlying}`.trim().length > 0) {
        options.push(`underlying-proxy=${quoteRingValue(underlying)}`);
    }
}

export default function Ring_Producer() {
    const produce = (proxy, type, opts = {}) => {
        if (
            ['ws'].includes(proxy.network) &&
            proxy['ws-opts']?.['v2ray-http-upgrade']
        ) {
            throw unsupported(
                `Platform ${targetPlatform} does not support network ${proxy.network} with http upgrade`,
            );
        }
        proxy.name = proxy.name.replace(/=|,/g, '');

        let result;
        switch (proxy.type) {
            case 'ss':
            case 'shadowsocks':
                result = shadowsocks(proxy);
                break;
            case 'vmess':
                result = vmess(proxy, opts['include-unsupported-proxy']);
                break;
            case 'vless':
                result = vless(proxy, opts['include-unsupported-proxy']);
                break;
            case 'trojan':
                result = trojan(proxy, opts['include-unsupported-proxy']);
                break;
            case 'hysteria':
            case 'hysteria2':
                result = hysteria(proxy);
                break;
            case 'tuic':
                result = tuic(proxy);
                break;
            case 'wireguard':
                result = wireguard(proxy);
                break;
            case 'socks':
            case 'socks5':
                result = socks(proxy);
                break;
            case 'http':
            case 'https':
                result = http(proxy);
                break;
            case 'anytls':
                result = anytls(proxy, opts['include-unsupported-proxy']);
                break;
            case 'shadowtls':
                result = shadowtls(proxy);
                break;
            case 'ssh':
                result = ssh(proxy);
                break;
            case 'tailscale':
                result = tailscale(proxy);
                break;
            case 'direct':
                result = direct(proxy);
                break;
            case 'reject':
            case 'reject-drop':
            case 'reject-tinygif':
            case 'reject-no-drop':
                result = reject(proxy);
                break;
            default:
                throw unsupported(
                    `Platform ${targetPlatform} does not support proxy type: ${proxy.type}`,
                );
        }
        return result;
    };

    return { produce };
}

function formatHeaders(headers) {
    if (!headers) return '';
    if (typeof headers === 'string') return headers;
    if (typeof headers === 'object') {
        const pairs = [];
        for (const [key, value] of Object.entries(headers)) {
            if (value != null && `${value}`.length > 0) {
                pairs.push(`${key}:${value}`);
            }
        }
        return pairs.join('|');
    }
    return '';
}

function appendWsHeaders(options, proxy) {
    const rawHeaders =
        proxy['ws-opts']?.headers ||
        proxy['ws-headers'] ||
        proxy.headers ||
        {};
    const headers = typeof rawHeaders === 'object' ? { ...rawHeaders } : {};
    const host =
        proxy['ws-opts']?.headers?.Host ||
        proxy['ws-headers']?.Host ||
        proxy['ws-opts']?.headers?.host ||
        proxy['ws-headers']?.host ||
        proxy['ws-opts']?.host;
    if (host && !headers.Host && !headers.host) {
        headers.Host = host;
    }
    const formatted = formatHeaders(headers);
    if (formatted) {
        options.push(`headers=${quoteRingValue(formatted)}`);
    }
}

function shadowsocks(proxy) {
    const cipher = proxy.cipher || 'none';
    const password = quoteRingValue(proxy.password || '');
    const items = ['shadowsocks', proxy.server, proxy.port];
    const options = [
        `encrypt-method=${quoteRingValue(cipher)}`,
        `password=${password}`,
    ];

    if (isPresent(proxy, 'plugin')) {
        if (proxy.plugin === 'obfs') {
            if (proxy['plugin-opts']?.mode) {
                options.push(`obfs=${quoteRingValue(proxy['plugin-opts'].mode)}`);
            }
            if (proxy['plugin-opts']?.host) {
                options.push(`obfs-host=${quoteRingValue(proxy['plugin-opts'].host)}`);
            }
            if (proxy['plugin-opts']?.path) {
                options.push(`obfs-path=${quoteRingValue(proxy['plugin-opts'].path)}`);
            }
        } else {
            throw unsupported(
                `Platform ${targetPlatform} does not support plugin ${proxy.plugin}`,
            );
        }
    }

    appendCommonOptions(options, proxy);
    return `${proxy.name} = ${items.concat(options).join(', ')}`;
}

function vmess(proxy, includeUnsupportedProxy) {
    if (
        !includeUnsupportedProxy &&
        proxy.network &&
        !['tcp', 'ws'].includes(proxy.network)
    ) {
        throw unsupported(
            `Platform ${targetPlatform} does not support vmess network ${proxy.network}`,
        );
    }

    const uuid = quoteRingValue(proxy.uuid || '');
    const items = ['vmess', proxy.server, proxy.port];
    const options = [`uuid=${uuid}`];

    if (proxy.network === 'ws') {
        options.push('ws=true');
        const wsPath = proxy['ws-opts']?.path || proxy['ws-path'];
        if (wsPath) {
            options.push(`ws-path=${quoteRingValue(wsPath)}`);
        }
        appendWsHeaders(options, proxy);
    }

    if (proxy.tls === true) {
        options.push('tls=true');
        const sni = proxy.sni || proxy.server;
        if (sni) {
            options.push(`sni=${quoteRingValue(sni)}`);
        }
        if (proxy['skip-cert-verify']) {
            options.push('skip-cert-verify=true');
        }
        appendAlpns(options, proxy);
    }

    if (proxy.aead !== undefined) {
        options.push(`aead=${Boolean(proxy.aead)}`);
    } else if (proxy.alterId === 0 || proxy.alterId === '0') {
        options.push('aead=true');
    }

    appendCommonOptions(options, proxy);
    return `${proxy.name} = ${items.concat(options).join(', ')}`;
}

const VALID_VLESS_TLS_FINGERPRINTS = new Set([
    'unsafe',
    'chrome',
    'firefox',
    'safari',
    'ios',
    'android',
    'edge',
    '360',
    'qq',
    'random',
    'randomized',
    'randomizednoalpn',
    'hellofirefox_120',
    'hellofirefox_148',
    'hellochrome_120',
    'hellochrome_131',
    'hellochrome_133',
    'helloios_13',
    'helloios_14',
    'helloedge_106',
    'hellosafari_26_3',
    'hello360_11_0',
    'helloqq_11_1',
    'hellorandomized',
    'hellorandomizedalpn',
    'hellorandomizednoalpn',
    'hellofirefox_auto',
    'hellofirefox_55',
    'hellofirefox_56',
    'hellofirefox_63',
    'hellofirefox_65',
    'hellofirefox_99',
    'hellofirefox_102',
    'hellofirefox_105',
    'hellochrome_auto',
    'hellochrome_58',
    'hellochrome_62',
    'hellochrome_70',
    'hellochrome_72',
    'hellochrome_83',
    'hellochrome_87',
    'hellochrome_96',
    'hellochrome_100',
    'hellochrome_102',
    'hellochrome_106_shuffle',
    'helloios_auto',
    'helloios_11_1',
    'helloios_12_1',
    'helloandroid_11_okhttp',
    'helloedge_85',
    'helloedge_auto',
    'hellosafari_16_0',
    'hellosafari_auto',
    'hello360_auto',
    'hello360_7_5',
    'helloqq_auto',
    'hellochrome_100_psk',
    'hellochrome_112_psk_shuf',
    'hellochrome_114_padding_psk_shuf',
    'hellochrome_115_pq',
    'hellochrome_115_pq_psk',
    'hellochrome_120_pq',
]);

const VALID_VLESS_REALITY_FINGERPRINTS = new Set([
    'chrome',
    'firefox',
    'safari',
    'ios',
    'edge',
    'qq',
    'random',
    'randomized',
    'hellofirefox_120',
    'hellofirefox_148',
    'hellochrome_120',
    'hellochrome_131',
    'hellochrome_133',
    'helloios_13',
    'helloios_14',
    'helloedge_106',
    'hellosafari_26_3',
    'hello360_11_0',
    'helloqq_11_1',
    'hellorandomized',
    'hellofirefox_auto',
    'hellofirefox_63',
    'hellofirefox_65',
    'hellofirefox_99',
    'hellofirefox_102',
    'hellofirefox_105',
    'hellochrome_auto',
    'hellochrome_70',
    'hellochrome_72',
    'hellochrome_83',
    'hellochrome_87',
    'hellochrome_96',
    'hellochrome_100',
    'hellochrome_102',
    'hellochrome_106_shuffle',
    'helloios_auto',
    'helloedge_85',
    'helloedge_auto',
    'hellosafari_16_0',
    'hellosafari_auto',
    'helloqq_auto',
    'hellochrome_100_psk',
    'hellochrome_112_psk_shuf',
    'hellochrome_114_padding_psk_shuf',
    'hellochrome_115_pq',
    'hellochrome_115_pq_psk',
    'hellochrome_120_pq',
]);

const BLOCKED_VLESS_HTTP_HEADERS = new Set([
    'content-length',
    'transfer-encoding',
    'connection',
    'upgrade',
    'te',
]);

const VALID_VLESS_FLOWS = new Set([
    'xtls-rprx-vision',
    'xtls-rprx-vision-udp443',
]);

const VALID_VLESS_XHTTP_MODES = new Set([
    'auto',
    'packet-up',
    'stream-up',
    'stream-one',
]);

function isNonEmptyString(val) {
    return val != null && String(stripQuotes(val)).trim().length > 0;
}

function firstNonEmptyValue(val) {
    if (Array.isArray(val)) {
        for (const item of val) {
            if (isNonEmptyString(item)) {
                return String(stripQuotes(item)).trim();
            }
        }
        return undefined;
    }
    if (isNonEmptyString(val)) {
        return String(stripQuotes(val)).trim();
    }
    return undefined;
}

function parseAlpnArray(alpn) {
    if (!alpn) return [];
    const values = Array.isArray(alpn)
        ? alpn
        : stripQuotes(String(alpn)).split(',');
    return values
        .filter((item) => item != null)
        .map((item) => String(stripQuotes(item)).trim())
        .filter((item) => item !== '');
}

function normalizeVlessFingerprint(
    rawFp,
    isReality,
    includeUnsupportedProxy,
) {
    const cleaned = firstNonEmptyValue(rawFp);
    if (!cleaned) return undefined;
    const lower = cleaned.toLowerCase();
    const allowed = isReality
        ? VALID_VLESS_REALITY_FINGERPRINTS
        : VALID_VLESS_TLS_FINGERPRINTS;
    if (allowed.has(lower)) {
        return lower;
    }
    if (!includeUnsupportedProxy) {
        throw unsupported(
            `Platform ${targetPlatform} does not support VLESS ${isReality ? 'REALITY' : 'TLS'} fingerprint ${cleaned}`,
        );
    }
    return undefined;
}

function validateVlessCertFingerprint(rawFp, includeUnsupportedProxy) {
    const cleaned = firstNonEmptyValue(rawFp);
    if (!cleaned) return undefined;
    const hex = cleaned.replace(/:/g, '');
    if (!/^[0-9a-fA-F]{64}$/.test(hex)) {
        if (!includeUnsupportedProxy) {
            throw unsupported(
                `Platform ${targetPlatform} requires 32-byte hex server-cert-fingerprint-sha256, got ${cleaned}`,
            );
        }
        return undefined;
    }
    return cleaned;
}

function extractVlessHostAndHeaders(
    primaryHost,
    rawHeaders,
    includeUnsupportedProxy,
) {
    let host = firstNonEmptyValue(primaryHost);
    const pairs = [];

    if (typeof rawHeaders === 'string') {
        const trimmed = String(stripQuotes(rawHeaders)).trim();
        if (trimmed) {
            for (const entry of trimmed.split('|')) {
                const idx = entry.indexOf(':');
                if (idx <= 0) {
                    if (!includeUnsupportedProxy) {
                        throw unsupported(
                            `Platform ${targetPlatform} received invalid VLESS HTTP header entry: ${entry}`,
                        );
                    }
                    continue;
                }
                const key = entry.slice(0, idx).trim();
                const val = entry.slice(idx + 1).trim();
                if (/^host$/i.test(key)) {
                    if (!host && val) {
                        host = val;
                    }
                    continue;
                }
                if (BLOCKED_VLESS_HTTP_HEADERS.has(key.toLowerCase())) {
                    if (!includeUnsupportedProxy) {
                        throw unsupported(
                            `Platform ${targetPlatform} does not allow transport-managed VLESS HTTP header ${key}`,
                        );
                    }
                    continue;
                }
                if (val.length > 0) {
                    pairs.push(`${key}:${val}`);
                }
            }
        }
    } else if (rawHeaders && typeof rawHeaders === 'object') {
        for (const [rawKey, rawVal] of Object.entries(rawHeaders)) {
            const key = String(rawKey).trim();
            if (!key || /[\s:]/.test(key)) {
                if (!includeUnsupportedProxy) {
                    throw unsupported(
                        `Platform ${targetPlatform} received invalid VLESS HTTP header name: ${rawKey}`,
                    );
                }
                continue;
            }
            const val = Array.isArray(rawVal)
                ? rawVal.map((v) => String(v).trim()).join(', ')
                : rawVal != null
                  ? String(rawVal).trim()
                  : '';
            if (!val) continue;
            if (/^host$/i.test(key)) {
                if (!host) {
                    host = val;
                }
                continue;
            }
            if (BLOCKED_VLESS_HTTP_HEADERS.has(key.toLowerCase())) {
                if (!includeUnsupportedProxy) {
                    throw unsupported(
                        `Platform ${targetPlatform} does not allow transport-managed VLESS HTTP header ${key}`,
                    );
                }
                continue;
            }
            pairs.push(`${key}:${val}`);
        }
    }

    return {
        host,
        headers: pairs.join('|'),
    };
}

function validateAndNormalizeVlessPath(rawPath, includeUnsupportedProxy) {
    const path = firstNonEmptyValue(rawPath);
    if (!path) return undefined;
    if (!path.startsWith('/') || /\s/.test(path)) {
        if (!includeUnsupportedProxy) {
            throw unsupported(
                `Platform ${targetPlatform} requires VLESS HTTP path to start with /: ${path}`,
            );
        }
        return undefined;
    }
    return path;
}

function appendVlessSecurityOptions(
    options,
    target,
    { transport, defaultAddress, includeUnsupportedProxy },
) {
    const tlsSettings =
        target.tlsSettings && typeof target.tlsSettings === 'object'
            ? target.tlsSettings
            : undefined;
    const realitySettings =
        target.realitySettings && typeof target.realitySettings === 'object'
            ? target.realitySettings
            : undefined;
    const realityOpts =
        target['reality-opts'] && typeof target['reality-opts'] === 'object'
            ? target['reality-opts']
            : realitySettings;

    const rawSecurity = isNonEmptyString(target.security)
        ? String(stripQuotes(target.security)).trim().toLowerCase()
        : undefined;
    if (
        rawSecurity &&
        !['none', 'tls', 'reality'].includes(rawSecurity) &&
        !includeUnsupportedProxy
    ) {
        throw unsupported(
            `Platform ${targetPlatform} does not support VLESS security ${target.security}`,
        );
    }

    const rawPubKey =
        target['reality-public-key'] ??
        realityOpts?.['public-key'] ??
        realityOpts?.publicKey;
    const rawShortId =
        target['reality-short-id'] ??
        realityOpts?.['short-id'] ??
        realityOpts?.shortId;

    // 兼容 Mihomo download-settings 中以 public-key: "" 显式取消 REALITY 继承并回退到普通 TLS 的写法
    const hasExplicitRealityCancel =
        realityOpts != null &&
        Object.prototype.hasOwnProperty.call(realityOpts, 'public-key') &&
        realityOpts['public-key'] === '' &&
        rawSecurity !== 'reality';

    if (
        rawSecurity === 'none' &&
        (target.tls === true ||
            target.tls === 'true' ||
            isNonEmptyString(rawPubKey) ||
            isNonEmptyString(rawShortId))
    ) {
        if (!includeUnsupportedProxy) {
            throw unsupported(
                `Platform ${targetPlatform} does not allow TLS/REALITY fields when VLESS security=none`,
            );
        }
    }

    if (
        rawSecurity === 'tls' &&
        (isNonEmptyString(rawPubKey) || isNonEmptyString(rawShortId))
    ) {
        if (!includeUnsupportedProxy) {
            throw unsupported(
                `Platform ${targetPlatform} does not allow REALITY parameters when VLESS security=tls`,
            );
        }
    }

    const isReality =
        rawSecurity === 'reality' ||
        (!hasExplicitRealityCancel &&
            rawSecurity !== 'none' &&
            rawSecurity !== 'tls' &&
            (isNonEmptyString(rawPubKey) ||
                isNonEmptyString(rawShortId) ||
                realityOpts != null));

    const isTls =
        !isReality &&
        rawSecurity !== 'none' &&
        (rawSecurity === 'tls' ||
            target.tls === true ||
            target.tls === 'true' ||
            tlsSettings != null);

    const alpnList = parseAlpnArray(
        target.alpns ?? target.alpn ?? tlsSettings?.alpn,
    );

    if (alpnList.includes('h3') && !includeUnsupportedProxy) {
        if (isReality) {
            throw unsupported(
                `Platform ${targetPlatform} does not support HTTP/3 with REALITY`,
            );
        }
        if (!isTls) {
            throw unsupported(
                `Platform ${targetPlatform} requires TLS for VLESS HTTP/3`,
            );
        }
        if (transport !== 'xhttp') {
            throw unsupported(
                `Platform ${targetPlatform} requires XHTTP transport for VLESS HTTP/3`,
            );
        }
        if (alpnList.length !== 1 || alpnList[0] !== 'h3') {
            throw unsupported(
                `Platform ${targetPlatform} requires exclusive h3 ALPN for VLESS HTTP/3`,
            );
        }
    }

    if (isReality) {
        if (transport === 'ws' && !includeUnsupportedProxy) {
            throw unsupported(
                `Platform ${targetPlatform} does not support VLESS REALITY over WebSocket`,
            );
        }
        const pubKey = firstNonEmptyValue(rawPubKey);
        if (!pubKey) {
            if (!includeUnsupportedProxy) {
                throw unsupported(
                    `Platform ${targetPlatform} requires reality-public-key for VLESS REALITY`,
                );
            }
        }
        const shortId = firstNonEmptyValue(rawShortId);
        if (shortId) {
            if (
                !/^[0-9a-fA-F]+$/.test(shortId) ||
                shortId.length % 2 !== 0 ||
                shortId.length > 16
            ) {
                if (!includeUnsupportedProxy) {
                    throw unsupported(
                        `Platform ${targetPlatform} received invalid VLESS reality-short-id: ${shortId}`,
                    );
                }
            }
        }
        const sni = firstNonEmptyValue(
            target.sni ??
                target.servername ??
                realitySettings?.serverName ??
                tlsSettings?.serverName ??
                defaultAddress,
        );
        if (!sni && !includeUnsupportedProxy) {
            throw unsupported(
                `Platform ${targetPlatform} requires sni for VLESS REALITY`,
            );
        }

        options.push('security=reality');
        if (sni) {
            options.push(`sni=${quoteRingValue(sni)}`);
        }
        if (alpnList.length > 0) {
            options.push(`alpns=${quoteRingValue(alpnList.join(','))}`);
        }
        if (pubKey) {
            options.push(`reality-public-key=${quoteRingValue(pubKey)}`);
        }
        if (shortId) {
            options.push(`reality-short-id=${quoteRingValue(shortId)}`);
        }
        const fp = normalizeVlessFingerprint(
            target['client-fingerprint'] ??
                target.fingerprint ??
                realitySettings?.fingerprint ??
                tlsSettings?.fingerprint,
            true,
            includeUnsupportedProxy,
        );
        if (fp) {
            options.push(`fingerprint=${quoteRingValue(fp)}`);
        }
        return { isTls: false, isReality: true };
    }

    if (isTls) {
        options.push('security=tls');
        const sni = firstNonEmptyValue(
            target.sni ??
                target.servername ??
                tlsSettings?.serverName ??
                defaultAddress,
        );
        if (sni) {
            options.push(`sni=${quoteRingValue(sni)}`);
        }
        if (alpnList.length > 0) {
            options.push(`alpns=${quoteRingValue(alpnList.join(','))}`);
        }
        const skipCertVerify =
            target['skip-cert-verify'] === true ||
            target['skip-cert-verify'] === 'true' ||
            tlsSettings?.allowInsecure === true;
        if (skipCertVerify) {
            options.push('skip-cert-verify=true');
        }
        const certFp = validateVlessCertFingerprint(
            target['server-cert-fingerprint-sha256'] ??
                target['tls-fingerprint'],
            includeUnsupportedProxy,
        );
        if (certFp) {
            options.push(
                `server-cert-fingerprint-sha256=${quoteRingValue(certFp)}`,
            );
        }
        const fp = normalizeVlessFingerprint(
            target['client-fingerprint'] ??
                target.fingerprint ??
                tlsSettings?.fingerprint,
            false,
            includeUnsupportedProxy,
        );
        if (fp) {
            options.push(`fingerprint=${quoteRingValue(fp)}`);
        }
        return { isTls: true, isReality: false };
    }

    const fp = normalizeVlessFingerprint(
        target.fingerprint,
        false,
        includeUnsupportedProxy,
    );
    if (fp) {
        options.push(`fingerprint=${quoteRingValue(fp)}`);
    }
    return { isTls: false, isReality: false };
}

function collectTopLevelXhttpDownloadFields(proxy) {
    const extracted = {};
    for (const [key, value] of Object.entries(proxy)) {
        if (key.startsWith('xhttp-download-') && value !== undefined) {
            const stripped = key.slice('xhttp-download-'.length);
            if (stripped) {
                extracted[stripped] = value;
            }
        }
    }
    return Object.keys(extracted).length > 0 ? extracted : undefined;
}

function resolveVlessXhttpDownloadSource(proxy, includeUnsupportedProxy) {
    const rawFlag = proxy['xhttp-download'];
    const topLevelFields = collectTopLevelXhttpDownloadFields(proxy);
    const nestedDownload =
        (rawFlag && typeof rawFlag === 'object' ? rawFlag : undefined) ??
        proxy['xhttp-opts']?.['download-settings'] ??
        proxy['xhttp-opts']?.downloadSettings ??
        proxy['splithttp-opts']?.['download-settings'] ??
        proxy['splithttp-opts']?.downloadSettings ??
        proxy['download-settings'];

    if (rawFlag === false || rawFlag === 'false') {
        if (topLevelFields && !includeUnsupportedProxy) {
            throw unsupported(
                `Platform ${targetPlatform} does not allow xhttp-download-* fields when xhttp-download=false`,
            );
        }
        return undefined;
    }

    if (
        rawFlag != null &&
        typeof rawFlag !== 'object' &&
        rawFlag !== true &&
        rawFlag !== 'true'
    ) {
        if (!includeUnsupportedProxy) {
            throw unsupported(
                `Platform ${targetPlatform} requires xhttp-download=true with flat xhttp-download-* options, got ${rawFlag}`,
            );
        }
        return undefined;
    }

    const isEnabled =
        rawFlag === true ||
        rawFlag === 'true' ||
        topLevelFields != null ||
        nestedDownload != null;

    if (!isEnabled) {
        return undefined;
    }

    if (
        nestedDownload != null &&
        (typeof nestedDownload !== 'object' || Array.isArray(nestedDownload))
    ) {
        if (!includeUnsupportedProxy) {
            throw unsupported(
                `Platform ${targetPlatform} requires download-settings to be an object`,
            );
        }
        return undefined;
    }

    return {
        ...(nestedDownload || {}),
        ...(topLevelFields || {}),
    };
}

function appendVlessXhttpDownloadOptions(
    options,
    rawDownload,
    { proxy, uploadPath, xhttpMode, includeUnsupportedProxy },
) {
    if (isNonEmptyString(rawDownload.network)) {
        const dlNet = String(stripQuotes(rawDownload.network))
            .trim()
            .toLowerCase();
        if (
            dlNet !== 'xhttp' &&
            dlNet !== 'splithttp' &&
            !includeUnsupportedProxy
        ) {
            throw unsupported(
                `Platform ${targetPlatform} does not support xhttp-download network ${rawDownload.network}`,
            );
        }
    }

    const nestedXhttp =
        rawDownload.xhttpSettings &&
        typeof rawDownload.xhttpSettings === 'object'
            ? rawDownload.xhttpSettings
            : rawDownload['xhttp-opts'] &&
                typeof rawDownload['xhttp-opts'] === 'object'
              ? rawDownload['xhttp-opts']
              : undefined;

    const rawDlMode = firstNonEmptyValue(
        rawDownload.mode ?? nestedXhttp?.mode,
    );
    if (rawDlMode) {
        const dlMode = rawDlMode.toLowerCase();
        const effectiveUploadMode = xhttpMode || 'auto';
        if (
            (!VALID_VLESS_XHTTP_MODES.has(dlMode) ||
                dlMode === 'stream-one' ||
                (xhttpMode && dlMode !== effectiveUploadMode)) &&
            !includeUnsupportedProxy
        ) {
            throw unsupported(
                `Platform ${targetPlatform} does not support xhttp-download mode ${rawDlMode}`,
            );
        }
    }

    const hasExplicitAddress =
        Object.prototype.hasOwnProperty.call(rawDownload, 'address') ||
        Object.prototype.hasOwnProperty.call(rawDownload, 'server');
    const address = hasExplicitAddress
        ? firstNonEmptyValue(rawDownload.address ?? rawDownload.server)
        : firstNonEmptyValue(proxy.server);
    if (!address) {
        if (!includeUnsupportedProxy) {
            throw unsupported(
                `Platform ${targetPlatform} requires xhttp-download-address for VLESS xhttp-download`,
            );
        }
        return;
    }

    const hasExplicitPort = Object.prototype.hasOwnProperty.call(
        rawDownload,
        'port',
    );
    const rawPort = hasExplicitPort ? rawDownload.port : proxy.port;
    const port = Number(rawPort);
    if (!Number.isInteger(port) || port <= 0 || port > 65535) {
        if (!includeUnsupportedProxy) {
            throw unsupported(
                `Platform ${targetPlatform} requires valid xhttp-download-port for VLESS xhttp-download`,
            );
        }
        return;
    }

    options.push('xhttp-download=true');
    options.push(`xhttp-download-address=${quoteRingValue(address)}`);
    options.push(`xhttp-download-port=${port}`);

    const dlSecFields = [];
    appendVlessSecurityOptions(dlSecFields, rawDownload, {
        transport: 'xhttp',
        defaultAddress: address,
        includeUnsupportedProxy,
    });
    for (const secField of dlSecFields) {
        options.push(`xhttp-download-${secField}`);
    }

    const { host: dlHost, headers: dlHeaders } = extractVlessHostAndHeaders(
        rawDownload.host ?? nestedXhttp?.host,
        rawDownload.headers ??
            nestedXhttp?.headers ??
            nestedXhttp?.extra?.headers,
        includeUnsupportedProxy,
    );
    if (dlHost) {
        options.push(`xhttp-download-host=${quoteRingValue(dlHost)}`);
    }

    const explicitDlPath = validateAndNormalizeVlessPath(
        rawDownload.path ?? nestedXhttp?.path,
        includeUnsupportedProxy,
    );
    const effectiveUploadPath = uploadPath || '/';
    if (
        explicitDlPath &&
        explicitDlPath !== effectiveUploadPath &&
        !includeUnsupportedProxy
    ) {
        throw unsupported(
            `Platform ${targetPlatform} requires xhttp-download-path (${explicitDlPath}) to match upload path (${effectiveUploadPath})`,
        );
    }
    const finalDlPath = explicitDlPath ?? uploadPath;
    if (finalDlPath) {
        options.push(`xhttp-download-path=${quoteRingValue(finalDlPath)}`);
    }

    if (dlHeaders) {
        options.push(`xhttp-download-headers=${quoteRingValue(dlHeaders)}`);
    }
}

function vless(proxy, includeUnsupportedProxy) {
    if (
        !includeUnsupportedProxy &&
        (isPresent(proxy, 'plugin') ||
            proxy['shadow-tls'] ||
            proxy['shadow-tls-opts'] ||
            proxy.jls)
    ) {
        throw unsupported(
            `Platform ${targetPlatform} does not support plugins on VLESS`,
        );
    }

    if (isPresent(proxy, 'encryption')) {
        const enc = String(stripQuotes(proxy.encryption)).trim().toLowerCase();
        if (enc !== '' && enc !== 'none' && !includeUnsupportedProxy) {
            throw unsupported(
                `Platform ${targetPlatform} only supports VLESS encryption=none, got ${proxy.encryption}`,
            );
        }
    }

    const rawTransport = proxy.transport ?? proxy.network;
    const normTransport = isNonEmptyString(rawTransport)
        ? String(stripQuotes(rawTransport)).trim().toLowerCase()
        : 'tcp';

    let transport;
    switch (normTransport) {
        case 'tcp':
        case 'raw':
            transport = 'tcp';
            break;
        case 'ws':
        case 'websocket':
            transport = 'ws';
            break;
        case 'grpc':
            transport = 'grpc';
            break;
        case 'xhttp':
        case 'splithttp':
            transport = 'xhttp';
            break;
        default:
            if (!includeUnsupportedProxy) {
                throw unsupported(
                    `Platform ${targetPlatform} does not support VLESS transport ${rawTransport}`,
                );
            }
            transport = normTransport;
            break;
    }

    const uuid = firstNonEmptyValue(proxy.uuid);
    if (!uuid && !includeUnsupportedProxy) {
        throw unsupported(`Platform ${targetPlatform} requires VLESS uuid`);
    }

    const items = ['vless', proxy.server, proxy.port];
    const options = [`uuid=${quoteRingValue(uuid || '')}`];

    let flow;
    if (isNonEmptyString(proxy.flow)) {
        const rawFlow = String(stripQuotes(proxy.flow)).trim();
        const lowerFlow = rawFlow.toLowerCase();
        if (lowerFlow !== 'none') {
            if (!VALID_VLESS_FLOWS.has(lowerFlow)) {
                if (!includeUnsupportedProxy) {
                    throw unsupported(
                        `Platform ${targetPlatform} does not support VLESS flow ${rawFlow}`,
                    );
                }
            } else {
                flow = lowerFlow;
                options.push(`flow=${flow}`);
            }
        }
    }

    if (Object.prototype.hasOwnProperty.call(proxy, 'packet-encoding')) {
        const rawPe = proxy['packet-encoding'];
        if (rawPe !== undefined && rawPe !== null) {
            const pe = String(stripQuotes(rawPe)).trim().toLowerCase();
            if (pe === 'packet' || pe === 'packetaddr' || pe === 'none' || pe === '') {
                options.push('packet-encoding=packet');
            } else if (pe !== 'xudp' && !includeUnsupportedProxy) {
                throw unsupported(
                    `Platform ${targetPlatform} does not support VLESS packet-encoding ${rawPe}`,
                );
            }
        }
    } else if (
        proxy['packet-addr'] === true ||
        proxy['packet-addr'] === 'true'
    ) {
        options.push('packet-encoding=packet');
    }

    if (transport !== 'tcp') {
        options.push(`transport=${transport}`);
    }

    const resolvedXhttpDownload = resolveVlessXhttpDownloadSource(
        proxy,
        includeUnsupportedProxy,
    );

    if (
        resolvedXhttpDownload != null &&
        transport !== 'xhttp' &&
        !includeUnsupportedProxy
    ) {
        throw unsupported(
            `Platform ${targetPlatform} only supports xhttp-download with XHTTP transport`,
        );
    }

    let uploadPathForXhttp;
    let xhttpMode;

    if (transport === 'ws') {
        const wsOpts = proxy['ws-opts'] || {};
        const { host, headers } = extractVlessHostAndHeaders(
            proxy.host ?? wsOpts.host,
            wsOpts.headers ?? proxy['ws-headers'] ?? proxy.headers,
            includeUnsupportedProxy,
        );
        if (host) {
            options.push(`host=${quoteRingValue(host)}`);
        }
        const path = validateAndNormalizeVlessPath(
            proxy.path ?? wsOpts.path ?? proxy['ws-path'],
            includeUnsupportedProxy,
        );
        if (path) {
            options.push(`path=${quoteRingValue(path)}`);
        }
        if (headers) {
            options.push(`headers=${quoteRingValue(headers)}`);
        }
    } else if (transport === 'grpc') {
        const grpcOpts = proxy['grpc-opts'] || {};
        const serviceName = firstNonEmptyValue(
            proxy['grpc-service-name'] ??
                grpcOpts['grpc-service-name'] ??
                grpcOpts['service-name'] ??
                grpcOpts.serviceName ??
                proxy['service-name'],
        );
        if (serviceName) {
            options.push(`grpc-service-name=${quoteRingValue(serviceName)}`);
        }
        const authority = firstNonEmptyValue(
            proxy['grpc-authority'] ??
                grpcOpts['grpc-authority'] ??
                grpcOpts['_grpc-authority'] ??
                grpcOpts.authority ??
                proxy.authority,
        );
        if (authority) {
            options.push(`grpc-authority=${quoteRingValue(authority)}`);
        }
        const multiMode =
            proxy['grpc-multi-mode'] === true ||
            proxy['grpc-multi-mode'] === 'true' ||
            grpcOpts['grpc-multi-mode'] === true ||
            grpcOpts['grpc-multi-mode'] === 'true' ||
            grpcOpts['multi-mode'] === true ||
            grpcOpts.multiMode === true ||
            String(grpcOpts['_grpc-type'] ?? grpcOpts.mode ?? '')
                .trim()
                .toLowerCase() === 'multi';
        if (multiMode) {
            options.push('grpc-multi-mode=true');
        }
    } else if (transport === 'xhttp') {
        const xhttpOpts =
            proxy['xhttp-opts'] || proxy['splithttp-opts'] || {};
        const { host, headers } = extractVlessHostAndHeaders(
            proxy.host ?? xhttpOpts.host,
            xhttpOpts.headers ?? proxy.headers,
            includeUnsupportedProxy,
        );
        if (host) {
            options.push(`host=${quoteRingValue(host)}`);
        }
        uploadPathForXhttp = validateAndNormalizeVlessPath(
            proxy.path ?? xhttpOpts.path,
            includeUnsupportedProxy,
        );
        if (uploadPathForXhttp) {
            options.push(`path=${quoteRingValue(uploadPathForXhttp)}`);
        }
        if (headers) {
            options.push(`headers=${quoteRingValue(headers)}`);
        }

        const rawMode = firstNonEmptyValue(
            proxy['xhttp-mode'] ??
                xhttpOpts.mode ??
                proxy.mode ??
                proxy._mode,
        );
        if (rawMode) {
            const lowerMode = rawMode.toLowerCase();
            if (!VALID_VLESS_XHTTP_MODES.has(lowerMode)) {
                if (!includeUnsupportedProxy) {
                    throw unsupported(
                        `Platform ${targetPlatform} does not support VLESS xhttp-mode ${rawMode}`,
                    );
                }
            } else {
                xhttpMode = lowerMode;
                options.push(`xhttp-mode=${xhttpMode}`);
            }
        }
    }

    const { isTls, isReality } = appendVlessSecurityOptions(options, proxy, {
        transport,
        defaultAddress: proxy.server,
        includeUnsupportedProxy,
    });

    if (transport === 'xhttp' && resolvedXhttpDownload != null) {
        if (xhttpMode === 'stream-one' && !includeUnsupportedProxy) {
            throw unsupported(
                `Platform ${targetPlatform} does not allow xhttp-download when xhttp-mode=stream-one`,
            );
        }
        appendVlessXhttpDownloadOptions(options, resolvedXhttpDownload, {
            proxy,
            uploadPath: uploadPathForXhttp,
            xhttpMode,
            includeUnsupportedProxy,
        });
    }

    if (flow && !includeUnsupportedProxy) {
        if (transport !== 'tcp') {
            throw unsupported(
                `Platform ${targetPlatform} requires TCP transport for VLESS flow ${flow}`,
            );
        }
        if (!isTls && !isReality) {
            throw unsupported(
                `Platform ${targetPlatform} requires TLS or REALITY for VLESS flow ${flow}`,
            );
        }
    }

    appendCommonOptions(options, proxy);
    return `${proxy.name} = ${items.concat(options).join(', ')}`;
}

function trojan(proxy, includeUnsupportedProxy) {
    if (
        !includeUnsupportedProxy &&
        proxy.network &&
        !['tcp', 'ws'].includes(proxy.network)
    ) {
        throw unsupported(
            `Platform ${targetPlatform} does not support trojan network ${proxy.network}`,
        );
    }

    const password = quoteRingValue(proxy.password || '');
    const items = ['trojan', proxy.server, proxy.port];
    const options = [`password=${password}`, 'tls=true'];

    const sni = proxy.sni || proxy.server;
    if (sni) {
        options.push(`sni=${quoteRingValue(sni)}`);
    }
    if (proxy['skip-cert-verify']) {
        options.push('skip-cert-verify=true');
    }
    appendAlpns(options, proxy);

    if (proxy.network === 'ws') {
        options.push('ws=true');
        const wsPath = proxy['ws-opts']?.path || proxy['ws-path'];
        if (wsPath) {
            options.push(`ws-path=${quoteRingValue(wsPath)}`);
        }
        appendWsHeaders(options, proxy);
    }

    appendCommonOptions(options, proxy);
    return `${proxy.name} = ${items.concat(options).join(', ')}`;
}

function formatHysteriaDown(down) {
    if (down == null) return '';
    const s = String(down).trim().toLowerCase();
    if (/^\d+$/.test(s)) {
        return s;
    }
    return s.replace(/\s+/g, '');
}

function hysteria(proxy) {
    const items = ['hysteria', proxy.server, proxy.port];
    const options = [];

    const auth = proxy.auth || proxy.password || proxy.auth_str;
    if (auth != null && `${auth}`.length > 0) {
        options.push(`auth=${quoteRingValue(auth)}`);
    }

    const downVal = proxy.down || proxy['down-mbps'] || proxy.down_mbps;
    const down = formatHysteriaDown(downVal);
    if (down) {
        options.push(`down=${quoteRingValue(down)}`);
    }

    const obfs =
        proxy['obfs-password'] ??
        (typeof proxy.obfs === 'string' ? proxy.obfs : undefined);
    if (obfs != null && `${obfs}`.length > 0) {
        options.push(`obfs=${quoteRingValue(obfs)}`);
    }

    const sni = proxy.sni || proxy.server;
    if (sni) {
        options.push(`sni=${quoteRingValue(sni)}`);
    }

    if (proxy['skip-cert-verify']) {
        options.push('skip-cert-verify=true');
    }

    appendAlpns(options, proxy);
    appendCommonOptions(options, proxy);
    return `${proxy.name} = ${items.concat(options).join(', ')}`;
}

function tuic(proxy) {
    const items = ['tuic', proxy.server, proxy.port];
    const options = [];

    if (proxy.uuid) {
        options.push(`uuid=${quoteRingValue(proxy.uuid)}`);
    }

    const password = proxy.password || proxy.token;
    if (password) {
        options.push(`password=${quoteRingValue(password)}`);
    }

    const rawUdpRelayMode = proxy['udp-relay-mode'] || proxy.udp_relay_mode;
    if (rawUdpRelayMode) {
        const mode = String(rawUdpRelayMode).trim().toLowerCase();
        if (mode === 'native' || mode === 'quic') {
            options.push(`udp-relay-mode=${mode}`);
        } else {
            options.push(`udp-relay-mode=${quoteRingValue(rawUdpRelayMode)}`);
        }
    }

    const sni = proxy.sni || proxy.server;
    if (sni) {
        options.push(`sni=${quoteRingValue(sni)}`);
    }

    if (proxy['skip-cert-verify']) {
        options.push('skip-cert-verify=true');
    }

    appendAlpns(options, proxy);
    appendCommonOptions(options, proxy);
    return `${proxy.name} = ${items.concat(options).join(', ')}`;
}

function cleanIpWithoutMask(val) {
    if (!val) return '';
    const s = String(stripQuotes(val)).trim();
    return s.replace(/\/\d+$/, '').trim();
}

function formatWireGuardReserved(val) {
    if (!val) return '';
    let parts;
    if (Array.isArray(val)) {
        parts = val;
    } else {
        const s = String(val).replace(/[\[\]]/g, '').trim();
        parts = s.split(',').map((x) => x.trim()).filter(Boolean);
    }
    return `[${parts.map((x) => parseInt(x, 10) || 0).join(',')}]`;
}

function wireguard(proxy) {
    const rawList = [];
    if (proxy.addresses) {
        const raw = Array.isArray(proxy.addresses)
            ? proxy.addresses
            : [proxy.addresses];
        rawList.push(...raw);
    } else {
        if (proxy.ip) rawList.push(proxy.ip);
        if (proxy.ipv6) rawList.push(proxy.ipv6);
    }
    const cleanIps = rawList
        .flatMap((item) => String(stripQuotes(item)).split(','))
        .map((item) => cleanIpWithoutMask(item))
        .filter(Boolean);
    const addrStr = cleanIps.join(', ');

    const peers = [];
    const rawPeers =
        Array.isArray(proxy.peers) && proxy.peers.length > 0
            ? proxy.peers
            : [
                  {
                      'public-key': proxy['public-key'],
                      server: proxy.server,
                      port: proxy.port,
                      'allowed-ips': proxy['allowed-ips'],
                      'pre-shared-key':
                          proxy['pre-shared-key'] || proxy['preshared-key'],
                      reserved: proxy.reserved,
                      keepalive:
                          proxy.keepalive ??
                          proxy['persistent-keepalive'] ??
                          proxy.persistent_keepalive,
                  },
              ];

    for (const p of rawPeers) {
        const peerParts = [];
        if (p['public-key']) {
            peerParts.push(`public-key=${quoteRingValue(p['public-key'])}`);
        }
        const endpoint =
            p.endpoint ||
            (p.server && p.port ? `${p.server}:${p.port}` : '');
        if (endpoint) {
            peerParts.push(`endpoint=${quoteRingValue(endpoint)}`);
        }
        const allowedIpsRaw = p['allowed-ips'] || '0.0.0.0/0, ::/0';
        const allowedIps = Array.isArray(allowedIpsRaw)
            ? allowedIpsRaw.join(', ')
            : String(allowedIpsRaw);
        peerParts.push(`allowed-ips=${quoteRingValue(allowedIps)}`);
        const psk = p['pre-shared-key'] || p['preshared-key'];
        if (psk) {
            peerParts.push(`preshared-key=${quoteRingValue(psk)}`);
        }
        if (p.reserved) {
            peerParts.push(`reserved=${formatWireGuardReserved(p.reserved)}`);
        }
        const keepalive =
            p.keepalive ??
            p['persistent-keepalive'] ??
            p.persistent_keepalive;
        if (keepalive != null && !Number.isNaN(Number(keepalive))) {
            peerParts.push(`keepalive=${parseInt(keepalive, 10)}`);
        }
        peers.push(`{${peerParts.join(',')}}`);
    }

    const items = [
        'wireguard',
        `addresses=${quoteRingValue(addrStr)}`,
        `private-key=${quoteRingValue(proxy['private-key'] || '')}`,
        `mtu=${proxy.mtu || 1280}`,
    ];

    const dnsVal = proxy.dns || proxy['dns-servers'];
    if (dnsVal) {
        const rawDns = Array.isArray(dnsVal) ? dnsVal : [dnsVal];
        const dnsStr = rawDns
            .flatMap((item) => String(stripQuotes(item)).split(','))
            .map((item) => String(stripQuotes(item)).trim())
            .filter(Boolean)
            .join(', ');
        if (dnsStr) {
            items.push(`dns=${quoteRingValue(dnsStr)}`);
        }
    }

    items.push(`peers=[${peers.join(',')}]`);

    const options = [];
    appendCommonOptions(options, proxy);
    return `${proxy.name} = ${items.concat(options).join(', ')}`;
}

function socks(proxy) {
    const items = ['socks', proxy.server, proxy.port];
    const options = [];
    if (isPresent(proxy, 'username')) {
        options.push(`username=${quoteRingValue(proxy.username)}`);
        options.push(`password=${quoteRingValue(proxy.password || '')}`);
    }
    if (proxy.tls) {
        options.push('tls=true');
        const sni = proxy.sni || proxy.server;
        if (sni) {
            options.push(`sni=${quoteRingValue(sni)}`);
        }
        if (proxy['skip-cert-verify']) {
            options.push('skip-cert-verify=true');
        }
    }
    appendCommonOptions(options, proxy);
    return `${proxy.name} = ${items.concat(options).join(', ')}`;
}

function http(proxy) {
    const items = ['http', proxy.server, proxy.port];
    const options = [];
    if (isPresent(proxy, 'username')) {
        options.push(`username=${quoteRingValue(proxy.username)}`);
        options.push(`password=${quoteRingValue(proxy.password || '')}`);
    }
    if (proxy.tls === true || proxy.type === 'https') {
        options.push('tls=true');
        const sni = proxy.sni || proxy.server;
        if (sni) {
            options.push(`sni=${quoteRingValue(sni)}`);
        }
        if (proxy['skip-cert-verify']) {
            options.push('skip-cert-verify=true');
        }
        appendAlpns(options, proxy);
    }
    appendCommonOptions(options, proxy);
    return `${proxy.name} = ${items.concat(options).join(', ')}`;
}

function anytls(proxy, includeUnsupportedProxy) {
    if (
        !includeUnsupportedProxy &&
        proxy.network &&
        !['tcp'].includes(proxy.network)
    ) {
        throw unsupported(
            `Platform ${targetPlatform} does not support proxy type ${proxy.type} with network ${proxy.network}`,
        );
    }
    const items = ['anytls', proxy.server, proxy.port];
    const options = [];
    if (proxy.password) {
        options.push(`password=${quoteRingValue(proxy.password)}`);
    }
    const sni = proxy.sni || proxy.server;
    if (sni) {
        options.push(`sni=${quoteRingValue(sni)}`);
    }
    if (proxy['skip-cert-verify']) {
        options.push('skip-cert-verify=true');
    }
    appendAlpns(options, proxy);
    appendCommonOptions(options, proxy);
    return `${proxy.name} = ${items.concat(options).join(', ')}`;
}

function shadowtls(proxy) {
    const items = ['shadowtls', proxy.server, proxy.port];
    const options = [];
    const password = proxy.password || proxy['plugin-opts']?.password;
    if (password) {
        options.push(`password=${quoteRingValue(password)}`);
    }
    const sni = proxy.sni || proxy['plugin-opts']?.host || proxy.server;
    if (sni) {
        options.push(`sni=${quoteRingValue(sni)}`);
    }
    const version = proxy.version || proxy['plugin-opts']?.version;
    if (version) {
        options.push(`version=${version}`);
    }
    // 严禁输出 skip-cert-verify=true 或 enable-early-data=true
    appendAlpns(options, proxy);
    appendCommonOptions(options, proxy);
    return `${proxy.name} = ${items.concat(options).join(', ')}`;
}

function ssh(proxy) {
    const items = ['ssh', proxy.server, proxy.port];
    const options = [];
    if (isPresent(proxy, 'username')) {
        options.push(`username=${quoteRingValue(proxy.username)}`);
    }
    if (isPresent(proxy, 'password')) {
        options.push(`password=${quoteRingValue(proxy.password)}`);
    }
    const privateKey = proxy['private-key'] || proxy['keystore-private-key'];
    if (privateKey != null && `${privateKey}`.trim().length > 0) {
        options.push(`private-key=${quoteRingValue(privateKey)}`);
    }
    appendCommonOptions(options, proxy);
    return `${proxy.name} = ${items.concat(options).join(', ')}`;
}

function tailscale(proxy) {
    const items = ['tailscale'];
    const options = [];
    const authKey = proxy['auth-key'] || proxy.authkey;
    if (authKey) {
        options.push(`auth-key=${quoteRingValue(authKey)}`);
    }
    const hostname = proxy.hostname || proxy['device-name'];
    if (hostname) {
        options.push(`hostname=${quoteRingValue(hostname)}`);
    }
    const controlUrl = proxy['control-url'] || proxy.control_url;
    if (controlUrl) {
        options.push(`control-url=${quoteRingValue(controlUrl)}`);
    }
    const exitNode = proxy['exit-node'] || proxy.exit_node;
    if (exitNode) {
        options.push(`exit-node=${quoteRingValue(exitNode)}`);
    }
    appendCommonOptions(options, proxy);
    return `${proxy.name} = ${items.concat(options).join(', ')}`;
}

function direct(proxy) {
    return `${proxy.name} = direct`;
}

function reject(proxy) {
    return `${proxy.name} = ${proxy.type}`;
}
