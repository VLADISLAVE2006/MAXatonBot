package handlers

import (
	"database/sql"
	"encoding/json"
	"io"
	"net/http"
	"os"
	"time"

	"api/internal/db"
	"api/internal/middleware"
	"log"
	"strconv"

	"github.com/google/uuid"
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
	var requestedOrganizer bool
	var fullName sql.NullString

	err = db.DB.QueryRow(`
		SELECT role, COALESCE(requested_organizer, false), full_name
		FROM users WHERE user_id = $1`, userID,
	).Scan(&role, &requestedOrganizer, &fullName)

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
		"requested_organizer": requestedOrganizer,
		"full_name":           fullName.String,
		"token":               token,
	})
}

// Запрос админу на получение роли организатора
type RequestOrganizerRequest struct {
	UserID int64 `json:"user_id"`
}

func HandleRequestOrganizer(w http.ResponseWriter, r *http.Request) {
	// Ограничение размера - 10 мб
	if err := r.ParseMultipartForm(10 << 20); err != nil {
		writeError(w, http.StatusBadRequest, "failed to parse form (max 10MB)")
		return
	}

	claims := middleware.GetClaims(r)
	userID := claims.UserID

	// Проверяем существование пользователя
	var exists bool
	if err := db.DB.QueryRow("SELECT EXISTS(SELECT 1 FROM users WHERE user_id = $1)", userID).Scan(&exists); err != nil || !exists {
		writeError(w, http.StatusNotFound, "user not found")
		return
	}

	// Получаем файл из формы
	file, header, err := r.FormFile("file")
	if err != nil {
		writeError(w, http.StatusBadRequest, "file is required")
		return
	}
	defer file.Close()

	// Проверяем MIME-тип
	if header.Header.Get("Content-Type") != "application/pdf" {
		writeError(w, http.StatusBadRequest, "only PDF files are allowed")
		return
	}

	// Генерируем UUID-имя и сохраняем файл
	uploadsDir := "./uploads"
	if err := os.MkdirAll(uploadsDir, os.ModePerm); err != nil {
		log.Printf("RequestOrganizer mkdir error: %v", err)
		writeError(w, http.StatusInternalServerError, "failed to create uploads directory")
		return
	}

	fileID := uuid.New().String()
	fileName := fileID + ".pdf"
	filePath := uploadsDir + "/" + fileName

	dst, err := os.Create(filePath)
	if err != nil {
		log.Printf("RequestOrganizer file create error: %v", err)
		writeError(w, http.StatusInternalServerError, "failed to save file")
		return
	}
	defer dst.Close()

	if _, err := io.Copy(dst, file); err != nil {
		log.Printf("RequestOrganizer file copy error: %v", err)
		writeError(w, http.StatusInternalServerError, "failed to write file")
		return
	}

	// Сохраняем заявку в БД
	_, err = db.DB.Exec(`
        INSERT INTO organizer_requests (user_id, file_path) VALUES ($1, $2)`,
		userID, fileName,
	)
	if err != nil {
		log.Printf("RequestOrganizer DB error: %v", err)
		writeError(w, http.StatusInternalServerError, "failed to save request")
		return
	}

	// Обновляем флаг на пользователе (для HandleGetRole)
	_, _ = db.DB.Exec("UPDATE users SET requested_organizer = true WHERE user_id = $1", userID)

	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusOK)
	json.NewEncoder(w).Encode(map[string]string{"status": "request sent"})
}

// назначение роли организатора админом
type SetRoleRequest struct {
	TargetUserID int64  `json:"target_user_id"`
	Role         string `json:"role"` // "organizer" или "applicant"
}

func HandleSetRole(w http.ResponseWriter, r *http.Request) {
	var req SetRoleRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeError(w, http.StatusBadRequest, "invalid JSON")
		return
	}

	if req.Role != "organizer" && req.Role != "applicant" {
		writeError(w, http.StatusBadRequest, "role must be 'organizer' or 'applicant'")
		return
	}

	// Обновляем роль целевого пользователя и сбрасываем флаг заявки
	_, err := db.DB.Exec(`
        UPDATE users 
        SET role = $1, requested_organizer = false 
        WHERE user_id = $2`, req.Role, req.TargetUserID)
	if err != nil {
		log.Printf("SetRole DB error (update): %v", err)
		writeError(w, http.StatusInternalServerError, "failed to update role")
		return
	}

	w.WriteHeader(http.StatusOK)
	json.NewEncoder(w).Encode(map[string]string{"status": "role updated"})
}
