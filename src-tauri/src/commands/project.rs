//! Project commands — CRUD for crawl projects.

use crate::core::storage::{db, models, queries};
use chrono::Utc;
use tracing::info;

#[tauri::command]
pub fn create_project(name: String, root_url: String) -> Result<models::Project, String> {
    let conn = db::get_connection().map_err(|e| e.to_string())?;

    let project = queries::create_project(&conn, &name, &root_url).map_err(|e| e.to_string())?;
    info!("Created project: {} ({})", name, root_url);

    Ok(project)
}

#[tauri::command]
pub fn get_projects() -> Result<Vec<models::Project>, String> {
    let conn = db::get_connection().map_err(|e| e.to_string())?;
    let projects = queries::get_projects(&conn).map_err(|e| e.to_string())?;
    Ok(projects)
}

#[tauri::command]
pub fn get_project(id: i64) -> Result<Option<models::Project>, String> {
    let conn = db::get_connection().map_err(|e| e.to_string())?;
    let project = queries::get_project(&conn, id).map_err(|e| e.to_string())?;
    Ok(project)
}

#[tauri::command]
pub fn get_project_summary(id: i64) -> Result<models::ProjectSummary, String> {
    let conn = db::get_connection().map_err(|e| e.to_string())?;
    let summary = queries::get_project_summary(&conn, id).map_err(|e| e.to_string())?;
    Ok(summary)
}

#[tauri::command]
pub fn update_project(
    id: i64,
    name: Option<String>,
    root_url: Option<String>,
) -> Result<models::Project, String> {
    let conn = db::get_connection().map_err(|e| e.to_string())?;

    // Get existing project
    let mut project = queries::get_project(&conn, id)
        .map_err(|e| e.to_string())?
        .ok_or_else(|| "Project not found".to_string())?;

    if let Some(n) = name {
        project.name = n;
    }
    if let Some(u) = root_url {
        project.root_url = u;
    }

    // Update in DB
    let now = Utc::now().to_rfc3339();
    conn.execute(
        "UPDATE projects SET name = ?1, root_url = ?2, updated_at = ?3 WHERE id = ?4",
        rusqlite::params![project.name, project.root_url, now, id],
    )
    .map_err(|e| e.to_string())?;

    Ok(project)
}

#[tauri::command]
pub fn delete_project(id: i64) -> Result<(), String> {
    let conn = db::get_connection().map_err(|e| e.to_string())?;
    conn.execute("DELETE FROM projects WHERE id = ?1", [id])
        .map_err(|e| e.to_string())?;
    info!("Deleted project: {}", id);
    Ok(())
}
