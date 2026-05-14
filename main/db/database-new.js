"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.getDbPath = getDbPath;
exports.getLogsPath = getLogsPath;
exports.initDatabase = initDatabase;
exports.closeDatabase = closeDatabase;
const better_sqlite3_1 = __importDefault(require("better-sqlite3"));
const electron_1 = require("electron");
const path_1 = __importDefault(require("path"));
const fs_1 = __importDefault(require("fs"));
let dbInstance = null;
function getDbPath() {
    const dataDir = electron_1.app.getPath('userData');
    return path_1.default.join(dataDir, 'crawldesk.sqlite');
}
function getLogsPath() {
    const dataDir = electron_1.app.getPath('userData');
    const logsDir = path_1.default.join(dataDir, 'logs');
    if (!fs_1.default.existsSync(logsDir)) {
        fs_1.default.mkdirSync(logsDir, { recursive: true });
    }
    return logsDir;
}
function initDatabase() {
    if (dbInstance)
        return dbInstance;
    const dbPath = getDbPath();
    const dbDir = path_1.default.dirname(dbPath);
    if (!fs_1.default.existsSync(dbDir)) {
        fs_1.default.mkdirSync(dbDir, { recursive: true });
    }
    const db = new better_sqlite3_1.default(dbPath);
    // Performance & safety pragmas
    db.pragma('journal_mode = WAL');
    db.pragma('synchronous = NORMAL');
    db.pragma('foreign_keys = ON');
    db.pragma('temp_store = MEMORY');
    runMigrations(db);
    dbInstance = db;
    return db;
}
function closeDatabase() {
    if (dbInstance) {
        dbInstance.close();
        dbInstance = null;
    }
}
const MIGRATIONS = [
    runMigrationV1,
    runMigrationV2,
    runMigrationV3,
    runMigrationV4,
    runMigrationV5,
    runMigrationV6,
    runMigrationV7,
    runMigrationV8,
    runMigrationV9,
];
function runMigrations(db) {
    db.exec(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      version INTEGER PRIMARY KEY,
      applied_at TEXT NOT NULL
    )
  `);
    const currentVersionRow = db.prepare('SELECT MAX(version) as v FROM schema_migrations').get();
    const appliedVersion = currentVersionRow?.v ?? 0;
    // Run ALL pending migrations in one pass
    for (let i = appliedVersion; i < MIGRATIONS.length; i++) {
        MIGRATIONS[i](db);
    }
}
// ---------------------------------------------------------------------------
// Migration helpers
// ---------------------------------------------------------------------------
function markApplied(db, version) {
    const existing = db.prepare('SELECT version FROM schema_migrations WHERE version = ?').get(version);
    if (!existing) {
        db.prepare("INSERT INTO schema_migrations (version, applied_at) VALUES (?, datetime('now'))").run(version);
    }
}
function addColumn(db, table, col, typeDef) {
    try {
        db.prepare(`ALTER TABLE ${table} ADD COLUMN ${col} ${typeDef}`).run();
    }
    catch {
        // Column already exists — ignore
    }
}
// Version 1: Initial schema
function runMigrationV1(db) {
    db.exec(`
    CREATE TABLE IF NOT EXISTS projects (
      id TEXT PRIMARY KEY, name TEXT NOT NULL, root_url TEXT NOT NULL,
      created_at TEXT NOT NULL, updated_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS crawls (
      id TEXT PRIMARY KEY, project_id TEXT NOT NULL, start_url TEXT NOT NULL,
      status TEXT NOT NULL CHECK(status IN ('created','running','paused','stopped','completed','failed')),
      total_discovered INTEGER NOT NULL DEFAULT 0, total_queued INTEGER NOT NULL DEFAULT 0,
      total_completed INTEGER NOT NULL DEFAULT 0, total_failed INTEGER NOT NULL DEFAULT 0,
      total_blocked INTEGER NOT NULL DEFAULT 0, started_at TEXT, finished_at TEXT,
      created_at TEXT NOT NULL, updated_at TEXT NOT NULL, error_code TEXT, error_message TEXT,
      FOREIGN KEY(project_id) REFERENCES projects(id) ON DELETE CASCADE
    );
    CREATE TABLE IF NOT EXISTS crawl_settings (
      crawl_id TEXT PRIMARY KEY, max_urls INTEGER NOT NULL, max_depth INTEGER NOT NULL,
      concurrency INTEGER NOT NULL, request_timeout_ms INTEGER NOT NULL,
      respect_robots_txt INTEGER NOT NULL, crawl_subdomains INTEGER NOT NULL,
      check_external_links INTEGER NOT NULL, crawl_external_links INTEGER NOT NULL DEFAULT 0,
      user_agent TEXT NOT NULL, include_patterns_json TEXT NOT NULL DEFAULT '[]',
      exclude_patterns_json TEXT NOT NULL DEFAULT '[]',
      FOREIGN KEY(crawl_id) REFERENCES crawls(id) ON DELETE CASCADE
    );
    CREATE TABLE IF NOT EXISTS urls (
      id TEXT PRIMARY KEY, crawl_id TEXT NOT NULL, url TEXT NOT NULL, normalized_url TEXT NOT NULL,
      final_url TEXT, status_code INTEGER, status_category TEXT, content_type TEXT, content_length INTEGER,
      is_internal INTEGER NOT NULL, is_crawlable INTEGER NOT NULL DEFAULT 1, indexability TEXT,
      indexability_reason TEXT, title TEXT, title_length INTEGER, meta_description TEXT,
      meta_description_length INTEGER, h1 TEXT, h1_count INTEGER DEFAULT 0, canonical TEXT,
      robots_meta TEXT, x_robots_tag TEXT, depth INTEGER NOT NULL, response_time_ms INTEGER,
      word_count INTEGER, content_hash TEXT, discovered_from_url TEXT, fetch_error_code TEXT,
      fetch_error_message TEXT, created_at TEXT NOT NULL, updated_at TEXT NOT NULL,
      FOREIGN KEY(crawl_id) REFERENCES crawls(id) ON DELETE CASCADE, UNIQUE(crawl_id, normalized_url)
    );
    CREATE INDEX IF NOT EXISTS idx_urls_crawl_id ON urls(crawl_id);
    CREATE INDEX IF NOT EXISTS idx_urls_status_code ON urls(crawl_id, status_code);
    CREATE INDEX IF NOT EXISTS idx_urls_indexability ON urls(crawl_id, indexability);
    CREATE INDEX IF NOT EXISTS idx_urls_depth ON urls(crawl_id, depth);
    CREATE INDEX IF NOT EXISTS idx_urls_title ON urls(crawl_id, title);
    CREATE INDEX IF NOT EXISTS idx_urls_content_hash ON urls(crawl_id, content_hash);
    CREATE TABLE IF NOT EXISTS links (
      id TEXT PRIMARY KEY, crawl_id TEXT NOT NULL, source_url_id TEXT, source_url TEXT NOT NULL,
      target_url TEXT NOT NULL, normalized_target_url TEXT NOT NULL, target_url_id TEXT,
      anchor_text TEXT, link_type TEXT NOT NULL CHECK(link_type IN ('html_a','canonical','image','script','css','iframe','other')),
      is_internal INTEGER NOT NULL, is_followed INTEGER NOT NULL DEFAULT 1, rel TEXT,
      discovered_at TEXT NOT NULL, FOREIGN KEY(crawl_id) REFERENCES crawls(id) ON DELETE CASCADE,
      FOREIGN KEY(source_url_id) REFERENCES urls(id) ON DELETE CASCADE
    );
    CREATE INDEX IF NOT EXISTS idx_links_crawl_id ON links(crawl_id);
    CREATE INDEX IF NOT EXISTS idx_links_source ON links(crawl_id, source_url_id);
    CREATE INDEX IF NOT EXISTS idx_links_target ON links(crawl_id, normalized_target_url);
    CREATE INDEX IF NOT EXISTS idx_links_internal ON links(crawl_id, is_internal);
    CREATE TABLE IF NOT EXISTS issues (
      id TEXT PRIMARY KEY, crawl_id TEXT NOT NULL, url_id TEXT, url TEXT NOT NULL,
      issue_type TEXT NOT NULL, severity TEXT NOT NULL CHECK(severity IN ('critical','high','medium','low')),
      message TEXT NOT NULL, recommendation TEXT NOT NULL, created_at TEXT NOT NULL,
      FOREIGN KEY(crawl_id) REFERENCES crawls(id) ON DELETE CASCADE,
      FOREIGN KEY(url_id) REFERENCES urls(id) ON DELETE CASCADE
    );
    CREATE INDEX IF NOT EXISTS idx_issues_crawl_id ON issues(crawl_id);
    CREATE INDEX IF NOT EXISTS idx_issues_type ON issues(crawl_id, issue_type);
    CREATE INDEX IF NOT EXISTS idx_issues_severity ON issues(crawl_id, severity);
    CREATE INDEX IF NOT EXISTS idx_issues_url_id ON issues(crawl_id, url_id);
    CREATE TABLE IF NOT EXISTS robots_rules (
      id TEXT PRIMARY KEY, crawl_id TEXT NOT NULL, host TEXT NOT NULL, robots_url TEXT NOT NULL,
      fetched_status_code INTEGER, body TEXT, parsed_json TEXT, created_at TEXT NOT NULL,
      FOREIGN KEY(crawl_id) REFERENCES crawls(id) ON DELETE CASCADE
    );
    CREATE TABLE IF NOT EXISTS sitemaps (
      id TEXT PRIMARY KEY, crawl_id TEXT NOT NULL, sitemap_url TEXT NOT NULL, status_code INTEGER,
      discovered_from TEXT, url_count INTEGER DEFAULT 0, created_at TEXT NOT NULL,
      FOREIGN KEY(crawl_id) REFERENCES crawls(id) ON DELETE CASCADE
    );
  `);
    markApplied(db, 1);
}
// Version 2: Deep HTML & Content Analysis columns (PRD Phase 1)
function runMigrationV2(db) {
    for (const level of ['h2', 'h3', 'h4', 'h5', 'h6']) {
        addColumn(db, 'urls', `${level}`, 'TEXT');
        addColumn(db, 'urls', `${level}_length`, 'INTEGER DEFAULT 0');
        addColumn(db, 'urls', `${level}_count`, 'INTEGER DEFAULT 0');
    }
    addColumn(db, 'urls', 'image_count', 'INTEGER DEFAULT 0');
    addColumn(db, 'urls', 'images_missing_alt_attr', 'INTEGER DEFAULT 0');
    addColumn(db, 'urls', 'images_with_alt_json', 'TEXT');
    addColumn(db, 'urls', 'social_meta_json', 'TEXT');
    addColumn(db, 'urls', 'has_og_tags', 'INTEGER DEFAULT 0');
    addColumn(db, 'urls', 'has_twitter_card', 'INTEGER DEFAULT 0');
    addColumn(db, 'urls', 'response_headers_json', 'TEXT');
    markApplied(db, 2);
}
// Version 3: Link Graph & Structural Analysis columns (PRD Phase 2)
function runMigrationV3(db) {
    addColumn(db, 'urls', 'inlink_count', 'INTEGER DEFAULT 0');
    addColumn(db, 'urls', 'outlink_count', 'INTEGER DEFAULT 0');
    addColumn(db, 'links', 'normalized_anchor_text', 'TEXT');
    addColumn(db, 'urls', 'rel_next_url', 'TEXT');
    addColumn(db, 'urls', 'rel_prev_url', 'TEXT');
    addColumn(db, 'urls', 'pagination_position', 'INTEGER');
    try {
        db.exec(`
      CREATE INDEX IF NOT EXISTS idx_links_normalized_target ON links(crawl_id, normalized_target_url);
      CREATE INDEX IF NOT EXISTS idx_links_anchor_text ON links(crawl_id, anchor_text(50));
    `);
    }
    catch { }
    markApplied(db, 3);
}
// Version 4: Hreflang & Structured Data columns (PRD Phase 3)
function runMigrationV4(db) {
    addColumn(db, 'urls', 'hreflangs_json', 'TEXT');
    addColumn(db, 'urls', 'has_hreflangs', 'INTEGER DEFAULT 0');
    addColumn(db, 'urls', 'json_ld_types_json', 'TEXT');
    markApplied(db, 4);
}
// Version 5: Sitemap Deep Integration columns (PRD Phase 4)
function runMigrationV5(db) {
    addColumn(db, 'sitemaps', 'is_index', 'INTEGER DEFAULT 0');
    addColumn(db, 'sitemaps', 'parent_sitemap_url', 'TEXT');
    addColumn(db, 'sitemaps', 'entries_json', 'TEXT');
    markApplied(db, 5);
}
// Version 6: Pagination audit columns (PRD Phase 2 Feature 2.4)
function runMigrationV6(db) {
    addColumn(db, 'urls', 'pagination_next', 'TEXT');
    addColumn(db, 'urls', 'pagination_prev', 'TEXT');
    addColumn(db, 'urls', 'is_paginated', 'INTEGER DEFAULT 0');
    markApplied(db, 6);
}
// Version 7: JS Rendering + Carbon Footprint columns (PRD Phase 5-6)
function runMigrationV7(db) {
    addColumn(db, 'urls', 'rendered_title', 'TEXT');
    addColumn(db, 'urls', 'rendered_word_count', 'INTEGER');
    addColumn(db, 'urls', 'js_redirect_url', 'TEXT');
    addColumn(db, 'urls', 'noindex_in_rendered', 'INTEGER DEFAULT 0');
    addColumn(db, 'urls', 'hidden_text_ratio', 'REAL');
    addColumn(db, 'urls', 'rendered_links_json', 'TEXT');
    addColumn(db, 'urls', 'bg_images_json', 'TEXT');
    addColumn(db, 'urls', 'carbon_bytes_transferred', 'INTEGER DEFAULT 0');
    addColumn(db, 'urls', 'carbon_co2_grams', 'REAL DEFAULT 0');
    addColumn(db, 'urls', 'carbon_rating', 'TEXT DEFAULT "green" CHECK(carbon_rating IN ("green","yellow","red"))');
    markApplied(db, 7);
}
// Version 8: Custom Extractions + Crawl Scheduling tables (PRD Phase 7)
function runMigrationV8(db) {
    db.exec(`
    CREATE TABLE IF NOT EXISTS extraction_rules (
      id TEXT PRIMARY KEY, crawl_id TEXT NOT NULL, name TEXT NOT NULL, selector TEXT NOT NULL,
      rule_type TEXT NOT NULL CHECK(rule_type IN ('css','xpath','regex')), attribute TEXT,
      active INTEGER NOT NULL DEFAULT 1, created_at TEXT NOT NULL,
      FOREIGN KEY(crawl_id) REFERENCES crawls(id) ON DELETE CASCADE
    );
    CREATE INDEX IF NOT EXISTS idx_extraction_rules_crawl_id ON extraction_rules(crawl_id);
    CREATE TABLE IF NOT EXISTS extraction_results (
      id TEXT PRIMARY KEY, rule_id TEXT NOT NULL, url TEXT NOT NULL, matches_json TEXT NOT NULL,
      created_at TEXT NOT NULL, FOREIGN KEY(rule_id) REFERENCES extraction_rules(id) ON DELETE CASCADE
    );
    CREATE INDEX IF NOT EXISTS idx_extraction_results_rule_id ON extraction_results(rule_id);
    CREATE TABLE IF NOT EXISTS crawl_schedules (
      id TEXT PRIMARY KEY, project_id TEXT NOT NULL, start_url TEXT NOT NULL,
      crawl_settings_json TEXT NOT NULL, cron_expression TEXT NOT NULL, enabled INTEGER NOT NULL DEFAULT 1,
      last_run_at TEXT, next_run_at TEXT, created_at TEXT NOT NULL, updated_at TEXT NOT NULL,
      FOREIGN KEY(project_id) REFERENCES projects(id) ON DELETE CASCADE
    );
    CREATE INDEX IF NOT EXISTS idx_crawl_schedules_project_id ON crawl_schedules(project_id);
    CREATE TABLE IF NOT EXISTS crawl_diffs (
      id TEXT PRIMARY KEY, current_crawl_id TEXT NOT NULL, previous_crawl_id TEXT NOT NULL,
      url_count_delta INTEGER NOT NULL DEFAULT 0, new_urls_count INTEGER NOT NULL DEFAULT 0,
      removed_urls_count INTEGER NOT NULL DEFAULT 0, broken_links_delta INTEGER NOT NULL DEFAULT 0,
      issues_delta INTEGER NOT NULL DEFAULT 0, critical_issues_delta INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL
    );
  `);
    markApplied(db, 8);
}
// Version 9: PageSpeed Insights / Core Web Vitals results table (PRD Phase 6 Feature 6.1)
function runMigrationV9(db) {
    db.exec(`
    CREATE TABLE IF NOT EXISTS psi_results (
      id TEXT PRIMARY KEY, crawl_id TEXT NOT NULL, url_id TEXT, url TEXT NOT NULL,
      strategy TEXT CHECK(strategy IN ('mobile','desktop')), performance_score INTEGER,
      accessibility_score INTEGER, best_practices_score INTEGER, seo_score INTEGER,
      lcp_ms INTEGER, fid_ms INTEGER, cls REAL, fcp_ms INTEGER, ttfb_ms INTEGER,
      speed_index INTEGER, fetched_at TEXT NOT NULL,
      FOREIGN KEY(crawl_id) REFERENCES crawls(id) ON DELETE CASCADE,
      FOREIGN KEY(url_id) REFERENCES urls(id) ON DELETE CASCADE
    );
    CREATE INDEX IF NOT EXISTS idx_psi_crawl ON psi_results(crawl_id);
    CREATE INDEX IF NOT EXISTS idx_psi_url ON psi_results(crawl_id, url_id);
  `);
    markApplied(db, 9);
}
//# sourceMappingURL=database-new.js.map