package handler

import (
	"context"
	"errors"
	"log/slog"
	"net/http"
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
