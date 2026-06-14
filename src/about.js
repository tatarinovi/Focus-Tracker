import { $, setButtonLoading, openUrl } from './utils.js';
import { store }                         from './store.js';

const SOURCE_URL = 'https://github.com/k4t4my/task-tracker-releases';

const MONTHS = [
  'января', 'февраля', 'марта', 'апреля', 'мая', 'июня',
  'июля', 'августа', 'сентября', 'октября', 'ноября', 'декабря',
];

let _downloadUrl = null;

function formatCheckDate(isoString) {
  if (!isoString) return null;
  const d   = new Date(isoString);
  const now = new Date();
  const hm  = `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;

  if (d.toDateString() === now.toDateString()) return `Сегодня в ${hm}`;

  const yesterday = new Date(now);
  yesterday.setDate(now.getDate() - 1);
  if (d.toDateString() === yesterday.toDateString()) return `Вчера в ${hm}`;

  return `${d.getDate()} ${MONTHS[d.getMonth()]} в ${hm}`;
}

function setStatusText(text) {
  const el = $('update-check-status');
  if (el) el.textContent = text;
}

function setChannel(channel) {
  store.cfg.update_channel = channel;
  document.querySelectorAll('.channel-btn').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.channel === channel);
  });
  window.api.saveConfig(store.cfg);
}

async function startDownload() {
  if (!_downloadUrl) return;

  const progressWrap       = $('update-progress-wrap');
  const dialogProgressWrap = $('update-dialog-progress-wrap');
  const dlBtn              = $('btn-download-update');
  const dlDialogBtn        = $('update-dialog-download');
  const laterBtn           = $('update-dialog-later');

  setButtonLoading(dlBtn, true);
  if (dlDialogBtn) { dlDialogBtn.disabled = true; dlDialogBtn.textContent = 'Скачивание...'; }
  if (laterBtn)    laterBtn.disabled = true;
  if (progressWrap)       progressWrap.style.display       = '';
  if (dialogProgressWrap) dialogProgressWrap.style.display = '';

  await window.api.downloadUpdate(_downloadUrl);
  // После загрузки main вызывает app.quit()
}

function showUpdateAvailable(result) {
  _downloadUrl = result.download_url || '';

  const block       = $('update-available-block');
  const versionEl   = $('update-new-version');
  const changelogEl = $('update-changelog');

  if (!block) return;
  if (versionEl)   versionEl.textContent  = `v${result.version}`;
  if (changelogEl) changelogEl.textContent = result.changelog || '';
  block.style.display = '';
}

function hideUpdateBlock() {
  const block = $('update-available-block');
  if (block) block.style.display = 'none';
}

function showUpdateDialog(result) {
  const vEl  = $('update-dialog-version');
  const clEl = $('update-dialog-changelog');
  if (vEl)  vEl.textContent  = `v${result.version}`;
  if (clEl) clEl.textContent = result.changelog || '';
  $('update-dialog-overlay')?.classList.add('visible');
}

async function checkUpdates(fromStartup = false) {
  const channel = store.cfg.update_channel ?? 'stable';
  const btn     = $('btn-check-updates');

  setButtonLoading(btn, true);
  setStatusText('Проверяем...');
  hideUpdateBlock();

  const result = await window.api.checkUpdates(channel);

  store.cfg.last_update_check = new Date().toISOString();
  await window.api.saveConfig(store.cfg);

  setButtonLoading(btn, false);

  if (!result.success) {
    setStatusText(`Ошибка проверки: ${result.error}`);
    return;
  }

  const when = formatCheckDate(store.cfg.last_update_check);

  if (result.hasUpdate) {
    showUpdateAvailable(result);
    setStatusText(`Доступно обновление · Проверено: ${when}`);
    if (fromStartup) showUpdateDialog(result);
  } else {
    setStatusText(`Обновлений нет · Проверено: ${when}`);
  }
}

export async function initAboutUI() {
  // Версия приложения
  const version = await window.api.getAppVersion();
  const versionEl = $('about-version');
  if (versionEl) versionEl.textContent = `v${version}`;

  // Ссылка на исходный код
  $('about-source-link')?.addEventListener('click', (e) => {
    e.preventDefault();
    openUrl(SOURCE_URL);
  });

  // Канал обновлений
  const channel = store.cfg.update_channel ?? 'stable';
  document.querySelectorAll('.channel-btn').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.channel === channel);
    btn.addEventListener('click', () => setChannel(btn.dataset.channel));
  });

  // Автопроверка при запуске
  const autoUpdateCb = $('settings-auto-update');
  if (autoUpdateCb) {
    autoUpdateCb.checked = store.cfg.auto_check_updates !== false;
    autoUpdateCb.addEventListener('change', async (e) => {
      store.cfg.auto_check_updates = e.target.checked;
      await window.api.saveConfig(store.cfg);
    });
  }

  // Статус последней проверки
  const when = formatCheckDate(store.cfg.last_update_check);
  if (when) setStatusText(`Последняя проверка: ${when}`);

  // Кнопка проверки обновлений (ручная — без диалога)
  $('btn-check-updates')?.addEventListener('click', () => checkUpdates(false));

  // Кнопка скачивания в аккордеоне
  $('btn-download-update')?.addEventListener('click', startDownload);

  // Диалог обновления
  $('update-dialog-later')?.addEventListener('click', () => {
    $('update-dialog-overlay')?.classList.remove('visible');
  });
  $('update-dialog-download')?.addEventListener('click', () => {
    startDownload();
  });

  // Прогресс скачивания (обновляем и аккордеон, и диалог)
  window.api.onUpdateProgress((pct) => {
    const fill        = $('update-progress-fill');
    const label       = $('update-progress-pct');
    const dialogFill  = $('update-dialog-progress-fill');
    const dialogLabel = $('update-dialog-progress-pct');

    if (fill)        fill.style.width       = `${pct}%`;
    if (label)       label.textContent      = `${pct}%`;
    if (dialogFill)  dialogFill.style.width = `${pct}%`;
    if (dialogLabel) dialogLabel.textContent = `${pct}%`;
  });

  // Автопроверка при старте — показывает диалог если есть обновление
  if (store.cfg.auto_check_updates !== false) {
    checkUpdates(true);
  }
}
