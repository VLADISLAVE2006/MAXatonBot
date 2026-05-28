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
	//настройка уведомлений
	router.HandleFunc("/api/user/notifications", middleware.UserAuth(handlers.HandleGetNotifications)).Methods("GET")
	router.HandleFunc("/api/user/notifications", middleware.UserAuth(handlers.HandleUpdateNotifications)).Methods("POST")
	//отправка уведомлений
	router.HandleFunc("/api/reminders/pending", middleware.APIAuth(handlers.HandleGetPendingReminders)).Methods("GET")
	router.HandleFunc("/api/reminders/mark-sent", middleware.APIAuth(handlers.HandleMarkRemindersSent)).Methods("POST")
	//подтверждение записи
	router.HandleFunc("/api/events/{id}/attendance", middleware.UserAuth(handlers.HandleMarkAttendance)).Methods("POST")
	//вывод архива
	router.HandleFunc("/api/user/registrations/archived", middleware.UserAuth(handlers.HandleGetArchivedRegistrations)).Methods("GET")
	//добавление отзыва
	router.HandleFunc("/api/events/{id}/review", middleware.UserAuth(handlers.HandleAddReview)).Methods("POST")



	//для организатора
	router.HandleFunc("/api/events", middleware.OrganizerAuth(handlers.HandleCreateEvent)).Methods("POST")
	router.HandleFunc("/api/events/upload", middleware.OrganizerAuth(handlers.HandleUploadEventsCSV)).Methods("POST")
	router.HandleFunc("/api/organizer/events", middleware.OrganizerAuth(handlers.HandleGetOrganizerEvents)).Methods("GET")
	router.HandleFunc("/api/events/{id}", middleware.OrganizerAuth(handlers.HandleUpdateEvent)).Methods("PUT")
	router.HandleFunc("/api/events/{id}", middleware.OrganizerAuth(handlers.HandleDeleteEvent)).Methods("DELETE")
	//просмотр архива
	router.HandleFunc("/api/organizer/events/archived", middleware.OrganizerAuth(handlers.HandleGetOrganizerArchivedEvents)).Methods("GET")
	//просмтор статистики мероприятия
	router.HandleFunc("/api/events/{id}/stats", middleware.OrganizerAuth(handlers.HandleEventStats)).Methods("GET")
	//закрытие мероприятия
	router.HandleFunc("/api/events/{id}/close", middleware.OrganizerAuth(handlers.HandleCloseEvent)).Methods("POST")
	//просмтор людей, которые зарегались
	router.HandleFunc("/api/events/{id}/attendees", middleware.OrganizerAuth(handlers.HandleEventAttendees)).Methods("GET")

	//для картинок
	// Раздача статических файлов из папки uploads
	router.PathPrefix("/uploads/").Handler(http.StripPrefix("/uploads/", http.FileServer(http.Dir("./uploads"))))

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
	if err := http.ListenAndServe(":"+port, corsMiddleware(router)); err != nil {
		log.Fatal(err)
	}
}
