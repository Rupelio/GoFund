package domain

import (
	"testing"
	"time"
)

func TestTransactionDedupeKey_NormalizesFormatting(t *testing.T) {
	dateValue := time.Date(2026, time.February, 10, 0, 0, 0, 0, time.UTC)
	left := TransactionDedupeKey(dateValue, "PAGAMENTO   DE FATURA!!!", -1662.99)
	right := TransactionDedupeKey(dateValue, "pagamento de fátura", 1662.99)
	if left != right {
		t.Fatalf("expected equal dedupe keys, got %q and %q", left, right)
	}
}

func TestTransactionDedupeKey_ChangesWithCoreFields(t *testing.T) {
	dateA := time.Date(2026, time.February, 10, 0, 0, 0, 0, time.UTC)
	dateB := time.Date(2026, time.February, 11, 0, 0, 0, 0, time.UTC)
	base := TransactionDedupeKey(dateA, "Uber viagem", 52.30)
	diffDate := TransactionDedupeKey(dateB, "Uber viagem", 52.30)
	diffAmount := TransactionDedupeKey(dateA, "Uber viagem", 53.30)
	if base == diffDate {
		t.Fatalf("expected different keys for different dates")
	}
	if base == diffAmount {
		t.Fatalf("expected different keys for different amounts")
	}
}
