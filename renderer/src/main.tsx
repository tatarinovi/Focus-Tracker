import { createRoot } from "react-dom/client";
import "./index.css";

import { api, electronAPI } from "./lib/tauriApi";
(window as any).api = api;
(window as any).electronAPI = electronAPI;

console.info("[Startup] renderer script start");
performance.mark?.("ft-renderer-script-start");

const rootElement = document.getElementById("root");

function renderFatalError(error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  const stack = error instanceof Error ? error.stack : "";
  console.error("[Renderer fatal]", error);
  if (!rootElement) return;
  rootElement.innerHTML = `
    <div style="min-height:100vh;padding:24px;background:#111318;color:#dbe7ff;font:13px system-ui,sans-serif;">
      <h1 style="margin:0 0 12px;font-size:18px;">Focus Tracker не смог открыть интерфейс</h1>
      <p style="margin:0 0 16px;color:#8fa3c8;">Ошибка renderer будет продублирована в терминале.</p>
      <pre style="white-space:pre-wrap;overflow:auto;padding:16px;border:1px solid #263044;border-radius:8px;background:#171b24;color:#ffb4b4;">${escapeHtml(message)}

${escapeHtml(stack || "")}</pre>
    </div>
  `;
}

function escapeHtml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

window.addEventListener("error", (event) => {
  renderFatalError(event.error || event.message);
});

window.addEventListener("unhandledrejection", (event) => {
  renderFatalError(event.reason);
});

if (!rootElement) {
  renderFatalError(new Error("Root element #root was not found"));
} else {
  import("./App")
    .then(({ default: App }) => {
      console.info("[Startup] React render start");
      performance.mark?.("ft-react-render-start");
      createRoot(rootElement).render(<App />);
    })
    .catch(renderFatalError);
}
