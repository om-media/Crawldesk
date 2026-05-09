"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.normalizeUrl = normalizeUrl;
const TRACKING_PARAMS = new Set([
    'utm_source', 'utm_medium', 'utm_campaign', 'utm_term', 'utm_content', 'utm_id',
    'gclid', 'fbclid', 'msclkid', 'mc_cid', 'mc_eid', '_ga', '_gl'
]);
function normalizeUrl(input, baseUrl) {
    try {
        const parsed = baseUrl ? new URL(input, baseUrl) : new URL(input);
        if (!['http:', 'https:'].includes(parsed.protocol)) {
            return {
                originalUrl: input,
                absoluteUrl: parsed.href,
                normalizedUrl: '',
                protocol: parsed.protocol,
                hostname: parsed.hostname,
                pathname: parsed.pathname,
                search: parsed.search,
                error: { code: 'unsupported_protocol', message: `Protocol ${parsed.protocol} not supported` }
            };
        }
        // Remove default ports
        let host = parsed.hostname.toLowerCase();
        if (parsed.protocol === 'http:' && parsed.port === '80')
            parsed.port = '';
        else if (parsed.protocol === 'https:' && parsed.port === '443')
            parsed.port = '';
        // Sort and clean query params
        const cleanedSearch = cleanQueryParams(parsed.search);
        const normalizedHref = `${parsed.protocol}//${host}${parsed.port ? ':' + parsed.port : ''}${parsed.pathname}${cleanedSearch}`;
        return {
            originalUrl: input,
            absoluteUrl: parsed.href,
            normalizedUrl: normalizedHref,
            protocol: parsed.protocol,
            hostname: host,
            pathname: parsed.pathname,
            search: cleanedSearch,
        };
    }
    catch (err) {
        return {
            originalUrl: input,
            absoluteUrl: '',
            normalizedUrl: '',
            protocol: 'https:',
            hostname: '',
            pathname: '',
            search: '',
            error: { code: 'invalid_url', message: err.message }
        };
    }
}
function cleanQueryParams(search) {
    if (!search)
        return '';
    const params = new URLSearchParams(search);
    const filtered = Array.from(params.entries())
        .filter(([key]) => !TRACKING_PARAMS.has(key.toLowerCase()))
        .sort(([a], [b]) => a.localeCompare(b));
    if (filtered.length === 0)
        return '';
    return '?' + filtered.map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`).join('&');
}
//# sourceMappingURL=normalizer.js.map