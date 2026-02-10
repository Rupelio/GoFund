package reminder

import (
	"context"
	"fmt"
	"log/slog"
	"time"

	"gestao/backend/internal/email"

	"github.com/jackc/pgx/v5/pgxpool"
)

// Service checks for upcoming recurring transactions and sends email reminders.
type Service struct {
	pool   *pgxpool.Pool
	sender *email.Sender
}

// New creates a reminder Service.
func New(pool *pgxpool.Pool, sender *email.Sender) *Service {
	return &Service{pool: pool, sender: sender}
}

// Start runs the reminder check loop. It checks once per day at ~8:00 AM.
func (s *Service) Start(ctx context.Context) {
	// Run immediately on start, then every 24h
	go func() {
		s.checkAndSend(ctx)

		ticker := time.NewTicker(24 * time.Hour)
		defer ticker.Stop()

		for {
			select {
			case <-ctx.Done():
				return
			case <-ticker.C:
				s.checkAndSend(ctx)
			}
		}
	}()

	slog.Info("reminder service started")
}

func (s *Service) checkAndSend(ctx context.Context) {
	slog.Info("reminder: checking for upcoming bills")

	// Find recurring transactions due in the next 3 days
	// We look for monthly recurring transactions where the day-of-month matches
	// the next 3 days, and notify the user.
	query := `
		SELECT DISTINCT ON (u.id, t.description)
			u.id::text AS user_id,
			u.name AS user_name,
			u.email AS user_email,
			t.description,
			t.amount::double precision,
			t.date,
			t.category
		FROM transactions t
		JOIN users u ON u.id = t.user_id
		WHERE t.recurrence = 'monthly'
		  AND t.type = 'despesa'
		  AND (
		    EXTRACT(DAY FROM t.date) = EXTRACT(DAY FROM CURRENT_DATE + INTERVAL '1 day')
		    OR EXTRACT(DAY FROM t.date) = EXTRACT(DAY FROM CURRENT_DATE + INTERVAL '2 days')
		    OR EXTRACT(DAY FROM t.date) = EXTRACT(DAY FROM CURRENT_DATE + INTERVAL '3 days')
		  )
		  AND (t.recurrence_end IS NULL OR t.recurrence_end >= CURRENT_DATE)
		ORDER BY u.id, t.description, t.date DESC
	`

	rows, err := s.pool.Query(ctx, query)
	if err != nil {
		slog.Error("reminder: query failed", "error", err)
		return
	}
	defer rows.Close()

	// Group items by user
	type userReminder struct {
		name  string
		email string
		items []email.ReminderItem
	}
	byUser := map[string]*userReminder{}

	for rows.Next() {
		var (
			userID, userName, userEmail string
			desc, category             string
			amount                     float64
			date                       time.Time
		)
		if err := rows.Scan(&userID, &userName, &userEmail, &desc, &amount, &date, &category); err != nil {
			slog.Error("reminder: scan failed", "error", err)
			continue
		}

		if _, ok := byUser[userID]; !ok {
			byUser[userID] = &userReminder{name: userName, email: userEmail}
		}

		// Calculate next due date based on current month
		now := time.Now()
		dueDay := date.Day()
		nextDue := time.Date(now.Year(), now.Month(), dueDay, 0, 0, 0, 0, time.Local)
		if nextDue.Before(now) {
			nextDue = nextDue.AddDate(0, 1, 0)
		}

		byUser[userID].items = append(byUser[userID].items, email.ReminderItem{
			Description: fmt.Sprintf("%s (%s)", desc, category),
			DueDate:     nextDue.Format("02/01/2006"),
			Amount:      amount,
		})
	}

	// Send emails
	for userID, reminder := range byUser {
		if err := s.sender.SendReminderEmail(reminder.email, reminder.name, reminder.items); err != nil {
			slog.Error("reminder: send failed", "userID", userID, "error", err)
		} else {
			slog.Info("reminder: sent", "userID", userID, "items", len(reminder.items))
		}
	}
}
