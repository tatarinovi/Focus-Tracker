use serde_json::Value;
use std::sync::Mutex;
use tauri::{AppHandle, Emitter, Manager, State};

pub struct ReminderState {
    pub data: Mutex<Option<Value>>,
}

impl Default for ReminderState {
    fn default() -> Self {
        Self {
            data: Mutex::new(None),
        }
    }
}

#[tauri::command]
pub async fn show_meeting_reminder(
    app: AppHandle,
    state: State<'_, ReminderState>,
    data: Value,
) -> Result<(), String> {
    *state.data.lock().map_err(|e| e.to_string())? = Some(data.clone());

    // Check if reminder window already exists
    if app.get_webview_window("reminder").is_some() {
        // Send update event
        if let Some(window) = app.get_webview_window("reminder") {
            window
                .emit("reminder-update", &data)
                .map_err(|e| e.to_string())?;
            window.set_focus().map_err(|e| e.to_string())?;
        }
        return Ok(());
    }

    // Create reminder window
    let _window = tauri::WebviewWindowBuilder::new(
        &app,
        "reminder",
        tauri::WebviewUrl::App("reminder.html".into()),
    )
    .title("Напоминание")
    .inner_size(320.0, 290.0)
    .resizable(false)
    .always_on_top(true)
    .decorations(false)
    .transparent(true)
    .skip_taskbar(true)
    .build()
    .map_err(|e| e.to_string())?;

    Ok(())
}

#[tauri::command]
pub async fn get_reminder_data(state: State<'_, ReminderState>) -> Result<Option<Value>, String> {
    Ok(state.data.lock().map_err(|e| e.to_string())?.clone())
}

#[tauri::command]
pub async fn destroy_reminder(app: AppHandle) -> Result<(), String> {
    if let Some(window) = app.get_webview_window("reminder") {
        window.close().map_err(|e| e.to_string())?;
    }
    Ok(())
}

#[tauri::command]
pub async fn reminder_join_meeting(
    app: AppHandle,
    url: Option<String>,
    should_start_task: Option<bool>,
    task: Option<Value>,
) -> Result<bool, String> {
    if should_start_task.unwrap_or(false) {
        if let Some(t) = task {
            if let Some(window) = app.get_webview_window("main") {
                window
                    .emit("reminder-start-task", t)
                    .map_err(|e| e.to_string())?;
            }
        }
    }

    if let Some(meeting_url) = url {
        if meeting_url.starts_with("http://") || meeting_url.starts_with("https://") {
            opener::open(&meeting_url).map_err(|e| e.to_string())?;
        }
    }

    // Close reminder window
    if let Some(window) = app.get_webview_window("reminder") {
        window.close().map_err(|e| e.to_string())?;
    }

    Ok(true)
}
