package domain

import "errors"

// Sentinel errors for domain-level conditions.
var (
	ErrNotFound     = errors.New("not found")
	ErrConflict     = errors.New("conflict")
	ErrUnauthorized = errors.New("unauthorized")
)

// ValidationError represents a client-facing validation failure.
type ValidationError struct {
	Message string
}

func (e *ValidationError) Error() string { return e.Message }

// NewValidationError creates a typed validation error.
func NewValidationError(msg string) error {
	return &ValidationError{Message: msg}
}
