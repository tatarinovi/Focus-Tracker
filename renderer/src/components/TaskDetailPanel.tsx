import { useState, useMemo, useEffect } from "react";
import { useApp } from "@/context/AppContext";
import {
  Task,
  PROJECT_COLORS,
  formatMinutes,
  sortKanbanStatuses,
  sortKanbanPriorities,
  taskStatusLabel,
  taskPriorityLabel,
} from "@/data/mockData";
import { Pin, Star, X, Play, CheckCircle } from "lucide-react";
import { soundToast as toast } from "@/lib/appAudio";

function ProjectBadge({ project }: { project: string }) {
  return (
    <span
      className="inline-flex items-center text-[10px] font-semibold px-1.5 py-0.5 rounded text-white flex-shrink-0"
      title={project}
      style={{ backgroundColor: PROJECT_COLORS[project] || "#6366f1" }}
    >
      {project}
    </span>
  );
}

function formatTaskMetric(minutes: number) {
  return minutes > 0 ? formatMinutes(minutes) : "—";
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

export function TaskDetailPanel({ task, onClose }: { task: Task; onClose: () => void }) {
  const { state, dispatch, startTimer } = useApp();
  const [editTask, setEditTask] = useState<Task>({ ...task });
  const description = plainTaskDescription(editTask.description);
  const statusOptions = useMemo(
    () => sortKanbanStatuses([...new Set([editTask.status, ...state.tasks.map((item) => item.status)])]),
    [editTask.status, state.tasks],
  );
  const panelPriorityOptions = useMemo(
    () => sortKanbanPriorities([...new Set([editTask.priority, ...state.tasks.map((item) => item.priority)])]),
    [editTask.priority, state.tasks],
  );

  useEffect(() => {
    setEditTask({ ...task });
  }, [task]);

  const handleSave = () => {
    dispatch({ type: "UPDATE_TASK", task: editTask });
    toast.success("Задача обновлена");
    onClose();
  };

  const openKanbanTask = () => {
    if (!editTask.url) return;
    window.api?.openExternal(editTask.url);
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
        {editTask.url ? (
          <button
            type="button"
            data-testid={`link-task-id-${editTask.id}`}
            onClick={openKanbanTask}
            className="text-[11px] font-mono text-primary hover:underline"
            title="Открыть в Kanban"
          >
            #{editTask.id}
          </button>
        ) : (
          <span className="text-[11px] font-mono text-muted-foreground">#{editTask.id}</span>
        )}

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
              onChange={(e) => setEditTask({ ...editTask, status: e.target.value as Task["status"] })}
              className="w-full bg-input border border-border rounded-md px-2 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-ring"
            >
              {statusOptions.map((s) => (
                <option key={s} value={s}>
                  {taskStatusLabel(s)}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="text-[11px] text-muted-foreground block mb-1">Приоритет</label>
            <select
              value={editTask.priority}
              onChange={(e) => setEditTask({ ...editTask, priority: e.target.value as Task["priority"] })}
              className="w-full bg-input border border-border rounded-md px-2 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-ring"
            >
              {panelPriorityOptions.map((p) => (
                <option key={p} value={p}>
                  {taskPriorityLabel(p)}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-2 text-xs">
          <div>
            <span className="text-muted-foreground block mb-0.5">Исполнитель</span>
            <span className="font-medium">{editTask.assignee || "—"}</span>
          </div>
          <div>
            <span className="text-muted-foreground block mb-0.5">Дедлайн</span>
            <span className="font-medium">{editTask.deadline || "—"}</span>
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
            <p className="text-[11px] text-muted-foreground mb-2">
              Чек-лист ({editTask.checklist.filter((c) => c.done).length}/{editTask.checklist.length})
            </p>
            <div className="space-y-1.5">
              {editTask.checklist.map((item, i) => (
                <div
                  key={i}
                  className="flex items-center gap-2 cursor-pointer group"
                  onClick={() => {
                    const newCl = [...editTask.checklist];
                    newCl[i] = { ...newCl[i], done: !newCl[i].done };
                    setEditTask({ ...editTask, checklist: newCl });
                  }}
                >
                  <div
                    className={`w-3.5 h-3.5 rounded border flex items-center justify-center flex-shrink-0 ${item.done ? "bg-primary border-primary" : "border-border"}`}
                  >
                    {item.done && <CheckCircle className="w-2.5 h-2.5 text-primary-foreground" />}
                  </div>
                  <span className={`text-xs ${item.done ? "line-through text-muted-foreground" : ""}`}>{item.text}</span>
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
            onClick={() => {
              startTimer(editTask);
              onClose();
            }}
            className="flex-1 flex items-center justify-center gap-1.5 bg-primary text-primary-foreground rounded-lg py-1.5 text-xs font-medium hover:opacity-90"
          >
            <Play className="w-3 h-3" /> Запустить таймер
          </button>
          <button
            onClick={() => dispatch({ type: "PIN_TASK", taskId: editTask.id })}
            className={`px-2.5 rounded-lg border text-xs ${editTask.isPinned ? "bg-primary/10 border-primary text-primary" : "border-border text-muted-foreground hover:bg-secondary"}`}
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
