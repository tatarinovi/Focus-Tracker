use std::fs;
use std::path::PathBuf;
use tauri::AppHandle;
use tauri::Manager;

fn data_dir(app: &AppHandle) -> PathBuf {
    app.path()
        .app_data_dir()
        .expect("failed to resolve app data dir")
}

fn notes_dir(app: &AppHandle) -> PathBuf {
    let dir = data_dir(app).join("Notes");
    if !dir.exists() {
        let _ = fs::create_dir_all(&dir);
    }
    dir
}

fn sanitize_filename(title: &str) -> String {
    let sanitized: String = title
        .chars()
        .map(|c| {
            if matches!(c, '\\' | '/' | ':' | '*' | '?' | '"' | '<' | '>' | '|') {
                '-'
            } else {
                c
            }
        })
        .collect();
    let cleaned = sanitized.split_whitespace().collect::<Vec<_>>().join(" ");
    let trimmed = cleaned.trim_end_matches(|c: char| c == '.' || c == ' ');
    if trimmed.is_empty() {
        "Без названия".to_string()
    } else {
        trimmed.to_string()
    }
}

#[tauri::command]
pub async fn load_notes(app: AppHandle) -> Result<Vec<serde_json::Value>, String> {
    let dir = notes_dir(&app);
    let mut notes = Vec::new();

    if let Ok(entries) = fs::read_dir(&dir) {
        for entry in entries.flatten() {
            let path = entry.path();
            if path.extension().and_then(|e| e.to_str()) == Some("md") {
                let id = path
                    .file_stem()
                    .and_then(|s| s.to_str())
                    .unwrap_or("")
                    .to_string();
                if let Ok(content) = fs::read_to_string(&path) {
                    let updated_at = fs::metadata(&path)
                        .and_then(|m| m.modified())
                        .ok()
                        .and_then(|t| {
                            let dt: chrono::DateTime<chrono::Utc> = t.into();
                            Some(dt.to_rfc3339())
                        })
                        .unwrap_or_default();

                    notes.push(serde_json::json!({
                        "id": id,
                        "title": id,
                        "content": content,
                        "updated_at": updated_at
                    }));
                }
            }
        }
    }

    Ok(notes)
}

#[tauri::command]
pub async fn save_note(
    app: AppHandle,
    id: Option<String>,
    title: String,
    content: String,
) -> Result<serde_json::Value, String> {
    let dir = notes_dir(&app);
    let new_id = sanitize_filename(&title);
    let new_fp = dir.join(format!("{}.md", new_id));

    if let Some(ref old_id) = id {
        if old_id != &new_id && new_fp.exists() {
            return Ok(serde_json::json!({ "success": false, "error": "NOTE_ALREADY_EXISTS" }));
        }
        if old_id != &new_id {
            let old_fp = dir.join(format!("{}.md", old_id));
            if old_fp.exists() {
                let _ = fs::rename(&old_fp, &new_fp);
            }
        }
    }

    fs::write(&new_fp, &content).map_err(|e| e.to_string())?;

    let updated_at = fs::metadata(&new_fp)
        .and_then(|m| m.modified())
        .ok()
        .and_then(|t| {
            let dt: chrono::DateTime<chrono::Utc> = t.into();
            Some(dt.to_rfc3339())
        })
        .unwrap_or_default();

    Ok(serde_json::json!({
        "success": true,
        "id": new_id,
        "title": new_id,
        "updated_at": updated_at
    }))
}

#[tauri::command]
pub async fn delete_note(app: AppHandle, id: String) -> Result<bool, String> {
    let dir = notes_dir(&app);
    let fp = dir.join(format!("{}.md", id));
    if fp.exists() {
        fs::remove_file(&fp).map_err(|e| e.to_string())?;
    }
    Ok(true)
}

#[tauri::command]
pub async fn open_notes_folder(app: AppHandle) -> Result<(), String> {
    let dir = notes_dir(&app);
    opener::open(&dir).map_err(|e| e.to_string())
}
