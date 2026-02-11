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
	transactions *postgres.TransactionRepo
	queryTimeout time.Duration
}

func NewAccountHandler(accRepo *postgres.AccountRepo, txnRepo *postgres.TransactionRepo, timeout time.Duration) *AccountHandler {
	return &AccountHandler{accounts: accRepo, transactions: txnRepo, queryTimeout: timeout}
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

	if err := h.syncInitialBalanceTransaction(ctx, user.ID, dto.ID, normalized.InitialBalance); err != nil {
		slog.Warn("createAccount: sync initial balance transaction failed", "error", err, "accountID", dto.ID)
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

	if err := h.syncInitialBalanceTransaction(ctx, user.ID, dto.ID, normalized.InitialBalance); err != nil {
		slog.Warn("updateAccount: sync initial balance transaction failed", "error", err, "accountID", dto.ID)
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

func (h *AccountHandler) syncInitialBalanceTransaction(ctx context.Context, userID, accountID string, initialBalance float64) error {
	initialTxn, err := h.transactions.FindInitialBalanceByAccount(ctx, userID, accountID)
	hasInitialTxn := err == nil
	if err != nil && !errors.Is(err, domain.ErrNotFound) {
		return err
	}

	if initialBalance <= 0 {
		if hasInitialTxn {
			return h.transactions.Delete(ctx, initialTxn.ID, userID)
		}
		return nil
	}

	if hasInitialTxn {
		dateValue, parseErr := time.Parse("2006-01-02", initialTxn.Date)
		if parseErr != nil {
			dateValue = time.Now()
		}

		method := initialTxn.Method
		if method == "" || method == "outros" {
			method = "transferencia"
		}
		category := initialTxn.Category
		if category == "" {
			category = "Outros"
		}

		payload := domain.TransactionPayload{
			Date:         dateValue.Format("2006-01-02"),
			Type:         "receita",
			Category:     category,
			Method:       method,
			Description:  "Saldo inicial",
			Amount:       initialBalance,
			Recurrence:   "none",
			Installments: 0,
			AccountID:    accountID,
		}
		_, updateErr := h.transactions.Update(ctx, initialTxn.ID, userID, dateValue, nil, payload)
		return updateErr
	}

	now := time.Now()
	payload := domain.TransactionPayload{
		Date:         now.Format("2006-01-02"),
		Type:         "receita",
		Category:     "Outros",
		Method:       "transferencia",
		Description:  "Saldo inicial",
		Amount:       initialBalance,
		Recurrence:   "none",
		Installments: 0,
		AccountID:    accountID,
	}
	_, createErr := h.transactions.Create(ctx, userID, now, nil, payload)
	return createErr
}
