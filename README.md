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

## Project Structure

```text
renderer/                  React/Vite frontend
  public/                  splash, reminder, icons and static assets
  src/                     pages, context, components and Tauri API wrappers
src-tauri/                 Rust backend, Tauri config, commands and bundle settings
  src/commands/            app commands: tasks, config, updates, storage, integrations
  capabilities/            Tauri permissions
  tauri.conf.json          windows, updater and bundle config
scripts/                   build and release helper scripts
installer/                 optional installer branding assets
app-secrets.example.js     local secret example
package.json
.github/workflows/
  release.yml              CI/CD build, release and updater manifests
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

## Architecture

### Tauri Commands

The app is split into a React/Vite frontend and a Rust/Tauri backend:

1. **Rust/Tauri** (`src-tauri/src`) handles local files, system windows, notifications, updater, storage and integrations.
2. **Frontend** (`renderer/src`) renders the React UI, pages, app state and calls Tauri commands through `window.api`.
3. **Static windows** (`renderer/public`) contain the splash screen and reminder window, wired through Tauri invoke/events.

Adding a new method:
1. Create a Tauri command in `src-tauri/src/commands/`.
2. Register the command in `src-tauri/src/lib.rs`.
3. Add a wrapper in `renderer/src/lib/tauriApi.ts`.
4. Call it from the frontend: `await window.api.methodName()`.

### State Management

- **`renderer/src/context/AppContext.tsx`** stores timer, tasks, notes, calendar and settings state.
- **`renderer/src/lib/tauriDataApi.ts`** normalizes data returned by Tauri commands.
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
- **Stable**: tags like `v1.0.0`
- **Beta**: tags like `v1.0.1-beta.1` and GitHub prereleases

---

## Хранение данных

All user data is stored locally in the Tauri app data directory (`app.path().app_data_dir()`).

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
