package postgres

import (
	"context"
	"errors"

	"gestao/backend/internal/domain"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgconn"
	"github.com/jackc/pgx/v5/pgxpool"
)

// CategoryRepo handles category persistence.
type CategoryRepo struct {
	pool *pgxpool.Pool
}

func NewCategoryRepo(pool *pgxpool.Pool) *CategoryRepo {
	return &CategoryRepo{pool: pool}
}

// ListAll returns all categories for a user.
func (r *CategoryRepo) ListAll(ctx context.Context, userID string) ([]domain.CategoryDTO, error) {
	rows, err := r.pool.Query(ctx,
		`SELECT id::text, name, type, icon, created_at FROM categories WHERE user_id = $1 ORDER BY name`,
		userID,
	)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	items := make([]domain.CategoryDTO, 0)
	for rows.Next() {
		var dto domain.CategoryDTO
		var createdAt interface{}
		if err := rows.Scan(&dto.ID, &dto.Name, &dto.Type, &dto.Icon, &createdAt); err != nil {
			return nil, err
		}
		if t, ok := createdAt.(interface {
			UTC() interface{ Format(string) string }
		}); ok {
			_ = t
		}
		items = append(items, dto)
	}
	return items, rows.Err()
}

// Create inserts a new category.
func (r *CategoryRepo) Create(ctx context.Context, userID string, p domain.CategoryPayload) (domain.CategoryDTO, error) {
	id := p.ID
	if id == "" {
		id = domain.MustUUID()
	}

	_, err := r.pool.Exec(ctx,
		`INSERT INTO categories (id, user_id, name, type, icon) VALUES ($1, $2, $3, $4, $5)`,
		id, userID, p.Name, p.Type, p.Icon,
	)
	if err != nil {
		var pgErr *pgconn.PgError
		if errors.As(err, &pgErr) && pgErr.Code == "23505" {
			return domain.CategoryDTO{}, domain.ErrConflict
		}
		return domain.CategoryDTO{}, err
	}

	return domain.CategoryDTO{ID: id, Name: p.Name, Type: p.Type, Icon: p.Icon}, nil
}

// Update modifies a category.
func (r *CategoryRepo) Update(ctx context.Context, id, userID string, p domain.CategoryPayload) (domain.CategoryDTO, error) {
	tag, err := r.pool.Exec(ctx,
		`UPDATE categories SET name = $3, type = $4, icon = $5 WHERE id = $1 AND user_id = $2`,
		id, userID, p.Name, p.Type, p.Icon,
	)
	if err != nil {
		var pgErr *pgconn.PgError
		if errors.As(err, &pgErr) && pgErr.Code == "23505" {
			return domain.CategoryDTO{}, domain.ErrConflict
		}
		return domain.CategoryDTO{}, err
	}
	if tag.RowsAffected() == 0 {
		return domain.CategoryDTO{}, domain.ErrNotFound
	}
	return domain.CategoryDTO{ID: id, Name: p.Name, Type: p.Type, Icon: p.Icon}, nil
}

// Delete removes a category.
func (r *CategoryRepo) Delete(ctx context.Context, id, userID string) error {
	tag, err := r.pool.Exec(ctx, `DELETE FROM categories WHERE id = $1 AND user_id = $2`, id, userID)
	if err != nil {
		return err
	}
	if tag.RowsAffected() == 0 {
		return domain.ErrNotFound
	}
	return nil
}

// SeedDefaults creates default categories for a new user (if none exist).
func (r *CategoryRepo) SeedDefaults(ctx context.Context, userID string) error {
	var count int
	if err := r.pool.QueryRow(ctx, `SELECT count(*) FROM categories WHERE user_id = $1`, userID).Scan(&count); err != nil {
		return err
	}
	if count > 0 {
		return nil
	}

	defaults := []struct{ name, typ, icon string }{
		{"Salário", "receita", "💰"}, {"Freelance", "receita", "💻"}, {"Outros", "todas", "📦"},
		{"Moradia", "despesa", "🏠"}, {"Alimentação", "despesa", "🍔"}, {"Transporte", "despesa", "🚗"},
		{"Saúde", "despesa", "🏥"}, {"Educação", "despesa", "📚"}, {"Lazer", "despesa", "🎮"},
		{"Assinaturas", "despesa", "📱"}, {"Renda Fixa", "investimento", "📈"}, {"CDB", "investimento", "🏦"},
		{"Tesouro Direto", "investimento", "🏛️"}, {"Ações", "investimento", "📊"}, {"Fundos", "investimento", "💹"},
		{"Poupança", "investimento", "🐷"},
	}

	for _, d := range defaults {
		_, _ = r.pool.Exec(ctx,
			`INSERT INTO categories (id, user_id, name, type, icon) VALUES ($1, $2, $3, $4, $5) ON CONFLICT DO NOTHING`,
			domain.MustUUID(), userID, d.name, d.typ, d.icon,
		)
	}
	return nil
}

// FindByID returns a single category for a user by ID.
func (r *CategoryRepo) FindByID(ctx context.Context, id, userID string) (domain.CategoryDTO, error) {
	var dto domain.CategoryDTO
	err := r.pool.QueryRow(ctx,
		`SELECT id::text, name, type, icon FROM categories WHERE id = $1 AND user_id = $2`,
		id, userID,
	).Scan(&dto.ID, &dto.Name, &dto.Type, &dto.Icon)
	if errors.Is(err, pgx.ErrNoRows) {
		return domain.CategoryDTO{}, domain.ErrNotFound
	}
	return dto, err
}
