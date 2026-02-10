package handler

import (
	"context"
	"errors"
	"log/slog"
	"net/http"
	"time"

	"gestao/backend/internal/domain"
	"gestao/backend/internal/postgres"
)

// GoalHandler handles goal CRUD and contributions.
type GoalHandler struct {
	goals        *postgres.GoalRepo
	queryTimeout time.Duration
}

func NewGoalHandler(repo *postgres.GoalRepo, timeout time.Duration) *GoalHandler {
	return &GoalHandler{goals: repo, queryTimeout: timeout}
}

func (h *GoalHandler) List(w http.ResponseWriter, r *http.Request) {
	user, ok := MustCurrentUser(w, r)
	if !ok {
		return
	}

	page := ParsePagination(r)
	ctx, cancel := context.WithTimeout(r.Context(), h.queryTimeout)
	defer cancel()

	items, total, err := h.goals.List(ctx, user.ID, page.Limit, page.Offset)
	if err != nil {
		slog.Error("listGoals failed", "error", err)
		WriteError(w, http.StatusInternalServerError, "could not list goals")
		return
	}

	WriteJSON(w, http.StatusOK, domain.ListResponse[domain.GoalDTO]{
		Items: items, Total: total, Limit: page.Limit, Offset: page.Offset,
	})
}

func (h *GoalHandler) Create(w http.ResponseWriter, r *http.Request) {
	user, ok := MustCurrentUser(w, r)
	if !ok {
		return
	}

	var payload domain.GoalPayload
	if err := DecodeJSON(r, &payload); err != nil {
		WriteError(w, http.StatusBadRequest, err.Error())
		return
	}

	normalized, dueDate, err := domain.ValidateGoalPayload(payload)
	if err != nil {
		WriteError(w, http.StatusBadRequest, err.Error())
		return
	}

	ctx, cancel := context.WithTimeout(r.Context(), h.queryTimeout)
	defer cancel()

	dto, err := h.goals.Create(ctx, user.ID, normalized, dueDate)
	if err != nil {
		slog.Error("createGoal failed", "error", err)
		WriteError(w, http.StatusInternalServerError, "could not create goal")
		return
	}

	WriteJSON(w, http.StatusCreated, dto)
}

func (h *GoalHandler) Update(w http.ResponseWriter, r *http.Request) {
	user, ok := MustCurrentUser(w, r)
	if !ok {
		return
	}
	id, ok := GetPathID(r, "id")
	if !ok {
		WriteError(w, http.StatusBadRequest, "invalid id")
		return
	}

	var payload domain.GoalPayload
	if err := DecodeJSON(r, &payload); err != nil {
		WriteError(w, http.StatusBadRequest, err.Error())
		return
	}

	normalized, dueDate, err := domain.ValidateGoalPayload(payload)
	if err != nil {
		WriteError(w, http.StatusBadRequest, err.Error())
		return
	}

	ctx, cancel := context.WithTimeout(r.Context(), h.queryTimeout)
	defer cancel()

	dto, err := h.goals.Update(ctx, id, user.ID, normalized, dueDate)
	if errors.Is(err, domain.ErrNotFound) {
		WriteError(w, http.StatusNotFound, "goal not found")
		return
	}
	if err != nil {
		slog.Error("updateGoal failed", "error", err)
		WriteError(w, http.StatusInternalServerError, "could not update goal")
		return
	}

	WriteJSON(w, http.StatusOK, dto)
}

func (h *GoalHandler) Delete(w http.ResponseWriter, r *http.Request) {
	user, ok := MustCurrentUser(w, r)
	if !ok {
		return
	}
	id, ok := GetPathID(r, "id")
	if !ok {
		WriteError(w, http.StatusBadRequest, "invalid id")
		return
	}

	ctx, cancel := context.WithTimeout(r.Context(), h.queryTimeout)
	defer cancel()

	err := h.goals.Delete(ctx, id, user.ID)
	if errors.Is(err, domain.ErrNotFound) {
		WriteError(w, http.StatusNotFound, "goal not found")
		return
	}
	if err != nil {
		slog.Error("deleteGoal failed", "error", err)
		WriteError(w, http.StatusInternalServerError, "could not delete goal")
		return
	}

	w.WriteHeader(http.StatusNoContent)
}

func (h *GoalHandler) AddContribution(w http.ResponseWriter, r *http.Request) {
	user, ok := MustCurrentUser(w, r)
	if !ok {
		return
	}
	id, ok := GetPathID(r, "id")
	if !ok {
		WriteError(w, http.StatusBadRequest, "invalid id")
		return
	}

	var payload domain.GoalContributionPayload
	if err := DecodeJSON(r, &payload); err != nil {
		WriteError(w, http.StatusBadRequest, err.Error())
		return
	}
	if payload.Amount <= 0 {
		WriteError(w, http.StatusBadRequest, "amount must be greater than 0")
		return
	}

	ctx, cancel := context.WithTimeout(r.Context(), h.queryTimeout)
	defer cancel()

	dto, err := h.goals.AddContribution(ctx, id, user.ID, payload.Amount)
	if errors.Is(err, domain.ErrNotFound) {
		WriteError(w, http.StatusNotFound, "goal not found")
		return
	}
	if err != nil {
		slog.Error("addContribution failed", "error", err)
		WriteError(w, http.StatusInternalServerError, "could not add contribution")
		return
	}

	WriteJSON(w, http.StatusOK, dto)
}
