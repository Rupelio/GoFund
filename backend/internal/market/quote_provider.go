package market

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"net/http"
	"net/url"
	"strings"
	"time"
)

type Quote struct {
	Symbol        string
	Currency      string
	Price         float64
	ChangePercent float64
	FetchedAt     time.Time
}

type QuoteProvider interface {
	FetchQuote(ctx context.Context, symbol string) (Quote, error)
}

type YahooQuoteProvider struct {
	client *http.Client
}

func NewYahooQuoteProvider(client *http.Client) *YahooQuoteProvider {
	if client == nil {
		client = &http.Client{Timeout: 6 * time.Second}
	}
	return &YahooQuoteProvider{client: client}
}

func (p *YahooQuoteProvider) FetchQuote(ctx context.Context, symbol string) (Quote, error) {
	candidates := buildSymbolCandidates(symbol)
	var lastErr error

	for _, candidate := range candidates {
		quote, err := p.fetchOne(ctx, candidate)
		if err == nil {
			return quote, nil
		}
		lastErr = err
	}

	if lastErr == nil {
		lastErr = errors.New("quote not found")
	}
	return Quote{}, lastErr
}

func (p *YahooQuoteProvider) fetchOne(ctx context.Context, symbol string) (Quote, error) {
	endpoint := "https://query1.finance.yahoo.com/v7/finance/quote?symbols=" + url.QueryEscape(symbol)
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, endpoint, nil)
	if err != nil {
		return Quote{}, err
	}
	req.Header.Set("User-Agent", "gofund-backend/1.0")

	res, err := p.client.Do(req)
	if err != nil {
		return Quote{}, err
	}
	defer res.Body.Close()

	if res.StatusCode < 200 || res.StatusCode > 299 {
		return Quote{}, fmt.Errorf("quote provider returned status %d", res.StatusCode)
	}

	var payload struct {
		QuoteResponse struct {
			Result []struct {
				Symbol                   string  `json:"symbol"`
				Currency                 string  `json:"currency"`
				RegularMarketPrice       float64 `json:"regularMarketPrice"`
				RegularMarketChangePct   float64 `json:"regularMarketChangePercent"`
				RegularMarketTimeSeconds int64   `json:"regularMarketTime"`
			} `json:"result"`
		} `json:"quoteResponse"`
	}
	if err := json.NewDecoder(res.Body).Decode(&payload); err != nil {
		return Quote{}, err
	}
	if len(payload.QuoteResponse.Result) == 0 {
		return Quote{}, errors.New("symbol not found")
	}

	result := payload.QuoteResponse.Result[0]
	if result.RegularMarketPrice <= 0 {
		return Quote{}, errors.New("invalid market price")
	}

	fetchedAt := time.Now().UTC()
	if result.RegularMarketTimeSeconds > 0 {
		fetchedAt = time.Unix(result.RegularMarketTimeSeconds, 0).UTC()
	}

	currency := strings.ToUpper(strings.TrimSpace(result.Currency))
	if currency == "" {
		currency = "BRL"
	}

	return Quote{
		Symbol:        strings.ToUpper(strings.TrimSpace(result.Symbol)),
		Currency:      currency,
		Price:         result.RegularMarketPrice,
		ChangePercent: result.RegularMarketChangePct,
		FetchedAt:     fetchedAt,
	}, nil
}

func buildSymbolCandidates(raw string) []string {
	symbol := strings.ToUpper(strings.ReplaceAll(strings.TrimSpace(raw), " ", ""))
	if symbol == "" {
		return nil
	}
	cryptoMap := map[string]string{
		"BTC":  "BTC-USD",
		"ETH":  "ETH-USD",
		"SOL":  "SOL-USD",
		"XRP":  "XRP-USD",
		"DOGE": "DOGE-USD",
	}
	if mapped, ok := cryptoMap[symbol]; ok {
		return uniqueSymbols([]string{mapped, symbol})
	}
	if strings.Contains(symbol, "-USD") {
		return []string{symbol}
	}
	if strings.Contains(symbol, ".") {
		return []string{symbol}
	}

	hasDigit := false
	for _, r := range symbol {
		if r >= '0' && r <= '9' {
			hasDigit = true
			break
		}
	}

	candidates := make([]string, 0, 2)
	if hasDigit {
		candidates = append(candidates, symbol+".SA", symbol)
	} else {
		candidates = append(candidates, symbol, symbol+".SA")
	}
	return uniqueSymbols(candidates)
}

func uniqueSymbols(items []string) []string {
	seen := make(map[string]struct{}, len(items))
	out := make([]string, 0, len(items))
	for _, item := range items {
		item = strings.TrimSpace(item)
		if item == "" {
			continue
		}
		if _, ok := seen[item]; ok {
			continue
		}
		seen[item] = struct{}{}
		out = append(out, item)
	}
	return out
}
