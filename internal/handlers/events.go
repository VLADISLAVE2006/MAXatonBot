package handlers

import (
	"api/internal/db"
	"api/internal/middleware"
	"database/sql"
	"encoding/json"
	"log"
	"net/http"
	"strconv"

	"github.com/gorilla/mux"
)

type Event struct {
	ID                int     `json:"id"`
	Title             string  `json:"title"`
	Description       string  `json:"description"`
	Content           string  `json:"content"`
	MaxSlots          *int    `json:"max_slots"`
	CancellationRules *string `json:"cancellation_rules"`
	Date              int64   `json:"date"`        // unix timestamp
	Format            string  `json:"format"`
	Type              string  `json:"type"`
	CreatedBy         int64   `json:"created_by"`
	CreatedAt         int64   `json:"created_at"`  // unix timestamp
	UpdatedAt         int64   `json:"updated_at"`  // unix timestamp
}

type ShortEvent struct {
	ID          int    `json:"id"`
	Title       string `json:"title"`
	Description string `json:"description"`
	Date        int64  `json:"date"` // unix timestamp
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




//Для абитуриента
// HandleGetEvents возвращает список мероприятий в кратком виде
func HandleGetEvents(w http.ResponseWriter, r *http.Request) {
	// Исправленный запрос: выбираем только нужные поля и преобразуем date в int64
	rows, err := db.DB.Query(`
		SELECT id, title, description, EXTRACT(epoch FROM date)::bigint AS date
		FROM events
		ORDER BY created_at DESC
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
		if err := rows.Scan(&e.ID, &e.Title, &e.Description, &e.Date); err != nil {
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
	id, err := strconv.Atoi(mux.Vars(r)["id"])
	if err != nil {
		writeError(w, http.StatusBadRequest, "invalid event id")
		return
	}

	var e Event
	err = db.DB.QueryRow(`
		SELECT 
			id, title, description, content, 
			max_slots, cancellation_rules,
			EXTRACT(epoch FROM date)::bigint AS date,
			format, type, created_by,
			EXTRACT(epoch FROM created_at)::bigint AS created_at,
			EXTRACT(epoch FROM updated_at)::bigint AS updated_at
		FROM events WHERE id = $1
	`, id).Scan(
		&e.ID, &e.Title, &e.Description, &e.Content,
		&e.MaxSlots, &e.CancellationRules,
		&e.Date, &e.Format, &e.Type,
		&e.CreatedBy,
		&e.CreatedAt, &e.UpdatedAt,
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




//для организатора
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
        SELECT id, title, description, EXTRACT(epoch FROM date)::bigint AS date
        FROM events
        WHERE created_by = $1
        ORDER BY created_at DESC
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
        if err := rows.Scan(&e.ID, &e.Title, &e.Description, &e.Date); err != nil {
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