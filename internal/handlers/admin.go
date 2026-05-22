package handlers

import (
	"database/sql"
	"encoding/json"
	"log"
	"net/http"
	"os"
	"strconv"
	"time"

	"api/internal/db"

	"github.com/gorilla/mux"
)

type OrganizerRequestItem struct {
	ID        int       `json:"id"`
	FullName  string    `json:"full_name"`
	CreatedAt time.Time `json:"created_at"`
}

type OrganizerRequestDetail struct {
	ID        int       `json:"id"`
	FullName  string    `json:"full_name"`
	CreatedAt time.Time `json:"created_at"`
	FileURL   string    `json:"file_url"`
	Status    string    `json:"status"`
}

func HandleOrganizerRequests(w http.ResponseWriter, r *http.Request) {
	rows, err := db.DB.Query(`
        SELECT r.id, COALESCE(u.full_name, ''), r.created_at
        FROM organizer_requests r
        JOIN users u ON r.user_id = u.user_id
        WHERE r.status = 'pending'
        ORDER BY r.created_at ASC
    `)
	if err != nil {
		log.Printf("HandleOrganizerRequests DB error: %v", err)
		writeError(w, http.StatusInternalServerError, "database error")
		return
	}
	defer rows.Close()

	items := []OrganizerRequestItem{}
	for rows.Next() {
		var item OrganizerRequestItem
		if err := rows.Scan(&item.ID, &item.FullName, &item.CreatedAt); err != nil {
			log.Printf("HandleOrganizerRequests scan error: %v", err)
			continue
		}

		items = append(items, item)
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(items)
}

func HandleOrganizerRequestByID(w http.ResponseWriter, r *http.Request) {
	vars := mux.Vars(r)
	idStr := vars["id"]
	id, err := strconv.Atoi(idStr)
	if err != nil {
		writeError(w, http.StatusBadRequest, "invalid request id")
		return
	}

	var detail OrganizerRequestDetail
	var filePath string

	err = db.DB.QueryRow(`
        SELECT r.id, COALESCE(u.full_name, ''), r.created_at, r.file_path, r.status
        FROM organizer_requests r
        JOIN users u ON r.user_id = u.user_id
        WHERE r.id = $1
    `, id).Scan(&detail.ID, &detail.FullName, &detail.CreatedAt, &filePath, &detail.Status)

	if err == sql.ErrNoRows {
		writeError(w, http.StatusNotFound, "request not found")
		return
	}
	if err != nil {
		log.Printf("HandleOrganizerRequestByID DB error: %v", err)
		writeError(w, http.StatusInternalServerError, "database error")
		return
	}

	detail.FileURL = buildFileURL(r, filePath)

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(detail)
}

func buildFileURL(r *http.Request, fileName string) string {
	baseURL := os.Getenv("BASE_URL")
	if baseURL == "" {
		scheme := "http"
		if r.TLS != nil {
			scheme = "https"
		}
		baseURL = scheme + "://" + r.Host
	}
	return baseURL + "/uploads/" + fileName
}
