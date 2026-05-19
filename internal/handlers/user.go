package handlers

import (
    "database/sql"
    "encoding/json"
    "net/http"
    "time"

    "api/internal/db"
	"strconv"
	"log"
)

// ConsentRequest структура тела запроса для согласия
type ConsentRequest struct {
    UserID          int64  `json:"user_id"`
    Agreed          bool   `json:"agreed"`
    AgreementVersion string `json:"agreement_version"`
}

// ProfileRequest структура для ФИО
type ProfileRequest struct {
    UserID   int64  `json:"user_id"`
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
    var req ProfileRequest
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

    // Сначала проверим, существует ли пользователь и дал ли согласие
    var consentGiven bool
    err := db.DB.QueryRow("SELECT consent_given FROM users WHERE user_id = $1", req.UserID).Scan(&consentGiven)
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
    _, err = db.DB.Exec("UPDATE users SET full_name = $1 WHERE user_id = $2", req.FullName, req.UserID)
    if err != nil {
        writeError(w, http.StatusInternalServerError, "failed to update profile")
        return
    }

    w.Header().Set("Content-Type", "application/json")
    w.WriteHeader(http.StatusOK)
    json.NewEncoder(w).Encode(map[string]string{"status": "profile updated"})
}




// HandleGetRole возвращает роль пользователя и флаг заявки
func HandleGetRole(w http.ResponseWriter, r *http.Request) {
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
    err = db.DB.QueryRow(`
        SELECT role, COALESCE(requested_organizer, false) 
        FROM users WHERE user_id = $1`, userID).Scan(&role, &requestedOrganizer)
    if err == sql.ErrNoRows {
        writeError(w, http.StatusNotFound, "user not found")
        return
    }
    if err != nil {
        log.Printf("GetRole DB error: %v", err)
        writeError(w, http.StatusInternalServerError, "database error")
        return
    }

    w.Header().Set("Content-Type", "application/json")
    json.NewEncoder(w).Encode(map[string]interface{}{
        "role":                role,
        "requested_organizer": requestedOrganizer,
    })
}



// Запрос админу на получение роли организатора
type RequestOrganizerRequest struct {
    UserID int64 `json:"user_id"`
}

func HandleRequestOrganizer(w http.ResponseWriter, r *http.Request) {
    var req RequestOrganizerRequest
    if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
        writeError(w, http.StatusBadRequest, "invalid JSON")
        return
    }
    if req.UserID == 0 {
        writeError(w, http.StatusBadRequest, "user_id is required")
        return
    }

    // Проверим, существует ли пользователь
    var exists bool
    err := db.DB.QueryRow("SELECT EXISTS(SELECT 1 FROM users WHERE user_id = $1)", req.UserID).Scan(&exists)
    if err != nil || !exists {
        writeError(w, http.StatusNotFound, "user not found")
        return
    }

    // Обновим флаг заявки
    _, err = db.DB.Exec("UPDATE users SET requested_organizer = true WHERE user_id = $1", req.UserID)
    if err != nil {
        log.Printf("RequestOrganizer DB error: %v", err)
        writeError(w, http.StatusInternalServerError, "failed to update")
        return
    }

    w.WriteHeader(http.StatusOK)
    json.NewEncoder(w).Encode(map[string]string{"status": "request sent"})
}


//назначение роли организатора админом
type SetRoleRequest struct {
    AdminUserID int64  `json:"admin_user_id"`
    TargetUserID int64  `json:"target_user_id"`
    Role         string `json:"role"` // "organizer" или "applicant"
}

func HandleSetRole(w http.ResponseWriter, r *http.Request) {
    var req SetRoleRequest
    if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
        writeError(w, http.StatusBadRequest, "invalid JSON")
        return
    }
    if req.AdminUserID == 0 || req.TargetUserID == 0 {
        writeError(w, http.StatusBadRequest, "admin_user_id and target_user_id required")
        return
    }
    if req.Role != "organizer" && req.Role != "applicant" {
        writeError(w, http.StatusBadRequest, "role must be 'organizer' or 'applicant'")
        return
    }

    // Проверяем, что админ существует и имеет роль admin
    var adminRole string
    err := db.DB.QueryRow("SELECT role FROM users WHERE user_id = $1", req.AdminUserID).Scan(&adminRole)
    if err == sql.ErrNoRows {
        writeError(w, http.StatusForbidden, "admin user not found")
        return
    }
    if err != nil {
        log.Printf("SetRole DB error (admin): %v", err)
        writeError(w, http.StatusInternalServerError, "database error")
        return
    }
    if adminRole != "admin" {
        writeError(w, http.StatusForbidden, "user is not an admin")
        return
    }

    // Обновляем роль целевого пользователя и сбрасываем флаг заявки
    _, err = db.DB.Exec(`
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