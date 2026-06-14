import { $, escapeHtml, setButtonLoading, setupCustomSelects } from './utils.js';
import { playSound } from './audio.js';

let pendingFiles = [];
let jiraConfig = {};
let compDropdown;
let vertDropdown;
let labelsDropdown;
let contractorDropdown;
let epicDropdown;

function initDropdown(containerId, isMulti, placeholderText) {
  const container = $(containerId);
  if (!container) return null;
  const trigger = container.querySelector('.dropdown-trigger');
  const textSpan = trigger.querySelector('.selected-text');
  const searchInput = container.querySelector('.dropdown-search input');
  const optionsContainer = container.querySelector('.dropdown-options');
  let optionsData = [];
  let selectedValues = [];

  function updateText() {
    if (selectedValues.length === 0) textSpan.textContent = placeholderText;
    else textSpan.textContent = isMulti ? selectedValues.join(', ') : selectedValues[0];
  }
  
  function renderOptions() {
    const filter = searchInput.value.toLowerCase().trim();
    let html = '';
    let hasExactMatch = false;
    
    optionsData.forEach(opt => {
      // Support object options {value: _, label: _} or string options
      const optVal = typeof opt === 'object' ? opt.value : opt;
      const optLabel = typeof opt === 'object' ? opt.label : opt;
      
      if (optLabel.toLowerCase().includes(filter)) {
        if (optLabel.toLowerCase() === filter) hasExactMatch = true;
        const checked = selectedValues.includes(optVal) ? 'checked' : '';
        const safeVal = escapeHtml(optVal);
        const safeLabel = escapeHtml(optLabel);
        if (isMulti) {
          html += `<label class="dropdown-option"><input type="checkbox" value="${safeVal}" ${checked}> ${safeLabel}</label>`;
        } else {
          html += `<div class="dropdown-option" data-val="${safeVal}" data-label="${safeLabel}">${safeLabel}</div>`;
        }
      }
    });

    if (containerId === 'dropdown-labels' && filter && !hasExactMatch) {
      const safeFilter = escapeHtml(filter);
      html = `<label class="dropdown-option"><input type="checkbox" value="${safeFilter}" checked> Создать: ${safeFilter}</label>` + html;
    }
    
    if (!html) html = '<div style="padding: 6px 8px; font-size: 12px; color: var(--text-sec)">Пусто</div>';
    optionsContainer.innerHTML = html;
  }
  
  trigger.addEventListener('click', (e) => {
    e.stopPropagation();
    const isOpen = container.classList.contains('open');
    document.querySelectorAll('.dropdown').forEach(d => d.classList.remove('open'));
    if (!isOpen) { container.classList.add('open'); searchInput.value = ''; renderOptions(); searchInput.focus(); }
  });
  
  searchInput.addEventListener('input', renderOptions);
  
  optionsContainer.addEventListener('change', (e) => {
    if (e.target.type === 'checkbox') {
      const val = e.target.value;
      if (e.target.checked) {
        if (!selectedValues.includes(val)) {
          if (!optionsData.includes(val)) optionsData.push(val);
          selectedValues.push(val);
        }
      } else {
        selectedValues = selectedValues.filter(v => v !== val);
      }
      updateText();
    }
  });

  optionsContainer.addEventListener('click', (e) => {
    const optDiv = e.target.closest('.dropdown-option');
    if (optDiv && !isMulti && optDiv.dataset.val) {
      selectedValues = [optDiv.dataset.val];
      updateText();
      container.classList.remove('open');
    }
  });
  
  updateText();
  
  // Custom fetch function support
  let fetchTimeout;
  if (containerId === 'dropdown-labels') {
    searchInput.addEventListener('input', () => {
       const query = searchInput.value.trim();
       clearTimeout(fetchTimeout);
       
       if (!query) { 
           window.api.getJiraLabels('').then(res => {
               if (res.success && res.data && res.data.suggestions) {
                   optionsData = res.data.suggestions.map(s => s.label);
                   renderOptions();
               }
           });
           return; 
       }
       
       fetchTimeout = setTimeout(async () => {
          const res = await window.api.getJiraLabels(query);
          if (res.success && res.data && res.data.suggestions) {
             optionsData = res.data.suggestions.map(s => s.label);
             renderOptions();
          }
       }, 300);
    });
  }

  return {
    setData: (data) => { 
      optionsData = data; 
      renderOptions(); 
      // Remove loading state
      trigger.classList.remove('loading');
      if (!trigger.querySelector('.arrow')) {
        const arrow = document.createElement('span');
        arrow.className = 'arrow';
        arrow.textContent = '▼';
        trigger.appendChild(arrow);
      }
    },
    setError: (err) => { 
      textSpan.textContent = `Ошибка: ${err}`; 
      trigger.classList.remove('loading');
    },
    setPlaceholder: (text) => { 
      textSpan.textContent = text; 
      trigger.classList.remove('loading');
      if (!trigger.querySelector('.arrow')) {
        const arrow = document.createElement('span');
        arrow.className = 'arrow';
        arrow.textContent = '▼';
        trigger.appendChild(arrow);
      }
    },
    getValues: () => selectedValues,
    selectValues: (vals) => {
      if (!vals || vals.length === 0) {
        selectedValues = [];
      } else {
        selectedValues = isMulti ? [...vals] : [vals[0]];
      }
      renderOptions();
      updateText();
    }
  };
}

document.addEventListener('click', (e) => {
  if (!e.target.closest('.dropdown')) {
    document.querySelectorAll('.dropdown').forEach(d => d.classList.remove('open'));
  }
});

async function loadInitialData() {
  const config = await window.api.loadConfig();
  jiraConfig = {
    url: config.jira_url,
    user: config.jira_user,
    project: config.jira_project
  };
  
  const creds = await window.api.getJiraCredentials();
  jiraConfig.pass = creds.pass;
  
  compDropdown = initDropdown('dropdown-components', true, 'Выберите компоненты');
  vertDropdown = initDropdown('dropdown-version', false, 'Не указана');
  labelsDropdown = initDropdown('dropdown-labels', true, 'Без меток');
  contractorDropdown = initDropdown('dropdown-contractor', false, 'Укажите подрядчика');
  epicDropdown = initDropdown('dropdown-epic', false, 'Без эпика');
  
  // Fetch initial labels from Jira
  window.api.getJiraLabels('').then(res => {
     if (res.success && res.data && res.data.suggestions && labelsDropdown) {
         labelsDropdown.setData(res.data.suggestions.map(s => s.label));
     } else if (labelsDropdown) {
         labelsDropdown.setData([]);
     }
  });
  if (jiraConfig.project) {
      Promise.all([
        window.api.getJiraComponents(jiraConfig.project),
        window.api.getJiraVersions(jiraConfig.project),
        window.api.getJiraCreateMeta(jiraConfig.project),
        window.api.getJiraEpics(jiraConfig.project)
      ]).then(([compRes, vertRes, metaRes, epicsRes]) => {
        if (compRes.success && compDropdown) {
          compDropdown.setData(compRes.data.map(c => c.name));
        } else if (compDropdown) {
          compDropdown.setError(compRes.error);
        }

        if (vertRes.success && vertDropdown) {
          vertDropdown.setData(vertRes.data.map(v => v.name));
        } else if (vertDropdown) {
          vertDropdown.setError(vertRes.error);
        }
        
        if (metaRes.success && metaRes.data && metaRes.data.projects && metaRes.data.projects.length > 0) {
           const projMeta = metaRes.data.projects[0];

           const issueType = projMeta.issuetypes.find(t => t.name === 'Task' || t.name === 'Task / Задача') || projMeta.issuetypes[0];
           if (issueType && issueType.fields) {
               const contractorFieldKey = Object.keys(issueType.fields).find(k => k === 'customfield_13342' || issueType.fields[k].name.toLowerCase() === 'подрядчик');
               
               if (contractorFieldKey) {
                   jiraConfig.contractorId = contractorFieldKey;
                   const fieldDef = issueType.fields[contractorFieldKey];
                   
                   if (fieldDef.allowedValues) {
                       contractorDropdown.setData(fieldDef.allowedValues.map(v => v.value));
                   } else {
                       contractorDropdown.setData([]);
                   }
               } else {
                   if (contractorDropdown) contractorDropdown.setError('Поле не найдено');
               }
           }
        } else {
           if (contractorDropdown) contractorDropdown.setError('Ошибка загрузки полей');
        }

        // Epics
        if (epicsRes.success && epicsRes.data && epicsRes.data.issues && epicDropdown) {
          epicDropdown.setData(epicsRes.data.issues.map(i => ({ value: i.key, label: `${i.key}: ${i.fields.summary}` })));
        } else if (epicDropdown) {
          epicDropdown.setData([]);
        }
      });
      
  } else {
      if (compDropdown) compDropdown.setPlaceholder('Проект не задан');
      if (vertDropdown) vertDropdown.setPlaceholder('Проект не задан');
  }

  // Применяем тему
  const isLight = localStorage.getItem('theme') === 'light';
  document.documentElement.classList.toggle('light', isLight);
  
  // Акцентный цвет
  if (config.accent_color) {
    const color = config.accent_color;
    const r = parseInt(color.slice(1, 3), 16);
    const g = parseInt(color.slice(3, 5), 16);
    const b = parseInt(color.slice(5, 7), 16);
    document.documentElement.style.setProperty('--accent', color);
    document.documentElement.style.setProperty('--accent-dim',  `rgba(${r},${g},${b},0.15)`);
  }
}

function updateFileList() {
  const list = $('file-list');
  list.innerHTML = '';
  pendingFiles.forEach((f, idx) => {
    const item = document.createElement('div');
    item.className = 'file-item';
    item.innerHTML = `
      <span>📄 ${f.name} (${(f.size/1024).toFixed(1)} KB)</span>
      <span class="file-item-remove" data-idx="${idx}">&times;</span>
    `;
    list.appendChild(item);
  });
  
  document.querySelectorAll('.file-item-remove').forEach(btn => {
    btn.addEventListener('click', (e) => {
      const idx = parseInt(e.target.dataset.idx, 10);
      pendingFiles.splice(idx, 1);
      updateFileList();
    });
  });
}

function handleFiles(files) {
  if (!files || files.length === 0) return;
  for (let i = 0; i < files.length; i++) {
    pendingFiles.push(files[i]);
  }
  updateFileList();
}

function initDragAndDrop() {
  const dropZone = $('file-drop');
  const fileInput = $('file-input');
  
  dropZone.addEventListener('click', () => fileInput.click());
  fileInput.addEventListener('change', (e) => handleFiles(e.target.files));
  
  dropZone.addEventListener('dragover', (e) => { e.preventDefault(); dropZone.classList.add('dragover'); });
  dropZone.addEventListener('dragleave', () => dropZone.classList.remove('dragover'));
  dropZone.addEventListener('drop', (e) => {
    e.preventDefault();
    dropZone.classList.remove('dragover');
    if (e.dataTransfer.files) handleFiles(e.dataTransfer.files);
  });
  
  // Вставка из буфера обмена
  document.addEventListener('paste', (e) => {
    if (e.clipboardData?.files?.length > 0) {
      handleFiles(e.clipboardData.files);
    }
  });
}

async function createIssue() {
  const summary = $('j-summary').value.trim();
  if (!summary) return window.api.notify('Ошибка', 'Заголовок не может быть пустым');
  if (!jiraConfig.project) return window.api.notify('Ошибка', 'Не указан ключ проекта в настройках');
  
  setButtonLoading($('btn-create'), true);
  
  const payload = {
    fields: {
      project: { key: jiraConfig.project },
      summary: summary,
      issuetype: { name: $('j-type').value },
      description: $('j-description').value,
      priority: { name: $('j-priority').value }
    }
  };
  
  if (compDropdown) {
    const compValues = compDropdown.getValues();
    if (compValues.length > 0) payload.fields.components = compValues.map(c => ({ name: c }));
  }

  if (labelsDropdown) {
    const labelValues = labelsDropdown.getValues();
    if (labelValues.length > 0) payload.fields.labels = labelValues;
  }

  if (vertDropdown) {
    const vertValues = vertDropdown.getValues();
    if (vertValues.length > 0) payload.fields.fixVersions = [{ name: vertValues[0] }];
  }

  if (contractorDropdown && jiraConfig.contractorId) {
    const contractorValues = contractorDropdown.getValues();
    if (contractorValues.length > 0) {
      // In Jira, single-select fields expect an object: { value: "SelectedName" }
      payload.fields[jiraConfig.contractorId] = { value: contractorValues[0] };
    }
  }

  if (epicDropdown) {
    const epicValues = epicDropdown.getValues();
    if (epicValues.length > 0) {
      payload.fields.customfield_10100 = epicValues[0]; // Epic Link expects the epic key string
    }
  }

  // 1. Создание задачи через IPC
  const createResult = await window.api.createJiraIssue(payload);
  
  if (!createResult.success) {
    setButtonLoading($('btn-create'), false);
    console.error(createResult.error);
    return window.api.notify('Ошибка Jira', createResult.error);
  }
  
  playSound('success');
  const issueKey = createResult.data.key;
  
  // 2. Загрузка вложений 
  if (pendingFiles.length > 0) {
    // Конвертируем файлы в Buffer и шлем через IPC, т.к. из renderer нельзя слать FormData легко с node-fetch в main
    const attachments = [];
    for (const file of pendingFiles) {
      const buffer = await file.arrayBuffer();
      attachments.push({
        name: file.name,
        type: file.type,
        data: buffer
      });
    }
    
    await window.api.uploadJiraAttachments(issueKey, attachments);
  }
  
  window.api.notify('Успех', `Задача ${issueKey} создана!`);
  
  // Show in-window success overlay
  const issueUrl = `${jiraConfig.url}/browse/${issueKey}`;
  const overlay = $('success-overlay');
  const title = $('success-title');
  const hint = $('success-hint');
  const card = $('success-card');
  
  if (overlay && title && hint && card) {
    title.innerHTML = `Задача <span class="success-key">${issueKey}</span> создана!`;
    hint.textContent = 'Нажми, чтобы скопировать ссылку';
    card.classList.remove('copied');
    overlay.classList.add('active');
    setButtonLoading($('btn-create'), false);
    
    const copyHandler = async () => {
      try {
        await navigator.clipboard.writeText(issueUrl);
        hint.textContent = '✓ Ссылка скопирована!';
        card.classList.add('copied');
      } catch (e) {
        hint.textContent = issueUrl;
      }
    };
    
    card.addEventListener('click', copyHandler, { once: true });
    
    setTimeout(() => {
      overlay.classList.remove('active');
      window.api.closeJiraWindow();
    }, 3000);
  } else {
    window.api.closeJiraWindow();
  }
}

function renderJiraMarkdown(text) {
  if (!text) return '';
  let html = text.replace(/</g, "&lt;").replace(/>/g, "&gt;");
  
  // Ordered Lists BEFORE headers (# in Jira md or 1. in standard md)
  // Must be processed before headers to avoid # being treated as h1
  html = html.replace(/^(?:#\s+|\d+\.\s+)(.*)$/gm, '<ol><li>$1</li></ol>');
  html = html.replace(/<\/ol>\s*<ol>/g, '');

  // Headers: Supports both Jira (h1.) and Standard Markdown (##)
  // Note: single # is reserved for Jira ordered lists, so require ## for markdown headers
  html = html.replace(/^(?:h([1-6])\.|\s*(#{2,6}))\s*(.+)$/gm, (match, jiraHs, mdHs, content) => {
    let level = jiraHs ? jiraHs : mdHs.length;
    return `<h${level} style="margin: 8px 0 4px 0;">${content}</h${level}>`;
  });
  
  // Bold: Supports **bold** and *bold*
  html = html.replace(/(?:\*\*|\*)([^\s*].*?[^\s*]|[^\s*])(?:\*\*|\*)/g, '<strong>$1</strong>');
  
  // Color block {color:red}text{color}
  html = html.replace(/\{color:([^}]+)\}(.*?)\{color\}/g, '<span style="color: $1">$2</span>');

  // Unordered Lists
  html = html.replace(/^- (.*)$/gm, '<ul><li>$1</li></ul>');
  html = html.replace(/<\/ul>\s*<ul>/g, '');

  // Emoticons
  html = html.replace(/\(y\)/gi, '👍');
  html = html.replace(/\(n\)/gi, '👎');
  html = html.replace(/:\)/g, '🙂');
  html = html.replace(/:\(/g, '🙁');
  html = html.replace(/:D/g, '😃');

  html = html.replace(/\n/g, '<br>');
  return html;
}

function reverseJiraMarkdown(html) {
  if (!html) return '';
  let md = html;

  // 1. Lists with parent context FIRST (before stripping tags)
  let counter = 0;
  md = md.replace(/<ol[^>]*>([\s\S]*?)<\/ol>/gi, function(match, inner) {
     counter = 0;
     return inner.replace(/<li[^>]*>(.*?)<\/li>/gi, function() {
        counter++;
        return counter + '. ' + arguments[1] + '\n';
     }) + '\n';
  });
  
  md = md.replace(/<ul[^>]*>([\s\S]*?)<\/ul>/gi, function(match, inner) {
     return inner.replace(/<li[^>]*>(.*?)<\/li>/gi, '- $1\n') + '\n';
  });

  // 2. Block elements to newlines
  md = md.replace(/<div[^>]*>/gi, '\n');
  md = md.replace(/<\/div>/gi, '');
  md = md.replace(/<p[^>]*>/gi, '\n');
  md = md.replace(/<\/p>/gi, '');
  md = md.replace(/<br\s*[\/]?>/gi, '\n');

  // 3. Headers
  md = md.replace(/<h([1-6])[^>]*>(.*?)<\/h\1>/gi, 'h$1. $2\n');
  
  // 4. Formatting
  md = md.replace(/<strong>(.*?)<\/strong>/gi, '*$1*');
  md = md.replace(/<span style="color:\s*([^"]+)">(.*?)<\/span>/gi, '{color:$1}$2{color}');
  
  // 5. Emoticons
  md = md.replace(/&lt;/g, "<").replace(/&gt;/g, ">");
  md = md.replace(/\ud83d\udc4d/g, '(y)');
  md = md.replace(/\ud83d\udc4e/g, '(n)');
  md = md.replace(/\ud83d\ude42/g, ':)');
  md = md.replace(/\ud83d\ude41/g, ':(');
  md = md.replace(/\ud83d\ude03/g, ':D');
  
  // 6. Cleanup
  md = md.replace(/&nbsp;/g, ' ');
  md = md.replace(/\n{3,}/g, '\n\n');
  
  return md.trim();
}

function initMarkdownEditor() {
  const tabWrite = $('tab-write');
  const tabPreview = $('tab-preview');
  const textarea = $('j-description');
  const previewDiv = $('j-preview');
  
  if (!tabWrite || !tabPreview) return;

  textarea.addEventListener('input', function() {
    this.style.height = 'auto';
    this.style.height = (this.scrollHeight) + 'px';
  });

  // Sync edits from preview back to textarea
  previewDiv.addEventListener('input', () => {
    textarea.value = reverseJiraMarkdown(previewDiv.innerHTML);
  });

  tabWrite.addEventListener('click', () => {
    tabWrite.classList.add('active');
    tabPreview.classList.remove('active');
    textarea.style.display = 'block';
    previewDiv.classList.remove('active');
    textarea.value = reverseJiraMarkdown(previewDiv.innerHTML);
    
    // Auto-resize
    textarea.style.height = 'auto';
    textarea.style.height = (textarea.scrollHeight) + 'px';
  });

  tabPreview.addEventListener('click', () => {
    tabPreview.classList.add('active');
    tabWrite.classList.remove('active');
    textarea.style.display = 'none';
    previewDiv.classList.add('active');
    previewDiv.innerHTML = renderJiraMarkdown(textarea.value);
  });

  // Init default view (Preview)
  textarea.style.display = 'none';
  previewDiv.classList.add('active');
  previewDiv.innerHTML = renderJiraMarkdown(textarea.value);
}

const BUG_TEMPLATE = `h3. {color:#4c9aff}Test Setup{color}
Device Details: Desktop
Browser Details (optional): Chrome
Environment: TEST
h3. {color:#4c9aff}Pre-Conditions{color}
- Пользователь авторизован
h3. {color:#4c9aff}Steps To Reproduce{color}
1. Шаг 1
h3. {color:#4c9aff}Expected Result{color}
(y)
- Ожидаемый результат
h3. {color:#4c9aff}Current Result{color}
:(
- Фактический результат`;

function initBugTemplate() {
  const typeSelect = $('j-type');
  const descTextarea = $('j-description');
  const previewDiv = $('j-preview');
  if (!typeSelect || !descTextarea) return;

  typeSelect.addEventListener('change', () => {
    if (typeSelect.value === 'Bug') {
      if (!descTextarea.value.trim()) {
        descTextarea.value = BUG_TEMPLATE;
        // Trigger resize
        descTextarea.dispatchEvent(new Event('input'));
        // Sync preview if active
        if (previewDiv.classList.contains('active')) {
          previewDiv.innerHTML = renderJiraMarkdown(descTextarea.value);
        }
      }
    }
  });
}
// ─── Template System ─────────────────────────────────────────────────────────

function getCurrentFormData() {
  return {
    type: $('j-type')?.value || 'Bug',
    summary: $('j-summary')?.value || '',
    priority: $('j-priority')?.value || 'Средний',
    description: $('j-description')?.value || '',
    components: compDropdown ? compDropdown.getValues() : [],
    version: vertDropdown ? vertDropdown.getValues() : [],
    labels: labelsDropdown ? labelsDropdown.getValues() : [],
    contractor: contractorDropdown ? contractorDropdown.getValues() : [],
    epic: epicDropdown ? epicDropdown.getValues() : []
  };
}

function applyTemplate(template) {
  // Always set all fields, clearing those not in the template
  if ($('j-type')) $('j-type').value = template.type || 'Bug';
  if ($('j-summary')) $('j-summary').value = template.summary || '';
  if ($('j-priority')) $('j-priority').value = template.priority || 'Средний';
  
  if ($('j-description')) {
    $('j-description').value = template.description || '';
    $('j-description').dispatchEvent(new Event('input'));
    const preview = $('j-preview');
    if (preview && preview.classList.contains('active')) {
      preview.innerHTML = renderJiraMarkdown(template.description || '');
    }
  }

  // Apply or clear dropdown selections
  if (compDropdown) compDropdown.selectValues(template.components || []);
  if (vertDropdown) vertDropdown.selectValues(template.version || []);
  if (labelsDropdown) labelsDropdown.selectValues(template.labels || []);
  if (contractorDropdown) contractorDropdown.selectValues(template.contractor || []);
  if (epicDropdown) epicDropdown.selectValues(template.epic || []);
}

async function renderTemplateMenu() {
  const menu = $('template-menu');
  if (!menu) return;
  const templates = await window.api.loadJiraTemplates();
  
  let html = '';
  templates.forEach(t => {
    html += `<div class="template-item" data-template="${encodeURIComponent(JSON.stringify(t))}">
      <span>${t.name}</span>
      <span class="template-item-delete" data-name="${t.name}">&times;</span>
    </div>`;
  });
  
  if (templates.length > 0) html += '<div class="template-divider"></div>';
  html += '<div class="template-item create-new" id="btn-create-template">+ Создать новый шаблон</div>';
  
  menu.innerHTML = html;
  
  // Template click handlers
  menu.querySelectorAll('.template-item[data-template]').forEach(item => {
    item.addEventListener('click', (e) => {
      if (e.target.classList.contains('template-item-delete')) return;
      const tpl = JSON.parse(decodeURIComponent(item.dataset.template));
      applyTemplate(tpl);
      $('template-selector')?.classList.remove('open');
    });
  });
  
  // Delete handlers
  menu.querySelectorAll('.template-item-delete').forEach(btn => {
    btn.addEventListener('click', async (e) => {
      e.stopPropagation();
      await window.api.deleteJiraTemplate(btn.dataset.name);
      renderTemplateMenu();
    });
  });
  
  // Create new handler
  menu.querySelector('#btn-create-template')?.addEventListener('click', () => {
    $('template-selector')?.classList.remove('open');
    showSaveModal();
  });
}

function showSaveModal() {
  const modal = $('template-modal');
  const input = $('template-name-input');
  if (!modal || !input) return;
  input.value = '';
  modal.classList.add('active');
  setTimeout(() => input.focus(), 50);
}

function hideSaveModal() {
  $('template-modal')?.classList.remove('active');
}

async function saveCurrentAsTemplate() {
  const name = $('template-name-input')?.value?.trim();
  if (!name) return;
  const data = getCurrentFormData();
  data.name = name;
  await window.api.saveJiraTemplate(data);
  hideSaveModal();
  renderTemplateMenu();
}

function initTemplates() {
  // Header template selector toggle
  $('btn-template')?.addEventListener('click', (e) => {
    e.stopPropagation();
    $('template-selector')?.classList.toggle('open');
    $('split-btn-wrapper')?.classList.remove('open');
  });
  
  // Split button arrow toggle
  $('btn-split-arrow')?.addEventListener('click', (e) => {
    e.stopPropagation();
    $('split-btn-wrapper')?.classList.toggle('open');
    $('template-selector')?.classList.remove('open');
  });
  
  // Save template from split menu
  $('btn-save-template')?.addEventListener('click', () => {
    $('split-btn-wrapper')?.classList.remove('open');
    showSaveModal();
  });
  
  // Modal buttons
  $('btn-template-cancel')?.addEventListener('click', hideSaveModal);
  $('btn-template-save')?.addEventListener('click', saveCurrentAsTemplate);
  $('template-name-input')?.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') saveCurrentAsTemplate();
  });
  
  // Close menus on outside click
  document.addEventListener('click', (e) => {
    if (!e.target.closest('.template-selector')) {
      $('template-selector')?.classList.remove('open');
    }
    if (!e.target.closest('.split-button-wrapper')) {
      $('split-btn-wrapper')?.classList.remove('open');
    }
  });
  
  // Close modal on overlay click
  $('template-modal')?.addEventListener('click', (e) => {
    if (e.target.id === 'template-modal') hideSaveModal();
  });
  
  renderTemplateMenu();
}

document.addEventListener('DOMContentLoaded', async () => {
  setupCustomSelects();
  $('btn-close')?.addEventListener('click', () => window.api.closeJiraWindow());
  $('btn-cancel')?.addEventListener('click', () => window.api.closeJiraWindow());
  $('btn-create')?.addEventListener('click', createIssue);
  
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      if ($('template-modal')?.classList.contains('active')) {
        hideSaveModal();
      } else {
        window.api.closeJiraWindow();
      }
    }
    if (e.key === 'Enter' && e.ctrlKey) createIssue();
  });
  
  initDragAndDrop();
  initMarkdownEditor();
  initTemplates();
  await loadInitialData();
});
