package handler

import (
	"encoding/json"
	"io"
	"log/slog"
	"net/http"
	"strings"
)

// LogHandler receives frontend error logs.
type LogHandler struct {
	logger *slog.Logger
}

// NewLogHandler creates a LogHandler.
func NewLogHandler(logger *slog.Logger) *LogHandler {
	return &LogHandler{logger: logger}
}

type frontendLog struct {
	Level   string `json:"level"`
	Message string `json:"message"`
	Stack   string `json:"stack,omitempty"`
	URL     string `json:"url,omitempty"`
	UA      string `json:"ua,omitempty"`
}

// Handle accepts POST /api/log with JSON body.
func (h *LogHandler) Handle(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		return
	}

	var payload frontendLog
	if err := json.NewDecoder(io.LimitReader(r.Body, 4096)).Decode(&payload); err != nil {
		http.Error(w, `{"error":"invalid payload"}`, http.StatusBadRequest)
		return
	}

	msg := strings.TrimSpace(payload.Message)
	if msg == "" {
		msg = "frontend log"
	}

	attrs := []any{
		"source", "frontend",
		"url", payload.URL,
	}
	if payload.Stack != "" {
		attrs = append(attrs, "stack", payload.Stack)
	}

	switch strings.ToLower(payload.Level) {
	case "error":
		h.logger.Error(msg, attrs...)
	case "warn":
		h.logger.Warn(msg, attrs...)
	default:
		h.logger.Info(msg, attrs...)
	}

	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusNoContent)
}
