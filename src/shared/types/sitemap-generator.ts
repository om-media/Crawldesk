// Types shared between main process and renderer for the sitemap generator feature.

import type { UrlRecord } from './url'

export interface GenerateSitemapInput {
  /** Database rows to include in the generated sitemap */
  urls: (Pick<UrlRecord, 'url' | 'updated_at' | 'title'> & {
    status_code?: number | null
    indexability?: string | null
    images_with_alt_json?: string | null // JSON array of image objects with src/alt
  })[]
  /** Only include HTTP 200 responses (default true) */
  onlyHttp200?: boolean
  /** Only include indexable pages (default true) */
  onlyIndexable?: boolean
  /** Include image sitemap entries from crawled page content */
  includeImages?: boolean
  /** Max URLs per file before splitting (default 50000) */
  maxUrlsPerFile?: number
}

export interface GeneratedSitemapResult {
  /** XML text of a single sitemap or an index file */
  xml: string
  /** Type: 'sitemapindex' when split into multiple files, 'urlset' for single file */
  kind: 'urlset' | 'sitemapindex'
  /** When kind='sitemapindex', contains individual sitemap XML strings keyed by filename */
  parts?: Record<string, string>
  /** Total URL count included */
  urlCount: number
}
