package handler

import (
	"context"
	"crypto/subtle"
	"encoding/json"
	"errors"
	"log/slog"
	"net/http"
	"strconv"
	"strings"
	"time"

	"gestao/backend/internal/domain"
	"gestao/backend/internal/guardian"
)

type GuardianHandler struct {
	svc          *guardian.Service
	webhookToken string
	queryTimeout time.Duration
}

func NewGuardianHandler(svc *guardian.Service, webhookToken string, queryTimeout time.Duration) *GuardianHandler {
	if queryTimeout <= 0 {
		queryTimeout = 10 * time.Second
	}
	return &GuardianHandler{
		svc:          svc,
		webhookToken: strings.TrimSpace(webhookToken),
		queryTimeout: queryTimeout,
	}
}

// Dashboard handles GET /api/guardian/dashboard.
func (h *GuardianHandler) Dashboard(w http.ResponseWriter, r *http.Request) {
	user, ok := MustCurrentUser(w, r)
	if !ok {
		return
	}

	ctx, cancel := context.WithTimeout(r.Context(), h.queryTimeout)
	defer cancel()

	dto, err := h.svc.GetDashboard(ctx, user.ID, time.Now())
	if err != nil {
		slog.Error("guardian dashboard failed", "error", err, "user_id", user.ID)
		WriteError(w, http.StatusInternalServerError, "could not load guardian dashboard")
		return
	}

	WriteJSON(w, http.StatusOK, dto)
}

// EvaluateSpend handles POST /api/guardian/evaluate-spend.
func (h *GuardianHandler) EvaluateSpend(w http.ResponseWriter, r *http.Request) {
	user, ok := MustCurrentUser(w, r)
	if !ok {
		return
	}

	var payload domain.EvaluateSpendPayload
	if err := json.NewDecoder(r.Body).Decode(&payload); err != nil {
		WriteError(w, http.StatusBadRequest, "invalid request body")
		return
	}

	// Give AI call enough timeout (at least 15s)
	timeout := h.queryTimeout
	if timeout < 15*time.Second {
		timeout = 15 * time.Second
	}
	ctx, cancel := context.WithTimeout(r.Context(), timeout)
	defer cancel()

	res, err := h.svc.EvaluateSpend(ctx, user.ID, payload, time.Now())
	if err != nil {
		if strings.Contains(err.Error(), "required") || strings.Contains(err.Error(), "greater than 0") {
			WriteError(w, http.StatusBadRequest, err.Error())
			return
		}
		slog.Error("guardian evaluate-spend failed", "error", err, "user_id", user.ID)
		WriteError(w, http.StatusInternalServerError, "could not evaluate spend")
		return
	}

	WriteJSON(w, http.StatusOK, res)
}

// ConfirmDecision handles POST /api/guardian/confirm-decision.
func (h *GuardianHandler) ConfirmDecision(w http.ResponseWriter, r *http.Request) {
	user, ok := MustCurrentUser(w, r)
	if !ok {
		return
	}

	var raw struct {
		LogID    any    `json:"log_id"`
		Decision string `json:"decision"`
		QuestID  *int64 `json:"quest_id,omitempty"`
	}
	if err := json.NewDecoder(r.Body).Decode(&raw); err != nil {
		WriteError(w, http.StatusBadRequest, "invalid request body")
		return
	}

	logID, err := parseFlexibleInt64(raw.LogID)
	if err != nil || logID <= 0 {
		WriteError(w, http.StatusBadRequest, "invalid log_id")
		return
	}

	ctx, cancel := context.WithTimeout(r.Context(), h.queryTimeout)
	defer cancel()

	res, err := h.svc.ConfirmDecision(ctx, user.ID, domain.ConfirmDecisionPayload{
		LogID:    logID,
		Decision: raw.Decision,
		QuestID:  raw.QuestID,
	})
	if errors.Is(err, domain.ErrNotFound) {
		WriteError(w, http.StatusNotFound, "impulse log not found")
		return
	}
	if err != nil {
		if strings.Contains(err.Error(), "must be SAVED or SPENT") || strings.Contains(err.Error(), "required") {
			WriteError(w, http.StatusBadRequest, err.Error())
			return
		}
		slog.Error("guardian confirm-decision failed", "error", err, "user_id", user.ID)
		WriteError(w, http.StatusInternalServerError, "could not confirm decision")
		return
	}

	WriteJSON(w, http.StatusOK, res)
}

// QuickExpenseWebhook handles POST /api/guardian/webhook/quick-expense.
// Authenticated via X-Guardian-Token header (or active JWT session).
func (h *GuardianHandler) QuickExpenseWebhook(w http.ResponseWriter, r *http.Request) {
	tokenHeader := strings.TrimSpace(r.Header.Get("X-Guardian-Token"))
	var userID string

	if v := r.Context().Value(domain.CurrentUserKey); v != nil {
		if u, ok := v.(domain.CurrentUser); ok {
			userID = u.ID
		}
	}

	if userID == "" {
		if tokenHeader == "" {
			WriteError(w, http.StatusUnauthorized, "missing X-Guardian-Token header")
			return
		}
		if h.webhookToken != "" && subtle.ConstantTimeCompare([]byte(tokenHeader), []byte(h.webhookToken)) != 1 {
			WriteError(w, http.StatusUnauthorized, "invalid X-Guardian-Token")
			return
		}
	}

	var payload domain.QuickExpenseWebhookPayload
	if err := json.NewDecoder(r.Body).Decode(&payload); err != nil {
		WriteError(w, http.StatusBadRequest, "invalid request body")
		return
	}

	ctx, cancel := context.WithTimeout(r.Context(), h.queryTimeout)
	defer cancel()

	res, err := h.svc.ProcessQuickExpense(ctx, userID, payload)
	if errors.Is(err, domain.ErrNotFound) {
		WriteError(w, http.StatusNotFound, "target user or envelope not found")
		return
	}
	if err != nil {
		if strings.Contains(err.Error(), "required") || strings.Contains(err.Error(), "greater than 0") {
			WriteError(w, http.StatusBadRequest, err.Error())
			return
		}
		slog.Error("guardian quick-expense webhook failed", "error", err)
		WriteError(w, http.StatusInternalServerError, "could not process quick expense")
		return
	}

	WriteJSON(w, http.StatusOK, res)
}

func parseFlexibleInt64(v any) (int64, error) {
	switch val := v.(type) {
	case float64:
		return int64(val), nil
	case int64:
		return val, nil
	case int:
		return int64(val), nil
	case string:
		return strconv.ParseInt(strings.TrimSpace(val), 10, 64)
	default:
		return 0, errors.New("unsupported id type")
	}
}
