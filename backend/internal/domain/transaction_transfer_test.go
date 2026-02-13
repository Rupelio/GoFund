package domain

import "testing"

func TestValidateTransactionPayload_NormalizesTransferDirectionAndAccounts(t *testing.T) {
	_, _, normalized, err := ValidateTransactionPayload(TransactionPayload{
		Date:              "2026-02-13",
		Type:              "transferencia",
		Category:          "Transferência",
		Method:            "pix",
		Description:       "Transferência recebida",
		Amount:            100,
		Recurrence:        "none",
		Installments:      0,
		AccountID:         "acc-1",
		TransferDirection: "entrada",
	})
	if err != nil {
		t.Fatalf("expected no error, got %v", err)
	}
	if normalized.TransferDirection != "in" {
		t.Fatalf("expected direction in, got %q", normalized.TransferDirection)
	}
	if normalized.TransferToAccountID != "acc-1" {
		t.Fatalf("expected transferToAccountId acc-1, got %q", normalized.TransferToAccountID)
	}
}

func TestValidateTransactionPayload_RejectsInvalidTransferDirection(t *testing.T) {
	_, _, _, err := ValidateTransactionPayload(TransactionPayload{
		Date:              "2026-02-13",
		Type:              "despesa",
		Category:          "Outros",
		Method:            "pix",
		Description:       "Teste",
		Amount:            100,
		Recurrence:        "none",
		Installments:      0,
		TransferDirection: "lado",
	})
	if err == nil {
		t.Fatal("expected validation error for transferDirection")
	}
}

func TestValidateTransactionPayload_RejectsSameTransferAccounts(t *testing.T) {
	_, _, _, err := ValidateTransactionPayload(TransactionPayload{
		Date:                  "2026-02-13",
		Type:                  "transferencia",
		Category:              "Transferência",
		Method:                "pix",
		Description:           "Teste",
		Amount:                100,
		Recurrence:            "none",
		Installments:          0,
		TransferFromAccountID: "acc-1",
		TransferToAccountID:   "acc-1",
	})
	if err == nil {
		t.Fatal("expected validation error for same transfer accounts")
	}
}

func TestIsTransferLikeAndCashAffectingDTO(t *testing.T) {
	transferLike := TransactionDTO{
		Type:     "despesa",
		Category: "Transferência",
		Method:   "pix",
		Amount:   120,
	}
	if !IsTransferLikeDTO(transferLike) {
		t.Fatal("expected transfer-like transaction")
	}
	if IsCashAffectingDTO(transferLike) {
		t.Fatal("expected transfer-like transaction to be cash-neutral")
	}

	regular := TransactionDTO{
		Type:     "despesa",
		Category: "Moradia",
		Method:   "pix",
		Amount:   350,
	}
	if IsTransferLikeDTO(regular) {
		t.Fatal("did not expect regular transaction to be transfer-like")
	}
	if !IsCashAffectingDTO(regular) {
		t.Fatal("expected regular transaction to affect cash")
	}
}
