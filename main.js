const { app, BrowserWindow, ipcMain, Notification, shell, safeStorage, globalShortcut, screen } = require('electron');
const path = require('path');
const fs = require('fs');
const { pathToFileURL } = require('url');
const fetch = require('node-fetch');
const { download } = require('electron-dl');
const semver = require('semver');
const ical = require('node-ical');
const { KANBAN_API_BASE_URL, JIRA_URL, JIRA_DEFAULT_PROJECT } = require('./app-secrets');

const UPDATE_CHECK_URL = 'https://tasktracker.katamy.su/updates/version.json';

const startupStartedAt = Date.now();
console.time('startup');
function startupMark(label) {
  console.info(`[Startup] +${Date.now() - startupStartedAt}ms ${label}`);
}
startupMark('process start');

if (process.env.DISABLE_ELECTRON_GPU === '1') {
  startupMark('legacy GPU disable enabled');
  app.disableHardwareAcceleration();
  app.commandLine.appendSwitch('disable-gpu');
  app.commandLine.appendSwitch('disable-gpu-compositing');
  app.commandLine.appendSwitch('disable-gpu-shader-disk-cache');
  app.commandLine.appendSwitch('disable-gpu-sandbox');
  app.commandLine.appendSwitch('in-process-gpu');
  app.commandLine.appendSwitch('no-sandbox');
  app.commandLine.appendSwitch('disable-features', 'UseSkiaRenderer,Vulkan,DirectComposition,D3D11VideoDecoder');
}

if (!app.isPackaged) {
  const devUserDataPath = path.join(__dirname, '.local-data');
  try {
    fs.mkdirSync(devUserDataPath, { recursive: true });
    app.setPath('userData', devUserDataPath);
  } catch (error) {
    console.error('[Startup] Failed to prepare local dev userData path', error);
  }
}

let mainWindow;
let splashWindow        = null;
let reminderWindow      = null;
let reminderData        = null;
let isQuitting          = false;
let isUpdating          = false;
let dataPath;
let configPath;
let notesDir;

function redactSensitive(value) {
  if (!value || typeof value !== 'object') return value;
  if (Array.isArray(value)) return value.map(redactSensitive);

  const redacted = {};
  for (const [key, nestedValue] of Object.entries(value)) {
    if (/pass(word)?|token|authorization/i.test(key)) {
      redacted[key] = '***';
    } else {
      redacted[key] = redactSensitive(nestedValue);
    }
  }
  return redacted;
}

function initDataPath() {
  const userDataPath = app.getPath('userData');
  dataPath   = path.join(userDataPath, 'tasks.json');
  configPath = path.join(userDataPath, 'config.json');
  notesDir   = path.join(userDataPath, 'Notes');
  if (!fs.existsSync(notesDir)) {
    try { fs.mkdirSync(notesDir, { recursive: true }); } catch (e) { console.error('Ошибка создания Notes dir:', e); }
  }

  // Создаём директорию, если она не существует
  if (!fs.existsSync(userDataPath)) {
    try {
      fs.mkdirSync(userDataPath, { recursive: true });
    } catch (err) {
      console.error('Ошибка создания директории userData:', err);
    }
  }
}

const SPLASH_MIN_MS = 1200;
let   splashShownAt = 0;

function createSplash() {
  const accent = '#7B5CF5';

  splashWindow = new BrowserWindow({
    width:          300,
    height:         160,
    frame:          false,
    transparent:    false,
    backgroundColor: '#111318',
    hasShadow:      true,
    roundedCorners: true,
    alwaysOnTop:    true,
    resizable:      false,
    skipTaskbar:    true,
    webPreferences: {
      preload:          path.join(__dirname, 'splash-preload.js'),
      nodeIntegration:  false,
      contextIsolation: true,
    },
  });
  startupMark('splash created');
  splashWindow.center();
  splashWindow.loadFile(path.join(__dirname, 'splash.html'), { query: { accent } });
  splashWindow.once('ready-to-show', () => {
    if (splashWindow && !splashWindow.isDestroyed()) {
      splashWindow.show();
      splashWindow.webContents.send('splash-status', 'Запуск приложения...');
    }
  });
  splashShownAt = Date.now();
}

function setSplashStatus(text) {
  if (splashWindow && !splashWindow.isDestroyed()) {
    try {
      splashWindow.webContents.send('splash-status', text);
    } catch (error) {
      console.warn('[Startup] splash status skipped', error.message);
    }
  }
}

function createWindow() {
  startupMark('createWindow called');
  setSplashStatus('Подготовка интерфейса...');
  const config = loadConfig();
  const windowState = config.window_state || {};
  const compactMode = windowState.compactMode === true;
  const rendererBuildPath = path.join(__dirname, 'renderer-dist', 'index.html');
  const devServerUrl = process.env.VITE_DEV_SERVER_URL;

  mainWindow = new BrowserWindow({
    width: compactMode ? 220 : (windowState.width || 1200),
    height: compactMode ? 124 : (windowState.height || 760),
    minWidth: 220,
    minHeight: 136,
    resizable: true,
    alwaysOnTop: config.always_on_top !== false,
    frame: false,
    transparent: false,
    backgroundColor: '#111318',
    hasShadow: true,
    roundedCorners: true,
    show: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });
  startupMark('BrowserWindow created');

  let mainWindowVisible = false;
  let updateCheckStarted = false;
  const showMainWindow = () => {
    if (!mainWindow || mainWindow.isDestroyed() || mainWindowVisible) return;
    mainWindowVisible = true;
    setSplashStatus('Готово');
    mainWindow.show();
    startupMark('mainWindow.show');
    if (splashWindow && !splashWindow.isDestroyed()) splashWindow.destroy();
    splashWindow = null;
    mainWindow.webContents.send('app-visible');
    if (!updateCheckStarted) {
      updateCheckStarted = true;
      startupMark('update-check scheduled');
      setTimeout(() => checkAndDownloadUpdate(), 750);
    }
  };

  mainWindow.once('ready-to-show', () => {
    startupMark('ready-to-show');
    showMainWindow();
  });
  mainWindow.webContents.once('did-finish-load', () => {
    startupMark('did-finish-load');
    setTimeout(showMainWindow, 50);
  });
  mainWindow.webContents.on('did-fail-load', (_event, errorCode, errorDescription, validatedURL) => {
    console.error('[Renderer] did-fail-load', { errorCode, errorDescription, validatedURL });
    showMainWindow();
  });
  mainWindow.webContents.on('render-process-gone', (_event, details) => {
    console.error('[Renderer] render-process-gone', details);
    showMainWindow();
  });
  setTimeout(showMainWindow, 1500);

  mainWindow.on('close', (e) => {
    if (!isQuitting) e.preventDefault();
  });

  mainWindow.on('maximize', () => mainWindow.webContents.send('win:maximize-changed', true));
  mainWindow.on('unmaximize', () => mainWindow.webContents.send('win:maximize-changed', false));

  if (devServerUrl) {
    setSplashStatus('Загрузка dev renderer...');
    startupMark('renderer load started (dev)');
    mainWindow.loadURL(devServerUrl);
  } else if (fs.existsSync(rendererBuildPath)) {
    setSplashStatus('Загрузка интерфейса...');
    startupMark('renderer load started (built)');
    mainWindow.loadURL(pathToFileURL(rendererBuildPath).toString());
  } else {
    setSplashStatus('Загрузка резервного интерфейса...');
    startupMark('renderer load started (fallback)');
    mainWindow.loadFile(path.join(__dirname, 'index.html'));
  }
}

async function checkAndDownloadUpdate() {
  const done = () => {};

  const config = loadConfig();
  if (config.auto_check_updates === false) { done(); return; }

  const sendStatus = (text) => {
    if (splashWindow && !splashWindow.isDestroyed()) {
      splashWindow.webContents.send('splash-status', text);
    }
  };

  try {
    sendStatus('Проверка обновлений...');

    const res = await Promise.race([
      fetch(UPDATE_CHECK_URL, { redirect: 'follow', headers: { 'User-Agent': 'TaskTracker-Updater' } }),
      new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), 8000)),
    ]);

    if (!res.ok) { done(); return; }

    const data = await res.json();
    const info = data['stable'];
    if (!info?.url) { done(); return; }

    const current = app.getVersion();
    if (!isNewerVersion(info.version, current)) { done(); return; }

    // Обновление найдено — блокируем закрытие сплэша и качаем
    isUpdating = true;
    done(); // updateCheckDone = true, но isUpdating блокирует maybeShowMain
    sendStatus('Загрузка обновления...');

    const appDir = path.dirname(app.getPath('exe'));
    await download(mainWindow, info.url, {
      saveAs:    false,
      directory: appDir,
      onProgress: ({ percent }) => {
        const p = Math.round(percent * 100);
        if (splashWindow && !splashWindow.isDestroyed()) {
          splashWindow.webContents.send('splash-progress', p);
        }
      },
    });

    sendStatus('Установка...');
    const fileName = info.url.split('/').pop();
    const filePath = path.join(appDir, fileName);
    const openResult = await shell.openPath(filePath);
    if (openResult) throw new Error(openResult);
    isQuitting = true;
    app.quit();
  } catch (err) {
    console.error('Update check error:', err.message);
    isUpdating = false;
    done();
  }
}

let jiraCreateWindow = null;
let currentJiraHotkey = null;

function registerJiraHotkey() {
  if (currentJiraHotkey) {
    globalShortcut.unregister(currentJiraHotkey);
    currentJiraHotkey = null;
  }
  // Jira creation is temporarily disabled in the redesigned UI.
  const jiraCreateEnabled = process.env.ENABLE_JIRA_CREATE === '1';
  if (!jiraCreateEnabled) return;

  const config = loadConfig();
  const hotkey = config.jira_hotkey;

  if (!hotkey) return;

  try {
    const success = globalShortcut.register(hotkey, () => {
      openJiraCreateIssueWindow();
    });
    if (success) {
      currentJiraHotkey = hotkey;
    } else {
      console.error('Не удалось зарегистрировать хоткей', hotkey);
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send('hotkey-error', hotkey);
      }
    }
  } catch(e) { 
    console.error('Ошибка регистрации хоткея', e); 
  }
}

function openJiraCreateIssueWindow() {
  if (jiraCreateWindow && !jiraCreateWindow.isDestroyed()) {
    jiraCreateWindow.focus();
    return;
  }
  
  const config = loadConfig();
  const accent = config.accent_color || '#7B5CF5';
  
  jiraCreateWindow = new BrowserWindow({
    width: 650,
    height: 600,
    resizable: true,
    alwaysOnTop: true,
    frame: false,
    transparent: true,
    autoHideMenuBar: true,
    show: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });
  
  jiraCreateWindow.once('ready-to-show', () => {
    jiraCreateWindow.show();
  });
  
  jiraCreateWindow.loadFile(path.join(__dirname, 'jira-create.html'), { query: { accent } });
  
  jiraCreateWindow.on('closed', () => {
    jiraCreateWindow = null;
  });
}

ipcMain.handle('close-jira-window', () => {
  if (jiraCreateWindow && !jiraCreateWindow.isDestroyed()) {
    jiraCreateWindow.close();
  }
});

// ─── IPC: Jira Templates ─────────────────────────────────────────────────────

function getTemplatesPath() {
  return path.join(app.getPath('userData'), 'jira-templates.json');
}

ipcMain.handle('load-jira-templates', () => {
  try {
    const fp = getTemplatesPath();
    if (fs.existsSync(fp)) return JSON.parse(fs.readFileSync(fp, 'utf8'));
  } catch (e) { console.error('load-jira-templates error:', e.message); }
  return [];
});

ipcMain.handle('save-jira-template', (_e, template) => {
  try {
    const fp = getTemplatesPath();
    let templates = [];
    if (fs.existsSync(fp)) templates = JSON.parse(fs.readFileSync(fp, 'utf8'));
    // Replace if same name exists
    const idx = templates.findIndex(t => t.name === template.name);
    if (idx >= 0) templates[idx] = template;
    else templates.push(template);
    fs.writeFileSync(fp, JSON.stringify(templates, null, 2), 'utf8');
    return true;
  } catch (e) { console.error('save-jira-template error:', e.message); return false; }
});

ipcMain.handle('delete-jira-template', (_e, name) => {
  try {
    const fp = getTemplatesPath();
    if (!fs.existsSync(fp)) return true;
    let templates = JSON.parse(fs.readFileSync(fp, 'utf8'));
    templates = templates.filter(t => t.name !== name);
    fs.writeFileSync(fp, JSON.stringify(templates, null, 2), 'utf8');
    return true;
  } catch (e) { console.error('delete-jira-template error:', e.message); return false; }
});

app.whenReady().then(() => {
  startupMark('app.whenReady');
  createSplash();
  setSplashStatus('Подготовка данных...');
  initDataPath();
  startupMark('initDataPath done');
  createWindow();
  setSplashStatus('Регистрация горячих клавиш...');
  registerJiraHotkey();
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin' && isQuitting) app.quit();
});

app.on('will-quit', (e) => {
  globalShortcut.unregisterAll();
  if (!isQuitting) e.preventDefault();
});

// ─── IPC: задачи ─────────────────────────────────────────────────────────────

function loadTasks() {
  try {
    if (fs.existsSync(dataPath)) {
      const content = fs.readFileSync(dataPath, 'utf8');
      return JSON.parse(content);
    }
  } catch (e) {
    console.error('Ошибка загрузки задач:', e.message);
  }
  return [];
}

function saveTasks(tasks) {
  try {
    fs.writeFileSync(dataPath, JSON.stringify(tasks, null, 2), 'utf8');
  } catch (e) {
    console.error('Ошибка сохранения задач:', e.message);
    throw new Error('Не удалось сохранить задачи');
  }
}

function todayPrefix() {
  const d = new Date();
  const pad = n => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}`;
}

// ─── IPC: заметки ────────────────────────────────────────────────────────────

function sanitizeFilename(title) {
  return String(title || '').replace(/[\\/:*?"<>|]/g, '-').replace(/\s+/g, ' ').trim().replace(/[. ]+$/, '') || 'Без названия';
}

ipcMain.handle('open-notes-folder', () => shell.openPath(notesDir));

ipcMain.handle('load-notes', () => {
  try {
    return fs.readdirSync(notesDir)
      .filter(f => f.endsWith('.md'))
      .map(file => {
        const id   = path.basename(file, '.md');
        const fp   = path.join(notesDir, file);
        const stat = fs.statSync(fp);
        return { id, title: id, content: fs.readFileSync(fp, 'utf8'), updated_at: stat.mtime.toISOString() };
      });
  } catch (e) { console.error('load-notes error:', e.message); return []; }
});

ipcMain.handle('save-note', (_e, { id, title, content }) => {
  try {
    const newId = sanitizeFilename(title);
    const newFp = path.join(notesDir, newId + '.md');
    const oldFp = id ? path.join(notesDir, id + '.md') : null;
    if (id && id !== newId && fs.existsSync(newFp)) {
      return { success: false, error: 'NOTE_ALREADY_EXISTS' };
    }
    if (id && id !== newId) {
      if (fs.existsSync(oldFp)) fs.renameSync(oldFp, newFp);
    }
    fs.writeFileSync(newFp, content || '', 'utf8');
    return { success: true, id: newId, title: newId, updated_at: fs.statSync(newFp).mtime.toISOString() };
  } catch (e) { console.error('save-note error:', e.message); return { success: false, error: 'SAVE_NOTE_FAILED' }; }
});

ipcMain.handle('delete-note', (_e, id) => {
  try {
    const fp = path.join(notesDir, id + '.md');
    if (fs.existsSync(fp)) fs.unlinkSync(fp);
    return true;
  } catch (e) { console.error('delete-note error:', e.message); return false; }
});

// ─── IPC: задачи ─────────────────────────────────────────────────────────────

ipcMain.handle('save-task', (_e, task) => { const t = loadTasks(); t.push(task); saveTasks(t); return true; });
ipcMain.handle('load-tasks', () => loadTasks());
ipcMain.handle('get-data-path', () => dataPath);
ipcMain.handle('open-data-path', () => { shell.openPath(dataPath); });
ipcMain.handle('clear-today-tasks', () => {
  const t = loadTasks();
  const today = todayPrefix();
  const filtered = t.filter(task => task.date !== today);
  saveTasks(filtered);
  return true;
});

// ─── IPC: уведомления ────────────────────────────────────────────────────────

ipcMain.on('notify', (_e, { title, body }) => {
  if (Notification.isSupported()) new Notification({ title, body }).show();
});

// ─── IPC: настройки ──────────────────────────────────────────────────────────

function loadConfig() {
  try {
    if (fs.existsSync(configPath)) {
      const content = fs.readFileSync(configPath, 'utf8');
      const config = JSON.parse(content);
      return config;
    }
  } catch (e) {
    console.error('Ошибка загрузки конфигурации:', e.message);
  }
  return { username: 'User' };
}

function saveConfig(config) {
  try {
    fs.writeFileSync(configPath, JSON.stringify(config, null, 2), 'utf8');
  } catch (e) {
    console.error('Ошибка сохранения конфигурации:', e.message);
    throw new Error('Не удалось сохранить конфигурацию');
  }
}

ipcMain.handle('load-config', () => {
  const config = loadConfig();
  config.jira_url = JIRA_URL;
  config.jira_project = JIRA_DEFAULT_PROJECT;
  return config;
});
ipcMain.handle('save-config', (_e, config) => {
  // Защита от затирания паролей: так как настройки сохраняются поверх файла, 
  // мы берём актуальные захэшированные пароли с диска (которые обновляются через save-calendar-credentials / save-jira-credentials)
  const currentConfig = loadConfig();
  if (currentConfig.caldav_pass !== undefined) config.caldav_pass = currentConfig.caldav_pass;
  if (currentConfig.caldav_user !== undefined && !config.caldav_user) config.caldav_user = currentConfig.caldav_user;
  if (currentConfig.jira_pass !== undefined) config.jira_pass = currentConfig.jira_pass;
  
  saveConfig(config);
  registerJiraHotkey();
  return true;
});

ipcMain.handle('save-calendar-credentials', (_e, { user, pass }) => {
  const config = loadConfig();
  config.caldav_user = user;
  if (pass !== undefined) {
    if (pass) {
      if (safeStorage.isEncryptionAvailable()) {
        config.caldav_pass = safeStorage.encryptString(pass).toString('base64');
      } else {
        config.caldav_pass = pass;
      }
    } else {
      config.caldav_pass = '';
    }
  }
  saveConfig(config);
  return true;
});

ipcMain.handle('get-calendar-credentials', () => {
  const config = loadConfig();
  let user = config.caldav_user || '';
  let pass = '';
  if (config.caldav_pass) {
    if (safeStorage.isEncryptionAvailable()) {
      try {
        pass = safeStorage.decryptString(Buffer.from(config.caldav_pass, 'base64'));
      } catch (e) {
        console.error('Failed to decrypt caldav password', e);
      }
    } else {
      pass = config.caldav_pass;
    }
  }
  return { user, pass };
});

// ─── IPC: Jira Credentials ───────────────────────────────────────────────────

ipcMain.handle('save-jira-credentials', (_e, { pass }) => {
  const config = loadConfig();
  if (pass !== undefined) {
    if (pass) {
      if (safeStorage.isEncryptionAvailable()) {
        config.jira_pass = safeStorage.encryptString(pass).toString('base64');
      } else {
        config.jira_pass = pass;
      }
    } else {
      config.jira_pass = '';
    }
  }
  saveConfig(config);
  registerJiraHotkey(); // Обновляем хоткей, если он поменялся (saveSettings вызывает saveConfig, но отдельно)
  return true;
});

ipcMain.handle('get-jira-credentials', () => {
  const config = loadConfig();
  let pass = '';
  if (config.jira_pass) {
    if (safeStorage.isEncryptionAvailable()) {
      try {
        pass = safeStorage.decryptString(Buffer.from(config.jira_pass, 'base64'));
      } catch (e) {
        console.error('Failed to decrypt Jira password', e);
      }
    } else {
      pass = config.jira_pass;
    }
  }
  return { pass };
});

async function jiraRequest(method, endpoint, body = null, isFormData = false) {
  const config = loadConfig();
  if (!config.jira_url || !config.jira_user) throw new Error("Jira URL or User is missing configuration");
  
  const baseUrl = JIRA_URL.replace(/\/$/, '');
  const url = `${baseUrl}${endpoint}`;
  
  let pass = '';
  if (config.jira_pass) {
    if (safeStorage.isEncryptionAvailable()) {
      try { pass = safeStorage.decryptString(Buffer.from(config.jira_pass, 'base64')); } 
      catch (e) { console.error('Failed to decrypt Jira password', e); }
    } else { pass = config.jira_pass; }
  }
  if (!pass) throw new Error("Пароль от Jira не указан в настройках");
  
  const auth = Buffer.from(`${config.jira_user}:${pass}`).toString('base64');
  
  const headers = { 'Authorization': `Basic ${auth}` };
  
  if (!isFormData) {
    headers['Content-Type'] = 'application/json';
    headers['Accept'] = 'application/json';
  } else {
    headers['X-Atlassian-Token'] = 'no-check'; 
  }
  
  const fetchOpts = { method, headers };
  if (body) fetchOpts.body = body;
  
  const response = await fetch(url, fetchOpts);
  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Jira HTTP Error ${response.status}: ${errorText}`);
  }
  
  return response.json();
}

ipcMain.handle('get-jira-components', async (_e, projectKey) => {
  try {
    const data = await jiraRequest('GET', `/rest/api/2/project/${projectKey}/components`);
    return { success: true, data };
  } catch (err) {
    return { success: false, error: err.message };
  }
});

ipcMain.handle('get-jira-versions', async (_e, projectKey) => {
  try {
    // Получаем невыпущенные версии
    const data = await jiraRequest('GET', `/rest/api/2/project/${projectKey}/versions`);
    const unreleased = Array.isArray(data) ? data.filter(v => !v.released) : [];
    return { success: true, data: unreleased };
  } catch (err) {
    return { success: false, error: err.message };
  }
});

ipcMain.handle('get-jira-fields', async () => {
  try {
    const data = await jiraRequest('GET', '/rest/api/2/field');
    return { success: true, data };
  } catch (err) {
    return { success: false, error: err.message };
  }
});

ipcMain.handle('get-jira-labels', async (_e, query) => {
  try {
    const data = await jiraRequest('GET', `/rest/api/1.0/labels/suggest?query=${encodeURIComponent(query || '')}`);
    return { success: true, data };
  } catch (err) {
    return { success: false, error: err.message };
  }
});

ipcMain.handle('get-jira-createmeta', async (_e, projectKey) => {
  try {
    const data = await jiraRequest('GET', `/rest/api/2/issue/createmeta?projectKeys=${projectKey}&expand=projects.issuetypes.fields`);
    return { success: true, data };
  } catch (err) {
    return { success: false, error: err.message };
  }
});

ipcMain.handle('get-jira-epics', async (_e, projectKey) => {
  try {
    const jql = `project=${projectKey} AND issuetype=Epic AND resolution=Unresolved ORDER BY updated DESC`;
    const data = await jiraRequest('GET', `/rest/api/2/search?jql=${encodeURIComponent(jql)}&fields=summary&maxResults=100`);
    return { success: true, data };
  } catch (err) {
    return { success: false, error: err.message };
  }
});

ipcMain.handle('create-jira-issue', async (_e, payload) => {
  try {
    const data = await jiraRequest('POST', '/rest/api/2/issue', JSON.stringify(payload));
    return { success: true, data };
  } catch (err) {
    return { success: false, error: err.message };
  }
});

const FormData = require('form-data');

ipcMain.handle('upload-jira-attachments', async (_e, issueKey, attachments) => {
  try {
    const form = new FormData();
    for (const attachment of attachments) {
      const buffer = Buffer.from(attachment.data);
      form.append('file', buffer, { filename: attachment.name, contentType: attachment.type });
    }
    
    // Вызов jiraRequest напрямую не подходит т.к. нужно добавить boundary заголовки формы
    const config = loadConfig();
    const baseUrl = JIRA_URL.replace(/\/$/, '');
    const url = `${baseUrl}/rest/api/2/issue/${issueKey}/attachments`;
    
    let pass = '';
    if (config.jira_pass) {
      if (safeStorage.isEncryptionAvailable()) {
        try { pass = safeStorage.decryptString(Buffer.from(config.jira_pass, 'base64')); } 
        catch (e) {}
      } else { pass = config.jira_pass; }
    }
    
    const auth = Buffer.from(`${config.jira_user}:${pass}`).toString('base64');
    
    const response = await fetch(url, {
      method: 'POST',
      headers: { 
        'Authorization': `Basic ${auth}`,
        'X-Atlassian-Token': 'no-check',
        ...form.getHeaders()
      },
      body: form
    });
    
    if (!response.ok) {
      const text = await response.text();
      return { success: false, error: `Jira File Upload Error ${response.status}: ${text}` };
    }
    
    return { success: true, data: await response.json() };
  } catch (err) {
    return { success: false, error: err.message };
  }
});

// ─── IPC: закрытие ───────────────────────────────────────────────────────────

ipcMain.on('close-app', () => {
  isQuitting = true;
  app.quit();
});

// ─── IPC: закрепление окна ───────────────────────────────────────────────────

ipcMain.handle('set-always-on-top', (_e, value) => {
  if (mainWindow) {
    mainWindow.setAlwaysOnTop(value);
    return true;
  }
  return false;
});

ipcMain.handle('is-always-on-top', () => {
  if (mainWindow) {
    return mainWindow.isAlwaysOnTop();
  }
  return true; // По умолчанию окно закреплено
});

// ─── IPC: размеры и позиция окна ─────────────────────────────────────────────

ipcMain.handle('get-window-bounds', () => mainWindow?.getBounds());
ipcMain.handle('set-window-bounds', (_e, b) => mainWindow?.setBounds(b));
ipcMain.handle('win:minimize', () => mainWindow?.minimize());
ipcMain.handle('win:toggle-maximize', () => {
  if (!mainWindow) return false;
  if (mainWindow.isMaximized()) mainWindow.unmaximize();
  else mainWindow.maximize();
  return mainWindow.isMaximized();
});
ipcMain.handle('win:close', () => {
  isQuitting = true;
  app.quit();
});
ipcMain.handle('win:is-maximized', () => mainWindow?.isMaximized() ?? false);
ipcMain.handle('load-window-state', () => {
  const config = loadConfig();
  return config.window_state || {};
});
ipcMain.handle('save-window-state', (_e, nextState) => {
  const config = loadConfig();
  config.window_state = { ...(config.window_state || {}), ...(nextState || {}) };
  saveConfig(config);
  return true;
});

// ─── IPC: Kanban API ─────────────────────────────────────────────────────

async function kanbanRequest(label, method, url, token = null, body = null) {
  const headers = { 'Content-Type': 'application/json' };
  if (token) headers['Authorization'] = `Bearer ${token}`;

  console.log('═══════════════════════════════════════════════════════════════');
  console.log(`[Kanban] ${label}`);
  console.log('───────────────────────────────────────────────────────────────');
  
  // Убираем пароль из URL для логов
  const safeUrl = url.replace(/password=[^&]*/, 'password=***');
  
  console.log(`URL: ${safeUrl}`);
  console.log(`Method: ${method}`);
  console.log(`Headers: Content-Type: application/json${token ? ', Authorization: Bearer ***' : ''}`);
  
  if (body) {
    const safeBody = { ...body };
    if (safeBody.password) safeBody.password = '***';
    console.log(`Body: ${JSON.stringify(safeBody)}`);
  }
  
  console.log('───────────────────────────────────────────────────────────────');
  
  let curlCmd = `curl -X ${method} "${safeUrl}" -H "Content-Type: application/json"`;
  if (token) curlCmd += ' -H "Authorization: Bearer ***"';
  if (body) {
    const safeBody = { ...body };
    if (safeBody.password) safeBody.password = '***';
    curlCmd += ` -d '${JSON.stringify(safeBody)}'`;
  }
  console.log(curlCmd);
  console.log('═══════════════════════════════════════════════════════════════');

  try {
    const fetchOpts = { method, headers };
    if (body) fetchOpts.body = JSON.stringify(body);
    const response = await fetch(url, fetchOpts);
    console.log(`✓ Status: ${response.status} ${response.statusText}`);

    if (!response.ok) {
      const errorText = await response.text();
      console.error(`✗ Error: ${errorText}`);
      throw new Error(errorText || `HTTP ${response.status}`);
    }

    const data = await response.json();
    console.log(`✓ Response:`, redactSensitive(data));
    return { success: true, data };
  } catch (error) {
    console.error(`✗ Error: ${error.message}`);
    return { success: false, error: error.message };
  }
}

ipcMain.handle('kanban-login', async (_e, { email, password }) => {
  const url = `${KANBAN_API_BASE_URL}/api/auth/token?email=${encodeURIComponent(email)}&password=${encodeURIComponent(password)}`;
  return kanbanRequest('Авторизация', 'POST', url);
});

ipcMain.handle('kanban-get-user-info', async (_e, { token }) => {
  return kanbanRequest('Получение информации о пользователе', 'GET', `${KANBAN_API_BASE_URL}/api/auth/user`, token);
});

ipcMain.handle('kanban-get-tasks', async (_e, { userId, token }) => {
  return kanbanRequest('Получение списка задач', 'GET', `${KANBAN_API_BASE_URL}/api/user/${userId}/task/legacy`, token);
});

ipcMain.handle('kanban-get-task', async (_e, { taskId, token }) => {
  return kanbanRequest('Получение задачи', 'GET', `${KANBAN_API_BASE_URL}/api/task/${taskId}`, token);
});

ipcMain.handle('kanban-update-task-stage', async (_e, { taskId, stageId, token }) => {
  const url = `${KANBAN_API_BASE_URL}/api/task/${taskId}`;
  return kanbanRequest('Смена статуса задачи', 'PATCH', url, token, { stage_id: stageId });
});

ipcMain.handle('kanban-log-work', async (_e, { taskId, begin, comment, time, token }) => {
  const url = `${KANBAN_API_BASE_URL}/api/task/${taskId}/work`;
  return kanbanRequest('Запись времени', 'POST', url, token, { begin, comment, time, overtime: false });
});

ipcMain.handle('get-kanban-base-url', async () => {
  return KANBAN_API_BASE_URL;
});

ipcMain.handle('open-external', async (_e, url) => {
  if (url) {
    try {
      const parsedUrl = new URL(url);
      if (parsedUrl.protocol === 'http:' || parsedUrl.protocol === 'https:') {
        shell.openExternal(url);
      } else {
        console.warn(`Blocked attempt to open external URL with dangerous protocol: ${url}`);
      }
    } catch (e) {
      console.warn(`Blocked attempt to open invalid URL: ${url}`);
    }
  }
});

// ─── IPC: Calendar CalDAV ─────────────────────────────────────────────────

function expandAndSerialize(data, userEmail) {
  const result = {};
  const now = new Date();
  const rangeStart = new Date(now); rangeStart.setDate(rangeStart.getDate() - 30);
  const rangeEnd = new Date(now); rangeEnd.setDate(rangeEnd.getDate() + 60);
  const normalizedEmail = (userEmail || '').toLowerCase();

  // Helper: extract user's PARTSTAT from ATTENDEE list
  function getPartstat(item) {
    if (!item.attendee) return null;
    const attendees = Array.isArray(item.attendee) ? item.attendee : [item.attendee];
    
    // First try to match current user's email
    if (normalizedEmail) {
      for (const att of attendees) {
        if (!att) continue;
        const attEmail = (typeof att === 'string' ? att : (att.val || '')).toLowerCase().replace('mailto:', '');
        if (attEmail === normalizedEmail && att.params && att.params.PARTSTAT) {
//          console.log(`[CalDAV] Match found for ${normalizedEmail}: ${att.params.PARTSTAT}`);
          return att.params.PARTSTAT;
        }
      }
    }
    
    // Fallback: return first attendee with PARTSTAT
    for (const att of attendees) {
      if (att && att.params && att.params.PARTSTAT) {
        return att.params.PARTSTAT;
      }
    }
    return null;
  }

  for (const key in data) {
    if (!Object.hasOwn(data, key)) continue;
    const item = data[key];
    if (item.type !== 'VEVENT') {
      result[key] = JSON.parse(JSON.stringify(item));
      continue;
    }

    // If has RRULE, expand occurrences
    if (item.rrule) {
      try {
        const duration = (item.end && item.start) ? (new Date(item.end) - new Date(item.start)) : 3600000;
        const dates = item.rrule.between(rangeStart, rangeEnd, true);
        dates.forEach((date, i) => {
          const endDate = new Date(date.getTime() + duration);
          result[key + '_occ_' + i] = {
            type: 'VEVENT',
            summary: typeof item.summary === 'object' ? item.summary.val : String(item.summary || ''),
            description: item.description ? (typeof item.description === 'object' ? item.description.val : String(item.description)) : '',
            location: item.location ? (typeof item.location === 'object' ? item.location.val : String(item.location)) : '',
            url: item.url ? (typeof item.url === 'object' ? item.url.val : String(item.url)) : '',
            start: date.toISOString(),
            end: endDate.toISOString(),
            partstat: getPartstat(item),
            icsUrl: item.icsUrl || null
          };
        });
      } catch (e) {
        // Fallback: just serialize the base event
        try { 
          result[key] = JSON.parse(JSON.stringify(item));
          if (item.icsUrl) result[key].icsUrl = item.icsUrl;
        } catch(e2) {}
      }
    } else {
      // Non-recurring event, just serialize
      try {
        result[key] = {
          type: 'VEVENT',
          summary: typeof item.summary === 'object' ? item.summary.val : String(item.summary || ''),
          description: item.description ? (typeof item.description === 'object' ? item.description.val : String(item.description)) : '',
          location: item.location ? (typeof item.location === 'object' ? item.location.val : String(item.location)) : '',
          url: item.url ? (typeof item.url === 'object' ? item.url.val : String(item.url)) : '',
          start: item.start ? new Date(item.start).toISOString() : null,
          end: item.end ? new Date(item.end).toISOString() : null,
          partstat: getPartstat(item),
          icsUrl: item.icsUrl || null
        };
      } catch(e) {}
    }
  }
  return result;
}

async function fetchCalendarCalDav(url, user, pass) {
  try {
    const headers = { 
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) TaskTracker/1.0',
      'Accept': 'text/calendar, text/html, *.*'
    };

    if (user && pass) {
      const auth = Buffer.from(`${user}:${pass}`).toString('base64');
      headers['Authorization'] = `Basic ${auth}`;
    }

    // Try fetching as-is first (with ?export for trailing slash URLs)
    const fetchUrl = url.endsWith('/') ? url + '?export' : url;
    const response = await fetch(fetchUrl, { method: 'GET', headers });
    
    if (!response.ok) {
      const text = await response.text();
      console.error('CalDAV fetch error:', response.status, text);
      throw new Error(`HTTP ${response.status}`);
    }
    
    const text = await response.text();
    const contentType = response.headers.get('content-type') || '';
//    console.log('[CalDAV] Response content-type:', contentType);

    // Check if response is a directory listing (Yandex returns text/plain with .ics paths)
    if (contentType.includes('text/plain') && text.trim().includes('.ics')) {
//      console.log('[CalDAV] Got directory listing, fetching individual .ics files...');
      const lines = text.trim().split('\n').map(l => l.trim()).filter(l => l.endsWith('.ics'));
      
      // Build base URL from the calendar URL
      const parsedUrl = new URL(url);
      const baseUrl = `${parsedUrl.protocol}//${parsedUrl.host}`;
      
      let allParsed = {};
      let fetchedCount = 0;
      
      // Fetch in parallel batches of 10
      const batchSize = 10;
      for (let i = 0; i < lines.length; i += batchSize) {
        const batch = lines.slice(i, i + batchSize);
        const results = await Promise.allSettled(
          batch.map(async (icsPath) => {
            const icsUrl = baseUrl + icsPath;
            const icsResp = await fetch(icsUrl, { method: 'GET', headers });
            if (icsResp.ok) return { icsText: await icsResp.text(), icsUrl };
            return null;
          })
        );
        
        for (const r of results) {
          if (r.status === 'fulfilled' && r.value) {
            const parsed = ical.parseICS(r.value.icsText);
            for (const k in parsed) {
              if (parsed[k].type === 'VEVENT') {
                parsed[k].icsUrl = r.value.icsUrl;
                fetchedCount++;
              }
            }
            Object.assign(allParsed, parsed);
          }
        }
      }
      
//      console.log(`[CalDAV] Fetched ${fetchedCount} events from ${lines.length} .ics files`);
      const expanded = expandAndSerialize(allParsed, user);
//      console.log(`[CalDAV] After expanding recurrences: ${Object.keys(expanded).length} total entries`);
      return { success: true, data: expanded };
    }

    // Standard ICS response
    const data = ical.parseICS(text);
    // Add primary URL to all events
    for (const k in data) if (data[k].type === 'VEVENT') data[k].icsUrl = url;

    const expanded = expandAndSerialize(data, user);
    const eventCount = Object.values(expanded).filter(v => v.type === 'VEVENT').length;
//    console.log('[CalDAV] Fetched successfully. Total events:', eventCount);
    return { success: true, data: expanded };
  } catch (error) {
    return { success: false, error: error.message };
  }
}

ipcMain.handle('fetch-calendar-caldav', async (_e, url) => {
  try {
    const parsedUrl = new URL(url);
    if (parsedUrl.protocol !== 'http:' && parsedUrl.protocol !== 'https:') {
      return { success: false, error: 'Invalid protocol' };
    }
    
    const config = loadConfig();
    let user = config.caldav_user || '';
    let pass = '';
    if (config.caldav_pass) {
      if (safeStorage.isEncryptionAvailable()) {
        try {
          pass = safeStorage.decryptString(Buffer.from(config.caldav_pass, 'base64'));
        } catch (e) { console.error('Failed to decrypt caldav password', e); }
      } else {
        pass = config.caldav_pass;
      }
    }

    return await fetchCalendarCalDav(url, user, pass);
  } catch (e) {
    return { success: false, error: 'Invalid URL' };
  }
});

// ─── IPC: обновления ─────────────────────────────────────────────────────────

function parseVer(v) {
  const [main, pre] = v.split('-');
  const parts = main.split('.');
  while (parts.length < 3) parts.push('0');
  const full = parts.join('.') + (pre ? `-${pre}` : '');
  return semver.parse(full);
}

function isNewerVersion(latest, current) {
  const l = parseVer(latest);
  const c = parseVer(current);
  return l && c ? semver.gt(l, c) : false;
}

ipcMain.handle('get-app-version', () => app.getVersion());

ipcMain.handle('check-updates', async (_e, channel) => {
  try {
    const res = await fetch(UPDATE_CHECK_URL, {
      redirect: 'follow',
      headers: { 'User-Agent': 'TaskTracker-Updater' },
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    const info = data[channel] ?? data['stable'];
    if (!info) throw new Error('Unknown channel');
    const current = app.getVersion();
    const hasUpdate = isNewerVersion(info.version, current);
    return { success: true, hasUpdate, current, ...info };
  } catch (err) {
    return { success: false, error: err.message };
  }
});

// ─── IPC: окно напоминания о созвоне ─────────────────────────────────────────

ipcMain.handle('show-meeting-reminder', (_e, data) => {
  if (reminderWindow && !reminderWindow.isDestroyed()) {
    reminderData = data;
    reminderWindow.webContents.send('reminder-update', data);
    reminderWindow.focus();
    return;
  }
  const primaryDisplay = screen.getPrimaryDisplay();
  const { x, y, width, height } = primaryDisplay.workArea;
  const winWidth  = 320;
  const winHeight = 290;

  reminderData   = data;
  reminderWindow = new BrowserWindow({
    x:              x + Math.floor((width - winWidth) / 2),
    y:              y + Math.floor((height - winHeight) / 2),
    width:          winWidth,
    height:         winHeight,
    resizable:      false,
    alwaysOnTop:    true,
    frame:          false,
    transparent:    true,
    hasShadow:      false,
    roundedCorners: true,
    skipTaskbar:    true,
    show:           false,
    // Удаляем parent: mainWindow, чтобы окно могло свободно позиционироваться на другом мониторе
    webPreferences: {
      preload:          path.join(__dirname, 'reminder-preload.js'),
      contextIsolation: true,
      nodeIntegration:  false,
    },
  });
  
  // Дополнительно форсируем поверх всех окон и принудительно ставим позицию на основной монитор
  reminderWindow.setAlwaysOnTop(true, 'screen-saver');
  reminderWindow.setPosition(x + Math.floor((width - winWidth) / 2), y + Math.floor((height - winHeight) / 2));
  
  reminderWindow.loadFile(path.join(__dirname, 'reminder.html'));
  
  reminderWindow.once('ready-to-show', () => {
    if (reminderWindow && !reminderWindow.isDestroyed()) {
      reminderWindow.show();
    }
  });
  
  // Workaround for Electron Windows bug: Secondary frameless transparent windows can 
  // crash the app when closed. We intercept the 'close' event, hide the window first,
  // and destroy it asynchronously.
  reminderWindow.on('close', (e) => {
    if (reminderWindow && !reminderWindow.isDestroyed()) {
      e.preventDefault();
      reminderWindow.hide();
      setTimeout(() => {
        if (reminderWindow && !reminderWindow.isDestroyed()) {
          if (mainWindow && !mainWindow.isDestroyed()) {
            mainWindow.webContents.send('stop-all-sounds');
          }
          reminderWindow.destroy();
          reminderWindow = null;
        }
      }, 100);
    }
  });

  reminderWindow.on('closed', () => { reminderWindow = null; });
});

ipcMain.handle('get-reminder-data', () => reminderData);
ipcMain.on('destroy-reminder', () => {
  if (reminderWindow && !reminderWindow.isDestroyed()) {
    // Simply closing it will trigger the 'close' event and our safe-close workaround
    reminderWindow.close();
  }
});

ipcMain.handle('reminder-join-meeting', async (_e, payload) => {
  const { url, shouldStartTask, task } = payload || {};

  if (shouldStartTask && task && mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('reminder-start-task', task);
  }

  if (url) {
    try {
      const parsedUrl = new URL(url);
      if (parsedUrl.protocol === 'http:' || parsedUrl.protocol === 'https:') {
        await shell.openExternal(url);
      }
    } catch (e) {
      console.warn(`Blocked reminder join with invalid URL: ${url}`);
    }
  }

  if (reminderWindow && !reminderWindow.isDestroyed()) {
    reminderWindow.close();
  }

  return true;
});

ipcMain.handle('download-update', async (_e, url) => {
  try {
    // Директория, где находится исполняемый файл приложения
    const appDir = path.dirname(app.getPath('exe'));

    const parsedUrl = new URL(url);
    if (parsedUrl.protocol !== 'http:' && parsedUrl.protocol !== 'https:') {
      throw new Error('Invalid update URL protocol');
    }

    await download(mainWindow, url, {
      saveAs: false,
      directory: appDir,
      onProgress: ({ percent }) => {
        mainWindow.webContents.send('update-progress', Math.round(percent * 100));
      },
    });
    const fileName = url.split('/').pop();
    if (!fileName.endsWith('.exe')) {
      throw new Error('Update file is not an executable');
    }
    
    const filePath = path.join(appDir, fileName);
    const openResult = await shell.openPath(filePath);
    if (openResult) throw new Error(openResult);
    isQuitting = true;
    app.quit();
    return { success: true };
  } catch (err) {
    return { success: false, error: err.message };
  }
});

function decryptValue(value) {
  if (!value) return '';
  if (safeStorage && safeStorage.isEncryptionAvailable()) {
    try {
      return safeStorage.decryptString(Buffer.from(value, 'base64'));
    } catch (e) { return value; }
  }
  return value;
}

ipcMain.handle('update-calendar-rsvp', async (_e, { icsUrl, newStatus }) => {
  try {
    if (!icsUrl) throw new Error('No ICS URL provided');
    const config = loadConfig();
    const user = config.caldav_user || '';
    const pass = decryptValue(config.caldav_pass);

    // Fetch original ICS
    const headers = { 
      'User-Agent': 'Mozilla/5.0 TaskTracker/1.0',
      'Accept': 'text/calendar'
    };
    if (user && pass) {
      const auth = Buffer.from(`${user}:${pass}`).toString('base64');
      headers['Authorization'] = `Basic ${auth}`;
    }

    const resp = await fetch(icsUrl, { method: 'GET', headers });
    if (!resp.ok) throw new Error(`Fetch failed: ${resp.status}`);
    const etag = resp.headers.get('etag');
    let icsText = await resp.text();

//    console.log(`[CalDAV] Updating RSVP for ${user} to ${newStatus} in ${icsUrl}`);
    // console.log('[CalDAV] Original ICS snippet:', icsText.substring(0, 500));

    // Regex to find user's ATTENDEE line and replace PARTSTAT
    const emailEscaped = user.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const attendeeRegex = new RegExp(`(ATTENDEE;[^\\n]*${emailEscaped}[^\\n]*)`, 'i');
    const match = icsText.match(attendeeRegex);

    if (match) {
      let attendeeLine = match[0];
//      console.log('[CalDAV] Found attendee line:', attendeeLine);
      if (attendeeLine.toUpperCase().includes('PARTSTAT=')) {
        attendeeLine = attendeeLine.replace(/PARTSTAT=[A-Z-]+/i, `PARTSTAT=${newStatus}`);
      } else {
        attendeeLine = attendeeLine.replace('ATTENDEE;', `ATTENDEE;PARTSTAT=${newStatus};`);
      }
      icsText = icsText.replace(match[0], attendeeLine);
    } else {
      throw new Error('User not found in event attendees');
    }

    // Increment SEQUENCE if exists
    icsText = icsText.replace(/SEQUENCE:(\d+)/i, (_m, seq) => `SEQUENCE:${parseInt(seq) + 1}`);
    
    // Update DTSTAMP
    const nowIcs = new Date().toISOString().replace(/[-:]/g, '').split('.')[0] + 'Z';
    icsText = icsText.replace(/DTSTAMP:\d+T\d+Z/i, `DTSTAMP:${nowIcs}`);

    const putHeaders = { 
      ...headers, 
      'Content-Type': 'text/calendar; charset=utf-8'
    };
    if (etag) putHeaders['If-Match'] = etag;

    const putResp = await fetch(icsUrl, {
      method: 'PUT',
      headers: putHeaders,
      body: icsText
    });

    if (!putResp.ok) {
      const errorBody = await putResp.text();
      console.error('[CalDAV] PUT failed:', putResp.status, errorBody);
      throw new Error(`PUT failed: ${putResp.status}`);
    }
    
//    console.log(`[CalDAV] RSVP updated successfully for ${icsUrl}`);
    return { success: true };
  } catch (error) {
    console.error('[CalDAV] RSVP error:', error);
    return { success: false, error: error.message };
  }
});

