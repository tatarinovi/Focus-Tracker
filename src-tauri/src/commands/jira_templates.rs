use std::fs;
use std::path::PathBuf;
use tauri::AppHandle;
use tauri::Manager;

fn templates_path(app: &AppHandle) -> PathBuf {
    app.path()
        .app_data_dir()
        .expect("failed to resolve app data dir")
        .join("jira-templates.json")
}

fn ensure_parent_dir(path: &PathBuf) -> Result<(), String> {
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    }
    Ok(())
}

#[tauri::command]
pub async fn load_jira_templates(app: AppHandle) -> Result<Vec<serde_json::Value>, String> {
    let path = templates_path(&app);
    if path.exists() {
        if let Ok(content) = fs::read_to_string(&path) {
            if let Ok(templates) = serde_json::from_str::<Vec<serde_json::Value>>(&content) {
                return Ok(templates);
            }
        }
    }
    Ok(vec![])
}

#[tauri::command]
pub async fn save_jira_template(
    app: AppHandle,
    template: serde_json::Value,
) -> Result<bool, String> {
    let path = templates_path(&app);
    let mut templates = if path.exists() {
        fs::read_to_string(&path)
            .ok()
            .and_then(|c| serde_json::from_str::<Vec<serde_json::Value>>(&c).ok())
            .unwrap_or_default()
    } else {
        vec![]
    };

    let name = template.get("name").and_then(|v| v.as_str()).unwrap_or("");
    let idx = templates
        .iter()
        .position(|t| t.get("name").and_then(|v| v.as_str()) == Some(name));

    if let Some(i) = idx {
        templates[i] = template;
    } else {
        templates.push(template);
    }

    let json = serde_json::to_string_pretty(&templates).map_err(|e| e.to_string())?;
    ensure_parent_dir(&path)?;
    fs::write(path, json).map_err(|e| e.to_string())?;
    Ok(true)
}

#[tauri::command]
pub async fn delete_jira_template(app: AppHandle, name: String) -> Result<bool, String> {
    let path = templates_path(&app);
    if !path.exists() {
        return Ok(true);
    }

    let mut templates: Vec<serde_json::Value> = fs::read_to_string(&path)
        .ok()
        .and_then(|c| serde_json::from_str(&c).ok())
        .unwrap_or_default();

    templates.retain(|t| t.get("name").and_then(|v| v.as_str()) != Some(&name));

    let json = serde_json::to_string_pretty(&templates).map_err(|e| e.to_string())?;
    ensure_parent_dir(&path)?;
    fs::write(path, json).map_err(|e| e.to_string())?;
    Ok(true)
}
