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
│       ├── content.js    # upload (10GB) + url + file serve
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
- `screens` — id, name, api_key, last_seen, current_playlist_id, **app_version**, **last_screenshot_at**
- `content` — id, name, type(image|video|url), file_path, url, mime_type, size_bytes, **duration_seconds** (длина видео, определяется в браузере при загрузке)
- `playlists` — id, name
- `playlist_items` — playlist_id, content_id, duration_seconds, sort_order
- `screen_overrides` — screen_id, content_id, start_at, end_at
- `screen_playlist_schedules` — screen_id, playlist_id, start_time, end_time (TIME, окна по времени суток; вне всех окон играет current_playlist_id; при пересечении побеждает окно с поздним start_time)

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
- `GET /api/screens/:id/schedules` — расписание плейлистов экрана
- `POST /api/screens/:id/schedule` `{ playlist_id, start_time, end_time }` / `DELETE /api/screens/:id/schedule/:sid`
- `GET /api/screens/:id/screenshot` — последний скрин экрана (JPEG; auth по Bearer ИЛИ `?token=` для `<img>`)
- `POST /api/screens/:id/live` `{ active }` → socket `screen:live:start/stop` (live-просмотр, авто-стоп 120с без keepalive)
- `GET/POST/PUT/DELETE /api/playlists` + `GET /api/playlists/:id` (с items)
- `GET /api/content` / `POST /api/content/upload` (10GB) / `POST /api/content/url` / `DELETE /api/content/:id`

**Client (x-api-key header):**
- `GET /api/client/info` — проверка ключа
- `POST /api/client/screenshot` — загрузка скрина экрана (сырой `image/jpeg`, лимит 6МБ) → файл `data/screenshots/<screen_id>.jpg` + `last_screenshot_at`
- `GET /api/client/playlist` — плейлист + активный override (сервер выбирает плейлист по расписанию `screen_playlist_schedules` для текущего времени в `APP_TIMEZONE`, иначе current_playlist_id; экран ресинкается раз в 60с, поэтому смена по расписанию подхватывается в течение минуты)
- `GET /api/content/file/:filename` — скачать файл

**WebSocket (Socket.io):**
- auth: `{ apiKey, version }` — версия сохраняется в screens.app_version
- Server→Client: `playlist:update`, `override:update`, `screen:reboot`, `screen:update`, `screen:live:start`, `screen:live:stop`

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
17. **Захват экрана**: `desktopCapturer` снимает РЕАЛЬНЫЙ монитор (не окно). Idle — превью раз в 5 мин (480px JPEG). Live по сокету `screen:live:start` — кадр раз в 4с (1280px), self-expiry 90с. Аплоад сырым `image/jpeg` на `/api/client/screenshot`. Всё в main-процессе, renderer не трогается.

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
# 1. Обновить server/latest-version.txt (сервер читает этот файл — интернет из Docker недоступен)
echo "1.X.X" > server/latest-version.txt
git add server/latest-version.txt
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
- v1.1.4: latest-version.txt перенесён в server/, версия читается из файла (Docker без интернета), CI публикует не-draft релизы
- v1.1.5: лимит загрузки контента 10ГБ (было 1ГБ); прогресс-бар загрузки файла на сервер (XHR вместо fetch) + плашка "Контент загружен" строго после полной загрузки; fix: удаление override раньше времени теперь сразу прерывает его на экране (player.html onSync ловит переход "был активен → удалён/истёк")
- (серверный апдейт, без нового .exe): длительность видео определяется в браузере при загрузке (`<video>` из локального File) и пишется в `content.duration_seconds`; при добавлении видео в плейлист время показа авто-подставляется = длине ролика (можно укоротить вручную); снят лимит 3600с на время показа для любого контента (поле показывает подсказку "8 ч" для длинных значений)
- v1.1.6: захват экрана — превью каждого экрана в списке (раз в 5 мин) + live-просмотр (кадр раз в 4с) через `desktopCapturer` (реальный монитор). Сервер: `POST /client/screenshot`, `GET /screens/:id/screenshot` (auth через `?token=`), `POST /screens/:id/live`. Клиент: захват в main-процессе. Новый том `data/screenshots`. **Правка клиента → нужен новый .exe и раскатка через авто-апдейт**
- (серверный апдейт, без нового .exe): расписание плейлистов по времени суток — на странице экрана можно задать несколько окон (плейлист + С/До), вне окон играет плейлист по умолчанию. Резолв активного плейлиста на сервере в `/api/client/playlist` (таймзона `APP_TIMEZONE`), при пересечении окон побеждает позднее начало, поддержаны окна через полночь. Таблица `screen_playlist_schedules`, эндпоинты `/screens/:id/schedules|schedule`

## Переменные окружения (.env)
| Переменная | По умолчанию | Описание |
|---|---|---|
| DB_PASSWORD | lookit_secret | Пароль PostgreSQL |
| JWT_SECRET | change_this... | Секрет JWT (мин 32 символа) |
| ADMIN_USERNAME | admin | Логин |
| ADMIN_PASSWORD | changeme123 | Пароль |
| SERVER_PORT | 3000 | Порт сервера |
| APP_TIMEZONE | Europe/Moscow | Таймзона (IANA) для расписания плейлистов |

## Известные ограничения / TODO
- MOV с ProRes кодеком не воспроизведётся — нужно MP4 (H.264)
- Нет смены пароля администратора через UI (только через .env + пересоздание)
- Нет поддержки нескольких администраторов
- Статус "онлайн" = last_seen > 1 минуты назад (не настоящий WebSocket presence)
