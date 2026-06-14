// Состояние таймера задачи и помодоро
export const state = {
  taskName: '',
  taskComment: '',
  taskUrl: '',
  taskId: null,
  taskStartTime: null,
  taskBeginTime: null,
  taskElapsed: 0,
  taskRunning: false,
  taskInterval: null,
  isLunch: false,

  pomoPhase: 'work',
  pomoTotal: 25 * 60,
  pomoRemaining: 25 * 60,
  pomoRunning: false,
  pomoInterval: null,
};

export const WORK_SEC  = 25 * 60;
export const BREAK_SEC =  5 * 60;
