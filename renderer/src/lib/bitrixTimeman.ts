import {
  fetchBitrixTimemanClose,
  fetchBitrixTimemanOpen,
  fetchBitrixTimemanPause,
  fetchBitrixTimemanStatus,
} from "@/lib/bitrixApi";
import type { BitrixTimemanPhase, BitrixTimemanStatusSnapshot } from "@/lib/bitrixTypes";

export function isBitrixConfigured(config: Record<string, unknown> | null | undefined): boolean {
  return Boolean(config?.bitrix_url && (config?.bitrix as { connected?: boolean } | undefined)?.connected);
}

function ensureBitrixReady(config: Record<string, unknown> | null | undefined) {
  if (!window.api) {
    throw new Error("API недоступен");
  }
  if (!isBitrixConfigured(config)) {
    throw new Error("Bitrix24 не настроен");
  }
}

export async function bitrixTimemanStatus(
  config: Record<string, unknown> | null | undefined,
): Promise<BitrixTimemanStatusSnapshot> {
  ensureBitrixReady(config);
  return fetchBitrixTimemanStatus();
}

export async function bitrixTimemanOpen(
  _phase: BitrixTimemanPhase,
  config: Record<string, unknown> | null | undefined,
): Promise<BitrixTimemanStatusSnapshot> {
  ensureBitrixReady(config);
  return fetchBitrixTimemanOpen();
}

export async function bitrixTimemanPause(
  _phase: BitrixTimemanPhase,
  config: Record<string, unknown> | null | undefined,
): Promise<BitrixTimemanStatusSnapshot> {
  ensureBitrixReady(config);
  return fetchBitrixTimemanPause();
}

/** В Bitrix24 возобновление после перерыва — это timeman.open. */
export async function bitrixTimemanResume(
  _phase: BitrixTimemanPhase,
  config: Record<string, unknown> | null | undefined,
): Promise<BitrixTimemanStatusSnapshot> {
  ensureBitrixReady(config);
  return fetchBitrixTimemanOpen();
}

export async function bitrixTimemanClose(
  _phase: BitrixTimemanPhase,
  config: Record<string, unknown> | null | undefined,
): Promise<BitrixTimemanStatusSnapshot> {
  ensureBitrixReady(config);
  return fetchBitrixTimemanClose();
}
