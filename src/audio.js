import { store } from './store.js';

const audioCache = new Map();
let audioUnlocked = false;

function getAudio(path) {
  let audio = audioCache.get(path);
  if (!audio) {
    audio = new window.Audio(path);
    audio.preload = 'auto';
    audioCache.set(path, audio);
  }
  return audio;
}

async function playAudio(audio, volume = 0.5, loop = false) {
  audio.pause();
  audio.currentTime = 0;
  audio.volume = volume;
  audio.loop = loop;
  await audio.play();
}

export async function unlockAudio() {
  if (audioUnlocked) return;

  audioUnlocked = true;
  const audio = getAudio('assets/sounds/success.mp3');

  try {
    audio.muted = true;
    await playAudio(audio, 0);
  } catch (err) {
    audioUnlocked = false;
    throw err;
  } finally {
    audio.pause();
    audio.currentTime = 0;
    audio.muted = false;
  }
}

export function playAudioPath(path, volume = null, loop = false) {
  try {
    const audio = getAudio(path);
    const globalVolume = store.cfg?.sounds?.volume !== undefined ? store.cfg.sounds.volume / 100 : 0.5;
    const finalVolume = volume === 0 ? 0 : globalVolume;
    playAudio(audio, finalVolume, loop).catch(err => {
      console.warn('Не удалось воспроизвести звук. Возможно, требуется взаимодействие пользователя с окном.', err);
    });
  } catch (err) {
    console.warn('Ошибка при загрузке аудио:', err);
  }
}

export function playSound(eventName, loop = false) {
  try {
    const filename = store.cfg?.sounds?.[eventName];
    if (filename === undefined) {
      const defaults = {
        taskSwitch: 'task_switch.mp3',
        pomodoro_work: 'pomodoro_work.mp3',
        pomodoro_rest: 'pomodoro_rest.mp3',
        meeting_start: 'meeting_start.mp3',
        success: 'success.mp3'
      };
      if (defaults[eventName]) playAudioPath(`assets/sounds/${defaults[eventName]}`, null, loop);
      return;
    }
    
    if (filename === '') return; // "Без звука"

    playAudioPath(`assets/sounds/${filename}`, null, loop);
  } catch (err) {
    console.warn(`Ошибка при попытке проиграть звук для события ${eventName}:`, err);
  }
}

export function stopAllSounds() {
  audioCache.forEach(audio => {
    try {
      audio.pause();
      audio.currentTime = 0;
      audio.loop = false;
    } catch (e) {}
  });
}
