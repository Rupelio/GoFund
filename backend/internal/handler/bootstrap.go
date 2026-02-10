package handler

import (
	"context"
	"log/slog"
	"net/http"
	"time"

	"gestao/backend/internal/domain"
	"gestao/backend/internal/postgres"
)

// BootstrapHandler returns all user data in a single response for initial frontend hydration.
type BootstrapHandler struct {
	users        *postgres.UserRepo
	transactions *postgres.TransactionRepo
	budgets      *postgres.BudgetRepo
	goals        *postgres.GoalRepo
	projections  *postgres.ProjectionRepo
	categories   *postgres.CategoryRepo
	accounts     *postgres.AccountRepo
	queryTimeout time.Duration
}

func NewBootstrapHandler(
	users *postgres.UserRepo,
	transactions *postgres.TransactionRepo,
	budgets *postgres.BudgetRepo,
	goals *postgres.GoalRepo,
	projections *postgres.ProjectionRepo,
	categories *postgres.CategoryRepo,
	accounts *postgres.AccountRepo,
	timeout time.Duration,
) *BootstrapHandler {
	return &BootstrapHandler{
		users: users, transactions: transactions, budgets: budgets,
		goals: goals, projections: projections, categories: categories,
		accounts: accounts, queryTimeout: timeout,
	}
}

func (h *BootstrapHandler) Handle(w http.ResponseWriter, r *http.Request) {
	user, ok := MustCurrentUser(w, r)
	if !ok {
		return
	}

	ctx, cancel := context.WithTimeout(r.Context(), h.queryTimeout)
	defer cancel()

	bootstrap := domain.BootstrapDTO{
		User:         domain.UserDTO{ID: user.ID, Name: user.Name, Email: user.Email},
		Transactions: make([]domain.TransactionDTO, 0),
		Budgets:      make([]domain.BudgetDTO, 0),
		Goals:        make([]domain.GoalDTO, 0),
		Categories:   make([]domain.CategoryDTO, 0),
		Accounts:     make([]domain.AccountDTO, 0),
		Projection: domain.ProjectionDTO{
			Months:    6,
			UpdatedAt: domain.FormatTimeUTC(time.Now()),
		},
	}

	// Load user profile
	userDTO, err := h.users.FindByID(ctx, user.ID)
	if err != nil {
		slog.Error("bootstrap: user profile", "error", err)
		WriteError(w, http.StatusInternalServerError, "could not load user profile")
		return
	}
	bootstrap.User = userDTO

	// Load all transactions
	txns, err := h.transactions.ListAll(ctx, user.ID)
	if err != nil {
		slog.Error("bootstrap: transactions", "error", err)
		WriteError(w, http.StatusInternalServerError, "could not load transactions")
		return
	}
	bootstrap.Transactions = txns

	// Load all budgets
	budgets, err := h.budgets.ListAll(ctx, user.ID)
	if err != nil {
		slog.Error("bootstrap: budgets", "error", err)
		WriteError(w, http.StatusInternalServerError, "could not load budgets")
		return
	}
	bootstrap.Budgets = budgets

	// Load all goals
	goals, err := h.goals.ListAll(ctx, user.ID)
	if err != nil {
		slog.Error("bootstrap: goals", "error", err)
		WriteError(w, http.StatusInternalServerError, "could not load goals")
		return
	}
	bootstrap.Goals = goals

	// Load projection
	proj, err := h.projections.Get(ctx, user.ID)
	if err != nil {
		slog.Error("bootstrap: projection", "error", err)
		WriteError(w, http.StatusInternalServerError, "could not load projection")
		return
	}
	bootstrap.Projection = proj

	// Seed default categories if needed, then load
	_ = h.categories.SeedDefaults(ctx, user.ID)
	cats, err := h.categories.ListAll(ctx, user.ID)
	if err != nil {
		slog.Error("bootstrap: categories", "error", err)
		WriteError(w, http.StatusInternalServerError, "could not load categories")
		return
	}
	bootstrap.Categories = cats

	// Load accounts
	accs, err := h.accounts.ListAll(ctx, user.ID)
	if err != nil {
		slog.Error("bootstrap: accounts", "error", err)
		WriteError(w, http.StatusInternalServerError, "could not load accounts")
		return
	}
	bootstrap.Accounts = accs

	WriteJSON(w, http.StatusOK, bootstrap)
}
