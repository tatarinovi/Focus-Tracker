use base64::Engine;
use reqwest::Client;
use serde_json::Value;
use tauri::AppHandle;

use super::config::load_config;
use super::credentials::get_decrypted_password;

#[tauri::command]
pub async fn fetch_calendar_caldav(app: AppHandle, url: String) -> Result<Value, String> {
    // Validate URL
    if !url.starts_with("http://") && !url.starts_with("https://") {
        return Err("Invalid protocol".to_string());
    }

    let config = load_config(&app);
    let user = config
        .get("caldav_user")
        .and_then(|v| v.as_str())
        .unwrap_or("")
        .to_string();
    let pass = get_decrypted_password(&config, "caldav_pass");

    let client = Client::new();
    let mut headers = reqwest::header::HeaderMap::new();
    headers.insert(
        "User-Agent",
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) TaskTracker/1.0"
            .parse()
            .unwrap(),
    );
    headers.insert("Accept", "text/calendar, text/html, */*".parse().unwrap());

    if !user.is_empty() && !pass.is_empty() {
        let auth = base64::engine::general_purpose::STANDARD
            .encode(format!("{}:{}", user, pass).as_bytes());
        headers.insert("Authorization", format!("Basic {}", auth).parse().unwrap());
    }

    // Try fetching as-is first (with ?export for trailing slash URLs)
    let fetch_url = if url.ends_with('/') {
        format!("{}?export", url)
    } else {
        url.clone()
    };

    let response = client
        .get(&fetch_url)
        .headers(headers.clone())
        .send()
        .await
        .map_err(|e| e.to_string())?;

    if !response.status().is_success() {
        let status = response.status();
        let text = response.text().await.unwrap_or_default();
        return Err(format!("HTTP {}: {}", status, text));
    }

    let content_type = response
        .headers()
        .get("content-type")
        .and_then(|v| v.to_str().ok())
        .unwrap_or("")
        .to_string();
    let text = response.text().await.map_err(|e| e.to_string())?;

    // Check if response is a directory listing
    if content_type.contains("text/plain") && text.trim().contains(".ics") {
        let lines: Vec<&str> = text
            .trim()
            .split('\n')
            .map(|l| l.trim())
            .filter(|l| l.ends_with(".ics"))
            .collect();

        let parsed_url = url::Url::parse(&url).map_err(|e| e.to_string())?;
        let base_url = format!(
            "{}://{}",
            parsed_url.scheme(),
            parsed_url.host_str().unwrap_or("")
        );

        let mut all_events: Vec<Value> = Vec::new();

        // Fetch in batches of 10
        for batch in lines.chunks(10) {
            let mut handles = Vec::new();
            for ics_path in batch {
                let ics_url = format!("{}{}", base_url, ics_path);
                let h = client.get(&ics_url).headers(headers.clone()).send();
                handles.push((ics_url, h));
            }
            for (ics_url, handle) in handles {
                if let Ok(resp) = handle.await {
                    if resp.status().is_success() {
                        if let Ok(ics_text) = resp.text().await {
                            // Parse basic VEVENT entries from ICS text
                            let events = parse_ics_text(&ics_text, &ics_url);
                            all_events.extend(events);
                        }
                    }
                }
            }
        }

        return Ok(serde_json::json!({ "success": true, "data": all_events }));
    }

    // Standard ICS response
    let events = parse_ics_text(&text, &url);
    Ok(serde_json::json!({ "success": true, "data": events }))
}

fn decode_ics_text(value: &str) -> String {
    let mut output = String::with_capacity(value.len());
    let mut chars = value.chars();

    while let Some(ch) = chars.next() {
        if ch != '\\' {
            output.push(ch);
            continue;
        }

        match chars.next() {
            Some('n') | Some('N') => output.push('\n'),
            Some(',') => output.push(','),
            Some(';') => output.push(';'),
            Some('\\') => output.push('\\'),
            Some(other) => {
                output.push('\\');
                output.push(other);
            }
            None => output.push('\\'),
        }
    }

    output
}

fn parse_ics_address_params(header: &str, value: &str) -> Value {
    let email = value.trim_start_matches("mailto:").trim().to_string();
    let mut cn = None::<String>;
    let mut partstat = None::<String>;

    for part in header.split(';').skip(1) {
        if let Some((key, raw)) = part.split_once('=') {
            match key.to_uppercase().as_str() {
                "CN" => cn = Some(decode_ics_text(raw)),
                "PARTSTAT" => partstat = Some(raw.to_string()),
                _ => {}
            }
        }
    }

    let name = cn.unwrap_or_else(|| email.clone());
    let mut obj = serde_json::Map::new();
    obj.insert("name".to_string(), Value::String(name));
    if !email.is_empty() {
        obj.insert("email".to_string(), Value::String(email));
    }
    if let Some(status) = partstat {
        obj.insert("partstat".to_string(), Value::String(status));
    }
    Value::Object(obj)
}

fn parse_ics_text(text: &str, ics_url: &str) -> Vec<Value> {
    let mut events = Vec::new();
    let mut in_event = false;
    let mut current_event: std::collections::HashMap<String, String> =
        std::collections::HashMap::new();
    let mut current_attendees: Vec<String> = Vec::new();

    let mut unfolded_lines: Vec<String> = Vec::new();
    for line in text.lines() {
        if line.starts_with(' ') || line.starts_with('\t') {
            if let Some(prev) = unfolded_lines.last_mut() {
                prev.push_str(line.trim());
            }
        } else {
            unfolded_lines.push(line.to_string());
        }
    }

    for line in unfolded_lines {
        let trimmed = line.trim();
        if trimmed == "BEGIN:VEVENT" {
            in_event = true;
            current_event.clear();
            current_attendees.clear();
        } else if trimmed == "END:VEVENT" {
            if in_event {
                if current_event
                    .get("STATUS")
                    .map(|status| status.eq_ignore_ascii_case("CANCELLED"))
                    .unwrap_or(false)
                {
                    in_event = false;
                    continue;
                }

                let mut event = serde_json::Map::new();
                event.insert("type".to_string(), Value::String("VEVENT".to_string()));
                if let Some(summary) = current_event.get("SUMMARY") {
                    event.insert(
                        "summary".to_string(),
                        Value::String(decode_ics_text(summary)),
                    );
                }
                if let Some(desc) = current_event.get("DESCRIPTION") {
                    event.insert(
                        "description".to_string(),
                        Value::String(decode_ics_text(desc)),
                    );
                }
                if let Some(loc) = current_event.get("LOCATION") {
                    event.insert("location".to_string(), Value::String(decode_ics_text(loc)));
                }
                if let Some(url) = current_event.get("URL") {
                    event.insert("url".to_string(), Value::String(decode_ics_text(url)));
                }
                if let Some(uid) = current_event.get("UID") {
                    event.insert("uid".to_string(), Value::String(uid.clone()));
                }
                if let Some(start) = current_event.get("DTSTART") {
                    event.insert("start".to_string(), Value::String(start.clone()));
                }
                if let Some(end) = current_event.get("DTEND") {
                    event.insert("end".to_string(), Value::String(end.clone()));
                }
                if let Some(duration) = current_event.get("DURATION") {
                    event.insert("duration".to_string(), Value::String(duration.clone()));
                }
                if let Some(rrule) = current_event.get("RRULE") {
                    event.insert("rrule".to_string(), Value::String(rrule.clone()));
                }
                if let Some(exdate) = current_event.get("EXDATE") {
                    let dates: Vec<Value> = exdate
                        .split(',')
                        .map(|part| Value::String(part.trim().to_string()))
                        .filter(|part| part.as_str().unwrap_or("").len() > 0)
                        .collect();
                    if !dates.is_empty() {
                        event.insert("exdates".to_string(), Value::Array(dates));
                    }
                }
                if let Some(rdate) = current_event.get("RDATE") {
                    let dates: Vec<Value> = rdate
                        .split(',')
                        .map(|part| Value::String(part.trim().to_string()))
                        .filter(|part| part.as_str().unwrap_or("").len() > 0)
                        .collect();
                    if !dates.is_empty() {
                        event.insert("rdates".to_string(), Value::Array(dates));
                    }
                }
                if let Some(recurrence_id) = current_event.get("RECURRENCE-ID") {
                    event.insert(
                        "recurrenceId".to_string(),
                        Value::String(recurrence_id.clone()),
                    );
                }
                if let Some(status) = current_event.get("STATUS") {
                    event.insert("status".to_string(), Value::String(status.clone()));
                }
                if !current_attendees.is_empty() {
                    let attendees: Vec<Value> = current_attendees
                        .iter()
                        .filter_map(|line| {
                            let (header, value) = line.split_once(':')?;
                            Some(parse_ics_address_params(header, value))
                        })
                        .collect();
                    if !attendees.is_empty() {
                        event.insert("attendees".to_string(), Value::Array(attendees));
                    }
                }
                event.insert("icsUrl".to_string(), Value::String(ics_url.to_string()));
                events.push(Value::Object(event));
            }
            in_event = false;
        } else if in_event {
            if let Some((key, value)) = trimmed.split_once(':') {
                let property = key.split(';').next().unwrap_or(key);
                if property == "ATTENDEE" {
                    current_attendees.push(trimmed.to_string());
                } else if property == "EXDATE" || property == "RDATE" {
                    if let Some(existing) = current_event.get_mut(property) {
                        existing.push(',');
                        existing.push_str(value);
                    } else {
                        current_event.insert(property.to_string(), value.to_string());
                    }
                } else {
                    current_event.insert(property.to_string(), value.to_string());
                }
            }
        }
    }

    events
}

#[tauri::command]
pub async fn update_calendar_rsvp(
    app: AppHandle,
    ics_url: String,
    new_status: String,
) -> Result<Value, String> {
    let config = load_config(&app);
    let user = config
        .get("caldav_user")
        .and_then(|v| v.as_str())
        .unwrap_or("")
        .to_string();
    let pass = get_decrypted_password(&config, "caldav_pass");

    let client = Client::new();
    let mut headers = reqwest::header::HeaderMap::new();
    headers.insert("User-Agent", "Mozilla/5.0 TaskTracker/1.0".parse().unwrap());
    headers.insert("Accept", "text/calendar".parse().unwrap());

    if !user.is_empty() && !pass.is_empty() {
        let auth = base64::engine::general_purpose::STANDARD
            .encode(format!("{}:{}", user, pass).as_bytes());
        headers.insert("Authorization", format!("Basic {}", auth).parse().unwrap());
    }

    // Fetch original ICS
    let resp = client
        .get(&ics_url)
        .headers(headers.clone())
        .send()
        .await
        .map_err(|e| e.to_string())?;

    if !resp.status().is_success() {
        return Err(format!("Fetch failed: {}", resp.status()));
    }

    let etag = resp
        .headers()
        .get("etag")
        .and_then(|v| v.to_str().ok())
        .map(|s| s.to_string());
    let mut ics_text = resp.text().await.map_err(|e| e.to_string())?;

    // Replace PARTSTAT for user's ATTENDEE line
    let status = match new_status.to_lowercase().as_str() {
        "accepted" => "ACCEPTED".to_string(),
        "tentative" => "TENTATIVE".to_string(),
        "declined" => "DECLINED".to_string(),
        _ => new_status.to_uppercase(),
    };
    let email_escaped = regex::escape(&user);
    let attendee_regex = format!(r"(ATTENDEE;[^\n]*{}[^\n]*)", email_escaped);
    if let Ok(re) = regex::Regex::new(&attendee_regex) {
        if let Some(mat) = re.find(&ics_text) {
            let mut attendee_line = mat.as_str().to_string();
            if attendee_line.to_uppercase().contains("PARTSTAT=") {
                let partstat_re = regex::Regex::new(r"PARTSTAT=[A-Z-]+").unwrap();
                attendee_line = partstat_re
                    .replace(&attendee_line, format!("PARTSTAT={}", status))
                    .to_string();
            } else {
                attendee_line = attendee_line
                    .replace("ATTENDEE;", &format!("ATTENDEE;PARTSTAT={};", status));
            }
            ics_text = ics_text.replace(mat.as_str(), &attendee_line);
        }
    }

    // Increment SEQUENCE
    let seq_re = regex::Regex::new(r"SEQUENCE:(\d+)").unwrap();
    ics_text = seq_re
        .replace(&ics_text, |caps: &regex::Captures| {
            let n: i32 = caps[1].parse().unwrap_or(0);
            format!("SEQUENCE:{}", n + 1)
        })
        .to_string();

    // Update DTSTAMP
    let now_ics = chrono::Utc::now().format("%Y%m%dT%H%M%SZ").to_string();
    let stamp_re = regex::Regex::new(r"DTSTAMP:\d+T\d+Z").unwrap();
    ics_text = stamp_re
        .replace(&ics_text, format!("DTSTAMP:{}", now_ics))
        .to_string();

    // PUT back
    let mut put_headers = headers;
    put_headers.insert(
        "Content-Type",
        "text/calendar; charset=utf-8".parse().unwrap(),
    );
    if let Some(etag_val) = etag {
        if let Ok(etag_header) = etag_val.parse() {
            put_headers.insert("If-Match", etag_header);
        }
    }

    let put_resp = client
        .put(&ics_url)
        .headers(put_headers)
        .body(ics_text)
        .send()
        .await
        .map_err(|e| e.to_string())?;

    if !put_resp.status().is_success() {
        let err_body = put_resp.text().await.unwrap_or_default();
        return Err(format!("PUT failed: {}", err_body));
    }

    Ok(serde_json::json!({ "success": true }))
}
