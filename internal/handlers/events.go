package handlers

import (
	"api/internal/db"
	"api/internal/middleware"
	"database/sql"
	"encoding/json"
	"log"
	"math/rand"
	"net/http"
	"strconv"
	"time"
	"github.com/lib/pq"
	"github.com/gorilla/mux"
)

type Registration struct {
	ID           int    `json:"id"`
	EventID      int    `json:"event_id"`
	EventTitle   string `json:"event_title"`
	EventDate    int64  `json:"event_date"`
	Code         string `json:"code"`
	RegisteredAt int64  `json:"registered_at"`
	Attended     bool   `json:"attended"`
}

type Event struct {
	ID                int     `json:"id"`
	Title             string  `json:"title"`
	Description       string  `json:"description"`
	Content           string  `json:"content"`
	MaxSlots          *int    `json:"max_slots"`
	CancellationRules *string `json:"cancellation_rules"`
	Date              int64   `json:"date"` // unix timestamp
	Format            string  `json:"format"`
	Type              string  `json:"type"`
	CreatedBy         int64   `json:"created_by"`
	CreatedAt         int64   `json:"created_at"` // unix timestamp
	UpdatedAt         int64   `json:"updated_at"` // unix timestamp
	RegisteredCount   int     `json:"registered_count"`
    IsRegistered bool `json:"is_registered"`
}

type ShortEvent struct {
	ID              int    `json:"id"`
	Title           string `json:"title"`
	Description     string `json:"description"`
	Date            int64  `json:"date"`
	Format          string `json:"format"`
	Type            string `json:"type"`
	MaxSlots        *int   `json:"max_slots"`
	RegisteredCount int    `json:"registered_count"`
}

type CreateEventRequest struct {
	Title             string  `json:"title"`
	Description       string  `json:"description"`
	Content           string  `json:"content"`
	MaxSlots          *int    `json:"max_slots"`
	CancellationRules *string `json:"cancellation_rules"`
	Date              int64   `json:"date"`   // unix timestamp
	Format            string  `json:"format"` // "online" или "offline"
	Type              string  `json:"type"`
}

// Для абитуриента
// HandleGetEvents возвращает список мероприятий в кратком виде
func HandleGetEvents(w http.ResponseWriter, r *http.Request) {
	rows, err := db.DB.Query(`
        SELECT
            e.id,
            e.title,
            e.description,
            EXTRACT(epoch FROM e.date)::bigint AS date,
            e.format,
            e.type,
            e.max_slots,
            COUNT(r.id) AS registered_count
        FROM events e
        LEFT JOIN registrations r ON e.id = r.event_id
        GROUP BY e.id, e.title, e.description, e.date, e.format, e.type, e.max_slots
        ORDER BY e.created_at DESC
    `)
	if err != nil {
		log.Printf("HandleGetEvents DB error: %v", err)
		writeError(w, http.StatusInternalServerError, "database error")
		return
	}
	defer rows.Close()

	events := []ShortEvent{}
	for rows.Next() {
		var e ShortEvent
		if err := rows.Scan(&e.ID, &e.Title, &e.Description, &e.Date, &e.Format, &e.Type, &e.MaxSlots, &e.RegisteredCount); err != nil {
			log.Printf("HandleGetEvents scan error: %v", err)
			continue
		}
		events = append(events, e)
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(events)
}

// HandleGetEventByID возвращает полную информацию о мероприятии
func HandleGetEventByID(w http.ResponseWriter, r *http.Request) {
    claims := middleware.GetClaims(r)
    userID := claims.UserID

    id, err := strconv.Atoi(mux.Vars(r)["id"])
    if err != nil {
        writeError(w, http.StatusBadRequest, "invalid event id")
        return
    }

    var e Event
    err = db.DB.QueryRow(`
        SELECT 
            e.id, e.title, e.description, e.content, 
            e.max_slots, e.cancellation_rules,
            EXTRACT(epoch FROM e.date)::bigint AS date,
            e.format, e.type, e.created_by,
            EXTRACT(epoch FROM e.created_at)::bigint AS created_at,
            EXTRACT(epoch FROM e.updated_at)::bigint AS updated_at,
            COUNT(r.id) AS registered_count,
            EXISTS(SELECT 1 FROM registrations WHERE user_id = $1 AND event_id = e.id) AS is_registered
        FROM events e
        LEFT JOIN registrations r ON e.id = r.event_id
        WHERE e.id = $2
        GROUP BY e.id, e.title, e.description, e.content, e.max_slots, e.cancellation_rules,
                 e.date, e.format, e.type, e.created_by, e.created_at, e.updated_at
    `, userID, id).Scan(
        &e.ID, &e.Title, &e.Description, &e.Content,
        &e.MaxSlots, &e.CancellationRules,
        &e.Date, &e.Format, &e.Type,
        &e.CreatedBy,
        &e.CreatedAt, &e.UpdatedAt,
        &e.RegisteredCount,
        &e.IsRegistered,
    )
    if err == sql.ErrNoRows {
        writeError(w, http.StatusNotFound, "event not found")
        return
    }
    if err != nil {
        log.Printf("HandleGetEventByID DB error: %v", err)
        writeError(w, http.StatusInternalServerError, "database error")
        return
    }

    w.Header().Set("Content-Type", "application/json")
    json.NewEncoder(w).Encode(e)
}

// HandleRegisterEvent записывает текущего пользователя на мероприятие
func HandleRegisterEvent(w http.ResponseWriter, r *http.Request) {
	claims := middleware.GetClaims(r)
	userID := claims.UserID

	vars := mux.Vars(r)
	eventID, err := strconv.Atoi(vars["id"])
	if err != nil {
		writeError(w, http.StatusBadRequest, "invalid event id")
		return
	}

	// Проверяем, существует ли мероприятие
	var maxSlots *int
	var currentCount int
	err = db.DB.QueryRow(`
        SELECT max_slots, (SELECT COUNT(*) FROM registrations WHERE event_id = $1)
        FROM events WHERE id = $1
    `, eventID).Scan(&maxSlots, &currentCount)
	if err == sql.ErrNoRows {
		writeError(w, http.StatusNotFound, "event not found")
		return
	}
	if err != nil {
		log.Printf("RegisterEvent DB error: %v", err)
		writeError(w, http.StatusInternalServerError, "database error")
		return
	}

	// Проверяем, есть ли свободные места (если max_slots не NULL и не 0)
	if maxSlots != nil && *maxSlots > 0 && currentCount >= *maxSlots {
		writeError(w, http.StatusConflict, "no free slots available")
		return
	}

	// Проверяем, не записан ли пользователь уже
	var alreadyRegistered bool
	err = db.DB.QueryRow("SELECT EXISTS(SELECT 1 FROM registrations WHERE user_id = $1 AND event_id = $2)", userID, eventID).Scan(&alreadyRegistered)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "database error")
		return
	}
	if alreadyRegistered {
		writeError(w, http.StatusConflict, "already registered for this event")
		return
	}

	// Генерируем уникальный код записи
	code := generateRegistrationCode()

	// Вставляем запись
	var regID int
	var registeredAt time.Time
	err = db.DB.QueryRow(`
        INSERT INTO registrations (user_id, event_id, code)
        VALUES ($1, $2, $3)
        RETURNING id, registered_at
    `, userID, eventID, code).Scan(&regID, &registeredAt)
	if err != nil {
		log.Printf("RegisterEvent insert error: %v", err)
		writeError(w, http.StatusInternalServerError, "failed to register")
		return
	}

	// Получаем название и дату мероприятия для ответа
	var eventTitle string
	var eventDate int64
	db.DB.QueryRow("SELECT title, EXTRACT(epoch FROM date)::bigint FROM events WHERE id = $1", eventID).Scan(&eventTitle, &eventDate)

	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusCreated)
	json.NewEncoder(w).Encode(map[string]interface{}{
		"status":        "registered",
		"code":          code,
		"event_id":      eventID,
		"event_title":   eventTitle,
		"event_date":    eventDate,
		"registered_at": registeredAt.Unix(),
	})
}

// HandleCancelEvent отменяет запись пользователя на мероприятие
func HandleCancelEvent(w http.ResponseWriter, r *http.Request) {
	claims := middleware.GetClaims(r)
	userID := claims.UserID

	vars := mux.Vars(r)
	eventID, err := strconv.Atoi(vars["id"])
	if err != nil {
		writeError(w, http.StatusBadRequest, "invalid event id")
		return
	}

	result, err := db.DB.Exec("DELETE FROM registrations WHERE user_id = $1 AND event_id = $2", userID, eventID)
	if err != nil {
		log.Printf("CancelEvent DB error: %v", err)
		writeError(w, http.StatusInternalServerError, "failed to cancel registration")
		return
	}
	rowsAffected, _ := result.RowsAffected()
	if rowsAffected == 0 {
		writeError(w, http.StatusNotFound, "registration not found")
		return
	}

	w.WriteHeader(http.StatusOK)
	json.NewEncoder(w).Encode(map[string]string{"status": "registration cancelled"})
}

// HandleMyRegistrations возвращает список мероприятий, на которые записан пользователь
func HandleMyRegistrations(w http.ResponseWriter, r *http.Request) {
	claims := middleware.GetClaims(r)
	userID := claims.UserID

	rows, err := db.DB.Query(`
		SELECT r.id, r.event_id, e.title, EXTRACT(epoch FROM e.date)::bigint, r.code, EXTRACT(epoch FROM r.registered_at)::bigint, r.attended
		FROM registrations r
		JOIN events e ON r.event_id = e.id
		WHERE r.user_id = $1
		ORDER BY e.date ASC
	`, userID)
	if err != nil {
		log.Printf("MyRegistrations DB error: %v", err)
		writeError(w, http.StatusInternalServerError, "database error")
		return
	}
	defer rows.Close()

	registrations := []Registration{}
	for rows.Next() {
		var reg Registration
		if err := rows.Scan(&reg.ID, &reg.EventID, &reg.EventTitle, &reg.EventDate, &reg.Code, &reg.RegisteredAt, &reg.Attended); err != nil {
			log.Printf("MyRegistrations scan error: %v", err)
			continue
		}
		registrations = append(registrations, reg)
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(registrations)
}


// структура для формирования напоминаний
type PendingReminder struct {
    RegistrationID int    `json:"registration_id"`
    UserID         int64  `json:"user_id"`
    EventID        int    `json:"event_id"`
    EventTitle     string `json:"event_title"`
    EventDate      int64  `json:"event_date"` // unix timestamp
}

// HandleGetPendingReminders возвращает список напоминаний, которые нужно отправить за день до мероприятия
func HandleGetPendingReminders(w http.ResponseWriter, r *http.Request) {
    rows, err := db.DB.Query(`
        SELECT r.id, r.user_id, e.id, e.title, EXTRACT(epoch FROM e.date)::bigint
        FROM registrations r
        JOIN events e ON r.event_id = e.id
        JOIN users u ON r.user_id = u.user_id
        WHERE DATE(e.date) = DATE(NOW() + INTERVAL '1 day')
          AND r.reminder_sent = false
          AND COALESCE(u.notifications_enabled, true) = true
    `)
    if err != nil {
        log.Printf("GetPendingReminders DB error: %v", err)
        writeError(w, http.StatusInternalServerError, "database error")
        return
    }
    defer rows.Close()

    reminders := []PendingReminder{}
    for rows.Next() {
        var r PendingReminder
        if err := rows.Scan(&r.RegistrationID, &r.UserID, &r.EventID, &r.EventTitle, &r.EventDate); err != nil {
            log.Printf("scan error: %v", err)
            continue
        }
        reminders = append(reminders, r)
    }

    w.Header().Set("Content-Type", "application/json")
    json.NewEncoder(w).Encode(reminders)
}

type MarkSentRequest struct {
    RegistrationIDs []int `json:"registration_ids"`
}

// HandleMarkRemindersSent отмечает напоминания как отправленные
func HandleMarkRemindersSent(w http.ResponseWriter, r *http.Request) {
    var req MarkSentRequest
    if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
        writeError(w, http.StatusBadRequest, "invalid JSON")
        return
    }
    if len(req.RegistrationIDs) == 0 {
        writeError(w, http.StatusBadRequest, "registration_ids is required")
        return
    }

    // Используем ANY для массового обновления
    query := `UPDATE registrations SET reminder_sent = true WHERE id = ANY($1::int[])`
    _, err := db.DB.Exec(query, pq.Array(req.RegistrationIDs))
    if err != nil {
        log.Printf("MarkRemindersSent DB error: %v", err)
        writeError(w, http.StatusInternalServerError, "failed to update")
        return
    }

    w.WriteHeader(http.StatusOK)
    json.NewEncoder(w).Encode(map[string]string{"status": "ok"})
}

// 
type MarkAttendanceRequest struct {
    Code string `json:"code"`
}

// HandleMarkAttendance подтверждает посещение мероприятия по коду записи
func HandleMarkAttendance(w http.ResponseWriter, r *http.Request) {
    claims := middleware.GetClaims(r)
    userID := claims.UserID

    vars := mux.Vars(r)
    eventID, err := strconv.Atoi(vars["id"])
    if err != nil {
        writeError(w, http.StatusBadRequest, "invalid event id")
        return
    }

    var req MarkAttendanceRequest
    if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
        writeError(w, http.StatusBadRequest, "invalid JSON")
        return
    }
    if req.Code == "" {
        writeError(w, http.StatusBadRequest, "code is required")
        return
    }

    // Проверяем, что регистрация существует, принадлежит пользователю и код совпадает
    var registrationID int
    var attended bool
    err = db.DB.QueryRow(`
        SELECT id, attended FROM registrations 
        WHERE user_id = $1 AND event_id = $2 AND code = $3
    `, userID, eventID, req.Code).Scan(&registrationID, &attended)
    if err == sql.ErrNoRows {
        writeError(w, http.StatusNotFound, "registration not found or invalid code")
        return
    }
    if err != nil {
        log.Printf("MarkAttendance DB error: %v", err)
        writeError(w, http.StatusInternalServerError, "database error")
        return
    }
    if attended {
        writeError(w, http.StatusConflict, "already marked as attended")
        return
    }

    // Проверяем, что мероприятие уже началось (не в будущем)
    var eventDate time.Time
    err = db.DB.QueryRow("SELECT date FROM events WHERE id = $1", eventID).Scan(&eventDate)
    if err != nil {
        writeError(w, http.StatusInternalServerError, "database error")
        return
    }
    if eventDate.After(time.Now()) {
        writeError(w, http.StatusBadRequest, "event has not started yet")
        return
    }

    // Отмечаем как посещённое
    _, err = db.DB.Exec("UPDATE registrations SET attended = true WHERE id = $1", registrationID)
    if err != nil {
        log.Printf("MarkAttendance update error: %v", err)
        writeError(w, http.StatusInternalServerError, "failed to mark attendance")
        return
    }

    w.WriteHeader(http.StatusOK)
    json.NewEncoder(w).Encode(map[string]string{"status": "attendance confirmed"})
}


// generateRegistrationCode создаёт случайный 8-значный код
func generateRegistrationCode() string {
	const letters = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789"
	b := make([]byte, 8)
	for i := range b {
		b[i] = letters[rand.Intn(len(letters))]
	}
	return string(b)
}





















// для организатора
// HandleCreateEvent создаёт новое мероприятие (только для организатора)
func HandleCreateEvent(w http.ResponseWriter, r *http.Request) {
	claims := middleware.GetClaims(r)

	// 1. Декодируем JSON
	var req CreateEventRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeError(w, http.StatusBadRequest, "invalid JSON body")
		return
	}

	// 2. Валидация полей
	if req.Title == "" {
		writeError(w, http.StatusBadRequest, "title is required")
		return
	}
	if req.Description == "" {
		writeError(w, http.StatusBadRequest, "description is required")
		return
	}
	if req.Content == "" {
		writeError(w, http.StatusBadRequest, "content is required")
		return
	}
	if req.Format != "online" && req.Format != "offline" {
		writeError(w, http.StatusBadRequest, "format must be 'online' or 'offline'")
		return
	}
	if req.Type == "" {
		writeError(w, http.StatusBadRequest, "type is required")
		return
	}
	if req.Date == 0 {
		writeError(w, http.StatusBadRequest, "date is required")
		return
	}

	// 3. Вставка в БД (дата сохраняется как TIMESTAMP, поэтому преобразуем int64 -> timestamp)
	var e Event
	err := db.DB.QueryRow(`
		INSERT INTO events
			(title, description, content, max_slots, cancellation_rules, 
			 date, format, type, created_by)
		VALUES ($1, $2, $3, $4, $5, 
		        to_timestamp($6), $7, $8, $9)
		RETURNING 
			id, title, description, content, max_slots, cancellation_rules,
			EXTRACT(epoch FROM date)::bigint, format, type,
			created_by,
			EXTRACT(epoch FROM created_at)::bigint, EXTRACT(epoch FROM updated_at)::bigint
	`,
		req.Title, req.Description, req.Content,
		req.MaxSlots, req.CancellationRules,
		req.Date, req.Format, req.Type,
		claims.UserID,
	).Scan(
		&e.ID, &e.Title, &e.Description, &e.Content,
		&e.MaxSlots, &e.CancellationRules,
		&e.Date, &e.Format, &e.Type,
		&e.CreatedBy,
		&e.CreatedAt, &e.UpdatedAt,
	)
	if err != nil {
		log.Printf("HandleCreateEvent DB error: %v", err)
		writeError(w, http.StatusInternalServerError, "failed to create event")
		return
	}

	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusCreated)
	json.NewEncoder(w).Encode(e)
}

// HandleGetOrganizerEvents возвращает список мероприятий, созданных текущим организатором
func HandleGetOrganizerEvents(w http.ResponseWriter, r *http.Request) {
	claims := middleware.GetClaims(r)
	userID := claims.UserID

	rows, err := db.DB.Query(`
        SELECT
            e.id, e.title, e.description, EXTRACT(epoch FROM e.date)::bigint AS date,
            e.format, e.type, e.max_slots, COUNT(r.id) AS registered_count
        FROM events e
        LEFT JOIN registrations r ON e.id = r.event_id
        WHERE e.created_by = $1
        GROUP BY e.id, e.title, e.description, e.date, e.format, e.type, e.max_slots
        ORDER BY e.created_at DESC
    `, userID)
	if err != nil {
		log.Printf("HandleGetOrganizerEvents DB error: %v", err)
		writeError(w, http.StatusInternalServerError, "database error")
		return
	}
	defer rows.Close()

	events := []ShortEvent{}
	for rows.Next() {
		var e ShortEvent
		if err := rows.Scan(&e.ID, &e.Title, &e.Description, &e.Date, &e.Format, &e.Type, &e.MaxSlots, &e.RegisteredCount); err != nil {
			log.Printf("HandleGetOrganizerEvents scan error: %v", err)
			continue
		}
		events = append(events, e)
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(events)
}

// HandleUpdateEvent обновляет существующее мероприятие (только для создателя)
func HandleUpdateEvent(w http.ResponseWriter, r *http.Request) {
	claims := middleware.GetClaims(r)
	userID := claims.UserID

	id, err := strconv.Atoi(mux.Vars(r)["id"])
	if err != nil {
		writeError(w, http.StatusBadRequest, "invalid event id")
		return
	}

	// Проверяем, что мероприятие существует и принадлежит пользователю
	var createdBy int64
	err = db.DB.QueryRow("SELECT created_by FROM events WHERE id = $1", id).Scan(&createdBy)
	if err == sql.ErrNoRows {
		writeError(w, http.StatusNotFound, "event not found")
		return
	}
	if err != nil {
		log.Printf("HandleUpdateEvent check error: %v", err)
		writeError(w, http.StatusInternalServerError, "database error")
		return
	}
	if createdBy != userID {
		writeError(w, http.StatusForbidden, "you can only edit your own events")
		return
	}

	var req CreateEventRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeError(w, http.StatusBadRequest, "invalid JSON body")
		return
	}

	// Валидация (аналогично созданию)
	if req.Title == "" {
		writeError(w, http.StatusBadRequest, "title is required")
		return
	}
	if req.Description == "" {
		writeError(w, http.StatusBadRequest, "description is required")
		return
	}
	if req.Content == "" {
		writeError(w, http.StatusBadRequest, "content is required")
		return
	}
	if req.Format != "online" && req.Format != "offline" {
		writeError(w, http.StatusBadRequest, "format must be 'online' or 'offline'")
		return
	}
	if req.Type == "" {
		writeError(w, http.StatusBadRequest, "type is required")
		return
	}
	if req.Date == 0 {
		writeError(w, http.StatusBadRequest, "date is required")
		return
	}

	// Обновляем мероприятие
	var e Event
	err = db.DB.QueryRow(`
		UPDATE events SET
			title = $1,
			description = $2,
			content = $3,
			max_slots = $4,
			cancellation_rules = $5,
			date = to_timestamp($6),
			format = $7,
			type = $8,
			updated_at = NOW()
		WHERE id = $9 AND created_by = $10
		RETURNING 
			id, title, description, content, max_slots, cancellation_rules,
			EXTRACT(epoch FROM date)::bigint, format, type, created_by,
			EXTRACT(epoch FROM created_at)::bigint, EXTRACT(epoch FROM updated_at)::bigint
	`,
		req.Title, req.Description, req.Content,
		req.MaxSlots, req.CancellationRules,
		req.Date, req.Format, req.Type,
		id, userID,
	).Scan(
		&e.ID, &e.Title, &e.Description, &e.Content,
		&e.MaxSlots, &e.CancellationRules,
		&e.Date, &e.Format, &e.Type,
		&e.CreatedBy, &e.CreatedAt, &e.UpdatedAt,
	)
	if err != nil {
		log.Printf("HandleUpdateEvent DB error: %v", err)
		writeError(w, http.StatusInternalServerError, "failed to update event")
		return
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(e)
}

// HandleDeleteEvent удаляет мероприятие (только для создателя)
func HandleDeleteEvent(w http.ResponseWriter, r *http.Request) {
	claims := middleware.GetClaims(r)
	userID := claims.UserID

	id, err := strconv.Atoi(mux.Vars(r)["id"])
	if err != nil {
		writeError(w, http.StatusBadRequest, "invalid event id")
		return
	}

	// Проверяем существование и право на удаление
	var createdBy int64
	err = db.DB.QueryRow("SELECT created_by FROM events WHERE id = $1", id).Scan(&createdBy)
	if err == sql.ErrNoRows {
		writeError(w, http.StatusNotFound, "event not found")
		return
	}
	if err != nil {
		log.Printf("HandleDeleteEvent check error: %v", err)
		writeError(w, http.StatusInternalServerError, "database error")
		return
	}
	if createdBy != userID {
		writeError(w, http.StatusForbidden, "you can only delete your own events")
		return
	}

	// Удаляем мероприятие
	_, err = db.DB.Exec("DELETE FROM events WHERE id = $1", id)
	if err != nil {
		log.Printf("HandleDeleteEvent DB error: %v", err)
		writeError(w, http.StatusInternalServerError, "failed to delete event")
		return
	}

	w.WriteHeader(http.StatusOK)
	json.NewEncoder(w).Encode(map[string]string{"status": "event deleted"})
}


//просмотр статистики
type EventStats struct {
    TotalRegistered int `json:"total_registered"`
    TotalAttended   int `json:"total_attended"`
    Percentage      float64 `json:"percentage"`
}

func HandleEventStats(w http.ResponseWriter, r *http.Request) {
    claims := middleware.GetClaims(r)
    userID := claims.UserID

    id, err := strconv.Atoi(mux.Vars(r)["id"])
    if err != nil {
        writeError(w, http.StatusBadRequest, "invalid event id")
        return
    }

    // Проверяем, что организатор является создателем мероприятия
    var createdBy int64
    err = db.DB.QueryRow("SELECT created_by FROM events WHERE id = $1", id).Scan(&createdBy)
    if err == sql.ErrNoRows {
        writeError(w, http.StatusNotFound, "event not found")
        return
    }
    if err != nil {
        writeError(w, http.StatusInternalServerError, "database error")
        return
    }
    if createdBy != userID {
        writeError(w, http.StatusForbidden, "only event creator can view stats")
        return
    }

    var stats EventStats
    err = db.DB.QueryRow(`
        SELECT 
            COUNT(*) AS total_registered,
            SUM(CASE WHEN attended THEN 1 ELSE 0 END) AS total_attended
        FROM registrations
        WHERE event_id = $1
    `, id).Scan(&stats.TotalRegistered, &stats.TotalAttended)
    if err != nil {
        writeError(w, http.StatusInternalServerError, "database error")
        return
    }
    if stats.TotalRegistered > 0 {
        stats.Percentage = float64(stats.TotalAttended) / float64(stats.TotalRegistered) * 100
    } else {
        stats.Percentage = 0
    }

    w.Header().Set("Content-Type", "application/json")
    json.NewEncoder(w).Encode(stats)
}
