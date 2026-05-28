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

// HandleGetCurrentAgreement – получение текущего активного соглашения
func HandleGetCurrentAgreement(w http.ResponseWriter, r *http.Request) {
    var version, filePath string
    err := db.DB.QueryRow("SELECT version, file_path FROM agreements WHERE is_active = true LIMIT 1").Scan(&version, &filePath)
    if err != nil {
        // Если нет активного, возвращаем 404, но обычно есть дефолтное
        writeError(w, http.StatusNotFound, "no active agreement")
        return
    }
    w.Header().Set("Content-Type", "application/json")
    json.NewEncoder(w).Encode(map[string]interface{}{
        "version":   version,
        "file_url":  filePath,
    })
}

// HandleUploadAgreement – загрузка новой версии (только для админа)
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

    // Проверяем, что это PDF (или можно разрешить текст)
    contentType := header.Header.Get("Content-Type")
    if !strings.HasPrefix(contentType, "application/pdf") {
        writeError(w, http.StatusBadRequest, "only PDF files are allowed")
        return
    }

    // Создаём папку
    dir := "uploads/agreements"
    if err := os.MkdirAll(dir, 0755); err != nil {
        writeError(w, http.StatusInternalServerError, "cannot create directory")
        return
    }

    // Генерируем имя файла на основе версии
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

    // Начинаем транзакцию: деактивируем старую активную запись, вставляем новую
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
    json.NewEncoder(w).Encode(map[string]string{"status": "agreement uploaded", "version": version})
}