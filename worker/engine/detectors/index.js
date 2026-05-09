"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.detectIssues = detectIssues;
const content_detector_1 = require("./content-detector");
const canonical_detector_1 = require("./canonical-detector");
const image_detector_1 = require("./image-detector");
const social_detector_1 = require("./social-detector");
const security_detector_1 = require("./security-detector");
const hreflang_detector_1 = require("./hreflang-detector");
const structured_data_detector_1 = require("./structured-data-detector");
/**
 * Aggregator that runs all inline detectors on a single page result.
 */
function detectIssues(result) {
    const issues = [];
    // Server error check (always first, before SEO checks)
    if (result.statusCode && result.statusCode >= 500) {
        issues.push({
            crawlId: result.crawlId, url: result.url, urlId: result.urlId,
            issue_type: 'server_error_5xx', severity: 'critical',
            message: `Server returned status code ${result.statusCode}.`,
            recommendation: 'Investigate server logs and fix the underlying application error.',
        });
    }
    // Only run content-level checks on successful HTML pages with SEO data
    const isHtml200 = !!(result.seo
        && (!result.fetchErrorCode)
        && (!result.skippedReason)
        && (result.contentType?.includes('text/html') || !result.contentType)
        && (result.statusCode === 200));
    if (isHtml200) {
        issues.push(...(0, content_detector_1.detectContentIssues)(result));
        issues.push(...(0, canonical_detector_1.detectCanonicalIssues)(result));
        issues.push(...(0, image_detector_1.detectImageIssues)(result));
        issues.push(...(0, social_detector_1.detectSocialIssues)(result));
        issues.push(...(0, security_detector_1.detectSecurityIssues)(result));
        issues.push(...(0, hreflang_detector_1.detectHreflangIssues)(result));
        issues.push(...(0, structured_data_detector_1.detectStructuredDataIssues)(result));
        // Redirect chain
        if (result.redirectChain && result.redirectChain.length > 1) {
            issues.push({
                crawlId: result.crawlId, url: result.url, urlId: result.urlId,
                issue_type: 'redirect_chain', severity: 'medium',
                message: `URL has a redirect chain of ${result.redirectChain.length} hops.`,
                recommendation: 'Update links to point directly to the final destination URL.',
            });
        }
        // Slow response (>2000ms)
        if (result.responseTimeMs && result.responseTimeMs > 2000) {
            issues.push({
                crawlId: result.crawlId, url: result.url, urlId: result.urlId,
                issue_type: 'slow_response', severity: 'low',
                message: `Response time was ${result.responseTimeMs}ms (over 2 seconds).`,
                recommendation: 'Optimize server performance through caching, CDN usage, or backend improvements.',
            });
        }
    }
    return issues;
}
//# sourceMappingURL=index.js.map