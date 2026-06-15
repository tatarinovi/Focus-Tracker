use reqwest::Client;
use serde_json::{json, Value};
use std::env;
use std::time::Duration;
use tauri::AppHandle;

use super::config::load_config;
use super::credentials::get_decrypted_password;

fn bitrix_portal_url(app: &AppHandle) -> String {
    let config = load_config(app);
    config
        .get("bitrix_url")
        .and_then(|v| v.as_str())
        .map(str::trim)
        .filter(|url| !url.is_empty())
        .map(str::to_string)
        .unwrap_or_else(|| env::var("BITRIX24_URL").unwrap_or_default())
}

fn bitrix_rest_base(app: &AppHandle) -> Result<String, String> {
    let portal = bitrix_portal_url(app).trim_end_matches('/').to_string();
    if portal.is_empty() {
        return Err("Bitrix24 URL не настроен".to_string());
    }

    let config = load_config(app);
    let webhook = get_decrypted_password(&config, "bitrix_webhook");
    if webhook.is_empty() {
        return Err("Bitrix24 webhook не настроен".to_string());
    }

    let hook = webhook
        .trim()
        .trim_start_matches('/')
        .trim_end_matches('/');
    Ok(format!("{}/rest/{}/", portal, hook))
}

async fn bitrix_call(app: &AppHandle, method: &str, body: Value) -> Result<Value, String> {
    let rest_base = bitrix_rest_base(app)?;
    let url = format!("{rest_base}{method}");

    let client = Client::builder()
        .timeout(Duration::from_secs(30))
        .build()
        .map_err(|e| e.to_string())?;

    let response = client
        .post(&url)
        .header("Content-Type", "application/json")
        .header("Accept", "application/json")
        .json(&body)
        .send()
        .await
        .map_err(|e| format!("Ошибка сети Bitrix24: {e}"))?;

    let status = response.status();
    let payload: Value = response
        .json()
        .await
        .map_err(|e| format!("Некорректный ответ Bitrix24: {e}"))?;

    if let Some(error) = payload.get("error").and_then(|v| v.as_str()) {
        let description = payload
            .get("error_description")
            .and_then(|v| v.as_str())
            .unwrap_or(error);
        return Err(description.to_string());
    }

    if !status.is_success() {
        return Err(format!("Bitrix24 HTTP {status}"));
    }

    Ok(payload)
}

fn portal_response(app: &AppHandle, payload: Value) -> Value {
    json!({
        "success": true,
        "portal_url": bitrix_portal_url(app),
        "result": payload.get("result").cloned().unwrap_or(Value::Null),
    })
}

fn expired_response(app: &AppHandle) -> Value {
    json!({
        "success": false,
        "error_code": "EXPIRED",
        "message": "Рабочий день не закрыт с прошлого дня. Завершите его в Bitrix24.",
        "portal_url": bitrix_portal_url(app),
    })
}

fn inspect_status_result(app: &AppHandle, result: &Value) -> Option<Value> {
    let status = result.get("STATUS").and_then(|v| v.as_str()).unwrap_or("");
    if status == "EXPIRED" {
        return Some(expired_response(app));
    }
    None
}

#[tauri::command]
pub async fn bitrix_timeman_status(app: AppHandle) -> Result<Value, String> {
    let payload = bitrix_call(&app, "timeman.status", json!({})).await?;
    if let Some(expired) = payload
        .get("result")
        .and_then(|result| inspect_status_result(&app, result))
    {
        return Ok(expired);
    }
    Ok(portal_response(&app, payload))
}

#[tauri::command]
pub async fn bitrix_timeman_open(app: AppHandle) -> Result<Value, String> {
    let payload = bitrix_call(&app, "timeman.open", json!({})).await?;
    if let Some(expired) = payload
        .get("result")
        .and_then(|result| inspect_status_result(&app, result))
    {
        return Ok(expired);
    }
    Ok(portal_response(&app, payload))
}

#[tauri::command]
pub async fn bitrix_timeman_pause(app: AppHandle) -> Result<Value, String> {
    let payload = bitrix_call(&app, "timeman.pause", json!({})).await?;
    if let Some(expired) = payload
        .get("result")
        .and_then(|result| inspect_status_result(&app, result))
    {
        return Ok(expired);
    }
    Ok(portal_response(&app, payload))
}

#[tauri::command]
pub async fn bitrix_timeman_close(app: AppHandle) -> Result<Value, String> {
    let payload = bitrix_call(&app, "timeman.close", json!({})).await?;
    if let Some(expired) = payload
        .get("result")
        .and_then(|result| inspect_status_result(&app, result))
    {
        return Ok(expired);
    }
    Ok(portal_response(&app, payload))
}

#[tauri::command]
pub async fn bitrix_test_connection(app: AppHandle) -> Result<Value, String> {
    bitrix_timeman_status(app).await
}
