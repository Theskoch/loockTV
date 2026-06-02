const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('lookit', {
  setup: {
    save: (data) => ipcRenderer.invoke('setup:save', data),
    reset: () => ipcRenderer.invoke('setup:reset'),
  },
  player: {
    getPlaylist: () => ipcRenderer.invoke('player:getPlaylist'),
    onSync: (cb) => ipcRenderer.on('playlist:sync', (_, data) => cb(data)),
    onRestart: (cb) => ipcRenderer.on('player:restart', () => cb()),
  },
});
