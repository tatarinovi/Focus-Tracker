# ⏱ Focus Tracker

Десктопное Tauri-приложение для персонального тайм-трекинга с интеграциями в Kanban, Яндекс Календарь, Jira и Telegram.

![Tauri](https://img.shields.io/badge/Tauri-2.x-24C8DB?logo=tauri&logoColor=white)
![Node.js](https://img.shields.io/badge/Node.js-20+-339933?logo=nodedotjs&logoColor=white)
![Platform](https://img.shields.io/badge/Platform-Windows%20%7C%20macOS%20%7C%20Linux-blue)
![License](https://img.shields.io/badge/License-ISC-green)

---

## Возможности

### Таймер задач
- Запуск таймера привязан к задаче из Kanban-доски
- Пауза, продолжение, остановка с обязательным комментарием
- Переключение между задачами с диалогом выбора: «Переключиться» или «Завершена»
- Автоматическая запись отработанного времени в Kanban API (округление до 15 минут)
- Compact-режим — окно 180×130 px с таймером и кнопками управления

### Помодоро
- 25 минут работы → 5 минут перерыва → сброс
- Прогресс-бар, звуковое оповещение, визуальная вспышка экрана
- Работает независимо от таймера задач

### Kanban-интеграция (devds.ru)
- Авторизация по email/пароль, хранение токена
- Два режима отображения: **список** и **доска** (5 колонок)
- Фильтрация по названию, проекту (мультиселект), приоритету
- Закрепление задач (pin) с сохранением в localStorage
- Детали задачи: описание, чек-лист, комментарии, дедлайн
- Автоматическая смена статуса при старте/завершении задачи
- Выделение горящих задач (🔥 supertask)

### Календарь (Яндекс CalDAV)
- Подключение по CalDAV URL + логин/пароль приложения
- Парсинг `.ics` файлов в Tauri/Rust-части приложения
- Периоды просмотра: Сегодня, Завтра, 3 дня, Неделя, Месяц
- Распознавание ссылок на Telemost, Zoom, Google Meet, Teams
- RSVP — изменение статуса участия прямо из приложения (PUT CalDAV)
- Боковая мини-панель с ближайшими созвонами
- Напоминания за 5 минут с отдельным окном, звуком и системным уведомлением

### Jira-интеграция
- Глобальный хоткей для создания задачи (настраиваемая комбинация клавиш)
- Отдельное окно с полями: проект, тип, заголовок, описание (Jira Markdown), приоритет, компоненты, версия, метки, подрядчик
- Автозаполнение шаблона бага при выборе типа «Bug»
- Drag-and-drop вложений, вставка из буфера (Ctrl+V)
- Basic Auth, пароль хранится через системное хранилище ключей

### Обед
- Отдельный режим таймера с автоматической отправкой в Telegram: «ушёл на обед» / «вернулся с обеда»
- Сохранение и восстановление предыдущей задачи после обеда
- Настраиваемые чаты (Chat ID + Thread ID для топиков в группах)

### История
- Список всех задач за день с временем, комментарием и длительностью
- Timeline — горизонтальная визуализация с временной осью
- Суммарный итог за день
- Экспорт: открытие файла `tasks.json` в проводнике

### Заметки
- Встроенный блокнот с Markdown-редактором и режимом просмотра
- Markdown-тулбар: жирный, курсив, зачёркнутый, код, заголовки, цитаты, списки, таблицы, чек-боксы
- Интерактивные чек-боксы в режиме просмотра
- Горячие клавиши: Ctrl+B, Ctrl+I, Ctrl+K, Ctrl+S
- Хранение — отдельные `.md` файлы в `userData/Notes/`

### Кастомизация
- Светлая и тёмная темы
- Настраиваемый акцентный цвет (color picker)
- Закрепление окна поверх других (alwaysOnTop)
- Сохранение состояния панелей между сессиями

### Автообновления
- Проверка обновлений при запуске (на сплэш-скрине) и вручную
- Каналы: Stable и Beta
- Скачивание и установка с прогресс-баром
- CI/CD: git tag → GitHub Actions → GitHub Releases → GitHub Pages updater manifests (`stable.json`, `beta.json`)

---

## Стек технологий

| Компонент | Технология |
|-----------|-----------|
| Окружение | Tauri 2.x, Rust, Node.js 20+ |
| Frontend | React, TypeScript, Vite, Tailwind CSS |
| Хранение | Локальные JSON-файлы (`tasks.json`, `config.json`) |
| Календарь | CalDAV, собственный парсер `.ics` |
| Безопасность | DOMPurify (XSS), системное хранилище ключей через `keyring` |
| Сборка | Tauri bundler (MSI/NSIS, DMG, AppImage) |
| CI/CD | GitHub Actions |

---

## Структура проекта

```
├── main.js               # Главный процесс (IPC, API, ФС, сеть)
├── preload.js             # ContextBridge (window.api)
├── renderer.js            # Точка входа фронтенда
├── index.html             # Основная верстка
├── style.css              # Стили (CSS-переменные, темы)
├── jira-create.html       # Окно создания задачи в Jira
├── reminder.html          # Окно напоминания о созвоне
├── splash.html            # Сплэш-скрин
├── src/
│   ├── state.js           # Состояние таймера и помодоро
│   ├── store.js           # Глобальный кэш (конфиг, задачи)
│   ├── utils.js           # Утилиты ($, escapeHtml, msToHMS)
│   ├── timer.js           # Логика таймера задач
│   ├── pomodoro.js        # Логика помодоро
│   ├── kanban.js          # Kanban: загрузка, фильтры, доска
│   ├── calendar.js        # Календарь: парсинг, RSVP, напоминания
│   ├── history.js         # История и timeline
│   ├── lunch.js           # Обед и Telegram-уведомления
│   ├── settings.js        # Настройки и авторизация
│   ├── about.js           # Обновления и версия
│   ├── notes.js           # Заметки (Markdown-редактор)
│   ├── notifications.js   # In-app уведомления
│   └── jira-create.js     # Логика окна Jira
├── assets/
│   ├── alarm.ogg          # Звук уведомлений
│   └── icon.ico           # Иконка приложения
├── app-secrets.example.js # Пример файла секретов
├── package.json
├── CLAUDE.md              # Инструкции для Claude (контекст разработки)
└── .github/
    └── workflows/
        └── release.yml    # CI/CD: сборка и публикация
```

---

## Быстрый старт

### Требования

- [Node.js](https://nodejs.org/) 20+
- npm

### Установка

```bash
git clone <repo-url>
cd task-tracker
npm install
```

### Настройка секретов

Создайте файл `app-secrets.js` на основе примера:

```bash
cp app-secrets.example.js app-secrets.js
```

Заполните значения:

```js
module.exports = {
  KANBAN_API_BASE_URL: 'https://your-kanban-instance.example.com',
  DEFAULT_BOT_TOKEN:   'your-telegram-bot-token',
  JIRA_URL:            'https://your-jira.example.com',
  JIRA_DEFAULT_PROJECT: 'PROJECT_KEY',
};
```

### Запуск

```bash
npm run dev

# Проверка TypeScript
npm run typecheck
```

`npm run dev` запускает Vite и Tauri в режиме разработки.

### Сборка

```bash
# Windows (MSI и NSIS setup.exe)
npm run build

# macOS (.dmg)
npm run build:mac

# Linux (.AppImage)
npm run build:linux
```

---

## Архитектура

### IPC (Inter-Process Communication)

Приложение строго разделяет процессы:

1. **Main** (`main.js`) — Node.js: файловая система, сетевые запросы, API Kanban/Jira/Telegram/CalDAV, шифрование паролей
2. **Preload** (`preload.js`) — мост через `contextBridge`, экспортирует `window.api`
3. **Renderer** (`renderer.js` + `src/*.js`) — чистый DOM, никаких `require('electron')` или `fs`

Добавление нового метода:
1. Создать обработчик `ipcMain.handle('method-name', ...)` в `main.js`
2. Добавить обёртку в `preload.js` внутри `window.api`
3. Вызвать на фронтенде: `await window.api.methodName()`

### Управление состоянием

- **`src/state.js`** — быстрые данные (таймер, помодоро)
- **`src/store.js`** — глобальный кэш (конфигурация, задачи Kanban)

### Стиль кода

- Отступы: 2 пробела
- Кавычки: одинарные (`'`)
- Точка с запятой: обязательна
- Return early для избежания вложенности
- Выравнивание импортов и переменных в колонки
- XSS: все пользовательские данные через `escapeHtml()` перед `innerHTML`

---

## CI/CD

Релизный процесс запускается при пуше тега:

```
git tag -a v1.4 -m "Changelog text"
git push origin v1.4
```

Пайплайн (`release.yml`):
1. Параллельная сборка на Windows, macOS, Linux
2. Секреты (`app-secrets.js`) создаются из GitHub Secrets
3. Tauri bundles, updater artifacts and signatures are uploaded to the GitHub Release for the current tag.
4. The workflow generates the Tauri updater manifest for the current channel and publishes it to GitHub Pages without a separate `updates` branch.
5. Generated manifests are also attached to the GitHub Release for traceability.

Updater endpoints:
- Stable: `https://tatarinovi.github.io/Focus-Tracker/updates/stable.json`
- Beta: `https://tatarinovi.github.io/Focus-Tracker/updates/beta.json`

Required release secrets:
- `TAURI_SIGNING_PRIVATE_KEY`
- `TAURI_SIGNING_PRIVATE_KEY_PASSWORD` if the key is protected with a password

Каналы обновлений:
- **Stable**: tags like `v2.0.4`
- **Beta**: tags like `v2.0.4-beta.1` and GitHub prereleases

---

## Хранение данных

Все данные хранятся локально в `app.getPath('userData')`:

| Файл | Содержимое |
|------|-----------|
| `tasks.json` | История задач (дата, время, комментарий) |
| `config.json` | Настройки, токен Kanban, чаты Telegram, CalDAV/Jira-креды |
| `Notes/*.md` | Заметки пользователя |

Пароли (CalDAV, Jira) сохраняются через системное хранилище ключей (`keyring`). Если оно недоступно, используется Base64 как функциональный fallback.

---

## Глоссарий

| Термин | Описание |
|--------|---------|
| **Kanban** | Внешняя система управления задачами (devds.ru) |
| **Compact mode** | Свёрнутый вид — только titlebar с таймером |
| **Обед (Lunch)** | Особый статус с таймером и Telegram-уведомлениями |
| **Supertask** | Горящая задача (🔥), выделена визуально |
| **CalDAV** | Протокол доступа к календарю (Яндекс) |
