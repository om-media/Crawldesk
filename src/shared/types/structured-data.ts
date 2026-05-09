/**
 * Structured data types for JSON-LD extraction and validation (Phase 3).
 */

export interface JsonLdBlock {
  '@context'?: string | string[]
  '@type'?: string | string[]
  [key: string]: unknown
}

/** Summary of a parsed JSON-LD block for storage in DB */
export interface JsonLdSummary {
  type: string | string[]
  context: string | string[]
  /** Whether required fields for rich results are present */
  hasRequiredFields: boolean
  /** Missing required fields for the schema type */
  missingFields: string[]
}

/** Issue types related to structured data */
export const STRUCTURED_DATA_ISSUES = {
  json_ld_missing_required_fields: 'json_ld_missing_required_fields',
  json_ld_invalid_syntax: 'json_ld_invalid_syntax',
  json_ld_no_organization: 'json_ld_no_organization',
  json_ld_no_breadcrumb: 'json_ld_no_breadcrumb',
  json_ld_missing_price: 'json_ld_missing_price',
  json_ld_missing_author: 'json_ld_missing_author',
} as const

/** Schema types that Google recognizes for rich results */
export const KNOWN_SCHEMA_TYPES = new Set([
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
])
