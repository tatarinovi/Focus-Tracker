const tauri = window.__TAURI__;
const invoke = tauri?.core?.invoke ?? (() => Promise.reject(new Error('Tauri IPC not available')));
const listen = tauri?.event?.listen ?? (() => () => {});

const reminderApi = {
  getData: () => invoke("get_reminder_data"),
  close: () => invoke("destroy_reminder"),
  joinMeeting: ({ url, shouldStartTask, task }) =>
    invoke("reminder_join_meeting", { url, shouldStartTask, task }),
  onUpdate: (callback) => {
    listen("reminder-update", (event) => callback(event.payload));
  },
};

function applyData(data) {
  document.documentElement.classList.toggle("light", data.theme === "light");
  document.getElementById("event-name").textContent = data.name || "Без названия";
  document.getElementById("event-time").textContent = data.time ? `Начало в ${data.time}` : "";

  const joinBtn = document.getElementById("btn-join");
  const trackingWrap = document.getElementById("tracking-wrap");
  const trackingCheckbox = document.getElementById("track-task");
  const trackingLabel = document.getElementById("track-task-label");

  trackingCheckbox.checked = true;

  if (data.task?.name) {
    trackingWrap.style.display = "flex";
    trackingCheckbox.disabled = false;
    trackingLabel.textContent = `Начать трекинг задачи: ${data.task.name}`;
  } else {
    trackingWrap.style.display = "none";
    trackingCheckbox.disabled = true;
    trackingLabel.textContent = "";
  }

  if (data.url) {
    joinBtn.style.display = "";
    joinBtn.onclick = async () => {
      await reminderApi.joinMeeting({
        url: data.url,
        shouldStartTask: Boolean(data.task) && trackingCheckbox.checked,
        task: data.task || null,
      });
    };
  } else {
    joinBtn.style.display = "none";
    joinBtn.onclick = null;
  }
}

function closeWindow() {
  reminderApi.close();
}

document.getElementById("btn-close").addEventListener("click", closeWindow);
document.getElementById("btn-dismiss").addEventListener("click", closeWindow);

reminderApi.onUpdate((data) => applyData(data));
reminderApi.getData().then((data) => {
  if (data) applyData(data);
});
