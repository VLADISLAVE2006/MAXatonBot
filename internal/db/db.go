package db

import (
    "database/sql"
    "fmt"
    "log"
    "os"

    _ "github.com/lib/pq" // драйвер PostgreSQL
)

// DB - глобальный объект базы данных (можно использовать и без глобальной переменной, но для простоты)
var DB *sql.DB

// InitDB устанавливает соединение с БД и создаёт таблицы, если их нет
func InitDB() error {
    // Формируем строку подключения
    connStr := fmt.Sprintf(
        "host=%s port=%s user=%s password=%s dbname=%s sslmode=disable",
        os.Getenv("DB_HOST"),
        os.Getenv("DB_PORT"),
        os.Getenv("DB_USER"),
        os.Getenv("DB_PASSWORD"),
        os.Getenv("DB_NAME"),
    )

    var err error
    DB, err = sql.Open("postgres", connStr)
    if err != nil {
        return fmt.Errorf("failed to open db: %w", err)
    }

    // Проверяем соединение
    if err = DB.Ping(); err != nil {
        return fmt.Errorf("cannot ping db: %w", err)
    }

    log.Println("Connected to PostgreSQL")

    // Создаём таблицу users, если ещё не создана
    createTableSQL := `
    CREATE TABLE IF NOT EXISTS users (
        user_id         BIGINT PRIMARY KEY,
        full_name       TEXT,
        role            TEXT NOT NULL DEFAULT 'applicant',
        consent_given   BOOLEAN NOT NULL DEFAULT false,
        consent_date    TIMESTAMP WITH TIME ZONE,
        consent_version TEXT
    );`
    _, err = DB.Exec(createTableSQL)
    if err != nil {
        return fmt.Errorf("failed to create table: %w", err)
    }

    log.Println("Table 'users' is ready")
    return nil
}