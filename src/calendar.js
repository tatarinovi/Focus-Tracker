import { $, escapeHtml, openUrl, setupCustomSelects } from './utils.js';
import { state } from './state.js';
import { store } from './store.js';
import { startTask } from './timer.js';
import { playAudioPath, playSound } from './audio.js';
import DOMPurify from '../node_modules/dompurify/dist/purify.es.mjs';

let calendarPeriod = 'today';
let calendarEvents = [];
let selectedCalendarEvent = null;
let calendarAutoRefreshTimer = null;
let calendarMiniPanelContainer = null;

function renderCalendarMessage(listEl, message) {
  if (!listEl) return;
  listEl.innerHTML = `<div class="calendar-empty">${escapeHtml(message)}</div>`;
}

function setCalendarListVisibility({ showList = true, showLoading = false, showNoIcal = false } = {}) {
  const listEl = $('calendar-list');
  const loadingEl = $('calendar-loading');
  const noIcalEl = $('calendar-no-ical');

  if (loadingEl) loadingEl.style.display = showLoading ? 'flex' : 'none';
  if (listEl) listEl.style.display = showList ? '' : 'none';
  if (noIcalEl) noIcalEl.style.display = showNoIcal ? 'block' : 'none';
}

export function invalidateCalendarCache() {
  calendarEvents = [];
  store.calendarCache.events = null;
  store.calendarCache.fetchedAt = 0;
  store.calendarCache.inFlight = null;
}

// ── Парсинг ───────────────────────────────────────────────────────────────────

function processIcalData(data) {
  const events = [];
  for (const key in data) {
    if (!Object.hasOwn(data, key)) continue;
    const item = data[key];
    if (item.type !== 'VEVENT') continue;

    const unescapeIcs = (text) => {
      if (!text) return '';
      return String(text)
        .replace(/\\"/g, '"')
        .replace(/\\n/g, '\n')
        .replace(/\\,/g, ',')
        .replace(/\\;/g, ';')
        .replace(/\\\\/g, '\\');
    };

    const event = {};
    if (item.summary) {
      const s = typeof item.summary === 'object' ? item.summary.val : String(item.summary);
      event.summary = unescapeIcs(s);
    }
    if (item.description) {
      const d = typeof item.description === 'object' ? item.description.val : String(item.description);
      event.description = unescapeIcs(d);
    }
    if (item.location) {
      const l = typeof item.location === 'object' ? item.location.val : String(item.location);
      event.location = unescapeIcs(l);
    }
    if (item.url) event.url = typeof item.url === 'object' ? item.url.val : String(item.url);

    if (item.start) event.dtstart = new Date(item.start);
    if (item.end) event.dtend = new Date(item.end);
    if (item.partstat) event.partstat = item.partstat;
    if (item.icsUrl) event.icsUrl = item.icsUrl;

    if (event.dtstart) events.push(event);
  }
  return events;
}

// ── Вспомогательные функции ───────────────────────────────────────────────────

function formatEventTime(date, includeDate = false) {
  if (!date) return '';
  const h = String(date.getHours()).padStart(2, '0');
  const m = String(date.getMinutes()).padStart(2, '0');
  if (includeDate) {
    const d  = String(date.getDate()).padStart(2, '0');
    const mo = String(date.getMonth() + 1).padStart(2, '0');
    return `${d}.${mo} ${h}:${m}`;
  }
  return `${h}:${m}`;
}

function formatDateShort(date) {
  if (!date) return '';
  const today    = new Date();
  const tomorrow = new Date(today);
  tomorrow.setDate(tomorrow.getDate() + 1);
  if (date.toDateString() === today.toDateString())    return 'Сегодня';
  if (date.toDateString() === tomorrow.toDateString()) return 'Завтра';
  return `${String(date.getDate()).padStart(2, '0')}.${String(date.getMonth() + 1).padStart(2, '0')}`;
}

function formatEventDuration(start, end) {
  if (!start || !end) return '';
  const minutes = Math.floor((end - start) / 60000);
  if (minutes < 60) return `${minutes} мин`;
  const h = Math.floor(minutes / 60), m = minutes % 60;
  return m > 0 ? `${h}ч ${m}м` : `${h}ч`;
}

function isEventNow(start, end) {
  if (!start || !end) return false;
  const now = new Date();
  return now >= start && now <= end;
}

function getPeriodDates(period) {
  const now = new Date(); now.setHours(0, 0, 0, 0);
  const start = new Date(now), end = new Date(now);
  switch (period) {
    case 'today':    end.setDate(end.getDate() + 1);   break;
    case 'tomorrow': start.setDate(start.getDate() + 1); end.setDate(end.getDate() + 2); break;
    case '3days':    end.setDate(end.getDate() + 3);   break;
    case 'week':     end.setDate(end.getDate() + 7);   break;
    case 'month':    end.setDate(end.getDate() + 30);  break;
  }
  return { start, end };
}

function filterEventsByPeriod(events, period) {
  const { start, end } = getPeriodDates(period);
  return events.filter(event => {
    if (!event.dtstart) return false;
    const d = new Date(event.dtstart);
    return d >= start && d < end;
  });
}

function findMeetingUrl(event) {
  if (event.url) {
    const u = event.url.toLowerCase();
    if (u.includes('telemost') || u.includes('peregovorka') || u.includes('zoom') ||
        u.includes('meet.google.com') || u.includes('teams.microsoft.com')) return event.url;
  }
  const text = (event.description || '') + ' ' + (event.location || '');
  const patterns = [
    /https?:\/\/[^\s]*telemost[^\s]*/i,
    /https?:\/\/[^\s]*peregovorka[^\s]*/i,
    /https?:\/\/[^\s]*zoom[^\s]*/i,
    /https?:\/\/meet\.google\.com\/[^\s]*/i,
    /https?:\/\/teams\.microsoft\.com\/[^\s]*/i,
  ];
  for (const p of patterns) { const m = text.match(p); if (m) return m[0]; }
  return null;
}

function getMeetingType(url) {
  if (!url) return null;
  const l = url.toLowerCase();
  if (l.includes('telemost'))    return 'telemost';
  if (l.includes('peregovorka')) return 'peregovorka';
  if (l.includes('zoom'))        return 'zoom';
  if (l.includes('meet.google')) return 'meet';
  if (l.includes('teams'))       return 'teams';
  return 'other';
}

// ── Автозапуск таймера (Телемост/Зум) ──────────────────────────────────────────
async function findMatchingTask(eventSummary, meetingUrl) {
  if (!store.allKanbanTasks || !store.allKanbanTasks.length) return null;

  // Find tasks that contain "[созвон]" anywhere in the name (case-insensitive)
  const sozvonTasks = store.allKanbanTasks.filter(t => t.name.toLowerCase().includes('[созвон]'));
  if (!sozvonTasks.length) return null;

  let matchedTask = null;
  const cleanSummary = (eventSummary || '').toLowerCase().replace(/\[.*?\]/g, '').replace(/[^\wа-яё]+/g, ' ').trim();
  const sumWords = cleanSummary.split(/\s+/).filter(w => w.length > 2);

  // 1. По совпадению названий (нечеткий поиск)
  for (const t of sozvonTasks) {
    const cleanTaskName = t.name.toLowerCase().replace(/\[.*?\]/g, '').replace(/[^\wа-яё]+/g, ' ').trim();
    
    // Прямое вхождение
    if ((cleanSummary && cleanTaskName.includes(cleanSummary)) || (cleanTaskName && cleanSummary.includes(cleanTaskName))) {
      matchedTask = t;
      break;
    }

    // Пересечение слов
    const taskWords = cleanTaskName.split(/\s+/).filter(w => w.length > 2);
    if (sumWords.length && taskWords.length) {
      const matchCount = taskWords.filter(w => sumWords.includes(w)).length;
      if (matchCount >= 2 || (matchCount >= taskWords.length * 0.5 && matchCount >= 1)) {
        matchedTask = t;
        break;
      }
    }
  }

  // 2. Если детализация нужна для точности (по ссылке из задачи в описании) - последовательный запрос с кэшированием
  if (!matchedTask && store.cfg?.kanban?.token && meetingUrl) {
    if (!store.taskDetailsCache) store.taskDetailsCache = {};
    
    for (const t of sozvonTasks) {
      try {
         let desc = '';
         
         // Проверяем кэш
         if (store.taskDetailsCache[t.id]) {
           const cachedObj = store.taskDetailsCache[t.id];
           desc = typeof cachedObj === 'string' ? cachedObj : (cachedObj.description || cachedObj.desc || '');
         } else {
           // Если в кэше нет — делаем запрос
           const detail = await window.api.kanbanGetTask(t.id, store.cfg.kanban.token);
           const taskData = detail.success ? (detail.data.data || detail.data) : null;
           if (taskData) {
             desc = taskData.description || taskData.desc || '';
             // Сохраняем весь объект в кэш на всё время работы приложения
             store.taskDetailsCache[t.id] = taskData;
           }
         }
         
         if (desc.includes(meetingUrl)) {
           matchedTask = t;
           break;
         }
      } catch (err) {
         console.error('Failed to strict-match task details for', t.id, err);
      }
    }
  }

  return matchedTask;
}

async function handleMeetClick(eventSummary, meetingUrl) {
  const originalBtnText = $('calendar-event-join') ? $('calendar-event-join').textContent : '';
  if ($('calendar-event-join')) $('calendar-event-join').textContent = 'Поиск задачи...';

  const matchedTask = await findMatchingTask(eventSummary, meetingUrl);
  
  if ($('calendar-event-join')) $('calendar-event-join').textContent = originalBtnText;

  if (matchedTask) {
    const overlay = document.getElementById('meeting-sync-dialog-overlay');
    const nameEl  = document.getElementById('meeting-sync-task-name');
    const btnYes  = document.getElementById('meeting-sync-yes');
    const btnNo   = document.getElementById('meeting-sync-no');

    if (overlay && nameEl && btnYes && btnNo) {
      nameEl.textContent = matchedTask.name;
      overlay.classList.add('visible');

      return new Promise((resolve) => {
        const cleanup = () => {
          btnYes.onclick = null;
          btnNo.onclick = null;
          overlay.classList.remove('visible');
          resolve();
        };

        btnYes.onclick = async () => {
          cleanup();
          playSound('meeting_start');
          openUrl(meetingUrl);
          
          let taskUrl = matchedTask.url || matchedTask.link || matchedTask.external_url || '';
          if (!taskUrl && store.kanbanBaseUrl && matchedTask.project?.slug && matchedTask.id) {
             taskUrl = `${store.kanbanBaseUrl}/projects/${matchedTask.project.slug}/${matchedTask.id}`;
          }

          await startTask(matchedTask.name, false, taskUrl);
        };

        btnNo.onclick = () => {
          cleanup();
          openUrl(meetingUrl);
        };
      });
    } else {
       openUrl(meetingUrl);
    }
  } else {
    openUrl(meetingUrl);
  }
}

// ── Диалог события ────────────────────────────────────────────────────────────

function showCalendarEventDialog(event) {
  selectedCalendarEvent = event;
  const titleEl    = $('calendar-event-title');
  const timeEl     = $('calendar-event-time');
  const durationEl = $('calendar-event-duration');
  const locationEl = $('calendar-event-location');
  const descEl     = $('calendar-event-description');
  const joinBtn    = $('calendar-event-join');

  if (titleEl) titleEl.textContent = event.summary || 'Без названия';

  if (timeEl) {
    const showDate  = calendarPeriod !== 'today' && calendarPeriod !== 'tomorrow';
    const timeStart = formatEventTime(event.dtstart, showDate);
    const timeEnd   = formatEventTime(event.dtend, showDate);
    const isNow     = isEventNow(event.dtstart, event.dtend);
    let timeStr = timeStart;
    if (timeEnd) timeStr += ' - ' + timeEnd;
    if (showDate && event.dtstart) timeStr = `${formatDateShort(event.dtstart)} | ${timeStr}`;
    timeEl.textContent = `🕐 ${timeStr}`;
    timeEl.classList.toggle('now', isNow);
  }

  if (durationEl) durationEl.textContent = formatEventDuration(event.dtstart, event.dtend);
  if (locationEl) locationEl.innerHTML = event.location ? `📍 ${escapeHtml(event.location)}` : '';

  if (descEl) {
    const desc = event.description || 'Нет описания';
    let rawHtml = escapeHtml(desc).replace(/https?:\/\/[^\s<]+/g, '<a target="_blank" href="$&">$&</a>');
    
    DOMPurify.addHook('afterSanitizeAttributes', function (node) {
      if ('target' in node) {
        node.setAttribute('target', '_blank');
      }
    });
    descEl.innerHTML = DOMPurify.sanitize(rawHtml, { ADD_ATTR: ['target'] });
    DOMPurify.removeHook('afterSanitizeAttributes');
  }

  const meetingUrl = findMeetingUrl(event);
  const taskLinkWrap = $('calendar-event-task-link-wrap');
  const taskLabel    = $('calendar-event-task-label');
  const goTaskBtn    = $('calendar-event-go-task');
  
  if (taskLinkWrap) taskLinkWrap.style.display = 'none';
  if (goTaskBtn) goTaskBtn.style.display = 'none';
  taskLabel?.classList.remove('is-loading', 'is-muted');

  if (joinBtn) {
    if (meetingUrl) {
      joinBtn.style.display = '';
      const type = getMeetingType(meetingUrl);
      const labels = { telemost: 'Подключиться к Телемосту', peregovorka: 'Перейти к Переговорке', zoom: 'Подключиться к Zoom', meet: 'Подключиться к Google Meet', teams: 'Подключиться к Teams', other: 'Подключиться' };
      joinBtn.textContent = labels[type] || 'Подключиться';
      joinBtn.onclick = () => handleMeetClick(event.summary, meetingUrl);
      
      // Async find matched task
      if (taskLinkWrap && taskLabel && goTaskBtn) {
        taskLinkWrap.style.display = 'flex';
        taskLabel.classList.add('is-loading');
        taskLabel.innerHTML = '<span class="calendar-inline-spinner" aria-hidden="true"></span> Поиск задачи...';
        
        findMatchingTask(event.summary, meetingUrl).then(matchedTask => {
          taskLabel.classList.remove('is-loading');
          if (matchedTask) {
            taskLabel.textContent = `📋 ${matchedTask.name}`;
            goTaskBtn.style.display = '';
            goTaskBtn.onclick = () => {
              $('calendar-event-dialog-overlay')?.classList.remove('visible');
              let taskUrl = matchedTask.url || matchedTask.link || matchedTask.external_url || '';
              if (!taskUrl && store.kanbanBaseUrl && matchedTask.project?.slug && matchedTask.id) {
                 taskUrl = `${store.kanbanBaseUrl}/projects/${matchedTask.project.slug}/${matchedTask.id}`;
              }
              if (taskUrl) openUrl(taskUrl);
            };
          } else {
            taskLabel.textContent = 'Задача не найдена';
            taskLabel.classList.add('is-muted');
            goTaskBtn.style.display = 'none';
          }
        });
      }
      
    } else {
      joinBtn.style.display = 'none';
    }
  }

  $('calendar-event-dialog-overlay')?.classList.add('visible');

  // Handle RSVP in dialog
  const rsvpWrap = $('calendar-event-dialog-rsvp');
  if (rsvpWrap) {
    const statusOptions = [
      { value: 'ACCEPTED', label: '✅ Пойду' },
      { value: 'DECLINED', label: '❌ Не пойду' },
      { value: 'TENTATIVE', label: '❓ Возможно' },
      { value: 'NEEDS-ACTION', label: '✉️ Не ответил' }
    ];
    const currentStatus = event.partstat || 'NEEDS-ACTION';
    const statusCls = { 'ACCEPTED': 'accepted', 'DECLINED': 'declined', 'TENTATIVE': 'tentative', 'NEEDS-ACTION': 'needs-action' };
    
    rsvpWrap.innerHTML = `
      <div class="calendar-event-dialog-rsvp-label">Ваш ответ:</div>
      <select class="calendar-event-rsvp dialog-rsvp ${statusCls[currentStatus] || 'needs-action'}">
        ${statusOptions.map(o => `<option value="${o.value}" ${o.value === currentStatus ? 'selected' : ''}>${o.label}</option>`).join('')}
      </select>
    `;

    const rsvpSelect = rsvpWrap.querySelector('select');
    rsvpSelect.addEventListener('change', async (e) => {
      const newStatus = e.target.value;
      const icsUrl = event.icsUrl;
      if (!icsUrl) return;

      const originalStatus = event.partstat || 'NEEDS-ACTION';
      rsvpSelect.disabled = true;
      rsvpSelect.classList.add('is-updating');

      try {
        const res = await window.api.updateCalendarRsvp({ icsUrl, newStatus });
        if (res.success) {
          event.partstat = newStatus;
          rsvpSelect.className = 'calendar-event-rsvp dialog-rsvp ' + (statusCls[newStatus] || 'needs-action');
          // Important: refresh the main calendar view to sync status on the cards
          renderCalendarEvents();
        } else {
          rsvpSelect.value = originalStatus;
          alert('Ошибка при обновлении статуса: ' + res.error);
        }
      } catch (err) {
        console.error('RSVP dialog error:', err);
      } finally {
        rsvpSelect.disabled = false;
        rsvpSelect.classList.remove('is-updating');
      }
    });
    setupCustomSelects(rsvpWrap);
  }
}

// ── Рендер и загрузка ─────────────────────────────────────────────────────────

export function renderCalendarEvents() {
  const listEl    = $('calendar-list');
  if (!listEl) return;
  setCalendarListVisibility({ showList: true, showLoading: false, showNoIcal: false });

  const filtered = filterEventsByPeriod(calendarEvents, calendarPeriod);
  if (filtered.length === 0) {
    const labels = { today: 'сегодня', tomorrow: 'завтра', '3days': 'на ближайшие 3 дня', week: 'на ближайшую неделю', month: 'на ближайший месяц' };
    renderCalendarMessage(listEl, `Нет запланированных событий ${labels[calendarPeriod]}`);
    return;
  }

  filtered.sort((a, b) => (a.dtstart || 0) - (b.dtstart || 0));
  listEl.innerHTML = '';

  filtered.forEach(event => {
    const isNow      = isEventNow(event.dtstart, event.dtend);
    const item       = document.createElement('div');
    item.className   = 'calendar-event' + (isNow ? ' now' : '');
    const showDate   = calendarPeriod !== 'today' && calendarPeriod !== 'tomorrow';
    const dateLabel  = showDate && event.dtstart ? formatDateShort(event.dtstart) : '';
    const timeStart  = formatEventTime(event.dtstart);
    const timeEnd    = formatEventTime(event.dtend);
    const duration   = formatEventDuration(event.dtstart, event.dtend);
    const meetingUrl = findMeetingUrl(event);

    let timeHtml = timeStart;
    if (timeEnd) timeHtml += ' - ' + timeEnd;
    if (dateLabel) timeHtml = `${dateLabel} | ${timeHtml}`;

    let html = `<div class="calendar-event-time">${timeHtml}</div>`;
    html += `<div class="calendar-event-name">${escapeHtml(event.summary || 'Без названия')}</div>`;
    if (duration) html += `<div class="calendar-event-duration">${duration}</div>`;
    if (event.location && !meetingUrl) html += `<div class="calendar-event-location">📍 ${escapeHtml(event.location)}</div>`;
    // Action buttons container (Meeting + RSVP)
    html += '<div class="calendar-event-actions">';
    
    if (meetingUrl) {
      const type    = getMeetingType(meetingUrl);
      const isVideo = ['telemost', 'zoom', 'meet', 'teams'].includes(type);
      const labels  = { telemost: '🎥 Телемост', peregovorka: '🏢 Переговорка', zoom: '📹 Zoom', meet: '📹 Meet', teams: '📹 Teams', other: '🔗 Подключиться' };
      html += `<a href="#" class="calendar-event-meet ${isVideo ? 'video' : ''}" data-url="${escapeHtml(meetingUrl)}">${labels[type] || labels.other}</a>`;
    }

    // Attendance status dropdown
    const statusOptions = [
      { value: 'ACCEPTED', label: '✅ Пойду' },
      { value: 'DECLINED', label: '❌ Не пойду' },
      { value: 'TENTATIVE', label: '❓ Возможно' },
      { value: 'NEEDS-ACTION', label: '✉️ Не ответил' }
    ];
    const currentStatus = event.partstat || 'NEEDS-ACTION';
    const statusCls = { 'ACCEPTED': 'accepted', 'DECLINED': 'declined', 'TENTATIVE': 'tentative', 'NEEDS-ACTION': 'needs-action' };
    let optionsHtml = statusOptions.map(o =>
      `<option value="${o.value}" ${o.value === currentStatus ? 'selected' : ''}>${o.label}</option>`
    ).join('');
    html += `<select class="calendar-event-rsvp ${statusCls[currentStatus] || 'needs-action'}">${optionsHtml}</select>`;
    
    html += '</div>';

    item.innerHTML = html;
    item.addEventListener('click', (e) => {
      if (e.target.closest('.calendar-event-meet') || e.target.closest('.calendar-event-rsvp')) return;
      showCalendarEventDialog(event);
    });

    const meetLink = item.querySelector('.calendar-event-meet');
    if (meetLink) {
      meetLink.addEventListener('click', (e) => { e.preventDefault(); e.stopPropagation(); handleMeetClick(event.summary, meetLink.dataset.url); });
    }

    // RSVP dropdown handler
    const rsvpSelect = item.querySelector('.calendar-event-rsvp');
    if (rsvpSelect) {
      rsvpSelect.addEventListener('pointerdown', (e) => e.stopPropagation());
      rsvpSelect.addEventListener('mousedown', (e) => e.stopPropagation());
      rsvpSelect.addEventListener('click', (e) => e.stopPropagation());
      rsvpSelect.addEventListener('change', async (e) => {
        e.stopPropagation();
        const newStatus = e.target.value;
        const icsUrl = event.icsUrl;
        
        if (!icsUrl) {
          console.warn('No fetch URL for event, cannot RSVP');
          return;
        }

        // Visual loading state
        const originalStatus = event.partstat || 'NEEDS-ACTION';
        e.target.disabled = true;
        e.target.classList.add('is-updating');

        try {
          const res = await window.api.updateCalendarRsvp({ icsUrl, newStatus });
          if (res.success) {
            event.partstat = newStatus;
            e.target.className = 'calendar-event-rsvp ' + (statusCls[newStatus] || 'needs-action');
//            console.log('RSVP updated successfully');
          } else {
            console.error('RSVP update error:', res.error);
            e.target.value = originalStatus; // Revert
            e.target.className = 'calendar-event-rsvp ' + (statusCls[originalStatus] || 'needs-action');
            alert('Ошибка при обновлении статуса: ' + res.error);
          }
        } catch (err) {
          console.error('RSVP update exception:', err);
          e.target.value = originalStatus; // Revert
        } finally {
          e.target.disabled = false;
          e.target.classList.remove('is-updating');
        }
      });
    }

    listEl.appendChild(item);
    setupCustomSelects(item);
  });
}

export async function loadCalendarEvents(options = {}) {
  const { force = false } = options;
  const listEl    = $('calendar-list');
  const emptyEl   = listEl?.querySelector('.calendar-empty');
  const noIcalEl  = $('calendar-no-ical');
  if (!listEl) return;

  const calendarUrl = store.cfg?.ical_url;
  if (!calendarUrl) {
    if (emptyEl)   emptyEl.style.display   = 'none';
    setCalendarListVisibility({ showList: true, showLoading: false, showNoIcal: true });
    listEl.innerHTML = '';
    listEl.appendChild(noIcalEl);
    if (calendarMiniPanelContainer) renderCalendarMiniPanel(calendarMiniPanelContainer);
    return;
  }

  setCalendarListVisibility({ showList: false, showLoading: true, showNoIcal: false });

  try {
    if (!force && Array.isArray(store.calendarCache.events)) {
      calendarEvents = store.calendarCache.events;
      setCalendarListVisibility({ showList: true, showLoading: false, showNoIcal: false });
      renderCalendarEvents();
      if (calendarMiniPanelContainer) renderCalendarMiniPanel(calendarMiniPanelContainer);
      return;
    }

    if (force) {
      store.calendarCache.events = null;
      store.calendarCache.fetchedAt = 0;
      store.calendarCache.inFlight = null;
    }

    if (!store.calendarCache.inFlight) {
      store.calendarCache.inFlight = window.api.fetchCalendarCalDav(calendarUrl);
    }
    const result = await store.calendarCache.inFlight;
    setCalendarListVisibility({ showList: true, showLoading: false, showNoIcal: false });
    if (!result.success) {
      store.calendarCache.inFlight = null;
      renderCalendarMessage(listEl, `Ошибка загрузки: ${result.error}`);
      if (calendarMiniPanelContainer) renderCalendarMiniPanel(calendarMiniPanelContainer);
      return;
    }
    calendarEvents = processIcalData(result.data);
    store.calendarCache.events = calendarEvents;
    store.calendarCache.fetchedAt = Date.now();
    store.calendarCache.inFlight = null;
    renderCalendarEvents();
    if (calendarMiniPanelContainer) renderCalendarMiniPanel(calendarMiniPanelContainer);
  } catch (err) {
    store.calendarCache.inFlight = null;
    setCalendarListVisibility({ showList: true, showLoading: false, showNoIcal: false });
    renderCalendarMessage(listEl, `Ошибка: ${err.message}`);
  }
}

export function renderCalendarMiniPanel(containerEl) {
  if (!containerEl) return;
  containerEl.innerHTML = '';

  const countEl  = document.getElementById('side-calendar-count');
  const now      = new Date();
  const todayEnd = new Date(now); todayEnd.setHours(23, 59, 59, 999);

  const upcoming = calendarEvents
    .filter(e => e.dtstart && e.dtend && e.dtend >= now && e.dtstart <= todayEnd)
    .sort((a, b) => a.dtstart - b.dtstart)
    .slice(0, 6);

  if (countEl) {
    countEl.textContent  = upcoming.length;
    countEl.style.display = upcoming.length ? '' : 'none';
  }

  if (!upcoming.length) {
    containerEl.innerHTML = '<div class="side-calendar-empty">Нет событий на сегодня</div>';
    return;
  }

  upcoming.forEach(event => {
    const isNow = isEventNow(event.dtstart, event.dtend);
    const item  = document.createElement('div');
    item.className = 'side-calendar-item' + (isNow ? ' now' : '');

    const timeStr = `${formatEventTime(event.dtstart)} – ${formatEventTime(event.dtend)}`;
    const currentStatus = event.partstat || 'NEEDS-ACTION';
    const statusCls     = { 'ACCEPTED': 'accepted', 'DECLINED': 'declined', 'TENTATIVE': 'tentative', 'NEEDS-ACTION': 'needs-action' };
    const statusLabels  = { 'ACCEPTED': 'Пойду', 'DECLINED': 'Не пойду', 'TENTATIVE': 'Возможно', 'NEEDS-ACTION': 'Не ответил' };

    item.innerHTML = `
      <div class="side-calendar-time">${timeStr}</div>
      <div class="side-calendar-name-row">
        <div class="side-calendar-name" title="${escapeHtml(event.summary || '')}">${escapeHtml(event.summary || 'Без названия')}</div>
        <div class="side-calendar-rsvp-mini ${statusCls[currentStatus] || 'needs-action'}">${statusLabels[currentStatus] || statusLabels['NEEDS-ACTION']}</div>
      </div>
    `;

    const meetingUrl = findMeetingUrl(event);
    if (meetingUrl) {
      const link = document.createElement('a');
      link.href = '#';
      link.className = 'calendar-event-meet';
      link.textContent = '▶ Подключиться';
      link.addEventListener('click', (e) => { e.preventDefault(); e.stopPropagation(); handleMeetClick(event.summary, meetingUrl); });
      item.appendChild(link);
    }

    item.addEventListener('click', (e) => {
      if (!e.target.closest('.calendar-event-meet')) showCalendarEventDialog(event);
    });

    containerEl.appendChild(item);
  });
}

// ── Напоминание о созвоне ─────────────────────────────────────────────────────

const remindedEvents = new Set();
const REMIND_BEFORE  = 5 * 60_000; // 5 минут в мс
const REMIND_WINDOW  = 60_000;     // допуск ±60 сек (интервал проверки 30 сек)

async function showMeetingReminder(event) {
  const meetingUrl = findMeetingUrl(event) || null;
  if (!meetingUrl) return;
  const matchedTask = meetingUrl ? await findMatchingTask(event.summary, meetingUrl) : null;

  playSound('meeting_start', true);
  window.api.notify('Созвон через 5 минут', event.summary || 'Без названия');
  window.api.showMeetingReminderWindow({
    name:  event.summary || 'Без названия',
    time:  formatEventTime(event.dtstart),
    url:   meetingUrl,
    theme: localStorage.getItem('theme') || 'dark',
    task:  matchedTask ? { name: matchedTask.name, url: buildTaskUrl(matchedTask) } : null,
  });
}

export function initCalendarReminders() {
  setInterval(() => {
    const now = Date.now();
    calendarEvents.forEach(event => {
      if (!event.dtstart) return;
      const diff = event.dtstart.getTime() - now;
      const key  = `${event.summary}_${event.dtstart.getTime()}`;
      if (diff > REMIND_BEFORE - REMIND_WINDOW && diff <= REMIND_BEFORE && !remindedEvents.has(key)) {
        remindedEvents.add(key);
        showMeetingReminder(event);
      }
    });
  }, 30_000);
}

export function setCalendarMiniPanelContainer(containerEl) {
  calendarMiniPanelContainer = containerEl || null;
  if (calendarMiniPanelContainer) renderCalendarMiniPanel(calendarMiniPanelContainer);
}

export function configureCalendarAutoRefresh() {
  if (calendarAutoRefreshTimer) clearInterval(calendarAutoRefreshTimer);
  const refreshIntervalMin = parseInt(store.cfg?.calendarRefreshInterval, 10) || 15;
  calendarAutoRefreshTimer = setInterval(() => {
    if (store.cfg?.ical_url) loadCalendarEvents({ force: true });
  }, refreshIntervalMin * 60 * 1000);
}

export function initCalendarUI() {
  $('calendar-event-close')?.addEventListener('click', () => {
    $('calendar-event-dialog-overlay')?.classList.remove('visible');
    selectedCalendarEvent = null;
  });

  $('calendar-event-dialog-overlay')?.addEventListener('click', (e) => {
    if (e.target.id === 'calendar-event-dialog-overlay') {
      $('calendar-event-dialog-overlay')?.classList.remove('visible');
      selectedCalendarEvent = null;
    }
  });

  document.getElementById('calendar-period')?.addEventListener('click', (e) => {
    if (e.target.tagName !== 'BUTTON') return;
    document.querySelectorAll('#calendar-period button').forEach(btn => btn.classList.remove('active'));
    e.target.classList.add('active');
    calendarPeriod = e.target.dataset.period;
    if (calendarEvents.length > 0) renderCalendarEvents(); else loadCalendarEvents();
  });

  $('btn-refresh-calendar')?.addEventListener('click', () => {
    invalidateCalendarCache();
    loadCalendarEvents({ force: true });
  });
  $('calendar-event-dialog-content')?.addEventListener('click', (e) => {
    const link = e.target.closest('A');
    if (link) {
      e.preventDefault();
      openUrl(link.href);
    }
  });

  // Автоматическое обновление календаря
}
