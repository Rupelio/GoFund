package config

import (
	"errors"
	"fmt"
	"log/slog"
	"os"
	"strconv"
	"strings"
	"time"
)

// insecureJWTSecrets lists default/placeholder secrets that must never be used in production.
var insecureJWTSecrets = map[string]struct{}{
	"change-me-in-production": {},
	"super-secret-change-me":  {},
	"secret":                  {},
	"changeme":                {},
}

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
	DBMaxConnIdleTime   time.Duration
	HealthCheckDBPing   bool
	AllowedOrigins      []string
	Environment         string // "production" or "development" (default)

	// Email (Resend)
	ResendAPIKey string
	ResendFrom   string
	AppURL       string
	AppVersion   string

	// Guardian & AI Copilot (Roberto)
	GeminiAPIKey         string
	GuardianWebhookToken string
}

// IsProduction returns true when APP_ENV is set to "production".
func (c Config) IsProduction() bool {
	return c.Environment == "production"
}

// Validate checks that security-critical settings are safe for the current environment.
// In production it returns an error; in development it logs warnings.
func (c Config) Validate() error {
	_, insecure := insecureJWTSecrets[strings.ToLower(c.JWTSecret)]
	corsWildcard := len(c.AllowedOrigins) == 1 && c.AllowedOrigins[0] == "*"

	if c.IsProduction() {
		var errs []error
		if insecure {
			errs = append(errs, fmt.Errorf("JWT_SECRET is using an insecure default value — set a strong secret via JWT_SECRET env var"))
		}
		if len(c.JWTSecret) < 32 {
			errs = append(errs, fmt.Errorf("JWT_SECRET is too short (got %d chars, need at least 32)", len(c.JWTSecret)))
		}
		if corsWildcard {
			errs = append(errs, fmt.Errorf("CORS_ALLOWED_ORIGINS is set to '*' — restrict to your frontend domain in production"))
		}
		if len(errs) > 0 {
			return errors.Join(errs...)
		}
		return nil
	}

	// Development: warn but don't block startup
	if insecure {
		slog.Warn("using default JWT_SECRET — set a strong secret via JWT_SECRET env var for production")
	}
	if corsWildcard {
		slog.Warn("CORS_ALLOWED_ORIGINS is set to '*' — restrict in production")
	}
	return nil
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
		DBMinConns:          int32(intEnvOrDefaultMin("DB_MIN_CONNS", 2, 0)),
		DBMaxConnIdleTime:   durationEnvOrDefault("DB_MAX_CONN_IDLE_TIME", 30*time.Minute),
		HealthCheckDBPing:   boolEnvOrDefault("HEALTHCHECK_DB_PING", true),
		AllowedOrigins:      csvEnvOrDefault("CORS_ALLOWED_ORIGINS", "*"),
		Environment:         envOrDefault("APP_ENV", "development"),

		ResendAPIKey: envOrDefault("RESEND_API_KEY", ""),
		ResendFrom:   envOrDefault("RESEND_FROM", "GoFund <contato@gofund.com.br>"),
		AppURL:       envOrDefault("APP_URL", "http://localhost:5500"),
		AppVersion:   envOrDefault("APP_VERSION", "dev"),

		GeminiAPIKey:         envOrDefault("GEMINI_API_KEY", ""),
		GuardianWebhookToken: envOrDefault("GUARDIAN_WEBHOOK_TOKEN", "gofund-guardian-secret"),
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
	return intEnvOrDefaultMin(key, fallback, 1)
}

func intEnvOrDefaultMin(key string, fallback, min int) int {
	raw := strings.TrimSpace(os.Getenv(key))
	if raw == "" {
		return fallback
	}
	value, err := strconv.Atoi(raw)
	if err != nil || value < min {
		slog.Warn("invalid env var, using fallback", "key", key, "raw", raw, "fallback", fallback, "min", min)
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

func boolEnvOrDefault(key string, fallback bool) bool {
	raw := strings.TrimSpace(strings.ToLower(os.Getenv(key)))
	if raw == "" {
		return fallback
	}

	switch raw {
	case "1", "true", "yes", "on":
		return true
	case "0", "false", "no", "off":
		return false
	default:
		slog.Warn("invalid env var, using fallback", "key", key, "raw", raw, "fallback", fallback)
		return fallback
	}
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
