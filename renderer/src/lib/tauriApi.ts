import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";

export const api = {
  saveTask: (task: any) => invoke("save_task", { task }),
  loadTasks: () => invoke("load_tasks"),
  getDataPath: () => invoke("get_data_path"),
  openDataPath: () => invoke("open_data_path"),
  clearTodayTasks: () => invoke("clear_today_tasks"),
  notify: (title: string, body: string) => invoke("notify", { title, body }),
  closeApp: () => invoke("close_app"),
  loadConfig: () => invoke("load_config_cmd"),
  saveConfig: (config: any) => invoke("save_config_cmd", { config }),
  getCalendarCredentials: () => invoke("get_calendar_credentials"),
  saveCalendarCredentials: (creds: { user: string; pass: string }) =>
    invoke("save_calendar_credentials", {
      user: creds.user,
      pass: creds.pass,
    }),
  getJiraCredentials: () => invoke("get_jira_credentials"),
  saveJiraCredentials: (creds: { pass: string }) =>
    invoke("save_jira_credentials", { pass: creds.pass }),
  getJiraComponents: (projectKey: string) =>
    invoke("get_jira_components", { projectKey }),
  getJiraVersions: (projectKey: string) =>
    invoke("get_jira_versions", { projectKey }),
  getJiraFields: () => invoke("get_jira_fields"),
  getJiraLabels: (query: string) => invoke("get_jira_labels", { query }),
  getJiraCreateMeta: (projectKey: string) =>
    invoke("get_jira_createmeta", { projectKey }),
  getJiraEpics: (projectKey: string) =>
    invoke("get_jira_epics", { projectKey }),
  loadJiraTemplates: () => invoke("load_jira_templates"),
  saveJiraTemplate: (template: any) =>
    invoke("save_jira_template", { template }),
  deleteJiraTemplate: (name: string) =>
    invoke("delete_jira_template", { name }),
  createJiraIssue: (payload: any) => invoke("create_jira_issue", { payload }),
  uploadJiraAttachments: (issueKey: string, attachments: any[]) =>
    invoke("upload_jira_attachments", { issueKey, attachments }),
  closeJiraWindow: () => invoke("close_app"),
  setAlwaysOnTop: (value: boolean) => invoke("set_always_on_top", { value }),
  isAlwaysOnTop: () => invoke("is_always_on_top"),
  kanbanLogin: (email: string, password: string) =>
    invoke("kanban_login", { email, password }),
  kanbanGetUserInfo: (token: string) =>
    invoke("kanban_get_user_info", { token }),
  kanbanGetTasks: (userId: number, token: string) =>
    invoke("kanban_get_tasks", { userId, token }),
  kanbanGetTask: (taskId: number, token: string) =>
    invoke("kanban_get_task", { taskId, token }),
  kanbanUpdateTaskStage: (taskId: number, stageId: number, token: string) =>
    invoke("kanban_update_task_stage", { taskId, stageId, token }),
  kanbanLogWork: (
    taskId: number,
    begin: string,
    comment: string,
    time: string,
    token: string,
  ) => invoke("kanban_log_work", { taskId, begin, comment, time, token }),
  getKanbanBaseUrl: () => invoke("get_kanban_base_url"),
  openExternal: (url: string) => invoke("open_external", { url }),
  fetchCalendarCalDav: (url: string) =>
    invoke("fetch_calendar_caldav", { url }),
  updateCalendarRsvp: (data: { icsUrl: string; newStatus: string }) =>
    invoke("update_calendar_rsvp", {
      icsUrl: data.icsUrl,
      newStatus: data.newStatus,
    }),
  showMeetingReminderWindow: (data: any) =>
    invoke("show_meeting_reminder", { data }),
  setTimerCloseGuard: (isActive: boolean) =>
    invoke("set_timer_close_guard", { isActive }),
  onActiveTimerCloseBlocked: (cb: () => void) => {
    const unlisten = listen("active-timer-close-blocked", () => cb());
    return () => {
      unlisten.then((fn) => fn());
    };
  },
  onReminderClosed: (cb: () => void) => {
    const unlisten = listen("reminder-closed", () => cb());
    return () => {
      unlisten.then((fn) => fn());
    };
  },
  getWindowBounds: () => invoke("get_window_bounds"),
  setWindowBounds: (b: any) =>
    invoke("set_window_bounds", {
      x: b.x,
      y: b.y,
      width: b.width,
      height: b.height,
    }),
  loadWindowState: () => invoke("load_window_state"),
  saveWindowState: (state: any) => invoke("save_window_state", { nextState: state }),
  minimizeWindow: () => invoke("window_minimize"),
  toggleMaximize: () => invoke("window_toggle_maximize"),
  isWindowMaximized: () => invoke("window_is_maximized"),
  getAppVersion: () => invoke("get_app_version"),
  checkUpdates: (channel: string) => invoke("check_updates", { channel }),
  installUpdate: (channel: string) => invoke("install_update", { channel }),
  downloadUpdate: (url: string) => invoke("download_update", { url }),
  onUpdateProgress: (cb: (pct: number) => void) => {
    const unlisten = listen<number>("update-progress", (e) => cb(e.payload));
    return () => {
      unlisten.then((fn) => fn());
    };
  },
  onUpdateStatus: (cb: (status: { phase: string; message: string; version?: string }) => void) => {
    const unlisten = listen<{ phase: string; message: string; version?: string }>(
      "update-status",
      (e) => cb(e.payload),
    );
    return () => {
      unlisten.then((fn) => fn());
    };
  },
  loadNotes: () => invoke("load_notes"),
  saveNote: (note: { id?: string; title: string; content: string }) =>
    invoke("save_note", { id: note.id, title: note.title, content: note.content }),
  deleteNote: (id: string) => invoke("delete_note", { id }),
  openNotesFolder: () => invoke("open_notes_folder"),
  onHotkeyError: (cb: (key: string) => void) => {
    const unlisten = listen<string>("hotkey-error", (e) => cb(e.payload));
    return () => {
      unlisten.then((fn) => fn());
    };
  },
  onReminderStartTask: (cb: (task: any) => void) => {
    const unlisten = listen<any>("reminder-start-task", (e) => cb(e.payload));
    return () => {
      unlisten.then((fn) => fn());
    };
  },
  onStopAllSounds: (cb: () => void) => {
    const unlisten = listen("stop-all-sounds", () => cb());
    return () => {
      unlisten.then((fn) => fn());
    };
  },
};

export const tauriRuntime = {
  platform: navigator.platform,
  isTauri: true,
  versions: {
    tauri: "2.x",
    webview: navigator.userAgent,
  },
  windowControls: {
    minimize: () => invoke("window_minimize"),
    toggleMaximize: () => invoke("window_toggle_maximize"),
    close: () => invoke("window_close"),
    isMaximized: () => invoke<boolean>("window_is_maximized"),
    onMaximizeChange: (cb: (maximized: boolean) => void) => {
      const unlisten = listen<boolean>("window-maximize-changed", (e) =>
        cb(e.payload),
      );
      return () => {
        unlisten.then((fn) => fn());
      };
    },
  },
};
