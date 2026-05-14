"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.JsRenderer = void 0;
const puppeteer_core_1 = __importDefault(require("puppeteer-core"));
/**
 * Phase 5 — Browser pool that manages a headless Chrome instance for JS rendering.
 * Reuses tabs across renders for efficiency.
 */
class JsRenderer {
    browser = null;
    pool = [];
    config;
    started = false;
    constructor(config = {}) {
        this.config = {
            concurrency: config.concurrency ?? 4,
            navigationTimeoutMs: config.navigationTimeoutMs ?? 30000,
            executablePath: config.executablePath ?? '',
            viewportWidth: config.viewportWidth ?? 1920,
            viewportHeight: config.viewportHeight ?? 1080,
            waitUntil: config.waitUntil ?? 'networkidle2',
            blockImages: config.blockImages ?? false,
            blockMediaRequests: config.blockMediaRequests ?? false,
        };
    }
    /** Start the browser pool (called once before crawl begins) */
    async start() {
        if (this.started)
            return;
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const launchOptions = {
            headless: true,
            args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-gpu'],
        };
        if (this.config.executablePath) {
            launchOptions.executablePath = this.config.executablePath;
        }
        this.browser = await puppeteer_core_1.default.launch(launchOptions);
        // Set up request interception if blocking is enabled
        const interceptImages = this.config.blockImages || this.config.blockMediaRequests;
        // Pre-warm the pool with pages
        for (let i = 0; i < this.config.concurrency; i++) {
            const page = await this.browser.newPage();
            await page.setViewport({ width: this.config.viewportWidth, height: this.config.viewportHeight });
            // Feature 5.4 — Block images/media requests if configured
            if (interceptImages) {
                try {
                    await page.setRequestInterception(true);
                    // eslint-disable-next-line @typescript-eslint/no-explicit-any
                    page.on('request', (req) => {
                        const rType = req.resourceType ? req.resourceType() : '';
                        if (this.config.blockImages && rType === 'image')
                            return req.abort();
                        if (this.config.blockMediaRequests && ['media'].includes(rType))
                            return req.abort();
                        return req.continue();
                    });
                }
                catch { }
            }
            this.pool.push(page);
        }
        this.started = true;
    }
    /** Stop browser and close all pages */
    async stop() {
        if (!this.started || !this.browser)
            return;
        await this.browser.close();
        this.browser = null;
        this.pool = [];
        this.started = false;
    }
    /** Render a URL in headless chrome and extract JS-generated content */
    async render(url) {
        if (!this.started || !this.browser)
            return null;
        let page;
        try {
            // Get an available page from the pool (async lock via array shift/push)
            page = this.pool.shift();
            if (!page)
                return null;
            // Navigate to the URL
            await page.goto(url, {
                waitUntil: this.config.waitUntil,
                timeout: this.config.navigationTimeoutMs,
            });
            const finalUrl = page.url();
            const jsRedirectUrl = finalUrl !== url ? finalUrl : null;
            // Extract rendered data
            const [renderedTitle, bodyText, noindexCheck, linksArr, bgImages] = await Promise.all([
                page.title(),
                this.extractBodyText(page),
                this.checkNoIndex(page),
                this.extractLinks(page),
                this.extractBackgroundImages(page),
            ]);
            // Compute hidden text ratio by comparing visible vs total text
            const wordCount = bodyText.trim().split(/\s+/).filter(Boolean).length;
            const hiddenRatio = await this.computeHiddenTextRatio(page);
            return {
                renderedTitle: renderedTitle || null,
                renderedWordCount: wordCount,
                jsRedirectUrl,
                noindexInRendered: noindexCheck,
                hiddenTextRatio: hiddenRatio ?? null,
                renderedLinks: linksArr,
                backgroundImages: bgImages,
            };
        }
        catch {
            // Return partial data on failure
            return null;
        }
        finally {
            if (page && !this.started) {
                try {
                    await page.close();
                }
                catch { /* ignore */ }
            }
            else if (page) {
                // Reset and return to pool
                try {
                    await page.goto('about:blank');
                }
                catch { /* ignore */ }
                this.pool.push(page);
            }
        }
    }
    async extractBodyText(page) {
        // page.evaluate runs in browser context where document exists
        // Use a string-based evaluate to avoid TS checking browser DOM types
        const js = `(() => { return document?.body?.innerText || '' })()`;
        return page.evaluate(js);
    }
    async checkNoIndex(page) {
        const js = `(() => {
      const mr = document.querySelector('meta[name="robots"]');
      if (mr && /noindex/i.test(mr.content)) return true;
      const mg = document.querySelector('meta[name="googlebot"]');
      if (mg && /noindex/i.test(mg.content)) return true;
      return false;
    })()`;
        return page.evaluate(js);
    }
    async extractLinks(page) {
        const js = `(() => {
      const results = [];
      for (const a of document.querySelectorAll('a[href]')) {
        try { results.push({ targetUrl: new URL(a.href, location.href).href, linkType: 'html_a' }) } catch {}
      }
      return results;
    })()`;
        return page.evaluate(js);
    }
    async extractBackgroundImages(page) {
        const js = `(() => {
      const images = [];
      const allElts = document.querySelectorAll('*');
      for (let i = 0; i < allElts.length && images.length < 100; i++) {
        const bg = window.getComputedStyle(allElts[i]).backgroundImage;
        if (bg && bg !== 'none') {
          const m = bg.match(/url\\(['"]?([^'")]+)['"]?\\)/);
          if (m) {
            let src = m[1].split('?')[0].replace(/\\s+/g, '');
            if (!src.startsWith('data:') && !src.startsWith('gradient')) images.push(src);
          }
        }
      }
      return [...new Set(images)];
    })()`;
        return page.evaluate(js);
    }
    async computeHiddenTextRatio(page) {
        try {
            const js = `(() => {
        const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
        let total = 0; let vis = 0; let n;
        while ((n = walker.nextNode())) {
          total++;
          const r = n.getBoundingClientRect();
          if (r.width > 0 && r.height > 0) vis++;
        }
        if (total === 0) return null;
        return Math.round(((total - vis) / total) * 10000) / 10000;
      })()`;
            return page.evaluate(js);
        }
        catch {
            return null;
        }
    }
}
exports.JsRenderer = JsRenderer;
//# sourceMappingURL=js-renderer.js.map