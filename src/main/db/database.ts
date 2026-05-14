import Database from 'better-sqlite3'
import { app } from 'electron'
import path from 'path'
import fs from 'fs'

let dbInstance: Database.Database | null = null

export function getDbPath(): string {
  const dataDir = app.getPath('userData')
  return path.join(dataDir, 'crawldesk.sqlite')
}

export function getLogsPath(): string {
  const dataDir = app.getPath('userData')
  const logsDir = path.join(dataDir, 'logs')
  if (!fs.existsSync(logsDir)) {
    fs.mkdirSync(logsDir, { recursive: true })
  }
  return logsDir
}

export function initDatabase(): Database.Database {
  if (dbInstance) return dbInstance

  const dbPath = getDbPath()
  const dbDir = path.dirname(dbPath)
  if (!fs.existsSync(dbDir)) {
    fs.mkdirSync(dbDir, { recursive: true })
  }

  const db = new Database(dbPath)

  // Performance & safety pragmas
  db.pragma('journal_mode = WAL')
  db.pragma('synchronous = NORMAL')
  db.pragma('foreign_keys = ON')
  db.pragma('temp_store = MEMORY')

  runMigrations(db)
  dbInstance = db
  return db
}

export function closeDatabase(): void {
  if (dbInstance) {
    dbInstance.close()
    dbInstance = null
  }
}

function runMigrations(db: Database.Database): void {
  // Create migrations tracking table
  db.exec(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      version INTEGER PRIMARY KEY,
      applied_at TEXT NOT NULL
    )
  `)

  const currentVersion = db.prepare(
    'SELECT MAX(version) as v FROM schema_migrations'
  ).get() as { v: number | null }

  const version = (currentVersion?.v ?? 0) + 1

  // Version 2: Add all columns referenced by detectors/analyzers
  if (version >= 2) {
    db.exec(`
      CREATE TABLE IF NOT EXISTS crawl_diffs (
        id TEXT PRIMARY KEY,
        current_crawl_id TEXT NOT NULL,
        previous_crawl_id TEXT NOT NULL,
        url_count_delta INTEGER NOT NULL DEFAULT 0,
        new_urls_count INTEGER NOT NULL DEFAULT 0,
        removed_urls_count INTEGER NOT NULL DEFAULT 0,
        broken_links_delta INTEGER NOT NULL DEFAULT 0,
        issues_delta INTEGER NOT NULL DEFAULT 0,
        critical_issues_delta INTEGER NOT NULL DEFAULT 0,
        created_at TEXT NOT NULL,
        FOREIGN KEY(current_crawl_id) REFERENCES crawls(id) ON DELETE CASCADE,
        FOREIGN KEY(previous_crawl_id) REFERENCES crawls(id) ON DELETE CASCADE
      );

      CREATE TABLE IF NOT EXISTS psi_results (
        id TEXT PRIMARY KEY,
        crawl_id TEXT NOT NULL,
        url_id TEXT,
        url TEXT NOT NULL,
        strategy TEXT NOT NULL DEFAULT 'mobile',
        performance_score REAL,
        accessibility_score REAL,
        best_practices_score REAL,
        seo_score REAL,
        lcp_ms REAL,
        fid_ms REAL,
        cls REAL,
        fcp_ms REAL,
        ttfb_ms REAL,
        speed_index REAL,
        fetched_at TEXT NOT NULL,
        FOREIGN KEY(crawl_id) REFERENCES crawls(id) ON DELETE CASCADE
      );

      CREATE INDEX IF NOT EXISTS idx_psi_results_crawl_id ON psi_results(crawl_id);
      CREATE INDEX IF NOT EXISTS idx_psi_results_url_id ON psi_results(url_id);

      -- Hreflang columns
      ALTER TABLE urls ADD COLUMN hreflangs_json TEXT NOT NULL DEFAULT '[]';
      ALTER TABLE urls ADD COLUMN has_hreflangs INTEGER NOT NULL DEFAULT 0;

      -- Heading hierarchy (h2–h6)
      ALTER TABLE urls ADD COLUMN h2 TEXT;
      ALTER TABLE urls ADD COLUMN h2_count INTEGER NOT NULL DEFAULT 0;
      ALTER TABLE urls ADD COLUMN h3 TEXT;
      ALTER TABLE urls ADD COLUMN h3_count INTEGER NOT NULL DEFAULT 0;
      ALTER TABLE urls ADD COLUMN h4 TEXT;
      ALTER TABLE urls ADD COLUMN h4_count INTEGER NOT NULL DEFAULT 0;
      ALTER TABLE urls ADD COLUMN h5 TEXT;
      ALTER TABLE urls ADD COLUMN h5_count INTEGER NOT NULL DEFAULT 0;
      ALTER TABLE urls ADD COLUMN h6 TEXT;
      ALTER TABLE urls ADD COLUMN h6_count INTEGER NOT NULL DEFAULT 0;

      -- Image alt audit
      ALTER TABLE urls ADD COLUMN image_count INTEGER NOT NULL DEFAULT 0;
      ALTER TABLE urls ADD COLUMN images_missing_alt_attr INTEGER NOT NULL DEFAULT 0;
      ALTER TABLE urls ADD COLUMN images_empty_alt INTEGER NOT NULL DEFAULT 0;
      ALTER TABLE urls ADD COLUMN images_long_alt INTEGER NOT NULL DEFAULT 0;

      -- Social media meta
      ALTER TABLE urls ADD COLUMN social_meta_json TEXT NOT NULL DEFAULT '{}';
      ALTER TABLE urls ADD COLUMN has_og_tags INTEGER NOT NULL DEFAULT 0;
      ALTER TABLE urls ADD COLUMN has_twitter_card INTEGER NOT NULL DEFAULT 0;

      -- Structured data flags
      ALTER TABLE urls ADD COLUMN structured_data_json TEXT NOT NULL DEFAULT '[]';
      ALTER TABLE urls ADD COLUMN sd_webpage INTEGER NOT NULL DEFAULT 0;
      ALTER TABLE urls ADD COLUMN sd_article INTEGER NOT NULL DEFAULT 0;
      ALTER TABLE urls ADD COLUMN sd_product INTEGER NOT NULL DEFAULT 0;
      ALTER TABLE urls ADD COLUMN sd_faq_page INTEGER NOT NULL DEFAULT 0;
      ALTER TABLE urls ADD COLUMN sd_breadcrumblist INTEGER NOT NULL DEFAULT 0;
      ALTER TABLE urls ADD COLUMN sd_organization INTEGER NOT NULL DEFAULT 0;
      ALTER TABLE urls ADD COLUMN sd_local_business INTEGER NOT NULL DEFAULT 0;
      ALTER TABLE urls ADD COLUMN sd_review INTEGER NOT NULL DEFAULT 0;
      ALTER TABLE urls ADD COLUMN sd_event INTEGER NOT NULL DEFAULT 0;
      ALTER TABLE urls ADD COLUMN sd_has_parse_errors INTEGER NOT NULL DEFAULT 0;

      -- Carbon estimation
      ALTER TABLE urls ADD COLUMN carbon_bytes_transferred INTEGER NOT NULL DEFAULT 0;
      ALTER TABLE urls ADD COLUMN carbon_co2_grams REAL NOT NULL DEFAULT 0;
      ALTER TABLE urls ADD COLUMN carbon_rating TEXT NOT NULL DEFAULT '';

      -- Link graph counts
      ALTER TABLE urls ADD COLUMN inlink_count INTEGER NOT NULL DEFAULT 0;
      ALTER TABLE urls ADD COLUMN unique_inlink_count INTEGER NOT NULL DEFAULT 0;
      ALTER TABLE urls ADD COLUMN outlink_count INTEGER NOT NULL DEFAULT 0;
      ALTER TABLE urls ADD COLUMN unique_outlink_count INTEGER NOT NULL DEFAULT 0;
      ALTER TABLE urls ADD COLUMN external_outlink_count INTEGER NOT NULL DEFAULT 0;

      -- Pagination
      ALTER TABLE urls ADD COLUMN pagination_next TEXT;
      ALTER TABLE urls ADD COLUMN pagination_prev TEXT;
      ALTER TABLE urls ADD COLUMN is_paginated INTEGER NOT NULL DEFAULT 0;

      -- JS rendering comparison columns
      ALTER TABLE urls ADD COLUMN noindex_in_rendered INTEGER NOT NULL DEFAULT 0;
      ALTER TABLE urls ADD COLUMN rendered_html_title TEXT;
      ALTER TABLE urls ADD COLUMN rendered_html_meta_desc TEXT;
      ALTER TABLE urls ADD COLUMN rendered_word_count INTEGER NOT NULL DEFAULT 0;
      ALTER TABLE urls ADD COLUMN html_word_count INTEGER NOT NULL DEFAULT 0;
      ALTER TABLE urls ADD COLUMN word_count_change REAL NOT NULL DEFAULT 0;
      ALTER TABLE urls ADD COLUMN js_redirect_url TEXT;
      ALTER TABLE urls ADD COLUMN total_transferred_bytes INTEGER NOT NULL DEFAULT 0;
      ALTER TABLE urls ADD COLUMN dom_content_loaded_ms REAL;
      ALTER TABLE urls ADD COLUMN network_idle_ms REAL;

      -- Anchor text over-optimization (per-URL)
      ALTER TABLE urls ADD COLUMN anchor_text_over_optimized INTEGER NOT NULL DEFAULT 0;
    `)

    const existing = db.prepare(
      'SELECT version FROM schema_migrations WHERE version = ?'
    ).get(2) as { version?: number } | undefined
    if (!existing) {
      db.prepare(
        "INSERT INTO schema_migrations (version, applied_at) VALUES (?, datetime('now'))"
      ).run(2)
    }
  }

  // Version 1: Initial schema
  if (version >= 1) {
    db.exec(`
      CREATE TABLE IF NOT EXISTS projects (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        root_url TEXT NOT NULL,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS crawls (
        id TEXT PRIMARY KEY,
        project_id TEXT NOT NULL,
        start_url TEXT NOT NULL,
        status TEXT NOT NULL CHECK(status IN ('created','running','paused','stopped','completed','failed')),
        total_discovered INTEGER NOT NULL DEFAULT 0,
        total_queued INTEGER NOT NULL DEFAULT 0,
        total_completed INTEGER NOT NULL DEFAULT 0,
        total_failed INTEGER NOT NULL DEFAULT 0,
        total_blocked INTEGER NOT NULL DEFAULT 0,
        started_at TEXT,
        finished_at TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        error_code TEXT,
        error_message TEXT,
        FOREIGN KEY(project_id) REFERENCES projects(id) ON DELETE CASCADE
      );

      CREATE TABLE IF NOT EXISTS crawl_settings (
        crawl_id TEXT PRIMARY KEY,
        max_urls INTEGER NOT NULL,
        max_depth INTEGER NOT NULL,
        concurrency INTEGER NOT NULL,
        request_timeout_ms INTEGER NOT NULL,
        respect_robots_txt INTEGER NOT NULL,
        crawl_subdomains INTEGER NOT NULL,
        check_external_links INTEGER NOT NULL,
        crawl_external_links INTEGER NOT NULL DEFAULT 0,
        user_agent TEXT NOT NULL,
        include_patterns_json TEXT NOT NULL DEFAULT '[]',
        exclude_patterns_json TEXT NOT NULL DEFAULT '[]',
        FOREIGN KEY(crawl_id) REFERENCES crawls(id) ON DELETE CASCADE
      );

      CREATE TABLE IF NOT EXISTS urls (
        id TEXT PRIMARY KEY,
        crawl_id TEXT NOT NULL,
        url TEXT NOT NULL,
        normalized_url TEXT NOT NULL,
        final_url TEXT,
        status_code INTEGER,
        status_category TEXT,
        content_type TEXT,
        content_length INTEGER,
        is_internal INTEGER NOT NULL,
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
        depth INTEGER NOT NULL,
        response_time_ms INTEGER,
        word_count INTEGER,
        content_hash TEXT,
        discovered_from_url TEXT,
        fetch_error_code TEXT,
        fetch_error_message TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        FOREIGN KEY(crawl_id) REFERENCES crawls(id) ON DELETE CASCADE,
        UNIQUE(crawl_id, normalized_url)
      );

      CREATE INDEX IF NOT EXISTS idx_urls_crawl_id ON urls(crawl_id);
      CREATE INDEX IF NOT EXISTS idx_urls_status_code ON urls(crawl_id, status_code);
      CREATE INDEX IF NOT EXISTS idx_urls_indexability ON urls(crawl_id, indexability);
      CREATE INDEX IF NOT EXISTS idx_urls_depth ON urls(crawl_id, depth);
      CREATE INDEX IF NOT EXISTS idx_urls_title ON urls(crawl_id, title);
      CREATE INDEX IF NOT EXISTS idx_urls_content_hash ON urls(crawl_id, content_hash);

      CREATE TABLE IF NOT EXISTS links (
        id TEXT PRIMARY KEY,
        crawl_id TEXT NOT NULL,
        source_url_id TEXT,
        source_url TEXT NOT NULL,
        target_url TEXT NOT NULL,
        normalized_target_url TEXT NOT NULL,
        target_url_id TEXT,
        anchor_text TEXT,
        link_type TEXT NOT NULL CHECK(link_type IN ('html_a','canonical','image','script','css','iframe','other')),
        is_internal INTEGER NOT NULL,
        is_followed INTEGER NOT NULL DEFAULT 1,
        rel TEXT,
        discovered_at TEXT NOT NULL,
        FOREIGN KEY(crawl_id) REFERENCES crawls(id) ON DELETE CASCADE,
        FOREIGN KEY(source_url_id) REFERENCES urls(id) ON DELETE CASCADE
      );

      CREATE INDEX IF NOT EXISTS idx_links_crawl_id ON links(crawl_id);
      CREATE INDEX IF NOT EXISTS idx_links_source ON links(crawl_id, source_url_id);
      CREATE INDEX IF NOT EXISTS idx_links_target ON links(crawl_id, normalized_target_url);
      CREATE INDEX IF NOT EXISTS idx_links_internal ON links(crawl_id, is_internal);

      CREATE TABLE IF NOT EXISTS issues (
        id TEXT PRIMARY KEY,
        crawl_id TEXT NOT NULL,
        url_id TEXT,
        url TEXT NOT NULL,
        issue_type TEXT NOT NULL,
        severity TEXT NOT NULL CHECK(severity IN ('critical','high','medium','low')),
        message TEXT NOT NULL,
        recommendation TEXT NOT NULL,
        created_at TEXT NOT NULL,
        FOREIGN KEY(crawl_id) REFERENCES crawls(id) ON DELETE CASCADE,
        FOREIGN KEY(url_id) REFERENCES urls(id) ON DELETE CASCADE
      );

      CREATE INDEX IF NOT EXISTS idx_issues_crawl_id ON issues(crawl_id);
      CREATE INDEX IF NOT EXISTS idx_issues_type ON issues(crawl_id, issue_type);
      CREATE INDEX IF NOT EXISTS idx_issues_severity ON issues(crawl_id, severity);
      CREATE INDEX IF NOT EXISTS idx_issues_url_id ON issues(crawl_id, url_id);

      CREATE TABLE IF NOT EXISTS robots_rules (
        id TEXT PRIMARY KEY,
        crawl_id TEXT NOT NULL,
        host TEXT NOT NULL,
        robots_url TEXT NOT NULL,
        fetched_status_code INTEGER,
        body TEXT,
        parsed_json TEXT,
        created_at TEXT NOT NULL,
        FOREIGN KEY(crawl_id) REFERENCES crawls(id) ON DELETE CASCADE
      );

      CREATE TABLE IF NOT EXISTS sitemaps (
        id TEXT PRIMARY KEY,
        crawl_id TEXT NOT NULL,
        sitemap_url TEXT NOT NULL,
        status_code INTEGER,
        discovered_from TEXT,
        url_count INTEGER DEFAULT 0,
        created_at TEXT NOT NULL,
        FOREIGN KEY(crawl_id) REFERENCES crawls(id) ON DELETE CASCADE
      );
    `)

    const existing = db.prepare(
      'SELECT version FROM schema_migrations WHERE version = ?'
    ).get(1) as { version?: number } | undefined
    if (!existing) {
      db.prepare(
        "INSERT INTO schema_migrations (version, applied_at) VALUES (?, datetime('now'))"
      ).run(1)
    }
  }
}
