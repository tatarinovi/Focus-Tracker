use tauri::AppHandle;

#[tauri::command]
pub async fn notify(app: AppHandle, title: String, body: String) -> Result<(), String> {
    use tauri_plugin_notification::NotificationExt;
    app.notification()
        .builder()
        .title(&title)
        .body(&body)
        .show()
        .map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
pub async fn open_external(url: String) -> Result<(), String> {
    if url.starts_with("http://") || url.starts_with("https://") {
        opener::open(&url).map_err(|e| e.to_string())?;
    }
    Ok(())
}

#[tauri::command]
pub async fn close_app(app: AppHandle) -> Result<(), String> {
    app.exit(0);
    Ok(())
}
