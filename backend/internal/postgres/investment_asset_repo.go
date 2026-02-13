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

type InvestmentAssetRepo struct {
	pool *pgxpool.Pool
}

func NewInvestmentAssetRepo(pool *pgxpool.Pool) *InvestmentAssetRepo {
	return &InvestmentAssetRepo{pool: pool}
}

func (r *InvestmentAssetRepo) ListAll(ctx context.Context, userID string) ([]domain.InvestmentAssetDTO, error) {
	rows, err := r.pool.Query(ctx,
		`SELECT id::text, name, asset_type, category, ticker, pricing_source,
		        quantity::double precision, average_price::double precision, current_price::double precision,
		        annual_yield_rate::double precision, expected_profile, currency, notes,
		        last_quote_at, last_quote_change::double precision, created_at, updated_at
		 FROM investment_assets
		 WHERE user_id = $1
		 ORDER BY name`,
		userID,
	)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	items := make([]domain.InvestmentAssetDTO, 0)
	for rows.Next() {
		dto, err := scanInvestmentAssetRow(rows)
		if err != nil {
			return nil, err
		}
		items = append(items, dto)
	}
	return items, rows.Err()
}

func (r *InvestmentAssetRepo) FindByID(ctx context.Context, id, userID string) (domain.InvestmentAssetDTO, error) {
	row := r.pool.QueryRow(ctx,
		`SELECT id::text, name, asset_type, category, ticker, pricing_source,
		        quantity::double precision, average_price::double precision, current_price::double precision,
		        annual_yield_rate::double precision, expected_profile, currency, notes,
		        last_quote_at, last_quote_change::double precision, created_at, updated_at
		 FROM investment_assets
		 WHERE id = $1 AND user_id = $2`,
		id, userID,
	)
	dto, err := scanInvestmentAssetRow(row)
	if errors.Is(err, pgx.ErrNoRows) {
		return domain.InvestmentAssetDTO{}, domain.ErrNotFound
	}
	if err != nil {
		return domain.InvestmentAssetDTO{}, err
	}
	return dto, nil
}

func (r *InvestmentAssetRepo) Create(ctx context.Context, userID string, p domain.InvestmentAssetPayload) (domain.InvestmentAssetDTO, error) {
	id := p.ID
	if id == "" {
		id = domain.MustUUID()
	}

	row := r.pool.QueryRow(ctx,
		`INSERT INTO investment_assets (
			id, user_id, name, asset_type, category, ticker, pricing_source,
			quantity, average_price, current_price, annual_yield_rate, expected_profile,
			currency, notes, created_at, updated_at
		) VALUES (
			$1, $2, $3, $4, $5, $6, $7,
			$8, $9, $10, $11, $12,
			$13, $14, NOW(), NOW()
		)
		RETURNING id::text, name, asset_type, category, ticker, pricing_source,
		          quantity::double precision, average_price::double precision, current_price::double precision,
		          annual_yield_rate::double precision, expected_profile, currency, notes,
		          last_quote_at, last_quote_change::double precision, created_at, updated_at`,
		id, userID, p.Name, p.AssetType, p.Category, nullableString(p.Ticker), p.PricingSource,
		p.Quantity, p.AveragePrice, nullableNumber(p.CurrentPrice), nullableNumber(p.AnnualYieldRate), p.ExpectedProfile,
		p.Currency, nullableString(p.Notes),
	)
	dto, err := scanInvestmentAssetRow(row)
	if err != nil {
		var pgErr *pgconn.PgError
		if errors.As(err, &pgErr) && pgErr.Code == "23505" {
			return domain.InvestmentAssetDTO{}, domain.ErrConflict
		}
		return domain.InvestmentAssetDTO{}, err
	}
	return dto, nil
}

func (r *InvestmentAssetRepo) Update(ctx context.Context, id, userID string, p domain.InvestmentAssetPayload) (domain.InvestmentAssetDTO, error) {
	row := r.pool.QueryRow(ctx,
		`UPDATE investment_assets
		 SET name = $3,
		     asset_type = $4,
		     category = $5,
		     ticker = $6,
		     pricing_source = $7,
		     quantity = $8,
		     average_price = $9,
		     current_price = $10,
		     annual_yield_rate = $11,
		     expected_profile = $12,
		     currency = $13,
		     notes = $14,
		     updated_at = NOW()
		 WHERE id = $1 AND user_id = $2
		 RETURNING id::text, name, asset_type, category, ticker, pricing_source,
		           quantity::double precision, average_price::double precision, current_price::double precision,
		           annual_yield_rate::double precision, expected_profile, currency, notes,
		           last_quote_at, last_quote_change::double precision, created_at, updated_at`,
		id, userID, p.Name, p.AssetType, p.Category, nullableString(p.Ticker), p.PricingSource,
		p.Quantity, p.AveragePrice, nullableNumber(p.CurrentPrice), nullableNumber(p.AnnualYieldRate), p.ExpectedProfile,
		p.Currency, nullableString(p.Notes),
	)
	dto, err := scanInvestmentAssetRow(row)
	if errors.Is(err, pgx.ErrNoRows) {
		return domain.InvestmentAssetDTO{}, domain.ErrNotFound
	}
	if err != nil {
		var pgErr *pgconn.PgError
		if errors.As(err, &pgErr) && pgErr.Code == "23505" {
			return domain.InvestmentAssetDTO{}, domain.ErrConflict
		}
		return domain.InvestmentAssetDTO{}, err
	}
	return dto, nil
}

func (r *InvestmentAssetRepo) UpdateQuote(ctx context.Context, id, userID, ticker, currency string, price, change float64, quotedAt time.Time) (domain.InvestmentAssetDTO, error) {
	row := r.pool.QueryRow(ctx,
		`UPDATE investment_assets
		 SET ticker = $3,
		     currency = $4,
		     current_price = $5,
		     last_quote_change = $6,
		     last_quote_at = $7,
		     updated_at = NOW()
		 WHERE id = $1 AND user_id = $2
		 RETURNING id::text, name, asset_type, category, ticker, pricing_source,
		           quantity::double precision, average_price::double precision, current_price::double precision,
		           annual_yield_rate::double precision, expected_profile, currency, notes,
		           last_quote_at, last_quote_change::double precision, created_at, updated_at`,
		id, userID, nullableString(ticker), nullableString(currency), price, change, quotedAt.UTC(),
	)
	dto, err := scanInvestmentAssetRow(row)
	if errors.Is(err, pgx.ErrNoRows) {
		return domain.InvestmentAssetDTO{}, domain.ErrNotFound
	}
	if err != nil {
		return domain.InvestmentAssetDTO{}, err
	}
	return dto, nil
}

func (r *InvestmentAssetRepo) Delete(ctx context.Context, id, userID string) error {
	tag, err := r.pool.Exec(ctx, `DELETE FROM investment_assets WHERE id = $1 AND user_id = $2`, id, userID)
	if err != nil {
		return err
	}
	if tag.RowsAffected() == 0 {
		return domain.ErrNotFound
	}
	return nil
}

type assetRowScanner interface {
	Scan(dest ...any) error
}

func scanInvestmentAssetRow(scanner assetRowScanner) (domain.InvestmentAssetDTO, error) {
	var dto domain.InvestmentAssetDTO
	var ticker, notes *string
	var currentPrice, annualYieldRate, lastQuoteChange *float64
	var lastQuoteAt *time.Time
	var createdAt, updatedAt time.Time

	if err := scanner.Scan(
		&dto.ID, &dto.Name, &dto.AssetType, &dto.Category, &ticker, &dto.PricingSource,
		&dto.Quantity, &dto.AveragePrice, &currentPrice,
		&annualYieldRate, &dto.ExpectedProfile, &dto.Currency, &notes,
		&lastQuoteAt, &lastQuoteChange, &createdAt, &updatedAt,
	); err != nil {
		return domain.InvestmentAssetDTO{}, err
	}

	if ticker != nil {
		dto.Ticker = *ticker
	}
	dto.CurrentPrice = currentPrice
	dto.AnnualYieldRate = annualYieldRate
	if notes != nil {
		dto.Notes = *notes
	}
	if lastQuoteAt != nil {
		dto.LastQuoteAt = domain.FormatTimeUTC(*lastQuoteAt)
	}
	dto.LastQuoteChange = lastQuoteChange
	dto.CreatedAt = domain.FormatTimeUTC(createdAt)
	dto.UpdatedAt = domain.FormatTimeUTC(updatedAt)
	return dto, nil
}

func nullableString(value string) *string {
	v := domain.NormalizeString(value)
	if v == "" {
		return nil
	}
	return &v
}

func nullableNumber(value *float64) any {
	if value == nil {
		return nil
	}
	return *value
}
