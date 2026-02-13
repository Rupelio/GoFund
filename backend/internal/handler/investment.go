package handler

import (
	"context"
	"errors"
	"log/slog"
	"net/http"
	"strconv"
	"strings"
	"time"

	"gestao/backend/internal/domain"
	"gestao/backend/internal/market"
)

type investmentAssetStore interface {
	ListAll(ctx context.Context, userID string) ([]domain.InvestmentAssetDTO, error)
	FindByID(ctx context.Context, id, userID string) (domain.InvestmentAssetDTO, error)
	Create(ctx context.Context, userID string, p domain.InvestmentAssetPayload) (domain.InvestmentAssetDTO, error)
	Update(ctx context.Context, id, userID string, p domain.InvestmentAssetPayload) (domain.InvestmentAssetDTO, error)
	UpdateQuote(ctx context.Context, id, userID, ticker, currency string, price, change float64, quotedAt time.Time) (domain.InvestmentAssetDTO, error)
	Delete(ctx context.Context, id, userID string) error
}

type InvestmentHandler struct {
	assets       investmentAssetStore
	quotes       market.QuoteProvider
	queryTimeout time.Duration
}

type marketSearchDTO struct {
	Symbol             string   `json:"symbol"`
	Name               string   `json:"name"`
	Exchange           string   `json:"exchange,omitempty"`
	Currency           string   `json:"currency,omitempty"`
	MarketPrice        *float64 `json:"marketPrice,omitempty"`
	QuoteType          string   `json:"quoteType,omitempty"`
	SuggestedAssetType string   `json:"suggestedAssetType"`
	SuggestedCategory  string   `json:"suggestedCategory"`
	SuggestedPricing   string   `json:"suggestedPricingSource"`
}

type marketQuoteDTO struct {
	Symbol        string  `json:"symbol"`
	Currency      string  `json:"currency"`
	Price         float64 `json:"price"`
	ChangePercent float64 `json:"changePercent"`
	FetchedAt     string  `json:"fetchedAt"`
}

func NewInvestmentHandler(repo investmentAssetStore, quotes market.QuoteProvider, timeout time.Duration) *InvestmentHandler {
	return &InvestmentHandler{assets: repo, quotes: quotes, queryTimeout: timeout}
}

func (h *InvestmentHandler) ListAssets(w http.ResponseWriter, r *http.Request) {
	user, ok := MustCurrentUser(w, r)
	if !ok {
		return
	}

	ctx, cancel := context.WithTimeout(r.Context(), h.queryTimeout)
	defer cancel()

	items, err := h.assets.ListAll(ctx, user.ID)
	if err != nil {
		slog.Error("listInvestmentAssets failed", "error", err)
		WriteError(w, http.StatusInternalServerError, "could not list investment assets")
		return
	}
	WriteJSON(w, http.StatusOK, items)
}

func (h *InvestmentHandler) CreateAsset(w http.ResponseWriter, r *http.Request) {
	user, ok := MustCurrentUser(w, r)
	if !ok {
		return
	}

	var payload domain.InvestmentAssetPayload
	if err := DecodeJSON(r, &payload); err != nil {
		WriteError(w, http.StatusBadRequest, err.Error())
		return
	}

	normalized, err := domain.ValidateInvestmentAssetPayload(payload)
	if err != nil {
		WriteError(w, http.StatusBadRequest, err.Error())
		return
	}

	ctx, cancel := context.WithTimeout(r.Context(), h.queryTimeout)
	defer cancel()

	dto, err := h.assets.Create(ctx, user.ID, normalized)
	if errors.Is(err, domain.ErrConflict) {
		WriteError(w, http.StatusConflict, "investment asset already exists")
		return
	}
	if err != nil {
		slog.Error("createInvestmentAsset failed", "error", err)
		WriteError(w, http.StatusInternalServerError, "could not create investment asset")
		return
	}
	WriteJSON(w, http.StatusCreated, dto)
}

func (h *InvestmentHandler) UpdateAsset(w http.ResponseWriter, r *http.Request) {
	user, ok := MustCurrentUser(w, r)
	if !ok {
		return
	}
	id, ok := GetPathID(r, "id")
	if !ok {
		WriteError(w, http.StatusBadRequest, "invalid id")
		return
	}

	var payload domain.InvestmentAssetPayload
	if err := DecodeJSON(r, &payload); err != nil {
		WriteError(w, http.StatusBadRequest, err.Error())
		return
	}

	normalized, err := domain.ValidateInvestmentAssetPayload(payload)
	if err != nil {
		WriteError(w, http.StatusBadRequest, err.Error())
		return
	}

	ctx, cancel := context.WithTimeout(r.Context(), h.queryTimeout)
	defer cancel()

	dto, err := h.assets.Update(ctx, id, user.ID, normalized)
	if errors.Is(err, domain.ErrNotFound) {
		WriteError(w, http.StatusNotFound, "investment asset not found")
		return
	}
	if errors.Is(err, domain.ErrConflict) {
		WriteError(w, http.StatusConflict, "investment asset already exists")
		return
	}
	if err != nil {
		slog.Error("updateInvestmentAsset failed", "error", err)
		WriteError(w, http.StatusInternalServerError, "could not update investment asset")
		return
	}
	WriteJSON(w, http.StatusOK, dto)
}

func (h *InvestmentHandler) DeleteAsset(w http.ResponseWriter, r *http.Request) {
	user, ok := MustCurrentUser(w, r)
	if !ok {
		return
	}
	id, ok := GetPathID(r, "id")
	if !ok {
		WriteError(w, http.StatusBadRequest, "invalid id")
		return
	}

	ctx, cancel := context.WithTimeout(r.Context(), h.queryTimeout)
	defer cancel()

	if err := h.assets.Delete(ctx, id, user.ID); errors.Is(err, domain.ErrNotFound) {
		WriteError(w, http.StatusNotFound, "investment asset not found")
		return
	} else if err != nil {
		slog.Error("deleteInvestmentAsset failed", "error", err)
		WriteError(w, http.StatusInternalServerError, "could not delete investment asset")
		return
	}

	w.WriteHeader(http.StatusNoContent)
}

func (h *InvestmentHandler) RefreshAssetQuote(w http.ResponseWriter, r *http.Request) {
	user, ok := MustCurrentUser(w, r)
	if !ok {
		return
	}
	id, ok := GetPathID(r, "id")
	if !ok {
		WriteError(w, http.StatusBadRequest, "invalid id")
		return
	}

	ctx, cancel := context.WithTimeout(r.Context(), h.queryTimeout)
	defer cancel()

	asset, err := h.assets.FindByID(ctx, id, user.ID)
	if errors.Is(err, domain.ErrNotFound) {
		WriteError(w, http.StatusNotFound, "investment asset not found")
		return
	}
	if err != nil {
		slog.Error("refreshAssetQuote find failed", "error", err)
		WriteError(w, http.StatusInternalServerError, "could not load investment asset")
		return
	}
	if asset.PricingSource != "market" {
		WriteError(w, http.StatusBadRequest, "asset pricingSource is not market")
		return
	}
	if domain.NormalizeString(asset.Ticker) == "" {
		WriteError(w, http.StatusBadRequest, "asset ticker is required")
		return
	}

	quote, err := h.quotes.FetchQuote(ctx, asset.Ticker)
	if err != nil {
		slog.Error("refreshAssetQuote provider failed", "error", err, "ticker", asset.Ticker)
		WriteError(w, http.StatusBadGateway, "could not fetch market quote")
		return
	}

	dto, err := h.assets.UpdateQuote(ctx, id, user.ID, quote.Symbol, quote.Currency, quote.Price, quote.ChangePercent, quote.FetchedAt)
	if errors.Is(err, domain.ErrNotFound) {
		WriteError(w, http.StatusNotFound, "investment asset not found")
		return
	}
	if err != nil {
		slog.Error("refreshAssetQuote update failed", "error", err)
		WriteError(w, http.StatusInternalServerError, "could not update asset quote")
		return
	}
	WriteJSON(w, http.StatusOK, dto)
}

func (h *InvestmentHandler) SearchMarketSymbols(w http.ResponseWriter, r *http.Request) {
	_, ok := MustCurrentUser(w, r)
	if !ok {
		return
	}

	query := strings.TrimSpace(r.URL.Query().Get("q"))
	if len(query) < 2 {
		WriteError(w, http.StatusBadRequest, "query must have at least 2 characters")
		return
	}

	limit := 10
	if raw := strings.TrimSpace(r.URL.Query().Get("limit")); raw != "" {
		parsed, err := strconv.Atoi(raw)
		if err != nil || parsed <= 0 {
			WriteError(w, http.StatusBadRequest, "limit must be a positive integer")
			return
		}
		if parsed > 25 {
			parsed = 25
		}
		limit = parsed
	}

	ctx, cancel := context.WithTimeout(r.Context(), h.queryTimeout)
	defer cancel()

	results, err := h.quotes.SearchSymbols(ctx, query, limit)
	if err != nil {
		slog.Error("searchMarketSymbols failed", "error", err, "query", query)
		WriteError(w, http.StatusBadGateway, "could not search market symbols")
		return
	}

	out := make([]marketSearchDTO, 0, len(results))
	for _, item := range results {
		assetType, category := classifyMarketSearchSuggestion(item)
		out = append(out, marketSearchDTO{
			Symbol:             item.Symbol,
			Name:               item.Name,
			Exchange:           item.Exchange,
			Currency:           item.Currency,
			MarketPrice:        item.MarketPrice,
			QuoteType:          item.QuoteType,
			SuggestedAssetType: assetType,
			SuggestedCategory:  category,
			SuggestedPricing:   "market",
		})
	}

	WriteJSON(w, http.StatusOK, out)
}

func (h *InvestmentHandler) GetMarketQuote(w http.ResponseWriter, r *http.Request) {
	_, ok := MustCurrentUser(w, r)
	if !ok {
		return
	}

	symbol := strings.TrimSpace(r.URL.Query().Get("symbol"))
	if symbol == "" {
		WriteError(w, http.StatusBadRequest, "symbol is required")
		return
	}

	ctx, cancel := context.WithTimeout(r.Context(), h.queryTimeout)
	defer cancel()

	quote, err := h.quotes.FetchQuote(ctx, symbol)
	if err != nil {
		slog.Error("getMarketQuote failed", "error", err, "symbol", symbol)
		WriteError(w, http.StatusBadGateway, "could not fetch market quote")
		return
	}

	WriteJSON(w, http.StatusOK, marketQuoteDTO{
		Symbol:        quote.Symbol,
		Currency:      quote.Currency,
		Price:         quote.Price,
		ChangePercent: quote.ChangePercent,
		FetchedAt:     domain.FormatTimeUTC(quote.FetchedAt),
	})
}

func classifyMarketSearchSuggestion(item market.SymbolSearchResult) (string, string) {
	symbol := strings.ToUpper(strings.TrimSpace(item.Symbol))
	symbolBase := strings.TrimSuffix(symbol, ".SA")
	quoteType := strings.ToLower(strings.TrimSpace(item.QuoteType))
	exchange := strings.ToUpper(strings.TrimSpace(item.Exchange))

	switch quoteType {
	case "cryptocurrency":
		return "cripto", "Criptoativos"
	case "etf":
		return "etf", "ETFs"
	case "mutualfund", "fund":
		return "fundo", "Fundos"
	case "equity":
		if strings.HasSuffix(symbolBase, "11") && strings.Contains(exchange, "SAO") {
			return "fii", "Fundos Imobiliarios (FIIs)"
		}
		return "acao", "Acoes"
	default:
		return "outro", "Investimentos"
	}
}
