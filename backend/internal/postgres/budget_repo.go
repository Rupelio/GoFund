package postgres

import (
	"context"
	"errors"
	"time"

	"gestao/backend/internal/domain"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgconn"
	"github.com/jackc/pgx/v5/pgxpool"
)

// BudgetRepo handles budget persistence.
type BudgetRepo struct {
	pool *pgxpool.Pool
}

func NewBudgetRepo(pool *pgxpool.Pool) *BudgetRepo {
	return &BudgetRepo{pool: pool}
}

type budgetRow struct {
	dto       domain.BudgetDTO
	createdAt time.Time
	updatedAt time.Time
}

func (r *budgetRow) targets() []any {
	return []any{&r.dto.ID, &r.dto.Category, &r.dto.Limit, &r.createdAt, &r.updatedAt}
}

func (r *budgetRow) toDTO() domain.BudgetDTO {
	r.dto.CreatedAt = domain.FormatTimeUTC(r.createdAt)
	r.dto.UpdatedAt = domain.FormatTimeUTC(r.updatedAt)
	return r.dto
}

// List returns paginated budgets for a user.
func (r *BudgetRepo) List(ctx context.Context, userID string, limit, offset int) ([]domain.BudgetDTO, int, error) {
	var total int
	if err := r.pool.QueryRow(ctx, `SELECT count(*) FROM budgets WHERE user_id = $1`, userID).Scan(&total); err != nil {
		return nil, 0, err
	}

	rows, err := r.pool.Query(ctx,
		`SELECT id::text, category, limit_amount::double precision, created_at, updated_at
		 FROM budgets WHERE user_id = $1 ORDER BY category ASC LIMIT $2 OFFSET $3`,
		userID, limit, offset,
	)
	if err != nil {
		return nil, 0, err
	}
	defer rows.Close()

	items := make([]domain.BudgetDTO, 0, min(total, limit))
	for rows.Next() {
		var row budgetRow
		if err := rows.Scan(row.targets()...); err != nil {
			return nil, 0, err
		}
		items = append(items, row.toDTO())
	}
	return items, total, rows.Err()
}

// ListAll returns all budgets for bootstrap.
func (r *BudgetRepo) ListAll(ctx context.Context, userID string) ([]domain.BudgetDTO, error) {
	rows, err := r.pool.Query(ctx,
		`SELECT id::text, category, limit_amount::double precision, created_at, updated_at
		 FROM budgets WHERE user_id = $1 ORDER BY category ASC`,
		userID,
	)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	items := make([]domain.BudgetDTO, 0)
	for rows.Next() {
		var row budgetRow
		if err := rows.Scan(row.targets()...); err != nil {
			return nil, err
		}
		items = append(items, row.toDTO())
	}
	return items, rows.Err()
}

// Create inserts a new budget.
func (r *BudgetRepo) Create(ctx context.Context, userID string, p domain.BudgetPayload) (domain.BudgetDTO, error) {
	id := p.ID
	if id == "" {
		id = domain.MustUUID()
	}

	var createdAt, updatedAt time.Time
	err := r.pool.QueryRow(ctx,
		`INSERT INTO budgets (id, user_id, category, limit_amount, created_at, updated_at)
		 VALUES ($1, $2, $3, $4, NOW(), NOW())
		 RETURNING created_at, updated_at`,
		id, userID, p.Category, p.Limit,
	).Scan(&createdAt, &updatedAt)

	if err != nil {
		var pgErr *pgconn.PgError
		if errors.As(err, &pgErr) && pgErr.Code == "23505" {
			return domain.BudgetDTO{}, domain.ErrConflict
		}
		return domain.BudgetDTO{}, err
	}

	return domain.BudgetDTO{
		ID: id, Category: p.Category, Limit: p.Limit,
		CreatedAt: domain.FormatTimeUTC(createdAt), UpdatedAt: domain.FormatTimeUTC(updatedAt),
	}, nil
}

// Update modifies an existing budget.
func (r *BudgetRepo) Update(ctx context.Context, id, userID string, p domain.BudgetPayload) (domain.BudgetDTO, error) {
	var createdAt, updatedAt time.Time
	err := r.pool.QueryRow(ctx,
		`UPDATE budgets SET category = $3, limit_amount = $4, updated_at = NOW()
		 WHERE id = $1 AND user_id = $2
		 RETURNING created_at, updated_at`,
		id, userID, p.Category, p.Limit,
	).Scan(&createdAt, &updatedAt)

	if errors.Is(err, pgx.ErrNoRows) {
		return domain.BudgetDTO{}, domain.ErrNotFound
	}
	if err != nil {
		var pgErr *pgconn.PgError
		if errors.As(err, &pgErr) && pgErr.Code == "23505" {
			return domain.BudgetDTO{}, domain.ErrConflict
		}
		return domain.BudgetDTO{}, err
	}

	return domain.BudgetDTO{
		ID: id, Category: p.Category, Limit: p.Limit,
		CreatedAt: domain.FormatTimeUTC(createdAt), UpdatedAt: domain.FormatTimeUTC(updatedAt),
	}, nil
}

// Delete removes a budget. Returns ErrNotFound if missing.
func (r *BudgetRepo) Delete(ctx context.Context, id, userID string) error {
	tag, err := r.pool.Exec(ctx, `DELETE FROM budgets WHERE id = $1 AND user_id = $2`, id, userID)
	if err != nil {
		return err
	}
	if tag.RowsAffected() == 0 {
		return domain.ErrNotFound
	}
	return nil
}
