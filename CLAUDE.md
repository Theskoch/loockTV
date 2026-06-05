# LoockIT — Контекст проекта для Claude

## Что это
Digital signage система — управление информационными экранами (Windows ПК с Electron).
Сервер + Admin веб-панель + Electron клиент.

## Стек
- **Server**: Node.js + Express + Socket.io + PostgreSQL (порт 3000)
- **Admin UI**: React + Tailwind + Vite → компилируется в `admin-ui/dist/`, раздаётся сервером
- **Client**: Electron.js (только Windows), полноэкранный плеер
- **Deploy**: Docker Compose (services: `server`, `db`), данные вне контейнера
- **CI**: GitHub Actions → при пуше тега `v*` собирает `LoockIT-Setup.exe` и создаёт GitHub Release через electron-builder (генерирует `latest.yml` для auto-updater)

## Структура
```
LoockIT/
├── server/src/
│   ├── index.js          # Express + Socket.io, раздаёт admin-ui/dist
│   ├── db/               # schema.sql + pg pool
│   ├── middleware/        # auth.js (JWT), screenAuth.js (x-api-key header)
│   └── routes/
│       ├── admin.js      # POST /login, GET /me, GET /latest-version
│       ├── screens.js    # CRUD + /reboot + /update + /overrides + /regenerate-key
│       ├── playlists.js  # CRUD + items
│       ├── content.js    # upload (1GB) + url + file serve
│       └── client.js     # /playlist, /info (для Electron клиента)
├── admin-ui/src/
│   ├── App.jsx           # роутер + Layout + ProtectedRoute
│   ├── api.js            # все HTTP запросы
│   └── pages/
│       ├── LoginPage.jsx       # логин + кнопка скачать .exe
│       ├── ScreensPage.jsx     # список + версия + жёлтый ↑ если апдейт
│       ├── ScreenDetailPage.jsx # управление + кнопка "Обновить до vX"
│       ├── PlaylistsPage.jsx   # двухпанельный редактор с DnD
│       └── ContentPage.jsx     # загрузка файлов + drag&drop
├── client/src/
│   ├── main.js           # Electron main: sync, socket, autoUpdater, IPC, logger
│   ├── preload.js        # contextBridge: setup, player, logs, app, updates
│   └── renderer/
│       ├── setup.html    # первый запуск: ввод serverUrl + apiKey
│       └── player.html   # плеер: слайды, угловое меню (hover), update overlay
├── .github/workflows/
│   └── build-client.yml  # setup-node@v3, set version from tag, electron-builder publish
├── docker-compose.yml
├── .env.example
└── build.sh
```

## Схема БД
- `admin` — логин/password_hash
- `screens` — id, name, api_key, last_seen, current_playlist_id, **app_version**
- `content` — id, name, type(image|video|url), file_path, url, mime_type, size_bytes
- `playlists` — id, name
- `playlist_items` — playlist_id, content_id, duration_seconds, sort_order
- `screen_overrides` — screen_id, content_id, start_at, end_at

## API
**Admin (Bearer JWT):**
- `POST /api/admin/login`
- `GET /api/admin/latest-version` → GitHub Releases API → `{ version: "1.0.8" }`
- `GET /api/screens` / `GET /api/screens/:id`
- `POST /api/screens` / `PUT /api/screens/:id` / `DELETE /api/screens/:id`
- `POST /api/screens/:id/regenerate-key`
- `POST /api/screens/:id/reboot` → socket emit `screen:reboot`
- `POST /api/screens/:id/update` → socket emit `screen:update`
- `GET /api/screens/:id/overrides`
- `POST /api/screens/:id/override` / `DELETE /api/screens/:id/override/:oid`
- `GET/POST/PUT/DELETE /api/playlists` + `GET /api/playlists/:id` (с items)
- `GET /api/content` / `POST /api/content/upload` (1GB) / `POST /api/content/url` / `DELETE /api/content/:id`

**Client (x-api-key header):**
- `GET /api/client/info` — проверка ключа
- `GET /api/client/playlist` — плейлист + активный override
- `GET /api/content/file/:filename` — скачать файл

**WebSocket (Socket.io):**
- auth: `{ apiKey, version }` — версия сохраняется в screens.app_version
- Server→Client: `playlist:update`, `override:update`, `screen:reboot`, `screen:update`

## Логика клиента (Electron)
1. Первый запуск → `setup.html` (serverUrl + apiKey, мин 32 символа)
2. Проверка через `/api/client/info`, сохранение в electron-store
3. При старте: **loadCachedPlaylist()** — загружает `lastPlaylist` из store, проверяет `fs.existsSync` для каждого файла → мгновенный старт без ожидания сервера
4. Socket.io подключение (с версией в auth), синк каждые 60 сек
5. После каждого успешного синка: **saveCachedPlaylist()** сохраняет на диск
6. Файлы скачиваются в `userData/cache/`, старые удаляются
7. При дисконекте играет кэш
8. **player.html**: цикл слайдов (image→img, video→video, url→webview)
9. Видео: стартует muted → unmute после `playing` события
10. При ошибке видео (кодек) — пропуск через 1.5 сек
11. Override активен если `start_at <= now <= end_at`
12. **Скип незагруженных**: `item.downloaded === false` → пропуск; `skipStreak` guard — если все скипнуты, показывает "Загрузка контента..."
13. **Заставка загрузки**: 3 состояния — "Подключение...", "Загрузка файлов...", "Нет плейлиста"
14. Угловое меню (80×80px hover в левом нижнем углу): версия, статус, лог, кнопки
15. **Логирование**: `userData/logs/lookit.log`, 20МБ → ротация (перезапись), кнопка "Открыть папку" в меню
16. **Auto-update**: `screen:update` → `autoUpdater.checkForUpdates()` → скачивает → `quitAndInstall(true, true)` (тихо). Прогресс в overlay.

## Admin UI — страницы
- **Экраны**: список, версия с жёлтым ↑ если устарела, клик → ScreenDetailPage
- **ScreenDetailPage**: статус/аптайм, версия, **кнопка "Обновить до vX.X.X"** (если устарела), смена плейлиста, override с DnD, API ключ (show/copy/regen), reboot, удалить
- **Override DnD**: тащишь контент из левого списка в правую зону → выбираешь время → Apply
- **Плейлисты**: двухпанельный редактор — левая панель очередь (DnD реордер), правая панель библиотека (DnD в очередь), кнопки ↑↓ и +, один контент можно добавить несколько раз, секунды всегда видны (type=text, blur → default 10)
- **Контент**: drag&drop на страницу ИЛИ в зону, multi-file, URL добавление

## Деплой
```bash
# Первый раз
cp .env.example .env && nano .env
cd admin-ui && npm install && npm run build && cd ..
docker compose up -d --build

# Обновление (данные не трогаются)
git pull
cd admin-ui && npm install && npm run build && cd ..
docker compose up -d --build --no-deps server
```

## Выпуск новой версии клиента
```bash
# 1. Обновить client/latest-version.txt (сервер читает этот файл — интернет из Docker недоступен)
echo "1.X.X" > client/latest-version.txt
git add client/latest-version.txt
git commit -m "chore: bump latest-version to 1.X.X"
git push origin main

# 2. Создать тег — запускает GitHub Actions
git tag v1.X.X && git push origin v1.X.X
```
→ GitHub Actions: ставит версию из тега в package.json → electron-builder собирает и публикует на GitHub с `latest.yml` → auto-updater на экранах может обновиться через кнопку в панели.
→ Сервер читает версию из `client/latest-version.txt` (не из GitHub API — Docker не имеет выхода в интернет).

Кнопка скачать на странице входа: `https://github.com/Theskoch/loockTV/releases/latest/download/LoockIT-Setup.exe`

**Важно про auto-updater:** работает начиная с v1.0.9 (первая сборка где CI генерирует `latest.yml`). Экраны на версиях до v1.0.9 нужно обновить вручную один раз — после этого все следующие версии раскатываются из панели.

## История версий
- v1.0.0–v1.0.2: фиксы npm cache в CI
- v1.0.3: убран electron-builder auto-publish, добавлен `permissions: contents: write`
- v1.0.4: autoplay fix (muted start + unmute), onerror skip, autoplay-policy флаг
- v1.0.5: заставка загрузки, скип незагруженных, файловый логгер
- v1.0.6: сохранение плейлиста на диск → мгновенный старт после перезапуска
- v1.0.7: отслеживание версии приложения (screens.app_version, угловая панель, UI)
- v1.0.8: авто-обновление через панель админа (electron-updater, кнопка "Обновить")
- v1.0.9: первая сборка с рабочим auto-updater (latest.yml генерируется CI). С этой версии обновления можно раскатывать из панели без ручной переустановки.
- v1.1.0: fix CI — releaseType=release чтобы electron-builder публиковал не draft-релизы
- v1.1.1: лого LoockIT на заставке загрузки
- v1.1.2: угловая панель всегда доступна, показывает статус подключения к серверу
- v1.1.3: картинки растягиваются на весь экран (object-fit: cover)

## Переменные окружения (.env)
| Переменная | По умолчанию | Описание |
|---|---|---|
| DB_PASSWORD | lookit_secret | Пароль PostgreSQL |
| JWT_SECRET | change_this... | Секрет JWT (мин 32 символа) |
| ADMIN_USERNAME | admin | Логин |
| ADMIN_PASSWORD | changeme123 | Пароль |
| SERVER_PORT | 3000 | Порт сервера |

## Известные ограничения / TODO
- MOV с ProRes кодеком не воспроизведётся — нужно MP4 (H.264)
- Нет смены пароля администратора через UI (только через .env + пересоздание)
- Нет поддержки нескольких администраторов
- Статус "онлайн" = last_seen > 1 минуты назад (не настоящий WebSocket presence)
