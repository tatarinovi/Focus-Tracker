use chrono::Datelike;
use std::fs;
use std::path::PathBuf;
use tauri::AppHandle;
use tauri::Manager;

fn data_dir(app: &AppHandle) -> PathBuf {
    app.path()
        .app_data_dir()
        .expect("failed to resolve app data dir")
}

fn tasks_path(app: &AppHandle) -> PathBuf {
    data_dir(app).join("tasks.json")
}

fn today_prefix() -> String {
    let now = chrono::Local::now();
    format!("{}-{:02}-{:02}", now.year(), now.month(), now.day())
}

fn load_tasks_from_disk(path: &PathBuf) -> Vec<serde_json::Value> {
    if path.exists() {
        if let Ok(content) = fs::read_to_string(path) {
            if let Ok(tasks) = serde_json::from_str::<Vec<serde_json::Value>>(&content) {
                return tasks;
            }
        }
    }
    Vec::new()
}

fn save_tasks_to_disk(path: &PathBuf, tasks: &[serde_json::Value]) -> Result<(), String> {
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    }
    let json = serde_json::to_string_pretty(tasks).map_err(|e| e.to_string())?;
    fs::write(path, json).map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn save_task(app: AppHandle, task: serde_json::Value) -> Result<bool, String> {
    let path = tasks_path(&app);
    let mut tasks = load_tasks_from_disk(&path);
    tasks.push(task);
    save_tasks_to_disk(&path, &tasks)?;
    Ok(true)
}

#[tauri::command]
pub async fn load_tasks(app: AppHandle) -> Result<Vec<serde_json::Value>, String> {
    let path = tasks_path(&app);
    Ok(load_tasks_from_disk(&path))
}

#[tauri::command]
pub async fn get_data_path(app: AppHandle) -> Result<String, String> {
    Ok(tasks_path(&app).to_string_lossy().to_string())
}

#[tauri::command]
pub async fn open_data_path(app: AppHandle) -> Result<(), String> {
    let path = tasks_path(&app);
    opener::open(path).map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn clear_today_tasks(app: AppHandle) -> Result<bool, String> {
    let path = tasks_path(&app);
    let tasks = load_tasks_from_disk(&path);
    let today = today_prefix();
    let filtered: Vec<serde_json::Value> = tasks
        .into_iter()
        .filter(|t| {
            t.get("date")
                .and_then(|v| v.as_str())
                .map(|d| d != today)
                .unwrap_or(true)
        })
        .collect();
    save_tasks_to_disk(&path, &filtered)?;
    Ok(true)
}
