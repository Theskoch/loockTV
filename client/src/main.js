const { app, BrowserWindow, ipcMain, screen: electronScreen, shell, desktopCapturer } = require('electron');
const { autoUpdater } = require('electron-updater');

// Allow video autoplay without user gesture (needed for signage)
app.commandLine.appendSwitch('autoplay-policy', 'no-user-gesture-required');
app.commandLine.appendSwitch('enable-features', 'PlatformHEVCDecoderSupport');
app.commandLine.appendSwitch('disable-features', 'MediaCapabilitiesQueryGpuFactories');

const path = require('path');
const fs = require('fs');
const https = require('https');
const http = require('http');
const { io } = require('socket.io-client');

// ─── Logger (20MB rotation) ────────────────────────────────────────────────
const LOG_MAX = 20 * 1024 * 1024;
let LOG_FILE = null;

function initLogger() {
  const logsDir = path.join(app.getPath('userData'), 'logs');
  if (!fs.existsSync(logsDir)) fs.mkdirSync(logsDir, { recursive: true });
  LOG_FILE = path.join(logsDir, 'lookit.log');
  log('INFO', `LoockIT started. userData=${app.getPath('userData')}`);
}

function log(level, ...args) {
  const msg = args.map(a => (a instanceof Error ? a.stack || a.message : typeof a === 'object' ? JSON.stringify(a) : String(a))).join(' ');
  const line = `${new Date().toISOString()} [${level}] ${msg}\n`;
  process.stdout.write(line);
  if (!LOG_FILE) return;
  try {
    let size = 0;
    try { size = fs.statSync(LOG_FILE).size; } catch {}
    if (size >= LOG_MAX) {
      fs.writeFileSync(LOG_FILE, line); // overwrite (rotate)
    } else {
      fs.appendFileSync(LOG_FILE, line);
    }
  } catch {}
}
// ──────────────────────────────────────────────────────────────────────────

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
  initLogger();
  store = await getStore();
  setupAutoUpdater();
  loadCachedPlaylist(); // load from disk before window opens
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

// IPC: Setup form
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
    log('INFO', `Screen paired. id=${info.screen_id} server=${url}`);
    mainWindow.loadFile(path.join(__dirname, 'renderer/player.html'));
    connectToServer(url, apiKey);
    return { ok: true };
  } catch (e) {
    log('ERROR', 'setup:save failed', e);
    return { error: `Ошибка подключения: ${e.message}` };
  }
});

ipcMain.handle('setup:reset', async () => {
  log('INFO', 'Screen reset (unpaired)');
  store.clear();
  if (socket) socket.disconnect();
  mainWindow.loadFile(path.join(__dirname, 'renderer/setup.html'));
  return { ok: true };
});

ipcMain.handle('player:getPlaylist', () => {
  return { playlist: currentPlaylist, override: overrideData };
});

// IPC: Logs
ipcMain.handle('logs:getPath', () => LOG_FILE);
ipcMain.handle('logs:openFolder', () => {
  if (LOG_FILE) shell.showItemInFolder(LOG_FILE);
});

// IPC: App info
ipcMain.handle('app:getVersion', () => app.getVersion());

// ─── Auto-updater ────────────────────────────────────────────────────────
function setupAutoUpdater() {
  autoUpdater.autoDownload = false;
  autoUpdater.autoInstallOnAppQuit = false;

  // Pipe updater logs into our file logger
  autoUpdater.logger = {
    info:  (...a) => log('INFO',  '[updater]', ...a),
    warn:  (...a) => log('WARN',  '[updater]', ...a),
    error: (...a) => log('ERROR', '[updater]', ...a),
    debug: () => {},
  };

  autoUpdater.on('update-available', (info) => {
    log('INFO', `Update available: v${info.version}`);
    mainWindow?.webContents.send('update:status', { stage: 'downloading', version: info.version, percent: 0 });
    autoUpdater.downloadUpdate();
  });

  autoUpdater.on('download-progress', (p) => {
    const percent = Math.round(p.percent);
    mainWindow?.webContents.send('update:status', { stage: 'downloading', percent });
  });

  autoUpdater.on('update-downloaded', (info) => {
    log('INFO', `Update downloaded: v${info.version} — installing in 3s`);
    mainWindow?.webContents.send('update:status', { stage: 'installing', version: info.version });
    setTimeout(() => autoUpdater.quitAndInstall(true, true), 3000);
  });

  autoUpdater.on('update-not-available', () => {
    log('INFO', 'Already up to date');
    mainWindow?.webContents.send('update:status', { stage: 'up-to-date' });
  });

  autoUpdater.on('error', (err) => {
    log('ERROR', 'Update error:', err.message);
    mainWindow?.webContents.send('update:status', { stage: 'error', message: err.message });
  });
}

function checkForUpdate() {
  if (!app.isPackaged) {
    log('INFO', 'Skipping update check in dev mode');
    return;
  }
  autoUpdater.checkForUpdates().catch(e => log('ERROR', 'Update check failed', e.message));
}

// ─── Network helpers ──────────────────────────────────────────────────────
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

function downloadFile(serverUrl, filename, apiKey) {
  return new Promise((resolve, reject) => {
    const dest = path.join(CACHE_DIR, filename);
    if (fs.existsSync(dest)) return resolve(dest);

    log('INFO', `Downloading: ${filename}`);
    const url = `${serverUrl}/api/content/file/${filename}`;
    const parsed = new URL(url);
    const lib = parsed.protocol === 'https:' ? https : http;

    const file = fs.createWriteStream(dest);
    const req = lib.request(url, { headers: { 'x-api-key': apiKey } }, (res) => {
      res.pipe(file);
      file.on('finish', () => file.close(() => {
        log('INFO', `Downloaded: ${filename}`);
        resolve(dest);
      }));
    });
    req.on('error', (e) => {
      log('ERROR', `Download failed: ${filename}`, e.message);
      fs.unlink(dest, () => {});
      reject(e);
    });
    req.end();
  });
}
// ─── Screen capture (preview thumbnail + live view) ───────────────────────
const THUMB = { maxWidth: 480, quality: 60 };   // periodic preview in screen list
const LIVE = { maxWidth: 1280, quality: 70 };    // on-demand live view
const IDLE_INTERVAL = 5 * 60 * 1000;             // preview every 5 min
const LIVE_INTERVAL = 4000;                       // live frame every 4 s
const LIVE_SELF_EXPIRY = 90000;                   // stop live if no fresh start within 90 s

let idleTimer = null;
let liveTimer = null;
let liveExpiry = 0;
let capturing = false;

// Capture the actual physical display (not the app window) and upload as JPEG
async function captureAndUpload({ maxWidth, quality }) {
  if (capturing || !mainWindow) return;
  const serverUrl = store.get('serverUrl');
  const apiKey = store.get('apiKey');
  if (!serverUrl || !apiKey) return;
  capturing = true;
  try {
    const disp = electronScreen.getDisplayMatching(mainWindow.getBounds());
    const aspect = disp.size.height / disp.size.width;
    const thumbnailSize = { width: maxWidth, height: Math.round(maxWidth * aspect) };
    const sources = await desktopCapturer.getSources({ types: ['screen'], thumbnailSize });
    const src = sources.find(s => s.display_id && String(disp.id) === s.display_id) || sources[0];
    if (!src || src.thumbnail.isEmpty()) return;
    const jpeg = src.thumbnail.toJPEG(quality);
    await postBuffer(`${serverUrl}/api/client/screenshot`, apiKey, jpeg);
  } catch (e) {
    log('WARN', 'Screenshot capture/upload failed', e.message);
  } finally {
    capturing = false;
  }
}

function postBuffer(url, apiKey, buffer) {
  return new Promise((resolve, reject) => {
    const parsed = new URL(url);
    const lib = parsed.protocol === 'https:' ? https : http;
    const req = lib.request(url, {
      method: 'POST',
      headers: { 'x-api-key': apiKey, 'Content-Type': 'image/jpeg', 'Content-Length': buffer.length },
    }, (res) => {
      res.on('data', () => {});
      res.on('end', () => (res.statusCode >= 400 ? reject(new Error(`HTTP ${res.statusCode}`)) : resolve()));
    });
    req.on('error', reject);
    req.write(buffer);
    req.end();
  });
}

function startIdleCapture() {
  if (idleTimer) return;
  setTimeout(() => { if (!liveTimer) captureAndUpload(THUMB); }, 15000); // first frame after render
  idleTimer = setInterval(() => { if (!liveTimer) captureAndUpload(THUMB); }, IDLE_INTERVAL);
}

function startLive() {
  liveExpiry = Date.now() + LIVE_SELF_EXPIRY; // refresh expiry on every (re)start
  if (liveTimer) return;
  log('INFO', 'Live capture started');
  captureAndUpload(LIVE);
  liveTimer = setInterval(() => {
    if (Date.now() > liveExpiry) return stopLive();
    captureAndUpload(LIVE);
  }, LIVE_INTERVAL);
}

function stopLive() {
  if (!liveTimer) return;
  clearInterval(liveTimer);
  liveTimer = null;
  log('INFO', 'Live capture stopped');
}
// ─────────────────────────────────────────────────────────────────────────

async function syncPlaylist() {
  const serverUrl = store.get('serverUrl');
  const apiKey = store.get('apiKey');
  if (!serverUrl || !apiKey) return;

  try {
    const data = await fetchJson(`${serverUrl}/api/client/playlist`, apiKey);

    // Try downloading all files; track which succeeded
    if (data.items) {
      for (const item of data.items) {
        if (item.file_path) {
          try { await downloadFile(serverUrl, item.file_path, apiKey); } catch {}
        }
      }
    }
    if (data.override?.file_path) {
      try { await downloadFile(serverUrl, data.override.file_path, apiKey); } catch {}
    }

    // Resolve local paths + mark downloaded (check file actually exists on disk)
    const items = (data.items || []).map(item => {
      const localPath = item.file_path ? path.join(CACHE_DIR, item.file_path) : null;
      const downloaded = localPath ? fs.existsSync(localPath) : true; // URLs always ready
      return { ...item, localPath, downloaded };
    });

    const notReady = items.filter(i => !i.downloaded).length;
    if (notReady > 0) log('INFO', `Sync done. ${items.length - notReady}/${items.length} files ready, ${notReady} still downloading`);

    const prevPlaylistId = currentPlaylist?.playlist_id;
    currentPlaylist = { ...data, items };
    overrideData = data.override ? {
      ...data.override,
      localPath: data.override.file_path ? path.join(CACHE_DIR, data.override.file_path) : null,
      downloaded: data.override.file_path ? fs.existsSync(path.join(CACHE_DIR, data.override.file_path)) : true,
    } : null;

    cleanCache(items);
    saveCachedPlaylist(); // persist to disk for next startup

    if (data.playlist_id !== prevPlaylistId) {
      log('INFO', `Playlist changed → ${data.playlist_id}`);
      restartPlayer();
    }

    mainWindow?.webContents.send('playlist:sync', { playlist: currentPlaylist, override: overrideData });
  } catch (e) {
    log('WARN', 'Sync failed (offline?)', e.message);
    // Offline — keep playing cached playlist
    mainWindow?.webContents.send('playlist:sync', { playlist: currentPlaylist, override: overrideData });
  }
}

function loadCachedPlaylist() {
  try {
    const saved = store.get('lastPlaylist');
    if (!saved?.playlist) return;

    // Re-verify which files are actually on disk (might have been cleaned)
    const items = (saved.playlist.items || []).map(item => ({
      ...item,
      downloaded: item.localPath ? fs.existsSync(item.localPath) : true,
    }));
    currentPlaylist = { ...saved.playlist, items };

    overrideData = saved.override ? {
      ...saved.override,
      downloaded: saved.override.localPath ? fs.existsSync(saved.override.localPath) : true,
    } : null;

    const ready = items.filter(i => i.downloaded).length;
    log('INFO', `Loaded cached playlist from disk: ${ready}/${items.length} files ready`);
  } catch (e) {
    log('WARN', 'Failed to load cached playlist', e.message);
  }
}

function saveCachedPlaylist() {
  try {
    store.set('lastPlaylist', { playlist: currentPlaylist, override: overrideData });
  } catch (e) {
    log('WARN', 'Failed to save playlist to disk', e.message);
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
    auth: { apiKey, version: app.getVersion() },
    reconnection: true,
    reconnectionDelay: 5000,
  });

  socket.on('connect', () => {
    log('INFO', 'Socket connected');
    mainWindow?.webContents.send('server:status', { connected: true });
    syncPlaylist();
  });

  socket.on('disconnect', (reason) => {
    log('WARN', 'Socket disconnected', reason);
    mainWindow?.webContents.send('server:status', { connected: false, reason });
  });

  socket.on('connect_error', (err) => {
    log('ERROR', 'Socket connect error', err.message);
    mainWindow?.webContents.send('server:status', { connected: false, reason: err.message });
  });

  socket.on('playlist:update', () => { log('INFO', 'Playlist update received'); syncPlaylist(); });
  socket.on('override:update', () => { log('INFO', 'Override update received'); syncPlaylist(); });
  socket.on('screen:reboot', () => {
    log('INFO', 'Reboot command received');
    app.relaunch();
    app.exit(0);
  });

  socket.on('screen:update', () => {
    log('INFO', 'Update command received');
    checkForUpdate();
  });

  socket.on('screen:live:start', () => { log('INFO', 'Live view requested'); startLive(); });
  socket.on('screen:live:stop', () => { log('INFO', 'Live view ended'); stopLive(); });

  // First sync + periodic re-sync
  syncPlaylist();
  setInterval(() => syncPlaylist(), 60000);

  // Periodic screen preview (every 5 min)
  startIdleCapture();
}

function restartPlayer() {
  currentIndex = 0;
  clearTimeout(playerTimer);
  mainWindow?.webContents.send('player:restart');
}
