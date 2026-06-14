const STARTUP_GUARD_MS = 80000;
const message = document.getElementById("message");
const bar = document.getElementById("bar");
const fill = document.getElementById("fill");
const actions = document.getElementById("actions");
const retry = document.getElementById("retry");
const launch = document.getElementById("launch");
const openData = document.getElementById("openData");
const closeButton = document.getElementById("close");

const tauri = window.__TAURI__;
const invoke = tauri?.core?.invoke;
const listen = tauri?.event?.listen;

let startupDone = false;
let channel = "stable";

function setMessage(next) {
  message.textContent = next;
}

function setProgress(percent) {
  bar.classList.remove("indeterminate");
  fill.style.width = `${Math.max(0, Math.min(100, percent))}%`;
}

function setIndeterminate() {
  bar.classList.add("indeterminate");
  fill.style.width = "";
}

function showMigrationActions() {
  actions.style.display = "flex";
  retry.style.display = "none";
  launch.style.display = "none";
  openData.style.display = "inline-flex";
  closeButton.style.display = "inline-flex";
}

function showUpdateActions() {
  actions.style.display = "flex";
  retry.style.display = "inline-flex";
  launch.style.display = "inline-flex";
  openData.style.display = "none";
  closeButton.style.display = "none";
}

async function loadChannel() {
  try {
    const config = await invoke("load_config_cmd");
    channel = config?.update_channel === "beta" ? "beta" : "stable";
  } catch {
    channel = "stable";
  }
}

async function start() {
  if (!invoke || !listen) {
    setMessage("Не удалось запустить служебный слой приложения.");
    showUpdateActions();
    return;
  }

  actions.style.display = "none";
  setIndeterminate();
  setMessage("Проверяем обновления...");
  startupDone = false;
  await loadChannel();

  try {
    const result = await invoke("startup_flow", { channel });
    startupDone = true;
    if (result?.migrationFailed) {
      const migration = result.migration || {};
      setMessage(
        migration.error ||
          "Не удалось подготовить локальные данные. Пользовательские данные не перезаписаны."
      );
      showMigrationActions();
    }
  } catch {
    startupDone = true;
    setMessage("Не удалось завершить запуск. Можно открыть текущую версию вручную.");
    showUpdateActions();
  }
}

listen?.("update-progress", (event) => {
  setProgress(Number(event.payload || 0));
});

listen?.("update-status", (event) => {
  const payload = event.payload || {};
  if (payload.message) {
    setMessage(payload.message);
  }
  if (["checking", "installing", "relaunching", "migrating"].includes(payload.phase)) {
    setIndeterminate();
  }
});

retry.addEventListener("click", () => {
  start();
});

launch.addEventListener("click", async () => {
  await invoke("finish_startup");
});

openData.addEventListener("click", async () => {
  await invoke("open_app_data_dir");
});

closeButton.addEventListener("click", async () => {
  await invoke("close_app");
});

setTimeout(async () => {
  if (!startupDone) {
    setMessage("Запуск занял слишком много времени, открываем текущую версию.");
    try {
      await invoke("finish_startup");
    } catch {
      showUpdateActions();
    }
  }
}, STARTUP_GUARD_MS);

start();
