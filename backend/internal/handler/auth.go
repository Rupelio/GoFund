package handler

import (
	"context"
	"errors"
	"log/slog"
	"net/http"
	"strings"
	"time"

	"gestao/backend/internal/domain"
	"gestao/backend/internal/email"
	"gestao/backend/internal/middleware"
	"gestao/backend/internal/postgres"

	"golang.org/x/crypto/bcrypt"
)

// AuthHandler handles registration, login, and password changes.
type AuthHandler struct {
	users        *postgres.UserRepo
	tokens       *postgres.TokenRepo
	auth         *middleware.Auth
	emailSender  *email.Sender
	queryTimeout time.Duration
}

// NewAuthHandler creates an AuthHandler.
func NewAuthHandler(users *postgres.UserRepo, tokens *postgres.TokenRepo, auth *middleware.Auth, emailSender *email.Sender, queryTimeout time.Duration) *AuthHandler {
	return &AuthHandler{users: users, tokens: tokens, auth: auth, emailSender: emailSender, queryTimeout: queryTimeout}
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

// RequestPasswordReset sends a reset email with a secure token.
func (h *AuthHandler) RequestPasswordReset(w http.ResponseWriter, r *http.Request) {
	var payload struct {
		Email string `json:"email"`
	}
	if err := DecodeJSON(r, &payload); err != nil {
		WriteError(w, http.StatusBadRequest, err.Error())
		return
	}

	emailAddr := domain.NormalizeLower(payload.Email)
	if !domain.IsValidEmail(emailAddr) {
		WriteError(w, http.StatusBadRequest, "invalid email")
		return
	}

	ctx, cancel := context.WithTimeout(r.Context(), h.queryTimeout)
	defer cancel()

	// Find user — always return success to prevent email enumeration
	user, _, err := h.users.FindByEmail(ctx, emailAddr)
	if err != nil {
		// Don't reveal whether email exists
		WriteJSON(w, http.StatusOK, map[string]string{"message": "if the email exists, a reset link has been sent"})
		return
	}

	// Generate token (1 hour TTL)
	token, err := h.tokens.CreateResetToken(ctx, user.ID, 1*time.Hour)
	if err != nil {
		slog.Error("reset: could not create token", "error", err)
		WriteJSON(w, http.StatusOK, map[string]string{"message": "if the email exists, a reset link has been sent"})
		return
	}

	// Send email
	if err := h.emailSender.SendResetPasswordEmail(emailAddr, token); err != nil {
		slog.Error("reset: could not send email", "error", err, "email", emailAddr)
		// Still return success to prevent enumeration
	}

	WriteJSON(w, http.StatusOK, map[string]string{"message": "if the email exists, a reset link has been sent"})
}

// ConfirmPasswordReset validates the token and sets a new password.
func (h *AuthHandler) ConfirmPasswordReset(w http.ResponseWriter, r *http.Request) {
	var payload struct {
		Token       string `json:"token"`
		NewPassword string `json:"newPassword"`
	}
	if err := DecodeJSON(r, &payload); err != nil {
		WriteError(w, http.StatusBadRequest, err.Error())
		return
	}

	if strings.TrimSpace(payload.Token) == "" {
		WriteError(w, http.StatusBadRequest, "token is required")
		return
	}
	if len(payload.NewPassword) < 8 {
		WriteError(w, http.StatusBadRequest, "new password must have at least 8 characters")
		return
	}

	ctx, cancel := context.WithTimeout(r.Context(), h.queryTimeout)
	defer cancel()

	// Validate token
	userID, err := h.tokens.ValidateResetToken(ctx, payload.Token)
	if err != nil {
		var ve *domain.ValidationError
		if errors.As(err, &ve) {
			WriteError(w, http.StatusBadRequest, ve.Message)
			return
		}
		if errors.Is(err, domain.ErrNotFound) {
			WriteError(w, http.StatusBadRequest, "invalid or expired token")
			return
		}
		slog.Error("reset-confirm: validate token error", "error", err)
		WriteError(w, http.StatusInternalServerError, "could not validate token")
		return
	}

	// Update password
	if err := h.users.UpdatePassword(ctx, userID, payload.NewPassword); err != nil {
		slog.Error("reset-confirm: could not update password", "error", err)
		WriteError(w, http.StatusInternalServerError, "could not update password")
		return
	}

	// Mark token as used
	_ = h.tokens.MarkTokenUsed(ctx, payload.Token)

	WriteJSON(w, http.StatusOK, map[string]string{"message": "password reset successfully"})
}
