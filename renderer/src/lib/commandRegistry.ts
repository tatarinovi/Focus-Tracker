export interface Command {
  id: string;
  title: string;
  subtitle: string;
  category: CommandCategory;
  keywords: string[];
  icon: string;
  shortcut?: string;
  enabled: boolean;
}

export type CommandCategory = 'timer' | 'pomodoro' | 'bitrix' | 'navigation' | 'tasks';

export interface PaletteCommand {
  type: string;
  payload?: Record<string, unknown>;
}

export interface PaletteTask {
  id: number;
  title: string;
  project: string;
  status: string;
  priority: string;
}

export const CATEGORY_LABELS: Record<CommandCategory, string> = {
  timer: 'Таймер',
  pomodoro: 'Pomodoro',
  bitrix: 'Bitrix24',
  navigation: 'Навигация',
  tasks: 'Задачи',
};

export const CATEGORY_SHORTCUTS: Record<CommandCategory, string> = {
  timer: 'Timer',
  pomodoro: 'Pomodoro',
  bitrix: 'B24',
  navigation: 'Nav',
  tasks: 'Task',
};

export function buildMVPCommands(ctx: {
  timerStatus: 'idle' | 'running' | 'paused';
  hasActiveTask: boolean;
  bitrixPhase: string;
}): Command[] {
  const { timerStatus, bitrixPhase } = ctx;

  return [
    {
      id: 'timer.pause',
      title: 'Пауза таймера',
      subtitle: 'Текущий трекер работает',
      category: 'timer',
      keywords: ['пауза', 'стоп', 'pause', 'stop'],
      icon: 'Pause',
      enabled: timerStatus === 'running',
    },
    {
      id: 'timer.resume',
      title: 'Продолжить таймер',
      subtitle: 'Текущий трекер на паузе',
      category: 'timer',
      keywords: ['старт', 'продолжить', 'resume', 'start'],
      icon: 'Play',
      enabled: timerStatus === 'paused',
    },
    {
      id: 'timer.stop',
      title: 'Остановить таймер',
      subtitle: 'Записать время и остановить',
      category: 'timer',
      keywords: ['остановить', 'завершить', 'stop'],
      icon: 'Square',
      enabled: timerStatus !== 'idle',
    },
    {
      id: 'pomodoro.start',
      title: 'Старт Pomodoro',
      subtitle: 'Фокус-сессия',
      category: 'pomodoro',
      keywords: ['помодоро', 'старт', 'pomodoro', 'focus'],
      icon: 'Timer',
      enabled: true,
    },
    {
      id: 'bitrix.day.start',
      title: 'Начать рабочий день',
      subtitle: 'Bitrix24 · начало дня',
      category: 'bitrix',
      keywords: ['битрикс', 'начать', 'bitrix', 'workday', 'день'],
      icon: 'Briefcase',
      enabled: bitrixPhase === 'not_started',
    },
    {
      id: 'bitrix.break.start',
      title: 'Взять перерыв',
      subtitle: 'Bitrix24 · в работе',
      category: 'bitrix',
      keywords: ['перерыв', 'битрикс', 'break', 'lunch', 'отдых'],
      icon: 'Coffee',
      enabled: bitrixPhase === 'working',
    },
    {
      id: 'bitrix.break.end',
      title: 'Завершить перерыв',
      subtitle: 'Bitrix24 · на перерыве',
      category: 'bitrix',
      keywords: ['продолжить', 'работать', 'break', 'resume', 'work'],
      icon: 'Briefcase',
      enabled: bitrixPhase === 'break',
    },
    {
      id: 'bitrix.day.end',
      title: 'Завершить рабочий день',
      subtitle: 'Bitrix24 · завершить день',
      category: 'bitrix',
      keywords: ['завершить', 'день', 'end', 'day', 'finish'],
      icon: 'LogOut',
      enabled: bitrixPhase === 'working',
    },
    {
      id: 'nav.home',
      title: 'Главная',
      subtitle: 'Открыть раздел',
      category: 'navigation',
      keywords: ['главная', 'home', 'фокус', 'main'],
      icon: 'Circle',
      enabled: true,
    },
    {
      id: 'nav.kanban',
      title: 'Kanban',
      subtitle: 'Открыть доску',
      category: 'navigation',
      keywords: ['канбан', 'задачи', 'board', 'kanban'],
      icon: 'LayoutGrid',
      enabled: true,
    },
    {
      id: 'nav.settings',
      title: 'Настройки',
      subtitle: 'Настройки приложения',
      category: 'navigation',
      keywords: ['настройки', 'settings', 'config'],
      icon: 'Settings',
      enabled: true,
    },
    {
      id: 'nav.calendar',
      title: 'Календарь',
      subtitle: 'Открыть календарь',
      category: 'navigation',
      keywords: ['календарь', 'calendar', 'события'],
      icon: 'Calendar',
      enabled: true,
    },
  ];
}

export function commandToPaletteCommand(id: string): PaletteCommand {
  switch (id) {
    case 'timer.pause':
      return { type: 'timer.pause' };
    case 'timer.resume':
      return { type: 'timer.resume' };
    case 'timer.stop':
      return { type: 'timer.stop' };
    case 'pomodoro.start':
      return { type: 'pomodoro.start' };
    case 'bitrix.day.start':
      return { type: 'bitrix.day.start' };
    case 'bitrix.break.start':
      return { type: 'bitrix.break.start' };
    case 'bitrix.break.end':
      return { type: 'bitrix.break.end' };
    case 'bitrix.day.end':
      return { type: 'bitrix.day.end' };
    case 'nav.home':
      return { type: 'navigation.open', payload: { page: 'home' } };
    case 'nav.kanban':
      return { type: 'navigation.open', payload: { page: 'kanban' } };
    case 'nav.settings':
      return { type: 'navigation.open', payload: { page: 'settings' } };
    case 'nav.calendar':
      return { type: 'navigation.open', payload: { page: 'calendar' } };
    default:
      return { type: 'noop' };
  }
}
