export interface LinkRecord {
  id: string
  crawl_id: string
  source_url_id?: string | null
  source_url: string
  target_url: string
  normalized_target_url: string
  target_url_id?: string | null
  anchor_text?: string | null
  link_type: 'html_a' | 'canonical' | 'image' | 'script' | 'css' | 'iframe' | 'other'
  is_internal: boolean
  is_followed: boolean
  rel?: string | null
  discovered_at: string
}

export interface LinkSummary {
  totalInternal: number
  totalExternal: number
  totalFollow: number
  totalNofollow: number
  brokenCount: number
}
