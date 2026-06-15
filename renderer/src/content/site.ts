export const CURRENT_VERSION = "1.4.0";

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
    version: "1.4.0",
    date: "2026-06-15",
    changes: [
      "Command Palette — глобальная палитра команд (Ctrl+Shift+Space)",
      "Fuzzy-поиск по командам с категориями: Таймер, Pomodoro, Bitrix24, Навигация",
      "Навигация стрелками, выбор Enter, закрытие Esc",
      "Отдельное Tauri-окно (always-on-top, frameless)",
      "Авто-запуск приложения при старте системы",
    ],
  },
  {
    version: "1.3.0",
    date: "2026-06-15",
    changes: [
      "Bitrix24: виджет рабочего дня — начало, перерыв, продолжение и завершение через timeman API",
      "При запуске синхронизируется статус timeman.status; незакрытый вчерашний день (EXPIRED) — ошибка со ссылкой на портал",
      "Норма перерыва 1 ч только в приложении; превышение показывается как «+N мин сверх нормы»",
      "Блокировка закрытия приложения, пока рабочий день не завершён",
      "Настройки: вкладка Bitrix24 (URL портала, входящий webhook)",
      "Экран завершённого дня: время окончания, отработано и перерыв за день",
    ],
  },
  {
    version: "1.2.5",
    date: "2026-06-15",
    changes: [
      "Главная: карточка «Стрекано задач» показывает уникальные задачи с записью времени за сегодня",
      "Главная: «Завершено сегодня» считает задачи, завершённые через приложение (кнопка, смена статуса, переключение)",
      "Ближайшие созвоны на главной и в календаре обновляются каждую минуту — прошедшие события убираются из списка",
      "Блок «В фокусе» показывает прелоадер при первой загрузке задач из Kanban",
      "Уведомления: фильтр по типу с мультивыбором и кнопкой сброса",
      "Календарь: RSVP берётся из PARTSTAT участников, сохранение ответа пишет статус в верхнем регистре",
      "Календарь: распознавание ссылок Переговорка (peregovorka.mos.ru)",
      "Полосы прокрутки приведены к единому виду во всём приложении",
      "Kanban: скорректированы ширины колонок в табличном режиме",
      "Детали задачи: название проекта больше не обрезается",
      "Сайдбар: убран дублирующий индикатор таймера (остался в верхней панели)",
    ],
  },
  {
    version: "1.2.4",
    date: "2026-06-15",
    changes: [
      "Kanban: фильтры свёрнуты в одну кнопку, список задач сортируется по дедлайну, новым и решённым",
      "Детали задачи вынесены в общую панель — клик по задаче в «В фокусе» открывает её, ID ведёт в Kanban",
      "Календарь: исправлен подсчёт участников созвона и распознавание ссылок Телемост (включая telemost.360.yandex.ru)",
      "Кнопка «Подключиться» показывается только при наличии ссылки на видеовстречу, а не на страницу события",
      "Главная: проект задачи в «В фокусе» показывается в подсказке без скачка вёрстки строки",
    ],
  },
  {
    version: "1.2.3",
    date: "2026-06-15",
    changes: [
      "Kanban: фильтры по проекту, приоритету и статусу переведены на мультивыбор — можно отметить несколько значений сразу",
      "Фильтры Kanban оформлены в едином стиле приложения для светлой и тёмной темы",
      "Добавлена кнопка «Сбросить» для быстрого сброса всех фильтров на доске",
      "Полосы прокрутки приведены к общему виду приложения в обеих темах",
    ],
  },
  {
    version: "1.2.2",
    date: "2026-06-15",
    changes: [
      "Kanban: статусы и приоритеты теперь показываются так же, как во внешней системе — «В работе», «Высокий» и т.д.",
      "Дедлайны, оценка и потраченное время больше не пропадают при автообновлении списка задач",
      "Закреплённые задачи сохраняются между перезапусками приложения",
      "Исправлено определение супер-задач и подпись «Focus Tracker» при записи времени в Kanban",
      "Новые задачи подгружают детали в фоне; остальной список не перегружается лишними запросами",
    ],
  },
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