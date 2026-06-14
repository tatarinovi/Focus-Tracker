const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('splashApi', {
  onStatus:   (cb) => ipcRenderer.on('splash-status',   (_e, text)    => cb(text)),
  onProgress: (cb) => ipcRenderer.on('splash-progress', (_e, percent) => cb(percent)),
});
