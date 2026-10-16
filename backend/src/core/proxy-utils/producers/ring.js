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
