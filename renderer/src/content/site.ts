export const CURRENT_VERSION = "1.2.1";

export const GITHUB_URL = "https://github.com/tatarinovi/Focus-Tracker";
export const RELEASES_URL = "https://github.com/tatarinovi/Focus-Tracker/releases";
export const ISSUES_URL = "https://github.com/tatarinovi/Focus-Tracker/issues";
export const LICENSE = "MIT";

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
    version: "1.2.1",
    date: "2026-06-15",
    changes: [
      "Исправлено отображение календаря: повторяющиеся встречи (RRULE) теперь разворачиваются и показываются на нужные дни",
      "Парсер .ics извлекает UID, RECURRENCE-ID, EXDATE, RDATE и DURATION",
    ],
  },
  {
    version: "1.2.0",
    date: "2026-06-14",
    changes: [
      "Добавлена вкладка «Jira» с формой создания задач",
      "Добавлена настройка подключения к Jira (URL, логин, пароль, проект по умолчанию)",
    ],
  },
  {
    version: "1.1.1",
    date: "2026-06-14",
    changes: [
      "Переименован раздел «Фокус» в «Главная»",
      "Добавлена защита закрытия приложения при активном таймере",
      "Напоминания о созвонах показываются поверх всех окон за 5 минут до начала и сопровождаются звуком",
      "Обновлён встроенный набор звуков и добавлена настройка общей громкости",
      "На главной странице в блоке «Ближайшие созвоны» показывается прелоудер во время загрузки календаря",
      "Уведомление о новых задачах в Kanban",
    ],
  },
  {
    version: "1.0.3",
    date: "2026-06-14",
    changes: [
      "Исправлены URL-ы файлов в манифесте автообновлений (точки вместо пробелов)",
      "Добавлено логирование автообновлений в файл",
    ],
  },
  {
    version: "1.0.2",
    date: "2026-06-14",
    changes: [
      "Исправлена совместимость ключей платформ в манифесте автообновлений",
      "Изменён брендинг приложения",
    ],
  },
  {
    version: "1.0.1",
    date: "2026-06-14",
    changes: [
      "Добавлен лендинг для GitHub Pages",
      "Исправлена работа автообновлений",
    ],
  },
  {
    version: "1.0.0",
    date: "2026-06-14",
    changes: [
      "Первый публичный релиз",
      "Таймер задач, Pomodoro, Kanban, Календарь, Jira",
      "Заметки, История, Обед, Настройки",
      "Автообновления через Tauri updater",
    ],
  },
];

export const SCREENSHOTS = [
  {
    src: "./screenshots/main-page.png",
    alt: "Главная страница",
    caption: "Главная — таймер, ближайшие созвоны, задачи",
  },
  {
    src: "./screenshots/calendar.png",
    alt: "Календарь",
    caption: "Календарь с интеграцией CalDAV",
  },
  {
    src: "./screenshots/jira.png",
    alt: "Jira",
    caption: "Создание задачи в Jira",
  },
  {
    src: "./screenshots/settings.png",
    alt: "Настройки",
    caption: "Настройки приложения",
  },
  {
    src: "./screenshots/about.png",
    alt: "О приложении",
    caption: "Информация и автообновления",
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
  const tag = `v${CURRENT_VERSION}`;
  if (platform === "windows")
    return `${RELEASES_URL}/download/${tag}/Focus-Tracker_${CURRENT_VERSION}_x64-setup.exe`;
  if (platform === "macos")
    return `${RELEASES_URL}/download/${tag}/Focus-Tracker_${CURRENT_VERSION}_universal.dmg`;
  if (platform === "linux")
    return `${RELEASES_URL}/download/${tag}/Focus-Tracker_${CURRENT_VERSION}_amd64.AppImage`;
  return RELEASES_URL;
}

export const PLATFORM_LABELS: Record<Platform, string> = {
  windows: "Windows",
  macos: "macOS",
  linux: "Linux",
  unknown: "",
};
