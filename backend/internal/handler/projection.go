package handler

import (
	"context"
	"log/slog"
	"net/http"
	"time"

	"gestao/backend/internal/domain"
	"gestao/backend/internal/postgres"
)

// ProjectionHandler handles projection settings.
type ProjectionHandler struct {
	projections  *postgres.ProjectionRepo
	queryTimeout time.Duration
}

func NewProjectionHandler(repo *postgres.ProjectionRepo, timeout time.Duration) *ProjectionHandler {
	return &ProjectionHandler{projections: repo, queryTimeout: timeout}
}

func (h *ProjectionHandler) Get(w http.ResponseWriter, r *http.Request) {
	user, ok := MustCurrentUser(w, r)
	if !ok {
		return
	}

	ctx, cancel := context.WithTimeout(r.Context(), h.queryTimeout)
	defer cancel()

	dto, err := h.projections.Get(ctx, user.ID)
	if err != nil {
		slog.Error("getProjection failed", "error", err)
		WriteError(w, http.StatusInternalServerError, "could not fetch projection")
		return
	}

	WriteJSON(w, http.StatusOK, dto)
}

func (h *ProjectionHandler) Upsert(w http.ResponseWriter, r *http.Request) {
	user, ok := MustCurrentUser(w, r)
	if !ok {
		return
	}

	var payload domain.ProjectionPayload
	if err := DecodeJSON(r, &payload); err != nil {
		WriteError(w, http.StatusBadRequest, err.Error())
		return
	}

	normalized, err := domain.ValidateProjectionPayload(payload)
	if err != nil {
		WriteError(w, http.StatusBadRequest, err.Error())
		return
	}

	ctx, cancel := context.WithTimeout(r.Context(), h.queryTimeout)
	defer cancel()

	dto, err := h.projections.Upsert(ctx, user.ID, normalized)
	if err != nil {
		slog.Error("upsertProjection failed", "error", err)
		WriteError(w, http.StatusInternalServerError, "could not save projection")
		return
	}

	WriteJSON(w, http.StatusOK, dto)
}
