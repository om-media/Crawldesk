"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.detectImageIssues = detectImageIssues;
/**
 * Detects image accessibility issues: missing alt attribute, empty alt text, alt too long.
 */
function detectImageIssues(result) {
    const issues = [];
    if (!result.seo)
        return issues;
    const seo = result.seo;
    // --- Images missing alt attribute entirely ---
    if ((seo.imagesMissingAltAttr ?? 0) > 0) {
        const n = seo.imagesMissingAltAttr;
        issues.push({
            crawlId: result.crawlId, url: result.url, urlId: result.urlId,
            issue_type: 'image_missing_alt_attribute', severity: 'high',
            message: `${n} image(s) missing alt attribute.`,
            recommendation: 'Add descriptive alt text to every meaningful image. Use alt="" only for purely decorative images.',
        });
    }
    // --- Images with empty alt (potential non-decorative content images) ---
    const emptyAltSrcs = seo.imagesEmptyAltSrcs;
    if (emptyAltSrcs && emptyAltSrcs.length > 0) {
        // Show first few in the message, count total
        const srcSnippet = emptyAltSrcs.slice(0, 2).map(s => s.split('/').pop() || s).join(', ');
        const suffix = emptyAltSrcs.length > 2 ? ` (+${emptyAltSrcs.length - 2} more)` : '';
        issues.push({
            crawlId: result.crawlId, url: result.url, urlId: result.urlId,
            issue_type: 'image_empty_alt_text', severity: 'medium',
            message: `${emptyAltSrcs.length} image(s) have empty alt text (${srcSnippet}${suffix}). Verify if they are decorative or need description.`,
            recommendation: 'If the image conveys information, add descriptive alt text. If decorative, empty alt is correct.',
        });
    }
    // --- Alt text too long (>100 chars) ---
    const longAltSrcs = seo.imagesLongAltSrcs;
    if (longAltSrcs && longAltSrcs.length > 0) {
        for (const img of seo.images ?? []) {
            if (!img.alt || img.alt.length <= 100)
                continue;
            issues.push({
                crawlId: result.crawlId, url: result.url, urlId: result.urlId,
                issue_type: 'image_alt_too_long', severity: 'low',
                message: `Image alt text is ${img.alt.length} characters long (${img.src.split('/').pop()}).`,
                recommendation: 'Keep alt text concise and descriptive (under 100 characters).',
            });
        }
    }
    return issues;
}
//# sourceMappingURL=image-detector.js.map