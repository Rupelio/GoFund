package handler

import (
	"context"
	"errors"
	"fmt"
	"log/slog"
	"net/http"
	"time"

	"gestao/backend/internal/domain"
)

type transactionStore interface {
	List(ctx context.Context, userID, month string, limit, offset int) ([]domain.TransactionDTO, int, error)
	FindByID(ctx context.Context, id, userID string) (domain.TransactionDTO, error)
	Create(ctx context.Context, userID string, dateValue time.Time, recurrenceEnd *time.Time, p domain.TransactionPayload) (domain.TransactionDTO, error)
	CreateImported(ctx context.Context, userID string, dateValue time.Time, recurrenceEnd *time.Time, p domain.TransactionPayload, dedupeKey string) (bool, error)
	Update(ctx context.Context, id, userID string, dateValue time.Time, recurrenceEnd *time.Time, p domain.TransactionPayload) (domain.TransactionDTO, error)
	Delete(ctx context.Context, id, userID string) error
	DeleteAll(ctx context.Context, userID string) (int64, error)
}

// TransactionHandler handles transaction CRUD.
type TransactionHandler struct {
	transactions transactionStore
	queryTimeout time.Duration
}

func NewTransactionHandler(repo transactionStore, timeout time.Duration) *TransactionHandler {
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
	if errors.Is(err, domain.ErrConflict) {
		WriteError(w, http.StatusConflict, "transaction already exists")
		return
	}
	var validationErr *domain.ValidationError
	if errors.As(err, &validationErr) {
		WriteError(w, http.StatusBadRequest, validationErr.Error())
		return
	}
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
	if errors.Is(err, domain.ErrConflict) {
		WriteError(w, http.StatusConflict, "transaction already exists")
		return
	}
	var validationErr *domain.ValidationError
	if errors.As(err, &validationErr) {
		WriteError(w, http.StatusBadRequest, validationErr.Error())
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

// DeleteAll removes all transactions for the authenticated user.
func (h *TransactionHandler) DeleteAll(w http.ResponseWriter, r *http.Request) {
	user, ok := MustCurrentUser(w, r)
	if !ok {
		return
	}

	ctx, cancel := context.WithTimeout(r.Context(), h.queryTimeout)
	defer cancel()

	count, err := h.transactions.DeleteAll(ctx, user.ID)
	if err != nil {
		slog.Error("deleteAllTransactions failed", "error", err)
		WriteError(w, http.StatusInternalServerError, "could not delete transactions")
		return
	}

	WriteJSON(w, http.StatusOK, map[string]any{"deleted": count, "message": fmt.Sprintf("%d movimentações excluídas", count)})
}

// Import handles batch CSV import in a single request.
func (h *TransactionHandler) Import(w http.ResponseWriter, r *http.Request) {
	user, ok := MustCurrentUser(w, r)
	if !ok {
		return
	}

	var payload domain.TransactionImportPayload
	if err := DecodeJSON(r, &payload); err != nil {
		WriteError(w, http.StatusBadRequest, err.Error())
		return
	}

	total := len(payload.Items)
	if total == 0 {
		WriteError(w, http.StatusBadRequest, "items are required")
		return
	}
	if total > 5000 {
		WriteError(w, http.StatusBadRequest, "too many rows for a single import (max 5000)")
		return
	}

	importTimeout := h.queryTimeout
	if importTimeout < 30*time.Second {
		importTimeout = 30 * time.Second
	}
	ctx, cancel := context.WithTimeout(r.Context(), importTimeout)
	defer cancel()

	startedAt := time.Now()
	result := domain.TransactionImportResult{Total: total}
	for i, item := range payload.Items {
		dateValue, recurrenceEnd, normalized, err := domain.ValidateTransactionPayload(item)
		if err != nil {
			result.Invalid++
			continue
		}

		result.Valid++
		dedupeKey := domain.TransactionDedupeKey(dateValue, normalized.Description, normalized.Amount, normalized.Recurrence, normalized.Installments)
		imported, err := h.transactions.CreateImported(ctx, user.ID, dateValue, recurrenceEnd, normalized, dedupeKey)
		if err != nil {
			var validationErr *domain.ValidationError
			if errors.As(err, &validationErr) {
				result.Invalid++
				continue
			}

			slog.Error("importTransactions failed", "error", err, "userID", user.ID, "rowIndex", i)
			WriteError(w, http.StatusInternalServerError, "could not import transactions")
			return
		}

		if imported {
			result.Imported++
			continue
		}
		result.Duplicates++
	}

	slog.Info(
		"transactions import summary",
		"userID", user.ID,
		"total", result.Total,
		"valid", result.Valid,
		"imported", result.Imported,
		"duplicates", result.Duplicates,
		"invalid", result.Invalid,
		"durationMs", time.Since(startedAt).Milliseconds(),
	)
	WriteJSON(w, http.StatusOK, result)
}
