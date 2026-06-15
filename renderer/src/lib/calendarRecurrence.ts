import { rrulestr } from "rrule";

export const CALENDAR_EXPAND_PAST_DAYS = 30;
export const CALENDAR_EXPAND_FUTURE_DAYS = 400;

function pad(value: number) {
  return String(value).padStart(2, "0");
}

export function dateFromCalendarValue(value: unknown): Date | null {
  const raw = typeof value === "object" && value !== null
    ? (value as { val?: unknown; date?: unknown; value?: unknown }).val
      ?? (value as { date?: unknown }).date
      ?? (value as { value?: unknown }).value
    : value;
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

function toDateKey(date: Date) {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

function toTimeKey(date: Date) {
  return `${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function formatIcsDateTime(date: Date) {
  return `${date.getFullYear()}${pad(date.getMonth() + 1)}${pad(date.getDate())}T${pad(date.getHours())}${pad(date.getMinutes())}${pad(date.getSeconds())}`;
}

function parseIcsDuration(value: string): number | null {
  const match = String(value).trim().match(
    /^P(?:(\d+)W)?(?:(\d+)D)?(?:T(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?)?$/i,
  );
  if (!match) return null;
  const weeks = Number(match[1] || 0);
  const days = Number(match[2] || 0);
  const hours = Number(match[3] || 0);
  const minutes = Number(match[4] || 0);
  const seconds = Number(match[5] || 0);
  return (((weeks * 7 + days) * 24 + hours) * 60 + minutes) * 60_000 + seconds * 1000;
}

function eventDurationMs(event: any, startDate: Date, endDate: Date | null) {
  if (endDate && endDate.getTime() > startDate.getTime()) {
    return endDate.getTime() - startDate.getTime();
  }
  const fromDuration = event.duration ? parseIcsDuration(event.duration) : null;
  if (fromDuration && fromDuration > 0) return fromDuration;
  return 30 * 60_000;
}

function occurrenceKey(uid: string | undefined, date: Date) {
  return `${uid || ""}|${toDateKey(date)}|${toTimeKey(date)}`;
}

function getExpansionWindow() {
  const start = new Date();
  start.setHours(0, 0, 0, 0);
  start.setDate(start.getDate() - CALENDAR_EXPAND_PAST_DAYS);

  const end = new Date();
  end.setHours(23, 59, 59, 999);
  end.setDate(end.getDate() + CALENDAR_EXPAND_FUTURE_DAYS);

  return { start, end };
}

function expandRRuleOccurrences(event: any, windowStart: Date, windowEnd: Date): Date[] {
  const rawStart = event.start || event.dtstart || event.dtStart;
  if (!rawStart || !event.rrule) return [];

  const lines = [`DTSTART:${rawStart}`, `RRULE:${event.rrule}`];
  for (const exdate of event.exdates || []) {
    if (exdate) lines.push(`EXDATE:${exdate}`);
  }
  for (const rdate of event.rdates || []) {
    if (rdate) lines.push(`RDATE:${rdate}`);
  }

  try {
    const ruleSet = rrulestr(lines.join("\n"), { forceset: true });
    return ruleSet.between(windowStart, windowEnd, true);
  } catch {
    return [];
  }
}

function withOccurrence(event: any, masterStart: Date, occurrence: Date, durationMs: number) {
  const rawStart = String(event.start || event.dtstart || event.dtStart || "");
  const isFloating = Boolean(rawStart) && !rawStart.endsWith("Z");
  const startDate = isFloating
    ? new Date(
      occurrence.getFullYear(),
      occurrence.getMonth(),
      occurrence.getDate(),
      masterStart.getHours(),
      masterStart.getMinutes(),
      masterStart.getSeconds(),
    )
    : occurrence;
  const endDate = new Date(startDate.getTime() + durationMs);
  return {
    ...event,
    start: formatIcsDateTime(startDate),
    end: formatIcsDateTime(endDate),
    _occurrenceKey: occurrenceKey(event.uid, startDate),
  };
}

export function expandRawCalendarEvents(source: any[]): any[] {
  const { start: windowStart, end: windowEnd } = getExpansionWindow();
  const masters = source.filter((event) => {
    if (String(event?.status || "").toUpperCase() === "CANCELLED") return false;
    return event?.rrule && !event?.recurrenceId;
  });

  const explicitEvents = source.filter((event) => {
    if (String(event?.status || "").toUpperCase() === "CANCELLED") return false;
    if (!event?.rrule) return true;
    return Boolean(event?.recurrenceId);
  });

  const explicitKeys = new Set<string>();
  for (const event of explicitEvents) {
    const startDate = dateFromCalendarValue(event.start || event.dtstart || event.dtStart);
    if (!startDate) continue;
    explicitKeys.add(occurrenceKey(event.uid, startDate));
  }

  const expanded: any[] = [];

  for (const master of masters) {
    const masterStart = dateFromCalendarValue(master.start || master.dtstart || master.dtStart);
    if (!masterStart) continue;

    const masterEnd = dateFromCalendarValue(master.end || master.dtend || master.dtEnd);
    const durationMs = eventDurationMs(master, masterStart, masterEnd);
    const occurrences = expandRRuleOccurrences(master, windowStart, windowEnd);

    for (const occurrence of occurrences) {
      const key = occurrenceKey(master.uid, occurrence);
      if (explicitKeys.has(key)) continue;
      expanded.push(withOccurrence(master, masterStart, occurrence, durationMs));
    }
  }

  const standalone = explicitEvents;

  const deduped = new Map<string, any>();
  for (const event of [...expanded, ...standalone]) {
    const startDate = dateFromCalendarValue(event.start || event.dtstart || event.dtStart);
    if (!startDate) continue;
    const key = event._occurrenceKey || occurrenceKey(event.uid, startDate);
    if (!deduped.has(key)) {
      deduped.set(key, event);
    }
  }

  return Array.from(deduped.values());
}
