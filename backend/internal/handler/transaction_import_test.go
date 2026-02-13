package handler

import (
	"bytes"
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"

	"gestao/backend/internal/domain"
)

type mockTransactionStore struct {
	createImportedFn func(ctx context.Context, userID string, dateValue time.Time, recurrenceEnd *time.Time, p domain.TransactionPayload, dedupeKey string, meta *domain.TransactionImportMetadata) (bool, error)
}

func (m *mockTransactionStore) List(ctx context.Context, userID, month string, limit, offset int) ([]domain.TransactionDTO, int, error) {
	return nil, 0, nil
}

func (m *mockTransactionStore) FindByID(ctx context.Context, id, userID string) (domain.TransactionDTO, error) {
	return domain.TransactionDTO{}, nil
}

func (m *mockTransactionStore) Create(ctx context.Context, userID string, dateValue time.Time, recurrenceEnd *time.Time, p domain.TransactionPayload) (domain.TransactionDTO, error) {
	return domain.TransactionDTO{}, nil
}

func (m *mockTransactionStore) CreateImported(ctx context.Context, userID string, dateValue time.Time, recurrenceEnd *time.Time, p domain.TransactionPayload, dedupeKey string, meta *domain.TransactionImportMetadata) (bool, error) {
	return m.createImportedFn(ctx, userID, dateValue, recurrenceEnd, p, dedupeKey, meta)
}

func (m *mockTransactionStore) Update(ctx context.Context, id, userID string, dateValue time.Time, recurrenceEnd *time.Time, p domain.TransactionPayload) (domain.TransactionDTO, error) {
	return domain.TransactionDTO{}, nil
}

func (m *mockTransactionStore) Delete(ctx context.Context, id, userID string) error { return nil }

func (m *mockTransactionStore) DeleteAll(ctx context.Context, userID string) (int64, error) {
	return 0, nil
}

func (m *mockTransactionStore) DeleteByImportBatch(ctx context.Context, userID, batchID string) (int64, error) {
	return 0, nil
}

func TestTransactionImportSummary(t *testing.T) {
	call := 0
	store := &mockTransactionStore{
		createImportedFn: func(ctx context.Context, userID string, dateValue time.Time, recurrenceEnd *time.Time, p domain.TransactionPayload, dedupeKey string, meta *domain.TransactionImportMetadata) (bool, error) {
			call++
			if call == 1 {
				return true, nil
			}
			return false, nil
		},
	}
	h := NewTransactionHandler(store, nil, 2*time.Second)

	payload := domain.TransactionImportPayload{
		Items: []domain.TransactionPayload{
			{Date: "2026-02-10", Type: "despesa", Category: "Fatura", Method: "transferencia", Description: "Pagamento de fatura", Amount: 1662.99},
			{Date: "2026-02-10", Type: "despesa", Category: "Fatura", Method: "transferencia", Description: "Pagamento de fatura", Amount: 1662.99},
			{Date: "2026-02-10", Type: "despesa", Category: "Lazer", Method: "pix", Description: "", Amount: 20},
		},
	}
	body, err := json.Marshal(payload)
	if err != nil {
		t.Fatalf("marshal payload: %v", err)
	}

	req := httptest.NewRequest(http.MethodPost, "/api/transactions/import", bytes.NewReader(body))
	req = req.WithContext(context.WithValue(req.Context(), domain.CurrentUserKey, domain.CurrentUser{
		ID:    "user-1",
		Name:  "User",
		Email: "user@example.com",
	}))
	w := httptest.NewRecorder()

	h.Import(w, req)
	if w.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d with body %s", w.Code, w.Body.String())
	}

	var got domain.TransactionImportResult
	if err := json.NewDecoder(w.Body).Decode(&got); err != nil {
		t.Fatalf("decode response: %v", err)
	}
	if got.Total != 3 || got.Valid != 2 || got.Imported != 1 || got.Duplicates != 1 || got.Invalid != 1 {
		t.Fatalf("unexpected result: %+v", got)
	}
}

func TestTransactionImportRejectsTooManyRows(t *testing.T) {
	items := make([]domain.TransactionPayload, 5001)
	for i := range items {
		items[i] = domain.TransactionPayload{
			Date: "2026-02-10", Type: "despesa", Category: "Outros", Method: "pix", Description: "Linha", Amount: 1,
		}
	}
	payload := domain.TransactionImportPayload{Items: items}
	body, err := json.Marshal(payload)
	if err != nil {
		t.Fatalf("marshal payload: %v", err)
	}

	h := NewTransactionHandler(&mockTransactionStore{
		createImportedFn: func(ctx context.Context, userID string, dateValue time.Time, recurrenceEnd *time.Time, p domain.TransactionPayload, dedupeKey string, meta *domain.TransactionImportMetadata) (bool, error) {
			return true, nil
		},
	}, nil, 2*time.Second)

	req := httptest.NewRequest(http.MethodPost, "/api/transactions/import", bytes.NewReader(body))
	req = req.WithContext(context.WithValue(req.Context(), domain.CurrentUserKey, domain.CurrentUser{
		ID:    "user-1",
		Name:  "User",
		Email: "user@example.com",
	}))
	w := httptest.NewRecorder()

	h.Import(w, req)
	if w.Code != http.StatusBadRequest {
		t.Fatalf("expected 400, got %d", w.Code)
	}
}
