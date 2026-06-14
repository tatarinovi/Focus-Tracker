import { state } from './state.js';
import { $, msToHMS, todayPrefix } from './utils.js';
import { renderHistory } from './history.js';
import { playSound } from './audio.js';

// Колбэк для обновления списка Kanban при смене состояния задачи.
// Регистрируется из renderer.js, чтобы избежать циклической зависимости.
let _onTaskChange = () => {};
export function registerTaskChangeHandler(fn) { _onTaskChange = fn; }

export function stopTaskInterval() {
  clearInterval(state.taskInterval);
  state.taskInterval = null;
  state.taskRunning  = false;
}

export function currentTaskMs() {
  let ms = state.taskElapsed;
  if (state.taskRunning && state.taskStartTime) ms += Date.now() - state.taskStartTime.getTime();
  return ms;
}

export function updateTaskDisplay() {
  const ms = currentTaskMs();
  const el = $('task-timer');
  if (el) el.textContent = msToHMS(ms);

  // Обновление compact-отображения в titlebar
  const compactTask  = document.getElementById('compact-task-name');
  const compactTimer = document.getElementById('compact-timer-val');
  if (compactTask)  compactTask.textContent  = state.taskName || 'Нет задачи';
  if (compactTimer) compactTimer.textContent = (state.taskRunning || state.taskElapsed > 0) ? msToHMS(ms) : '—';

  // Sync compact pause button
  const compactPause = document.getElementById('compact-btn-pause');
  if (compactPause) compactPause.textContent = state.taskRunning ? '⏸' : '▶';
  if (compactTimer) compactTimer.classList.toggle('pulse', state.taskRunning);
}

export async function saveCurrentTask() {
  const ms = currentTaskMs();
  if (ms < 1000 || state.isLunch) return;

  const endTime   = new Date();
  const startTime = new Date(endTime.getTime() - ms);

  await window.api.saveTask({
    name:        state.taskName,
    comment:     state.taskComment || '',
    url:         state.taskUrl || '',
    date:        todayPrefix(),
    startISO:    startTime.toISOString(),
    endISO:      endTime.toISOString(),
    durationMs:  ms,
    durationHMS: msToHMS(ms),
  });
  renderHistory();
}

export async function startTask(name, isLunch = false, url = '') {
  if (state.taskRunning || state.taskElapsed > 0) await saveCurrentTask();
  stopTaskInterval();

  const labelEl    = $('current-task-label');
  const headerEl   = document.querySelector('.timer-block:not(.pomodoro) .timer-label');
  const commentEl  = $('task-comment');
  const btnPause   = $('btn-pause');
  const timerBlock = document.querySelector('.timer-block:not(.pomodoro)');

  state.taskName    = name || (isLunch ? 'Обед' : '(без названия)');
  state.taskComment = '';
  state.taskUrl     = url || '';
  if (url) {
    const match = url.match(/\/projects\/[^/]+\/(\d+)/);
    state.taskId = match ? parseInt(match[1], 10) : null;
  } else {
    state.taskId = null;
  }
  state.taskStartTime = new Date();
  state.taskBeginTime = new Date();
  state.taskElapsed   = 0;
  state.taskRunning   = true;
  state.isLunch       = isLunch;

  if (labelEl)    { labelEl.textContent = isLunch ? 'Обеденный перерыв' : state.taskName; labelEl.title = labelEl.textContent; labelEl.classList.toggle('clickable', !isLunch); }
  if (headerEl)   headerEl.textContent  = isLunch ? 'Обед' : 'Текущая задача';
  if (timerBlock) timerBlock.classList.add('running');
  if (commentEl)  { commentEl.value = ''; commentEl.disabled = isLunch; }
  if (btnPause)   { btnPause.disabled = false; btnPause.textContent = '⏸ Пауза'; }

  const btnStop = $('btn-stop');
  if (btnStop) btnStop.disabled = false;

  playSound('taskSwitch');

  state.taskInterval = setInterval(updateTaskDisplay, 500);
  updateTaskDisplay();
}

export function pauseTask() {
  if (!state.taskRunning) return;
  state.taskElapsed   += Date.now() - state.taskStartTime.getTime();
  state.taskStartTime  = null;
  state.taskRunning    = false;
  clearInterval(state.taskInterval);

  document.querySelector('.timer-block:not(.pomodoro)')?.classList.remove('running');
  const btnPause = $('btn-pause');
  if (btnPause) btnPause.textContent = '▶ Продолжить';

  const compactPause = document.getElementById('compact-btn-pause');
  if (compactPause) compactPause.textContent = '▶';

  _onTaskChange();
}

export async function stopTask() {
  // Save + log work (imported in renderer.js which wires this up)
  await saveCurrentTask();

  // Stop everything
  stopTaskInterval();

  // Reset state
  state.taskName      = '';
  state.taskComment   = '';
  state.taskUrl       = '';
  state.taskId        = null;
  state.taskElapsed   = 0;
  state.taskStartTime = null;
  state.taskBeginTime = null;
  state.isLunch       = false;

  // Reset UI
  const labelEl    = $('current-task-label');
  const headerEl   = document.querySelector('.timer-block:not(.pomodoro) .timer-label');
  const timerEl    = $('task-timer');
  const commentEl  = $('task-comment');
  const btnPause   = $('btn-pause');
  const timerBlock = document.querySelector('.timer-block:not(.pomodoro)');

  if (labelEl)    { labelEl.textContent = 'Выберите задачу из Kanban →'; labelEl.title = ''; labelEl.classList.remove('clickable'); }
  if (headerEl)   headerEl.textContent  = 'Текущая задача';
  if (timerEl)    timerEl.textContent    = '00:00:00';
  if (timerBlock) timerBlock.classList.remove('running');
  if (commentEl)  { commentEl.value = ''; commentEl.disabled = true; }
  if (btnPause)   { btnPause.disabled = true; btnPause.textContent = '⏸ Пауза'; }

  const btnStop = $('btn-stop');
  if (btnStop) btnStop.disabled = true;

  updateTaskDisplay();
  _onTaskChange();
}

export function resumeTask() {
  if (state.taskRunning) return;
  state.taskStartTime = new Date();
  state.taskRunning   = true;

  document.querySelector('.timer-block:not(.pomodoro)')?.classList.add('running');
  const btnPause  = $('btn-pause');
  const headerEl  = document.querySelector('.timer-block:not(.pomodoro) .timer-label');
  const commentEl = $('task-comment');

  if (btnPause) btnPause.textContent = '⏸ Пауза';

  const compactPause = document.getElementById('compact-btn-pause');
  if (compactPause) compactPause.textContent = '⏸';

  if (state.isLunch) {
    if (headerEl)  headerEl.textContent  = 'Обед';
    if (commentEl) commentEl.disabled    = true;
  }

  state.taskInterval = setInterval(updateTaskDisplay, 500);
  _onTaskChange();
}
