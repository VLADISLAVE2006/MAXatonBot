package db

import (
	"database/sql"
	"fmt"
	"log"
	"os"
	"strings"

	"strconv"

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
        consent_version TEXT,
		notifications_enabled BOOLEAN DEFAULT true
    );`
	_, err = DB.Exec(createTableSQL)
	if err != nil {
		return fmt.Errorf("failed to create table: %w", err)
	}

	log.Println("Table 'users' is ready")

	createEventsTableSQL := `
	CREATE TABLE IF NOT EXISTS events (
		id                 SERIAL PRIMARY KEY,
		title              VARCHAR NOT NULL,
		description        VARCHAR NOT NULL,
		content            TEXT NOT NULL,
		max_slots          INT,
		cancellation_rules TEXT,
		date               TIMESTAMP NOT NULL,
		format             VARCHAR NOT NULL,
		type               VARCHAR NOT NULL,
		created_by         BIGINT NOT NULL REFERENCES users(user_id),
		created_at         TIMESTAMP NOT NULL DEFAULT now(),
		updated_at         TIMESTAMP NOT NULL DEFAULT now()
	);`
	_, err = DB.Exec(createEventsTableSQL)
	if err != nil {
		return fmt.Errorf("failed to create events table: %w", err)
	}
	log.Println("Table 'events' is ready")


	// Таблица регистраций
	createRegistrationsTableSQL := `
	CREATE TABLE IF NOT EXISTS registrations (
		id            SERIAL PRIMARY KEY,
		user_id       BIGINT NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
		event_id      INT NOT NULL REFERENCES events(id) ON DELETE CASCADE,
		registered_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
		code          TEXT NOT NULL UNIQUE,
		reminder_sent BOOLEAN DEFAULT false
	);
	`
	_, err = DB.Exec(createRegistrationsTableSQL)
	if err != nil {
		return fmt.Errorf("failed to create registrations table: %w", err)
	}
	log.Println("Table 'registrations' is ready")

	// Индекс для быстрого поиска
	_, err = DB.Exec("CREATE INDEX IF NOT EXISTS idx_registrations_user_id ON registrations(user_id)")
	if err != nil {
		log.Printf("Warning: could not create index: %v", err)
	}


	if err := ensureAdmin(); err != nil {
		log.Printf("Warning: could not ensure admin: %v", err)
	}

	return nil
}

// создаем админа при первом запуске таблиццы
func ensureAdmin() error {
	adminIDStr := os.Getenv("ADMIN_USER_ID")
	if adminIDStr == "" {
		log.Println("ADMIN_USER_ID not set, skipping admin initialization")
		return nil
	}
	adminID, err := strconv.ParseInt(adminIDStr, 10, 64)
	if err != nil {
		return fmt.Errorf("invalid ADMIN_USER_ID: %w", err)
	}

	_, err = DB.Exec(`
        INSERT INTO users (user_id, role, consent_given, full_name, consent_date, consent_version)
        VALUES ($1, 'admin', true, 'Administrator', NOW(), '1.0')
        ON CONFLICT (user_id) DO UPDATE SET
            role = 'admin',
            consent_given = true,
            consent_date = NOW()
    `, adminID)
	return err
}

func ensureOrganizers() error {
	organizersStr := os.Getenv("ORGANIZER_USER_IDS")
	if organizersStr == "" {
		log.Println("ORGANIZER_USER_IDS not set, skipping organizers initialization")
		return nil
	}

	ids := strings.Split(organizersStr, ",")
	for _, idStr := range ids {
		idStr = strings.TrimSpace(idStr)
		if idStr == "" {
			continue
		}

		userID, err := strconv.ParseInt(idStr, 10, 64)
		if err != nil {
			log.Printf("Warning: invalid organizer ID '%s': %v", idStr, err)
			continue
		}

		_, err = DB.Exec(`
			INSERT INTO users (user_id, role, consent_given, full_name, consent_date, consent_version)
			VALUES ($1, 'organizer', true, 'Organizer', NOW(), '1.0')
			ON CONFLICT (user_id) DO UPDATE SET
				role = 'organizer',
				consent_given = true,
				consent_date = NOW()
		`, userID)
		if err != nil {
			log.Printf("Warning: failed to ensure organizer %d: %v", userID, err)
			continue
		}
		log.Printf("Ensured organizer user_id=%d", userID)
	}
	return nil
}
