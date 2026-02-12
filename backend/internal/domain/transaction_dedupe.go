package domain

import (
	"crypto/sha256"
	"encoding/hex"
	"fmt"
	"math"
	"regexp"
	"strings"
	"time"
	"unicode"
)

var fingerprintSpaces = regexp.MustCompile(`\s+`)

// TransactionDedupeKey returns a stable hash used for idempotent CSV imports.
// The key intentionally ignores accents, punctuation and sign-only amount differences.
//
// Dedup strategy varies by transaction kind:
//   - Installments (installments > 1): fully dateless key with installment suffix stripped.
//     "Parcela 2/3" and "Parcela 3/3" of the same purchase share one key.
//   - Recurring monthly: uses YYYY-MM (month) instead of full date.
//     Salary Jan ≠ Salary Feb, but two imports of Salary Feb = duplicate.
//   - One-time: uses full YYYY-MM-DD date.
func TransactionDedupeKey(dateValue time.Time, description string, amount float64, recurrence string, installments int) string {
	normDesc := normalizeDescriptionForDedupe(description)
	var base string
	if installments > 1 {
		// Fully dateless — all installments of the same purchase share one key.
		clean := stripInstallmentSuffix(normDesc)
		base = fmt.Sprintf("installment|%s|%d", clean, amountToCents(amount))
	} else if recurrence == "monthly" {
		// Month-based — same subscription/salary in the same month = duplicate,
		// but different months are allowed through.
		base = fmt.Sprintf("monthly|%s|%s|%d", dateValue.Format("2006-01"), normDesc, amountToCents(amount))
	} else {
		base = fmt.Sprintf("%s|%s|%d", dateValue.Format("2006-01-02"), normDesc, amountToCents(amount))
	}
	sum := sha256.Sum256([]byte(base))
	return hex.EncodeToString(sum[:])
}

var installmentSuffixRe = regexp.MustCompile(`\s+parcela\s+\d+\s+\d+\s*$`)
var trailingFractionRe = regexp.MustCompile(`\s+\d+\s+\d+\s*$`)

func stripInstallmentSuffix(desc string) string {
	d := installmentSuffixRe.ReplaceAllString(desc, "")
	if d != desc {
		return strings.TrimSpace(d)
	}
	d = trailingFractionRe.ReplaceAllString(desc, "")
	return strings.TrimSpace(d)
}

func normalizeDescriptionForDedupe(value string) string {
	v := strings.TrimSpace(strings.ToLower(value))
	if v == "" {
		return ""
	}

	var b strings.Builder
	for _, r := range v {
		switch {
		case unicode.IsLetter(r) || unicode.IsNumber(r):
			b.WriteRune(removeAccent(r))
		case unicode.IsSpace(r):
			b.WriteRune(' ')
		default:
			b.WriteRune(' ')
		}
	}

	return strings.TrimSpace(fingerprintSpaces.ReplaceAllString(b.String(), " "))
}

func removeAccent(r rune) rune {
	switch r {
	case 'á', 'à', 'â', 'ã', 'ä':
		return 'a'
	case 'é', 'è', 'ê', 'ë':
		return 'e'
	case 'í', 'ì', 'î', 'ï':
		return 'i'
	case 'ó', 'ò', 'ô', 'õ', 'ö':
		return 'o'
	case 'ú', 'ù', 'û', 'ü':
		return 'u'
	case 'ç':
		return 'c'
	default:
		return r
	}
}

func amountToCents(amount float64) int64 {
	return int64(math.Round(math.Abs(amount) * 100))
}
