package handler

import (
	"context"
	"log/slog"
	"net/http"
	"sort"
	"time"

	"gestao/backend/internal/domain"
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

	// Fetch full history so summary can expand recurrence/installments like the dashboard.
	allItems, err := h.transactions.ListAll(ctx, user.ID)
	if err != nil {
		slog.Error("summary: list transactions failed", "error", err)
		WriteError(w, http.StatusInternalServerError, "could not fetch transactions")
		return
	}
	items := expandTransactionsForMonth(allItems, month)

	// Calculate summary — cash-basis: exclude method=credito from KPIs (matches dashboard logic)
	var income, expenses, investment, creditCard float64
	catMap := map[string]float64{}

	for _, t := range items {
		// Credit-card purchases are informational only (cash-basis accounting)
		if t.Method == "credito" {
			if t.Type == "despesa" {
				creditCard += t.Amount
			}
			continue
		}
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

	// Calculate net worth from ALL transactions (not just this month)
	var totalIncome, totalExpense, totalInvestment float64
	allReal := make([]domain.TransactionDTO, 0, len(allItems))
	for _, t := range allItems {
		if t.Method == "credito" {
			continue
		}
		allReal = append(allReal, t)
	}
	for _, t := range allReal {
		switch t.Type {
		case "receita":
			totalIncome += t.Amount
		case "despesa":
			totalExpense += t.Amount
		case "investimento":
			totalInvestment += t.Amount
		}
	}
	netWorth := totalIncome - totalExpense

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
		CreditCard:    creditCard,
		Balance:       income - expenses - investment,
		NetWorth:      netWorth,
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

// expandTransactionsForMonth applies the same month-expansion rules used by the frontend:
// - monthly recurrence applies from start month until recurrenceEnd (if present)
// - installments apply from start month for N months
func expandTransactionsForMonth(items []domain.TransactionDTO, month string) []domain.TransactionDTO {
	effective := make([]domain.TransactionDTO, 0, len(items))

	for _, t := range items {
		txMonth, ok := monthFromDate(t.Date)
		if !ok {
			continue
		}

		if t.Recurrence == "monthly" {
			if txMonth > month {
				continue
			}
			if t.RecurrenceEnd != "" {
				if endMonth, ok := monthFromDate(t.RecurrenceEnd); ok && endMonth < month {
					continue
				}
			}
			effective = append(effective, t)
			continue
		}

		if t.Installments > 1 {
			diff, ok := monthDiff(txMonth, month)
			if ok && diff >= 0 && diff < t.Installments {
				effective = append(effective, t)
			}
			continue
		}

		if txMonth == month {
			effective = append(effective, t)
		}
	}

	return effective
}

func monthFromDate(date string) (string, bool) {
	if len(date) < len("2006-01") {
		return "", false
	}
	month := date[:7]
	if _, err := time.Parse("2006-01", month); err != nil {
		return "", false
	}
	return month, true
}

func monthDiff(startMonth, endMonth string) (int, bool) {
	start, err := time.Parse("2006-01", startMonth)
	if err != nil {
		return 0, false
	}
	end, err := time.Parse("2006-01", endMonth)
	if err != nil {
		return 0, false
	}
	return (end.Year()-start.Year())*12 + int(end.Month()) - int(start.Month()), true
}
