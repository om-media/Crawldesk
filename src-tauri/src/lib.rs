mod commands;
mod core;

use core::events::CrawlManager;
use tauri::Manager;
use tracing::info;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tracing_subscriber::fmt()
        .with_env_filter(
            tracing_subscriber::EnvFilter::try_from_default_env()
                .unwrap_or_else(|_| "crawldesk=debug,info".into()),
        )
        .init();

    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_clipboard_manager::init())
        .manage(CrawlManager::new())
        .setup(|app| {
            // Initialize database on first launch
            let db_path = app.path().app_data_dir()?.join("crawldesk.sqlite");
            info!("Database path: {:?}", db_path);

            // Create parent directory if needed
            if let Some(parent) = db_path.parent() {
                std::fs::create_dir_all(parent)?;
            }

            // Initialize the database (creates tables if not exists)
            core::storage::db::init_db(&db_path)?;

            info!("Database initialized at {:?}", db_path);
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            // Project commands
            commands::project::create_project,
            commands::project::update_project,
            commands::project::delete_project,
            commands::project::get_projects,
            commands::project::get_project,
            commands::project::get_project_summary,
            // Crawl commands
            commands::crawl::start_crawl,
            commands::crawl::pause_crawl,
            commands::crawl::resume_crawl,
            commands::crawl::stop_crawl,
            commands::crawl::get_crawl_progress,
            commands::crawl::clear_crawl,
            commands::crawl::list_crawls,
            // URL commands
            commands::url::query_urls,
            commands::url::get_url_details,
            commands::url::summarize_urls,
            // Keyword analysis commands
            commands::keyword::analyze_keywords,
            // Content clustering commands
            commands::cluster::find_clusters,
            // Issue commands
            commands::issue::get_issue_summary,
            commands::issue::query_issues,
            commands::issue::get_issue_details,
            commands::issue::get_issue_definitions,
            commands::issue::run_post_crawl,
            // Link commands
            commands::link::query_links,
            commands::link::summarize_links,
            // Export commands
            commands::export::export_urls_csv,
            commands::export::export_issues_csv,
            commands::export::export_links_csv,
            // Settings commands
            commands::settings::get_settings,
            commands::settings::update_settings,
            // App commands
            commands::app::get_version,
            commands::app::get_data_path,
            commands::app::open_external_url,
        ])
        .run(tauri::generate_context!())
        .expect("error while running Tauri application");
}
