export const $ = (id) => document.getElementById(id);

export function pad(n) { return String(n).padStart(2, '0'); }

export function msToHMS(ms) {
  const s = Math.floor(ms / 1000);
  return `${pad(Math.floor(s / 3600))}:${pad(Math.floor((s % 3600) / 60))}:${pad(s % 60)}`;
}

export function secToMS(sec) { return `${pad(Math.floor(sec / 60))}:${pad(sec % 60)}`; }

export function todayPrefix() {
  const d = new Date();
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export function escapeHtml(str) {
  return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

export function setButtonLoading(btn, loading) {
  if (!btn) return;
  if (loading) {
    btn.classList.add('btn-loading');
    btn.dataset.originalText = btn.textContent;
    btn.textContent = 'Загрузка...';
  } else {
    btn.classList.remove('btn-loading');
    if (btn.dataset.originalText) btn.textContent = btn.dataset.originalText;
  }
}

export function openUrl(url) { if (url) window.api.openExternal(url); }

export function setupCustomSelects(root = document) {
  root.querySelectorAll('select').forEach(select => {
    if (select.classList.contains('calendar-event-rsvp')) return;
    if (select.dataset.customized) {
      select._customSelect?.sync?.();
      return;
    }
    select.dataset.customized = "true";
    
    // Save original styles/display but hide
    select.style.display = 'none';
    
    const wrapper = document.createElement('div');
    wrapper.className = 'custom-select-wrapper';
    
    const trigger = document.createElement('div');
    trigger.className = 'custom-select-trigger';
    const textNode = document.createElement('span');
    trigger.appendChild(textNode);
    
    const arrow = document.createElement('span');
    arrow.className = 'custom-select-arrow';
    arrow.textContent = '▼';
    trigger.appendChild(arrow);
    
    const menu = document.createElement('div');
    menu.className = 'custom-select-menu';

    const selectClasses = Array.from(select.classList);
    if (selectClasses.length) {
      wrapper.classList.add(...selectClasses);
      trigger.classList.add(...selectClasses);
      menu.classList.add(...selectClasses);
    }

    const syncSelectStateClasses = () => {
      const stateClasses = ['accepted', 'declined', 'tentative', 'needs-action'];
      wrapper.classList.remove(...stateClasses);
      trigger.classList.remove(...stateClasses);
      menu.classList.remove(...stateClasses);

      stateClasses.forEach(cls => {
        if (select.classList.contains(cls)) {
          wrapper.classList.add(cls);
          trigger.classList.add(cls);
          menu.classList.add(cls);
        }
      });
    };

    const syncVisualState = () => {
      const selectedOpt = select.options[select.selectedIndex];
      if (selectedOpt) {
        textNode.textContent = selectedOpt.text;
        menu.querySelectorAll('.custom-select-option').forEach(el => el.classList.remove('selected'));
        const targetItem = Array.from(menu.children)[select.selectedIndex];
        if (targetItem) targetItem.classList.add('selected');
      } else if (select.options.length > 0) {
        textNode.textContent = select.options[0].text;
      }
      syncSelectStateClasses();
    };
    
    let selectedOptionText = '';
    const buildMenu = () => {
      selectedOptionText = '';
      menu.innerHTML = '';
      Array.from(select.options).forEach((opt, idx) => {
        const item = document.createElement('div');
        item.className = 'custom-select-option';
        // Explicitly check index and string value to guarantee correct assignment
        if (select.selectedIndex === idx) {
          item.classList.add('selected');
          selectedOptionText = opt.text;
        }
        item.textContent = opt.text;
        item.addEventListener('click', (e) => {
          e.stopPropagation();
          select.selectedIndex = idx;
          select.value = opt.value;
          select.dispatchEvent(new Event('change', { bubbles: true }));
          select.dispatchEvent(new Event('input', { bubbles: true }));
          
          textNode.textContent = opt.text;
          menu.querySelectorAll('.custom-select-option').forEach(el => el.classList.remove('selected'));
          item.classList.add('selected');
          
          wrapper.classList.remove('open');
          menu.classList.remove('show');
        });
        menu.appendChild(item);
      });
      // Fallback
      if (!selectedOptionText && select.options.length > 0) {
        selectedOptionText = select.options[0].text;
      }
      textNode.textContent = selectedOptionText;
    };
    
    buildMenu();
    
    select.addEventListener('change', () => {
      syncVisualState();
    });

    trigger.addEventListener('click', (e) => {
      e.stopPropagation();
      const isOpen = wrapper.classList.contains('open');
      
      // Close all others
      document.querySelectorAll('.custom-select-wrapper').forEach(w => w.classList.remove('open'));
      document.querySelectorAll('.custom-select-menu').forEach(m => m.classList.remove('show'));
      
      if (!isOpen) {
        // Rebuild menu on open just in case native options mutated!
    buildMenu();
    syncSelectStateClasses();
        
        wrapper.classList.add('open');
        menu.classList.add('show');
        
        // Hoist geometry constraints so portal appears absolutely bound to trigger bounds
        const rect = trigger.getBoundingClientRect();
        menu.style.width = rect.width + 'px';
        menu.style.minWidth = rect.width + 'px';
        menu.style.maxWidth = rect.width + 'px';
        menu.style.top = (rect.bottom + 4) + 'px';
        menu.style.left = rect.left + 'px';
        
        // Prevent falloff at bottom of viewport
        setTimeout(() => {
          const docEl = document.documentElement;
          const viewportPadding = 8;
          const menuRect = menu.getBoundingClientRect();
          const maxRight = docEl.clientWidth - viewportPadding;
          const minLeft = viewportPadding;
          let nextLeft = rect.left;

          if (menuRect.right > maxRight) {
            nextLeft -= (menuRect.right - maxRight);
          }
          if (nextLeft < minLeft) {
            nextLeft = minLeft;
          }

          menu.style.left = Math.round(nextLeft) + 'px';

          if (rect.bottom + 4 + menu.offsetHeight > window.innerHeight) {
             menu.style.top = (rect.top - 4 - menu.offsetHeight) + 'px';
          }
        }, 1);
      }
    });
    
    wrapper.appendChild(trigger);
    document.body.appendChild(menu); // Escapes all local overflow wrappers!
    select.parentNode.insertBefore(wrapper, select.nextSibling);
    select._customSelect = {
      wrapper,
      menu,
      trigger,
      sync: () => {
        buildMenu();
        syncVisualState();
      }
    };
  });
  
  if (!window._customSelectListenerAdded) {
    document.addEventListener('click', () => {
      document.querySelectorAll('.custom-select-wrapper').forEach(w => w.classList.remove('open'));
      document.querySelectorAll('.custom-select-menu').forEach(m => m.classList.remove('show'));
    });
    // Attempt closing on scroll so fixed dropdowns don't float disconnectedly over content
    window.addEventListener('scroll', () => {
      document.querySelectorAll('.custom-select-wrapper').forEach(w => w.classList.remove('open'));
      document.querySelectorAll('.custom-select-menu').forEach(m => m.classList.remove('show'));
    }, true);
    window._customSelectListenerAdded = true;
  }
}
