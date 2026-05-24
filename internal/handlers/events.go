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
		WHERE e.closed = false
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

	// Проверяем, что мероприятие ещё не началось и не закрыто
	var eventDate time.Time
	var closed bool
	err = db.DB.QueryRow("SELECT date, closed FROM events WHERE id = $1", eventID).Scan(&eventDate, &closed)
	if err != nil {
		log.Printf("RegisterEvent date check error: %v", err)
		writeError(w, http.StatusInternalServerError, "database error")
		return
	}
	if closed {
		writeError(w, http.StatusForbidden, "event is closed for registration")
		return
	}
	if time.Now().After(eventDate) {
		writeError(w, http.StatusForbidden, "event has already started or passed")
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
	// Получаем название мероприятия для ответа
	var eventTitle string
	_ = db.DB.QueryRow("SELECT title FROM events WHERE id = $1", eventID).Scan(&eventTitle) // ошибку можно игнорировать

	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusCreated)
	json.NewEncoder(w).Encode(map[string]interface{}{
		"status":        "registered",
		"code":          code,
		"event_id":      eventID,
		"event_title":   eventTitle,
		"event_date":    eventDate.Unix(),    // <-- исправлено
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
        WHERE e.date > NOW()
          AND e.date <= NOW() + INTERVAL '36 hours'
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


type ReviewRequest struct {
    Rating  int    `json:"rating"`
    Comment string `json:"comment,omitempty"`
}

func HandleAddReview(w http.ResponseWriter, r *http.Request) {
    claims := middleware.GetClaims(r)
    userID := claims.UserID

    id, err := strconv.Atoi(mux.Vars(r)["id"])
    if err != nil {
        writeError(w, http.StatusBadRequest, "invalid event id")
        return
    }

    var req ReviewRequest
    if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
        writeError(w, http.StatusBadRequest, "invalid JSON")
        return
    }
    if req.Rating < 1 || req.Rating > 5 {
        writeError(w, http.StatusBadRequest, "rating must be between 1 and 5")
        return
    }

    // Проверяем, что мероприятие закрыто
    var closed bool
    err = db.DB.QueryRow("SELECT closed FROM events WHERE id = $1", id).Scan(&closed)
    if err == sql.ErrNoRows {
        writeError(w, http.StatusNotFound, "event not found")
        return
    }
    if err != nil {
        log.Printf("HandleAddReview check error: %v", err)
        writeError(w, http.StatusInternalServerError, "database error")
        return
    }
    if !closed {
        writeError(w, http.StatusForbidden, "can only review closed events")
        return
    }

    // Проверяем, что пользователь был записан на мероприятие
    var registered bool
    err = db.DB.QueryRow("SELECT EXISTS(SELECT 1 FROM registrations WHERE user_id = $1 AND event_id = $2)", userID, id).Scan(&registered)
    if err != nil || !registered {
        writeError(w, http.StatusForbidden, "only registered attendees can review")
        return
    }

    // Проверяем, не оставлял ли уже отзыв
    var alreadyReviewed bool
    err = db.DB.QueryRow("SELECT EXISTS(SELECT 1 FROM reviews WHERE user_id = $1 AND event_id = $2)", userID, id).Scan(&alreadyReviewed)
    if err != nil {
        writeError(w, http.StatusInternalServerError, "database error")
        return
    }
    if alreadyReviewed {
        writeError(w, http.StatusConflict, "you have already reviewed this event")
        return
    }

    // Вставляем отзыв
    _, err = db.DB.Exec("INSERT INTO reviews (event_id, user_id, rating, comment) VALUES ($1, $2, $3, $4)", id, userID, req.Rating, req.Comment)
    if err != nil {
        log.Printf("HandleAddReview insert error: %v", err)
        writeError(w, http.StatusInternalServerError, "failed to save review")
        return
    }

    w.WriteHeader(http.StatusCreated)
    json.NewEncoder(w).Encode(map[string]string{"status": "review submitted"})
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


func HandleCloseEvent(w http.ResponseWriter, r *http.Request) {
    claims := middleware.GetClaims(r)
    userID := claims.UserID

    id, err := strconv.Atoi(mux.Vars(r)["id"])
    if err != nil {
        writeError(w, http.StatusBadRequest, "invalid event id")
        return
    }

    // Проверяем, что мероприятие существует и принадлежит пользователю
    var createdBy int64
    var closed bool
    err = db.DB.QueryRow("SELECT created_by, closed FROM events WHERE id = $1", id).Scan(&createdBy, &closed)
    if err == sql.ErrNoRows {
        writeError(w, http.StatusNotFound, "event not found")
        return
    }
    if err != nil {
        log.Printf("HandleCloseEvent check error: %v", err)
        writeError(w, http.StatusInternalServerError, "database error")
        return
    }
    if createdBy != userID {
        writeError(w, http.StatusForbidden, "only the event creator can close the event")
        return
    }
    if closed {
        writeError(w, http.StatusConflict, "event already closed")
        return
    }

    // Обновляем closed = true
    _, err = db.DB.Exec("UPDATE events SET closed = true WHERE id = $1", id)
    if err != nil {
        log.Printf("HandleCloseEvent update error: %v", err)
        writeError(w, http.StatusInternalServerError, "failed to close event")
        return
    }

    w.WriteHeader(http.StatusOK)
    json.NewEncoder(w).Encode(map[string]string{"status": "event closed"})
}


//просмотр статистики
type EventStats struct {
    TotalRegistered int `json:"total_registered"`
    TotalAttended   int `json:"total_attended"`
    Percentage      float64 `json:"percentage"`
	ReviewsCount    int     `json:"reviews_count"`    // сколько отзывов
    AverageRating   float64 `json:"average_rating"`   // средний рейтинг (0 если нет отзывов)
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
    // Получаем статистику регистраций и отзывов
    err = db.DB.QueryRow(`
        SELECT 
            COUNT(DISTINCT r.id) AS total_registered,
            COALESCE(SUM(CASE WHEN r.attended THEN 1 ELSE 0 END), 0) AS total_attended,
            COUNT(DISTINCT rev.id) AS reviews_count,
            COALESCE(AVG(rev.rating), 0) AS average_rating
        FROM events e
        LEFT JOIN registrations r ON e.id = r.event_id
        LEFT JOIN reviews rev ON e.id = rev.event_id
        WHERE e.id = $1
        GROUP BY e.id
    `, id).Scan(&stats.TotalRegistered, &stats.TotalAttended, &stats.ReviewsCount, &stats.AverageRating)
    if err != nil {
        log.Printf("HandleEventStats DB error: %v", err)
        writeError(w, http.StatusInternalServerError, "database error")
        return
    }

    // Вычисляем процент посещаемости
    if stats.TotalRegistered > 0 {
        stats.Percentage = float64(stats.TotalAttended) / float64(stats.TotalRegistered) * 100
    } else {
        stats.Percentage = 0
    }

    w.Header().Set("Content-Type", "application/json")
    json.NewEncoder(w).Encode(stats)
}


// возвращает список записавшихся пользователей (только для организатора)
func HandleEventAttendees(w http.ResponseWriter, r *http.Request) {
    claims := middleware.GetClaims(r)
    userID := claims.UserID

    id, err := strconv.Atoi(mux.Vars(r)["id"])
    if err != nil {
        writeError(w, http.StatusBadRequest, "invalid event id")
        return
    }

    // Проверяем, что организатор – создатель
    var createdBy int64
    err = db.DB.QueryRow("SELECT created_by FROM events WHERE id = $1", id).Scan(&createdBy)
    if err != nil {
        writeError(w, http.StatusNotFound, "event not found")
        return
    }
    if createdBy != userID {
        writeError(w, http.StatusForbidden, "only the event creator can view attendees")
        return
    }

    rows, err := db.DB.Query(`
        SELECT u.user_id, u.full_name, r.registered_at, r.attended
        FROM registrations r
        JOIN users u ON r.user_id = u.user_id
        WHERE r.event_id = $1
    `, id)
    if err != nil {
        log.Printf("EventAttendees DB error: %v", err)
        writeError(w, http.StatusInternalServerError, "database error")
        return
    }
    defer rows.Close()

    type Attendee struct {
        UserID       int64  `json:"user_id"`
        FullName     string `json:"full_name"`
        RegisteredAt int64  `json:"registered_at"`
        Attended     bool   `json:"attended"`
    }
    attendees := []Attendee{}
    for rows.Next() {
        var a Attendee
        var registeredAt time.Time
        if err := rows.Scan(&a.UserID, &a.FullName, &registeredAt, &a.Attended); err != nil {
            continue
        }
        a.RegisteredAt = registeredAt.Unix()
        attendees = append(attendees, a)
    }

    w.Header().Set("Content-Type", "application/json")
    json.NewEncoder(w).Encode(attendees)
}