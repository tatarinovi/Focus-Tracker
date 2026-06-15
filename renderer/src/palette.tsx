import { createRoot } from "react-dom/client";
import { useState, useEffect, useRef, useMemo, useCallback } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import type { Command, CommandCategory, PaletteCommand, PaletteTask } from "@/lib/commandRegistry";
import { CATEGORY_LABELS, CATEGORY_SHORTCUTS } from "@/lib/commandRegistry";
import {
  Search, Pause, Play, Square, Timer, Briefcase, Coffee, LogOut,
  Circle, LayoutGrid, Settings, Calendar, Target, Ticket, ArrowLeft, Check,
} from "lucide-react";
import "./index.css";

const ICONS: Record<string, React.ComponentType<any>> = {
  Search, Pause, Play, Square, Timer, Briefcase, Coffee, LogOut,
  Circle, LayoutGrid, Settings, Calendar, Target, Ticket, ArrowLeft, Check,
};

const CATEGORY_ORDER: CommandCategory[] = ["timer", "pomodoro", "bitrix", "navigation", "tasks"];

type TaskAction = {
  id: string;
  title: string;
  subtitle: string;
  icon: string;
  shortcut: string;
};

const TASK_ACTIONS: TaskAction[] = [
  { id: "start", title: "Начать трекинг", subtitle: "Остановит текущую задачу и запустит эту", icon: "Play", shortcut: "Enter" },
  { id: "open", title: "Открыть в Kanban", subtitle: "Переход к карточке на доске", icon: "LayoutGrid", shortcut: "Kanban" },
  { id: "complete", title: "Завершить задачу", subtitle: "Отметить выполненной", icon: "Check", shortcut: "Done" },
];

type ListItem =
  | { kind: "command"; cmd: Command }
  | { kind: "task"; task: PaletteTask };

function fuzzyMatch(text: string, q: string): boolean {
  if (!q) return true;
  const lower = text.toLowerCase();
  const ql = q.toLowerCase();
  let qi = 0;
  for (let i = 0; i < lower.length && qi < ql.length; i++) {
    if (lower[i] === ql[qi]) qi++;
  }
  return qi === ql.length;
}

function filterItems(commands: Command[], tasks: PaletteTask[], q: string): ListItem[] {
  const items: ListItem[] = [];
  if (!q) {
    for (const cmd of commands) {
      if (cmd.enabled) items.push({ kind: "command", cmd });
    }
    return items;
  }
  for (const cmd of commands) {
    const searchable = [cmd.title, cmd.id, cmd.subtitle, ...cmd.keywords].join(" ");
    if (fuzzyMatch(searchable, q)) items.push({ kind: "command", cmd });
  }
  for (const task of tasks) {
    const searchable = `${task.id} ${task.title} ${task.project} ${task.status}`;
    if (fuzzyMatch(searchable, q)) items.push({ kind: "task", task });
  }
  return items;
}

function commandToPaletteCommand(id: string): PaletteCommand {
  const map: Record<string, PaletteCommand> = {
    "timer.pause": { type: "timer.pause" },
    "timer.resume": { type: "timer.resume" },
    "timer.stop": { type: "timer.stop" },
    "pomodoro.start": { type: "pomodoro.start" },
    "bitrix.day.start": { type: "bitrix.day.start" },
    "bitrix.break.start": { type: "bitrix.break.start" },
    "bitrix.break.end": { type: "bitrix.break.end" },
    "bitrix.day.end": { type: "bitrix.day.end" },
    "nav.home": { type: "navigation.open", payload: { page: "home" } },
    "nav.kanban": { type: "navigation.open", payload: { page: "kanban" } },
    "nav.settings": { type: "navigation.open", payload: { page: "settings" } },
    "nav.calendar": { type: "navigation.open", payload: { page: "calendar" } },
  };
  return map[id] || { type: "noop" };
}

async function executePaletteCmd(paletteCmd: PaletteCommand) {
  await invoke("palette_execute_command", { command: paletteCmd });
  await invoke("palette_hide");
}

async function executeCommand(cmd: Command) {
  await executePaletteCmd(commandToPaletteCommand(cmd.id));
}

async function executeTaskOpen(task: PaletteTask) {
  await executePaletteCmd({ type: "task.open", payload: { taskId: task.id } });
}

async function executeTaskStart(task: PaletteTask, e: React.MouseEvent) {
  e.stopPropagation();
  await executePaletteCmd({ type: "task.start", payload: { taskId: task.id } });
  await invoke("palette_hide");
}

async function executeTaskAction(task: PaletteTask, actionId: string) {
  switch (actionId) {
    case "start":
      await executePaletteCmd({ type: "task.start", payload: { taskId: task.id } });
      break;
    case "open":
      await executePaletteCmd({ type: "task.open", payload: { taskId: task.id } });
      break;
    case "complete":
      await executePaletteCmd({ type: "task.complete", payload: { taskId: task.id } });
      break;
  }
  await invoke("palette_hide");
}

function IconByName({ name, style }: { name: string; style?: React.CSSProperties }) {
  const Icon = ICONS[name];
  if (!Icon) return <div style={{ width: 14, height: 14, borderRadius: "50%", background: C.textMuted }} />;
  return <Icon style={style} />;
}

const C = {
  bg: "#1B1D22",
  card: "#1B1D22",
  border: "#2e3039",
  selectedBorder: "#7c6cff",
  selectedBg: "#252636",
  hover: "#22242c",
  iconBg: "#252636",
  text: "#cdd6f4",
  textMuted: "#6c7086",
  inputBg: "#22242c",
  kbdBg: "#252636",
  scrollbar: "#2e3039",
};

function Palette() {
  const [commands, setCommands] = useState<Command[]>([]);
  const [tasks, setTasks] = useState<PaletteTask[]>([]);
  const [query, setQuery] = useState("");
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [selectedTask, setSelectedTask] = useState<PaletteTask | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const items = useMemo(() => filterItems(commands, tasks, query), [commands, tasks, query]);

  const isItemEnabled = useCallback((item: ListItem | undefined): boolean => {
    if (!item) return false;
    if (item.kind === "command") return item.cmd.enabled;
    return true;
  }, []);

  const findNextEnabled = useCallback((from: number, direction: 1 | -1): number => {
    let idx = from;
    for (let i = 0; i < items.length; i++) {
      idx = (idx + direction + items.length) % items.length;
      if (isItemEnabled(items[idx])) return idx;
    }
    return from;
  }, [items, isItemEnabled]);

  useEffect(() => {
    invoke("palette_request_commands");
    const unlisten = listen<any>("show-palette", (event) => {
      const data = event.payload;
      setCommands(data?.commands || []);
      setTasks(data?.tasks || []);
      setQuery("");
      setSelectedTask(null);
      const allItems: ListItem[] = [
        ...(data?.commands || []).map((c: Command) => ({ kind: "command" as const, cmd: c })),
        ...(data?.tasks || []).map((t: PaletteTask) => ({ kind: "task" as const, task: t })),
      ];
      const firstEnabled = allItems.findIndex((item) => isItemEnabled(item));
      setSelectedIndex(firstEnabled >= 0 ? firstEnabled : 0);
      inputRef.current?.focus();
    });
    const handleFocus = () => invoke("palette_request_commands");
    const handleBlur = () => setTimeout(() => invoke("palette_hide").catch(() => {}), 100);
    window.addEventListener("focus", handleFocus);
    window.addEventListener("blur", handleBlur);
    return () => {
      unlisten.then((fn) => fn());
      window.removeEventListener("focus", handleFocus);
      window.removeEventListener("blur", handleBlur);
    };
  }, [isItemEnabled]);

  useEffect(() => {
    if (!selectedTask) {
      setSelectedIndex(items.findIndex((item) => isItemEnabled(item)) || 0);
    }
  }, [items.length, isItemEnabled, selectedTask]);

  const selectedTaskRef = useRef(selectedTask);
  selectedTaskRef.current = selectedTask;

  const selectedIndexRef = useRef(selectedIndex);
  selectedIndexRef.current = selectedIndex;

  useEffect(() => {
    const el = document.querySelector(`[data-slot="item"][data-index="${selectedIndex}"]`);
    el?.scrollIntoView({ block: "nearest" });
  }, [selectedIndex]);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (!selectedTaskRef.current) return;
      if (e.key === "Escape") {
        e.preventDefault();
        e.stopPropagation();
        setSelectedTask(null);
        setQuery("");
        setSelectedIndex(0);
        inputRef.current?.focus();
      } else if (e.key === "Backspace") {
        e.preventDefault();
        e.stopPropagation();
        setSelectedTask(null);
        setQuery("");
        setSelectedIndex(0);
        inputRef.current?.focus();
      } else if (e.key === "ArrowDown") {
        e.preventDefault();
        e.stopPropagation();
        setSelectedIndex((prev) => Math.min(prev + 1, TASK_ACTIONS.length - 1));
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        e.stopPropagation();
        setSelectedIndex((prev) => Math.max(prev - 1, 0));
      } else if (e.key === "Enter") {
        e.preventDefault();
        e.stopPropagation();
        const action = TASK_ACTIONS[selectedIndexRef.current];
        if (action) executeTaskAction(selectedTaskRef.current, action.id);
      }
    };
    window.addEventListener("keydown", handler, true);
    return () => window.removeEventListener("keydown", handler, true);
  }, []);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === "Escape") {
        if (selectedTask) {
          setSelectedTask(null);
          setQuery("");
          setSelectedIndex(0);
          inputRef.current?.focus();
        } else {
          invoke("palette_hide");
        }
      } else if (e.key === "Backspace" && selectedTask) {
        e.preventDefault();
        setSelectedTask(null);
        setQuery("");
        setSelectedIndex(0);
        inputRef.current?.focus();
      } else if (e.key === "ArrowDown") {
        e.preventDefault();
        if (selectedTask) {
          setSelectedIndex((prev) => Math.min(prev + 1, TASK_ACTIONS.length - 1));
        } else {
          setSelectedIndex((prev) => findNextEnabled(prev, 1));
        }
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        if (selectedTask) {
          setSelectedIndex((prev) => Math.max(prev - 1, 0));
        } else {
          setSelectedIndex((prev) => findNextEnabled(prev, -1));
        }
      } else if (e.key === "Enter") {
        e.preventDefault();
        if (selectedTask) {
          const action = TASK_ACTIONS[selectedIndex];
          if (action) executeTaskAction(selectedTask, action.id);
        } else {
          const item = items[selectedIndex];
          if (item?.kind === "command" && item.cmd.enabled) {
            executeCommand(item.cmd);
          } else if (item?.kind === "task") {
            setSelectedTask(item.task);
            setSelectedIndex(0);
            setQuery("");
            inputRef.current?.focus();
          }
        }
      }
    },
    [items, selectedIndex, findNextEnabled, selectedTask, query],
  );

  const grouped = useMemo(() => {
    const result: { category: string; items: ListItem[] }[] = [];
    const catMap: Record<string, ListItem[]> = {};
    for (const item of items) {
      if (item.kind === "command") {
        const cat = item.cmd.category;
        if (!catMap[cat]) catMap[cat] = [];
        catMap[cat].push(item);
      } else {
        if (!catMap["tasks"]) catMap["tasks"] = [];
        catMap["tasks"].push(item);
      }
    }
    for (const cat of CATEGORY_ORDER) {
      if (catMap[cat]) result.push({ category: cat, items: catMap[cat] });
    }
    return result;
  }, [items]);

  let globalIndex = 0;

  return (
    <div
      className="flex h-screen w-full items-start"
      style={{ background: C.bg, fontFamily: "Inter, system-ui, sans-serif" }}
    >
      <div className="w-full px-4" onKeyDown={handleKeyDown}>
        <div className="overflow-hidden rounded-2xl" style={{ background: C.bg }}>
          <div
            className="flex items-center gap-3 mt-3 px-4 py-3"
            style={{
              borderRadius: 12,
              border: `1px solid ${C.border}`,
              background: C.inputBg,
            }}
          >
            <Search style={{ width: 16, height: 16, color: C.textMuted, flexShrink: 0 }} />
            <input
              ref={inputRef}
              type="text"
              placeholder={selectedTask ? selectedTask.title : "Что сделать?"}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              disabled={!!selectedTask}
              autoFocus
              style={{ flex: 1, background: "transparent", border: "none", outline: "none", color: C.text, fontSize: 13, fontWeight: 500, caretColor: C.selectedBorder }}
            />
            <kbd
              style={{
                pointerEvents: "none",
                borderRadius: 6,
                border: `1px solid ${C.border}`,
                background: C.kbdBg,
                padding: "2px 6px",
                fontSize: 10,
                fontWeight: 500,
                color: C.textMuted,
              }}
            >
              Esc
            </kbd>
          </div>

          <div
            style={{
              maxHeight: 320,
              overflowY: "auto",
              padding: "4px 8px 4px 4px",
            }}
          >
            {selectedTask ? (
              <div>
                <div
                  onClick={() => { setSelectedTask(null); setQuery(""); setSelectedIndex(0); inputRef.current?.focus(); }}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 10,
                    padding: "10px 12px",
                    borderRadius: 10,
                    cursor: "pointer",
                    border: `1px solid ${C.border}`,
                    background: C.inputBg,
                    marginBottom: 8,
                  }}
                >
                  <ArrowLeft style={{ width: 14, height: 14, color: C.textMuted, flexShrink: 0 }} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 13, fontWeight: 500, color: C.text }}>{selectedTask.title}</div>
                    <div style={{ fontSize: 11, fontWeight: 400, color: C.textMuted }}>{selectedTask.project}</div>
                  </div>
                </div>

                <div
                  style={{
                    padding: "8px 8px 4px",
                    fontSize: 10,
                    fontWeight: 600,
                    textTransform: "uppercase",
                    letterSpacing: "0.05em",
                    color: C.textMuted,
                  }}
                >
                  Действия над kanban-задачей
                </div>

                {TASK_ACTIONS.map((action, idx) => {
                  const isSelected = idx === selectedIndex;
                  return (
                    <div
                      key={action.id}
                      data-slot="item"
                      data-index={idx}
                      onClick={() => executeTaskAction(selectedTask, action.id)}
                      onMouseEnter={() => setSelectedIndex(idx)}
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: 10,
                        borderRadius: 10,
                        padding: "5px 10px",
                        cursor: "pointer",
                        border: isSelected ? `2px solid ${C.selectedBorder}` : "2px solid transparent",
                        background: isSelected ? C.selectedBg : "transparent",
                        transition: "all 80ms",
                      }}
                    >
                      <div
                        style={{
                          width: 28,
                          height: 28,
                          borderRadius: 7,
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                          flexShrink: 0,
                        }}
                      >
                        <IconByName name={action.icon} style={{ width: 14, height: 14, color: C.textMuted }} />
                      </div>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: 13, fontWeight: 500, color: C.text }}>{action.title}</div>
                        <div style={{ fontSize: 11, fontWeight: 400, color: C.textMuted }}>{action.subtitle}</div>
                      </div>
                      <span style={{ fontSize: 11, color: C.textMuted, flexShrink: 0 }}>{action.shortcut}</span>
                    </div>
                  );
                })}
              </div>
            ) : items.length === 0 ? (
              <div style={{ padding: "32px 0", textAlign: "center", fontSize: 13, color: C.textMuted }}>
                Нет результатов
              </div>
            ) : (
              grouped.map(({ category, items: catItems }) => (
                <div key={category}>
                  <div
                    style={{
                      padding: "12px 8px 4px",
                      fontSize: 10,
                      fontWeight: 600,
                      fontFamily: "Inter, system-ui, sans-serif",
                      textTransform: "uppercase",
                      letterSpacing: "0.05em",
                      color: C.textMuted,
                    }}
                  >
                    {CATEGORY_LABELS[category as CommandCategory] || category}
                  </div>
                  {catItems.map((item) => {
                    const idx = globalIndex++;
                    const isSelected = idx === selectedIndex;

                    if (item.kind === "command") {
                      const cmd = item.cmd;
                      const shortcut = CATEGORY_SHORTCUTS[cmd.category];
                      return (
                        <div
                          key={cmd.id}
                          data-slot="item"
                          data-index={idx}
                          onClick={() => executeCommand(cmd)}
                          onMouseEnter={() => setSelectedIndex(idx)}
                          style={{
                            display: "flex",
                            alignItems: "center",
                            gap: 10,
                            borderRadius: 10,
                            padding: "5px 10px",
                            cursor: "pointer",
                            opacity: !cmd.enabled ? 0.35 : 1,
                            pointerEvents: !cmd.enabled ? "none" : "auto",
                            border: isSelected ? `2px solid ${C.selectedBorder}` : "2px solid transparent",
                            background: isSelected ? C.selectedBg : "transparent",
                            transition: "all 80ms",
                          }}
                        >
                          <div
                            style={{
                              width: 28,
                              height: 28,
                              borderRadius: 7,
                              display: "flex",
                              alignItems: "center",
                              justifyContent: "center",
                              flexShrink: 0,
                            }}
                          >
                            <IconByName name={cmd.icon} style={{ width: 14, height: 14, color: C.textMuted }} />
                          </div>
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <div style={{ fontSize: 13, fontWeight: 500, color: C.text }}>{cmd.title}</div>
                            <div style={{ fontSize: 11, fontWeight: 400, color: C.textMuted }}>{cmd.subtitle}</div>
                          </div>
                          {shortcut && (
                            <span style={{ fontSize: 11, color: C.textMuted, flexShrink: 0 }}>{shortcut}</span>
                          )}
                        </div>
                      );
                    }

                    const task = item.task;
                    return (
                      <div
                        key={`task-${task.id}`}
                        data-slot="item"
                        data-index={idx}
                        onClick={() => { setSelectedTask(task); setSelectedIndex(0); setQuery(""); inputRef.current?.focus(); }}
                        onMouseEnter={() => setSelectedIndex(idx)}
                        style={{
                          display: "flex",
                          alignItems: "center",
                          gap: 10,
                          borderRadius: 10,
                          padding: "5px 10px",
                          cursor: "pointer",
                          border: isSelected ? `2px solid ${C.selectedBorder}` : "2px solid transparent",
                          background: isSelected ? C.selectedBg : "transparent",
                          transition: "all 80ms",
                        }}
                      >
                        <div
                          style={{
                            width: 28,
                            height: 28,
                            borderRadius: 7,
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "center",
                            flexShrink: 0,
                          }}
                        >
                          <div style={{ width: 6, height: 6, borderRadius: "50%", background: C.textMuted }} />
                        </div>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ fontSize: 13, fontWeight: 500, color: C.text }}>{task.title}</div>
                          <div style={{ fontSize: 11, fontWeight: 400, color: C.textMuted }}>{task.project}</div>
                        </div>
                        <span style={{ fontSize: 11, color: C.textMuted, flexShrink: 0 }}>Task</span>
                      </div>
                    );
                  })}
                </div>
              ))
            )}
          </div>

          <div
            style={{
              padding: "8px 16px",
              fontSize: 11,
              color: C.textMuted,
            }}
          >
            {selectedTask
              ? "Enter выбрать · Backspace назад · Esc закрыть"
              : "↑↓ навигация · Enter выполнить · Esc закрыть"
            }
          </div>
        </div>
      </div>
    </div>
  );
}

const rootElement = document.getElementById("root");
if (rootElement) {
  createRoot(rootElement).render(<Palette />);
}
