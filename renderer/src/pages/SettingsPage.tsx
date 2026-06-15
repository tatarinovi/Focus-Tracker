import { useEffect, useState } from "react";
import { useApp } from "@/context/AppContext";
import { Check, RefreshCw } from "lucide-react";
import { soundToast as toast } from "@/lib/appAudio";

type Tab = 'general' | 'kanban' | 'calendar' | 'jira' | 'bitrix' | 'resonance' | 'pomodoro' | 'audio';

const ACCENT_COLORS = [
  { value: '#6366f1', label: 'Индиго' },
  { value: '#3b82f6', label: 'Синий' },
  { value: '#10b981', label: 'Зелёный' },
  { value: '#f59e0b', label: 'Янтарный' },
  { value: '#ec4899', label: 'Розовый' },
  { value: '#8b5cf6', label: 'Фиолетовый' },
];

function Toggle({ value, onChange }: { value: boolean; onChange: (v: boolean) => void }) {
  return (
    <div
      onClick={() => onChange(!value)}
      className={`w-9 h-5 rounded-full transition-colors relative cursor-pointer flex-shrink-0 ${value ? 'bg-primary' : 'bg-secondary border border-border'}`}
    >
      <div className={`absolute top-0.5 w-4 h-4 rounded-full bg-white shadow transition-transform ${value ? 'translate-x-4' : 'translate-x-0.5'}`} />
    </div>
  );
}

function InputField({ label, value, onChange, type = 'text', placeholder, disabled }: {
  label: string; value: string; onChange: (v: string) => void; type?: string; placeholder?: string; disabled?: boolean;
}) {
  return (
    <div>
      <label className="block text-xs font-medium text-muted-foreground mb-1">{label}</label>
      <input
        type={type}
        value={value}
        onChange={e => onChange(e.target.value)}
        placeholder={placeholder}
        disabled={disabled}
        className="w-full bg-input border border-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-ring disabled:opacity-60"
      />
    </div>
  );
}

function ConnectButton({ onTest }: { onTest: () => Promise<boolean> | boolean }) {
  const [testing, setTesting] = useState(false);
  const [result, setResult] = useState<'idle' | 'ok' | 'error'>('idle');

  const handleTest = async () => {
    setTesting(true);
    setResult('idle');
    try {
      const ok = await onTest();
      setResult(ok ? 'ok' : 'error');
      if (ok) toast.success('Подключение успешно');
      else toast.error('Ошибка подключения');
    } catch {
      setResult('error');
      toast.error('Ошибка подключения');
    } finally {
      setTesting(false);
    }
  };

  return (
    <button
      onClick={handleTest}
      disabled={testing}
      className="flex items-center gap-2 bg-secondary text-secondary-foreground rounded-lg px-4 py-2 text-sm hover:opacity-90 disabled:opacity-60 transition-opacity"
    >
      {testing ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : result === 'ok' ? <Check className="w-3.5 h-3.5 text-green-500" /> : <RefreshCw className="w-3.5 h-3.5" />}
      {testing ? 'Проверка...' : 'Проверить подключение'}
    </button>
  );
}

export default function SettingsPage() {
  const { state, dispatch } = useApp();
  const { settings } = state;
  const [activeTab, setActiveTab] = useState<Tab>('general');

  useEffect(() => {
    if (!window.api) return;
    let cancelled = false;
    async function hydrateDeferredSettings() {
      const config = state.config || await window.api!.loadConfig().catch((): Record<string, any> => ({}));
      const [calendarCreds, kanbanBaseUrl, jiraCreds, bitrixCreds] = await Promise.all([
        window.api!.getCalendarCredentials?.().catch(() => ({ user: '', pass: '' })),
        window.api!.getKanbanBaseUrl?.().catch(() => ''),
        window.api!.getJiraCredentials?.().catch(() => ({ pass: '' })),
        window.api!.getBitrixWebhook?.().catch(() => ({ webhook: '' })),
      ]);
      if (cancelled) return;
      const kanbanUser = config.kanban?.userInfo?.data || config.kanban?.userInfo || {};
      dispatch({ type: 'SET_CONFIG', config });
      dispatch({
        type: 'UPDATE_SETTINGS',
        settings: {
          kanban: {
            ...settings.kanban,
            apiUrl: kanbanBaseUrl || config.kanban?.apiUrl || config.kanban?.url || settings.kanban.apiUrl,
            email: config.kanban?.email || kanbanUser.email || kanbanUser.username || settings.kanban.email,
          },
          calendar: {
            ...settings.calendar,
            login: calendarCreds?.user || config.caldav_user || settings.calendar.login,
            password: calendarCreds?.pass ? '********' : (config.caldav_pass ? '********' : settings.calendar.password),
          },
          jira: {
            ...settings.jira,
            url: config.jira_url || settings.jira.url,
            login: config.jira_user || settings.jira.login,
            password: jiraCreds?.pass ? '********' : settings.jira.password,
            defaultProject: config.jira_project || settings.jira.defaultProject,
          },
          bitrix: {
            ...settings.bitrix,
            url: config.bitrix_url || settings.bitrix.url,
            webhook: bitrixCreds?.webhook ? '********' : settings.bitrix.webhook,
            connected: config.bitrix?.connected === true,
            lastChecked: config.bitrix?.lastChecked || settings.bitrix.lastChecked,
          },
        },
      });
    }
    hydrateDeferredSettings();
    return () => { cancelled = true; };
  }, []);

  const upd = async (partial: Partial<typeof settings>) => {
    dispatch({ type: 'UPDATE_SETTINGS', settings: partial });
    const next = { ...settings, ...partial };
    if (window.api) {
      const config = state.config || await window.api.loadConfig();
      const nextConfig = {
        ...config,
        accent_color: next.accentColor,
        kanban: {
          ...(config.kanban || {}),
          apiUrl: next.kanban.apiUrl,
          email: next.kanban.email,
        },
        ical_url: next.calendar.url,
        caldav_user: next.calendar.login,
        calendar_reminders: next.calendar.reminders,
        jira_url: next.jira.url,
        jira_user: next.jira.login,
        jira_project: next.jira.defaultProject,
        audio: next.audio,
        always_on_top: next.alwaysOnTop,
        resonance: {
          login: next.resonance.login,
          connected: next.resonance.connected,
          lastChecked: next.resonance.lastChecked,
        },
        bitrix: {
          connected: next.bitrix.connected,
          lastChecked: next.bitrix.lastChecked,
        },
        bitrix_url: next.bitrix.url,
      };
      await window.api.saveConfig(nextConfig);
      if (partial.alwaysOnTop !== undefined) {
        await window.api.setAlwaysOnTop(partial.alwaysOnTop);
      }
      dispatch({ type: 'SET_CONFIG', config: nextConfig });
      if (next.calendar.password && next.calendar.password !== '********') {
        await window.api.saveCalendarCredentials({ user: next.calendar.login, pass: next.calendar.password });
      }
      if (next.jira.password && next.jira.password !== '********') {
        await window.api.saveJiraCredentials({ pass: next.jira.password });
      }
      if (next.bitrix.webhook && next.bitrix.webhook !== '********') {
        await window.api.saveBitrixWebhook(next.bitrix.webhook);
      }
    }
    toast.success('Настройки сохранены');
  };

  const tabs: { key: Tab; label: string }[] = [
    { key: 'general', label: 'Общие' },
    { key: 'kanban', label: 'Kanban' },
    { key: 'calendar', label: 'Календарь' },
    { key: 'jira', label: 'Jira' },
    { key: 'bitrix', label: 'Bitrix24' },
    { key: 'resonance', label: 'Resonance' },
    { key: 'pomodoro', label: 'Pomodoro' },
    { key: 'audio', label: 'Аудио' },
  ];

  const connectKanban = async () => {
    if (!window.api || !settings.kanban.email || !settings.kanban.password) return false;
    const login = await window.api.kanbanLogin(settings.kanban.email, settings.kanban.password);
    const loginData = login?.data?.data || login?.data || login;
    const token = loginData?.token || loginData?.access_token || loginData?.auth_token;
    if (!token || login?.success === false) return false;
    const userInfo = await window.api.kanbanGetUserInfo(token);
    if (userInfo?.success === false) return false;
    const userData = userInfo?.data?.data || userInfo?.data || userInfo;
    const config = state.config || await window.api.loadConfig();
    const nextConfig = {
      ...config,
      kanban: {
        ...(config.kanban || {}),
        token,
        userInfo: userData,
        apiUrl: settings.kanban.apiUrl,
        email: settings.kanban.email,
      },
    };
    await window.api.saveConfig(nextConfig);
    dispatch({ type: 'SET_CONFIG', config: nextConfig });
    dispatch({
      type: 'UPDATE_SETTINGS',
      settings: { kanban: { ...settings.kanban, password: '' } },
    });
    return true;
  };

  const connectBitrix = async () => {
    if (!window.api || !settings.bitrix.url) return false;
    if (settings.bitrix.webhook && settings.bitrix.webhook !== '********') {
      await window.api.saveBitrixWebhook(settings.bitrix.webhook);
    }
    const res = await window.api.bitrixTestConnection();
    if (res?.success === false && res?.error_code !== 'EXPIRED') return false;
    const checkedAt = new Date().toISOString();
    const config = state.config || await window.api.loadConfig();
    const nextConfig = {
      ...config,
      bitrix_url: settings.bitrix.url,
      bitrix: {
        connected: true,
        lastChecked: checkedAt,
      },
    };
    await window.api.saveConfig(nextConfig);
    dispatch({ type: 'SET_CONFIG', config: nextConfig });
    dispatch({
      type: 'UPDATE_SETTINGS',
      settings: {
        bitrix: {
          ...settings.bitrix,
          webhook: settings.bitrix.webhook === '********' ? '********' : '',
          connected: true,
          lastChecked: checkedAt,
        },
      },
    });
    return true;
  };

  const connectResonance = async () => {
    if (!settings.resonance.login || !settings.resonance.password) return false;
    const checkedAt = new Date().toISOString();
    const config = state.config || (window.api ? await window.api.loadConfig() : {});
    const nextConfig = {
      ...config,
      resonance: {
        login: settings.resonance.login,
        connected: true,
        lastChecked: checkedAt,
      },
    };
    if (window.api) {
      await window.api.saveConfig(nextConfig);
    }
    dispatch({ type: 'SET_CONFIG', config: nextConfig });
    dispatch({
      type: 'UPDATE_SETTINGS',
      settings: {
        resonance: {
          ...settings.resonance,
          password: '',
          connected: true,
          lastChecked: checkedAt,
        },
      },
    });
    return true;
  };

  return (
    <div className="flex h-full">
      {/* Sidebar */}
      <div className="w-44 flex-shrink-0 border-r border-border p-3 space-y-0.5">
        <h1 className="text-sm font-semibold px-2 py-1 mb-2">Настройки</h1>
        {tabs.map(t => (
          <button
            key={t.key}
            data-testid={`tab-settings-${t.key}`}
            onClick={() => setActiveTab(t.key)}
            className={`w-full text-left px-2.5 py-1.5 rounded-lg text-sm transition-colors ${activeTab === t.key ? 'bg-secondary text-foreground font-medium' : 'text-muted-foreground hover:bg-secondary/50 hover:text-foreground'}`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* Content */}
      <div className="flex-1 p-6 overflow-y-auto scrollbar-thin">
        {activeTab === 'general' && (
          <div className="max-w-lg space-y-6">
            <div>
              <h2 className="text-sm font-semibold mb-3">Тема</h2>
              <div className="flex gap-2">
                {([['light', 'Светлая'], ['dark', 'Тёмная'], ['system', 'Системная']] as const).map(([v, l]) => (
                  <button
                    key={v}
                    data-testid={`button-theme-${v}`}
                    onClick={() => upd({ theme: v })}
                    className={`flex-1 py-2 rounded-lg border text-sm transition-colors ${settings.theme === v ? 'bg-primary/10 border-primary text-primary font-medium' : 'border-border text-muted-foreground hover:bg-secondary'}`}
                  >
                    {l}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <h2 className="text-sm font-semibold mb-3">Цвет акцента</h2>
              <div className="flex gap-2 flex-wrap">
                {ACCENT_COLORS.map(c => (
                  <button
                    key={c.value}
                    data-testid={`button-accent-${c.label}`}
                    onClick={() => upd({ accentColor: c.value })}
                    className="flex flex-col items-center gap-1 group"
                    title={c.label}
                  >
                    <div className="w-8 h-8 rounded-full border-2 transition-all"
                      style={{ backgroundColor: c.value, borderColor: settings.accentColor === c.value ? 'white' : 'transparent', boxShadow: settings.accentColor === c.value ? `0 0 0 2px ${c.value}` : 'none' }}
                    />
                    <span className="text-[10px] text-muted-foreground">{c.label}</span>
                  </button>
                ))}
              </div>
            </div>

            <div className="space-y-3">
              <h2 className="text-sm font-semibold">Поведение</h2>
              {[
                { label: 'Всегда поверх других окон', key: 'alwaysOnTop' as const },
                { label: 'Компактный режим по умолчанию', key: 'compactMode' as const },
                { label: 'Автозапуск при входе', key: 'autostart' as const },
              ].map(({ label, key }) => (
                <div key={key} className="flex items-center justify-between py-2 border-b border-border/50">
                  <span className="text-sm">{label}</span>
                  <Toggle value={settings[key]} onChange={v => upd({ [key]: v })} />
                </div>
              ))}
            </div>
          </div>
        )}

        {activeTab === 'kanban' && (
          <div className="max-w-lg space-y-4">
            <h2 className="text-sm font-semibold">Подключение к Kanban</h2>
            <InputField label="URL API" value={settings.kanban.apiUrl} onChange={v => dispatch({ type: 'UPDATE_SETTINGS', settings: { kanban: { ...settings.kanban, apiUrl: v } } })} placeholder="https://kanban.company.ru/api" />
            <InputField label="Email" value={settings.kanban.email} onChange={v => dispatch({ type: 'UPDATE_SETTINGS', settings: { kanban: { ...settings.kanban, email: v } } })} type="email" />
            <InputField label="Пароль" value={settings.kanban.password} onChange={v => dispatch({ type: 'UPDATE_SETTINGS', settings: { kanban: { ...settings.kanban, password: v } } })} type="password" placeholder="Введите пароль..." />
            <ConnectButton onTest={connectKanban} />
          </div>
        )}

        {activeTab === 'jira' && (
          <div className="max-w-lg space-y-4">
            <h2 className="text-sm font-semibold">Подключение к Jira</h2>
            <InputField label="URL Jira" value={settings.jira.url} onChange={v => dispatch({ type: 'UPDATE_SETTINGS', settings: { jira: { ...settings.jira, url: v } } })} placeholder="https://jira.company.ru" />
            <InputField label="Логин" value={settings.jira.login} onChange={v => dispatch({ type: 'UPDATE_SETTINGS', settings: { jira: { ...settings.jira, login: v } } })} />
            <InputField label="Пароль" value={settings.jira.password || ''} onChange={v => dispatch({ type: 'UPDATE_SETTINGS', settings: { jira: { ...settings.jira, password: v } } })} type="password" placeholder="Введите пароль..." />
            <InputField label="Проект по умолчанию" value={settings.jira.defaultProject} onChange={v => dispatch({ type: 'UPDATE_SETTINGS', settings: { jira: { ...settings.jira, defaultProject: v.toUpperCase() } } })} placeholder="PROJ" />
            <ConnectButton onTest={async () => {
              if (!window.api || !settings.jira.url || !settings.jira.login) return false;
              if (settings.jira.password && settings.jira.password !== '********') {
                await window.api.saveJiraCredentials({ pass: settings.jira.password });
              }
              const res = await window.api.getJiraFields();
              return Boolean(res?.success);
            }} />
          </div>
        )}

        {activeTab === 'bitrix' && (
          <div className="max-w-lg space-y-4">
            <h2 className="text-sm font-semibold">Подключение к Bitrix24</h2>
            <InputField
              label="URL портала"
              value={settings.bitrix.url}
              onChange={v => dispatch({ type: 'UPDATE_SETTINGS', settings: { bitrix: { ...settings.bitrix, url: v, connected: false } } })}
              placeholder="https://company.bitrix24.ru"
            />
            <InputField
              label="Webhook"
              value={settings.bitrix.webhook}
              onChange={v => dispatch({ type: 'UPDATE_SETTINGS', settings: { bitrix: { ...settings.bitrix, webhook: v, connected: false } } })}
              type="password"
              placeholder="1/xxxxxxxxxxxxxxxx"
            />
            <p className="text-xs text-muted-foreground -mt-2">
              Входящий webhook с правами timeman: часть пути после /rest/ (например, 1/abc123).
            </p>
            <div className="rounded-lg border border-border px-3 py-2 text-xs text-muted-foreground space-y-1">
              <div className="flex items-center justify-between">
                <span>Статус</span>
                <span className={settings.bitrix.connected ? 'text-green-500 font-medium' : ''}>
                  {settings.bitrix.connected ? 'Подключено' : 'Не подключено'}
                </span>
              </div>
              {settings.bitrix.lastChecked && (
                <div>Проверено: {new Date(settings.bitrix.lastChecked).toLocaleString('ru-RU')}</div>
              )}
            </div>
            <ConnectButton onTest={connectBitrix} />
          </div>
        )}

        {activeTab === 'calendar' && (
          <div className="max-w-lg space-y-4">
            <h2 className="text-sm font-semibold">Подключение к CalDAV</h2>
            <InputField label="URL CalDAV" value={settings.calendar.url} onChange={v => dispatch({ type: 'UPDATE_SETTINGS', settings: { calendar: { ...settings.calendar, url: v } } })} placeholder="https://caldav.company.ru" />
            <InputField label="Логин" value={settings.calendar.login} onChange={v => dispatch({ type: 'UPDATE_SETTINGS', settings: { calendar: { ...settings.calendar, login: v } } })} />
            <InputField label="Пароль" value={settings.calendar.password} onChange={v => dispatch({ type: 'UPDATE_SETTINGS', settings: { calendar: { ...settings.calendar, password: v } } })} type="password" />
            <div className="flex items-center justify-between py-2">
              <span className="text-sm">Напоминания о встречах</span>
              <Toggle value={settings.calendar.reminders} onChange={v => dispatch({ type: 'UPDATE_SETTINGS', settings: { calendar: { ...settings.calendar, reminders: v } } })} />
            </div>
            <ConnectButton onTest={async () => {
              if (!window.api || !settings.calendar.url) return false;
              if (settings.calendar.login && settings.calendar.password && settings.calendar.password !== '********') {
                await window.api.saveCalendarCredentials({
                  user: settings.calendar.login,
                  pass: settings.calendar.password,
                });
              } else {
                const config = state.config || await window.api.loadConfig();
                const nextConfig = {
                  ...config,
                  ical_url: settings.calendar.url,
                  caldav_user: settings.calendar.login,
                  calendar_reminders: settings.calendar.reminders,
                };
                await window.api.saveConfig(nextConfig);
                dispatch({ type: 'SET_CONFIG', config: nextConfig });
              }
              const res = await window.api.fetchCalendarCalDav(settings.calendar.url);
              return Boolean(res?.success);
            }} />
          </div>
        )}

        {activeTab === 'resonance' && (
          <div className="max-w-lg space-y-4">
            <h2 className="text-sm font-semibold">Подключение к Resonance</h2>
            <InputField label="Логин" value={settings.resonance.login} onChange={v => dispatch({ type: 'UPDATE_SETTINGS', settings: { resonance: { ...settings.resonance, login: v, connected: false } } })} />
            <InputField label="Пароль" value={settings.resonance.password} onChange={v => dispatch({ type: 'UPDATE_SETTINGS', settings: { resonance: { ...settings.resonance, password: v, connected: false } } })} type="password" />
            <ConnectButton onTest={connectResonance} />
            <div className="rounded-lg border border-border bg-card p-3 text-xs">
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">Статус подключения</span>
                <span className={`font-medium ${settings.resonance.connected ? 'text-green-500' : 'text-muted-foreground'}`}>
                  {settings.resonance.connected ? 'Подключено' : 'Не подключено'}
                </span>
              </div>
              {settings.resonance.lastChecked && (
                <div className="mt-2 text-muted-foreground">
                  Проверено: {new Date(settings.resonance.lastChecked).toLocaleString('ru-RU')}
                </div>
              )}
            </div>
          </div>
        )}

        {activeTab === 'pomodoro' && (
          <div className="max-w-lg space-y-5">
            <h2 className="text-sm font-semibold">Настройки Pomodoro</h2>
            <div>
              <label className="block text-xs font-medium text-muted-foreground mb-2">
                Время фокуса: {settings.pomodoro.focusDuration} минут
              </label>
              <input
                type="range" min={5} max={60} step={5}
                value={settings.pomodoro.focusDuration}
                onChange={e => dispatch({ type: 'UPDATE_SETTINGS', settings: { pomodoro: { ...settings.pomodoro, focusDuration: Number(e.target.value) } } })}
                className="w-full accent-primary"
              />
              <div className="flex justify-between text-[10px] text-muted-foreground mt-0.5">
                <span>5м</span><span>60м</span>
              </div>
            </div>
            <div>
              <label className="block text-xs font-medium text-muted-foreground mb-2">
                Время перерыва: {settings.pomodoro.breakDuration} минут
              </label>
              <input
                type="range" min={1} max={30} step={1}
                value={settings.pomodoro.breakDuration}
                onChange={e => dispatch({ type: 'UPDATE_SETTINGS', settings: { pomodoro: { ...settings.pomodoro, breakDuration: Number(e.target.value) } } })}
                className="w-full accent-primary"
              />
              <div className="flex justify-between text-[10px] text-muted-foreground mt-0.5">
                <span>1м</span><span>30м</span>
              </div>
            </div>
            <div className="space-y-3 pt-2 border-t border-border">
              <div className="flex items-center justify-between">
                <span className="text-sm">Звуковое уведомление</span>
                <Toggle value={settings.pomodoro.sound} onChange={v => dispatch({ type: 'UPDATE_SETTINGS', settings: { pomodoro: { ...settings.pomodoro, sound: v } } })} />
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm">Визуальная вспышка</span>
                <Toggle value={settings.pomodoro.visualFlash} onChange={v => dispatch({ type: 'UPDATE_SETTINGS', settings: { pomodoro: { ...settings.pomodoro, visualFlash: v } } })} />
              </div>
            </div>
          </div>
        )}

        {activeTab === 'audio' && (
          <div className="max-w-lg space-y-5">
            <h2 className="text-sm font-semibold">Аудио</h2>
            <div>
              <label className="block text-xs font-medium text-muted-foreground mb-2">
                Громкость уведомлений: {settings.audio.volume}%
              </label>
              <input
                data-testid="slider-audio-volume"
                type="range"
                min={0}
                max={100}
                step={5}
                value={settings.audio.volume}
                onChange={e => dispatch({ type: 'UPDATE_SETTINGS', settings: { audio: { ...settings.audio, volume: Number(e.target.value) } } })}
                className="w-full accent-primary"
              />
              <div className="flex justify-between text-[10px] text-muted-foreground mt-0.5">
                <span>0%</span><span>100%</span>
              </div>
            </div>

            <p className="text-xs text-muted-foreground">
              Звуки приложения зашиты и выбираются автоматически для каждого события.
            </p>
          </div>
        )}

        {activeTab !== 'general' && (
          <div className="max-w-lg mt-6 pt-4 border-t border-border">
            <button
              onClick={() => upd({})}
              className="bg-primary text-primary-foreground rounded-lg px-4 py-2 text-sm font-medium hover:opacity-90 transition-opacity"
            >
              Сохранить настройки
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
