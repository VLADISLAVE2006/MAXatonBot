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
	Date              int64   `json:"date"`
	Format            string  `json:"format"`
	Type              string  `json:"type"`
	CreatedAt         int64   `json:"created_at"`
	UpdatedAt         int64   `json:"updated_at"`
}

type ShortEvent struct {
	ID          int    `json:"id"`
	Title       string `json:"title"`
	Description string `json:"description"`
	Date        int64  `json:"date"`
}

type CreateEventRequest struct {
	Title             string  `json:"title"`
	Description       string  `json:"description"`
	Content           string  `json:"content"`
	MaxSlots          *int    `json:"max_slots"`
	CancellationRules *string `json:"cancellation_rules"`
	Date              int64   `json:"date"`
	Format            string  `json:"format"`
	Type              string  `json:"type"`
}

func HandleGetEvents(w http.ResponseWriter, r *http.Request) {
	rows, err := db.DB.Query(`
        SELECT id, title, description, content, max_slots, cancellation_rules,
               created_by, created_at, updated_at
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
		if err := rows.Scan(
			&e.ID, &e.Title, &e.Description, &e.Date,
		); err != nil {
			log.Printf("HandleGetEvents scan error: %v", err)
			continue
		}
		events = append(events, e)
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(events)
}

func HandleGetEventByID(w http.ResponseWriter, r *http.Request) {
	id, err := strconv.Atoi(mux.Vars(r)["id"])
	if err != nil {
		writeError(w, http.StatusBadRequest, "invalid event id")
		return
	}

	var e Event
	err = db.DB.QueryRow(`
        SELECT id, title, description, content, max_slots, cancellation_rules,
               date, format, type, created_by, created_at, updated_at
        FROM events WHERE id = $1
    `, id).Scan(
		&e.ID, &e.Title, &e.Description, &e.Content,
		&e.MaxSlots, &e.CancellationRules,
		&e.Date, &e.Format, &e.Type, &e.CreatedAt, &e.UpdatedAt,
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

func HandleCreateEvent(w http.ResponseWriter, r *http.Request) {
	claims := middleware.GetClaims(r)

	var req CreateEventRequest
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

	var e Event
	err := db.DB.QueryRow(`
        INSERT INTO events
            (title, description, content, max_slots, cancellation_rules, date, format, type, created_by)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
        RETURNING id, title, description, content, max_slots, cancellation_rules,
                  date, format, type, created_by, created_at, updated_at
    `,
		req.Title, req.Description, req.Content,
		req.MaxSlots, req.CancellationRules,
		req.Date, req.Format, req.Type,
		claims.UserID,
	).Scan(
		&e.ID, &e.Title, &e.Description, &e.Content,
		&e.MaxSlots, &e.CancellationRules,
		&e.Date, &e.Format, &e.Type, &e.CreatedAt, &e.UpdatedAt,
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
