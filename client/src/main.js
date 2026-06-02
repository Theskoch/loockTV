const { app, BrowserWindow, ipcMain, screen: electronScreen } = require('electron');
const path = require('path');
const fs = require('fs');
const https = require('https');
const http = require('http');
const { io } = require('socket.io-client');

// electron-store for persistent config
let Store;
async function getStore() {
  if (!Store) {
    const mod = await import('electron-store');
    Store = mod.default;
  }
  return new Store();
}

let store;
let mainWindow;
let socket;
let currentPlaylist = null;
let overrideData = null;
let playerTimer = null;
let currentIndex = 0;

const CACHE_DIR = path.join(app.getPath('userData'), 'cache');
if (!fs.existsSync(CACHE_DIR)) fs.mkdirSync(CACHE_DIR, { recursive: true });

app.whenReady().then(async () => {
  store = await getStore();
  createWindow();
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

function createWindow() {
  const { width, height } = electronScreen.getPrimaryDisplay().workAreaSize;

  mainWindow = new BrowserWindow({
    width,
    height,
    frame: false,
    fullscreen: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      webviewTag: true,
    },
    backgroundColor: '#000000',
  });

  const serverUrl = store.get('serverUrl');
  const apiKey = store.get('apiKey');

  if (!serverUrl || !apiKey) {
    mainWindow.loadFile(path.join(__dirname, 'renderer/setup.html'));
  } else {
    mainWindow.loadFile(path.join(__dirname, 'renderer/player.html'));
    connectToServer(serverUrl, apiKey);
  }
}

// IPC: Setup form submits credentials
ipcMain.handle('setup:save', async (event, { serverUrl, apiKey }) => {
  if (!serverUrl || !apiKey || apiKey.length < 32) {
    return { error: 'Адрес сервера и API ключ (мин. 32 символа) обязательны' };
  }
  const url = serverUrl.replace(/\/$/, '');
  try {
    const info = await fetchJson(`${url}/api/client/info`, apiKey);
    if (!info.screen_id) return { error: 'Неверный ключ или сервер не отвечает' };
    store.set('serverUrl', url);
    store.set('apiKey', apiKey);
    store.set('screenId', info.screen_id);
    mainWindow.loadFile(path.join(__dirname, 'renderer/player.html'));
    connectToServer(url, apiKey);
    return { ok: true };
  } catch (e) {
    return { error: `Ошибка подключения: ${e.message}` };
  }
});

ipcMain.handle('setup:reset', async () => {
  store.clear();
  if (socket) socket.disconnect();
  mainWindow.loadFile(path.join(__dirname, 'renderer/setup.html'));
  return { ok: true };
});

ipcMain.handle('player:getPlaylist', () => {
  return { playlist: currentPlaylist, override: overrideData };
});

// Fetch JSON from server with API key
function fetchJson(url, apiKey) {
  return new Promise((resolve, reject) => {
    const parsed = new URL(url);
    const lib = parsed.protocol === 'https:' ? https : http;
    const req = lib.request(url, { headers: { 'x-api-key': apiKey } }, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        if (res.statusCode >= 400) reject(new Error(`HTTP ${res.statusCode}`));
        else resolve(JSON.parse(data));
      });
    });
    req.on('error', reject);
    req.end();
  });
}

// Download a file to cache
function downloadFile(serverUrl, filename, apiKey) {
  return new Promise((resolve, reject) => {
    const dest = path.join(CACHE_DIR, filename);
    if (fs.existsSync(dest)) return resolve(dest);

    const url = `${serverUrl}/api/content/file/${filename}`;
    const parsed = new URL(url);
    const lib = parsed.protocol === 'https:' ? https : http;

    const file = fs.createWriteStream(dest);
    const req = lib.request(url, { headers: { 'x-api-key': apiKey } }, (res) => {
      res.pipe(file);
      file.on('finish', () => file.close(() => resolve(dest)));
    });
    req.on('error', (e) => { fs.unlink(dest, () => {}); reject(e); });
    req.end();
  });
}

async function syncPlaylist() {
  const serverUrl = store.get('serverUrl');
  const apiKey = store.get('apiKey');
  if (!serverUrl || !apiKey) return;

  try {
    const data = await fetchJson(`${serverUrl}/api/client/playlist`, apiKey);

    // Download all files in playlist
    if (data.items) {
      for (const item of data.items) {
        if (item.file_path) {
          try { await downloadFile(serverUrl, item.file_path, apiKey); } catch (e) { /* skip */ }
        }
      }
    }
    if (data.override?.file_path) {
      try { await downloadFile(serverUrl, data.override.file_path, apiKey); } catch (e) {}
    }

    // Resolve local paths
    const items = (data.items || []).map(item => ({
      ...item,
      localPath: item.file_path ? path.join(CACHE_DIR, item.file_path) : null,
    }));

    const prevPlaylistId = currentPlaylist?.playlist_id;
    currentPlaylist = { ...data, items };
    overrideData = data.override;

    // Remove cached files not in playlist anymore
    cleanCache(items);

    if (data.playlist_id !== prevPlaylistId) {
      restartPlayer();
    }

    mainWindow?.webContents.send('playlist:sync', { playlist: currentPlaylist, override: overrideData });
  } catch (e) {
    // Offline — keep playing cached playlist
    console.log('Sync failed, using cache:', e.message);
  }
}

function cleanCache(items) {
  try {
    const keep = new Set(items.map(i => i.file_path).filter(Boolean));
    if (overrideData?.file_path) keep.add(overrideData.file_path);
    const files = fs.readdirSync(CACHE_DIR);
    for (const f of files) {
      if (!keep.has(f)) {
        try { fs.unlinkSync(path.join(CACHE_DIR, f)); } catch {}
      }
    }
  } catch {}
}

function connectToServer(serverUrl, apiKey) {
  if (socket) socket.disconnect();

  socket = io(serverUrl, {
    auth: { apiKey },
    reconnection: true,
    reconnectionDelay: 5000,
  });

  socket.on('connect', () => {
    console.log('Connected to server');
    syncPlaylist();
  });

  socket.on('playlist:update', () => syncPlaylist());
  socket.on('override:update', () => syncPlaylist());

  // Initial sync and periodic heartbeat sync
  syncPlaylist();
  setInterval(() => syncPlaylist(), 60000);
}

function restartPlayer() {
  currentIndex = 0;
  clearTimeout(playerTimer);
  mainWindow?.webContents.send('player:restart');
}
