import type { BitrixDayPhase } from "@/context/AppContext";

export type BitrixTimemanMethod = "status" | "open" | "pause" | "resume" | "close";
export type BitrixTimemanPhase = BitrixDayPhase;

export interface BitrixTimemanStatusSnapshot {
  phase: BitrixTimemanPhase;
  dayStartedAt: number | null;
  dayEndedAt: number | null;
  breakStartedAt: number | null;
  workElapsed: number;
  breakUsedTodaySeconds: number;
  online: boolean;
  syncedAt: string;
  portalUrl?: string;
}

export class BitrixTimemanError extends Error {
  code: string;
  portalUrl: string;

  constructor(message: string, code: string, portalUrl: string) {
    super(message);
    this.name = "BitrixTimemanError";
    this.code = code;
    this.portalUrl = portalUrl;
  }
}

export interface BitrixApiResponse {
  success: boolean;
  portal_url?: string;
  result?: BitrixTimemanResult | null;
  error_code?: string;
  message?: string;
}

export interface BitrixTimemanResult {
  STATUS?: string;
  TIME_START?: string | null;
  TIME_FINISH?: string | null;
  DURATION?: string | null;
  TIME_LEAKS?: string | null;
}
