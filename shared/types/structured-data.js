"use strict";
/**
 * Structured data types for JSON-LD extraction and validation (Phase 3).
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.KNOWN_SCHEMA_TYPES = exports.STRUCTURED_DATA_ISSUES = void 0;
/** Issue types related to structured data */
exports.STRUCTURED_DATA_ISSUES = {
    json_ld_missing_required_fields: 'json_ld_missing_required_fields',
    json_ld_invalid_syntax: 'json_ld_invalid_syntax',
    json_ld_no_organization: 'json_ld_no_organization',
    json_ld_no_breadcrumb: 'json_ld_no_breadcrumb',
    json_ld_missing_price: 'json_ld_missing_price',
    json_ld_missing_author: 'json_ld_missing_author',
};
/** Schema types that Google recognizes for rich results */
exports.KNOWN_SCHEMA_TYPES = new Set([
    // Organization / Business
    'Organization', 'LocalBusiness', 'Restaurant', 'Store',
    // Content
    'Article', 'NewsArticle', 'BlogPosting', 'ScholarlyArticle',
    // Products & E-commerce
    'Product', 'Offer', 'PriceSpecification',
    // Recipes & Media
    'Recipe', 'VideoObject', 'Movie', 'TVSeries',
    // Events & FAQ
    'Event', 'FAQPage', 'HowTo', 'QAPage',
    // Review & Rating
    'Review', 'AggregateRating',
    // Breadcrumb
    'BreadcrumbList',
    // Job Posting
    'JobPosting',
]);
//# sourceMappingURL=structured-data.js.map