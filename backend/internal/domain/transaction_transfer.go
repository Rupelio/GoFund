package domain

import (
	"math"
	"strings"
)

var transferAccentReplacer = strings.NewReplacer(
	"á", "a", "à", "a", "â", "a", "ã", "a", "ä", "a",
	"é", "e", "è", "e", "ê", "e", "ë", "e",
	"í", "i", "ì", "i", "î", "i", "ï", "i",
	"ó", "o", "ò", "o", "ô", "o", "õ", "o", "ö", "o",
	"ú", "u", "ù", "u", "û", "u", "ü", "u",
	"ç", "c",
)

func normalizeASCII(value string) string {
	return transferAccentReplacer.Replace(NormalizeLower(value))
}

// NormalizeTransferDirection returns "in", "out", or empty.
func NormalizeTransferDirection(value string) string {
	switch normalizeASCII(value) {
	case "in", "entrada", "recebida", "recebido":
		return "in"
	case "out", "saida", "enviada", "enviado":
		return "out"
	default:
		return ""
	}
}

func isTransferCategory(value string) bool {
	return normalizeASCII(value) == "transferencia"
}

// IsTransferLikeDTO identifies transfer-like rows that should not inflate cash KPIs.
func IsTransferLikeDTO(t TransactionDTO) bool {
	if normalizeASCII(t.Type) == "transferencia" {
		return true
	}
	if isTransferCategory(t.Category) {
		return true
	}
	if NormalizeTransferDirection(t.TransferDirection) != "" {
		return true
	}
	if NormalizeString(t.TransferCounterparty) != "" {
		return true
	}
	if NormalizeString(t.TransferFromAccountID) != "" || NormalizeString(t.TransferToAccountID) != "" {
		return true
	}
	return false
}

// IsCashAffectingDTO indicates if transaction should affect cash KPIs.
func IsCashAffectingDTO(t TransactionDTO) bool {
	typ := normalizeASCII(t.Type)
	if typ != "receita" && typ != "despesa" && typ != "investimento" {
		return false
	}
	if normalizeASCII(t.Method) == "credito" {
		return false
	}
	return !IsTransferLikeDTO(t)
}

// ToCents converts money to integer cents to avoid float drift in aggregates.
func ToCents(amount float64) int64 {
	return int64(math.Round(amount * 100))
}

// FromCents converts integer cents to float with 2 decimal precision.
func FromCents(cents int64) float64 {
	return float64(cents) / 100
}
