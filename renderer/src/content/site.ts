export const GITHUB_URL = "https://github.com/tatarinovi/Focus-Tracker";
export const RELEASES_URL = "https://github.com/tatarinovi/Focus-Tracker/releases";
export const ISSUES_URL = "https://github.com/tatarinovi/Focus-Tracker/issues";
export const LICENSE = "ISC";

export const DESCRIPTION =
  "Десктопное Tauri-приложение для персонального тайм-трекинга с интеграциями в Kanban, Яндекс Календарь, Jira и Telegram.";

export const FEATURES = [
  {
    icon: "Timer",
    title: "Time Tracking",
    description:
      "Таймер задач с паузой, продолжением и остановкой. Автоматическая запись времени в Kanban. Компактный режим — окно 180×130 px.",
  },
  {
    icon: "Circle",
    title: "Pomodoro",
    description:
      "25 минут работы → 5 минут перерыва. Прогресс-бар, звуковое оповещение и визуальная вспышка экрана.",
  },
  {
    icon: "LayoutGrid",
    title: "Kanban",
    description:
      "Два режима: список и доска. Фильтрация, закрепление задач, автоматическая смена статуса, выделение горящих задач.",
  },
  {
    icon: "Calendar",
    title: "Calendar",
    description:
      "Подключение через CalDAV. Парсинг .ics, RSVP, распознавание ссылок на Telemost, Zoom, Meet, Teams.",
  },
  {
    icon: "Ticket",
    title: "Jira",
    description:
      "Глобальный хоткей для создания задачи. Шаблоны, drag-and-drop вложений, Basic Auth.",
  },
  {
    icon: "FileText",
    title: "Notes",
    description:
      "Встроенный блокнот с Markdown-редактором. Тулбар, горячие клавиши, интерактивные чек-боксы.",
  },
  {
    icon: "Coffee",
    title: "Lunch Tracking",
    description:
      "Режим обеда с таймером и Telegram-уведомлениями. Сохранение и восстановление задачи после перерыва.",
  },
  {
    icon: "Clock",
    title: "History",
    description:
      "Список задач за день с таймлайном. Суммарный итог, экспорт в JSON.",
  },
];

export const TECH_STACK = [
  { name: "Tauri", detail: "2.x" },
  { name: "Rust", detail: "Backend" },
  { name: "React", detail: "19" },
  { name: "TypeScript", detail: "5.9" },
  { name: "Vite", detail: "8" },
  { name: "Tailwind CSS", detail: "4" },
];

export const CHANGELOG = [
  {
    version: "2.0.3",
    date: "2026-06-14",
    changes: [
      "Добавлен безопасный Tauri updater с каналами stable и beta",
      "Обновления устанавливаются до открытия основного окна",
      "Перед запуском выполняются миграции локального хранилища",
    ],
  },
  {
    version: "1.4.5",
    date: "2026-05-01",
    changes: [
      "Исправлен баг с таймером при переключении вкладок",
      "Улучшена производительность Kanban при большом количестве задач",
      "Добавлена поддержка Яндекс Телемост в календаре",
    ],
  },
  {
    version: "1.4.0",
    date: "2026-04-15",
    changes: [
      "Новая функция: компактный режим",
      "Экспорт истории в CSV",
      "Улучшен редактор заметок с поддержкой таблиц",
      "Горячие клавиши для создания задач в Jira",
    ],
  },
  {
    version: "1.3.2",
    date: "2026-04-01",
    changes: [
      "Исправлена синхронизация с CalDAV",
      "Улучшены уведомления Pomodoro",
    ],
  },
];

export type Platform = "windows" | "macos" | "linux" | "unknown";

export function detectPlatform(): Platform {
  if (typeof navigator === "undefined") return "unknown";
  const ua = navigator.userAgent.toLowerCase();
  if (ua.includes("win")) return "windows";
  if (ua.includes("mac")) return "macos";
  if (ua.includes("linux")) return "linux";
  return "unknown";
}

export function getDownloadUrl(platform: Platform): string {
  if (platform === "unknown") return RELEASES_URL;
  const latest = CHANGELOG[0]?.version;
  const tag = latest ? `v${latest}` : "";
  if (platform === "windows")
    return `${RELEASES_URL}/download/${tag}/Focus-Tracker_${latest}_x64-setup.exe`;
  if (platform === "macos")
    return `${RELEASES_URL}/download/${tag}/Focus-Tracker_${latest}_universal.dmg`;
  if (platform === "linux")
    return `${RELEASES_URL}/download/${tag}/Focus-Tracker_${latest}_amd64.AppImage`;
  return RELEASES_URL;
}

export const PLATFORM_LABELS: Record<Platform, string> = {
  windows: "Windows",
  macos: "macOS",
  linux: "Linux",
  unknown: "",
};
