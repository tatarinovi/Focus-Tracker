use std::fs;
use std::path::PathBuf;
use tauri::AppHandle;
use tauri::Manager;

fn data_dir(app: &AppHandle) -> PathBuf {
    app.path()
        .app_data_dir()
        .expect("failed to resolve app data dir")
}

fn config_path(app: &AppHandle) -> PathBuf {
    data_dir(app).join("config.json")
}

pub fn load_config(app: &AppHandle) -> serde_json::Value {
    let path = config_path(app);
    if path.exists() {
        if let Ok(content) = fs::read_to_string(&path) {
            if let Ok(config) = serde_json::from_str::<serde_json::Value>(&content) {
                return config;
            }
        }
    }
    serde_json::json!({
        "username": "User",
        "update_channel": "stable",
        "storage_schema_version": 1
    })
}

pub fn save_config_to_disk(app: &AppHandle, config: &serde_json::Value) -> Result<(), String> {
    let path = config_path(app);
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    }
    let json = serde_json::to_string_pretty(config).map_err(|e| e.to_string())?;
    fs::write(path, json).map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn load_config_cmd(app: AppHandle) -> Result<serde_json::Value, String> {
    let mut config = load_config(&app);
    if let Some(obj) = config.as_object_mut() {
        obj.insert(
            "jira_url".to_string(),
            serde_json::Value::String(
                std::env::var("JIRA_URL").unwrap_or_else(|_| "https://itpm.mos.ru/".to_string()),
            ),
        );
        obj.insert(
            "jira_project".to_string(),
            serde_json::Value::String(
                std::env::var("JIRA_DEFAULT_PROJECT").unwrap_or_else(|_| "RUSSPASS".to_string()),
            ),
        );
    }
    Ok(config)
}

#[tauri::command]
pub async fn save_config_cmd(app: AppHandle, config: serde_json::Value) -> Result<bool, String> {
    let current = load_config(&app);
    let mut merged = config;
    // Protect encrypted passwords from being overwritten
    if let Some(pass) = current.get("caldav_pass") {
        if let Some(obj) = merged.as_object_mut() {
            obj.insert("caldav_pass".to_string(), pass.clone());
        }
    }
    if let Some(user) = current.get("caldav_user") {
        let has_user = merged
            .get("caldav_user")
            .map(|v| v.is_string() && !v.as_str().unwrap_or("").is_empty())
            .unwrap_or(false);
        if let Some(obj) = merged.as_object_mut() {
            if !has_user {
                obj.insert("caldav_user".to_string(), user.clone());
            }
        }
    }
    if let Some(pass) = current.get("jira_pass") {
        if let Some(obj) = merged.as_object_mut() {
            obj.insert("jira_pass".to_string(), pass.clone());
        }
    }
    save_config_to_disk(&app, &merged)?;
    Ok(true)
}

#[tauri::command]
pub async fn load_window_state(app: AppHandle) -> Result<serde_json::Value, String> {
    let config = load_config(&app);
    Ok(config
        .get("window_state")
        .cloned()
        .unwrap_or(serde_json::json!({})))
}

#[tauri::command]
pub async fn save_window_state(
    app: AppHandle,
    next_state: serde_json::Value,
) -> Result<bool, String> {
    let mut config = load_config(&app);
    let current_ws = config
        .get("window_state")
        .cloned()
        .unwrap_or(serde_json::json!({}));
    let mut merged = current_ws;
    if let (Some(curr_obj), Some(new_obj)) = (merged.as_object_mut(), next_state.as_object()) {
        for (k, v) in new_obj {
            curr_obj.insert(k.clone(), v.clone());
        }
    }
    if let Some(obj) = config.as_object_mut() {
        obj.insert("window_state".to_string(), merged);
    }
    save_config_to_disk(&app, &config)?;
    Ok(true)
}
