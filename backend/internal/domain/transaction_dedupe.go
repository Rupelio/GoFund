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
func TransactionDedupeKey(dateValue time.Time, description string, amount float64) string {
	base := fmt.Sprintf(
		"%s|%s|%d",
		dateValue.Format("2006-01-02"),
		normalizeDescriptionForDedupe(description),
		amountToCents(amount),
	)
	sum := sha256.Sum256([]byte(base))
	return hex.EncodeToString(sum[:])
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
