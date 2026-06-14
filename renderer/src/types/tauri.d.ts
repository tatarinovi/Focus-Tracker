export {};

declare global {
  type TaskTrackerApi = {
    saveTask: (task: unknown) => Promise<boolean>;
    loadTasks: () => Promise<unknown[]>;
    getDataPath: () => Promise<string>;
    openDataPath: () => Promise<void>;
    clearTodayTasks: () => Promise<boolean>;
    notify: (title: string, body: string) => void;
    closeApp: () => void;
    loadConfig: () => Promise<Record<string, any>>;
    saveConfig: (config: Record<string, any>) => Promise<boolean>;
    getCalendarCredentials: () => Promise<{ user: string; pass: string }>;
    saveCalendarCredentials: (creds: { user: string; pass?: string }) => Promise<boolean>;
    getJiraCredentials: () => Promise<{ pass: string }>;
    saveJiraCredentials: (creds: { pass?: string }) => Promise<boolean>;
    getJiraComponents: (projectKey: string) => Promise<any>;
    getJiraVersions: (projectKey: string) => Promise<any>;
    getJiraFields: () => Promise<any>;
    getJiraLabels: (query: string) => Promise<any>;
    getJiraCreateMeta: (projectKey: string) => Promise<any>;
    getJiraEpics: (projectKey: string) => Promise<any>;
    loadJiraTemplates: () => Promise<any[]>;
    saveJiraTemplate: (template: unknown) => Promise<boolean>;
    deleteJiraTemplate: (name: string) => Promise<boolean>;
    createJiraIssue: (payload: unknown) => Promise<any>;
    uploadJiraAttachments: (issueKey: string, attachments: unknown[]) => Promise<any>;
    closeJiraWindow: () => Promise<void>;
    setAlwaysOnTop: (value: boolean) => Promise<boolean>;
    isAlwaysOnTop: () => Promise<boolean>;
    kanbanLogin: (email: string, password: string) => Promise<any>;
    kanbanGetUserInfo: (token: string) => Promise<any>;
    kanbanGetTasks: (userId: number | string, token: string) => Promise<any>;
    kanbanGetTask: (taskId: number | string, token: string) => Promise<any>;
    kanbanUpdateTaskStage: (taskId: number | string, stageId: number | string, token: string) => Promise<any>;
    kanbanLogWork: (taskId: number | string, begin: string, comment: string, time: number, token: string) => Promise<any>;
    getKanbanBaseUrl: () => Promise<string>;
    openExternal: (url: string) => Promise<void>;
    fetchCalendarCalDav: (url: string) => Promise<any>;
    updateCalendarRsvp: (data: { icsUrl: string; newStatus: string }) => Promise<any>;
    showMeetingReminderWindow: (data: unknown) => Promise<any>;
    getWindowBounds: () => Promise<{ x: number; y: number; width: number; height: number }>;
    setWindowBounds: (bounds: Partial<{ x: number; y: number; width: number; height: number }>) => Promise<void>;
    loadWindowState: () => Promise<Record<string, any>>;
    saveWindowState: (state: Record<string, any>) => Promise<boolean>;
    minimizeWindow: () => Promise<void>;
    toggleMaximize: () => Promise<boolean>;
    isWindowMaximized: () => Promise<boolean>;
    getAppVersion: () => Promise<string>;
    checkUpdates: (channel: string) => Promise<any>;
    installUpdate: (channel: string) => Promise<any>;
    downloadUpdate: (url: string) => Promise<any>;
    onUpdateProgress: (cb: (pct: number) => void) => () => void;
    onUpdateStatus: (cb: (status: { phase: string; message: string; version?: string }) => void) => () => void;
    loadNotes: () => Promise<any[]>;
    saveNote: (note: unknown) => Promise<any>;
    deleteNote: (id: string | number) => Promise<boolean>;
    openNotesFolder: () => Promise<void>;
    onHotkeyError: (cb: (key: string) => void) => void;
    onReminderStartTask: (cb: (task: any) => void) => void;
    onStopAllSounds: (cb: () => void) => void;
  };

  interface Window {
    api?: TaskTrackerApi;
    tauriRuntime?: {
      platform: string;
      isTauri: boolean;
      versions: { tauri: string; webview: string };
      windowControls: {
        minimize: () => Promise<void>;
        toggleMaximize: () => Promise<void>;
        close: () => Promise<void>;
        isMaximized: () => Promise<boolean>;
        onMaximizeChange: (cb: (isMax: boolean) => void) => () => void;
      };
    };
  }
}
