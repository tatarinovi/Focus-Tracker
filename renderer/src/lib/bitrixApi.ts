import type { BitrixApiResponse, BitrixTimemanPhase, BitrixTimemanResult, BitrixTimemanStatusSnapshot } from "@/lib/bitrixTypes";
import { BitrixTimemanError } from "@/lib/bitrixTypes";

function parseHms(value: string | null | undefined): number {
  if (!value) return 0;
  const parts = value.split(":").map(Number);
  if (parts.length !== 3 || parts.some((part) => !Number.isFinite(part))) return 0;
  return parts[0] * 3600 + parts[1] * 60 + parts[2];
}

function parseIso(value: string | null | undefined): number | null {
  if (!value) return null;
  const ts = Date.parse(value);
  return Number.isFinite(ts) ? ts : null;
}

function isToday(ts: number | null): boolean {
  if (!ts) return false;
  const date = new Date(ts);
  const now = new Date();
  return (
    date.getFullYear() === now.getFullYear()
    && date.getMonth() === now.getMonth()
    && date.getDate() === now.getDate()
  );
}

export function mapBitrixResultToSnapshot(
  result: BitrixTimemanResult,
  portalUrl = "",
): BitrixTimemanStatusSnapshot {
  const status = result.STATUS ?? "";
  const timeStart = parseIso(result.TIME_START);
  const timeFinish = parseIso(result.TIME_FINISH);
  const duration = parseHms(result.DURATION);
  const leaks = parseHms(result.TIME_LEAKS);
  const now = Date.now();

  if (status === "EXPIRED") {
    throw new BitrixTimemanError(
      "Рабочий день не закрыт с прошлого дня. Завершите его в Bitrix24.",
      "EXPIRED",
      portalUrl,
    );
  }

  let phase: BitrixTimemanPhase;
  if (status === "OPENED") phase = "working";
  else if (status === "PAUSED") phase = "break";
  else if (status === "CLOSED") {
    phase = isToday(timeFinish ?? timeStart) ? "finished" : "not_started";
  } else {
    phase = "not_started";
  }

  let workElapsed = duration;
  let breakUsedTodaySeconds = leaks;
  if ((status === "OPENED" || status === "PAUSED") && timeStart) {
    const wallSeconds = Math.max(0, Math.floor((now - timeStart) / 1000));
    workElapsed = Math.max(0, wallSeconds - leaks);
    breakUsedTodaySeconds = leaks;
  }

  return {
    phase,
    dayStartedAt: timeStart,
    dayEndedAt: phase === "finished" ? timeFinish : null,
    breakStartedAt: status === "PAUSED" ? now : null,
    workElapsed,
    breakUsedTodaySeconds,
    online: true,
    syncedAt: new Date().toISOString(),
    portalUrl,
  };
}

function parseBitrixResponse(response: BitrixApiResponse): BitrixTimemanStatusSnapshot {
  const portalUrl = response.portal_url ?? "";
  if (!response.success) {
    if (response.error_code === "EXPIRED") {
      throw new BitrixTimemanError(
        response.message ?? "Рабочий день не закрыт с прошлого дня. Завершите его в Bitrix24.",
        "EXPIRED",
        portalUrl,
      );
    }
    throw new Error(response.message ?? "Ошибка Bitrix24");
  }
  if (!response.result || typeof response.result !== "object") {
    throw new Error("Пустой ответ Bitrix24");
  }
  return mapBitrixResultToSnapshot(response.result, portalUrl);
}

async function invokeBitrix(
  call: () => Promise<BitrixApiResponse>,
): Promise<BitrixTimemanStatusSnapshot> {
  if (!window.api) throw new Error("API недоступен");
  return parseBitrixResponse(await call());
}

export async function fetchBitrixTimemanStatus(): Promise<BitrixTimemanStatusSnapshot> {
  return invokeBitrix(() => window.api!.bitrixTimemanStatus());
}

export async function fetchBitrixTimemanOpen(): Promise<BitrixTimemanStatusSnapshot> {
  return invokeBitrix(() => window.api!.bitrixTimemanOpen());
}

export async function fetchBitrixTimemanPause(): Promise<BitrixTimemanStatusSnapshot> {
  return invokeBitrix(() => window.api!.bitrixTimemanPause());
}

export async function fetchBitrixTimemanClose(): Promise<BitrixTimemanStatusSnapshot> {
  return invokeBitrix(() => window.api!.bitrixTimemanClose());
}

export async function testBitrixConnection(): Promise<BitrixTimemanStatusSnapshot> {
  return invokeBitrix(() => window.api!.bitrixTestConnection());
}
