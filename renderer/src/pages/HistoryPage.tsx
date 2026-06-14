import { useState } from "react";
import { useApp } from "@/context/AppContext";
import { PROJECT_COLORS, formatMinutes } from "@/data/mockData";
import { Trash2, Edit2, Check, X, Download } from "lucide-react";
import { toast } from "sonner";

const WORK_START = 8;
const WORK_END = 20;
const WORK_HOURS = WORK_END - WORK_START;

function timeToMinutes(time: string): number {
  const [h, m] = time.split(':').map(Number);
  return h * 60 + m;
}

function TimelineBar({ entries }: { entries: ReturnType<typeof useApp>['state']['history'] }) {
  const totalMins = WORK_HOURS * 60;

  const colors = Object.values(PROJECT_COLORS);

  const taskColorMap: Record<number, string> = {};
  let colorIdx = 0;
  entries.forEach(e => {
    if (!taskColorMap[e.taskId]) {
      taskColorMap[e.taskId] = colors[colorIdx % colors.length];
      colorIdx++;
    }
  });

  return (
    <div className="bg-card border border-border rounded-xl p-4">
      <p className="text-xs font-semibold text-muted-foreground mb-3">Временная шкала</p>
      <div className="relative h-8 bg-secondary rounded-lg overflow-hidden">
        {entries.map(entry => {
          const startMins = timeToMinutes(entry.startTime) - WORK_START * 60;
          const endMins = timeToMinutes(entry.endTime) - WORK_START * 60;
          const left = Math.max(0, (startMins / totalMins) * 100);
          const width = Math.min(100 - left, ((endMins - startMins) / totalMins) * 100);
          const color = taskColorMap[entry.taskId] || '#6366f1';
          return (
            <div
              key={entry.id}
              className="absolute top-0 h-full rounded cursor-pointer hover:brightness-110 transition-all"
              style={{ left: `${left}%`, width: `${Math.max(width, 0.5)}%`, backgroundColor: color, opacity: 0.85 }}
              title={`${entry.taskTitle} (${entry.startTime}–${entry.endTime})`}
            />
          );
        })}
      </div>
      <div className="flex justify-between mt-1.5">
        {Array.from({ length: WORK_HOURS + 1 }, (_, i) => (
          <span key={i} className="text-[10px] text-muted-foreground">{WORK_START + i}:00</span>
        ))}
      </div>
    </div>
  );
}

export default function HistoryPage() {
  const { state, dispatch, reloadHistory } = useApp();
  const [selectedDate, setSelectedDate] = useState(state.selectedDate);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editComment, setEditComment] = useState('');

  const filtered = state.history.filter(h => h.date === selectedDate);
  const totalDuration = filtered.reduce((s, h) => s + h.duration, 0);
  const totalRounded = filtered.reduce((s, h) => s + h.roundedDuration, 0);

  const dates = [...new Set(state.history.map(h => h.date))].sort().reverse();

  const handleExport = () => {
    window.api?.openDataPath();
  };

  return (
    <div className="p-6 space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <h1 className="text-lg font-semibold">История</h1>
          <select
            data-testid="select-history-date"
            value={selectedDate}
            onChange={e => setSelectedDate(e.target.value)}
            className="bg-input border border-border rounded-md px-3 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-ring"
          >
            {dates.map(d => (
              <option key={d} value={d}>{d}</option>
            ))}
          </select>
        </div>
        <button
          data-testid="button-export-history"
          onClick={handleExport}
          className="flex items-center gap-2 bg-secondary text-secondary-foreground rounded-lg px-3 py-1.5 text-sm hover:opacity-90 transition-opacity"
        >
          <Download className="w-4 h-4" />
          Экспорт
        </button>
      </div>

      <TimelineBar entries={filtered} />

      <div className="bg-card border border-border rounded-xl overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border">
              <th className="text-left px-4 py-2.5 text-[11px] font-semibold text-muted-foreground uppercase tracking-wide">Задача</th>
              <th className="text-left px-3 py-2.5 text-[11px] font-semibold text-muted-foreground uppercase tracking-wide">Проект</th>
              <th className="text-left px-3 py-2.5 text-[11px] font-semibold text-muted-foreground uppercase tracking-wide">Начало</th>
              <th className="text-left px-3 py-2.5 text-[11px] font-semibold text-muted-foreground uppercase tracking-wide">Конец</th>
              <th className="text-left px-3 py-2.5 text-[11px] font-semibold text-muted-foreground uppercase tracking-wide">Длит.</th>
              <th className="text-left px-3 py-2.5 text-[11px] font-semibold text-muted-foreground uppercase tracking-wide">Округл.</th>
              <th className="text-left px-3 py-2.5 text-[11px] font-semibold text-muted-foreground uppercase tracking-wide">Комментарий</th>
              <th className="px-3 py-2.5"></th>
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 && (
              <tr>
                <td colSpan={8} className="text-center py-10 text-sm text-muted-foreground">
                  Нет записей за выбранный день
                </td>
              </tr>
            )}
            {filtered.map(entry => (
              <tr key={entry.id} className="border-b border-border/50 hover:bg-secondary/20 transition-colors group">
                <td className="px-4 py-2.5">
                  <div className="flex items-center gap-2">
                    <div className="w-2 h-2 rounded-full flex-shrink-0"
                      style={{ backgroundColor: PROJECT_COLORS[entry.project] || '#6366f1' }} />
                    <span className="text-xs font-medium max-w-48 truncate">{entry.taskTitle}</span>
                  </div>
                </td>
                <td className="px-3 py-2.5">
                  <span className="text-[11px] font-semibold px-1.5 py-0.5 rounded text-white"
                    style={{ backgroundColor: PROJECT_COLORS[entry.project] || '#6366f1' }}>
                    {entry.project}
                  </span>
                </td>
                <td className="px-3 py-2.5 text-xs text-muted-foreground font-mono">{entry.startTime}</td>
                <td className="px-3 py-2.5 text-xs text-muted-foreground font-mono">{entry.endTime}</td>
                <td className="px-3 py-2.5 text-xs font-medium">{entry.duration}м</td>
                <td className="px-3 py-2.5 text-xs text-muted-foreground">{entry.roundedDuration}м</td>
                <td className="px-3 py-2.5 flex-1">
                  {editingId === entry.id ? (
                    <div className="flex items-center gap-1">
                      <input
                        autoFocus
                        value={editComment}
                        onChange={e => setEditComment(e.target.value)}
                        className="bg-input border border-border rounded px-2 py-0.5 text-xs flex-1 focus:outline-none focus:ring-1 focus:ring-ring"
                        onKeyDown={e => {
                          if (e.key === 'Enter') {
                            dispatch({ type: 'UPDATE_HISTORY_COMMENT', id: entry.id, comment: editComment });
                            setEditingId(null);
                          }
                          if (e.key === 'Escape') setEditingId(null);
                        }}
                      />
                      <button onClick={() => { dispatch({ type: 'UPDATE_HISTORY_COMMENT', id: entry.id, comment: editComment }); setEditingId(null); }}
                        className="p-1 text-green-500 hover:bg-secondary rounded">
                        <Check className="w-3 h-3" />
                      </button>
                      <button onClick={() => setEditingId(null)} className="p-1 text-muted-foreground hover:bg-secondary rounded">
                        <X className="w-3 h-3" />
                      </button>
                    </div>
                  ) : (
                    <span className="text-xs text-muted-foreground line-clamp-1 max-w-48">{entry.comment || '—'}</span>
                  )}
                </td>
                <td className="px-3 py-2.5">
                  {editingId !== entry.id && (
                    <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                      <button
                        data-testid={`button-edit-comment-${entry.id}`}
                        onClick={() => { setEditingId(entry.id); setEditComment(entry.comment); }}
                        className="p-1 rounded text-muted-foreground hover:bg-secondary hover:text-foreground transition-colors"
                      >
                        <Edit2 className="w-3 h-3" />
                      </button>
                      <button
                        data-testid={`button-delete-entry-${entry.id}`}
                        onClick={() => {
                          dispatch({ type: 'DELETE_HISTORY', id: entry.id });
                          toast.success('Запись удалена');
                        }}
                        className="p-1 rounded text-muted-foreground hover:bg-destructive/10 hover:text-destructive transition-colors"
                      >
                        <Trash2 className="w-3 h-3" />
                      </button>
                    </div>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        {filtered.length > 0 && (
          <div className="flex items-center justify-end gap-6 px-4 py-2.5 border-t border-border bg-secondary/20">
            <span className="text-xs text-muted-foreground">Итого за день:</span>
            <span className="text-xs font-semibold">{formatMinutes(totalDuration)}</span>
            <span className="text-xs text-muted-foreground">Округлённое:</span>
            <span className="text-xs font-semibold">{formatMinutes(totalRounded)}</span>
          </div>
        )}
      </div>
    </div>
  );
}
