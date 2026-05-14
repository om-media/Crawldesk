//! SQLite database initialization, schema, and migrations.
//! Uses rusqlite for synchronous writes (simpler batch support).
//! Configures PRAGMAs per PRD §9.2: WAL mode, synchronous=NORMAL, mmap_size=256MB.

use rusqlite::{Connection, Result};
use std::path::Path;
use std::sync::{Mutex, OnceLock};
use tracing::info;

/// Shared database connection (single instance for the app).
pub static DB_CONNECTION: OnceLock<Mutex<Connection>> = OnceLock::new();

/// Database path stored during initialization for opening additional connections.
static DB_PATH: OnceLock<String> = OnceLock::new();

/// Get a connection handle for use with queries.
/// Opens a new Connection from the same database path (SQLite allows concurrent reads).
pub fn get_connection() -> Result<Connection, String> {
    let path = DB_PATH
        .get()
        .ok_or_else(|| "Database not initialized".to_string())?;
    Connection::open(path.as_str()).map_err(|e| format!("Failed to open connection: {}", e))
}

/// Get the database file path. Panics if DB has not been initialized.
pub fn db_path() -> &'static str {
    DB_PATH
        .get()
        .expect("Database not initialized — call init_db first")
}

/// Initialize the database: open/create connection, set PRAGMAs, run migrations.
pub fn init_db(db_path: &Path) -> Result<(), String> {
    let path_str = db_path.to_string_lossy().to_string();

    let conn =
        Connection::open(&path_str).map_err(|e| format!("Failed to open database: {}", e))?;

    // Store the path for opening additional connections
    DB_PATH
        .set(path_str.clone())
        .map_err(|_| "Database path already set".to_string())?;

    // Configure PRAGMAs per PRD §9.2
    configure_pragmas(&conn).map_err(|e| format!("Failed to set PRAGMAs: {}", e))?;

    // Run migrations
    run_migrations(&conn).map_err(|e| format!("Migration failed: {}", e))?;

    // Store the connection globally wrapped in Mutex for thread safety
    DB_CONNECTION
        .set(Mutex::new(conn))
        .map_err(|_| "Database connection already initialized".to_string())?;

    info!("Database initialized at {:?}", db_path);
    Ok(())
}

/// Set database PRAGMAs for optimal crawl performance.
fn configure_pragmas(conn: &Connection) -> Result<()> {
    conn.execute_batch(
        "
        -- Write-Ahead Logging for concurrent read/write
        PRAGMA journal_mode = WAL;
        
        -- NORMAL is sufficient for our use case (faster than FULL)
        PRAGMA synchronous = NORMAL;
        
        -- 256MB memory map for fast I/O
        PRAGMA mmap_size = 268435456;
        
        -- -200000 = 200MB page cache (per connection)
        PRAGMA cache_size = -200000;
        
        -- Increase busy timeout to 30 seconds
        PRAGMA busy_timeout = 30000;
        
        -- Enable foreign keys
        PRAGMA foreign_keys = ON;
        ",
    )?;

    Ok(())
}

/// Run schema migrations (create tables if they don't exist).
fn run_migrations(conn: &Connection) -> Result<()> {
    // Create migration tracking table
    conn.execute(
        "CREATE TABLE IF NOT EXISTS schema_migrations (
            version INTEGER PRIMARY KEY,
            applied_at TEXT NOT NULL DEFAULT (datetime('now'))
        )",
        [],
    )?;

    let current_version = conn.query_row(
        "SELECT COALESCE(MAX(version), 0) FROM schema_migrations",
        [],
        |row| row.get::<_, i32>(0),
    )?;

    if current_version < 1 {
        create_initial_schema(conn)?;
        conn.execute(
            "INSERT OR IGNORE INTO schema_migrations (version) VALUES (1)",
            [],
        )?;
    }

    if current_version < 2 {
        create_v2_schema(conn)?;
        conn.execute(
            "INSERT OR IGNORE INTO schema_migrations (version) VALUES (2)",
            [],
        )?;
    }

    if current_version < 3 {
        create_v3_schema(conn)?;
        conn.execute(
            "INSERT OR IGNORE INTO schema_migrations (version) VALUES (3)",
            [],
        )?;
    }

    Ok(())
}

/// Create initial schema (v1).
fn create_initial_schema(conn: &Connection) -> Result<()> {
    conn.execute_batch(
        "
        -- Projects table
        CREATE TABLE IF NOT EXISTS projects (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL,
            root_url TEXT NOT NULL,
            created_at TEXT NOT NULL DEFAULT (datetime('now')),
            updated_at TEXT NOT NULL DEFAULT (datetime('now'))
        );
        
        -- Crawls table
        CREATE TABLE IF NOT EXISTS crawls (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            project_id INTEGER NOT NULL,
            status TEXT NOT NULL DEFAULT 'created',
            settings_json TEXT,
            started_at TEXT,
            completed_at TEXT,
            error_message TEXT,
            url_count INTEGER NOT NULL DEFAULT 0,
            issue_count INTEGER NOT NULL DEFAULT 0,
            link_count INTEGER NOT NULL DEFAULT 0,
            created_at TEXT NOT NULL DEFAULT (datetime('now')),
            FOREIGN KEY (project_id) REFERENCES projects(id)
        );
        
        -- Crawl settings table
        CREATE TABLE IF NOT EXISTS crawl_settings (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            crawl_id INTEGER NOT NULL UNIQUE,
            max_urls INTEGER NOT NULL DEFAULT 1000,
            max_depth INTEGER NOT NULL DEFAULT 10,
            concurrency INTEGER NOT NULL DEFAULT 5,
            delay_between_requests_ms INTEGER NOT NULL DEFAULT 500,
            user_agent TEXT NOT NULL DEFAULT 'CrawlDesk SEO Crawler',
            accept_language TEXT NOT NULL DEFAULT 'en-US,en;q=0.9',
            max_response_size_kb INTEGER NOT NULL DEFAULT 5120,
            timeout_seconds INTEGER NOT NULL DEFAULT 30,
            follow_redirects INTEGER NOT NULL DEFAULT 1,
            max_redirects INTEGER NOT NULL DEFAULT 5,
            respect_robots_txt INTEGER NOT NULL DEFAULT 1,
            respect_sitemaps INTEGER NOT NULL DEFAULT 1,
            include_patterns TEXT,
            exclude_patterns TEXT,
            allowed_hostnames TEXT,
            blocked_hostnames TEXT,
            max_url_length INTEGER NOT NULL DEFAULT 2048,
            disable_private_ip_access INTEGER NOT NULL DEFAULT 1,
            enable_js_rendering INTEGER NOT NULL DEFAULT 0,
            custom_headers TEXT,
            FOREIGN KEY (crawl_id) REFERENCES crawls(id) ON DELETE CASCADE
        );
        
        -- URLs table
        CREATE TABLE IF NOT EXISTS urls (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            url TEXT NOT NULL,
            project_id INTEGER NOT NULL,
            crawl_id INTEGER,
            normalized_url TEXT,
            final_url TEXT,
            status_code INTEGER,
            content_type TEXT,
            title TEXT,
            title_length INTEGER,
            meta_description TEXT,
            meta_description_length INTEGER,
            h1 TEXT,
            h1_count INTEGER DEFAULT 0,
            word_count INTEGER,
            canonical_url TEXT,
            meta_robots TEXT,
            x_robots_tag TEXT,
            response_time_ms REAL,
            size_bytes INTEGER,
            language TEXT,
            inlinks_count INTEGER DEFAULT 0,
            outlinks_count INTEGER DEFAULT 0,
            content_hash TEXT,
            crawl_source TEXT DEFAULT 'spider',
            fetch_result_json TEXT,
            seo_data_json TEXT,
            indexability TEXT NOT NULL DEFAULT 'unknown',
            depth INTEGER NOT NULL DEFAULT 0,
            discovered_at TEXT,
            fetched_at TEXT,
            last_crawled_at TEXT,
            FOREIGN KEY (project_id) REFERENCES projects(id),
            FOREIGN KEY (crawl_id) REFERENCES crawls(id) ON DELETE SET NULL,
            UNIQUE(crawl_id, url)
        );
        
        -- Links table
        CREATE TABLE IF NOT EXISTS links (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            source_url_id INTEGER NOT NULL,
            source_url TEXT NOT NULL,
            target_url TEXT NOT NULL,
            link_relation TEXT NOT NULL DEFAULT 'html_a',
            anchor_text TEXT,
            is_internal INTEGER NOT NULL DEFAULT 1,
            is_no_follow INTEGER NOT NULL DEFAULT 0,
            detected_at TEXT NOT NULL DEFAULT (datetime('now')),
            FOREIGN KEY (source_url_id) REFERENCES urls(id) ON DELETE CASCADE
        );
        
        -- Issues table
        CREATE TABLE IF NOT EXISTS issues (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            issue_type TEXT NOT NULL,
            severity TEXT NOT NULL,
            category TEXT NOT NULL,
            url_id INTEGER,
            url TEXT NOT NULL,
            message TEXT NOT NULL,
            details_json TEXT,
            detected_at TEXT NOT NULL DEFAULT (datetime('now')),
            is_fixed INTEGER NOT NULL DEFAULT 0,
            FOREIGN KEY (url_id) REFERENCES urls(id) ON DELETE SET NULL
        );
        
        -- Robots rules table
        CREATE TABLE IF NOT EXISTS robots_rules (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            project_id INTEGER NOT NULL,
            hostname TEXT NOT NULL,
            path_pattern TEXT NOT NULL,
            allow INTEGER NOT NULL DEFAULT 1,
            user_agent TEXT NOT NULL DEFAULT '*',
            FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE
        );
        
        -- Sitemaps table
        CREATE TABLE IF NOT EXISTS sitemaps (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            project_id INTEGER NOT NULL,
            url TEXT NOT NULL,
            sitemap_type TEXT NOT NULL DEFAULT 'xml',
            parsed_at TEXT NOT NULL DEFAULT (datetime('now')),
            FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE
        );
        
        -- Indexes for performance (minimal during crawl)
        CREATE INDEX IF NOT EXISTS idx_urls_project ON urls(project_id);
        CREATE INDEX IF NOT EXISTS idx_urls_crawl ON urls(crawl_id);
        CREATE INDEX IF NOT EXISTS idx_issues_url ON issues(url_id);
        CREATE INDEX IF NOT EXISTS idx_links_source ON links(source_url_id);
        ",
    )?;

    Ok(())
}

/// Create v2 schema additions (48 new columns + new tables).
fn create_v2_schema(conn: &Connection) -> Result<()> {
    // Add 48 new columns to urls table
    let url_columns = [
        // Hreflang
        ("hreflang_alternates", "TEXT DEFAULT '[]'"),
        // Headings h2-h6 (JSON arrays)
        ("headings_h2", "TEXT DEFAULT '[]'"),
        ("headings_h3", "TEXT DEFAULT '[]'"),
        ("headings_h4", "TEXT DEFAULT '[]'"),
        ("headings_h5", "TEXT DEFAULT '[]'"),
        ("headings_h6", "TEXT DEFAULT '[]'"),
        // Image alt audit
        ("image_count", "INTEGER NOT NULL DEFAULT 0"),
        ("images_without_alt", "INTEGER NOT NULL DEFAULT 0"),
        ("images_with_alt", "INTEGER NOT NULL DEFAULT 0"),
        ("total_image_size_kb", "REAL NOT NULL DEFAULT 0"),
        // Social meta (JSON)
        ("social_meta_open_graph", "TEXT DEFAULT '{}'"),
        ("social_meta_twitter_card", "TEXT DEFAULT '{}'"),
        // Structured data flags
        ("structured_data_json", "TEXT DEFAULT '[]'"),
        ("has_schema_org", "INTEGER NOT NULL DEFAULT 0"),
        // Hreflang self-referencing canonical
        ("self_referencing_canonical", "INTEGER NOT NULL DEFAULT 1"),
        // Redirect chain (JSON array)
        ("redirect_chain", "TEXT DEFAULT '[]'"),
        // JS rendering comparison
        ("js_rendered_html", "TEXT"),
        // Carbon estimation
        ("carbon_footprint_grams", "REAL"),
        // Link graph counts
        ("internal_link_count", "INTEGER NOT NULL DEFAULT 0"),
        ("external_link_count", "INTEGER NOT NULL DEFAULT 0"),
        ("broken_links", "INTEGER NOT NULL DEFAULT 0"),
        // Pagination
        ("pagination_next", "TEXT"),
        ("pagination_prev", "TEXT"),
        ("is_paged", "INTEGER NOT NULL DEFAULT 0"),
        // Anchor text analysis
        ("anchor_text_distribution", "TEXT DEFAULT '{}'"),
        // Content hash
        ("content_hash", "TEXT"),
        // Extraction results (JSON array)
        ("extraction_results", "TEXT DEFAULT '[]'"),
        // Keyword density (JSON object)
        ("keyword_density", "TEXT DEFAULT '{}'"),
        // Extractable text
        ("extractable_text", "TEXT"),
    ];

    for (col_name, col_def) in url_columns {
        conn.execute(
            &format!("ALTER TABLE urls ADD COLUMN {} {}", col_name, col_def),
            [],
        )
        .ok(); // Ignore error if column already exists
    }

    // Create crawl_diffs table
    conn.execute(
        "CREATE TABLE IF NOT EXISTS crawl_diffs (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            project_id INTEGER NOT NULL,
            crawl_a_id INTEGER NOT NULL,
            crawl_b_id INTEGER NOT NULL,
            urls_added INTEGER NOT NULL DEFAULT 0,
            urls_removed INTEGER NOT NULL DEFAULT 0,
            urls_changed INTEGER NOT NULL DEFAULT 0,
            urls_unchanged INTEGER NOT NULL DEFAULT 0,
            generated_at TEXT NOT NULL DEFAULT (datetime('now')),
            FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE
        )",
        [],
    )?;

    // Create psi_results table
    conn.execute(
        "CREATE TABLE IF NOT EXISTS psi_results (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            url_id INTEGER,
            url TEXT NOT NULL,
            psi_config_json TEXT,
            performance_score REAL,
            accessibility_score REAL,
            best_practices_score REAL,
            seo_score REAL,
            lcp_ms REAL,
            fid_ms REAL,
            cls REAL,
            fetched_at TEXT NOT NULL DEFAULT (datetime('now')),
            FOREIGN KEY (url_id) REFERENCES urls(id) ON DELETE SET NULL
        )",
        [],
    )?;

    // Add v2 indexes (heavier post-crawl)
    conn.execute(
        "CREATE INDEX IF NOT EXISTS idx_urls_indexability ON urls(indexability);
         CREATE INDEX IF NOT EXISTS idx_issues_type_severity ON issues(issue_type, severity);
         CREATE INDEX IF NOT EXISTS idx_urls_content_hash ON urls(content_hash);
         CREATE INDEX IF NOT EXISTS idx_crawl_diffs_project ON crawl_diffs(project_id);
         CREATE INDEX IF NOT EXISTS idx_psi_results_url ON psi_results(url_id);",
        [],
    )?;

    Ok(())
}

/// Create v3 schema additions (links table alignment with PRD spec).
fn create_v3_schema(conn: &Connection) -> Result<()> {
    // Add missing columns to links table to match PRD spec
    let link_columns = [
        // crawl_id for faster cascade deletes
        ("crawl_id", "INTEGER"),
        // Normalized target URL (for FK lookups)
        ("target_normalized_url", "TEXT"),
        // target_url_id FK to urls table (for resolving link targets)
        ("target_url_id", "INTEGER"),
        // link_type matches PRD (was 'link_relation')
        ("link_type", "TEXT DEFAULT 'html_a'"),
        // is_followed (inverse of is_no_follow, per PRD)
        ("is_followed", "INTEGER NOT NULL DEFAULT 1"),
        // Source element (a, img, link, script)
        ("source_element", "TEXT"),
        // Source attribute (href, src)
        ("source_attribute", "TEXT"),
        // Status code of the target URL (populated post-crawl)
        ("status_code", "INTEGER"),
    ];

    for (col_name, col_def) in link_columns {
        conn.execute(
            &format!("ALTER TABLE links ADD COLUMN {} {}", col_name, col_def),
            [],
        )
        .ok(); // Ignore error if column already exists
    }

    // Add indexes for links table performance
    conn.execute(
        "CREATE INDEX IF NOT EXISTS idx_links_crawl ON links(crawl_id);
         CREATE INDEX IF NOT EXISTS idx_links_target ON links(target_url);
         CREATE INDEX IF NOT EXISTS idx_links_type ON links(link_type);
         CREATE INDEX IF NOT EXISTS idx_issues_crawl ON issues(url, crawl_id);
         CREATE INDEX IF NOT EXISTS idx_urls_status_code ON urls(crawl_id, status_code);
         CREATE INDEX IF NOT EXISTS idx_urls_title ON urls(crawl_id, title);
         CREATE INDEX IF NOT EXISTS idx_urls_canonical ON urls(crawl_id, canonical_url);",
        [],
    )?;

    Ok(())
}

/// Crate-internal test helper: run migrations on an arbitrary connection
/// (including in-memory). Allows unit tests within this crate to use the
/// production schema without duplicating SQL.
#[cfg(test)]
pub fn test_run_migrations(conn: &Connection) -> Result<(), String> {
    run_migrations(conn).map_err(|e| e.to_string())
}
