import { toast as sonnerToast } from "sonner";
import { APP_SOUNDS } from "@/lib/audioOptions";

export type AppSoundKey = keyof typeof APP_SOUNDS;

let appAudioVolume = 80;

export function setAppAudioVolume(volume: number) {
  const nextVolume = Number(volume);
  appAudioVolume = Number.isFinite(nextVolume)
    ? Math.max(0, Math.min(100, nextVolume))
    : 80;
}

const audioCache = new Map<string, HTMLAudioElement>();

export function playAppSound(sound: AppSoundKey) {
  if (typeof Audio === "undefined") return;

  let audio = audioCache.get(sound);
  if (!audio) {
    audio = new Audio(APP_SOUNDS[sound]);
    audioCache.set(sound, audio);
  }
  audio.volume = Math.max(0, Math.min(1, appAudioVolume / 100));
  audio.currentTime = 0;
  void audio.play().catch(() => {});
}

export function stopAllSounds() {
  for (const audio of audioCache.values()) {
    audio.pause();
    audio.currentTime = 0;
  }
}

export const soundToast = {
  success: (...args: Parameters<typeof sonnerToast.success>) => {
    return sonnerToast.success(...args);
  },
  info: (...args: Parameters<typeof sonnerToast.info>) => {
    return sonnerToast.info(...args);
  },
  error: (...args: Parameters<typeof sonnerToast.error>) => {
    playAppSound("error");
    return sonnerToast.error(...args);
  },
};
