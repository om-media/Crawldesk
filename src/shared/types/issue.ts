export type Severity = 'critical' | 'high' | 'medium' | 'low'

export interface IssueRecordInput {
  crawlId: string
  urlId?: string
  url: string
  issue_type: string
  severity: Severity
  message: string
  recommendation: string
}

export interface IssueRecord extends IssueRecordInput {
  id: string
  created_at: string
}

export interface IssueSummary {
  issue_type: string
  severity: Severity
  count: number
  label: string
  explanation: string
  recommendation: string
}

export const ISSUE_DEFINITIONS: Record<string, Omit<IssueSummary, 'count'>> = {
  broken_internal_link: {
    issue_type: 'broken_internal_link',
    severity: 'critical',
    label: 'Broken internal links',
    explanation: 'Internal links point to URLs that return 4xx or 5xx errors.',
    recommendation: 'Update or remove the internal link, or restore the target page.'
  },
  server_error_5xx: {
    issue_type: 'server_error_5xx',
    severity: 'critical',
    label: 'Server errors (5xx)',
    explanation: 'Pages returning a 5xx status code are unreachable by users and search engines.',
    recommendation: 'Investigate server logs and fix the underlying application error.'
  },
  missing_title: {
    issue_type: 'missing_title',
    severity: 'high',
    label: 'Missing page title',
    explanation: 'Pages without a <title> tag have no meaningful title in search results.',
    recommendation: 'Add a descriptive, unique <title> tag to every important page.'
  },
  duplicate_title: {
    issue_type: 'duplicate_title',
    severity: 'high',
    label: 'Duplicate page titles',
    explanation: 'Multiple indexable pages use the same title, which can make it harder for search engines to understand page relevance.',
    recommendation: 'Rewrite titles so every important indexable page has a unique, descriptive title aligned with search intent.'
  },
  noindex: {
    issue_type: 'important_page_noindex',
    severity: 'high',
    label: 'Important pages set to noindex',
    explanation: 'Pages marked noindex will be excluded from search engine indexes.',
    recommendation: 'Review whether these pages should actually be indexed. Remove noindex if they are important landing pages.'
  },
  missing_meta_description: {
    issue_type: 'missing_meta_description',
    severity: 'medium',
    label: 'Missing meta description',
    explanation: 'Pages without a meta description may show auto-generated snippets in search results.',
    recommendation: 'Add a concise, compelling meta description (120-155 characters) to improve click-through rates.'
  },
  duplicate_meta_description: {
    issue_type: 'duplicate_meta_description',
    severity: 'medium',
    label: 'Duplicate meta descriptions',
    explanation: 'Multiple pages share the same meta description, reducing uniqueness of search listings.',
    recommendation: 'Write unique meta descriptions for each page targeting its specific content and keywords.'
  },
  canonicalized_url: {
    issue_type: 'canonicalized_url',
    severity: 'medium',
    label: 'Canonicalized URLs',
    explanation: 'These pages have a canonical tag pointing to a different URL, indicating they are not the preferred version.',
    recommendation: 'Verify the canonical target is correct. If this page should rank independently, self-reference or remove the canonical.'
  },
  redirect_chain: {
    issue_type: 'redirect_chain',
    severity: 'medium',
    label: 'Redirect chains',
    explanation: 'Multiple consecutive redirects slow down crawling and waste crawl budget.',
    recommendation: 'Update links to point directly to the final destination URL, removing intermediate redirects.'
  },
  multiple_canonicals: {
    issue_type: 'multiple_canonicals',
    severity: 'medium',
    label: 'Multiple canonical tags',
    explanation: 'Having more than one canonical link tag creates ambiguity about which URL is preferred.',
    recommendation: 'Ensure only one <link rel="canonical"> exists per page.'
  },
  missing_h1: {
    issue_type: 'missing_h1',
    severity: 'medium',
    label: 'Missing H1 heading',
    explanation: 'Pages without an H1 lack a clear primary heading for both users and search engines.',
    recommendation: 'Add exactly one descriptive H1 that summarizes the main content of the page.'
  },
  title_too_long: {
    issue_type: 'title_too_long',
    severity: 'low',
    label: 'Title too long',
    explanation: 'Titles longer than ~60 characters may be truncated in search results.',
    recommendation: 'Shorten titles to approximately 50-60 characters while preserving key information.'
  },
  title_too_short: {
    issue_type: 'title_too_short',
    severity: 'low',
    label: 'Title too short',
    explanation: 'Titles shorter than ~30 characters do not provide enough context for searchers.',
    recommendation: 'Expand short titles to include more descriptive, relevant keywords (target 40-60 chars).'
  },
  meta_description_too_long: {
    issue_type: 'meta_description_too_long',
    severity: 'low',
    label: 'Meta description too long',
    explanation: 'Descriptions longer than ~160 characters will likely be truncated in search results.',
    recommendation: 'Keep meta descriptions between 120-155 characters for optimal display.'
  },
  meta_description_too_short: {
    issue_type: 'meta_description_too_short',
    severity: 'low',
    label: 'Meta description too short',
    explanation: 'Very short meta descriptions (< 70 chars) miss an opportunity to attract clicks.',
    recommendation: 'Write fuller meta descriptions of 120-155 characters that summarize page content and include a call-to-action.'
  },
  slow_response: {
    issue_type: 'slow_response',
    severity: 'low',
    label: 'Slow response time',
    explanation: 'Pages taking more than 2 seconds to respond provide a poor user experience and may affect crawl efficiency.',
    recommendation: 'Optimize server response times through caching, CDN usage, or backend performance improvements.'
  },
  multiple_h1: {
    issue_type: 'multiple_h1',
    severity: 'low',
    label: 'Multiple H1 headings',
    explanation: 'Having multiple H1 tags can confuse the page hierarchy and topic signal.',
    recommendation: 'Use exactly one H1 per page. Convert additional H1s to H2 or other appropriate heading levels.'
  },
  multiple_title_tags: {
    issue_type: 'multiple_title_tags',
    severity: 'low',
    label: 'Multiple title tags',
    explanation: 'Multiple <title> elements create ambiguity about which one defines the page title.',
    recommendation: 'Ensure only one <title> tag exists in the document head.'
  },
  multiple_meta_descriptions: {
    issue_type: 'multiple_meta_descriptions',
    severity: 'low',
    label: 'Multiple meta descriptions',
    explanation: 'Duplicate meta description tags create uncertainty about the correct page summary.',
    recommendation: 'Remove duplicate meta description tags, keeping only one per page.'
  }
}
