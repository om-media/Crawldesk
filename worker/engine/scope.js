"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ScopeService = void 0;
exports.wildcardToRegex = wildcardToRegex;
class ScopeService {
    config;
    rootDomain;
    constructor(config) {
        this.config = config;
        this.rootDomain = extractRootDomain(config.startHostname);
    }
    isInternal(normalized) {
        if (!normalized.hostname)
            return false;
        const host = normalized.hostname.toLowerCase();
        // Exact match
        if (host === this.config.startHostname.toLowerCase())
            return true;
        // Subdomain mode
        if (this.config.crawlSubdomains && host.endsWith('.' + this.rootDomain))
            return true;
        return false;
    }
    shouldCrawl(normalized, depth) {
        if (!['http:', 'https:'].includes(normalized.protocol))
            return false;
        if (depth > this.config.maxDepth)
            return false;
        if (!this.isInternal(normalized) && !this.config.crawlExternalLinks)
            return false;
        // Check patterns against full normalized URL
        const url = normalized.normalizedUrl;
        for (const p of this.config.excludePatterns) {
            if (p.test(url))
                return false;
        }
        if (this.config.includePatterns.length > 0) {
            let matched = false;
            for (const p of this.config.includePatterns) {
                if (p.test(url)) {
                    matched = true;
                    break;
                }
            }
            if (!matched)
                return false;
        }
        return true;
    }
    isAllowed(normalized) {
        return this.shouldCrawl(normalized, 0) || this.isInternal(normalized);
    }
}
exports.ScopeService = ScopeService;
function extractRootDomain(hostname) {
    const parts = hostname.split('.');
    if (parts.length <= 2)
        return hostname;
    // Simple heuristic: last two parts
    return parts.slice(-2).join('.');
}
function wildcardToRegex(pattern) {
    // Escape regex special chars then convert * to .*
    const escaped = pattern.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const converted = escaped.replace(/\\\*/g, '.*');
    return new RegExp(converted, 'i');
}
//# sourceMappingURL=scope.js.map