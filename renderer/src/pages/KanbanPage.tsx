import { useState, useMemo, useEffect } from "react";
import { useApp } from "@/context/AppContext";
import { Task, PROJECT_COLORS, formatMinutes, sortKanbanStatuses, sortKanbanPriorities, sortKanbanListTasks, taskStatusLabel, taskPriorityLabel, priorityColorForTask, KANBAN_STAGE_ORDER } from "@/data/mockData";
import { Search, LayoutGrid, List, Pin, Star, Play, RefreshCw, FilterX, SlidersHorizontal } from "lucide-react";
import { FilterMultiSelect } from "@/components/FilterMultiSelect";
import { TaskDetailPanel } from "@/components/TaskDetailPanel";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";

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
  const [filterProject, setFilterProject] = useState<string[]>([]);
  const [filterPriority, setFilterPriority] = useState<string[]>([]);
  const [filterStatus, setFilterStatus] = useState<string[]>([]);
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

  const hasActiveFilters = Boolean(
    search || filterProject.length || filterPriority.length || filterStatus.length || filterPinned || filterSuper,
  );

  const activeSelectFilterCount =
    filterProject.length + filterPriority.length + filterStatus.length;

  const resetFilters = () => {
    setSearch('');
    setFilterProject([]);
    setFilterPriority([]);
    setFilterStatus([]);
    setFilterPinned(false);
    setFilterSuper(false);
  };

  const filtered = useMemo(() => {
    const list = tasks.filter(t => {
      if (search && !t.title.toLowerCase().includes(search.toLowerCase())) return false;
      if (filterProject.length && !filterProject.includes(t.project)) return false;
      if (filterPriority.length && !filterPriority.includes(t.priority)) return false;
      if (filterStatus.length && !filterStatus.includes(t.status)) return false;
      if (filterPinned && !t.isPinned) return false;
      if (filterSuper && !t.isSupertask) return false;
      return true;
    });
    return sortKanbanListTasks(list);
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
        <div className="flex items-center gap-2 px-6 py-3 border-b border-border flex-shrink-0 flex-nowrap min-h-0">
          <div className="relative flex-shrink-0">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
            <input
              data-testid="input-kanban-search"
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Поиск задач..."
              className="bg-input border border-border rounded-md pl-8 pr-3 py-1.5 text-sm w-52 focus:outline-none focus:ring-1 focus:ring-ring"
            />
          </div>

          <Popover>
            <PopoverTrigger asChild>
              <button
                type="button"
                data-testid="button-kanban-filters"
                className={`flex items-center gap-1.5 rounded-md border px-2.5 py-1.5 text-xs transition-colors flex-shrink-0 ${
                  activeSelectFilterCount > 0
                    ? "border-primary/50 bg-primary/10 text-primary"
                    : "border-border text-muted-foreground hover:bg-secondary hover:text-foreground"
                }`}
              >
                <SlidersHorizontal className="w-3.5 h-3.5" />
                Фильтры
                {activeSelectFilterCount > 0 && (
                  <span className="flex h-4 min-w-4 items-center justify-center rounded-full bg-primary px-1 text-[10px] font-semibold text-primary-foreground">
                    {activeSelectFilterCount}
                  </span>
                )}
              </button>
            </PopoverTrigger>
            <PopoverContent align="start" className="w-64 p-3 space-y-2.5">
              <FilterMultiSelect
                data-testid="filter-kanban-project"
                values={filterProject}
                onChange={setFilterProject}
                placeholder="Все проекты"
                options={projects.map(p => ({ value: p, label: p }))}
                className="min-w-0 w-full"
              />

              <FilterMultiSelect
                data-testid="filter-kanban-priority"
                values={filterPriority}
                onChange={setFilterPriority}
                placeholder="Все приоритеты"
                options={priorityOptions.map(p => ({ value: p, label: taskPriorityLabel(p) }))}
                className="min-w-0 w-full"
              />

              <FilterMultiSelect
                data-testid="filter-kanban-status"
                values={filterStatus}
                onChange={setFilterStatus}
                placeholder="Все статусы"
                options={statusOptions.map(s => ({ value: s, label: taskStatusLabel(s) }))}
                className="min-w-0 w-full"
              />

              {hasActiveFilters && (
                <button
                  type="button"
                  data-testid="button-kanban-reset-filters"
                  onClick={resetFilters}
                  className="flex w-full items-center justify-center gap-1 rounded-md border border-border px-2.5 py-1.5 text-xs text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
                >
                  <FilterX className="w-3 h-3" /> Сбросить всё
                </button>
              )}
            </PopoverContent>
          </Popover>

          <button
            onClick={() => setFilterPinned(!filterPinned)}
            className={`flex items-center gap-1 px-2 py-1.5 rounded-md border text-xs transition-colors flex-shrink-0 ${filterPinned ? 'bg-primary/10 border-primary text-primary' : 'border-border text-muted-foreground hover:bg-secondary'}`}
            title="Закреплённые"
          >
            <Pin className="w-3 h-3" /> Закреплённые
          </button>

          <button
            onClick={() => setFilterSuper(!filterSuper)}
            className={`flex items-center gap-1 px-2 py-1.5 rounded-md border text-xs transition-colors flex-shrink-0 ${filterSuper ? 'bg-amber-500/10 border-amber-500 text-amber-500' : 'border-border text-muted-foreground hover:bg-secondary'}`}
            title="Суперзадачи"
          >
            <Star className="w-3 h-3" /> Суперзадачи
          </button>

          <div className="ml-auto flex items-center gap-1 flex-shrink-0">
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
            <table className="w-full table-fixed text-sm">
              <colgroup>
                <col className="w-[41%]" />
                <col className="w-[12%]" />
                <col className="w-[11%]" />
                <col className="w-[10%]" />
                <col className="w-[10%]" />
                <col className="w-[12%]" />
                <col className="w-[4%]" />
              </colgroup>
              <thead>
                <tr className="border-b border-border">
                  <th className="text-left px-6 py-2 text-[11px] font-semibold text-muted-foreground uppercase tracking-wide">Название</th>
                  <th className="text-left px-3 py-2 text-[11px] font-semibold text-muted-foreground uppercase tracking-wide">Проект</th>
                  <th className="text-left pl-5 pr-3 py-2 text-[11px] font-semibold text-muted-foreground uppercase tracking-wide whitespace-nowrap">Статус</th>
                  <th className="text-left px-3 py-2 text-[11px] font-semibold text-muted-foreground uppercase tracking-wide whitespace-nowrap">Приоритет</th>
                  <th className="text-left px-3 py-2 text-[11px] font-semibold text-muted-foreground uppercase tracking-wide whitespace-nowrap">Дедлайн</th>
                  <th className="text-left px-3 py-2 text-[11px] font-semibold text-muted-foreground uppercase tracking-wide whitespace-nowrap">Потрачено/Оценка</th>
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
                    <td className="px-6 py-2.5 min-w-0">
                      <div className="flex items-center gap-2 min-w-0">
                        {task.isPinned && <Pin className="w-3 h-3 text-primary flex-shrink-0" />}
                        {task.isSupertask && <Star className="w-3 h-3 text-amber-500 flex-shrink-0" />}
                        <PriorityDot priority={task.priority} />
                        <span className="font-medium text-xs truncate">{task.title}</span>
                      </div>
                    </td>
                    <td className="px-3 py-2.5"><ProjectBadge project={task.project} /></td>
                    <td className="pl-5 pr-3 py-2.5 whitespace-nowrap">
                      <span className="text-xs text-muted-foreground">{taskStatusLabel(task.status)}</span>
                    </td>
                    <td className="px-3 py-2.5 whitespace-nowrap">
                      <span className="text-xs font-medium" style={{ color: priorityColorForTask(task.priority) }}>
                        {taskPriorityLabel(task.priority)}
                      </span>
                    </td>
                    <td className="px-3 py-2.5 text-xs text-muted-foreground whitespace-nowrap">{task.deadline || '—'}</td>
                    <td className="px-3 py-2.5 text-xs text-muted-foreground whitespace-nowrap">
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
