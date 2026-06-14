import { state, WORK_SEC, BREAK_SEC } from './state.js';
import { $, secToMS } from './utils.js';
import { showNotification } from './notifications.js';
import { playAudioPath, playSound } from './audio.js';

export function updatePomoDisplay() {
  const el  = $('pomo-timer');
  const bar = $('pomo-progress');
  if (el)  el.textContent  = secToMS(state.pomoRemaining);
  if (bar) bar.style.width = ((state.pomoTotal - state.pomoRemaining) / state.pomoTotal * 100) + '%';
}

function flashScreen(phase) {
  const el = document.createElement('div');
  el.style.cssText = `position:fixed;inset:0;border-radius:14px;pointer-events:none;
    background:${phase === 'break' ? 'rgba(34,201,126,0.20)' : 'var(--accent-dim)'};
    animation:fadeFlash 0.8s ease forwards;z-index:999;`;
  document.body.appendChild(el);
  setTimeout(() => el.remove(), 800);
}

function playAlarmSound() {
  playSound('taskSwitch');
}

export function resetPomo() {
  clearInterval(state.pomoInterval);
  state.pomoInterval  = null;
  state.pomoRunning   = false;
  state.pomoPhase     = 'work';
  state.pomoTotal     = WORK_SEC;
  state.pomoRemaining = WORK_SEC;

  if ($('pomo-phase')) $('pomo-phase').textContent = 'Работа';
  if ($('pomo-label')) $('pomo-label').textContent = '🍅 Помодоро';
  document.querySelector('.pomodoro')?.classList.remove('break');
  document.querySelector('.progress-wrap')?.classList.remove('break-progress');
  const bar = $('pomo-progress'); if (bar) bar.style.background = '';
  const btn = $('btn-pomo-start'); if (btn) { btn.textContent = '▶ Запустить'; btn.classList.remove('running'); }

  updatePomoDisplay();
}

function switchPomoPhase() {
  clearInterval(state.pomoInterval);
  state.pomoInterval = null;
  state.pomoRunning  = false;

  playAlarmSound();

  if (state.pomoPhase === 'work') {
    state.pomoPhase     = 'break';
    state.pomoTotal     = BREAK_SEC;
    state.pomoRemaining = BREAK_SEC;
    if ($('pomo-phase')) $('pomo-phase').textContent = 'Перерыв 🌿';
    if ($('pomo-label')) $('pomo-label').textContent = '☕ Помодоро';
    document.querySelector('.pomodoro')?.classList.add('break');
    document.querySelector('.progress-wrap')?.classList.add('break-progress');
    const bar = $('pomo-progress'); if (bar) bar.style.background = 'var(--green)';
    showNotification('Помодоро — Перерыв!', 'Отличная работа! Время отдохнуть 5 минут.');
    playSound('pomodoro_rest');
    flashScreen('break');
  } else {
    resetPomo();
    showNotification('Помодоро — Работа!', 'Перерыв закончился. Вперёд! 🍅');
    playSound('pomodoro_work');
    flashScreen('work');
  }
  updatePomoDisplay();
}

export function startPomo() {
  if (state.pomoRunning) return;
  state.pomoRunning = true;
  const btn = $('btn-pomo-start');
  if (btn) { btn.textContent = '⏸ Пауза'; btn.classList.add('running'); }
  state.pomoInterval = setInterval(() => {
    state.pomoRemaining--;
    updatePomoDisplay();
    if (state.pomoRemaining <= 0) switchPomoPhase();
  }, 1000);
}

export function stopPomo() {
  clearInterval(state.pomoInterval);
  state.pomoInterval = null;
  state.pomoRunning  = false;
  const btn = $('btn-pomo-start');
  if (btn) { btn.textContent = '▶ Запустить'; btn.classList.remove('running'); }
}

export function initPomoUI() {
  $('btn-pomo-start')?.addEventListener('click', () => { if (state.pomoRunning) stopPomo(); else startPomo(); });
  $('btn-pomo-reset')?.addEventListener('click', resetPomo);
}
