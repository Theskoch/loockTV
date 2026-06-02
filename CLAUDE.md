# LoockIT — Контекст проекта для Claude

## Что это
Digital signage система — управление информационными экранами (Windows ПК с Electron).
Сервер + Admin веб-панель + Electron клиент.

## Стек
- **Server**: Node.js + Express + Socket.io + PostgreSQL (порт 3000)
- **Admin UI**: React + Tailwind + Vite → компилируется в `admin-ui/dist/`, раздаётся сервером
- **Client**: Electron.js (только Windows), полноэкранный плеер
- **Deploy**: Docker Compose (services: `server`, `db`), данные вне контейнера

## Структура
```
LoockIT/
├── server/src/
│   ├── index.js          # точка входа, express + socket.io
│   ├── db/               # schema.sql + pool
│   ├── middleware/        # auth.js (JWT), screenAuth.js (API key)
│   └── routes/           # admin, screens, playlists, content, client
├── admin-ui/src/
│   ├── App.jsx           # роутер + защита маршрутов
│   ├── api.js            # все HTTP запросы
│   └── pages/            # Login, Screens, Playlists, Content
├── client/src/
│   ├── main.js           # Electron main process, sync, socket
│   ├── preload.js        # contextBridge IPC
│   └── renderer/         # setup.html, player.html
├── .github/workflows/
│   └── build-client.yml  # авто-билд Windows .exe → GitHub Releases
├── docker-compose.yml
└── .env.example
```

## Схема БД (PostgreSQL)
- `admin` — логин/пароль хэш администратора
- `screens` — экраны (id, name, api_key, last_seen, current_playlist_id)
- `content` — медиа (id, name, type: image|video|url, file_path, url)
- `playlists` — плейлисты (id, name)
- `playlist_items` — элементы плейлиста (playlist_id, content_id, duration_seconds, sort_order)
- `screen_overrides` — временные прерывания (screen_id, content_id, start_at, end_at)

## API
**Admin (JWT Bearer):**
- `POST /api/admin/login` — получить токен
- `GET/POST /api/screens` — список/создание экранов
- `PUT /api/screens/:id` — обновить (name, current_playlist_id)
- `POST /api/screens/:id/regenerate-key` — новый API ключ (перепривязка)
- `POST /api/screens/:id/override` — временное прерывание
- `GET/POST/PUT/DELETE /api/playlists` + `GET /api/playlists/:id` (с items)
- `GET /api/content` + `POST /api/content/upload` + `POST /api/content/url` + `DELETE /api/content/:id`

**Client (x-api-key header):**
- `GET /api/client/info` — проверка ключа, получение screen_id
- `GET /api/client/playlist` — текущий плейлист + override
- `GET /api/content/file/:filename` — скачать файл (кэшируется на экране)

**WebSocket (Socket.io):**
- auth: `{ apiKey }` в handshake
- Server → Client: `playlist:update`, `override:update`

## Логика клиента (Electron)
1. Первый запуск → `setup.html`: ввод serverUrl + apiKey
2. `main.js` вызывает `/api/client/info` для проверки ключа
3. Подключается к Socket.io, синкает плейлист каждые 60 сек
4. Скачивает все файлы плейлиста в `userData/cache/`
5. При дисконекте продолжает играть кэш
6. `player.html` крутит слайды в цикле (image → img, video → video, url → webview)
7. Override активен если `start_at <= now <= end_at`
8. Кнопка "Перепривязать" в углу → сбрасывает store → открывает setup.html

## Деплой (первый раз)
```bash
cp .env.example .env        # поменять пароли!
cd admin-ui && npm install && npm run build && cd ..
docker compose up -d --build
# сервер: http://localhost:3000  логин: admin / (пароль из .env)
```

## Деплой (обновление без потери данных)
```bash
cd admin-ui && npm run build && cd ..
docker compose up -d --build --no-deps server
```
> Данные в `data/postgres/` и `data/uploads/` вне контейнеров — не затрагиваются.

## Сборка Windows клиента
Автоматически через GitHub Actions при пуше тега:
```bash
git tag v1.0.0 && git push origin v1.0.0
```
Или вручную: GitHub → Actions → "Build Windows Client" → Run workflow.
Готовый `.exe` появляется в GitHub Releases.

На странице входа есть кнопка "Скачать приложение" → последний релиз.

## Переменные окружения (.env)
| Переменная | По умолчанию | Описание |
|---|---|---|
| DB_PASSWORD | lookit_secret | Пароль PostgreSQL |
| JWT_SECRET | change_this... | Секрет для JWT токенов |
| ADMIN_USERNAME | admin | Логин администратора |
| ADMIN_PASSWORD | changeme123 | Пароль администратора |
| SERVER_PORT | 3000 | Порт сервера |

## Известные особенности
- Статус экрана: онлайн если `last_seen > NOW() - 1 минута`
- Файлы хранятся в `data/uploads/` по имени `{timestamp}-{random}{ext}`
- API ключ экрана — 48 hex символов (24 случайных байта)
- Плейлист зациклен: currentIdx сбрасывается в 0 при достижении конца
- Видео: переход после окончания видео (или по duration если задан)
- URL контент: показывается через `<webview>` Electron — требует `webviewTag: true`
