'use strict';

import { $, escapeHtml, openUrl } from './utils.js';
import { showNotification } from './notifications.js';
import DOMPurify from '../node_modules/dompurify/dist/purify.es.mjs';

let notes       = [];
let currentNote = null;
let editMode    = true;

// ── Утилиты ───────────────────────────────────────────────────────────────────

function formatDate(iso) {
  if (!iso) return '';
  const d   = new Date(iso);
  const pad = n => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function getPreview(content) {
  return (content || '').split('\n').filter(l => l.trim().length > 0 && !l.startsWith('#')).slice(0, 2).join(' ').slice(0, 120);
}

function inlineMd(text) {
  return text
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/\*(.+?)\*/g,     '<em>$1</em>')
    .replace(/~~(.+?)~~/g,     '<del>$1</del>')
    .replace(/`([^`]+)`/g,     '<code>$1</code>')
    .replace(/\[(.+?)\]\((.+?)\)/g, (_, label, url) => `<a target="_blank" href="${escapeHtml(url)}">${label}</a>`);
}

export function renderMarkdown(raw) {
  const lines  = (raw || '').split('\n');
  const out    = [];
  let inCode   = false;
  let codeLang = '';
  let codeBuf  = [];
  let inList   = false;
  let inOList  = false;
  let inTable  = false;
  let tableRows = [];

  function flushList() {
    if (inList)  { out.push('</ul>'); inList = false; }
    if (inOList) { out.push('</ol>'); inOList = false; }
  }

  function flushTable() {
    if (!inTable) return;
    if (tableRows.length > 0) {
      out.push('<div style="overflow-x:auto"><table>');
      let isHeaderRendered = false;
      let hasSep = tableRows.some(row => row.every(c => /^:?-+:?$/.test(c)));

      for (let i = 0; i < tableRows.length; i++) {
        const row = tableRows[i];
        if (row.every(c => /^:?-+:?$/.test(c))) {
          if (i === 1) {
            isHeaderRendered = true;
            out.push('</thead><tbody>');
          }
          continue;
        }

        const tag = (hasSep && i === 0 && !isHeaderRendered) ? 'th' : 'td';
        let tr = '<tr>';
        for (const cell of row) {
          tr += `<${tag}>${inlineMd(escapeHtml(cell))}</${tag}>`;
        }
        tr += '</tr>';

        if (i === 0 && hasSep) {
          out.push('<thead>' + tr);
        } else {
          out.push(tr);
        }
      }

      if (hasSep && isHeaderRendered) {
        out.push('</tbody>');
      } else if (hasSep && !isHeaderRendered) {
        out.push('</thead>');
      }
      out.push('</table></div>');
      tableRows = [];
    }
    inTable = false;
  }

  function flushAll() {
    flushList();
    flushTable();
  }

  for (const line of lines) {
    if (line.startsWith('```')) {
      if (!inCode) {
        flushAll();
        inCode   = true;
        codeLang = line.slice(3).trim();
        codeBuf  = [];
      } else {
        inCode = false;
        out.push(`<pre><code${codeLang ? ` class="lang-${escapeHtml(codeLang)}"` : ''}>${escapeHtml(codeBuf.join('\n'))}</code></pre>`);
        codeBuf = [];
      }
      continue;
    }
    if (inCode) { codeBuf.push(line); continue; }
    
    const trimmed = line.trim();

    if (trimmed.startsWith('|') && trimmed.endsWith('|') && trimmed.length > 1) {
      if (!inTable) { flushAll(); inTable = true; }
      const cells = trimmed.slice(1, -1).split('|').map(c => c.trim());
      tableRows.push(cells);
      continue;
    }

    if (!trimmed) { flushAll(); out.push('<br>'); continue; }

    const hm = line.match(/^(#{1,4})\s+(.+)/);
    if (hm) { flushAll(); out.push(`<h${hm[1].length}>${inlineMd(escapeHtml(hm[2]))}</h${hm[1].length}>`); continue; }

    if (line.startsWith('> ')) { flushAll(); out.push(`<blockquote>${inlineMd(escapeHtml(line.slice(2)))}</blockquote>`); continue; }

    if (/^- \[([ x])\]\s/.test(line)) {
      flushAll();
      const checked = line[3] === 'x';
      const text = line.replace(/^- \[[ x]\]\s/, '');
      out.push(`<label class="md-checkbox ${checked ? 'checked' : ''}"><input type="checkbox" ${checked ? 'checked' : ''}/><span>${inlineMd(escapeHtml(text))}</span></label>`);
      continue;
    }

    if (/^[-*+]\s/.test(line)) {
      if (!inList) { flushTable(); if (inOList) { out.push('</ol>'); inOList = false; } out.push('<ul>'); inList = true; }
      out.push(`<li>${inlineMd(escapeHtml(line.replace(/^[-*+]\s/, '')))}</li>`);
      continue;
    }

    const olm = line.match(/^(\d+)\.\s+(.+)/);
    if (olm) {
      if (!inOList) { flushTable(); if (inList) { out.push('</ul>'); inList = false; } out.push('<ol>'); inOList = true; }
      out.push(`<li>${inlineMd(escapeHtml(olm[2]))}</li>`);
      continue;
    }

    flushAll();
    out.push(`<p>${inlineMd(escapeHtml(line))}</p>`);
  }

  if (inCode) out.push(`<pre><code>${escapeHtml(codeBuf.join('\n'))}</code></pre>`);
  flushAll();
  return out.join('\n');
}

// ── Форматирование (Markdown-панель) ──────────────────────────────────────────

function insertFormatting(prefix, suffix) {
  const ta    = $('note-textarea');
  if (!ta) return;
  const start = ta.selectionStart;
  const end   = ta.selectionEnd;
  const sel   = ta.value.slice(start, end);
  const inner = sel || 'текст';
  ta.setRangeText(prefix + inner + suffix, start, end, 'select');
  if (!sel) {
    ta.selectionStart = start + prefix.length;
    ta.selectionEnd   = start + prefix.length + inner.length;
  }
  ta.focus();
}

function insertLinePrefix(prefix) {
  const ta        = $('note-textarea');
  if (!ta) return;
  const pos       = ta.selectionStart;
  const lineStart = ta.value.lastIndexOf('\n', pos - 1) + 1;
  const lineEnd   = ta.value.indexOf('\n', pos);
  const end       = lineEnd === -1 ? ta.value.length : lineEnd;
  ta.setRangeText(prefix + ta.value.slice(lineStart, end), lineStart, end, 'end');
  ta.focus();
}

const MD_ACTIONS = {
  bold:   () => insertFormatting('**', '**'),
  italic: () => insertFormatting('*', '*'),
  code:   () => insertFormatting('`', '`'),
  strike: () => insertFormatting('~~', '~~'),
  h1:     () => insertLinePrefix('# '),
  quote:  () => insertLinePrefix('> '),
  list:   () => insertLinePrefix('- '),
  olist:  () => insertLinePrefix('1. '),
  link:   () => insertFormatting('[', '](url)'),
  table:  () => insertFormatting('\n| Заголовок 1 | Заголовок 2 |\n| --- | --- |\n| Ячейка 1 | Ячейка 2 |\n', ''),
  check:  () => insertLinePrefix('- [ ] '),
};

// ── Режим (edit / view) ───────────────────────────────────────────────────────

function setMode(mode) {
  editMode       = (mode === 'edit');
  const preview  = $('note-preview');
  const btnEdit  = $('note-btn-edit');
  const btnView  = $('note-btn-view');
  const body     = document.querySelector('.note-dialog-body');

  body?.classList.toggle('is-edit-mode', editMode);
  body?.classList.toggle('is-view-mode', !editMode);

  if (editMode) {
    btnEdit?.classList.add('active');
    btnView?.classList.remove('active');
  } else {
    if (preview) {
      const textarea = $('note-textarea');
      let html = renderMarkdown(textarea?.value || currentNote?.content || '');
      
      DOMPurify.addHook('afterSanitizeAttributes', function (node) {
        if ('target' in node) {
          node.setAttribute('target', '_blank');
        }
      });
      preview.innerHTML = DOMPurify.sanitize(html, { ADD_ATTR: ['target'] });
      DOMPurify.removeHook('afterSanitizeAttributes');
    }
    btnEdit?.classList.remove('active');
    btnView?.classList.add('active');
  }
}

// ── Карточки ──────────────────────────────────────────────────────────────────

function renderNoteCards() {
  const grid  = $('notes-grid');
  const empty = $('notes-empty');
  if (!grid) return;

  if (!notes.length) {
    grid.innerHTML = '';
    if (empty) empty.style.display = 'flex';
    return;
  }
  if (empty) empty.style.display = 'none';

  grid.innerHTML = notes.map(n => {
    const title   = escapeHtml(n.title || 'Без названия');
    const preview = escapeHtml(getPreview(n.content));
    const date    = formatDate(n.updated_at);
    return `
      <div class="note-card" data-id="${n.id}">
        <div class="note-card-title">${title}</div>
        ${preview ? `<div class="note-card-preview">${preview}</div>` : ''}
        <div class="note-card-date">${date}</div>
      </div>`;
  }).join('');

  grid.querySelectorAll('.note-card').forEach(card => {
    card.addEventListener('click', () => {
      const note = notes.find(n => n.id === card.dataset.id);
      if (note) openNoteModal(note);
    });
  });
}

// ── Модалка ───────────────────────────────────────────────────────────────────

function openNoteModal(note) {
  currentNote    = note;
  const overlay  = $('note-dialog-overlay');
  const textarea = $('note-textarea');
  const titleEl  = $('note-title-input');
  const metaEl   = $('note-meta');

  if (textarea) textarea.value = note.content || '';
  if (titleEl)  titleEl.value  = note.title  || '';
  if (metaEl)   metaEl.textContent = note.updated_at ? `Изм.: ${formatDate(note.updated_at)}` : '';

  // Существующие заметки открываем в режиме просмотра, новые — в редактировании
  const isNew = !note.id;
  overlay?.classList.add('visible');
  setMode(isNew ? 'edit' : 'view');
  if (isNew) titleEl?.focus();
}

function closeNoteModal() {
  $('note-dialog-overlay')?.classList.remove('visible');
  currentNote = null;
}

async function saveCurrentNote() {
  const titleEl  = $('note-title-input');
  const textarea = $('note-textarea');
  if (!titleEl || !textarea || !currentNote) return;

  const title   = titleEl.value.trim();
  const content = textarea.value;

  // Не сохраняем новую пустую заметку
  if (!currentNote.id && !title && !content) { closeNoteModal(); return; }

  const result = await window.api.saveNote({ id: currentNote.id, title: title || 'Без названия', content });
  if (!result?.success) {
    const message = result?.error === 'NOTE_ALREADY_EXISTS'
      ? 'Заметка с таким названием уже существует'
      : 'Не удалось сохранить заметку';
    showNotification('⚠ Ошибка', message);
    return;
  }

  const updated = { ...currentNote, id: result.id, title: result.title, content, updated_at: result.updated_at };
  const idx     = notes.findIndex(n => n.id === currentNote.id);
  if (idx !== -1) notes[idx] = updated; else notes.unshift(updated);

  notes.sort((a, b) => new Date(b.updated_at) - new Date(a.updated_at));
  renderNoteCards();
  closeNoteModal();
}

async function deleteCurrentNote() {
  if (!currentNote) return;
  if (currentNote.id) await window.api.deleteNote(currentNote.id);
  notes = notes.filter(n => n.id !== currentNote.id);
  renderNoteCards();
  closeNoteModal();
}

async function createNote() {
  openNoteModal({ id: null, title: '', content: '', updated_at: null });
}

// ── Инициализация ─────────────────────────────────────────────────────────────

export async function initNotesUI() {
  notes = (await window.api.loadNotes()) || [];
  notes.sort((a, b) => new Date(b.updated_at) - new Date(a.updated_at));
  renderNoteCards();

  $('btn-new-note')?.addEventListener('click', createNote);
  $('btn-notes-folder')?.addEventListener('click', () => window.api.openNotesFolder());

  $('note-btn-edit')?.addEventListener('click', () => setMode('edit'));
  $('note-btn-view')?.addEventListener('click', () => setMode('view'));
  $('note-btn-save')?.addEventListener('click', saveCurrentNote);
  $('note-btn-delete')?.addEventListener('click', deleteCurrentNote);
  $('note-btn-close')?.addEventListener('click', saveCurrentNote);

  $('note-dialog-overlay')?.addEventListener('click', e => {
    if (!e.target.closest('.note-dialog')) saveCurrentNote();
  });
  
  $('note-preview')?.addEventListener('click', e => {
    const link = e.target.closest('A');
    if (link) {
      e.preventDefault();
      openUrl(link.href);
      return;
    }

    // Interactive checkboxes — toggle in source markdown
    const checkbox = e.target.closest('input[type="checkbox"]');
    if (checkbox) {
      e.preventDefault();
      e.stopPropagation();
      const textarea = $('note-textarea');
      if (!textarea) return;
      const lines = textarea.value.split('\n');
      const allCheckboxes = $('note-preview').querySelectorAll('.md-checkbox input[type="checkbox"]');
      const idx = Array.from(allCheckboxes).indexOf(checkbox);
      if (idx === -1) return;

      let cbCount = 0;
      for (let i = 0; i < lines.length; i++) {
        if (/^- \[([ x])\]\s/.test(lines[i])) {
          if (cbCount === idx) {
            const wasChecked = lines[i][3] === 'x';
            lines[i] = lines[i].replace(/^- \[[ x]\]/, wasChecked ? '- [ ]' : '- [x]');
            break;
          }
          cbCount++;
        }
      }
      textarea.value = lines.join('\n');
      setMode('view');
    }
  });

  // Markdown-панель — mousedown чтобы не снимать фокус с textarea
  $('note-md-toolbar')?.querySelectorAll('.note-md-btn').forEach(btn => {
    btn.addEventListener('mousedown', e => { e.preventDefault(); MD_ACTIONS[btn.dataset.md]?.(); });
  });

  // Горячие клавиши в textarea
  $('note-textarea')?.addEventListener('keydown', e => {
    if (!e.ctrlKey && !e.metaKey) return;
    if (e.key === 'b') { e.preventDefault(); MD_ACTIONS.bold(); }
    if (e.key === 'i') { e.preventDefault(); MD_ACTIONS.italic(); }
    if (e.key === 'k') { e.preventDefault(); MD_ACTIONS.link(); }
    if (e.key === 's') { e.preventDefault(); saveCurrentNote(); }
  });
}
