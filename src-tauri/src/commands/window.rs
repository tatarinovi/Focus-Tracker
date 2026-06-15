use std::sync::Mutex;
use tauri::{AppHandle, Emitter, Manager};

pub struct TimerCloseGuardState {
    pub is_timer_active: Mutex<bool>,
}

impl Default for TimerCloseGuardState {
    fn default() -> Self {
        Self {
            is_timer_active: Mutex::new(false),
        }
    }
}

pub fn is_close_guarded(app: &AppHandle) -> bool {
    app.try_state::<TimerCloseGuardState>()
        .and_then(|state| state.is_timer_active.lock().ok().map(|guard| *guard))
        .unwrap_or(false)
}

pub fn notify_close_blocked(app: &AppHandle) {
    if let Some(window) = app.get_webview_window("main") {
        let _ = window.unminimize();
        let _ = window.show();
        let _ = window.set_focus();
        let _ = window.emit("active-timer-close-blocked", ());
    }
}

#[tauri::command]
pub async fn set_timer_close_guard(
    state: tauri::State<'_, TimerCloseGuardState>,
    is_active: bool,
) -> Result<(), String> {
    *state
        .is_timer_active
        .lock()
        .map_err(|e| e.to_string())? = is_active;
    Ok(())
}

#[tauri::command]
pub async fn window_minimize(app: AppHandle) -> Result<(), String> {
    if let Some(window) = app.get_webview_window("main") {
        window.minimize().map_err(|e| e.to_string())?;
    }
    Ok(())
}

#[tauri::command]
pub async fn window_toggle_maximize(app: AppHandle) -> Result<bool, String> {
    if let Some(window) = app.get_webview_window("main") {
        if window.is_maximized().unwrap_or(false) {
            window.unmaximize().map_err(|e| e.to_string())?;
        } else {
            window.maximize().map_err(|e| e.to_string())?;
        }
        return Ok(window.is_maximized().unwrap_or(false));
    }
    Ok(false)
}

#[tauri::command]
pub async fn window_close(app: AppHandle) -> Result<(), String> {
    if let Some(window) = app.get_webview_window("main") {
        window.close().map_err(|e| e.to_string())?;
    }
    Ok(())
}

#[tauri::command]
pub async fn window_is_maximized(app: AppHandle) -> Result<bool, String> {
    if let Some(window) = app.get_webview_window("main") {
        return Ok(window.is_maximized().unwrap_or(false));
    }
    Ok(false)
}

#[tauri::command]
pub async fn set_always_on_top(app: AppHandle, value: bool) -> Result<bool, String> {
    if let Some(window) = app.get_webview_window("main") {
        window.set_always_on_top(value).map_err(|e| e.to_string())?;
        return Ok(true);
    }
    Ok(false)
}

#[tauri::command]
pub async fn is_always_on_top(app: AppHandle) -> Result<bool, String> {
    if let Some(window) = app.get_webview_window("main") {
        return Ok(window.is_always_on_top().unwrap_or(false));
    }
    Ok(false)
}

#[tauri::command]
pub async fn get_window_bounds(app: AppHandle) -> Result<serde_json::Value, String> {
    if let Some(window) = app.get_webview_window("main") {
        let pos = window.outer_position().map_err(|e| e.to_string())?;
        let size = window.outer_size().map_err(|e| e.to_string())?;
        return Ok(serde_json::json!({
            "x": pos.x,
            "y": pos.y,
            "width": size.width,
            "height": size.height
        }));
    }
    Ok(serde_json::json!({}))
}

#[tauri::command]
pub async fn set_window_bounds(
    app: AppHandle,
    x: Option<i32>,
    y: Option<i32>,
    width: Option<u32>,
    height: Option<u32>,
) -> Result<bool, String> {
    if let Some(window) = app.get_webview_window("main") {
        if let (Some(x), Some(y)) = (x, y) {
            window
                .set_position(tauri::Position::Physical(tauri::PhysicalPosition::new(
                    x, y,
                )))
                .map_err(|e| e.to_string())?;
        }
        if let (Some(width), Some(height)) = (width, height) {
            window
                .set_size(tauri::Size::Physical(tauri::PhysicalSize::new(
                    width, height,
                )))
                .map_err(|e| e.to_string())?;
        }
        return Ok(true);
    }
    Ok(false)
}
