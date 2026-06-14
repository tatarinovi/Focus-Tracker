import { $, pad, msToHMS, todayPrefix, escapeHtml } from './utils.js';

let historyView = 'list'; // 'list' | 'timeline'

const TIMELINE_COLORS = [
  'var(--accent)', '#22C97E', '#F59E0B', '#E879F9', '#22D3EE',
  '#F05252', '#60A5FA', '#A78BFA', '#34D399', '#FB923C',
];

function renderHistoryList(tasks, listEl) {
  [...tasks].reverse().forEach(t => {
    const el = document.createElement('div');
    el.className = 'history-item';
    const s    = new Date(t.startISO), e = new Date(t.endISO);
    const time = `${pad(s.getHours())}:${pad(s.getMinutes())} → ${pad(e.getHours())}:${pad(e.getMinutes())}`;
    const comment = t.comment ? ` · <span class="hi-comment">${escapeHtml(t.comment)}</span>` : '';

    el.innerHTML = `
      <span class="hi-name" title="${escapeHtml(t.name)}">${escapeHtml(t.name)}</span>
      <span class="hi-dur">${t.durationHMS}</span>
      <span class="hi-time">${time}${comment}</span>
    `;

    if (t.url) {
      const urlBtn = document.createElement('span');
      urlBtn.className = 'hi-url';
      urlBtn.textContent = '↗';
      urlBtn.title = 'Открыть задачу';
      urlBtn.dataset.url = t.url;
      urlBtn.dataset.name = t.name;
      el.querySelector('.hi-time').appendChild(document.createTextNode(' '));
      el.querySelector('.hi-time').appendChild(urlBtn);
    }

    listEl.appendChild(el);
  });
}

function renderHistoryTimeline(tasks, listEl) {
  const sorted = [...tasks].sort((a, b) => new Date(a.startISO) - new Date(b.startISO));
  const minTime = new Date(sorted[0].startISO).getTime();
  const maxTime = new Date(sorted[sorted.length - 1].endISO).getTime();
  const totalRange = maxTime - minTime || 1;

  // Временная ось: метки каждый час
  const axisEl = document.createElement('div');
  axisEl.className = 'timeline-axis';
  const lineEl = document.createElement('div');
  lineEl.className = 'timeline-axis-line';
  axisEl.appendChild(lineEl);

  const startHour = new Date(minTime);
  startHour.setMinutes(0, 0, 0);
  const endHour = new Date(maxTime);
  endHour.setHours(endHour.getHours() + 1, 0, 0, 0);

  for (let t = startHour.getTime(); t <= endHour.getTime(); t += 3600000) {
    const pct = ((t - minTime) / totalRange) * 100;
    if (pct < 0 || pct > 100) continue;
    const lbl = document.createElement('span');
    lbl.className = 'timeline-axis-label';
    const d = new Date(t);
    lbl.textContent = `${pad(d.getHours())}:00`;
    lbl.style.left = `${pct}%`;
    axisEl.appendChild(lbl);
  }
  listEl.appendChild(axisEl);

  const container = document.createElement('div');
  container.className = 'timeline-container';

  sorted.forEach((t, i) => {
    const start = new Date(t.startISO).getTime();
    const end   = new Date(t.endISO).getTime();
    const left  = ((start - minTime) / totalRange) * 100;
    const width = Math.max(((end - start) / totalRange) * 100, 0.5);
    const color = TIMELINE_COLORS[i % TIMELINE_COLORS.length];

    const row = document.createElement('div');
    row.className = 'timeline-row';

    const bar = document.createElement('div');
    bar.className = 'timeline-bar';
    bar.style.left       = `${left}%`;
    bar.style.width      = `${width}%`;
    bar.style.background = color;
    bar.title = `${escapeHtml(t.name)} · ${t.durationHMS}\n${pad(new Date(t.startISO).getHours())}:${pad(new Date(t.startISO).getMinutes())} → ${pad(new Date(t.endISO).getHours())}:${pad(new Date(t.endISO).getMinutes())}`;
    bar.textContent = t.name;

    if (t.url) {
      bar.dataset.url = t.url;
      bar.dataset.name = t.name;
      bar.classList.add('hi-url');
    }

    row.appendChild(bar);
    container.appendChild(row);
  });

  listEl.appendChild(container);
}

export async function renderHistory() {
  const all     = await window.api.loadTasks();
  const today   = todayPrefix();
  const tasks   = all.filter(t => t.date === today);
  const listEl  = $('history-list');
  const totalEl = $('history-total');
  if (!listEl) return;

  listEl.innerHTML = '';

  if (!tasks.length) {
    listEl.innerHTML = '<div class="history-empty">Пока нет задач. Начни трекинг!</div>';
    if (totalEl) totalEl.textContent = 'Итого: 0:00:00';
    return;
  }

  let totalMs = 0;
  tasks.forEach(t => { totalMs += t.durationMs; });

  if (historyView === 'timeline') {
    renderHistoryTimeline(tasks, listEl);
  } else {
    renderHistoryList(tasks, listEl);
  }

  if (totalEl) totalEl.textContent = `Итого: ${msToHMS(totalMs)}`;
}

export function initHistoryUI() {
  $('btn-clear-history')?.addEventListener('click', () => $('clear-dialog-overlay')?.classList.add('visible'));
  $('clear-yes')?.addEventListener('click', async () => {
    $('clear-dialog-overlay')?.classList.remove('visible');
    await window.api.clearTodayTasks();
    renderHistory();
  });
  $('clear-no')?.addEventListener('click', () => $('clear-dialog-overlay')?.classList.remove('visible'));
  $('btn-open-file')?.addEventListener('click', () => window.api.openDataPath());

  // Переключатель вида: список / timeline
  document.querySelectorAll('.history-view-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      historyView = btn.dataset.view;
      document.querySelectorAll('.history-view-btn').forEach(b => b.classList.toggle('active', b.dataset.view === historyView));
      renderHistory();
    });
  });
}
