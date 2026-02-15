package domain

import (
	"testing"
	"time"
)

func TestTransactionDedupeKey_NormalizesFormatting(t *testing.T) {
	dateValue := time.Date(2026, time.February, 10, 0, 0, 0, 0, time.UTC)
	left := TransactionDedupeKey(dateValue, "PAGAMENTO   DE FATURA!!!", -1662.99, "none", 0, "")
	right := TransactionDedupeKey(dateValue, "pagamento de fatura", 1662.99, "none", 0, "")
	if left != right {
		t.Fatalf("expected equal dedupe keys, got %q and %q", left, right)
	}
}

func TestTransactionDedupeKey_ChangesWithCoreFields(t *testing.T) {
	dateA := time.Date(2026, time.February, 10, 0, 0, 0, 0, time.UTC)
	dateB := time.Date(2026, time.February, 11, 0, 0, 0, 0, time.UTC)
	base := TransactionDedupeKey(dateA, "Uber viagem", 52.30, "none", 0, "")
	diffDate := TransactionDedupeKey(dateB, "Uber viagem", 52.30, "none", 0, "")
	diffAmount := TransactionDedupeKey(dateA, "Uber viagem", 53.30, "none", 0, "")
	if base == diffDate {
		t.Fatalf("expected different keys for different dates")
	}
	if base == diffAmount {
		t.Fatalf("expected different keys for different amounts")
	}
}

func TestTransactionDedupeKey_RecurringIgnoresDate(t *testing.T) {
	dateA := time.Date(2026, time.January, 5, 0, 0, 0, 0, time.UTC)
	dateB := time.Date(2026, time.February, 5, 0, 0, 0, 0, time.UTC)
	keyA := TransactionDedupeKey(dateA, "Salario", 5000.00, "monthly", 0, "")
	keyB := TransactionDedupeKey(dateB, "Salario", 5000.00, "monthly", 0, "")
	if keyA != keyB {
		t.Fatalf("expected same dedupe key for recurring tx in different months, got %q and %q", keyA, keyB)
	}
	keyC := TransactionDedupeKey(dateA, "Salario", 5000.00, "none", 0, "")
	if keyA == keyC {
		t.Fatalf("recurring and non-recurring should have different keys")
	}
}

func TestTransactionDedupeKey_InstallmentsIgnoresDate(t *testing.T) {
	dateA := time.Date(2026, time.January, 1, 0, 0, 0, 0, time.UTC)
	dateB := time.Date(2026, time.February, 1, 0, 0, 0, 0, time.UTC)
	keyA := TransactionDedupeKey(dateA, "Pag*Steam - Parcela 2/3", 35.53, "none", 3, "")
	keyB := TransactionDedupeKey(dateB, "Pag*Steam - Parcela 3/3", 35.53, "none", 3, "")
	if keyA != keyB {
		t.Fatalf("expected same dedupe key for installments of same purchase, got %q and %q", keyA, keyB)
	}
}

func TestTransactionDedupeKey_SubscriptionIgnoresDate(t *testing.T) {
	dateA := time.Date(2026, time.January, 17, 0, 0, 0, 0, time.UTC)
	dateB := time.Date(2026, time.February, 17, 0, 0, 0, 0, time.UTC)
	keyA := TransactionDedupeKey(dateA, "Netflix.Com", 20.90, "monthly", 0, "")
	keyB := TransactionDedupeKey(dateB, "Netflix.Com", 20.90, "monthly", 0, "")
	if keyA != keyB {
		t.Fatalf("expected same dedupe key for monthly subscription in different months, got %q and %q", keyA, keyB)
	}
}

func TestTransactionDedupeKey_UsesExternalIDWhenPresent(t *testing.T) {
	dateA := time.Date(2026, time.January, 1, 0, 0, 0, 0, time.UTC)
	dateB := time.Date(2026, time.February, 1, 0, 0, 0, 0, time.UTC)

	keyA := TransactionDedupeKey(dateA, "Venda credito", 99.90, "none", 0, "TX-ABC-123")
	keyB := TransactionDedupeKey(dateB, "Pix enviado", 10.00, "none", 0, "tx-abc-123")
	if keyA != keyB {
		t.Fatalf("expected same dedupe key for same external id")
	}

	keyC := TransactionDedupeKey(dateA, "Venda credito", 99.90, "none", 0, "TX-XYZ-999")
	if keyA == keyC {
		t.Fatalf("expected different dedupe keys for different external ids")
	}
}

