package middleware

import (
	"context"
	"encoding/json"
	"net/http"
	"os"
	"strings"
	"time"

	"github.com/golang-jwt/jwt/v5"
)

type errorResponse struct {
	Error string `json:"error"`
}

type Claims struct {
	UserID int64  `json:"user_id"`
	Role   string `json:"role"`
	jwt.RegisteredClaims
}

type contextKey string

const ClaimsKey contextKey = "claims"

// GetClaims достаёт Claims из контекста запроса
func GetClaims(r *http.Request) *Claims {
	claims, _ := r.Context().Value(ClaimsKey).(*Claims)
	return claims
}

func jwtSecret() []byte {
	return []byte(os.Getenv("JWT_SECRET"))
}

func GenerateToken(userID int64, role string) (string, error) {
	claims := Claims{
		UserID: userID,
		Role:   role,
		RegisteredClaims: jwt.RegisteredClaims{
			ExpiresAt: jwt.NewNumericDate(time.Now().Add(24 * time.Hour)),
			IssuedAt:  jwt.NewNumericDate(time.Now()),
		},
	}
	return jwt.NewWithClaims(jwt.SigningMethodHS256, claims).SignedString(jwtSecret())
}

func ParseToken(tokenStr string) (*Claims, error) {
	token, err := jwt.ParseWithClaims(tokenStr, &Claims{}, func(t *jwt.Token) (interface{}, error) {
		if _, ok := t.Method.(*jwt.SigningMethodHMAC); !ok {
			return nil, jwt.ErrSignatureInvalid
		}
		return jwtSecret(), nil
	})
	if err != nil || !token.Valid {
		return nil, err
	}
	return token.Claims.(*Claims), nil
}

func extractBearer(r *http.Request) (string, bool) {
	header := r.Header.Get("Authorization")
	if !strings.HasPrefix(header, "Bearer ") {
		return "", false
	}
	return strings.TrimPrefix(header, "Bearer "), true
}

func writeAuthError(w http.ResponseWriter, status int, message string) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	json.NewEncoder(w).Encode(errorResponse{Error: message})
}

// APIAuth проверяет наличие заголовка X-API-Key и его соответствие ключу из .env
func APIAuth(next http.HandlerFunc) http.HandlerFunc { //функция высшего порядка — она принимает обработчик и возвращает новый обработчик, который оборачивает исходный.
	expectedKey := os.Getenv("API_KEY")
	return func(w http.ResponseWriter, r *http.Request) {
		if key := r.Header.Get("X-API-Key"); key == "" || key != expectedKey {
			writeAuthError(w, http.StatusUnauthorized, "invalid or missing API key")
			return
		}

		next(w, r)
	}
}

func UserAuth(next http.HandlerFunc) http.HandlerFunc {
	expectedKey := os.Getenv("API_KEY")
	return func(w http.ResponseWriter, r *http.Request) {
		if key := r.Header.Get("X-API-Key"); key == "" || key != expectedKey {
			writeAuthError(w, http.StatusUnauthorized, "invalid or missing API key")
			return
		}

		tokenStr, ok := extractBearer(r)
		if !ok {
			writeAuthError(w, http.StatusUnauthorized, "missing Bearer token")
			return
		}

		claims, err := ParseToken(tokenStr)
		if err != nil {
			writeAuthError(w, http.StatusUnauthorized, "invalid or expired token")
			return
		}

		// Кладём claims в контекст - handler достанет через middleware.GetClaims(r)
		ctx := context.WithValue(r.Context(), ClaimsKey, claims)
		next(w, r.WithContext(ctx))
	}
}

func OrganizerAuth(next http.HandlerFunc) http.HandlerFunc {
	expectedKey := os.Getenv("API_KEY")
	return func(w http.ResponseWriter, r *http.Request) {
		if key := r.Header.Get("X-API-Key"); key == "" || key != expectedKey {
			writeAuthError(w, http.StatusUnauthorized, "invalid or missing API key")
			return
		}

		tokenStr, ok := extractBearer(r)
		if !ok {
			writeAuthError(w, http.StatusUnauthorized, "missing Bearer token")
			return
		}

		claims, err := ParseToken(tokenStr)
		if err != nil {
			writeAuthError(w, http.StatusUnauthorized, "invalid or expired token")
			return
		}
		if claims.Role != "organizer" {
			writeAuthError(w, http.StatusForbidden, "forbidden: organizer only")
			return
		}

		ctx := context.WithValue(r.Context(), ClaimsKey, claims)
		next(w, r.WithContext(ctx))
	}
}

func AdminAuth(next http.HandlerFunc) http.HandlerFunc {
	expectedKey := os.Getenv("API_KEY")
	return func(w http.ResponseWriter, r *http.Request) {
		if key := r.Header.Get("X-API-Key"); key == "" || key != expectedKey {
			writeAuthError(w, http.StatusUnauthorized, "invalid or missing API key")
			return
		}

		tokenStr, ok := extractBearer(r)
		if !ok {
			writeAuthError(w, http.StatusUnauthorized, "missing Bearer token")
			return
		}

		claims, err := ParseToken(tokenStr)
		if err != nil {
			writeAuthError(w, http.StatusUnauthorized, "invalid or expired token")
			return
		}
		if claims.Role != "admin" {
			writeAuthError(w, http.StatusForbidden, "forbidden: admin only")
			return
		}

		ctx := context.WithValue(r.Context(), ClaimsKey, claims)
		next(w, r.WithContext(ctx))
	}
}
