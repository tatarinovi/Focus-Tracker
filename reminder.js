function applyData(data) {
  document.documentElement.classList.toggle('light', data.theme === 'light');
  document.getElementById('event-name').textContent = data.name || 'Без названия';
  document.getElementById('event-time').textContent = data.time ? `Начало в ${data.time}` : '';

  const joinBtn = document.getElementById('btn-join');
  const trackingWrap = document.getElementById('tracking-wrap');
  const trackingCheckbox = document.getElementById('track-task');
  const trackingLabel = document.getElementById('track-task-label');

  trackingCheckbox.checked = true;

  if (data.task?.name) {
    trackingWrap.style.display = 'flex';
    trackingCheckbox.disabled = false;
    trackingLabel.textContent = `Начать трекинг задачи: ${data.task.name}`;
  } else {
    trackingWrap.style.display = 'none';
    trackingCheckbox.disabled = true;
    trackingLabel.textContent = '';
  }

  if (data.url) {
    joinBtn.style.display = '';
    joinBtn.onclick = async () => {
      await window.reminderApi.joinMeeting({
        url: data.url,
        shouldStartTask: Boolean(data.task) && trackingCheckbox.checked,
        task: data.task || null,
      });
    };
  } else {
    joinBtn.style.display = 'none';
    joinBtn.onclick = null;
  }
}

function closeWindow() { window.reminderApi.close(); }

document.getElementById('btn-close').addEventListener('click', closeWindow);
document.getElementById('btn-dismiss').addEventListener('click', closeWindow);

window.reminderApi.onUpdate(data => applyData(data));
window.reminderApi.getData().then(data => { if (data) applyData(data); });
