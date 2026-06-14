import { createContext, useContext, useReducer, useEffect, ReactNode, useCallback, useRef } from 'react';
import { Task, HistoryEntry, Note, AppNotification, CalendarEvent, roundToQuarter } from '@/data/mockData';
import { loadRealCalendarEvents, loadRealHistory, loadRealKanbanTasks, loadRealNotes } from '@/lib/electronApi';
import { toast } from 'sonner';

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

export interface LunchState {
  active: boolean;
  startTime: number | null;
  lunchElapsed: number;
  previousTask: Task | null;
}

export interface Settings {
  theme: 'light' | 'dark' | 'system';
  accentColor: string;
  alwaysOnTop: boolean;
  compactMode: boolean;
  autostart: boolean;
  pomodoro: { focusDuration: number; breakDuration: number; sound: boolean; visualFlash: boolean };
  kanban: { apiUrl: string; email: string; password: string };
  calendar: { url: string; login: string; password: string; reminders: boolean };
  jira: { url: string; login: string; token: string; defaultProject: string; hotkey: string };
  resonance: { login: string; password: string; connected: boolean; lastChecked: string };
}

interface AppState {
  tasks: Task[];
  history: HistoryEntry[];
  notes: Note[];
  calendarEvents: CalendarEvent[];
  notifications: AppNotification[];
  timer: TimerState;
  pomodoro: PomodoroState;
  lunch: LunchState;
  settings: Settings;
  stopDialogOpen: boolean;
  switchDialogOpen: boolean;
  pendingSwitchTask: Task | null;
  lunchRestoreOpen: boolean;
  notifOpen: boolean;
  compactMode: boolean;
  selectedDate: string;
  loading: { kanban: boolean; calendar: boolean; notes: boolean };
  config: Record<string, any> | null;
}

type Action =
  | { type: 'START_TIMER'; task: Task }
  | { type: 'PAUSE_TIMER' }
  | { type: 'RESUME_TIMER' }
  | { type: 'TICK' }
  | { type: 'POMODORO_TICK' }
  | { type: 'LUNCH_TICK' }
  | { type: 'OPEN_STOP_DIALOG' }
  | { type: 'CLOSE_STOP_DIALOG' }
  | { type: 'CONFIRM_STOP'; comment: string }
  | { type: 'REQUEST_SWITCH'; task: Task }
  | { type: 'CANCEL_SWITCH' }
  | { type: 'CONFIRM_SWITCH'; action: 'switch' | 'complete' | 'cancel'; comment?: string }
  | { type: 'START_LUNCH' }
  | { type: 'END_LUNCH' }
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
  pomodoro: { focusDuration: 25, breakDuration: 5, sound: true, visualFlash: true },
  kanban: { apiUrl: '', email: '', password: '' },
  calendar: { url: '', login: '', password: '', reminders: true },
  jira: { url: '', login: '', token: '', defaultProject: '', hotkey: '' },
  resonance: { login: '', password: '', connected: false, lastChecked: '' },
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
      tasks: [], history: state.history, notes: state.notes, calendarEvents: [],
      notifications: state.notifications, settings: safeSettings,
      timer: state.timer, pomodoro: state.pomodoro, lunch: state.lunch,
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

const initialState: AppState = {
  tasks: [],
  history: saved.history ?? [],
  notes: saved.notes ?? [],
  calendarEvents: [],
  notifications: saved.notifications ?? [],
  timer: restoreTimer(saved.timer),
  pomodoro: saved.pomodoro ? { ...DEFAULT_POMODORO, ...saved.pomodoro } : DEFAULT_POMODORO,
  lunch: saved.lunch ?? { active: false, startTime: null, lunchElapsed: 0, previousTask: null },
  settings: saved.settings ?? DEFAULT_SETTINGS,
  stopDialogOpen: false,
  switchDialogOpen: false,
  pendingSwitchTask: null,
  lunchRestoreOpen: false,
  notifOpen: false,
  compactMode: false,
  selectedDate: `${new Date().getFullYear()}-${String(new Date().getMonth()+1).padStart(2,'0')}-${String(new Date().getDate()).padStart(2,'0')}`,
  loading: { kanban: false, calendar: false, notes: false },
  config: null,
};

function reducer(state: AppState, action: Action): AppState {
  switch (action.type) {
    case 'START_TIMER':
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
    case 'LUNCH_TICK':
      if (!state.lunch.active) return state;
      return { ...state, lunch: { ...state.lunch, lunchElapsed: state.lunch.lunchElapsed + 1 } };
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
      if (action.action === 'complete' && state.timer.activeTask) {
        newTasks = newTasks.map(t => t.id === state.timer.activeTask!.id ? { ...t, status: 'Done' as const } : t);
        const doneNotif: AppNotification = { id: Date.now() + 1, type: 'task_done', text: `Задача завершена: ${state.timer.activeTask.title}`, timestamp: new Date().toTimeString().slice(0,5), isRead: false };
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
      };
    }
    case 'START_LUNCH': {
      const prevTask = state.timer.activeTask;
      return {
        ...state,
        lunch: { active: true, startTime: Date.now(), lunchElapsed: 0, previousTask: prevTask },
        timer: prevTask ? { ...state.timer, status: 'paused' } : state.timer,
      };
    }
    case 'END_LUNCH':
      return { ...state, lunch: { ...state.lunch, active: false }, lunchRestoreOpen: state.lunch.previousTask !== null };
    case 'CONFIRM_LUNCH_RESTORE': {
      const prevTask = state.lunch.previousTask;
      return {
        ...state,
        lunchRestoreOpen: false,
        lunch: { ...state.lunch, previousTask: null },
        timer: action.restore && prevTask ? { status: 'running', activeTask: prevTask, elapsed: state.timer.elapsed } : state.timer,
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
    case 'UPDATE_TASK':
      return { ...state, tasks: state.tasks.map(t => t.id === action.task.id ? action.task : t) };
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
    case 'SET_TASKS':
      return { ...state, tasks: action.tasks };
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
  startLunch: () => void;
  endLunch: () => void;
  ensureKanbanLoaded: (force?: boolean, notify?: boolean) => Promise<void>;
  ensureCalendarLoaded: (force?: boolean) => Promise<void>;
  ensureNotesLoaded: (force?: boolean) => Promise<void>;
  reloadHistory: () => Promise<void>;
}

const AppContext = createContext<AppContextValue | null>(null);

export function AppProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(reducer, initialState);
  const stateRef = useRef(state);
  const kanbanRequestRef = useRef<Promise<void> | null>(null);
  const calendarRequestRef = useRef<Promise<void> | null>(null);
  const notesRequestRef = useRef<Promise<void> | null>(null);

  useEffect(() => {
    stateRef.current = state;
  }, [state]);

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
            alwaysOnTop: config.always_on_top !== false,
            compactMode: windowState?.compactMode === true,
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
            jira: { ...DEFAULT_SETTINGS.jira, url: config.jira_url || '', login: config.jira_user || '', token: '', defaultProject: config.jira_project || '', hotkey: config.jira_hotkey || '' },
            resonance: {
              ...DEFAULT_SETTINGS.resonance,
              login: config.resonance?.login || '',
              connected: config.resonance?.connected === true,
              lastChecked: config.resonance?.lastChecked || '',
            },
          },
        });
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
    saveState(state);
  }, [state]);

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
    if (!state.pomodoro.isRunning) return;
    const interval = setInterval(() => dispatch({ type: 'POMODORO_TICK' }), 1000);
    return () => clearInterval(interval);
  }, [state.pomodoro.isRunning]);

  useEffect(() => {
    if (!state.lunch.active) return;
    const interval = setInterval(() => dispatch({ type: 'LUNCH_TICK' }), 1000);
    return () => clearInterval(interval);
  }, [state.lunch.active]);

  useEffect(() => {
    if (state.pomodoro.completionCount === 0) return;
    const completedPhase = state.pomodoro.phase === 'focus' ? 'break' : 'focus';
    const msg = completedPhase === 'focus'
      ? 'Pomodoro завершён — время сделать перерыв'
      : 'Перерыв закончился — время работать';
    toast.info(msg);
  }, [state.pomodoro.completionCount]);

  useEffect(() => {
    if (!state.settings.calendar.reminders) return;
    const check = () => {
      const now = new Date();
      const nowMins = now.getHours() * 60 + now.getMinutes();
      const ts = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
      state.calendarEvents.forEach(event => {
        const [h, m] = event.start.split(':').map(Number);
        const diff = (h * 60 + m) - nowMins;
        if (diff === 5) {
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
  }, [state.calendarEvents, state.settings.calendar.reminders]);

  const startTimer = useCallback((task: Task) => {
    if (state.timer.status !== 'idle') {
      dispatch({ type: 'REQUEST_SWITCH', task });
    } else {
      dispatch({ type: 'START_TIMER', task });
      const token = state.config?.kanban?.token;
      if (window.api?.kanbanUpdateTaskStage && token && ['new', 'to do', 'backlog'].includes(String(task.status).toLowerCase())) {
        window.api.kanbanUpdateTaskStage(task.id, 2, token).catch(() => {});
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
        await window.api.kanbanLogWork(task.id, startTime.toISOString(), `${comment.trim()} | Task Tracker`, roundedMinutes, token).catch(() => {});
      }
      if (complete && window.api.kanbanUpdateTaskStage) {
        await window.api.kanbanUpdateTaskStage(task.id, 3, token).catch(() => {});
      }
    }
    await reloadHistory();
  }, [reloadHistory, state.config]);

  const requestStop = useCallback(() => dispatch({ type: 'OPEN_STOP_DIALOG' }), []);
  const confirmStop = useCallback((comment: string) => {
    const activeTask = state.timer.activeTask;
    persistTaskWork(activeTask, state.timer.elapsed, comment).catch(() => {});
    dispatch({ type: 'CONFIRM_STOP', comment });
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
      if (nextTask && token && window.api?.kanbanUpdateTaskStage && ['new', 'to do', 'backlog'].includes(String(nextTask.status).toLowerCase())) {
        window.api.kanbanUpdateTaskStage(nextTask.id, 2, token).catch(() => {});
      }
    }
    dispatch({ type: 'CONFIRM_SWITCH', action, comment });
    if (action !== 'cancel') toast.success('Задача переключена');
  }, [persistTaskWork, state.config, state.pendingSwitchTask, state.timer.activeTask, state.timer.elapsed]);
  const startLunch = useCallback(() => {
    dispatch({ type: 'START_LUNCH' });
    toast.info('Ушёл на обед — таймер на паузе');
  }, []);
  const endLunch = useCallback(() => {
    dispatch({ type: 'END_LUNCH' });
  }, []);

  const ensureKanbanLoaded = useCallback(async (force = false, notify = false) => {
    if (!window.api) return;
    if (kanbanRequestRef.current) return kanbanRequestRef.current;
    const current = stateRef.current;
    if (!force && current.tasks.length > 0) return;

    kanbanRequestRef.current = (async () => {
      dispatch({ type: 'SET_LOADING', key: 'kanban', value: true });
      try {
        const latest = stateRef.current;
        const config = latest.config || await window.api!.loadConfig();
        dispatch({ type: 'SET_CONFIG', config });
        const tasks = await loadRealKanbanTasks(config);
        const refreshedConfig = await window.api!.loadConfig().catch(() => config);
        dispatch({ type: 'SET_CONFIG', config: refreshedConfig });
        dispatch({ type: 'SET_TASKS', tasks });
        if (notify) toast.success(`Kanban обновлён: ${tasks.length} задач`);
      } catch (error: any) {
        toast.error(error?.message || 'Не удалось загрузить Kanban');
      } finally {
        dispatch({ type: 'SET_LOADING', key: 'kanban', value: false });
        kanbanRequestRef.current = null;
      }
    })();
    return kanbanRequestRef.current;
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
    <AppContext.Provider value={{ state, dispatch, startTimer, requestStop, confirmStop, cancelStop, requestSwitch, confirmSwitch, startLunch, endLunch, ensureKanbanLoaded, ensureCalendarLoaded, ensureNotesLoaded, reloadHistory }}>
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
