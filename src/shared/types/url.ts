import type { IssueRecordInput } from './issue'

export type Indexability = 'indexable' | 'non_indexable' | 'unknown'

export interface UrlRecord {
  id: string
  crawl_id: string
  url: string
  normalized_url: string
  final_url?: string | null
  status_code?: number | null
  status_category?: string | null
  content_type?: string | null
  content_length?: number | null
  is_internal: boolean
  is_crawlable: boolean
  indexability?: Indexability | null
  indexability_reason?: string | null
  title?: string | null
  title_length?: number | null
  meta_description?: string | null
  meta_description_length?: number | null
  h1?: string | null
  h1_count?: number | null
  canonical?: string | null
  robots_meta?: string | null
  x_robots_tag?: string | null
  depth: number
  response_time_ms?: number | null
  word_count?: number | null
  content_hash?: string | null
  discovered_from_url?: string | null
  fetch_error_code?: string | null
  fetch_error_message?: string | null
  created_at: string
  updated_at: string
  // v2: hreflang
  hreflangs_json?: string | null
  has_hreflangs?: number
  // v2: heading hierarchy h2-h6
  h2?: string | null
  h2_count?: number
  h3?: string | null
  h3_count?: number
  h4?: string | null
  h4_count?: number
  h5?: string | null
  h5_count?: number
  h6?: string | null
  h6_count?: number
  // v2: image alt audit
  image_count?: number
  images_missing_alt_attr?: number
  images_empty_alt?: number
  images_long_alt?: number
  // v2: social meta
  social_meta_json?: string | null
  has_og_tags?: number
  has_twitter_card?: number
  // v2: structured data flags
  structured_data_json?: string | null
  sd_webpage?: number
  sd_article?: number
  sd_product?: number
  sd_faq_page?: number
  sd_breadcrumblist?: number
  sd_organization?: number
  sd_local_business?: number
  sd_review?: number
  sd_event?: number
  sd_has_parse_errors?: number
  // v2: carbon estimation
  carbon_bytes_transferred?: number
  carbon_co2_grams?: number
  carbon_rating?: string
  // v2: link graph counts
  inlink_count?: number
  unique_inlink_count?: number
  outlink_count?: number
  unique_outlink_count?: number
  external_outlink_count?: number
  // v2: pagination
  pagination_next?: string | null
  pagination_prev?: string | null
  is_paginated?: number
  // v2: js rendering comparison
  noindex_in_rendered?: number
  rendered_html_title?: string | null
  rendered_html_meta_desc?: string | null
  rendered_word_count?: number
  html_word_count?: number
  word_count_change?: number
  js_redirect_url?: string | null
  total_transferred_bytes?: number
  dom_content_loaded_ms?: number | null
  network_idle_ms?: number | null
  // v2: anchor text over-optimization
  anchor_text_over_optimized?: number
  // Dedicated DB columns (populated by Rust backend, camelCase via serde)
  size_bytes?: number | null
  language?: string | null
  inlinks_count?: number | null
  outlinks_count?: number | null
}

export interface FetchResult {
  body: Buffer
  statusCode: number
  headers: Record<string, string>
  finalUrl: string
  contentType: string
  contentLength: number
  responseTimeMs: number
  redirectChain: RedirectHop[]
  error?: { code: string; message: string }
}

export interface PageResult {
  urlId: string
  crawlId: string
  url: string
  normalizedUrl: string
  finalUrl?: string
  statusCode?: number | null
  contentType?: string | null
  contentLength?: number | null
  isInternal: boolean
  seo?: SeoData
  links?: ExtractedLink[]
  issues?: IssueRecordInput[]
  redirectChain?: RedirectHop[]
  depth: number
  responseTimeMs?: number
  wordCount?: number
  contentHash?: string
  discoveredFromUrl?: string
  fetchErrorCode?: string
  fetchErrorMessage?: string
  responseHeaders?: Record<string, string>
  skippedReason?: string
  blockedReason?: string
}

export interface HreflangEntry {
  hreflang: string
  href: string
  media?: string | null
}

export interface ImageAuditEntry {
  src: string
  alt?: string | null
}

export interface SocialMeta {
  ogTitle?: string | null
  ogDescription?: string | null
  ogImageUrl?: string | null
  twitterCard?: string | null
  twitterImageUrl?: string | null
}

export interface PaginationData {
  isPaginated: boolean
  relNext: string | null
  relPrev: string | null
}

export interface SeoData {
  title: string | null
  titleLength: number
  metaDescription: string | null
  metaDescriptionLength: number
  h1: string | null
  h1Count: number
  canonical: string | null
  robotsMeta: string | null
  xRobotsTag: string | null
  wordCount: number
  contentHash: string | null
  // v2: hreflang
  hreflangs?: HreflangEntry[]
  hreflangsJson?: string | null
  hasHreflangs?: boolean
  // v2: heading hierarchy h2-h6
  h2?: string | null
  h2Count?: number
  h3?: string | null
  h3Count?: number
  h4?: string | null
  h4Count?: number
  h5?: string | null
  h5Count?: number
  h6?: string | null
  h6Count?: number
  // v2: image alt audit
  images?: ImageAuditEntry[]
  imageCount?: number
  imagesMissingAltAttr?: number
  imagesEmptyAlt?: number
  imagesEmptyAltSrcs?: string[]
  imagesLongAlt?: number
  imagesLongAltSrcs?: string[]
  // v2: social meta
  socialMeta?: SocialMeta
  socialMetaJson?: string | null
  hasOgTags?: boolean
  hasTwitterCard?: boolean
  // v2: structured data flags
  jsonLdBlocks?: Array<Record<string, unknown>>
  structuredDataJson?: string | null
  sdWebpage?: boolean
  sdArticle?: boolean
  sdProduct?: boolean
  sdFaqPage?: boolean
  sdBreadcrumblist?: boolean
  sdOrganization?: boolean
  sdLocalBusiness?: boolean
  sdReview?: boolean
  sdEvent?: boolean
  sdHasParseErrors?: boolean
  // v2: carbon estimation
  carbonBytesTransferred?: number
  carbonCo2Grams?: number
  carbonRating?: string
  // v2: pagination
  pagination?: PaginationData
  paginationNext?: string | null
  paginationPrev?: string | null
  isPaginated?: boolean
  // v2: js rendering comparison
  noindexInRendered?: boolean
  renderedHtmlTitle?: string | null
  renderedHtmlMetaDesc?: string | null
  renderedWordCount?: number
  htmlWordCount?: number
  wordCountChange?: number
  jsRedirectUrl?: string | null
  totalTransferredBytes?: number
  domContentLoadedMs?: number | null
  networkIdleMs?: number | null
}

export interface ExtractedLink {
  targetUrl: string
  anchorText?: string
  linkType: 'html_a' | 'canonical' | 'image' | 'script' | 'css' | 'iframe' | 'other'
  rel?: string
}

export interface RedirectHop {
  url: string
  statusCode: number
}

export type StatusCategory = '2xx' | '3xx' | '4xx' | '5xx' | null
