use reqwest::Client;
use serde_json::Value;
use std::env;

fn kanban_base_url() -> String {
    env::var("KANBAN_API_BASE_URL").unwrap_or_else(|_| "https://kanban.devds.ru".to_string())
}

fn redact_sensitive(value: &Value) -> Value {
    match value {
        Value::Object(map) => {
            let redacted: serde_json::Map<String, Value> = map
                .iter()
                .map(|(k, v)| {
                    if k.to_lowercase().contains("pass")
                        || k.to_lowercase().contains("token")
                        || k.to_lowercase().contains("authorization")
                    {
                        (k.clone(), Value::String("***".to_string()))
                    } else {
                        (k.clone(), redact_sensitive(v))
                    }
                })
                .collect();
            Value::Object(redacted)
        }
        Value::Array(arr) => Value::Array(arr.iter().map(redact_sensitive).collect()),
        other => other.clone(),
    }
}

async fn kanban_request(
    label: &str,
    method: &str,
    url: &str,
    token: Option<&str>,
    body: Option<&Value>,
) -> Result<Value, String> {
    let client = Client::new();
    let log_url = url.split('?').next().unwrap_or(url);
    log::info!("[Kanban] {} - {} {}", label, method, log_url);

    let mut req = match method {
        "POST" => client.post(url),
        "PATCH" => client.patch(url),
        "GET" => client.get(url),
        "PUT" => client.put(url),
        "DELETE" => client.delete(url),
        _ => client.get(url),
    };

    req = req.header("Content-Type", "application/json");
    if let Some(t) = token {
        req = req.bearer_auth(t);
    }
    if let Some(b) = body {
        req = req.json(b);
    }

    let response = req.send().await.map_err(|e| e.to_string())?;
    if !response.status().is_success() {
        let status = response.status();
        let text = response.text().await.unwrap_or_default();
        return Err(format!("HTTP {}: {}", status, text));
    }

    let data: Value = response.json().await.map_err(|e| e.to_string())?;
    log::info!("[Kanban] Response: {}", redact_sensitive(&data));
    Ok(serde_json::json!({ "success": true, "data": data }))
}

#[tauri::command]
pub async fn kanban_login(email: String, password: String) -> Result<Value, String> {
    let url = format!(
        "{}/api/auth/token?email={}&password={}",
        kanban_base_url(),
        urlencoding::encode(&email),
        urlencoding::encode(&password),
    );
    kanban_request("Authorization", "POST", &url, None, None).await
}

#[tauri::command]
pub async fn kanban_get_user_info(token: String) -> Result<Value, String> {
    let url = format!("{}/api/auth/user", kanban_base_url());
    kanban_request("Get user info", "GET", &url, Some(&token), None).await
}

#[tauri::command]
pub async fn kanban_get_tasks(user_id: i64, token: String) -> Result<Value, String> {
    let url = format!("{}/api/user/{}/task/legacy", kanban_base_url(), user_id);
    kanban_request("Get tasks", "GET", &url, Some(&token), None).await
}

#[tauri::command]
pub async fn kanban_get_task(task_id: i64, token: String) -> Result<Value, String> {
    let url = format!("{}/api/task/{}", kanban_base_url(), task_id);
    kanban_request("Get task", "GET", &url, Some(&token), None).await
}

#[tauri::command]
pub async fn kanban_update_task_stage(
    task_id: i64,
    stage_id: i64,
    token: String,
) -> Result<Value, String> {
    let url = format!("{}/api/task/{}", kanban_base_url(), task_id);
    let body = serde_json::json!({ "stage_id": stage_id });
    kanban_request(
        "Update task stage",
        "PATCH",
        &url,
        Some(&token),
        Some(&body),
    )
    .await
}

#[tauri::command]
pub async fn kanban_log_work(
    task_id: i64,
    begin: String,
    comment: String,
    time: i64,
    token: String,
) -> Result<Value, String> {
    let url = format!("{}/api/task/{}/work", kanban_base_url(), task_id);
    let body = serde_json::json!({
        "begin": begin,
        "comment": comment,
        "time": time,
        "overtime": false
    });
    kanban_request("Log work", "POST", &url, Some(&token), Some(&body)).await
}

#[tauri::command]
pub async fn get_kanban_base_url() -> Result<String, String> {
    Ok(kanban_base_url())
}
