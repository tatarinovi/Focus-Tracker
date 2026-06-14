export type TaskPriority = 'Critical' | 'High' | 'Medium' | 'Low';
export type TaskStatus = 'Backlog' | 'To Do' | 'In Progress' | 'Review' | 'Done';
export type RsvpStatus = 'accepted' | 'tentative' | 'declined' | 'not_responded';

export interface ChecklistItem { text: string; done: boolean }
export interface TaskComment { author: string; text: string; date: string }

export interface Task {
  id: number;
  title: string;
  url?: string;
  project: string;
  status: TaskStatus;
  priority: TaskPriority;
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
  'Critical': '#ef4444',
  'High': '#f97316',
  'Medium': '#eab308',
  'Low': '#6b7280',
};

export const PRIORITY_LABELS: Record<string, string> = {
  'Critical': 'Критический',
  'High': 'Высокий',
  'Medium': 'Средний',
  'Low': 'Низкий',
};

export const STATUS_LABELS: Record<string, string> = {
  'Backlog': 'Бэклог',
  'To Do': 'К выполнению',
  'In Progress': 'В работе',
  'Review': 'Ревью',
  'Done': 'Готово',
};
