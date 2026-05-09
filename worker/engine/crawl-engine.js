"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.CrawlEngine = void 0;
const normalizer_1 = require("./normalizer");
const private_ip_guard_1 = require("./private-ip-guard");
const scope_1 = require("./scope");
const url_frontier_1 = require("./url-frontier");
const fetcher_1 = require("./fetcher");
const robots_1 = require("./robots");
const seo_extractor_1 = require("./seo-extractor");
const issue_detector_1 = require("./issue-detector");
class CrawlEngine {
    config;
    rootHostname;
    startUrl;
    callbacks;
    frontier;
    scope;
    guard = new private_ip_guard_1.PrivateIpGuard();
    fetcher;
    robots = new robots_1.RobotsService();
    stopped = false;
    paused = false;
    resumePromise = null;
    resumeResolver = null;
    totalCompleted = 0;
    totalFailed = 0;
    totalBlocked = 0;
    startTime = 0;
    batchTimer = null;
    constructor(config, rootHostname, startUrl, callbacks) {
        this.config = config;
        this.rootHostname = rootHostname;
        this.startUrl = startUrl;
        this.callbacks = callbacks;
        this.frontier = new url_frontier_1.UrlFrontier(config.maxUrls);
        this.fetcher = new fetcher_1.Fetcher({
            timeoutMs: config.requestTimeoutMs,
            userAgent: config.userAgent,
        });
        const includeRe = config.includePatterns.map(p => (0, scope_1.wildcardToRegex)(p));
        const excludeRe = config.excludePatterns.map(p => (0, scope_1.wildcardToRegex)(p));
        this.scope = new scope_1.ScopeService({
            startHostname: rootHostname,
            crawlSubdomains: config.crawlSubdomains,
            includePatterns: includeRe,
            excludePatterns: excludeRe,
            maxDepth: config.maxDepth,
            maxUrls: config.maxUrls,
            crawlExternalLinks: config.crawlExternalLinks,
        });
    }
    async start() {
        this.startTime = Date.now();
        // Start periodic progress emission
        this.batchTimer = setInterval(() => this.emitProgress(), 2000);
        try {
            await this.run();
        }
        catch (err) {
            this.callbacks.onFailed({ code: 'ENGINE_ERROR', message: err.message || 'Crawl engine error' });
        }
        finally {
            if (this.batchTimer)
                clearInterval(this.batchTimer);
        }
    }
    pause() {
        this.paused = true;
    }
    resume() {
        this.paused = false;
        this.resumeResolver?.();
        this.resumeResolver = null;
        this.resumePromise = null;
    }
    stop() {
        this.stopped = true;
        this.resumeResolver?.();
    }
    async run() {
        // Fetch robots.txt first
        const normStart = (0, normalizer_1.normalizeUrl)(this.startUrl);
        if (!normStart.error && this.config.respectRobotsTxt) {
            await this.fetchRobots(normStart.protocol + '//' + this.rootHostname + '/robots.txt');
        }
        // Add start URL to frontier
        this.frontier.add(this.startUrl, 0);
        // Main crawl loop
        while (!this.stopped) {
            if (this.totalCompleted >= this.config.maxUrls)
                break;
            // Pause handling
            while (this.paused && !this.stopped) {
                if (!this.resumePromise) {
                    this.resumePromise = new Promise(resolve => { this.resumeResolver = resolve; });
                }
                await this.resumePromise;
            }
            const batch = this.frontier.take(this.config.concurrency);
            if (batch.length === 0)
                break;
            const tasks = batch.map(item => this.processUrl(item));
            const results = await Promise.all(tasks);
            for (const r of results) {
                if (r)
                    this.callbacks.onPageResultBatch([r]);
            }
            this.emitProgress();
        }
        // Final progress emit
        if (this.batchTimer)
            clearInterval(this.batchTimer);
        this.emitProgress();
        this.callbacks.onCompleted();
    }
    async fetchRobots(url) {
        try {
            const result = await this.fetcher.fetch(url);
            if (result.statusCode === 200 && result.body) {
                this.robots.load(result.body.toString());
            }
        }
        catch {
            // Missing robots.txt means everything is allowed
        }
    }
    async processUrl(item) {
        const norm = (0, normalizer_1.normalizeUrl)(item.url);
        if (norm.error) {
            return this.makeSkippedResult(item, 'invalid_url', norm.error.message || 'Invalid URL');
        }
        // Private IP guard
        if (this.guard.isBlocked(norm.hostname)) {
            return this.makeBlockedResult(item, 'blocked_private_ip', 'Private or reserved IP address blocked');
        }
        // Scope check
        if (!this.scope.shouldCrawl(norm, item.depth)) {
            return this.makeSkippedResult(item, 'out_of_scope', 'URL is outside crawl scope');
        }
        // Robots check
        let robotsPath = norm.pathname + norm.search;
        let robotsAllowed = true;
        if (this.config.respectRobotsTxt) {
            robotsAllowed = this.robots.isAllowed(robotsPath);
            if (!robotsAllowed) {
                return this.makeBlockedResult(item, 'robots_txt_blocked', 'Disallowed by robots.txt');
            }
        }
        // Fetch the URL
        const fetchResult = await this.fetcher.fetch(norm.normalizedUrl);
        const urlId = crypto.randomUUID();
        const pageResult = {
            urlId,
            crawlId: '', // set externally
            url: item.url,
            normalizedUrl: norm.normalizedUrl,
            finalUrl: fetchResult.finalUrl || undefined,
            statusCode: fetchResult.statusCode,
            contentType: fetchResult.contentType || undefined,
            contentLength: fetchResult.contentLength ?? undefined,
            isInternal: this.scope.isInternal(norm),
            depth: item.depth,
            responseTimeMs: fetchResult.responseTimeMs,
            discoveredFromUrl: item.discoveredFrom,
            redirectChain: fetchResult.redirectChain.length > 0 ? fetchResult.redirectChain : undefined,
            fetchErrorCode: fetchResult.error?.code || undefined,
            fetchErrorMessage: fetchResult.error?.message || undefined,
        };
        // Mark as visited
        this.frontier.markVisited(norm.normalizedUrl);
        if (fetchResult.statusCode && (fetchResult.statusCode < 200 || fetchResult.statusCode >= 400)) {
            this.totalFailed++;
        }
        else {
            this.totalCompleted++;
        }
        // Parse HTML pages for SEO data
        if (!fetchResult.error && fetchResult.body && fetchResult.contentType?.includes('text/html')) {
            const extracted = (0, seo_extractor_1.extractSeo)(fetchResult.body.toString(), fetchResult.finalUrl || item.url);
            pageResult.seo = {
                title: extracted.title,
                titleLength: extracted.titleLength,
                metaDescription: extracted.metaDescription,
                metaDescriptionLength: extracted.metaDescriptionLength,
                h1: extracted.h1,
                h1Count: extracted.h1Count,
                canonical: extracted.canonical,
                robotsMeta: extracted.robotsMeta,
                xRobotsTag: fetchResult.headers['x-robots-tag'] ?? null,
                wordCount: extracted.wordCount,
                contentHash: extracted.contentHash,
            };
            pageResult.links = extracted.links;
            pageResult.wordCount = extracted.wordCount;
            pageResult.contentHash = extracted.contentHash ?? undefined;
            // Detect issues
            pageResult.issues = (0, issue_detector_1.detectIssues)(pageResult);
            // Add discovered internal links to frontier
            for (const link of extracted.links) {
                if (link.linkType !== 'html_a')
                    continue;
                const linkNorm = (0, normalizer_1.normalizeUrl)(link.targetUrl, fetchResult.finalUrl || item.url);
                if (linkNorm.error)
                    continue;
                if (!this.scope.isInternal(linkNorm))
                    continue;
                if (this.guard.isBlocked(linkNorm.hostname))
                    continue;
                const nextDepth = item.depth + 1;
                if (nextDepth > this.config.maxDepth)
                    continue;
                this.frontier.add(linkNorm.normalizedUrl, nextDepth, fetchResult.finalUrl || item.url);
            }
        }
        else if (fetchResult.statusCode && fetchResult.statusCode >= 300 && fetchResult.statusCode < 400) {
            // Redirect — record but don't parse
            this.totalCompleted++;
        }
        else {
            this.totalFailed++;
        }
        return pageResult;
    }
    makeSkippedResult(item, reason, message) {
        this.totalCompleted++;
        return {
            urlId: crypto.randomUUID(), crawlId: '', url: item.url, normalizedUrl: item.url.toLowerCase(),
            isInternal: false, depth: item.depth, skippedReason: reason, discoveredFromUrl: item.discoveredFrom,
        };
    }
    makeBlockedResult(item, reason, message) {
        this.totalBlocked++;
        return {
            urlId: crypto.randomUUID(), crawlId: '', url: item.url, normalizedUrl: item.url.toLowerCase(),
            isInternal: false, depth: item.depth, blockedReason: reason, discoveredFromUrl: item.discoveredFrom,
        };
    }
    emitProgress() {
        const elapsed = Math.floor((Date.now() - this.startTime) / 1000);
        const rate = elapsed > 0 ? Math.round((this.totalCompleted * 60) / elapsed) : 0;
        this.callbacks.onProgress({
            total_completed: this.totalCompleted,
            total_failed: this.totalFailed,
            total_blocked: this.totalBlocked,
            total_queued: this.frontier.size(),
            urls_per_minute: rate,
            elapsed_seconds: elapsed,
        });
    }
}
exports.CrawlEngine = CrawlEngine;
//# sourceMappingURL=crawl-engine.js.map