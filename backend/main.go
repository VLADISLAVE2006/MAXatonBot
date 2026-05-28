//	@title						MAXatonBot API
//	@version					1.0
//	@description				REST API для бота записи абитуриентов на мероприятия МИРЭА
//	@host						localhost:8080
//	@BasePath					/
//
//	@securityDefinitions.apikey	ApiKeyAuth
//	@in							header
//	@name						X-API-Key
//	@description				Общий API-ключ для межсервисного взаимодействия
//
//	@securityDefinitions.apikey	BearerAuth
//	@in							header
//	@name						Authorization
//	@description				JWT-токен пользователя. Формат: Bearer <token>

package main

import (
	"log"
	"net/http"
	"os"

	"github.com/gorilla/mux"
	"github.com/joho/godotenv"
	httpSwagger "github.com/swaggo/http-swagger/v2"

	_ "api/docs"
	"api/internal/db"
	"api/internal/handlers"
	"api/internal/middleware"
)

func corsMiddleware(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Access-Control-Allow-Origin", "*")
		w.Header().Set("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS")
		w.Header().Set("Access-Control-Allow-Headers", "Content-Type, Authorization, X-API-Key")

		if r.Method == http.MethodOptions {
			w.WriteHeader(http.StatusNoContent)
			return
		}
		next.ServeHTTP(w, r)
	})
}

func main() {
	if err := godotenv.Load(); err != nil {
		log.Println("Warning: no .env file found, relying on environment variables")
	}

	if err := db.InitDB(); err != nil {
		log.Fatalf("Database initialization failed: %v", err)
	}
	defer db.DB.Close()

	router := mux.NewRouter()

	// Swagger UI
	router.PathPrefix("/swagger/").Handler(httpSwagger.WrapHandler)

	// User
	router.HandleFunc("/api/user/consent", middleware.APIAuth(handlers.HandleConsent)).Methods("POST")
	router.HandleFunc("/api/user/profile", middleware.UserAuth(handlers.HandleProfile)).Methods("POST")
	router.HandleFunc("/api/user/me", middleware.APIAuth(handlers.HandleGetMe)).Methods("GET")
	router.HandleFunc("/api/user/registrations", middleware.UserAuth(handlers.HandleMyRegistrations)).Methods("GET")
	router.HandleFunc("/api/user/registrations/archived", middleware.UserAuth(handlers.HandleGetArchivedRegistrations)).Methods("GET")
	router.HandleFunc("/api/user/notifications", middleware.UserAuth(handlers.HandleGetNotifications)).Methods("GET")
	router.HandleFunc("/api/user/notifications", middleware.UserAuth(handlers.HandleUpdateNotifications)).Methods("POST")

	// Agreement
	router.HandleFunc("/api/agreement/current", handlers.HandleGetCurrentAgreement).Methods("GET")
	router.HandleFunc("/api/admin/agreement", middleware.AdminAuth(handlers.HandleUploadAgreement)).Methods("POST")

	// Admin
	router.HandleFunc("/api/admin/organizers", middleware.AdminAuth(handlers.HandleAdminCreateOrganizer)).Methods("POST")

	// Events (абитуриент)
	router.HandleFunc("/api/events", middleware.UserAuth(handlers.HandleGetEvents)).Methods("GET")
	router.HandleFunc("/api/events/upload", middleware.OrganizerAuth(handlers.HandleUploadEventsCSV)).Methods("POST")
	router.HandleFunc("/api/events/{id}", middleware.UserAuth(handlers.HandleGetEventByID)).Methods("GET")
	router.HandleFunc("/api/events/{id}/register", middleware.UserAuth(handlers.HandleRegisterEvent)).Methods("POST")
	router.HandleFunc("/api/events/{id}/register", middleware.UserAuth(handlers.HandleCancelEvent)).Methods("DELETE")
	router.HandleFunc("/api/events/{id}/attendance", middleware.UserAuth(handlers.HandleMarkAttendance)).Methods("POST")
	router.HandleFunc("/api/events/{id}/review", middleware.UserAuth(handlers.HandleAddReview)).Methods("POST")

	// Reminders (внутренние для бота)
	router.HandleFunc("/api/reminders/pending", middleware.APIAuth(handlers.HandleGetPendingReminders)).Methods("GET")
	router.HandleFunc("/api/reminders/mark-sent", middleware.APIAuth(handlers.HandleMarkRemindersSent)).Methods("POST")
	router.HandleFunc("/api/events/{id}/registrations", middleware.APIAuth(handlers.HandleGetEventRegistrations)).Methods("GET")

	// Events (организатор)
	router.HandleFunc("/api/events", middleware.OrganizerAuth(handlers.HandleCreateEvent)).Methods("POST")
	router.HandleFunc("/api/organizer/events", middleware.OrganizerAuth(handlers.HandleGetOrganizerEvents)).Methods("GET")
	router.HandleFunc("/api/organizer/events/archived", middleware.OrganizerAuth(handlers.HandleGetOrganizerArchivedEvents)).Methods("GET")
	router.HandleFunc("/api/events/{id}", middleware.OrganizerAuth(handlers.HandleUpdateEvent)).Methods("PUT")
	router.HandleFunc("/api/events/{id}", middleware.OrganizerAuth(handlers.HandleDeleteEvent)).Methods("DELETE")
	router.HandleFunc("/api/events/{id}/stats", middleware.OrganizerAuth(handlers.HandleEventStats)).Methods("GET")
	router.HandleFunc("/api/events/{id}/close", middleware.OrganizerAuth(handlers.HandleCloseEvent)).Methods("POST")
	router.HandleFunc("/api/events/{id}/attendees", middleware.OrganizerAuth(handlers.HandleEventAttendees)).Methods("GET")

	// Static files
	router.PathPrefix("/uploads/").Handler(http.StripPrefix("/uploads/", http.FileServer(http.Dir("./uploads"))))

	router.HandleFunc("/health", func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusOK)
		w.Write([]byte("OK"))
	}).Methods("GET")

	port := os.Getenv("PORT")
	if port == "" {
		port = "8080"
	}

	log.Printf("Server starting on port %s", port)
	log.Printf("Swagger UI: http://localhost:%s/swagger/index.html", port)
	if err := http.ListenAndServe(":"+port, corsMiddleware(router)); err != nil {
		log.Fatal(err)
	}
}
