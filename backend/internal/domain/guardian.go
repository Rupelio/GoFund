package domain

import "math"

const (
	GuardianFIIRefPrice       = 8.05
	GuardianFIIMonthlyYield   = 0.0112
	GuardianRingTargetAmount  = 350.00
	GuardianPriceCPTS11       = 7.01
	GuardianPriceKNSC11       = 8.27
	GuardianPriceMXRF11       = 8.80
)

type GuardianEnvelopeDTO struct {
	ID              int64   `json:"id"`
	UserID          string  `json:"user_id,omitempty"`
	Slug            string  `json:"slug"`
	Name            string  `json:"name"`
	LimitAmount     float64 `json:"limit_amount"`
	SpentAmount     float64 `json:"spent_amount"`
	RemainingAmount float64 `json:"remaining_amount"`
	HPPercentage    float64 `json:"hp_percentage"`
	Status          string  `json:"status"`
	ResetCycle      string  `json:"reset_cycle"`
	UpdatedAt       string  `json:"updated_at"`
}

// ComputeEnvelopeHP calculates RemainingAmount, HPPercentage and visual Status.
// Status rules: "green" > 50%, "yellow" between 20% and 50%, "red" < 20%.
func (e *GuardianEnvelopeDTO) ComputeEnvelopeHP() {
	rem := e.LimitAmount - e.SpentAmount
	if rem < 0 {
		rem = 0
	}
	e.RemainingAmount = math.Round(rem*100) / 100

	var pct float64
	if e.LimitAmount > 0 {
		pct = ((e.LimitAmount - e.SpentAmount) / e.LimitAmount) * 100
	}
	if pct < 0 {
		pct = 0
	}
	if pct > 100 {
		pct = 100
	}
	e.HPPercentage = math.Round(pct*100) / 100

	switch {
	case e.HPPercentage > 50:
		e.Status = "green"
	case e.HPPercentage >= 20:
		e.Status = "yellow"
	default:
		e.Status = "red"
	}
}

type GuardianQuestDTO struct {
	ID                 int64   `json:"id"`
	UserID             string  `json:"user_id,omitempty"`
	Title              string  `json:"title"`
	TargetValue        float64 `json:"target_value"`
	CurrentValue       float64 `json:"current_value"`
	ProgressPercentage float64 `json:"progress_percentage"`
	UnitType           string  `json:"unit_type"`
	UnitPriceRef       float64 `json:"unit_price_ref"`
}

func (q *GuardianQuestDTO) ComputeProgress() {
	var pct float64
	if q.TargetValue > 0 {
		pct = (q.CurrentValue / q.TargetValue) * 100
	}
	if pct < 0 {
		pct = 0
	}
	if pct > 100 {
		pct = 100
	}
	q.ProgressPercentage = math.Round(pct*100) / 100
}

type GuardianImpulseLogDTO struct {
	ID                  int64   `json:"id"`
	UserID              string  `json:"user_id,omitempty"`
	ItemDescription     string  `json:"item_description"`
	Amount              float64 `json:"amount"`
	CategorySlug        string  `json:"category_slug"`
	AIVerdict           string  `json:"ai_verdict"`
	AIMessage           string  `json:"ai_message"`
	Headline            string  `json:"headline,omitempty"`
	Argument            string  `json:"argument,omitempty"`
	FIIEquivalentShares int     `json:"fii_equivalent_shares"`
	UserDecision        string  `json:"user_decision"`
	CreatedAt           string  `json:"created_at"`
}

type GuardianPaydayTaskDTO struct {
	ID          string  `json:"id"`
	Title       string  `json:"title"`
	Description string  `json:"description"`
	AmountLabel string  `json:"amount_label,omitempty"`
	Amount      float64 `json:"amount,omitempty"`
}

type GuardianPaydayCycleDTO struct {
	ID       string                  `json:"id"`
	Title    string                  `json:"title"`
	Subtitle string                  `json:"subtitle"`
	DayRange string                  `json:"day_range"`
	Income   float64                 `json:"income,omitempty"`
	IsActive bool                    `json:"is_active"`
	Tasks    []GuardianPaydayTaskDTO `json:"tasks"`
}

type GuardianPaydayChecklistDTO struct {
	CurrentDay  int                      `json:"current_day"`
	ActiveCycle GuardianPaydayCycleDTO   `json:"active_cycle"`
	Cycles      []GuardianPaydayCycleDTO `json:"cycles"`
}

type GuardianDashboardDTO struct {
	Envelopes                []GuardianEnvelopeDTO      `json:"envelopes"`
	Quests                   []GuardianQuestDTO         `json:"quests"`
	TotalSavedMonth          float64                    `json:"total_saved_month"`
	SavedFIIShares           float64                    `json:"saved_fii_shares"`
	SavedFIISharesCount      int                        `json:"saved_fii_shares_count"`
	EstimatedMonthlyDividend float64                    `json:"estimated_monthly_dividend"`
	PaydayChecklist          GuardianPaydayChecklistDTO `json:"payday_checklist"`
	RecentLogs               []GuardianImpulseLogDTO    `json:"recent_logs"`
}

type EvaluateSpendPayload struct {
	Description  string  `json:"description"`
	Amount       float64 `json:"amount"`
	EnvelopeSlug string  `json:"envelope_slug"`
	CategorySlug string  `json:"category_slug,omitempty"`
}

type EvaluateSpendResponse struct {
	LogID               int64   `json:"log_id"`
	Verdict             string  `json:"verdict"`
	Headline            string  `json:"headline"`
	Argument            string  `json:"argument"`
	FIIEquivalentShares int     `json:"fii_equivalent_shares"`
	RingPercentage      float64 `json:"ring_percentage"`
	MonthlyDividend     float64 `json:"monthly_dividend"`
	EnvelopeSlug        string  `json:"envelope_slug"`
	Amount              float64 `json:"amount"`
	Description         string  `json:"description"`
}

type ConfirmDecisionPayload struct {
	LogID   int64  `json:"log_id"`
	Decision string `json:"decision"`
	QuestID *int64 `json:"quest_id,omitempty"`
}

type ConfirmDecisionResponse struct {
	Log       GuardianImpulseLogDTO `json:"log"`
	Envelopes []GuardianEnvelopeDTO `json:"envelopes"`
	Quests    []GuardianQuestDTO    `json:"quests"`
	TotalSavedMonth     float64 `json:"total_saved_month"`
	SavedFIIShares      float64 `json:"saved_fii_shares"`
	SavedFIISharesCount int     `json:"saved_fii_shares_count"`
}

type QuickExpenseWebhookPayload struct {
	Title        string  `json:"title"`
	Amount       float64 `json:"amount"`
	EnvelopeSlug string  `json:"envelope_slug,omitempty"`
	UserID       string  `json:"user_id,omitempty"`
}

type QuickExpenseWebhookResponse struct {
	Title        string              `json:"title"`
	Amount       float64             `json:"amount"`
	EnvelopeSlug string              `json:"envelope_slug"`
	Envelope     GuardianEnvelopeDTO `json:"envelope"`
}
