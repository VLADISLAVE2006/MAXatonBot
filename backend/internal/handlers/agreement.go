package handlers

import (
	"api/internal/db"
	"encoding/json"
	"io"
	"net/http"
	"os"
	"path/filepath"
	"strings"
)

// AgreementResponse ответ с информацией о соглашении
type AgreementResponse struct {
	Version string `json:"version"`
	FileURL string `json:"file_url"`
}

// HandleGetCurrentAgreement возвращает текущее активное соглашение об обработке ПД
//
//	@Summary		Текущее соглашение об обработке ПД
//	@Tags			agreement
//	@Produce		json
//	@Success		200	{object}	AgreementResponse
//	@Failure		404	{object}	errorResponse
//	@Router			/api/agreement/current [get]
func HandleGetCurrentAgreement(w http.ResponseWriter, r *http.Request) {
	var version, filePath string
	err := db.DB.QueryRow("SELECT version, file_path FROM agreements WHERE is_active = true LIMIT 1").Scan(&version, &filePath)
	if err != nil {
		writeError(w, http.StatusNotFound, "no active agreement")
		return
	}
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(AgreementResponse{Version: version, FileURL: filePath})
}

// HandleUploadAgreement загружает новую версию соглашения (только для admin)
//
//	@Summary		Загрузить соглашение об обработке ПД
//	@Tags			agreement
//	@Accept			multipart/form-data
//	@Produce		json
//	@Security		ApiKeyAuth
//	@Security		BearerAuth
//	@Param			file	formData	file	true	"PDF-файл"
//	@Param			version	formData	string	true	"Версия соглашения, например 1.1"
//	@Success		200		{object}	StatusResponse
//	@Failure		400		{object}	errorResponse
//	@Failure		401		{object}	errorResponse
//	@Failure		403		{object}	errorResponse
//	@Failure		500		{object}	errorResponse
//	@Router			/api/admin/agreement [post]
func HandleUploadAgreement(w http.ResponseWriter, r *http.Request) {
	err := r.ParseMultipartForm(10 << 20) // 10 MB
	if err != nil {
		writeError(w, http.StatusBadRequest, "form too large")
		return
	}

	file, header, err := r.FormFile("file")
	if err != nil {
		writeError(w, http.StatusBadRequest, "file is required")
		return
	}
	defer file.Close()

	version := r.FormValue("version")
	if version == "" {
		writeError(w, http.StatusBadRequest, "version is required")
		return
	}

	// Проверяем тип по расширению и по сигнатуре байт (%PDF-)
	if !strings.EqualFold(filepath.Ext(header.Filename), ".pdf") {
		writeError(w, http.StatusBadRequest, "only PDF files are allowed")
		return
	}
	var magic [5]byte
	if _, err := io.ReadFull(file, magic[:]); err != nil || string(magic[:]) != "%PDF-" {
		writeError(w, http.StatusBadRequest, "only PDF files are allowed")
		return
	}
	if _, err := file.Seek(0, io.SeekStart); err != nil {
		writeError(w, http.StatusInternalServerError, "failed to read file")
		return
	}

	dir := "uploads/agreements"
	if err := os.MkdirAll(dir, 0755); err != nil {
		writeError(w, http.StatusInternalServerError, "cannot create directory")
		return
	}

	filename := "agreement_" + version + ".pdf"
	filePath := filepath.Join(dir, filename)
	dst, err := os.Create(filePath)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "cannot save file")
		return
	}
	defer dst.Close()
	if _, err := io.Copy(dst, file); err != nil {
		writeError(w, http.StatusInternalServerError, "failed to write file")
		return
	}

	tx, err := db.DB.Begin()
	if err != nil {
		writeError(w, http.StatusInternalServerError, "database error")
		return
	}
	_, err = tx.Exec("UPDATE agreements SET is_active = false WHERE is_active = true")
	if err != nil {
		tx.Rollback()
		writeError(w, http.StatusInternalServerError, "database error")
		return
	}
	_, err = tx.Exec("INSERT INTO agreements (version, file_path, is_active) VALUES ($1, $2, true)", version, "/"+filePath)
	if err != nil {
		tx.Rollback()
		writeError(w, http.StatusInternalServerError, "database error")
		return
	}
	if err := tx.Commit(); err != nil {
		writeError(w, http.StatusInternalServerError, "database error")
		return
	}

	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusOK)
	json.NewEncoder(w).Encode(StatusResponse{Status: "agreement uploaded"})
}
