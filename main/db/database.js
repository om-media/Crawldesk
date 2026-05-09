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
function runMigrations(db) {
    // Create migrations tracking table
    db.exec(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      version INTEGER PRIMARY KEY,
      applied_at TEXT NOT NULL
    )
  `);
    const currentVersion = db.prepare('SELECT MAX(version) as v FROM schema_migrations').get();
    const version = (currentVersion?.v ?? 0) + 1;
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
    `);
        const existing = db.prepare('SELECT version FROM schema_migrations WHERE version = ?').get(1);
        if (!existing) {
            db.prepare("INSERT INTO schema_migrations (version, applied_at) VALUES (?, datetime('now'))").run(1);
        }
    }
}
//# sourceMappingURL=database.js.map