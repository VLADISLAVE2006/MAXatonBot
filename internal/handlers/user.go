package handlers

import (
    "database/sql"
    "encoding/json"
    "net/http"
    "time"

    "api/internal/db"
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