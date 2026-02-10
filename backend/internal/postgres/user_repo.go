package postgres

import (
	"context"
	"errors"
	"time"

	"gestao/backend/internal/domain"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgconn"
	"github.com/jackc/pgx/v5/pgxpool"
	"golang.org/x/crypto/bcrypt"
)

// UserRepo handles user persistence.
type UserRepo struct {
	pool *pgxpool.Pool
}

func NewUserRepo(pool *pgxpool.Pool) *UserRepo {
	return &UserRepo{pool: pool}
}

// Create inserts a new user and returns the DTO.
func (r *UserRepo) Create(ctx context.Context, name, email, password string) (domain.UserDTO, error) {
	hash, err := bcrypt.GenerateFromPassword([]byte(password), bcrypt.DefaultCost)
	if err != nil {
		return domain.UserDTO{}, err
	}

	id := domain.MustUUID()
	var createdAt, updatedAt time.Time

	err = r.pool.QueryRow(ctx,
		`INSERT INTO users (id, name, email, password_hash, created_at, updated_at)
		 VALUES ($1, $2, $3, $4, NOW(), NOW())
		 RETURNING created_at, updated_at`,
		id, name, email, string(hash),
	).Scan(&createdAt, &updatedAt)

	if err != nil {
		var pgErr *pgconn.PgError
		if errors.As(err, &pgErr) && pgErr.Code == "23505" {
			return domain.UserDTO{}, domain.ErrConflict
		}
		return domain.UserDTO{}, err
	}

	return domain.UserDTO{
		ID: id, Name: name, Email: email,
		CreatedAt: domain.FormatTimeUTC(createdAt),
		UpdatedAt: domain.FormatTimeUTC(updatedAt),
	}, nil
}

// FindByEmail returns the user DTO and password hash for authentication.
func (r *UserRepo) FindByEmail(ctx context.Context, email string) (domain.UserDTO, string, error) {
	var (
		user         domain.UserDTO
		passwordHash string
		createdAt    time.Time
		updatedAt    time.Time
	)

	err := r.pool.QueryRow(ctx,
		`SELECT id::text, name, email, password_hash, created_at, updated_at
		 FROM users WHERE email = $1`, email,
	).Scan(&user.ID, &user.Name, &user.Email, &passwordHash, &createdAt, &updatedAt)

	if errors.Is(err, pgx.ErrNoRows) {
		return domain.UserDTO{}, "", domain.ErrNotFound
	}
	if err != nil {
		return domain.UserDTO{}, "", err
	}

	user.CreatedAt = domain.FormatTimeUTC(createdAt)
	user.UpdatedAt = domain.FormatTimeUTC(updatedAt)
	return user, passwordHash, nil
}

// FindByID returns a user by primary key.
func (r *UserRepo) FindByID(ctx context.Context, id string) (domain.UserDTO, error) {
	var (
		dto       domain.UserDTO
		createdAt time.Time
		updatedAt time.Time
	)

	err := r.pool.QueryRow(ctx,
		`SELECT id::text, name, email, created_at, updated_at FROM users WHERE id = $1`, id,
	).Scan(&dto.ID, &dto.Name, &dto.Email, &createdAt, &updatedAt)

	if errors.Is(err, pgx.ErrNoRows) {
		return domain.UserDTO{}, domain.ErrNotFound
	}
	if err != nil {
		return domain.UserDTO{}, err
	}

	dto.CreatedAt = domain.FormatTimeUTC(createdAt)
	dto.UpdatedAt = domain.FormatTimeUTC(updatedAt)
	return dto, nil
}

// GetPasswordHash returns the bcrypt hash for a user.
func (r *UserRepo) GetPasswordHash(ctx context.Context, userID string) (string, error) {
	var hash string
	err := r.pool.QueryRow(ctx, `SELECT password_hash FROM users WHERE id = $1`, userID).Scan(&hash)
	if errors.Is(err, pgx.ErrNoRows) {
		return "", domain.ErrNotFound
	}
	return hash, err
}

// UpdatePassword changes a user's password hash.
func (r *UserRepo) UpdatePassword(ctx context.Context, userID, newPassword string) error {
	hash, err := bcrypt.GenerateFromPassword([]byte(newPassword), bcrypt.DefaultCost)
	if err != nil {
		return err
	}
	_, err = r.pool.Exec(ctx,
		`UPDATE users SET password_hash = $1, updated_at = NOW() WHERE id = $2`,
		string(hash), userID,
	)
	return err
}
