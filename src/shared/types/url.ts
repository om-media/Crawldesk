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
  skippedReason?: string
  blockedReason?: string
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
