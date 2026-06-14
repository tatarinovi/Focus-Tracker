use chrono::Local;
use serde_json::Value;
use std::fs;
use std::path::{Path, PathBuf};
use tauri::{AppHandle, Manager};

const CURRENT_STORAGE_SCHEMA_VERSION: u64 = 1;

fn data_dir(app: &AppHandle) -> Result<PathBuf, String> {
    app.path().app_data_dir().map_err(|e| e.to_string())
}

fn config_path(app: &AppHandle) -> Result<PathBuf, String> {
    Ok(data_dir(app)?.join("config.json"))
}

fn migration_backup_dir(app: &AppHandle) -> Result<PathBuf, String> {
    let stamp = Local::now().format("%Y%m%d-%H%M%S").to_string();
    Ok(data_dir(app)?
        .join("Backups")
        .join(format!("migration-{stamp}")))
}

fn read_json_object(path: &Path) -> Result<Value, String> {
    if !path.exists() {
        return Ok(serde_json::json!({}));
    }

    let content = fs::read_to_string(path).map_err(|e| e.to_string())?;
    serde_json::from_str::<Value>(&content).map_err(|e| e.to_string())
}

fn write_json_atomic(path: &Path, value: &Value) -> Result<(), String> {
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    }

    let tmp_path = path.with_extension("tmp");
    let content = serde_json::to_string_pretty(value).map_err(|e| e.to_string())?;
    fs::write(&tmp_path, content).map_err(|e| e.to_string())?;

    let original = if path.exists() {
        Some(fs::read(path).map_err(|e| e.to_string())?)
    } else {
        None
    };

    if path.exists() {
        fs::remove_file(path).map_err(|e| e.to_string())?;
    }

    match fs::rename(&tmp_path, path) {
        Ok(()) => Ok(()),
        Err(error) => {
            if let Some(original) = original {
                let _ = fs::write(path, original);
            }
            Err(error.to_string())
        }
    }
}

fn backup_file(source: &Path, backup_dir: &Path) -> Result<Option<PathBuf>, String> {
    if !source.exists() {
        return Ok(None);
    }

    fs::create_dir_all(backup_dir).map_err(|e| e.to_string())?;
    let file_name = source
        .file_name()
        .ok_or_else(|| "Invalid storage file name".to_string())?;
    let target = backup_dir.join(file_name);
    fs::copy(source, &target).map_err(|e| e.to_string())?;
    Ok(Some(target))
}

pub fn run_storage_migrations_internal(app: &AppHandle) -> Result<Value, String> {
    let config_path = config_path(app)?;
    let mut config = read_json_object(&config_path)?;
    let current_version = config
        .get("storage_schema_version")
        .and_then(|v| v.as_u64())
        .unwrap_or(0);

    if current_version >= CURRENT_STORAGE_SCHEMA_VERSION {
        return Ok(serde_json::json!({
            "success": true,
            "schemaVersion": current_version,
            "changed": false
        }));
    }

    let backup_dir = migration_backup_dir(app)?;
    let backup_path = backup_file(&config_path, &backup_dir)?;

    let result = (|| -> Result<(), String> {
        let obj = config
            .as_object_mut()
            .ok_or_else(|| "Local config has unexpected format".to_string())?;
        obj.insert(
            "storage_schema_version".to_string(),
            Value::Number(CURRENT_STORAGE_SCHEMA_VERSION.into()),
        );
        obj.insert(
            "storage_migrated_at".to_string(),
            Value::String(Local::now().to_rfc3339()),
        );
        write_json_atomic(&config_path, &config)
    })();

    match result {
        Ok(()) => Ok(serde_json::json!({
            "success": true,
            "schemaVersion": CURRENT_STORAGE_SCHEMA_VERSION,
            "changed": true,
            "backupPath": backup_path
                .as_ref()
                .map(|p| p.to_string_lossy().to_string())
        })),
        Err(error) => Ok(serde_json::json!({
            "success": false,
            "error": error,
            "backupPath": backup_dir.to_string_lossy().to_string(),
            "dataPath": data_dir(app)?.to_string_lossy().to_string()
        })),
    }
}

#[tauri::command]
pub async fn run_storage_migrations(app: AppHandle) -> Result<Value, String> {
    run_storage_migrations_internal(&app)
}

#[tauri::command]
pub async fn open_app_data_dir(app: AppHandle) -> Result<(), String> {
    opener::open(data_dir(&app)?).map_err(|e| e.to_string())
}
