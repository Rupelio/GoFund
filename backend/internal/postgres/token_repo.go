package postgres

import (
	"context"
	"crypto/rand"
	"encoding/hex"
	"errors"
	"time"

	"gestao/backend/internal/domain"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

// TokenRepo handles password reset token persistence.
type TokenRepo struct {
	pool *pgxpool.Pool
}

// NewTokenRepo creates a TokenRepo.
func NewTokenRepo(pool *pgxpool.Pool) *TokenRepo {
	return &TokenRepo{pool: pool}
}

// CreateResetToken generates a secure token for password reset.
// Invalidates any existing tokens for the user.
func (r *TokenRepo) CreateResetToken(ctx context.Context, userID string, ttl time.Duration) (string, error) {
	// Invalidate existing tokens for this user
	_, _ = r.pool.Exec(ctx,
		`UPDATE password_reset_tokens SET used = TRUE WHERE user_id = $1 AND used = FALSE`, userID)

	// Generate secure random token
	tokenBytes := make([]byte, 32)
	if _, err := rand.Read(tokenBytes); err != nil {
		return "", err
	}
	token := hex.EncodeToString(tokenBytes)

	id := domain.MustUUID()
	expiresAt := time.Now().Add(ttl)

	_, err := r.pool.Exec(ctx,
		`INSERT INTO password_reset_tokens (id, user_id, token, expires_at, used, created_at)
		 VALUES ($1, $2, $3, $4, FALSE, NOW())`,
		id, userID, token, expiresAt,
	)
	if err != nil {
		return "", err
	}

	return token, nil
}

// ValidateResetToken checks that a token is valid and returns the user ID.
func (r *TokenRepo) ValidateResetToken(ctx context.Context, token string) (string, error) {
	var userID string
	var expiresAt time.Time
	var used bool

	err := r.pool.QueryRow(ctx,
		`SELECT user_id::text, expires_at, used FROM password_reset_tokens WHERE token = $1`,
		token,
	).Scan(&userID, &expiresAt, &used)

	if errors.Is(err, pgx.ErrNoRows) {
		return "", domain.ErrNotFound
	}
	if err != nil {
		return "", err
	}
	if used {
		return "", domain.NewValidationError("token already used")
	}
	if time.Now().After(expiresAt) {
		return "", domain.NewValidationError("token expired")
	}

	return userID, nil
}

// MarkTokenUsed marks a token as consumed.
func (r *TokenRepo) MarkTokenUsed(ctx context.Context, token string) error {
	_, err := r.pool.Exec(ctx,
		`UPDATE password_reset_tokens SET used = TRUE WHERE token = $1`, token)
	return err
}

// CleanupExpired removes old expired tokens.
func (r *TokenRepo) CleanupExpired(ctx context.Context) error {
	_, err := r.pool.Exec(ctx,
		`DELETE FROM password_reset_tokens WHERE expires_at < NOW() - INTERVAL '24 hours'`)
	return err
}
