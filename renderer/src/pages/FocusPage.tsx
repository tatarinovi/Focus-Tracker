import { useEffect, useMemo, useState } from "react";
import { useApp } from "@/context/AppContext";
import { formatSeconds, formatMinutes, PROJECT_COLORS, Task, isKanbanDoneStatus, taskStatusLabel, taskPriorityLabel, priorityColorForTask, KANBAN_STAGE_IDS } from "@/data/mockData";
import { resolveKanbanStageName } from "@/lib/tauriDataApi";
import { Play, Pause, Square, CheckCircle, Pin, Coffee, Clock, Users, ExternalLink, Target, Video, CalendarClock, AlertTriangle } from "lucide-react";
import { useLocation } from "wouter";
import { soundToast as toast } from "@/lib/appAudio";
import { Spinner } from "@/components/ui/spinner";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { TaskDetailPanel } from "@/components/TaskDetailPanel";

function PomodoroMini() {
  const { state, dispatch } = useApp();
  const { pomodoro } = state;
  const total = pomodoro.phase === 'focus' ? pomodoro.focusDuration * 60 : pomodoro.breakDuration * 60;
  const progress = ((total - pomodoro.remaining) / total) * 100;
  const circumference = 2 * Math.PI * 20;
  const strokeDash = (progress / 100) * circumference;

  const mm = String(Math.floor(pomodoro.remaining / 60)).padStart(2, '0');
  const ss = String(pomodoro.remaining % 60).padStart(2, '0');

  return (
    <div className="bg-card border border-border rounded-xl p-4">
      <div className="flex items-center justify-between mb-3">
        <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Pomodoro</span>
        <span className="text-xs text-muted-foreground">Сессия {pomodoro.session}</span>
      </div>
      <div className="flex items-center gap-4">
        <div className="relative w-14 h-14">
          <svg className="w-14 h-14 -rotate-90" viewBox="0 0 48 48">
            <circle cx="24" cy="24" r="20" fill="none" stroke="hsl(var(--border))" strokeWidth="3" />
            <circle cx="24" cy="24" r="20" fill="none" stroke="hsl(var(--primary))" strokeWidth="3"
              strokeDasharray={`${strokeDash} ${circumference}`} strokeLinecap="round" className="transition-all duration-1000" />
          </svg>
          <div className="absolute inset-0 flex items-center justify-center">
            <span className="font-mono text-[10px] font-bold">{mm}:{ss}</span>
          </div>
        </div>
        <div className="flex-1">
          <p className={`text-xs font-medium ${pomodoro.phase === 'focus' ? 'text-primary' : 'text-green-500'}`}>
            {pomodoro.phase === 'focus' ? 'Фокус' : 'Перерыв'}
          </p>
          <div className="flex gap-1 mt-2">
            <button
              onClick={() => dispatch({ type: pomodoro.isRunning ? 'PAUSE_POMODORO' : 'START_POMODORO' })}
              className="bg-primary text-primary-foreground rounded-md px-2 py-1 text-xs font-medium hover:opacity-90"
            >
              {pomodoro.isRunning ? 'Пауза' : 'Старт'}
            </button>
            <button
              onClick={() => dispatch({ type: 'SKIP_POMODORO' })}
              className="bg-secondary text-secondary-foreground rounded-md px-2 py-1 text-xs hover:opacity-90"
            >
              Пропустить
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function MeetingProviderIcon({ provider }: { provider: string | null }) {
  if (!provider) return <Video className="w-4 h-4 text-muted-foreground" />;
  const icons: Record<string, string> = {
    google_meet: 'G', zoom: 'Z', teams: 'T', telemost: 'Y',
  };
  const colors: Record<string, string> = {
    google_meet: '#1a73e8', zoom: '#2D8CFF', teams: '#7B83EB', telemost: '#FF5722',
  };
  return (
    <div className="w-5 h-5 rounded flex items-center justify-center text-white text-[10px] font-bold flex-shrink-0"
      style={{ backgroundColor: colors[provider] || '#6b7280' }}>
      {icons[provider] || 'M'}
    </div>
  );
}

function toDateKey(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

function parseTaskDeadline(deadline: string) {
  if (!deadline) return null;
  const trimmed = deadline.trim();
  const ruMatch = trimmed.match(/^(\d{1,2})\.(\d{1,2})\.(\d{4})$/);
  if (ruMatch) return new Date(Number(ruMatch[3]), Number(ruMatch[2]) - 1, Number(ruMatch[1]));
  const isoMatch = trimmed.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (isoMatch) return new Date(Number(isoMatch[1]), Number(isoMatch[2]) - 1, Number(isoMatch[3]));
  const parsed = new Date(trimmed);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function getDeadlineState(deadline: string) {
  const date = parseTaskDeadline(deadline);
  if (!date) return null;
  date.setHours(0, 0, 0, 0);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const tomorrow = new Date(today);
  tomorrow.setDate(today.getDate() + 1);
  const key = toDateKey(date);
  if (date < today) return { type: 'overdue' as const, label: 'Просрочено', tone: 'text-red-400 bg-red-500/10 border-red-500/20' };
  if (key === toDateKey(today)) return { type: 'today' as const, label: 'Сегодня', tone: 'text-amber-300 bg-amber-500/10 border-amber-500/20' };
  if (key === toDateKey(tomorrow)) return { type: 'tomorrow' as const, label: 'Завтра', tone: 'text-sky-300 bg-sky-500/10 border-sky-500/20' };
  return null;
}

function FocusTaskRow({ task, onStart }: { task: Task; onStart: (task: Task) => void }) {
  const deadlineState = getDeadlineState(task.deadline);
  return (
    <div className="flex items-center justify-between gap-3 py-2 px-3 rounded-lg hover:bg-secondary/50 transition-colors group">
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2 min-w-0">
          <div className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: PROJECT_COLORS[task.project] || '#6366f1' }} />
          <span className="text-sm font-medium truncate">{task.title}</span>
        </div>
        <div className="mt-1 flex items-center gap-1.5 text-[11px] text-muted-foreground min-w-0">
          {deadlineState && (
            <span className={`inline-flex items-center gap-1 rounded border px-1.5 py-0.5 ${deadlineState.tone}`}>
              {deadlineState.type === 'overdue' ? <AlertTriangle className="w-3 h-3" /> : <CalendarClock className="w-3 h-3" />}
              {deadlineState.label}{task.deadline ? ` · ${task.deadline}` : ''}
            </span>
          )}
          <span className="truncate">{task.project}</span>
        </div>
      </div>
      <button
        data-testid={`button-focus-start-${task.id}`}
        onClick={() => onStart(task)}
        className="flex items-center gap-1 bg-primary/10 text-primary hover:bg-primary hover:text-primary-foreground rounded-md px-2.5 py-1 text-xs font-medium transition-colors flex-shrink-0"
      >
        <Play className="w-3 h-3" /> Запустить
      </button>
    </div>
  );
}

export default function FocusPage() {
  const { state, dispatch, startTimer, requestStop, startLunch, ensureKanbanLoaded, ensureKanbanTaskDetail, ensureCalendarLoaded } = useApp();
  const { timer, tasks, history, lunch } = state;
  const [, navigate] = useLocation();
  const [selectedTask, setSelectedTask] = useState<Task | null>(null);

  useEffect(() => {
    let cancelled = false;
    const loadKanban = () => {
      if (!cancelled) void ensureKanbanLoaded();
    };
    const loadCalendar = () => {
      if (!cancelled) void ensureCalendarLoaded();
    };
    const canUseIdleCallback =
      typeof window.requestIdleCallback === 'function' &&
      typeof window.cancelIdleCallback === 'function';
    const idleId = canUseIdleCallback
      ? window.requestIdleCallback(loadKanban, { timeout: 3000 })
      : window.setTimeout(loadKanban, 1200);
    const calendarIdleId = canUseIdleCallback
      ? window.requestIdleCallback(loadCalendar, { timeout: 4000 })
      : window.setTimeout(loadCalendar, 1800);
    return () => {
      cancelled = true;
      if (canUseIdleCallback) {
        window.cancelIdleCallback(idleId);
        window.cancelIdleCallback(calendarIdleId);
      } else {
        window.clearTimeout(idleId);
        window.clearTimeout(calendarIdleId);
      }
    };
  }, [ensureKanbanLoaded, ensureCalendarLoaded]);

  const today = `${new Date().getFullYear()}-${String(new Date().getMonth()+1).padStart(2,'0')}-${String(new Date().getDate()).padStart(2,'0')}`;
  const todayHistory = history.filter(h => h.date === today);
  const totalMinutesToday = todayHistory.reduce((s, h) => s + h.duration, 0);
  const tasksWorkedOn = new Set(todayHistory.map(h => h.taskId)).size;
  const tasksDone = tasks.filter(t => isKanbanDoneStatus(t.status)).length;

  const focusTasks = useMemo(() => {
    const score = (task: Task) => {
      const deadline = getDeadlineState(task.deadline)?.type;
      if (deadline === 'overdue') return 0;
      if (deadline === 'today') return 1;
      if (deadline === 'tomorrow') return 2;
      if (task.isPinned) return 3;
      return 4;
    };
    return tasks
      .filter(t => !isKanbanDoneStatus(t.status) && t.id !== timer.activeTask?.id)
      .filter(t => t.isPinned || getDeadlineState(t.deadline))
      .sort((a, b) => score(a) - score(b) || a.title.localeCompare(b.title))
      .slice(0, 8);
  }, [tasks, timer.activeTask?.id]);
  const todayEvents = state.calendarEvents.filter(e => e.date === today).slice(0, 3);

  const openTask = (task: Task) => {
    setSelectedTask(task);
    void ensureKanbanTaskDetail(task.id);
  };

  return (
    <div className="flex h-full">
      <div className="flex-1 overflow-auto p-6 max-w-full">
      <div className="grid grid-cols-3 gap-6">
        {/* Left: Timer + Pinned */}
        <div className="col-span-2 space-y-4">
          {/* Active Task Card */}
          {timer.activeTask ? (
            <div className="bg-card border border-border rounded-xl p-6 shadow-sm">
              <div className="flex items-start justify-between mb-4">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-[11px] font-semibold px-2 py-0.5 rounded text-white"
                      style={{ backgroundColor: PROJECT_COLORS[timer.activeTask.project] || '#6366f1' }}>
                      {timer.activeTask.project}
                    </span>
                    <span className="text-[11px] font-medium px-1.5 py-0.5 rounded bg-secondary text-muted-foreground">
                      {taskStatusLabel(timer.activeTask.status)}
                    </span>
                    <span className="text-[11px] font-medium" style={{ color: priorityColorForTask(timer.activeTask.priority) }}>
                      {taskPriorityLabel(timer.activeTask.priority)}
                    </span>
                  </div>
                  <h2 className="text-lg font-semibold leading-tight">{timer.activeTask.title}</h2>
                </div>
                <div className={`w-3 h-3 rounded-full flex-shrink-0 mt-1 ${timer.status === 'running' ? 'bg-green-500 animate-pulse' : 'bg-yellow-500'}`} />
              </div>

              <div className="text-center py-4">
                <div className="font-mono text-5xl font-bold text-foreground tracking-wider mb-1">
                  {formatSeconds(timer.elapsed)}
                </div>
                <div className="text-xs text-muted-foreground">
                  {timer.activeTask.estimate > 0 && `Оценка: ${formatMinutes(timer.activeTask.estimate)}`}
                </div>
              </div>

              <div className="flex gap-2 justify-center">
                {timer.status === 'idle' && (
                  <button
                    data-testid="button-start-timer"
                    onClick={() => dispatch({ type: 'START_TIMER', task: timer.activeTask! })}
                    className="flex items-center gap-2 bg-primary text-primary-foreground rounded-lg px-4 py-2 text-sm font-medium hover:opacity-90 transition-opacity"
                  >
                    <Play className="w-4 h-4" /> Старт
                  </button>
                )}
                {timer.status === 'running' && (
                  <button
                    data-testid="button-pause-timer"
                    onClick={() => dispatch({ type: 'PAUSE_TIMER' })}
                    className="flex items-center gap-2 bg-secondary text-secondary-foreground rounded-lg px-4 py-2 text-sm font-medium hover:opacity-90"
                  >
                    <Pause className="w-4 h-4" /> Пауза
                  </button>
                )}
                {timer.status === 'paused' && (
                  <button
                    data-testid="button-resume-timer"
                    onClick={() => dispatch({ type: 'RESUME_TIMER' })}
                    className="flex items-center gap-2 bg-primary text-primary-foreground rounded-lg px-4 py-2 text-sm font-medium hover:opacity-90"
                  >
                    <Play className="w-4 h-4" /> Продолжить
                  </button>
                )}
                <button
                  data-testid="button-stop-timer"
                  onClick={requestStop}
                  className="flex items-center gap-2 bg-secondary text-secondary-foreground rounded-lg px-4 py-2 text-sm font-medium hover:opacity-90"
                >
                  <Square className="w-4 h-4" /> Остановить
                </button>
                <button
                  data-testid="button-complete-task"
                  onClick={() => {
                    if (timer.elapsed > 0) {
                      requestStop();
                    } else {
                      dispatch({
                        type: 'UPDATE_TASK',
                        task: {
                          ...timer.activeTask!,
                          status: resolveKanbanStageName(KANBAN_STAGE_IDS.RESOLVED, "Решена"),
                          stageId: KANBAN_STAGE_IDS.RESOLVED,
                        },
                      });
                      dispatch({ type: 'CONFIRM_STOP', comment: 'Задача завершена' });
                      toast.success('Задача завершена');
                    }
                  }}
                  className="flex items-center gap-2 bg-green-600 text-white rounded-lg px-4 py-2 text-sm font-medium hover:opacity-90"
                >
                  <CheckCircle className="w-4 h-4" /> Завершить
                </button>
              </div>

              {timer.activeTask.checklist.length > 0 && (
                <div className="mt-4 pt-4 border-t border-border space-y-1.5">
                  <p className="text-xs font-medium text-muted-foreground mb-2">Чек-лист</p>
                  {timer.activeTask.checklist.map((item, i) => (
                    <div
                      key={i}
                      className="flex items-center gap-2 cursor-pointer group"
                      onClick={() => {
                        const newChecklist = [...timer.activeTask!.checklist];
                        newChecklist[i] = { ...newChecklist[i], done: !newChecklist[i].done };
                        dispatch({ type: 'UPDATE_TASK', task: { ...timer.activeTask!, checklist: newChecklist } });
                      }}
                    >
                      <div className={`w-4 h-4 rounded border flex items-center justify-center flex-shrink-0 transition-colors ${item.done ? 'bg-primary border-primary' : 'border-border group-hover:border-primary'}`}>
                        {item.done && <CheckCircle className="w-3 h-3 text-primary-foreground" />}
                      </div>
                      <span className={`text-xs ${item.done ? 'line-through text-muted-foreground' : 'text-foreground'}`}>{item.text}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          ) : (
            <div className="bg-card border border-border rounded-xl p-10 text-center shadow-sm">
              <Target className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
              <h2 className="text-lg font-semibold mb-2">Нет активной задачи</h2>
              <p className="text-sm text-muted-foreground mb-4">Выберите задачу, чтобы начать отслеживание времени</p>
              <div className="flex gap-2 justify-center">
                <button
                  data-testid="button-choose-task"
                  onClick={() => navigate('/kanban')}
                  className="bg-primary text-primary-foreground rounded-lg px-4 py-2 text-sm font-medium hover:opacity-90"
                >
                  Выбрать задачу
                </button>
              </div>
            </div>
          )}

          {/* Focus Tasks */}
          {focusTasks.length > 0 && (
            <div className="bg-card border border-border rounded-xl p-4 shadow-sm">
              <div className="flex items-center gap-2 mb-3">
                <CalendarClock className="w-4 h-4 text-muted-foreground" />
                <span className="text-sm font-semibold">В фокусе</span>
              </div>
              <div className="space-y-2">
                {focusTasks.map(task => (
                  <div
                    key={task.id}
                    onClick={() => openTask(task)}
                    className="flex items-center justify-between gap-3 py-2 px-3 rounded-lg hover:bg-secondary/50 transition-colors cursor-pointer"
                  >
                    <div className="flex items-center gap-2 min-w-0 flex-1 overflow-hidden">
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <div
                            className="w-2 h-2 rounded-full flex-shrink-0 cursor-default"
                            style={{ backgroundColor: PROJECT_COLORS[task.project] || '#6366f1' }}
                          />
                        </TooltipTrigger>
                        <TooltipContent side="top">{task.project}</TooltipContent>
                      </Tooltip>
                      <span className="text-sm truncate min-w-0">{task.title}</span>
                      {task.isPinned && <Pin className="w-3 h-3 text-muted-foreground flex-shrink-0" />}
                      {getDeadlineState(task.deadline) && (
                        <span className={`text-[10px] rounded border px-1.5 py-0.5 flex-shrink-0 whitespace-nowrap ${getDeadlineState(task.deadline)!.tone}`}>
                          {getDeadlineState(task.deadline)!.label} · {task.deadline}
                        </span>
                      )}
                    </div>
                    <button
                      data-testid={`button-start-task-${task.id}`}
                      onClick={(e) => { e.stopPropagation(); startTimer(task); }}
                      className="flex items-center gap-1 bg-primary/10 text-primary hover:bg-primary hover:text-primary-foreground rounded-md px-2.5 py-1 text-xs font-medium transition-colors flex-shrink-0 ml-2"
                    >
                      <Play className="w-3 h-3" /> Запустить
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Day Summary */}
          <div className="grid grid-cols-3 gap-3">
            <div className="bg-card border border-border rounded-xl p-4 text-center shadow-sm">
              <div className="text-2xl font-bold text-foreground">{formatMinutes(totalMinutesToday)}</div>
              <div className="text-xs text-muted-foreground mt-1">Время за сегодня</div>
            </div>
            <div className="bg-card border border-border rounded-xl p-4 text-center shadow-sm">
              <div className="text-2xl font-bold text-foreground">{tasksWorkedOn}</div>
              <div className="text-xs text-muted-foreground mt-1">Задач в работе</div>
            </div>
            <div className="bg-card border border-border rounded-xl p-4 text-center shadow-sm">
              <div className="text-2xl font-bold text-green-500">{tasksDone}</div>
              <div className="text-xs text-muted-foreground mt-1">Завершено</div>
            </div>
          </div>
        </div>

        {/* Right panel */}
        <div className="space-y-4">
          <PomodoroMini />

          {/* Upcoming Meetings */}
          <div className="bg-card border border-border rounded-xl p-4 shadow-sm">
            <div className="flex items-center gap-2 mb-3">
              <Clock className="w-4 h-4 text-muted-foreground" />
              <span className="text-sm font-semibold">Ближайшие созвоны</span>
            </div>
            <div className="space-y-2">
              {state.loading.calendar && (
                <div className="flex items-center justify-center gap-2 rounded-lg border border-dashed border-border p-3 text-xs text-muted-foreground">
                  <Spinner className="w-3.5 h-3.5" />
                  <span>Загружаю календарь...</span>
                </div>
              )}
              {!state.loading.calendar && todayEvents.map(event => (
                <div key={event.id} className="p-2.5 rounded-lg bg-secondary/50 hover:bg-secondary transition-colors">
                  <div className="flex items-start gap-2">
                    <MeetingProviderIcon provider={event.meetingProvider} />
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-medium leading-tight truncate">{event.title}</p>
                      <p className="text-[11px] text-muted-foreground mt-0.5">{event.start} — {event.end}</p>
                      <div className="flex items-center gap-1 mt-0.5">
                        {event.attendees.length > 0 && (
                          <>
                            <Users className="w-2.5 h-2.5 text-muted-foreground" />
                            <span className="text-[11px] text-muted-foreground">{event.attendees.length} участника</span>
                          </>
                        )}
                      </div>
                    </div>
                  </div>
                  {event.meetingUrl && (
                    <button
                      onClick={() => event.meetingUrl && window.api?.openExternal(event.meetingUrl)}
                      className="mt-2 w-full flex items-center justify-center gap-1 bg-primary/10 text-primary hover:bg-primary hover:text-primary-foreground rounded-md py-1 text-[11px] font-medium transition-colors"
                    >
                      <ExternalLink className="w-3 h-3" /> Подключиться
                    </button>
                  )}
                </div>
              ))}
              {!state.loading.calendar && todayEvents.length === 0 && (
                <p className="text-xs text-muted-foreground text-center py-2">Нет запланированных встреч</p>
              )}
            </div>
          </div>

          {/* Lunch Mode */}
          {!state.lunch.active && (
            <div className="bg-card border border-border rounded-xl p-4 shadow-sm">
              <div className="flex items-center gap-2 mb-2">
                <Coffee className="w-4 h-4 text-muted-foreground" />
                <span className="text-sm font-semibold">Обед</span>
              </div>
              <p className="text-xs text-muted-foreground mb-3">Таймер будет поставлен на паузу на время обеда</p>
              <button
                data-testid="button-focus-lunch"
                onClick={startLunch}
                className="w-full flex items-center justify-center gap-2 bg-orange-500/10 text-orange-400 border border-orange-500/20 rounded-lg py-2 text-sm font-medium hover:bg-orange-500/20 transition-colors"
              >
                <Coffee className="w-4 h-4" /> Ушёл на обед
              </button>
            </div>
          )}
        </div>
      </div>
      </div>

      {selectedTask && (
        <TaskDetailPanel
          task={tasks.find(t => t.id === selectedTask.id) || selectedTask}
          onClose={() => setSelectedTask(null)}
        />
      )}
    </div>
  );
}
