"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.detectJsRenderingIssues = detectJsRenderingIssues;
/**
 * Detects JavaScript rendering discrepancies between raw and rendered HTML.
 * Feature: Phase 5 — js_rendered_title_differs, js_noindex_present, js_redirect_detected, hidden_text_in_rendered
 */
function detectJsRenderingIssues(result, rendered) {
    const issues = [];
    if (!rendered || !result.seo)
        return issues;
    // --- js_rendered_title_differs ---
    const rawTitle = (result.seo.title || '').trim().toLowerCase();
    const renderedTitle = (rendered.renderedTitle || '').trim().toLowerCase();
    if (rawTitle && renderedTitle && rawTitle !== renderedTitle) {
        issues.push({
            crawlId: result.crawlId, url: result.url, urlId: result.urlId,
            issue_type: 'js_rendered_title_differs', severity: 'medium',
            message: `Raw title "${result.seo.title}" differs from rendered title "${rendered.renderedTitle}".`,
            recommendation: 'Ensure critical content like titles is present in the initial HTML response for SEO.',
        });
    }
    // --- js_noindex_present ---
    const rawNoIndex = result.seo.robotsMeta?.includes('noindex') ?? false;
    if (rendered.noindexInRendered && !rawNoIndex) {
        issues.push({
            crawlId: result.crawlId, url: result.url, urlId: result.urlId,
            issue_type: 'js_noindex_present', severity: 'high',
            message: 'JavaScript adds a noindex directive not present in raw HTML.',
            recommendation: 'Remove dynamic noindex injection if this page should be indexed by search engines.',
        });
    }
    // --- js_redirect_detected ---
    if (rendered.jsRedirectUrl && (!result.finalUrl || result.finalUrl !== rendered.jsRedirectUrl)) {
        issues.push({
            crawlId: result.crawlId, url: result.url, urlId: result.urlId,
            issue_type: 'js_redirect_detected', severity: 'low',
            message: `Page redirects to "${rendered.jsRedirectUrl}" via JavaScript.`,
            recommendation: 'Use server-side redirects (301/302) instead of client-side JavaScript redirects.',
        });
    }
    // --- hidden_text_in_rendered ---
    // If >40% of text nodes are invisible without JS rendering, flag it
    const ratio = rendered.hiddenTextRatio ?? null;
    if (ratio !== null && ratio > 0.4 && rendered.renderedWordCount > result.seo.wordCount * 1.5) {
        issues.push({
            crawlId: result.crawlId, url: result.url, urlId: result.urlId,
            issue_type: 'hidden_text_in_rendered', severity: 'medium',
            message: `${Math.round(ratio * 100)}% of text content is only visible after JavaScript execution. Rendered word count (${rendered.renderedWordCount}) exceeds raw (${result.seo.wordCount}).`,
            recommendation: 'Make important content available in raw HTML for better search engine indexing.',
        });
    }
    return issues;
}
//# sourceMappingURL=js-rendering-detector.js.map