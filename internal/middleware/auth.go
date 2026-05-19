package middleware

import (
    "encoding/json"
    "net/http"
    "os"
)

type errorResponse struct {
    Error string `json:"error"`
}

// APIAuth проверяет наличие заголовка X-API-Key и его соответствие ключу из .env
func APIAuth(next http.HandlerFunc) http.HandlerFunc { //функция высшего порядка — она принимает обработчик и возвращает новый обработчик, который оборачивает исходный.
    expectedKey := os.Getenv("API_KEY")
    return func(w http.ResponseWriter, r *http.Request) {
        providedKey := r.Header.Get("X-API-Key")
        if providedKey == "" || providedKey != expectedKey {
            w.Header().Set("Content-Type", "application/json")
            w.WriteHeader(http.StatusUnauthorized)
            json.NewEncoder(w).Encode(errorResponse{Error: "invalid or missing API key"})
            return
        }
        next(w, r)
    }
}