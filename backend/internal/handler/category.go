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

// CategoryHandler handles category CRUD.
type CategoryHandler struct {
	categories   *postgres.CategoryRepo
	queryTimeout time.Duration
}

func NewCategoryHandler(repo *postgres.CategoryRepo, timeout time.Duration) *CategoryHandler {
	return &CategoryHandler{categories: repo, queryTimeout: timeout}
}

func (h *CategoryHandler) List(w http.ResponseWriter, r *http.Request) {
	user, ok := MustCurrentUser(w, r)
	if !ok {
		return
	}

	ctx, cancel := context.WithTimeout(r.Context(), h.queryTimeout)
	defer cancel()

	items, err := h.categories.ListAll(ctx, user.ID)
	if err != nil {
		slog.Error("listCategories failed", "error", err)
		WriteError(w, http.StatusInternalServerError, "could not list categories")
		return
	}

	WriteJSON(w, http.StatusOK, items)
}

func (h *CategoryHandler) Create(w http.ResponseWriter, r *http.Request) {
	user, ok := MustCurrentUser(w, r)
	if !ok {
		return
	}

	var payload domain.CategoryPayload
	if err := DecodeJSON(r, &payload); err != nil {
		WriteError(w, http.StatusBadRequest, err.Error())
		return
	}

	normalized, err := domain.ValidateCategoryPayload(payload)
	if err != nil {
		WriteError(w, http.StatusBadRequest, err.Error())
		return
	}

	ctx, cancel := context.WithTimeout(r.Context(), h.queryTimeout)
	defer cancel()

	dto, err := h.categories.Create(ctx, user.ID, normalized)
	if errors.Is(err, domain.ErrConflict) {
		WriteError(w, http.StatusConflict, "category already exists")
		return
	}
	if err != nil {
		slog.Error("createCategory failed", "error", err)
		WriteError(w, http.StatusInternalServerError, "could not create category")
		return
	}

	WriteJSON(w, http.StatusCreated, dto)
}

func (h *CategoryHandler) Update(w http.ResponseWriter, r *http.Request) {
	user, ok := MustCurrentUser(w, r)
	if !ok {
		return
	}
	id, ok := GetPathID(r, "id")
	if !ok {
		WriteError(w, http.StatusBadRequest, "invalid id")
		return
	}

	var payload domain.CategoryPayload
	if err := DecodeJSON(r, &payload); err != nil {
		WriteError(w, http.StatusBadRequest, err.Error())
		return
	}

	normalized, err := domain.ValidateCategoryPayload(payload)
	if err != nil {
		WriteError(w, http.StatusBadRequest, err.Error())
		return
	}

	ctx, cancel := context.WithTimeout(r.Context(), h.queryTimeout)
	defer cancel()

	dto, err := h.categories.Update(ctx, id, user.ID, normalized)
	if errors.Is(err, domain.ErrNotFound) {
		WriteError(w, http.StatusNotFound, "category not found")
		return
	}
	if errors.Is(err, domain.ErrConflict) {
		WriteError(w, http.StatusConflict, "category name already exists")
		return
	}
	if err != nil {
		slog.Error("updateCategory failed", "error", err)
		WriteError(w, http.StatusInternalServerError, "could not update category")
		return
	}

	WriteJSON(w, http.StatusOK, dto)
}

func (h *CategoryHandler) Delete(w http.ResponseWriter, r *http.Request) {
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

	err := h.categories.Delete(ctx, id, user.ID)
	if errors.Is(err, domain.ErrNotFound) {
		WriteError(w, http.StatusNotFound, "category not found")
		return
	}
	if err != nil {
		slog.Error("deleteCategory failed", "error", err)
		WriteError(w, http.StatusInternalServerError, "could not delete category")
		return
	}

	w.WriteHeader(http.StatusNoContent)
}
