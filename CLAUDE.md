# LoockIT — Контекст проекта для Claude

## Что это
Digital signage система — управление информационными экранами (Windows ПК с Electron).
Сервер + Admin веб-панель + Electron клиент.

## Стек
- **Server**: Node.js + Express + Socket.io + PostgreSQL (порт 3000)
- **Admin UI**: React + Tailwind + Vite → компилируется в `admin-ui/dist/`, раздаётся сервером
- **Client**: Electron.js (только Windows), полноэкранный плеер
- **Deploy**: Docker Compose (services: `server`, `db`), данные вне контейнера
- **CI**: GitHub Actions → при пуше тега `v*` собирает `LoockIT-Setup.exe` и создаёт GitHub Release

## Структура
```
LoockIT/
├── server/src/
│   ├── index.js          # Express + Socket.io, раздаёт admin-ui/dist
│   ├── db/               # schema.sql + pg pool
│   ├── middleware/        # auth.js (JWT), screenAuth.js (x-api-key header)
│   └── routes/
│       ├── admin.js      # POST /login, GET /me
│       ├── screens.js    # CRUD + /reboot + /overrides + /regenerate-key
│       ├── playlists.js  # CRUD + items
│       ├── content.js    # upload (1GB) + url + file serve
│       └── client.js     # /playlist, /info (для Electron клиента)
├── admin-ui/src/
│   ├── App.jsx           # роутер + Layout + ProtectedRoute
│   ├── api.js            # все HTTP запросы
│   └── pages/
│       ├── LoginPage.jsx       # логин + кнопка скачать .exe
│       ├── ScreensPage.jsx     # список экранов, кликабельный
│       ├── ScreenDetailPage.jsx # управление экраном (новый)
│       ├── PlaylistsPage.jsx   # двухпанельный редактор с DnD
│       └── ContentPage.jsx     # загрузка файлов + drag&drop
├── client/src/
│   ├── main.js           # Electron main: sync, socket, IPC, autoplay flags
│   ├── preload.js        # contextBridge
│   └── renderer/
│       ├── setup.html    # первый запуск: ввод serverUrl + apiKey
│       └── player.html   # плеер: слайды, угловое меню (hover), override
├── .github/workflows/
│   └── build-client.yml  # setup-node@v3, npm install, electron-builder, softprops release
├── docker-compose.yml
├── .env.example
└── build.sh
```

## Схема БД
- `admin` — логин/password_hash
- `screens` — id, name, api_key, last_seen, current_playlist_id
- `content` — id, name, type(image|video|url), file_path, url, mime_type, size_bytes
- `playlists` — id, name
- `playlist_items` — playlist_id, content_id, duration_seconds, sort_order
- `screen_overrides` — screen_id, content_id, start_at, end_at

## API
**Admin (Bearer JWT):**
- `POST /api/admin/login`
- `GET /api/screens` / `GET /api/screens/:id`
- `POST /api/screens` / `PUT /api/screens/:id` / `DELETE /api/screens/:id`
- `POST /api/screens/:id/regenerate-key`
- `POST /api/screens/:id/reboot` → socket emit `screen:reboot`
- `GET /api/screens/:id/overrides`
- `POST /api/screens/:id/override` / `DELETE /api/screens/:id/override/:oid`
- `GET/POST/PUT/DELETE /api/playlists` + `GET /api/playlists/:id` (с items)
- `GET /api/content` / `POST /api/content/upload` (1GB) / `POST /api/content/url` / `DELETE /api/content/:id`

**Client (x-api-key header):**
- `GET /api/client/info` — проверка ключа
- `GET /api/client/playlist` — плейлист + активный override
- `GET /api/content/file/:filename` — скачать файл (кэш)

**WebSocket:**
- auth: `{ apiKey }` в handshake
- Server→Client: `playlist:update`, `override:update`, `screen:reboot`

## Логика клиента (Electron)
1. Первый запуск → `setup.html` (serverUrl + apiKey, мин 32 символа)
2. Проверка через `/api/client/info`, сохранение в electron-store
3. Socket.io подключение, синк каждые 60 сек
4. Файлы скачиваются в `userData/cache/`, старые удаляются
5. При дисконекте играет кэш
6. `player.html`: цикл слайдов (image→img, video→video, url→webview)
7. Видео: стартует muted → unmute после `playing` события (обход autoplay policy)
8. При ошибке видео (кодек) — пропуск через 2 сек
9. Override активен если `start_at <= now <= end_at`
10. Угловое меню: невидимая зона 80×80px снизу-слева, при hover появляется панель с инфой и кнопкой "Перепривязать"
11. `screen:reboot` → `app.relaunch() + app.exit(0)`

## Admin UI — страницы
- **Экраны**: список, клик → ScreenDetailPage
- **ScreenDetailPage**: статус/аптайм, смена плейлиста, override с DnD, API ключ (show/copy/regen), reboot, удалить
- **Override DnD**: тащишь контент из левого списка в правую зону → выбираешь время → Apply
- **Плейлисты**: двухпанельный редактор — левая панель очередь (DnD реордер), правая панель библиотека (DnD в очередь), кнопки +/↑↓ тоже есть, один контент можно добавить несколько раз
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

## Сборка Windows клиента
```bash
git tag v1.0.X && git push origin v1.0.X
# → GitHub Actions (windows-latest, setup-node@v3) → release LoockIT-Setup.exe
```
Кнопка на странице входа: `https://github.com/Theskoch/loockTV/releases/latest/download/LoockIT-Setup.exe`

## Текущий статус (последний тег: v1.0.4)
- v1.0.0–v1.0.2: фиксы npm cache в CI
- v1.0.3: убран electron-builder auto-publish, добавлен `permissions: contents: write`
- v1.0.4: autoplay fix (muted start + unmute), onerror skip, autoplay-policy флаг

## Известные ограничения / TODO
- MOV с ProRes кодеком не воспроизведётся — нужно MP4 (H.264). Пользователю сообщено.
- Статус "онлайн" = last_seen > 1 минуты назад (не настоящий WebSocket presence)
- Нет смены пароля администратора через UI (только через .env + пересоздание контейнера)
- Нет поддержки нескольких администраторов

## Переменные окружения (.env)
| Переменная | По умолчанию | Описание |
|---|---|---|
| DB_PASSWORD | lookit_secret | Пароль PostgreSQL |
| JWT_SECRET | change_this... | Секрет JWT (мин 32 символа) |
| ADMIN_USERNAME | admin | Логин |
| ADMIN_PASSWORD | changeme123 | Пароль |
| SERVER_PORT | 3000 | Порт сервера |
