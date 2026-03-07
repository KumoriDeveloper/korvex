# Korvex Tournament Website

Турнирный сайт для CS2 с подключением к базе данных SQLite.

## Установка и запуск

### 1. Установка зависимостей

```bash
npm install
```

### 2. Запуск сервера

```bash
npm start
```

Сервер запустится на `http://localhost:3000`

### 3. Открытие сайта

Откройте в браузере: `http://localhost:3000`

## Структура проекта

- `server.js` - Express сервер с API endpoints
- `database.js` - Инициализация и работа с SQLite БД
- `api.js` - API функции для фронтенда
- `index.html` - Главная страница
- `admin.html` - Админ-панель
- `rankings.html` - Страница рейтингов
- `team-profile.html` - Профиль команды
- `player-profile.html` - Профиль игрока
- `register.html` - Регистрация команды
- `admin-login.html` - Вход в админ-панель

## База данных

База данных SQLite создается автоматически при первом запуске (`database.sqlite`).

### Таблицы:

- `news` - Новости
- `teams` - Заявки команд (pending/approved/rejected)
- `ranking_teams` - Команды в рейтинге
- `ranking_players` - Игроки в рейтинге
- `banners` - Рекламные баннеры
- `team_details` - Детали команд (статистика, достижения, матчи)
- `admins` - Администраторы

## API Endpoints

### Новости
- `GET /api/news` - Получить все новости
- `POST /api/news` - Создать новость
- `PUT /api/news/:id` - Обновить новость
- `DELETE /api/news/:id` - Удалить новость

### Команды
- `GET /api/teams` - Получить все команды
- `POST /api/teams` - Создать команду
- `PUT /api/teams/:id` - Обновить команду
- `DELETE /api/teams/:id` - Удалить команду

### Рейтинг команд
- `GET /api/ranking/teams` - Получить все команды в рейтинге
- `POST /api/ranking/teams` - Добавить команду в рейтинг
- `PUT /api/ranking/teams/:id` - Обновить команду в рейтинге
- `DELETE /api/ranking/teams/:id` - Удалить команду из рейтинга

### Рейтинг игроков
- `GET /api/ranking/players` - Получить всех игроков в рейтинге
- `POST /api/ranking/players` - Добавить игрока в рейтинг
- `PUT /api/ranking/players/:id` - Обновить игрока в рейтинге
- `DELETE /api/ranking/players/:id` - Удалить игрока из рейтинга

### Баннеры
- `GET /api/banners` - Получить все баннеры
- `POST /api/banners` - Создать баннер
- `DELETE /api/banners/:id` - Удалить баннер

### Детали команд
- `GET /api/team-details/:teamId` - Получить детали команды
- `POST /api/team-details/:teamId` - Сохранить детали команды

### Администраторы
- `POST /api/admin/login` - Вход администратора

## Учетные данные по умолчанию

- **Логин:** admin
- **Пароль:** admin

## Примечания

- Все данные теперь хранятся в базе данных SQLite
- При первом запуске автоматически создается администратор по умолчанию
- При одобрении команды она автоматически добавляется в рейтинг, а игроки команды — в рейтинг игроков

