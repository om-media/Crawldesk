"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.Fetcher = void 0;
const http_1 = __importDefault(require("http"));
const https_1 = __importDefault(require("https"));
const normalizer_1 = require("./normalizer");
const private_ip_guard_1 = require("./private-ip-guard");
const DEFAULT_CONFIG = {
    timeoutMs: 15000,
    userAgent: 'CrawlDeskBot/0.1 (+https://example.com/bot)',
    maxRedirects: 5,
    maxBodySize: { html: 5 * 1024 * 1024, other: 1 * 1024 * 1024 },
};
function makeError(url, headersObj, contentType, bodyLen, elapsed, chain, code, message) {
    return { body: Buffer.alloc(0), statusCode: 0, headers: headersObj, finalUrl: url, contentType, contentLength: bodyLen, responseTimeMs: elapsed, redirectChain: [...chain], error: { code, message } };
}
class Fetcher {
    config;
    guard = new private_ip_guard_1.PrivateIpGuard();
    constructor(config) {
        this.config = config;
    }
    async fetch(url) {
        const startTime = Date.now();
        try {
            return await this.fetchWithRedirects(url, [], 0, startTime);
        }
        catch (err) {
            return makeError(url, {}, '', 0, Date.now() - startTime, [], 'connection_error', err.message || 'Connection failed');
        }
    }
    async fetchWithRedirects(url, chain, depth, startTime) {
        const cfg = { ...DEFAULT_CONFIG, ...this.config };
        const normalized = (0, normalizer_1.normalizeUrl)(url);
        if (normalized.error && normalized.error.code === 'unsupported_protocol') {
            return makeError(url, {}, '', 0, Date.now() - startTime, chain, 'unsupported_protocol', 'Protocol not supported');
        }
        if (this.guard.isBlocked(normalized.hostname)) {
            return makeError(url, {}, '', 0, Date.now() - startTime, chain, 'blocked_private_ip', 'Private IP blocked');
        }
        return new Promise((resolve) => {
            try {
                const req = (url.startsWith('https://') ? https_1.default : http_1.default).get(url, {
                    headers: { 'User-Agent': cfg.userAgent },
                    timeout: cfg.timeoutMs,
                    rejectUnauthorized: false,
                }, (res) => {
                    const statusCode = res.statusCode ?? 0;
                    const headers = {};
                    for (const [k, v] of Object.entries(res.headers || {})) {
                        headers[k.toLowerCase()] = Array.isArray(v) ? v[0] : (v ?? '');
                    }
                    if ([301, 302, 303, 307, 308].includes(statusCode) && depth < cfg.maxRedirects && res.headers.location) {
                        let nextUrl = res.headers.location;
                        try {
                            nextUrl = new URL(nextUrl, url).href;
                        }
                        catch { }
                        const normNext = (0, normalizer_1.normalizeUrl)(nextUrl);
                        if (this.guard.isBlocked(normNext.hostname)) {
                            resolve(makeError(url, headers, '', 0, Date.now() - startTime, [...chain], 'blocked_private_ip', 'Redirect target is a private IP'));
                            return;
                        }
                        this.fetchWithRedirects(nextUrl, [...chain, { url, statusCode }], depth + 1, startTime).then(resolve);
                        res.resume();
                        return;
                    }
                    const contentType = headers['content-type'] || '';
                    const maxBody = cfg.maxBodySize.html;
                    const chunks = [];
                    let totalLen = 0;
                    res.on('data', (chunk) => {
                        totalLen += chunk.length;
                        if (totalLen > maxBody) {
                            resolve({ body: Buffer.concat(chunks), statusCode, headers, finalUrl: res.url ?? url, contentType, contentLength: totalLen, responseTimeMs: Date.now() - startTime, redirectChain: chain, error: { code: 'body_too_large', message: `Response exceeded ${maxBody} bytes` } });
                            res.destroy();
                            return;
                        }
                        chunks.push(chunk);
                    });
                    res.on('end', () => {
                        const body = Buffer.concat(chunks);
                        resolve({ body, statusCode, headers, finalUrl: res.url ?? url, contentType, contentLength: totalLen, responseTimeMs: Date.now() - startTime, redirectChain: [...chain] });
                    });
                });
                req.on('error', (err) => {
                    let errorCode = 'connection_error';
                    if (err.code === 'ENOTFOUND')
                        errorCode = 'dns_error';
                    else if (err.code === 'ECONNREFUSED')
                        errorCode = 'connection_refused';
                    else if (err.code?.startsWith('ERR_TLS'))
                        errorCode = 'tls_error';
                    else if (err.code === 'ETIMEDOUT' || err.message?.includes('timeout'))
                        errorCode = 'timeout';
                    resolve(makeError(url, {}, '', 0, Date.now() - startTime, chain, errorCode, err.message));
                });
                req.on('timeout', () => { req.destroy(); });
                req.end();
            }
            catch (err) {
                resolve(makeError(url, {}, '', 0, Date.now() - startTime, chain, 'fetch_error', err.message));
            }
        });
    }
}
exports.Fetcher = Fetcher;
//# sourceMappingURL=fetcher.js.map