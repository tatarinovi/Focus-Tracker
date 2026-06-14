const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('reminderApi', {
  getData:  ()    => ipcRenderer.invoke('get-reminder-data'),
  openUrl:  (url) => ipcRenderer.invoke('open-external', url),
  joinMeeting: (payload) => ipcRenderer.invoke('reminder-join-meeting', payload),
  close:    ()    => ipcRenderer.send('destroy-reminder'),
  onUpdate: (cb)  => ipcRenderer.on('reminder-update', (_e, data) => cb(data)),
});
