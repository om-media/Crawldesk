// Feature 6.1 — PageSpeed Insights Results Types

export interface PsiResult {
  id: string
  crawl_id: string
  url_id: string | null
  url: string
  strategy: 'mobile' | 'desktop'
  performance_score: number | null        // 0-100
  accessibility_score: number | null      // 0-100
  best_practices_score: number | null     // 0-100
  seo_score: number | null                // 0-100
  lcp_ms: number | null                   // Largest Contentful Paint in ms
  fid_ms: number | null                   // First Input Delay in ms
  cls: number | null                      // Cumulative Layout Shift
  fcp_ms: number | null                   // First Contentful Paint in ms
  ttfb_ms: number | null                  // Time to First Byte in ms
  speed_index: number | null              // Speed Index in ms
}

export interface PsiConfigInput {
  psiEnabled: boolean
  psiStrategy: 'mobile' | 'desktop'
  psiApiKey?: string
  psiMaxUrls: number   // max URLs to send to PSI (0 = all)
}
