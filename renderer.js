'use strict';

import { state }                                              from './src/state.js';
import { store }                                              from './src/store.js';
import { $, setupCustomSelects }                              from './src/utils.js';
import { showNotification }                                   from './src/notifications.js';
import { renderHistory, initHistoryUI }                       from './src/history.js';
import { updateTaskDisplay, pauseTask, resumeTask, stopTask,
         saveCurrentTask, registerTaskChangeHandler,
         startTask }                                          from './src/timer.js';
import { updatePomoDisplay, initPomoUI }                      from './src/pomodoro.js';
import { loadSettings, isAuthorized, renderSettingsUI,
         registerLogoutHandler, initSettingsUI }              from './src/settings.js';
import { renderKanbanTasks, loadKanbanTasks, applyFilters,
         showTaskDetail, registerSwitchFromLunchHandler,
         invalidateKanbanCache, configureKanbanAutoRefresh,
         logCurrentTaskWork, closeCurrentKanbanTask,
         initKanbanUI }                                       from './src/kanban.js';
import { loadCalendarEvents, renderCalendarMiniPanel,
         initCalendarUI, initCalendarReminders,
         configureCalendarAutoRefresh, setCalendarMiniPanelContainer,
         invalidateCalendarCache } from './src/calendar.js';
import { sendTg, initLunchUI }                                from './src/lunch.js';
import { initAboutUI }                                        from './src/about.js';
import { initNotesUI }                                        from './src/notes.js';
import { unlockAudio, stopAllSounds }                                        from './src/audio.js';

// ── Compact + боковые панели ──────────────────────────────────────────────────

const BASE_W  = 600, BASE_H = 478;
const TIMER_W = 282; // ширина без tasks-column (24px padding + 258px timer)about:blank#blocked
const LEFT_W  = 270; // ширина левой панели (260px) + gap (10px)

let leftOpen  = localStorage.getItem('leftPanelOpen')  === 'true';
let tasksOpen = localStorage.getItem('tasksPanelOpen') === 'true'; // default false
let isCompact = false;

async function finalizeStopTask({ closeTask = false } = {}) {
  logCurrentTaskWork();
  if (closeTask) await closeCurrentKanbanTask();
  await stopTask();
}

function showStopTaskDialog() {
  const nameEl = $('stop-task-current-name');
  if (nameEl) nameEl.textContent = state.taskName || 'без названия';
  $('stop-task-dialog-overlay')?.classList.add('visible');
}

async function handleStopRequest({ fromCompact = false } = {}) {
  const comment = $('task-comment');
  if (comment && !comment.value.trim() && !state.isLunch) {
    if (fromCompact && isCompact) await toggleCompact();
    comment.focus();
    comment.classList.add('shake');
    setTimeout(() => comment.classList.remove('shake'), 500);
    return;
  }

  if (state.isLunch || !state.taskId) {
    await finalizeStopTask({ closeTask: false });
    return;
  }

  showStopTaskDialog();
}

// prevLeftOpen — состояние leftOpen ДО изменения (нужно для вычисления x левой панели).
// По умолчанию равно текущему leftOpen: x не сдвигается.
async function applyWindowBounds(prevLeftOpen = leftOpen) {
  const b = await window.api.getWindowBounds();
  // Позиция левого края timer-column остаётся неизменной при переключении левой панели.
  const timerLeft = b.x + (prevLeftOpen ? LEFT_W : 0);
  const w = isCompact ? 160 : ((tasksOpen ? BASE_W : TIMER_W) + (leftOpen ? LEFT_W : 0));
  const h = isCompact ? 116 : BASE_H;
  const x = timerLeft - (leftOpen ? LEFT_W : 0);
  await window.api.setWindowBounds({ x, y: b.y, width: w, height: h });
}

function setPanelVisible(panelId, btnId, open, animName = '') {
  const panel = document.getElementById(panelId);
  const btn   = document.getElementById(btnId);
  if (panel) {
    if (open) {
      panel.style.display   = 'flex';
      panel.style.animation = 'none';
      void panel.offsetWidth;                               // reflow → перезапуск анимации
      panel.style.animation = animName ? `${animName} 0.18s ease both` : '';
    } else {
      panel.style.display   = 'none';
      panel.style.animation = '';
    }
  }
  if (btn) btn.classList.toggle('active', open);
}

async function toggleCompact() {
  isCompact = !isCompact;
  document.body.classList.toggle('compact', isCompact);
  const btn = $('btn-compact');
  if (btn) {
    btn.dataset.state = isCompact ? 'expand' : 'compact';
    btn.title = isCompact ? 'Развернуть' : 'Свернуть';
    btn.setAttribute('aria-label', btn.title);
  }
  if (btn) { btn.textContent = isCompact ? '□' : '▽'; btn.title = isCompact ? 'Развернуть' : 'Свернуть'; }
  if (btn) {
    btn.title = isCompact ? 'Развернуть' : 'Свернуть';
    btn.setAttribute('aria-label', btn.title);
  }
  await applyWindowBounds();
}

// Эмодзи-вкладки только когда окно совсем узкое (нет ни задач, ни левой панели)
function updateNarrowMode() {
  document.body.classList.toggle('tasks-hidden', !tasksOpen && !leftOpen);
}

async function toggleLeftPanel() {
  const prevLeft = leftOpen;
  leftOpen = !leftOpen;
  localStorage.setItem('leftPanelOpen', leftOpen);
  setPanelVisible('side-panel-left', 'btn-left-panel', leftOpen, 'panel-in-left');
  updateNarrowMode();
  await applyWindowBounds(prevLeft); // передаём старое состояние → таймер-колонка не сдвигается
  if (leftOpen) {
    const el = document.getElementById('side-panel-left-content');
    setCalendarMiniPanelContainer(el);
    el.innerHTML = '<div class="side-calendar-loading"><div class="kanban-spinner sm"></div></div>';
    await loadCalendarEvents();
    renderCalendarMiniPanel(el);
  } else {
    setCalendarMiniPanelContainer(null);
  }
}

async function toggleTasksPanel() {
  tasksOpen = !tasksOpen;
  localStorage.setItem('tasksPanelOpen', tasksOpen);
  const tasksCol = document.querySelector('.tasks-column');
  if (tasksCol) {
    if (tasksOpen) {
      tasksCol.style.display   = 'flex';
      tasksCol.style.animation = 'none';
      void tasksCol.offsetWidth;                            // reflow → перезапуск анимации
      tasksCol.style.animation = 'panel-in-right 0.18s ease both';
    } else {
      tasksCol.style.display   = 'none';
      tasksCol.style.animation = '';
    }
  }
  updateNarrowMode();
  $('btn-right-panel')?.classList.toggle('active', tasksOpen);
  await applyWindowBounds();
}

async function initializeApp() {
  const unlockAudioOnce = () => {
    unlockAudio().catch(() => {});
    window.removeEventListener('pointerdown', unlockAudioOnce);
    window.removeEventListener('keydown', unlockAudioOnce);
  };
  window.addEventListener('pointerdown', unlockAudioOnce, { once: true });
  window.addEventListener('keydown', unlockAudioOnce, { once: true });
  // Анимация вспышки помодоро
  const s = document.createElement('style');
  s.textContent = `@keyframes fadeFlash { from{opacity:1} to{opacity:0} }`;
  document.head.appendChild(s);

  // ── Связывание модулей через колбэки ──────────────────────────────────────

  // Обновляем Kanban при паузе/возобновлении задачи
  registerTaskChangeHandler(() => {
    if (store.allKanbanTasks.length) applyFilters();
  });

  // После выхода из Kanban в настройках — сбрасываем список задач
  registerLogoutHandler(() => renderKanbanTasks(null));

  // При переключении задачи прямо из обеда — отправляем lunchback
  registerSwitchFromLunchHandler(async () => {
    if (store.cfg?.send_lunch_message !== false) await sendTg('lunchback');
    showNotification('👋 Добро пожаловать обратно!', 'Хорошего продуктивного дня!');
  });

  // ── Инициализация UI модулей ──────────────────────────────────────────────
  initPomoUI();
  initHistoryUI();
  initCalendarUI();
  initCalendarReminders();
  initSettingsUI();
  initKanbanUI();
  initLunchUI();
  initNotesUI();
  setupCustomSelects();

  // ── Пауза / Продолжить ────────────────────────────────────────────────────
  $('btn-pause')?.addEventListener('click', () => {
    if (state.taskRunning) pauseTask(); else resumeTask();
  });

  // ── Синхронизация комментария ─────────────────────────────────────────────
  $('task-comment')?.addEventListener('input', e => { state.taskComment = e.target.value.trim(); });

  // ── Клик по названию текущей задачи → детали ──────────────────────────────
  $('current-task-label')?.addEventListener('click', () => {
    if (!state.taskName || state.isLunch) return;
    const task = store.allKanbanTasks.find(t => t.id === state.taskId) ||
                 (state.taskId ? { id: state.taskId, name: state.taskName, url: state.taskUrl } : null);
    if (task) showTaskDetail(task);
  });

  // ── Вкладки ───────────────────────────────────────────────────────────────
  document.querySelectorAll('.tab').forEach(tab => {
    tab.addEventListener('click', () => {
      const target = tab.dataset.tab;
      document.querySelectorAll('.tab').forEach(t => t.classList.toggle('active', t.dataset.tab === target));
      document.querySelectorAll('.tab-content').forEach(tc => tc.classList.toggle('active', tc.id === `tab-${target}`));
      if (target === 'history')  renderHistory();
      if (target === 'calendar') loadCalendarEvents();
    });
  });

  // ── Закрепление окна ──────────────────────────────────────────────────────
  const btnPin = $('btn-pin');
  async function updatePin() {
    if (!btnPin) return;
    const pinned = await window.api.isAlwaysOnTop();
    btnPin.setAttribute('aria-label', pinned ? 'Открепить окно' : 'Закрепить окно');
    btnPin.dataset.state = pinned ? 'pinned' : 'unpinned';
    btnPin.textContent = pinned ? '📌' : '📍';
    btnPin.title       = pinned ? 'Открепить окно' : 'Закрепить окно';
    btnPin.title = pinned ? 'Открепить окно' : 'Закрепить окно';
  }
  btnPin?.addEventListener('click', async () => {
    await window.api.setAlwaysOnTop(!(await window.api.isAlwaysOnTop()));
    updatePin();
  });
  updatePin();

  // ── Compact-режим ─────────────────────────────────────────────────────────
  if ($('btn-compact')) $('btn-compact').dataset.state = 'compact';
  if ($('btn-compact')) {
    $('btn-compact').title = 'Свернуть';
    $('btn-compact').setAttribute('aria-label', 'Свернуть');
  }
  $('btn-compact')?.addEventListener('click', toggleCompact);
  $('titlebar')?.addEventListener('dblclick', toggleCompact);
  document.querySelector('.win-controls')?.addEventListener('dblclick', (e) => {
    e.stopPropagation();
  });
  $('compact-btn-pause')?.addEventListener('click', () => {
    if (state.taskRunning) pauseTask();
    else if (state.taskElapsed > 0) resumeTask();
  });
  $('compact-btn-stop')?.addEventListener('click', async () => {
    await handleStopRequest({ fromCompact: true });
  });

  // ── Stop button (normal mode) ──────────────────────────────────────────────
  $('btn-stop')?.addEventListener('click', async () => {
    await handleStopRequest();
  });

  $('stop-task-cancel')?.addEventListener('click', () => {
    $('stop-task-dialog-overlay')?.classList.remove('visible');
  });
  $('stop-task-only')?.addEventListener('click', async () => {
    $('stop-task-dialog-overlay')?.classList.remove('visible');
    await finalizeStopTask({ closeTask: false });
  });
  $('stop-task-complete')?.addEventListener('click', async () => {
    $('stop-task-dialog-overlay')?.classList.remove('visible');
    await finalizeStopTask({ closeTask: true });
  });

  // Compact task name → open task URL
  $('compact-task-name')?.addEventListener('click', () => {
    if (state.taskUrl) window.api.openExternal(state.taskUrl);
  });

  // ── Боковые панели ────────────────────────────────────────────────────────
  $('btn-left-panel')?.addEventListener('click',  toggleLeftPanel);
  $('btn-right-panel')?.addEventListener('click', toggleTasksPanel);
  $('btn-refresh-calendar-mini')?.addEventListener('click', async () => {
    const el = document.getElementById('side-panel-left-content');
    setCalendarMiniPanelContainer(el);
    el.innerHTML = '<div class="side-calendar-loading"><div class="kanban-spinner sm"></div></div>';
    invalidateCalendarCache();
    await loadCalendarEvents({ force: true });
    renderCalendarMiniPanel(el);
  });

  // ── Тема ──────────────────────────────────────────────────────────────────
  const btnThemeLight = $('btn-theme-light');
  const btnThemeDark  = $('btn-theme-dark');
  function loadTheme() {
    const isLight = localStorage.getItem('theme') === 'light';
    document.documentElement.classList.toggle('light', isLight);
    if (btnThemeLight) btnThemeLight.classList.toggle('active', isLight);
    if (btnThemeDark)  btnThemeDark.classList.toggle('active', !isLight);
  }
  btnThemeLight?.addEventListener('click', () => { document.documentElement.classList.add('light');    localStorage.setItem('theme', 'light'); loadTheme(); });
  btnThemeDark?.addEventListener('click',  () => { document.documentElement.classList.remove('light'); localStorage.setItem('theme', 'dark');  loadTheme(); });
  loadTheme();

  // ── Закрытие приложения ───────────────────────────────────────────────────
  $('btn-close')?.addEventListener('click', async () => {
    if (state.taskRunning || state.taskElapsed > 0) { pauseTask(); await saveCurrentTask(); }
    $('close-dialog-overlay')?.classList.add('visible');
  });
  $('close-yes')?.addEventListener('click', () => window.api.closeApp());
  $('close-no')?.addEventListener('click',  () => $('close-dialog-overlay')?.classList.remove('visible'));

  // ── Клик по истории → открыть задачу в Kanban ────────────────────────────
  $('history-list')?.addEventListener('click', async (e) => {
    const urlBtn = e.target.closest('.hi-url');
    if (!urlBtn) return;
    const url = urlBtn.dataset.url;
    if (!url) return;
    const match = url.match(/\/projects\/[^/]+\/(\d+)/);
    if (match) {
      if (!store.kanbanBaseUrl) store.kanbanBaseUrl = await window.api.getKanbanBaseUrl();
      await showTaskDetail({ id: parseInt(match[1], 10), url, name: urlBtn.dataset.name });
    }
  });

  // ── Начальный рендер ──────────────────────────────────────────────────────
  window.api.onReminderStartTask?.(async (task) => {
    if (!task?.name) return;
    await startTask(task.name, false, task.url || '');
  });

  window.api.onStopAllSounds?.(() => {
    stopAllSounds();
  });

  updateTaskDisplay();
  updatePomoDisplay();
  renderHistory();

  // ── Загрузка данных ───────────────────────────────────────────────────────
  await loadSettings();
  configureCalendarAutoRefresh();
  configureKanbanAutoRefresh();
  renderSettingsUI();
  await initAboutUI();
  if (isAuthorized()) {
    invalidateKanbanCache();
    await loadKanbanTasks({ force: true });
  }

  // ── Восстановление состояния ──────────────────────────────────────────────
  const tasksCol = document.querySelector('.tasks-column');
  if (tasksCol) tasksCol.style.display = tasksOpen ? 'flex' : 'none';
  updateNarrowMode();
  $('btn-right-panel')?.classList.toggle('active', tasksOpen);
  if (leftOpen) setPanelVisible('side-panel-left', 'btn-left-panel', leftOpen);
  await applyWindowBounds();
  if (leftOpen) {
    const el = document.getElementById('side-panel-left-content');
    setCalendarMiniPanelContainer(el);
    el.innerHTML = '<div class="side-calendar-loading"><div class="kanban-spinner sm"></div></div>';
    invalidateCalendarCache();
    await loadCalendarEvents({ force: true });
    renderCalendarMiniPanel(el);
  } else if (store.cfg?.ical_url) {
    setCalendarMiniPanelContainer(null);
    loadCalendarEvents(); // фоновая загрузка кэша событий для системы напоминаний
  }
}

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', initializeApp);
else initializeApp();
