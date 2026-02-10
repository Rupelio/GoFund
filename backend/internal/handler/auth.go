package handler

import (
	"context"
	"errors"
	"log/slog"
	"net/http"
	"strings"
	"time"

	"gestao/backend/internal/domain"
	"gestao/backend/internal/middleware"
	"gestao/backend/internal/postgres"

	"golang.org/x/crypto/bcrypt"
)

// AuthHandler handles registration, login, and password changes.
type AuthHandler struct {
	users        *postgres.UserRepo
	auth         *middleware.Auth
	queryTimeout time.Duration
}

// NewAuthHandler creates an AuthHandler.
func NewAuthHandler(users *postgres.UserRepo, auth *middleware.Auth, queryTimeout time.Duration) *AuthHandler {
	return &AuthHandler{users: users, auth: auth, queryTimeout: queryTimeout}
}

func (h *AuthHandler) Register(w http.ResponseWriter, r *http.Request) {
	var payload domain.AuthPayload
	if err := DecodeJSON(r, &payload); err != nil {
		WriteError(w, http.StatusBadRequest, err.Error())
		return
	}

	payload.Name = domain.NormalizeString(payload.Name)
	payload.Email = domain.NormalizeLower(payload.Email)
	if payload.Name == "" {
		WriteError(w, http.StatusBadRequest, "name is required")
		return
	}
	if !domain.IsValidEmail(payload.Email) {
		WriteError(w, http.StatusBadRequest, "invalid email")
		return
	}
	if len(payload.Password) < 8 {
		WriteError(w, http.StatusBadRequest, "password must have at least 8 characters")
		return
	}

	ctx, cancel := context.WithTimeout(r.Context(), h.queryTimeout)
	defer cancel()

	user, err := h.users.Create(ctx, payload.Name, payload.Email, payload.Password)
	if errors.Is(err, domain.ErrConflict) {
		WriteError(w, http.StatusConflict, "email already registered")
		return
	}
	if err != nil {
		slog.Error("register: could not create user", "error", err)
		WriteError(w, http.StatusInternalServerError, "could not create user")
		return
	}

	token, err := h.auth.IssueToken(user)
	if err != nil {
		slog.Error("register: could not issue token", "error", err)
		WriteError(w, http.StatusInternalServerError, "could not create token")
		return
	}

	WriteJSON(w, http.StatusCreated, domain.AuthResponse{Token: token, User: user})
}

func (h *AuthHandler) Login(w http.ResponseWriter, r *http.Request) {
	var payload domain.AuthPayload
	if err := DecodeJSON(r, &payload); err != nil {
		WriteError(w, http.StatusBadRequest, err.Error())
		return
	}

	email := domain.NormalizeLower(payload.Email)
	password := payload.Password
	if !domain.IsValidEmail(email) || strings.TrimSpace(password) == "" {
		WriteError(w, http.StatusBadRequest, "invalid credentials")
		return
	}

	ctx, cancel := context.WithTimeout(r.Context(), h.queryTimeout)
	defer cancel()

	user, passwordHash, err := h.users.FindByEmail(ctx, email)
	if errors.Is(err, domain.ErrNotFound) {
		WriteError(w, http.StatusUnauthorized, "invalid credentials")
		return
	}
	if err != nil {
		slog.Error("login: could not find user", "error", err)
		WriteError(w, http.StatusInternalServerError, "internal error")
		return
	}

	if err := bcrypt.CompareHashAndPassword([]byte(passwordHash), []byte(password)); err != nil {
		WriteError(w, http.StatusUnauthorized, "invalid credentials")
		return
	}

	token, err := h.auth.IssueToken(user)
	if err != nil {
		slog.Error("login: could not issue token", "error", err)
		WriteError(w, http.StatusInternalServerError, "could not create token")
		return
	}

	WriteJSON(w, http.StatusOK, domain.AuthResponse{Token: token, User: user})
}

func (h *AuthHandler) ChangePassword(w http.ResponseWriter, r *http.Request) {
	user, ok := MustCurrentUser(w, r)
	if !ok {
		return
	}

	var payload domain.ChangePasswordPayload
	if err := DecodeJSON(r, &payload); err != nil {
		WriteError(w, http.StatusBadRequest, err.Error())
		return
	}
	if strings.TrimSpace(payload.CurrentPassword) == "" {
		WriteError(w, http.StatusBadRequest, "current password is required")
		return
	}
	if len(payload.NewPassword) < 8 {
		WriteError(w, http.StatusBadRequest, "new password must have at least 8 characters")
		return
	}

	ctx, cancel := context.WithTimeout(r.Context(), h.queryTimeout)
	defer cancel()

	hash, err := h.users.GetPasswordHash(ctx, user.ID)
	if err != nil {
		slog.Error("changePassword: could not get hash", "error", err)
		WriteError(w, http.StatusInternalServerError, "could not verify password")
		return
	}
	if err := bcrypt.CompareHashAndPassword([]byte(hash), []byte(payload.CurrentPassword)); err != nil {
		WriteError(w, http.StatusUnauthorized, "current password is incorrect")
		return
	}

	if err := h.users.UpdatePassword(ctx, user.ID, payload.NewPassword); err != nil {
		slog.Error("changePassword: could not update", "error", err)
		WriteError(w, http.StatusInternalServerError, "could not update password")
		return
	}

	WriteJSON(w, http.StatusOK, map[string]string{"message": "password updated successfully"})
}
