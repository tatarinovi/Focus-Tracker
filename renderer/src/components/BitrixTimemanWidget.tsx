import { useEffect, useRef, useState } from "react";
import {
  ChevronDown,
  Clock,
  Coffee,
  LogIn,
  LogOut,
  Play,
} from "lucide-react";
import { useApp } from "@/context/AppContext";
import type { BitrixDayPhase, BitrixSyncStatus } from "@/context/AppContext";
import { cn } from "@/lib/utils";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";

function formatClock(totalSeconds: number) {
  const h = Math.floor(totalSeconds / 3600);
  const m = Math.floor((totalSeconds % 3600) / 60);
  const s = totalSeconds % 60;
  if (h > 0) {
    return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
  }
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

function formatOverNormLabel(totalSeconds: number) {
  const minutes = Math.ceil(totalSeconds / 60);
  return `+${minutes} мин сверх нормы`;
}

function formatTime(ts: number | null) {
  if (!ts) return "—";
  const date = new Date(ts);
  return `${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}`;
}

const PHASE_META: Record<
  BitrixDayPhase,
  { label: string; short: string; dot: string; trigger: string }
> = {
  not_started: {
    label: "Рабочий день не начат",
    short: "Не начат",
    dot: "bg-muted-foreground/50",
    trigger: "border-border bg-secondary/40 text-muted-foreground hover:bg-secondary/70",
  },
  working: {
    label: "Рабочий день",
    short: "В работе",
    dot: "bg-green-500",
    trigger: "border-green-500/30 bg-green-500/10 text-green-700 dark:text-green-400 hover:bg-green-500/15",
  },
  break: {
    label: "Перерыв",
    short: "Перерыв",
    dot: "bg-amber-500",
    trigger: "border-amber-500/35 bg-amber-500/10 text-amber-700 dark:text-amber-400 hover:bg-amber-500/15",
  },
  finished: {
    label: "Рабочий день завершён",
    short: "Завершён",
    dot: "bg-muted-foreground/40",
    trigger: "border-border bg-muted/30 text-muted-foreground",
  },
};

function BitrixLogo({ className }: { className?: string }) {
  return (
    <div
      className={cn(
        "flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg bg-[#2FC6F6] text-[11px] font-bold text-white shadow-sm",
        className,
      )}
    >
      b24
    </div>
  );
}

function syncLabel(status: BitrixSyncStatus) {
  if (status === "syncing") return "Синхронизация…";
  if (status === "error") return "Ошибка";
  if (status === "online") return "Онлайн";
  return "Офлайн";
}

function ActionRow({
  icon: Icon,
  title,
  hint,
  onClick,
  disabled,
  testId,
  tone = "default",
}: {
  icon: typeof Play;
  title: string;
  hint?: string;
  onClick: () => void;
  disabled?: boolean;
  testId: string;
  tone?: "default" | "danger" | "accent";
}) {
  return (
    <button
      type="button"
      data-testid={testId}
      onClick={onClick}
      disabled={disabled}
      className={cn(
        "flex w-full items-center gap-3 rounded-lg border px-3 py-2.5 text-left transition-colors disabled:opacity-50",
        tone === "danger" && "border-red-500/20 hover:bg-red-500/5",
        tone === "accent" && "border-amber-500/25 hover:bg-amber-500/5",
        tone === "default" && "border-border hover:bg-secondary/60",
      )}
    >
      <span
        className={cn(
          "flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-md",
          tone === "danger" && "bg-red-500/10 text-red-500",
          tone === "accent" && "bg-amber-500/10 text-amber-600 dark:text-amber-400",
          tone === "default" && "bg-primary/10 text-primary",
        )}
      >
        <Icon className="h-4 w-4" />
      </span>
      <span className="min-w-0 flex-1">
        <span
          className={cn(
            "block text-sm font-medium",
            tone === "danger" && "text-red-500",
          )}
        >
          {title}
        </span>
        {hint && <span className="block text-xs text-muted-foreground">{hint}</span>}
      </span>
    </button>
  );
}

function TimemanProgressBar({
  progress,
  tooltip,
  variant = "break",
  overLimit = false,
}: {
  progress: number;
  tooltip: string;
  variant?: "work" | "break";
  overLimit?: boolean;
}) {
  const width = Math.min(100, progress);
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <div
          className="h-2 w-full cursor-default overflow-hidden rounded-full bg-secondary"
          tabIndex={0}
          aria-label={tooltip}
        >
          <div
            className={cn(
              "h-full rounded-full transition-all",
              variant === "work" && "bg-green-500",
              variant === "break" && !overLimit && "bg-amber-500",
              variant === "break" && overLimit && "bg-red-500/80",
            )}
            style={{ width: `${width}%` }}
          />
        </div>
      </TooltipTrigger>
      <TooltipContent side="bottom" className="text-xs">
        {tooltip}
      </TooltipContent>
    </Tooltip>
  );
}

export function BitrixTimemanWidget() {
  const {
    state,
    bitrixStartDay,
    bitrixStartBreak,
    bitrixResumeWork,
    bitrixEndDay,
  } = useApp();
  const { bitrixTimeman } = state;
  const [open, setOpen] = useState(false);
  const [pending, setPending] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  const actionsDisabled = pending || Boolean(bitrixTimeman.errorMessage);
  const phase = bitrixTimeman.phase;
  const meta = PHASE_META[phase];
  const breakLimitSeconds = bitrixTimeman.breakLimitMinutes * 60;
  const workDayLimitSeconds = bitrixTimeman.workDayLimitHours * 3600;
  const breakUsedTotalSeconds = bitrixTimeman.breakUsedTodaySeconds;
  const breakRemainingSeconds = Math.max(0, breakLimitSeconds - breakUsedTotalSeconds);
  const breakOverNormSeconds = Math.max(0, breakUsedTotalSeconds - breakLimitSeconds);
  const breakProgress = breakLimitSeconds
    ? (breakUsedTotalSeconds / breakLimitSeconds) * 100
    : 0;
  const breakNormTooltipSuffix = breakOverNormSeconds > 0
    ? ` · ${formatOverNormLabel(breakOverNormSeconds)}`
    : "";
  const workRemainingSeconds = Math.max(0, workDayLimitSeconds - bitrixTimeman.workElapsed);
  const workProgress = workDayLimitSeconds
    ? Math.min(100, (bitrixTimeman.workElapsed / workDayLimitSeconds) * 100)
    : 0;

  const breakRemainingLabel = breakOverNormSeconds > 0
    ? formatOverNormLabel(breakOverNormSeconds)
    : `Осталось ${formatClock(breakRemainingSeconds)}`;

  const triggerTimer =
    phase === "working"
      ? formatClock(bitrixTimeman.workElapsed)
      : phase === "break"
        ? formatClock(bitrixTimeman.breakUsedTodaySeconds)
        : null;

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: MouseEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onPointerDown);
    return () => document.removeEventListener("mousedown", onPointerDown);
  }, [open]);

  const run = async (action: () => Promise<void>) => {
    if (pending) return;
    setPending(true);
    try {
      await action();
    } finally {
      setPending(false);
    }
  };

  return (
    <div ref={rootRef} className="relative">
      <button
        type="button"
        data-testid="button-bitrix-timeman"
        onClick={() => setOpen((value) => !value)}
        disabled={pending}
        className={cn(
          "inline-flex h-8 items-center gap-1.5 rounded-lg border px-2.5 text-xs font-medium leading-none transition-colors",
          meta.trigger,
          pending && "opacity-70",
        )}
      >
        <BitrixLogo className="h-5 w-5 shrink-0 rounded-md text-[9px]" />
        <span className="shrink-0">{meta.short}</span>
        {triggerTimer ? (
          <>
            <span className="shrink-0 text-[10px] opacity-40">·</span>
            <span className="shrink-0 font-mono text-xs tabular-nums">{triggerTimer}</span>
          </>
        ) : null}
        <ChevronDown
          className={cn("ml-0.5 h-3.5 w-3.5 shrink-0 opacity-60 transition-transform", open && "rotate-180")}
        />
      </button>

      {open && (
        <div
          data-testid="bitrix-timeman-popover"
          className="absolute right-0 top-[calc(100%+8px)] z-50 w-[320px] overflow-hidden rounded-xl border border-border bg-popover text-popover-foreground shadow-2xl"
        >
          <div className="border-b border-border bg-secondary/20 px-4 py-3">
            <div className="flex items-center gap-3">
              <BitrixLogo className="shrink-0" />
              <div className="min-w-0 flex-1 leading-none">
                <div className="text-sm font-semibold">Bitrix24</div>
                <div className="mt-1 text-xs text-muted-foreground">Учёт рабочего времени</div>
              </div>
              <div className="flex shrink-0 items-center gap-1.5 text-[10px] leading-none text-muted-foreground">
                <span
                  className={cn(
                    "h-1.5 w-1.5 rounded-full",
                    bitrixTimeman.syncStatus === "online"
                      ? "bg-green-500"
                      : bitrixTimeman.syncStatus === "error"
                        ? "bg-red-500"
                        : bitrixTimeman.syncStatus === "syncing"
                          ? "bg-amber-500 animate-pulse"
                          : "bg-muted-foreground/40",
                  )}
                />
                {syncLabel(bitrixTimeman.syncStatus)}
              </div>
            </div>
          </div>

          <div className="space-y-3 px-4 py-3">
            {bitrixTimeman.errorMessage && (
              <div className="rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2.5 text-xs text-red-700 dark:text-red-300">
                <p>{bitrixTimeman.errorMessage}</p>
                {bitrixTimeman.portalUrl && (
                  <button
                    type="button"
                    className="mt-2 font-medium underline underline-offset-2 hover:opacity-80"
                    onClick={() => window.api?.openExternal(bitrixTimeman.portalUrl!)}
                  >
                    Открыть Bitrix24
                  </button>
                )}
              </div>
            )}
            <div className="rounded-lg border border-border bg-card px-3 py-2.5">
              <div className="flex min-h-7 items-center gap-2 py-0.5">
                <span className={cn("h-2 w-2 shrink-0 rounded-full", meta.dot)} />
                <span className="min-w-0 flex-1 text-sm font-medium leading-snug">
                  {meta.label}
                </span>
                {triggerTimer ? (
                  <span className="shrink-0 font-mono text-sm font-semibold tabular-nums">
                    {triggerTimer}
                  </span>
                ) : null}
                {(phase === "working" || phase === "break") && (
                  <span className="shrink-0 rounded-full bg-green-500/15 px-2 py-0.5 text-[10px] font-semibold text-green-600 dark:text-green-400">
                    Активен
                  </span>
                )}
              </div>
              {phase === "working" && bitrixTimeman.dayStartedAt && (
                <div className="mt-1.5 space-y-1.5 text-xs text-muted-foreground">
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-1.5">
                      <Clock className="h-3.5 w-3.5 shrink-0" />
                      Начат в {formatTime(bitrixTimeman.dayStartedAt)}
                    </div>
                    <span className="shrink-0">Осталось {formatClock(workRemainingSeconds)}</span>
                  </div>
                  <TimemanProgressBar
                    variant="work"
                    progress={workProgress}
                    tooltip={`Отработано ${formatClock(bitrixTimeman.workElapsed)} из ${formatClock(workDayLimitSeconds)}`}
                  />
                </div>
              )}
              {phase === "break" && (
                <div className="mt-1.5 space-y-1.5 text-xs text-muted-foreground">
                  <div className="flex justify-end">
                    <span className={cn("shrink-0", breakOverNormSeconds > 0 && "text-amber-600 dark:text-amber-400")}>
                      {breakRemainingLabel}
                    </span>
                  </div>
                  <TimemanProgressBar
                    variant="break"
                    progress={breakProgress}
                    overLimit={breakOverNormSeconds > 0}
                    tooltip={`За день ${formatClock(breakUsedTotalSeconds)} из ${formatClock(breakLimitSeconds)}${breakNormTooltipSuffix}`}
                  />
                </div>
              )}
              {phase === "finished" && (
                <div className="mt-1.5 space-y-1 text-xs text-muted-foreground">
                  <div>Завершён в {formatTime(bitrixTimeman.dayEndedAt)}</div>
                  <div>Отработано: {formatClock(bitrixTimeman.workElapsed)}</div>
                  <div
                    className={cn(
                      breakOverNormSeconds > 0 && "text-amber-600 dark:text-amber-400",
                    )}
                  >
                    Перерыв: {formatClock(bitrixTimeman.breakUsedTodaySeconds)}
                  </div>
                </div>
              )}
            </div>

            {phase === "not_started" && (
              <ActionRow
                icon={LogIn}
                title="Начать рабочий день"
                testId="button-bitrix-start-day"
                disabled={actionsDisabled}
                onClick={() => run(async () => {
                  await bitrixStartDay();
                })}
              />
            )}

            {phase === "working" && (
              <>
                <ActionRow
                  icon={Coffee}
                  title="Перерыв"
                  hint={
                    breakOverNormSeconds > 0
                      ? formatOverNormLabel(breakOverNormSeconds)
                      : undefined
                  }
                  testId="button-bitrix-start-break"
                  tone="accent"
                  disabled={actionsDisabled}
                  onClick={() => run(bitrixStartBreak)}
                />
                <ActionRow
                  icon={LogOut}
                  title="Завершить рабочий день"
                  testId="button-bitrix-end-day"
                  tone="danger"
                  disabled={actionsDisabled}
                  onClick={() => run(bitrixEndDay)}
                />
              </>
            )}

            {phase === "break" && (
              <>
                <ActionRow
                  icon={Play}
                  title="Продолжить работу"
                  testId="button-bitrix-resume-work"
                  disabled={actionsDisabled}
                  onClick={() => run(bitrixResumeWork)}
                />
                <p className="px-1 text-center text-[11px] text-muted-foreground">
                  Чтобы завершить день, сначала выйдите из перерыва
                </p>
              </>
            )}

            {phase === "finished" && (
              <p className="rounded-lg border border-dashed border-border px-3 py-2.5 text-center text-xs text-muted-foreground">
                Рабочий день закрыт. Новый день можно начать завтра.
              </p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
