# Backend

REST API на Go. Единственный источник данных для бота и фронтенда.

> Запуск и переменные окружения — в корневом [README.md](../README.md).

## Схема базы данных

База создаётся автоматически при первом запуске (`InitDB`). Все таблицы создаются через `CREATE TABLE IF NOT EXISTS`.

### `users`

| Колонка                 | Тип           | Описание                                      |
| ----------------------- | ------------- | --------------------------------------------- |
| `user_id`               | `BIGINT PK`   | ID пользователя в MAX                         |
| `full_name`             | `TEXT`        | Имя и фамилия                                 |
| `role`                  | `TEXT`        | `applicant` / `organizer` / `admin`           |
| `consent_given`         | `BOOLEAN`     | Согласие на обработку ПД                      |
| `consent_date`          | `TIMESTAMPTZ` | Дата согласия                                 |
| `consent_version`       | `TEXT`        | Версия соглашения                             |
| `notifications_enabled` | `BOOLEAN`     | Включены ли напоминания (по умолчанию `true`) |

### `events`

| Колонка                     | Тип              | Описание                                            |
| --------------------------- | ---------------- | --------------------------------------------------- |
| `id`                        | `SERIAL PK`      | —                                                   |
| `title`                     | `VARCHAR`        | Название                                            |
| `description`               | `VARCHAR`        | Краткое описание                                    |
| `content`                   | `TEXT`           | Полный текст                                        |
| `max_slots`                 | `INT`            | Лимит мест (`NULL` — без лимита)                    |
| `cancellation_rules`        | `TEXT`           | Правила отмены записи                               |
| `date`                      | `TIMESTAMPTZ`    | Дата и время мероприятия                            |
| `format`                    | `VARCHAR`        | `online` / `offline`                                |
| `type`                      | `VARCHAR`        | `hackathon` / `olympiad` / `conference` / `openday` |
| `created_by`                | `BIGINT → users` | Организатор                                         |
| `created_at` / `updated_at` | `TIMESTAMPTZ`    | —                                                   |
| `closed`                    | `BOOLEAN`        | Запись закрыта вручную                              |
| `image_url`                 | `TEXT`           | Путь к изображению (`/uploads/...`)                 |

### `registrations`

| Колонка         | Тип              | Описание                            |
| --------------- | ---------------- | ----------------------------------- |
| `id`            | `SERIAL PK`      | —                                   |
| `user_id`       | `BIGINT → users` | —                                   |
| `event_id`      | `INT → events`   | —                                   |
| `registered_at` | `TIMESTAMPTZ`    | —                                   |
| `code`          | `TEXT UNIQUE`    | Уникальный код для QR-подтверждения |
| `reminder_sent` | `BOOLEAN`        | Отправлено ли напоминание           |
| `attended`      | `BOOLEAN`        | Отметка о посещении                 |

### `reviews`

| Колонка      | Тип              | Описание         |
| ------------ | ---------------- | ---------------- |
| `id`         | `SERIAL PK`      | —                |
| `event_id`   | `INT → events`   | —                |
| `user_id`    | `BIGINT → users` | —                |
| `rating`     | `INT`            | Оценка от 1 до 5 |
| `comment`    | `TEXT`           | Текст отзыва     |
| `created_at` | `TIMESTAMPTZ`    | —                |

Уникальный индекс `(event_id, user_id)` — один отзыв на мероприятие.

### `agreements`

| Колонка      | Тип           | Описание                               |
| ------------ | ------------- | -------------------------------------- |
| `id`         | `SERIAL PK`   | —                                      |
| `version`    | `TEXT UNIQUE` | Номер версии, например `1.0`           |
| `file_path`  | `TEXT`        | Путь к PDF (`/uploads/agreements/...`) |
| `created_at` | `TIMESTAMPTZ` | —                                      |
| `is_active`  | `BOOLEAN`     | Активная версия (одна в каждый момент) |

При первом запуске, если нет ни одной активной записи, создаётся заглушка `agreement_1.0.pdf`. Замените её реальным файлом через `POST /api/admin/agreement`.

## Инициализация ролей при старте

При каждом запуске сервера:

- Пользователь из `ADMIN_USER_ID` получает роль `admin` (upsert).
- Пользователи из `ORGANIZER_USER_IDS` (список через запятую) получают роль `organizer` (upsert).

Если переменная не задана — шаг пропускается, предупреждение в логе.

## Аутентификация

Все эндпоинты (кроме `/health` и `GET /api/agreement/current`) требуют заголовок:

```
X-API-Key: <значение API_KEY из .env>
```

Эндпоинты, доступные пользователю, дополнительно требуют:

```
Authorization: Bearer <JWT>
```

JWT выдаётся автоматически при первом обращении пользователя через бот (`GET /api/user/me`). Срок действия — 24 часа. Алгоритм подписи — HS256, секрет из `JWT_SECRET`.

Уровни защиты middleware:

| Middleware      | Условие                                               |
| --------------- | ----------------------------------------------------- |
| `APIAuth`       | Только `X-API-Key` (для межсервисных вызовов из бота) |
| `UserAuth`      | `X-API-Key` + валидный JWT любой роли                 |
| `OrganizerAuth` | `X-API-Key` + JWT с ролью `organizer`                 |
| `AdminAuth`     | `X-API-Key` + JWT с ролью `admin`                     |

## Вебхук к боту

При обновлении или закрытии мероприятия backend асинхронно отправляет `POST` на `BOT_WEBHOOK_URL` с заголовком `X-API-Key`.

**Тело запроса:**

```json
{
    "type": "event_update",
    "event_id": 42,
    "event_title": "Хакатон МИРЭА",
    "changed_fields": ["date", "max_slots"],
    "old_data": { "date": 1748000000, "max_slots": 50 },
    "new_data": { "date": 1748086400, "max_slots": 30 }
}
```

Возможные значения `type`:

| Значение       | Когда                                                     |
| -------------- | --------------------------------------------------------- |
| `event_update` | Организатор изменил поля мероприятия                      |
| `event_closed` | Организатор закрыл запись (`POST /api/events/{id}/close`) |

Поля `changed_fields`, `old_data`, `new_data` присутствуют только для `event_update`.

## Статические файлы

Изображения мероприятий и PDF-соглашения отдаются напрямую:

```
GET /uploads/events/<filename>
GET /uploads/agreements/<filename>
```

Файлы хранятся в директории `uploads/` рядом с бинарником.
