package postgres

import (
	"context"
	"encoding/json"
	"errors"
	"time"

	"gestao/backend/internal/domain"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

type ImportJobRepo struct {
	pool *pgxpool.Pool
}

func NewImportJobRepo(pool *pgxpool.Pool) *ImportJobRepo {
	return &ImportJobRepo{pool: pool}
}

func (r *ImportJobRepo) Create(ctx context.Context, userID, jobID, batchID string, total int, files []domain.TransactionImportFileResult) (domain.TransactionImportJobDTO, error) {
	filesJSON, err := json.Marshal(files)
	if err != nil {
		return domain.TransactionImportJobDTO{}, err
	}

	var createdAt, updatedAt time.Time
	err = r.pool.QueryRow(ctx, `
		INSERT INTO transaction_import_jobs (
			id, user_id, batch_id, status,
			total_rows, files_json,
			created_at, updated_at
		) VALUES (
			$1, $2, $3, 'pending',
			$4, $5::jsonb,
			NOW(), NOW()
		)
		RETURNING created_at, updated_at
	`, jobID, userID, batchID, total, string(filesJSON)).Scan(&createdAt, &updatedAt)
	if err != nil {
		return domain.TransactionImportJobDTO{}, err
	}

	return domain.TransactionImportJobDTO{
		ID:      jobID,
		BatchID: batchID,
		Status:  "pending",
		Result: domain.TransactionImportResult{
			Total: total,
		},
		Files:     files,
		CreatedAt: domain.FormatTimeUTC(createdAt),
		UpdatedAt: domain.FormatTimeUTC(updatedAt),
	}, nil
}

func (r *ImportJobRepo) MarkRunning(ctx context.Context, userID, jobID string) error {
	tag, err := r.pool.Exec(ctx, `
		UPDATE transaction_import_jobs
		SET status = 'running',
			started_at = COALESCE(started_at, NOW()),
			updated_at = NOW()
		WHERE id = $1 AND user_id = $2
	`, jobID, userID)
	if err != nil {
		return err
	}
	if tag.RowsAffected() == 0 {
		return domain.ErrNotFound
	}
	return nil
}

func (r *ImportJobRepo) UpdateProgress(ctx context.Context, userID, jobID string, result domain.TransactionImportResult, files []domain.TransactionImportFileResult) error {
	filesJSON, err := json.Marshal(files)
	if err != nil {
		return err
	}

	tag, err := r.pool.Exec(ctx, `
		UPDATE transaction_import_jobs
		SET status = 'running',
			total_rows = $3,
			processed_rows = $4,
			valid_rows = $5,
			imported_rows = $6,
			duplicates_rows = $7,
			invalid_rows = $8,
			failed_rows = $9,
			files_json = $10::jsonb,
			updated_at = NOW()
		WHERE id = $1 AND user_id = $2
	`, jobID, userID, result.Total, result.Imported+result.Duplicates+result.Invalid+result.Failed, result.Valid, result.Imported, result.Duplicates, result.Invalid, result.Failed, string(filesJSON))
	if err != nil {
		return err
	}
	if tag.RowsAffected() == 0 {
		return domain.ErrNotFound
	}
	return nil
}

func (r *ImportJobRepo) Complete(ctx context.Context, userID, jobID, status string, result domain.TransactionImportResult, files []domain.TransactionImportFileResult, errorMessage string) error {
	filesJSON, err := json.Marshal(files)
	if err != nil {
		return err
	}

	tag, err := r.pool.Exec(ctx, `
		UPDATE transaction_import_jobs
		SET status = $3,
			total_rows = $4,
			processed_rows = $5,
			valid_rows = $6,
			imported_rows = $7,
			duplicates_rows = $8,
			invalid_rows = $9,
			failed_rows = $10,
			files_json = $11::jsonb,
			error_message = NULLIF($12, ''),
			finished_at = NOW(),
			updated_at = NOW()
		WHERE id = $1 AND user_id = $2
	`, jobID, userID, status, result.Total, result.Imported+result.Duplicates+result.Invalid+result.Failed, result.Valid, result.Imported, result.Duplicates, result.Invalid, result.Failed, string(filesJSON), errorMessage)
	if err != nil {
		return err
	}
	if tag.RowsAffected() == 0 {
		return domain.ErrNotFound
	}
	return nil
}

func (r *ImportJobRepo) FindByID(ctx context.Context, userID, jobID string) (domain.TransactionImportJobDTO, error) {
	var (
		dto       domain.TransactionImportJobDTO
		filesJSON []byte
		startedAt *time.Time
		finished  *time.Time
		createdAt time.Time
		updatedAt time.Time
	)

	err := r.pool.QueryRow(ctx, `
		SELECT
			id::text,
			batch_id::text,
			status,
			total_rows,
			valid_rows,
			imported_rows,
			duplicates_rows,
			invalid_rows,
			failed_rows,
			files_json,
			COALESCE(error_message, ''),
			created_at,
			started_at,
			finished_at,
			updated_at
		FROM transaction_import_jobs
		WHERE id = $1 AND user_id = $2
	`, jobID, userID).Scan(
		&dto.ID,
		&dto.BatchID,
		&dto.Status,
		&dto.Result.Total,
		&dto.Result.Valid,
		&dto.Result.Imported,
		&dto.Result.Duplicates,
		&dto.Result.Invalid,
		&dto.Result.Failed,
		&filesJSON,
		&dto.Error,
		&createdAt,
		&startedAt,
		&finished,
		&updatedAt,
	)
	if errors.Is(err, pgx.ErrNoRows) {
		return domain.TransactionImportJobDTO{}, domain.ErrNotFound
	}
	if err != nil {
		return domain.TransactionImportJobDTO{}, err
	}

	if len(filesJSON) > 0 {
		if err := json.Unmarshal(filesJSON, &dto.Files); err != nil {
			return domain.TransactionImportJobDTO{}, err
		}
	}
	dto.CreatedAt = domain.FormatTimeUTC(createdAt)
	dto.UpdatedAt = domain.FormatTimeUTC(updatedAt)
	if startedAt != nil {
		dto.StartedAt = domain.FormatTimeUTC(*startedAt)
	}
	if finished != nil {
		dto.FinishedAt = domain.FormatTimeUTC(*finished)
	}

	return dto, nil
}
