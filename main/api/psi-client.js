"use strict";
// Feature 6.1 — PageSpeed Insights API Client with rate limiting
// Fetches Core Web Vitals scores from Google's free PSI API (no key required for ~5 req/sec).
Object.defineProperty(exports, "__esModule", { value: true });
exports.fetchPsiForCrawl = fetchPsiForCrawl;
const PSI_BASE = 'https://www.googleapis.com/pagespeedonline/v5/runPagespeed';
const RATE_LIMIT_MS = 200; // 5 req/sec = 200ms between requests
/**
 * Fetch PSI data for all URLs in a crawl after it completes.
 * Runs sequentially with built-in rate limiting to stay within free tier limits.
 */
async function fetchPsiForCrawl(db, crawlId, config) {
    const limitClause = config.maxUrls && config.maxUrls > 0 ? `LIMIT ${config.maxUrls}` : '';
    const urls = db.prepare(`SELECT id, url FROM urls WHERE crawl_id = ? AND status_code BETWEEN 200 AND 299 ORDER BY RANDOM() ${limitClause}`).all(crawlId);
    let completed = 0;
    let failed = 0;
    for (const row of urls) {
        try {
            await delay(RATE_LIMIT_MS);
            const result = await fetchPsidata(row.url, config.strategy, config.apiKey);
            if (result) {
                storeResult(db, crawlId, row.id, row.url, config.strategy, result);
                completed++;
            }
            else {
                failed++;
            }
        }
        catch (e) {
            console.error(`[PSI] Failed for ${row.url}:`, e instanceof Error ? e.message : String(e));
            failed++;
        }
    }
    return { completed, failed };
}
async function fetchPsidata(url, strategy, apiKey) {
    const searchParts = [
        `url=${encodeURIComponent(url)}`,
        `category=PERFORMANCE`,
        `category=ACCESSIBILITY`,
        `category=BEST_PRACTICES`,
        `category=SEO`,
        `strategy=${strategy}`,
        'nosave=1'
    ];
    if (apiKey)
        searchParts.push(`key=${apiKey}`);
    const resp = await fetch(`${PSI_BASE}?${searchParts.join('&')}`);
    if (!resp.ok)
        return null;
    return resp.json();
}
function storeResult(db, crawlId, urlId, url, strategy, data) {
    try {
        const audits = data?.lighthouseResult?.audits || {};
        const categories = data?.lighthouseResult?.categories || {};
        const perfScore = Math.round((categories.performance?.score ?? 0) * 100);
        const accessScore = Math.round((categories.accessibility?.score ?? 0) * 100);
        const bpScore = Math.round((categories['best-practices']?.score ?? 0) * 100);
        const seoScore = Math.round((categories.seo?.score ?? 0) * 100);
        const lcpMs = Math.round((audits['largest-contentful-paint']?.numericValue ?? 0));
        const fidMs = Math.round((audits['first-input-delay']?.numericValue ?? audits['max-potential-fid']?.numericValue ?? 0));
        const cls = Number(((audits['cumulative-layout-shift']?.numericValue ?? 0)).toFixed(4));
        const fcpMs = Math.round((audits['first-contentful-paint']?.numericValue ?? 0));
        const ttfbMs = Math.round((audits['server-response-time']?.numericValue ?? 0));
        const si = Math.round((audits['speed-index']?.numericValue ?? 0));
        db.prepare(`
      INSERT INTO psi_results (id, crawl_id, url_id, url, strategy, performance_score, accessibility_score, best_practices_score, seo_score, lcp_ms, fid_ms, cls, fcp_ms, ttfb_ms, speed_index, fetched_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
    `).run(crypto.randomUUID(), crawlId, urlId || null, url, strategy, perfScore, accessScore, bpScore, seoScore, lcpMs, fidMs, cls, fcpMs, ttfbMs, si);
    }
    catch (e) {
        console.error('[PSI] Failed to store result:', e instanceof Error ? e.message : String(e));
    }
}
function delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}
//# sourceMappingURL=psi-client.js.map