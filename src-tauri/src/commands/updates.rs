use crate::commands::storage::run_storage_migrations_internal;
use serde::Serialize;
use serde_json::Value;
use std::collections::HashSet;
use std::sync::Mutex;
use std::time::Duration;
use tauri::{AppHandle, Emitter, Manager, State};
use tauri_plugin_updater::UpdaterExt;

const CHECK_TIMEOUT: Duration = Duration::from_secs(5);
const DOWNLOAD_TIMEOUT: Duration = Duration::from_secs(60);
const DEV_SPLASH_DELAY: Duration = Duration::from_millis(450);
const STARTUP_NOTICE_DELAY: Duration = Duration::from_millis(1200);
const STABLE_ENDPOINT: &str = "https://tatarinovi.github.io/Focus-Tracker/updates/stable.json";
const BETA_ENDPOINT: &str = "https://tatarinovi.github.io/Focus-Tracker/updates/beta.json";

#[derive(Default)]
pub struct UpdaterState {
    failed_versions: Mutex<HashSet<String>>,
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct UpdateStatus {
    phase: String,
    message: String,
    version: Option<String>,
}

#[derive(Clone)]
struct UpdateCheck {
    has_update: bool,
    version: Option<String>,
    notes: Option<String>,
}

fn normalize_channel(channel: Option<String>) -> String {
    match channel.as_deref() {
        Some("beta") => "beta".to_string(),
        _ => "stable".to_string(),
    }
}

fn endpoint_for_channel(channel: &str) -> &'static str {
    if channel == "beta" {
        BETA_ENDPOINT
    } else {
        STABLE_ENDPOINT
    }
}

fn emit_status(app: &AppHandle, phase: &str, message: &str, version: Option<String>) {
    let _ = app.emit(
        "update-status",
        UpdateStatus {
            phase: phase.to_string(),
            message: message.to_string(),
            version,
        },
    );
}

fn emit_progress(app: &AppHandle, percent: u8) {
    let _ = app.emit("update-progress", percent.min(100));
}

fn mark_failed_version(state: &State<'_, UpdaterState>, version: &str) {
    if let Ok(mut failed) = state.failed_versions.lock() {
        failed.insert(version.to_string());
    }
}

fn was_failed_in_session(state: &State<'_, UpdaterState>, version: &str) -> bool {
    state
        .failed_versions
        .lock()
        .map(|failed| failed.contains(version))
        .unwrap_or(false)
}

async fn updater_for_channel(
    app: &AppHandle,
    channel: &str,
) -> Result<tauri_plugin_updater::Updater, String> {
    let endpoint = endpoint_for_channel(channel)
        .parse()
        .map_err(|e: url::ParseError| e.to_string())?;

    app.updater_builder()
        .endpoints(vec![endpoint])
        .map_err(|e| e.to_string())?
        .build()
        .map_err(|e| e.to_string())
}

async fn check_update_inner(app: &AppHandle, channel: &str) -> Result<UpdateCheck, String> {
    let updater = updater_for_channel(app, channel).await?;
    let update = updater.check().await.map_err(|e| e.to_string())?;

    Ok(match update {
        Some(update) => UpdateCheck {
            has_update: true,
            version: Some(update.version.to_string()),
            notes: update.body.clone(),
        },
        None => UpdateCheck {
            has_update: false,
            version: None,
            notes: None,
        },
    })
}

async fn install_update_inner(
    app: &AppHandle,
    channel: &str,
    state: &State<'_, UpdaterState>,
) -> Result<Value, String> {
    emit_status(app, "checking", "Проверяем наличие обновлений...", None);
    let check_result = tokio::time::timeout(CHECK_TIMEOUT, check_update_inner(app, channel)).await;
    let check = match check_result {
        Ok(Ok(check)) => check,
        Ok(Err(error)) => {
            eprintln!("[updater] check_update_inner failed: {error}");
            return Err(error);
        }
        Err(_) => return Err("timeout: check".to_string()),
    };

    if !check.has_update {
        emit_status(
            app,
            "skipped",
            "У вас уже установлена актуальная версия.",
            None,
        );
        return Ok(serde_json::json!({
            "success": true,
            "hasUpdate": false,
            "current": env!("CARGO_PKG_VERSION")
        }));
    }

    let version = check.version.unwrap_or_else(|| "unknown".to_string());
    if was_failed_in_session(state, &version) {
        emit_status(
            app,
            "skipped",
            "Это обновление уже не удалось установить в текущем запуске.",
            Some(version.clone()),
        );
        return Ok(serde_json::json!({
            "success": false,
            "skipped": true,
            "version": version,
            "error": "Update was already attempted in this session"
        }));
    }

    let updater = updater_for_channel(app, channel).await.map_err(|e| {
        eprintln!("[updater] updater_for_channel failed: {e}");
        e
    })?;
    let update = updater
        .check()
        .await
        .map_err(|e| {
            eprintln!("[updater] second check() failed: {e}");
            e.to_string()
        })?
        .ok_or_else(|| {
            eprintln!("[updater] second check() returned None");
            "Update is no longer available".to_string()
        })?;

    emit_progress(app, 0);
    emit_status(
        app,
        "available",
        "Найдена новая версия. Скачиваем обновление...",
        Some(version.clone()),
    );
    emit_status(
        app,
        "downloading",
        "Скачиваем обновление...",
        Some(version.clone()),
    );

    let app_for_progress = app.clone();
    let app_for_finished = app.clone();
    let installing_version = version.clone();
    let mut downloaded: u64 = 0;
    let install_result = tokio::time::timeout(
        DOWNLOAD_TIMEOUT,
        update.download_and_install(
            move |chunk_length, content_length| {
                downloaded += chunk_length as u64;
                if let Some(total) = content_length {
                    if total > 0 {
                        let percent = ((downloaded as f64 / total as f64) * 100.0).round() as u8;
                        emit_progress(&app_for_progress, percent);
                    }
                }
            },
            move || {
                emit_progress(&app_for_finished, 100);
                emit_status(
                    &app_for_finished,
                    "installing",
                    "Устанавливаем обновление...",
                    Some(installing_version.clone()),
                );
            },
        ),
    )
    .await;

    match install_result {
        Ok(Ok(())) => {
            emit_status(app, "relaunching", "Перезапускаем приложение...", None);
            Ok(serde_json::json!({ "success": true, "installed": true }))
        }
        Ok(Err(error)) => {
            mark_failed_version(state, &version);
            Err(error.to_string())
        }
        Err(_) => {
            mark_failed_version(state, &version);
            Err("timeout: download".to_string())
        }
    }
}

fn finish_startup_internal(app: &AppHandle) -> Result<Value, String> {
    emit_status(app, "migrating", "Проверяем локальные данные...", None);
    let migration = run_storage_migrations_internal(app)?;
    if migration
        .get("success")
        .and_then(|v| v.as_bool())
        .unwrap_or(false)
    {
        if let Some(main) = app.get_webview_window("main") {
            main.show().map_err(|e| e.to_string())?;
            let _ = main.set_focus();
        }
        if let Some(splash) = app.get_webview_window("splash") {
            let _ = splash.close();
        }
        Ok(serde_json::json!({
            "success": true,
            "openedMain": true,
            "migration": migration
        }))
    } else {
        emit_status(
            app,
            "error",
            "Не удалось подготовить локальные данные.",
            None,
        );
        Ok(serde_json::json!({
            "success": false,
            "migrationFailed": true,
            "migration": migration
        }))
    }
}

#[tauri::command]
pub async fn get_app_version() -> Result<String, String> {
    Ok(env!("CARGO_PKG_VERSION").to_string())
}

#[tauri::command]
pub async fn check_updates(app: AppHandle, channel: String) -> Result<Value, String> {
    if cfg!(debug_assertions) {
        emit_status(
            &app,
            "skipped",
            "Обновления доступны только в production-сборке.",
            None,
        );
        return Ok(serde_json::json!({
            "success": true,
            "disabled": true,
            "hasUpdate": false,
            "current": env!("CARGO_PKG_VERSION")
        }));
    }

    let channel = normalize_channel(Some(channel));
    emit_status(&app, "checking", "Проверяем наличие обновлений...", None);
    match tokio::time::timeout(CHECK_TIMEOUT, check_update_inner(&app, &channel)).await {
        Ok(Ok(check)) => Ok(serde_json::json!({
            "success": true,
            "hasUpdate": check.has_update,
            "current": env!("CARGO_PKG_VERSION"),
            "version": check.version,
            "releaseNotes": check.notes
        })),
        Ok(Err(error)) => {
            emit_status(&app, "error", "Не удалось проверить обновления.", None);
            Ok(serde_json::json!({
                "success": false,
                "error": error,
                "current": env!("CARGO_PKG_VERSION")
            }))
        }
        Err(_) => {
            emit_status(
                &app,
                "timeout",
                "Проверка обновлений заняла слишком много времени.",
                None,
            );
            Ok(serde_json::json!({
                "success": false,
                "timeout": true,
                "error": "Update check timed out",
                "current": env!("CARGO_PKG_VERSION")
            }))
        }
    }
}

#[tauri::command]
pub async fn install_update(
    app: AppHandle,
    state: State<'_, UpdaterState>,
    channel: String,
) -> Result<Value, String> {
    if cfg!(debug_assertions) {
        return Ok(serde_json::json!({
            "success": false,
            "disabled": true,
            "error": "Обновления доступны только в production-сборке."
        }));
    }

    let channel = normalize_channel(Some(channel));
    match install_update_inner(&app, &channel, &state).await {
        Ok(result) => {
            if result
                .get("installed")
                .and_then(|v| v.as_bool())
                .unwrap_or(false)
            {
                app.restart();
            } else {
                Ok(result)
            }
        }
        Err(error) => {
            emit_status(&app, "error", "Не удалось установить обновление.", None);
            Ok(serde_json::json!({ "success": false, "error": error }))
        }
    }
}

#[tauri::command]
pub async fn download_update(_url: String) -> Result<Value, String> {
    Ok(serde_json::json!({
        "success": false,
        "error": "This updater flow was replaced by install_update(channel)."
    }))
}

#[tauri::command]
pub async fn finish_startup(app: AppHandle) -> Result<Value, String> {
    finish_startup_internal(&app)
}

#[tauri::command]
pub async fn startup_flow(
    app: AppHandle,
    state: State<'_, UpdaterState>,
    channel: Option<String>,
) -> Result<Value, String> {
    if cfg!(debug_assertions) {
        emit_status(
            &app,
            "skipped",
            "Dev mode: открываем приложение без проверки обновлений.",
            None,
        );
        tokio::time::sleep(DEV_SPLASH_DELAY).await;
        return finish_startup_internal(&app);
    }

    let channel = normalize_channel(channel);
    match install_update_inner(&app, &channel, &state).await {
        Ok(result) => {
            if result
                .get("installed")
                .and_then(|v| v.as_bool())
                .unwrap_or(false)
            {
                app.restart();
            } else {
                finish_startup_internal(&app)
            }
        }
        Err(error) => {
            eprintln!("[updater] startup_flow install_update_inner error: {error}");
            if error == "timeout: check" {
                emit_status(
                    &app,
                    "timeout",
                    "Не удалось проверить обновления вовремя, запускаем текущую версию.",
                    None,
                );
            } else if error == "timeout: download" {
                emit_status(
                    &app,
                    "timeout",
                    "Обновление не удалось скачать вовремя, запускаем текущую версию.",
                    None,
                );
            } else {
                emit_status(
                    &app,
                    "error",
                    "Не удалось обновить приложение, запускаем текущую версию.",
                    None,
                );
            }
            tokio::time::sleep(STARTUP_NOTICE_DELAY).await;
            finish_startup_internal(&app)
        }
    }
}
