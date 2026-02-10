package email

import (
	"bytes"
	"encoding/json"
	"fmt"
	"io"
	"log/slog"
	"net/http"
	"strings"
)

const resendAPI = "https://api.resend.com/emails"

// Config holds email settings loaded from environment.
type Config struct {
	ResendAPIKey string // Resend API key (re_...)
	FromAddress  string // Sender address (e.g. "GoFund <noreply@gofund.com.br>")
	AppURL       string // Frontend URL for reset links
}

// IsConfigured returns true if the Resend API key is set.
func (c Config) IsConfigured() bool {
	return c.ResendAPIKey != ""
}

// Sender sends emails via the Resend API.
type Sender struct {
	cfg Config
}

// NewSender creates an email Sender.
func NewSender(cfg Config) *Sender {
	return &Sender{cfg: cfg}
}

// resendPayload is the JSON body for the Resend API.
type resendPayload struct {
	From    string `json:"from"`
	To      string `json:"to"`
	Subject string `json:"subject"`
	HTML    string `json:"html"`
}

// Send sends an HTML email via Resend.
func (s *Sender) Send(to, subject, htmlBody string) error {
	if !s.cfg.IsConfigured() {
		return fmt.Errorf("Resend not configured")
	}

	payload, _ := json.Marshal(resendPayload{
		From:    s.cfg.FromAddress,
		To:      to,
		Subject: subject,
		HTML:    htmlBody,
	})

	req, err := http.NewRequest(http.MethodPost, resendAPI, bytes.NewReader(payload))
	if err != nil {
		return fmt.Errorf("resend: build request: %w", err)
	}
	req.Header.Set("Authorization", "Bearer "+s.cfg.ResendAPIKey)
	req.Header.Set("Content-Type", "application/json")

	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		return fmt.Errorf("resend: request failed: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode >= 300 {
		body, _ := io.ReadAll(resp.Body)
		return fmt.Errorf("resend: %d — %s", resp.StatusCode, string(body))
	}
	return nil
}

// SendResetPasswordEmail sends a password reset link.
func (s *Sender) SendResetPasswordEmail(to, token string) error {
	resetURL := fmt.Sprintf("%s?reset-token=%s", s.cfg.AppURL, token)

	// When Resend is not configured, log the reset link for local development
	if !s.cfg.IsConfigured() {
		slog.Warn("Resend not configured — reset link for local testing", "email", to, "url", resetURL)
		return nil
	}

	body := fmt.Sprintf(`
<!DOCTYPE html>
<html>
<body style="font-family: 'Segoe UI', Tahoma, sans-serif; background:#0d1117; color:#e6edf3; padding:2rem;">
  <div style="max-width:480px; margin:0 auto; background:#161b22; border-radius:12px; padding:2rem; border:1px solid #30363d;">
    <h2 style="color:#9e8bff; margin-top:0;">🔐 GoFund</h2>
    <p>Você solicitou a redefinição da sua senha.</p>
    <p>Clique no botão abaixo para criar uma nova senha:</p>
    <a href="%s" style="display:inline-block; background:linear-gradient(135deg,#7b59ff,#5e7fff); color:#fff; padding:12px 28px; border-radius:8px; text-decoration:none; font-weight:600; margin:1rem 0;">
      Redefinir Senha
    </a>
    <p style="color:#8b949e; font-size:0.85rem; margin-top:1.5rem;">
      Este link expira em <strong>1 hora</strong>. Se você não solicitou essa redefinição, ignore este email.
    </p>
    <hr style="border-color:#30363d; margin:1.5rem 0;">
    <p style="color:#8b949e; font-size:0.75rem;">GoFund — Gestão Financeira Profissional</p>
  </div>
</body>
</html>`, resetURL)

	return s.Send(to, "Redefinir Senha — GoFund", body)
}

// SendReminderEmail sends a bill/recurring transaction reminder.
func (s *Sender) SendReminderEmail(to, userName string, items []ReminderItem) error {
	if len(items) == 0 {
		return nil
	}

	var rows strings.Builder
	for _, item := range items {
		rows.WriteString(fmt.Sprintf(`
      <tr>
        <td style="padding:8px 12px; border-bottom:1px solid #30363d;">%s</td>
        <td style="padding:8px 12px; border-bottom:1px solid #30363d;">%s</td>
        <td style="padding:8px 12px; border-bottom:1px solid #30363d; color:#f85149;">R$ %.2f</td>
      </tr>`, item.Description, item.DueDate, item.Amount))
	}

	body := fmt.Sprintf(`
<!DOCTYPE html>
<html>
<body style="font-family: 'Segoe UI', Tahoma, sans-serif; background:#0d1117; color:#e6edf3; padding:2rem;">
  <div style="max-width:520px; margin:0 auto; background:#161b22; border-radius:12px; padding:2rem; border:1px solid #30363d;">
    <h2 style="color:#9e8bff; margin-top:0;">📋 GoFund — Lembrete</h2>
    <p>Olá <strong>%s</strong>, você tem contas vencendo nos próximos dias:</p>
    <table style="width:100%%; border-collapse:collapse; margin:1rem 0;">
      <thead>
        <tr style="background:#21262d;">
          <th style="padding:8px 12px; text-align:left; color:#8b949e;">Descrição</th>
          <th style="padding:8px 12px; text-align:left; color:#8b949e;">Vencimento</th>
          <th style="padding:8px 12px; text-align:left; color:#8b949e;">Valor</th>
        </tr>
      </thead>
      <tbody>%s</tbody>
    </table>
    <p style="color:#8b949e; font-size:0.85rem;">Não se esqueça de efetuar os pagamentos em dia!</p>
    <hr style="border-color:#30363d; margin:1.5rem 0;">
    <p style="color:#8b949e; font-size:0.75rem;">GoFund — Gestão Financeira Profissional</p>
  </div>
</body>
</html>`, userName, rows.String())

	return s.Send(to, "🔔 Lembrete de Contas — GoFund", body)
}

// ReminderItem represents a single upcoming bill.
type ReminderItem struct {
	Description string
	DueDate     string
	Amount      float64
}
