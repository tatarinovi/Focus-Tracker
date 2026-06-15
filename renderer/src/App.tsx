import { Switch, Route, Router as WouterRouter, Link, useLocation } from "wouter";
import { memoryLocation } from "wouter/memory-location";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { TooltipProvider } from "@/components/ui/tooltip";
import { Toaster } from "@/components/ui/sonner";
import { Target, LayoutGrid, Calendar, Clock, Timer, FileText, Settings, Info, Bell, Minimize2, Maximize2, Circle, Menu, X, Minus, Square, Ticket, FilterX } from "lucide-react";
import { AppProvider, useApp } from "@/context/AppContext";
import { formatSeconds, formatMinutes } from "@/data/mockData";
import { playAppSound } from "@/lib/appAudio";
import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { FilterMultiSelect } from "@/components/FilterMultiSelect";
import { BitrixTimemanWidget } from "@/components/BitrixTimemanWidget";

const isTauri = typeof window !== 'undefined' && !!window.tauriRuntime?.isTauri;
const drag = { WebkitAppRegion: 'drag' } as React.CSSProperties;
const noDrag = { WebkitAppRegion: 'no-drag' } as React.CSSProperties;
const appLogoSrc = "/logo-mark.svg";
const appLogoLightSrc = "/logo-mark-light.svg";

function useWindowMaximized() {
  const [isMaximized, setIsMaximized] = useState(false);
  useEffect(() => {
    if (!isTauri) return;
    window.tauriRuntime!.windowControls.isMaximized().then(setIsMaximized);
    const off = window.tauriRuntime!.windowControls.onMaximizeChange(setIsMaximized);
    return off;
  }, []);
  return isMaximized;
}

function WindowControls() {
  const isMaximized = useWindowMaximized();
  if (!isTauri) return null;

  const platform = window.tauriRuntime!.platform;
  const isMac = platform === 'darwin';

  const buttons = [
    {
      label: 'Свернуть',
      icon: <Minus className="w-3 h-3" />,
      onClick: () => window.tauriRuntime!.windowControls.minimize(),
      hoverClass: 'hover:bg-yellow-500/20 hover:text-yellow-400',
    },
    {
      label: isMaximized ? 'Восстановить' : 'Развернуть',
      icon: isMaximized
        ? <svg viewBox="0 0 12 12" className="w-3 h-3" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M2 8V2h6M4 4h6v6H4z"/></svg>
        : <Square className="w-3 h-3" />,
      onClick: () => window.tauriRuntime!.windowControls.toggleMaximize(),
      hoverClass: 'hover:bg-green-500/20 hover:text-green-400',
    },
    {
      label: 'Закрыть',
      icon: <X className="w-3.5 h-3.5" />,
      onClick: () => window.tauriRuntime!.windowControls.close(),
      hoverClass: 'hover:bg-red-500 hover:text-white',
    },
  ];

  const ordered = isMac ? [...buttons].reverse() : buttons;

  return (
    <div
      style={noDrag}
      className={`flex items-stretch h-full ${isMac ? 'flex-row-reverse mr-1' : 'ml-1'}`}
    >
      {ordered.map((btn) => (
        <button
          key={btn.label}
          title={btn.label}
          onClick={btn.onClick}
          className={`w-11 h-full flex items-center justify-center text-muted-foreground transition-all duration-100 ${btn.hoverClass}`}
        >
          {btn.icon}
        </button>
      ))}
    </div>
  );
}

import { lazy, Suspense } from "react";

const FocusPage = lazy(() => import("@/pages/FocusPage"));
const KanbanPage = lazy(() => import("@/pages/KanbanPage"));
const CalendarPage = lazy(() => import("@/pages/CalendarPage"));
const HistoryPage = lazy(() => import("@/pages/HistoryPage"));
const PomodoroPage = lazy(() => import("@/pages/PomodoroPage"));
const NotesPage = lazy(() => import("@/pages/NotesPage"));
const SettingsPage = lazy(() => import("@/pages/SettingsPage"));
const AboutPage = lazy(() => import("@/pages/AboutPage"));
const JiraPage = lazy(() => import("@/pages/JiraPage"));
const NotFound = lazy(() => import("@/pages/not-found"));

const queryClient = new QueryClient();
const tauriLocation = memoryLocation({ path: "/" });

function useIsNarrow(breakpoint = 1024) {
  const [narrow, setNarrow] = useState(() => window.innerWidth < breakpoint);
  useEffect(() => {
    const handler = () => setNarrow(window.innerWidth < breakpoint);
    window.addEventListener('resize', handler);
    return () => window.removeEventListener('resize', handler);
  }, [breakpoint]);
  return narrow;
}

function NotificationPanel() {
  const { state, dispatch } = useApp();
  const [filterTypes, setFilterTypes] = useState<string[]>([]);
  const unread = state.notifications.filter(n => !n.isRead).length;
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!state.notifOpen) return;
    const handleClickOutside = (e: MouseEvent) => {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) {
        dispatch({ type: 'TOGGLE_NOTIF' });
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [state.notifOpen, dispatch]);

  const notifIcons: Record<string, string> = {
    pomodoro_done: '⏰', meeting_soon: '📅', timer_long: '⚠️',
    task_done: '✓', time_recorded: '⏱', integration_error: '✗',
    break_time: '☕', update_available: '↑', kanban_new_task: '📋',
  };

  const notifTypeLabels: Record<string, string> = {
    pomodoro_done: 'Pomodoro',
    meeting_soon: 'Созвоны',
    timer_long: 'Долгий таймер',
    task_done: 'Завершение задач',
    time_recorded: 'Запись времени',
    integration_error: 'Ошибки',
    break_time: 'Перерывы',
    update_available: 'Обновления',
    kanban_new_task: 'Kanban',
  };

  const typeOptions = useMemo(() => {
    const present = new Set(state.notifications.map(n => n.type));
    return [...present]
      .sort((a, b) => (notifTypeLabels[a] || a).localeCompare(notifTypeLabels[b] || b, 'ru'))
      .map(type => ({ value: type, label: notifTypeLabels[type] || type }));
  }, [state.notifications]);

  const filteredNotifications = useMemo(() => {
    if (filterTypes.length === 0) return state.notifications;
    return state.notifications.filter(n => filterTypes.includes(n.type));
  }, [state.notifications, filterTypes]);

  return (
    <div className="relative" ref={panelRef}>
      <button
        data-testid="button-notifications"
        onClick={() => dispatch({ type: 'TOGGLE_NOTIF' })}
        className="relative p-2 rounded-md hover:bg-secondary transition-colors"
      >
        <Bell className="w-4 h-4 text-muted-foreground" />
        {unread > 0 && (
          <span className="absolute -top-0.5 -right-0.5 w-4 h-4 bg-red-500 text-white text-[10px] font-bold rounded-full flex items-center justify-center">
            {unread > 9 ? '9+' : unread}
          </span>
        )}
      </button>
      {state.notifOpen && (
        <div className="absolute right-0 top-10 w-80 bg-popover border border-popover-border rounded-lg shadow-xl z-50 overflow-hidden">
          <div className="px-4 py-3 border-b border-border space-y-2">
            <div className="flex items-center justify-between gap-2">
              <span className="text-sm font-semibold">Уведомления</span>
              <button
                onClick={() => dispatch({ type: 'MARK_ALL_READ' })}
                className="text-xs text-primary hover:underline flex-shrink-0"
              >
                Прочитать все
              </button>
            </div>
            {typeOptions.length > 0 && (
              <div className="flex items-center gap-1.5">
                <FilterMultiSelect
                  data-testid="filter-notif-types"
                  values={filterTypes}
                  onChange={setFilterTypes}
                  placeholder="Все типы"
                  options={typeOptions}
                  className="min-w-0 flex-1"
                />
                {filterTypes.length > 0 && (
                  <button
                    type="button"
                    data-testid="button-notif-reset-filter"
                    onClick={() => setFilterTypes([])}
                    className="flex-shrink-0 rounded-md border border-border p-1.5 text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
                    title="Сбросить фильтр"
                  >
                    <FilterX className="w-3 h-3" />
                  </button>
                )}
              </div>
            )}
          </div>
          <div className="max-h-80 overflow-y-auto scrollbar-thin">
            {filteredNotifications.length === 0 ? (
              <div className="py-8 text-center text-sm text-muted-foreground">
                {state.notifications.length === 0 ? 'Нет уведомлений' : 'Нет уведомлений по выбранным типам'}
              </div>
            ) : filteredNotifications.map(n => (
              <button
                key={n.id}
                data-testid={`notif-item-${n.id}`}
                onClick={() => {
                  dispatch({ type: 'MARK_NOTIF_READ', id: n.id });
                  if (n.type === 'kanban_new_task') {
                    window.location.href = '/kanban';
                  }
                }}
                className={`w-full text-left px-4 py-3 border-b border-border/50 hover:bg-secondary/50 transition-colors ${!n.isRead ? 'bg-primary/5' : ''}`}
              >
                <div className="flex items-start gap-2">
                  <span className="text-sm mt-0.5">{notifIcons[n.type] || '•'}</span>
                  <div className="flex-1 min-w-0">
                    <p className={`text-xs leading-relaxed ${!n.isRead ? 'text-foreground font-medium' : 'text-muted-foreground'}`}>{n.text}</p>
                    <p className="text-[11px] text-muted-foreground mt-0.5">{n.timestamp}</p>
                  </div>
                  {!n.isRead && <div className="w-1.5 h-1.5 rounded-full bg-primary mt-1 flex-shrink-0" />}
                </div>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function Topbar({ onMenuClick, isNarrow }: { onMenuClick: () => void; isNarrow: boolean }) {
  const { state, dispatch, requestStop } = useApp();
  const { timer } = state;
  const currentElapsed = timer.elapsed;

  const today = new Date();
  const todayStr = `${today.toLocaleDateString('ru-RU', { weekday: 'long', day: 'numeric', month: 'long' })}`;

  return (
    <div
      className="h-[47px] border-b border-border bg-background flex items-center justify-between flex-shrink-0 z-40 select-none"
      style={isTauri ? drag : undefined}
    >
      {/* Left: hamburger + date + active task */}
      <div className="flex items-center gap-4 px-4" style={isTauri ? noDrag : undefined}>
        {isNarrow && (
          <button
            onClick={onMenuClick}
            className="p-1.5 rounded-md hover:bg-secondary transition-colors"
            aria-label="Открыть меню"
          >
            <Menu className="w-4 h-4 text-muted-foreground" />
          </button>
        )}
        <span className="text-xs text-muted-foreground capitalize">{todayStr}</span>
        {timer.activeTask && (
          <div className="flex items-center gap-2 bg-secondary rounded-md px-3 py-1">
            <Circle className={`w-2 h-2 ${timer.status === 'running' ? 'text-green-500 fill-green-500' : 'text-yellow-500 fill-yellow-500'}`} />
            <span className="text-xs font-medium truncate max-w-40">{timer.activeTask.title}</span>
            <span className="font-mono text-xs text-muted-foreground">{formatSeconds(currentElapsed)}</span>
            {timer.status === 'running' && (
              <button onClick={() => dispatch({ type: 'PAUSE_TIMER' })} className="text-[10px] text-muted-foreground hover:text-foreground">⏸</button>
            )}
            {timer.status === 'paused' && (
              <button onClick={() => dispatch({ type: 'RESUME_TIMER' })} className="text-[10px] text-muted-foreground hover:text-foreground">▶</button>
            )}
            <button onClick={requestStop} className="text-[10px] text-muted-foreground hover:text-destructive">■</button>
          </div>
        )}
      </div>

      {/* Right: app controls + window controls */}
      <div className="flex items-stretch h-full">
        <div className="flex items-center gap-1 px-2" style={isTauri ? noDrag : undefined}>
          <BitrixTimemanWidget />
          <button
            data-testid="button-compact-toggle"
            onClick={() => dispatch({ type: 'TOGGLE_COMPACT' })}
            className="p-1.5 rounded-md hover:bg-secondary transition-colors"
            title={state.compactMode ? "Полный режим" : "Компактный режим"}
          >
            {state.compactMode ? <Maximize2 className="w-4 h-4 text-muted-foreground" /> : <Minimize2 className="w-4 h-4 text-muted-foreground" />}
          </button>
          <NotificationPanel />
        </div>
        {/* Window chrome buttons — only visible in Tauri */}
        <div className="border-l border-border">
          <WindowControls />
        </div>
      </div>
    </div>
  );
}

function Sidebar({ isNarrow, isOpen, onClose }: { isNarrow: boolean; isOpen: boolean; onClose: () => void }) {
  const [location] = useLocation();
  const { state } = useApp();
  const logoSrc = state.settings.theme === 'light' ? appLogoLightSrc : appLogoSrc;

  const navItems = [
    { href: "/", label: "Главная", icon: Target },
    { href: "/kanban", label: "Kanban", icon: LayoutGrid },
    { href: "/jira", label: "Jira", icon: Ticket },
    { href: "/calendar", label: "Календарь", icon: Calendar },
    { href: "/history", label: "История", icon: Clock },
    { href: "/pomodoro", label: "Pomodoro", icon: Timer },
    { href: "/notes", label: "Заметки", icon: FileText },
    { href: "/settings", label: "Настройки", icon: Settings },
    { href: "/about", label: "О приложении", icon: Info },
  ];

  const todayKey = `${new Date().getFullYear()}-${String(new Date().getMonth()+1).padStart(2,'0')}-${String(new Date().getDate()).padStart(2,'0')}`;
  const todayHistory = state.history.filter(h => h.date === todayKey);
  const totalMinutes = todayHistory.reduce((sum, h) => sum + h.duration, 0);

  const bitrixPhase = state.bitrixTimeman.phase;
  const bitrixStatus = state.bitrixTimeman.syncStatus === 'syncing'
    ? 'loading'
    : bitrixPhase === 'working' || bitrixPhase === 'break'
      ? 'connected'
      : 'disconnected';

  const integrations = [
    { label: 'Bitrix24', status: bitrixStatus, loading: state.bitrixTimeman.syncStatus === 'syncing' },
    { label: 'Kanban', status: state.config?.kanban?.token ? 'connected' : 'disconnected', loading: state.loading.kanban },
    { label: 'Календарь', status: state.settings.calendar.url ? 'connected' : 'disconnected', loading: state.loading.calendar },
    { label: 'Jira', status: state.settings.jira.url && state.settings.jira.login ? 'connected' : 'disconnected', loading: state.loading.jira },
    { label: 'Resonance', status: state.settings.resonance.connected ? 'connected' : 'disconnected', loading: false },
  ];

  const statusColor: Record<string, string> = {
    connected: 'bg-green-500',
    partial: 'bg-yellow-500',
    disconnected: 'bg-gray-500',
    loading: 'bg-blue-500 animate-pulse',
  };

  const sidebarContent = (
    <div className="w-56 flex-shrink-0 bg-sidebar border-r border-sidebar-border flex flex-col h-full">
      <div className="h-[47px] px-3 border-b border-sidebar-border flex items-center">
        <div className="flex items-center justify-between px-2 w-full">
          <div className="flex items-center gap-2">
            <img src={logoSrc} alt="" className="w-5 h-5 flex-shrink-0" />
            <span className="font-semibold text-sm text-sidebar-foreground">Focus Tracker</span>
          </div>
          {isNarrow && (
            <button onClick={onClose} className="p-1 rounded hover:bg-sidebar-accent/60 transition-colors">
              <X className="w-4 h-4 text-muted-foreground" />
            </button>
          )}
        </div>
      </div>

      <nav className="flex-1 p-2 space-y-0.5 overflow-y-auto scrollbar-thin">
        {navItems.map((item) => {
          const isActive = location === item.href || (item.href !== '/' && location.startsWith(item.href));
          return (
            <Link
              key={item.href}
              href={item.href}
              data-testid={`nav-${item.href.replace('/', '') || 'focus'}`}
              onClick={isNarrow ? onClose : undefined}
              className={`flex items-center gap-2.5 px-2.5 py-2 rounded-md transition-colors text-sm ${
                isActive
                  ? 'bg-sidebar-accent text-sidebar-accent-foreground font-medium'
                  : 'text-sidebar-foreground hover:bg-sidebar-accent/60 hover:text-sidebar-accent-foreground'
              }`}
            >
              <item.icon className="w-4 h-4 flex-shrink-0" />
              {item.label}
            </Link>
          );
        })}
      </nav>

      <div className="p-3 border-t border-sidebar-border space-y-3">
        <div className="px-2 space-y-1">
          <div className="flex items-center justify-between">
            <span className="text-xs text-muted-foreground">Сегодня</span>
            <span className="text-xs font-medium text-sidebar-foreground">{formatMinutes(totalMinutes)}</span>
          </div>
        </div>

        <div className="px-2 space-y-1.5">
          {integrations.map(int => (
            <div key={int.label} className="flex items-center justify-between">
              <span className="text-[11px] text-muted-foreground">{int.label}</span>
              <div className={`w-1.5 h-1.5 rounded-full ${int.loading ? 'bg-blue-500 animate-pulse' : statusColor[int.status]}`} />
            </div>
          ))}
        </div>
      </div>
    </div>
  );

  if (!isNarrow) return sidebarContent;

  return (
    <>
      {/* Backdrop */}
      <div
        className={`fixed inset-0 z-40 bg-black/50 transition-opacity duration-200 ${isOpen ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none'}`}
        onClick={onClose}
      />
      {/* Drawer */}
      <div
        className={`fixed top-0 left-0 h-full z-50 transition-transform duration-200 ease-in-out ${isOpen ? 'translate-x-0' : '-translate-x-full'}`}
      >
        {sidebarContent}
      </div>
    </>
  );
}

function CompactMode() {
  const { state, dispatch } = useApp();
  const { timer } = state;

  return (
    <div
      className="h-screen w-screen bg-card border border-border text-foreground overflow-hidden select-none"
      style={isTauri ? drag : undefined}
    >
      <div className="flex items-center justify-between h-7 px-2 border-b border-border">
        <span className="text-[10px] font-semibold text-muted-foreground truncate">Focus Tracker</span>
        <button
          onClick={() => dispatch({ type: 'TOGGLE_COMPACT' })}
          className="p-1 text-muted-foreground hover:text-foreground rounded"
          style={isTauri ? noDrag : undefined}
          title="Полный режим"
        >
          <Maximize2 className="w-3.5 h-3.5" />
        </button>
      </div>
      <div className="px-2 py-2" style={isTauri ? noDrag : undefined}>
        {timer.activeTask ? (
          <>
            <p className="text-[11px] font-medium truncate mb-1">{timer.activeTask.title}</p>
            <div className="font-mono text-2xl font-bold text-center text-primary leading-tight mb-2">{formatSeconds(timer.elapsed)}</div>
            <div className="flex gap-1">
              {timer.status === 'idle' && timer.activeTask && (
                <button onClick={() => dispatch({ type: 'RESUME_TIMER' })} className="flex-1 bg-primary text-primary-foreground rounded-md py-1 text-[11px] font-medium">Старт</button>
              )}
              {timer.status === 'running' && (
                <button onClick={() => dispatch({ type: 'PAUSE_TIMER' })} className="flex-1 bg-secondary text-secondary-foreground rounded-md py-1 text-[11px] font-medium">Пауза</button>
              )}
              {timer.status === 'paused' && (
                <button onClick={() => dispatch({ type: 'RESUME_TIMER' })} className="flex-1 bg-primary text-primary-foreground rounded-md py-1 text-[11px] font-medium">Продолжить</button>
              )}
            </div>
          </>
        ) : (
          <div className="h-[86px] flex items-center justify-center text-[11px] text-muted-foreground text-center px-2">
            Задача не выбрана
          </div>
        )}
      </div>
    </div>
  );
}

function StopDialog() {
  const { state, confirmStop, cancelStop } = useApp();
  const [comment, setComment] = useState('');
  const [error, setError] = useState(false);

  if (!state.stopDialogOpen) return null;

  const handleConfirm = () => {
    if (!comment.trim()) {
      setError(true);
      playAppSound("error");
      return;
    }
    confirmStop(comment.trim());
    setComment('');
    setError(false);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/50" onClick={cancelStop} />
      <div className="relative bg-card border border-border rounded-xl shadow-2xl w-full max-w-md p-6">
        <h2 className="text-base font-semibold mb-1">Остановить таймер</h2>
        {state.timer.activeTask && (
          <p className="text-sm text-muted-foreground mb-4">{state.timer.activeTask.title}</p>
        )}
        <p className="text-sm text-muted-foreground mb-2">Что было сделано? <span className="text-destructive">*</span></p>
        <textarea
          data-testid="input-stop-comment"
          value={comment}
          onChange={e => { setComment(e.target.value); setError(false); }}
          placeholder="Опишите кратко, что сделано..."
          className={`w-full bg-input border ${error ? 'border-destructive' : 'border-border'} rounded-lg p-3 text-sm resize-none h-24 focus:outline-none focus:ring-2 focus:ring-ring`}
          autoFocus
        />
        {error && <p className="text-xs text-destructive mt-1">Комментарий обязателен</p>}
        <div className="flex gap-2 mt-4">
          <button
            data-testid="button-confirm-stop"
            onClick={handleConfirm}
            className="flex-1 bg-primary text-primary-foreground rounded-lg py-2 text-sm font-medium hover:opacity-90 transition-opacity"
          >
            Сохранить и остановить
          </button>
          <button
            data-testid="button-cancel-stop"
            onClick={cancelStop}
            className="px-4 bg-secondary text-secondary-foreground rounded-lg py-2 text-sm hover:opacity-90 transition-opacity"
          >
            Отмена
          </button>
        </div>
      </div>
    </div>
  );
}

function SwitchDialog() {
  const { state, confirmSwitch } = useApp();
  const [comment, setComment] = useState('');

  if (!state.switchDialogOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/50" onClick={() => confirmSwitch('cancel')} />
      <div className="relative bg-card border border-border rounded-xl shadow-2xl w-full max-w-md p-6">
        <h2 className="text-base font-semibold mb-1">Переключить задачу</h2>
        {state.timer.activeTask && (
          <p className="text-sm text-muted-foreground mb-1">Текущая: <span className="text-foreground">{state.timer.activeTask.title}</span></p>
        )}
        {state.pendingSwitchTask && (
          <p className="text-sm text-muted-foreground mb-4">Новая: <span className="text-foreground">{state.pendingSwitchTask.title}</span></p>
        )}
        <textarea
          value={comment}
          onChange={e => setComment(e.target.value)}
          placeholder="Комментарий к текущей задаче (необязательно)..."
          className="w-full bg-input border border-border rounded-lg p-3 text-sm resize-none h-16 focus:outline-none focus:ring-2 focus:ring-ring mb-4"
        />
        <div className="flex gap-2">
          <button
            data-testid="button-switch-task"
            onClick={() => { confirmSwitch('switch', comment); setComment(''); }}
            className="flex-1 bg-primary text-primary-foreground rounded-lg py-2 text-sm font-medium hover:opacity-90"
          >
            Переключиться
          </button>
          <button
            data-testid="button-switch-complete"
            onClick={() => { confirmSwitch('complete', comment); setComment(''); }}
            className="flex-1 bg-secondary text-secondary-foreground rounded-lg py-2 text-sm font-medium hover:opacity-90"
          >
            Завершена
          </button>
          <button
            data-testid="button-switch-cancel"
            onClick={() => confirmSwitch('cancel')}
            className="px-4 text-sm text-muted-foreground hover:text-foreground"
          >
            Отмена
          </button>
        </div>
      </div>
    </div>
  );
}

function LunchRestoreDialog() {
  const { state, dispatch } = useApp();

  if (!state.lunchRestoreOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/50" />
      <div className="relative bg-card border border-border rounded-xl shadow-2xl w-full max-w-sm p-6">
        <h2 className="text-base font-semibold mb-2">Вернулся с перерыва</h2>
        {state.bitrixTimeman.previousTask ? (
          <>
            <p className="text-sm text-muted-foreground mb-4">
              Продолжить работу над задачей <span className="text-foreground font-medium">"{state.bitrixTimeman.previousTask.title}"</span>?
            </p>
            <div className="flex gap-2">
              <button
                data-testid="button-restore-task"
                onClick={() => dispatch({ type: 'CONFIRM_LUNCH_RESTORE', restore: true })}
                className="flex-1 bg-primary text-primary-foreground rounded-lg py-2 text-sm font-medium"
              >
                Продолжить
              </button>
              <button
                onClick={() => dispatch({ type: 'CONFIRM_LUNCH_RESTORE', restore: false })}
                className="flex-1 bg-secondary text-secondary-foreground rounded-lg py-2 text-sm"
              >
                Нет, спасибо
              </button>
            </div>
          </>
        ) : (
          <button onClick={() => dispatch({ type: 'CONFIRM_LUNCH_RESTORE', restore: false })} className="w-full bg-primary text-primary-foreground rounded-lg py-2 text-sm font-medium">
            Хорошо
          </button>
        )}
      </div>
    </div>
  );
}

function AppLayout() {
  const { state } = useApp();
  const isNarrow = useIsNarrow(1024);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [closeBlockedOpen, setCloseBlockedOpen] = useState(false);

  // Close sidebar when switching to wide layout
  useEffect(() => {
    if (!isNarrow) setSidebarOpen(false);
  }, [isNarrow]);

  useEffect(() => {
    const off = window.api?.onActiveTimerCloseBlocked(() => {
      playAppSound("error");
      setCloseBlockedOpen(true);
    });
    return () => off?.();
  }, []);

  const openSidebar = useCallback(() => setSidebarOpen(true), []);
  const closeSidebar = useCallback(() => setSidebarOpen(false), []);

  const workDayOpen = state.bitrixTimeman.phase === 'working' || state.bitrixTimeman.phase === 'break';
  const timerActive = state.timer.status !== 'idle';

  const closeBlockedMessage = workDayOpen && timerActive
    ? 'Сначала завершите рабочий день в Bitrix24 и остановите активный таймер.'
    : workDayOpen
      ? 'Сначала завершите рабочий день в виджете Bitrix24.'
      : 'Сначала остановите активный таймер, чтобы время корректно записалось в историю.';

  const closeBlockedDialog = closeBlockedOpen ? (
    <div className="fixed inset-0 z-[60] flex items-center justify-center">
      <div className="absolute inset-0 bg-black/50" onClick={() => setCloseBlockedOpen(false)} />
      <div className="relative bg-card border border-destructive/40 rounded-xl shadow-2xl w-full max-w-sm p-6">
        <h2 className="text-base font-semibold mb-2 text-destructive">Нельзя закрыть приложение</h2>
        <p className="text-sm text-muted-foreground mb-4">
          {closeBlockedMessage}
        </p>
        <button
          data-testid="button-close-blocked-ok"
          onClick={() => setCloseBlockedOpen(false)}
          className="w-full bg-primary text-primary-foreground rounded-lg py-2 text-sm font-medium hover:opacity-90 transition-opacity"
        >
          Понятно
        </button>
      </div>
    </div>
  ) : null;

  if (state.compactMode) {
    return (
      <>
        <CompactMode />
        {closeBlockedDialog}
      </>
    );
  }

  return (
    <div className="flex h-screen bg-background text-foreground overflow-hidden">
      <Sidebar isNarrow={isNarrow} isOpen={sidebarOpen} onClose={closeSidebar} />
      <div className="flex-1 flex flex-col min-w-0">
        <Topbar onMenuClick={openSidebar} isNarrow={isNarrow} />
        <main className="flex-1 overflow-y-auto scrollbar-thin">
          <Suspense fallback={<div className="p-6 text-sm text-muted-foreground">Загрузка...</div>}>
            <Router />
          </Suspense>
        </main>
      </div>
      <StopDialog />
      <SwitchDialog />
      <LunchRestoreDialog />
      {closeBlockedDialog}
    </div>
  );
}

function Router() {
  return (
    <Switch>
      <Route path="/" component={FocusPage} />
      <Route path="/kanban" component={KanbanPage} />
      <Route path="/jira" component={JiraPage} />
      <Route path="/calendar" component={CalendarPage} />
      <Route path="/history" component={HistoryPage} />
      <Route path="/pomodoro" component={PomodoroPage} />
      <Route path="/notes" component={NotesPage} />
      <Route path="/settings" component={SettingsPage} />
      <Route path="/about" component={AboutPage} />
      <Route component={NotFound} />
    </Switch>
  );
}

function App() {
  useEffect(() => {
    console.info('[Startup] React mounted / first app effect');
    performance.mark?.('ft-react-mounted');
  }, []);

  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <AppProvider>
          <WouterRouter
            base=""
            hook={isTauri ? tauriLocation.hook : undefined}
            searchHook={isTauri ? tauriLocation.searchHook : undefined}
          >
            <AppLayout />
          </WouterRouter>
          <Toaster richColors position="top-right" />
        </AppProvider>
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
