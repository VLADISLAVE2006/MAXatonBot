package handlers

import (
	"database/sql"
	"encoding/json"
	"net/http"
	"time"
	"api/internal/db"
	"api/internal/middleware"
	"log"
	"strconv"
)

// ConsentRequest структура тела запроса для согласия
type ConsentRequest struct {
	UserID           int64  `json:"user_id"`
	Agreed           bool   `json:"agreed"`
	AgreementVersion string `json:"agreement_version"`
}

// ProfileRequest структура для ФИО
type ProfileRequest struct {
	FullName string `json:"full_name"`
}

// MeResponse ответ на GET /api/user/me
type MeResponse struct {
	Role     string `json:"role"`
	FullName string `json:"full_name"`
	Token    string `json:"token"`
}

// NotificationsResponse ответ на GET /api/user/notifications
type NotificationsResponse struct {
	Enabled bool `json:"enabled"`
}

// StatusResponse универсальный ответ со статусом
type StatusResponse struct {
	Status string `json:"status"`
}

// errorResponse для единообразного вывода ошибок
type errorResponse struct {
	Error string `json:"error"`
}

func writeError(w http.ResponseWriter, status int, message string) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	json.NewEncoder(w).Encode(errorResponse{Error: message})
}

// HandleConsent сохраняет согласие пользователя на обработку ПД
//
//	@Summary		Сохранить согласие на обработку ПД
//	@Tags			user
//	@Accept			json
//	@Produce		json
//	@Security		ApiKeyAuth
//	@Param			body	body		ConsentRequest	true	"Данные согласия"
//	@Success		200		{object}	StatusResponse
//	@Failure		400		{object}	errorResponse
//	@Failure		500		{object}	errorResponse
//	@Router			/api/user/consent [post]
func HandleConsent(w http.ResponseWriter, r *http.Request) {
	var req ConsentRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeError(w, http.StatusBadRequest, "invalid JSON body")
		return
	}

	if req.UserID == 0 {
		writeError(w, http.StatusBadRequest, "user_id is required")
		return
	}
	if !req.Agreed {
		writeError(w, http.StatusBadRequest, "consent must be agreed (agreed: true)")
		return
	}
	if req.AgreementVersion == "" {
		req.AgreementVersion = "1.0"
	}

	query := `
        INSERT INTO users (user_id, consent_given, consent_date, consent_version, role)
        VALUES ($1, $2, $3, $4, 'applicant')
        ON CONFLICT (user_id) DO UPDATE SET
            consent_given = EXCLUDED.consent_given,
            consent_date = EXCLUDED.consent_date,
            consent_version = EXCLUDED.consent_version
    `
	now := time.Now()
	_, err := db.DB.Exec(query, req.UserID, true, now, req.AgreementVersion)
	if err != nil {
		http.Error(w, "database error", http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusOK)
	json.NewEncoder(w).Encode(StatusResponse{Status: "consent saved"})
}

// HandleProfile сохраняет имя и фамилию пользователя
//
//	@Summary		Сохранить ФИО пользователя
//	@Tags			user
//	@Accept			json
//	@Produce		json
//	@Security		ApiKeyAuth
//	@Security		BearerAuth
//	@Param			body	body		ProfileRequest	true	"ФИО"
//	@Success		200		{object}	StatusResponse
//	@Failure		400		{object}	errorResponse
//	@Failure		403		{object}	errorResponse
//	@Failure		500		{object}	errorResponse
//	@Router			/api/user/profile [post]
func HandleProfile(w http.ResponseWriter, r *http.Request) {
	claims := middleware.GetClaims(r)
	var req ProfileRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		log.Printf("HandleProfile decode error: %v", err)
		writeError(w, http.StatusBadRequest, "invalid JSON body")
		return
	}

	if req.FullName == "" {
		log.Printf("HandleProfile missing full_name")
		writeError(w, http.StatusBadRequest, "full_name is required")
		return
	}

	userID := claims.UserID

	var consentGiven bool
	err := db.DB.QueryRow("SELECT consent_given FROM users WHERE user_id = $1", userID).Scan(&consentGiven)
	if err == sql.ErrNoRows {
		writeError(w, http.StatusBadRequest, "user not found, please provide consent first")
		return
	}
	if err != nil {
		writeError(w, http.StatusInternalServerError, "database error")
		return
	}
	if !consentGiven {
		writeError(w, http.StatusForbidden, "consent not given")
		return
	}

	_, err = db.DB.Exec("UPDATE users SET full_name = $1 WHERE user_id = $2", req.FullName, userID)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "failed to update profile")
		return
	}

	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusOK)
	json.NewEncoder(w).Encode(StatusResponse{Status: "profile updated"})
}

// HandleGetMe возвращает роль, ФИО и JWT-токен пользователя по user_id
//
//	@Summary		Получить данные пользователя и JWT
//	@Tags			user
//	@Produce		json
//	@Security		ApiKeyAuth
//	@Param			user_id	query		int	true	"ID пользователя в MAX"
//	@Success		200		{object}	MeResponse
//	@Failure		400		{object}	errorResponse
//	@Failure		404		{object}	errorResponse
//	@Failure		500		{object}	errorResponse
//	@Router			/api/user/me [get]
func HandleGetMe(w http.ResponseWriter, r *http.Request) {
	userIDStr := r.URL.Query().Get("user_id")
	if userIDStr == "" {
		writeError(w, http.StatusBadRequest, "user_id is required")
		return
	}
	userID, err := strconv.ParseInt(userIDStr, 10, 64)
	if err != nil {
		writeError(w, http.StatusBadRequest, "invalid user_id")
		return
	}

	var role string
	var fullName sql.NullString

	err = db.DB.QueryRow(`
		SELECT role, full_name
		FROM users WHERE user_id = $1`, userID,
	).Scan(&role, &fullName)

	if err == sql.ErrNoRows {
		writeError(w, http.StatusNotFound, "user not found")
		return
	}
	if err != nil {
		log.Printf("GetMe DB error: %v", err)
		writeError(w, http.StatusInternalServerError, "database error")
		return
	}

	token, err := middleware.GenerateToken(userID, role)
	if err != nil {
		log.Printf("GetMe token generation error: %v", err)
		writeError(w, http.StatusInternalServerError, "failed to generate token")
		return
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(MeResponse{
		Role:     role,
		FullName: fullName.String,
		Token:    token,
	})
}

// NotificationsRequest тело запроса для обновления настроек уведомлений
type NotificationsRequest struct {
	Enabled bool `json:"enabled"`
}

// HandleGetNotifications возвращает настройки уведомлений пользователя
//
//	@Summary		Получить настройки уведомлений
//	@Tags			user
//	@Produce		json
//	@Security		ApiKeyAuth
//	@Security		BearerAuth
//	@Success		200	{object}	NotificationsResponse
//	@Failure		401	{object}	errorResponse
//	@Failure		500	{object}	errorResponse
//	@Router			/api/user/notifications [get]
func HandleGetNotifications(w http.ResponseWriter, r *http.Request) {
	claims := middleware.GetClaims(r)
	userID := claims.UserID

	var enabled bool
	err := db.DB.QueryRow("SELECT COALESCE(notifications_enabled, true) FROM users WHERE user_id = $1", userID).Scan(&enabled)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "database error")
		return
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(NotificationsResponse{Enabled: enabled})
}

// HandleUpdateNotifications обновляет настройки уведомлений пользователя
//
//	@Summary		Обновить настройки уведомлений
//	@Tags			user
//	@Accept			json
//	@Produce		json
//	@Security		ApiKeyAuth
//	@Security		BearerAuth
//	@Param			body	body		NotificationsRequest	true	"Настройки уведомлений"
//	@Success		200		{object}	StatusResponse
//	@Failure		400		{object}	errorResponse
//	@Failure		401		{object}	errorResponse
//	@Failure		500		{object}	errorResponse
//	@Router			/api/user/notifications [post]
func HandleUpdateNotifications(w http.ResponseWriter, r *http.Request) {
	claims := middleware.GetClaims(r)
	userID := claims.UserID

	var req NotificationsRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeError(w, http.StatusBadRequest, "invalid JSON")
		return
	}

	_, err := db.DB.Exec("UPDATE users SET notifications_enabled = $1 WHERE user_id = $2", req.Enabled, userID)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "failed to update notification settings")
		return
	}

	w.WriteHeader(http.StatusOK)
	json.NewEncoder(w).Encode(StatusResponse{Status: "ok"})
}

// AdminCreateOrganizerRequest структура запроса от админа
type AdminCreateOrganizerRequest struct {
	UserID   int64  `json:"user_id"`
	FullName string `json:"full_name"`
}

// HandleAdminCreateOrganizer создаёт или переводит пользователя в роль организатора
//
//	@Summary		Создать организатора
//	@Tags			admin
//	@Accept			json
//	@Produce		json
//	@Security		ApiKeyAuth
//	@Security		BearerAuth
//	@Param			body	body		AdminCreateOrganizerRequest	true	"Данные организатора"
//	@Success		200		{object}	StatusResponse
//	@Failure		400		{object}	errorResponse
//	@Failure		401		{object}	errorResponse
//	@Failure		403		{object}	errorResponse
//	@Failure		500		{object}	errorResponse
//	@Router			/api/admin/organizers [post]
func HandleAdminCreateOrganizer(w http.ResponseWriter, r *http.Request) {
	var req AdminCreateOrganizerRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeError(w, http.StatusBadRequest, "invalid JSON body")
		return
	}
	if req.UserID == 0 {
		writeError(w, http.StatusBadRequest, "user_id is required")
		return
	}
	if req.FullName == "" {
		writeError(w, http.StatusBadRequest, "full_name is required")
		return
	}

	var exists bool
	err := db.DB.QueryRow("SELECT EXISTS(SELECT 1 FROM users WHERE user_id = $1)", req.UserID).Scan(&exists)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "database error")
		return
	}

	if exists {
		_, err = db.DB.Exec(`
            UPDATE users
            SET role = 'organizer', full_name = $1,
                consent_given = true, consent_date = NOW(), consent_version = '1.0'
            WHERE user_id = $2
        `, req.FullName, req.UserID)
	} else {
		_, err = db.DB.Exec(`
            INSERT INTO users (user_id, full_name, role, consent_given, consent_date, consent_version)
            VALUES ($1, $2, 'organizer', true, NOW(), '1.0')
        `, req.UserID, req.FullName)
	}
	if err != nil {
		log.Printf("HandleAdminCreateOrganizer DB error: %v", err)
		writeError(w, http.StatusInternalServerError, "failed to create/update organizer")
		return
	}

	w.WriteHeader(http.StatusOK)
	json.NewEncoder(w).Encode(StatusResponse{Status: "organizer created"})
}
