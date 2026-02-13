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
              {{ refreshingAllQuotes ? 'Atualizando...' : 'Atualizar cotacoes de mercado' }}
            </button>
          </div>
        </header>

        <section class="kpi-grid investments-kpis">
          <article class="kpi-card">
            <p>Aportes no mes</p>
            <strong class="warning">{{ formatCurrency(monthlyInvested) }}</strong>
          </article>
          <article class="kpi-card">
            <p>Resgates no mes</p>
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
            <p>Resultado nao realizado (BRL)</p>
            <strong :class="totalPnLBRL >= 0 ? 'positive' : 'negative'">{{ formatCurrency(totalPnLBRL) }}</strong>
          </article>
          <article class="kpi-card">
            <p>Projecao 12 meses (BRL)</p>
            <strong class="positive">{{ formatCurrency(totalProjectedBRL) }}</strong>
          </article>
        </section>

        <div class="info-banner" style="margin-bottom: 1rem;">
          <p><strong><i class="fa-solid fa-circle-info"></i> Como esta tela funciona agora</strong></p>
          <p>Lancamento rapido: voce registra aporte/resgate sem sair desta tela.</p>
          <p>Carteira por ativo: voce acompanha custo, valor de mercado, P/L e variacao.</p>
          <p>Renda variavel usa cotacao de mercado (ticker). Renda fixa usa taxa anual opcional.</p>
        </div>

        <p v-if="nonBRLAssetsCount > 0" class="empty-state" style="margin-bottom: 1rem;">
          {{ nonBRLAssetsCount }} ativo(s) em moeda diferente de BRL nao entram nos KPIs agregados.
        </p>

        <section class="investment-section">
          <header class="section-head">
            <h3>Lancamento rapido</h3>
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
                  <option value="">Nao vincular</option>
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
                Metodo
                <select v-model="quickTxn.method">
                  <option value="transferencia">Transferencia</option>
                  <option value="pix">PIX</option>
                  <option value="debito">Debito</option>
                  <option value="credito">Credito</option>
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
              Descricao (opcional)
              <input v-model="quickTxn.description" type="text" placeholder="Ex: Aporte mensal no ativo" maxlength="140" />
            </label>
            <div class="row-actions">
              <button class="btn primary" type="submit">
                <i class="fa-solid fa-plus"></i>
                Salvar lancamento
              </button>
            </div>
          </form>
        </section>

        <section class="investment-section">
          <header class="section-head">
            <h3>{{ editingAssetId ? 'Editar ativo' : 'Novo ativo da carteira' }}</h3>
            <p>Ativos de mercado puxam cotacao por ticker. Ativos manuais aceitam preco informado.</p>
          </header>
          <form class="form-stack" @submit.prevent="handleSubmitAsset">
            <div class="row-2">
              <label>
                Nome do ativo
                <input v-model="assetForm.name" type="text" maxlength="80" required placeholder="Ex: PETR4, Tesouro Selic" />
              </label>
              <label>
                Tipo de ativo
                <select v-model="assetForm.assetType" @change="handleAssetTypeChange">
                  <option value="renda_fixa">Renda fixa</option>
                  <option value="acao">Acao</option>
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
                <input v-model="assetForm.category" type="text" maxlength="40" placeholder="Ex: Acoes, Renda fixa" />
              </label>
              <label>
                Fonte de preco
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
                Preco medio
                <input v-model.number="assetForm.averagePrice" type="number" min="0" step="0.0001" required />
              </label>
              <label>
                Preco atual manual
                <input
                  v-model.number="assetForm.currentPrice"
                  type="number"
                  min="0"
                  step="0.0001"
                  :disabled="assetForm.pricingSource === 'market'"
                  :placeholder="assetForm.pricingSource === 'market' ? 'Via cotacao' : 'Opcional'"
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
                Perfil de cenario
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
              Observacoes
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
            <h3>Posicao por ativo</h3>
            <p>Carteira real por ativo, com P/L e variacao quando houver ticker.</p>
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
                    {{ refreshingQuotes[asset.id] ? 'Atualizando' : 'Cotacao' }}
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
                · Preco medio: {{ formatByCurrency(asset.averagePrice, asset.currency) }}
                · Preco atual: {{ formatByCurrency(asset.unitPrice, asset.currency) }}
              </p>
              <p class="asset-details">
                Cenario: {{ profileLabel(asset.expectedProfile) }}
                · Taxa anual aplicada: {{ asset.appliedAnnualRate.toFixed(2) }}%
              </p>
              <p v-if="asset.lastQuoteAt" class="asset-details quote-line">
                Ultima cotacao: {{ formatDateTime(asset.lastQuoteAt) }}
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
import { computed, inject, onMounted, reactive, ref } from 'vue'
import { useDataStore } from '../stores/data.js'
import { useAppStore } from '../stores/app.js'
import { formatCurrency, normalizeString } from '../helpers.js'

const data = useDataStore()
const app = useAppStore()
const confirm = inject('confirm', async () => true)

const ASSET_TYPE_LABELS = {
  renda_fixa: 'Renda fixa',
  acao: 'Acao',
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
const refreshingQuotes = reactive({})
const refreshingAllQuotes = ref(false)
const syncingAssetsFromCsv = ref(false)
const AUTO_QUOTE_REFRESH_KEY = 'gf_auto_quote_refresh_at'
const AUTO_QUOTE_REFRESH_INTERVAL_MS = 30 * 60 * 1000

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

const assetsByID = computed(() => {
  const map = new Map()
  sortedAssets.value.forEach(item => map.set(item.id, item))
  return map
})

const assetCategories = computed(() => {
  return new Set(data.investmentAssets.map(item => normalizeString(String(item.category || '')).toLowerCase()).filter(Boolean))
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

function handleAssetTypeChange() {
  if (assetForm.value.assetType === 'acao' || assetForm.value.assetType === 'etf' || assetForm.value.assetType === 'fii') {
    assetForm.value.pricingSource = 'market'
  }
  if (assetForm.value.assetType === 'renda_fixa' && !assetForm.value.category) {
    assetForm.value.category = 'Renda fixa'
  }
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
  const payload = {
    id: editingAssetId.value || undefined,
    ...assetForm.value,
  }
  const saved = await data.saveInvestmentAsset(payload)
  if (!saved) return
  resetAssetForm()
}

function resetAssetForm() {
  editingAssetId.value = ''
  assetForm.value = defaultAssetForm()
}

function handleEditAsset(asset) {
  editingAssetId.value = asset.id
  assetForm.value = {
    name: asset.name,
    assetType: asset.assetType,
    category: asset.category,
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
      app.showMessage(`Cotacoes atualizadas: ${summary.updated}/${summary.total}.`, summary.failed > 0 ? 'info' : 'success')
    } else {
      app.showMessage('Nenhum ativo de mercado para atualizar.', 'info')
    }
  } finally {
    refreshingAllQuotes.value = false
  }
}

async function handleSyncAssetsFromCsv() {
  syncingAssetsFromCsv.value = true
  try {
    const summary = await data.syncInvestmentAssetsFromTransactions({ silent: true })
    const detected = Number(summary?.detected || 0)
    const created = Number(summary?.created || 0)
    const quoted = Number(summary?.quoted || 0)
    const estimated = Number(summary?.estimated || 0)
    const failed = Number(summary?.failed || 0)
    let msg = detected > 0
      ? `Detectados ${detected} padrao(oes) de ativos nos lancamentos.`
      : 'Nenhum padrao de ativo foi detectado nos lancamentos.'
    if (created > 0) msg += ` ${created} ativo(s) criado(s).`
    if (quoted > 0) msg += ` ${quoted} cotacao(oes) atualizada(s).`
    if (estimated > 0) msg += ` ${estimated} ativo(s) com quantidade estimada.`
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
    app.showMessage(`Cotacao automatica: ${summary.updated}/${summary.total} atualizada(s).`, 'info')
  }
}

onMounted(() => {
  autoRefreshQuotesOnOpen()
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
}
</style>
