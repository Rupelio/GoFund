package market

import (
	"context"
	"io"
	"net/http"
	"strings"
	"testing"
)

type roundTripFunc func(*http.Request) (*http.Response, error)

func (fn roundTripFunc) RoundTrip(req *http.Request) (*http.Response, error) {
	return fn(req)
}

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

func TestSearchSymbols(t *testing.T) {
	client := &http.Client{
		Transport: roundTripFunc(func(req *http.Request) (*http.Response, error) {
			body := `{
				"quotes": [
					{"symbol":"PETR4.SA","shortname":"Petrobras PN","exchange":"SAO","quoteType":"equity","currency":"BRL"},
					{"symbol":"BOVA11.SA","shortname":"iShares Ibovespa","exchange":"SAO","quoteType":"etf","currency":"BRL"},
					{"symbol":"BAD","shortname":"Unsupported","exchange":"SAO","quoteType":"future","currency":"BRL"}
				]
			}`
			return &http.Response{
				StatusCode: http.StatusOK,
				Body:       io.NopCloser(strings.NewReader(body)),
				Header:     make(http.Header),
			}, nil
		}),
	}

	provider := NewYahooQuoteProvider(client)
	results, err := provider.SearchSymbols(context.Background(), "petro", 10)
	if err != nil {
		t.Fatalf("SearchSymbols returned error: %v", err)
	}
	if len(results) != 2 {
		t.Fatalf("expected 2 supported results, got %d", len(results))
	}
	if results[0].Symbol != "PETR4.SA" {
		t.Fatalf("expected first symbol PETR4.SA, got %s", results[0].Symbol)
	}
}
