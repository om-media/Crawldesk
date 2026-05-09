import type { PageResult } from '../../../shared/types/url'
import type { IssueRecordInput } from '../../../shared/types/issue'

/** Required fields by schema type for rich results eligibility (Feature 3.4). */
const REQUIRED_FIELDS_BY_TYPE: Record<string, string[]> = {
  Organization: ['name'],
  LocalBusiness: ['name', 'address'],
  Article: ['headline', 'author', 'datePublished'],
  NewsArticle: ['headline', 'author', 'datePublished', 'image'],
  BlogPosting: ['headline', 'author', 'datePublished'],
  Product: ['name', 'description', 'offers'],
  Recipe: ['name', 'image', 'recipeInstructions'],
  VideoObject: ['name', 'thumbnailUrl', 'uploadDate'],
  Event: ['name', 'startDate'],
  FAQPage: ['mainEntity'],
  HowTo: ['name', 'step'],
  BreadcrumbList: ['itemListElement'],
  JobPosting: ['title', 'datePosted', 'hiringOrganization', 'jobLocation'],
}

/** Check if a JSON-LD block has the required field (handles nested objects too). */
function hasField(block: Record<string, unknown>, field: string): boolean {
  // Direct check
  if (field in block && block[field] != null) return true
  // Common nesting patterns
  if ('@graph' in block && Array.isArray(block['@graph'])) {
    for (const item of block['@graph']) {
      if (typeof item === 'object' && item !== null && field in item && item[field] != null) return true
    }
  }
  return false
}

export function detectStructuredDataIssues(result: PageResult): IssueRecordInput[] {
  const issues: IssueRecordInput[] = []
  if (!result.seo?.jsonLdBlocks || result.seo.jsonLdBlocks.length === 0) return issues

  for (const block of result.seo.jsonLdBlocks) {
    const types = typeof block['@type'] === 'string'
      ? [block['@type']]
      : Array.isArray(block['@type'])
        ? (block['@type'] as string[])
        : []

    for (const type of types) {
      const requiredFields = REQUIRED_FIELDS_BY_TYPE[type]
      if (!requiredFields) continue

      const missingFields: string[] = []
      for (const field of requiredFields) {
        if (!hasField(block, field)) {
          missingFields.push(field)
        }
      }

      if (missingFields.length > 0) {
        // Map specific field groups to appropriate issue types
        let issueType = 'structured_data_missing_fields'
        if (type === 'Product' && missingFields.includes('offers')) issueType = 'product_missing_price'
        else if ((type === 'Article' || type === 'NewsArticle') && missingFields.includes('author')) issueType = 'article_missing_author'
        else if (type === 'BreadcrumbList' && missingFields.includes('itemListElement')) issueType = 'breadcrumb_invalid'

        issues.push({
          crawlId: result.crawlId, url: result.url, urlId: result.urlId,
          issue_type: issueType, severity: 'medium',
          message: `Structured data (${type}) is missing required fields: ${missingFields.join(', ')}.`,
          recommendation: `Add the following required fields to your JSON-LD ${type}: ${missingFields.join(', ')}.`,
        })
      }
    }
  }

  return issues
}
