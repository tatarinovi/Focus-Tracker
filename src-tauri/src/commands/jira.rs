use base64::Engine;
use reqwest::Client;
use serde_json::Value;
use std::env;
use tauri::AppHandle;

use super::config::load_config;
use super::credentials::get_decrypted_password;

fn jira_url() -> String {
    env::var("JIRA_URL").unwrap_or_else(|_| "https://itpm.mos.ru/".to_string())
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

    let client = Client::new();
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

    if let Some(b) = body {
        req = req.body(b);
    }

    let response = req.send().await.map_err(|e| e.to_string())?;
    if !response.status().is_success() {
        let status = response.status();
        let text = response.text().await.unwrap_or_default();
        return Err(format!("Jira HTTP Error {}: {}", status, text));
    }

    response.json().await.map_err(|e| e.to_string())
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
    // Filter unreleased versions
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

    let client = Client::new();
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

    let response = client
        .post(&url)
        .header("Authorization", format!("Basic {}", auth))
        .header("X-Atlassian-Token", "no-check")
        .multipart(form)
        .send()
        .await
        .map_err(|e| e.to_string())?;

    if !response.status().is_success() {
        let status = response.status();
        let text = response.text().await.unwrap_or_default();
        return Err(format!("Jira File Upload Error {}: {}", status, text));
    }

    let data: Value = response.json().await.map_err(|e| e.to_string())?;
    Ok(serde_json::json!({ "success": true, "data": data }))
}

#[tauri::command]
pub async fn search_jira_users(app: AppHandle, query: String) -> Result<Value, String> {
    let data = jira_request(
        "GET",
        &format!(
            "/rest/api/2/user/search?query={}&maxResults=20",
            urlencoding::encode(&query)
        ),
        None,
        false,
        &app,
    )
    .await?;
    Ok(serde_json::json!({ "success": true, "data": data }))
}
