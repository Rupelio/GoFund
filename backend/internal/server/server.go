package server

import (
	"context"
	"errors"
	"log/slog"
	"net/http"
	"time"

	"gestao/backend/internal/config"
	"gestao/backend/internal/email"
	"gestao/backend/internal/handler"
	"gestao/backend/internal/market"
	mw "gestao/backend/internal/middleware"
	"gestao/backend/internal/postgres"
	"gestao/backend/internal/reminder"

	"github.com/go-chi/chi/v5"
	chimw "github.com/go-chi/chi/v5/middleware"
	"github.com/jackc/pgx/v5/pgxpool"
)

// Server encapsulates the HTTP server and all dependencies.
type Server struct {
	cfg      config.Config
	pool     *pgxpool.Pool
	logger   *slog.Logger
	http     *http.Server
	reminder *reminder.Service
}

// New creates a Server with all handlers and middleware wired up.
func New(cfg config.Config, pool *pgxpool.Pool, logger *slog.Logger) *Server {
	// ── Repos ────────────────────────────────────────────────
	userRepo := postgres.NewUserRepo(pool)
	txnRepo := postgres.NewTransactionRepo(pool)
	budgetRepo := postgres.NewBudgetRepo(pool)
	goalRepo := postgres.NewGoalRepo(pool)
	projRepo := postgres.NewProjectionRepo(pool)
	catRepo := postgres.NewCategoryRepo(pool)
	accRepo := postgres.NewAccountRepo(pool)
	investmentRepo := postgres.NewInvestmentAssetRepo(pool)
	tokenRepo := postgres.NewTokenRepo(pool)
	importJobRepo := postgres.NewImportJobRepo(pool)

	// ── Email sender ────────────────────────────────────────
	emailSender := email.NewSender(email.Config{
		ResendAPIKey: cfg.ResendAPIKey,
		FromAddress:  cfg.ResendFrom,
		AppURL:       cfg.AppURL,
	})

	// ── Auth + rate limiting ─────────────────────────────────
	auth := mw.NewAuth(cfg.JWTSecret, cfg.TokenTTL)
	authLimiter := mw.NewRateLimiter(10, 1*time.Minute) // 10 req/min per IP (auth)
	apiLimiter := mw.NewRateLimiter(120, 1*time.Minute) // 120 req/min per IP (general)
	logLimiter := mw.NewRateLimiter(30, 1*time.Minute)  // 30 req/min per IP (logging)

	// ── Handlers ─────────────────────────────────────────────
	timeout := cfg.DBQueryTimeout

	authH := handler.NewAuthHandler(userRepo, tokenRepo, auth, emailSender, timeout)
	txnH := handler.NewTransactionHandler(txnRepo, importJobRepo, timeout)
	budgetH := handler.NewBudgetHandler(budgetRepo, timeout)
	goalH := handler.NewGoalHandler(goalRepo, timeout)
	projH := handler.NewProjectionHandler(projRepo, timeout)
	catH := handler.NewCategoryHandler(catRepo, timeout)
	accH := handler.NewAccountHandler(accRepo, txnRepo, timeout)
	quoteProvider := market.NewYahooQuoteProvider(nil)
	investmentH := handler.NewInvestmentHandler(investmentRepo, quoteProvider, timeout)
	bootstrapH := handler.NewBootstrapHandler(userRepo, txnRepo, budgetRepo, goalRepo, projRepo, catRepo, accRepo, investmentRepo, timeout)
	healthH := handler.NewHealthHandler(pool, timeout, "gestao-api", cfg.AppVersion)
	meH := handler.NewMeHandler(userRepo, timeout)
	logH := handler.NewLogHandler(logger)
	summaryH := handler.NewSummaryHandler(txnRepo, emailSender, timeout)

	// ── Router ───────────────────────────────────────────────
	r := chi.NewRouter()

	r.Use(chimw.RequestID)
	r.Use(chimw.RealIP)
	r.Use(chimw.Recoverer)
	r.Use(func(next http.Handler) http.Handler {
		logger := chimw.Logger(next)
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			// Ignore /health in app logs to reduce Fly health-check noise.
			if r.URL.Path == "/health" {
				next.ServeHTTP(w, r)
				return
			}
			logger.ServeHTTP(w, r)
		})
	})
	r.Use(chimw.Timeout(cfg.RequestTimeout))
	r.Use(mw.SecurityHeaders)
	r.Use(mw.CORS(cfg.AllowedOrigins))

	r.Get("/health", healthH.Handle)

	r.Route("/api", func(api chi.Router) {
		// Public routes with rate limiting
		api.Group(func(pub chi.Router) {
			pub.Use(authLimiter.Limit)
			pub.Post("/auth/register", authH.Register)
			pub.Post("/auth/login", authH.Login)
			pub.Post("/auth/request-reset", authH.RequestPasswordReset)
			pub.Post("/auth/confirm-reset", authH.ConfirmPasswordReset)
		})

		// Frontend error logging (public, rate limited)
		api.Group(func(lg chi.Router) {
			lg.Use(logLimiter.Limit)
			lg.Post("/log", logH.Handle)
		})

		// Authenticated routes
		api.Group(func(priv chi.Router) {
			priv.Use(auth.Middleware)
			priv.Use(apiLimiter.Limit)

			priv.Get("/me", meH.Handle)
			priv.Get("/bootstrap", bootstrapH.Handle)
			priv.Put("/auth/password", authH.ChangePassword)
			priv.Post("/summary/send", summaryH.SendMonthlySummary)

			priv.Route("/transactions", func(rt chi.Router) {
				rt.Get("/", txnH.List)
				rt.Post("/", txnH.Create)
				rt.Post("/import", txnH.Import)
				rt.Post("/import/jobs", txnH.StartImportJob)
				rt.Get("/import/jobs/{jobID}", txnH.GetImportJob)
				rt.Delete("/import/batches/{batchID}", txnH.UndoImportBatch)
				rt.Delete("/", txnH.DeleteAll)
				rt.Get("/{id}", txnH.Get)
				rt.Put("/{id}", txnH.Update)
				rt.Delete("/{id}", txnH.Delete)
			})

			priv.Route("/budgets", func(rb chi.Router) {
				rb.Get("/", budgetH.List)
				rb.Post("/", budgetH.Create)
				rb.Put("/{id}", budgetH.Update)
				rb.Delete("/{id}", budgetH.Delete)
			})

			priv.Route("/goals", func(rg chi.Router) {
				rg.Get("/", goalH.List)
				rg.Post("/", goalH.Create)
				rg.Put("/{id}", goalH.Update)
				rg.Delete("/{id}", goalH.Delete)
				rg.Post("/{id}/contributions", goalH.AddContribution)
			})

			priv.Route("/projection", func(rp chi.Router) {
				rp.Get("/", projH.Get)
				rp.Put("/", projH.Upsert)
			})

			priv.Route("/categories", func(rc chi.Router) {
				rc.Get("/", catH.List)
				rc.Post("/", catH.Create)
				rc.Put("/{id}", catH.Update)
				rc.Delete("/{id}", catH.Delete)
			})

			priv.Route("/accounts", func(ra chi.Router) {
				ra.Get("/", accH.List)
				ra.Post("/", accH.Create)
				ra.Put("/{id}", accH.Update)
				ra.Delete("/{id}", accH.Delete)
			})

			priv.Route("/investments", func(ri chi.Router) {
				ri.Get("/market/search", investmentH.SearchMarketSymbols)
				ri.Get("/market/quote", investmentH.GetMarketQuote)
				ri.Get("/assets", investmentH.ListAssets)
				ri.Post("/assets", investmentH.CreateAsset)
				ri.Put("/assets/{id}", investmentH.UpdateAsset)
				ri.Delete("/assets/{id}", investmentH.DeleteAsset)
				ri.Post("/assets/{id}/quote", investmentH.RefreshAssetQuote)
			})
		})
	})

	srv := &http.Server{
		Addr:         "0.0.0.0:" + cfg.Port,
		Handler:      r,
		ReadTimeout:  cfg.ReadTimeout,
		WriteTimeout: cfg.WriteTimeout,
		IdleTimeout:  cfg.IdleTimeout,
	}

	// ── Reminder service ────────────────────────────────────
	reminderSvc := reminder.New(pool, emailSender)

	return &Server{cfg: cfg, pool: pool, logger: logger, http: srv, reminder: reminderSvc}
}

// Run starts the HTTP server and blocks until the context is canceled (signal).
func (s *Server) Run(ctx context.Context) {
	// Start reminder service (background goroutine)
	s.reminder.Start(ctx)

	go func() {
		s.logger.Info("api listening", "port", s.cfg.Port)
		if err := s.http.ListenAndServe(); err != nil && !errors.Is(err, http.ErrServerClosed) {
			s.logger.Error("server error", "error", err)
		}
	}()

	<-ctx.Done()
	s.logger.Info("shutdown signal received")

	shutdownCtx, cancel := context.WithTimeout(context.Background(), s.cfg.ShutdownTimeout)
	defer cancel()

	if err := s.http.Shutdown(shutdownCtx); err != nil {
		s.logger.Error("graceful shutdown failed", "error", err)
		_ = s.http.Close()
	}

	s.logger.Info("server stopped")
}
