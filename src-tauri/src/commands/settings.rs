//! Settings commands — app configuration with JSON file persistence.

use crate::core::config::AppConfig;
use serde_json;
use std::fs;
use std::path::PathBuf;
use tauri::{AppHandle, Manager};
use tracing::{info, warn};

const SETTINGS_FILENAME: &str = "settings.json";

/// Get the settings file path from the app data directory.
fn get_settings_path(app: &AppHandle) -> Result<PathBuf, String> {
    let settings_dir = app
        .path()
        .app_data_dir()
        .map_err(|e| format!("Failed to get app data dir: {}", e))?
        .join("crawldesk");

    fs::create_dir_all(&settings_dir)
        .map_err(|e| format!("Failed to create settings dir: {}", e))?;

    Ok(settings_dir.join(SETTINGS_FILENAME))
}

/// Load settings from JSON file, falling back to defaults.
fn load_settings_from_file(path: &PathBuf) -> AppConfig {
    if let Ok(contents) = fs::read_to_string(path) {
        match serde_json::from_str::<AppConfig>(&contents) {
            Ok(config) => {
                info!("Loaded settings from {}", path.display());
                return config;
            }
            Err(e) => {
                warn!("Failed to parse settings file {}: {}", path.display(), e);
            }
        }
    }

    // Fall back to defaults
    AppConfig::default()
}

/// Persist settings to JSON file.
fn save_settings_to_file(path: &PathBuf, config: &AppConfig) -> Result<(), String> {
    let json = serde_json::to_string_pretty(config)
        .map_err(|e| format!("Failed to serialize settings: {}", e))?;

    fs::write(path, json).map_err(|e| format!("Failed to write settings file: {}", e))?;

    info!("Saved settings to {}", path.display());
    Ok(())
}

#[tauri::command]
pub fn get_settings(app: AppHandle) -> Result<AppConfig, String> {
    let settings_path = get_settings_path(&app)?;
    let config = load_settings_from_file(&settings_path);
    Ok(config)
}

#[tauri::command]
pub fn update_settings(app: AppHandle, settings: AppConfig) -> Result<AppConfig, String> {
    let settings_path = get_settings_path(&app)?;

    // Persist to file
    save_settings_to_file(&settings_path, &settings)?;

    info!("Settings updated and persisted");
    Ok(settings)
}
