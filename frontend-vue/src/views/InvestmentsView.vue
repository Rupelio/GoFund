<template>
  <div>
    <section class="panel-grid">
      <article class="panel panel-large">
        <header class="panel-head row-between">
          <h2>Carteira de Investimentos</h2>
          <div class="header-actions">
            <button
              class="btn ghost tiny"
              type="button"
              :disabled="syncingAssetsFromCsv"
              @click="handleSyncAssetsFromCsv"
            >
              <i class="fa-solid fa-wand-magic-sparkles"></i>
              {{ syncingAssetsFromCsv ? 'Sincronizando...' : 'Sincronizar ativos do CSV' }}
            </button>
            <button
              class="btn ghost tiny"
              type="button"
              :disabled="refreshingAllQuotes"
              @click="handleRefreshAllQuotes"
            >
              <i class="fa-solid fa-arrows-rotate"></i>
              {{ refreshingAllQuotes ? 'Atualizando...' : 'Atualizar cotações de mercado' }}
            </button>
          </div>
        </header>

        <section class="kpi-grid investments-kpis">
          <article class="kpi-card">
            <p>Aportes no mês</p>
            <strong class="warning">{{ formatCurrency(monthlyInvested) }}</strong>
          </article>
          <article class="kpi-card">
            <p>Resgates no mês</p>
            <strong class="positive">{{ formatCurrency(monthlyRedeemed) }}</strong>
          </article>
          <article class="kpi-card">
            <p>Custo da carteira (BRL)</p>
            <strong class="warning">{{ formatCurrency(totalCostBRL) }}</strong>
          </article>
          <article class="kpi-card">
            <p>Valor de mercado (BRL)</p>
            <strong class="positive">{{ formatCurrency(totalMarketBRL) }}</strong>
          </article>
          <article class="kpi-card">
            <p>Resultado não realizado (BRL)</p>
            <strong :class="totalPnLBRL >= 0 ? 'positive' : 'negative'">{{ formatCurrency(totalPnLBRL) }}</strong>
          </article>
          <article class="kpi-card">
            <p>Projeção 12 meses (BRL)</p>
            <strong class="positive">{{ formatCurrency(totalProjectedBRL) }}</strong>
          </article>
        </section>

        <div class="info-banner" style="margin-bottom: 1rem;">
          <p><strong><i class="fa-solid fa-circle-info"></i> Como esta tela funciona agora</strong></p>
          <p>Lançamento rápido: você registra aporte/resgate sem sair desta tela.</p>
          <p>Carteira por ativo: você acompanha custo, valor de mercado, P/L e variação.</p>
          <p>Renda variável usa cotação de mercado (ticker). Renda fixa usa taxa anual opcional.</p>
          <p>Aportes no mês mostram fluxo. Custo da carteira mostra posição/custo dos ativos (pode ser diferente do aporte bruto).</p>
        </div>

        <section class="investment-section csv-sync-rates">
          <header class="section-head">
            <h3>Taxas mensais padrao para importacao CSV</h3>
            <p>Essas taxas sao fallback para criacao automatica de ativos de renda fixa quando nenhuma regra especifica estiver configurada.</p>
          </header>
          <div class="row-3">
            <label>
              Renda fixa padrao (% a.m.)
              <input v-model="csvSyncRatesForm.fixedIncomeMonthlyRate" type="number" min="0" max="100" step="0.01" placeholder="Opcional" />
              <small class="field-help">Equivalente: {{ formatAnnualEquivalent(csvSyncRatesForm.fixedIncomeMonthlyRate) }}</small>
            </label>
            <label>
              Caixinha padrao (% a.m.)
              <input v-model="csvSyncRatesForm.nubankBoxMonthlyRate" type="number" min="0" max="100" step="0.01" placeholder="Opcional" />
              <small class="field-help">Equivalente: {{ formatAnnualEquivalent(csvSyncRatesForm.nubankBoxMonthlyRate) }}</small>
            </label>
            <label>
              Caixinha turbo (% a.m.)
              <input v-model="csvSyncRatesForm.nubankBoxTurboMonthlyRate" type="number" min="0" max="100" step="0.01" placeholder="Opcional" />
              <small class="field-help">Equivalente: {{ formatAnnualEquivalent(csvSyncRatesForm.nubankBoxTurboMonthlyRate) }}</small>
            </label>
          </div>
          <div class="row-actions">
            <button class="btn ghost tiny" type="button" @click="handleSaveCsvSyncRates">
              <i class="fa-solid fa-floppy-disk"></i>
              Salvar taxas do CSV
            </button>
          </div>
        </section>

        <section class="investment-section csv-sync-rules">
          <header class="section-head">
            <h3>Regras de mapeamento CSV (mundo real)</h3>
            <p>Crie regras por descricao, conta e/ou origem para mapear qualquer lancamento de investimento para o ativo correto.</p>
          </header>
          <form class="form-stack" @submit.prevent="handleSaveCsvInvestmentRule">
            <div class="row-3">
              <label>
                Descricao contem
                <input
                  v-model="csvRuleForm.descriptionPattern"
                  type="text"
                  placeholder="Ex: aplicacao rdb"
                  maxlength="80"
                />
              </label>
              <label>
                Conta (opcional)
                <select v-model="csvRuleForm.accountId">
                  <option value="">Todas as contas</option>
                  <option v-for="acc in sortedAccounts" :key="acc.id" :value="acc.id">{{ acc.name }}</option>
                </select>
              </label>
              <label>
                Origem CSV (opcional)
                <select v-model="csvRuleForm.sourceKey">
                  <option value="">Qualquer origem</option>
                  <option v-for="source in csvSourceOptions" :key="source.key" :value="source.key">{{ source.label }}</option>
                </select>
              </label>
            </div>
            <div class="row-3">
              <label>
                Nome do ativo
                <input
                  v-model="csvRuleForm.assetName"
                  type="text"
                  placeholder="Ex: Reserva de emergencia Banco X"
                  maxlength="80"
                />
              </label>
              <label>
                Categoria do ativo
                <input
                  v-model="csvRuleForm.assetCategory"
                  type="text"
                  placeholder="Ex: CDB/RDB"
                  maxlength="50"
                />
              </label>
              <label>
                Taxa mensal do ativo (% a.m., opcional)
                <input v-model="csvRuleForm.monthlyRate" type="number" min="0" max="100" step="0.01" placeholder="Opcional" />
                <small class="field-help">Equivalente: {{ formatAnnualEquivalent(csvRuleForm.monthlyRate) }}</small>
              </label>
            </div>
            <div class="row-actions">
              <button class="btn ghost tiny" type="submit">
                <i class="fa-solid fa-floppy-disk"></i>
                {{ csvRuleForm.editingId ? 'Atualizar regra' : 'Adicionar regra' }}
              </button>
              <button
                v-if="csvRuleForm.editingId"
                class="btn ghost tiny"
                type="button"
                @click="handleCancelCsvRuleEdit"
              >
                <i class="fa-solid fa-xmark"></i>
                Cancelar edicao
              </button>
            </div>
          </form>

          <div v-if="csvInvestmentRules.length" class="csv-rules-list">
            <article v-for="rule in csvInvestmentRules" :key="rule.id" class="csv-rule-card">
              <div>
                <p class="csv-rule-title">
                  <strong>{{ rule.assetName }}</strong>
                  <span class="asset-chip muted">{{ rule.descriptionPattern }}</span>
                </p>
                <p class="csv-rule-meta">
                  Conta: <strong>{{ csvRuleAccountLabel(rule) }}</strong> |
                  Origem: <strong>{{ csvRuleSourceLabel(rule) }}</strong> |
                  Taxa: <strong>{{ rule.monthlyRate === null || rule.monthlyRate === undefined ? 'padrao' : `${Number(rule.monthlyRate).toFixed(2)}% a.m.` }}</strong>
                  <template v-if="rule.monthlyRate !== null && rule.monthlyRate !== undefined">
                    ({{ formatAnnualEquivalent(rule.monthlyRate) }})
                  </template>
                </p>
              </div>
              <div class="asset-actions">
                <button class="btn ghost tiny" type="button" @click="handleEditCsvInvestmentRule(rule)">
                  <i class="fa-solid fa-pen"></i>
                  Editar
                </button>
                <button class="btn ghost tiny danger-text" type="button" @click="handleDeleteCsvInvestmentRule(rule.id)">
                  <i class="fa-solid fa-trash"></i>
                  Remover
                </button>
              </div>
            </article>
          </div>
          <p v-else class="empty-state">Nenhuma regra configurada. Sem regra, o sistema usa apenas heuristica automatica.</p>
        </section>

        <p v-if="nonBRLAssetsCount > 0" class="empty-state" style="margin-bottom: 1rem;">
          {{ nonBRLAssetsCount }} ativo(s) em moeda diferente de BRL não entram nos KPIs agregados.
        </p>

        <section class="investment-section">
          <header class="section-head">
            <h3>Lançamento rápido</h3>
            <p>Evita trocar de tela para registrar aporte ou resgate.</p>
          </header>
          <form class="form-stack" @submit.prevent="handleSubmitQuickTransaction">
            <div class="row-3">
              <label>
                Tipo
                <select v-model="quickTxn.kind">
                  <option value="aporte">Aporte</option>
                  <option value="resgate">Resgate</option>
                </select>
              </label>
              <label>
                Ativo (opcional)
                <select v-model="quickTxn.assetId">
                  <option value="">Não vincular</option>
                  <option v-for="asset in sortedAssets" :key="asset.id" :value="asset.id">{{ asset.name }}</option>
                </select>
              </label>
              <label>
                Valor
                <input v-model.number="quickTxn.amount" type="number" min="0.01" step="0.01" required />
              </label>
            </div>
            <div class="row-3">
              <label>
                Data
                <input v-model="quickTxn.date" type="date" required />
              </label>
              <label>
                Método
                <select v-model="quickTxn.method">
                  <option value="transferencia">Transferência</option>
                  <option value="pix">PIX</option>
                  <option value="debito">Débito</option>
                  <option value="credito">Crédito</option>
                  <option value="boleto">Boleto</option>
                  <option value="dinheiro">Dinheiro</option>
                  <option value="outros">Outros</option>
                </select>
              </label>
              <label>
                Conta
                <select v-model="quickTxn.accountId">
                  <option value="">Sem conta</option>
                  <option v-for="acc in data.accounts" :key="acc.id" :value="acc.id">{{ acc.name }}</option>
                </select>
              </label>
            </div>
            <label>
              Descrição (opcional)
              <input v-model="quickTxn.description" type="text" placeholder="Ex: Aporte mensal no ativo" maxlength="140" />
            </label>
            <div class="row-actions">
              <button class="btn primary" type="submit">
                <i class="fa-solid fa-plus"></i>
                Salvar lançamento
              </button>
            </div>
          </form>
        </section>

        <section class="investment-section">
          <header class="section-head">
            <h3>{{ editingAssetId ? 'Editar ativo' : 'Novo ativo da carteira' }}</h3>
            <p>Use a busca para selecionar o ativo e preencher os campos automaticamente.</p>
          </header>
          <form class="form-stack" @submit.prevent="handleSubmitAsset">
            <div class="row-3">
              <label>
                Buscar ativo de mercado
                <input
                  v-model="assetLookup.query"
                  type="text"
                  maxlength="60"
                  placeholder="Ex: PETR4, Apple, Bitcoin"
                  @keydown.enter.prevent="handleSearchAssetOptions"
                />
              </label>
              <label>
                Ativo sugerido
                <select v-model="assetLookup.selectedKey" @change="handleApplySelectedAssetOption">
                  <option value="">Selecione para auto-preencher</option>
                  <option v-if="assetLookup.options.length" disabled value="__group_market__">Resultados da busca</option>
                  <option v-for="opt in assetLookup.options" :key="opt.optionKey" :value="opt.optionKey">
                    {{ opt.label }}
                  </option>
                  <option disabled value="__group_presets__">Sugestões rápidas</option>
                  <option v-for="opt in presetAssetOptions" :key="opt.optionKey" :value="opt.optionKey">
                    {{ opt.label }}
                  </option>
                </select>
              </label>
              <label class="asset-search-action">
                Ação
                <button class="btn ghost" type="button" :disabled="assetLookup.loading" @click="handleSearchAssetOptions">
                  <i class="fa-solid fa-magnifying-glass"></i>
                  {{ assetLookup.loading ? 'Buscando...' : 'Buscar no mercado' }}
                </button>
              </label>
            </div>
            <p v-if="assetLookup.options.length" class="field-help search-row-help">
              {{ assetLookup.options.length }} resultado(s) carregado(s). Você pode trocar a opção para alterar o preenchimento.
            </p>

            <div class="row-2">
              <label>
                Nome do ativo
                <input v-model="assetForm.name" type="text" maxlength="80" required placeholder="Ex: PETR4, Tesouro Selic" />
              </label>
              <label>
                Tipo de ativo
                <select v-model="assetForm.assetType" @change="handleAssetTypeChange">
                  <option value="renda_fixa">Renda fixa</option>
                  <option value="acao">Ação</option>
                  <option value="etf">ETF</option>
                  <option value="fii">FII</option>
                  <option value="fundo">Fundo</option>
                  <option value="cripto">Cripto</option>
                  <option value="outro">Outro</option>
                </select>
              </label>
            </div>
            <div class="row-3">
              <label>
                Categoria
                <select v-model="assetForm.category">
                  <option v-for="category in investmentCategoryOptions" :key="category" :value="category">{{ category }}</option>
                  <option value="__custom__">Personalizada</option>
                </select>
              </label>
              <label v-if="assetForm.category === '__custom__'">
                Categoria personalizada
                <input v-model="customCategoryValue" type="text" maxlength="50" placeholder="Ex: Bolsa de valores internacional" />
              </label>
              <label>
                Fonte de preço
                <select v-model="assetForm.pricingSource">
                  <option value="manual">Manual</option>
                  <option value="market">Mercado (ticker)</option>
                </select>
              </label>
              <label>
                Ticker
                <input
                  v-model="assetForm.ticker"
                  type="text"
                  maxlength="24"
                  :required="assetForm.pricingSource === 'market'"
                  placeholder="Ex: PETR4, PETR4.SA, AAPL"
                />
              </label>
            </div>
            <div class="row-3">
              <label>
                Quantidade
                <input v-model.number="assetForm.quantity" type="number" min="0" step="0.000001" required />
              </label>
              <label>
                Preço médio
                <input v-model.number="assetForm.averagePrice" type="number" min="0" step="0.0001" required />
              </label>
              <label>
                Preço atual manual
                <input
                  v-model.number="assetForm.currentPrice"
                  type="number"
                  min="0"
                  step="0.0001"
                  :disabled="assetForm.pricingSource === 'market'"
                  :placeholder="assetForm.pricingSource === 'market' ? 'Via cotação' : 'Opcional'"
                />
              </label>
            </div>
            <div class="row-3">
              <label>
                Taxa anual estimada (%)
                <input
                  v-model.number="assetForm.annualYieldRate"
                  type="number"
                  min="0"
                  max="500"
                  step="0.01"
                  placeholder="Opcional"
                />
              </label>
              <label>
                Perfil de cenário
                <select v-model="assetForm.expectedProfile">
                  <option value="conservador">Conservador</option>
                  <option value="base">Base</option>
                  <option value="agressivo">Agressivo</option>
                </select>
              </label>
              <label>
                Moeda
                <select v-model="assetForm.currency">
                  <option value="BRL">BRL</option>
                  <option value="USD">USD</option>
                  <option value="EUR">EUR</option>
                </select>
              </label>
            </div>
            <label>
              Observações
              <input v-model="assetForm.notes" type="text" maxlength="160" placeholder="Opcional" />
            </label>
            <div class="row-actions">
              <button class="btn primary" type="submit">
                {{ editingAssetId ? 'Atualizar ativo' : 'Criar ativo' }}
              </button>
              <button v-if="editingAssetId" class="btn ghost" type="button" @click="resetAssetForm">Cancelar</button>
            </div>
          </form>
        </section>

        <section class="investment-section">
          <header class="section-head">
            <h3>Posição por ativo</h3>
            <p>Carteira real por ativo, com P/L e variação quando houver ticker.</p>
          </header>

          <p v-if="!sortedAssets.length" class="empty-state">
            Nenhum ativo cadastrado. Crie um ativo acima para acompanhar a carteira.
          </p>

          <div v-else class="assets-grid">
            <article v-for="asset in sortedAssets" :key="asset.id" class="item-card asset-card">
              <header class="asset-head">
                <div>
                  <h4>{{ asset.name }}</h4>
                  <p class="asset-meta">
                    <span class="asset-chip">{{ assetTypeLabel(asset.assetType) }}</span>
                    <span class="asset-chip muted">{{ pricingSourceLabel(asset.pricingSource) }}</span>
                    <span v-if="asset.ticker" class="asset-chip ticker">{{ asset.ticker }}</span>
                  </p>
                </div>
                <div class="asset-actions">
                  <button
                    v-if="asset.pricingSource === 'market' && asset.ticker"
                    class="mini-btn"
                    type="button"
                    :disabled="refreshingQuotes[asset.id] === true"
                    @click="handleRefreshQuote(asset)"
                  >
                    <i class="fa-solid fa-arrows-rotate"></i>
                    {{ refreshingQuotes[asset.id] ? 'Atualizando' : 'Cotação' }}
                  </button>
                  <button class="mini-btn" type="button" @click="handleEditAsset(asset)">Editar</button>
                  <button class="mini-btn" type="button" @click="handleDeleteAsset(asset)">Excluir</button>
                </div>
              </header>

              <div class="asset-metrics">
                <div>
                  <span>Custo</span>
                  <strong>{{ formatByCurrency(asset.costBasis, asset.currency) }}</strong>
                </div>
                <div>
                  <span>Mercado</span>
                  <strong>{{ formatByCurrency(asset.marketValue, asset.currency) }}</strong>
                </div>
                <div>
                  <span>P/L</span>
                  <strong :class="asset.pnl >= 0 ? 'positive' : 'negative'">{{ formatByCurrency(asset.pnl, asset.currency) }}</strong>
                </div>
                <div>
                  <span>Proj. 12m</span>
                  <strong class="positive">{{ formatByCurrency(asset.projected12m, asset.currency) }}</strong>
                </div>
              </div>

              <p class="asset-details">
                Qtd: {{ formatQuantity(asset.quantityForCalc) }}
                · Preço médio: {{ formatByCurrency(asset.averagePrice, asset.currency) }}
                · Preço atual: {{ formatByCurrency(asset.unitPrice, asset.currency) }}
              </p>
              <p class="asset-details">
                Cenário: {{ profileLabel(asset.expectedProfile) }}
                · Taxa anual aplicada: {{ asset.appliedAnnualRate.toFixed(2) }}%
              </p>
              <p v-if="asset.lastQuoteAt" class="asset-details quote-line">
                Última cotação: {{ formatDateTime(asset.lastQuoteAt) }}
                <span
                  v-if="asset.lastQuoteChange !== null && asset.lastQuoteChange !== undefined"
                  :class="asset.lastQuoteChange >= 0 ? 'positive' : 'negative'"
                >
                  · {{ asset.lastQuoteChange >= 0 ? '+' : '' }}{{ asset.lastQuoteChange.toFixed(2) }}%
                </span>
              </p>
            </article>
          </div>
        </section>
      </article>
    </section>
  </div>
</template>

<script setup>
import { computed, inject, onMounted, reactive, ref, watch } from 'vue'
import { useDataStore } from '../stores/data.js'
import { useAppStore } from '../stores/app.js'
import { classifyInvestmentReceiptKind, formatCurrency, normalizeString } from '../helpers.js'

const data = useDataStore()
const app = useAppStore()
const confirm = inject('confirm', async () => true)

const ASSET_TYPE_LABELS = {
  renda_fixa: 'Renda fixa',
  acao: 'Ação',
  etf: 'ETF',
  fii: 'FII',
  fundo: 'Fundo',
  cripto: 'Cripto',
  outro: 'Outro',
}

const PRICING_SOURCE_LABELS = {
  manual: 'Manual',
  market: 'Mercado',
}

const PROFILE_LABELS = {
  conservador: 'Conservador',
  base: 'Base',
  agressivo: 'Agressivo',
}

const PROFILE_ANNUAL_RATES = {
  conservador: 5,
  base: 10,
  agressivo: 18,
}

const DEFAULT_CATEGORY_BY_ASSET_TYPE = {
  renda_fixa: 'Renda fixa',
  acao: 'Ações',
  etf: 'ETFs',
  fii: 'Fundos Imobiliários (FIIs)',
  fundo: 'Fundos',
  cripto: 'Criptoativos',
  outro: 'Investimentos',
}

const BASE_INVESTMENT_CATEGORIES = [
  'Investimentos',
  'Renda fixa',
  'CDB/RDB',
  'Tesouro Direto',
  'LCI/LCA',
  'Debentures/CRI/CRA',
  'Ações',
  'Ações internacionais',
  'ETFs',
  'Fundos Imobiliários (FIIs)',
  'Fundos',
  'Previdência',
  'Criptoativos',
  'Caixa de investimento',
  'Outros investimentos',
]

const presetAssetOptions = [
  {
    optionKey: 'preset:PETR4',
    label: 'PETR4 - Petrobras PN',
    symbol: 'PETR4.SA',
    name: 'PETR4',
    assetType: 'acao',
    category: 'Ações',
    pricingSource: 'market',
    currency: 'BRL',
  },
  {
    optionKey: 'preset:VALE3',
    label: 'VALE3 - Vale ON',
    symbol: 'VALE3.SA',
    name: 'VALE3',
    assetType: 'acao',
    category: 'Ações',
    pricingSource: 'market',
    currency: 'BRL',
  },
  {
    optionKey: 'preset:BOVA11',
    label: 'BOVA11 - ETF Ibovespa',
    symbol: 'BOVA11.SA',
    name: 'BOVA11',
    assetType: 'etf',
    category: 'ETFs',
    pricingSource: 'market',
    currency: 'BRL',
  },
  {
    optionKey: 'preset:IVVB11',
    label: 'IVVB11 - ETF S&P 500',
    symbol: 'IVVB11.SA',
    name: 'IVVB11',
    assetType: 'etf',
    category: 'ETFs',
    pricingSource: 'market',
    currency: 'BRL',
  },
  {
    optionKey: 'preset:HGLG11',
    label: 'HGLG11 - FII',
    symbol: 'HGLG11.SA',
    name: 'HGLG11',
    assetType: 'fii',
    category: 'Fundos Imobiliários (FIIs)',
    pricingSource: 'market',
    currency: 'BRL',
  },
  {
    optionKey: 'preset:BTC',
    label: 'BTC - Bitcoin',
    symbol: 'BTC-USD',
    name: 'Bitcoin',
    assetType: 'cripto',
    category: 'Criptoativos',
    pricingSource: 'market',
    currency: 'USD',
  },
  {
    optionKey: 'preset:ETH',
    label: 'ETH - Ethereum',
    symbol: 'ETH-USD',
    name: 'Ethereum',
    assetType: 'cripto',
    category: 'Criptoativos',
    pricingSource: 'market',
    currency: 'USD',
  },
  {
    optionKey: 'preset:TESOURO_SELIC',
    label: 'Tesouro Selic (manual)',
    symbol: '',
    name: 'Tesouro Selic',
    assetType: 'renda_fixa',
    category: 'Tesouro Direto',
    pricingSource: 'manual',
    currency: 'BRL',
    annualYieldRate: 10,
    expectedProfile: 'conservador',
  },
  {
    optionKey: 'preset:CDB',
    label: 'CDB/RDB (manual)',
    symbol: '',
    name: 'CDB/RDB',
    assetType: 'renda_fixa',
    category: 'CDB/RDB',
    pricingSource: 'manual',
    currency: 'BRL',
    annualYieldRate: 10,
    expectedProfile: 'conservador',
  },
]

function todayISO() {
  return new Date().toISOString().slice(0, 10)
}

function defaultAssetForm() {
  return {
    name: '',
    assetType: 'renda_fixa',
    category: 'Investimentos',
    ticker: '',
    pricingSource: 'manual',
    quantity: 0,
    averagePrice: 0,
    currentPrice: null,
    annualYieldRate: null,
    expectedProfile: 'base',
    currency: 'BRL',
    notes: '',
  }
}

const quickTxn = ref({
  kind: 'aporte',
  assetId: '',
  amount: null,
  date: todayISO(),
  method: 'transferencia',
  accountId: '',
  description: '',
})

const editingAssetId = ref('')
const assetForm = ref(defaultAssetForm())
const customCategoryValue = ref('')
const assetLookup = reactive({
  query: '',
  loading: false,
  selectedKey: '',
  options: [],
  lastMarketPrice: null,
})
const refreshingQuotes = reactive({})
const refreshingAllQuotes = ref(false)
const syncingAssetsFromCsv = ref(false)
const AUTO_QUOTE_REFRESH_KEY = 'gf_auto_quote_refresh_at'
const AUTO_QUOTE_REFRESH_INTERVAL_MS = 30 * 60 * 1000
const csvSyncRatesForm = ref({
  fixedIncomeMonthlyRate: '',
  nubankBoxMonthlyRate: '',
  nubankBoxTurboMonthlyRate: '',
})
const csvInvestmentRules = ref([])

function defaultCsvInvestmentRuleForm() {
  return {
    editingId: '',
    descriptionPattern: '',
    accountId: '',
    sourceKey: '',
    assetName: '',
    assetCategory: 'CDB/RDB',
    monthlyRate: '',
  }
}

const csvRuleForm = ref(defaultCsvInvestmentRuleForm())

const assetRows = computed(() => {
  return data.investmentAssets.map(asset => {
    const quantityForCalc = asset.quantity > 0 ? asset.quantity : (asset.pricingSource === 'manual' ? 1 : 0)
    const unitPrice = asset.currentPrice && asset.currentPrice > 0 ? asset.currentPrice : asset.averagePrice
    const costBasis = quantityForCalc * asset.averagePrice
    const marketValue = quantityForCalc * unitPrice
    const pnl = marketValue - costBasis

    const profileRate = PROFILE_ANNUAL_RATES[asset.expectedProfile] || PROFILE_ANNUAL_RATES.base
    const annualYieldRate = asset.annualYieldRate !== null && asset.annualYieldRate !== undefined
      ? Number(asset.annualYieldRate || 0)
      : 0
    const appliedAnnualRate = asset.pricingSource === 'market' ? profileRate : annualYieldRate
    const projected12m = marketValue * (1 + (appliedAnnualRate / 100))

    return {
      ...asset,
      quantityForCalc,
      unitPrice,
      costBasis,
      marketValue,
      pnl,
      projected12m,
      appliedAnnualRate,
    }
  })
})

const sortedAssets = computed(() => {
  return [...assetRows.value].sort((a, b) => b.marketValue - a.marketValue)
})

const sortedAccounts = computed(() => data.accounts.slice().sort((a, b) => a.name.localeCompare(b.name, 'pt-BR')))
const accountNameById = computed(() => {
  const map = new Map()
  sortedAccounts.value.forEach(acc => map.set(acc.id, acc.name))
  return map
})
const csvSourceOptions = computed(() => {
  const map = new Map()
  sortedAccounts.value.forEach(acc => {
    const source = data.getAccountCsvSource(acc.id)
    if (!source?.key) return
    if (!map.has(source.key)) map.set(source.key, source.label || source.key)
  })
  return Array.from(map.entries())
    .map(([key, label]) => ({ key, label }))
    .sort((a, b) => a.label.localeCompare(b.label, 'pt-BR'))
})
const csvSourceLabelByKey = computed(() => {
  const map = new Map()
  csvSourceOptions.value.forEach(item => map.set(item.key, item.label))
  return map
})

const assetsByID = computed(() => {
  const map = new Map()
  sortedAssets.value.forEach(item => map.set(item.id, item))
  return map
})

const assetCategories = computed(() => {
  return new Set(data.investmentAssets.map(item => normalizeString(String(item.category || '')).toLowerCase()).filter(Boolean))
})

const investmentCategoryOptions = computed(() => {
  const merged = new Map()
  BASE_INVESTMENT_CATEGORIES.forEach(category => {
    const normalized = normalizeString(category)
    if (!normalized) return
    merged.set(normalized.toLowerCase(), normalized)
  })
  data.categories
    .filter(item => normalizeString(item?.type || '').toLowerCase() === 'investimento')
    .forEach(item => {
      const normalized = normalizeString(item?.name || '')
      if (!normalized) return
      merged.set(normalized.toLowerCase(), normalized)
    })
  data.investmentAssets.forEach(item => {
    const normalized = normalizeString(item?.category || '')
    if (!normalized) return
    merged.set(normalized.toLowerCase(), normalized)
  })
  return Array.from(merged.values()).sort((a, b) => a.localeCompare(b, 'pt-BR'))
})

const marketLookupOptionByKey = computed(() => {
  const map = new Map()
  assetLookup.options.forEach(item => {
    map.set(item.optionKey, item)
  })
  return map
})

const presetOptionByKey = computed(() => {
  const map = new Map()
  presetAssetOptions.forEach(item => {
    map.set(item.optionKey, item)
  })
  return map
})

const monthlyInvested = computed(() => {
  const monthly = data.monthlyTransactions(app.currentMonth)
  return monthly.filter(t => t.type === 'investimento').reduce((sum, t) => sum + Number(t.amount || 0), 0)
})

const monthlyRedeemed = computed(() => {
  const cats = assetCategories.value
  if (!cats.size) return 0
  const monthly = data.monthlyTransactions(app.currentMonth)
  return monthly
    .filter(t => t.type === 'receita' && cats.has(normalizeString(String(t.category || '')).toLowerCase()))
    .filter(t => classifyInvestmentReceiptKind(t.description || '', { category: t.category, method: t.method }) === 'redemption')
    .reduce((sum, t) => sum + Number(t.amount || 0), 0)
})

const brlAssets = computed(() => sortedAssets.value.filter(item => (item.currency || 'BRL') === 'BRL'))
const nonBRLAssetsCount = computed(() => sortedAssets.value.length - brlAssets.value.length)

const totalCostBRL = computed(() => brlAssets.value.reduce((sum, item) => sum + item.costBasis, 0))
const totalMarketBRL = computed(() => brlAssets.value.reduce((sum, item) => sum + item.marketValue, 0))
const totalPnLBRL = computed(() => round2(totalMarketBRL.value - totalCostBRL.value))
const totalProjectedBRL = computed(() => brlAssets.value.reduce((sum, item) => sum + item.projected12m, 0))

function round2(value) {
  return Math.round((Number(value) + Number.EPSILON) * 100) / 100
}

function parseOptionalCsvMonthlyRate(value) {
  const raw = normalizeString(String(value ?? '')).replace(',', '.')
  if (!raw) return null
  const parsed = Number(raw)
  if (!Number.isFinite(parsed)) return null
  if (parsed < 0 || parsed > 100) return null
  return round2(parsed)
}

function monthlyRateToAnnualEquivalent(monthlyRate) {
  const monthly = parseOptionalCsvMonthlyRate(monthlyRate)
  if (monthly === null) return null
  const annual = (Math.pow(1 + (monthly / 100), 12) - 1) * 100
  return round2(annual)
}

function formatAnnualEquivalent(monthlyRate) {
  const annual = monthlyRateToAnnualEquivalent(monthlyRate)
  return annual === null ? '-' : `${annual.toFixed(2)}% a.a.`
}

function loadCsvSyncRatesForm() {
  const saved = data.getCsvSyncMonthlyRates()
  csvSyncRatesForm.value = {
    fixedIncomeMonthlyRate: saved.fixedIncomeMonthlyRate ?? '',
    nubankBoxMonthlyRate: saved.nubankBoxMonthlyRate ?? '',
    nubankBoxTurboMonthlyRate: saved.nubankBoxTurboMonthlyRate ?? '',
  }
}

function buildCsvSyncRatesPayload(strict = false) {
  const fixedIncomeMonthlyRate = parseOptionalCsvMonthlyRate(csvSyncRatesForm.value.fixedIncomeMonthlyRate)
  const nubankBoxMonthlyRate = parseOptionalCsvMonthlyRate(csvSyncRatesForm.value.nubankBoxMonthlyRate)
  const nubankBoxTurboMonthlyRate = parseOptionalCsvMonthlyRate(csvSyncRatesForm.value.nubankBoxTurboMonthlyRate)
  if (strict) {
    if (normalizeString(String(csvSyncRatesForm.value.fixedIncomeMonthlyRate ?? '')) && fixedIncomeMonthlyRate === null) {
      throw new Error('Taxa mensal padrao de renda fixa invalida.')
    }
    if (normalizeString(String(csvSyncRatesForm.value.nubankBoxMonthlyRate ?? '')) && nubankBoxMonthlyRate === null) {
      throw new Error('Taxa mensal da caixinha padrao invalida.')
    }
    if (normalizeString(String(csvSyncRatesForm.value.nubankBoxTurboMonthlyRate ?? '')) && nubankBoxTurboMonthlyRate === null) {
      throw new Error('Taxa mensal da caixinha turbo invalida.')
    }
  }
  return { fixedIncomeMonthlyRate, nubankBoxMonthlyRate, nubankBoxTurboMonthlyRate }
}

async function handleSaveCsvSyncRates() {
  try {
    const payload = buildCsvSyncRatesPayload(true)
    data.setCsvSyncMonthlyRates(payload)
    app.showMessage('Taxas mensais para sincronizacao CSV salvas.', 'success')
  } catch (err) {
    app.showMessage(err?.message || 'Falha ao salvar taxas mensais.', 'error')
  }
}

function loadCsvInvestmentRules() {
  csvInvestmentRules.value = data.getCsvInvestmentRules()
}

function buildCsvInvestmentRulePayload(strict = false) {
  const editingId = normalizeString(String(csvRuleForm.value.editingId || ''))
  const descriptionPattern = normalizeString(String(csvRuleForm.value.descriptionPattern || ''))
  const accountId = normalizeString(String(csvRuleForm.value.accountId || ''))
  const sourceKey = normalizeString(String(csvRuleForm.value.sourceKey || '')).toLowerCase()
  const assetName = normalizeString(String(csvRuleForm.value.assetName || ''))
  const assetCategory = normalizeString(String(csvRuleForm.value.assetCategory || '')) || 'CDB/RDB'
  const monthlyRate = parseOptionalCsvMonthlyRate(csvRuleForm.value.monthlyRate)

  if (strict) {
    if (!descriptionPattern) throw new Error('Informe um padrao para descricao.')
    if (!assetName) throw new Error('Informe o nome do ativo de destino.')
    if (normalizeString(String(csvRuleForm.value.monthlyRate ?? '')) && monthlyRate === null) {
      throw new Error('Taxa mensal da regra invalida.')
    }
  }

  return {
    id: editingId || '',
    descriptionPattern,
    accountId,
    sourceKey,
    assetName,
    assetCategory,
    assetType: 'renda_fixa',
    monthlyRate,
  }
}

function handleSaveCsvInvestmentRule() {
  try {
    const payload = buildCsvInvestmentRulePayload(true)
    const next = [...csvInvestmentRules.value]
    const normalizedPattern = payload.descriptionPattern.toLowerCase()
    const normalizedSource = payload.sourceKey.toLowerCase()

    if (payload.id) {
      const editIndex = next.findIndex(item => item.id === payload.id)
      if (editIndex >= 0) next[editIndex] = { ...next[editIndex], ...payload, id: next[editIndex].id }
      else next.push(payload)
    } else {
      const duplicateIndex = next.findIndex(item => (
        normalizeString(String(item.descriptionPattern || '')).toLowerCase() === normalizedPattern
        && normalizeString(String(item.accountId || '')) === payload.accountId
        && normalizeString(String(item.sourceKey || '')).toLowerCase() === normalizedSource
      ))
      if (duplicateIndex >= 0) next[duplicateIndex] = { ...next[duplicateIndex], ...payload, id: next[duplicateIndex].id }
      else next.push(payload)
    }

    csvInvestmentRules.value = data.setCsvInvestmentRules(next)
    csvRuleForm.value = defaultCsvInvestmentRuleForm()
    app.showMessage('Regra de mapeamento CSV salva.', 'success')
  } catch (err) {
    app.showMessage(err?.message || 'Falha ao salvar regra CSV.', 'error')
  }
}

function handleEditCsvInvestmentRule(rule) {
  if (!rule?.id) return
  csvRuleForm.value = {
    editingId: rule.id,
    descriptionPattern: rule.descriptionPattern || '',
    accountId: rule.accountId || '',
    sourceKey: rule.sourceKey || '',
    assetName: rule.assetName || '',
    assetCategory: rule.assetCategory || 'CDB/RDB',
    monthlyRate: rule.monthlyRate === null || rule.monthlyRate === undefined ? '' : String(rule.monthlyRate),
  }
}

function handleCancelCsvRuleEdit() {
  csvRuleForm.value = defaultCsvInvestmentRuleForm()
}

function handleDeleteCsvInvestmentRule(ruleId) {
  const normalizedId = normalizeString(String(ruleId || ''))
  if (!normalizedId) return
  csvInvestmentRules.value = data.setCsvInvestmentRules(
    csvInvestmentRules.value.filter(item => item.id !== normalizedId)
  )
  if (normalizeString(String(csvRuleForm.value.editingId || '')) === normalizedId) {
    csvRuleForm.value = defaultCsvInvestmentRuleForm()
  }
  app.showMessage('Regra de mapeamento CSV removida.', 'success')
}

function csvRuleAccountLabel(rule) {
  const accountId = normalizeString(String(rule?.accountId || ''))
  if (!accountId) return 'todas'
  return accountNameById.value.get(accountId) || 'conta nao encontrada'
}

function csvRuleSourceLabel(rule) {
  const sourceKey = normalizeString(String(rule?.sourceKey || ''))
  if (!sourceKey) return 'qualquer origem'
  return csvSourceLabelByKey.value.get(sourceKey) || sourceKey
}

function formatByCurrency(value, currency = 'BRL') {
  const cur = normalizeString(String(currency || 'BRL')).toUpperCase() || 'BRL'
  try {
    return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: cur }).format(Number(value || 0))
  } catch {
    return formatCurrency(value || 0)
  }
}

function formatQuantity(value) {
  const num = Number(value || 0)
  if (!Number.isFinite(num)) return '0'
  return num.toLocaleString('pt-BR', { minimumFractionDigits: 0, maximumFractionDigits: 6 })
}

function formatDateTime(value) {
  const iso = normalizeString(String(value || ''))
  if (!iso) return ''
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return iso
  return date.toLocaleString('pt-BR')
}

function assetTypeLabel(type) {
  return ASSET_TYPE_LABELS[type] || 'Outro'
}

function pricingSourceLabel(source) {
  return PRICING_SOURCE_LABELS[source] || 'Manual'
}

function profileLabel(profile) {
  return PROFILE_LABELS[profile] || 'Base'
}

function resolveCategoryFromForm() {
  if (assetForm.value.category === '__custom__') {
    const custom = normalizeString(customCategoryValue.value)
    return custom || 'Investimentos'
  }
  return normalizeString(assetForm.value.category || '') || 'Investimentos'
}

function setCategoryOnForm(category) {
  const normalized = normalizeString(category || '')
  if (!normalized) {
    assetForm.value.category = 'Investimentos'
    customCategoryValue.value = ''
    return
  }
  const known = investmentCategoryOptions.value.find(item => item.toLowerCase() === normalized.toLowerCase())
  if (known) {
    assetForm.value.category = known
    customCategoryValue.value = ''
    return
  }
  assetForm.value.category = '__custom__'
  customCategoryValue.value = normalized
}

function handleAssetTypeChange() {
  const nextType = assetForm.value.assetType
  if (nextType === 'acao' || nextType === 'etf' || nextType === 'fii' || nextType === 'cripto') {
    assetForm.value.pricingSource = 'market'
    assetForm.value.currentPrice = null
  } else if (nextType === 'renda_fixa' && assetForm.value.pricingSource !== 'manual') {
    assetForm.value.pricingSource = 'manual'
  }
  const currentCategory = resolveCategoryFromForm().toLowerCase()
  if (currentCategory === 'investimentos' || currentCategory === '') {
    setCategoryOnForm(DEFAULT_CATEGORY_BY_ASSET_TYPE[nextType] || 'Investimentos')
  }
}

function buildMarketLookupOption(item = {}) {
  const symbol = normalizeString(String(item.symbol || '')).toUpperCase()
  const name = normalizeString(String(item.name || '')) || symbol
  const exchange = normalizeString(String(item.exchange || ''))
  const marketPriceRaw = Number(item.marketPrice)
  const marketPrice = Number.isFinite(marketPriceRaw) && marketPriceRaw > 0 ? marketPriceRaw : null
  const label = exchange ? `${symbol} - ${name} (${exchange})` : `${symbol} - ${name}`
  return {
    optionKey: `market:${item.key || symbol}`,
    label,
    symbol,
    name,
    marketPrice,
    assetType: normalizeString(String(item.suggestedAssetType || 'outro')).toLowerCase() || 'outro',
    category: normalizeString(String(item.suggestedCategory || 'Investimentos')) || 'Investimentos',
    pricingSource: normalizeString(String(item.suggestedPricingSource || 'market')).toLowerCase() || 'market',
    currency: normalizeString(String(item.currency || 'BRL')).toUpperCase() || 'BRL',
    expectedProfile: 'base',
  }
}

async function applyAssetSuggestion(option) {
  if (!option) return
  assetForm.value.name = normalizeString(option.name || option.symbol || assetForm.value.name || '')
  assetForm.value.assetType = normalizeString(option.assetType || 'outro').toLowerCase() || 'outro'
  assetForm.value.pricingSource = normalizeString(option.pricingSource || (option.symbol ? 'market' : 'manual')).toLowerCase() || 'manual'
  assetForm.value.ticker = normalizeString(option.symbol || option.ticker || '').toUpperCase()
  assetForm.value.currency = normalizeString(option.currency || 'BRL').toUpperCase() || 'BRL'
  assetForm.value.expectedProfile = normalizeString(option.expectedProfile || assetForm.value.expectedProfile || 'base').toLowerCase() || 'base'
  if (assetForm.value.pricingSource === 'market') {
    assetForm.value.currentPrice = null
    let marketPrice = Number(option.marketPrice || 0)
    if (!(marketPrice > 0) && assetForm.value.ticker) {
      const quote = await data.fetchMarketQuoteBySymbol(assetForm.value.ticker, { silent: true })
      if (quote?.price > 0) {
        marketPrice = quote.price
        assetForm.value.currency = quote.currency || assetForm.value.currency
      }
    }
    if (marketPrice > 0) {
      assetForm.value.averagePrice = marketPrice
      assetLookup.lastMarketPrice = marketPrice
    }
  }
  if ((assetForm.value.assetType === 'renda_fixa') && (assetForm.value.annualYieldRate === null || assetForm.value.annualYieldRate === undefined) && Number.isFinite(Number(option.annualYieldRate))) {
    assetForm.value.annualYieldRate = Number(option.annualYieldRate)
  }
  const defaultCategory = option.category || DEFAULT_CATEGORY_BY_ASSET_TYPE[assetForm.value.assetType] || 'Investimentos'
  setCategoryOnForm(defaultCategory)
}

async function handleSearchAssetOptions() {
  const query = normalizeString(assetLookup.query)
  if (query.length < 2) {
    app.showMessage('Digite pelo menos 2 caracteres para buscar ativo.', 'info')
    return
  }
  assetLookup.loading = true
  try {
    const found = await data.searchMarketInvestmentAssets(query, { silent: true, limit: 12 })
    assetLookup.options = found.map(item => buildMarketLookupOption(item))
    if (!assetLookup.options.length) {
      app.showMessage('Nenhum ativo encontrado para essa busca.', 'info')
      return
    }
    assetLookup.selectedKey = assetLookup.options[0].optionKey
    await handleApplySelectedAssetOption()
    app.showMessage(`${assetLookup.options.length} resultado(s) encontrado(s). Primeiro ativo aplicado automaticamente.`, 'info')
  } finally {
    assetLookup.loading = false
  }
}

async function handleApplySelectedAssetOption() {
  const key = normalizeString(assetLookup.selectedKey)
  if (!key || key.startsWith('__group_')) return
  const fromMarket = marketLookupOptionByKey.value.get(key)
  const fromPreset = presetOptionByKey.value.get(key)
  const option = fromMarket || fromPreset
  if (!option) return
  await applyAssetSuggestion(option)
}

function buildQuickTransactionPayload() {
  const selectedAsset = quickTxn.value.assetId ? assetsByID.value.get(quickTxn.value.assetId) : null
  const isAporte = quickTxn.value.kind === 'aporte'
  const category = selectedAsset?.category || 'Investimentos'
  const baseDescription = isAporte ? 'Aporte investimento' : 'Resgate investimento'
  const description = normalizeString(quickTxn.value.description) || `${baseDescription}${selectedAsset ? ` - ${selectedAsset.name}` : ''}`
  return {
    date: quickTxn.value.date,
    type: isAporte ? 'investimento' : 'receita',
    category,
    method: normalizeString(quickTxn.value.method || 'transferencia').toLowerCase() || 'transferencia',
    description,
    amount: Number(quickTxn.value.amount || 0),
    recurrence: 'none',
    installments: 0,
    accountId: quickTxn.value.accountId || '',
  }
}

async function handleSubmitQuickTransaction() {
  if (Number(quickTxn.value.amount || 0) <= 0) {
    app.showMessage('Informe um valor maior que zero.', 'error')
    return
  }
  const payload = buildQuickTransactionPayload()
  const ok = await data.saveTransaction(payload)
  if (!ok) return
  quickTxn.value.amount = null
  quickTxn.value.description = ''
}

async function handleSubmitAsset() {
  const category = resolveCategoryFromForm()
  if (!category) {
    app.showMessage('Informe uma categoria válida para o ativo.', 'error')
    return
  }
  const payload = {
    id: editingAssetId.value || undefined,
    ...assetForm.value,
    category,
  }
  const saved = await data.saveInvestmentAsset(payload)
  if (!saved) return
  resetAssetForm()
}

function resetAssetForm() {
  editingAssetId.value = ''
  assetForm.value = defaultAssetForm()
  customCategoryValue.value = ''
  assetLookup.selectedKey = ''
  assetLookup.lastMarketPrice = null
}

function handleEditAsset(asset) {
  editingAssetId.value = asset.id
  assetForm.value = {
    name: asset.name,
    assetType: asset.assetType,
    category: 'Investimentos',
    ticker: asset.ticker || '',
    pricingSource: asset.pricingSource,
    quantity: asset.quantity,
    averagePrice: asset.averagePrice,
    currentPrice: asset.currentPrice,
    annualYieldRate: asset.annualYieldRate,
    expectedProfile: asset.expectedProfile || 'base',
    currency: asset.currency || 'BRL',
    notes: asset.notes || '',
  }
  setCategoryOnForm(asset.category || 'Investimentos')
}

async function handleDeleteAsset(asset) {
  const ok = await confirm({
    title: 'Excluir ativo',
    message: `Excluir o ativo "${asset.name}" da carteira?`,
    confirmLabel: 'Excluir',
    tone: 'danger',
  })
  if (!ok) return
  await data.deleteInvestmentAsset(asset.id)
}

async function handleRefreshQuote(asset) {
  if (!asset?.id) return
  refreshingQuotes[asset.id] = true
  try {
    await data.refreshInvestmentAssetQuote(asset.id)
  } finally {
    refreshingQuotes[asset.id] = false
  }
}

async function handleRefreshAllQuotes() {
  refreshingAllQuotes.value = true
  try {
    const summary = await data.refreshAllInvestmentQuotes()
    if (summary.updated > 0 || summary.failed > 0) {
      localStorage.setItem(AUTO_QUOTE_REFRESH_KEY, String(Date.now()))
    }
    if (summary.total > 0) {
      app.showMessage(`Cotações atualizadas: ${summary.updated}/${summary.total}.`, summary.failed > 0 ? 'info' : 'success')
    } else {
      app.showMessage('Nenhum ativo de mercado para atualizar.', 'info')
    }
  } finally {
    refreshingAllQuotes.value = false
  }
}

async function handleSyncAssetsFromCsv() {
  let ratesPayload
  try {
    ratesPayload = buildCsvSyncRatesPayload(true)
  } catch (err) {
    app.showMessage(err?.message || 'Revise as taxas mensais configuradas para o CSV.', 'error')
    return
  }

  syncingAssetsFromCsv.value = true
  try {
    data.setCsvSyncMonthlyRates(ratesPayload)
    const summary = await data.syncInvestmentAssetsFromTransactions({
      silent: true,
      ...ratesPayload,
    })
    const detected = Number(summary?.detected || 0)
    const created = Number(summary?.created || 0)
    const quoted = Number(summary?.quoted || 0)
    const estimated = Number(summary?.estimated || 0)
    const fixedIncomeRated = Number(summary?.fixedIncomeRated || 0)
    const failed = Number(summary?.failed || 0)
    let msg = detected > 0
      ? `Detectados ${detected} padrão(ões) de ativos nos lançamentos.`
      : 'Nenhum padrão de ativo foi detectado nos lançamentos.'
    if (created > 0) msg += ` ${created} ativo(s) criado(s).`
    if (quoted > 0) msg += ` ${quoted} cotação(ões) atualizada(s).`
    if (estimated > 0) msg += ` ${estimated} ativo(s) com quantidade estimada.`
    if (fixedIncomeRated > 0) msg += ` ${fixedIncomeRated} ativo(s) de renda fixa com taxa anual preenchida.`
    if (failed > 0) msg += ` ${failed} falha(s).`
    app.showMessage(msg, failed > 0 ? 'info' : (created > 0 || quoted > 0 ? 'success' : 'info'))
  } finally {
    syncingAssetsFromCsv.value = false
  }
}

async function autoRefreshQuotesOnOpen() {
  const hasMarketAssets = data.investmentAssets.some(item => item.pricingSource === 'market' && item.ticker)
  if (!hasMarketAssets) return
  const lastRefresh = Number(localStorage.getItem(AUTO_QUOTE_REFRESH_KEY) || 0)
  if (lastRefresh > 0 && (Date.now() - lastRefresh) < AUTO_QUOTE_REFRESH_INTERVAL_MS) return

  const summary = await data.refreshAllInvestmentQuotes()
  if (summary.updated > 0 || summary.failed > 0) {
    localStorage.setItem(AUTO_QUOTE_REFRESH_KEY, String(Date.now()))
  }
  if (summary.failed > 0) {
    app.showMessage(`Cotação automática: ${summary.updated}/${summary.total} atualizada(s).`, 'info')
  }
}

onMounted(() => {
  loadCsvSyncRatesForm()
  loadCsvInvestmentRules()
  autoRefreshQuotesOnOpen()
})

watch(() => Number(assetForm.value.quantity || 0), (qty) => {
  if (assetForm.value.pricingSource !== 'market') return
  if (qty <= 0) return
  if (Number(assetForm.value.averagePrice || 0) > 0) return
  if (Number(assetLookup.lastMarketPrice || 0) <= 0) return
  assetForm.value.averagePrice = assetLookup.lastMarketPrice
})
</script>

<style scoped>
.investments-kpis {
  margin-bottom: 1rem;
}

.header-actions {
  display: flex;
  gap: 0.5rem;
  flex-wrap: wrap;
  justify-content: flex-end;
}

.investment-section {
  border: 1px solid var(--border);
  border-radius: var(--radius-md);
  padding: 0.9rem;
  background: rgba(255, 255, 255, 0.015);
  margin-bottom: 1rem;
}

.section-head {
  margin-bottom: 0.8rem;
}

.section-head h3 {
  font-size: 1rem;
  margin: 0;
}

.section-head p {
  margin: 0.2rem 0 0;
  color: var(--text-secondary);
  font-size: 0.84rem;
}

.asset-search-action {
  display: flex;
  flex-direction: column;
  justify-content: flex-end;
}

.asset-search-action .btn {
  width: 100%;
}

.field-help {
  display: block;
  margin-top: 0.35rem;
  font-size: 0.74rem;
  color: var(--text-secondary);
}

.csv-rules-list {
  display: flex;
  flex-direction: column;
  gap: 0.55rem;
  margin-top: 0.7rem;
}

.csv-rule-card {
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
  padding: 0.6rem 0.7rem;
  background: rgba(255, 255, 255, 0.02);
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  gap: 0.7rem;
}

.csv-rule-title {
  margin: 0;
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 0.35rem;
}

.csv-rule-meta {
  margin: 0.35rem 0 0;
  color: var(--text-secondary);
  font-size: 0.78rem;
}

.search-row-help {
  margin-top: -0.15rem;
  margin-bottom: 0.35rem;
}

:deep(select option[disabled]) {
  color: var(--text-secondary);
}

.assets-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(300px, 1fr));
  gap: 0.75rem;
}

.asset-card {
  border-color: var(--border-accent);
}

.asset-head {
  display: flex;
  justify-content: space-between;
  gap: 0.75rem;
  margin-bottom: 0.75rem;
}

.asset-head h4 {
  margin: 0;
  font-size: 0.98rem;
}

.asset-meta {
  margin: 0.35rem 0 0;
  display: flex;
  flex-wrap: wrap;
  gap: 0.35rem;
}

.asset-chip {
  border: 1px solid var(--border);
  border-radius: var(--radius-full);
  padding: 0.1rem 0.55rem;
  font-size: 0.72rem;
  color: var(--text);
}

.asset-chip.muted {
  color: var(--text-secondary);
}

.asset-chip.ticker {
  border-color: var(--border-accent);
}

.asset-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 0.35rem;
  justify-content: flex-end;
}

.asset-metrics {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 0.55rem;
  margin-bottom: 0.65rem;
}

.asset-metrics span {
  color: var(--text-secondary);
  font-size: 0.75rem;
}

.asset-metrics strong {
  display: block;
  font-size: 0.95rem;
}

.asset-details {
  margin: 0.15rem 0;
  color: var(--text-secondary);
  font-size: 0.8rem;
}

.quote-line {
  padding-top: 0.2rem;
}

@media (max-width: 640px) {
  .header-actions {
    width: 100%;
    justify-content: flex-start;
  }

  .investment-section {
    padding: 0.75rem;
  }

  .asset-head {
    flex-direction: column;
  }

  .asset-actions {
    justify-content: flex-start;
  }

  .assets-grid {
    grid-template-columns: 1fr;
  }

  .asset-metrics {
    grid-template-columns: 1fr;
  }

  .csv-rule-card {
    flex-direction: column;
  }
}
</style>
