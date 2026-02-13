package handler

import (
	"context"
	"errors"
	"fmt"
	"log/slog"
	"net/http"
	"strings"
	"time"

	"gestao/backend/internal/domain"
)

type transactionStore interface {
	List(ctx context.Context, userID, month string, limit, offset int) ([]domain.TransactionDTO, int, error)
	FindByID(ctx context.Context, id, userID string) (domain.TransactionDTO, error)
	Create(ctx context.Context, userID string, dateValue time.Time, recurrenceEnd *time.Time, p domain.TransactionPayload) (domain.TransactionDTO, error)
	CreateImported(ctx context.Context, userID string, dateValue time.Time, recurrenceEnd *time.Time, p domain.TransactionPayload, dedupeKey string, meta *domain.TransactionImportMetadata) (bool, error)
	Update(ctx context.Context, id, userID string, dateValue time.Time, recurrenceEnd *time.Time, p domain.TransactionPayload) (domain.TransactionDTO, error)
	Delete(ctx context.Context, id, userID string) error
	DeleteAll(ctx context.Context, userID string) (int64, error)
	DeleteByImportBatch(ctx context.Context, userID, batchID string) (int64, error)
}

type importJobStore interface {
	Create(ctx context.Context, userID, jobID, batchID string, total int, files []domain.TransactionImportFileResult) (domain.TransactionImportJobDTO, error)
	MarkRunning(ctx context.Context, userID, jobID string) error
	UpdateProgress(ctx context.Context, userID, jobID string, result domain.TransactionImportResult, files []domain.TransactionImportFileResult) error
	Complete(ctx context.Context, userID, jobID, status string, result domain.TransactionImportResult, files []domain.TransactionImportFileResult, errorMessage string) error
	FindByID(ctx context.Context, userID, jobID string) (domain.TransactionImportJobDTO, error)
}

// TransactionHandler handles transaction CRUD.
type TransactionHandler struct {
	transactions transactionStore
	importJobs   importJobStore
	queryTimeout time.Duration
}

func NewTransactionHandler(repo transactionStore, jobs importJobStore, timeout time.Duration) *TransactionHandler {
	return &TransactionHandler{transactions: repo, importJobs: jobs, queryTimeout: timeout}
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

	ctx := r.Context()

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
		imported, err := h.transactions.CreateImported(ctx, user.ID, dateValue, recurrenceEnd, normalized, dedupeKey, nil)
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

// StartImportJob starts asynchronous transaction import and returns a job id for polling.
func (h *TransactionHandler) StartImportJob(w http.ResponseWriter, r *http.Request) {
	user, ok := MustCurrentUser(w, r)
	if !ok {
		return
	}
	if h.importJobs == nil {
		WriteError(w, http.StatusInternalServerError, "import jobs unavailable")
		return
	}

	var payload domain.TransactionImportJobPayload
	if err := DecodeJSON(r, &payload); err != nil {
		WriteError(w, http.StatusBadRequest, err.Error())
		return
	}

	files := normalizeImportFiles(payload.Files)
	totalRows := 0
	for _, file := range files {
		totalRows += len(file.Items)
	}
	if totalRows == 0 {
		WriteError(w, http.StatusBadRequest, "files with items are required")
		return
	}
	if totalRows > 20000 {
		WriteError(w, http.StatusBadRequest, "too many rows for a single async import (max 20000)")
		return
	}

	jobID := domain.MustUUID()
	batchID := domain.MustUUID()
	fileResults := buildInitialFileResults(files)

	ctx, cancel := context.WithTimeout(r.Context(), h.queryTimeout)
	defer cancel()

	job, err := h.importJobs.Create(ctx, user.ID, jobID, batchID, totalRows, fileResults)
	if err != nil {
		slog.Error("createImportJob failed", "error", err, "userID", user.ID)
		WriteError(w, http.StatusInternalServerError, "could not create import job")
		return
	}

	go h.runImportJob(user.ID, jobID, batchID, files)
	WriteJSON(w, http.StatusAccepted, job)
}

// GetImportJob returns current async import status/result for one job.
func (h *TransactionHandler) GetImportJob(w http.ResponseWriter, r *http.Request) {
	user, ok := MustCurrentUser(w, r)
	if !ok {
		return
	}
	if h.importJobs == nil {
		WriteError(w, http.StatusInternalServerError, "import jobs unavailable")
		return
	}

	jobID, ok := GetPathID(r, "jobID")
	if !ok {
		WriteError(w, http.StatusBadRequest, "invalid job id")
		return
	}

	ctx, cancel := context.WithTimeout(r.Context(), h.queryTimeout)
	defer cancel()

	dto, err := h.importJobs.FindByID(ctx, user.ID, jobID)
	if errors.Is(err, domain.ErrNotFound) {
		WriteError(w, http.StatusNotFound, "import job not found")
		return
	}
	if err != nil {
		slog.Error("getImportJob failed", "error", err, "userID", user.ID, "jobID", jobID)
		WriteError(w, http.StatusInternalServerError, "could not fetch import job")
		return
	}

	WriteJSON(w, http.StatusOK, dto)
}

// UndoImportBatch removes transactions from a previously imported batch.
func (h *TransactionHandler) UndoImportBatch(w http.ResponseWriter, r *http.Request) {
	user, ok := MustCurrentUser(w, r)
	if !ok {
		return
	}

	batchID, ok := GetPathID(r, "batchID")
	if !ok {
		WriteError(w, http.StatusBadRequest, "invalid batch id")
		return
	}

	ctx, cancel := context.WithTimeout(r.Context(), h.queryTimeout)
	defer cancel()

	deleted, err := h.transactions.DeleteByImportBatch(ctx, user.ID, batchID)
	if err != nil {
		slog.Error("undoImportBatch failed", "error", err, "userID", user.ID, "batchID", batchID)
		WriteError(w, http.StatusInternalServerError, "could not undo import batch")
		return
	}
	if deleted == 0 {
		WriteError(w, http.StatusNotFound, "import batch not found or already reverted")
		return
	}

	WriteJSON(w, http.StatusOK, map[string]any{
		"deleted": deleted,
		"batchId": batchID,
		"message": fmt.Sprintf("%d movimentações removidas do lote", deleted),
	})
}

func (h *TransactionHandler) runImportJob(userID, jobID, batchID string, files []domain.TransactionImportFilePayload) {
	ctx := context.Background()
	if err := h.importJobs.MarkRunning(ctx, userID, jobID); err != nil {
		slog.Error("markImportJobRunning failed", "error", err, "userID", userID, "jobID", jobID)
		return
	}

	result := domain.TransactionImportResult{}
	for _, file := range files {
		result.Total += len(file.Items)
	}
	fileResults := buildInitialFileResults(files)

	flushProgress := func() {
		if err := h.importJobs.UpdateProgress(ctx, userID, jobID, result, fileResults); err != nil {
			slog.Warn("updateImportJobProgress failed", "error", err, "userID", userID, "jobID", jobID)
		}
	}

	for fileIdx, file := range files {
		for rowIdx, item := range file.Items {
			dateValue, recurrenceEnd, normalized, err := domain.ValidateTransactionPayload(item)
			fileResults[fileIdx].Processed++

			if err != nil {
				result.Invalid++
				fileResults[fileIdx].Invalid++
				if (result.Imported+result.Duplicates+result.Invalid+result.Failed)%25 == 0 {
					flushProgress()
				}
				continue
			}

			result.Valid++
			dedupeKey := domain.TransactionDedupeKey(dateValue, normalized.Description, normalized.Amount, normalized.Recurrence, normalized.Installments)
			meta := &domain.TransactionImportMetadata{
				BatchID:  batchID,
				JobID:    jobID,
				FileName: file.Name,
				RowIndex: rowIdx + 1,
			}

			imported, err := h.transactions.CreateImported(ctx, userID, dateValue, recurrenceEnd, normalized, dedupeKey, meta)
			if err != nil {
				var validationErr *domain.ValidationError
				if errors.As(err, &validationErr) {
					result.Invalid++
					fileResults[fileIdx].Invalid++
					continue
				}

				result.Failed++
				fileResults[fileIdx].Failed++
				errorMessage := fmt.Sprintf("erro na linha %d do arquivo %s: %v", rowIdx+1, file.Name, err)
				slog.Error("importJob failed", "error", err, "userID", userID, "jobID", jobID, "file", file.Name, "rowIndex", rowIdx+1)
				flushProgress()
				_ = h.importJobs.Complete(ctx, userID, jobID, "failed", result, fileResults, errorMessage)
				return
			}

			if imported {
				result.Imported++
				fileResults[fileIdx].Imported++
			} else {
				result.Duplicates++
				fileResults[fileIdx].Duplicates++
			}

			if (result.Imported+result.Duplicates+result.Invalid+result.Failed)%25 == 0 {
				flushProgress()
			}
		}
	}

	flushProgress()
	if err := h.importJobs.Complete(ctx, userID, jobID, "completed", result, fileResults, ""); err != nil {
		slog.Error("completeImportJob failed", "error", err, "userID", userID, "jobID", jobID)
		return
	}
	slog.Info("importJob completed", "userID", userID, "jobID", jobID, "batchID", batchID, "total", result.Total, "imported", result.Imported, "duplicates", result.Duplicates, "invalid", result.Invalid, "failed", result.Failed)
}

func normalizeImportFiles(files []domain.TransactionImportFilePayload) []domain.TransactionImportFilePayload {
	out := make([]domain.TransactionImportFilePayload, 0, len(files))
	for i, file := range files {
		name := domain.NormalizeString(file.Name)
		if name == "" {
			name = fmt.Sprintf("arquivo-%d.csv", i+1)
		}
		items := make([]domain.TransactionPayload, 0, len(file.Items))
		for _, item := range file.Items {
			if strings.TrimSpace(item.Date) == "" && strings.TrimSpace(item.Description) == "" && item.Amount == 0 {
				continue
			}
			items = append(items, item)
		}
		if len(items) == 0 {
			continue
		}
		out = append(out, domain.TransactionImportFilePayload{
			Name:  name,
			Items: items,
		})
	}
	return out
}

func buildInitialFileResults(files []domain.TransactionImportFilePayload) []domain.TransactionImportFileResult {
	results := make([]domain.TransactionImportFileResult, 0, len(files))
	for _, file := range files {
		results = append(results, domain.TransactionImportFileResult{
			Name:  file.Name,
			Total: len(file.Items),
		})
	}
	return results
}
