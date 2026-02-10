package main

import (
	"context"
	"log/slog"
	"os"
	"os/signal"
	"syscall"

	"gestao/backend/internal/config"
	"gestao/backend/internal/postgres"
	"gestao/backend/internal/server"
)

func main() {
	logger := slog.New(slog.NewJSONHandler(os.Stdout, &slog.HandlerOptions{
		Level: slog.LevelInfo,
	}))
	slog.SetDefault(logger)

	cfg := config.Load()

	if cfg.JWTSecret == "change-me-in-production" || cfg.JWTSecret == "super-secret-change-me" {
		logger.Warn("using default JWT_SECRET — set a strong secret via JWT_SECRET env var for production")
	}

	rootCtx, stop := signal.NotifyContext(context.Background(), syscall.SIGINT, syscall.SIGTERM)
	defer stop()

	pool, err := postgres.NewPool(rootCtx, cfg)
	if err != nil {
		logger.Error("database connection error", "error", err)
		os.Exit(1)
	}
	defer pool.Close()

	if err := postgres.RunMigrations(rootCtx, pool); err != nil {
		logger.Error("migration error", "error", err)
		os.Exit(1)
	}

	srv := server.New(cfg, pool, logger)
	srv.Run(rootCtx)
}
