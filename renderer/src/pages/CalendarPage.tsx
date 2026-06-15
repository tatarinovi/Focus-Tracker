import { useEffect, useMemo, useState } from "react";
import { CalendarEvent } from "@/data/mockData";
import { useApp } from "@/context/AppContext";
import { Users, Video, ExternalLink, Clock, ChevronLeft, ChevronRight, RefreshCw } from "lucide-react";
import { soundToast as toast } from "@/lib/appAudio";

type Period = 'today' | 'tomorrow' | '3days' | 'week' | 'month';

const PROVIDER_LABELS: Record<string, string> = {
  google_meet: 'Google Meet', zoom: 'Zoom', teams: 'Microsoft Teams', telemost: 'Яндекс Телемост',
};

const PROVIDER_COLORS: Record<string, string> = {
  google_meet: '#1a73e8', zoom: '#2D8CFF', teams: '#7B83EB', telemost: '#FF5722',
};

const RU_MONTHS = ['Январь','Февраль','Март','Апрель','Май','Июнь','Июль','Август','Сентябрь','Октябрь','Ноябрь','Декабрь'];
const RU_DAYS_SHORT = ['Пн','Вт','Ср','Чт','Пт','Сб','Вс'];

function formatDateLabel(date: string, today: string) {
  const current = new Date(`${today}T00:00:00`);
  const target = new Date(`${date}T00:00:00`);
  const diffDays = Math.round((target.getTime() - current.getTime()) / 86_400_000);
  const label = target.toLocaleDateString('ru-RU', { weekday: 'short', day: 'numeric', month: 'long' });
  if (diffDays === 0) return `Сегодня, ${label}`;
  if (diffDays === 1) return `Завтра, ${label}`;
  if (diffDays === 2) return `Послезавтра, ${label}`;
  return label;
}

function ProviderBadge({ provider }: { provider: string | null }) {
  if (!provider) return <Video className="w-4 h-4 text-muted-foreground" />;
  const initials: Record<string, string> = { google_meet: 'G', zoom: 'Z', teams: 'T', telemost: 'Y' };
  return (
    <div className="w-6 h-6 rounded flex items-center justify-center text-white text-xs font-bold flex-shrink-0"
      style={{ backgroundColor: PROVIDER_COLORS[provider] || '#6b7280' }}>
      {initials[provider] || 'M'}
    </div>
  );
}

function RsvpButton({ status, label, current, onClick }: { status: string; label: string; current: string; onClick: () => void }) {
  const isActive = current === status;
  const colorMap: Record<string, string> = {
    accepted: 'text-green-400 border-green-500 bg-green-500/10',
    tentative: 'text-yellow-400 border-yellow-500 bg-yellow-500/10',
    declined: 'text-red-400 border-red-500 bg-red-500/10',
    not_responded: 'text-muted-foreground border-border',
  };
  return (
    <button
      onClick={onClick}
      className={`px-2 py-1 rounded text-[11px] border transition-colors ${isActive ? colorMap[status] : 'text-muted-foreground border-border hover:bg-secondary'}`}
    >
      {label}
    </button>
  );
}

function EventCard({ event }: { event: CalendarEvent }) {
  const [rsvp, setRsvp] = useState(event.rsvpStatus);

  const updateRsvp = async (status: 'accepted' | 'tentative' | 'declined') => {
    const previous = rsvp;
    setRsvp(status);
    if (!window.api?.updateCalendarRsvp || !(event as any).icsUrl) return;
    try {
      await window.api.updateCalendarRsvp({ icsUrl: (event as any).icsUrl, newStatus: status });
      toast.success('Ответ отправлен в календарь');
    } catch (error) {
      setRsvp(previous);
      toast.error('Не удалось отправить ответ');
    }
  };

  return (
    <div className="bg-card border border-border rounded-xl p-4 hover:border-primary/30 transition-colors">
      <div className="flex items-start gap-3">
        <ProviderBadge provider={event.meetingProvider} />
        <div className="flex-1 min-w-0">
          <div className="flex items-start justify-between gap-2">
            <h3 className="text-sm font-semibold leading-tight">{event.title}</h3>
            <div className="flex items-center gap-1 text-[11px] text-muted-foreground flex-shrink-0">
              <Clock className="w-3 h-3" />
              {event.start} — {event.end}
            </div>
          </div>

          {event.description && (
            <p className="text-xs text-muted-foreground mt-1 whitespace-pre-line break-words">{event.description}</p>
          )}

          <div className="flex items-center flex-wrap gap-3 mt-2">
            {event.attendees.length > 0 && (
              <div className="flex items-center gap-1 text-xs text-muted-foreground">
                <Users className="w-3 h-3" />
                <span>{event.attendees.slice(0, 2).join(', ')}{event.attendees.length > 2 ? ` +${event.attendees.length-2}` : ''}</span>
              </div>
            )}
            {event.meetingProvider && (
              <div className="text-[11px] text-muted-foreground">{PROVIDER_LABELS[event.meetingProvider]}</div>
            )}
          </div>

          <div className="flex items-center gap-2 mt-3">
            <div className="flex gap-1">
              <RsvpButton status="accepted" label="Приму" current={rsvp} onClick={() => updateRsvp('accepted')} />
              <RsvpButton status="tentative" label="Возможно" current={rsvp} onClick={() => updateRsvp('tentative')} />
              <RsvpButton status="declined" label="Не пойду" current={rsvp} onClick={() => updateRsvp('declined')} />
            </div>
            {event.meetingUrl && (
              <button
                data-testid={`button-join-${event.id}`}
                onClick={() => event.meetingUrl && window.api?.openExternal(event.meetingUrl)}
                className="ml-auto flex items-center gap-1 bg-primary/10 text-primary hover:bg-primary hover:text-primary-foreground rounded-lg px-3 py-1 text-xs font-medium transition-colors"
              >
                <ExternalLink className="w-3 h-3" /> Подключиться
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function MonthView({ events, today }: { events: CalendarEvent[]; today: string }) {
  const todayDate = useMemo(() => new Date(`${today}T00:00:00`), [today]);
  const [month, setMonth] = useState(todayDate.getMonth());
  const [year, setYear] = useState(todayDate.getFullYear());

  const firstDay = new Date(year, month, 1);
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const startDow = (firstDay.getDay() + 6) % 7;

  const cells: (number | null)[] = [];
  for (let i = 0; i < startDow; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) cells.push(d);
  while (cells.length % 7 !== 0) cells.push(null);

  const eventsByDay: Record<number, CalendarEvent[]> = {};
  events.forEach(ev => {
    const evDate = new Date(ev.date);
    if (evDate.getFullYear() === year && evDate.getMonth() === month) {
      const d = evDate.getDate();
      if (!eventsByDay[d]) eventsByDay[d] = [];
      eventsByDay[d].push(ev);
    }
  });

  const todayObj = todayDate;
  const isCurrentMonth = todayObj.getFullYear() === year && todayObj.getMonth() === month;

  const prevMonth = () => {
    if (month === 0) { setMonth(11); setYear(y => y - 1); }
    else setMonth(m => m - 1);
  };
  const nextMonth = () => {
    if (month === 11) { setMonth(0); setYear(y => y + 1); }
    else setMonth(m => m + 1);
  };

  const weeks: (number | null)[][] = [];
  for (let i = 0; i < cells.length; i += 7) weeks.push(cells.slice(i, i + 7));

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <button onClick={prevMonth} className="p-1.5 rounded-lg hover:bg-secondary transition-colors">
          <ChevronLeft className="w-4 h-4" />
        </button>
        <span className="text-sm font-semibold">{RU_MONTHS[month]} {year}</span>
        <button onClick={nextMonth} className="p-1.5 rounded-lg hover:bg-secondary transition-colors">
          <ChevronRight className="w-4 h-4" />
        </button>
      </div>

      <div className="bg-card border border-border rounded-xl overflow-hidden">
        <div className="grid grid-cols-7 border-b border-border">
          {RU_DAYS_SHORT.map(d => (
            <div key={d} className={`py-2 text-center text-[11px] font-medium ${d === 'Сб' || d === 'Вс' ? 'text-red-400' : 'text-muted-foreground'}`}>{d}</div>
          ))}
        </div>
        {weeks.map((week, wi) => (
          <div key={wi} className="grid grid-cols-7 border-b border-border last:border-b-0">
            {week.map((day, di) => {
              const isToday = isCurrentMonth && day === todayObj.getDate();
              const dayEvents = day ? (eventsByDay[day] || []) : [];
              const isWeekend = di >= 5;
              return (
                <div key={di} className={`min-h-[72px] p-1.5 border-r border-border last:border-r-0 ${!day ? 'bg-secondary/20' : isWeekend ? 'bg-red-500/5' : ''}`}>
                  {day && (
                    <>
                      <div className={`w-6 h-6 flex items-center justify-center rounded-full text-xs mb-1 font-medium ${isToday ? 'bg-primary text-primary-foreground' : isWeekend ? 'text-red-400' : 'text-foreground'}`}>
                        {day}
                      </div>
                      <div className="space-y-0.5">
                        {dayEvents.slice(0, 3).map(ev => (
                          <div key={ev.id} className="truncate text-[10px] px-1 py-0.5 rounded bg-primary/15 text-primary leading-tight">
                            {ev.start} {ev.title}
                          </div>
                        ))}
                        {dayEvents.length > 3 && (
                          <div className="text-[10px] text-muted-foreground px-1">+{dayEvents.length - 3} ещё</div>
                        )}
                      </div>
                    </>
                  )}
                </div>
              );
            })}
          </div>
        ))}
      </div>
    </div>
  );
}

export default function CalendarPage() {
  const { state, ensureCalendarLoaded } = useApp();
  const [period, setPeriod] = useState<Period>('today');
  const today = useMemo(() => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  }, []);
  const addDays = (days: number) => {
    const d = new Date(today);
    d.setDate(d.getDate() + days);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  };

  const periodDates: Record<Exclude<Period, 'month'>, string[]> = {
    today: [today],
    tomorrow: [addDays(1)],
    '3days': [today, addDays(1), addDays(2)],
    week: Array.from({ length: 7 }, (_, i) => addDays(i)),
  };

  useEffect(() => {
    ensureCalendarLoaded();
  }, [ensureCalendarLoaded]);

  const upcoming = state.calendarEvents.filter(e => e.date === today).slice(0, 3);

  const dates = period !== 'month' ? periodDates[period] : [];
  const eventsByDate = dates.map(date => ({
    date,
    events: state.calendarEvents.filter(e => e.date === date).sort((a, b) => a.start.localeCompare(b.start)),
  }));

  const PERIOD_BUTTONS: [Period, string][] = [
    ['today', 'Сегодня'],
    ['tomorrow', 'Завтра'],
    ['3days', '3 дня'],
    ['week', 'Неделя'],
    ['month', 'Месяц'],
  ];

  return (
    <div className="flex h-full">
      <div className="flex-1 overflow-y-auto scrollbar-thin p-6 space-y-6">
        <div className="flex items-center justify-between">
          <h1 className="text-lg font-semibold">Календарь</h1>
          <div className="flex items-center gap-2">
            <button
              onClick={() => ensureCalendarLoaded(true)}
              disabled={state.loading.calendar}
              className="p-2 rounded-lg hover:bg-secondary disabled:opacity-50 transition-colors"
              title="Обновить"
            >
              <RefreshCw className={`w-4 h-4 ${state.loading.calendar ? 'animate-spin' : ''}`} />
            </button>
            <div className="flex bg-secondary rounded-lg p-0.5 gap-0.5">
              {PERIOD_BUTTONS.map(([key, label]) => (
                <button
                  key={key}
                  data-testid={`button-period-${key}`}
                  onClick={() => setPeriod(key)}
                  className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${period === key ? 'bg-background text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'}`}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>
        </div>

        {period === 'month' ? (
          <MonthView events={state.calendarEvents} today={today} />
        ) : (
          eventsByDate.map(({ date, events }) => (
            <div key={date}>
              <h2 className="text-sm font-semibold text-muted-foreground mb-3">{formatDateLabel(date, today)}</h2>
              {events.length === 0 ? (
                <div className="text-sm text-muted-foreground py-6 text-center border border-dashed border-border rounded-xl">
                  Нет событий
                </div>
              ) : (
                <div className="space-y-3">
                  {events.map(event => <EventCard key={event.id} event={event} />)}
                </div>
              )}
            </div>
          ))
        )}
      </div>

      <div className="w-64 flex-shrink-0 border-l border-border p-4 space-y-4 overflow-y-auto">
        <h2 className="text-sm font-semibold">Ближайшие созвоны</h2>
        {state.loading.calendar && upcoming.length === 0 && (
          <div className="text-xs text-muted-foreground border border-dashed border-border rounded-xl p-3 text-center">
            Загружаю календарь...
          </div>
        )}
        {!state.loading.calendar && upcoming.length === 0 && (
          <div className="text-xs text-muted-foreground border border-dashed border-border rounded-xl p-3 text-center">
            Сегодня созвонов нет
          </div>
        )}
        {upcoming.map(event => (
          <div key={event.id} className="p-3 bg-card border border-border rounded-xl">
            <div className="flex items-center gap-2 mb-2">
              <ProviderBadge provider={event.meetingProvider} />
              <p className="text-xs font-medium leading-tight">{event.title}</p>
            </div>
            <p className="text-[11px] text-muted-foreground mb-2">{event.start} — {event.end}</p>
            {event.meetingUrl && (
              <button
                onClick={() => event.meetingUrl && window.api?.openExternal(event.meetingUrl)}
                className="w-full flex items-center justify-center gap-1 bg-primary/10 text-primary hover:bg-primary hover:text-primary-foreground rounded-md py-1 text-[11px] transition-colors"
              >
                <ExternalLink className="w-3 h-3" /> Подключиться
              </button>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
