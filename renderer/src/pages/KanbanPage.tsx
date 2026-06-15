import { useState, useMemo, useEffect } from "react";
import { useApp } from "@/context/AppContext";
import { Task, PROJECT_COLORS, formatMinutes, sortKanbanStatuses, sortKanbanPriorities, taskStatusLabel, taskPriorityLabel, priorityColorForTask, KANBAN_STAGE_ORDER } from "@/data/mockData";
import { Search, LayoutGrid, List, Pin, Star, X, Play, CheckCircle, RefreshCw } from "lucide-react";
import { soundToast as toast } from "@/lib/appAudio";

const KANBAN_BOARD_STATUSES = [...KANBAN_STAGE_ORDER];

function PriorityDot({ priority }: { priority: string }) {
  return <div className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: priorityColorForTask(priority) }} />;
}

function ProjectBadge({ project }: { project: string }) {
  return (
    <span
      className="inline-flex max-w-28 items-center truncate whitespace-nowrap text-[10px] font-semibold px-1.5 py-0.5 rounded text-white flex-shrink-0"
      title={project}
      style={{ backgroundColor: PROJECT_COLORS[project] || '#6366f1' }}>
      {project}
    </span>
  );
}

function formatTaskDate(date: string) {
  if (!date) return '—';
  const parsed = new Date(date);
  if (Number.isNaN(parsed.getTime())) return date;
  return parsed.toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit' });
}

function formatTaskMetric(minutes: number) {
  return minutes > 0 ? formatMinutes(minutes) : '—';
}

function plainTaskDescription(value: string) {
  if (!value) return "";
  const source = String(value).replace(/<br\s*\/?>/gi, "\n").replace(/<\/p>/gi, "\n");
  const container = document.createElement("div");
  container.innerHTML = source;
  container.querySelectorAll("p, div, li").forEach((node) => {
    node.appendChild(document.createTextNode("\n"));
  });
  return (container.textContent || source)
    .replace(/\u00a0/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function TaskDetailPanel({ task, onClose }: { task: Task; onClose: () => void }) {
  const { state, dispatch, startTimer } = useApp();
  const [editTask, setEditTask] = useState<Task>({ ...task });
  const description = plainTaskDescription(editTask.description);
  const statusOptions = useMemo(
    () => sortKanbanStatuses([...new Set([editTask.status, ...state.tasks.map(item => item.status)])]),
    [editTask.status, state.tasks],
  );
  const panelPriorityOptions = useMemo(
    () => sortKanbanPriorities([...new Set([editTask.priority, ...state.tasks.map(item => item.priority)])]),
    [editTask.priority, state.tasks],
  );

  useEffect(() => {
    setEditTask({ ...task });
  }, [task]);

  const handleSave = () => {
    dispatch({ type: 'UPDATE_TASK', task: editTask });
    toast.success('Задача обновлена');
    onClose();
  };

  return (
    <div className="w-80 flex-shrink-0 border-l border-border bg-card flex flex-col overflow-hidden select-text">
      <div className="flex items-center justify-between px-4 py-3 border-b border-border">
        <h3 className="text-sm font-semibold">Задача</h3>
        <button onClick={onClose} className="p-1 rounded hover:bg-secondary transition-colors">
          <X className="w-4 h-4 text-muted-foreground" />
        </button>
      </div>
      <div className="flex-1 overflow-y-auto scrollbar-thin p-4 space-y-4">
        <div>
          <div className="flex items-center gap-1.5 mb-2 flex-wrap">
            <ProjectBadge project={editTask.project} />
            {editTask.isSupertask && (
              <span className="flex items-center gap-0.5 text-[10px] font-medium text-amber-500">
                <Star className="w-3 h-3" /> Суперзадача
              </span>
            )}
          </div>
          <h2 className="text-sm font-semibold leading-snug">{editTask.title}</h2>
        </div>

        <div className="grid grid-cols-2 gap-2">
          <div>
            <label className="text-[11px] text-muted-foreground block mb-1">Статус</label>
            <select
              value={editTask.status}
              onChange={e => setEditTask({ ...editTask, status: e.target.value as Task['status'] })}
              className="w-full bg-input border border-border rounded-md px-2 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-ring"
            >
              {statusOptions.map(s => (
                <option key={s} value={s}>{taskStatusLabel(s)}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="text-[11px] text-muted-foreground block mb-1">Приоритет</label>
            <select
              value={editTask.priority}
              onChange={e => setEditTask({ ...editTask, priority: e.target.value as Task['priority'] })}
              className="w-full bg-input border border-border rounded-md px-2 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-ring"
            >
              {panelPriorityOptions.map(p => (
                <option key={p} value={p}>{taskPriorityLabel(p)}</option>
              ))}
            </select>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-2 text-xs">
          <div>
            <span className="text-muted-foreground block mb-0.5">Исполнитель</span>
            <span className="font-medium">{editTask.assignee || '—'}</span>
          </div>
          <div>
            <span className="text-muted-foreground block mb-0.5">Дедлайн</span>
            <span className="font-medium">{editTask.deadline || '—'}</span>
          </div>
          <div>
            <span className="text-muted-foreground block mb-0.5">Оценка</span>
            <span className="font-medium">{formatTaskMetric(editTask.estimate)}</span>
          </div>
          <div>
            <span className="text-muted-foreground block mb-0.5">Потрачено</span>
            <span className="font-medium">{formatTaskMetric(editTask.spentTime)}</span>
          </div>
        </div>

        {description && (
          <div>
            <p className="text-[11px] text-muted-foreground mb-1">Описание</p>
            <p className="text-xs leading-relaxed text-foreground whitespace-pre-line break-words">{description}</p>
          </div>
        )}

        {editTask.checklist.length > 0 && (
          <div>
            <p className="text-[11px] text-muted-foreground mb-2">Чек-лист ({editTask.checklist.filter(c=>c.done).length}/{editTask.checklist.length})</p>
            <div className="space-y-1.5">
              {editTask.checklist.map((item, i) => (
                <div key={i} className="flex items-center gap-2 cursor-pointer group"
                  onClick={() => {
                    const newCl = [...editTask.checklist];
                    newCl[i] = { ...newCl[i], done: !newCl[i].done };
                    setEditTask({ ...editTask, checklist: newCl });
                  }}>
                  <div className={`w-3.5 h-3.5 rounded border flex items-center justify-center flex-shrink-0 ${item.done ? 'bg-primary border-primary' : 'border-border'}`}>
                    {item.done && <CheckCircle className="w-2.5 h-2.5 text-primary-foreground" />}
                  </div>
                  <span className={`text-xs ${item.done ? 'line-through text-muted-foreground' : ''}`}>{item.text}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {editTask.comments.length > 0 && (
          <div>
            <p className="text-[11px] text-muted-foreground mb-2">Комментарии</p>
            <div className="space-y-2">
              {editTask.comments.map((c, i) => (
                <div key={i} className="bg-secondary/50 rounded-lg p-2.5">
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-xs font-medium">{c.author}</span>
                    <span className="text-[10px] text-muted-foreground">{c.date}</span>
                  </div>
                  <p className="text-xs text-muted-foreground leading-relaxed">{c.text}</p>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
      <div className="p-3 border-t border-border space-y-2">
        <div className="flex gap-2">
          <button
            data-testid={`button-panel-start-${task.id}`}
            onClick={() => { startTimer(editTask); onClose(); }}
            className="flex-1 flex items-center justify-center gap-1.5 bg-primary text-primary-foreground rounded-lg py-1.5 text-xs font-medium hover:opacity-90"
          >
            <Play className="w-3 h-3" /> Запустить таймер
          </button>
          <button
            onClick={() => dispatch({ type: 'PIN_TASK', taskId: editTask.id })}
            className={`px-2.5 rounded-lg border text-xs ${editTask.isPinned ? 'bg-primary/10 border-primary text-primary' : 'border-border text-muted-foreground hover:bg-secondary'}`}
          >
            <Pin className="w-3.5 h-3.5" />
          </button>
        </div>
        <button
          onClick={handleSave}
          className="w-full bg-secondary text-secondary-foreground rounded-lg py-1.5 text-xs font-medium hover:opacity-90"
        >
          Сохранить изменения
        </button>
      </div>
    </div>
  );
}

function KanbanCard({ task, onClick }: { task: Task; onClick: () => void }) {
  const { dispatch, startTimer } = useApp();
  return (
    <div
      data-testid={`task-card-${task.id}`}
      onClick={onClick}
      className="bg-card border border-border rounded-lg p-3 cursor-pointer hover:border-primary/50 hover:shadow-sm transition-all group"
    >
      <div className="flex items-start justify-between gap-2 mb-2">
        <div className="flex items-center gap-1.5 flex-wrap">
          <PriorityDot priority={task.priority} />
          {task.isSupertask && <Star className="w-3 h-3 text-amber-500" />}
          {task.isPinned && <Pin className="w-3 h-3 text-primary" />}
        </div>
        <button
          onClick={e => { e.stopPropagation(); startTimer(task); }}
          className="opacity-0 group-hover:opacity-100 p-1 rounded bg-primary/10 text-primary hover:bg-primary hover:text-primary-foreground transition-all"
        >
          <Play className="w-3 h-3" />
        </button>
      </div>
      <p className="text-xs font-medium leading-snug mb-2">{task.title}</p>
      <div className="flex items-center justify-between gap-2 min-w-0">
        <ProjectBadge project={task.project} />
        <div className="flex items-center justify-end gap-2 text-[10px] text-muted-foreground min-w-0">
          <span className="whitespace-nowrap">📅 {formatTaskDate(task.deadline)}</span>
          <span className="whitespace-nowrap">{formatTaskMetric(task.spentTime)}/{formatTaskMetric(task.estimate)}</span>
        </div>
      </div>
      {task.checklist.length > 0 && (
        <div className="mt-2 flex items-center gap-1">
          <div className="flex-1 h-1 bg-border rounded-full overflow-hidden">
            <div className="h-full bg-primary rounded-full" style={{ width: `${(task.checklist.filter(c=>c.done).length/task.checklist.length)*100}%` }} />
          </div>
          <span className="text-[10px] text-muted-foreground">{task.checklist.filter(c=>c.done).length}/{task.checklist.length}</span>
        </div>
      )}
    </div>
  );
}

export default function KanbanPage() {
  const { state, dispatch, startTimer, ensureKanbanLoaded, ensureKanbanTaskDetail } = useApp();
  const { tasks } = state;
  const [view, setView] = useState<'list' | 'board'>('list');
  const [search, setSearch] = useState('');
  const [filterProject, setFilterProject] = useState('');
  const [filterPriority, setFilterPriority] = useState('');
  const [filterStatus, setFilterStatus] = useState('');
  const [filterPinned, setFilterPinned] = useState(false);
  const [filterSuper, setFilterSuper] = useState(false);
  const [selectedTask, setSelectedTask] = useState<Task | null>(null);
  const projects = useMemo(() => Array.from(new Set(tasks.map(t => t.project).filter(Boolean))).sort(), [tasks]);

  useEffect(() => {
    ensureKanbanLoaded(true);
  }, [ensureKanbanLoaded]);

  const openTask = (task: Task) => {
    setSelectedTask(task);
    void ensureKanbanTaskDetail(task.id);
  };

  const statusOptions = useMemo(
    () => sortKanbanStatuses(tasks.map(task => task.status)),
    [tasks],
  );
  const priorityOptions = useMemo(
    () => sortKanbanPriorities(tasks.map(task => task.priority)),
    [tasks],
  );

  const filtered = useMemo(() => {
    return tasks.filter(t => {
      if (search && !t.title.toLowerCase().includes(search.toLowerCase())) return false;
      if (filterProject && t.project !== filterProject) return false;
      if (filterPriority && t.priority !== filterPriority) return false;
      if (filterStatus && t.status !== filterStatus) return false;
      if (filterPinned && !t.isPinned) return false;
      if (filterSuper && !t.isSupertask) return false;
      return true;
    });
  }, [tasks, search, filterProject, filterPriority, filterStatus, filterPinned, filterSuper]);

  const boardStatuses = useMemo(() => {
    const present = new Set(filtered.map(task => task.status).filter(Boolean));
    const known = KANBAN_BOARD_STATUSES.filter(status => present.has(status));
    const extra = sortKanbanStatuses([...present]).filter(status => !(KANBAN_BOARD_STATUSES as readonly string[]).includes(status));
    return [...known, ...extra];
  }, [filtered]);

  return (
    <div className="flex h-full">
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Toolbar */}
        <div className="flex items-center gap-3 px-6 py-3 border-b border-border flex-shrink-0 flex-wrap gap-y-2">
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
            <input
              data-testid="input-kanban-search"
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Поиск задач..."
              className="bg-input border border-border rounded-md pl-8 pr-3 py-1.5 text-sm w-48 focus:outline-none focus:ring-1 focus:ring-ring"
            />
          </div>

          <select value={filterProject} onChange={e => setFilterProject(e.target.value)} className="bg-input border border-border rounded-md px-2 py-1.5 text-xs focus:outline-none">
            <option value="">Все проекты</option>
            {projects.map(p => <option key={p} value={p}>{p}</option>)}
          </select>

          <select value={filterPriority} onChange={e => setFilterPriority(e.target.value)} className="bg-input border border-border rounded-md px-2 py-1.5 text-xs focus:outline-none">
            <option value="">Все приоритеты</option>
            {priorityOptions.map(p => <option key={p} value={p}>{taskPriorityLabel(p)}</option>)}
          </select>

          <select value={filterStatus} onChange={e => setFilterStatus(e.target.value)} className="bg-input border border-border rounded-md px-2 py-1.5 text-xs focus:outline-none">
            <option value="">Все статусы</option>
            {statusOptions.map(s => <option key={s} value={s}>{taskStatusLabel(s)}</option>)}
          </select>

          <button
            onClick={() => setFilterPinned(!filterPinned)}
            className={`flex items-center gap-1 px-2.5 py-1.5 rounded-md border text-xs transition-colors ${filterPinned ? 'bg-primary/10 border-primary text-primary' : 'border-border text-muted-foreground hover:bg-secondary'}`}
          >
            <Pin className="w-3 h-3" /> Закреплённые
          </button>

          <button
            onClick={() => setFilterSuper(!filterSuper)}
            className={`flex items-center gap-1 px-2.5 py-1.5 rounded-md border text-xs transition-colors ${filterSuper ? 'bg-amber-500/10 border-amber-500 text-amber-500' : 'border-border text-muted-foreground hover:bg-secondary'}`}
          >
            <Star className="w-3 h-3" /> Суперзадачи
          </button>

          <div className="ml-auto flex items-center gap-1">
            <button
              onClick={() => ensureKanbanLoaded(true, true)}
              disabled={state.loading.kanban}
              className="p-1.5 rounded-md hover:bg-secondary/50 disabled:opacity-50 transition-colors"
              title="Обновить"
            >
              <RefreshCw className={`w-4 h-4 ${state.loading.kanban ? 'animate-spin' : ''}`} />
            </button>
            <button
              data-testid="button-view-list"
              onClick={() => setView('list')}
              className={`p-1.5 rounded-md transition-colors ${view === 'list' ? 'bg-secondary' : 'hover:bg-secondary/50'}`}
            >
              <List className="w-4 h-4" />
            </button>
            <button
              data-testid="button-view-board"
              onClick={() => setView('board')}
              className={`p-1.5 rounded-md transition-colors ${view === 'board' ? 'bg-secondary' : 'hover:bg-secondary/50'}`}
            >
              <LayoutGrid className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-auto scrollbar-thin">
          {state.loading.kanban && tasks.length === 0 && (
            <div className="p-6 text-sm text-muted-foreground">Загрузка задач...</div>
          )}
          {!state.loading.kanban && tasks.length === 0 && (
            <div className="p-6 text-sm text-muted-foreground">Авторизуйтесь в Kanban в настройках или обновите список.</div>
          )}
          {view === 'list' ? (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border">
                  <th className="text-left px-6 py-2 text-[11px] font-semibold text-muted-foreground uppercase tracking-wide">Название</th>
                  <th className="text-left px-3 py-2 text-[11px] font-semibold text-muted-foreground uppercase tracking-wide">Проект</th>
                  <th className="text-left px-3 py-2 text-[11px] font-semibold text-muted-foreground uppercase tracking-wide">Статус</th>
                  <th className="text-left px-3 py-2 text-[11px] font-semibold text-muted-foreground uppercase tracking-wide">Приоритет</th>
                  <th className="text-left px-3 py-2 text-[11px] font-semibold text-muted-foreground uppercase tracking-wide">Дедлайн</th>
                  <th className="text-left px-3 py-2 text-[11px] font-semibold text-muted-foreground uppercase tracking-wide">Потрачено/Оценка</th>
                  <th className="px-3 py-2"></th>
                </tr>
              </thead>
              <tbody>
                {filtered.map(task => (
                  <tr
                    key={task.id}
                    data-testid={`task-row-${task.id}`}
                    onClick={() => openTask(task)}
                    className="border-b border-border/50 hover:bg-secondary/30 cursor-pointer transition-colors group"
                  >
                    <td className="px-6 py-2.5">
                      <div className="flex items-center gap-2">
                        {task.isPinned && <Pin className="w-3 h-3 text-primary flex-shrink-0" />}
                        {task.isSupertask && <Star className="w-3 h-3 text-amber-500 flex-shrink-0" />}
                        <PriorityDot priority={task.priority} />
                        <span className="font-medium text-xs">{task.title}</span>
                      </div>
                    </td>
                    <td className="px-3 py-2.5 max-w-32"><ProjectBadge project={task.project} /></td>
                    <td className="px-3 py-2.5">
                      <span className="text-xs text-muted-foreground">{taskStatusLabel(task.status)}</span>
                    </td>
                    <td className="px-3 py-2.5">
                      <span className="text-xs font-medium" style={{ color: priorityColorForTask(task.priority) }}>
                        {taskPriorityLabel(task.priority)}
                      </span>
                    </td>
                    <td className="px-3 py-2.5 text-xs text-muted-foreground whitespace-nowrap">{task.deadline || '—'}</td>
                    <td className="px-3 py-2.5 text-xs text-muted-foreground">
                      {formatTaskMetric(task.spentTime)} / {formatTaskMetric(task.estimate)}
                    </td>
                    <td className="px-3 py-2.5">
                      <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                        <button
                          onClick={e => { e.stopPropagation(); startTimer(task); }}
                          className="p-1 rounded bg-primary/10 text-primary hover:bg-primary hover:text-primary-foreground transition-colors"
                        >
                          <Play className="w-3 h-3" />
                        </button>
                        <button
                          onClick={e => { e.stopPropagation(); dispatch({ type: 'PIN_TASK', taskId: task.id }); }}
                          className={`p-1 rounded transition-colors ${task.isPinned ? 'text-primary' : 'text-muted-foreground hover:text-foreground'}`}
                        >
                          <Pin className="w-3 h-3" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <div className="flex gap-4 p-4 min-w-max h-full">
              {boardStatuses.map(status => {
                const colTasks = filtered.filter(t => t.status === status);
                return (
                  <div key={status} className="w-56 flex-shrink-0 flex flex-col gap-3">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">{taskStatusLabel(status)}</span>
                      <span className="text-xs text-muted-foreground bg-secondary rounded-full w-5 h-5 flex items-center justify-center">{colTasks.length}</span>
                    </div>
                    <div className="flex-1 space-y-2 overflow-y-auto scrollbar-thin">
                      {colTasks.map(task => (
                        <KanbanCard key={task.id} task={task} onClick={() => openTask(task)} />
                      ))}
                      {colTasks.length === 0 && (
                        <div className="text-center py-6 text-xs text-muted-foreground border border-dashed border-border rounded-lg">
                          Нет задач
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
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
