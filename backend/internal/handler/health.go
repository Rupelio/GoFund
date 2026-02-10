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
}

func NewHealthHandler(pool *pgxpool.Pool, timeout time.Duration) *HealthHandler {
	return &HealthHandler{pool: pool, queryTimeout: timeout}
}

func (h *HealthHandler) Handle(w http.ResponseWriter, r *http.Request) {
	ctx, cancel := context.WithTimeout(r.Context(), h.queryTimeout)
	defer cancel()

	if err := h.pool.Ping(ctx); err != nil {
		WriteError(w, http.StatusServiceUnavailable, "database unavailable")
		return
	}

	WriteJSON(w, http.StatusOK, map[string]string{
		"status": "ok",
		"time":   time.Now().UTC().Format(time.RFC3339),
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
