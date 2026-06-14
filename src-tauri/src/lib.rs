use tauri::{Emitter, Manager};

mod commands;

use commands::reminder::ReminderState;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    env_logger::init();

    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_notification::init())
        .plugin(tauri_plugin_global_shortcut::Builder::new().build())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .plugin(tauri_plugin_process::init())
        .manage(ReminderState::default())
        .manage(commands::updates::UpdaterState::default())
        .setup(|app| {
            // Emit maximize state changes
            if let Some(window) = app.get_webview_window("main") {
                let w = window.clone();
                window.on_window_event(move |event| {
                    if let tauri::WindowEvent::Resized(_) = event {
                        if let Ok(is_max) = w.is_maximized() {
                            let _ = w.emit("window-maximize-changed", is_max);
                        }
                    }
                });
            }

            // Emit initial maximize state
            if let Some(window) = app.get_webview_window("main") {
                let is_max = window.is_maximized().unwrap_or(false);
                let _ = window.emit("window-maximize-changed", is_max);
            }

            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            // Tasks
            commands::tasks::save_task,
            commands::tasks::load_tasks,
            commands::tasks::get_data_path,
            commands::tasks::open_data_path,
            commands::tasks::clear_today_tasks,
            // Config
            commands::config::load_config_cmd,
            commands::config::save_config_cmd,
            commands::config::load_window_state,
            commands::config::save_window_state,
            // Credentials
            commands::credentials::save_calendar_credentials,
            commands::credentials::get_calendar_credentials,
            commands::credentials::save_jira_credentials,
            commands::credentials::get_jira_credentials,
            // Kanban
            commands::kanban::kanban_login,
            commands::kanban::kanban_get_user_info,
            commands::kanban::kanban_get_tasks,
            commands::kanban::kanban_get_task,
            commands::kanban::kanban_update_task_stage,
            commands::kanban::kanban_log_work,
            commands::kanban::get_kanban_base_url,
            // Jira
            commands::jira::get_jira_components,
            commands::jira::get_jira_versions,
            commands::jira::get_jira_fields,
            commands::jira::get_jira_labels,
            commands::jira::get_jira_createmeta,
            commands::jira::get_jira_epics,
            commands::jira::create_jira_issue,
            commands::jira::upload_jira_attachments,
            // Calendar
            commands::calendar::fetch_calendar_caldav,
            commands::calendar::update_calendar_rsvp,
            // Notes
            commands::notes::load_notes,
            commands::notes::save_note,
            commands::notes::delete_note,
            commands::notes::open_notes_folder,
            // Window
            commands::window::window_minimize,
            commands::window::window_toggle_maximize,
            commands::window::window_close,
            commands::window::window_is_maximized,
            commands::window::set_always_on_top,
            commands::window::is_always_on_top,
            commands::window::get_window_bounds,
            commands::window::set_window_bounds,
            // System
            commands::system::notify,
            commands::system::open_external,
            commands::system::close_app,
            // Updates
            commands::updates::get_app_version,
            commands::updates::check_updates,
            commands::updates::install_update,
            commands::updates::download_update,
            commands::updates::finish_startup,
            commands::updates::startup_flow,
            commands::storage::run_storage_migrations,
            commands::storage::open_app_data_dir,
            // Reminder
            commands::reminder::show_meeting_reminder,
            commands::reminder::get_reminder_data,
            commands::reminder::destroy_reminder,
            commands::reminder::reminder_join_meeting,
            // Jira Templates
            commands::jira_templates::load_jira_templates,
            commands::jira_templates::save_jira_template,
            commands::jira_templates::delete_jira_template,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
