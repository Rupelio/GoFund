package postgres

import (
	"context"
	"errors"
	"time"

	"gestao/backend/internal/domain"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

// GoalRepo handles goal persistence.
type GoalRepo struct {
	pool *pgxpool.Pool
}

func NewGoalRepo(pool *pgxpool.Pool) *GoalRepo {
	return &GoalRepo{pool: pool}
}

type goalRow struct {
	dto       domain.GoalDTO
	dueDate   *time.Time
	createdAt time.Time
	updatedAt time.Time
}

func (r *goalRow) targets() []any {
	return []any{
		&r.dto.ID, &r.dto.Name, &r.dto.Target, &r.dto.Current,
		&r.dueDate, &r.createdAt, &r.updatedAt,
	}
}

func (r *goalRow) toDTO() domain.GoalDTO {
	if r.dueDate != nil {
		r.dto.DueDate = r.dueDate.Format("2006-01-02")
	}
	r.dto.CreatedAt = domain.FormatTimeUTC(r.createdAt)
	r.dto.UpdatedAt = domain.FormatTimeUTC(r.updatedAt)
	return r.dto
}

const goalColumns = `id::text, name, target::double precision, current::double precision, due_date, created_at, updated_at`

// List returns paginated goals for a user.
func (r *GoalRepo) List(ctx context.Context, userID string, limit, offset int) ([]domain.GoalDTO, int, error) {
	var total int
	if err := r.pool.QueryRow(ctx, `SELECT count(*) FROM goals WHERE user_id = $1`, userID).Scan(&total); err != nil {
		return nil, 0, err
	}

	rows, err := r.pool.Query(ctx,
		`SELECT `+goalColumns+` FROM goals WHERE user_id = $1 ORDER BY due_date NULLS LAST, created_at ASC LIMIT $2 OFFSET $3`,
		userID, limit, offset,
	)
	if err != nil {
		return nil, 0, err
	}
	defer rows.Close()

	items := make([]domain.GoalDTO, 0, min(total, limit))
	for rows.Next() {
		var row goalRow
		if err := rows.Scan(row.targets()...); err != nil {
			return nil, 0, err
		}
		items = append(items, row.toDTO())
	}
	return items, total, rows.Err()
}

// ListAll returns all goals for bootstrap.
func (r *GoalRepo) ListAll(ctx context.Context, userID string) ([]domain.GoalDTO, error) {
	rows, err := r.pool.Query(ctx,
		`SELECT `+goalColumns+` FROM goals WHERE user_id = $1 ORDER BY due_date NULLS LAST, created_at ASC`,
		userID,
	)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	items := make([]domain.GoalDTO, 0)
	for rows.Next() {
		var row goalRow
		if err := rows.Scan(row.targets()...); err != nil {
			return nil, err
		}
		items = append(items, row.toDTO())
	}
	return items, rows.Err()
}

// Create inserts a new goal.
func (r *GoalRepo) Create(ctx context.Context, userID string, p domain.GoalPayload, dueDate *time.Time) (domain.GoalDTO, error) {
	id := p.ID
	if id == "" {
		id = domain.MustUUID()
	}

	var createdAt, updatedAt time.Time
	err := r.pool.QueryRow(ctx,
		`INSERT INTO goals (id, user_id, name, target, current, due_date, created_at, updated_at)
		 VALUES ($1, $2, $3, $4, $5, $6, NOW(), NOW())
		 RETURNING created_at, updated_at`,
		id, userID, p.Name, p.Target, p.Current, dueDate,
	).Scan(&createdAt, &updatedAt)
	if err != nil {
		return domain.GoalDTO{}, err
	}

	dto := domain.GoalDTO{
		ID: id, Name: p.Name, Target: p.Target, Current: p.Current,
		CreatedAt: domain.FormatTimeUTC(createdAt), UpdatedAt: domain.FormatTimeUTC(updatedAt),
	}
	if dueDate != nil {
		dto.DueDate = dueDate.Format("2006-01-02")
	}
	return dto, nil
}

// Update modifies an existing goal.
func (r *GoalRepo) Update(ctx context.Context, id, userID string, p domain.GoalPayload, dueDate *time.Time) (domain.GoalDTO, error) {
	var createdAt, updatedAt time.Time
	err := r.pool.QueryRow(ctx,
		`UPDATE goals SET name = $3, target = $4, current = $5, due_date = $6, updated_at = NOW()
		 WHERE id = $1 AND user_id = $2
		 RETURNING created_at, updated_at`,
		id, userID, p.Name, p.Target, p.Current, dueDate,
	).Scan(&createdAt, &updatedAt)

	if errors.Is(err, pgx.ErrNoRows) {
		return domain.GoalDTO{}, domain.ErrNotFound
	}
	if err != nil {
		return domain.GoalDTO{}, err
	}

	dto := domain.GoalDTO{
		ID: id, Name: p.Name, Target: p.Target, Current: p.Current,
		CreatedAt: domain.FormatTimeUTC(createdAt), UpdatedAt: domain.FormatTimeUTC(updatedAt),
	}
	if dueDate != nil {
		dto.DueDate = dueDate.Format("2006-01-02")
	}
	return dto, nil
}

// Delete removes a goal. Returns ErrNotFound if missing.
func (r *GoalRepo) Delete(ctx context.Context, id, userID string) error {
	tag, err := r.pool.Exec(ctx, `DELETE FROM goals WHERE id = $1 AND user_id = $2`, id, userID)
	if err != nil {
		return err
	}
	if tag.RowsAffected() == 0 {
		return domain.ErrNotFound
	}
	return nil
}

// AddContribution atomically adds amount to a goal's current value.
func (r *GoalRepo) AddContribution(ctx context.Context, id, userID string, amount float64) (domain.GoalDTO, error) {
	var row goalRow
	err := r.pool.QueryRow(ctx,
		`UPDATE goals SET current = current + $3, updated_at = NOW()
		 WHERE id = $1 AND user_id = $2
		 RETURNING `+goalColumns,
		id, userID, amount,
	).Scan(row.targets()...)

	if errors.Is(err, pgx.ErrNoRows) {
		return domain.GoalDTO{}, domain.ErrNotFound
	}
	if err != nil {
		return domain.GoalDTO{}, err
	}
	return row.toDTO(), nil
}
