import { createContext, useContext, useReducer, useEffect, ReactNode, useCallback, useRef } from 'react';
import { Task, HistoryEntry, Note, AppNotification, CalendarEvent, TaskCompletion, roundToQuarter, createTaskCompletion, isKanbanDoneStatus } from '@/data/mockData';
import { hydrateKanbanTasksMissingDetails, loadRealCalendarEvents, loadRealHistory, loadRealKanbanTaskDetail, loadRealKanbanTasks, loadRealNotes, mergeKanbanTaskList, resolveKanbanStageName, savePinnedTaskIds } from '@/lib/tauriDataApi';
import { KANBAN_STAGE_IDS, isKanbanPreWorkStage } from '@/data/mockData';
import { toast } from 'sonner';
import { AppSoundKey, playAppSound, setAppAudioVolume, soundToast, stopAllSounds } from '@/lib/appAudio';
import {
  bitrixTimemanClose,
  bitrixTimemanOpen,
  bitrixTimemanPause,
  bitrixTimemanResume,
  bitrixTimemanStatus,
  isBitrixConfigured,
} from '@/lib/bitrixTimeman';
import { BitrixTimemanError } from '@/lib/bitrixTypes';
import type { BitrixTimemanStatusSnapshot } from '@/lib/bitrixTypes';

export interface TimerState {
  status: 'idle' | 'running' | 'paused';
  activeTask: Task | null;
  elapsed: number;
}

export interface PomodoroState {
  phase: 'focus' | 'break';
  remaining: number;
  isRunning: boolean;
  session: number;
  focusDuration: number;
  breakDuration: number;
  completionCount: number;
}

export type BitrixSyncStatus = 'idle' | 'syncing' | 'online' | 'error';
export type BitrixDayPhase = 'not_started' | 'working' | 'break' | 'finished';

/** @deprecated use BitrixSyncStatus */
export type LunchBitrixStatus = BitrixSyncStatus;

export interface BitrixTimemanState {
  phase: BitrixDayPhase;
  syncStatus: BitrixSyncStatus;
  dayStartedAt: number | null;
  breakStartedAt: number | null;
  dayEndedAt: number | null;
  workElapsed: number;
  breakElapsed: number;
  /** Суммарное время перерывов за день (аналог TIME_LEAKS в Bitrix24). */
  breakUsedTodaySeconds: number;
  breakLimitMinutes: number;
  workDayLimitHours: number;
  previousTask: Task | null;
  /** Секунды таймера задачи на момент ухода на перерыв. */
  pausedElapsed: number;
  errorMessage: string | null;
  portalUrl: string | null;
}

function defaultBitrixTimemanState(): BitrixTimemanState {
  return {
    phase: 'not_started',
    syncStatus: 'idle',
    dayStartedAt: null,
    breakStartedAt: null,
    dayEndedAt: null,
    workElapsed: 0,
    breakElapsed: 0,
    breakUsedTodaySeconds: 0,
    breakLimitMinutes: 60,
    workDayLimitHours: 8,
    previousTask: null,
    pausedElapsed: 0,
    errorMessage: null,
    portalUrl: null,
  };
}

function restoreBitrixTimemanState(value: unknown): BitrixTimemanState {
  const base = defaultBitrixTimemanState();
  if (!value || typeof value !== 'object') return base;
  const saved = value as Partial<BitrixTimemanState> & {
    active?: boolean;
    bitrix?: { status?: BitrixSyncStatus; breakActive?: boolean };
    lunchElapsed?: number;
    startTime?: number | null;
  };

  if ('phase' in saved && saved.phase) {
    const merged = { ...base, ...saved };
    if (merged.phase === 'break' && (saved.breakElapsed ?? 0) > 0) {
      return {
        ...merged,
        breakUsedTodaySeconds: (merged.breakUsedTodaySeconds ?? 0) + (saved.breakElapsed ?? 0),
        breakElapsed: 0,
      };
    }
    return merged;
  }

  if (saved.active) {
    return {
      ...base,
      phase: 'break',
      syncStatus: saved.bitrix?.status ?? 'online',
      breakStartedAt: saved.startTime ?? Date.now(),
      breakElapsed: saved.lunchElapsed ?? 0,
      previousTask: saved.previousTask ?? null,
      pausedElapsed: saved.lunchElapsed ?? 0,
    };
  }

  return base;
}

export interface Settings {
  theme: 'light' | 'dark' | 'system';
  accentColor: string;
  alwaysOnTop: boolean;
  compactMode: boolean;
  autostart: boolean;
  startMinimized: boolean;
  commandPalette: boolean;
  pomodoro: { focusDuration: number; breakDuration: number; sound: boolean; visualFlash: boolean };
  audio: { volume: number };
  kanban: { apiUrl: string; email: string; password: string };
  calendar: { url: string; login: string; password: string; reminders: boolean };
  jira: { url: string; login: string; token: string; password: string; defaultProject: string };
  resonance: { login: string; password: string; connected: boolean; lastChecked: string };
  bitrix: { url: string; webhook: string; connected: boolean; lastChecked: string };
}

interface AppState {
  tasks: Task[];
  history: HistoryEntry[];
  taskCompletions: TaskCompletion[];
  notes: Note[];
  calendarEvents: CalendarEvent[];
  notifications: AppNotification[];
  timer: TimerState;
  pomodoro: PomodoroState;
  bitrixTimeman: BitrixTimemanState;
  settings: Settings;
  stopDialogOpen: boolean;
  switchDialogOpen: boolean;
  pendingSwitchTask: Task | null;
  lunchRestoreOpen: boolean;
  notifOpen: boolean;
  compactMode: boolean;
  selectedDate: string;
  loading: { kanban: boolean; calendar: boolean; jira: boolean; notes: boolean };
  config: Record<string, any> | null;
}

type Action =
  | { type: 'START_TIMER'; task: Task }
  | { type: 'PAUSE_TIMER' }
  | { type: 'RESUME_TIMER' }
  | { type: 'TICK' }
  | { type: 'POMODORO_TICK' }
  | { type: 'TIMEMAN_TICK' }
  | { type: 'OPEN_STOP_DIALOG' }
  | { type: 'CLOSE_STOP_DIALOG' }
  | { type: 'CONFIRM_STOP'; comment: string }
  | { type: 'REQUEST_SWITCH'; task: Task }
  | { type: 'CANCEL_SWITCH' }
  | { type: 'CONFIRM_SWITCH'; action: 'switch' | 'complete' | 'cancel'; comment?: string }
  | { type: 'BITRIX_START_DAY' }
  | { type: 'BITRIX_START_BREAK' }
  | { type: 'BITRIX_RESUME_WORK' }
  | { type: 'BITRIX_END_DAY' }
  | { type: 'BITRIX_SYNC'; status: BitrixSyncStatus }
  | { type: 'BITRIX_APPLY_STATUS'; snapshot: BitrixTimemanStatusSnapshot }
  | { type: 'BITRIX_SET_ERROR'; message: string | null; portalUrl?: string | null }
  | { type: 'CONFIRM_LUNCH_RESTORE'; restore: boolean }
  | { type: 'TOGGLE_NOTIF' }
  | { type: 'TOGGLE_COMPACT' }
  | { type: 'MARK_NOTIF_READ'; id: number }
  | { type: 'MARK_ALL_READ' }
  | { type: 'ADD_NOTIF'; notif: Omit<AppNotification, 'id'> }
  | { type: 'UPDATE_TASK'; task: Task }
  | { type: 'PIN_TASK'; taskId: number }
  | { type: 'DELETE_HISTORY'; id: number }
  | { type: 'UPDATE_HISTORY_COMMENT'; id: number; comment: string }
  | { type: 'ADD_HISTORY'; entry: HistoryEntry }
  | { type: 'UPDATE_NOTE'; note: Note }
  | { type: 'CREATE_NOTE'; note: Omit<Note, 'id'> }
  | { type: 'DELETE_NOTE'; id: number | string }
  | { type: 'UPDATE_SETTINGS'; settings: Partial<Settings> }
  | { type: 'START_POMODORO' }
  | { type: 'PAUSE_POMODORO' }
  | { type: 'RESET_POMODORO' }
  | { type: 'SKIP_POMODORO' }
  | { type: 'SET_POMODORO_FOCUS_DURATION'; minutes: number }
  | { type: 'SET_POMODORO_BREAK_DURATION'; minutes: number }
  | { type: 'SET_DATE'; date: string }
  | { type: 'SET_CONFIG'; config: Record<string, any> }
  | { type: 'SET_TASKS'; tasks: Task[] }
  | { type: 'SET_HISTORY'; history: HistoryEntry[] }
  | { type: 'SET_NOTES'; notes: Note[] }
  | { type: 'SET_CALENDAR_EVENTS'; events: CalendarEvent[] }
  | { type: 'SET_LOADING'; key: keyof AppState['loading']; value: boolean };

const DEFAULT_SETTINGS: Settings = {
  theme: 'dark',
  accentColor: '#6366f1',
  alwaysOnTop: false,
  compactMode: false,
  autostart: false,
  startMinimized: false,
  commandPalette: true,
  pomodoro: { focusDuration: 25, breakDuration: 5, sound: true, visualFlash: true },
  audio: { volume: 80 },
  kanban: { apiUrl: '', email: '', password: '' },
  calendar: { url: '', login: '', password: '', reminders: true },
  jira: { url: '', login: '', token: '', password: '', defaultProject: '' },
  resonance: { login: '', password: '', connected: false, lastChecked: '' },
  bitrix: { url: '', webhook: '', connected: false, lastChecked: '' },
};

function loadState(): Partial<AppState> {
  try {
    const saved = localStorage.getItem('ft_state');
    if (saved) return JSON.parse(saved);
  } catch { /* ignore */ }
  return {};
}

const IDLE_TIMER: TimerState = { status: 'idle', activeTask: null, elapsed: 0 };

function restoreTimer(value: unknown): TimerState {
  if (!value || typeof value !== 'object') return IDLE_TIMER;
  const timer = value as Partial<TimerState>;
  if (!timer.activeTask || typeof timer.elapsed !== 'number' || timer.elapsed < 0) {
    return IDLE_TIMER;
  }
  return {
    status: timer.status === 'running' ? 'paused' : timer.status === 'paused' ? 'paused' : 'idle',
    activeTask: timer.activeTask,
    elapsed: Math.floor(timer.elapsed),
  };
}

function saveState(state: AppState) {
  try {
    const safeSettings = {
      ...state.settings,
      kanban: { ...state.settings.kanban, password: '' },
      calendar: { ...state.settings.calendar, password: state.settings.calendar.password ? '********' : '' },
      jira: { ...state.settings.jira, token: '' },
      resonance: { ...state.settings.resonance, password: '' },
    };
    const toSave = {
      tasks: [], history: state.history, taskCompletions: state.taskCompletions,
      notes: state.notes, calendarEvents: [],
      notifications: state.notifications, settings: safeSettings,
      timer: state.timer, pomodoro: state.pomodoro, bitrixTimeman: state.bitrixTimeman,
    };
    localStorage.setItem('ft_state', JSON.stringify(toSave));
  } catch { /* ignore */ }
}

function createHistoryEntry(task: Task, elapsed: number, comment: string, existingHistory: HistoryEntry[]): HistoryEntry {
  const now = new Date();
  const endTime = `${String(now.getHours()).padStart(2,'0')}:${String(now.getMinutes()).padStart(2,'0')}`;
  const duration = Math.ceil(elapsed / 60);
  const roundedDuration = roundToQuarter(duration);
  const startMins = now.getHours() * 60 + now.getMinutes() - duration;
  const startHours = Math.floor(Math.max(0, startMins) / 60);
  const startMinutes = Math.max(0, startMins) % 60;
  const startTime = `${String(startHours).padStart(2,'0')}:${String(startMinutes).padStart(2,'0')}`;
  const date = `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}-${String(now.getDate()).padStart(2,'0')}`;
  const maxId = existingHistory.reduce((m, e) => Math.max(m, e.id), 0);
  return { id: maxId + 1, taskId: task.id, taskTitle: task.title, project: task.project, startTime, endTime, duration, roundedDuration, comment, date };
}

const saved = loadState();

const DEFAULT_POMODORO: PomodoroState = {
  phase: 'focus', remaining: 25 * 60, isRunning: false, session: 1,
  focusDuration: 25, breakDuration: 5, completionCount: 0,
};

function restoreSettings(value: Partial<Settings> | undefined): Settings {
  const savedVolume = Number(value?.audio?.volume);
  return {
    ...DEFAULT_SETTINGS,
    ...(value ?? {}),
    pomodoro: { ...DEFAULT_SETTINGS.pomodoro, ...(value?.pomodoro ?? {}) },
    audio: {
      volume: Number.isFinite(savedVolume) ? Math.max(0, Math.min(100, savedVolume)) : DEFAULT_SETTINGS.audio.volume,
    },
    kanban: { ...DEFAULT_SETTINGS.kanban, ...(value?.kanban ?? {}) },
    calendar: { ...DEFAULT_SETTINGS.calendar, ...(value?.calendar ?? {}) },
    jira: { ...DEFAULT_SETTINGS.jira, ...(value?.jira ?? {}) },
    bitrix: { ...DEFAULT_SETTINGS.bitrix, ...(value?.bitrix ?? {}) },
    resonance: { ...DEFAULT_SETTINGS.resonance, ...(value?.resonance ?? {}) },
  };
}

const initialState: AppState = {
  tasks: [],
  history: saved.history ?? [],
  taskCompletions: saved.taskCompletions ?? [],
  notes: saved.notes ?? [],
  calendarEvents: [],
  notifications: saved.notifications ?? [],
  timer: restoreTimer(saved.timer),
  pomodoro: saved.pomodoro ? { ...DEFAULT_POMODORO, ...saved.pomodoro } : DEFAULT_POMODORO,
  bitrixTimeman: restoreBitrixTimemanState(
    saved.bitrixTimeman ?? (saved as { lunch?: unknown }).lunch,
  ),
  settings: restoreSettings(saved.settings),
  stopDialogOpen: false,
  switchDialogOpen: false,
  pendingSwitchTask: null,
  lunchRestoreOpen: false,
  notifOpen: false,
  compactMode: false,
  selectedDate: `${new Date().getFullYear()}-${String(new Date().getMonth()+1).padStart(2,'0')}-${String(new Date().getDate()).padStart(2,'0')}`,
  loading: { kanban: false, calendar: false, jira: false, notes: false },
  config: null,
};

function reducer(state: AppState, action: Action): AppState {
  switch (action.type) {
    case 'START_TIMER':
      if (
        state.timer.status === 'paused'
        && state.timer.activeTask?.id === action.task.id
      ) {
        return { ...state, timer: { ...state.timer, status: 'running' } };
      }
      return { ...state, timer: { status: 'running', activeTask: action.task, elapsed: 0 } };
    case 'PAUSE_TIMER':
      return { ...state, timer: { ...state.timer, status: 'paused' } };
    case 'RESUME_TIMER':
      return { ...state, timer: { ...state.timer, status: 'running' } };
    case 'TICK':
      if (state.timer.status !== 'running') return state;
      return { ...state, timer: { ...state.timer, elapsed: state.timer.elapsed + 1 } };
    case 'POMODORO_TICK': {
      if (!state.pomodoro.isRunning) return state;
      const newRemaining = state.pomodoro.remaining - 1;
      if (newRemaining <= 0) {
        const nextPhase = state.pomodoro.phase === 'focus' ? 'break' : 'focus';
        const nextDuration = nextPhase === 'focus'
          ? state.pomodoro.focusDuration * 60
          : state.pomodoro.breakDuration * 60;
        const nextSession = state.pomodoro.phase === 'break'
          ? state.pomodoro.session + 1
          : state.pomodoro.session;
        return {
          ...state,
          pomodoro: {
            ...state.pomodoro,
            phase: nextPhase,
            remaining: nextDuration,
            isRunning: false,
            session: nextSession,
            completionCount: state.pomodoro.completionCount + 1,
          },
        };
      }
      return { ...state, pomodoro: { ...state.pomodoro, remaining: newRemaining } };
    }
    case 'TIMEMAN_TICK': {
      const { bitrixTimeman } = state;
      if (bitrixTimeman.phase === 'working') {
        return { ...state, bitrixTimeman: { ...bitrixTimeman, workElapsed: bitrixTimeman.workElapsed + 1 } };
      }
      if (bitrixTimeman.phase === 'break') {
        return {
          ...state,
          bitrixTimeman: {
            ...bitrixTimeman,
            breakUsedTodaySeconds: bitrixTimeman.breakUsedTodaySeconds + 1,
          },
        };
      }
      return state;
    }
    case 'OPEN_STOP_DIALOG':
      return { ...state, stopDialogOpen: true, timer: { ...state.timer, status: 'paused' } };
    case 'CLOSE_STOP_DIALOG':
      return { ...state, stopDialogOpen: false, timer: { ...state.timer, status: state.timer.elapsed > 0 ? 'paused' : 'idle' } };
    case 'CONFIRM_STOP': {
      if (!state.timer.activeTask) return { ...state, stopDialogOpen: false };
      const entry = createHistoryEntry(state.timer.activeTask, state.timer.elapsed, action.comment, state.history);
      const notif: AppNotification = { id: Date.now(), type: 'time_recorded', text: `Время записано: ${Math.ceil(state.timer.elapsed/60)}м — ${state.timer.activeTask.title}`, timestamp: entry.endTime, isRead: false };
      return {
        ...state,
        stopDialogOpen: false,
        timer: { status: 'idle', activeTask: null, elapsed: 0 },
        history: [entry, ...state.history],
        notifications: [notif, ...state.notifications],
      };
    }
    case 'REQUEST_SWITCH':
      if (state.timer.status === 'idle') {
        return { ...state, timer: { status: 'running', activeTask: action.task, elapsed: 0 } };
      }
      return { ...state, switchDialogOpen: true, pendingSwitchTask: action.task, timer: { ...state.timer, status: 'paused' } };
    case 'CANCEL_SWITCH':
      return { ...state, switchDialogOpen: false, pendingSwitchTask: null, timer: { ...state.timer, status: 'running' } };
    case 'CONFIRM_SWITCH': {
      if (action.action === 'cancel') {
        return { ...state, switchDialogOpen: false, pendingSwitchTask: null, timer: { ...state.timer, status: 'running' } };
      }
      const comment = action.comment || '';
      let newHistory = state.history;
      let newNotifs = state.notifications;
      let newTasks = state.tasks;
      if (state.timer.activeTask && state.timer.elapsed > 0) {
        const entry = createHistoryEntry(state.timer.activeTask, state.timer.elapsed, comment, state.history);
        newHistory = [entry, ...state.history];
        const notif: AppNotification = { id: Date.now(), type: 'time_recorded', text: `Время записано: ${Math.ceil(state.timer.elapsed/60)}м — ${state.timer.activeTask.title}`, timestamp: entry.endTime, isRead: false };
        newNotifs = [notif, ...state.notifications];
      }
      let newCompletions = state.taskCompletions;
      if (action.action === 'complete' && state.timer.activeTask) {
        const activeTask = state.timer.activeTask;
        newTasks = newTasks.map(t => t.id === activeTask.id ? {
          ...t,
          status: resolveKanbanStageName(KANBAN_STAGE_IDS.RESOLVED, "Решена"),
          stageId: KANBAN_STAGE_IDS.RESOLVED,
        } : t);
        if (!isKanbanDoneStatus(activeTask.status)) {
          newCompletions = [createTaskCompletion(activeTask, newCompletions), ...newCompletions];
        }
        const doneNotif: AppNotification = { id: Date.now() + 1, type: 'task_done', text: `Задача завершена: ${activeTask.title}`, timestamp: new Date().toTimeString().slice(0,5), isRead: false };
        newNotifs = [doneNotif, ...newNotifs];
      }
      const newTask = state.pendingSwitchTask;
      return {
        ...state,
        switchDialogOpen: false,
        pendingSwitchTask: null,
        timer: newTask ? { status: 'running', activeTask: newTask, elapsed: 0 } : { status: 'idle', activeTask: null, elapsed: 0 },
        history: newHistory,
        notifications: newNotifs,
        tasks: newTasks,
        taskCompletions: newCompletions,
      };
    }
    case 'BITRIX_START_DAY':
      return {
        ...state,
        bitrixTimeman: {
          ...state.bitrixTimeman,
          phase: 'working',
          dayStartedAt: Date.now(),
          dayEndedAt: null,
          workElapsed: 0,
          breakElapsed: 0,
          breakUsedTodaySeconds: 0,
          breakStartedAt: null,
        },
      };
    case 'BITRIX_START_BREAK': {
      const prevTask = state.timer.activeTask;
      const pausedElapsed = prevTask ? state.timer.elapsed : 0;
      return {
        ...state,
        bitrixTimeman: {
          ...state.bitrixTimeman,
          phase: 'break',
          breakStartedAt: Date.now(),
          previousTask: prevTask,
          pausedElapsed,
        },
        timer: prevTask
          ? { status: 'paused', activeTask: prevTask, elapsed: pausedElapsed }
          : state.timer,
      };
    }
    case 'BITRIX_RESUME_WORK': {
      const prevTask = state.bitrixTimeman.previousTask;
      const elapsed = state.bitrixTimeman.pausedElapsed || state.timer.elapsed;
      return {
        ...state,
        bitrixTimeman: {
          ...state.bitrixTimeman,
          phase: 'working',
          breakStartedAt: null,
        },
        lunchRestoreOpen: prevTask !== null,
        timer: prevTask
          ? { status: 'paused', activeTask: prevTask, elapsed }
          : state.timer,
      };
    }
    case 'BITRIX_END_DAY':
      return {
        ...state,
        bitrixTimeman: {
          ...state.bitrixTimeman,
          phase: 'finished',
          dayEndedAt: Date.now(),
          breakStartedAt: null,
        },
      };
    case 'BITRIX_SYNC':
      return {
        ...state,
        bitrixTimeman: {
          ...state.bitrixTimeman,
          syncStatus: action.status,
        },
      };
    case 'BITRIX_APPLY_STATUS': {
      const { snapshot } = action;
      const prev = state.bitrixTimeman;
      const onBreak = snapshot.phase === 'break';
      const timer = onBreak && state.timer.status === 'running'
        ? { ...state.timer, status: 'paused' as const }
        : state.timer;
      return {
        ...state,
        timer,
        bitrixTimeman: {
          ...prev,
          phase: snapshot.phase,
          syncStatus: snapshot.online ? 'online' : 'idle',
          dayStartedAt: snapshot.dayStartedAt,
          dayEndedAt: snapshot.dayEndedAt,
          breakStartedAt: snapshot.breakStartedAt,
          workElapsed: snapshot.workElapsed,
          breakUsedTodaySeconds: snapshot.breakUsedTodaySeconds,
          breakElapsed: 0,
          errorMessage: null,
          portalUrl: snapshot.portalUrl ?? prev.portalUrl,
        },
      };
    }
    case 'BITRIX_SET_ERROR':
      return {
        ...state,
        bitrixTimeman: {
          ...state.bitrixTimeman,
          errorMessage: action.message,
          portalUrl: action.portalUrl ?? state.bitrixTimeman.portalUrl,
        },
      };
    case 'CONFIRM_LUNCH_RESTORE': {
      const prevTask = state.bitrixTimeman.previousTask;
      const elapsed = state.bitrixTimeman.pausedElapsed || state.timer.elapsed;
      return {
        ...state,
        lunchRestoreOpen: false,
        bitrixTimeman: { ...state.bitrixTimeman, previousTask: null, pausedElapsed: 0 },
        timer: action.restore && prevTask
          ? { status: 'running', activeTask: prevTask, elapsed }
          : prevTask
            ? { status: 'paused', activeTask: prevTask, elapsed }
            : state.timer,
      };
    }
    case 'TOGGLE_NOTIF':
      return { ...state, notifOpen: !state.notifOpen };
    case 'TOGGLE_COMPACT':
      return { ...state, compactMode: !state.compactMode };
    case 'MARK_NOTIF_READ':
      return { ...state, notifications: state.notifications.map(n => n.id === action.id ? { ...n, isRead: true } : n) };
    case 'MARK_ALL_READ':
      return { ...state, notifications: state.notifications.map(n => ({ ...n, isRead: true })) };
    case 'ADD_NOTIF':
      return { ...state, notifications: [{ ...action.notif, id: Date.now() }, ...state.notifications] };
    case 'UPDATE_TASK': {
      const prev = state.tasks.find(t => t.id === action.task.id);
      const tasks = state.tasks.map(t => t.id === action.task.id ? action.task : t);
      const activeId = state.timer.activeTask?.id;
      const becameDone = prev
        && !isKanbanDoneStatus(prev.status)
        && isKanbanDoneStatus(action.task.status);
      return {
        ...state,
        tasks,
        taskCompletions: becameDone
          ? [createTaskCompletion(action.task, state.taskCompletions), ...state.taskCompletions]
          : state.taskCompletions,
        timer: activeId === action.task.id && state.timer.activeTask
          ? { ...state.timer, activeTask: { ...state.timer.activeTask, ...action.task } }
          : state.timer,
      };
    }
    case 'PIN_TASK':
      return { ...state, tasks: state.tasks.map(t => t.id === action.taskId ? { ...t, isPinned: !t.isPinned } : t) };
    case 'DELETE_HISTORY':
      return { ...state, history: state.history.filter(h => h.id !== action.id) };
    case 'UPDATE_HISTORY_COMMENT':
      return { ...state, history: state.history.map(h => h.id === action.id ? { ...h, comment: action.comment } : h) };
    case 'ADD_HISTORY':
      return { ...state, history: [action.entry, ...state.history] };
    case 'UPDATE_NOTE':
      return { ...state, notes: state.notes.map(n => n.id === action.note.id ? action.note : n) };
    case 'CREATE_NOTE': {
      const id = action.note.title || Date.now();
      return { ...state, notes: [{ ...action.note, id }, ...state.notes] };
    }
    case 'DELETE_NOTE':
      return { ...state, notes: state.notes.filter(n => n.id !== action.id) };
    case 'UPDATE_SETTINGS': {
      const newSettings = { ...state.settings, ...action.settings };
      const nextState: AppState = { ...state, settings: newSettings };
      if ('compactMode' in action.settings && action.settings.compactMode !== undefined) {
        nextState.compactMode = action.settings.compactMode;
      }
      return nextState;
    }
    case 'START_POMODORO':
      return { ...state, pomodoro: { ...state.pomodoro, isRunning: true } };
    case 'PAUSE_POMODORO':
      return { ...state, pomodoro: { ...state.pomodoro, isRunning: false } };
    case 'RESET_POMODORO':
      return { ...state, pomodoro: { ...state.pomodoro, isRunning: false, remaining: state.pomodoro.focusDuration * 60, phase: 'focus', session: 1 } };
    case 'SKIP_POMODORO': {
      const nextPhase = state.pomodoro.phase === 'focus' ? 'break' : 'focus';
      const nextDuration = nextPhase === 'focus' ? state.pomodoro.focusDuration * 60 : state.pomodoro.breakDuration * 60;
      return { ...state, pomodoro: { ...state.pomodoro, phase: nextPhase, remaining: nextDuration, isRunning: false } };
    }
    case 'SET_POMODORO_FOCUS_DURATION': {
      const mins = action.minutes;
      return {
        ...state,
        pomodoro: {
          ...state.pomodoro,
          focusDuration: mins,
          remaining: state.pomodoro.phase === 'focus' ? mins * 60 : state.pomodoro.remaining,
          isRunning: false,
        },
      };
    }
    case 'SET_POMODORO_BREAK_DURATION': {
      const mins = action.minutes;
      return {
        ...state,
        pomodoro: {
          ...state.pomodoro,
          breakDuration: mins,
          remaining: state.pomodoro.phase === 'break' ? mins * 60 : state.pomodoro.remaining,
        },
      };
    }
    case 'SET_DATE':
      return { ...state, selectedDate: action.date };
    case 'SET_CONFIG':
      return { ...state, config: action.config };
    case 'SET_TASKS': {
      const activeId = state.timer.activeTask?.id;
      const refreshedActiveTask = activeId ? action.tasks.find(task => task.id === activeId) : null;
      return {
        ...state,
        tasks: action.tasks,
        timer: refreshedActiveTask && state.timer.activeTask
          ? { ...state.timer, activeTask: { ...state.timer.activeTask, ...refreshedActiveTask } }
          : state.timer,
      };
    }
    case 'SET_HISTORY':
      return { ...state, history: action.history };
    case 'SET_NOTES':
      return { ...state, notes: action.notes };
    case 'SET_CALENDAR_EVENTS':
      return { ...state, calendarEvents: action.events };
    case 'SET_LOADING':
      return { ...state, loading: { ...state.loading, [action.key]: action.value } };
    default:
      return state;
  }
}

interface AppContextValue {
  state: AppState;
  dispatch: (action: Action) => void;
  startTimer: (task: Task) => void;
  requestStop: () => void;
  confirmStop: (comment: string) => void;
  cancelStop: () => void;
  requestSwitch: (task: Task) => void;
  confirmSwitch: (action: 'switch' | 'complete' | 'cancel', comment?: string) => void;
  bitrixStartDay: () => Promise<void>;
  bitrixStartBreak: () => Promise<void>;
  bitrixResumeWork: () => Promise<void>;
  bitrixEndDay: () => Promise<void>;
  /** @deprecated use bitrixStartBreak */
  startLunch: () => Promise<void>;
  /** @deprecated use bitrixResumeWork */
  endLunch: () => Promise<void>;
  ensureKanbanLoaded: (force?: boolean, notify?: boolean) => Promise<void>;
  ensureKanbanTaskDetail: (taskId: number) => Promise<Task | null>;
  ensureCalendarLoaded: (force?: boolean) => Promise<void>;
  ensureNotesLoaded: (force?: boolean) => Promise<void>;
  reloadHistory: () => Promise<void>;
}

const AppContext = createContext<AppContextValue | null>(null);

export function AppProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(reducer, initialState);
  const stateRef = useRef(state);
  const kanbanRequestRef = useRef<Promise<void> | null>(null);
  const hydratingNewTaskIdsRef = useRef<Set<number>>(new Set());
  const kanbanTaskRequestRef = useRef<Map<number, Promise<Task | null>>>(new Map());
  const calendarRequestRef = useRef<Promise<void> | null>(null);
  const notesRequestRef = useRef<Promise<void> | null>(null);
  const remindedMeetingsRef = useRef<Set<string>>(new Set());
  const lastTimerSoundStateRef = useRef({
    status: state.timer.status,
    taskId: state.timer.activeTask?.id ?? null,
  });
  const prevCompletionCountRef = useRef(state.pomodoro.completionCount);
  const prevTaskIdsRef = useRef<Set<number>>(new Set(state.tasks.map(t => t.id)));

  const playSound = useCallback((sound: AppSoundKey) => {
    playAppSound(sound);
  }, []);

  useEffect(() => {
    stateRef.current = state;
  }, [state]);

  useEffect(() => {
    setAppAudioVolume(state.settings.audio.volume);
  }, [state.settings.audio.volume]);

  useEffect(() => {
    let cancelled = false;
    async function bootstrap() {
      if (!window.api) return;
      performance.mark?.('ft-renderer-bootstrap-start');
      try {
        const [config, history, windowState] = await Promise.all([
          window.api.loadConfig(),
          loadRealHistory(),
          window.api.loadWindowState?.().catch((): Record<string, any> => ({})),
        ]);
        if (cancelled) return;
        const kanbanUser = config.kanban?.userInfo?.data || config.kanban?.userInfo || {};
        dispatch({ type: 'SET_CONFIG', config });
        dispatch({ type: 'SET_HISTORY', history });
        dispatch({
          type: 'UPDATE_SETTINGS',
          settings: {
            theme: localStorage.getItem('theme') === 'light' ? 'light' : 'dark',
            accentColor: config.accent_color || DEFAULT_SETTINGS.accentColor,
            alwaysOnTop: config.always_on_top === true,
            compactMode: windowState?.compactMode === true,
            commandPalette: config.command_palette !== false,
            kanban: {
              apiUrl: config.kanban?.apiUrl || config.kanban?.url || '',
              email: config.kanban?.email || kanbanUser.email || kanbanUser.username || '',
              password: '',
            },
            calendar: {
              ...DEFAULT_SETTINGS.calendar,
              url: config.ical_url || '',
              login: config.caldav_user || '',
              password: config.caldav_pass ? '********' : '',
              reminders: config.calendar_reminders !== false,
            },
            audio: {
              ...DEFAULT_SETTINGS.audio,
              ...stateRef.current.settings.audio,
              ...(config.audio || {}),
            },
            jira: { ...DEFAULT_SETTINGS.jira, url: config.jira_url || '', login: config.jira_user || '', token: '', password: '', defaultProject: config.jira_project || '' },
            bitrix: {
              ...DEFAULT_SETTINGS.bitrix,
              url: config.bitrix_url || '',
              connected: config.bitrix?.connected === true,
              lastChecked: config.bitrix?.lastChecked || '',
            },
            resonance: {
              ...DEFAULT_SETTINGS.resonance,
              login: config.resonance?.login || '',
              connected: config.resonance?.connected === true,
              lastChecked: config.resonance?.lastChecked || '',
            },
          },
        });
        if (config.command_palette !== false) {
          await window.api.paletteSetEnabled(true);
        }
      } catch (error) {
        console.error('[Focus Tracker] bootstrap failed', error);
      } finally {
        performance.mark?.('ft-renderer-bootstrap-end');
      }
    }
    bootstrap();
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    if (!isBitrixConfigured(state.config)) return;
    let cancelled = false;
    async function syncBitrixTimeman() {
      const config = stateRef.current.config;
      dispatch({ type: 'BITRIX_SYNC', status: 'syncing' });
      try {
        const snapshot = await bitrixTimemanStatus(config);
        if (cancelled) return;
        dispatch({ type: 'BITRIX_APPLY_STATUS', snapshot });
        dispatch({ type: 'BITRIX_SYNC', status: snapshot.online ? 'online' : 'idle' });
      } catch (error) {
        console.error('[Focus Tracker] bitrix timeman status failed', error);
        if (cancelled) return;
        if (error instanceof BitrixTimemanError && error.code === 'EXPIRED') {
          dispatch({ type: 'BITRIX_SET_ERROR', message: error.message, portalUrl: error.portalUrl });
        }
        dispatch({ type: 'BITRIX_SYNC', status: 'error' });
      }
    }
    syncBitrixTimeman();
    return () => { cancelled = true; };
  }, [state.config?.bitrix_url, state.config?.bitrix?.connected]);

  useEffect(() => {
    saveState(state);
  }, [state]);

  useEffect(() => {
    const pinnedIds = state.tasks.filter(task => task.isPinned).map(task => task.id);
    if (pinnedIds.length === 0 && state.tasks.length === 0) return;
    savePinnedTaskIds(new Set(pinnedIds));
  }, [state.tasks]);

  useEffect(() => {
    if (!window.api || state.config === null) return;
    window.api.saveWindowState?.({ compactMode: state.compactMode }).catch(() => {});
    const bounds = state.compactMode
      ? { width: 220, height: 124 }
      : { width: 1200, height: 760 };
    window.api.setWindowBounds?.(bounds).catch(() => {});
  }, [state.compactMode]);

  useEffect(() => {
    const theme = state.settings.theme;
    const isDark = theme === 'dark' || (theme === 'system' && window.matchMedia('(prefers-color-scheme: dark)').matches);
    document.documentElement.classList.toggle('dark', isDark);
    localStorage.setItem('theme', theme);
  }, [state.settings.theme]);

  useEffect(() => {
    const root = document.documentElement;
    const color = state.settings.accentColor;
    const r = parseInt(color.slice(1,3),16);
    const g = parseInt(color.slice(3,5),16);
    const b = parseInt(color.slice(5,7),16);
    const hsl = rgbToHsl(r,g,b);
    const value = `${hsl[0]} ${hsl[1]}% ${hsl[2]}%`;
    root.style.setProperty('--primary', value);
    root.style.setProperty('--accent', value);
    root.style.setProperty('--ring', value);
    root.style.setProperty('--sidebar-primary', value);
    root.style.setProperty('--chart-1', value);
  }, [state.settings.accentColor]);

  useEffect(() => {
    if (state.timer.status !== 'running') return;
    const interval = setInterval(() => dispatch({ type: 'TICK' }), 1000);
    return () => clearInterval(interval);
  }, [state.timer.status]);

  useEffect(() => {
    const previous = lastTimerSoundStateRef.current;
    const current = {
      status: state.timer.status,
      taskId: state.timer.activeTask?.id ?? null,
    };

    const started =
      previous.status === 'idle' &&
      current.status === 'running' &&
      current.taskId !== null;
    const switched =
      current.status === 'running' &&
      previous.taskId !== null &&
      current.taskId !== null &&
      previous.taskId !== current.taskId;
    const stopped = previous.status !== 'idle' && current.status === 'idle';

    if (started || switched) playSound('timerStart');
    if (stopped) playSound('timerStop');

    lastTimerSoundStateRef.current = current;
  }, [playSound, state.timer.activeTask?.id, state.timer.status]);

  useEffect(() => {
    if (!state.pomodoro.isRunning) return;
    const interval = setInterval(() => dispatch({ type: 'POMODORO_TICK' }), 1000);
    return () => clearInterval(interval);
  }, [state.pomodoro.isRunning]);

  useEffect(() => {
    const phase = state.bitrixTimeman.phase;
    if (phase !== 'working' && phase !== 'break') return;
    const interval = setInterval(() => dispatch({ type: 'TIMEMAN_TICK' }), 1000);
    return () => clearInterval(interval);
  }, [state.bitrixTimeman.phase]);

  useEffect(() => {
    if (state.pomodoro.completionCount === 0) return;
    if (state.pomodoro.completionCount === prevCompletionCountRef.current) return;
    prevCompletionCountRef.current = state.pomodoro.completionCount;
    const completedPhase = state.pomodoro.phase === 'focus' ? 'break' : 'focus';
    const msg = completedPhase === 'focus'
      ? 'Pomodoro завершён — время сделать перерыв'
      : 'Перерыв закончился — время работать';
    playSound(completedPhase === 'focus' ? 'pomodoroBreak' : 'pomodoroFocus');
    toast.info(msg);
  }, [playSound, state.pomodoro.completionCount, state.pomodoro.phase]);

  useEffect(() => {
    if (!state.settings.calendar.reminders) return;
    const check = () => {
      const now = new Date();
      const today = `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}-${String(now.getDate()).padStart(2,'0')}`;
      const nowMins = now.getHours() * 60 + now.getMinutes();
      const ts = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
      state.calendarEvents.forEach(event => {
        if (event.date !== today) return;
        const [h, m] = event.start.split(':').map(Number);
        if (!Number.isFinite(h) || !Number.isFinite(m)) return;
        const diff = (h * 60 + m) - nowMins;
        if (diff === 5) {
          const reminderKey = `${event.date}:${event.id}:${event.start}`;
          if (remindedMeetingsRef.current.has(reminderKey)) return;
          remindedMeetingsRef.current.add(reminderKey);

          window.api?.showMeetingReminderWindow({
            name: event.title,
            time: event.start,
            url: event.meetingUrl,
            theme: state.settings.theme === 'light' ? 'light' : 'dark',
          }).catch(() => {});
          playSound('meetingReminder');
          playSound('notification');

          toast.info(`Через 5 минут: ${event.title}`);
          dispatch({
            type: 'ADD_NOTIF',
            notif: { type: 'meeting_soon', text: `Через 5 минут: ${event.title}`, timestamp: ts, isRead: false },
          });
        }
      });
    };
    const id = setInterval(check, 60_000);
    check();
    return () => clearInterval(id);
  }, [
    state.calendarEvents,
    state.settings.audio.volume,
    state.settings.calendar.reminders,
    state.settings.theme,
    playSound,
  ]);

  useEffect(() => {
    const workDayOpen = state.bitrixTimeman.phase === 'working' || state.bitrixTimeman.phase === 'break';
    const shouldBlockClose = state.timer.status !== 'idle' || workDayOpen;
    window.api?.setTimerCloseGuard(shouldBlockClose).catch(() => {});
  }, [state.timer.status, state.bitrixTimeman.phase]);

  useEffect(() => {
    const off = window.api?.onReminderClosed?.(() => {
      stopAllSounds();
    });
    return () => off?.();
  }, []);

  useEffect(() => {
    prevTaskIdsRef.current = new Set(state.tasks.map(t => t.id));
  }, [state.tasks]);

  useEffect(() => {
    const token = stateRef.current.config?.kanban?.token;
    if (!token || !window.api) return;

    const checkForNewTasks = async () => {
      try {
        const config = stateRef.current.config || await window.api!.loadConfig();
        const tasks = await loadRealKanbanTasks(config, { hydrateDetails: false });
        const mergedTasks = mergeKanbanTaskList(stateRef.current.tasks, tasks);
        const prevIds = prevTaskIdsRef.current;
        const newTasks = mergedTasks.filter(t => !prevIds.has(t.id));
        if (newTasks.length > 0) {
          for (const task of newTasks) {
            const ts = new Date().toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });
            dispatch({
              type: 'ADD_NOTIF',
              notif: { type: 'kanban_new_task', text: `Новая задача: ${task.title}`, timestamp: ts, isRead: false, taskId: task.id },
            });
          }
          playSound('notification');

          const newTasksToHydrate = newTasks.filter(
            (task) => !task.detailsLoaded && !hydratingNewTaskIdsRef.current.has(task.id),
          );
          if (newTasksToHydrate.length > 0) {
            newTasksToHydrate.forEach((task) => hydratingNewTaskIdsRef.current.add(task.id));
            void hydrateKanbanTasksMissingDetails(config, newTasksToHydrate)
              .then((hydrated) => {
                if (hydrated.length === 0) return;
                dispatch({
                  type: 'SET_TASKS',
                  tasks: mergeKanbanTaskList(stateRef.current.tasks, hydrated),
                });
              })
              .catch(() => {})
              .finally(() => {
                newTasksToHydrate.forEach((task) => hydratingNewTaskIdsRef.current.delete(task.id));
              });
          }
        }
        dispatch({ type: 'SET_TASKS', tasks: mergedTasks });
      } catch {}
    };

    const id = setInterval(checkForNewTasks, 15_000);
    return () => clearInterval(id);
  }, [state.config?.kanban?.token]);

  const startTimer = useCallback((task: Task) => {
    if (state.timer.status !== 'idle') {
      dispatch({ type: 'REQUEST_SWITCH', task });
    } else {
      dispatch({ type: 'START_TIMER', task });
      const token = state.config?.kanban?.token;
      if (window.api?.kanbanUpdateTaskStage && token && isKanbanPreWorkStage(task)) {
        window.api.kanbanUpdateTaskStage(task.id, KANBAN_STAGE_IDS.IN_PROGRESS, token).catch(() => {});
      }
      toast.success(`Таймер запущен: ${task.title}`);
    }
  }, [state.config, state.timer.status]);

  const reloadHistory = useCallback(async () => {
    if (!window.api) return;
    const history = await loadRealHistory();
    dispatch({ type: 'SET_HISTORY', history });
  }, []);

  const persistTaskWork = useCallback(async (task: Task | null, elapsedSeconds: number, comment: string, complete = false) => {
    if (!window.api || !task || elapsedSeconds < 1) return;
    const elapsedMs = elapsedSeconds * 1000;
    const endTime = new Date();
    const startTime = new Date(endTime.getTime() - elapsedMs);
    const date = `${endTime.getFullYear()}-${String(endTime.getMonth()+1).padStart(2,'0')}-${String(endTime.getDate()).padStart(2,'0')}`;
    await window.api.saveTask({
      name: task.title,
      comment,
      url: task.url || '',
      date,
      startISO: startTime.toISOString(),
      endISO: endTime.toISOString(),
      durationMs: elapsedMs,
      durationHMS: formatElapsed(elapsedSeconds),
    });
    const token = state.config?.kanban?.token;
    if (token && task.id) {
      const roundedMinutes = Math.ceil((elapsedMs / 60000) / 15) * 15;
      if (window.api.kanbanLogWork) {
        await window.api.kanbanLogWork(task.id, startTime.toISOString(), `${comment.trim()} | Focus Tracker`, roundedMinutes, token).catch(() => {});
      }
      if (complete && window.api.kanbanUpdateTaskStage) {
        await window.api.kanbanUpdateTaskStage(task.id, KANBAN_STAGE_IDS.RESOLVED, token).catch(() => {});
      }
    }
    await reloadHistory();
  }, [reloadHistory, state.config]);

  const requestStop = useCallback(() => dispatch({ type: 'OPEN_STOP_DIALOG' }), []);
  const confirmStop = useCallback((comment: string) => {
    const activeTask = state.timer.activeTask;
    persistTaskWork(activeTask, state.timer.elapsed, comment).catch(() => {});
    dispatch({ type: 'CONFIRM_STOP', comment });
    playSound('notification');
    toast.success('Время записано в историю');
  }, [persistTaskWork, state.timer.activeTask, state.timer.elapsed]);
  const cancelStop = useCallback(() => dispatch({ type: 'CLOSE_STOP_DIALOG' }), []);
  const requestSwitch = useCallback((task: Task) => dispatch({ type: 'REQUEST_SWITCH', task }), []);
  const confirmSwitch = useCallback((action: 'switch' | 'complete' | 'cancel', comment?: string) => {
    const activeTask = state.timer.activeTask;
    const elapsed = state.timer.elapsed;
    if (action !== 'cancel') {
      persistTaskWork(activeTask, elapsed, comment || '', action === 'complete').catch(() => {});
      const nextTask = state.pendingSwitchTask;
      const token = state.config?.kanban?.token;
      if (nextTask && token && window.api?.kanbanUpdateTaskStage && isKanbanPreWorkStage(nextTask)) {
        window.api.kanbanUpdateTaskStage(nextTask.id, KANBAN_STAGE_IDS.IN_PROGRESS, token).catch(() => {});
      }
    }
    dispatch({ type: 'CONFIRM_SWITCH', action, comment });
    if (action !== 'cancel') {
      playSound('notification');
      toast.success('Задача переключена');
    }
  }, [persistTaskWork, state.config, state.pendingSwitchTask, state.timer.activeTask, state.timer.elapsed]);
  const handleBitrixFailure = useCallback((error: unknown, fallbackMessage: string) => {
    if (error instanceof BitrixTimemanError && error.code === 'EXPIRED') {
      dispatch({ type: 'BITRIX_SET_ERROR', message: error.message, portalUrl: error.portalUrl });
      dispatch({ type: 'BITRIX_SYNC', status: 'error' });
      soundToast.error(error.message);
      return;
    }
    dispatch({ type: 'BITRIX_SYNC', status: 'error' });
    soundToast.error(fallbackMessage);
  }, []);

  const bitrixStartDay = useCallback(async () => {
    const phase = stateRef.current.bitrixTimeman.phase;
    if (phase !== 'not_started') {
      soundToast.error('Рабочий день уже начат');
      return;
    }
    dispatch({ type: 'BITRIX_SYNC', status: 'syncing' });
    try {
      const snapshot = await bitrixTimemanOpen(phase, stateRef.current.config);
      dispatch({ type: 'BITRIX_APPLY_STATUS', snapshot });
      dispatch({ type: 'BITRIX_SYNC', status: 'online' });
      soundToast.success('Рабочий день начат в Bitrix24');
    } catch (error) {
      handleBitrixFailure(error, 'Не удалось начать рабочий день в Bitrix24');
    }
  }, [handleBitrixFailure]);

  const bitrixStartBreak = useCallback(async () => {
    const phase = stateRef.current.bitrixTimeman.phase;
    if (phase !== 'working') {
      soundToast.error('Сначала начните рабочий день');
      return;
    }
    dispatch({ type: 'BITRIX_SYNC', status: 'syncing' });
    try {
      const snapshot = await bitrixTimemanPause(phase, stateRef.current.config);
      dispatch({ type: 'BITRIX_START_BREAK' });
      dispatch({ type: 'BITRIX_APPLY_STATUS', snapshot });
      dispatch({ type: 'BITRIX_SYNC', status: 'online' });
      soundToast.info('Перерыв начат — таймер задачи на паузе');
    } catch (error) {
      handleBitrixFailure(error, 'Не удалось начать перерыв в Bitrix24');
    }
  }, [handleBitrixFailure]);

  const bitrixResumeWork = useCallback(async () => {
    const phase = stateRef.current.bitrixTimeman.phase;
    if (phase !== 'break') return;
    dispatch({ type: 'BITRIX_SYNC', status: 'syncing' });
    try {
      const snapshot = await bitrixTimemanResume(phase, stateRef.current.config);
      dispatch({ type: 'BITRIX_RESUME_WORK' });
      dispatch({ type: 'BITRIX_APPLY_STATUS', snapshot });
      dispatch({ type: 'BITRIX_SYNC', status: 'online' });
      soundToast.success('Работа возобновлена');
    } catch (error) {
      handleBitrixFailure(error, 'Не удалось завершить перерыв в Bitrix24');
    }
  }, [handleBitrixFailure]);

  const bitrixEndDay = useCallback(async () => {
    const phase = stateRef.current.bitrixTimeman.phase;
    if (phase === 'break') {
      soundToast.error('Сначала завершите перерыв');
      return;
    }
    if (phase !== 'working') return;
    dispatch({ type: 'BITRIX_SYNC', status: 'syncing' });
    try {
      const snapshot = await bitrixTimemanClose(phase, stateRef.current.config);
      dispatch({ type: 'BITRIX_APPLY_STATUS', snapshot });
      dispatch({ type: 'BITRIX_SYNC', status: 'online' });
      soundToast.success('Рабочий день завершён');
    } catch (error) {
      handleBitrixFailure(error, 'Не удалось завершить рабочий день в Bitrix24');
    }
  }, [handleBitrixFailure]);

  const startLunch = bitrixStartBreak;
  const endLunch = bitrixResumeWork;

  const ensureKanbanLoaded = useCallback(async (force = false, notify = false) => {
    if (!window.api) return;
    if (kanbanRequestRef.current) return kanbanRequestRef.current;
    const current = stateRef.current;
    if (!force && current.tasks.length > 0 && current.tasks.every(task => task.detailsLoaded)) return;

    kanbanRequestRef.current = (async () => {
      dispatch({ type: 'SET_LOADING', key: 'kanban', value: true });
      try {
        const latest = stateRef.current;
        const config = latest.config || await window.api!.loadConfig();
        dispatch({ type: 'SET_CONFIG', config });
        let mergedTasks: Task[];
        if (latest.tasks.length === 0) {
          mergedTasks = await loadRealKanbanTasks(config, { hydrateDetails: true });
        } else {
          const tasks = await loadRealKanbanTasks(config, { hydrateDetails: false });
          mergedTasks = mergeKanbanTaskList(latest.tasks, tasks);
          if (mergedTasks.some(task => !task.detailsLoaded)) {
            const hydrated = await hydrateKanbanTasksMissingDetails(config, mergedTasks);
            if (hydrated.length > 0) {
              mergedTasks = mergeKanbanTaskList(mergedTasks, hydrated);
            }
          }
        }
        const refreshedConfig = await window.api!.loadConfig().catch(() => config);
        dispatch({ type: 'SET_CONFIG', config: refreshedConfig });
        dispatch({ type: 'SET_TASKS', tasks: mergedTasks });
        if (notify) soundToast.success(`Kanban обновлён: ${mergedTasks.length} задач`);
      } catch (error: any) {
        soundToast.error(error?.message || 'Не удалось загрузить Kanban');
      } finally {
        dispatch({ type: 'SET_LOADING', key: 'kanban', value: false });
        kanbanRequestRef.current = null;
      }
    })();
    return kanbanRequestRef.current;
  }, []);

  const ensureKanbanTaskDetail = useCallback(async (taskId: number) => {
    if (!window.api) return null;
    const currentTask = stateRef.current.tasks.find(task => task.id === taskId);
    if (!currentTask || currentTask.detailsLoaded) return currentTask || null;
    const existingRequest = kanbanTaskRequestRef.current.get(taskId);
    if (existingRequest) return existingRequest;

    const request = (async () => {
      try {
        const config = stateRef.current.config || await window.api!.loadConfig();
        const latestTask = stateRef.current.tasks.find(task => task.id === taskId) || currentTask;
        const detailedTask = await loadRealKanbanTaskDetail(config, latestTask);
        dispatch({ type: 'UPDATE_TASK', task: detailedTask });
        return detailedTask;
      } catch (error: any) {
        soundToast.error(error?.message || 'Не удалось загрузить детали задачи');
        return null;
      } finally {
        kanbanTaskRequestRef.current.delete(taskId);
      }
    })();
    kanbanTaskRequestRef.current.set(taskId, request);
    return request;
  }, []);

  const ensureCalendarLoaded = useCallback(async (force = false) => {
    if (!window.api) return;
    if (calendarRequestRef.current) return calendarRequestRef.current;
    const current = stateRef.current;
    if (!force && current.calendarEvents.length > 0) return;

    calendarRequestRef.current = (async () => {
      dispatch({ type: 'SET_LOADING', key: 'calendar', value: true });
      try {
        const latest = stateRef.current;
        const config = latest.config || await window.api!.loadConfig();
        if (!latest.config) dispatch({ type: 'SET_CONFIG', config });
        const events = await loadRealCalendarEvents(config);
        dispatch({ type: 'SET_CALENDAR_EVENTS', events });
      } finally {
        dispatch({ type: 'SET_LOADING', key: 'calendar', value: false });
        calendarRequestRef.current = null;
      }
    })();
    return calendarRequestRef.current;
  }, []);

  const ensureNotesLoaded = useCallback(async (force = false) => {
    if (!window.api) return;
    if (notesRequestRef.current) return notesRequestRef.current;
    const current = stateRef.current;
    if (!force && current.notes.length > 0) return;

    notesRequestRef.current = (async () => {
      dispatch({ type: 'SET_LOADING', key: 'notes', value: true });
      try {
        const notes = await loadRealNotes();
        dispatch({ type: 'SET_NOTES', notes });
      } finally {
        dispatch({ type: 'SET_LOADING', key: 'notes', value: false });
        notesRequestRef.current = null;
      }
    })();
    return notesRequestRef.current;
  }, []);

  return (
    <AppContext.Provider value={{ state, dispatch, startTimer, requestStop, confirmStop, cancelStop, requestSwitch, confirmSwitch, bitrixStartDay, bitrixStartBreak, bitrixResumeWork, bitrixEndDay, startLunch, endLunch, ensureKanbanLoaded, ensureKanbanTaskDetail, ensureCalendarLoaded, ensureNotesLoaded, reloadHistory }}>
      {children}
    </AppContext.Provider>
  );
}

export function useApp() {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error('useApp must be used within AppProvider');
  return ctx;
}

function formatElapsed(totalSeconds: number) {
  const h = Math.floor(totalSeconds / 3600);
  const m = Math.floor((totalSeconds % 3600) / 60);
  const s = totalSeconds % 60;
  return `${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}`;
}

function rgbToHsl(r: number, g: number, b: number): [number, number, number] {
  r /= 255; g /= 255; b /= 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b);
  let h = 0, s = 0;
  const l = (max + min) / 2;
  if (max !== min) {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    switch (max) {
      case r: h = (g - b) / d + (g < b ? 6 : 0); break;
      case g: h = (b - r) / d + 2; break;
      case b: h = (r - g) / d + 4; break;
    }
    h /= 6;
  }
  return [Math.round(h * 360), Math.round(s * 100), Math.round(l * 100)];
}
