package postgres

import (
	"context"
	"encoding/json"
	"errors"
	"math"
	"time"

	"gestao/backend/internal/domain"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

type GuardianRepo struct {
	pool *pgxpool.Pool
}

func NewGuardianRepo(pool *pgxpool.Pool) *GuardianRepo {
	return &GuardianRepo{pool: pool}
}

// EnsureSeeded populates the default envelopes and quests for a user if not yet created.
func (r *GuardianRepo) EnsureSeeded(ctx context.Context, userID string) error {
	_, err := r.pool.Exec(ctx, `
		INSERT INTO guardian_envelopes (user_id, slug, name, limit_amount, spent_amount, reset_cycle, updated_at)
		VALUES
			($1, 'lazer_semanal', 'HP Lazer da Semana', 100.00, 0.00, 'weekly_friday', NOW()),
			($1, 'vr_mercado', 'Escudo Vale-Refeição', 600.00, 0.00, 'monthly_day_1', NOW()),
			($1, 'casa_combustivel', 'Casa, Farmácia & Gasolina', 400.00, 0.00, 'monthly_day_1', NOW()),
			($1, 'piso_cartao', 'Piso Fixo do Cartão', 634.67, 0.00, 'monthly_day_1', NOW())
		ON CONFLICT (user_id, slug) DO NOTHING
	`, userID)
	if err != nil {
		return err
	}

	_, err = r.pool.Exec(ctx, `
		INSERT INTO guardian_quests (user_id, title, target_value, current_value, unit_type, unit_price_ref)
		VALUES
			($1, 'Anel Solitário Pedra Verde', 350.00, 0.00, 'BRL', 1.00),
			($1, 'Meta 50 Cotas de FIIs', 50.00, 21.00, 'SHARES', 8.05),
			($1, 'Cofrinho Meli+ 120% CDI', 10000.00, 200.00, 'BRL', 1.00)
		ON CONFLICT (user_id, title) DO NOTHING
	`, userID)
	return err
}

func (r *GuardianRepo) ListEnvelopes(ctx context.Context, userID string) ([]domain.GuardianEnvelopeDTO, error) {
	rows, err := r.pool.Query(ctx, `
		SELECT id, user_id::text, slug, name, limit_amount::double precision, spent_amount::double precision, reset_cycle, updated_at
		FROM guardian_envelopes
		WHERE user_id = $1
		ORDER BY CASE slug
			WHEN 'lazer_semanal' THEN 1
			WHEN 'vr_mercado' THEN 2
			WHEN 'casa_combustivel' THEN 3
			WHEN 'piso_cartao' THEN 4
			ELSE 5
		END, id ASC
	`, userID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	items := make([]domain.GuardianEnvelopeDTO, 0, 4)
	for rows.Next() {
		var dto domain.GuardianEnvelopeDTO
		var updatedAt time.Time
		if err := rows.Scan(
			&dto.ID,
			&dto.UserID,
			&dto.Slug,
			&dto.Name,
			&dto.LimitAmount,
			&dto.SpentAmount,
			&dto.ResetCycle,
			&updatedAt,
		); err != nil {
			return nil, err
		}
		dto.UpdatedAt = domain.FormatTimeUTC(updatedAt)
		dto.ComputeEnvelopeHP()
		items = append(items, dto)
	}
	return items, rows.Err()
}

func (r *GuardianRepo) ListQuests(ctx context.Context, userID string) ([]domain.GuardianQuestDTO, error) {
	rows, err := r.pool.Query(ctx, `
		SELECT id, user_id::text, title, target_value::double precision, current_value::double precision, unit_type, unit_price_ref::double precision
		FROM guardian_quests
		WHERE user_id = $1
		ORDER BY CASE title
			WHEN 'Anel Solitário Pedra Verde' THEN 1
			WHEN 'Meta 50 Cotas de FIIs' THEN 2
			WHEN 'Cofrinho Meli+ 120% CDI' THEN 3
			ELSE 4
		END, id ASC
	`, userID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	items := make([]domain.GuardianQuestDTO, 0, 3)
	for rows.Next() {
		var dto domain.GuardianQuestDTO
		if err := rows.Scan(
			&dto.ID,
			&dto.UserID,
			&dto.Title,
			&dto.TargetValue,
			&dto.CurrentValue,
			&dto.UnitType,
			&dto.UnitPriceRef,
		); err != nil {
			return nil, err
		}
		dto.ComputeProgress()
		items = append(items, dto)
	}
	return items, rows.Err()
}

func (r *GuardianRepo) GetTotalSavedMonth(ctx context.Context, userID string) (float64, error) {
	var total float64
	err := r.pool.QueryRow(ctx, `
		SELECT COALESCE(SUM(amount), 0)::double precision
		FROM guardian_impulse_logs
		WHERE user_id = $1
		  AND user_decision = 'SAVED'
		  AND date_trunc('month', created_at) = date_trunc('month', NOW())
	`, userID).Scan(&total)
	if err != nil {
		return 0, err
	}
	return math.Round(total*100) / 100, nil
}

func (r *GuardianRepo) ListRecentLogs(ctx context.Context, userID string, limit int) ([]domain.GuardianImpulseLogDTO, error) {
	if limit <= 0 {
		limit = 10
	}
	rows, err := r.pool.Query(ctx, `
		SELECT id, user_id::text, item_description, amount::double precision, category_slug, ai_verdict, ai_message, user_decision, created_at
		FROM guardian_impulse_logs
		WHERE user_id = $1
		ORDER BY created_at DESC, id DESC
		LIMIT $2
	`, userID, limit)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	items := make([]domain.GuardianImpulseLogDTO, 0, limit)
	for rows.Next() {
		var dto domain.GuardianImpulseLogDTO
		var createdAt time.Time
		if err := rows.Scan(
			&dto.ID,
			&dto.UserID,
			&dto.ItemDescription,
			&dto.Amount,
			&dto.CategorySlug,
			&dto.AIVerdict,
			&dto.AIMessage,
			&dto.UserDecision,
			&createdAt,
		); err != nil {
			return nil, err
		}
		dto.CreatedAt = domain.FormatTimeUTC(createdAt)
		enrichImpulseLogFromMessage(&dto)
		items = append(items, dto)
	}
	return items, rows.Err()
}

func (r *GuardianRepo) CreateImpulseLog(
	ctx context.Context,
	userID, description string,
	amount float64,
	categorySlug, aiVerdict, aiMessage string,
) (domain.GuardianImpulseLogDTO, error) {
	var dto domain.GuardianImpulseLogDTO
	var createdAt time.Time
	err := r.pool.QueryRow(ctx, `
		INSERT INTO guardian_impulse_logs (user_id, item_description, amount, category_slug, ai_verdict, ai_message, user_decision, created_at)
		VALUES ($1, $2, $3, $4, $5, $6, 'PENDING', NOW())
		RETURNING id, user_id::text, item_description, amount::double precision, category_slug, ai_verdict, ai_message, user_decision, created_at
	`, userID, description, amount, categorySlug, aiVerdict, aiMessage).Scan(
		&dto.ID,
		&dto.UserID,
		&dto.ItemDescription,
		&dto.Amount,
		&dto.CategorySlug,
		&dto.AIVerdict,
		&dto.AIMessage,
		&dto.UserDecision,
		&createdAt,
	)
	if err != nil {
		return domain.GuardianImpulseLogDTO{}, err
	}
	dto.CreatedAt = domain.FormatTimeUTC(createdAt)
	enrichImpulseLogFromMessage(&dto)
	return dto, nil
}

func (r *GuardianRepo) ConfirmDecision(
	ctx context.Context,
	userID string,
	logID int64,
	decision string,
	questID *int64,
) (domain.GuardianImpulseLogDTO, error) {
	tx, err := r.pool.Begin(ctx)
	if err != nil {
		return domain.GuardianImpulseLogDTO{}, err
	}
	defer func() { _ = tx.Rollback(ctx) }()

	var dto domain.GuardianImpulseLogDTO
	var createdAt time.Time
	err = tx.QueryRow(ctx, `
		SELECT id, user_id::text, item_description, amount::double precision, category_slug, ai_verdict, ai_message, user_decision, created_at
		FROM guardian_impulse_logs
		WHERE id = $1 AND user_id = $2
		FOR UPDATE
	`, logID, userID).Scan(
		&dto.ID,
		&dto.UserID,
		&dto.ItemDescription,
		&dto.Amount,
		&dto.CategorySlug,
		&dto.AIVerdict,
		&dto.AIMessage,
		&dto.UserDecision,
		&createdAt,
	)
	if errors.Is(err, pgx.ErrNoRows) {
		return domain.GuardianImpulseLogDTO{}, domain.ErrNotFound
	}
	if err != nil {
		return domain.GuardianImpulseLogDTO{}, err
	}

	previousDecision := dto.UserDecision
	if previousDecision == "PENDING" {
		_, err = tx.Exec(ctx, `
			UPDATE guardian_impulse_logs
			SET user_decision = $3
			WHERE id = $1 AND user_id = $2
		`, logID, userID, decision)
		if err != nil {
			return domain.GuardianImpulseLogDTO{}, err
		}
		dto.UserDecision = decision

		switch decision {
		case "SPENT":
			_, err = tx.Exec(ctx, `
				UPDATE guardian_envelopes
				SET spent_amount = spent_amount + $3, updated_at = NOW()
				WHERE user_id = $1 AND slug = $2
			`, userID, dto.CategorySlug, dto.Amount)
			if err != nil {
				return domain.GuardianImpulseLogDTO{}, err
			}
		case "SAVED":
			if questID != nil && *questID > 0 {
				_, err = tx.Exec(ctx, `
					UPDATE guardian_quests
					SET current_value = current_value + CASE
						WHEN unit_type = 'SHARES' AND unit_price_ref > 0 THEN ROUND(($3 / unit_price_ref)::numeric, 2)
						ELSE $3::numeric
					END
					WHERE id = $1 AND user_id = $2
				`, *questID, userID, dto.Amount)
				if err != nil {
					return domain.GuardianImpulseLogDTO{}, err
				}
			} else {
				// By default, add saved impulse equivalent shares to the FII quest thermometer
				_, err = tx.Exec(ctx, `
					UPDATE guardian_quests
					SET current_value = current_value + CASE
						WHEN unit_type = 'SHARES' AND unit_price_ref > 0 THEN ROUND(($2 / unit_price_ref)::numeric, 2)
						ELSE $2::numeric
					END
					WHERE user_id = $1 AND unit_type = 'SHARES'
				`, userID, dto.Amount)
				if err != nil {
					return domain.GuardianImpulseLogDTO{}, err
				}
			}
		}
	}

	if err := tx.Commit(ctx); err != nil {
		return domain.GuardianImpulseLogDTO{}, err
	}

	dto.CreatedAt = domain.FormatTimeUTC(createdAt)
	enrichImpulseLogFromMessage(&dto)
	return dto, nil
}

func (r *GuardianRepo) AddExpenseToEnvelope(ctx context.Context, userID, slug string, amount float64) (domain.GuardianEnvelopeDTO, error) {
	if err := r.EnsureSeeded(ctx, userID); err != nil {
		return domain.GuardianEnvelopeDTO{}, err
	}

	var dto domain.GuardianEnvelopeDTO
	var updatedAt time.Time
	err := r.pool.QueryRow(ctx, `
		UPDATE guardian_envelopes
		SET spent_amount = spent_amount + $3, updated_at = NOW()
		WHERE user_id = $1 AND slug = $2
		RETURNING id, user_id::text, slug, name, limit_amount::double precision, spent_amount::double precision, reset_cycle, updated_at
	`, userID, slug, amount).Scan(
		&dto.ID,
		&dto.UserID,
		&dto.Slug,
		&dto.Name,
		&dto.LimitAmount,
		&dto.SpentAmount,
		&dto.ResetCycle,
		&updatedAt,
	)
	if errors.Is(err, pgx.ErrNoRows) {
		return domain.GuardianEnvelopeDTO{}, domain.ErrNotFound
	}
	if err != nil {
		return domain.GuardianEnvelopeDTO{}, err
	}
	dto.UpdatedAt = domain.FormatTimeUTC(updatedAt)
	dto.ComputeEnvelopeHP()
	return dto, nil
}

func (r *GuardianRepo) ResolveDefaultUserID(ctx context.Context, preferredUserID string) (string, error) {
	if preferredUserID != "" {
		var id string
		err := r.pool.QueryRow(ctx, `SELECT id::text FROM users WHERE id::text = $1 LIMIT 1`, preferredUserID).Scan(&id)
		if err == nil {
			return id, nil
		}
	}
	var id string
	err := r.pool.QueryRow(ctx, `
		SELECT id::text FROM users
		WHERE email NOT LIKE 'legacy-%@gofund.local'
		ORDER BY created_at ASC
		LIMIT 1
	`).Scan(&id)
	if err == nil {
		return id, nil
	}
	err = r.pool.QueryRow(ctx, `SELECT id::text FROM users ORDER BY created_at ASC LIMIT 1`).Scan(&id)
	if errors.Is(err, pgx.ErrNoRows) {
		return "", domain.ErrNotFound
	}
	return id, err
}

func enrichImpulseLogFromMessage(dto *domain.GuardianImpulseLogDTO) {
	if dto.FIIEquivalentShares == 0 && dto.Amount > 0 {
		dto.FIIEquivalentShares = int(math.Floor(dto.Amount / domain.GuardianFIIRefPrice))
	}
	var parsed struct {
		Headline            string `json:"headline"`
		Argument            string `json:"argument"`
		FIIEquivalentShares int    `json:"fii_equivalent_shares"`
	}
	if err := json.Unmarshal([]byte(dto.AIMessage), &parsed); err == nil && (parsed.Headline != "" || parsed.Argument != "") {
		dto.Headline = parsed.Headline
		dto.Argument = parsed.Argument
		if parsed.FIIEquivalentShares > 0 {
			dto.FIIEquivalentShares = parsed.FIIEquivalentShares
		}
	} else {
		dto.Argument = dto.AIMessage
	}
}
