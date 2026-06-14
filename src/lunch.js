import { state } from './state.js';
import { store } from './store.js';
import { $ } from './utils.js';
import { showNotification } from './notifications.js';
import { startTask, stopTaskInterval, updateTaskDisplay } from './timer.js';
import { applyFilters } from './kanban.js';

let prevTaskData = null;

export async function sendTg(type) {
  if (!store.cfg.bot_token) return showNotification('⚠ Ошибка', 'Bot token не настроен');
  const ui = store.cfg.kanban?.userInfo;
  const ud = ui?.data || ui;
  const username = '@' + (ud?.telegram || ud?.username || '');
  if (!username || username === '@') return showNotification('⚠ Ошибка', 'Telegram username не найден в профиле Kanban');
  const valid = (store.cfg.chats || []).filter(c => c.id);
  if (!valid.length) return showNotification('⚠ Ошибка', 'Добавьте хотя бы один чат');

  const fn = type === 'lunch' ? window.api.sendLunchMessage : window.api.sendLunchBackMessage;
  const r  = await fn(store.cfg.bot_token, username, valid);
  if (r.success) {
    showNotification('✓ Отправлено', `Сообщение отправлено в ${r.results.length} чат(ов)`);
  } else {
    const failed = r.results.filter(x => !x.success).length;
    showNotification('⚠ Частичная ошибка', `Отправлено: ${r.results.length - failed}, Ошибок: ${failed}`);
  }
}

export async function goOnLunch() {
  if (state.taskRunning || state.taskElapsed > 0) {
    let taskId = null;
    if (state.taskUrl) {
      const match = state.taskUrl.match(/\/projects\/[^/]+\/(\d+)/);
      if (match) taskId = parseInt(match[1], 10);
    }
    prevTaskData = {
      name: state.taskName, url: state.taskUrl, taskId,
      comment: state.taskComment, startTime: state.taskStartTime, elapsed: state.taskElapsed,
    };
  } else {
    prevTaskData = null;
  }
  await startTask('Обеденный перерыв', true);
  if (store.cfg.send_lunch_message !== false) sendTg('lunch');
  showNotification('🍽 Приятного аппетита!', 'Таймер обеда запущен.');
}

export function returnFromLunch() {
  if (prevTaskData) {
    state.taskName      = prevTaskData.name;
    state.taskUrl       = prevTaskData.url || '';
    state.taskComment   = prevTaskData.comment || '';
    state.taskStartTime = prevTaskData.startTime || new Date();
    state.taskElapsed   = prevTaskData.elapsed || 0;
    state.isLunch       = false;
    state.taskRunning   = true;

    if (state.taskInterval) clearInterval(state.taskInterval);
    state.taskInterval = setInterval(updateTaskDisplay, 500);

    const labelEl    = $('current-task-label');
    const headerEl   = document.querySelector('.timer-block:not(.pomodoro) .timer-label');
    const commentEl  = $('task-comment');
    const timerBlock = document.querySelector('.timer-block:not(.pomodoro)');
    const btnPause   = $('btn-pause');

    if (labelEl)    { labelEl.textContent = state.taskName; labelEl.title = labelEl.textContent; labelEl.classList.add('clickable'); }
    if (headerEl)   headerEl.textContent  = 'Текущая задача';
    if (commentEl)  { commentEl.value = state.taskComment || ''; commentEl.disabled = false; }
    if (timerBlock) timerBlock.classList.add('running');
    if (btnPause)   { btnPause.disabled = false; btnPause.textContent = '⏸ Пауза'; }

    updateTaskDisplay();
    prevTaskData = null;
  } else {
    stopTaskInterval();
    state.isLunch       = false;
    state.taskName      = '';
    state.taskUrl       = '';
    state.taskComment   = '';
    state.taskElapsed   = 0;
    state.taskStartTime = null;

    const labelEl    = $('current-task-label');
    const headerEl   = document.querySelector('.timer-block:not(.pomodoro) .timer-label');
    const commentEl  = $('task-comment');
    const timerBlock = document.querySelector('.timer-block:not(.pomodoro)');
    const btnPause   = $('btn-pause');

    if (labelEl)    { labelEl.textContent = 'Выберите задачу из Kanban →'; labelEl.title = ''; labelEl.classList.remove('clickable'); }
    if (headerEl)   headerEl.textContent  = 'Текущая задача';
    if (commentEl)  { commentEl.value = ''; commentEl.disabled = false; }
    if (timerBlock) timerBlock.classList.remove('running');
    if (btnPause)   { btnPause.disabled = true; btnPause.textContent = '⏸ Пауза'; }

    updateTaskDisplay();
  }

  showNotification('👋 Добро пожаловать обратно!', 'Хорошего продуктивного дня!');
  if (store.cfg.send_lunch_message !== false) sendTg('lunchback');
  if (store.allKanbanTasks.length) applyFilters();
}

export function initLunchUI() {
  $('btn-lunch')?.addEventListener('click', async () => {
    if (state.taskRunning) {
      if (state.isLunch) returnFromLunch();
      else $('lunch-confirm-dialog-overlay')?.classList.add('visible');
    } else {
      await goOnLunch();
    }
  });

  $('lunch-confirm-yes')?.addEventListener('click', async () => {
    $('lunch-confirm-dialog-overlay')?.classList.remove('visible');
    await goOnLunch();
  });
  $('lunch-confirm-no')?.addEventListener('click', () => $('lunch-confirm-dialog-overlay')?.classList.remove('visible'));

  $('lunch-end-yes')?.addEventListener('click', () => {
    $('lunch-end-dialog-overlay')?.classList.remove('visible');
    returnFromLunch();
  });
  $('lunch-end-no')?.addEventListener('click', () => $('lunch-end-dialog-overlay')?.classList.remove('visible'));
}
