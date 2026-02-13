package domain

import (
	"crypto/rand"
	"fmt"
	"net/mail"
	"strings"
	"time"
)

// ── Allowed values ───────────────────────────────────────────

var allowedTransactionTypes = map[string]struct{}{
	"receita":       {},
	"despesa":       {},
	"investimento":  {},
	"transferencia": {},
}

var allowedRecurrenceTypes = map[string]struct{}{
	"none":    {},
	"monthly": {},
}

var allowedCategoryTypes = map[string]struct{}{
	"receita":      {},
	"despesa":      {},
	"investimento": {},
	"todas":        {},
}

var allowedAccountTypes = map[string]struct{}{
	"corrente":     {},
	"poupanca":     {},
	"carteira":     {},
	"investimento": {},
	"credito":      {},
}

// ── String helpers ───────────────────────────────────────────

// NormalizeString trims and collapses whitespace.
func NormalizeString(value string) string {
	return strings.TrimSpace(strings.Join(strings.Fields(value), " "))
}

// NormalizeLower normalises and lowercases.
func NormalizeLower(value string) string {
	return strings.ToLower(NormalizeString(value))
}

// IsValidEmail validates that value is a bare email address (no display name).
func IsValidEmail(value string) bool {
	if value == "" {
		return false
	}
	addr, err := mail.ParseAddress(value)
	if err != nil {
		return false
	}
	return addr.Address == value
}

// MustUUID generates a UUID v4 using crypto/rand.
// Panics if the system CSPRNG is unavailable — this should never happen.
func MustUUID() string {
	var raw [16]byte
	if _, err := rand.Read(raw[:]); err != nil {
		panic("crypto/rand unavailable: " + err.Error())
	}
	raw[6] = (raw[6] & 0x0f) | 0x40 // version 4
	raw[8] = (raw[8] & 0x3f) | 0x80 // variant RFC 4122
	return fmt.Sprintf(
		"%x-%x-%x-%x-%x",
		raw[0:4], raw[4:6], raw[6:8], raw[8:10], raw[10:16],
	)
}

// ── Payload validators ───────────────────────────────────────

// ValidateTransactionPayload validates and normalises a transaction payload.
// Returns the parsed date, optional recurrence end date, the normalised payload, and an error.
func ValidateTransactionPayload(p TransactionPayload) (time.Time, *time.Time, TransactionPayload, error) {
	n := TransactionPayload{
		ID:                    NormalizeString(p.ID),
		Date:                  NormalizeString(p.Date),
		Type:                  NormalizeLower(p.Type),
		Category:              NormalizeString(p.Category),
		Method:                NormalizeLower(p.Method),
		Description:           NormalizeString(p.Description),
		Amount:                p.Amount,
		Recurrence:            NormalizeLower(p.Recurrence),
		RecurrenceEnd:         NormalizeString(p.RecurrenceEnd),
		Installments:          p.Installments,
		AccountID:             NormalizeString(p.AccountID),
		TransferDirection:     NormalizeTransferDirection(p.TransferDirection),
		TransferCounterparty:  NormalizeString(p.TransferCounterparty),
		TransferGroupID:       NormalizeString(p.TransferGroupID),
		TransferFromAccountID: NormalizeString(p.TransferFromAccountID),
		TransferToAccountID:   NormalizeString(p.TransferToAccountID),
	}

	if n.Date == "" {
		return time.Time{}, nil, TransactionPayload{}, NewValidationError("date is required")
	}
	dateValue, err := time.Parse("2006-01-02", n.Date)
	if err != nil {
		return time.Time{}, nil, TransactionPayload{}, NewValidationError("date must use YYYY-MM-DD")
	}

	if _, ok := allowedTransactionTypes[n.Type]; !ok {
		return time.Time{}, nil, TransactionPayload{}, NewValidationError("type must be receita, despesa, investimento or transferencia")
	}
	if n.Category == "" {
		return time.Time{}, nil, TransactionPayload{}, NewValidationError("category is required")
	}
	if n.Method == "" {
		return time.Time{}, nil, TransactionPayload{}, NewValidationError("method is required")
	}
	if n.Description == "" {
		return time.Time{}, nil, TransactionPayload{}, NewValidationError("description is required")
	}
	if n.Amount <= 0 {
		return time.Time{}, nil, TransactionPayload{}, NewValidationError("amount must be greater than 0")
	}

	if n.Recurrence == "" {
		n.Recurrence = "none"
	}
	if _, ok := allowedRecurrenceTypes[n.Recurrence]; !ok {
		return time.Time{}, nil, TransactionPayload{}, NewValidationError("recurrence must be none or monthly")
	}

	var recurrenceEnd *time.Time
	if n.RecurrenceEnd != "" {
		v, err := time.Parse("2006-01-02", n.RecurrenceEnd)
		if err != nil {
			return time.Time{}, nil, TransactionPayload{}, NewValidationError("recurrenceEnd must use YYYY-MM-DD")
		}
		recurrenceEnd = &v
	}

	if n.Installments < 0 {
		return time.Time{}, nil, TransactionPayload{}, NewValidationError("installments must be non-negative")
	}
	if n.Recurrence == "monthly" && n.Installments > 0 {
		return time.Time{}, nil, TransactionPayload{}, NewValidationError("recurrence and installments are mutually exclusive")
	}

	if NormalizeString(p.TransferDirection) != "" && n.TransferDirection == "" {
		return time.Time{}, nil, TransactionPayload{}, NewValidationError("transferDirection must be in or out")
	}
	if n.TransferDirection == "" {
		if n.TransferFromAccountID != "" && n.TransferToAccountID == "" {
			n.TransferDirection = "out"
		} else if n.TransferToAccountID != "" && n.TransferFromAccountID == "" {
			n.TransferDirection = "in"
		}
	}
	if n.TransferDirection == "out" && n.TransferFromAccountID == "" && n.AccountID != "" {
		n.TransferFromAccountID = n.AccountID
	}
	if n.TransferDirection == "in" && n.TransferToAccountID == "" && n.AccountID != "" {
		n.TransferToAccountID = n.AccountID
	}
	if n.TransferFromAccountID != "" && n.TransferToAccountID != "" && n.TransferFromAccountID == n.TransferToAccountID {
		return time.Time{}, nil, TransactionPayload{}, NewValidationError("transferFromAccountId and transferToAccountId must be different")
	}

	return dateValue, recurrenceEnd, n, nil
}

// ValidateBudgetPayload validates and normalises a budget payload.
func ValidateBudgetPayload(p BudgetPayload) (BudgetPayload, error) {
	n := BudgetPayload{
		ID:       NormalizeString(p.ID),
		Category: NormalizeString(p.Category),
		Limit:    p.Limit,
	}
	if n.Category == "" {
		return BudgetPayload{}, NewValidationError("category is required")
	}
	if n.Limit <= 0 {
		return BudgetPayload{}, NewValidationError("limit must be greater than 0")
	}
	return n, nil
}

// ValidateGoalPayload validates and normalises a goal payload.
func ValidateGoalPayload(p GoalPayload) (GoalPayload, *time.Time, error) {
	n := GoalPayload{
		ID:      NormalizeString(p.ID),
		Name:    NormalizeString(p.Name),
		Target:  p.Target,
		Current: p.Current,
		DueDate: NormalizeString(p.DueDate),
	}

	if n.Name == "" {
		return GoalPayload{}, nil, NewValidationError("name is required")
	}
	if n.Target <= 0 {
		return GoalPayload{}, nil, NewValidationError("target must be greater than 0")
	}
	if n.Current < 0 {
		return GoalPayload{}, nil, NewValidationError("current must be non-negative")
	}

	var dueDate *time.Time
	if n.DueDate != "" {
		v, err := time.Parse("2006-01-02", n.DueDate)
		if err != nil {
			return GoalPayload{}, nil, NewValidationError("dueDate must use YYYY-MM-DD")
		}
		dueDate = &v
	}

	return n, dueDate, nil
}

// ValidateProjectionPayload validates and normalises a projection payload.
func ValidateProjectionPayload(p ProjectionPayload) (ProjectionPayload, error) {
	n := ProjectionPayload{
		Months:     p.Months,
		Income:     p.Income,
		Expense:    p.Expense,
		Investment: p.Investment,
	}

	if n.Months < 1 || n.Months > 24 {
		return ProjectionPayload{}, NewValidationError("months must be between 1 and 24")
	}
	if n.Income != nil && *n.Income < 0 {
		return ProjectionPayload{}, NewValidationError("income cannot be negative")
	}
	if n.Expense != nil && *n.Expense < 0 {
		return ProjectionPayload{}, NewValidationError("expense cannot be negative")
	}
	if n.Investment != nil && *n.Investment < 0 {
		return ProjectionPayload{}, NewValidationError("investment cannot be negative")
	}

	return n, nil
}

// ValidateCategoryPayload validates and normalises a category payload.
func ValidateCategoryPayload(p CategoryPayload) (CategoryPayload, error) {
	n := CategoryPayload{
		ID:   NormalizeString(p.ID),
		Name: NormalizeString(p.Name),
		Type: NormalizeLower(p.Type),
		Icon: NormalizeString(p.Icon),
	}
	if n.Name == "" {
		return CategoryPayload{}, NewValidationError("name is required")
	}
	if _, ok := allowedCategoryTypes[n.Type]; !ok {
		return CategoryPayload{}, NewValidationError("type must be receita, despesa, investimento or todas")
	}
	if n.Icon == "" {
		n.Icon = "📁"
	}
	return n, nil
}

// ValidateAccountPayload validates and normalises an account payload.
func ValidateAccountPayload(p AccountPayload) (AccountPayload, error) {
	n := AccountPayload{
		ID:             NormalizeString(p.ID),
		Name:           NormalizeString(p.Name),
		Type:           NormalizeLower(p.Type),
		Color:          NormalizeString(p.Color),
		InitialBalance: p.InitialBalance,
	}
	if n.Name == "" {
		return AccountPayload{}, NewValidationError("name is required")
	}
	if _, ok := allowedAccountTypes[n.Type]; !ok {
		return AccountPayload{}, NewValidationError("type must be corrente, poupanca, carteira, investimento or credito")
	}
	if n.InitialBalance < 0 {
		return AccountPayload{}, NewValidationError("initialBalance cannot be negative")
	}
	if n.Color == "" {
		n.Color = "#5e7fff"
	}
	return n, nil
}
