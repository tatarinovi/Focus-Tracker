import { useEffect, useState } from "react";
import { Target, RefreshCw, ExternalLink, Check } from "lucide-react";
import { toast } from "sonner";
import { CHANGELOG } from "@/content/site";

type UpdatePhase = "idle" | "checking" | "downloading" | "installing" | "done";
type UpdateChannel = "stable" | "beta";

export default function AboutPage() {
  const [channel, setChannel] = useState<UpdateChannel>("stable");
  const [updatePhase, setUpdatePhase] = useState<UpdatePhase>("idle");
  const [downloadProgress, setDownloadProgress] = useState(0);
  const [appVersion, setAppVersion] = useState("...");

  useEffect(() => {
    window.api?.getAppVersion?.().then(setAppVersion).catch(() => setAppVersion("unknown"));
    window.api?.loadConfig?.().then((config) => {
      setChannel(config?.update_channel === "beta" ? "beta" : "stable");
    });

    const unlistenProgress = window.api?.onUpdateProgress?.((pct) => {
      setDownloadProgress(pct);
    });
    const unlistenStatus = window.api?.onUpdateStatus?.((status) => {
      if (status.phase === "downloading") setUpdatePhase("downloading");
      if (status.phase === "installing" || status.phase === "relaunching") {
        setUpdatePhase("installing");
      }
      if (status.phase === "timeout" || status.phase === "error") {
        toast.error(status.message);
      }
    });

    return () => {
      unlistenProgress?.();
      unlistenStatus?.();
    };
  }, []);

  const updateChannel = async (nextChannel: UpdateChannel) => {
    setChannel(nextChannel);
    try {
      const config = (await window.api?.loadConfig?.()) || {};
      await window.api?.saveConfig?.({ ...config, update_channel: nextChannel });
      toast.success(`Канал обновлений: ${nextChannel === "beta" ? "Beta" : "Stable"}`);
    } catch {
      toast.error("Не удалось сохранить канал обновлений");
    }
  };

  const checkUpdate = async () => {
    setUpdatePhase("checking");
    setDownloadProgress(0);

    if (!window.api) {
      toast.error("Проверка обновлений доступна только в приложении");
      setUpdatePhase("idle");
      return;
    }

    try {
      const result = await window.api.checkUpdates(channel);
      if (result?.disabled) {
        toast.info("Обновления доступны только в production-сборке");
        setUpdatePhase("idle");
        return;
      }
      if (!result?.success) {
        toast.error(result?.error || "Не удалось проверить обновления");
        setUpdatePhase("idle");
        return;
      }
      if (!result.hasUpdate) {
        toast.info("Обновление не найдено. У вас актуальная версия");
        setUpdatePhase("idle");
        return;
      }

      setUpdatePhase("downloading");
      toast.info(`Найдена версия ${result.version}. Скачиваем обновление`);
      const installed = await window.api.installUpdate(channel);
      if (installed?.disabled) {
        toast.info("Обновления доступны только в production-сборке");
        setUpdatePhase("idle");
        return;
      }
      if (installed?.success === false) {
        toast.error(installed.error || "Не удалось установить обновление");
        setUpdatePhase("idle");
        return;
      }
      setUpdatePhase("done");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Не удалось проверить обновления");
      setUpdatePhase("idle");
    }
  };

  const openLink = (href: string) => {
    if (window.api?.openExternal) {
      window.api.openExternal(href);
      return;
    }
    window.open(href, "_blank", "noopener,noreferrer");
  };

  const buttonText = () => {
    if (updatePhase === "checking") return "Проверка...";
    if (updatePhase === "downloading") return `Загрузка ${downloadProgress}%`;
    if (updatePhase === "installing") return "Установка...";
    if (updatePhase === "done") return "Готово";
    return "Проверить обновления";
  };

  return (
    <div className="p-6 max-w-2xl space-y-6">
      <div className="bg-card border border-border rounded-xl p-6">
        <div className="flex items-center gap-4">
          <div className="w-16 h-16 bg-primary rounded-2xl flex items-center justify-center shadow-lg">
            <Target className="w-9 h-9 text-primary-foreground" />
          </div>
          <div>
            <h1 className="text-xl font-bold">Focus Tracker</h1>
            <p className="text-sm text-muted-foreground">Версия {appVersion}</p>
            <p className="text-xs text-muted-foreground mt-0.5">
              Персональный трекер времени и задач
            </p>
          </div>
        </div>
      </div>

      <div className="bg-card border border-border rounded-xl p-5 space-y-4">
        <h2 className="text-sm font-semibold">Обновления</h2>
        <div>
          <p className="text-xs text-muted-foreground mb-2">Канал обновлений</p>
          <div className="flex gap-2">
            {(["stable", "beta"] as const).map((c) => (
              <button
                key={c}
                data-testid={`button-channel-${c}`}
                onClick={() => updateChannel(c)}
                className={`px-4 py-1.5 rounded-lg border text-sm transition-colors ${
                  channel === c
                    ? "bg-primary/10 border-primary text-primary font-medium"
                    : "border-border text-muted-foreground hover:bg-secondary"
                }`}
              >
                {c === "stable" ? "Stable" : "Beta"}
              </button>
            ))}
          </div>
        </div>

        <div className="space-y-3">
          <button
            data-testid="button-check-updates"
            onClick={checkUpdate}
            disabled={updatePhase !== "idle"}
            className="flex items-center gap-2 bg-primary text-primary-foreground rounded-lg px-4 py-2 text-sm font-medium hover:opacity-90 disabled:opacity-60 transition-opacity"
          >
            {updatePhase === "done" ? (
              <Check className="w-4 h-4" />
            ) : (
              <RefreshCw
                className={`w-4 h-4 ${updatePhase !== "idle" ? "animate-spin" : ""}`}
              />
            )}
            {buttonText()}
          </button>
          {(updatePhase === "downloading" || updatePhase === "installing") && (
            <div className="space-y-1">
              <div className="flex justify-between text-[11px] text-muted-foreground">
                <span>
                  {updatePhase === "installing"
                    ? "Устанавливаем обновление..."
                    : "Загрузка обновления..."}
                </span>
                <span>{updatePhase === "installing" ? "" : `${downloadProgress}%`}</span>
              </div>
              <div className="h-1.5 bg-secondary rounded-full overflow-hidden">
                <div
                  className="h-full bg-primary rounded-full transition-all duration-200"
                  style={{ width: `${updatePhase === "installing" ? 100 : downloadProgress}%` }}
                />
              </div>
            </div>
          )}
        </div>
      </div>

      <div className="bg-card border border-border rounded-xl p-5">
        <h2 className="text-sm font-semibold mb-3">Ссылки</h2>
        <div className="space-y-2">
          {[
            { label: "Документация", href: "https://github.com/tatarinovi/Focus-Tracker" },
            { label: "Поддержка", href: "https://github.com/tatarinovi/Focus-Tracker/issues" },
            { label: "GitHub", href: "https://github.com/tatarinovi/Focus-Tracker" },
            { label: "Сообщить об ошибке", href: "https://github.com/tatarinovi/Focus-Tracker/issues/new" },
          ].map(({ label, href }) => (
            <a
              key={label}
              href={href}
              onClick={(e) => {
                e.preventDefault();
                openLink(href);
              }}
              className="flex items-center justify-between py-2 px-3 rounded-lg hover:bg-secondary transition-colors group cursor-pointer"
            >
              <span className="text-sm">{label}</span>
              <ExternalLink className="w-3.5 h-3.5 text-muted-foreground group-hover:text-foreground transition-colors" />
            </a>
          ))}
        </div>
      </div>

      <div className="bg-card border border-border rounded-xl p-5">
        <h2 className="text-sm font-semibold mb-4">История изменений</h2>
        <div className="space-y-4">
          {CHANGELOG.map((entry, i) => (
            <div
              key={entry.version}
              className={`relative pl-6 ${
                i < CHANGELOG.length - 1 ? "pb-4 border-b border-border" : ""
              }`}
            >
              <div className="absolute left-0 top-1 w-3 h-3 rounded-full bg-primary" />
              <div className="flex items-center gap-2 mb-2">
                <span className="text-sm font-semibold">{entry.version}</span>
                {i === 0 && (
                  <span className="text-[10px] bg-primary/10 text-primary px-1.5 py-0.5 rounded font-medium">
                    Текущая
                  </span>
                )}
                <span className="text-xs text-muted-foreground ml-auto">{entry.date}</span>
              </div>
              <ul className="space-y-1">
                {entry.changes.map((change) => (
                  <li key={change} className="text-xs text-muted-foreground flex items-start gap-1.5">
                    <span className="text-primary mt-0.5">-</span> {change}
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </div>

      <div className="text-center text-xs text-muted-foreground pb-4">
        Focus Tracker v{appVersion} - все права защищены 2026
      </div>
    </div>
  );
}
