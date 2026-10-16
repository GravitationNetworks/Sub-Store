import { isPresent, getWireGuardAddressWithCIDR } from './utils';

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

    if (
        proxy['sing-mux'] === true ||
        proxy['sing-mux'] === 'true' ||
        proxy.smux?.enabled === true
    ) {
        options.push('sing-mux=true');
    } else if (proxy['sing-mux'] === false || proxy['sing-mux'] === 'false') {
        options.push('sing-mux=false');
    }

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
    const items = ['shadowsocks', proxy.server, proxy.port, cipher, password];
    const options = [];

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
        } else if (proxy.plugin === 'shadow-tls') {
            if (proxy['plugin-opts']?.password) {
                options.push(
                    `shadow-tls-password=${quoteRingValue(
                        proxy['plugin-opts'].password,
                    )}`,
                );
            }
            if (proxy['plugin-opts']?.host) {
                options.push(
                    `shadow-tls-sni=${quoteRingValue(
                        proxy['plugin-opts'].host,
                    )}`,
                );
            }
            if (proxy['plugin-opts']?.version) {
                options.push(`shadow-tls-version=${proxy['plugin-opts'].version}`);
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
    const items = ['vmess', proxy.server, proxy.port, uuid];
    const options = [];

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
    const items = ['trojan', proxy.server, proxy.port, password];
    const options = [];

    if (proxy.tls !== false) {
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

function hysteria(proxy) {
    const items = ['hysteria', proxy.server, proxy.port];
    const options = [];

    const auth = proxy.auth || proxy.password || proxy.auth_str;
    if (auth != null && `${auth}`.length > 0) {
        options.push(`auth=${quoteRingValue(auth)}`);
    }

    const down = proxy.down || proxy['down-mbps'] || proxy.down_mbps;
    if (down != null && `${down}`.length > 0) {
        options.push(`down=${quoteRingValue(down)}`);
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

    if (proxy['udp-relay-mode']) {
        options.push(`udp-relay-mode=${quoteRingValue(proxy['udp-relay-mode'])}`);
    }

    const sni = proxy.sni || proxy.server;
    if (sni) {
        options.push(`sni=${quoteRingValue(sni)}`);
    }

    if (proxy['skip-cert-verify']) {
        options.push('skip-cert-verify=true');
    }

    if (proxy['congestion-controller']) {
        options.push(
            `congestion-controller=${quoteRingValue(proxy['congestion-controller'])}`,
        );
    }

    appendAlpns(options, proxy);
    appendCommonOptions(options, proxy);
    return `${proxy.name} = ${items.concat(options).join(', ')}`;
}

function wireguard(proxy) {
    const addresses = [];
    if (proxy.addresses) {
        const raw = Array.isArray(proxy.addresses)
            ? proxy.addresses
            : [proxy.addresses];
        addresses.push(...raw);
    } else {
        const ipv4 = getWireGuardAddressWithCIDR(proxy, 'ipv4') || proxy.ip;
        const ipv6 = getWireGuardAddressWithCIDR(proxy, 'ipv6') || proxy.ipv6;
        if (ipv4) addresses.push(ipv4);
        if (ipv6) addresses.push(ipv6);
    }
    const addrStr = addresses
        .map((a) => String(a).trim())
        .filter(Boolean)
        .join(', ');

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
            const res = Array.isArray(p.reserved)
                ? p.reserved.join(',')
                : p.reserved;
            peerParts.push(`reserved=${quoteRingValue(res)}`);
        }
        peers.push(`{${peerParts.join(',')}}`);
    }

    const items = [
        'wireguard',
        `addresses=${quoteRingValue(addrStr)}`,
        `private-key=${quoteRingValue(proxy['private-key'] || '')}`,
        `mtu=${proxy.mtu || 1280}`,
        `peers=[${peers.join(',')}]`,
    ];

    const options = [];
    appendCommonOptions(options, proxy);
    return `${proxy.name} = ${items.concat(options).join(', ')}`;
}

function socks(proxy) {
    const items = ['socks', proxy.server, proxy.port];
    if (isPresent(proxy, 'username')) {
        items.push(quoteRingValue(proxy.username));
        items.push(quoteRingValue(proxy.password || ''));
    }
    const options = [];
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
    if (isPresent(proxy, 'username')) {
        items.push(quoteRingValue(proxy.username));
        items.push(quoteRingValue(proxy.password || ''));
    }
    const options = [];
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
    if (proxy['skip-cert-verify']) {
        options.push('skip-cert-verify=true');
    }
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
    if (proxy.server && proxy.port) {
        items.push(proxy.server, proxy.port);
    } else if (proxy.server) {
        items.push(proxy.server);
    }
    const options = [];
    const authKey = proxy['auth-key'] || proxy.authkey;
    if (authKey) {
        options.push(`auth-key=${quoteRingValue(authKey)}`);
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
    const items = ['direct'];
    const options = [];
    appendCommonOptions(options, proxy);
    return `${proxy.name} = ${items.concat(options).join(', ')}`;
}

function reject(proxy) {
    const type = proxy.type === 'reject-drop' ? 'reject-drop' : 'reject';
    const items = [type];
    const options = [];
    appendCommonOptions(options, proxy);
    return `${proxy.name} = ${items.concat(options).join(', ')}`;
}
