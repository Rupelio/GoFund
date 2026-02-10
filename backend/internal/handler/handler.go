package handler

import (
	"encoding/json"
	"errors"
	"io"
	"net/http"
	"strconv"
	"strings"

	"gestao/backend/internal/domain"

	"github.com/go-chi/chi/v5"
)

// ── JSON helpers ─────────────────────────────────────────────

// DecodeJSON reads and decodes the request body, rejecting unknown fields.
func DecodeJSON(r *http.Request, target any) error {
	dec := json.NewDecoder(r.Body)
	dec.DisallowUnknownFields()
	if err := dec.Decode(target); err != nil {
		return errors.New("invalid request body")
	}
	var extra any
	if err := dec.Decode(&extra); !errors.Is(err, io.EOF) {
		return errors.New("invalid request body")
	}
	return nil
}

// WriteJSON writes a JSON response with the given status code.
func WriteJSON(w http.ResponseWriter, code int, payload any) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(code)
	_ = json.NewEncoder(w).Encode(payload)
}

// WriteError writes a JSON error response.
func WriteError(w http.ResponseWriter, code int, message string) {
	WriteJSON(w, code, map[string]string{"error": message})
}

// ── Path params ──────────────────────────────────────────────

// GetPathID extracts and validates a URL path parameter.
func GetPathID(r *http.Request, key string) (string, bool) {
	id := chi.URLParam(r, key)
	if domain.NormalizeString(id) == "" {
		return "", false
	}
	return id, true
}

// ── Auth context ─────────────────────────────────────────────

// MustCurrentUser extracts the authenticated user from context.
// Writes 401 and returns false if missing.
func MustCurrentUser(w http.ResponseWriter, r *http.Request) (domain.CurrentUser, bool) {
	v := r.Context().Value(domain.CurrentUserKey)
	user, ok := v.(domain.CurrentUser)
	if !ok {
		WriteError(w, http.StatusUnauthorized, "user context missing")
	}
	return user, ok
}

// ── Pagination ───────────────────────────────────────────────

// Pagination holds parsed limit/offset values.
type Pagination struct {
	Limit  int
	Offset int
}

const (
	defaultPageLimit = 200
	maxPageLimit     = 1000
)

// ParsePagination extracts limit and offset from query parameters.
func ParsePagination(r *http.Request) Pagination {
	limit := parsePositiveInt(r.URL.Query().Get("limit"), defaultPageLimit)
	if limit > maxPageLimit {
		limit = maxPageLimit
	}
	offset := parsePositiveInt(r.URL.Query().Get("offset"), 0)
	return Pagination{Limit: limit, Offset: offset}
}

func parsePositiveInt(s string, fallback int) int {
	n, err := strconv.Atoi(strings.TrimSpace(s))
	if err != nil || n < 0 {
		return fallback
	}
	return n
}
