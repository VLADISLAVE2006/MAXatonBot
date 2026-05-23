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
	router.HandleFunc("/api/admin/organizers", middleware.AdminAuth(handlers.HandleAdminCreateOrganizer)).Methods("POST")

	//для абитуриента
	router.HandleFunc("/api/events", middleware.UserAuth(handlers.HandleGetEvents)).Methods("GET")
	router.HandleFunc("/api/events/{id}", middleware.UserAuth(handlers.HandleGetEventByID)).Methods("GET")
	//касаемо записи на мероприятие
	router.HandleFunc("/api/events/{id}/register", middleware.UserAuth(handlers.HandleRegisterEvent)).Methods("POST")
	router.HandleFunc("/api/events/{id}/register", middleware.UserAuth(handlers.HandleCancelEvent)).Methods("DELETE")
	router.HandleFunc("/api/user/registrations", middleware.UserAuth(handlers.HandleMyRegistrations)).Methods("GET")

	//для организатора
	router.HandleFunc("/api/events", middleware.OrganizerAuth(handlers.HandleCreateEvent)).Methods("POST")
	router.HandleFunc("/api/organizer/events", middleware.OrganizerAuth(handlers.HandleGetOrganizerEvents)).Methods("GET")
	router.HandleFunc("/api/events/{id}", middleware.OrganizerAuth(handlers.HandleUpdateEvent)).Methods("PUT")
	router.HandleFunc("/api/events/{id}", middleware.OrganizerAuth(handlers.HandleDeleteEvent)).Methods("DELETE")

	// Публичный эндпоинт для проверки работоспособности (без ключа)
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
