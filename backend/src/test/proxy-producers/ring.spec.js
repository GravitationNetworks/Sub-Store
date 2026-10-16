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
            expect(r1).to.equal('SS1 = shadowsocks, 1.1.1.1, 8388, aes-128-gcm, pass');
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

        it('produces Shadowsocks with obfs and shadow-tls plugins', function () {
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
                'SS-Obfs = shadowsocks, ss.example.com, 80, aes-128-gcm, pwd, obfs=http, obfs-host=bing.com, obfs-uri=/s',
            );

            const stls = producer.produce({
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
            });
            expect(stls).to.equal(
                'SS-STLS = shadowsocks, ss.example.com, 443, aes-128-gcm, pwd, shadow-tls-password=pass, shadow-tls-sni=apple.com, shadow-tls-version=3',
            );
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
            expect(res).to.include('ws-host=ws.com');
            expect(res).to.include('tls=true');
            expect(res).to.include('sni=sni.com');
            expect(res).to.include('skip-cert-verify=true');
            expect(res).to.include('alpns="h2,http/1.1"');
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
            expect(trojan).to.include('trojan, t.com, 443, pass, tls=true');

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
                'Hy2 = hysteria, hy.com, 443, auth=pass, down=500, up=100, sni=hy.com',
            );

            const tuic = producer.produce({
                type: 'tuic',
                name: 'Tuic',
                server: 'tuic.com',
                port: 8443,
                uuid: UUID,
                password: 'pass',
                'udp-relay-mode': 'native',
            });
            expect(tuic).to.include('tuic, tuic.com, 8443');
            expect(tuic).to.include('udp-relay-mode=native');

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
            expect(wg).to.include('wireguard');
            expect(wg).to.include('endpoint=wg.com:51820');
            expect(wg).to.include('allowed-ips="0.0.0.0/0, ::/0"');
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
            expect(res).to.include('password="p@ss with space,comma=eq#hash\\"quote\\""');
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
                },
                { type: 'direct', name: 'Direct-Node' },
            ];
            const output = ProxyUtils.produce(proxies, 'Ring', 'external');
            expect(output).to.include('SS-Node = shadowsocks, 1.2.3.4, 8388, aes-128-gcm, pwd');
            expect(output).to.include('Direct-Node = direct');
            expect(output).not.to.include('VLESS-Node');
        });
    });
});
