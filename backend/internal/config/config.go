package config

import (
	"log/slog"
	"os"
	"strconv"
	"strings"
	"time"
)

// Config holds all application configuration loaded from environment variables.
type Config struct {
	Port                string
	DatabaseURL         string
	JWTSecret           string
	TokenTTL            time.Duration
	ReadTimeout         time.Duration
	WriteTimeout        time.Duration
	IdleTimeout         time.Duration
	ShutdownTimeout     time.Duration
	RequestTimeout      time.Duration
	DBQueryTimeout      time.Duration
	DBConnectRetries    int
	DBConnectRetryDelay time.Duration
	DBMaxConns          int32
	DBMinConns          int32
	AllowedOrigins      []string

	// Email (Resend)
	ResendAPIKey string
	ResendFrom   string
	AppURL       string
	AppVersion   string
}

// Load reads configuration from environment variables with sensible defaults.
func Load() Config {
	return Config{
		Port:                envOrDefault("PORT", "8080"),
		DatabaseURL:         envOrDefault("DATABASE_URL", "postgres://finance:finance@localhost:5432/finance?sslmode=disable"),
		JWTSecret:           envOrDefault("JWT_SECRET", "change-me-in-production"),
		TokenTTL:            durationEnvOrDefault("TOKEN_TTL", 72*time.Hour),
		ReadTimeout:         durationEnvOrDefault("READ_TIMEOUT", 10*time.Second),
		WriteTimeout:        durationEnvOrDefault("WRITE_TIMEOUT", 15*time.Second),
		IdleTimeout:         durationEnvOrDefault("IDLE_TIMEOUT", 45*time.Second),
		ShutdownTimeout:     durationEnvOrDefault("SHUTDOWN_TIMEOUT", 8*time.Second),
		RequestTimeout:      durationEnvOrDefault("REQUEST_TIMEOUT", 15*time.Second),
		DBQueryTimeout:      durationEnvOrDefault("DB_QUERY_TIMEOUT", 5*time.Second),
		DBConnectRetries:    intEnvOrDefault("DB_CONNECT_RETRIES", 20),
		DBConnectRetryDelay: durationEnvOrDefault("DB_CONNECT_RETRY_DELAY", 2*time.Second),
		DBMaxConns:          int32(intEnvOrDefault("DB_MAX_CONNS", 16)),
		DBMinConns:          int32(intEnvOrDefault("DB_MIN_CONNS", 2)),
		AllowedOrigins:      csvEnvOrDefault("CORS_ALLOWED_ORIGINS", "*"),

		ResendAPIKey: envOrDefault("RESEND_API_KEY", ""),
		ResendFrom:   envOrDefault("RESEND_FROM", "GoFund <noreply@gofund.com.br>"),
		AppURL:       envOrDefault("APP_URL", "http://localhost:5500"),
		AppVersion:   envOrDefault("APP_VERSION", "dev"),
	}
}

func envOrDefault(key, fallback string) string {
	value := strings.TrimSpace(os.Getenv(key))
	if value == "" {
		return fallback
	}
	return value
}

func intEnvOrDefault(key string, fallback int) int {
	raw := strings.TrimSpace(os.Getenv(key))
	if raw == "" {
		return fallback
	}
	value, err := strconv.Atoi(raw)
	if err != nil || value <= 0 {
		slog.Warn("invalid env var, using fallback", "key", key, "raw", raw, "fallback", fallback)
		return fallback
	}
	return value
}

func durationEnvOrDefault(key string, fallback time.Duration) time.Duration {
	raw := strings.TrimSpace(os.Getenv(key))
	if raw == "" {
		return fallback
	}
	value, err := time.ParseDuration(raw)
	if err != nil || value <= 0 {
		slog.Warn("invalid env var, using fallback", "key", key, "raw", raw, "fallback", fallback)
		return fallback
	}
	return value
}

func csvEnvOrDefault(key, fallback string) []string {
	value := strings.TrimSpace(os.Getenv(key))
	if value == "" {
		value = fallback
	}
	parts := strings.Split(value, ",")
	output := make([]string, 0, len(parts))
	for _, part := range parts {
		trimmed := strings.TrimSpace(part)
		if trimmed != "" {
			output = append(output, trimmed)
		}
	}
	if len(output) == 0 {
		return []string{"*"}
	}
	return output
}
