package guardian

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"log/slog"
	"math"
	"net/http"
	"strings"
	"time"

	"gestao/backend/internal/domain"
	"gestao/backend/internal/postgres"
)

const geminiEndpoint = "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent"

type Service struct {
	repo         *postgres.GuardianRepo
	geminiAPIKey string
	httpClient   *http.Client
}

func NewService(repo *postgres.GuardianRepo, geminiAPIKey string, httpClient *http.Client) *Service {
	if httpClient == nil {
		httpClient = &http.Client{Timeout: 12 * time.Second}
	}
	return &Service{
		repo:         repo,
		geminiAPIKey: strings.TrimSpace(geminiAPIKey),
		httpClient:   httpClient,
	}
}

func (s *Service) GetDashboard(ctx context.Context, userID string, now time.Time) (domain.GuardianDashboardDTO, error) {
	if err := s.repo.EnsureSeeded(ctx, userID); err != nil {
		return domain.GuardianDashboardDTO{}, err
	}

	envelopes, err := s.repo.ListEnvelopes(ctx, userID)
	if err != nil {
		return domain.GuardianDashboardDTO{}, err
	}

	quests, err := s.repo.ListQuests(ctx, userID)
	if err != nil {
		return domain.GuardianDashboardDTO{}, err
	}

	totalSaved, err := s.repo.GetTotalSavedMonth(ctx, userID)
	if err != nil {
		return domain.GuardianDashboardDTO{}, err
	}

	recentLogs, err := s.repo.ListRecentLogs(ctx, userID, 10)
	if err != nil {
		return domain.GuardianDashboardDTO{}, err
	}

	savedShares := math.Round((totalSaved/domain.GuardianFIIRefPrice)*100) / 100
	savedSharesCount := int(math.Floor(totalSaved / domain.GuardianFIIRefPrice))
	monthlyDividend := math.Round((totalSaved*domain.GuardianFIIMonthlyYield)*100) / 100

	return domain.GuardianDashboardDTO{
		Envelopes:                envelopes,
		Quests:                   quests,
		TotalSavedMonth:          totalSaved,
		SavedFIIShares:           savedShares,
		SavedFIISharesCount:      savedSharesCount,
		EstimatedMonthlyDividend: monthlyDividend,
		PaydayChecklist:          BuildPaydayChecklist(now),
		RecentLogs:               recentLogs,
	}, nil
}

func BuildPaydayChecklist(now time.Time) domain.GuardianPaydayChecklistDTO {
	loc, err := time.LoadLocation("America/Sao_Paulo")
	if err == nil {
		now = now.In(loc)
	}
	day := now.Day()

	cycleDvet := domain.GuardianPaydayCycleDTO{
		ID:       "ciclo_dvet",
		Title:    "Ciclo Dvet (R$ 3.600)",
		Subtitle: "Dia 01 a 04 — Blindagem de Custos Fixos & Semana 1",
		DayRange: "Dia 01 a 04",
		Income:   3600.00,
		IsActive: day >= 1 && day <= 4,
		Tasks: []domain.GuardianPaydayTaskDTO{
			{
				ID:          "dvet_luz",
				Title:       "Pagar Luz (~R$ 207)",
				Description: "Quitar fatura da Copel logo na entrada do ciclo.",
				AmountLabel: "~R$ 207,00",
				Amount:      207.00,
			},
			{
				ID:          "dvet_aluguel",
				Title:       "Separar Aluguel (R$ 2.126,14)",
				Description: "Intocável: blindar o valor exato da moradia.",
				AmountLabel: "R$ 2.126,14",
				Amount:      2126.14,
			},
			{
				ID:          "dvet_mei",
				Title:       "Pagar DAS MEI (R$ 86)",
				Description: "Manter CNPJ em dia sem multa.",
				AmountLabel: "R$ 86,00",
				Amount:      86.00,
			},
			{
				ID:          "dvet_semana1",
				Title:       "Separar Envelope Semana 1 (R$ 100 Lazer + R$ 100 Casa/Combustível)",
				Description: "Abastecer a barra de HP da primeira semana do mês.",
				AmountLabel: "R$ 200,00",
				Amount:      200.00,
			},
		},
	}

	cycleAuditop := domain.GuardianPaydayCycleDTO{
		ID:       "ciclo_auditop",
		Title:    "Ciclo Auditop (R$ 1.300)",
		Subtitle: "Dia 05 a 12 — Reserva PUCPR, Envelopes & Aporte FIIs/Meli+",
		DayRange: "Dia 05 a 12",
		Income:   1300.00,
		IsActive: day >= 5 && day <= 12,
		Tasks: []domain.GuardianPaydayTaskDTO{
			{
				ID:          "auditop_pucpr",
				Title:       "Isolar R$ 333 da PUCPR no Cofrinho Meli+",
				Description: "Guardar metade da mensalidade rendendo 120% do CDI até o dia 13.",
				AmountLabel: "R$ 333,00",
				Amount:      333.00,
			},
			{
				ID:          "auditop_claro",
				Title:       "Reservar Claro Fibra (R$ 94,90)",
				Description: "Garantir internet fixa sem surpresa na fatura.",
				AmountLabel: "R$ 94,90",
				Amount:      94.90,
			},
			{
				ID:          "auditop_semanas",
				Title:       "Abastecer Envelopes Semanas 2, 3 e 4",
				Description: "Recarregar o HP de Lazer (R$ 100/sem) e Casa/Combustível.",
				AmountLabel: "R$ 600,00",
				Amount:      600.00,
			},
			{
				ID:          "auditop_aporte",
				Title:       "Aportar Sobra Limpa (70% Cofrinho Meli+ 120% CDI / 30% FIIs na XP)",
				Description: "Comprar cotas de CPTS11, KNSC11 ou MXRF11 e fortalecer reserva.",
				AmountLabel: "70% / 30%",
				Amount:      272.10,
			},
		},
	}

	cyclePucpr := domain.GuardianPaydayCycleDTO{
		ID:       "ciclo_pucpr",
		Title:    "Ciclo PUCPR (Quitação)",
		Subtitle: "Dia 13 — Fechamento do Boleto da Faculdade",
		DayRange: "Dia 13",
		Income:   633.00,
		IsActive: day >= 13,
		Tasks: []domain.GuardianPaydayTaskDTO{
			{
				ID:          "pucpr_boleto",
				Title:       "Juntar R$ 300 do Pix da mãe + R$ 333 reservados e pagar boleto PUCPR (R$ 632,78)",
				Description: "Resgatar os R$ 333 do Cofrinho Meli+, somar ao Pix da mãe e liquidar o boleto.",
				AmountLabel: "R$ 632,78",
				Amount:      632.78,
			},
		},
	}

	cycles := []domain.GuardianPaydayCycleDTO{cycleDvet, cycleAuditop, cyclePucpr}
	active := cyclePucpr
	for _, c := range cycles {
		if c.IsActive {
			active = c
			break
		}
	}

	return domain.GuardianPaydayChecklistDTO{
		CurrentDay:  day,
		ActiveCycle: active,
		Cycles:      cycles,
	}
}

type geminiVerdictPayload struct {
	Verdict             string `json:"verdict"`
	Headline            string `json:"headline"`
	Argument            string `json:"argument"`
	FIIEquivalentShares int    `json:"fii_equivalent_shares"`
}

func (s *Service) EvaluateSpend(
	ctx context.Context,
	userID string,
	payload domain.EvaluateSpendPayload,
	now time.Time,
) (domain.EvaluateSpendResponse, error) {
	desc := strings.TrimSpace(payload.Description)
	if desc == "" {
		return domain.EvaluateSpendResponse{}, errors.New("description is required")
	}
	if payload.Amount <= 0 || math.IsNaN(payload.Amount) || math.IsInf(payload.Amount, 0) {
		return domain.EvaluateSpendResponse{}, errors.New("amount must be greater than 0")
	}

	slug := strings.TrimSpace(payload.EnvelopeSlug)
	if slug == "" {
		slug = strings.TrimSpace(payload.CategorySlug)
	}
	if slug == "" {
		slug = ClassifyQuickExpense(desc)
	}
	if !isValidEnvelopeSlug(slug) {
		slug = "lazer_semanal"
	}

	if err := s.repo.EnsureSeeded(ctx, userID); err != nil {
		return domain.EvaluateSpendResponse{}, err
	}

	envelopes, err := s.repo.ListEnvelopes(ctx, userID)
	if err != nil {
		return domain.EvaluateSpendResponse{}, err
	}
	quests, err := s.repo.ListQuests(ctx, userID)
	if err != nil {
		return domain.EvaluateSpendResponse{}, err
	}

	loc, err := time.LoadLocation("America/Sao_Paulo")
	if err == nil {
		now = now.In(loc)
	}

	var targetEnvelope domain.GuardianEnvelopeDTO
	for _, env := range envelopes {
		if env.Slug == slug {
			targetEnvelope = env
			break
		}
	}

	cpts11Shares := int(math.Floor(payload.Amount / domain.GuardianPriceCPTS11))
	knsc11Shares := int(math.Floor(payload.Amount / domain.GuardianPriceKNSC11))
	mxrf11Shares := int(math.Floor(payload.Amount / domain.GuardianPriceMXRF11))
	avgFiiShares := int(math.Max(1, math.Round(payload.Amount/domain.GuardianFIIRefPrice)))
	if payload.Amount < domain.GuardianPriceCPTS11 {
		avgFiiShares = int(math.Floor(payload.Amount / domain.GuardianFIIRefPrice))
	}
	monthlyDiv := math.Round((payload.Amount*domain.GuardianFIIMonthlyYield)*100) / 100
	ringPct := math.Round(((payload.Amount/domain.GuardianRingTargetAmount)*100)*10) / 10

	contextData := map[string]any{
		"horario_atual":       now.Format(time.RFC3339),
		"dia_da_semana":       weekdayNamePT(now.Weekday()),
		"segunda_a_quinta":    now.Weekday() >= time.Monday && now.Weekday() <= time.Thursday,
		"hora_do_dia":         now.Hour(),
		"gasto_solicitado": map[string]any{
			"descricao":     desc,
			"valor_brl":     payload.Amount,
			"envelope_slug": slug,
		},
		"envelope_alvo": targetEnvelope,
		"envelopes":     envelopes,
		"quests":        quests,
		"conversoes_impacto": map[string]any{
			"cotas_CPTS11_a_7_01":          cpts11Shares,
			"cotas_KNSC11_a_8_27":          knsc11Shares,
			"cotas_MXRF11_a_8_80":          mxrf11Shares,
			"cotas_referencia_media_8_05":  avgFiiShares,
			"dividendo_mensal_perpetuo_rs": monthlyDiv,
			"percentual_anel_solitario_rs": ringPct,
		},
	}

	contextBytes, _ := json.Marshal(contextData)
	systemPrompt := buildRobertoSystemPrompt(string(contextBytes))

	var aiResult geminiVerdictPayload
	var aiErr error
	if s.geminiAPIKey != "" {
		aiResult, aiErr = s.callGeminiRoberto(ctx, systemPrompt, desc, payload.Amount, slug)
		if aiErr != nil {
			slog.Warn("gemini evaluation failed, using local Roberto fallback", "error", aiErr)
		}
	}

	if s.geminiAPIKey == "" || aiErr != nil {
		aiResult = evaluateWithLocalRoberto(desc, payload.Amount, slug, targetEnvelope, now, cpts11Shares, knsc11Shares, mxrf11Shares, avgFiiShares, monthlyDiv, ringPct)
	}

	aiResult.Verdict = normalizeVerdict(aiResult.Verdict)
	if aiResult.FIIEquivalentShares <= 0 && payload.Amount >= domain.GuardianPriceCPTS11 {
		aiResult.FIIEquivalentShares = avgFiiShares
	}

	storedMessageBytes, _ := json.Marshal(aiResult)
	logDTO, err := s.repo.CreateImpulseLog(
		ctx,
		userID,
		desc,
		payload.Amount,
		slug,
		aiResult.Verdict,
		string(storedMessageBytes),
	)
	if err != nil {
		return domain.EvaluateSpendResponse{}, err
	}

	return domain.EvaluateSpendResponse{
		LogID:               logDTO.ID,
		Verdict:             aiResult.Verdict,
		Headline:            aiResult.Headline,
		Argument:            aiResult.Argument,
		FIIEquivalentShares: aiResult.FIIEquivalentShares,
		RingPercentage:      ringPct,
		MonthlyDividend:     monthlyDiv,
		EnvelopeSlug:        slug,
		Amount:              payload.Amount,
		Description:         desc,
	}, nil
}

func buildRobertoSystemPrompt(dbAndTimeJSON string) string {
	return fmt.Sprintf(`Você é o Roberto, parceiro e guardião financeiro implacável mas bem-humorado do Rupélio. Sua missão é avaliar se ele pode ou não gastar o valor solicitado agora.
Contexto financeiro atual do Rupélio (JSON): %s.
Regras de Ouro:
1. O limite de lazer/delivery é de R$ 100,00 por semana (renovado na sexta-feira). Pedidos de 99Food/iFood em dias de semana (segunda a quinta) devem ser fortemente desencorajados, lembrando que ele tem R$ 600 de Vale-Refeição para ter comida rápida em casa e está focado na rotina de academia com a esposa.
2. Sempre converta o valor do gasto em duas moedas reais para gerar impacto psicológico:
   - Quantas cotas de FIIs (CPTS11 a R$ 7,01, KNSC11 a R$ 8,27 ou MXRF11 a R$ 8,80) esse dinheiro compraria e quanto geraria de dividendo mensal perpétuo isento de IR (~1,12%% a.m.).
   - Quantos %% esse valor representa da meta do 'Anel Solitário com Pedra Verde' (meta R$ 350,00) para pedir a esposa em casamento em dezembro.
3. Se for compra de jogo na Steam fora do envelope de R$ 100 da semana, aplique a 'Regra das 72 Horas na Wishlist'.
Responda estritamente em JSON com as chaves: `+"`verdict`"+` ('APPROVED', 'WARNING' ou 'DENIED'), `+"`headline`"+` (frase curta de impacto), `+"`argument`"+` (2 a 3 frases diretas no estilo do Roberto com os cálculos de cotas/anel) e `+"`fii_equivalent_shares`"+` (int).`, dbAndTimeJSON)
}

func (s *Service) callGeminiRoberto(
	ctx context.Context,
	systemPrompt, description string,
	amount float64,
	envelopeSlug string,
) (geminiVerdictPayload, error) {
	userPrompt := fmt.Sprintf(
		"Rupélio quer gastar R$ %.2f agora com '%s' no envelope '%s'. Avalie e responda estritamente no formato JSON solicitado.",
		amount, description, envelopeSlug,
	)

	reqBody := map[string]any{
		"system_instruction": map[string]any{
			"parts": []map[string]string{
				{"text": systemPrompt},
			},
		},
		"contents": []map[string]any{
			{
				"role": "user",
				"parts": []map[string]string{
					{"text": userPrompt},
				},
			},
		},
		"generationConfig": map[string]any{
			"responseMimeType": "application/json",
			"temperature":      0.7,
		},
	}

	bodyBytes, err := json.Marshal(reqBody)
	if err != nil {
		return geminiVerdictPayload{}, err
	}

	url := geminiEndpoint + "?key=" + s.geminiAPIKey
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, url, bytes.NewReader(bodyBytes))
	if err != nil {
		return geminiVerdictPayload{}, err
	}
	req.Header.Set("Content-Type", "application/json")

	resp, err := s.httpClient.Do(req)
	if err != nil {
		return geminiVerdictPayload{}, err
	}
	defer resp.Body.Close()

	respBytes, err := io.ReadAll(io.LimitReader(resp.Body, 1<<20))
	if err != nil {
		return geminiVerdictPayload{}, err
	}
	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		return geminiVerdictPayload{}, fmt.Errorf("gemini api returned status %d", resp.StatusCode)
	}

	var geminiResp struct {
		Candidates []struct {
			Content struct {
				Parts []struct {
					Text string `json:"text"`
				} `json:"parts"`
			} `json:"content"`
		} `json:"candidates"`
	}
	if err := json.Unmarshal(respBytes, &geminiResp); err != nil {
		return geminiVerdictPayload{}, err
	}
	if len(geminiResp.Candidates) == 0 || len(geminiResp.Candidates[0].Content.Parts) == 0 {
		return geminiVerdictPayload{}, errors.New("empty response from gemini")
	}

	rawText := strings.TrimSpace(geminiResp.Candidates[0].Content.Parts[0].Text)
	rawText = strings.TrimPrefix(rawText, "```json")
	rawText = strings.TrimPrefix(rawText, "```")
	rawText = strings.TrimSuffix(rawText, "```")
	rawText = strings.TrimSpace(rawText)

	var parsed geminiVerdictPayload
	if err := json.Unmarshal([]byte(rawText), &parsed); err != nil {
		return geminiVerdictPayload{}, err
	}
	if parsed.Headline == "" && parsed.Argument == "" {
		return geminiVerdictPayload{}, errors.New("invalid gemini json fields")
	}
	return parsed, nil
}

func evaluateWithLocalRoberto(
	description string,
	amount float64,
	slug string,
	env domain.GuardianEnvelopeDTO,
	now time.Time,
	cpts11Shares, knsc11Shares, mxrf11Shares, avgFiiShares int,
	monthlyDiv, ringPct float64,
) geminiVerdictPayload {
	lowerDesc := strings.ToLower(description)
	isDelivery := strings.Contains(lowerDesc, "99food") ||
		strings.Contains(lowerDesc, "ifood") ||
		strings.Contains(lowerDesc, "delivery") ||
		strings.Contains(lowerDesc, "hamburguer") ||
		strings.Contains(lowerDesc, "hambúrguer") ||
		strings.Contains(lowerDesc, "lanche") ||
		strings.Contains(lowerDesc, "pizza")
	isSteam := strings.Contains(lowerDesc, "steam") ||
		strings.Contains(lowerDesc, "jogo") ||
		strings.Contains(lowerDesc, "game")
	isMonToThu := now.Weekday() >= time.Monday && now.Weekday() <= time.Thursday
	exceedsRemaining := amount > env.RemainingAmount

	fiiComparison := fmt.Sprintf(
		"Esses R$ %.2f comprariam %d cotas de CPTS11 (R$ 7,01), %d de KNSC11 (R$ 8,27) ou %d de MXRF11 (R$ 8,80), gerando ~R$ %.2f/mês perpétuos isentos de IR, além de representarem %.1f%% do Anel Solitário com Pedra Verde (R$ 350) para dezembro!",
		amount, max(1, cpts11Shares), max(1, knsc11Shares), max(1, mxrf11Shares), monthlyDiv, ringPct,
	)

	if isSteam && (exceedsRemaining || slug != "lazer_semanal") {
		return geminiVerdictPayload{
			Verdict:             "DENIED",
			Headline:            "🛑 Regra das 72 Horas na Wishlist ativada, Rupélio!",
			Argument:            fmt.Sprintf("Comprar '%s' fora do HP de R$ 100 da semana é armadilha do Gaben! Joga na Wishlist por 72 horas antes de tocar no cartão. %s", description, fiiComparison),
			FIIEquivalentShares: avgFiiShares,
		}
	}

	if isDelivery && isMonToThu {
		verdict := "WARNING"
		if exceedsRemaining {
			verdict = "DENIED"
		}
		return geminiVerdictPayload{
			Verdict:             verdict,
			Headline:            "🍔 Delivery de segunda a quinta? Cadê o foco na academia e o VR de R$ 600?",
			Argument:            fmt.Sprintf("Hoje é %s, Rupélio! Você tem R$ 600 de Vale-Refeição pra ter comida rápida em casa e está focado no shape com a esposa. %s", weekdayNamePT(now.Weekday()), fiiComparison),
			FIIEquivalentShares: avgFiiShares,
		}
	}

	if exceedsRemaining {
		return geminiVerdictPayload{
			Verdict:             "DENIED",
			Headline:            fmt.Sprintf("🚨 Barra de HP estourada! Só restam R$ %.2f em %s.", env.RemainingAmount, env.Name),
			Argument:            fmt.Sprintf("Esse gasto de R$ %.2f em '%s' passa do limite disponível (R$ %.2f restantes). %s", amount, description, env.RemainingAmount, fiiComparison),
			FIIEquivalentShares: avgFiiShares,
		}
	}

	remainingAfter := env.RemainingAmount - amount
	afterPct := 0.0
	if env.LimitAmount > 0 {
		afterPct = (remainingAfter / env.LimitAmount) * 100
	}

	if isSteam {
		return geminiVerdictPayload{
			Verdict:             "WARNING",
			Headline:            "🎮 Cabe no envelope, mas já passou pela Regra das 72h na Wishlist?",
			Argument:            fmt.Sprintf("Seu HP suporta os R$ %.2f (sobrarão R$ %.2f), mas lembre-se da Regra das 72 Horas na Wishlist pra não comprar jogo que vai ficar parado! %s", amount, remainingAfter, fiiComparison),
			FIIEquivalentShares: avgFiiShares,
		}
	}

	if afterPct < 30 {
		return geminiVerdictPayload{
			Verdict:             "WARNING",
			Headline:            fmt.Sprintf("⚠️ Atenção: seu HP vai cair para %.0f%% (R$ %.2f restantes)!", afterPct, remainingAfter),
			Argument:            fmt.Sprintf("Dá pra pagar '%s', mas sua barra de %s vai entrar na zona crítica! %s", description, env.Name, fiiComparison),
			FIIEquivalentShares: avgFiiShares,
		}
	}

	return geminiVerdictPayload{
		Verdict:             "APPROVED",
		Headline:            fmt.Sprintf("✅ Liberado pelo guardião! Ainda sobram R$ %.2f de HP.", remainingAfter),
		Argument:            fmt.Sprintf("O gasto com '%s' cabe tranquilo no envelope %s. Mesmo assim, pense se vale a troca: %s", description, env.Name, fiiComparison),
		FIIEquivalentShares: avgFiiShares,
	}
}

func (s *Service) ConfirmDecision(
	ctx context.Context,
	userID string,
	payload domain.ConfirmDecisionPayload,
) (domain.ConfirmDecisionResponse, error) {
	decision := strings.ToUpper(strings.TrimSpace(payload.Decision))
	if decision != "SAVED" && decision != "SPENT" {
		return domain.ConfirmDecisionResponse{}, errors.New("decision must be SAVED or SPENT")
	}
	if payload.LogID <= 0 {
		return domain.ConfirmDecisionResponse{}, errors.New("log_id is required")
	}

	if err := s.repo.EnsureSeeded(ctx, userID); err != nil {
		return domain.ConfirmDecisionResponse{}, err
	}

	logDTO, err := s.repo.ConfirmDecision(ctx, userID, payload.LogID, decision, payload.QuestID)
	if err != nil {
		return domain.ConfirmDecisionResponse{}, err
	}

	envelopes, err := s.repo.ListEnvelopes(ctx, userID)
	if err != nil {
		return domain.ConfirmDecisionResponse{}, err
	}
	quests, err := s.repo.ListQuests(ctx, userID)
	if err != nil {
		return domain.ConfirmDecisionResponse{}, err
	}
	totalSaved, err := s.repo.GetTotalSavedMonth(ctx, userID)
	if err != nil {
		return domain.ConfirmDecisionResponse{}, err
	}

	savedShares := math.Round((totalSaved/domain.GuardianFIIRefPrice)*100) / 100
	savedSharesCount := int(math.Floor(totalSaved / domain.GuardianFIIRefPrice))

	return domain.ConfirmDecisionResponse{
		Log:                 logDTO,
		Envelopes:           envelopes,
		Quests:              quests,
		TotalSavedMonth:     totalSaved,
		SavedFIIShares:      savedShares,
		SavedFIISharesCount: savedSharesCount,
	}, nil
}

func (s *Service) ProcessQuickExpense(
	ctx context.Context,
	userID string,
	payload domain.QuickExpenseWebhookPayload,
) (domain.QuickExpenseWebhookResponse, error) {
	title := strings.TrimSpace(payload.Title)
	if title == "" {
		return domain.QuickExpenseWebhookResponse{}, errors.New("title is required")
	}
	if payload.Amount <= 0 || math.IsNaN(payload.Amount) || math.IsInf(payload.Amount, 0) {
		return domain.QuickExpenseWebhookResponse{}, errors.New("amount must be greater than 0")
	}

	resolvedUserID := userID
	if resolvedUserID == "" {
		var err error
		resolvedUserID, err = s.repo.ResolveDefaultUserID(ctx, strings.TrimSpace(payload.UserID))
		if err != nil {
			return domain.QuickExpenseWebhookResponse{}, err
		}
	}

	slug := strings.TrimSpace(payload.EnvelopeSlug)
	if slug == "" || !isValidEnvelopeSlug(slug) {
		slug = ClassifyQuickExpense(title)
	}

	envelope, err := s.repo.AddExpenseToEnvelope(ctx, resolvedUserID, slug, payload.Amount)
	if err != nil {
		return domain.QuickExpenseWebhookResponse{}, err
	}

	return domain.QuickExpenseWebhookResponse{
		Title:        title,
		Amount:       payload.Amount,
		EnvelopeSlug: slug,
		Envelope:     envelope,
	}, nil
}

// ClassifyQuickExpense maps a notification/quick-expense title to its target HP bar envelope.
func ClassifyQuickExpense(title string) string {
	lower := strings.ToLower(strings.TrimSpace(title))

	vrKeywords := []string{
		"festival", "angeloni", "condor", "muffato", "carrefour",
		"assai", "assaí", "atacadao", "atacadão", "mercado",
		"supermercado", "padaria", "panificadora", "acougue", "açougue",
		"hortifruti", "sacolao", "sacolão", "vr", "vale refeicao", "vale-refeição",
	}
	for _, kw := range vrKeywords {
		if strings.Contains(lower, kw) {
			return "vr_mercado"
		}
	}

	casaKeywords := []string{
		"posto", "ipiranga", "shell", "petrobras", "gasolina",
		"combustivel", "combustível", "etanol", "abastecimento",
		"nissei", "raia", "drogasil", "panvel", "farmacia", "farmácia",
		"drogaria", "preco popular", "preço popular", "casa", "leroy",
		"balaroti", "cassol", "limpeza",
	}
	for _, kw := range casaKeywords {
		if strings.Contains(lower, kw) {
			return "casa_combustivel"
		}
	}

	cartaoKeywords := []string{
		"piso", "fatura", "assinatura", "recorrente", "anuidade", "seguro",
	}
	for _, kw := range cartaoKeywords {
		if strings.Contains(lower, kw) {
			return "piso_cartao"
		}
	}

	// Default & explicit leisure keywords (99food, ifood, steam, bar, etc.)
	return "lazer_semanal"
}

func isValidEnvelopeSlug(slug string) bool {
	switch slug {
	case "lazer_semanal", "vr_mercado", "casa_combustivel", "piso_cartao":
		return true
	default:
		return false
	}
}

func normalizeVerdict(v string) string {
	switch strings.ToUpper(strings.TrimSpace(v)) {
	case "APPROVED":
		return "APPROVED"
	case "WARNING":
		return "WARNING"
	case "DENIED":
		return "DENIED"
	default:
		return "WARNING"
	}
}

func weekdayNamePT(d time.Weekday) string {
	switch d {
	case time.Sunday:
		return "domingo"
	case time.Monday:
		return "segunda-feira"
	case time.Tuesday:
		return "terça-feira"
	case time.Wednesday:
		return "quarta-feira"
	case time.Thursday:
		return "quinta-feira"
	case time.Friday:
		return "sexta-feira"
	case time.Saturday:
		return "sábado"
	default:
		return ""
	}
}
