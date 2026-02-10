package middleware

import (
	"context"
	"errors"
	"fmt"
	"net/http"
	"strings"
	"time"

	"gestao/backend/internal/domain"

	"github.com/golang-jwt/jwt/v5"
)

const (
	tokenIssuer   = "gestao-api"
	tokenAudience = "gestao-web"
)

type tokenClaims struct {
	UserID string `json:"uid"`
	Email  string `json:"email"`
	Name   string `json:"name"`
	jwt.RegisteredClaims
}

// Auth handles JWT issuance, parsing, and the authentication middleware.
type Auth struct {
	jwtSecret string
	tokenTTL  time.Duration
}

// NewAuth creates an Auth instance.
func NewAuth(jwtSecret string, tokenTTL time.Duration) *Auth {
	return &Auth{jwtSecret: jwtSecret, tokenTTL: tokenTTL}
}

// IssueToken creates a signed JWT for the given user.
func (a *Auth) IssueToken(user domain.UserDTO) (string, error) {
	now := time.Now().UTC()
	claims := tokenClaims{
		UserID: user.ID,
		Email:  user.Email,
		Name:   user.Name,
		RegisteredClaims: jwt.RegisteredClaims{
			Subject:   user.ID,
			Issuer:    tokenIssuer,
			Audience:  []string{tokenAudience},
			IssuedAt:  jwt.NewNumericDate(now),
			NotBefore: jwt.NewNumericDate(now),
			ExpiresAt: jwt.NewNumericDate(now.Add(a.tokenTTL)),
			ID:        domain.MustUUID(),
		},
	}
	token := jwt.NewWithClaims(jwt.SigningMethodHS256, claims)
	return token.SignedString([]byte(a.jwtSecret))
}

func (a *Auth) parseToken(raw string) (*tokenClaims, error) {
	claims := &tokenClaims{}
	token, err := jwt.ParseWithClaims(raw, claims,
		func(token *jwt.Token) (any, error) {
			if _, ok := token.Method.(*jwt.SigningMethodHMAC); !ok {
				return nil, fmt.Errorf("unexpected signing method: %v", token.Header["alg"])
			}
			return []byte(a.jwtSecret), nil
		},
		jwt.WithIssuer(tokenIssuer),
		jwt.WithAudience(tokenAudience),
		jwt.WithValidMethods([]string{jwt.SigningMethodHS256.Alg()}),
		jwt.WithExpirationRequired(),
		jwt.WithLeeway(5*time.Second),
	)
	if err != nil {
		return nil, err
	}
	if !token.Valid {
		return nil, errors.New("invalid token")
	}
	if strings.TrimSpace(claims.UserID) == "" {
		return nil, errors.New("missing user id claim")
	}
	return claims, nil
}

// Middleware returns an HTTP middleware that validates Bearer tokens
// and injects the authenticated user into the request context.
func (a *Auth) Middleware(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		authHeader := strings.TrimSpace(r.Header.Get("Authorization"))
		if authHeader == "" {
			writeErr(w, http.StatusUnauthorized, "missing authorization header")
			return
		}

		const bearerPrefix = "bearer "
		if !strings.HasPrefix(strings.ToLower(authHeader), bearerPrefix) {
			writeErr(w, http.StatusUnauthorized, "invalid authorization format")
			return
		}

		// Extract token using length-based slicing to preserve original casing
		// and avoid the TrimPrefix case-sensitivity bug.
		rawToken := strings.TrimSpace(authHeader[len(bearerPrefix):])
		if rawToken == "" {
			writeErr(w, http.StatusUnauthorized, "missing bearer token")
			return
		}

		claims, err := a.parseToken(rawToken)
		if err != nil {
			writeErr(w, http.StatusUnauthorized, "invalid or expired token")
			return
		}

		user := domain.CurrentUser{
			ID:    claims.UserID,
			Email: claims.Email,
			Name:  claims.Name,
		}
		ctx := context.WithValue(r.Context(), domain.CurrentUserKey, user)
		next.ServeHTTP(w, r.WithContext(ctx))
	})
}

func writeErr(w http.ResponseWriter, code int, msg string) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(code)
	fmt.Fprintf(w, `{"error":%q}`, msg)
}
