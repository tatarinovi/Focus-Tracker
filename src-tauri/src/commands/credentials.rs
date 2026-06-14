use super::config::{load_config, save_config_to_disk};
use base64::Engine;
use tauri::AppHandle;

fn decode_base64(value: &str) -> Option<String> {
    base64::engine::general_purpose::STANDARD
        .decode(value)
        .ok()
        .and_then(|decoded| String::from_utf8(decoded).ok())
}

fn read_keyring(service: &str) -> Option<String> {
    keyring::Entry::new("focus-tracker", service)
        .ok()
        .and_then(|entry| entry.get_password().ok())
}

fn decrypt_stored_value(value: &str, service: &str) -> String {
    if value.is_empty() {
        return String::new();
    }

    if let Some(token) = value.strip_prefix("kr:") {
        if let Some(pass) = read_keyring(token) {
            return pass;
        }
        if let Some(pass) = decode_base64(token) {
            return pass;
        }
        if let Some(pass) = read_keyring(service) {
            return pass;
        }
        return String::new();
    }

    if let Some(pass) = decode_base64(value) {
        return pass;
    }

    read_keyring(service)
        .or_else(|| read_keyring("cal-password"))
        .or_else(|| read_keyring(&format!("cred-{}", &value[..8.min(value.len())])))
        .unwrap_or_else(|| value.to_string())
}

fn encrypt_and_store(value: &str, service: &str) -> String {
    if value.is_empty() {
        return String::new();
    }
    // Use keyring for secure storage
    if let Ok(entry) = keyring::Entry::new("focus-tracker", service) {
        if entry.set_password(value).is_ok() {
            return format!("kr:{}", service);
        }
    }
    // Fallback: base64 encode (not secure, but functional)
    base64::engine::general_purpose::STANDARD.encode(value.as_bytes())
}

#[tauri::command]
pub async fn save_calendar_credentials(
    app: AppHandle,
    user: String,
    pass: String,
) -> Result<bool, String> {
    let mut config = load_config(&app);
    config["caldav_user"] = serde_json::Value::String(user);
    if !pass.is_empty() {
        config["caldav_pass"] =
            serde_json::Value::String(encrypt_and_store(&pass, "caldav-password"));
    } else {
        config["caldav_pass"] = serde_json::Value::String(String::new());
    }
    save_config_to_disk(&app, &config)?;
    Ok(true)
}

#[tauri::command]
pub async fn get_calendar_credentials(app: AppHandle) -> Result<serde_json::Value, String> {
    let config = load_config(&app);
    let user = config
        .get("caldav_user")
        .and_then(|v| v.as_str())
        .unwrap_or("")
        .to_string();
    let pass_raw = config
        .get("caldav_pass")
        .and_then(|v| v.as_str())
        .unwrap_or("");
    let pass = if pass_raw.is_empty() {
        String::new()
    } else {
        decrypt_stored_value(pass_raw, "caldav-password")
    };
    Ok(serde_json::json!({ "user": user, "pass": pass }))
}

#[tauri::command]
pub async fn save_jira_credentials(app: AppHandle, pass: String) -> Result<bool, String> {
    let mut config = load_config(&app);
    if !pass.is_empty() {
        config["jira_pass"] = serde_json::Value::String(encrypt_and_store(&pass, "jira-password"));
    } else {
        config["jira_pass"] = serde_json::Value::String(String::new());
    }
    save_config_to_disk(&app, &config)?;
    Ok(true)
}

#[tauri::command]
pub async fn get_jira_credentials(app: AppHandle) -> Result<serde_json::Value, String> {
    let config = load_config(&app);
    let pass_raw = config
        .get("jira_pass")
        .and_then(|v| v.as_str())
        .unwrap_or("");
    let pass = if pass_raw.is_empty() {
        String::new()
    } else {
        decrypt_stored_value(pass_raw, "jira-password")
    };
    Ok(serde_json::json!({ "pass": pass }))
}

pub fn get_decrypted_password(config: &serde_json::Value, key: &str) -> String {
    config
        .get(key)
        .and_then(|v| v.as_str())
        .filter(|s| !s.is_empty())
        .map(|s| {
            let service = match key {
                "caldav_pass" => "caldav-password",
                "jira_pass" => "jira-password",
                _ => key,
            };
            decrypt_stored_value(s, service)
        })
        .unwrap_or_default()
}
