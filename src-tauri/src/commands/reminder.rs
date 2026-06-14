use serde_json::Value;
use std::sync::Mutex;
use tauri::{AppHandle, Emitter, Manager, State};

const REMINDER_WIDTH: u32 = 320;
const REMINDER_HEIGHT: u32 = 290;

fn center_on_primary_monitor(window: &tauri::WebviewWindow) -> Result<(), String> {
    if let Some(monitor) = window.primary_monitor().map_err(|e| e.to_string())? {
        let position = monitor.position();
        let size = monitor.size();
        let x = position.x + ((size.width.saturating_sub(REMINDER_WIDTH)) / 2) as i32;
        let y = position.y + ((size.height.saturating_sub(REMINDER_HEIGHT)) / 2) as i32;
        window
            .set_position(tauri::Position::Physical(tauri::PhysicalPosition::new(
                x, y,
            )))
            .map_err(|e| e.to_string())?;
    } else {
        window.center().map_err(|e| e.to_string())?;
    }
    Ok(())
}

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
            center_on_primary_monitor(&window)?;
            window.set_always_on_top(true).map_err(|e| e.to_string())?;
            window.set_focus().map_err(|e| e.to_string())?;
        }
        return Ok(());
    }

    // Create reminder window
    let builder = tauri::WebviewWindowBuilder::new(
        &app,
        "reminder",
        tauri::WebviewUrl::App("reminder.html".into()),
    )
    .title("Напоминание")
    .inner_size(REMINDER_WIDTH as f64, REMINDER_HEIGHT as f64)
    .resizable(false)
    .always_on_top(true)
    .decorations(false)
    .skip_taskbar(true);

    #[cfg(target_os = "windows")]
    let builder = builder.transparent(true);

    let window = builder.build().map_err(|e| e.to_string())?;

    center_on_primary_monitor(&window)?;
    window.set_focus().map_err(|e| e.to_string())?;

    Ok(())
}

#[tauri::command]
pub async fn get_reminder_data(state: State<'_, ReminderState>) -> Result<Option<Value>, String> {
    Ok(state.data.lock().map_err(|e| e.to_string())?.clone())
}

#[tauri::command]
pub async fn destroy_reminder(app: AppHandle, state: State<'_, ReminderState>) -> Result<(), String> {
    *state.data.lock().map_err(|e| e.to_string())? = None;
    if let Some(window) = app.get_webview_window("reminder") {
        window.close().map_err(|e| e.to_string())?;
    }
    if let Some(main) = app.get_webview_window("main") {
        let _ = main.emit("reminder-closed", ());
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
    if let Some(main) = app.get_webview_window("main") {
        let _ = main.emit("reminder-closed", ());
    }

    Ok(true)
}
