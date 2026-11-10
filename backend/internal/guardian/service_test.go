package guardian

import (
	"testing"
	"time"

	"gestao/backend/internal/domain"
)

func TestClassifyQuickExpense(t *testing.T) {
	cases := []struct {
		title string
		want  string
	}{
		{"99Food Hambúrguer", "lazer_semanal"},
		{"iFood Pedido", "lazer_semanal"},
		{"Steam Jogo RPG", "lazer_semanal"},
		{"Supermercado Festival", "vr_mercado"},
		{"Angeloni Curitiba", "vr_mercado"},
		{"Posto Ipiranga Gasolina", "casa_combustivel"},
		{"Farmacias Nissei", "casa_combustivel"},
		{"Fatura Assinatura Piso", "piso_cartao"},
	}

	for _, tc := range cases {
		got := ClassifyQuickExpense(tc.title)
		if got != tc.want {
			t.Errorf("ClassifyQuickExpense(%q) = %q, want %q", tc.title, got, tc.want)
		}
	}
}

func TestComputeEnvelopeHP(t *testing.T) {
	env := domain.GuardianEnvelopeDTO{
		LimitAmount: 100,
		SpentAmount: 30,
	}
	env.ComputeEnvelopeHP()
	if env.HPPercentage != 70 || env.Status != "green" {
		t.Fatalf("expected 70%% green, got %.2f%% %s", env.HPPercentage, env.Status)
	}

	env.SpentAmount = 60
	env.ComputeEnvelopeHP()
	if env.HPPercentage != 40 || env.Status != "yellow" {
		t.Fatalf("expected 40%% yellow, got %.2f%% %s", env.HPPercentage, env.Status)
	}

	env.SpentAmount = 85
	env.ComputeEnvelopeHP()
	if env.HPPercentage != 15 || env.Status != "red" {
		t.Fatalf("expected 15%% red, got %.2f%% %s", env.HPPercentage, env.Status)
	}
}

func TestBuildPaydayChecklist(t *testing.T) {
	loc := time.FixedZone("BRT", -3*3600)

	dvet := BuildPaydayChecklist(time.Date(2026, 11, 2, 10, 0, 0, 0, loc))
	if dvet.ActiveCycle.ID != "ciclo_dvet" {
		t.Errorf("day 2 expected ciclo_dvet, got %s", dvet.ActiveCycle.ID)
	}

	auditop := BuildPaydayChecklist(time.Date(2026, 11, 9, 10, 0, 0, 0, loc))
	if auditop.ActiveCycle.ID != "ciclo_auditop" {
		t.Errorf("day 9 expected ciclo_auditop, got %s", auditop.ActiveCycle.ID)
	}

	pucpr := BuildPaydayChecklist(time.Date(2026, 11, 13, 10, 0, 0, 0, loc))
	if pucpr.ActiveCycle.ID != "ciclo_pucpr" {
		t.Errorf("day 13 expected ciclo_pucpr, got %s", pucpr.ActiveCycle.ID)
	}
}

func TestEvaluateWithLocalRoberto(t *testing.T) {
	loc := time.FixedZone("BRT", -3*3600)
	// Monday (2026-11-09 is Monday)
	monday := time.Date(2026, 11, 9, 20, 0, 0, 0, loc)
	env := domain.GuardianEnvelopeDTO{
		Slug:            "lazer_semanal",
		Name:            "HP Lazer da Semana",
		LimitAmount:     100,
		SpentAmount:     0,
		RemainingAmount: 100,
	}

	res := evaluateWithLocalRoberto("99Food Hambúrguer", 62.50, "lazer_semanal", env, monday, 8, 7, 7, 8, 0.70, 17.9)
	if res.Verdict != "WARNING" {
		t.Errorf("expected WARNING for weekday 99Food, got %s", res.Verdict)
	}

	steamRes := evaluateWithLocalRoberto("Jogo Steam Elden Ring", 150.00, "lazer_semanal", env, monday, 21, 18, 17, 19, 1.68, 42.9)
	if steamRes.Verdict != "DENIED" {
		t.Errorf("expected DENIED for Steam game exceeding weekly envelope, got %s", steamRes.Verdict)
	}
}
