import {
  CalendarEvent,
  HistoryEntry,
  Note,
  Task,
  TaskPriority,
  TaskStatus,
  KANBAN_DEFAULT_STAGE_NAMES,
  KANBAN_DEFAULT_PRIORITY_NAMES,
  detectMeetingProvider,
  roundToQuarter,
} from "@/data/mockData";
import { expandRawCalendarEvents } from "@/lib/calendarRecurrence";

export const api = () => window.api;

let kanbanBaseUrlCache: string | null = null;

const PINNED_TASKS_KEY = "ft_pinned_tasks";

type KanbanTaskDetailCache = Pick<
  Task,
  | "deadline"
  | "isSupertask"
  | "description"
  | "checklist"
  | "comments"
  | "estimate"
  | "spentTime"
  | "detailsLoaded"
  | "status"
  | "stageId"
  | "priority"
  | "priorityId"
  | "assignee"
>;

const kanbanTaskDetailCache = new Map<number, KanbanTaskDetailCache>();

export function loadPinnedTaskIds(): Set<number> {
  try {
    const saved = localStorage.getItem(PINNED_TASKS_KEY);
    if (!saved) return new Set();
    const ids = JSON.parse(saved);
    if (!Array.isArray(ids)) return new Set();
    return new Set(ids.map((id) => Number(id)).filter((id) => Number.isFinite(id)));
  } catch {
    return new Set();
  }
}

export function savePinnedTaskIds(ids: Set<number>) {
  try {
    localStorage.setItem(PINNED_TASKS_KEY, JSON.stringify([...ids]));
  } catch { /* ignore */ }
}

function isSupertaskFromKanban(task: any) {
  const raw = firstValue(task?.is_supertask, task?.isSupertask, task?.supertask);
  if (raw === true || raw === 1 || raw === "1") return true;
  if (typeof raw === "number") return raw > 0;
  if (typeof raw === "string") {
    const value = raw.trim().toLowerCase();
    return value !== "" && value !== "0" && value !== "false";
  }
  return false;
}

function rememberKanbanTaskDetail(task: Task) {
  const prev = kanbanTaskDetailCache.get(task.id);
  const hasMetrics = Boolean(task.deadline || task.estimate > 0 || task.spentTime > 0 || task.isSupertask);
  const hasContent = Boolean(task.description || task.checklist.length || task.comments.length);
  if (!task.detailsLoaded && !hasMetrics && !hasContent && !prev) return;

  kanbanTaskDetailCache.set(task.id, {
    deadline: task.deadline || prev?.deadline || "",
    isSupertask: task.isSupertask || prev?.isSupertask || false,
    description: task.description || prev?.description || "",
    checklist: task.checklist.length ? task.checklist : (prev?.checklist || []),
    comments: task.comments.length ? task.comments : (prev?.comments || []),
    estimate: task.estimate > 0 ? task.estimate : (prev?.estimate ?? 0),
    spentTime: task.spentTime > 0 ? task.spentTime : (prev?.spentTime ?? 0),
    status: task.status || prev?.status || "Новые",
    stageId: task.stageId || prev?.stageId || 0,
    priority: task.priority || prev?.priority || "Средний",
    priorityId: task.priorityId || prev?.priorityId || 0,
    assignee: task.assignee || prev?.assignee || "",
    detailsLoaded: Boolean(task.detailsLoaded || prev?.detailsLoaded),
  });
}

function mergeKanbanDetailFields(incoming: Task, existing?: Task): Partial<Task> {
  const cached = kanbanTaskDetailCache.get(incoming.id);
  const detailSource = existing?.detailsLoaded ? existing : cached;
  if (!detailSource) return {};

  return {
    deadline: incoming.deadline || detailSource.deadline,
    isSupertask: incoming.isSupertask || detailSource.isSupertask,
    description: incoming.description || detailSource.description,
    checklist: incoming.checklist.length ? incoming.checklist : detailSource.checklist,
    comments: incoming.comments.length ? incoming.comments : detailSource.comments,
    estimate: incoming.estimate > 0 ? incoming.estimate : detailSource.estimate,
    spentTime: incoming.spentTime > 0 ? incoming.spentTime : detailSource.spentTime,
    status: incoming.status || detailSource.status,
    stageId: incoming.stageId || detailSource.stageId,
    priority: incoming.priority || detailSource.priority,
    priorityId: incoming.priorityId || detailSource.priorityId,
    assignee: incoming.assignee || detailSource.assignee,
    detailsLoaded: true as const,
  };
}

function applyKanbanTaskDetailCache(task: Task): Task {
  const cached = kanbanTaskDetailCache.get(task.id);
  if (!cached) return task;
  return {
    ...task,
    deadline: task.deadline || cached.deadline,
    isSupertask: task.isSupertask || cached.isSupertask,
    description: task.description || cached.description,
    checklist: task.checklist.length ? task.checklist : cached.checklist,
    comments: task.comments.length ? task.comments : cached.comments,
    estimate: task.estimate > 0 ? task.estimate : cached.estimate,
    spentTime: task.spentTime > 0 ? task.spentTime : cached.spentTime,
    status: task.status || cached.status,
    stageId: task.stageId || cached.stageId,
    priority: task.priority || cached.priority,
    priorityId: task.priorityId || cached.priorityId,
    assignee: task.assignee || cached.assignee,
    detailsLoaded: task.detailsLoaded || cached.detailsLoaded,
  };
}

export function isTauriRuntime() {
  return Boolean(window.api);
}

function toDateKey(date = new Date()) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function timeFromIso(value?: string) {
  if (!value) return "--:--";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "--:--";
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

function minutesFromMs(value?: number) {
  return Math.max(0, Math.ceil((Number(value) || 0) / 60000));
}

function dateFromCalendarValue(value: any): Date | null {
  const raw = typeof value === "object" ? value?.val || value?.date || value?.value : value;
  if (!raw) return null;

  if (raw instanceof Date) {
    return Number.isNaN(raw.getTime()) ? null : raw;
  }

  const text = String(raw).trim();
  const icsMatch = text.match(
    /^(\d{4})(\d{2})(\d{2})(?:T(\d{2})(\d{2})(\d{2})?(Z)?)?$/,
  );

  if (icsMatch) {
    const [, year, month, day, hour = "00", minute = "00", second = "00", zulu] = icsMatch;
    const y = Number(year);
    const mo = Number(month) - 1;
    const d = Number(day);
    const h = Number(hour);
    const mi = Number(minute);
    const s = Number(second);
    const date = zulu
      ? new Date(Date.UTC(y, mo, d, h, mi, s))
      : new Date(y, mo, d, h, mi, s);
    return Number.isNaN(date.getTime()) ? null : date;
  }

  const date = new Date(text);
  return Number.isNaN(date.getTime()) ? null : date;
}

function decodeCalendarText(value: any) {
  const raw = typeof value === "object" ? value?.val ?? value?.value ?? value?.text ?? "" : value;
  return String(raw || "")
    .replace(/\\[nN]/g, "\n")
    .replace(/\\,/g, ",")
    .replace(/\\;/g, ";")
    .replace(/\\\\/g, "\\")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function rsvpFromCalendar(value: any): CalendarEvent["rsvpStatus"] {
  const raw = String(value || "").toLowerCase();
  if (raw === "accepted") return "accepted";
  if (raw === "tentative") return "tentative";
  if (raw === "declined") return "declined";
  return "not_responded";
}

function firstValue(...values: any[]) {
  return values.find((value) => value !== undefined && value !== null && value !== "");
}

function minutesFromKanbanValue(value: any) {
  const raw = typeof value === "object" ? firstValue(value?.value, value?.minutes, value?.time, value?.total) : value;
  const numeric = Number(raw);
  if (!Number.isFinite(numeric) || numeric <= 0) return 0;
  return numeric > 1000 ? Math.ceil(numeric / 60000) : numeric;
}

function dateFromKanbanValue(value: any) {
  const raw = typeof value === "object" ? firstValue(value?.date, value?.value, value?.deadline, value?.datetime, value?.at) : value;
  if (!raw) return "";
  return String(raw).slice(0, 10);
}

function textFromHtml(value: any) {
  const source = String(value || "");
  if (!source) return "";
  if (typeof document === "undefined") {
    return source
      .replace(/<br\s*\/?>/gi, "\n")
      .replace(/<\/p>/gi, "\n")
      .replace(/<[^>]+>/g, "")
      .replace(/&nbsp;/g, " ")
      .trim();
  }
  const container = document.createElement("div");
  container.innerHTML = source.replace(/<br\s*\/?>/gi, "\n");
  container.querySelectorAll("p, div, li").forEach((node) => {
    node.appendChild(document.createTextNode("\n"));
  });
  return (container.textContent || "")
    .replace(/\u00a0/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function unwrapKanbanPayload(value: any): any {
  if (!value) return null;
  if (value.success === false) return null;
  return firstValue(
    value?.data?.data?.task,
    value?.data?.data?.item,
    value?.data?.data?.card,
    value?.data?.data?.user,
    value?.data?.task,
    value?.data?.item,
    value?.data?.card,
    value?.data?.user,
    value?.task,
    value?.item,
    value?.card,
    value?.user,
    value?.data?.data,
    value?.data,
    value,
  );
}

function unwrapKanbanList(value: any): any[] {
  const payload = unwrapKanbanPayload(value);
  const list = firstValue(
    Array.isArray(payload) ? payload : undefined,
    payload?.tasks,
    payload?.items,
    payload?.cards,
    payload?.data,
  );
  return Array.isArray(list) ? list : [];
}

function kanbanName(value: any) {
  if (!value) return "";
  if (typeof value === "string" || typeof value === "number") return String(value);
  return firstValue(
    value.name,
    value.title,
    value.full_name,
    value.fullName,
    `${value.surname || ""} ${value.name || ""}`.trim(),
    value.email,
    value.login,
    value.username,
  ) || "";
}

function kanbanList(...values: any[]) {
  for (const value of values) {
    if (Array.isArray(value)) return value;
    if (Array.isArray(value?.items)) return value.items;
    if (Array.isArray(value?.points)) return value.points;
    if (Array.isArray(value?.tasks)) return value.tasks;
  }
  return [];
}

function normalizeKanbanChecklist(task: any) {
  const groups = kanbanList(task?.checklists, task?.checklist_groups, task?.checklistGroups);
  const direct = kanbanList(task?.checklist, task?.check_list);
  const normalizeItem = (item: any) => ({
    text: item?.name || item?.text || item?.title || item?.label || "",
    done: Boolean(
      item?.is_done
      ?? item?.done
      ?? item?.isDone
      ?? item?.completed
      ?? item?.checked
      ?? item?.status === "done",
    ),
  });

  if (groups.length) {
    return groups.flatMap((list: any) => {
      const points = kanbanList(list?.points, list?.items, list?.tasks);
      if (points.length) return points.map(normalizeItem);
      return [normalizeItem(list)];
    }).filter((item: { text: string; done: boolean }) => item.text);
  }

  return direct.map(normalizeItem).filter((item: { text: string; done: boolean }) => item.text);
}

function kanbanAssigneesFromTask(task: any) {
  const users = kanbanList(task?.users, task?.workers, task?.responsibles, task?.observers);
  if (users.length) {
    return users.map((user: any) => kanbanName(user)).filter(Boolean).join(", ");
  }
  return kanbanName(firstValue(
    task?.assignee,
    task?.responsible,
    task?.executor,
    task?.performer,
    task?.assigned_to,
    task?.assignedTo,
    task?.user,
  ));
}

function mergeKanbanTaskDetail(task: any, response: any) {
  const payload = unwrapKanbanPayload(response);
  const detail = Array.isArray(payload)
    ? payload.find((item: any) => String(item?.id) === String(task?.id)) || payload[0]
    : payload;
  if (!detail) return task;
  return {
    ...task,
    ...detail,
    project: detail.project || task.project,
    priority: detail.priority || task.priority,
    stage: detail.stage || task.stage,
    status: detail.status || task.status,
    assignee: detail.assignee || task.assignee,
    responsible: detail.responsible || task.responsible,
    executor: detail.executor || task.executor,
    performer: detail.performer || task.performer,
    user: detail.user || task.user,
    checklist: detail.checklist || detail.check_list || detail.tasks || task.checklist,
    check_list: detail.check_list || task.check_list,
    checklists: detail.checklists || task.checklists,
    users: detail.users || task.users,
    comments: detail.comments || task.comments,
  };
}

const kanbanPriorityNameById = new Map<number, string>();

export function rememberKanbanPriority(priority: any) {
  const priorityId = Number(priority?.id ?? priority);
  const name = typeof priority === "object" ? kanbanName(priority?.name) : "";
  if (Number.isFinite(priorityId) && name) {
    kanbanPriorityNameById.set(priorityId, name);
  }
}

export function resolveKanbanPriorityName(priorityId: number, fallback = "") {
  if (!Number.isFinite(priorityId)) return fallback;
  return kanbanPriorityNameById.get(priorityId) || KANBAN_DEFAULT_PRIORITY_NAMES[priorityId] || fallback;
}

function kanbanPriorityFromTask(task: any): { priorityId: number; priority: TaskPriority } {
  const rawPriority = task?.priority;
  const priorityId = Number(
    typeof rawPriority === "object"
      ? rawPriority?.id
      : firstValue(task?.priority_id, task?.priorityId, rawPriority),
  );
  const rawName = typeof rawPriority === "object"
    ? kanbanName(rawPriority?.name)
    : "";

  if (typeof rawPriority === "object" && rawPriority) {
    rememberKanbanPriority(rawPriority);
  }

  if (rawName) {
    if (Number.isFinite(priorityId)) rememberKanbanPriority({ id: priorityId, name: rawName });
    return { priorityId: Number.isFinite(priorityId) ? priorityId : 0, priority: rawName };
  }

  if (Number.isFinite(priorityId)) {
    const priority = resolveKanbanPriorityName(priorityId, `Приоритет ${priorityId}`);
    rememberKanbanPriority({ id: priorityId, name: priority });
    return { priorityId, priority };
  }

  return { priorityId: 0, priority: "Средний" };
}

const kanbanStageNameById = new Map<number, string>();

export function rememberKanbanStage(stage: any) {
  const stageId = Number(stage?.id ?? stage);
  const name = typeof stage === "object" ? kanbanName(stage?.name) : "";
  if (Number.isFinite(stageId) && name) {
    kanbanStageNameById.set(stageId, name);
  }
}

export function resolveKanbanStageName(stageId: number, fallback = "") {
  if (!Number.isFinite(stageId)) return fallback;
  return kanbanStageNameById.get(stageId) || KANBAN_DEFAULT_STAGE_NAMES[stageId] || fallback;
}

function kanbanStageFromTask(task: any): { stageId: number; status: TaskStatus } {
  const stage = task?.stage;
  const stageId = Number(stage?.id ?? task?.stage_id ?? stage);
  const rawName = typeof stage === "object"
    ? kanbanName(stage?.name)
  : kanbanName(firstValue(task?.status?.name, task?.status_name, task?.status));

  if (typeof stage === "object" && stage) {
    rememberKanbanStage(stage);
  }

  if (rawName) {
    if (Number.isFinite(stageId)) rememberKanbanStage({ id: stageId, name: rawName });
    return { stageId: Number.isFinite(stageId) ? stageId : 0, status: rawName };
  }

  if (Number.isFinite(stageId)) {
    const status = resolveKanbanStageName(stageId, `Стадия ${stageId}`);
    rememberKanbanStage({ id: stageId, name: status });
    return { stageId, status };
  }

  return { stageId: 0, status: "Новые" };
}

export function normalizeKanbanTask(task: any, baseUrl = ""): Task {
  const projectName = kanbanName(firstValue(
    task?.project,
    task?.project_name,
    task?.projectName,
    task?.project_title,
    task?.projectTitle,
  )) || "Без проекта";
  const projectSlug = task?.project?.slug || task?.project_slug || task?.projectSlug || "";
  const url = task?.url || (baseUrl && projectSlug && task?.id ? `${baseUrl}/projects/${projectSlug}/${task.id}` : "");
  const estimate = minutesFromKanbanValue(firstValue(
    task?.estimate,
    task?.estimate_time,
    task?.planned_time,
    task?.planned_minutes,
    task?.plannedTime,
    task?.time_estimate,
    task?.timeEstimate,
    task?.time_plan,
    task?.timePlan,
    task?.estimate_minutes,
    task?.estimateMinutes,
    task?.estimation,
    task?.duration_plan,
    task?.durationPlan,
    task?.estimate_worker,
    task?.estimateWorker,
    task?.estimates?.reduce?.((sum: number, item: any) => sum + (Number(item?.estimate) || 0), 0),
    task?.responsible_estimates?.reduce?.((sum: number, item: any) => sum + (Number(item?.estimate) || 0), 0),
  ));
  const spentTime = minutesFromKanbanValue(firstValue(
    task?.spent_time,
    task?.spent_minutes,
    task?.time_spent,
    task?.timeSpent,
    task?.spentTime,
    task?.logged_time,
    task?.loggedTime,
    task?.work_time,
    task?.workTime,
    task?.fact_time,
    task?.factTime,
    task?.time_fact,
    task?.timeFact,
    task?.worklog_time,
    task?.worklogTime,
    task?.duration_fact,
    task?.durationFact,
    task?.total_logged_time,
    task?.totalLoggedTime,
    task?.estimates?.reduce?.((sum: number, item: any) => sum + (Number(item?.logged_time) || 0), 0),
    task?.work_detail?.reduce?.((sum: number, item: any) => sum + (Number(item?.time_sum) || 0), 0),
  ));
  const { stageId, status } = kanbanStageFromTask(task);
  const { priorityId, priority } = kanbanPriorityFromTask(task);
  return {
    id: Number(task?.id ?? Date.now()),
    title: task?.name || task?.title || "Без названия",
    project: projectName,
    status,
    stageId,
    priority,
    priorityId,
    deadline: dateFromKanbanValue(firstValue(
      task?.deadline,
      task?.deadline_at,
      task?.deadlineAt,
      task?.due_date,
      task?.dueDate,
      task?.due_at,
      task?.dueAt,
      task?.finish_date,
      task?.finishDate,
      task?.end_date,
      task?.endDate,
      task?.end_at,
      task?.endAt,
      task?.planned_finish_at,
      task?.plannedFinishAt,
      task?.dates?.deadline,
      task?.dates?.due,
      task?.dates?.finish,
    )),
    assignee: kanbanAssigneesFromTask(task),
    isPinned: false,
    isSupertask: isSupertaskFromKanban(task),
    estimate,
    spentTime,
    description: textFromHtml(task?.description || task?.text || task?.body || task?.content || ""),
    checklist: normalizeKanbanChecklist(task),
    comments: Array.isArray(task?.comments)
      ? task.comments.map((comment: any) => ({
          author: kanbanName(comment.user || comment.author) || "Автор",
          text: textFromHtml(comment.content || comment.text || comment.comment || comment.body || ""),
          date: comment.created_at || comment.createdAt || comment.date || "",
        }))
      : [],
    url,
    detailsLoaded: Boolean(task?.detailsLoaded),
  } as Task & { url?: string };
}

export function mergeKanbanTaskList(
  existingTasks: Task[],
  nextTasks: Task[],
  pinnedTaskIds: Set<number> = loadPinnedTaskIds(),
) {
  const existingById = new Map(existingTasks.map((task) => [task.id, task]));
  return nextTasks.map((task) => {
    const existing = existingById.get(task.id);
    const isPinned = pinnedTaskIds.has(task.id);
    if (!existing) {
      const merged = applyKanbanTaskDetailCache({ ...task, isPinned });
      rememberKanbanTaskDetail(merged);
      return merged;
    }

    const detailFields = mergeKanbanDetailFields(task, existing);

    const merged = applyKanbanTaskDetailCache({
      ...existing,
      ...task,
      isPinned,
      ...detailFields,
    });
    rememberKanbanTaskDetail(merged);
    return merged;
  });
}

export function normalizeHistoryEntry(entry: any, index: number): HistoryEntry {
  const minutes = minutesFromMs(entry.durationMs);
  const start = entry.startISO ? new Date(entry.startISO) : null;
  const date = entry.date || (start && !Number.isNaN(start.getTime()) ? toDateKey(start) : toDateKey());
  return {
    id: Number(entry.id ?? index + 1),
    taskId: Number(entry.taskId ?? entry.id ?? index + 1),
    taskTitle: entry.taskTitle || entry.name || "Без названия",
    project: entry.project || "",
    startTime: timeFromIso(entry.startISO),
    endTime: timeFromIso(entry.endISO),
    duration: minutes,
    roundedDuration: roundToQuarter(minutes),
    comment: entry.comment || "",
    date,
  };
}

export function normalizeNote(note: any, index: number): Note {
  return {
    id: note.id ?? index + 1,
    title: note.title || note.id || "Без названия",
    content: note.content || "",
    updatedAt: note.updatedAt || note.updated_at || new Date().toISOString(),
  };
}

export function normalizeCalendarEvent(event: any, index: number): (CalendarEvent & { icsUrl?: string }) | null {
  if (String(event.status || "").toUpperCase() === "CANCELLED") return null;

  const rawStart = event.start || event.dtstart || event.dtStart;
  const rawEnd = event.end || event.dtend || event.dtEnd;
  const startDate = dateFromCalendarValue(rawStart);
  if (!startDate) return null;
  const endDate = rawEnd ? dateFromCalendarValue(rawEnd) : startDate;
  const safeEndDate = endDate || startDate;
  const title = decodeCalendarText(event.summary || event.title);
  const description = decodeCalendarText(event.description);
  const location = decodeCalendarText(event.location);
  const url = event.url || event.meetingUrl || extractMeetingUrl(`${description} ${location}`);
  return {
    id: index + 1,
    title: title || event.title || "Без названия",
    start: timeFromIso(startDate.toISOString()),
    end: timeFromIso(safeEndDate.toISOString()),
    date: toDateKey(startDate),
    meetingUrl: url,
    meetingProvider: detectMeetingProvider(url),
    attendees: Array.isArray(event.attendees)
      ? event.attendees.map((attendee: any) => attendee?.params?.CN || attendee?.name || attendee?.email || String(attendee))
      : [],
    rsvpStatus: rsvpFromCalendar(event.partstat || event.rsvpStatus),
    description: description || location || "",
    icsUrl: event.icsUrl,
  } as CalendarEvent & { icsUrl?: string };
}

function extractMeetingUrl(text: string) {
  const match = text.match(/https?:\/\/[^\s<>"']+/i);
  return match ? match[0] : null;
}

export async function loadRealHistory() {
  if (!window.api) return [];
  const entries = await window.api.loadTasks();
  return entries.map(normalizeHistoryEntry).reverse();
}

export async function loadRealNotes() {
  if (!window.api) return [];
  const notes = await window.api.loadNotes();
  return notes.map(normalizeNote);
}

export async function loadRealKanbanTasks(config: any, options: { hydrateDetails?: boolean } = {}) {
  if (!window.api || !config?.kanban?.token) return [];
  let userInfo = config?.kanban?.userInfo?.data || config?.kanban?.userInfo;
  let userId = config?.kanban?.userId || config?.kanban?.user_id || userInfo?.id;
  if (!userId) {
    const userResult = await window.api.kanbanGetUserInfo(config.kanban.token);
    if (userResult?.success === false) {
      throw new Error(userResult.error || "KANBAN_USER_FAILED");
    }
    userInfo = userResult?.data?.data || userResult?.data || userResult;
    userId = userInfo?.id;
    if (userId) {
      await window.api.saveConfig({
        ...config,
        kanban: {
          ...(config.kanban || {}),
          userInfo,
        },
      }).catch(() => {});
    }
  }
  if (!userId) throw new Error("KANBAN_USER_ID_MISSING");
  if (!kanbanBaseUrlCache) {
    kanbanBaseUrlCache = await window.api.getKanbanBaseUrl().catch(() => "");
  }
  const baseUrl = kanbanBaseUrlCache;
  const result = await window.api.kanbanGetTasks(userId, config.kanban.token);
  if (result?.success === false) {
    throw new Error(result.error || "KANBAN_LOAD_FAILED");
  }
  const tasks = unwrapKanbanList(result);
  if (options.hydrateDetails) {
    const hydratedTasks = await hydrateKanbanTaskDetails(tasks, config.kanban.token);
    return hydratedTasks
      .map((task: any) => normalizeKanbanTask({ ...task, detailsLoaded: true }, baseUrl))
      .map((task) => {
        const pinned = loadPinnedTaskIds();
        const withPin = { ...task, isPinned: pinned.has(task.id) };
        rememberKanbanTaskDetail(withPin);
        return withPin;
      });
  }
  const pinned = loadPinnedTaskIds();
  return tasks
    .map((task: any) => normalizeKanbanTask({ ...task, detailsLoaded: false }, baseUrl))
    .map((task) => applyKanbanTaskDetailCache({ ...task, isPinned: pinned.has(task.id) }));
}

async function hydrateKanbanTaskDetails(tasks: any[], token: string) {
  if (!window.api?.kanbanGetTask || !token || tasks.length === 0) return tasks;
  const result: any[] = [];
  const batchSize = 4;
  for (let i = 0; i < tasks.length; i += batchSize) {
    const batch = tasks.slice(i, i + batchSize);
    const detailed = await Promise.all(batch.map(async (task) => {
      try {
        const response = await window.api!.kanbanGetTask(task.id, token);
        return mergeKanbanTaskDetail(task, response);
      } catch {
        return task;
      }
    }));
    result.push(...detailed);
  }
  return result;
}

export async function hydrateKanbanTasksMissingDetails(config: any, tasks: Task[]) {
  if (!window.api || !config?.kanban?.token) return [];
  const missing = tasks.filter((task) => !task.detailsLoaded);
  if (missing.length === 0) return [];

  if (!kanbanBaseUrlCache) {
    kanbanBaseUrlCache = await window.api.getKanbanBaseUrl().catch(() => "");
  }
  const baseUrl = kanbanBaseUrlCache;
  const hydrated = await hydrateKanbanTaskDetails(
    missing.map((task) => ({ id: task.id, name: task.title, project: { name: task.project } })),
    config.kanban.token,
  );
  const pinned = loadPinnedTaskIds();
  return hydrated.map((task: any) => {
    const normalized = normalizeKanbanTask({ ...task, detailsLoaded: true }, baseUrl);
    const withPin = { ...normalized, isPinned: pinned.has(normalized.id) };
    rememberKanbanTaskDetail(withPin);
    return withPin;
  });
}

export async function loadRealKanbanTaskDetail(config: any, task: Task) {
  if (!window.api?.kanbanGetTask || !config?.kanban?.token) return task;
  if (!kanbanBaseUrlCache) {
    kanbanBaseUrlCache = await window.api.getKanbanBaseUrl().catch(() => "");
  }
  const baseUrl = kanbanBaseUrlCache;
  const response = await window.api.kanbanGetTask(task.id, config.kanban.token);
  if (response?.success === false) {
    throw new Error(response.error || "KANBAN_TASK_LOAD_FAILED");
  }
  const detailedTask = normalizeKanbanTask({ ...mergeKanbanTaskDetail(task, response), detailsLoaded: true }, baseUrl);
  const withPin = { ...detailedTask, isPinned: loadPinnedTaskIds().has(detailedTask.id) || task.isPinned };
  rememberKanbanTaskDetail(withPin);
  return withPin;
}

export async function loadRealCalendarEvents(config: any) {
  const calendarUrl = config?.ical_url || config?.calendar?.url;
  if (!window.api || !calendarUrl) return [];
  const result = await window.api.fetchCalendarCalDav(calendarUrl);
  if (!result?.success) return [];
  const source: any[] = Array.isArray(result.data) ? result.data : Object.values(result.data || {});
  const expanded = expandRawCalendarEvents(
    source.filter((item: any) => item?.type === "VEVENT" || item?.summary || item?.title),
  );
  return expanded
    .map(normalizeCalendarEvent)
    .filter((event): event is CalendarEvent & { icsUrl?: string } => Boolean(event));
}
