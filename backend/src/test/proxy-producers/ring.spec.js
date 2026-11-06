import { expect } from 'chai';
import { describe, it } from 'mocha';

import Ring_Producer, {
    RingUnsupportedProxyError,
} from '@/core/proxy-utils/producers/ring';
import PROXY_PRODUCERS from '@/core/proxy-utils/producers';
import { ProxyUtils } from '@/core/proxy-utils';
import {
    getPlatformFromUserAgent,
    getPlatformFromHeaders,
} from '@/utils/user-agent';
import { produceExternal, produceInternal, UUID } from './helpers';

describe('Ring producer & platform tests', function () {
    describe('Target platform registration', function () {
        it('registers Ring and ring in PROXY_PRODUCERS', function () {
            expect(PROXY_PRODUCERS.Ring).to.be.an('object');
            expect(PROXY_PRODUCERS.Ring.produce).to.be.a('function');
            expect(PROXY_PRODUCERS.ring).to.be.an('object');
            expect(PROXY_PRODUCERS.ring.produce).to.be.a('function');
        });

        it('produces identical output for Ring and ring', function () {
            const node = {
                type: 'ss',
                name: 'SS1',
                server: '1.1.1.1',
                port: 8388,
                cipher: 'aes-128-gcm',
                password: 'pass',
            };
            const r1 = PROXY_PRODUCERS.Ring.produce(node);
            const r2 = PROXY_PRODUCERS.ring.produce(node);
            expect(r1).to.equal('SS1 = shadowsocks, 1.1.1.1, 8388, encrypt-method=aes-128-gcm, password=pass');
            expect(r1).to.equal(r2);
        });
    });

    describe('User-Agent recognition', function () {
        it('recognizes various Ring User-Agents', function () {
            const uas = [
                'Ring/1.0.0 (iOS)',
                'ring-core/0.1.0',
                'Ring/2.3.4 (macOS; arm64)',
                'RING/1.0',
                'Mozilla/5.0 Ring/1.0',
                'ring',
            ];
            for (const ua of uas) {
                expect(
                    getPlatformFromUserAgent({
                        ua: ua.toLowerCase(),
                        UA: ua,
                        accept: '',
                    }),
                ).to.equal('Ring');
            }
        });

        it('extracts platform from headers case-insensitively', function () {
            expect(
                getPlatformFromHeaders({ 'user-agent': 'Ring/1.0.0 (iOS)' }),
            ).to.equal('Ring');
            expect(
                getPlatformFromHeaders({ 'User-Agent': 'ring-client/2.0' }),
            ).to.equal('Ring');
        });

        it('does not shadow existing clients', function () {
            expect(
                getPlatformFromUserAgent({
                    ua: 'surge/4.0',
                    UA: 'Surge/4.0',
                    accept: '',
                }),
            ).to.equal('Surge');
            expect(
                getPlatformFromUserAgent({
                    ua: 'loon/2.0',
                    UA: 'Loon/2.0',
                    accept: '',
                }),
            ).to.equal('Loon');
            expect(
                getPlatformFromUserAgent({
                    ua: 'clash/1.0',
                    UA: 'Clash/1.0',
                    accept: '',
                }),
            ).to.equal('Clash');
        });
    });

    describe('Protocol conversions', function () {
        const producer = Ring_Producer();

        it('produces Shadowsocks with obfs and rejects shadow-tls plugin', function () {
            const obfs = producer.produce({
                type: 'ss',
                name: 'SS-Obfs',
                server: 'ss.example.com',
                port: 80,
                cipher: 'aes-128-gcm',
                password: 'pwd',
                plugin: 'obfs',
                'plugin-opts': { mode: 'http', host: 'bing.com', path: '/s' },
            });
            expect(obfs).to.equal(
                'SS-Obfs = shadowsocks, ss.example.com, 80, encrypt-method=aes-128-gcm, password=pwd, obfs=http, obfs-host=bing.com, obfs-path=/s',
            );

            expect(() =>
                producer.produce({
                    type: 'ss',
                    name: 'SS-STLS',
                    server: 'ss.example.com',
                    port: 443,
                    cipher: 'aes-128-gcm',
                    password: 'pwd',
                    plugin: 'shadow-tls',
                    'plugin-opts': {
                        password: 'pass',
                        host: 'apple.com',
                        version: 3,
                    },
                }),
            ).to.throw(RingUnsupportedProxyError);
        });

        it('converts all Sing Mux parameters from top-level, smux and multiplex objects', function () {
            // 1. Direct top-level options
            const directMux = producer.produce({
                type: 'ss',
                name: 'SS-Mux-1',
                server: 'ss.example.com',
                port: 8388,
                cipher: 'aes-128-gcm',
                password: 'pwd',
                'sing-mux': true,
                'sing-mux-stream-num-per-conn': 16,
                'sing-mux-max-connections': 4,
                'sing-mux-padding': true,
                'sing-mux-idle-timeout': 60,
            });
            expect(directMux).to.include('sing-mux=true');
            expect(directMux).to.include('sing-mux-stream-num-per-conn=16');
            expect(directMux).to.include('sing-mux-max-connections=4');
            expect(directMux).to.include('sing-mux-padding=true');
            expect(directMux).to.include('sing-mux-idle-timeout=60');

            // 2. From smux object (Sing-box format)
            const smuxNode = producer.produce({
                type: 'trojan',
                name: 'Trojan-Smux',
                server: 'trojan.example.com',
                port: 443,
                password: 'pwd',
                smux: {
                    enabled: true,
                    'max-streams': 8,
                    'max-connections': 2,
                    padding: true,
                    'idle-timeout': 45,
                },
            });
            expect(smuxNode).to.include('sing-mux=true');
            expect(smuxNode).to.include('sing-mux-stream-num-per-conn=8');
            expect(smuxNode).to.include('sing-mux-max-connections=2');
            expect(smuxNode).to.include('sing-mux-padding=true');
            expect(smuxNode).to.include('sing-mux-idle-timeout=45');

            // 3. From multiplex object (ClashMeta format)
            const multiplexNode = producer.produce({
                type: 'ss',
                name: 'SS-Multiplex',
                server: 'ss.example.com',
                port: 8388,
                cipher: 'aes-128-gcm',
                password: 'pwd',
                multiplex: {
                    enabled: true,
                    max_streams: 32,
                    max_connections: 8,
                    padding: false,
                    idle_timeout: 90,
                },
            });
            expect(multiplexNode).to.include('sing-mux=true');
            expect(multiplexNode).to.include('sing-mux-stream-num-per-conn=32');
            expect(multiplexNode).to.include('sing-mux-max-connections=8');
            expect(multiplexNode).to.include('sing-mux-padding=false');
            expect(multiplexNode).to.include('sing-mux-idle-timeout=90');

            // 4. Explicit disable
            const disabledMux = producer.produce({
                type: 'ss',
                name: 'SS-NoMux',
                server: 'ss.example.com',
                port: 8388,
                cipher: 'aes-128-gcm',
                password: 'pwd',
                'sing-mux': false,
            });
            expect(disabledMux).to.include('sing-mux=false');
        });

        it('produces VMess with WS and TLS', function () {
            const res = producer.produce({
                type: 'vmess',
                name: 'VMess-Test',
                server: 'vmess.com',
                port: 443,
                uuid: UUID,
                network: 'ws',
                tls: true,
                sni: 'sni.com',
                'skip-cert-verify': true,
                alpn: ['h2', 'http/1.1'],
                'ws-opts': { path: '/ws', headers: { Host: 'ws.com' } },
            });
            expect(res).to.include('ws=true');
            expect(res).to.include('ws-path=/ws');
            expect(res).to.include('headers=Host:ws.com');
            expect(res).to.include('tls=true');
            expect(res).to.include('sni=sni.com');
            expect(res).to.include('skip-cert-verify=true');
            expect(res).to.include('alpns="h2,http/1.1"');
        });

        it('normalizes various ip-version inputs to valid Ring enum values', function () {
            const cases = [
                ['prefer-v4', 'prefer-ipv4'],
                ['prefer-ipv4', 'prefer-ipv4'],
                ['v4_prefer', 'prefer-ipv4'],
                ['ipv4-prefer', 'prefer-ipv4'],
                ['prefer-v6', 'prefer-ipv6'],
                ['prefer-ipv6', 'prefer-ipv6'],
                ['v6_prefer', 'prefer-ipv6'],
                ['ipv6-prefer', 'prefer-ipv6'],
                ['v4-only', 'ipv4-only'],
                ['ipv4-only', 'ipv4-only'],
                ['v4_only', 'ipv4-only'],
                ['ipv4', 'ipv4-only'],
                ['v6-only', 'ipv6-only'],
                ['ipv6-only', 'ipv6-only'],
                ['v6_only', 'ipv6-only'],
                ['ipv6', 'ipv6-only'],
                ['dual', 'dual'],
                ['dual_stack', 'dual'],
                ['dual-stack', 'dual'],
            ];
            for (const [input, expected] of cases) {
                const output = producer.produce({
                    type: 'ss',
                    name: 'Node',
                    server: '1.1.1.1',
                    port: 8388,
                    cipher: 'aes-128-gcm',
                    password: 'pwd',
                    'ip-version': input,
                });
                expect(output).to.include(`ip-version=${expected}`);
            }

            const invalidOutput = producer.produce({
                type: 'ss',
                name: 'Node',
                server: '1.1.1.1',
                port: 8388,
                cipher: 'aes-128-gcm',
                password: 'pwd',
                'ip-version': 'invalid-version-xyz',
            });
            expect(invalidOutput).not.to.include('ip-version=');
        });

        it('throws RingUnsupportedProxyError for unsupported network or config', function () {
            expect(() =>
                producer.produce({
                    type: 'vmess',
                    name: 'V',
                    server: '1.1.1.1',
                    port: 443,
                    uuid: UUID,
                    network: 'grpc',
                }),
            ).to.throw(RingUnsupportedProxyError);

            expect(() =>
                producer.produce({
                    type: 'vmess',
                    name: 'V',
                    server: '1.1.1.1',
                    port: 443,
                    uuid: UUID,
                    network: 'ws',
                    'ws-opts': { 'v2ray-http-upgrade': true },
                }),
            ).to.throw(RingUnsupportedProxyError);
        });

        it('produces Trojan, Hysteria, TUIC, and WireGuard', function () {
            const trojan = producer.produce({
                type: 'trojan',
                name: 'Trojan',
                server: 't.com',
                port: 443,
                password: 'pass',
            });
            expect(trojan).to.include('trojan, t.com, 443, password=pass, tls=true');

            const hy = producer.produce({
                type: 'hysteria2',
                name: 'Hy2',
                server: 'hy.com',
                port: 443,
                password: 'pass',
                'up-mbps': 100,
                'down-mbps': 500,
            });
            expect(hy).to.equal(
                'Hy2 = hysteria, hy.com, 443, auth=pass, down=500, sni=hy.com',
            );

            const tuic = producer.produce({
                type: 'tuic',
                name: 'Tuic',
                server: 'tuic.com',
                port: 8443,
                uuid: UUID,
                password: 'pass',
                'udp-relay-mode': 'NATIVE',
                'congestion-controller': 'bbr',
            });
            expect(tuic).to.include('tuic, tuic.com, 8443');
            expect(tuic).to.include('udp-relay-mode=native');
            expect(tuic).not.to.include('congestion-controller');

            const wg = producer.produce({
                type: 'wireguard',
                name: 'WG',
                addresses: ['10.0.0.2/32'],
                'private-key': 'priv==',
                peers: [
                    {
                        'public-key': 'pub==',
                        endpoint: 'wg.com:51820',
                        'allowed-ips': '0.0.0.0/0, ::/0',
                    },
                ],
            });
            expect(wg).to.include('wireguard, addresses=10.0.0.2');
            expect(wg).not.to.include('/32');
            expect(wg).to.include('endpoint=wg.com:51820');
            expect(wg).to.include('allowed-ips="0.0.0.0/0, ::/0"');
        });

        it('produces WireGuard with pure IPs without CIDR mask, reserved array, keepalive, and interface dns', function () {
            const wg = producer.produce({
                type: 'wireguard',
                name: 'WG-Advanced',
                addresses: ['10.0.0.2/32', 'fd00::2/128'],
                'private-key': 'privkey',
                mtu: 1420,
                dns: ['1.1.1.1', '8.8.8.8'],
                peers: [
                    {
                        'public-key': 'pubkey',
                        endpoint: 'wg.example.com:51820',
                        'allowed-ips': '0.0.0.0/0, ::/0',
                        reserved: [0, 0, 0],
                        keepalive: 25,
                    },
                ],
            });
            expect(wg).to.include('addresses="10.0.0.2, fd00::2"');
            expect(wg).not.to.include('/32');
            expect(wg).not.to.include('/128');
            expect(wg).to.include('dns="1.1.1.1, 8.8.8.8"');
            expect(wg).to.include('reserved=[0,0,0]');
            expect(wg).to.include('keepalive=25');
        });

        it('produces Hysteria with Salamander obfs, down unit preservation, and forbids up or congestion-controller', function () {
            const hy = producer.produce({
                type: 'hysteria2',
                name: 'Hy2-Obfs',
                server: 'hy2.example.com',
                port: 443,
                password: 'pass',
                'obfs-password': 'salamander-pwd',
                down: '100 Mbps',
                up: '50 Mbps',
                'congestion-controller': 'bbr',
            });
            expect(hy).to.include('obfs=salamander-pwd');
            expect(hy).to.include('down=100mbps');
            expect(hy).not.to.include('up=');
            expect(hy).not.to.include('congestion-controller=');
        });

        it('produces ShadowTLS without skip-cert-verify or enable-early-data', function () {
            const st = producer.produce({
                type: 'shadowtls',
                name: 'ST-Node',
                server: 'st.example.com',
                port: 443,
                password: 'pass',
                sni: 'apple.com',
                version: 3,
                'skip-cert-verify': true,
                'enable-early-data': true,
            });
            expect(st).to.equal(
                'ST-Node = shadowtls, st.example.com, 443, password=pass, sni=apple.com, version=3',
            );
            expect(st).not.to.include('skip-cert-verify');
            expect(st).not.to.include('enable-early-data');
        });

        it('produces Tailscale with pure options format and no server/port positional arguments', function () {
            const ts = producer.produce({
                type: 'tailscale',
                name: 'TS-Node',
                server: 'ts.example.com',
                port: 443,
                'auth-key': 'tskey-auth-xxx',
                hostname: 'my-node',
                'control-url': 'https://controlplane.tailscale.com',
                'exit-node': 'exit-us',
            });
            expect(ts).to.equal(
                'TS-Node = tailscale, auth-key=tskey-auth-xxx, hostname=my-node, control-url=https://controlplane.tailscale.com, exit-node=exit-us',
            );
            expect(ts).not.to.include('ts.example.com');
            expect(ts).not.to.include('443');
        });

        it('produces base strategies direct and reject without network connection options', function () {
            const d = producer.produce({
                type: 'direct',
                name: 'Direct-Node',
                tfo: true,
                'ip-version': 'ipv4',
            });
            expect(d).to.equal('Direct-Node = direct');
            expect(d).not.to.include('tfo=');
            expect(d).not.to.include('ip-version=');

            for (const rType of ['reject', 'reject-drop', 'reject-tinygif', 'reject-no-drop']) {
                const r = producer.produce({
                    type: rType,
                    name: `R-${rType}`,
                    tfo: true,
                    'ip-version': 'ipv4',
                });
                expect(r).to.equal(`R-${rType} = ${rType}`);
                expect(r).not.to.include('tfo=');
            }
        });

        it('sanitizes names and properly quotes special characters', function () {
            const res = producer.produce({
                type: 'ss',
                name: 'Node=1,Test',
                server: '1.2.3.4',
                port: 8388,
                cipher: 'aes-128-gcm',
                password: 'p@ss with space,comma=eq#hash"quote"',
            });
            expect(res).to.match(/^Node1Test = shadowsocks/);
            expect(res).to.include('"p@ss with space,comma=eq#hash\\"quote\\""');
        });

        it('produces VLESS with TCP, TLS, REALITY, Vision, and packet-encoding', function () {
            const tlsNode = producer.produce({
                type: 'vless',
                name: 'VLESS-TLS',
                server: 'vless.example.com',
                port: 443,
                uuid: UUID,
                tls: true,
                sni: 'sni.example.com',
                alpn: ['h2', 'http/1.1'],
                'skip-cert-verify': true,
                'tls-fingerprint':
                    '11223344556677889900aabbccddeeff11223344556677889900aabbccddeeff',
                'client-fingerprint': 'chrome',
                'packet-encoding': 'packetaddr',
            });
            expect(tlsNode).to.equal(
                `VLESS-TLS = vless, vless.example.com, 443, uuid=${UUID}, packet-encoding=packet, security=tls, sni=sni.example.com, alpns="h2,http/1.1", skip-cert-verify=true, server-cert-fingerprint-sha256=11223344556677889900aabbccddeeff11223344556677889900aabbccddeeff, fingerprint=chrome`,
            );

            const realityVision = producer.produce({
                type: 'vless',
                name: 'VLESS-Vision',
                server: 'reality.example.com',
                port: 443,
                uuid: UUID,
                tls: true,
                sni: 'www.microsoft.com',
                flow: 'xtls-rprx-vision-udp443',
                'skip-cert-verify': true,
                'reality-opts': {
                    'public-key': 'test-reality-pubkey',
                    'short-id': '01ab',
                },
                'client-fingerprint': 'safari',
            });
            expect(realityVision).to.equal(
                `VLESS-Vision = vless, reality.example.com, 443, uuid=${UUID}, flow=xtls-rprx-vision-udp443, security=reality, sni=www.microsoft.com, reality-public-key=test-reality-pubkey, reality-short-id=01ab, fingerprint=safari`,
            );
            expect(realityVision).not.to.include('tls=true');
            expect(realityVision).not.to.include('skip-cert-verify');
        });

        it('produces VLESS with WebSocket and gRPC transports', function () {
            const wsNode = producer.produce({
                type: 'vless',
                name: 'VLESS-WS',
                server: 'cdn.example.com',
                port: 443,
                uuid: UUID,
                network: 'ws',
                tls: true,
                sni: 'cdn.example.com',
                'ws-opts': {
                    path: '/vless-ws',
                    headers: {
                        Host: 'ws.example.com',
                        'X-Custom': 'val',
                    },
                },
            });
            expect(wsNode).to.equal(
                `VLESS-WS = vless, cdn.example.com, 443, uuid=${UUID}, transport=ws, host=ws.example.com, path=/vless-ws, headers=X-Custom:val, security=tls, sni=cdn.example.com`,
            );

            const grpcNode = producer.produce({
                type: 'vless',
                name: 'VLESS-gRPC',
                server: 'grpc.example.com',
                port: 443,
                uuid: UUID,
                network: 'grpc',
                tls: true,
                sni: 'grpc.example.com',
                alpn: ['h2'],
                'grpc-opts': {
                    'grpc-service-name': 'myGunService',
                    '_grpc-authority': 'auth.example.com',
                    '_grpc-type': 'multi',
                },
            });
            expect(grpcNode).to.equal(
                `VLESS-gRPC = vless, grpc.example.com, 443, uuid=${UUID}, transport=grpc, grpc-service-name=myGunService, grpc-authority=auth.example.com, grpc-multi-mode=true, security=tls, sni=grpc.example.com, alpns=h2`,
            );
        });

        it('produces VLESS with XHTTP, HTTP/3 ALPN, and flat xhttp-download-* options', function () {
            const h2ToH3 = producer.produce({
                type: 'vless',
                name: 'VLESS-XHTTP-H2-H3',
                server: 'up.example.com',
                port: 443,
                uuid: UUID,
                network: 'xhttp',
                tls: true,
                sni: 'up.example.com',
                alpn: ['h2'],
                'xhttp-opts': {
                    host: 'cdn-up.example.com',
                    path: '/ring/',
                    mode: 'auto',
                    headers: {
                        'X-Up': '1',
                    },
                    'download-settings': {
                        server: 'down.example.com',
                        port: 8443,
                        tls: true,
                        servername: 'down.example.com',
                        alpn: ['h3'],
                        'client-fingerprint': 'chrome',
                        'skip-cert-verify': true,
                        host: 'cdn-down.example.com',
                        headers: {
                            'X-Down': '2',
                        },
                    },
                },
            });
            expect(h2ToH3).to.equal(
                `VLESS-XHTTP-H2-H3 = vless, up.example.com, 443, uuid=${UUID}, transport=xhttp, host=cdn-up.example.com, path=/ring/, headers=X-Up:1, xhttp-mode=auto, security=tls, sni=up.example.com, alpns=h2, xhttp-download=true, xhttp-download-address=down.example.com, xhttp-download-port=8443, xhttp-download-security=tls, xhttp-download-sni=down.example.com, xhttp-download-alpns=h3, xhttp-download-skip-cert-verify=true, xhttp-download-fingerprint=chrome, xhttp-download-host=cdn-down.example.com, xhttp-download-path=/ring/, xhttp-download-headers=X-Down:2`,
            );

            // Direct top-level flat xhttp-download-* fields (like sing-mux)
            const directFlatDownload = producer.produce({
                type: 'vless',
                name: 'VLESS-Flat-DL',
                server: 'up.example.com',
                port: 443,
                uuid: UUID,
                transport: 'xhttp',
                path: '/ring/',
                security: 'tls',
                sni: 'up.example.com',
                alpns: 'h2',
                'xhttp-download': true,
                'xhttp-download-address': 'down.example.com',
                'xhttp-download-port': 443,
                'xhttp-download-security': 'tls',
                'xhttp-download-sni': 'down.example.com',
                'xhttp-download-alpns': 'h3',
                'xhttp-download-path': '/ring/',
            });
            expect(directFlatDownload).to.equal(
                `VLESS-Flat-DL = vless, up.example.com, 443, uuid=${UUID}, transport=xhttp, path=/ring/, security=tls, sni=up.example.com, alpns=h2, xhttp-download=true, xhttp-download-address=down.example.com, xhttp-download-port=443, xhttp-download-security=tls, xhttp-download-sni=down.example.com, xhttp-download-alpns=h3, xhttp-download-path=/ring/`,
            );

            // H3 upload + REALITY download
            const h3ToReality = producer.produce({
                type: 'vless',
                name: 'VLESS-H3-Reality',
                server: 'up.example.com',
                port: 443,
                uuid: UUID,
                network: 'xhttp',
                tls: true,
                sni: 'up.example.com',
                alpn: ['h3'],
                'xhttp-opts': {
                    path: '/ring/',
                    'download-settings': {
                        server: 'down.example.com',
                        port: 443,
                        tls: true,
                        servername: 'cover.example.com',
                        'reality-opts': {
                            'public-key': 'dl-pubkey',
                            'short-id': '0a1b',
                        },
                        'client-fingerprint': 'ios',
                    },
                },
            });
            expect(h3ToReality).to.equal(
                `VLESS-H3-Reality = vless, up.example.com, 443, uuid=${UUID}, transport=xhttp, path=/ring/, security=tls, sni=up.example.com, alpns=h3, xhttp-download=true, xhttp-download-address=down.example.com, xhttp-download-port=443, xhttp-download-security=reality, xhttp-download-sni=cover.example.com, xhttp-download-reality-public-key=dl-pubkey, xhttp-download-reality-short-id=0a1b, xhttp-download-fingerprint=ios, xhttp-download-path=/ring/`,
            );

            // Mihomo empty public-key cancels REALITY inheritance on download-settings
            const realityToTls = producer.produce({
                type: 'vless',
                name: 'VLESS-Reality-Cancel',
                server: 'up.example.com',
                port: 443,
                uuid: UUID,
                network: 'xhttp',
                tls: true,
                sni: 'cover.example.com',
                'reality-opts': {
                    'public-key': 'up-pubkey',
                },
                'xhttp-opts': {
                    path: '/xhttp',
                    'download-settings': {
                        server: 'down.example.com',
                        port: 443,
                        tls: true,
                        servername: 'down.example.com',
                        alpn: ['h3'],
                        'reality-opts': {
                            'public-key': '',
                        },
                    },
                },
            });
            expect(realityToTls).to.include(
                'xhttp-download=true, xhttp-download-address=down.example.com, xhttp-download-port=443, xhttp-download-security=tls, xhttp-download-sni=down.example.com, xhttp-download-alpns=h3, xhttp-download-path=/xhttp',
            );
        });

        it('round-trips VLESS URIs (REALITY Vision and XHTTP downloadSettings) into Ring INI', function () {
            const [realityNode] = ProxyUtils.parse(
                `vless://${UUID}@example.com:443?security=reality&sni=www.microsoft.com&pbk=test-pubkey&sid=01ab&flow=xtls-rprx-vision&fp=chrome#URI-VLESS-Reality`,
            );
            const realityIni = producer.produce(realityNode);
            expect(realityIni).to.equal(
                `URI-VLESS-Reality = vless, example.com, 443, uuid=${UUID}, flow=xtls-rprx-vision, security=reality, sni=www.microsoft.com, reality-public-key=test-pubkey, reality-short-id=01ab, fingerprint=chrome`,
            );

            const extra = encodeURIComponent(
                JSON.stringify({
                    downloadSettings: {
                        address: 'down.example.com',
                        port: 443,
                        network: 'xhttp',
                        security: 'tls',
                        tlsSettings: {
                            serverName: 'down.example.com',
                            alpn: ['h3'],
                            fingerprint: 'chrome',
                        },
                        xhttpSettings: {
                            path: '/xhttp',
                            host: 'cdn.down.example.com',
                        },
                    },
                }),
            );
            const [xhttpNode] = ProxyUtils.parse(
                `vless://${UUID}@up.example.com:443?type=xhttp&security=reality&sni=cover.example.com&pbk=up-pubkey&sid=0102&path=%2Fxhttp&host=cdn.up.example.com&mode=packet-up&extra=${extra}#URI-VLESS-XHTTP`,
            );
            const xhttpIni = producer.produce(xhttpNode);
            expect(xhttpIni).to.equal(
                `URI-VLESS-XHTTP = vless, up.example.com, 443, uuid=${UUID}, transport=xhttp, host=cdn.up.example.com, path=/xhttp, xhttp-mode=packet-up, security=reality, sni=cover.example.com, reality-public-key=up-pubkey, reality-short-id=0102, xhttp-download=true, xhttp-download-address=down.example.com, xhttp-download-port=443, xhttp-download-security=tls, xhttp-download-sni=down.example.com, xhttp-download-alpns=h3, xhttp-download-fingerprint=chrome, xhttp-download-host=cdn.down.example.com, xhttp-download-path=/xhttp`,
            );
        });

        it('rejects invalid VLESS combinations aligned with core constraints', function () {
            const base = {
                type: 'vless',
                name: 'Invalid-VLESS',
                server: 'example.com',
                port: 443,
                uuid: UUID,
            };

            // Non-none encryption
            expect(() =>
                producer.produce({ ...base, encryption: 'mlkem768' }),
            ).to.throw(RingUnsupportedProxyError);

            // Unsupported flow
            expect(() =>
                producer.produce({
                    ...base,
                    tls: true,
                    flow: 'xtls-rprx-direct',
                }),
            ).to.throw(RingUnsupportedProxyError);

            // Vision over non-TCP
            expect(() =>
                producer.produce({
                    ...base,
                    tls: true,
                    network: 'ws',
                    flow: 'xtls-rprx-vision',
                }),
            ).to.throw(RingUnsupportedProxyError);

            // Vision without TLS/REALITY
            expect(() =>
                producer.produce({
                    ...base,
                    flow: 'xtls-rprx-vision',
                }),
            ).to.throw(RingUnsupportedProxyError);

            // REALITY over WebSocket
            expect(() =>
                producer.produce({
                    ...base,
                    network: 'ws',
                    sni: 'example.com',
                    'reality-opts': { 'public-key': 'pubkey' },
                }),
            ).to.throw(RingUnsupportedProxyError);

            // REALITY without public-key
            expect(() =>
                producer.produce({
                    ...base,
                    sni: 'example.com',
                    'reality-opts': { 'short-id': '01' },
                }),
            ).to.throw(RingUnsupportedProxyError);

            // REALITY with incapable fingerprint (android)
            expect(() =>
                producer.produce({
                    ...base,
                    sni: 'example.com',
                    'reality-opts': { 'public-key': 'pubkey' },
                    'client-fingerprint': 'android',
                }),
            ).to.throw(RingUnsupportedProxyError);

            // HTTP/3 ALPN on non-XHTTP or mixed ALPN or REALITY
            expect(() =>
                producer.produce({
                    ...base,
                    tls: true,
                    network: 'ws',
                    alpn: ['h3'],
                }),
            ).to.throw(RingUnsupportedProxyError);

            expect(() =>
                producer.produce({
                    ...base,
                    tls: true,
                    network: 'xhttp',
                    alpn: ['h2', 'h3'],
                }),
            ).to.throw(RingUnsupportedProxyError);

            expect(() =>
                producer.produce({
                    ...base,
                    network: 'xhttp',
                    sni: 'example.com',
                    'reality-opts': { 'public-key': 'pubkey' },
                    alpn: ['h3'],
                }),
            ).to.throw(RingUnsupportedProxyError);

            // xhttp-download with stream-one or mismatched path
            expect(() =>
                producer.produce({
                    ...base,
                    tls: true,
                    network: 'xhttp',
                    'xhttp-opts': {
                        path: '/up',
                        mode: 'stream-one',
                        'download-settings': {
                            server: 'down.example.com',
                            port: 443,
                        },
                    },
                }),
            ).to.throw(RingUnsupportedProxyError);

            expect(() =>
                producer.produce({
                    ...base,
                    tls: true,
                    network: 'xhttp',
                    'xhttp-opts': {
                        path: '/up',
                        'download-settings': {
                            server: 'down.example.com',
                            port: 443,
                            path: '/down',
                        },
                    },
                }),
            ).to.throw(RingUnsupportedProxyError);

            // Blocked transport-managed HTTP header
            expect(() =>
                producer.produce({
                    ...base,
                    tls: true,
                    network: 'ws',
                    'ws-opts': {
                        headers: {
                            Connection: 'keep-alive',
                        },
                    },
                }),
            ).to.throw(RingUnsupportedProxyError);
        });
    });

    describe('End-to-End ProxyUtils produce', function () {
        it('filters unsupported proxies and produces external format', function () {
            const proxies = [
                {
                    type: 'ss',
                    name: 'SS-Node',
                    server: '1.2.3.4',
                    port: 8388,
                    cipher: 'aes-128-gcm',
                    password: 'pwd',
                },
                {
                    type: 'vless',
                    name: 'VLESS-Node',
                    server: '2.3.4.5',
                    port: 443,
                    uuid: UUID,
                    tls: true,
                    sni: 'vless.example.com',
                },
                {
                    type: 'ssr',
                    name: 'SSR-Unsupported',
                    server: '3.4.5.6',
                    port: 8388,
                    cipher: 'aes-256-cfb',
                    password: 'pwd',
                },
                { type: 'direct', name: 'Direct-Node' },
            ];
            const output = ProxyUtils.produce(proxies, 'Ring', 'external');
            expect(output).to.include('SS-Node = shadowsocks, 1.2.3.4, 8388, encrypt-method=aes-128-gcm, password=pwd');
            expect(output).to.include(`VLESS-Node = vless, 2.3.4.5, 443, uuid=${UUID}, security=tls, sni=vless.example.com`);
            expect(output).to.include('Direct-Node = direct');
            expect(output).not.to.include('SSR-Unsupported');
        });
    });

    describe('Script operators with Ring target', function () {
        it('passes targetPlatform === "Ring" to Script Operator operator function', async function () {
            const proxies = [
                {
                    type: 'ss',
                    name: 'SS-Node',
                    server: '1.1.1.1',
                    port: 8388,
                    cipher: 'aes-128-gcm',
                    password: 'pwd',
                },
            ];
            const operators = [
                {
                    type: 'Script Operator',
                    args: {
                        mode: 'script',
                        content: `function operator(proxies, targetPlatform, context) {
                            return proxies.map(p => ({
                                ...p,
                                _receivedTarget: targetPlatform,
                            }));
                        }`,
                    },
                },
            ];
            const processed = await ProxyUtils.process(proxies, operators, 'Ring');
            expect(processed).to.be.an('array').with.lengthOf(1);
            expect(processed[0]._receivedTarget).to.equal('Ring');
        });

        it('dynamically modifies node properties when targetPlatform is Ring', async function () {
            const proxies = [
                {
                    type: 'ss',
                    name: 'SS-Node',
                    server: '1.1.1.1',
                    port: 8388,
                    cipher: 'aes-128-gcm',
                    password: 'pwd',
                },
                {
                    type: 'trojan',
                    name: 'Trojan-Node',
                    server: '2.2.2.2',
                    port: 443,
                    password: 'pwd',
                    sni: 'old.example.com',
                },
                {
                    type: 'vmess',
                    name: 'VMess-Node',
                    server: '3.3.3.3',
                    port: 443,
                    uuid: UUID,
                    network: 'ws',
                },
            ];
            const operators = [
                {
                    type: 'Script Operator',
                    args: {
                        mode: 'script',
                        content: `function operator(proxies, targetPlatform, context) {
                            if (targetPlatform === 'Ring') {
                                return proxies
                                    .filter(p => p.type !== 'vmess')
                                    .map(p => {
                                        const clone = { ...p };
                                        if (clone.type === 'ss') {
                                            clone['sing-mux'] = true;
                                        } else if (clone.type === 'trojan') {
                                            clone.sni = 'ring.example.com';
                                        }
                                        return clone;
                                    });
                            }
                            return proxies;
                        }`,
                    },
                },
            ];
            const processed = await ProxyUtils.process(proxies, operators, 'Ring');
            expect(processed).to.have.lengthOf(2);
            expect(processed[0].name).to.equal('SS-Node');
            expect(processed[0]['sing-mux']).to.be.true;
            expect(processed[1].name).to.equal('Trojan-Node');
            expect(processed[1].sni).to.equal('ring.example.com');
        });

        it('produces expected Ring INI configuration lines for script-processed nodes', async function () {
            const proxies = [
                {
                    type: 'ss',
                    name: 'SS-Node',
                    server: '1.2.3.4',
                    port: 8388,
                    cipher: 'aes-128-gcm',
                    password: 'pwd',
                },
                {
                    type: 'trojan',
                    name: 'Trojan-Node',
                    server: '2.3.4.5',
                    port: 443,
                    password: 'pwd',
                    sni: 'old.example.com',
                },
            ];
            const operators = [
                {
                    type: 'Script Operator',
                    args: {
                        mode: 'script',
                        content: `function operator(proxies, targetPlatform, context) {
                            if (targetPlatform === 'Ring') {
                                return proxies.map(p => {
                                    const clone = { ...p };
                                    if (clone.type === 'ss') {
                                        clone['sing-mux'] = true;
                                    } else if (clone.type === 'trojan') {
                                        clone.sni = 'ring.example.com';
                                    }
                                    return clone;
                                });
                            }
                            return proxies;
                        }`,
                    },
                },
            ];
            const processed = await ProxyUtils.process(proxies, operators, 'Ring');
            const ringIni = ProxyUtils.produce(processed, 'Ring');
            expect(ringIni).to.include(
                'SS-Node = shadowsocks, 1.2.3.4, 8388, encrypt-method=aes-128-gcm, password=pwd, sing-mux=true',
            );
            expect(ringIni).to.include(
                'Trojan-Node = trojan, 2.3.4.5, 443, password=pwd, tls=true, sni=ring.example.com',
            );
        });

        it('filters nodes with Script Filter under Ring platform and produces output', async function () {
            const proxies = [
                {
                    type: 'ss',
                    name: 'SS-Keep',
                    server: '1.1.1.1',
                    port: 8388,
                    cipher: 'aes-128-gcm',
                    password: 'pwd',
                },
                {
                    type: 'ss',
                    name: 'SS-Drop',
                    server: '2.2.2.2',
                    port: 8388,
                    cipher: 'aes-128-gcm',
                    password: 'pwd',
                },
            ];
            const filters = [
                {
                    type: 'Script Filter',
                    args: {
                        mode: 'script',
                        content: `function filter(proxies, targetPlatform, context) {
                            if (targetPlatform !== 'Ring') return proxies.map(() => false);
                            return proxies.map(p => p.name === 'SS-Keep');
                        }`,
                    },
                },
            ];
            const filtered = await ProxyUtils.process(proxies, filters, 'Ring');
            expect(filtered).to.have.lengthOf(1);
            expect(filtered[0].name).to.equal('SS-Keep');

            const ringIni = ProxyUtils.produce(filtered, 'Ring');
            expect(ringIni).to.equal(
                'SS-Keep = shadowsocks, 1.1.1.1, 8388, encrypt-method=aes-128-gcm, password=pwd',
            );
            expect(ringIni).not.to.include('SS-Drop');
        });
    });
});
