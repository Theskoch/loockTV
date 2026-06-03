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
  logs: {
    getPath: () => ipcRenderer.invoke('logs:getPath'),
    openFolder: () => ipcRenderer.invoke('logs:openFolder'),
  },
  app: {
    getVersion: () => ipcRenderer.invoke('app:getVersion'),
  },
  updates: {
    onStatus: (cb) => ipcRenderer.on('update:status', (_, data) => cb(data)),
  },
});
