package domain

import "testing"

func TestValidateInvestmentAssetPayload_MarketRequiresTicker(t *testing.T) {
	_, err := ValidateInvestmentAssetPayload(InvestmentAssetPayload{
		Name:          "PETR4",
		AssetType:     "acao",
		PricingSource: "market",
		Quantity:      10,
		AveragePrice:  32.5,
	})
	if err == nil {
		t.Fatal("expected validation error for missing ticker")
	}
}

func TestValidateInvestmentAssetPayload_Defaults(t *testing.T) {
	payload, err := ValidateInvestmentAssetPayload(InvestmentAssetPayload{
		Name:         "Tesouro Selic",
		AssetType:    "renda_fixa",
		Quantity:     1,
		AveragePrice: 1000,
	})
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if payload.PricingSource != "manual" {
		t.Fatalf("expected manual pricing, got %q", payload.PricingSource)
	}
	if payload.ExpectedProfile != "base" {
		t.Fatalf("expected base profile, got %q", payload.ExpectedProfile)
	}
	if payload.Currency != "BRL" {
		t.Fatalf("expected BRL currency, got %q", payload.Currency)
	}
}
