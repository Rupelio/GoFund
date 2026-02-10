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

// TransactionHandler handles transaction CRUD.
type TransactionHandler struct {
	transactions *postgres.TransactionRepo
	queryTimeout time.Duration
}

func NewTransactionHandler(repo *postgres.TransactionRepo, timeout time.Duration) *TransactionHandler {
	return &TransactionHandler{transactions: repo, queryTimeout: timeout}
}

func (h *TransactionHandler) List(w http.ResponseWriter, r *http.Request) {
	user, ok := MustCurrentUser(w, r)
	if !ok {
		return
	}

	month := domain.NormalizeString(r.URL.Query().Get("month"))
	if month != "" {
		if _, err := time.Parse("2006-01", month); err != nil {
			WriteError(w, http.StatusBadRequest, "invalid month format, use YYYY-MM")
			return
		}
	}

	page := ParsePagination(r)
	ctx, cancel := context.WithTimeout(r.Context(), h.queryTimeout)
	defer cancel()

	items, total, err := h.transactions.List(ctx, user.ID, month, page.Limit, page.Offset)
	if err != nil {
		slog.Error("listTransactions failed", "error", err)
		WriteError(w, http.StatusInternalServerError, "could not list transactions")
		return
	}

	WriteJSON(w, http.StatusOK, domain.ListResponse[domain.TransactionDTO]{
		Items: items, Total: total, Limit: page.Limit, Offset: page.Offset,
	})
}

func (h *TransactionHandler) Get(w http.ResponseWriter, r *http.Request) {
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

	dto, err := h.transactions.FindByID(ctx, id, user.ID)
	if errors.Is(err, domain.ErrNotFound) {
		WriteError(w, http.StatusNotFound, "transaction not found")
		return
	}
	if err != nil {
		slog.Error("getTransaction failed", "error", err)
		WriteError(w, http.StatusInternalServerError, "could not fetch transaction")
		return
	}

	WriteJSON(w, http.StatusOK, dto)
}

func (h *TransactionHandler) Create(w http.ResponseWriter, r *http.Request) {
	user, ok := MustCurrentUser(w, r)
	if !ok {
		return
	}

	var payload domain.TransactionPayload
	if err := DecodeJSON(r, &payload); err != nil {
		WriteError(w, http.StatusBadRequest, err.Error())
		return
	}

	dateValue, recurrenceEnd, normalized, err := domain.ValidateTransactionPayload(payload)
	if err != nil {
		WriteError(w, http.StatusBadRequest, err.Error())
		return
	}

	ctx, cancel := context.WithTimeout(r.Context(), h.queryTimeout)
	defer cancel()

	dto, err := h.transactions.Create(ctx, user.ID, dateValue, recurrenceEnd, normalized)
	if err != nil {
		slog.Error("createTransaction failed", "error", err)
		WriteError(w, http.StatusInternalServerError, "could not create transaction")
		return
	}

	WriteJSON(w, http.StatusCreated, dto)
}

func (h *TransactionHandler) Update(w http.ResponseWriter, r *http.Request) {
	user, ok := MustCurrentUser(w, r)
	if !ok {
		return
	}
	id, ok := GetPathID(r, "id")
	if !ok {
		WriteError(w, http.StatusBadRequest, "invalid id")
		return
	}

	var payload domain.TransactionPayload
	if err := DecodeJSON(r, &payload); err != nil {
		WriteError(w, http.StatusBadRequest, err.Error())
		return
	}

	dateValue, recurrenceEnd, normalized, err := domain.ValidateTransactionPayload(payload)
	if err != nil {
		WriteError(w, http.StatusBadRequest, err.Error())
		return
	}

	ctx, cancel := context.WithTimeout(r.Context(), h.queryTimeout)
	defer cancel()

	dto, err := h.transactions.Update(ctx, id, user.ID, dateValue, recurrenceEnd, normalized)
	if errors.Is(err, domain.ErrNotFound) {
		WriteError(w, http.StatusNotFound, "transaction not found")
		return
	}
	if err != nil {
		slog.Error("updateTransaction failed", "error", err)
		WriteError(w, http.StatusInternalServerError, "could not update transaction")
		return
	}

	WriteJSON(w, http.StatusOK, dto)
}

func (h *TransactionHandler) Delete(w http.ResponseWriter, r *http.Request) {
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

	err := h.transactions.Delete(ctx, id, user.ID)
	if errors.Is(err, domain.ErrNotFound) {
		WriteError(w, http.StatusNotFound, "transaction not found")
		return
	}
	if err != nil {
		slog.Error("deleteTransaction failed", "error", err)
		WriteError(w, http.StatusInternalServerError, "could not delete transaction")
		return
	}

	w.WriteHeader(http.StatusNoContent)
}
