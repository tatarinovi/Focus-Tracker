// Общие runtime-данные, разделяемые между модулями
export const store = {
  cfg: null,
  allKanbanTasks: [],
  kanbanBaseUrl: '',
  taskDetailsCache: {},
  calendarCache: {
    events: null,
    fetchedAt: 0,
    inFlight: null,
  },
  kanbanCache: {
    fetchedAt: 0,
    inFlight: null,
  },
};
