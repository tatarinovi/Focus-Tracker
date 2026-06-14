import { escapeHtml } from './utils.js';

const queue = [];
let showing = false;

export function showNotification(title, message) {
  queue.push({ title, message });
  processQueue();
}

function processQueue() {
  if (showing || !queue.length) return;
  showing = true;
  const { title, message } = queue.shift();
  const el = document.createElement('div');
  el.className = 'app-notification';
  el.innerHTML = `<div class="notification-title">${escapeHtml(title)}</div><div class="notification-message">${escapeHtml(message)}</div>`;
  document.body.appendChild(el);
  setTimeout(() => {
    el.classList.add('fade-out');
    setTimeout(() => { el.remove(); showing = false; processQueue(); }, 300);
  }, 3000);
}
