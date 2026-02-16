package postgres

import (
	"context"
	"errors"
	"fmt"
	"time"

	"gestao/backend/internal/domain"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgconn"
	"github.com/jackc/pgx/v5/pgxpool"
)

// TransactionRepo handles transaction persistence.
type TransactionRepo struct {
	pool *pgxpool.Pool
}

func NewTransactionRepo(pool *pgxpool.Pool) *TransactionRepo {
	return &TransactionRepo{pool: pool}
}

// scan helper
type transactionRow struct {
	dto                   domain.TransactionDTO
	sourceID              *string
	dateValue             time.Time
	recurrenceEnd         *time.Time
	accountID             *string
	transferDirection     *string
	transferCounterparty  *string
	transferGroupID       *string
	transferFromAccountID *string
	transferToAccountID   *string
	createdAt             time.Time
	updatedAt             time.Time
}

func (r *transactionRow) targets() []any {
	return []any{
		&r.dto.ID, &r.sourceID, &r.dateValue, &r.dto.Type, &r.dto.Category,
		&r.dto.Method, &r.dto.Description, &r.dto.Amount,
		&r.dto.Recurrence, &r.recurrenceEnd, &r.dto.Installments,
		&r.accountID,
		&r.transferDirection, &r.transferCounterparty, &r.transferGroupID,
		&r.transferFromAccountID, &r.transferToAccountID,
		&r.createdAt, &r.updatedAt,
	}
}

func (r *transactionRow) toDTO() domain.TransactionDTO {
	r.dto.Date = r.dateValue.Format("2006-01-02")
	if r.sourceID != nil {
		r.dto.SourceID = *r.sourceID
	}
	if r.recurrenceEnd != nil {
		r.dto.RecurrenceEnd = r.recurrenceEnd.Format("2006-01-02")
	}
	if r.accountID != nil {
		r.dto.AccountID = *r.accountID
	}
	if r.transferDirection != nil {
		r.dto.TransferDirection = *r.transferDirection
	}
	if r.transferCounterparty != nil {
		r.dto.TransferCounterparty = *r.transferCounterparty
	}
	if r.transferGroupID != nil {
		r.dto.TransferGroupID = *r.transferGroupID
	}
	if r.transferFromAccountID != nil {
		r.dto.TransferFromAccountID = *r.transferFromAccountID
	}
	if r.transferToAccountID != nil {
		r.dto.TransferToAccountID = *r.transferToAccountID
	}
	r.dto.CreatedAt = domain.FormatTimeUTC(r.createdAt)
	r.dto.UpdatedAt = domain.FormatTimeUTC(r.updatedAt)
	return r.dto
}

const transactionColumns = `id::text, source_id, date, type, category, method, description,
	amount::double precision, recurrence, recurrence_end, installments,
	account_id::text,
	transfer_direction, transfer_counterparty, transfer_group_id,
	transfer_from_account_id::text, transfer_to_account_id::text,
	created_at, updated_at`

// List returns a paginated slice of transactions, optionally filtered by month (YYYY-MM).
// Uses date range filter instead of to_char for index utilisation.
func (r *TransactionRepo) List(ctx context.Context, userID, month string, limit, offset int) ([]domain.TransactionDTO, int, error) {
	var (
		total     int
		startDate time.Time
		endDate   time.Time
		hasMonth  = month != ""
	)

	if hasMonth {
		var err error
		startDate, err = time.Parse("2006-01", month)
		if err != nil {
			return nil, 0, fmt.Errorf("invalid month format: %w", err)
		}
		endDate = startDate.AddDate(0, 1, 0)
	}

	// Count
	if hasMonth {
		err := r.pool.QueryRow(ctx,
			`SELECT count(*) FROM transactions WHERE user_id = $1 AND date >= $2 AND date < $3`,
			userID, startDate, endDate,
		).Scan(&total)
		if err != nil {
			return nil, 0, err
		}
	} else {
		err := r.pool.QueryRow(ctx,
			`SELECT count(*) FROM transactions WHERE user_id = $1`, userID,
		).Scan(&total)
		if err != nil {
			return nil, 0, err
		}
	}

	// Data
	var query string
	var args []any
	if hasMonth {
		query = fmt.Sprintf(
			`SELECT %s FROM transactions WHERE user_id = $1 AND date >= $2 AND date < $3 ORDER BY date DESC, created_at DESC LIMIT $4 OFFSET $5`,
			transactionColumns,
		)
		args = []any{userID, startDate, endDate, limit, offset}
	} else {
		query = fmt.Sprintf(
			`SELECT %s FROM transactions WHERE user_id = $1 ORDER BY date DESC, created_at DESC LIMIT $2 OFFSET $3`,
			transactionColumns,
		)
		args = []any{userID, limit, offset}
	}

	rows, err := r.pool.Query(ctx, query, args...)
	if err != nil {
		return nil, 0, err
	}
	defer rows.Close()

	items := make([]domain.TransactionDTO, 0, min(total, limit))
	for rows.Next() {
		var row transactionRow
		if err := rows.Scan(row.targets()...); err != nil {
			return nil, 0, err
		}
		items = append(items, row.toDTO())
	}
	return items, total, rows.Err()
}

// ListAll returns all transactions for a user (used by bootstrap).
func (r *TransactionRepo) ListAll(ctx context.Context, userID string) ([]domain.TransactionDTO, error) {
	query := fmt.Sprintf(
		`SELECT %s FROM transactions WHERE user_id = $1 ORDER BY date DESC, created_at DESC`,
		transactionColumns,
	)
	rows, err := r.pool.Query(ctx, query, userID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	items := make([]domain.TransactionDTO, 0)
	for rows.Next() {
		var row transactionRow
		if err := rows.Scan(row.targets()...); err != nil {
			return nil, err
		}
		items = append(items, row.toDTO())
	}
	return items, rows.Err()
}

// FindByID returns a single transaction owned by userID.
func (r *TransactionRepo) FindByID(ctx context.Context, id, userID string) (domain.TransactionDTO, error) {
	query := fmt.Sprintf(`SELECT %s FROM transactions WHERE id = $1 AND user_id = $2`, transactionColumns)
	var row transactionRow
	err := r.pool.QueryRow(ctx, query, id, userID).Scan(row.targets()...)
	if errors.Is(err, pgx.ErrNoRows) {
		return domain.TransactionDTO{}, domain.ErrNotFound
	}
	if err != nil {
		return domain.TransactionDTO{}, err
	}
	return row.toDTO(), nil
}

// FindInitialBalanceByAccount finds the synthetic "Saldo inicial" transaction for an account.
func (r *TransactionRepo) FindInitialBalanceByAccount(ctx context.Context, userID, accountID string) (domain.TransactionDTO, error) {
	query := fmt.Sprintf(
		`SELECT %s
		 FROM transactions
		 WHERE user_id = $1
		   AND account_id = $2
		   AND type = 'receita'
		   AND description = 'Saldo inicial'
		 ORDER BY created_at ASC
		 LIMIT 1`,
		transactionColumns,
	)

	var row transactionRow
	err := r.pool.QueryRow(ctx, query, userID, accountID).Scan(row.targets()...)
	if errors.Is(err, pgx.ErrNoRows) {
		return domain.TransactionDTO{}, domain.ErrNotFound
	}
	if err != nil {
		return domain.TransactionDTO{}, err
	}
	return row.toDTO(), nil
}

// Create inserts a new transaction.
func (r *TransactionRepo) Create(ctx context.Context, userID string, dateValue time.Time, recurrenceEnd *time.Time, p domain.TransactionPayload) (domain.TransactionDTO, error) {
	id := p.ID
	if id == "" {
		id = domain.MustUUID()
	}

	var accountID *string
	if p.AccountID != "" {
		accountID = &p.AccountID
	}
	var transferDirection *string
	if p.TransferDirection != "" {
		transferDirection = &p.TransferDirection
	}
	var transferCounterparty *string
	if p.TransferCounterparty != "" {
		transferCounterparty = &p.TransferCounterparty
	}
	var transferGroupID *string
	if p.TransferGroupID != "" {
		transferGroupID = &p.TransferGroupID
	}
	var transferFromAccountID *string
	if p.TransferFromAccountID != "" {
		transferFromAccountID = &p.TransferFromAccountID
	}
	var transferToAccountID *string
	if p.TransferToAccountID != "" {
		transferToAccountID = &p.TransferToAccountID
	}

	var createdAt, updatedAt time.Time
	err := r.pool.QueryRow(ctx,
		`INSERT INTO transactions (
			id, user_id, date, type, category, method, description, amount,
			recurrence, recurrence_end, installments, account_id,
			transfer_direction, transfer_counterparty, transfer_group_id, transfer_from_account_id, transfer_to_account_id,
			created_at, updated_at
		) VALUES (
			$1, $2, $3, $4, $5, $6, $7, $8,
			$9, $10, $11, $12,
			$13, $14, $15, $16, $17,
			NOW(), NOW()
		)
		 RETURNING created_at, updated_at`,
		id, userID, dateValue, p.Type, p.Category, p.Method, p.Description, p.Amount,
		p.Recurrence, recurrenceEnd, p.Installments, accountID,
		transferDirection, transferCounterparty, transferGroupID, transferFromAccountID, transferToAccountID,
	).Scan(&createdAt, &updatedAt)
	if err != nil {
		var pgErr *pgconn.PgError
		if errors.As(err, &pgErr) && pgErr.Code == "23505" {
			return domain.TransactionDTO{}, domain.ErrConflict
		}
		return domain.TransactionDTO{}, err
	}

	dto := domain.TransactionDTO{
		ID: id, Date: dateValue.Format("2006-01-02"),
		Type: p.Type, Category: p.Category, Method: p.Method,
		Description: p.Description, Amount: p.Amount,
		Recurrence: p.Recurrence, Installments: p.Installments,
		AccountID:         p.AccountID,
		TransferDirection: p.TransferDirection, TransferCounterparty: p.TransferCounterparty,
		TransferGroupID: p.TransferGroupID, TransferFromAccountID: p.TransferFromAccountID, TransferToAccountID: p.TransferToAccountID,
		CreatedAt: domain.FormatTimeUTC(createdAt), UpdatedAt: domain.FormatTimeUTC(updatedAt),
	}
	if recurrenceEnd != nil {
		dto.RecurrenceEnd = recurrenceEnd.Format("2006-01-02")
	}
	return dto, nil
}

// CreateImported inserts one transaction for CSV import.
// Returns imported=false when the row was skipped due to idempotency/conflict.
func (r *TransactionRepo) CreateImported(ctx context.Context, userID string, dateValue time.Time, recurrenceEnd *time.Time, p domain.TransactionPayload, dedupeKey string, meta *domain.TransactionImportMetadata) (bool, error) {
	id := domain.MustUUID()
	var sourceID *string
	if p.ID != "" {
		sourceID = &p.ID
	}

	// Backward-compatibility dedupe:
	// older imports could have been stored with fingerprint-based dedupe keys
	// (without external id). If current row has external id, also check the
	// fallback fingerprint key to avoid re-importing the same transaction.
	fallbackDedupeKey := domain.TransactionDedupeKey(dateValue, p.Description, p.Amount, p.Recurrence, p.Installments, "")
	if dedupeKey != fallbackDedupeKey {
		var alreadyExists bool
		if err := r.pool.QueryRow(ctx,
			`SELECT EXISTS (
				SELECT 1
				FROM transactions
				WHERE user_id = $1 AND dedupe_key = $2
			)`,
			userID, fallbackDedupeKey,
		).Scan(&alreadyExists); err != nil {
			return false, err
		}
		if alreadyExists {
			return false, nil
		}
	}

	var accountID *string
	if p.AccountID != "" {
		accountID = &p.AccountID
	}
	var transferDirection *string
	if p.TransferDirection != "" {
		transferDirection = &p.TransferDirection
	}
	var transferCounterparty *string
	if p.TransferCounterparty != "" {
		transferCounterparty = &p.TransferCounterparty
	}
	var transferGroupID *string
	if p.TransferGroupID != "" {
		transferGroupID = &p.TransferGroupID
	}
	var transferFromAccountID *string
	if p.TransferFromAccountID != "" {
		transferFromAccountID = &p.TransferFromAccountID
	}
	var transferToAccountID *string
	if p.TransferToAccountID != "" {
		transferToAccountID = &p.TransferToAccountID
	}

	var importBatchID, importJobID, importFileName *string
	var importRowIndex *int
	if meta != nil {
		if meta.BatchID != "" {
			importBatchID = &meta.BatchID
		}
		if meta.JobID != "" {
			importJobID = &meta.JobID
		}
		if meta.FileName != "" {
			importFileName = &meta.FileName
		}
		if meta.RowIndex > 0 {
			importRowIndex = &meta.RowIndex
		}
	}

	var createdAt time.Time
	err := r.pool.QueryRow(ctx,
		`INSERT INTO transactions (
			id, user_id, date, type, category, method, description, amount,
			recurrence, recurrence_end, installments, account_id, dedupe_key, source_id,
			transfer_direction, transfer_counterparty, transfer_group_id, transfer_from_account_id, transfer_to_account_id,
			import_batch_id, import_job_id, import_file_name, import_row_index,
			created_at, updated_at
		) VALUES (
			$1, $2, $3, $4, $5, $6, $7, $8,
			$9, $10, $11, $12, $13, $14,
			$15, $16, $17, $18, $19,
			$20, $21, $22, $23,
			NOW(), NOW()
		)
		ON CONFLICT DO NOTHING
		RETURNING created_at`,
		id, userID, dateValue, p.Type, p.Category, p.Method, p.Description, p.Amount,
		p.Recurrence, recurrenceEnd, p.Installments, accountID, dedupeKey, sourceID,
		transferDirection, transferCounterparty, transferGroupID, transferFromAccountID, transferToAccountID,
		importBatchID, importJobID, importFileName, importRowIndex,
	).Scan(&createdAt)
	if errors.Is(err, pgx.ErrNoRows) {
		return false, nil
	}
	if err != nil {
		var pgErr *pgconn.PgError
		if errors.As(err, &pgErr) {
			switch pgErr.Code {
			case "23503", "23514", "22P02":
				return false, domain.NewValidationError("invalid transaction row")
			case "23505":
				return false, nil
			}
		}
		return false, err
	}
	return true, nil
}

// DeleteByImportBatch removes all imported transactions from a specific batch.
func (r *TransactionRepo) DeleteByImportBatch(ctx context.Context, userID, batchID string) (int64, error) {
	tag, err := r.pool.Exec(ctx, `DELETE FROM transactions WHERE user_id = $1 AND import_batch_id = $2`, userID, batchID)
	if err != nil {
		return 0, err
	}
	return tag.RowsAffected(), nil
}

// Update modifies an existing transaction.
func (r *TransactionRepo) Update(ctx context.Context, id, userID string, dateValue time.Time, recurrenceEnd *time.Time, p domain.TransactionPayload) (domain.TransactionDTO, error) {
	var accountID *string
	if p.AccountID != "" {
		accountID = &p.AccountID
	}
	var transferDirection *string
	if p.TransferDirection != "" {
		transferDirection = &p.TransferDirection
	}
	var transferCounterparty *string
	if p.TransferCounterparty != "" {
		transferCounterparty = &p.TransferCounterparty
	}
	var transferGroupID *string
	if p.TransferGroupID != "" {
		transferGroupID = &p.TransferGroupID
	}
	var transferFromAccountID *string
	if p.TransferFromAccountID != "" {
		transferFromAccountID = &p.TransferFromAccountID
	}
	var transferToAccountID *string
	if p.TransferToAccountID != "" {
		transferToAccountID = &p.TransferToAccountID
	}

	var createdAt, updatedAt time.Time
	err := r.pool.QueryRow(ctx,
		`UPDATE transactions
		 SET date = $3, type = $4, category = $5, method = $6, description = $7,
		     amount = $8, recurrence = $9, recurrence_end = $10, installments = $11, account_id = $12,
		     transfer_direction = $13, transfer_counterparty = $14, transfer_group_id = $15,
		     transfer_from_account_id = $16, transfer_to_account_id = $17,
		     updated_at = NOW()
		 WHERE id = $1 AND user_id = $2
		 RETURNING created_at, updated_at`,
		id, userID, dateValue, p.Type, p.Category, p.Method, p.Description, p.Amount, p.Recurrence, recurrenceEnd, p.Installments, accountID,
		transferDirection, transferCounterparty, transferGroupID, transferFromAccountID, transferToAccountID,
	).Scan(&createdAt, &updatedAt)

	if errors.Is(err, pgx.ErrNoRows) {
		return domain.TransactionDTO{}, domain.ErrNotFound
	}
	if err != nil {
		var pgErr *pgconn.PgError
		if errors.As(err, &pgErr) && pgErr.Code == "23505" {
			return domain.TransactionDTO{}, domain.ErrConflict
		}
		return domain.TransactionDTO{}, err
	}

	dto := domain.TransactionDTO{
		ID: id, Date: dateValue.Format("2006-01-02"),
		Type: p.Type, Category: p.Category, Method: p.Method,
		Description: p.Description, Amount: p.Amount,
		Recurrence: p.Recurrence, Installments: p.Installments,
		AccountID:         p.AccountID,
		TransferDirection: p.TransferDirection, TransferCounterparty: p.TransferCounterparty,
		TransferGroupID: p.TransferGroupID, TransferFromAccountID: p.TransferFromAccountID, TransferToAccountID: p.TransferToAccountID,
		CreatedAt: domain.FormatTimeUTC(createdAt), UpdatedAt: domain.FormatTimeUTC(updatedAt),
	}
	if recurrenceEnd != nil {
		dto.RecurrenceEnd = recurrenceEnd.Format("2006-01-02")
	}
	return dto, nil
}

// Delete removes a transaction by ID. Returns ErrNotFound if not owned by user.
func (r *TransactionRepo) Delete(ctx context.Context, id, userID string) error {
	tag, err := r.pool.Exec(ctx, `DELETE FROM transactions WHERE id = $1 AND user_id = $2`, id, userID)
	if err != nil {
		return err
	}
	if tag.RowsAffected() == 0 {
		return domain.ErrNotFound
	}
	return nil
}

// DeleteAll removes all transactions for a user. Returns the count of deleted rows.
func (r *TransactionRepo) DeleteAll(ctx context.Context, userID string) (int64, error) {
	tag, err := r.pool.Exec(ctx, `DELETE FROM transactions WHERE user_id = $1`, userID)
	if err != nil {
		return 0, err
	}
	return tag.RowsAffected(), nil
}
