package handler

import (
	"context"
	"net/http"
	"time"

	"gestao/backend/internal/postgres"

	"github.com/jackc/pgx/v5/pgxpool"
)

// HealthHandler provides a health check endpoint.
type HealthHandler struct {
	pool         *pgxpool.Pool
	queryTimeout time.Duration
	pingDB       bool
	serviceName  string
	version      string
	startedAt    time.Time
}

func NewHealthHandler(pool *pgxpool.Pool, timeout time.Duration, pingDB bool, serviceName, version string) *HealthHandler {
	return &HealthHandler{
		pool:         pool,
		queryTimeout: timeout,
		pingDB:       pingDB,
		serviceName:  serviceName,
		version:      version,
		startedAt:    time.Now().UTC(),
	}
}

func (h *HealthHandler) Handle(w http.ResponseWriter, r *http.Request) {
	database := map[string]any{
		"status": "skipped",
	}

	if h.pingDB {
		ctx, cancel := context.WithTimeout(r.Context(), h.queryTimeout)
		defer cancel()

		if err := h.pool.Ping(ctx); err != nil {
			WriteError(w, http.StatusServiceUnavailable, "database unavailable")
			return
		}

		stats := h.pool.Stat()
		database = map[string]any{
			"status":   "ok",
			"acquired": stats.AcquiredConns(),
			"idle":     stats.IdleConns(),
			"total":    stats.TotalConns(),
		}
	}

	WriteJSON(w, http.StatusOK, map[string]any{
		"status":        "ok",
		"time":          time.Now().UTC().Format(time.RFC3339),
		"service":       h.serviceName,
		"version":       h.version,
		"uptimeSeconds": int64(time.Since(h.startedAt).Seconds()),
		"database":      database,
	})
}

// MeHandler returns the authenticated user's profile.
type MeHandler struct {
	users        *postgres.UserRepo
	queryTimeout time.Duration
}

func NewMeHandler(users *postgres.UserRepo, timeout time.Duration) *MeHandler {
	return &MeHandler{users: users, queryTimeout: timeout}
}

func (h *MeHandler) Handle(w http.ResponseWriter, r *http.Request) {
	user, ok := MustCurrentUser(w, r)
	if !ok {
		return
	}

	ctx, cancel := context.WithTimeout(r.Context(), h.queryTimeout)
	defer cancel()

	dto, err := h.users.FindByID(ctx, user.ID)
	if err != nil {
		WriteError(w, http.StatusInternalServerError, "could not fetch user")
		return
	}

	WriteJSON(w, http.StatusOK, dto)
}
