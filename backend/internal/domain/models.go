package domain

import "time"

// ── User ─────────────────────────────────────────────────────

type UserDTO struct {
	ID        string `json:"id"`
	Name      string `json:"name"`
	Email     string `json:"email"`
	CreatedAt string `json:"createdAt,omitempty"`
	UpdatedAt string `json:"updatedAt,omitempty"`
}

type AuthPayload struct {
	Name     string `json:"name"`
	Email    string `json:"email"`
	Password string `json:"password"`
}

type AuthResponse struct {
	Token string  `json:"token"`
	User  UserDTO `json:"user"`
}

type ChangePasswordPayload struct {
	CurrentPassword string `json:"currentPassword"`
	NewPassword     string `json:"newPassword"`
}

// ── Transaction ──────────────────────────────────────────────

type TransactionPayload struct {
	ID            string  `json:"id,omitempty"`
	Date          string  `json:"date"`
	Type          string  `json:"type"`
	Category      string  `json:"category"`
	Method        string  `json:"method"`
	Description   string  `json:"description"`
	Amount        float64 `json:"amount"`
	Recurrence    string  `json:"recurrence"`
	RecurrenceEnd string  `json:"recurrenceEnd,omitempty"`
	Installments  int     `json:"installments"`
	AccountID     string  `json:"accountId,omitempty"`
}

type TransactionImportPayload struct {
	Items []TransactionPayload `json:"items"`
}

type TransactionImportResult struct {
	Total      int `json:"total"`
	Valid      int `json:"valid"`
	Imported   int `json:"imported"`
	Duplicates int `json:"duplicates"`
	Invalid    int `json:"invalid"`
}

type TransactionDTO struct {
	ID            string  `json:"id"`
	Date          string  `json:"date"`
	Type          string  `json:"type"`
	Category      string  `json:"category"`
	Method        string  `json:"method"`
	Description   string  `json:"description"`
	Amount        float64 `json:"amount"`
	Recurrence    string  `json:"recurrence"`
	RecurrenceEnd string  `json:"recurrenceEnd,omitempty"`
	Installments  int     `json:"installments"`
	AccountID     string  `json:"accountId,omitempty"`
	CreatedAt     string  `json:"createdAt"`
	UpdatedAt     string  `json:"updatedAt"`
}

// ── Budget ───────────────────────────────────────────────────

type BudgetPayload struct {
	ID       string  `json:"id,omitempty"`
	Category string  `json:"category"`
	Limit    float64 `json:"limit"`
}

type BudgetDTO struct {
	ID        string  `json:"id"`
	Category  string  `json:"category"`
	Limit     float64 `json:"limit"`
	CreatedAt string  `json:"createdAt"`
	UpdatedAt string  `json:"updatedAt"`
}

// ── Goal ─────────────────────────────────────────────────────

type GoalPayload struct {
	ID      string  `json:"id,omitempty"`
	Name    string  `json:"name"`
	Target  float64 `json:"target"`
	Current float64 `json:"current"`
	DueDate string  `json:"dueDate,omitempty"`
}

type GoalContributionPayload struct {
	Amount float64 `json:"amount"`
}

type GoalDTO struct {
	ID        string  `json:"id"`
	Name      string  `json:"name"`
	Target    float64 `json:"target"`
	Current   float64 `json:"current"`
	DueDate   string  `json:"dueDate,omitempty"`
	CreatedAt string  `json:"createdAt"`
	UpdatedAt string  `json:"updatedAt"`
}

// ── Projection ───────────────────────────────────────────────

type ProjectionPayload struct {
	Months     int      `json:"months"`
	Income     *float64 `json:"income,omitempty"`
	Expense    *float64 `json:"expense,omitempty"`
	Investment *float64 `json:"investment,omitempty"`
}

type ProjectionDTO struct {
	Months     int      `json:"months"`
	Income     *float64 `json:"income,omitempty"`
	Expense    *float64 `json:"expense,omitempty"`
	Investment *float64 `json:"investment,omitempty"`
	UpdatedAt  string   `json:"updatedAt"`
}

// ── Category ─────────────────────────────────────────────────

type CategoryPayload struct {
	ID   string `json:"id,omitempty"`
	Name string `json:"name"`
	Type string `json:"type"`
	Icon string `json:"icon,omitempty"`
}

type CategoryDTO struct {
	ID        string `json:"id"`
	Name      string `json:"name"`
	Type      string `json:"type"`
	Icon      string `json:"icon"`
	CreatedAt string `json:"createdAt"`
}

// ── Account ──────────────────────────────────────────────────

type AccountPayload struct {
	ID             string  `json:"id,omitempty"`
	Name           string  `json:"name"`
	Type           string  `json:"type"`
	Color          string  `json:"color,omitempty"`
	InitialBalance float64 `json:"initialBalance"`
}

type AccountDTO struct {
	ID             string  `json:"id"`
	Name           string  `json:"name"`
	Type           string  `json:"type"`
	Color          string  `json:"color"`
	InitialBalance float64 `json:"initialBalance"`
	CreatedAt      string  `json:"createdAt"`
	UpdatedAt      string  `json:"updatedAt"`
}

// ── Bootstrap ────────────────────────────────────────────────

type BootstrapDTO struct {
	User         UserDTO          `json:"user"`
	Transactions []TransactionDTO `json:"transactions"`
	Budgets      []BudgetDTO      `json:"budgets"`
	Goals        []GoalDTO        `json:"goals"`
	Projection   ProjectionDTO    `json:"projection"`
	Categories   []CategoryDTO    `json:"categories"`
	Accounts     []AccountDTO     `json:"accounts"`
}

// ── Pagination ───────────────────────────────────────────────

type ListResponse[T any] struct {
	Items  []T `json:"items"`
	Total  int `json:"total"`
	Limit  int `json:"limit"`
	Offset int `json:"offset"`
}

// ── Auth Context ─────────────────────────────────────────────

type contextKey string

const CurrentUserKey contextKey = "currentUser"

type CurrentUser struct {
	ID    string
	Name  string
	Email string
}

// ── Helpers ──────────────────────────────────────────────────

// FormatTimeUTC formats a time.Time to RFC3339 in UTC.
func FormatTimeUTC(t time.Time) string {
	return t.UTC().Format(time.RFC3339)
}
