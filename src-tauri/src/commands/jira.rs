use base64::Engine;
use reqwest::Client;
use serde_json::Value;
use std::env;
use std::sync::Arc;
use std::time::Duration;
use tauri::AppHandle;
use tokio::sync::Semaphore;
use tokio::sync::OnceCell;

use super::config::load_config;
use super::credentials::get_decrypted_password;

static HTTP_CLIENT: OnceCell<Client> = OnceCell::const_new();
static RATE_SEMAPHORE: OnceCell<Arc<Semaphore>> = OnceCell::const_new();

fn jira_url() -> String {
    env::var("JIRA_URL").unwrap_or_else(|_| "https://itpm.mos.ru/".to_string())
}

async fn get_client() -> &'static Client {
    HTTP_CLIENT
        .get_or_init(|| async {
            Client::builder()
                .timeout(Duration::from_secs(30))
                .pool_max_idle_per_host(2)
                .build()
                .expect("Failed to create HTTP client")
        })
        .await
}

async fn get_semaphore() -> Arc<Semaphore> {
    RATE_SEMAPHORE
        .get_or_init(|| async { Arc::new(Semaphore::new(2)) })
        .await
        .clone()
}

async fn jira_request(
    method: &str,
    endpoint: &str,
    body: Option<String>,
    is_form_data: bool,
    app: &AppHandle,
) -> Result<Value, String> {
    let config = load_config(app);
    let jira_user = config
        .get("jira_user")
        .and_then(|v| v.as_str())
        .unwrap_or("")
        .to_string();
    let pass = get_decrypted_password(&config, "jira_pass");
    if jira_user.is_empty() || pass.is_empty() {
        return Err("Jira URL or User is missing configuration".to_string());
    }

    let base = jira_url().trim_end_matches('/').to_string();
    let url = format!("{}{}", base, endpoint);
    let auth = base64::engine::general_purpose::STANDARD
        .encode(format!("{}:{}", jira_user, pass).as_bytes());

    let client = get_client().await;
    let semaphore = get_semaphore().await;
    let max_retries = 3;
    let mut last_err = String::new();

    for attempt in 0..=max_retries {
        if attempt > 0 {
            let delay_ms = 1000 * (1 << (attempt - 1)) as u64;
            tokio::time::sleep(Duration::from_millis(delay_ms)).await;
        }

        let _permit = semaphore.acquire().await.map_err(|e| e.to_string())?;

        let mut req = match method {
            "POST" => client.post(&url),
            "PUT" => client.put(&url),
            "PATCH" => client.patch(&url),
            "DELETE" => client.delete(&url),
            _ => client.get(&url),
        };

        req = req.header("Authorization", format!("Basic {}", auth));

        if !is_form_data {
            req = req
                .header("Content-Type", "application/json")
                .header("Accept", "application/json");
        } else {
            req = req.header("X-Atlassian-Token", "no-check");
        }

        if let Some(ref b) = body {
            req = req.body(b.clone());
        }

        let response = match req.send().await {
            Ok(r) => r,
            Err(e) => {
                last_err = e.to_string();
                continue;
            }
        };

        let status = response.status();
        if status.as_u16() == 429 {
            let retry_after = response
                .headers()
                .get("Retry-After")
                .and_then(|v| v.to_str().ok())
                .and_then(|v| v.parse::<u64>().ok())
                .unwrap_or(0);
            let wait_ms = if retry_after > 0 {
                retry_after * 1000
            } else {
                2000 * (attempt + 1) as u64
            };
            last_err = format!("Jira HTTP Error 429: Too Many Requests");
            tokio::time::sleep(Duration::from_millis(wait_ms)).await;
            continue;
        }
        if !status.is_success() {
            let text = response.text().await.unwrap_or_default();
            return Err(format!("Jira HTTP Error {}: {}", status, text));
        }

        return response.json().await.map_err(|e| e.to_string());
    }

    Err(last_err)
}

#[tauri::command]
pub async fn get_jira_components(app: AppHandle, project_key: String) -> Result<Value, String> {
    let data = jira_request(
        "GET",
        &format!("/rest/api/2/project/{}/components", project_key),
        None,
        false,
        &app,
    )
    .await?;
    Ok(serde_json::json!({ "success": true, "data": data }))
}

#[tauri::command]
pub async fn get_jira_versions(app: AppHandle, project_key: String) -> Result<Value, String> {
    let data = jira_request(
        "GET",
        &format!("/rest/api/2/project/{}/versions", project_key),
        None,
        false,
        &app,
    )
    .await?;
    let unreleased = if let Some(arr) = data.as_array() {
        arr.iter()
            .filter(|v| !v.get("released").and_then(|r| r.as_bool()).unwrap_or(false))
            .cloned()
            .collect::<Vec<_>>()
    } else {
        vec![]
    };
    Ok(serde_json::json!({ "success": true, "data": unreleased }))
}

#[tauri::command]
pub async fn get_jira_fields(app: AppHandle) -> Result<Value, String> {
    let data = jira_request("GET", "/rest/api/2/field", None, false, &app).await?;
    Ok(serde_json::json!({ "success": true, "data": data }))
}

#[tauri::command]
pub async fn get_jira_labels(app: AppHandle, query: String) -> Result<Value, String> {
    let data = jira_request(
        "GET",
        &format!(
            "/rest/api/1.0/labels/suggest?query={}",
            urlencoding::encode(&query)
        ),
        None,
        false,
        &app,
    )
    .await?;
    Ok(serde_json::json!({ "success": true, "data": data }))
}

#[tauri::command]
pub async fn get_jira_createmeta(app: AppHandle, project_key: String) -> Result<Value, String> {
    let data = jira_request(
        "GET",
        &format!(
            "/rest/api/2/issue/createmeta?projectKeys={}&expand=projects.issuetypes.fields",
            project_key
        ),
        None,
        false,
        &app,
    )
    .await?;
    Ok(serde_json::json!({ "success": true, "data": data }))
}

#[tauri::command]
pub async fn get_jira_epics(app: AppHandle, project_key: String) -> Result<Value, String> {
    let jql = format!(
        "project={} AND issuetype=Epic AND resolution=Unresolved ORDER BY updated DESC",
        project_key
    );
    let data = jira_request(
        "GET",
        &format!(
            "/rest/api/2/search?jql={}&fields=summary&maxResults=100",
            urlencoding::encode(&jql)
        ),
        None,
        false,
        &app,
    )
    .await?;
    Ok(serde_json::json!({ "success": true, "data": data }))
}

#[tauri::command]
pub async fn create_jira_issue(app: AppHandle, payload: Value) -> Result<Value, String> {
    let data = jira_request(
        "POST",
        "/rest/api/2/issue",
        Some(serde_json::to_string(&payload).map_err(|e| e.to_string())?),
        false,
        &app,
    )
    .await?;
    Ok(serde_json::json!({ "success": true, "data": data }))
}

#[tauri::command]
pub async fn upload_jira_attachments(
    app: AppHandle,
    issue_key: String,
    attachments: Vec<Value>,
) -> Result<Value, String> {
    let config = load_config(&app);
    let jira_user = config
        .get("jira_user")
        .and_then(|v| v.as_str())
        .unwrap_or("");
    let pass = get_decrypted_password(&config, "jira_pass");
    if jira_user.is_empty() || pass.is_empty() {
        return Err("Jira credentials missing".to_string());
    }

    let base = jira_url();
    let base = base.trim_end_matches('/');
    let url = format!("{}/rest/api/2/issue/{}/attachments", base, issue_key);
    let auth = base64::engine::general_purpose::STANDARD
        .encode(format!("{}:{}", jira_user, pass).as_bytes());

    let client = get_client().await;
    let semaphore = get_semaphore().await;
    let max_retries = 3;
    let mut last_err = String::new();

    for attempt in 0..=max_retries {
        if attempt > 0 {
            let delay_ms = 1000 * (1 << (attempt - 1)) as u64;
            tokio::time::sleep(Duration::from_millis(delay_ms)).await;
        }

        let _permit = semaphore.acquire().await.map_err(|e| e.to_string())?;

        let mut form = reqwest::multipart::Form::new();
        for att in &attachments {
            let name = att.get("name").and_then(|v| v.as_str()).unwrap_or("file");
            let data_str = att.get("data").and_then(|v| v.as_str()).unwrap_or("");
            let mime = att
                .get("type")
                .and_then(|v| v.as_str())
                .unwrap_or("application/octet-stream");
            if let Ok(bytes) = base64::engine::general_purpose::STANDARD.decode(data_str) {
                let part = reqwest::multipart::Part::bytes(bytes)
                    .file_name(name.to_string())
                    .mime_str(mime)
                    .map_err(|e| e.to_string())?;
                form = form.text("file", name.to_string()).part("file", part);
            }
        }

        let response = match client
            .post(&url)
            .header("Authorization", format!("Basic {}", auth))
            .header("X-Atlassian-Token", "no-check")
            .multipart(form)
            .send()
            .await
        {
            Ok(r) => r,
            Err(e) => {
                last_err = e.to_string();
                continue;
            }
        };

        let status = response.status();
        if status.as_u16() == 429 {
            let retry_after = response
                .headers()
                .get("Retry-After")
                .and_then(|v| v.to_str().ok())
                .and_then(|v| v.parse::<u64>().ok())
                .unwrap_or(0);
            let wait_ms = if retry_after > 0 {
                retry_after * 1000
            } else {
                2000 * (attempt + 1) as u64
            };
            last_err = format!("Jira File Upload Error 429: Too Many Requests");
            tokio::time::sleep(Duration::from_millis(wait_ms)).await;
            continue;
        }
        if !status.is_success() {
            let text = response.text().await.unwrap_or_default();
            return Err(format!("Jira File Upload Error {}: {}", status, text));
        }

        let data: Value = response.json().await.map_err(|e| e.to_string())?;
        return Ok(serde_json::json!({ "success": true, "data": data }));
    }

    Err(last_err)
}

#[tauri::command]
pub async fn search_jira_users(
    app: AppHandle,
    query: String,
    project_key: Option<String>,
) -> Result<Value, String> {
    let project_param = project_key
        .map(|k| format!("&projectKeys={}", urlencoding::encode(&k)))
        .unwrap_or_default();
    let data = jira_request(
        "GET",
        &format!(
            "/rest/api/latest/user/assignable/multiProjectSearch?username={}&maxResults=100{}",
            urlencoding::encode(&query),
            project_param
        ),
        None,
        false,
        &app,
    )
    .await?;
    Ok(serde_json::json!({ "success": true, "data": data }))
}
