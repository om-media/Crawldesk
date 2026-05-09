"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.DEFAULT_CRAWL_SETTINGS = void 0;
exports.DEFAULT_CRAWL_SETTINGS = {
    maxUrls: 10000,
    maxDepth: 10,
    concurrency: 5,
    requestTimeoutMs: 15000,
    respectRobotsTxt: true,
    crawlSubdomains: false,
    checkExternalLinks: true,
    crawlExternalLinks: false,
    userAgent: 'CrawlDeskBot/0.1 (+https://example.com/bot)'
};
//# sourceMappingURL=crawl.js.map