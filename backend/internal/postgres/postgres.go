package postgres

import (
	"context"
	"errors"
	"fmt"
	"log/slog"
	"strings"
	"time"

	"gestao/backend/internal/config"
	"gestao/backend/internal/domain"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
	"golang.org/x/crypto/bcrypt"
)

// NewPool creates a connection pool with configurable retry.
func NewPool(ctx context.Context, cfg config.Config) (*pgxpool.Pool, error) {
	var lastErr error

	poolCfg, err := pgxpool.ParseConfig(cfg.DatabaseURL)
	if err != nil {
		return nil, fmt.Errorf("parse database URL: %w", err)
	}

	poolCfg.MaxConns = cfg.DBMaxConns
	poolCfg.MinConns = cfg.DBMinConns
	poolCfg.MaxConnLifetime = 2 * time.Hour
	poolCfg.MaxConnIdleTime = 30 * time.Minute
	poolCfg.HealthCheckPeriod = 1 * time.Minute

	for attempt := 1; attempt <= cfg.DBConnectRetries; attempt++ {
		pool, err := pgxpool.NewWithConfig(ctx, poolCfg)
		if err != nil {
			lastErr = err
			slog.Warn("database connection attempt failed", "attempt", attempt, "error", err)
			time.Sleep(cfg.DBConnectRetryDelay)
			continue
		}

		pingCtx, cancel := context.WithTimeout(ctx, 4*time.Second)
		pingErr := pool.Ping(pingCtx)
		cancel()
		if pingErr == nil {
			return pool, nil
		}

		lastErr = pingErr
		pool.Close()
		slog.Warn("database ping failed", "attempt", attempt, "error", pingErr)
		time.Sleep(cfg.DBConnectRetryDelay)
	}

	return nil, fmt.Errorf("database unavailable after %d attempts: %w", cfg.DBConnectRetries, lastErr)
}

// RunMigrations applies all schema migrations idempotently.
func RunMigrations(ctx context.Context, pool *pgxpool.Pool) error {
	if err := execStatements(ctx, pool,
		`CREATE TABLE IF NOT EXISTS users (
			id UUID PRIMARY KEY,
			name TEXT NOT NULL,
			email TEXT NOT NULL UNIQUE,
			password_hash TEXT NOT NULL,
			created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
			updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
		)`,
		`CREATE TABLE IF NOT EXISTS transactions (
			id UUID PRIMARY KEY,
			user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
			date DATE NOT NULL,
			type TEXT NOT NULL CHECK (type IN ('receita', 'despesa', 'investimento')),
			category TEXT NOT NULL,
			method TEXT NOT NULL,
			description TEXT NOT NULL,
			amount NUMERIC(12,2) NOT NULL CHECK (amount > 0),
			created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
			updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
		)`,
		`CREATE TABLE IF NOT EXISTS budgets (
			id UUID PRIMARY KEY,
			user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
			category TEXT NOT NULL,
			limit_amount NUMERIC(12,2) NOT NULL CHECK (limit_amount > 0),
			created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
			updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
			UNIQUE (user_id, category)
		)`,
		`CREATE TABLE IF NOT EXISTS goals (
			id UUID PRIMARY KEY,
			user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
			name TEXT NOT NULL,
			target NUMERIC(12,2) NOT NULL CHECK (target > 0),
			current NUMERIC(12,2) NOT NULL DEFAULT 0 CHECK (current >= 0),
			due_date DATE,
			created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
			updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
		)`,
		`CREATE TABLE IF NOT EXISTS projection_settings (
			user_id UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
			months INT NOT NULL DEFAULT 6 CHECK (months >= 1 AND months <= 24),
			income NUMERIC(12,2),
			expense NUMERIC(12,2),
			investment NUMERIC(12,2),
			updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
		)`,
	); err != nil {
		return err
	}

	legacyUserID, err := ensureMigrationUser(ctx, pool)
	if err != nil {
		return err
	}
	if err := migrateLegacyTables(ctx, pool, legacyUserID); err != nil {
		return err
	}

	// Recurring transaction support.
	if err := execStatements(ctx, pool,
		`ALTER TABLE transactions ADD COLUMN IF NOT EXISTS recurrence TEXT NOT NULL DEFAULT 'none'`,
		`ALTER TABLE transactions ADD COLUMN IF NOT EXISTS recurrence_end DATE`,
		`ALTER TABLE transactions ADD COLUMN IF NOT EXISTS installments INT NOT NULL DEFAULT 0`,
		`ALTER TABLE transactions ADD COLUMN IF NOT EXISTS dedupe_key TEXT`,
	); err != nil {
		return err
	}

	// Categories & Accounts.
	if err := execStatements(ctx, pool,
		`CREATE TABLE IF NOT EXISTS categories (
			id UUID PRIMARY KEY,
			user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
			name TEXT NOT NULL,
			type TEXT NOT NULL CHECK (type IN ('receita', 'despesa', 'investimento', 'todas')),
			icon TEXT NOT NULL DEFAULT '📁',
			created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
			UNIQUE (user_id, name)
		)`,
		`CREATE TABLE IF NOT EXISTS accounts (
			id UUID PRIMARY KEY,
			user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
			name TEXT NOT NULL,
			type TEXT NOT NULL CHECK (type IN ('corrente', 'poupanca', 'carteira', 'investimento')),
			initial_balance NUMERIC(12,2) NOT NULL DEFAULT 0,
			color TEXT NOT NULL DEFAULT '#5e7fff',
			created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
			updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
			UNIQUE (user_id, name)
		)`,
		`ALTER TABLE transactions ADD COLUMN IF NOT EXISTS account_id UUID REFERENCES accounts(id) ON DELETE SET NULL`,
	); err != nil {
		return err
	}

	return execStatements(ctx, pool,
		`CREATE INDEX IF NOT EXISTS idx_transactions_user_date ON transactions (user_id, date DESC, created_at DESC)`,
		`CREATE UNIQUE INDEX IF NOT EXISTS idx_transactions_user_dedupe_key ON transactions (user_id, dedupe_key) WHERE dedupe_key IS NOT NULL`,
		`CREATE INDEX IF NOT EXISTS idx_goals_user_due_date ON goals (user_id, due_date)`,
		`CREATE INDEX IF NOT EXISTS idx_categories_user ON categories (user_id)`,
		`CREATE INDEX IF NOT EXISTS idx_accounts_user ON accounts (user_id)`,
		`CREATE INDEX IF NOT EXISTS idx_transactions_account ON transactions (account_id)`,
		`CREATE TABLE IF NOT EXISTS password_reset_tokens (
			id UUID PRIMARY KEY,
			user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
			token TEXT NOT NULL UNIQUE,
			expires_at TIMESTAMPTZ NOT NULL,
			used BOOLEAN NOT NULL DEFAULT FALSE,
			created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
		)`,
		`CREATE INDEX IF NOT EXISTS idx_reset_tokens_token ON password_reset_tokens (token) WHERE used = FALSE`,
		// Migrate transaction type CHECK to include 'transferencia'
		`DO $$ BEGIN
			ALTER TABLE transactions DROP CONSTRAINT IF EXISTS transactions_type_check;
			ALTER TABLE transactions ADD CONSTRAINT transactions_type_check CHECK (type IN ('receita', 'despesa', 'investimento', 'transferencia'));
		END $$`,
		// Migrate account type CHECK to include 'credito'
		`DO $$ BEGIN
			ALTER TABLE accounts DROP CONSTRAINT IF EXISTS accounts_type_check;
			ALTER TABLE accounts ADD CONSTRAINT accounts_type_check CHECK (type IN ('corrente', 'poupanca', 'carteira', 'investimento', 'credito'));
		END $$`,
		// Migrate legacy initial-balance transactions to a supported method.
		`UPDATE transactions
		 SET method = 'transferencia'
		 WHERE description = 'Saldo inicial'
		   AND method = 'outros'`,
	)
}

func migrateLegacyTables(ctx context.Context, pool *pgxpool.Pool, userID string) error {
	if err := execStatements(ctx, pool,
		`ALTER TABLE transactions ADD COLUMN IF NOT EXISTS user_id UUID`,
		`ALTER TABLE budgets ADD COLUMN IF NOT EXISTS user_id UUID`,
		`ALTER TABLE goals ADD COLUMN IF NOT EXISTS user_id UUID`,
		`ALTER TABLE projection_settings ADD COLUMN IF NOT EXISTS user_id UUID`,
	); err != nil {
		return err
	}

	tables := []string{"transactions", "budgets", "goals", "projection_settings"}
	for _, t := range tables {
		if _, err := pool.Exec(ctx, fmt.Sprintf(`UPDATE %s SET user_id = $1 WHERE user_id IS NULL`, t), userID); err != nil {
			return err
		}
	}

	if err := execStatements(ctx, pool,
		`ALTER TABLE transactions ALTER COLUMN user_id SET NOT NULL`,
		`ALTER TABLE budgets ALTER COLUMN user_id SET NOT NULL`,
		`ALTER TABLE goals ALTER COLUMN user_id SET NOT NULL`,
		`ALTER TABLE projection_settings ALTER COLUMN user_id SET NOT NULL`,
		`ALTER TABLE budgets DROP CONSTRAINT IF EXISTS budgets_category_key`,
		`ALTER TABLE budgets DROP CONSTRAINT IF EXISTS budgets_user_id_category_key`,
		`ALTER TABLE budgets ADD CONSTRAINT budgets_user_id_category_key UNIQUE (user_id, category)`,
		`ALTER TABLE projection_settings DROP CONSTRAINT IF EXISTS projection_settings_id_check`,
		`ALTER TABLE projection_settings DROP CONSTRAINT IF EXISTS projection_settings_pkey`,
		`ALTER TABLE projection_settings DROP COLUMN IF EXISTS id`,
		`ALTER TABLE projection_settings ADD CONSTRAINT projection_settings_pkey PRIMARY KEY (user_id)`,
	); err != nil {
		return err
	}

	fkeys := []struct{ constraint, table string }{
		{"transactions_user_id_fkey", "transactions"},
		{"budgets_user_id_fkey", "budgets"},
		{"goals_user_id_fkey", "goals"},
		{"projection_settings_user_id_fkey", "projection_settings"},
	}
	for _, fk := range fkeys {
		stmt := fmt.Sprintf(`
			DO $$ BEGIN
				IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = '%s') THEN
					ALTER TABLE %s ADD CONSTRAINT %s FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE;
				END IF;
			END $$`, fk.constraint, fk.table, fk.constraint)
		if _, err := pool.Exec(ctx, stmt); err != nil {
			return err
		}
	}

	return nil
}

func ensureMigrationUser(ctx context.Context, pool *pgxpool.Pool) (string, error) {
	var existingID string
	err := pool.QueryRow(ctx, `SELECT id::text FROM users ORDER BY created_at ASC LIMIT 1`).Scan(&existingID)
	if err == nil {
		return existingID, nil
	}
	if !errors.Is(err, pgx.ErrNoRows) {
		return "", err
	}

	id := domain.MustUUID()
	email := fmt.Sprintf("legacy-%s@gofund.local", strings.ReplaceAll(id, "-", ""))
	hash, err := bcrypt.GenerateFromPassword([]byte(domain.MustUUID()), bcrypt.MinCost)
	if err != nil {
		return "", err
	}

	_, err = pool.Exec(ctx,
		`INSERT INTO users (id, name, email, password_hash, created_at, updated_at) VALUES ($1, $2, $3, $4, NOW(), NOW())`,
		id, "Conta Migrada", email, string(hash),
	)
	return id, err
}

func execStatements(ctx context.Context, pool *pgxpool.Pool, stmts ...string) error {
	for _, s := range stmts {
		if _, err := pool.Exec(ctx, s); err != nil {
			return err
		}
	}
	return nil
}
