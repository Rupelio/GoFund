package handler

import (
	"testing"

	"gestao/backend/internal/market"
)

func TestClassifyMarketSearchSuggestion(t *testing.T) {
	tests := []struct {
		name     string
		item     market.SymbolSearchResult
		wantType string
		wantCat  string
	}{
		{
			name:     "crypto",
			item:     market.SymbolSearchResult{Symbol: "BTC-USD", QuoteType: "cryptocurrency"},
			wantType: "cripto",
			wantCat:  "Criptoativos",
		},
		{
			name:     "etf",
			item:     market.SymbolSearchResult{Symbol: "BOVA11.SA", QuoteType: "etf"},
			wantType: "etf",
			wantCat:  "ETFs",
		},
		{
			name:     "fii from equity b3 unit",
			item:     market.SymbolSearchResult{Symbol: "HGLG11.SA", QuoteType: "equity", Exchange: "SAO"},
			wantType: "fii",
			wantCat:  "Fundos Imobiliarios (FIIs)",
		},
		{
			name:     "stock",
			item:     market.SymbolSearchResult{Symbol: "PETR4.SA", QuoteType: "equity", Exchange: "SAO"},
			wantType: "acao",
			wantCat:  "Acoes",
		},
	}

	for _, tt := range tests {
		tt := tt
		t.Run(tt.name, func(t *testing.T) {
			gotType, gotCat := classifyMarketSearchSuggestion(tt.item)
			if gotType != tt.wantType {
				t.Fatalf("type mismatch: got=%s want=%s", gotType, tt.wantType)
			}
			if gotCat != tt.wantCat {
				t.Fatalf("category mismatch: got=%s want=%s", gotCat, tt.wantCat)
			}
		})
	}
}
