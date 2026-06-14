import { useApp } from "@/context/AppContext";
import { RotateCcw, SkipForward, Play, Pause } from "lucide-react";

export default function PomodoroPage() {
  const { state, dispatch } = useApp();
  const { pomodoro } = state;

  const total = pomodoro.phase === 'focus' ? pomodoro.focusDuration * 60 : pomodoro.breakDuration * 60;
  const progress = total > 0 ? (total - pomodoro.remaining) / total : 0;
  const size = 220;
  const radius = 90;
  const circumference = 2 * Math.PI * radius;
  const strokeDash = progress * circumference;

  const mm = String(Math.floor(pomodoro.remaining / 60)).padStart(2, '0');
  const ss = String(pomodoro.remaining % 60).padStart(2, '0');

  const phaseName = pomodoro.phase === 'focus' ? 'Фокус' : 'Перерыв';
  const phaseColor = pomodoro.phase === 'focus' ? 'hsl(var(--primary))' : '#10b981';

  return (
    <div className="p-6 max-w-2xl mx-auto">
      <h1 className="text-lg font-semibold mb-6">Pomodoro</h1>
      <div className="grid grid-cols-3 gap-6">
        <div className="col-span-2 flex flex-col items-center gap-6">
          <div className="bg-card border border-border rounded-2xl p-10 flex flex-col items-center gap-4 w-full">
            <div className="relative" style={{ width: size, height: size }}>
              <svg width={size} height={size} className="-rotate-90" viewBox={`0 0 ${size} ${size}`}>
                <circle cx={size/2} cy={size/2} r={radius} fill="none" stroke="hsl(var(--border))" strokeWidth="8" />
                <circle
                  cx={size/2} cy={size/2} r={radius} fill="none"
                  stroke={phaseColor} strokeWidth="8"
                  strokeDasharray={`${strokeDash} ${circumference}`}
                  strokeLinecap="round"
                  className="transition-all duration-1000"
                />
              </svg>
              <div className="absolute inset-0 flex flex-col items-center justify-center">
                <span className="text-sm font-medium mb-1" style={{ color: phaseColor }}>{phaseName}</span>
                <span className="font-mono text-5xl font-bold tracking-wider">{mm}:{ss}</span>
                <span className="text-xs text-muted-foreground mt-1">Сессия {pomodoro.session}</span>
              </div>
            </div>

            <div className="flex items-center gap-3">
              <button
                data-testid="button-pomodoro-reset"
                onClick={() => dispatch({ type: 'RESET_POMODORO' })}
                className="p-3 rounded-xl bg-secondary text-secondary-foreground hover:opacity-90 transition-opacity"
                title="Сброс"
              >
                <RotateCcw className="w-5 h-5" />
              </button>

              <button
                data-testid="button-pomodoro-toggle"
                onClick={() => dispatch({ type: pomodoro.isRunning ? 'PAUSE_POMODORO' : 'START_POMODORO' })}
                className="px-8 py-3 rounded-xl font-semibold text-sm flex items-center gap-2 transition-opacity hover:opacity-90"
                style={{ backgroundColor: phaseColor, color: 'white' }}
              >
                {pomodoro.isRunning ? <><Pause className="w-4 h-4" /> Пауза</> : <><Play className="w-4 h-4" /> Старт</>}
              </button>

              <button
                data-testid="button-pomodoro-skip"
                onClick={() => dispatch({ type: 'SKIP_POMODORO' })}
                className="p-3 rounded-xl bg-secondary text-secondary-foreground hover:opacity-90 transition-opacity"
                title="Пропустить"
              >
                <SkipForward className="w-5 h-5" />
              </button>
            </div>

            <div className="flex gap-2">
              {Array.from({ length: 4 }, (_, i) => (
                <div key={i} className={`w-3 h-3 rounded-full transition-colors ${i < pomodoro.session ? '' : 'border border-border'}`}
                  style={{ backgroundColor: i < pomodoro.session ? phaseColor : 'transparent' }} />
              ))}
            </div>
          </div>
        </div>

        <div className="space-y-4">
          <div className="bg-card border border-border rounded-xl p-4 space-y-4">
            <h3 className="text-sm font-semibold">Настройки</h3>
            <div>
              <label className="text-xs text-muted-foreground block mb-2">
                Фокус: {pomodoro.focusDuration} мин
              </label>
              <input
                data-testid="slider-pomodoro-focus"
                type="range" min={5} max={60} step={5}
                value={pomodoro.focusDuration}
                onChange={e => dispatch({ type: 'SET_POMODORO_FOCUS_DURATION', minutes: Number(e.target.value) })}
                className="w-full accent-primary"
              />
              <div className="flex justify-between text-[10px] text-muted-foreground">
                <span>5м</span><span>60м</span>
              </div>
            </div>
            <div>
              <label className="text-xs text-muted-foreground block mb-2">
                Перерыв: {pomodoro.breakDuration} мин
              </label>
              <input
                data-testid="slider-pomodoro-break"
                type="range" min={1} max={30} step={1}
                value={pomodoro.breakDuration}
                onChange={e => dispatch({ type: 'SET_POMODORO_BREAK_DURATION', minutes: Number(e.target.value) })}
                className="w-full accent-primary"
              />
              <div className="flex justify-between text-[10px] text-muted-foreground">
                <span>1м</span><span>30м</span>
              </div>
            </div>

            <div className="space-y-2 pt-2 border-t border-border">
              <label className="flex items-center justify-between cursor-pointer">
                <span className="text-xs">Звук</span>
                <div
                  onClick={() => dispatch({ type: 'UPDATE_SETTINGS', settings: { pomodoro: { ...state.settings.pomodoro, sound: !state.settings.pomodoro.sound } } })}
                  className={`w-9 h-5 rounded-full transition-colors relative cursor-pointer ${state.settings.pomodoro.sound ? 'bg-primary' : 'bg-secondary'}`}
                >
                  <div className={`absolute top-0.5 w-4 h-4 rounded-full bg-white shadow transition-transform ${state.settings.pomodoro.sound ? 'translate-x-4' : 'translate-x-0.5'}`} />
                </div>
              </label>
              <label className="flex items-center justify-between cursor-pointer">
                <span className="text-xs">Вспышка</span>
                <div
                  onClick={() => dispatch({ type: 'UPDATE_SETTINGS', settings: { pomodoro: { ...state.settings.pomodoro, visualFlash: !state.settings.pomodoro.visualFlash } } })}
                  className={`w-9 h-5 rounded-full transition-colors relative cursor-pointer ${state.settings.pomodoro.visualFlash ? 'bg-primary' : 'bg-secondary'}`}
                >
                  <div className={`absolute top-0.5 w-4 h-4 rounded-full bg-white shadow transition-transform ${state.settings.pomodoro.visualFlash ? 'translate-x-4' : 'translate-x-0.5'}`} />
                </div>
              </label>
            </div>
          </div>

          <div className="bg-card border border-border rounded-xl p-4">
            <h3 className="text-xs font-semibold text-muted-foreground mb-3">Как работает Pomodoro</h3>
            <ol className="space-y-2 text-xs text-muted-foreground">
              <li className="flex gap-2"><span className="text-primary font-bold">1.</span> Выберите задачу</li>
              <li className="flex gap-2"><span className="text-primary font-bold">2.</span> Запустите таймер на {pomodoro.focusDuration} минут</li>
              <li className="flex gap-2"><span className="text-primary font-bold">3.</span> Работайте без отвлечений</li>
              <li className="flex gap-2"><span className="text-primary font-bold">4.</span> Сделайте перерыв {pomodoro.breakDuration} минут</li>
              <li className="flex gap-2"><span className="text-primary font-bold">5.</span> После 4 сессий — длинный перерыв</li>
            </ol>
          </div>
        </div>
      </div>
    </div>
  );
}
