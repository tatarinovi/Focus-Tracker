import { $, escapeHtml, setButtonLoading, setupCustomSelects } from './utils.js';
import { showNotification } from './notifications.js';
import { store } from './store.js';
import { configureCalendarAutoRefresh, invalidateCalendarCache } from './calendar.js';

// Колбэк вызывается при выходе из Kanban (чтобы settings.js не зависел от kanban.js).
// Регистрируется из renderer.js.
let _onLogout = () => {};
export function registerLogoutHandler(fn) { _onLogout = fn; }

export function applyAccentColor(color) {
  if (!color) color = '#7b5cf5';
  const r = parseInt(color.slice(1, 3), 16);
  const g = parseInt(color.slice(3, 5), 16);
  const b = parseInt(color.slice(5, 7), 16);
  const lr = Math.round(r + (255 - r) * 0.4);
  const lg = Math.round(g + (255 - g) * 0.4);
  const lb = Math.round(b + (255 - b) * 0.4);

  document.documentElement.style.setProperty('--accent',      color);
  document.documentElement.style.setProperty('--accent-lt',   `rgb(${lr},${lg},${lb})`);
  document.documentElement.style.setProperty('--accent-dim',  `rgba(${r},${g},${b},0.15)`);
  document.documentElement.style.setProperty('--accent-glow', `rgba(${r},${g},${b},0.30)`);
  document.documentElement.style.setProperty('--accent-bord', `rgba(${r},${g},${b},0.22)`);
}

export async function loadSettings() {
  store.cfg = await window.api.loadConfig();
  applyAccentColor(store.cfg.accent_color);
}

export function isAuthorized() {
  return !!(store.cfg?.kanban?.token);
}

export function getDisplayName() {
  const ui = store.cfg?.kanban?.userInfo;
  if (!ui) return 'Пользователь';
  const ud    = ui.data || ui;
  const last  = ud.last_name  || ud.surname      || ud.family_name || '';
  const first = ud.first_name || ud.name         || '';
  if (last && first) return `${last} ${first}`;
  return ud.full_name || ud.username || ud.email || 'Пользователь';
}

export function renderSettingsUI() {
  const accentInput = $('settings-accent-color');
  if (accentInput) accentInput.value = store.cfg.accent_color || '#7b5cf5';

  const icalInput = $('settings-ical-url');
  if (icalInput) icalInput.value = store.cfg.ical_url || '';

  const calUser = $('settings-caldav-user');
  const calPass = $('settings-caldav-pass');
  if (calUser && calPass) {
    window.api.getCalendarCredentials().then(creds => {
      calUser.value = creds.user || '';
      calPass.value = creds.pass ? '********' : '';
    });
  }

  const calRefresh = $('settings-cal-refresh');
  if (calRefresh) calRefresh.value = store.cfg.calendarRefreshInterval || '15';

  const defaultSounds = {
    volume: 50,
    taskSwitch: 'task_switch.mp3',
    pomodoro_work: 'pomodoro_work.mp3',
    pomodoro_rest: 'pomodoro_rest.mp3',
    meeting_start: 'meeting_start.mp3',
    success: 'success.mp3'
  };

  const currentSounds = store.cfg.sounds || defaultSounds;

  if ($('settings-sound-volume')) {
    const volInput = $('settings-sound-volume');
    const vol = currentSounds.volume !== undefined ? currentSounds.volume : 50;
    volInput.value = vol;
    volInput.style.background = `linear-gradient(to right, var(--accent-lt) ${vol}%, var(--surface3) ${vol}%)`;
    if ($('settings-sound-volume-val')) $('settings-sound-volume-val').textContent = vol + '%';
  }
  
  const syncSelectValue = (id, value) => {
    const select = $(id);
    if (!select) return;
    select.value = value;
    select.dispatchEvent(new Event('change', { bubbles: true }));
  };

  syncSelectValue('settings-sound-task', currentSounds.taskSwitch ?? 'task_switch.mp3');
  syncSelectValue('settings-sound-work', currentSounds.pomodoro_work ?? 'pomodoro_work.mp3');
  syncSelectValue('settings-sound-rest', currentSounds.pomodoro_rest ?? 'pomodoro_rest.mp3');
  syncSelectValue('settings-sound-meet', currentSounds.meeting_start ?? 'meeting_start.mp3');
  syncSelectValue('settings-sound-jira', currentSounds.success ?? 'success.mp3');
  setupCustomSelects($('tab-settings') || document);

  const jiraUser = $('settings-jira-user');
  const jiraPass = $('settings-jira-pass');
  const jiraKey = $('settings-jira-hotkey');
  
  if (jiraUser) jiraUser.value = store.cfg.jira_user || '';
  if (jiraKey) jiraKey.value = store.cfg.jira_hotkey || '';
  
  if (jiraPass) {
    window.api.getJiraCredentials().then(creds => {
      jiraPass.value = creds.pass ? '********' : '';
    });
  }

  const sendLunchCb = $('settings-send-lunch');
  if (sendLunchCb) {
    sendLunchCb.checked = store.cfg.send_lunch_message !== false;
    const chatsContainer = $('chats-container');
    if (chatsContainer) chatsContainer.style.display = sendLunchCb.checked ? '' : 'none';
  }

  const authRow = $('kanban-auth-row');
  if (authRow) {
    if (isAuthorized()) {
      authRow.innerHTML = `
        <div class="kanban-auth-logged">
          <span class="kanban-user-badge">${escapeHtml(getDisplayName())}</span>
          <button class="btn btn-ghost small" id="btn-kanban-logout">Выйти</button>
        </div>
      `;
      $('btn-kanban-logout')?.addEventListener('click', async () => {
        if (store.cfg.kanban) { delete store.cfg.kanban.token; delete store.cfg.kanban.userInfo; }
        await window.api.saveConfig(store.cfg);
        showNotification('✓ Выполнено', 'Вы вышли из Kanban');
        renderSettingsUI();
        _onLogout();
      });
    } else {
      authRow.innerHTML = `<button class="btn btn-primary" id="btn-kanban-login">🚪 Войти в Kanban</button>`;
      $('btn-kanban-login')?.addEventListener('click', () => {
        if ($('login-email'))    $('login-email').value    = '';
        if ($('login-password')) $('login-password').value = '';
        $('login-dialog-overlay')?.classList.add('visible');
      });
    }
  }

  const list = $('chats-list');
  if (!list) return;
  list.innerHTML = '';
  (store.cfg.chats || []).forEach((chat, idx) => {
    const item = document.createElement('div');
    item.className = 'chat-item';
    item.innerHTML = `
      <input type="text" placeholder="Chat ID" value="${escapeHtml(chat.id)}" data-field="id" />
      <div class="chat-item-sep"></div>
      <input type="text" placeholder="Thread ID" value="${chat.thread_id || ''}" data-field="thread_id" style="max-width:80px" />
      <button type="button" title="Удалить">✕</button>
    `;
    item.querySelectorAll('input').forEach(i => i.addEventListener('change', e => { store.cfg.chats[idx][e.target.dataset.field] = e.target.value; }));
    item.querySelector('button').addEventListener('click', () => { store.cfg.chats.splice(idx, 1); renderSettingsUI(); });
    list.appendChild(item);
  });

  const addBtn = document.createElement('button');
  addBtn.className = 'btn btn-ghost small';
  addBtn.textContent = '+ Добавить чат';
  addBtn.addEventListener('click', () => { if (!store.cfg.chats) store.cfg.chats = []; store.cfg.chats.push({ id: '', thread_id: '' }); renderSettingsUI(); });
  list.appendChild(addBtn);
}

export async function saveSettings() {
  const accentInput = $('settings-accent-color');
  if (accentInput) store.cfg.accent_color = accentInput.value;

  const icalInput = $('settings-ical-url');
  if (icalInput) store.cfg.ical_url = icalInput.value.trim();

  const calUser = $('settings-caldav-user');
  const calPass = $('settings-caldav-pass');
  if (calUser && calPass) {
    const user = calUser.value.trim();
    let pass = calPass.value;
    if (pass === '********') pass = undefined;
    await window.api.saveCalendarCredentials({ user, pass });
  }

  const calRefresh = $('settings-cal-refresh');
  if (calRefresh) store.cfg.calendarRefreshInterval = calRefresh.value;

  if (!store.cfg.sounds) store.cfg.sounds = {};
  if ($('settings-sound-volume')) store.cfg.sounds.volume = parseInt($('settings-sound-volume').value, 10);
  if ($('settings-sound-task')) store.cfg.sounds.taskSwitch = $('settings-sound-task').value;
  if ($('settings-sound-work')) store.cfg.sounds.pomodoro_work = $('settings-sound-work').value;
  if ($('settings-sound-rest')) store.cfg.sounds.pomodoro_rest = $('settings-sound-rest').value;
  if ($('settings-sound-meet')) store.cfg.sounds.meeting_start = $('settings-sound-meet').value;
  if ($('settings-sound-jira')) store.cfg.sounds.success = $('settings-sound-jira').value;

  const jiraUser = $('settings-jira-user');
  const jiraPass = $('settings-jira-pass');
  const jiraKey = $('settings-jira-hotkey');

  if (jiraUser) store.cfg.jira_user = jiraUser.value.trim();
  if (jiraKey) store.cfg.jira_hotkey = jiraKey.value.trim();

  if (jiraPass) {
    let pass = jiraPass.value;
    if (pass === '********') pass = undefined;
    await window.api.saveJiraCredentials({ pass });
  }

  const sendLunchCb = $('settings-send-lunch');
  if (sendLunchCb) store.cfg.send_lunch_message = sendLunchCb.checked;

  const saveBtn = $('btn-save-settings');
  setButtonLoading(saveBtn, true);

  store.cfg.chats = [];
  document.querySelectorAll('.chat-item').forEach(item => {
    const id  = item.querySelector('input[data-field="id"]')?.value.trim();
    const tid = item.querySelector('input[data-field="thread_id"]')?.value.trim();
    if (id) store.cfg.chats.push({ id, thread_id: tid || '' });
  });

  await window.api.saveConfig(store.cfg);
  applyAccentColor(store.cfg.accent_color);
  invalidateCalendarCache();
  configureCalendarAutoRefresh();
  setButtonLoading(saveBtn, false);
  showNotification('✓ Сохранено', 'Настройки успешно сохранены!');
}

export function initSettingsUI() {
  const volRange = $('settings-sound-volume');
  if (volRange) {
    const updateVolTrack = () => {
      volRange.style.background = `linear-gradient(to right, var(--accent-lt) ${volRange.value}%, var(--surface3) ${volRange.value}%)`;
    };
    volRange.addEventListener('input', (e) => {
      const val = $('settings-sound-volume-val');
      if (val) val.textContent = e.target.value + '%';
      updateVolTrack();
    });
    updateVolTrack();
  }

  $('btn-save-settings')?.addEventListener('click', saveSettings);
  $('btn-bot-help')?.addEventListener('click', () => $('bot-help-dialog-overlay')?.classList.add('visible'));
  $('bot-help-close')?.addEventListener('click', () => $('bot-help-dialog-overlay')?.classList.remove('visible'));

  const accentInput = $('settings-accent-color');
  if (accentInput) {
    accentInput.addEventListener('input', (e) => {
      applyAccentColor(e.target.value);
    });
  }

  $('settings-send-lunch')?.addEventListener('change', (e) => {
    const chatsContainer = $('chats-container');
    if (chatsContainer) chatsContainer.style.display = e.target.checked ? '' : 'none';
  });

  const jiraHotkeyInput = $('settings-jira-hotkey');
  if (jiraHotkeyInput) {
    jiraHotkeyInput.addEventListener('keydown', (e) => {
      // Игнорируем "голые" модификаторы
      if (['Control', 'Shift', 'Alt', 'Meta'].includes(e.key)) return;
      
      e.preventDefault();
      e.stopPropagation();

      const parts = [];
      if (e.ctrlKey)  parts.push('Control');
      if (e.metaKey)  parts.push('Meta');
      if (e.altKey)   parts.push('Alt');
      if (e.shiftKey) parts.push('Shift');

      // Форматируем код клавиши (Electron-style, layout-independent)
      let key = '';
      const codeMap = {
        'Space': 'Space', 'ArrowUp': 'Up', 'ArrowDown': 'Down', 'ArrowLeft': 'Left', 'ArrowRight': 'Right',
        'Escape': 'Esc', 'Enter': 'Return', 'NumpadEnter': 'Return', 'Tab': 'Tab', 'Backspace': 'Backspace',
        'Delete': 'Delete', 'Insert': 'Insert', 'Home': 'Home', 'End': 'End', 'PageUp': 'PageUp', 'PageDown': 'PageDown',
        'CapsLock': 'Capslock', 'NumLock': 'Numlock', 'ScrollLock': 'Scrolllock',
        'Comma': 'Comma', 'Period': 'Period', 'Semicolon': 'Semicolon', 'Quote': 'Quote',
        'BracketLeft': '[', 'BracketRight': ']', 'Backslash': '\\', 'Backquote': '`',
        'Minus': '-', 'Equal': '=', 'Slash': '/'
      };

      if (e.code.startsWith('Key')) {
        key = e.code.slice(3); // "KeyA" -> "A"
      } else if (e.code.startsWith('Digit')) {
        key = e.code.slice(5); // "Digit1" -> "1"
      } else if (e.code.startsWith('F') && e.code.length <= 3) {
        key = e.code; // "F1", "F12"
      } else if (codeMap[e.code]) {
        key = codeMap[e.code];
      } else if (e.key.length === 1 && e.key.charCodeAt(0) < 128) {
        key = e.key.toUpperCase();
        if (key === ' ') key = 'Space';
      }

      // Финальная проверка на ASCII
      if (!key || /[^\x00-\x7F]/.test(key)) return;
      
      parts.push(key);
      jiraHotkeyInput.value = parts.join('+');
    });

    jiraHotkeyInput.addEventListener('focus', () => {
      jiraHotkeyInput.dataset.oldValue = jiraHotkeyInput.value;
      jiraHotkeyInput.placeholder = 'Нажмите сочетание клавиш...';
      if (jiraHotkeyInput.value) jiraHotkeyInput.value = '';
      jiraHotkeyInput.classList.add('recording');
    });

    jiraHotkeyInput.addEventListener('blur', () => {
      jiraHotkeyInput.placeholder = 'Например: Control+Shift+J';
      if (!jiraHotkeyInput.value && jiraHotkeyInput.dataset.oldValue) {
        jiraHotkeyInput.value = jiraHotkeyInput.dataset.oldValue;
      }
      jiraHotkeyInput.classList.remove('recording');
    });
  }

  document.querySelectorAll('.accordion-header').forEach(header => {
    header.addEventListener('click', () => {
      const accordion = header.parentElement;
      const isOpen = accordion.classList.contains('open');
      document.querySelectorAll('.accordion').forEach(a => {
        a.classList.remove('open');
      });
      if (!isOpen) {
        accordion.classList.add('open');
      }
    });
  });
}
