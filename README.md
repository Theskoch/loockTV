# LoockIT — Digital Signage

Система управления информационными экранами. Сервер с веб-панелью + Windows приложение для экранов.

## Быстрый старт

### Требования
- Docker + Docker Compose
- Node.js 20+ (для сборки Admin UI)

### 1. Клонировать и настроить

```bash
git clone https://github.com/Theskoch/loockTV.git
cd loockTV
cp .env.example .env
```

Открыть `.env` и поменять пароли:
```
DB_PASSWORD=your_db_password
JWT_SECRET=your_jwt_secret_min_32_chars
ADMIN_PASSWORD=your_admin_password
```

### 2. Собрать и запустить

```bash
# Собрать Admin UI
cd admin-ui
npm install
npm run build
cd ..

# Запустить сервисы
docker compose up -d --build
```

Панель администратора: **http://localhost:3000**  
Логин: `admin` / пароль из `.env`

### 3. Скачать приложение для экрана

На странице входа есть кнопка **«Скачать приложение»** — скачивает последний Windows установщик.

Или перейти: [GitHub Releases](https://github.com/Theskoch/loockTV/releases/latest)

### 4. Настройка экрана (Windows ПК)

1. Установить `LoockIT-Setup.exe`
2. При первом запуске ввести:
   - **Адрес сервера**: `http://192.168.1.100:3000` (IP твоего сервера)
   - **API ключ**: скопировать из панели → Экраны → кнопка **Ключ**
3. Экран появится в панели как онлайн

---

## Обновление без потери данных

```bash
git pull
cd admin-ui && npm run build && cd ..
docker compose up -d --build --no-deps server
```

> Файлы (`data/uploads/`) и база данных (`data/postgres/`) хранятся вне контейнеров и не затрагиваются при обновлении.

---

## Сборка Windows клиента вручную

Автоматически собирается через GitHub Actions при пуше тега:

```bash
git tag v1.0.0
git push origin v1.0.0
```

Или запустить вручную: **GitHub → Actions → Build Windows Client → Run workflow**

Для локальной сборки (нужен Windows или Wine):
```bash
cd client
npm install
npm run build
# installer в client/release/
```

---

## Структура проекта

```
├── server/          Node.js API + Socket.io
├── admin-ui/        React веб-панель
├── client/          Electron Windows приложение
├── data/
│   ├── uploads/     Загруженные медиафайлы (вне Docker)
│   └── postgres/    База данных (вне Docker)
├── docker-compose.yml
└── .env.example
```

---

## Функции

- **Экраны**: добавление, удаление, статус онлайн/оффлайн
- **Плейлисты**: изображения, видео, веб-сайты с настройкой длительности
- **Прерывание**: показать что-то конкретное с по определённому времени
- **Офлайн режим**: экран продолжает крутить кэшированный плейлист при потере сети
- **Перепривязка**: кнопка для перегенерации API ключа экрана
