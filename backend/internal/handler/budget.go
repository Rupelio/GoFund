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

// BudgetHandler handles budget CRUD.
type BudgetHandler struct {
	budgets      *postgres.BudgetRepo
	queryTimeout time.Duration
}

func NewBudgetHandler(repo *postgres.BudgetRepo, timeout time.Duration) *BudgetHandler {
	return &BudgetHandler{budgets: repo, queryTimeout: timeout}
}

func (h *BudgetHandler) List(w http.ResponseWriter, r *http.Request) {
	user, ok := MustCurrentUser(w, r)
	if !ok {
		return
	}

	page := ParsePagination(r)
	ctx, cancel := context.WithTimeout(r.Context(), h.queryTimeout)
	defer cancel()

	items, total, err := h.budgets.List(ctx, user.ID, page.Limit, page.Offset)
	if err != nil {
		slog.Error("listBudgets failed", "error", err)
		WriteError(w, http.StatusInternalServerError, "could not list budgets")
		return
	}

	WriteJSON(w, http.StatusOK, domain.ListResponse[domain.BudgetDTO]{
		Items: items, Total: total, Limit: page.Limit, Offset: page.Offset,
	})
}

func (h *BudgetHandler) Create(w http.ResponseWriter, r *http.Request) {
	user, ok := MustCurrentUser(w, r)
	if !ok {
		return
	}

	var payload domain.BudgetPayload
	if err := DecodeJSON(r, &payload); err != nil {
		WriteError(w, http.StatusBadRequest, err.Error())
		return
	}

	normalized, err := domain.ValidateBudgetPayload(payload)
	if err != nil {
		WriteError(w, http.StatusBadRequest, err.Error())
		return
	}

	ctx, cancel := context.WithTimeout(r.Context(), h.queryTimeout)
	defer cancel()

	dto, err := h.budgets.Create(ctx, user.ID, normalized)
	if errors.Is(err, domain.ErrConflict) {
		WriteError(w, http.StatusConflict, "budget already exists for this category")
		return
	}
	if err != nil {
		slog.Error("createBudget failed", "error", err)
		WriteError(w, http.StatusInternalServerError, "could not create budget")
		return
	}

	WriteJSON(w, http.StatusCreated, dto)
}

func (h *BudgetHandler) Update(w http.ResponseWriter, r *http.Request) {
	user, ok := MustCurrentUser(w, r)
	if !ok {
		return
	}
	id, ok := GetPathID(r, "id")
	if !ok {
		WriteError(w, http.StatusBadRequest, "invalid id")
		return
	}

	var payload domain.BudgetPayload
	if err := DecodeJSON(r, &payload); err != nil {
		WriteError(w, http.StatusBadRequest, err.Error())
		return
	}

	normalized, err := domain.ValidateBudgetPayload(payload)
	if err != nil {
		WriteError(w, http.StatusBadRequest, err.Error())
		return
	}

	ctx, cancel := context.WithTimeout(r.Context(), h.queryTimeout)
	defer cancel()

	dto, err := h.budgets.Update(ctx, id, user.ID, normalized)
	if errors.Is(err, domain.ErrNotFound) {
		WriteError(w, http.StatusNotFound, "budget not found")
		return
	}
	if errors.Is(err, domain.ErrConflict) {
		WriteError(w, http.StatusConflict, "budget already exists for this category")
		return
	}
	if err != nil {
		slog.Error("updateBudget failed", "error", err)
		WriteError(w, http.StatusInternalServerError, "could not update budget")
		return
	}

	WriteJSON(w, http.StatusOK, dto)
}

func (h *BudgetHandler) Delete(w http.ResponseWriter, r *http.Request) {
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

	err := h.budgets.Delete(ctx, id, user.ID)
	if errors.Is(err, domain.ErrNotFound) {
		WriteError(w, http.StatusNotFound, "budget not found")
		return
	}
	if err != nil {
		slog.Error("deleteBudget failed", "error", err)
		WriteError(w, http.StatusInternalServerError, "could not delete budget")
		return
	}

	w.WriteHeader(http.StatusNoContent)
}
