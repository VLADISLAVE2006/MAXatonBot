package handlers

import (
	"bytes"
	"encoding/json"
	"log"
	"net/http"
	"os"
)

type EventChangePayload struct {
	EventID       int                    `json:"event_id"`
	ChangedFields []string               `json:"changed_fields"`
	OldData       map[string]interface{} `json:"old_data"`
	NewData       map[string]interface{} `json:"new_data"`
}

// SendWebhookNotification отправляет уведомление об изменении мероприятия в бот
func SendWebhookNotification(eventID int, changedFields []string, oldData, newData map[string]interface{}) {
	webhookURL := os.Getenv("BOT_WEBHOOK_URL")
	if webhookURL == "" {
		log.Println("BOT_WEBHOOK_URL not set, skipping webhook notification")
		return
	}

	payload := EventChangePayload{
		EventID:       eventID,
		ChangedFields: changedFields,
		OldData:       oldData,
		NewData:       newData,
	}

	jsonPayload, err := json.Marshal(payload)
	if err != nil {
		log.Printf("Failed to marshal webhook payload: %v", err)
		return
	}

	apiKey := os.Getenv("API_KEY")
	req, err := http.NewRequest("POST", webhookURL, bytes.NewBuffer(jsonPayload))
	if err != nil {
		log.Printf("Failed to create webhook request: %v", err)
		return
	}
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("X-API-Key", apiKey)

	client := &http.Client{}
	resp, err := client.Do(req)
	if err != nil {
		log.Printf("Failed to send webhook: %v", err)
		return
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		log.Printf("Webhook responded with status: %d", resp.StatusCode)
	} else {
		log.Printf("Webhook notification sent for event %d, changes: %v", eventID, changedFields)
	}
}