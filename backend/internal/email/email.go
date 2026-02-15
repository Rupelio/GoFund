package email

import (
	"bytes"
	"encoding/json"
	"fmt"
	"io"
	"log/slog"
	"net/http"
	"net/url"
	"strings"
)

const resendAPI = "https://api.resend.com/emails"

// Config holds email settings loaded from environment.
type Config struct {
	ResendAPIKey string // Resend API key (re_...)
	FromAddress  string // Sender address (e.g. "GoFund <contato@gofund.com.br>")
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
	resetURL := buildResetPasswordURL(s.cfg.AppURL, token)

	// When Resend is not configured, log the reset link for local development
	if !s.cfg.IsConfigured() {
		slog.Warn("Resend not configured — reset link for local testing", "email", to, "url", resetURL)
		return nil
	}

	body := fmt.Sprintf(`
<!DOCTYPE html>
<html>
<body style="font-family: 'Segoe UI', Tahoma, sans-serif; color:#e6edf3; padding:0; margin:0;">
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

func buildResetPasswordURL(appURL, token string) string {
	base := strings.TrimRight(strings.TrimSpace(appURL), "/")
	if base == "" {
		return fmt.Sprintf("/reset-password?reset-token=%s", url.QueryEscape(token))
	}
	if !strings.HasSuffix(strings.ToLower(base), "/reset-password") {
		base += "/reset-password"
	}
	return fmt.Sprintf("%s?reset-token=%s", base, url.QueryEscape(token))
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
        <td style="padding:8px 12px; border-bottom:1px solid #30363d; color:#f85149;">%s</td>
      </tr>`, item.Description, item.DueDate, formatBRL(item.Amount)))
	}

	body := fmt.Sprintf(`
<!DOCTYPE html>
<html>
<body style="font-family: 'Segoe UI', Tahoma, sans-serif; color:#e6edf3; padding:0; margin:0;">
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

// MonthlySummary holds the data for a monthly financial summary email.
type MonthlySummary struct {
	Income        float64
	Expenses      float64
	Investment    float64
	CreditCard    float64
	Balance       float64
	NetWorth      float64
	TopCategories []CategorySummary
}

// CategorySummary represents spending in a single category.
type CategorySummary struct {
	Name   string
	Amount float64
}

// SendMonthlySummaryEmail sends a monthly financial summary.
func (s *Sender) SendMonthlySummaryEmail(to, userName, monthLabel string, data MonthlySummary) error {
	if !s.cfg.IsConfigured() {
		slog.Warn("Resend not configured — skipping monthly summary", "email", to)
		return nil
	}

	var catRows strings.Builder
	for _, c := range data.TopCategories {
		catRows.WriteString(fmt.Sprintf(`
      <tr>
        <td style="padding:10px 16px; border-bottom:1px solid #30363d; font-size:0.9rem;">%s</td>
        <td style="padding:10px 16px; border-bottom:1px solid #30363d; text-align:right; color:#f85149; font-size:0.9rem; font-weight:500;">%s</td>
      </tr>`, c.Name, formatBRL(c.Amount)))
	}

	balanceColor := "#10d884"
	balancePrefix := "+"
	if data.Balance < 0 {
		balanceColor = "#f85149"
		balancePrefix = ""
	}
	balanceStr := balancePrefix + formatBRL(data.Balance)

	netWorthColor := "#10d884"
	netWorthPrefix := ""
	if data.NetWorth < 0 {
		netWorthColor = "#f85149"
	}
	if data.NetWorth >= 0 {
		netWorthPrefix = "+"
	}
	netWorthStr := netWorthPrefix + formatBRL(data.NetWorth)

	body := fmt.Sprintf(`
<!DOCTYPE html>
<html>
<body style="font-family: 'Segoe UI', Tahoma, sans-serif; color:#e6edf3; padding:0; margin:0; background:#0d1117;">
  <div style="max-width:560px; margin:0 auto; background:#161b22; border-radius:16px; padding:32px; border:1px solid #30363d;">
    <h2 style="color:#9e8bff; margin:0 0 4px 0; font-size:1.3rem;">📊 GoFund — Resumo de %s</h2>
    <p style="color:#8b949e; margin:0 0 24px 0; font-size:0.9rem;">Olá <strong style="color:#e6edf3;">%s</strong>, aqui está seu resumo financeiro:</p>

    <!-- KPI Cards Row 1: 3 cards -->
    <table cellpadding="0" cellspacing="0" border="0" width="100%%%%" style="margin-bottom:12px;">
      <tr>
        <td width="33%%%%" style="padding:0 6px 0 0;">
          <div style="background:#21262d; border-radius:10px; padding:16px 12px; text-align:center; border:1px solid #30363d;">
            <div style="color:#8b949e; font-size:0.7rem; text-transform:uppercase; letter-spacing:0.5px; margin-bottom:6px;">Saldo do Mês</div>
            <div style="color:%s; font-size:1.15rem; font-weight:700;">%s</div>
          </div>
        </td>
        <td width="33%%%%" style="padding:0 3px;">
          <div style="background:#21262d; border-radius:10px; padding:16px 12px; text-align:center; border:1px solid #30363d;">
            <div style="color:#8b949e; font-size:0.7rem; text-transform:uppercase; letter-spacing:0.5px; margin-bottom:6px;">Receitas</div>
            <div style="color:#10d884; font-size:1.15rem; font-weight:700;">%s</div>
          </div>
        </td>
        <td width="33%%%%" style="padding:0 0 0 6px;">
          <div style="background:#21262d; border-radius:10px; padding:16px 12px; text-align:center; border:1px solid #30363d;">
            <div style="color:#8b949e; font-size:0.7rem; text-transform:uppercase; letter-spacing:0.5px; margin-bottom:6px;">Despesas</div>
            <div style="color:#f85149; font-size:1.15rem; font-weight:700;">%s</div>
          </div>
        </td>
      </tr>
    </table>

    <!-- KPI Cards Row 2: 3 cards -->
    <table cellpadding="0" cellspacing="0" border="0" width="100%%%%" style="margin-bottom:24px;">
      <tr>
        <td width="33%%%%" style="padding:0 6px 0 0;">
          <div style="background:#21262d; border-radius:10px; padding:16px 12px; text-align:center; border:1px solid #30363d;">
            <div style="color:#8b949e; font-size:0.7rem; text-transform:uppercase; letter-spacing:0.5px; margin-bottom:6px;">Investimentos</div>
            <div style="color:#ffa657; font-size:1.15rem; font-weight:700;">%s</div>
          </div>
        </td>
        <td width="33%%%%" style="padding:0 3px;">
          <div style="background:#21262d; border-radius:10px; padding:16px 12px; text-align:center; border:1px solid #30363d;">
            <div style="color:#8b949e; font-size:0.7rem; text-transform:uppercase; letter-spacing:0.5px; margin-bottom:6px;">Cartão de Crédito</div>
            <div style="color:#a78bfa; font-size:1.15rem; font-weight:700;">%s</div>
          </div>
        </td>
        <td width="33%%%%" style="padding:0 0 0 6px;">
          <div style="background:#21262d; border-radius:10px; padding:16px 12px; text-align:center; border:1px solid #30363d;">
            <div style="color:#8b949e; font-size:0.7rem; text-transform:uppercase; letter-spacing:0.5px; margin-bottom:6px;">Patrimônio</div>
            <div style="color:%s; font-size:1.15rem; font-weight:700;">%s</div>
          </div>
        </td>
      </tr>
    </table>

    <h3 style="color:#e6edf3; font-size:1rem; margin:0 0 12px 0; font-weight:600;">Top Categorias de Gastos</h3>
    <table cellpadding="0" cellspacing="0" border="0" width="100%%%%" style="margin-bottom:24px; border-radius:10px; overflow:hidden; border:1px solid #30363d;">
      <thead>
        <tr style="background:#21262d;">
          <th style="padding:10px 16px; text-align:left; color:#8b949e; font-size:0.8rem; font-weight:500; text-transform:uppercase; letter-spacing:0.5px;">Categoria</th>
          <th style="padding:10px 16px; text-align:right; color:#8b949e; font-size:0.8rem; font-weight:500; text-transform:uppercase; letter-spacing:0.5px;">Valor</th>
        </tr>
      </thead>
      <tbody>%s</tbody>
    </table>

    <div style="text-align:center; margin:8px 0 0 0;">
      <a href="%s" style="display:inline-block; background:linear-gradient(135deg,#7b59ff,#5e7fff); color:#fff; padding:14px 36px; border-radius:10px; text-decoration:none; font-weight:600; font-size:0.95rem;">
        Ver Dashboard Completo
      </a>
    </div>
    <hr style="border:none; border-top:1px solid #30363d; margin:24px 0 16px 0;">
    <p style="color:#8b949e; font-size:0.75rem; margin:0; text-align:center;">GoFund — Gestão Financeira Profissional</p>
  </div>
</body>
</html>`,
		monthLabel, userName,
		balanceColor, balanceStr,
		formatBRL(data.Income),
		formatBRL(data.Expenses),
		formatBRL(data.Investment),
		formatBRL(data.CreditCard),
		netWorthColor, netWorthStr,
		catRows.String(),
		s.cfg.AppURL)

	return s.Send(to, fmt.Sprintf("📊 Resumo Financeiro — %s — GoFund", monthLabel), body)
}

func absFloat(v float64) float64 {
	if v < 0 {
		return -v
	}
	return v
}

// formatBRL formats a float as Brazilian currency: R$ 1.234,56
func formatBRL(v float64) string {
	neg := v < 0
	if neg {
		v = -v
	}
	// Format with 2 decimal places
	raw := fmt.Sprintf("%.2f", v)
	parts := strings.Split(raw, ".")
	intPart := parts[0]
	decPart := parts[1]

	// Add thousand separators (dots)
	var result []byte
	for i, c := range intPart {
		if i > 0 && (len(intPart)-i)%3 == 0 {
			result = append(result, '.')
		}
		result = append(result, byte(c))
	}

	if neg {
		return "-R$ " + string(result) + "," + decPart
	}
	return "R$ " + string(result) + "," + decPart
}
