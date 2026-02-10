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

// AccountRepo handles account persistence.
type AccountRepo struct {
	pool *pgxpool.Pool
}

func NewAccountRepo(pool *pgxpool.Pool) *AccountRepo {
	return &AccountRepo{pool: pool}
}

// ListAll returns all accounts for a user.
func (r *AccountRepo) ListAll(ctx context.Context, userID string) ([]domain.AccountDTO, error) {
	rows, err := r.pool.Query(ctx,
		`SELECT id::text, name, type, initial_balance::double precision, color, created_at, updated_at
		 FROM accounts WHERE user_id = $1 ORDER BY name`,
		userID,
	)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	items := make([]domain.AccountDTO, 0)
	for rows.Next() {
		var dto domain.AccountDTO
		var createdAt, updatedAt time.Time
		if err := rows.Scan(&dto.ID, &dto.Name, &dto.Type, &dto.InitialBalance, &dto.Color, &createdAt, &updatedAt); err != nil {
			return nil, err
		}
		dto.CreatedAt = domain.FormatTimeUTC(createdAt)
		dto.UpdatedAt = domain.FormatTimeUTC(updatedAt)
		items = append(items, dto)
	}
	return items, rows.Err()
}

// Create inserts a new account.
func (r *AccountRepo) Create(ctx context.Context, userID string, p domain.AccountPayload) (domain.AccountDTO, error) {
	id := p.ID
	if id == "" {
		id = domain.MustUUID()
	}

	var createdAt, updatedAt time.Time
	err := r.pool.QueryRow(ctx,
		`INSERT INTO accounts (id, user_id, name, type, initial_balance, color, created_at, updated_at)
		 VALUES ($1, $2, $3, $4, $5, $6, NOW(), NOW()) RETURNING created_at, updated_at`,
		id, userID, p.Name, p.Type, p.InitialBalance, p.Color,
	).Scan(&createdAt, &updatedAt)
	if err != nil {
		var pgErr *pgconn.PgError
		if errors.As(err, &pgErr) && pgErr.Code == "23505" {
			return domain.AccountDTO{}, domain.ErrConflict
		}
		return domain.AccountDTO{}, err
	}

	return domain.AccountDTO{
		ID: id, Name: p.Name, Type: p.Type, Color: p.Color,
		InitialBalance: p.InitialBalance,
		CreatedAt:      domain.FormatTimeUTC(createdAt),
		UpdatedAt:      domain.FormatTimeUTC(updatedAt),
	}, nil
}

// Update modifies an account.
func (r *AccountRepo) Update(ctx context.Context, id, userID string, p domain.AccountPayload) (domain.AccountDTO, error) {
	var createdAt, updatedAt time.Time
	err := r.pool.QueryRow(ctx,
		`UPDATE accounts SET name = $3, type = $4, initial_balance = $5, color = $6, updated_at = NOW()
		 WHERE id = $1 AND user_id = $2 RETURNING created_at, updated_at`,
		id, userID, p.Name, p.Type, p.InitialBalance, p.Color,
	).Scan(&createdAt, &updatedAt)
	if errors.Is(err, pgx.ErrNoRows) {
		return domain.AccountDTO{}, domain.ErrNotFound
	}
	if err != nil {
		var pgErr *pgconn.PgError
		if errors.As(err, &pgErr) && pgErr.Code == "23505" {
			return domain.AccountDTO{}, domain.ErrConflict
		}
		return domain.AccountDTO{}, err
	}
	return domain.AccountDTO{
		ID: id, Name: p.Name, Type: p.Type, Color: p.Color,
		InitialBalance: p.InitialBalance,
		CreatedAt:      domain.FormatTimeUTC(createdAt),
		UpdatedAt:      domain.FormatTimeUTC(updatedAt),
	}, nil
}

// Delete removes an account. Transactions are NOT deleted (account_id set to NULL via FK).
func (r *AccountRepo) Delete(ctx context.Context, id, userID string) error {
	tag, err := r.pool.Exec(ctx, `DELETE FROM accounts WHERE id = $1 AND user_id = $2`, id, userID)
	if err != nil {
		return err
	}
	if tag.RowsAffected() == 0 {
		return domain.ErrNotFound
	}
	return nil
}

// FindByID returns a single account by ID.
func (r *AccountRepo) FindByID(ctx context.Context, id, userID string) (domain.AccountDTO, error) {
	var dto domain.AccountDTO
	var createdAt, updatedAt time.Time
	err := r.pool.QueryRow(ctx,
		`SELECT id::text, name, type, initial_balance::double precision, color, created_at, updated_at
		 FROM accounts WHERE id = $1 AND user_id = $2`,
		id, userID,
	).Scan(&dto.ID, &dto.Name, &dto.Type, &dto.InitialBalance, &dto.Color, &createdAt, &updatedAt)
	if errors.Is(err, pgx.ErrNoRows) {
		return domain.AccountDTO{}, domain.ErrNotFound
	}
	if err != nil {
		return domain.AccountDTO{}, err
	}
	dto.CreatedAt = domain.FormatTimeUTC(createdAt)
	dto.UpdatedAt = domain.FormatTimeUTC(updatedAt)
	return dto, err
}
