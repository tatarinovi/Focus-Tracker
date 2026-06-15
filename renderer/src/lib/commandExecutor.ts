import { PaletteCommand } from './commandRegistry';

type ExecutorContext = {
  dispatch: (action: any) => void;
  navigate: (path: string) => void;
};

export function executePaletteCommand(command: PaletteCommand, ctx: ExecutorContext) {
  const { dispatch, navigate } = ctx;

  switch (command.type) {
    case 'timer.pause':
      dispatch({ type: 'PAUSE_TIMER' });
      break;
    case 'timer.resume':
      dispatch({ type: 'RESUME_TIMER' });
      break;
    case 'timer.stop':
      dispatch({ type: 'OPEN_STOP_DIALOG' });
      break;
    case 'pomodoro.start':
      dispatch({ type: 'START_POMODORO' });
      break;
    case 'bitrix.day.start':
      window.dispatchEvent(new CustomEvent('bitrix-start-day'));
      break;
    case 'bitrix.break.start':
      window.dispatchEvent(new CustomEvent('bitrix-start-break'));
      break;
    case 'bitrix.break.end':
      window.dispatchEvent(new CustomEvent('bitrix-resume-work'));
      break;
    case 'bitrix.day.end':
      window.dispatchEvent(new CustomEvent('bitrix-end-day'));
      break;
    case 'navigation.open': {
      const page = command.payload?.page as string;
      const routes: Record<string, string> = {
        home: '/',
        kanban: '/kanban',
        settings: '/settings',
        calendar: '/calendar',
        history: '/history',
        pomodoro: '/pomodoro',
        notes: '/notes',
        jira: '/jira',
        about: '/about',
      };
      if (page && routes[page]) {
        window.api?.paletteShowMain();
        navigate(routes[page]);
      }
      break;
    }
    case 'task.open': {
      const taskId = command.payload?.taskId as number;
      window.api?.paletteShowMain();
      navigate(`/kanban?task=${taskId}`);
      break;
    }
    case 'task.start': {
      const taskId = command.payload?.taskId as number;
      window.dispatchEvent(new CustomEvent('palette-start-task', { detail: { taskId } }));
      break;
    }
    default:
      console.warn('[Palette] Unknown command:', command.type);
  }
}
