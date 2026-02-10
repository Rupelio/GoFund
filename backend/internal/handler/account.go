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

// AccountHandler handles account CRUD.
type AccountHandler struct {
	accounts     *postgres.AccountRepo
	queryTimeout time.Duration
}

func NewAccountHandler(repo *postgres.AccountRepo, timeout time.Duration) *AccountHandler {
	return &AccountHandler{accounts: repo, queryTimeout: timeout}
}

func (h *AccountHandler) List(w http.ResponseWriter, r *http.Request) {
	user, ok := MustCurrentUser(w, r)
	if !ok {
		return
	}

	ctx, cancel := context.WithTimeout(r.Context(), h.queryTimeout)
	defer cancel()

	items, err := h.accounts.ListAll(ctx, user.ID)
	if err != nil {
		slog.Error("listAccounts failed", "error", err)
		WriteError(w, http.StatusInternalServerError, "could not list accounts")
		return
	}

	WriteJSON(w, http.StatusOK, items)
}

func (h *AccountHandler) Create(w http.ResponseWriter, r *http.Request) {
	user, ok := MustCurrentUser(w, r)
	if !ok {
		return
	}

	var payload domain.AccountPayload
	if err := DecodeJSON(r, &payload); err != nil {
		WriteError(w, http.StatusBadRequest, err.Error())
		return
	}

	normalized, err := domain.ValidateAccountPayload(payload)
	if err != nil {
		WriteError(w, http.StatusBadRequest, err.Error())
		return
	}

	ctx, cancel := context.WithTimeout(r.Context(), h.queryTimeout)
	defer cancel()

	dto, err := h.accounts.Create(ctx, user.ID, normalized)
	if errors.Is(err, domain.ErrConflict) {
		WriteError(w, http.StatusConflict, "account name already exists")
		return
	}
	if err != nil {
		slog.Error("createAccount failed", "error", err)
		WriteError(w, http.StatusInternalServerError, "could not create account")
		return
	}

	WriteJSON(w, http.StatusCreated, dto)
}

func (h *AccountHandler) Update(w http.ResponseWriter, r *http.Request) {
	user, ok := MustCurrentUser(w, r)
	if !ok {
		return
	}
	id, ok := GetPathID(r, "id")
	if !ok {
		WriteError(w, http.StatusBadRequest, "invalid id")
		return
	}

	var payload domain.AccountPayload
	if err := DecodeJSON(r, &payload); err != nil {
		WriteError(w, http.StatusBadRequest, err.Error())
		return
	}

	normalized, err := domain.ValidateAccountPayload(payload)
	if err != nil {
		WriteError(w, http.StatusBadRequest, err.Error())
		return
	}

	ctx, cancel := context.WithTimeout(r.Context(), h.queryTimeout)
	defer cancel()

	dto, err := h.accounts.Update(ctx, id, user.ID, normalized)
	if errors.Is(err, domain.ErrNotFound) {
		WriteError(w, http.StatusNotFound, "account not found")
		return
	}
	if errors.Is(err, domain.ErrConflict) {
		WriteError(w, http.StatusConflict, "account name already exists")
		return
	}
	if err != nil {
		slog.Error("updateAccount failed", "error", err)
		WriteError(w, http.StatusInternalServerError, "could not update account")
		return
	}

	WriteJSON(w, http.StatusOK, dto)
}

func (h *AccountHandler) Delete(w http.ResponseWriter, r *http.Request) {
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

	err := h.accounts.Delete(ctx, id, user.ID)
	if errors.Is(err, domain.ErrNotFound) {
		WriteError(w, http.StatusNotFound, "account not found")
		return
	}
	if err != nil {
		slog.Error("deleteAccount failed", "error", err)
		WriteError(w, http.StatusInternalServerError, "could not delete account")
		return
	}

	w.WriteHeader(http.StatusNoContent)
}
