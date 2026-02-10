package postgres

import (
	"context"
	"errors"
	"time"

	"gestao/backend/internal/domain"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

// ProjectionRepo handles projection_settings persistence.
type ProjectionRepo struct {
	pool *pgxpool.Pool
}

func NewProjectionRepo(pool *pgxpool.Pool) *ProjectionRepo {
	return &ProjectionRepo{pool: pool}
}

// Get returns projection settings for a user. Returns defaults if not found.
func (r *ProjectionRepo) Get(ctx context.Context, userID string) (domain.ProjectionDTO, error) {
	var (
		dto       domain.ProjectionDTO
		updatedAt time.Time
	)

	err := r.pool.QueryRow(ctx,
		`SELECT months, income::double precision, expense::double precision,
		        investment::double precision, updated_at
		 FROM projection_settings WHERE user_id = $1`,
		userID,
	).Scan(&dto.Months, &dto.Income, &dto.Expense, &dto.Investment, &updatedAt)

	if errors.Is(err, pgx.ErrNoRows) {
		return domain.ProjectionDTO{
			Months:    6,
			UpdatedAt: domain.FormatTimeUTC(time.Now()),
		}, nil
	}
	if err != nil {
		return domain.ProjectionDTO{}, err
	}

	dto.UpdatedAt = domain.FormatTimeUTC(updatedAt)
	return dto, nil
}

// Upsert inserts or updates projection settings.
func (r *ProjectionRepo) Upsert(ctx context.Context, userID string, p domain.ProjectionPayload) (domain.ProjectionDTO, error) {
	var updatedAt time.Time
	err := r.pool.QueryRow(ctx,
		`INSERT INTO projection_settings (user_id, months, income, expense, investment, updated_at)
		 VALUES ($1, $2, $3, $4, $5, NOW())
		 ON CONFLICT (user_id)
		 DO UPDATE SET months = EXCLUDED.months, income = EXCLUDED.income,
		               expense = EXCLUDED.expense, investment = EXCLUDED.investment,
		               updated_at = NOW()
		 RETURNING updated_at`,
		userID, p.Months, p.Income, p.Expense, p.Investment,
	).Scan(&updatedAt)
	if err != nil {
		return domain.ProjectionDTO{}, err
	}

	return domain.ProjectionDTO{
		Months: p.Months, Income: p.Income, Expense: p.Expense,
		Investment: p.Investment, UpdatedAt: domain.FormatTimeUTC(updatedAt),
	}, nil
}
