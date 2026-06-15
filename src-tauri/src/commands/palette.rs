use tauri::{AppHandle, Emitter, Manager};

#[tauri::command]
pub async fn palette_show(app: AppHandle) -> Result<(), String> {
    if let Some(window) = app.get_webview_window("command-palette") {
        let _ = window.show();
        let _ = window.set_focus();
    }
    Ok(())
}

#[tauri::command]
pub async fn palette_hide(app: AppHandle) -> Result<(), String> {
    if let Some(window) = app.get_webview_window("command-palette") {
        let _ = window.hide();
    }
    Ok(())
}

#[tauri::command]
pub async fn palette_toggle(app: AppHandle) -> Result<(), String> {
    if let Some(window) = app.get_webview_window("command-palette") {
        if window.is_visible().unwrap_or(false) {
            let _ = window.hide();
        } else {
            let _ = window.show();
            let _ = window.set_focus();
        }
    }
    Ok(())
}

#[tauri::command]
pub async fn palette_send_commands(
    app: AppHandle,
    commands: serde_json::Value,
) -> Result<(), String> {
    if let Some(window) = app.get_webview_window("command-palette") {
        let _ = window.emit("show-palette", commands);
    }
    Ok(())
}

#[tauri::command]
pub async fn palette_request_commands(app: AppHandle) -> Result<(), String> {
    if let Some(main) = app.get_webview_window("main") {
        let _ = main.emit("palette-commands-request", ());
    }
    Ok(())
}

#[tauri::command]
pub async fn palette_execute_command(
    app: AppHandle,
    command: serde_json::Value,
) -> Result<(), String> {
    if let Some(main) = app.get_webview_window("main") {
        let _ = main.emit("palette-command", command);
    }
    Ok(())
}

#[tauri::command]
pub async fn palette_show_main(app: AppHandle) -> Result<(), String> {
    if let Some(window) = app.get_webview_window("main") {
        let _ = window.show();
        let _ = window.unminimize();
        let _ = window.set_focus();
    }
    Ok(())
}

#[tauri::command]
pub async fn palette_set_enabled(app: AppHandle, enabled: bool) -> Result<(), String> {
    use tauri_plugin_global_shortcut::{GlobalShortcutExt, Shortcut, ShortcutState};
    if enabled {
        let shortcut = Shortcut::try_from("Ctrl+Shift+Space").map_err(|e| e.to_string())?;
        app.global_shortcut()
            .on_shortcut(shortcut, |app, _shortcut, event| {
                if event.state == ShortcutState::Pressed {
                    if let Some(window) = app.get_webview_window("command-palette") {
                        if window.is_visible().unwrap_or(false) {
                            let _ = window.hide();
                        } else {
                            let _ = window.show();
                            let _ = window.set_focus();
                        }
                    }
                }
            })
            .map_err(|e| e.to_string())?;
    } else {
        app.global_shortcut()
            .unregister("Ctrl+Shift+Space")
            .map_err(|e| e.to_string())?;
    }
    Ok(())
}
