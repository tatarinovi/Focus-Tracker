import { $, escapeHtml, setButtonLoading, openUrl } from './utils.js';
import { state } from './state.js';
import { store } from './store.js';
import { showNotification } from './notifications.js';
import { startTask, saveCurrentTask, currentTaskMs } from './timer.js';
import { isAuthorized, getDisplayName, renderSettingsUI } from './settings.js';
import DOMPurify from '../node_modules/dompurify/dist/purify.es.mjs';

// Колбэк для уведомления lunch.js об уходе с обеда через Kanban.
// Регистрируется из renderer.js, чтобы избежать циклической зависимости с lunch.js.
let _onSwitchFromLunch = () => {};
export function registerSwitchFromLunchHandler(fn) { _onSwitchFromLunch = fn; }

let kanbanViewMode = localStorage.getItem('kanbanViewMode') || 'list';
let selectedProjects  = [];
let selectedPriorities = [];
let pinnedTaskIds = new Set();
let kanbanAutoRefreshTimer = null;
function loadPinnedTasks() {
  try { pinnedTaskIds = new Set(JSON.parse(localStorage.getItem('pinnedKanbanTasks') || '[]')); }
  catch { pinnedTaskIds = new Set(); }
}
function togglePinTask(id) {
  if (pinnedTaskIds.has(id)) pinnedTaskIds.delete(id);
  else pinnedTaskIds.add(id);
  localStorage.setItem('pinnedKanbanTasks', JSON.stringify([...pinnedTaskIds]));
  applyFilters();
}
const priorityLabels = { high: 'Высокий', medium: 'Средний', low: 'Низкий' };

let currentTaskDetail = null;
let pendingName = '', pendingUrl = '', pendingTask = null;

async function updateTaskStage(taskId, stageId) {
  if (!taskId || !store.cfg?.kanban?.token) return;
  return await window.api.kanbanUpdateTaskStage(taskId, stageId, store.cfg.kanban.token);
}

function refreshBoardIfNeeded() {
  if (kanbanViewMode === 'board' && store.allKanbanTasks.length) loadKanbanTasks();
}

export function invalidateKanbanCache() {
  store.allKanbanTasks = [];
  store.kanbanCache.fetchedAt = 0;
  store.kanbanCache.inFlight = null;
  store.taskDetailsCache = {};
}

export function configureKanbanAutoRefresh() {
  if (kanbanAutoRefreshTimer) clearInterval(kanbanAutoRefreshTimer);
  kanbanAutoRefreshTimer = setInterval(async () => {
    if (!isAuthorized()) return;
    invalidateKanbanCache();
    await loadKanbanTasks({ force: true, silent: true });
  }, 15 * 60 * 1000);
}

export function logCurrentTaskWork() {
  const taskId = state.taskId;
  const token  = store.cfg?.kanban?.token;
  if (!taskId || !token || state.isLunch) return;
  const ms = currentTaskMs();
  if (ms < 1000) return;
  const minutes = ms / 60000;
  const time    = Math.ceil(minutes / 15) * 15;
  const begin   = (state.taskBeginTime || new Date()).toISOString();
  const comment = (state.taskComment || '').trim() + ' | Task Tracker';
  window.api.kanbanLogWork(taskId, begin, comment, time, token);
}

export async function closeCurrentKanbanTask() {
  if (!state.taskId || state.isLunch) return;
  await updateTaskStage(state.taskId, 3);
}

// ── Утилиты ───────────────────────────────────────────────────────────────────

export function getPriorityInfo(priority) {
  if (priority === undefined || priority === null) return { pc: 'low', pl: 'Низкий' };
  if (typeof priority === 'object' && priority.id !== undefined) {
    const id = priority.id, name = priority.name || '';
    if (id === 1) return { pc: 'high',   pl: name || 'Высокий' };
    if (id === 2) return { pc: 'medium', pl: name || 'Средний' };
    return { pc: 'low', pl: name || 'Низкий' };
  }
  if (typeof priority === 'string') {
    const p = priority.toLowerCase();
    if (p === 'high' || p === 'critical' || p === 'urgent') return { pc: 'high',   pl: 'Высокий' };
    if (p === 'medium' || p === 'normal')                   return { pc: 'medium', pl: 'Средний' };
    return { pc: 'low', pl: 'Низкий' };
  }
  if (typeof priority === 'number') {
    if (priority === 1) return { pc: 'high',   pl: 'Высокий' };
    if (priority === 2) return { pc: 'medium', pl: 'Средний' };
    return { pc: 'low', pl: 'Низкий' };
  }
  return { pc: 'low', pl: 'Низкий' };
}

function getTaskStage(task) {
  const stageId = task.stage?.id ?? task.stage_id ?? task.stage ?? null;
  if (stageId === 3) return 'done';
  if (stageId === 2) return 'in_progress';
  if (stageId === 5) return 'ready_for_test';
  if (stageId === 6) return 'in_testing';
  return 'new';
}

function buildTaskUrl(task) {
  let url = task.url || task.link || task.external_url || '';
  if (!url && store.kanbanBaseUrl && task.project?.slug && task.id) {
    url = `${store.kanbanBaseUrl}/projects/${task.project.slug}/${task.id}`;
  }
  return url;
}

function isTaskActive(task, taskUrl) {
  return !!(state.taskId && (String(task.id) === String(state.taskId) ||
    (state.taskUrl && taskUrl && taskUrl === state.taskUrl)));
}

// ── Переключение задачи ───────────────────────────────────────────────────────

export async function doStartKanbanTask(name, url) {
  if (state.isLunch) _onSwitchFromLunch();
  await startTask(name, false, url);
  if (store.allKanbanTasks.length) applyFilters();
}

function showSwitchDialog(task, url) {
  pendingTask = task; pendingName = task.name; pendingUrl = url;
  const newEl = $('switch-task-new-name');
  const curEl = $('switch-task-current-name');
  if (newEl) newEl.textContent = task.name;
  if (curEl) curEl.textContent = state.taskName;
  $('switch-task-dialog-overlay')?.classList.add('visible');
}

async function tryStartTask(task, taskUrl) {
  const isActive = isTaskActive(task, taskUrl);
  if (isActive) { showNotification('Задача уже активна', 'Эта задача сейчас выполняется'); return; }

  if (state.taskRunning || state.taskElapsed > 0) {
    const commentEl = $('task-comment');
    const comment   = commentEl?.value.trim() || '';
    if (!comment) {
      commentEl?.focus();
      commentEl?.classList.add('input-error');
      setTimeout(() => commentEl?.classList.remove('input-error'), 1500);
      showNotification('⚠ Заполните комментарий', 'Укажите комментарий к текущей задаче перед переключением');
      return;
    }
    state.taskComment = comment;
    showSwitchDialog(task, taskUrl);
  } else {
    if (getTaskStage(task) === 'new') updateTaskStage(task.id, 2);
    await doStartKanbanTask(task.name, taskUrl);
    refreshBoardIfNeeded();
  }
}

// ── Детали задачи ─────────────────────────────────────────────────────────────

export async function showTaskDetail(task) {
  if (!isAuthorized()) return;
  currentTaskDetail = task;

  const contentEl = $('task-detail-content');
  if (contentEl) contentEl.innerHTML = '<div style="text-align:center;padding:40px;"><span class="spinner-inline"></span>Загрузка...</div>';
  $('task-detail-dialog-overlay')?.classList.add('visible');

  let taskData = store.taskDetailsCache?.[task.id] || null;
  if (!taskData) {
    const r = await window.api.kanbanGetTask(task.id, store.cfg.kanban.token);
    taskData = r.success ? (r.data.data || r.data) : task;
    if (r.success && taskData) store.taskDetailsCache[task.id] = taskData;
  }

  if (contentEl) {
    contentEl.innerHTML = `
      <div class="task-detail-meta">
        <span class="task-detail-id" id="task-detail-id"></span>
        <span class="task-detail-priority" id="task-detail-priority"></span>
        <span class="task-detail-status" id="task-detail-status"></span>
        <span class="task-detail-deadline" id="task-detail-deadline"></span>
      </div>
      <div class="task-detail-description" id="task-detail-description"></div>
      <div class="task-detail-checklist" id="task-detail-checklist"></div>
      <div class="task-detail-comments" id="task-detail-comments"></div>
    `;
  }

  const taskUrl = buildTaskUrl(taskData);

  const titleEl    = $('task-detail-title');
  const idEl       = $('task-detail-id');
  const priorityEl = $('task-detail-priority');
  const statusEl   = $('task-detail-status');
  const descEl     = $('task-detail-description');
  const deadlineEl = $('task-detail-deadline');
  const startBtn   = $('task-detail-start');

  if (titleEl) titleEl.textContent = taskData.name || 'Задача';
  if (idEl) {
    idEl.textContent  = `#${taskData.id}`;
    idEl.style.cursor = 'pointer';
    idEl.onclick      = () => { if (taskUrl) window.api.openExternal(taskUrl); };
  }

  const { pc, pl } = getPriorityInfo(taskData.priority);
  if (priorityEl) { priorityEl.textContent = pl; priorityEl.className = `task-detail-priority ${pc}`; }
  if (statusEl)   statusEl.textContent = taskData.stage?.name || taskData.status?.name || taskData.status_name || taskData.status || '';

  if (startBtn) {
    const isDone = getTaskStage(taskData) === 'done';
    startBtn.disabled = isDone;
    startBtn.textContent = isDone ? 'Задача выполнена' : 'Начать задачу';
  }

  if (deadlineEl) {
    deadlineEl.classList.remove('overdue', 'soon');
  }

  if (deadlineEl && taskData.deadline) {
    deadlineEl.style.display = '';
    deadlineEl.textContent = `📅 ${taskData.deadline}`;
    const dl  = new Date(taskData.deadline);
    const now = new Date(); now.setHours(0, 0, 0, 0);
    if (dl < now) deadlineEl.classList.add('overdue');
    else if (dl.getTime() - now.getTime() <= 3 * 24 * 60 * 60 * 1000) deadlineEl.classList.add('soon');
  } else if (deadlineEl) {
    deadlineEl.textContent = '';
    deadlineEl.style.display = 'none';
  }

  if (descEl) {
    const rawDesc = taskData.description || taskData.desc || 'Описание отсутствует';
    // Добавляем target="_blank" ко всем ссылкам через хук DOMPurify,
    // и очищаем HTML для предотвращения XSS
    DOMPurify.addHook('afterSanitizeAttributes', function (node) {
      if ('target' in node) {
        node.setAttribute('target', '_blank');
      }
    });

    const cleanHtml = DOMPurify.sanitize(rawDesc, { ADD_ATTR: ['target'] });
    DOMPurify.removeHook('afterSanitizeAttributes');
    descEl.innerHTML = cleanHtml;
  }

  const checklistEl = $('task-detail-checklist');
  if (checklistEl) {
    const checklist = taskData.checklist || taskData.check_list || taskData.tasks || [];
    if (checklist && checklist.length > 0) {
      let html = '<div class="task-detail-checklist-title">Чек-лист</div>';
      checklist.forEach(cl => {
        if (cl.points?.length > 0) {
          if (cl.name) html += `<div style="font-size:11px;font-weight:600;color:var(--text-2);margin:10px 0 4px">${escapeHtml(cl.name)}</div>`;
          cl.points.forEach(point => {
            const doneClass = point.is_done ? 'done' : '';
            html += `<div class="task-detail-checklist-item ${doneClass}">
              <input type="checkbox" disabled ${point.is_done ? 'checked' : ''}>
              <span>${escapeHtml(point.text || point.name || '')}</span>
            </div>`;
          });
        }
      });
      checklistEl.innerHTML = html;
    } else {
      checklistEl.innerHTML = '';
    }
  }

  // ── Comments ─────────────────────────────────────────────────────────────────
  const commentsEl = $('task-detail-comments');
  if (commentsEl) {
    const comments = taskData.comments || [];
    if (comments.length > 0) {
      let html = '<div class="task-detail-comments-title">Комментарии</div>';
      comments.forEach(c => {
        const authorName = c.user ? `${c.user.surname || ''} ${c.user.name || ''}`.trim() : 'Аноним';
        const date = c.created_at ? new Date(c.created_at).toLocaleString('ru-RU', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '';

        DOMPurify.addHook('afterSanitizeAttributes', function (node) {
          if ('target' in node) node.setAttribute('target', '_blank');
        });
        const cleanContent = DOMPurify.sanitize(c.content || '', { ADD_ATTR: ['target'] });
        DOMPurify.removeHook('afterSanitizeAttributes');

        html += `<div class="task-comment-item">
          <div class="task-comment-header">
            <span class="task-comment-author">${escapeHtml(authorName)}</span>
            <span class="task-comment-date">${date}</span>
          </div>
          <div class="task-comment-body">${cleanContent}</div>
        </div>`;
      });
      commentsEl.innerHTML = html;
    } else {
      commentsEl.innerHTML = '';
    }
  }

  $('task-detail-dialog-overlay')?.classList.add('visible');

  // Обработчик кликов по ссылкам в описании задачи
}

// ── Фильтры: мультиселект проектов ────────────────────────────────────────────

function initProjectMultiSelect(projects) {
  const container = $('filter-project-container');
  const trigger   = container?.querySelector('.kanban-multi-select-trigger');
  if (!container || !trigger) return;

  // Перемещаем дропдаун в body один раз — выходим из overflow:hidden предков
  let dropdown = document.getElementById('proj-dropdown');
  if (!dropdown) {
    dropdown = container.querySelector('.kanban-multi-select-dropdown');
    if (!dropdown) return;
    dropdown.id = 'proj-dropdown';
    document.body.appendChild(dropdown);
  }

  const optionsEl   = dropdown.querySelector('.kanban-multi-select-options');
  const searchInput = dropdown.querySelector('.kanban-multi-select-search input');
  if (!optionsEl) return;

  const saved = localStorage.getItem('selectedProjects');
  if (saved) { try { selectedProjects = JSON.parse(saved); } catch {} }

  function getOrCreateChips() {
    let chips = trigger.querySelector('.kanban-multi-select-chips');
    if (!chips) { chips = document.createElement('div'); chips.className = 'kanban-multi-select-chips'; trigger.insertBefore(chips, trigger.firstChild); }
    return chips;
  }

  function updateDisplay() {
    const chips       = getOrCreateChips();
    const placeholder = trigger.querySelector('.kanban-multi-select-placeholder');
    chips.innerHTML = '';
    if (selectedProjects.length === 0) {
      if (placeholder) placeholder.style.display = '';
      chips.style.display = 'none';
    } else {
      if (placeholder) placeholder.style.display = 'none';
      chips.style.display = 'flex';
      selectedProjects.forEach(p => {
        const chip = document.createElement('span');
        chip.className = 'kanban-multi-select-chip';
        chip.innerHTML = `<span>${escapeHtml(p)}</span><button>×</button>`;
        chip.querySelector('button').addEventListener('click', (e) => {
          e.stopPropagation();
          selectedProjects = selectedProjects.filter(x => x !== p);
          localStorage.setItem('selectedProjects', JSON.stringify(selectedProjects));
          updateDisplay(); dropdown._renderOpts?.(); applyFilters();
        });
        chips.appendChild(chip);
      });
    }
  }

  function renderOptions(filter = '') {
    const filtered = projects.filter(p => p.toLowerCase().includes(filter.toLowerCase()));
    optionsEl.innerHTML = '';
    filtered.forEach(p => {
      const isSelected = selectedProjects.includes(p);
      const opt        = document.createElement('div');
      opt.className    = 'kanban-multi-select-option' + (isSelected ? ' selected' : '');
      const checkbox   = document.createElement('input'); checkbox.type = 'checkbox'; checkbox.checked = isSelected;
      const span       = document.createElement('span'); span.textContent = p;
      opt.appendChild(checkbox); opt.appendChild(span);
      opt.addEventListener('click', (e) => {
        e.stopPropagation();
        if (selectedProjects.includes(p)) selectedProjects = selectedProjects.filter(x => x !== p);
        else selectedProjects.push(p);
        localStorage.setItem('selectedProjects', JSON.stringify(selectedProjects));
        updateDisplay(); dropdown._renderOpts?.(searchInput?.value || ''); applyFilters();
      });
      optionsEl.appendChild(opt);
    });
  }

  // Обновляем список проектов при каждом вызове
  dropdown._renderOpts = renderOptions;

  // Слушатели добавляем только один раз
  if (!trigger.dataset.msReady) {
    trigger.dataset.msReady = '1';

    function openDropdown() {
      const rect = trigger.getBoundingClientRect();
      dropdown.style.top     = (rect.bottom + 2) + 'px';
      dropdown.style.left    = rect.left + 'px';
      dropdown.style.width   = rect.width + 'px';
      dropdown.style.display = 'block';
      container.classList.add('open');
      searchInput?.focus();
      dropdown._renderOpts?.();
    }
    function closeDropdown() {
      dropdown.style.display = '';
      container.classList.remove('open');
      if (searchInput) searchInput.value = '';
    }

    trigger.addEventListener('click', (e) => {
      e.stopPropagation();
      dropdown.style.display === 'block' ? closeDropdown() : openDropdown();
    });
    document.addEventListener('click', (e) => {
      if (!container.contains(e.target) && !dropdown.contains(e.target)) closeDropdown();
    });
    searchInput?.addEventListener('input', (e) => dropdown._renderOpts?.(e.target.value));
  }

  updateDisplay();
}

// ── Фильтры: мультиселект приоритетов ────────────────────────────────────────

function initPriorityMultiSelect() {
  const container = $('filter-priority-container');
  const trigger   = container?.querySelector('.kanban-multi-select-trigger');
  if (!container || !trigger) return;

  // Перемещаем дропдаун в body один раз
  let dropdown = document.getElementById('prio-dropdown');
  if (!dropdown) {
    dropdown = container.querySelector('.kanban-multi-select-dropdown');
    if (!dropdown) return;
    dropdown.id = 'prio-dropdown';
    document.body.appendChild(dropdown);
  }

  const optionsEl = dropdown.querySelector('.kanban-multi-select-options');
  if (!optionsEl) return;

  const saved = localStorage.getItem('selectedPriorities');
  if (saved) { try { selectedPriorities = JSON.parse(saved); } catch {} }

  function getOrCreateChips() {
    let chips = trigger.querySelector('.kanban-multi-select-chips');
    if (!chips) { chips = document.createElement('div'); chips.className = 'kanban-multi-select-chips'; trigger.insertBefore(chips, trigger.firstChild); }
    return chips;
  }

  function updateDisplay() {
    const chips       = getOrCreateChips();
    const placeholder = trigger.querySelector('.kanban-multi-select-placeholder');
    chips.innerHTML = '';
    if (selectedPriorities.length === 0) {
      if (placeholder) placeholder.style.display = '';
      chips.style.display = 'none';
    } else {
      if (placeholder) placeholder.style.display = 'none';
      chips.style.display = 'flex';
      selectedPriorities.forEach(p => {
        const chip = document.createElement('span');
        chip.className = 'kanban-multi-select-chip';
        chip.innerHTML = `<span>${escapeHtml(priorityLabels[p] || p)}</span><button>×</button>`;
        chip.querySelector('button').addEventListener('click', (e) => {
          e.stopPropagation();
          selectedPriorities = selectedPriorities.filter(x => x !== p);
          localStorage.setItem('selectedPriorities', JSON.stringify(selectedPriorities));
          updateDisplay(); renderOptions(); applyFilters();
        });
        chips.appendChild(chip);
      });
    }
  }

  function renderOptions() {
    optionsEl.innerHTML = '';
    ['high', 'medium', 'low'].forEach(p => {
      const isSelected = selectedPriorities.includes(p);
      const opt        = document.createElement('div');
      opt.className    = 'kanban-multi-select-option' + (isSelected ? ' selected' : '');
      const checkbox   = document.createElement('input'); checkbox.type = 'checkbox'; checkbox.checked = isSelected;
      const span       = document.createElement('span'); span.textContent = priorityLabels[p];
      opt.appendChild(checkbox); opt.appendChild(span);
      opt.addEventListener('click', (e) => {
        e.stopPropagation();
        if (selectedPriorities.includes(p)) selectedPriorities = selectedPriorities.filter(x => x !== p);
        else selectedPriorities.push(p);
        localStorage.setItem('selectedPriorities', JSON.stringify(selectedPriorities));
        updateDisplay(); renderOptions(); applyFilters();
      });
      optionsEl.appendChild(opt);
    });
  }

  // Слушатели добавляем только один раз
  if (!trigger.dataset.msReady) {
    trigger.dataset.msReady = '1';

    function openDropdown() {
      const rect = trigger.getBoundingClientRect();
      dropdown.style.top     = (rect.bottom + 2) + 'px';
      dropdown.style.left    = rect.left + 'px';
      dropdown.style.width   = rect.width + 'px';
      dropdown.style.display = 'block';
      container.classList.add('open');
      renderOptions();
    }
    function closeDropdown() {
      dropdown.style.display = '';
      container.classList.remove('open');
    }

    trigger.addEventListener('click', (e) => {
      e.stopPropagation();
      dropdown.style.display === 'block' ? closeDropdown() : openDropdown();
    });
    document.addEventListener('click', (e) => {
      if (!container.contains(e.target) && !dropdown.contains(e.target)) closeDropdown();
    });
  }

  updateDisplay();
}

// ── Вид (список / доска) ──────────────────────────────────────────────────────

function setKanbanViewMode(mode) {
  kanbanViewMode = mode;
  localStorage.setItem('kanbanViewMode', mode);
  const listEl          = $('kanban-tasks-list');
  const boardEl         = $('kanban-board');
  const toggleBtn       = $('btn-kanban-view-toggle');
  const hideTestingLabel = $('filter-hide-testing')?.closest('.kanban-filter-checkbox');

  if (mode === 'board') {
    if (listEl)  listEl.style.display = 'none';
    if (boardEl) boardEl.classList.add('visible');
    if (toggleBtn) { toggleBtn.classList.add('active'); toggleBtn.textContent = '▦'; }
    if (hideTestingLabel) hideTestingLabel.classList.add('visible');
  } else {
    if (listEl)  listEl.style.display = 'flex';
    if (boardEl) boardEl.classList.remove('visible');
    if (toggleBtn) { toggleBtn.classList.remove('active'); toggleBtn.textContent = '☰'; }
    if (hideTestingLabel) hideTestingLabel.classList.remove('visible');
  }
  applyFilters();
}

function toggleTestingColumns(hidden) {
  document.querySelector('.kanban-board-column[data-stage="ready_for_test"]')?.classList.toggle('hidden', hidden);
  document.querySelector('.kanban-board-column[data-stage="in_testing"]')?.classList.toggle('hidden', hidden);
  const filterCb = $('filter-hide-testing');
  if (filterCb) filterCb.checked = hidden;
}

function getKanbanTaskTooltipEl() {
  let tooltipEl = document.getElementById('kanban-task-tooltip-floating');
  if (!tooltipEl) {
    tooltipEl = document.createElement('div');
    tooltipEl.id = 'kanban-task-tooltip-floating';
    tooltipEl.className = 'kanban-task-tooltip-floating';
    document.body.appendChild(tooltipEl);
  }
  return tooltipEl;
}

function positionKanbanTaskTooltip(tooltipEl, targetEl) {
  const rect = targetEl.getBoundingClientRect();
  const margin = 10;
  const top = rect.bottom + 8;
  const left = Math.min(rect.left, window.innerWidth - tooltipEl.offsetWidth - margin);
  tooltipEl.style.left = `${Math.max(margin, left)}px`;
  tooltipEl.style.top = `${Math.min(window.innerHeight - tooltipEl.offsetHeight - margin, top)}px`;
}

function setupKanbanTaskNameMarquee(container) {
  const tooltipEl = getKanbanTaskTooltipEl();
  container?.querySelectorAll('.kanban-task-name').forEach((nameEl) => {
    const textEl = nameEl.querySelector('.kanban-task-name-text');
    if (!textEl) return;

    nameEl.classList.remove('is-overflowing');
    nameEl.style.removeProperty('--marquee-shift');
    textEl.style.removeProperty('--marquee-duration');

    const overflow = textEl.scrollWidth - nameEl.clientWidth;
    if (overflow <= 8) return;

    nameEl.classList.add('is-overflowing');
    nameEl.style.setProperty('--marquee-shift', `${-overflow}px`);
    textEl.style.setProperty('--marquee-duration', `${Math.max(4.5, overflow / 28)}s`);

    nameEl.addEventListener('mouseenter', () => {
      tooltipEl.textContent = textEl.textContent || '';
      tooltipEl.classList.add('visible');
      positionKanbanTaskTooltip(tooltipEl, nameEl);
    });

    nameEl.addEventListener('mousemove', () => {
      if (!tooltipEl.classList.contains('visible')) return;
      positionKanbanTaskTooltip(tooltipEl, nameEl);
    });

    nameEl.addEventListener('mouseleave', () => {
      tooltipEl.classList.remove('visible');
    });
  });
}

// ── Фильтрация ────────────────────────────────────────────────────────────────

export function applyFilters() {
  const name     = $('filter-name')?.value.trim().toLowerCase() || '';
  const filtered = store.allKanbanTasks.filter(task => {
    const { pc } = getPriorityInfo(task.priority);
    if (name && !task.name.toLowerCase().includes(name)) return false;
    if (selectedProjects.length  > 0 && !selectedProjects.includes(task.project?.name))  return false;
    if (selectedPriorities.length > 0 && !selectedPriorities.includes(pc))               return false;
    return true;
  });
  updateKanbanFilterUi();
  if (kanbanViewMode === 'board') renderKanbanBoard(filtered);
  else                            renderKanbanList(filtered);
}

function updateKanbanFilterUi() {
  const panel = $('kanban-filter-panel');
  const filterBtn = $('btn-kanban-filter');
  const resetBtn = $('btn-reset-filters');
  const hasFilters =
    !!($('filter-name')?.value.trim()) ||
    selectedProjects.length > 0 ||
    selectedPriorities.length > 0 ||
    !!$('filter-hide-testing')?.checked;
  const panelVisible = !!panel && panel.style.display !== 'none';

  if (filterBtn) {
    filterBtn.classList.toggle('active', panelVisible || hasFilters);
    filterBtn.title = panelVisible ? 'Скрыть фильтры' : 'Показать фильтры';
    filterBtn.setAttribute('aria-label', filterBtn.title);
    filterBtn.setAttribute('aria-pressed', panelVisible ? 'true' : 'false');
  }

  if (resetBtn) {
    resetBtn.disabled = !hasFilters;
    resetBtn.classList.toggle('active', hasFilters);
  }
}

// ── Рендер списка ─────────────────────────────────────────────────────────────

function parseDeadlineDate(dateStr) {
  if (!dateStr) return null;
  const parts = dateStr.toString().split('.');
  if (parts.length === 3) {
    const day = parseInt(parts[0], 10);
    const month = parseInt(parts[1], 10) - 1;
    let year = parseInt(parts[2], 10);
    if (year < 100) year += 2000;
    return new Date(year, month, day);
  }
  return new Date(dateStr);
}

function renderKanbanList(tasks) {
  const list    = $('kanban-tasks-list');
  const countEl = $('kanban-tasks-count');
  if (!list) return;

  if (!tasks.length) {
    list.innerHTML = '<div class="kanban-tasks-empty">Ничего не найдено</div>';
    if (countEl) { countEl.textContent = '0'; countEl.style.display = ''; }
    return;
  }

  if (countEl) { countEl.textContent = tasks.length; countEl.style.display = ''; }
  list.innerHTML = '';

  const now = new Date(); now.setHours(0, 0, 0, 0);
  const tomorrow = new Date(now); tomorrow.setDate(tomorrow.getDate() + 1);

  // Категоризация задач
  const categoryToday = [];
  const categoryTomorrow = [];
  const categoryPinned = [];
  const categorySupers = [];
  const categoryUnpinned = [];
  const categoryDone = [];

  tasks.forEach(task => {
    let isToday = false;
    let isTomorrow = false;

    if (getTaskStage(task) === 'done') {
      if (pinnedTaskIds.has(task.id)) {
        pinnedTaskIds.delete(task.id);
        try { localStorage.setItem('pinnedKanbanTasks', JSON.stringify([...pinnedTaskIds])); } catch (e) {}
      }
      categoryDone.push(task);
      return;
    }

    if (task.deadline) {
      const dl = parseDeadlineDate(task.deadline);
      if (dl && !isNaN(dl.getTime())) {
        dl.setHours(0, 0, 0, 0);
        if (dl.getTime() <= now.getTime()) isToday = true;
        else if (dl.getTime() === tomorrow.getTime()) isTomorrow = true;
      }
    }

    if (isToday) categoryToday.push(task);
    else if (isTomorrow) categoryTomorrow.push(task);
    else if (pinnedTaskIds.has(task.id)) categoryPinned.push(task);
    else if (task.is_supertask == 1) categorySupers.push(task);
    else categoryUnpinned.push(task);
  });

  function appendTask(task, overrideClass = null, parentEl = list) {
    const taskUrl  = buildTaskUrl(task);
    const isActive = isTaskActive(task, taskUrl);
    const isPinned = pinnedTaskIds.has(task.id);
    const isDoneTask = overrideClass === 'done-task';
    const { pc, pl } = getPriorityInfo(task.priority);

    let deadlineClass = '';
    let isTodayOrOverdue = false;
    let isTomorrow = false;

    if (task.deadline) {
      const dl = parseDeadlineDate(task.deadline);
      if (dl && !isNaN(dl.getTime())) {
        dl.setHours(0, 0, 0, 0);
        if (dl.getTime() <= now.getTime()) {
          deadlineClass = dl.getTime() < now.getTime() ? 'overdue' : 'soon';
          isTodayOrOverdue = true;
        }
        else if (dl.getTime() - now.getTime() <= 3 * 24 * 60 * 60 * 1000) {
          deadlineClass = 'soon';
          if (dl.getTime() === tomorrow.getTime()) isTomorrow = true;
        }
      }
    }

    const item = document.createElement('div');
    item.className = 'kanban-task-item';
    if (overrideClass) item.classList.add(overrideClass);
    // Auto-apply daily highlight class if we are re-rendering a single task or the whole list isn't manually overriding
    if (!overrideClass && isTodayOrOverdue) item.classList.add('deadline-today');
    else if (!overrideClass && isTomorrow) item.classList.add('deadline-tomorrow');
    if (isActive) item.classList.add('active');
    if (task.is_supertask == 1) item.classList.add('supertask');
    item.innerHTML = `
      <div class="kanban-task-content">
        <div class="kanban-task-name-row">
          ${task.is_supertask == 1 ? '<span class="kanban-task-fire" aria-hidden="true"></span>' : ''}
          <span class="kanban-task-name">
            <span class="kanban-task-name-text">${escapeHtml(task.name)}</span>
          </span>
        </div>
        <div class="kanban-task-meta">
          <span class="kanban-task-project">${escapeHtml(task.project?.name || 'Без проекта')}</span>
          ${task.deadline ? `<span class="kanban-task-deadline ${deadlineClass}">📅 ${task.deadline}</span>` : ''}
          <span class="kanban-task-priority ${pc}"><span class="kanban-task-priority-dot"></span>${pl}</span>
        </div>
      </div>
      <button class="kanban-task-pin${isPinned ? ' pinned' : ''}" title="${isPinned ? 'Открепить' : 'Закрепить'}">📌</button>
      <button class="kanban-task-play" title="Начать задачу">▶</button>
    `;

    item.addEventListener('click', (e) => {
      if (!e.target.closest('.kanban-task-play') && !e.target.closest('.kanban-task-pin')) showTaskDetail(task);
    });
    item.querySelector('.kanban-task-play').addEventListener('click', (e) => { e.stopPropagation(); tryStartTask(task, taskUrl); });
    item.querySelector('.kanban-task-pin').addEventListener('click', (e) => { e.stopPropagation(); togglePinTask(task.id); });
    parentEl.appendChild(item);
  }

  function addDivider() {
    const divider = document.createElement('div');
    divider.className = 'kanban-pinned-divider';
    list.appendChild(divider);
  }

  categoryToday.forEach(t => appendTask(t, 'deadline-today'));
  if (categoryToday.length && (categoryTomorrow.length || categoryPinned.length || categorySupers.length || categoryUnpinned.length)) addDivider();
  
  categoryTomorrow.forEach(t => appendTask(t, 'deadline-tomorrow'));
  if (categoryTomorrow.length && (categoryPinned.length || categorySupers.length || categoryUnpinned.length)) addDivider();

  categoryPinned.forEach(t => appendTask(t));
  if (categoryPinned.length && (categorySupers.length || categoryUnpinned.length)) addDivider();

  categorySupers.forEach(t => appendTask(t));
  if (categorySupers.length && categoryUnpinned.length) addDivider();

  categoryUnpinned.forEach(t => appendTask(t));
  requestAnimationFrame(() => setupKanbanTaskNameMarquee(list));

  if (categoryDone.length) {
    if (categoryToday.length || categoryTomorrow.length || categoryPinned.length || categorySupers.length || categoryUnpinned.length) {
      addDivider();
    }
    const acc = document.createElement('div');
    acc.className = 'kanban-done-accordion';
    acc.innerHTML = `
      <button class="kanban-done-accordion-header">
        <span class="kanban-done-accordion-title">Выполненные (${categoryDone.length})</span>
        <span class="kanban-done-accordion-arrow">▼</span>
      </button>
      <div class="kanban-done-accordion-content">
        <div class="done-tasks-list"></div>
      </div>
    `;
    const accHeader = acc.querySelector('.kanban-done-accordion-header');
    const accContent = acc.querySelector('.kanban-done-accordion-content');
    
    accHeader.addEventListener('click', () => {
      const isOpen = acc.classList.contains('open');
      if (isOpen) {
        acc.classList.remove('open');
        accContent.style.maxHeight = '0px';
      } else {
        acc.classList.add('open');
        accContent.style.maxHeight = accContent.scrollHeight + 'px';
        setTimeout(() => {
          if (acc.classList.contains('open')) {
            accContent.style.maxHeight = 'none';
          }
        }, 300);
      }
    });

    const doneList = acc.querySelector('.done-tasks-list');
    categoryDone.forEach(t => appendTask(t, 'done-task', doneList));
    list.appendChild(acc);
  }
}

// ── Рендер доски ──────────────────────────────────────────────────────────────

export function renderKanbanBoard(tasks, board = $('kanban-board')) {
  const countEl = $('kanban-tasks-count');
  if (!board) return;

  const stages  = ['new', 'in_progress', 'ready_for_test', 'in_testing', 'done'];
  const grouped = Object.fromEntries(stages.map(s => [s, []]));

  tasks.forEach(task => { grouped[getTaskStage(task)].push(task); });

  if (countEl && board === $('kanban-board')) { countEl.textContent = tasks.length; countEl.style.display = ''; }

  stages.forEach(stage => {
    const colEl = board.querySelector(`.kanban-board-column-tasks[data-stage="${stage}"]`);
    if (!colEl) return;
    const colTasks = grouped[stage];

    if (!colTasks.length) { colEl.innerHTML = '<div class="kanban-board-task-empty">Нет задач</div>'; return; }

    colEl.innerHTML = '';

    const now = new Date(); now.setHours(0, 0, 0, 0);
    const tomorrow = new Date(now); tomorrow.setDate(tomorrow.getDate() + 1);

    const boardToday = [];
    const boardTomorrow = [];
    const boardSupers = [];
    const boardUnpinned = [];

    colTasks.forEach(task => {
      let isToday = false;
      let isTomorrow = false;
      if (task.deadline) {
        const dl = parseDeadlineDate(task.deadline);
        if (dl && !isNaN(dl.getTime())) {
          dl.setHours(0, 0, 0, 0);
          if (dl.getTime() <= now.getTime()) isToday = true;
          else if (dl.getTime() === tomorrow.getTime()) isTomorrow = true;
        }
      }

      if (isToday) boardToday.push(task);
      else if (isTomorrow) boardTomorrow.push(task);
      else if (task.is_supertask == 1) boardSupers.push(task);
      else boardUnpinned.push(task);
    });

    const sorted = [...boardToday, ...boardTomorrow, ...boardSupers, ...boardUnpinned];

    sorted.forEach(task => {
      const taskUrl  = buildTaskUrl(task);
      const isActive = isTaskActive(task, taskUrl);
      const { pc }   = getPriorityInfo(task.priority);

      let deadlineClass = '';
      let isTodayOrOverdue = false;
      let isTomorrow = false;

      if (task.deadline) {
        const dl = parseDeadlineDate(task.deadline);
        if (dl && !isNaN(dl.getTime())) {
          dl.setHours(0, 0, 0, 0);
          if (dl.getTime() <= now.getTime()) {
            deadlineClass = dl.getTime() < now.getTime() ? 'overdue' : 'soon';
            isTodayOrOverdue = true;
          }
          else if (dl.getTime() - now.getTime() <= 3 * 24 * 60 * 60 * 1000) {
            deadlineClass = 'soon';
            if (dl.getTime() === tomorrow.getTime()) isTomorrow = true;
          }
        }
      }

      const item = document.createElement('div');
      item.className = 'kanban-board-task';
      item.style.position = 'relative';
      if (isTodayOrOverdue) item.classList.add('deadline-today');
      else if (isTomorrow) item.classList.add('deadline-tomorrow');
      if (isActive)               item.classList.add('active');
      if (task.is_supertask == 1) item.classList.add('supertask');

      item.innerHTML = `
        <div class="kanban-board-task-name-row">
          ${task.is_supertask == 1 ? '<span class="kanban-board-task-fire" aria-hidden="true"></span>' : ''}
          <span class="kanban-board-task-name" title="${escapeHtml(task.name)}">${escapeHtml(task.name)}</span>
        </div>
        <div class="kanban-board-task-meta">
          <span class="kanban-board-task-project">${escapeHtml(task.project?.name || '')}</span>
          ${task.deadline ? `<span class="kanban-task-deadline ${deadlineClass}">📅 ${task.deadline}</span>` : ''}
          <span class="kanban-board-task-priority ${pc}"></span>
        </div>
        <button class="kanban-board-task-play" title="Начать задачу">▶</button>
      `;

      item.addEventListener('click', (e) => { if (!e.target.closest('.kanban-board-task-play')) showTaskDetail(task); });
      item.querySelector('.kanban-board-task-play').addEventListener('click', (e) => { e.stopPropagation(); tryStartTask(task, taskUrl); });
      colEl.appendChild(item);
    });
  });
}

// ── Загрузка задач ────────────────────────────────────────────────────────────

export function renderKanbanTasks(tasks, error = null) {
  const list    = $('kanban-tasks-list');
  const countEl = $('kanban-tasks-count');
  if (!list) return;

  if (error) {
    list.innerHTML = `<div class="kanban-tasks-empty">Ошибка: ${escapeHtml(error)}</div>`;
    if (countEl) countEl.style.display = 'none';
    return;
  }
  if (!tasks || !tasks.length) {
    list.innerHTML = '<div class="kanban-tasks-empty">Авторизуйтесь для загрузки задач</div>';
    if (countEl) countEl.style.display = 'none';
    store.allKanbanTasks = [];
    return;
  }

  store.allKanbanTasks = tasks;
  const projects = [...new Set(tasks.map(t => t.project?.name).filter(Boolean))].sort();
  initProjectMultiSelect(projects);
  initPriorityMultiSelect();
  if (countEl) { countEl.textContent = tasks.length; countEl.style.display = ''; }
  applyFilters();
}

function showKanbanFetchProgress(text) {
  const progressEl = $('kanban-fetch-progress');
  if (!progressEl) return;
  progressEl.style.display = '';
  progressEl.style.visibility = 'visible';
  progressEl.title = text || 'Синхронизация задач';
  progressEl.setAttribute('aria-label', text || 'Синхронизация задач');
}

function hideKanbanFetchProgress() {
  const progressEl = $('kanban-fetch-progress');
  if (!progressEl) return;
  progressEl.style.visibility = 'hidden';
  progressEl.title = '';
  progressEl.setAttribute('aria-label', '');
}

export async function loadKanbanTasks(options = {}) {
  const { showNotif = false, force = false, silent = false } = options;
  if (!store.kanbanBaseUrl) store.kanbanBaseUrl = await window.api.getKanbanBaseUrl();
  if (!isAuthorized()) { renderKanbanTasks(null); return; }

  const loaderList  = $('kanban-tasks-loader');
  const loaderBoard = $('kanban-board-loader');
  const list        = $('kanban-tasks-list');
  const board       = $('kanban-board');
  const countEl     = $('kanban-tasks-count');

  showKanbanFetchProgress(force ? 'Обновление...' : 'Загрузка...');

  if (!silent) {
    if (loaderList)  loaderList.style.display  = 'flex';
    if (loaderBoard) loaderBoard.style.display = 'flex';
    if (list)        list.classList.add('loading');
    if (board)       board.classList.add('loading');
    if (countEl)     countEl.style.display     = 'none';
  }

  const ui  = store.cfg.kanban?.userInfo;
  const ud  = ui?.data || ui;
  const uid = ud?.id;
  if (!uid) {
    hideKanbanFetchProgress();
    renderKanbanTasks(null);
    return;
  }

  if (!force && store.allKanbanTasks.length) {
    if (!silent) {
      if (loaderList)  loaderList.style.display  = 'none';
      if (loaderBoard) loaderBoard.style.display = 'none';
      if (list)        list.classList.remove('loading');
      if (board)       board.classList.remove('loading');
    }
    hideKanbanFetchProgress();
    renderKanbanTasks(store.allKanbanTasks);
    return;
  }

  if (force) {
    store.kanbanCache.inFlight = null;
    store.taskDetailsCache = {};
  }

  if (!store.kanbanCache.inFlight) {
    store.kanbanCache.inFlight = window.api.kanbanGetTasks(uid, store.cfg.kanban.token);
  }

  const r = await store.kanbanCache.inFlight;
  store.kanbanCache.inFlight = null;

  if (!silent) {
    if (loaderList)  loaderList.style.display  = 'none';
    if (loaderBoard) loaderBoard.style.display = 'none';
    if (list)        list.classList.remove('loading');
    if (board)       board.classList.remove('loading');
  }

  if (r.success) {
    const fetchedTasks = r.data.data || r.data;
    renderKanbanTasks(fetchedTasks);
    store.kanbanCache.fetchedAt = Date.now();
    if (showNotif) showNotification('✓ Обновлено', 'Список задач загружен');
    
    // Запускаем фоновую загрузку деталей (для получения дедлайнов)
    startBackgroundDetailsFetch(fetchedTasks);
  } else {
    hideKanbanFetchProgress();
    renderKanbanTasks(null, r.error);
    if (showNotif) showNotification('✗ Ошибка', 'Не удалось обновить задачи');
  }
}

let detailsFetchAbortController = null;
let detailsFetchUpdateTimeout = null;

async function startBackgroundDetailsFetch(tasks) {
  if (detailsFetchAbortController) {
    detailsFetchAbortController.abort();
  }
  detailsFetchAbortController = new AbortController();
  const signal = detailsFetchAbortController.signal;

  if (!store.taskDetailsCache) store.taskDetailsCache = {};
  
  let hasUpdates = false;

  showKanbanFetchProgress('Обработка дедлайнов...');
  
  const progressEl = $('kanban-fetch-progress');
  if (progressEl) {
    progressEl.style.display = '';
    progressEl.title = 'Обработка дедлайнов...';
    progressEl.setAttribute('aria-label', 'Обработка дедлайнов...');
  }

  let index = 0;
  for (const t of tasks) {
    if (signal.aborted) break;
    index++;
    
    if (progressEl) {
      const progressText = `Синхронизация... ${index}/${tasks.length}`;
      progressEl.title = progressText;
      progressEl.setAttribute('aria-label', progressText);
    }
    
    if (!store.taskDetailsCache[t.id]) {
      try {
        const detail = await window.api.kanbanGetTask(t.id, store.cfg.kanban.token);
        if (signal.aborted) break;
        const taskData = detail.success ? (detail.data.data || detail.data) : null;
        if (taskData) {
          store.taskDetailsCache[t.id] = taskData;
        }
      } catch (err) {
        console.error('Failed to fetch background details for', t.id, err);
      }
    }
    
    const cachedTask = store.taskDetailsCache[t.id];
    if (cachedTask && cachedTask.deadline && cachedTask.deadline !== t.deadline) {
      t.deadline = cachedTask.deadline;
      hasUpdates = true;
    }
  }

  if (progressEl) {
    hideKanbanFetchProgress();
  }

  if (hasUpdates && !signal.aborted) {
    applyFilters();
  }
}

// ── Авторизация ───────────────────────────────────────────────────────────────

async function handleLogin() {
  const email = $('login-email')?.value.trim();
  const pass  = $('login-password')?.value.trim();
  if (!email || !pass) return showNotification('⚠ Ошибка', 'Заполните все поля');

  const submitBtn = $('login-submit');
  setButtonLoading(submitBtn, true);

  const r = await window.api.kanbanLogin(email, pass);
  if (!r.success) {
    setButtonLoading(submitBtn, false);
    return showNotification('✗ Ошибка', `Не удалось авторизоваться: ${r.error}`);
  }

  if (!store.cfg.kanban) store.cfg.kanban = {};
  store.cfg.kanban.token = r.data.token || r.data.access_token || r.data.auth_token;

  const uir = await window.api.kanbanGetUserInfo(store.cfg.kanban.token);
  setButtonLoading(submitBtn, false);

  if (uir.success) {
    store.cfg.kanban.userInfo = uir.data.data || uir.data;
    await window.api.saveConfig(store.cfg);
    showNotification('✓ Успешно', 'Авторизация в Kanban выполнена!');
    $('login-dialog-overlay')?.classList.remove('visible');
    renderSettingsUI();
    await loadKanbanTasks({ force: true });
  } else {
    showNotification('⚠ Предупреждение', 'Авторизация успешна, но не удалось получить данные пользователя');
  }
}

// ── Инициализация UI ──────────────────────────────────────────────────────────

export function initKanbanUI() {
  loadPinnedTasks();
  updateKanbanFilterUi();

  // Фильтр
  $('btn-kanban-filter')?.addEventListener('click', () => {
    const panel   = $('kanban-filter-panel');
    if (!panel) return;
    const visible = panel.style.display !== 'none';
    panel.style.display = visible ? 'none' : 'block';
    updateKanbanFilterUi();
    if (!visible) $('filter-name')?.focus();
  });

  $('filter-name')?.addEventListener('input', applyFilters);
  $('filter-hide-testing')?.addEventListener('change', (e) => toggleTestingColumns(e.target.checked));

  // Сброс фильтров
  $('btn-reset-filters')?.addEventListener('click', () => {
    const filterName = $('filter-name');
    if (filterName) filterName.value = '';

    selectedProjects = [];
    localStorage.removeItem('selectedProjects');
    const projDd = document.getElementById('proj-dropdown');
    if (projDd) { projDd.style.display = ''; $('filter-project-container')?.classList.remove('open'); }
    const pc = $('filter-project-container');
    if (pc) { const chips = pc.querySelector('.kanban-multi-select-chips'), ph = pc.querySelector('.kanban-multi-select-placeholder'); if (chips) { chips.innerHTML = ''; chips.style.display = 'none'; } if (ph) ph.style.display = ''; }

    selectedPriorities = [];
    localStorage.removeItem('selectedPriorities');
    const prioDd = document.getElementById('prio-dropdown');
    if (prioDd) { prioDd.style.display = ''; $('filter-priority-container')?.classList.remove('open'); }
    const prc = $('filter-priority-container');
    if (prc) { const chips = prc.querySelector('.kanban-multi-select-chips'), ph = prc.querySelector('.kanban-multi-select-placeholder'); if (chips) { chips.innerHTML = ''; chips.style.display = 'none'; } if (ph) ph.style.display = ''; }

    const hideTesting = $('filter-hide-testing');
    if (hideTesting) hideTesting.checked = false;
    toggleTestingColumns(false);
    applyFilters();
    updateKanbanFilterUi();
  });

  // Вид
  setKanbanViewMode(kanbanViewMode);
  $('btn-kanban-view-toggle')?.addEventListener('click', () => setKanbanViewMode(kanbanViewMode === 'list' ? 'board' : 'list'));

  // Обновление задач
  $('btn-refresh-tasks')?.addEventListener('click', async (e) => {
    const btn = e.currentTarget;
    btn.style.pointerEvents = 'none';
    invalidateKanbanCache();
    await loadKanbanTasks({ showNotif: true, force: true });
    setTimeout(() => btn.style.pointerEvents = '', 500);
  });

  // Диалог переключения задачи
  $('switch-task-no')?.addEventListener('click',      () => $('switch-task-dialog-overlay')?.classList.remove('visible'));
  $('switch-task-yes')?.addEventListener('click',     async () => {
    $('switch-task-dialog-overlay')?.classList.remove('visible');
    logCurrentTaskWork();
    if (pendingTask && getTaskStage(pendingTask) === 'new') updateTaskStage(pendingTask.id, 2);
    await doStartKanbanTask(pendingName, pendingUrl);
    refreshBoardIfNeeded();
  });
  $('switch-task-complete')?.addEventListener('click', async () => {
    $('switch-task-dialog-overlay')?.classList.remove('visible');
    logCurrentTaskWork();
    if (state.taskId) updateTaskStage(state.taskId, 3);
    if (pendingTask && getTaskStage(pendingTask) === 'new') updateTaskStage(pendingTask.id, 2);
    await doStartKanbanTask(pendingName, pendingUrl);
    refreshBoardIfNeeded();
  });

  // Диалог деталей задачи
  $('task-detail-close')?.addEventListener('click', () => {
    $('task-detail-dialog-overlay')?.classList.remove('visible');
    currentTaskDetail = null;
  });

  $('task-detail-content')?.addEventListener('click', (e) => {
    const link = e.target.closest('A');
    if (link) {
      e.preventDefault();
      openUrl(link.href);
    }
  });

  $('task-detail-start')?.addEventListener('click', async () => {
    if (!currentTaskDetail) return;
    $('task-detail-dialog-overlay')?.classList.remove('visible');

    const taskUrl = buildTaskUrl(currentTaskDetail);

    if (!state.taskRunning && state.taskElapsed === 0) {
      if (getTaskStage(currentTaskDetail) === 'new') updateTaskStage(currentTaskDetail.id, 2);
      await doStartKanbanTask(currentTaskDetail.name, taskUrl);
      refreshBoardIfNeeded();
    } else if (state.isLunch) {
      if (getTaskStage(currentTaskDetail) === 'new') updateTaskStage(currentTaskDetail.id, 2);
      await doStartKanbanTask(currentTaskDetail.name, taskUrl);
      refreshBoardIfNeeded();
    } else if (state.taskRunning) {
      const commentEl = $('task-comment');
      const comment   = commentEl?.value.trim() || '';
      if (!comment) {
        commentEl?.focus();
        commentEl?.classList.add('input-error');
        setTimeout(() => commentEl?.classList.remove('input-error'), 1500);
        showNotification('⚠ Заполните комментарий', 'Укажите комментарий к треку времени перед переключением');
        return;
      }
      state.taskComment = comment;
      showSwitchDialog(currentTaskDetail, taskUrl);
    } else {
      if (getTaskStage(currentTaskDetail) === 'new') updateTaskStage(currentTaskDetail.id, 2);
      await doStartKanbanTask(currentTaskDetail.name, taskUrl);
      refreshBoardIfNeeded();
    }
    currentTaskDetail = null;
  });

  // Авторизация
  $('login-cancel')?.addEventListener('click',  () => $('login-dialog-overlay')?.classList.remove('visible'));
  $('login-submit')?.addEventListener('click',  handleLogin);
  $('login-password')?.addEventListener('keydown', e => { if (e.key === 'Enter') handleLogin(); });

  $('logout-cancel')?.addEventListener('click',  () => $('logout-dialog-overlay')?.classList.remove('visible'));
  $('logout-confirm')?.addEventListener('click', async () => {
    if (store.cfg.kanban) { delete store.cfg.kanban.token; delete store.cfg.kanban.userInfo; }
    await window.api.saveConfig(store.cfg);
    showNotification('✓ Выполнено', 'Вы вышли из Kanban');
    $('logout-dialog-overlay')?.classList.remove('visible');
    renderKanbanTasks(null);
  });
}
