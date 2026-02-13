package market

import "testing"

func TestBuildSymbolCandidates_BrazilianTicker(t *testing.T) {
	got := buildSymbolCandidates("petr4")
	if len(got) < 2 {
		t.Fatalf("expected at least 2 candidates, got %v", got)
	}
	if got[0] != "PETR4.SA" {
		t.Fatalf("expected first candidate PETR4.SA, got %q", got[0])
	}
}

func TestBuildSymbolCandidates_USSymbol(t *testing.T) {
	got := buildSymbolCandidates("AAPL")
	if len(got) == 0 || got[0] != "AAPL" {
		t.Fatalf("expected first candidate AAPL, got %v", got)
	}
}

func TestBuildSymbolCandidates_CryptoSymbol(t *testing.T) {
	got := buildSymbolCandidates("BTC")
	if len(got) == 0 || got[0] != "BTC-USD" {
		t.Fatalf("expected first candidate BTC-USD, got %v", got)
	}
}
