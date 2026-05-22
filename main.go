package main

import (
	"log"
	"net/http"
	"os"

	"github.com/gorilla/mux"
	"github.com/joho/godotenv"

	"api/internal/db"
	"api/internal/handlers"
	"api/internal/middleware"
)

func main() {
	// Загружаем .env
	if err := godotenv.Load(); err != nil {
		log.Println("Warning: no .env file found, relying on environment variables")
	}

	// Инициализируем базу данных
	if err := db.InitDB(); err != nil {
		log.Fatalf("Database initialization failed: %v", err)
	}
	defer db.DB.Close() // при выходе закроем соединение

	// Создаём роутер
	router := mux.NewRouter()

	// Эндпоинты с защитой API-ключом
	router.HandleFunc("/api/user/consent", middleware.APIAuth(handlers.HandleConsent)).Methods("POST")
	router.HandleFunc("/api/user/profile", middleware.UserAuth(handlers.HandleProfile)).Methods("POST")
	router.HandleFunc("/api/user/me", middleware.APIAuth(handlers.HandleGetMe)).Methods("GET")
	router.HandleFunc("/api/user/request-organizer", middleware.UserAuth(handlers.HandleRequestOrganizer)).Methods("POST")

	router.HandleFunc("/api/admin/set-role", middleware.AdminAuth(handlers.HandleSetRole)).Methods("POST")
	router.HandleFunc("/api/admin/organizer-requests", middleware.AdminAuth(handlers.HandleOrganizerRequests)).Methods("GET")
	router.HandleFunc("/api/admin/organizer-requests/{id}", middleware.AdminAuth(handlers.HandleOrganizerRequestByID)).Methods("GET")

	uploadsDir := "./uploads"
	router.PathPrefix("/uploads/").Handler(
		middleware.AdminAuth(func(w http.ResponseWriter, r *http.Request) {
			http.StripPrefix("/uploads/", http.FileServer(http.Dir(uploadsDir))).ServeHTTP(w, r)
		}),
	).Methods("GET")

	// Дополнительно: публичный эндпоинт для проверки работоспособности (без ключа)
	router.HandleFunc("/health", func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusOK)
		w.Write([]byte("OK"))
	}).Methods("GET")

	port := os.Getenv("PORT")
	if port == "" {
		port = "8080"
	}

	log.Printf("Server starting on port %s", port)
	if err := http.ListenAndServe(":"+port, router); err != nil {
		log.Fatal(err)
	}
}
