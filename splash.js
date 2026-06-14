// Тема — из localStorage (общий для всех file:// окон Electron)
if (localStorage.getItem('theme') === 'light') {
  document.documentElement.classList.add('light');
}

// Акцентный цвет — из query param, переданного из main.js
const accent = new URLSearchParams(location.search).get('accent') || '#7B5CF5';
const r  = parseInt(accent.slice(1, 3), 16);
const g  = parseInt(accent.slice(3, 5), 16);
const b  = parseInt(accent.slice(5, 7), 16);
const lr = Math.round(r + (255 - r) * 0.4);
const lg = Math.round(g + (255 - g) * 0.4);
const lb = Math.round(b + (255 - b) * 0.4);

const s = document.documentElement.style;
s.setProperty('--accent',      accent);
s.setProperty('--accent-lt',   `rgb(${lr},${lg},${lb})`);
s.setProperty('--accent-glow', `rgba(${r},${g},${b},0.15)`);
const isLight = document.documentElement.classList.contains('light');
s.setProperty('--border-top', `rgba(${r},${g},${b},${isLight ? 0.45 : 0.35})`);

// Статус и прогресс обновления — из main process через IPC
if (window.splashApi) {
  const statusEl = document.getElementById('status');

  window.splashApi.onStatus(text => {
    if (statusEl) statusEl.textContent = text;
  });

  window.splashApi.onProgress(percent => {
    if (statusEl) statusEl.textContent = `Загрузка обновления ${percent}%`;
  });
}
