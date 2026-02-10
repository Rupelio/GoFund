package handler

import (
	"context"
	"log/slog"
	"net/http"
	"sort"
	"time"

	"gestao/backend/internal/email"
	"gestao/backend/internal/postgres"
)

// SummaryHandler handles sending monthly financial summaries by email.
type SummaryHandler struct {
	transactions *postgres.TransactionRepo
	emailSender  *email.Sender
	queryTimeout time.Duration
}

// NewSummaryHandler creates a SummaryHandler.
func NewSummaryHandler(txnRepo *postgres.TransactionRepo, sender *email.Sender, timeout time.Duration) *SummaryHandler {
	return &SummaryHandler{transactions: txnRepo, emailSender: sender, queryTimeout: timeout}
}

// SendMonthlySummary sends a financial summary for the given month to the user's email.
func (h *SummaryHandler) SendMonthlySummary(w http.ResponseWriter, r *http.Request) {
	user, ok := MustCurrentUser(w, r)
	if !ok {
		return
	}

	// Determine month: ?month=YYYY-MM or default to current month
	month := r.URL.Query().Get("month")
	if month == "" {
		month = time.Now().Format("2006-01")
	}
	if _, err := time.Parse("2006-01", month); err != nil {
		WriteError(w, http.StatusBadRequest, "invalid month format, use YYYY-MM")
		return
	}

	ctx, cancel := context.WithTimeout(r.Context(), h.queryTimeout)
	defer cancel()

	// Fetch all transactions for the month (no pagination)
	items, _, err := h.transactions.List(ctx, user.ID, month, 10000, 0)
	if err != nil {
		slog.Error("summary: list transactions failed", "error", err)
		WriteError(w, http.StatusInternalServerError, "could not fetch transactions")
		return
	}

	// Calculate summary
	var income, expenses, investment float64
	catMap := map[string]float64{}

	for _, t := range items {
		switch t.Type {
		case "receita":
			income += t.Amount
		case "despesa":
			expenses += t.Amount
			catMap[t.Category] += t.Amount
		case "investimento":
			investment += t.Amount
		// transferencia is intentionally ignored (neutral)
		}
	}

	// Sort categories by amount descending, keep top 5
	type catEntry struct {
		name   string
		amount float64
	}
	var cats []catEntry
	for name, amount := range catMap {
		cats = append(cats, catEntry{name, amount})
	}
	sort.Slice(cats, func(i, j int) bool { return cats[i].amount > cats[j].amount })
	if len(cats) > 5 {
		cats = cats[:5]
	}

	topCats := make([]email.CategorySummary, len(cats))
	for i, c := range cats {
		topCats[i] = email.CategorySummary{Name: c.name, Amount: c.amount}
	}

	// Build month label: "Fevereiro 2026"
	monthDate, _ := time.Parse("2006-01", month)
	monthLabel := formatMonthPt(monthDate)

	summary := email.MonthlySummary{
		Income:        income,
		Expenses:      expenses,
		Investment:    investment,
		Balance:       income - expenses - investment,
		TopCategories: topCats,
	}

	if err := h.emailSender.SendMonthlySummaryEmail(user.Email, user.Name, monthLabel, summary); err != nil {
		slog.Error("summary: send email failed", "error", err, "userID", user.ID)
		WriteError(w, http.StatusInternalServerError, "could not send summary email")
		return
	}

	WriteJSON(w, http.StatusOK, map[string]string{"message": "Resumo enviado para " + user.Email})
}

func formatMonthPt(t time.Time) string {
	months := []string{
		"Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho",
		"Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro",
	}
	return months[t.Month()-1] + " " + t.Format("2006")
}
