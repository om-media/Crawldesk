import Database from 'better-sqlite3'
import type { PageResult } from '../src/shared/types/url'

/** Shared schema used by all post-crawl analyzer tests */
export const SCHEMA_SQL = `
  CREATE TABLE urls (
    id TEXT PRIMARY KEY,
    crawl_id TEXT NOT NULL,
    url TEXT NOT NULL,
    normalized_url TEXT NOT NULL,
    final_url TEXT,
    status_code INTEGER,
    status_category TEXT,
    content_type TEXT,
    content_length INTEGER,
    is_internal INTEGER NOT NULL DEFAULT 1,
    is_crawlable INTEGER NOT NULL DEFAULT 1,
    indexability TEXT,
    indexability_reason TEXT,
    title TEXT,
    title_length INTEGER,
    meta_description TEXT,
    meta_description_length INTEGER,
    h1 TEXT,
    h1_count INTEGER DEFAULT 0,
    canonical TEXT,
    robots_meta TEXT,
    x_robots_tag TEXT,
    depth INTEGER NOT NULL DEFAULT 0,
    response_time_ms INTEGER,
    word_count INTEGER,
    content_hash TEXT,
    inlink_count INTEGER DEFAULT 0,
    outlink_count INTEGER DEFAULT 0,
    image_count INTEGER,
    images_missing_alt_attr INTEGER,
    images_with_alt_json TEXT,
    social_meta_json TEXT,
    has_og_tags INTEGER DEFAULT 0,
    has_twitter_card INTEGER DEFAULT 0,
    response_headers_json TEXT,
    hreflangs_json TEXT,
    has_hreflangs INTEGER DEFAULT 0,
    json_ld_types_json TEXT,
    pagination_next TEXT,
    pagination_prev TEXT,
    is_paginated INTEGER DEFAULT 0,
    discovered_from_url TEXT,
    fetch_error_code TEXT,
    fetch_error_message TEXT,
    noindex_in_rendered INTEGER DEFAULT 0,
    rendered_title TEXT,
    rendered_word_count INTEGER,
    js_redirect_url TEXT,
    hidden_text_ratio REAL,
    carbon_bytes_transferred INTEGER DEFAULT 0,
    carbon_co2_grams REAL DEFAULT 0,
    carbon_rating TEXT DEFAULT 'green',
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE links (
    id TEXT PRIMARY KEY,
    crawl_id TEXT NOT NULL,
    source_url_id TEXT,
    source_url TEXT NOT NULL,
    target_url TEXT NOT NULL,
    normalized_target_url TEXT NOT NULL,
    target_url_id TEXT,
    anchor_text TEXT,
    link_type TEXT NOT NULL CHECK(link_type IN ('html_a','canonical','image','script','css','iframe','other')),
    is_internal INTEGER NOT NULL DEFAULT 1,
    is_followed INTEGER NOT NULL DEFAULT 1,
    rel TEXT,
    discovered_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE issues (
    id TEXT PRIMARY KEY,
    crawl_id TEXT NOT NULL,
    url_id TEXT,
    url TEXT NOT NULL,
    issue_type TEXT NOT NULL,
    severity TEXT NOT NULL CHECK(severity IN ('critical','high','medium','low')),
    message TEXT NOT NULL,
    recommendation TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );
`

export function createTestDb(): Database.Database {
  const db = new Database(':memory:')
  db.exec(SCHEMA_SQL)
  return db
}

/** Insert a URL row and return its ID */
export function insertUrl(db: Database.Database, data: {
  crawlId?: string; id?: string; url: string; normalizedUrl?: string; canonical?: string | null;
  contentHash?: string | null; robotsMeta?: string | null; xRobotsTag?: string | null;
  statusCode?: number; statusCategory?: string; indexability?: string; title?: string; metaDescription?: string;
  paginationNext?: string | null; paginationPrev?: string | null; isPaginated?: boolean;
}): string {
  const d = {
    crawl_id: data.crawlId ?? 'test-crawl',
    id: data.id ?? crypto.randomUUID(),
    url: data.url,
    normalized_url: data.normalizedUrl ?? data.url.toLowerCase(),
    final_url: null, status_code: data.statusCode ?? 200, status_category: data.statusCategory ?? (data.statusCode ? (data.statusCode >= 400 && data.statusCode < 500 ? '4xx' : data.statusCode >= 300 && data.statusCode < 400 ? '3xx' : '2xx') : '2xx'),
    content_type: 'text/html', is_internal: 1, is_crawlable: 1,
    indexability: data.indexability ?? 'indexable',
    title: data.title ?? null,
    meta_description: data.metaDescription ?? null,
    canonical: data.canonical ?? null,
    robots_meta: data.robotsMeta ?? null,
    x_robots_tag: data.xRobotsTag ?? null,
    depth: 0, content_hash: data.contentHash ?? null, inlink_count: 0, outlink_count: 0,
    pagination_next: data.paginationNext ?? null,
    pagination_prev: data.paginationPrev ?? null,
    is_paginated: (data.isPaginated || data.paginationNext || data.paginationPrev) ? 1 : 0,
    created_at: new Date().toISOString(), updated_at: new Date().toISOString(),
  }

  db.prepare(`
    INSERT INTO urls (id, crawl_id, url, normalized_url, final_url, status_code, status_category,
      content_type, is_internal, is_crawlable, indexability, title, canonical, robots_meta,
      x_robots_tag, depth, content_hash, inlink_count, outlink_count,
      pagination_next, pagination_prev, is_paginated,
      created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    d.id, d.crawl_id, d.url, d.normalized_url, d.final_url, d.status_code, d.status_category,
    d.content_type, d.is_internal, d.is_crawlable, d.indexability, d.title, d.canonical,
    d.robots_meta, d.x_robots_tag, d.depth, d.content_hash, d.inlink_count, d.outlink_count,
    d.pagination_next, d.pagination_prev, d.is_paginated,
    d.created_at, d.updated_at
  )

  return d.id
}

/** Insert a link row and return its ID */
export function insertLink(db: Database.Database, data: {
  crawlId?: string; sourceUrlId?: string | null; sourceUrl?: string; targetUrl: string;
  normalizedTargetUrl?: string; targetUrlId?: string | null; anchorText?: string | null;
  linkType?: 'html_a' | 'canonical' | 'image' | 'script' | 'css' | 'iframe' | 'other';
  isInternal?: number; rel?: string | null;
}): string {
  const d = {
    crawl_id: data.crawlId ?? 'test-crawl',
    id: crypto.randomUUID(),
    source_url_id: data.sourceUrlId ?? null,
    source_url: data.sourceUrl ?? '',
    target_url: data.targetUrl,
    normalized_target_url: data.normalizedTargetUrl ?? data.targetUrl.toLowerCase(),
    target_url_id: data.targetUrlId ?? null,
    anchor_text: data.anchorText ?? null,
    link_type: data.linkType ?? 'html_a',
    is_internal: data.isInternal == null ? 1 : (typeof data.isInternal === 'boolean' ? (data.isInternal ? 1 : 0) : data.isInternal),
    is_followed: 1,
    rel: data.rel ?? null,
    discovered_at: new Date().toISOString(),
  }

  db.prepare(`
    INSERT INTO links (id, crawl_id, source_url_id, source_url, target_url, normalized_target_url,
      target_url_id, anchor_text, link_type, is_internal, is_followed, rel, discovered_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    d.id, d.crawl_id, d.source_url_id, d.source_url, d.target_url, d.normalized_target_url,
    d.target_url_id, d.anchor_text, d.link_type, d.is_internal, d.is_followed, d.rel, d.discovered_at
  )

  return d.id
}

/** Helper to count issues by type */
export function getIssuesByType(db: Database.Database, crawlId?: string): Record<string, number> {
  const result: Record<string, number> = {}
  const rows = db.prepare(`SELECT issue_type, COUNT(*) as cnt FROM issues WHERE crawl_id = ? GROUP BY issue_type`).all(crawlId ?? 'test-crawl') as Array<{ issue_type: string; cnt: number }>
  for (const r of rows) {
    result[r.issue_type] = r.cnt
  }
  return result
}
