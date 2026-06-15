export type TaskPriority = string;

export const KANBAN_PRIORITY_ORDER = [
  "Критический",
  "Высокий",
  "Средний",
  "Низкий",
] as const;

export const KANBAN_DEFAULT_PRIORITY_NAMES: Record<number, string> = {
  1: "Низкий",
  2: "Средний",
  3: "Высокий",
  4: "Критический",
};
export type TaskStatus = string;

export const KANBAN_STAGE_ORDER = [
  "Новые",
  "Бэклог",
  "В работе",
  "Ревью",
  "Тест",
  "Релиз",
  "Решена",
  "Поддержка",
  "Фикс",
] as const;

export const KANBAN_STAGE_IDS = {
  IN_PROGRESS: 2,
  RESOLVED: 3,
} as const;

export const KANBAN_DEFAULT_STAGE_NAMES: Record<number, string> = {
  1: "Новые",
  2: "В работе",
  3: "Решена",
  4: "Ревью",
  5: "Тест",
  6: "Релиз",
  7: "Бэклог",
};
export type RsvpStatus = 'accepted' | 'tentative' | 'declined' | 'not_responded';

export interface ChecklistItem { text: string; done: boolean }
export interface TaskComment { author: string; text: string; date: string }

export interface Task {
  id: number;
  title: string;
  url?: string;
  detailsLoaded?: boolean;
  project: string;
  status: TaskStatus;
  stageId?: number;
  priority: TaskPriority;
  priorityId?: number;
  deadline: string;
  assignee: string;
  isPinned: boolean;
  isSupertask: boolean;
  estimate: number;
  spentTime: number;
  description: string;
  checklist: ChecklistItem[];
  comments: TaskComment[];
}

export interface HistoryEntry {
  id: number;
  taskId: number;
  taskTitle: string;
  project: string;
  startTime: string;
  endTime: string;
  duration: number;
  roundedDuration: number;
  comment: string;
  date: string;
}

export interface CalendarEvent {
  id: number;
  title: string;
  start: string;
  end: string;
  date: string;
  meetingUrl: string | null;
  meetingProvider: string | null;
  attendees: string[];
  rsvpStatus: RsvpStatus;
  description: string;
}

export interface Note {
  id: number | string;
  title: string;
  content: string;
  updatedAt: string;
}

export interface AppNotification {
  id: number;
  type: string;
  text: string;
  timestamp: string;
  isRead: boolean;
  taskId?: number;
}

export function formatSeconds(totalSeconds: number): string {
  const h = Math.floor(totalSeconds / 3600);
  const m = Math.floor((totalSeconds % 3600) / 60);
  const s = totalSeconds % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

export function formatMinutes(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (h === 0) return `${m}м`;
  if (m === 0) return `${h}ч`;
  return `${h}ч ${m}м`;
}

export function detectMeetingProvider(url: string | null): string | null {
  if (!url) return null;
  if (/meet\.google\.com/i.test(url)) return 'google_meet';
  if (/zoom\.us/i.test(url)) return 'zoom';
  if (/teams\.microsoft\.com/i.test(url)) return 'teams';
  if (/telemost\.yandex/i.test(url)) return 'telemost';
  return null;
}

export function roundToQuarter(minutes: number): number {
  return Math.ceil(minutes / 15) * 15;
}

export const PROJECT_COLORS: Record<string, string> = {
  'MAG': '#6366f1',
  'LK': '#10b981',
  'Mobile App': '#f59e0b',
  'Backend Platform': '#3b82f6',
  'Internal Tools': '#8b5cf6',
};

export const PRIORITY_COLORS: Record<string, string> = {
  'Критический': '#ef4444',
  'Высокий': '#f97316',
  'Средний': '#eab308',
  'Низкий': '#6b7280',
  Critical: '#ef4444',
  High: '#f97316',
  Medium: '#eab308',
  Low: '#6b7280',
};

export function taskPriorityLabel(priority: string) {
  return priority || "—";
}

export function priorityColorForTask(priority: string) {
  if (PRIORITY_COLORS[priority]) return PRIORITY_COLORS[priority];
  const value = priority.trim().toLowerCase();
  if (value.includes("крит")) return "#ef4444";
  if (value.includes("выс")) return "#f97316";
  if (value.includes("сред")) return "#eab308";
  return "#6b7280";
}

export function sortKanbanPriorities(priorities: string[]) {
  const order = new Map<string, number>(KANBAN_PRIORITY_ORDER.map((name, index) => [name, index]));
  return [...new Set(priorities.filter(Boolean))].sort((a, b) => {
    const left = order.get(a) ?? Number.MAX_SAFE_INTEGER;
    const right = order.get(b) ?? Number.MAX_SAFE_INTEGER;
    if (left !== right) return left - right;
    return a.localeCompare(b, "ru");
  });
}

/** @deprecated Используйте taskPriorityLabel — приоритет уже приходит из API Kanban. */
export const PRIORITY_LABELS: Record<string, string> = Object.fromEntries(
  KANBAN_PRIORITY_ORDER.map((name) => [name, name]),
);

export function taskStatusLabel(status: string) {
  return status || "—";
}

export function sortKanbanStatuses(statuses: string[]) {
  const order = new Map<string, number>(KANBAN_STAGE_ORDER.map((name, index) => [name, index]));
  return [...new Set(statuses.filter(Boolean))].sort((a, b) => {
    const left = order.get(a) ?? Number.MAX_SAFE_INTEGER;
    const right = order.get(b) ?? Number.MAX_SAFE_INTEGER;
    if (left !== right) return left - right;
    return a.localeCompare(b, "ru");
  });
}

export function isKanbanDoneStatus(status: string) {
  const value = status.trim().toLowerCase();
  return value.includes("реш") || value.includes("релиз") || value.includes("done") || value.includes("вып");
}

export function isKanbanPreWorkStage(task: Pick<Task, "status" | "stageId">) {
  if (task.stageId === 1 || task.stageId === 7) return true;
  const value = task.status.trim().toLowerCase();
  return value.includes("нов") || value.includes("бэклог") || value.includes("backlog") || value.includes("to do");
}

/** @deprecated Используйте taskStatusLabel — статус уже приходит из API Kanban. */
export const STATUS_LABELS: Record<string, string> = Object.fromEntries(
  KANBAN_STAGE_ORDER.map((name) => [name, name]),
);
