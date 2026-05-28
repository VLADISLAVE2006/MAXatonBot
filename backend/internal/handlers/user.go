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

// errorResponse для единообразного вывода ошибок
type errorResponse struct {
	Error string `json:"error"`
}

func writeError(w http.ResponseWriter, status int, message string) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	json.NewEncoder(w).Encode(errorResponse{Error: message})
}

// HandleConsent – обработчик POST /api/user/consent
func HandleConsent(w http.ResponseWriter, r *http.Request) {
	var req ConsentRequest
	// Декодируем JSON из тела запроса
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeError(w, http.StatusBadRequest, "invalid JSON body")
		return
	}

	// Валидация
	if req.UserID == 0 {
		writeError(w, http.StatusBadRequest, "user_id is required")
		return
	}
	if !req.Agreed {
		writeError(w, http.StatusBadRequest, "consent must be agreed (agreed: true)")
		return
	}
	if req.AgreementVersion == "" {
		req.AgreementVersion = "1.0" // версия по умолчанию
	}

	// Используем INSERT ... ON CONFLICT DO UPDATE
	// PostgreSQL поддерживает UPSERT через ON CONFLICT
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
		// Логируем ошибку на сервере, но пользователю отдаём общее сообщение
		http.Error(w, "database error", http.StatusInternalServerError)
		return
	}

	// Успешный ответ
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusOK)
	json.NewEncoder(w).Encode(map[string]string{"status": "consent saved"})
}

// HandleProfile – обработчик POST /api/user/profile
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

	// Сначала проверим, существует ли пользователь и дал ли согласие
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

	// Обновляем ФИО
	_, err = db.DB.Exec("UPDATE users SET full_name = $1 WHERE user_id = $2", req.FullName, userID)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "failed to update profile")
		return
	}

	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusOK)
	json.NewEncoder(w).Encode(map[string]string{"status": "profile updated"})
}

// HandleGetMe возвращает информацию о текущем пользователе
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
	json.NewEncoder(w).Encode(map[string]interface{}{
		"role":                role,
		"full_name":           fullName.String,
		"token":               token,
	})
}


// HandleNotifications – получение или изменение настроек уведомлений пользователя
type NotificationsRequest struct {
    Enabled bool `json:"enabled"`
}

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
    json.NewEncoder(w).Encode(map[string]bool{"enabled": enabled})
}

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
    json.NewEncoder(w).Encode(map[string]string{"status": "ok"})
}


// AdminCreateOrganizerRequest структура запроса от админа
type AdminCreateOrganizerRequest struct {
    UserID   int64  `json:"user_id"`
    FullName string `json:"full_name"`
}

// HandleAdminCreateOrganizer – создаёт организатора напрямую (только для админа)
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

    // Проверяем, существует ли пользователь
    var exists bool
    err := db.DB.QueryRow("SELECT EXISTS(SELECT 1 FROM users WHERE user_id = $1)", req.UserID).Scan(&exists)
    if err != nil {
        writeError(w, http.StatusInternalServerError, "database error")
        return
    }

    if exists {
        // Обновляем роль и ФИО
        _, err = db.DB.Exec(`
            UPDATE users 
            SET role = 'organizer', full_name = $1, 
                consent_given = true, consent_date = NOW(), consent_version = '1.0'
            WHERE user_id = $2
        `, req.FullName, req.UserID)
    } else {
        // Создаём нового пользователя как организатора
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
    json.NewEncoder(w).Encode(map[string]string{"status": "organizer created"})
}