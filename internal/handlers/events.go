package handlers

import (
	"api/internal/db"
	"api/internal/middleware"
	"bytes"
	"database/sql"
	"encoding/csv"
	"encoding/json"
	"fmt"
	"io"
	"log"
	"math/rand"
	"net/http"
	"os"
	"path/filepath"
	"strconv"
	"strings"
	"time"

	"github.com/gorilla/mux"
	"github.com/lib/pq"
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
	IsRegistered      bool    `json:"is_registered"`
	Closed            bool    `json:"closed"`
	ImageURL          string  `json:"image_url"`
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
	ImageURL        string `json:"image_url"`
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
            e.id, e.title, e.description,
            EXTRACT(epoch FROM e.date)::bigint AS date,
            e.format, e.type, e.max_slots,
            COUNT(r.id) AS registered_count,
            e.image_url
        FROM events e
        LEFT JOIN registrations r ON e.id = r.event_id
        WHERE e.closed = false AND e.date > NOW()
        GROUP BY e.id, e.title, e.description, e.date, e.format, e.type, e.max_slots, e.image_url
        ORDER BY e.date ASC
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
		if err := rows.Scan(&e.ID, &e.Title, &e.Description, &e.Date, &e.Format, &e.Type, &e.MaxSlots, &e.RegisteredCount, &e.ImageURL); err != nil {
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
            EXISTS(SELECT 1 FROM registrations WHERE user_id = $1 AND event_id = e.id) AS is_registered,
            e.closed,
            e.image_url
        FROM events e
        LEFT JOIN registrations r ON e.id = r.event_id
        WHERE e.id = $2
        GROUP BY e.id, e.title, e.description, e.content, e.max_slots, e.cancellation_rules,
                 e.date, e.format, e.type, e.created_by, e.created_at, e.updated_at, e.closed, e.image_url
    `, userID, id).Scan(
		&e.ID, &e.Title, &e.Description, &e.Content,
		&e.MaxSlots, &e.CancellationRules,
		&e.Date, &e.Format, &e.Type,
		&e.CreatedBy,
		&e.CreatedAt, &e.UpdatedAt,
		&e.RegisteredCount,
		&e.IsRegistered,
		&e.Closed,
		&e.ImageURL,
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
		"event_date":    eventDate.Unix(), // <-- исправлено
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

	// Проверяем, существует ли мероприятие, его дату и статус закрытия
	var eventDate time.Time
	var closed bool
	err = db.DB.QueryRow("SELECT date, closed FROM events WHERE id = $1", eventID).Scan(&eventDate, &closed)
	if err == sql.ErrNoRows {
		writeError(w, http.StatusNotFound, "event not found")
		return
	}
	if err != nil {
		log.Printf("CancelEvent check error: %v", err)
		writeError(w, http.StatusInternalServerError, "database error")
		return
	}

	// Запрещаем отмену, если мероприятие уже началось (текущее время >= дата мероприятия)
	if time.Now().After(eventDate) || time.Now().Equal(eventDate) {
		writeError(w, http.StatusForbidden, "cannot cancel registration after event has started")
		return
	}

	// Запрещаем отмену, если мероприятие закрыто
	if closed {
		writeError(w, http.StatusForbidden, "cannot cancel registration for a closed event")
		return
	}

	// Проверяем, что пользователь действительно записан
	var exists bool
	err = db.DB.QueryRow("SELECT EXISTS(SELECT 1 FROM registrations WHERE user_id = $1 AND event_id = $2)", userID, eventID).Scan(&exists)
	if err != nil {
		log.Printf("CancelEvent existence error: %v", err)
		writeError(w, http.StatusInternalServerError, "database error")
		return
	}
	if !exists {
		writeError(w, http.StatusNotFound, "registration not found")
		return
	}

	// Удаляем запись
	_, err = db.DB.Exec("DELETE FROM registrations WHERE user_id = $1 AND event_id = $2", userID, eventID)
	if err != nil {
		log.Printf("CancelEvent delete error: %v", err)
		writeError(w, http.StatusInternalServerError, "failed to cancel registration")
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
		WHERE r.user_id = $1 AND e.closed = false
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

	// Проверяем, что пользователь был записан И ОТМЕТИЛСЯ (attended = true)
	var canReview bool
	err = db.DB.QueryRow("SELECT EXISTS(SELECT 1 FROM registrations WHERE user_id = $1 AND event_id = $2 AND attended = true)", userID, id).Scan(&canReview)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "database error")
		return
	}
	if !canReview {
		writeError(w, http.StatusForbidden, "only attendees who marked presence can review")
		return
	}

	// Проверяем, не оставлял ли уже отзыв
	var alreadyReviewed bool
	err = db.DB.QueryRow("SELECT    EXISTS(SELECT 1 FROM reviews WHERE user_id = $1 AND event_id = $2)", userID, id).Scan(&alreadyReviewed)
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

// HandleGetArchivedRegistrations возвращает список закрытых мероприятий, на которые был записан пользователь
func HandleGetArchivedRegistrations(w http.ResponseWriter, r *http.Request) {
	claims := middleware.GetClaims(r)
	userID := claims.UserID

	rows, err := db.DB.Query(`
        SELECT
            e.id, e.title, e.description,
            EXTRACT(epoch FROM e.date)::bigint AS date,
            e.format, e.type, e.max_slots,
            r.code, r.attended,
            EXTRACT(epoch FROM r.registered_at)::bigint AS registered_at,
            e.image_url
        FROM registrations r
        JOIN events e ON r.event_id = e.id
        WHERE r.user_id = $1 AND e.closed = true
        ORDER BY e.date DESC
    `, userID)
	if err != nil {
		log.Printf("HandleGetArchivedRegistrations DB error: %v", err)
		writeError(w, http.StatusInternalServerError, "database error")
		return
	}
	defer rows.Close()

	type ArchivedRegistration struct {
		EventID      int    `json:"event_id"`
		Title        string `json:"title"`
		Description  string `json:"description"`
		Date         int64  `json:"date"`
		Format       string `json:"format"`
		Type         string `json:"type"`
		MaxSlots     *int   `json:"max_slots"`
		Code         string `json:"code"`
		Attended     bool   `json:"attended"`
		RegisteredAt int64  `json:"registered_at"`
		ImageURL     string `json:"image_url"`
	}

	archived := []ArchivedRegistration{}
	for rows.Next() {
		var a ArchivedRegistration
		if err := rows.Scan(&a.EventID, &a.Title, &a.Description, &a.Date, &a.Format, &a.Type, &a.MaxSlots, &a.Code, &a.Attended, &a.RegisteredAt, &a.ImageURL); err != nil {
			log.Printf("HandleGetArchivedRegistrations scan error: %v", err)
			continue
		}
		archived = append(archived, a)
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(archived)
}

// для организатора
// HandleCreateEvent создаёт новое мероприятие (только для организатора)
func HandleCreateEvent(w http.ResponseWriter, r *http.Request) {
	claims := middleware.GetClaims(r)
	userID := claims.UserID

	// Ограничение размера формы (10 MB)
	if err := r.ParseMultipartForm(10 << 20); err != nil {
		writeError(w, http.StatusBadRequest, "form too large")
		return
	}

	// Читаем поля формы
	title := r.FormValue("title")
	description := r.FormValue("description")
	content := r.FormValue("content")
	maxSlotsStr := r.FormValue("max_slots")
	cancellationRules := r.FormValue("cancellation_rules")
	dateStr := r.FormValue("date")
	format := r.FormValue("format")
	eventType := r.FormValue("type")

	// Валидация обязательных полей
	if title == "" || description == "" || content == "" || format == "" || eventType == "" || dateStr == "" {
		writeError(w, http.StatusBadRequest, "missing required fields")
		return
	}
	date, err := strconv.ParseInt(dateStr, 10, 64)
	if err != nil || date == 0 {
		writeError(w, http.StatusBadRequest, "invalid date (unix timestamp)")
		return
	}

	// Проверка даты
	if date <= time.Now().Unix() {
		writeError(w, http.StatusBadRequest, "event date must be in the future")
		return
	}

	var maxSlots *int
	if maxSlotsStr != "" {
		ms, err := strconv.Atoi(maxSlotsStr)
		if err == nil && ms > 0 {
			maxSlots = &ms
		}
	}
	var cancellationRulesPtr *string
	if cancellationRules != "" {
		cancellationRulesPtr = &cancellationRules
	}

	// Обработка картинки
	var imageURL string
	file, header, err := r.FormFile("image")
	if err == nil {
		defer file.Close()
		// Проверяем, что это изображение (content-type)
		contentType := header.Header.Get("Content-Type")
		if strings.HasPrefix(contentType, "image/") {
			url, err := saveUploadedFile(file, header.Filename, "events")
			if err == nil {
				imageURL = url
			} else {
				log.Printf("Error saving image: %v", err)
			}
		}
	}

	// Вставка в БД (добавлено поле image_url)
	var e Event
	query := `
        INSERT INTO events
            (title, description, content, max_slots, cancellation_rules, date, format, type, created_by, image_url)
        VALUES ($1, $2, $3, $4, $5, to_timestamp($6), $7, $8, $9, $10)
        RETURNING id, title, description, content, max_slots, cancellation_rules,
                  EXTRACT(epoch FROM date)::bigint, format, type, created_by,
                  EXTRACT(epoch FROM created_at)::bigint, EXTRACT(epoch FROM updated_at)::bigint,
                  image_url
    `
	err = db.DB.QueryRow(query, title, description, content, maxSlots, cancellationRulesPtr,
		date, format, eventType, userID, imageURL).Scan(
		&e.ID, &e.Title, &e.Description, &e.Content,
		&e.MaxSlots, &e.CancellationRules,
		&e.Date, &e.Format, &e.Type,
		&e.CreatedBy, &e.CreatedAt, &e.UpdatedAt,
		&e.ImageURL,
	)
	if err != nil {
		log.Printf("HandleCreateEvent DB error: %v", err)
		// Если ошибка, удаляем загруженную картинку
		if imageURL != "" {
			deleteOldImage(imageURL)
		}
		writeError(w, http.StatusInternalServerError, "failed to create event")
		return
	}

	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusCreated)
	json.NewEncoder(w).Encode(e)
}

// UploadEventsResponse структура ответа
type UploadEventsResponse struct {
	Created int            `json:"created"`
	Errors  map[int]string `json:"errors,omitempty"` // строка -> сообщение об ошибке
}

// HandleUploadEventsCSV – массовое создание мероприятий из CSV
func HandleUploadEventsCSV(w http.ResponseWriter, r *http.Request) {
	claims := middleware.GetClaims(r)
	userID := claims.UserID

	// Проверяем, что роль – организатор (middleware OrganizerAuth уже есть, но для надёжности)
	// ... (можно оставить как есть, OrganizerAuth уже проверяет)

	// Парсим файл
	err := r.ParseMultipartForm(10 << 20) // 10 MB
	if err != nil {
		writeError(w, http.StatusBadRequest, "form too large")
		return
	}

	file, header, err := r.FormFile("file")
	if err != nil {
		writeError(w, http.StatusBadRequest, "file is required")
		return
	}
	defer file.Close()

	// Проверяем расширение .csv
	if !strings.HasSuffix(strings.ToLower(header.Filename), ".csv") {
		writeError(w, http.StatusBadRequest, "only CSV files are allowed")
		return
	}

	fileBytes, err := io.ReadAll(file)
	if err != nil {
		writeError(w, http.StatusBadRequest, "failed to read file")
		return
	}
	// Убираем UTF-8 BOM если есть
	if len(fileBytes) >= 3 && fileBytes[0] == 0xEF && fileBytes[1] == 0xBB && fileBytes[2] == 0xBF {
		fileBytes = fileBytes[3:]
	}
	// Автодетект разделителя по первой строке
	delimiter := ','
	if nl := bytes.IndexByte(fileBytes, '\n'); nl >= 0 {
		firstLine := string(fileBytes[:nl])
		if strings.Count(firstLine, ";") > strings.Count(firstLine, ",") {
			delimiter = ';'
		}
	}

	reader := csv.NewReader(bytes.NewReader(fileBytes))
	reader.Comma = rune(delimiter)
	reader.FieldsPerRecord = 8
	rows, err := reader.ReadAll()
	if err != nil {
		log.Printf("CSV read error: %v", err)
		writeError(w, http.StatusBadRequest, "invalid CSV format")
		return
	}
	if len(rows) < 2 {
		writeError(w, http.StatusBadRequest, "CSV must have header and at least one data row")
		return
	}

	// Проверяем заголовки (поддерживаем русские и английские названия колонок)
	headerRow := rows[0]
	headerAliases := map[string]string{
		"title": "title", "description": "description", "content": "content",
		"max_slots": "max_slots", "cancellation_rules": "cancellation_rules",
		"date": "date", "format": "format", "type": "type",
		"название": "title", "описание": "description", "место проведения": "content",
		"макс. мест": "max_slots", "правила отмены": "cancellation_rules",
		"дата": "date", "формат": "format", "тип": "type",
	}
	expectedHeaders := []string{"title", "description", "content", "max_slots", "cancellation_rules", "date", "format", "type"}
	if len(headerRow) != len(expectedHeaders) {
		writeError(w, http.StatusBadRequest, "invalid header count")
		return
	}
	for i, cell := range headerRow {
		normalized, ok := headerAliases[strings.ToLower(strings.TrimSpace(cell))]
		if !ok || normalized != expectedHeaders[i] {
			writeError(w, http.StatusBadRequest, fmt.Sprintf("unexpected column %q at position %d", cell, i+1))
			return
		}
	}

	formatAliases := map[string]string{
		"online":  "online",
		"offline": "offline",
		"онлайн":  "online",
		"оффлайн": "offline",
		"офлайн":  "offline",
	}
	typeAliases := map[string]string{
		"hackathon":            "hackathon",
		"olympiad":             "olympiad",
		"conference":           "conference",
		"openday":              "openday",
		"хакатон":              "hackathon",
		"олимпиада":            "olympiad",
		"конференция":          "conference",
		"день открытых дверей": "openday",
	}

	response := UploadEventsResponse{
		Errors: make(map[int]string),
	}

	// Обрабатываем строки, начиная с 1
	for i := 1; i < len(rows); i++ {
		row := rows[i]
		if len(row) < 8 {
			response.Errors[i+1] = "not enough columns"
			continue
		}

		title := strings.TrimSpace(row[0])
		description := strings.TrimSpace(row[1])
		content := strings.TrimSpace(row[2])
		maxSlotsStr := strings.TrimSpace(row[3])
		cancellationRules := strings.TrimSpace(row[4])
		dateStr := strings.TrimSpace(row[5])
		format := strings.TrimSpace(row[6])
		eventType := strings.TrimSpace(row[7])

		// Валидация
		if title == "" || description == "" || content == "" || format == "" || eventType == "" || dateStr == "" {
			response.Errors[i+1] = "missing required field"
			continue
		}
		t, parseErr := parseFlexDate(dateStr)
		if parseErr != nil {
			response.Errors[i+1] = "invalid date format, expected DD.MM.YYYY HH:MM"
			continue
		}
		if !t.After(time.Now()) {
			response.Errors[i+1] = "event date must be in the future"
			continue
		}
		date := t.Unix()
		if normalized, ok := formatAliases[strings.ToLower(format)]; ok {
			format = normalized
		}
		if normalized, ok := typeAliases[strings.ToLower(eventType)]; ok {
			eventType = normalized
		}
		if format != "online" && format != "offline" {
			response.Errors[i+1] = "format must be one of: online, offline, онлайн, оффлайн"
			continue
		}
		validTypes := map[string]bool{"hackathon": true, "olympiad": true, "conference": true, "openday": true}
		if !validTypes[eventType] {
			response.Errors[i+1] = "type must be one of: hackathon, olympiad, conference, openday, хакатон, олимпиада, конференция, день открытых дверей"
			continue
		}

		var maxSlots *int
		if maxSlotsStr != "" {
			ms, err := strconv.Atoi(maxSlotsStr)
			if err != nil || ms <= 0 {
				response.Errors[i+1] = "max_slots must be a positive integer or empty"
				continue
			}
			maxSlots = &ms
		}
		var cancellationRulesPtr *string
		if cancellationRules != "" {
			cancellationRulesPtr = &cancellationRules
		}

		// Вставка в БД (без картинки)
		_, err = db.DB.Exec(`
            INSERT INTO events
                (title, description, content, max_slots, cancellation_rules, date, format, type, created_by, image_url)
            VALUES ($1, $2, $3, $4, $5, to_timestamp($6), $7, $8, $9, '')
        `, title, description, content, maxSlots, cancellationRulesPtr, date, format, eventType, userID)
		if err != nil {
			log.Printf("CSV insert error (row %d): %v", i+1, err)
			response.Errors[i+1] = "database error"
			continue
		}
		response.Created++
	}

	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusOK)
	json.NewEncoder(w).Encode(response)
}

// HandleGetOrganizerEvents возвращает список мероприятий, созданных текущим организатором
func HandleGetOrganizerEvents(w http.ResponseWriter, r *http.Request) {
	claims := middleware.GetClaims(r)
	userID := claims.UserID

	rows, err := db.DB.Query(`
        SELECT
            e.id, e.title, e.description, EXTRACT(epoch FROM e.date)::bigint AS date,
            e.format, e.type, e.max_slots, COUNT(r.id) AS registered_count,
            e.image_url
        FROM events e
        LEFT JOIN registrations r ON e.id = r.event_id
        WHERE e.created_by = $1 AND e.closed = false
        GROUP BY e.id, e.title, e.description, e.date, e.format, e.type, e.max_slots, e.image_url
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
		if err := rows.Scan(&e.ID, &e.Title, &e.Description, &e.Date, &e.Format, &e.Type, &e.MaxSlots, &e.RegisteredCount, &e.ImageURL); err != nil {
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

	// Проверяем, что мероприятие существует, принадлежит пользователю и не закрыто
	var createdBy int64
	var oldImageURL string
	var closed bool
	err = db.DB.QueryRow("SELECT created_by, image_url, closed FROM events WHERE id = $1", id).Scan(&createdBy, &oldImageURL, &closed)
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
	if closed {
		writeError(w, http.StatusForbidden, "cannot edit a closed event")
		return
	}

	// Парсим форму
	if err := r.ParseMultipartForm(10 << 20); err != nil {
		writeError(w, http.StatusBadRequest, "form too large")
		return
	}

	title := r.FormValue("title")
	description := r.FormValue("description")
	content := r.FormValue("content")
	maxSlotsStr := r.FormValue("max_slots")
	cancellationRules := r.FormValue("cancellation_rules")
	dateStr := r.FormValue("date")
	format := r.FormValue("format")
	eventType := r.FormValue("type")

	if title == "" || description == "" || content == "" || format == "" || eventType == "" || dateStr == "" {
		writeError(w, http.StatusBadRequest, "missing required fields")
		return
	}
	date, err := strconv.ParseInt(dateStr, 10, 64)
	if err != nil || date == 0 {
		writeError(w, http.StatusBadRequest, "invalid date")
		return
	}

	// новая дата должна быть в будущем ===
	if date <= time.Now().Unix() {
		writeError(w, http.StatusBadRequest, "event date must be in the future")
		return
	}

	var maxSlots *int
	if maxSlotsStr != "" {
		ms, err := strconv.Atoi(maxSlotsStr)
		if err == nil && ms > 0 {
			maxSlots = &ms
		}
	}
	var cancellationRulesPtr *string
	if cancellationRules != "" {
		cancellationRulesPtr = &cancellationRules
	}

	// Обработка новой картинки
	newImageURL := oldImageURL
	file, header, err := r.FormFile("image")
	if err == nil {
		defer file.Close()
		contentType := header.Header.Get("Content-Type")
		if strings.HasPrefix(contentType, "image/") {
			url, err := saveUploadedFile(file, header.Filename, "events")
			if err == nil {
				newImageURL = url
				if oldImageURL != "" {
					deleteOldImage(oldImageURL)
				}
			}
		}
	}

	// Обновляем мероприятие
	var e Event
	query := `
        UPDATE events SET
            title = $1, description = $2, content = $3,
            max_slots = $4, cancellation_rules = $5,
            date = to_timestamp($6), format = $7, type = $8,
            image_url = $9, updated_at = NOW()
        WHERE id = $10 AND created_by = $11
        RETURNING id, title, description, content, max_slots, cancellation_rules,
                  EXTRACT(epoch FROM date)::bigint, format, type, created_by,
                  EXTRACT(epoch FROM created_at)::bigint, EXTRACT(epoch FROM updated_at)::bigint,
                  image_url
    `
	err = db.DB.QueryRow(query, title, description, content, maxSlots, cancellationRulesPtr,
		date, format, eventType, newImageURL, id, userID).Scan(
		&e.ID, &e.Title, &e.Description, &e.Content,
		&e.MaxSlots, &e.CancellationRules,
		&e.Date, &e.Format, &e.Type,
		&e.CreatedBy, &e.CreatedAt, &e.UpdatedAt,
		&e.ImageURL,
	)
	if err != nil {
		log.Printf("HandleUpdateEvent DB error: %v", err)
		if newImageURL != oldImageURL {
			deleteOldImage(newImageURL)
		}
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

// HandleGetOrganizerArchivedEvents возвращает список закрытых мероприятий, созданных организатором
func HandleGetOrganizerArchivedEvents(w http.ResponseWriter, r *http.Request) {
	claims := middleware.GetClaims(r)
	userID := claims.UserID

	rows, err := db.DB.Query(`
        SELECT
            e.id, e.title, e.description,
            EXTRACT(epoch FROM e.date)::bigint AS date,
            e.format, e.type, e.max_slots,
            COALESCE(COUNT(r.id), 0) AS registered_count,
            e.image_url
        FROM events e
        LEFT JOIN registrations r ON e.id = r.event_id
        WHERE e.created_by = $1 AND e.closed = true
        GROUP BY e.id, e.title, e.description, e.date, e.format, e.type, e.max_slots, e.image_url
        ORDER BY e.date DESC
    `, userID)
	if err != nil {
		log.Printf("HandleGetOrganizerArchivedEvents DB error: %v", err)
		writeError(w, http.StatusInternalServerError, "database error")
		return
	}
	defer rows.Close()

	events := []ShortEvent{}
	for rows.Next() {
		var e ShortEvent
		if err := rows.Scan(&e.ID, &e.Title, &e.Description, &e.Date, &e.Format, &e.Type, &e.MaxSlots, &e.RegisteredCount, &e.ImageURL); err != nil {
			log.Printf("HandleGetOrganizerArchivedEvents scan error: %v", err)
			continue
		}
		events = append(events, e)
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(events)
}

// просмотр статистики
type EventStats struct {
	TotalRegistered int     `json:"total_registered"`
	TotalAttended   int     `json:"total_attended"`
	Percentage      float64 `json:"percentage"`
	ReviewsCount    int     `json:"reviews_count"`  // сколько отзывов
	AverageRating   float64 `json:"average_rating"` // средний рейтинг (0 если нет отзывов)
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

// сохраняет файл из формы и возвращает относительный путь
func saveUploadedFile(file io.Reader, filename string, folder string) (string, error) {
	// Создаём директорию, если её нет
	dir := filepath.Join("uploads", folder)
	if err := os.MkdirAll(dir, 0755); err != nil {
		return "", err
	}
	// Генерируем безопасное имя
	ext := filepath.Ext(filename)
	safeName := fmt.Sprintf("%d_%d%s", time.Now().UnixNano(), rand.Intn(10000), ext)
	fullPath := filepath.Join(dir, safeName)
	dst, err := os.Create(fullPath)
	if err != nil {
		return "", err
	}
	defer dst.Close()
	if _, err := io.Copy(dst, file); err != nil {
		return "", err
	}
	// Возвращаем относительный URL (для статической раздачи)
	return "/" + strings.ReplaceAll(fullPath, "\\", "/"), nil
}

// parseFlexDate парсит дату из нескольких форматов в московском времени (UTC+3)
func parseFlexDate(s string) (time.Time, error) {
	msk := time.FixedZone("MSK", 3*60*60)
	t, err := time.ParseInLocation("02.01.2006 15:04", s, msk)
	if err != nil {
		return time.Time{}, fmt.Errorf("unrecognized date format: %q, expected DD.MM.YYYY HH:MM", s)
	}
	return t, nil
}

// удаляет файл по пути
func deleteOldImage(imageURL string) {
	if imageURL == "" {
		return
	}
	// Из URL получаем локальный путь (например, из "/uploads/events/xxx.jpg" -> "uploads/events/xxx.jpg")
	localPath := strings.TrimPrefix(imageURL, "/")
	if err := os.Remove(localPath); err != nil && !os.IsNotExist(err) {
		log.Printf("Failed to delete old image: %v", err)
	}
}
