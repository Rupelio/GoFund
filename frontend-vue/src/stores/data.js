import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import { useAuthStore } from './auth.js'
import { useAppStore } from './app.js'
import { transactionsApi } from '../api/transactions.js'
import { budgetsApi, goalsApi, accountsApi, categoriesApi, projectionApi, summaryApi, investmentsApi } from '../api/resources.js'
import { fetchBootstrap } from '../api/bootstrap.js'
import {
  normalizeTransaction, normalizeBudget, normalizeGoal, normalizeProjection,
  isValidTransaction, isValidBudget, isValidGoal,
  getMonthlyTransactions, getInvestmentStats, getInvestmentYields, setInvestmentYield as setYield,
  getClosingCash, getMonthlySummaryMap, getAverageMonthlyFlow, getInvestmentCategories,
  getMonthSequence, getMonthShift, round2, formatMonthLabel, formatCurrency,
  normalizeString, normalizeCategory, normalizeHeader, findHeaderIdx,
  parseFlexibleNumber, detectCsvDelimiter, parseCsvLine, csvEscape,
  readFileAsText, normalizeCsvDate, extractInstallmentInfo, adjustToInstallmentStartDate,
  isSubscriptionDescription, shouldInferMonthlyBankRecurrence,
  inferCategoryFromDescription, inferTransferDirection, inferTransferCounterparty, normalizeTransferDirection, CARD_BILL_REGEX, SUBSCRIPTION_REGEX,
  classifyInvestmentReceiptKind,
  txnFingerprint, txnMonthlyFingerprint, txnInstallmentFingerprint, normalizeDescriptionForFingerprint, toPayload, isValidDate,
  getProjectionBasis, getAccountBalance, isCashAffectingTransaction, isTransferLikeTransaction, getTransferEndpointIds, extractInvestmentAssetHint,
} from '../helpers.js'

function normalizeInvestmentAsset(item = {}) {
  return {
    id: normalizeString(String(item.id || '')),
    name: normalizeString(String(item.name || '')),
    assetType: normalizeString(String(item.assetType || 'outro')).toLowerCase() || 'outro',
    category: normalizeString(String(item.category || 'Investimentos')) || 'Investimentos',
    ticker: normalizeString(String(item.ticker || '')).toUpperCase(),
    pricingSource: normalizeString(String(item.pricingSource || 'manual')).toLowerCase() || 'manual',
    quantity: Number(item.quantity || 0),
    averagePrice: Number(item.averagePrice || 0),
    currentPrice: item.currentPrice === null || item.currentPrice === undefined ? null : Number(item.currentPrice || 0),
    annualYieldRate: item.annualYieldRate === null || item.annualYieldRate === undefined ? null : Number(item.annualYieldRate || 0),
    expectedProfile: normalizeString(String(item.expectedProfile || 'base')).toLowerCase() || 'base',
    currency: normalizeString(String(item.currency || 'BRL')).toUpperCase() || 'BRL',
    notes: normalizeString(String(item.notes || '')),
    lastQuoteAt: normalizeString(String(item.lastQuoteAt || '')),
    lastQuoteChange: item.lastQuoteChange === null || item.lastQuoteChange === undefined ? null : Number(item.lastQuoteChange || 0),
    createdAt: normalizeString(String(item.createdAt || '')),
    updatedAt: normalizeString(String(item.updatedAt || '')),
  }
}

export const useDataStore = defineStore('data', () => {
  const auth = useAuthStore()
  const app = useAppStore()

  // ── State ──────────────────────────────────────────────
  const transactions = ref([])
  const budgets = ref([])
  const goals = ref([])
  const accounts = ref([])
  const categories = ref([])
  const investmentAssets = ref([])
  const projection = ref(normalizeProjection({}))
  const importSnapshotTransactions = ref([])
  const csvSourceMapVersion = ref(0)
  const loading = ref(false)

  // ── Editing state ──────────────────────────────────────
  const editingTransactionId = ref(null)
  const editingBudgetId = ref(null)
  const editingGoalId = ref(null)
  const editingAccountId = ref(null)
  const editingCategoryId = ref(null)

  // ── Table state ────────────────────────────────────────
  const tablePage = ref(1)
  const tablePageSize = ref(10)
  const searchQuery = ref('')
  const filterType = ref('todos')
  const filterCategory = ref('todas')
  const filterMethod = ref('todos')
  const filterRecurrence = ref('todos')

  // ── Bootstrap ──────────────────────────────────────────
  async function bootstrap() {
    if (!auth.token) return false
    loading.value = true
    try {
      const data = await fetchBootstrap(auth.token)
      if (data.user) {
        auth.user = data.user
        localStorage.setItem('gf_user', JSON.stringify(data.user))
      }
      transactions.value = (data.transactions || []).map(normalizeTransaction).filter(isValidTransaction)
      budgets.value = (data.budgets || []).map(normalizeBudget)
      goals.value = (data.goals || []).map(normalizeGoal)
      accounts.value = data.accounts || []
      categories.value = data.categories || []
      investmentAssets.value = (data.investmentAssets || []).map(normalizeInvestmentAsset).filter(item => item.id && item.name)
      projection.value = normalizeProjection(data.projection || {})
      return true
    } catch (e) {
      console.error('Bootstrap failed:', e)
      return false
    } finally {
      loading.value = false
    }
  }

  // ── Monthly transactions (with recurrence expansion) ───
  function monthlyTransactions(month) {
    return getMonthlyTransactions(transactions.value, month || app.currentMonth)
  }

  // ── Filtered transactions ──────────────────────────────
  const filteredTransactions = computed(() => {
    const search = normalizeString(searchQuery.value).toLowerCase()
    const monthly = monthlyTransactions(app.currentMonth)
    return monthly
      .filter(t => {
        if (filterType.value !== 'todos' && t.type !== filterType.value) return false
        if (filterCategory.value !== 'todas' && t.category.toLowerCase() !== filterCategory.value.toLowerCase()) return false
        if (filterMethod.value !== 'todos' && t.method !== filterMethod.value) return false
        if (filterRecurrence.value === 'installments' && !(t.installments > 1)) return false
        else if (filterRecurrence.value !== 'todos' && filterRecurrence.value !== 'installments' && (t.recurrence || 'none') !== filterRecurrence.value) return false
        if (!search) return true
        return `${t.description} ${t.category} ${t.method}`.toLowerCase().includes(search)
      })
      .sort((a, b) => b.date.localeCompare(a.date) || b.createdAt.localeCompare(a.createdAt))
  })

  // ── Dashboard computed ─────────────────────────────────
  const investCategories = computed(() => getInvestmentCategories(transactions.value))

  function kpiCashOptions() {
    return { excludeInternalTransfers: app.neutralizeInternalTransfersInKpis === true }
  }

  function isKpiCashTransaction(t) {
    return isCashAffectingTransaction(t, kpiCashOptions())
  }

  const dashboardData = computed(() => {
    const monthly = monthlyTransactions(app.currentMonth)
    const cashBasis = monthly.filter(isKpiCashTransaction)
    const income = cashBasis.filter(t => t.type === 'receita').reduce((s, t) => s + t.amount, 0)
    const expense = cashBasis.filter(t => t.type === 'despesa').reduce((s, t) => s + t.amount, 0)
    const investment = cashBasis.filter(t => t.type === 'investimento').reduce((s, t) => s + t.amount, 0)
    const totalOut = round2(expense + investment)
    const creditCard = monthly.filter(t => t.method === 'credito' && t.type === 'despesa').reduce((s, t) => s + t.amount, 0)
    const balance = getClosingCash(transactions.value, app.currentMonth, kpiCashOptions())
    return { income, expense, investment, totalOut, creditCard, balance, monthly }
  })

  const investmentStats = computed(() => getInvestmentStats(transactions.value))

  const netWorth = computed(() => {
    const real = transactions.value.filter(isKpiCashTransaction)
    const totalIncome = real.filter(t => t.type === 'receita').reduce((s, t) => s + t.amount, 0)
    const totalExpense = real.filter(t => t.type === 'despesa').reduce((s, t) => s + t.amount, 0)
    const totalInvestment = real.filter(t => t.type === 'investimento').reduce((s, t) => s + t.amount, 0)
    const cash = totalIncome - totalExpense - totalInvestment
    const stats = investmentStats.value
    return round2(cash + stats.totalInvested)
  })

  // ── Transaction CRUD ───────────────────────────────────
  async function saveTransaction(payload) {
    const id = editingTransactionId.value
    try {
      let persisted = null
      if (id) {
        const updated = normalizeTransaction(
          await transactionsApi.update(auth.token, id, payload)
        )
        const idx = transactions.value.findIndex(t => t.id === id)
        if (idx >= 0) transactions.value[idx] = updated
        persisted = updated
        app.showMessage('Movimentação atualizada.', 'success')
      } else {
        const created = normalizeTransaction(
          await transactionsApi.create(auth.token, payload)
        )
        transactions.value.push(created)
        persisted = created
        app.showMessage('Movimentação criada.', 'success')
      }
      if (persisted && isTransferLikeTransaction(persisted)) {
        await autoPairInternalTransfers({ silent: true })
      }
      editingTransactionId.value = null
      return true
    } catch (e) {
      app.showMessage(`Falha ao salvar. (${e.message || ''})`, 'error')
      return false
    }
  }

  async function deleteTransaction(id) {
    try {
      await transactionsApi.remove(auth.token, id)
      transactions.value = transactions.value.filter(t => t.id !== id)
      app.showMessage('Movimentação removida.', 'success')
      return true
    } catch (e) {
      app.showMessage(`Falha ao excluir. (${e.message || ''})`, 'error')
      return false
    }
  }

  async function deleteAllTransactions() {
    try {
      await transactionsApi.removeAll(auth.token)
      const count = transactions.value.length
      transactions.value = []
      app.showMessage(`${count} movimentações excluídas.`, 'success')
      return true
    } catch (e) {
      app.showMessage(`Falha ao excluir movimentações. (${e.message || ''})`, 'error')
      return false
    }
  }

  // ── Budget CRUD ────────────────────────────────────────
  async function saveBudget(payload) {
    const id = editingBudgetId.value
    try {
      if (id) {
        const updated = normalizeBudget(await budgetsApi.update(auth.token, id, payload))
        const idx = budgets.value.findIndex(b => b.id === id)
        if (idx >= 0) budgets.value[idx] = updated
      } else {
        budgets.value.push(normalizeBudget(await budgetsApi.create(auth.token, payload)))
      }
      editingBudgetId.value = null
      app.showMessage('Orçamento salvo.', 'success')
      return true
    } catch (e) {
      app.showMessage(`Falha ao salvar orçamento. (${e.message || ''})`, 'error')
      return false
    }
  }

  async function deleteBudget(id) {
    try {
      await budgetsApi.remove(auth.token, id)
      budgets.value = budgets.value.filter(b => b.id !== id)
      if (editingBudgetId.value === id) editingBudgetId.value = null
      app.showMessage('Orçamento removido.', 'success')
      return true
    } catch (e) {
      app.showMessage(`Falha ao excluir. (${e.message || ''})`, 'error')
      return false
    }
  }

  // ── Goal CRUD ──────────────────────────────────────────
  async function saveGoal(payload) {
    const id = editingGoalId.value
    try {
      if (id) {
        const updated = normalizeGoal(await goalsApi.update(auth.token, id, payload))
        const idx = goals.value.findIndex(g => g.id === id)
        if (idx >= 0) goals.value[idx] = updated
        app.showMessage('Meta atualizada.', 'success')
      } else {
        goals.value.push(normalizeGoal(await goalsApi.create(auth.token, payload)))
        app.showMessage('Meta criada.', 'success')
      }
      editingGoalId.value = null
      return true
    } catch (e) {
      app.showMessage(`Falha ao salvar meta. (${e.message || ''})`, 'error')
      return false
    }
  }

  async function deleteGoal(id) {
    try {
      await goalsApi.remove(auth.token, id)
      goals.value = goals.value.filter(g => g.id !== id)
      if (editingGoalId.value === id) editingGoalId.value = null
      app.showMessage('Meta removida.', 'success')
      return true
    } catch (e) {
      app.showMessage(`Falha ao excluir meta. (${e.message || ''})`, 'error')
      return false
    }
  }

  async function addGoalContribution(id, amount) {
    try {
      const updated = normalizeGoal(await goalsApi.addContribution(auth.token, id, amount))
      const idx = goals.value.findIndex(g => g.id === id)
      if (idx >= 0) goals.value[idx] = updated
      app.showMessage('Aporte registrado.', 'success')
      return true
    } catch (e) {
      app.showMessage(`Falha ao registrar aporte. (${e.message || ''})`, 'error')
      return false
    }
  }

  // ── Account CRUD ───────────────────────────────────────
  async function saveAccount(payload) {
    const id = editingAccountId.value
    try {
      if (id) {
        const updated = await accountsApi.update(auth.token, id, payload)
        const idx = accounts.value.findIndex(a => a.id === id)
        if (idx >= 0) accounts.value[idx] = updated
        app.showMessage('Conta atualizada.', 'success')
      } else {
        const created = await accountsApi.create(auth.token, payload)
        accounts.value.push(created)
        app.showMessage('Conta criada.', 'success')
      }
      editingAccountId.value = null
      // Refresh transactions to pick up any auto-created initial balance transaction
      await refreshSnapshot()
      return true
    } catch (e) {
      app.showMessage(`Falha ao salvar conta. (${e.message || ''})`, 'error')
      return false
    }
  }

  async function deleteAccount(id) {
    try {
      await accountsApi.remove(auth.token, id)
      accounts.value = accounts.value.filter(a => a.id !== id)
      if (editingAccountId.value === id) editingAccountId.value = null
      app.showMessage('Conta removida.', 'success')
      return true
    } catch (e) {
      app.showMessage(`Falha ao excluir conta. (${e.message || ''})`, 'error')
      return false
    }
  }

  // Direct account creation for CSV import (returns created account object)
  async function saveAccountDirect(payload) {
    const created = await accountsApi.create(auth.token, payload)
    accounts.value.push(created)
    app.showMessage('Conta criada.', 'success')
    await refreshSnapshot()
    return created
  }

  // ── Category CRUD ──────────────────────────────────────
  async function saveCategory(payload) {
    const id = editingCategoryId.value
    try {
      if (id) {
        const updated = await categoriesApi.update(auth.token, id, payload)
        const idx = categories.value.findIndex(c => c.id === id)
        if (idx >= 0) categories.value[idx] = updated
        app.showMessage('Categoria atualizada.', 'success')
      } else {
        const created = await categoriesApi.create(auth.token, payload)
        categories.value.push(created)
        app.showMessage('Categoria criada.', 'success')
      }
      editingCategoryId.value = null
      return true
    } catch (e) {
      app.showMessage(`Falha ao salvar categoria. (${e.message || ''})`, 'error')
      return false
    }
  }

  async function deleteCategory(id) {
    try {
      await categoriesApi.remove(auth.token, id)
      categories.value = categories.value.filter(c => c.id !== id)
      if (editingCategoryId.value === id) editingCategoryId.value = null
      app.showMessage('Categoria removida.', 'success')
      return true
    } catch (e) {
      app.showMessage(`Falha ao excluir categoria. (${e.message || ''})`, 'error')
      return false
    }
  }

  // ── Projection ─────────────────────────────────────────
  async function saveInvestmentAsset(payload, options = {}) {
    const silent = options?.silent === true
    const id = normalizeString(String(payload?.id || ''))
    const requestPayload = {
      name: normalizeString(String(payload?.name || '')),
      assetType: normalizeString(String(payload?.assetType || 'outro')).toLowerCase() || 'outro',
      category: normalizeString(String(payload?.category || 'Investimentos')) || 'Investimentos',
      ticker: normalizeString(String(payload?.ticker || '')).toUpperCase(),
      pricingSource: normalizeString(String(payload?.pricingSource || 'manual')).toLowerCase() || 'manual',
      quantity: Number(payload?.quantity || 0),
      averagePrice: Number(payload?.averagePrice || 0),
      currentPrice: payload?.currentPrice === null || payload?.currentPrice === undefined || payload?.currentPrice === '' ? null : Number(payload.currentPrice),
      annualYieldRate: payload?.annualYieldRate === null || payload?.annualYieldRate === undefined || payload?.annualYieldRate === '' ? null : Number(payload.annualYieldRate),
      expectedProfile: normalizeString(String(payload?.expectedProfile || 'base')).toLowerCase() || 'base',
      currency: normalizeString(String(payload?.currency || 'BRL')).toUpperCase() || 'BRL',
      notes: normalizeString(String(payload?.notes || '')),
    }
    try {
      const dto = id
        ? normalizeInvestmentAsset(await investmentsApi.update(auth.token, id, requestPayload))
        : normalizeInvestmentAsset(await investmentsApi.create(auth.token, requestPayload))
      const idx = investmentAssets.value.findIndex(item => item.id === dto.id)
      if (idx >= 0) investmentAssets.value[idx] = dto
      else investmentAssets.value.push(dto)
      investmentAssets.value.sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'))
      if (!silent) app.showMessage(id ? 'Ativo atualizado.' : 'Ativo criado.', 'success')
      return dto
    } catch (e) {
      if (!silent) app.showMessage(`Falha ao salvar ativo. (${e.message || ''})`, 'error')
      return null
    }
  }

  async function deleteInvestmentAsset(id) {
    const normalizedID = normalizeString(String(id || ''))
    if (!normalizedID) return false
    try {
      await investmentsApi.remove(auth.token, normalizedID)
      investmentAssets.value = investmentAssets.value.filter(item => item.id !== normalizedID)
      app.showMessage('Ativo removido.', 'success')
      return true
    } catch (e) {
      app.showMessage(`Falha ao excluir ativo. (${e.message || ''})`, 'error')
      return false
    }
  }

  async function refreshInvestmentAssetQuote(id, options = {}) {
    const normalizedID = normalizeString(String(id || ''))
    if (!normalizedID) return null
    const silent = options?.silent === true
    try {
      const dto = normalizeInvestmentAsset(await investmentsApi.refreshQuote(auth.token, normalizedID))
      const idx = investmentAssets.value.findIndex(item => item.id === dto.id)
      if (idx >= 0) investmentAssets.value[idx] = dto
      else investmentAssets.value.push(dto)
      if (!silent) app.showMessage(`Cotacao atualizada para ${dto.name}.`, 'success')
      return dto
    } catch (e) {
      if (!silent) app.showMessage(`Falha ao atualizar cotacao. (${e.message || ''})`, 'error')
      return null
    }
  }

  async function refreshAllInvestmentQuotes() {
    const marketAssets = investmentAssets.value.filter(item => item.pricingSource === 'market' && item.ticker)
    if (!marketAssets.length) return { total: 0, updated: 0, failed: 0 }
    let updated = 0
    let failed = 0
    for (const item of marketAssets) {
      const result = await refreshInvestmentAssetQuote(item.id, { silent: true })
      if (result) updated += 1
      else failed += 1
    }
    return { total: marketAssets.length, updated, failed }
  }

  function normalizeMarketSearchSuggestion(item = {}) {
    const symbol = normalizeString(String(item.symbol || '')).toUpperCase()
    const name = normalizeString(String(item.name || '')) || symbol
    const exchange = normalizeString(String(item.exchange || ''))
    const currency = normalizeString(String(item.currency || '')).toUpperCase() || 'BRL'
    const quoteType = normalizeString(String(item.quoteType || '')).toLowerCase()
    const suggestedAssetType = normalizeString(String(item.suggestedAssetType || 'outro')).toLowerCase() || 'outro'
    const suggestedCategory = normalizeString(String(item.suggestedCategory || 'Investimentos')) || 'Investimentos'
    const suggestedPricingSource = normalizeString(String(item.suggestedPricingSource || 'market')).toLowerCase() || 'market'
    const marketPriceRaw = Number(item.marketPrice)
    const marketPrice = Number.isFinite(marketPriceRaw) && marketPriceRaw > 0 ? marketPriceRaw : null
    const key = `${symbol}::${exchange}::${quoteType}`
    return {
      key,
      symbol,
      name,
      exchange,
      currency,
      marketPrice,
      quoteType,
      suggestedAssetType,
      suggestedCategory,
      suggestedPricingSource,
      label: exchange ? `${symbol} - ${name} (${exchange})` : `${symbol} - ${name}`,
    }
  }

  async function searchMarketInvestmentAssets(query, options = {}) {
    const silent = options?.silent === true
    const q = normalizeString(String(query || ''))
    if (q.length < 2) return []

    try {
      const raw = await investmentsApi.searchMarket(auth.token, q, Number(options?.limit || 10))
      if (!Array.isArray(raw)) return []
      return raw.map(item => normalizeMarketSearchSuggestion(item)).filter(item => item.symbol)
    } catch (e) {
      if (!silent) app.showMessage(`Falha ao buscar ativos de mercado. (${e.message || ''})`, 'error')
      return []
    }
  }

  function round6(value) {
    return Math.round((Number(value || 0) + Number.EPSILON) * 1_000_000) / 1_000_000
  }

  function parseFixedIncomeAnnualRate(value) {
    if (value === null || value === undefined || value === '') return null
    const parsed = Number(value)
    if (!Number.isFinite(parsed)) return null
    if (parsed < 0 || parsed > 500) return null
    return round2(parsed)
  }

  function resolveFixedIncomeAnnualRateForHint(hint, rates = {}) {
    if (!hint || hint.assetType !== 'renda_fixa' || hint.pricingSource === 'market') return null
    const name = normalizeString(String(hint.name || '')).toLowerCase()
    const turboRate = parseFixedIncomeAnnualRate(rates?.nubankBoxTurboAnnualRate)
    const normalRate = parseFixedIncomeAnnualRate(rates?.nubankBoxAnnualRate)
    const defaultRate = parseFixedIncomeAnnualRate(rates?.fixedIncomeAnnualRate)

    if (name.includes('caixinha') && name.includes('turbo') && turboRate !== null) return turboRate
    if (name.includes('caixinha') && name.includes('nubank') && normalRate !== null) return normalRate
    return defaultRate
  }

  function classifyAssetCandidateTransactions(items) {
    const groups = new Map()
    for (const txn of items) {
      const type = normalizeString(txn?.type || '').toLowerCase()
      if (type !== 'investimento' && type !== 'receita') continue
      const hint = extractInvestmentAssetHint(txn?.description || '', {
        category: txn?.category || '',
        type,
        method: txn?.method || '',
        amount: Number(txn?.amount || 0),
      })
      if (!hint) continue
      const key = hint.ticker
        ? `ticker:${hint.ticker}`
        : `name:${normalizeString(hint.name).toLowerCase()}`
      const entry = groups.get(key) || {
        hint,
        events: [],
        yields: 0,
        count: 0,
      }
      const amount = Number(txn?.amount || 0)
      if (!Number.isFinite(amount) || amount <= 0) continue
      entry.events.push({
        date: normalizeString(txn?.date || ''),
        type,
        amount,
        description: normalizeString(txn?.description || ''),
        category: normalizeString(txn?.category || ''),
        method: normalizeString(txn?.method || ''),
      })
      entry.count += 1
      groups.set(key, entry)
    }
    return [...groups.values()].map(group => {
      const events = [...(group.events || [])].sort((a, b) => {
        if (a.date !== b.date) return a.date.localeCompare(b.date)
        if (a.type === b.type) return 0
        return a.type === 'investimento' ? -1 : 1
      })

      let invested = 0
      let redeemed = 0
      let yields = 0
      let principal = 0

      for (const event of events) {
        const amount = Number(event.amount || 0)
        if (!Number.isFinite(amount) || amount <= 0) continue

        if (event.type === 'investimento') {
          invested += amount
          principal += amount
          continue
        }

        const receiptKind = classifyInvestmentReceiptKind(event.description, {
          category: event.category,
          method: event.method,
        })
        if (receiptKind === 'redemption') {
          const principalReduction = Math.min(principal, amount)
          principal = round2(principal - principalReduction)
          redeemed += principalReduction
          const residual = round2(amount - principalReduction)
          if (residual > 0) yields += residual
          continue
        }
        yields += amount
      }

      return {
        hint: group.hint,
        invested: round2(invested),
        redeemed: round2(redeemed),
        yields: round2(yields),
        principal: round2(principal),
        count: group.count,
      }
    })
  }

  async function syncInvestmentAssetsFromTransactions(options = {}) {
    const silent = options?.silent === true
    const annualRateConfig = {
      fixedIncomeAnnualRate: options?.fixedIncomeAnnualRate,
      nubankBoxAnnualRate: options?.nubankBoxAnnualRate,
      nubankBoxTurboAnnualRate: options?.nubankBoxTurboAnnualRate,
    }
    const sourceItems = Array.isArray(options?.transactions)
      ? options.transactions
      : transactions.value
    const candidates = classifyAssetCandidateTransactions(sourceItems)
    if (!candidates.length) {
      return { detected: 0, created: 0, quoted: 0, estimated: 0, fixedIncomeRated: 0, failed: 0 }
    }

    const byTicker = new Map()
    const byName = new Map()
    investmentAssets.value.forEach(asset => {
      const ticker = normalizeString(asset?.ticker || '').toUpperCase()
      const name = normalizeString(asset?.name || '').toLowerCase()
      if (ticker) byTicker.set(ticker, asset)
      if (name) byName.set(name, asset)
    })

    let created = 0
    let quoted = 0
    let estimated = 0
    let fixedIncomeRated = 0
    let failed = 0

    for (const candidate of candidates) {
      const hint = candidate.hint
      const tickerKey = normalizeString(hint?.ticker || '').toUpperCase()
      const nameKey = normalizeString(hint?.name || '').toLowerCase()
      const existing = (tickerKey && byTicker.get(tickerKey)) || byName.get(nameKey)
      if (existing) continue

      const netInvested = Math.max(0, round2(candidate.principal ?? (candidate.invested - candidate.redeemed)))
      const resolvedAnnualRate = resolveFixedIncomeAnnualRateForHint(hint, annualRateConfig)
      const payload = {
        name: hint.name,
        assetType: hint.assetType,
        category: hint.category || 'Investimentos',
        ticker: hint.ticker || '',
        pricingSource: hint.pricingSource || 'manual',
        quantity: netInvested > 0 && hint.pricingSource !== 'market' ? 1 : 0,
        averagePrice: netInvested > 0 && hint.pricingSource !== 'market' ? netInvested : 0,
        currentPrice: netInvested > 0 && hint.pricingSource !== 'market' ? netInvested : null,
        annualYieldRate: resolvedAnnualRate,
        expectedProfile: hint.assetType === 'renda_fixa' ? 'conservador' : 'base',
        currency: 'BRL',
        notes: 'Criado automaticamente pelo CSV. Revise quantidade e preco medio.',
      }

      const createdAsset = await saveInvestmentAsset(payload, { silent: true })
      if (!createdAsset) {
        failed += 1
        continue
      }

      created += 1
      if (payload.annualYieldRate !== null) fixedIncomeRated += 1
      if (tickerKey) byTicker.set(tickerKey, createdAsset)
      if (nameKey) byName.set(nameKey, createdAsset)

      if (createdAsset.pricingSource === 'market' && createdAsset.ticker) {
        const quotedAsset = await refreshInvestmentAssetQuote(createdAsset.id, { silent: true })
        if (quotedAsset) {
          quoted += 1
          const currentPrice = Number(quotedAsset.currentPrice || 0)
          if (netInvested > 0 && currentPrice > 0 && Number(quotedAsset.quantity || 0) <= 0) {
            const estimatedQty = round6(netInvested / currentPrice)
            if (estimatedQty > 0) {
              const updatedAsset = await saveInvestmentAsset({
                id: quotedAsset.id,
                name: quotedAsset.name,
                assetType: quotedAsset.assetType,
                category: quotedAsset.category,
                ticker: quotedAsset.ticker,
                pricingSource: quotedAsset.pricingSource,
                quantity: estimatedQty,
                averagePrice: currentPrice,
                currentPrice: quotedAsset.currentPrice,
                annualYieldRate: quotedAsset.annualYieldRate,
                expectedProfile: quotedAsset.expectedProfile,
                currency: quotedAsset.currency,
                notes: quotedAsset.notes || 'Quantidade estimada automaticamente pelo valor importado.',
              }, { silent: true })
              if (updatedAsset) estimated += 1
            }
          }
        }
      }
    }

    const summary = { detected: candidates.length, created, quoted, estimated, fixedIncomeRated, failed }
    if (!silent && (created > 0 || quoted > 0 || estimated > 0 || failed > 0)) {
      let msg = `${created} ativo(s) criado(s) automaticamente a partir do CSV.`
      if (quoted > 0) msg += ` ${quoted} cotacao(oes) atualizada(s).`
      if (estimated > 0) msg += ` ${estimated} ativo(s) com quantidade estimada.`
      if (fixedIncomeRated > 0) msg += ` ${fixedIncomeRated} ativo(s) de renda fixa com taxa anual preenchida.`
      if (failed > 0) msg += ` ${failed} falha(s).`
      app.showMessage(msg, failed > 0 ? 'info' : 'success')
    }
    return summary
  }

  async function saveProjection(payload) {
    try {
      const updated = normalizeProjection(await projectionApi.update(auth.token, payload))
      projection.value = updated
      app.showMessage('Projeção atualizada.', 'success')
      return true
    } catch (e) {
      app.showMessage(`Falha ao atualizar projeção. (${e.message || ''})`, 'error')
      return false
    }
  }

  function buildProjectionModel() {
    const p = normalizeProjection(projection.value)
    const historyMonths = getMonthSequence(app.currentMonth, -5, 0)
    const futureMonths = getMonthSequence(app.currentMonth, 1, p.months)
    const monthlyMap = getMonthlySummaryMap(transactions.value, app.currentMonth, kpiCashOptions())
    const avgMonths = getMonthSequence(app.currentMonth, -2, 0)
    const avg = getAverageMonthlyFlow(monthlyMap, avgMonths)

    const expectedIncome = p.income ?? avg.income
    const expectedExpense = p.expense ?? avg.expense
    const expectedInvestment = p.investment ?? avg.investment
    const expectedNet = round2(expectedIncome - expectedExpense - expectedInvestment)

    const stats = investmentStats.value
    const rate = stats.avgMonthlyRate

    const labels = historyMonths.concat(futureMonths).map(formatMonthLabel)
    const actual = historyMonths.map(m => round2(getClosingCash(transactions.value, m, kpiCashOptions())))
    futureMonths.forEach(() => actual.push(null))

    const projected = new Array(labels.length).fill(null)
    const projectedPatrimonio = new Array(labels.length).fill(null)
    const startIdx = historyMonths.length - 1
    let rolling = round2(getClosingCash(transactions.value, app.currentMonth, kpiCashOptions()))
    projected[startIdx] = rolling

    let investedCapital = stats.totalInvested
    projectedPatrimonio[startIdx] = round2(rolling + investedCapital)
    let totalYields = 0

    for (let i = startIdx + 1; i < projected.length; i++) {
      rolling = round2(rolling + expectedNet)
      projected[i] = rolling
      const monthlyYield = round2(investedCapital * rate)
      investedCapital = round2(investedCapital + expectedInvestment + monthlyYield)
      totalYields += monthlyYield
      projectedPatrimonio[i] = round2(rolling + investedCapital)
    }

  return {
      labels, actual, projected, projectedPatrimonio,
      expectedIncome, expectedExpense, expectedInvestment, expectedNet,
      projectedEndCash: rolling,
      projectedEndPatrimonio: projectedPatrimonio[projectedPatrimonio.length - 1] || round2(rolling + investedCapital),
      currentCash: round2(getClosingCash(transactions.value, app.currentMonth, kpiCashOptions())),
      currentPatrimonio: round2(rolling + stats.totalInvested),
      investedCapital: stats.totalInvested,
      avgYieldRate: round2(rate * 10000) / 100,
      estimatedMonthlyYield: stats.estimatedMonthlyYield,
      totalProjectedYields: round2(totalYields),
      futureMonths,
      basisDescription: getProjectionBasis(p, avg),
    }
  }

  // ── Summary email ──────────────────────────────────────
  async function sendMonthlySummary() {
    try {
      const res = await summaryApi.send(auth.token, app.currentMonth)
      app.showMessage(res.message || 'Resumo enviado!', 'success')
      return true
    } catch (e) {
      app.showMessage(`Falha ao enviar resumo. (${e.message || ''})`, 'error')
      return false
    }
  }

  // ── CSV Export ──────────────────────────────────────────
  function exportCsv(mode = 'month') {
    let txns
    let suffix
    if (mode === 'all') {
      txns = transactions.value
      suffix = 'tudo'
    } else {
      txns = getMonthlyTransactions(transactions.value, app.currentMonth)
      suffix = app.currentMonth
    }
    if (!txns.length) {
      app.showMessage('Sem movimentações para exportar.', 'error')
      return
    }
    const headers = ['id', 'date', 'type', 'category', 'method', 'description', 'amount', 'recurrence', 'recurrenceEnd', 'installments', 'createdAt']
    const rows = txns.map(t => [t.id, t.date, t.type, t.category, t.method, t.description, t.amount.toFixed(2), t.recurrence || 'none', t.recurrenceEnd || '', t.installments || 0, t.createdAt])
    const csv = [headers.join(',')].concat(rows.map(r => r.map(csvEscape).join(','))).join('\n')
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const a = Object.assign(document.createElement('a'), { href: url, download: `movimentacoes-${suffix}.csv` })
    document.body.appendChild(a); a.click(); a.remove(); URL.revokeObjectURL(url)
    app.showMessage('CSV exportado.', 'success')
  }

  // ── CSV Import ─────────────────────────────────────────
  const IMPORT_CHUNK_SIZE = 500
  const IMPORT_MIN_CHUNK_SIZE = 50
  const IMPORT_RETRY_LIMIT = 2
  const IMPORT_RECOVERY_PASSES = 4
  const IMPORT_JOB_POLL_INTERVAL_MS = 1200
  const IMPORT_JOB_MAX_WAIT_MS = 8 * 60 * 1000
  const TRANSFER_PAIRING_MAX_DAY_DIFF = 3
  const TRANSFER_PAIRING_MIN_SCORE = 10

  function createTransferGroupId() {
    if (window?.crypto?.randomUUID) return `trf_${window.crypto.randomUUID()}`
    return `trf_${Date.now()}_${Math.random().toString(16).slice(2)}`
  }

  function normalizeCounterpartyKey(value) {
    return normalizeString(String(value || ''))
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-z0-9]/g, '')
  }

  function extractTaxIdentifiers(value) {
    const raw = String(value || '')
    const matches = raw.match(/\d{2}\.?\d{3}\.?\d{3}\/?\d{4}-?\d{2}|\d{3}\.?\d{3}\.?\d{3}-?\d{2}/g) || []
    return new Set(
      matches
        .map(v => v.replace(/\D/g, ''))
        .filter(v => v.length === 11 || v.length === 14)
    )
  }

  function hasSharedTaxIdentifier(setA, setB) {
    if (!setA?.size || !setB?.size) return false
    for (const value of setA) {
      if (setB.has(value)) return true
    }
    return false
  }

  function toUtcDayStamp(dateValue) {
    if (!isValidDate(dateValue)) return NaN
    const [year, month, day] = String(dateValue).split('-').map(Number)
    return Math.floor(Date.UTC(year, month - 1, day) / 86400000)
  }

  function getCandidateGroupId(tx) {
    return normalizeString(tx.transferGroupId || tx.transfer_group_id || '')
  }

  function buildTransferPairCandidates(sourceTransactions = transactions.value) {
    const accountIds = new Set(accounts.value.map(a => a.id))
    const candidates = []
    for (const tx of sourceTransactions || []) {
      if (!tx?.id) continue
      if (!isTransferLikeTransaction(tx)) continue
      if (normalizeString(tx.method).toLowerCase() === 'credito') continue

      const direction = normalizeTransferDirection(tx.transferDirection || tx.transfer_direction)
      if (direction !== 'in' && direction !== 'out') continue

      const amount = Number(tx.amount)
      if (!Number.isFinite(amount) || amount <= 0) continue
      const amountCents = Math.round(amount * 100)
      if (amountCents <= 0) continue

      const dayStamp = toUtcDayStamp(tx.date)
      if (!Number.isFinite(dayStamp)) continue

      const { from, to } = getTransferEndpointIds(tx)
      if (direction === 'out' && (!from || !accountIds.has(from))) continue
      if (direction === 'in' && (!to || !accountIds.has(to))) continue

      const groupId = getCandidateGroupId(tx)
      if (groupId && from && to && from !== to) continue

      const counterparty = normalizeCounterpartyKey(tx.transferCounterparty || tx.transfer_counterparty || '')
      const taxIdentifiers = extractTaxIdentifiers(`${tx.description || ''} ${tx.transferCounterparty || tx.transfer_counterparty || ''}`)
      candidates.push({
        tx,
        id: tx.id,
        direction,
        amountCents,
        dayStamp,
        from,
        to,
        groupId,
        counterparty,
        taxIdentifiers,
      })
    }
    return candidates
  }

  function scoreTransferPair(outCandidate, inCandidate) {
    if (!outCandidate || !inCandidate) return -1
    if (outCandidate.amountCents !== inCandidate.amountCents) return -1
    if (!outCandidate.from || !inCandidate.to) return -1
    if (outCandidate.from === inCandidate.to) return -1
    if (outCandidate.to && inCandidate.to && outCandidate.to !== inCandidate.to) return -1
    if (outCandidate.from && inCandidate.from && outCandidate.from !== inCandidate.from) return -1

    const dayDiff = Math.abs(outCandidate.dayStamp - inCandidate.dayStamp)
    if (dayDiff > TRANSFER_PAIRING_MAX_DAY_DIFF) return -1

    let score = 0
    if (dayDiff === 0) score += 20
    else if (dayDiff === 1) score += 14
    else if (dayDiff === 2) score += 8
    else score += 4

    if (outCandidate.counterparty && inCandidate.counterparty) {
      score += outCandidate.counterparty === inCandidate.counterparty ? 18 : -10
    }

    if (hasSharedTaxIdentifier(outCandidate.taxIdentifiers, inCandidate.taxIdentifiers)) score += 12
    if (outCandidate.to && inCandidate.to && outCandidate.to === inCandidate.to) score += 35
    if (outCandidate.from && inCandidate.from && outCandidate.from === inCandidate.from) score += 35
    if (outCandidate.groupId && inCandidate.groupId && outCandidate.groupId === inCandidate.groupId) score += 50

    return score
  }

  function hasTransferPairChanges(tx, desired) {
    const currentDirection = normalizeTransferDirection(tx.transferDirection || tx.transfer_direction)
    const currentGroupId = normalizeString(tx.transferGroupId || tx.transfer_group_id || '')
    const currentFrom = normalizeString(tx.transferFromAccountId || tx.transfer_from_account_id || '')
    const currentTo = normalizeString(tx.transferToAccountId || tx.transfer_to_account_id || '')
    return currentDirection !== desired.direction
      || currentGroupId !== desired.groupId
      || currentFrom !== desired.fromAccountId
      || currentTo !== desired.toAccountId
  }

  function applyTransactionUpdateLocal(dto) {
    const normalized = normalizeTransaction(dto)
    const idx = transactions.value.findIndex(t => t.id === normalized.id)
    if (idx >= 0) transactions.value[idx] = normalized
    else transactions.value.push(normalized)
  }

  async function autoPairInternalTransfers(options = {}) {
    const silent = options.silent === true
    const candidates = buildTransferPairCandidates()
    const outCandidates = candidates
      .filter(candidate => candidate.direction === 'out')
      .sort((a, b) => a.dayStamp - b.dayStamp || a.amountCents - b.amountCents)
    const inByAmount = new Map()
    candidates.filter(candidate => candidate.direction === 'in').forEach(candidate => {
      const bucket = inByAmount.get(candidate.amountCents) || []
      bucket.push(candidate)
      inByAmount.set(candidate.amountCents, bucket)
    })

    const usedIn = new Set()
    const updatePlanById = new Map()
    let paired = 0

    for (const outCandidate of outCandidates) {
      const inboundCandidates = (inByAmount.get(outCandidate.amountCents) || [])
        .filter(candidate => !usedIn.has(candidate.id) && candidate.id !== outCandidate.id)
      if (!inboundCandidates.length) continue

      const scored = inboundCandidates
        .map(candidate => ({
          candidate,
          score: scoreTransferPair(outCandidate, candidate),
          dayDiff: Math.abs(outCandidate.dayStamp - candidate.dayStamp),
        }))
        .filter(row => row.score >= TRANSFER_PAIRING_MIN_SCORE)
        .sort((a, b) => b.score - a.score || a.dayDiff - b.dayDiff)

      if (!scored.length) continue
      if (scored.length > 1 && scored[0].score === scored[1].score && scored[0].score < 25) continue

      const match = scored[0].candidate
      usedIn.add(match.id)

      const fromAccountId = outCandidate.from || match.from
      const toAccountId = match.to || outCandidate.to
      if (!fromAccountId || !toAccountId || fromAccountId === toAccountId) continue

      const groupId = outCandidate.groupId || match.groupId || createTransferGroupId()
      const desiredOut = { direction: 'out', groupId, fromAccountId, toAccountId }
      const desiredIn = { direction: 'in', groupId, fromAccountId, toAccountId }

      if (hasTransferPairChanges(outCandidate.tx, desiredOut)) {
        updatePlanById.set(outCandidate.id, { tx: outCandidate.tx, desired: desiredOut })
      }
      if (hasTransferPairChanges(match.tx, desiredIn)) {
        updatePlanById.set(match.id, { tx: match.tx, desired: desiredIn })
      }
      paired++
    }

    const updatePlan = Array.from(updatePlanById.values())
    if (!updatePlan.length) return { paired, updated: 0, failed: 0 }

    let updated = 0
    let failed = 0
    for (const step of updatePlan) {
      try {
        const payload = toPayload({
          ...step.tx,
          transferDirection: step.desired.direction,
          transferGroupId: step.desired.groupId,
          transferFromAccountId: step.desired.fromAccountId,
          transferToAccountId: step.desired.toAccountId,
        }, false)
        const dto = await transactionsApi.update(auth.token, step.tx.id, payload)
        applyTransactionUpdateLocal(dto)
        updated++
      } catch (_) {
        failed++
      }
    }

    if (!silent) {
      if (paired > 0 && updated > 0) {
        app.showMessage(`${paired} transferência(s) interna(s) pareada(s).`, 'success')
      } else if (failed > 0) {
        app.showMessage('Algumas transferências não puderam ser pareadas automaticamente.', 'error')
      }
    }

    return { paired, updated, failed }
  }

  function isTransientImportError(err) {
    const status = Number(err?.status || 0)
    if (status === 502 || status === 503 || status === 504) return true
    // Network-level fetch errors usually have no status.
    if (!status) return true
    return false
  }

  function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms))
  }

  function buildImportFailureError(err, partialResult, remaining) {
    const wrapped = err instanceof Error ? err : new Error(String(err || 'Falha na importacao'))
    wrapped.partialResult = {
      imported: Number(partialResult?.imported || 0),
      duplicates: Number(partialResult?.duplicates || 0),
      invalid: Number(partialResult?.invalid || 0),
    }
    wrapped.remaining = Number(remaining || 0)
    return wrapped
  }

  function buildImportJobFailure(job) {
    const wrapped = new Error(job?.error || 'Falha na importacao assíncrona')
    wrapped.partialResult = {
      imported: Number(job?.result?.imported || 0),
      duplicates: Number(job?.result?.duplicates || 0),
      invalid: Number(job?.result?.invalid || 0),
      failed: Number(job?.result?.failed || 0),
    }
    wrapped.job = job
    return wrapped
  }

  async function importChunkWithRetry(itemsPayload) {
    let attempt = 0
    while (true) {
      try {
        return await transactionsApi.import(auth.token, itemsPayload)
      } catch (err) {
        attempt++
        if (attempt > IMPORT_RETRY_LIMIT || !isTransientImportError(err)) throw err
        await sleep(350 * attempt)
      }
    }
  }

  async function importTransactionsInChunks(items, chunkSize = IMPORT_CHUNK_SIZE) {
    const aggregate = { imported: 0, duplicates: 0, invalid: 0 }
    for (let start = 0; start < items.length; start += chunkSize) {
      const chunk = items.slice(start, start + chunkSize)
      const payload = chunk.map(item => toPayload(item, false))
      try {
        const result = await importChunkWithRetry(payload)
        aggregate.imported += Number(result?.imported || 0)
        aggregate.duplicates += Number(result?.duplicates || 0)
        aggregate.invalid += Number(result?.invalid || 0)
      } catch (err) {
        const remaining = items.length - start
        throw buildImportFailureError(err, aggregate, remaining)
      }
    }
    return aggregate
  }

  // ── CSV Import ─────────────────────────────────────────
  const ACCOUNT_CSV_SOURCE_MAP_KEY = 'gofund_account_csv_source_map_v1'

  function detectCsvSource(headers) {
    const has = (...aliases) => aliases.some(a => headers.includes(a))
    if (has('title') && has('amount') && has('date')) {
      return { key: 'nubank_credit', label: 'Nubank Cartao', confidence: 'high' }
    }
    if (has('identificador') && has('data') && has('valor') && has('descricao', 'description')) {
      return { key: 'nubank_account', label: 'Nubank Conta', confidence: 'high' }
    }
    if (has('debit', 'debito') && has('credit', 'credito') && has('date', 'data')) {
      return { key: 'bank_split_amount', label: 'Extrato bancario (debito/credito)', confidence: 'medium' }
    }
    if (has('amount', 'valor') && has('date', 'data') && has('title', 'description', 'descricao', 'historico')) {
      return { key: 'bank_single_amount', label: 'Extrato bancario', confidence: 'medium' }
    }
    return { key: 'unknown', label: 'Origem nao identificada', confidence: 'low' }
  }

  function readAccountCsvSourceMap() {
    try {
      const parsed = JSON.parse(localStorage.getItem(ACCOUNT_CSV_SOURCE_MAP_KEY) || '{}')
      return parsed && typeof parsed === 'object' ? parsed : {}
    } catch (_) {
      return {}
    }
  }

  function writeAccountCsvSourceMap(map) {
    localStorage.setItem(ACCOUNT_CSV_SOURCE_MAP_KEY, JSON.stringify(map))
    csvSourceMapVersion.value += 1
  }

  function getAccountCsvSource(accountId) {
    // Makes source lookups reactive when map is changed.
    void csvSourceMapVersion.value
    if (!accountId) return null
    const map = readAccountCsvSourceMap()
    const row = map[accountId]
    if (!row || typeof row !== 'object') return null
    const key = normalizeString(String(row.key || ''))
    if (!key) return null
    return {
      key,
      label: normalizeString(String(row.label || key)),
      confidence: normalizeString(String(row.confidence || '')),
      updatedAt: normalizeString(String(row.updatedAt || '')),
    }
  }

  function setAccountCsvSource(accountId, source) {
    if (!accountId || !source?.key) return
    const map = readAccountCsvSourceMap()
    map[accountId] = {
      key: source.key,
      label: source.label || source.key,
      confidence: source.confidence || '',
      updatedAt: new Date().toISOString(),
    }
    writeAccountCsvSourceMap(map)
  }

  function clearAccountCsvSource(accountId) {
    if (!accountId) return
    const map = readAccountCsvSourceMap()
    if (!Object.prototype.hasOwnProperty.call(map, accountId)) return
    delete map[accountId]
    writeAccountCsvSourceMap(map)
  }

  function findAccountsByCsvSource(sourceKey) {
    void csvSourceMapVersion.value
    const key = normalizeString(String(sourceKey || ''))
    if (!key) return []
    const map = readAccountCsvSourceMap()
    const ids = Object.keys(map).filter(id => normalizeString(String(map[id]?.key || '')) === key)
    const byId = new Map(accounts.value.map(acc => [acc.id, acc]))
    return ids.map(id => byId.get(id)).filter(Boolean)
  }

  function suggestAccountForBatch(batchImport) {
    const summary = batchImport?.sourceSummary || summarizeBatchSources(batchImport?.fileSummaries || [])
    if (!summary || summary.mixedKnown || !summary.singleKnownKey) return null
    const matches = findAccountsByCsvSource(summary.singleKnownKey)
    if (matches.length !== 1) return null
    const acc = matches[0]
    return {
      accountId: acc.id,
      accountName: acc.name,
      sourceKey: summary.singleKnownKey,
      sourceLabel: getSourceLabelFromSummary(summary, summary.singleKnownKey),
    }
  }

  function summarizeBatchSources(fileSummaries) {
    const byKey = new Map()
    for (const item of fileSummaries || []) {
      const src = item?.source || { key: 'unknown', label: 'Origem nao identificada', confidence: 'low' }
      const key = normalizeString(String(src.key || 'unknown')) || 'unknown'
      const current = byKey.get(key) || {
        key,
        label: normalizeString(String(src.label || key)) || key,
        confidence: normalizeString(String(src.confidence || '')),
        count: 0,
        files: [],
      }
      current.count += 1
      current.files.push(normalizeString(String(item?.fileName || 'arquivo.csv')))
      byKey.set(key, current)
    }
    const items = Array.from(byKey.values())
    const knownKeys = items.filter(i => i.key !== 'unknown').map(i => i.key)
    return {
      items,
      knownKeys,
      mixedKnown: knownKeys.length > 1,
      singleKnownKey: knownKeys.length === 1 ? knownKeys[0] : '',
    }
  }

  function getSourceLabelFromSummary(summary, key) {
    const row = summary?.items?.find(i => i.key === key)
    return row?.label || key
  }

  function validateCsvBatchForAccount(batchImport, accountID) {
    const summary = batchImport?.sourceSummary || summarizeBatchSources(batchImport?.fileSummaries || [])
    const errors = []
    const infos = []

    if (summary.mixedKnown) {
      const labels = summary.items.filter(i => i.key !== 'unknown').map(i => i.label).join(', ')
      errors.push(`O lote possui origens diferentes (${labels}). Importe em lotes separados por conta.`)
      return { ok: false, shouldBindSource: false, errors, infos }
    }

    if (!accountID) {
      return { ok: true, shouldBindSource: false, errors, infos }
    }

    const selectedAccount = accounts.value.find(a => a.id === accountID)
    const accountName = selectedAccount?.name || 'conta selecionada'
    const accountSource = getAccountCsvSource(accountID)
    const batchKey = summary.singleKnownKey
    const batchLabel = batchKey ? getSourceLabelFromSummary(summary, batchKey) : ''
    const hasUnknownInBatch = summary.items.some(i => i.key === 'unknown')

    if (accountSource?.key && batchKey && accountSource.key !== batchKey) {
      errors.push(
        `A conta "${accountName}" esta vinculada a "${accountSource.label}", mas o lote parece ser "${batchLabel}".`
      )
      return { ok: false, shouldBindSource: false, errors, infos }
    }

    if (!accountSource?.key && batchKey) {
      if (hasUnknownInBatch) {
        infos.push('Parte do lote nao teve origem identificada. Revise os arquivos antes de confirmar.')
      }
      infos.push(`Conta "${accountName}" vinculada automaticamente a "${batchLabel}" para futuras validacoes.`)
      return {
        ok: true,
        shouldBindSource: true,
        sourceToBind: { key: batchKey, label: batchLabel, confidence: summary.items.find(i => i.key === batchKey)?.confidence || '' },
        errors,
        infos,
      }
    }

    if (accountSource?.key && !batchKey) {
      infos.push(`Origem do lote nao identificada. Conferir se os arquivos realmente pertencem a "${accountName}".`)
    } else if (accountSource?.key && batchKey && hasUnknownInBatch) {
      infos.push('Parte do lote nao teve origem identificada. Revise os arquivos antes de confirmar.')
    }

    return { ok: true, shouldBindSource: false, errors, infos }
  }

  function parseTransactionsFromCsv(csvText, fileName = '') {
    const lines = csvText.split(/\r?\n/).map(l => l.trim()).filter(Boolean)
    if (lines.length < 2) throw new Error('CSV vazio.')
    const delimiter = detectCsvDelimiter(lines[0])
    const headers = parseCsvLine(lines[0], delimiter).map(normalizeHeader)
    const idx = {
      id: findHeaderIdx(headers, ['id', 'identificador']),
      date: findHeaderIdx(headers, ['date', 'data', 'datalancamento', 'datamovimento', 'datatransacao', 'transactiondate']),
      type: findHeaderIdx(headers, ['type', 'tipo']),
      category: findHeaderIdx(headers, ['category', 'categoria']),
      method: findHeaderIdx(headers, ['method', 'metodo', 'metododepagamento', 'pagamento', 'meiodepagamento']),
      description: findHeaderIdx(headers, ['description', 'descricao', 'title', 'titulo', 'historico', 'detalhes', 'estabelecimento', 'favorecido', 'memo']),
      amount: findHeaderIdx(headers, ['amount', 'valor', 'valorr', 'valorliquido', 'valoroperacao']),
      debit: findHeaderIdx(headers, ['debit', 'debito', 'saida', 'saidas', 'withdrawal', 'valorsaida']),
      credit: findHeaderIdx(headers, ['credit', 'credito', 'entrada', 'entradas', 'deposit', 'valorentrada']),
      recurrence: findHeaderIdx(headers, ['recurrence', 'recorrencia']),
      recurrenceEnd: findHeaderIdx(headers, ['recurrenceend', 'recurrence_end', 'fimrecorrencia']),
      installments: findHeaderIdx(headers, ['installments', 'parcelas']),
      transferDirection: findHeaderIdx(headers, ['transferdirection', 'transfer_direction', 'direcaotransferencia', 'direction', 'direcao']),
      transferCounterparty: findHeaderIdx(headers, ['transfercounterparty', 'transfer_counterparty', 'contrapartetransferencia', 'favorecido', 'counterparty']),
      createdAt: findHeaderIdx(headers, ['createdat', 'created_at']),
    }
    const hasAmountColumn = idx.amount >= 0
    const hasSplitAmountColumns = idx.debit >= 0 || idx.credit >= 0
    if (idx.date < 0 || idx.description < 0 || (!hasAmountColumn && !hasSplitAmountColumns)) {
      throw new Error('Cabeçalho CSV inválido. Mínimo: Data, Descrição e Valor (ou Débito/Crédito).')
    }
    const source = detectCsvSource(headers)
    const isBankCsv = idx.type < 0 || idx.category < 0 || idx.method < 0
    const isCreditCardCsv = isBankCsv && headers.includes('title')
    const items = []; let skipped = 0
    lines.slice(1).forEach(line => {
      const cols = parseCsvLine(line, delimiter)
      let rawAmount = idx.amount >= 0 ? parseFlexibleNumber(cols[idx.amount]) : NaN
      if (!Number.isFinite(rawAmount) && (idx.debit >= 0 || idx.credit >= 0)) {
        const creditAmount = idx.credit >= 0 ? parseFlexibleNumber(cols[idx.credit]) : NaN
        const debitAmount = idx.debit >= 0 ? parseFlexibleNumber(cols[idx.debit]) : NaN
        if (Number.isFinite(creditAmount) && Math.abs(creditAmount) > 0) rawAmount = Math.abs(creditAmount)
        else if (Number.isFinite(debitAmount) && Math.abs(debitAmount) > 0) rawAmount = -Math.abs(debitAmount)
      }
      const rawDesc = String(cols[idx.description] || '')
      const rawDate = String(cols[idx.date] || '')
      if (!Number.isFinite(rawAmount) || rawAmount === 0) { skipped++; return }

      let parsedDate = normalizeCsvDate(rawDate)
      const originalParsedDate = parsedDate

      let inferredType = idx.type >= 0 ? String(cols[idx.type] || '') : ''
      let inferredCategory = idx.category >= 0 ? String(cols[idx.category] || '') : ''
      let inferredMethod = idx.method >= 0 ? String(cols[idx.method] || '') : ''

      if (isCreditCardCsv) {
        const desc = rawDesc.toLowerCase()
        // Internal credit-card operations:
        // - "pagamento recebido" (payment/credit on bill)
        // - negative "parcelamento de fatura" line (internal refinance adjustment)
        // Keep positive "parcelamento de fatura" entries as real installments.
        if (rawAmount <= 0 && (desc.includes('pagamento recebido') || desc.includes('parcelamento de fatura'))) { skipped++; return }
        if (!inferredType) inferredType = rawAmount >= 0 ? 'despesa' : 'receita'
        if (!inferredMethod) inferredMethod = 'credito'
        if (!inferredCategory) inferredCategory = inferCategoryFromDescription(desc, { method: inferredMethod, type: inferredType, amount: rawAmount })
      } else if (isBankCsv) {
        const desc = rawDesc.toLowerCase()
        if (!inferredType) {
          if (rawAmount > 0) inferredType = 'receita'
          else if (desc.includes('aplicação') || desc.includes('aplicacao') || desc.includes('rdb') || desc.includes('investimento')) inferredType = 'investimento'
          else inferredType = 'despesa'
        }
        if (!inferredMethod) {
          if (CARD_BILL_REGEX.test(desc)) inferredMethod = 'transferencia'
          else if (desc.includes('pix')) inferredMethod = 'pix'
          else if (desc.includes('débito') || desc.includes('debito')) inferredMethod = 'debito'
          else if (desc.includes('crédito') || desc.includes('credito')) inferredMethod = 'credito'
          else if (desc.includes('boleto')) inferredMethod = 'transferencia'
          else if (desc.includes('transferência') || desc.includes('transferencia')) inferredMethod = 'transferencia'
          else inferredMethod = 'pix'
        }
        if (!inferredCategory) inferredCategory = inferCategoryFromDescription(desc, { method: inferredMethod, type: inferredType, amount: rawAmount })
      }

      const descLower = rawDesc.toLowerCase()
      if (inferredType === 'despesa' && CARD_BILL_REGEX.test(descLower)) {
        inferredCategory = 'Fatura'
        if (inferredMethod === 'credito') inferredMethod = 'transferencia'
      }

      let inferredInstallments = idx.installments >= 0 ? Number(cols[idx.installments]) || 0 : 0
      let inferredRecurrence = idx.recurrence >= 0 ? String(cols[idx.recurrence] || 'none') : 'none'
      let inferredRecurrenceEnd = idx.recurrenceEnd >= 0 ? String(cols[idx.recurrenceEnd] || '') : ''
      let inferredTransferDirection = idx.transferDirection >= 0 ? String(cols[idx.transferDirection] || '') : ''
      const normalizedCategory = normalizeCategory(inferredCategory).toLowerCase()
      const isTransferCategory = normalizedCategory === 'transferência' || normalizedCategory === 'transferencia'
      const isTransferType = normalizeString(inferredType).toLowerCase() === 'transferencia'
      if (!normalizeTransferDirection(inferredTransferDirection) && (isTransferCategory || isTransferType)) {
        const amountDirection = rawAmount > 0 ? 'in' : rawAmount < 0 ? 'out' : ''
        inferredTransferDirection = inferTransferDirection(rawDesc, inferredType, {
          method: inferredMethod,
          category: inferredCategory,
          amount: rawAmount,
          direction: amountDirection,
        })
      }
      let inferredTransferCounterparty = idx.transferCounterparty >= 0 ? String(cols[idx.transferCounterparty] || '') : ''
      if (!inferredTransferCounterparty && normalizeTransferDirection(inferredTransferDirection)) {
        inferredTransferCounterparty = inferTransferCounterparty(rawDesc)
      }
      if (!isTransferCategory && !isTransferType) {
        inferredTransferDirection = ''
        inferredTransferCounterparty = ''
      }
      const installmentInfo = extractInstallmentInfo(rawDesc)
      if (installmentInfo) {
        if (inferredInstallments <= 0) inferredInstallments = installmentInfo.total
        parsedDate = adjustToInstallmentStartDate(parsedDate, installmentInfo)
      }

      if (isCreditCardCsv && inferredInstallments <= 0 && inferredRecurrence === 'none') {
        // CSV imports never auto-infer monthly recurrence.
        // Each CSV line is a real historical transaction, not a template.
        // Monthly recurrence is only for manually created entries.
      }
      if (isBankCsv && inferredInstallments <= 0 && inferredRecurrence === 'none') {
        // Same as above — bank statement lines are actual transactions.
      }

      const item = normalizeTransaction({
        _csvImport: true,
        id: idx.id >= 0 ? String(cols[idx.id] || '') : '',
        date: parsedDate, type: inferredType,
        category: inferredCategory, method: inferredMethod,
        description: rawDesc,
        amount: Math.abs(rawAmount),
        recurrence: inferredRecurrence,
        recurrenceEnd: inferredRecurrenceEnd,
        installments: inferredInstallments,
        transferDirection: inferredTransferDirection,
        transferCounterparty: inferredTransferCounterparty,
        createdAt: idx.createdAt >= 0 ? String(cols[idx.createdAt] || new Date().toISOString()) : new Date().toISOString(),
      })
      if (isValidDate(originalParsedDate)) item._csvOriginalDate = originalParsedDate
      isValidTransaction(item) ? items.push(item) : skipped++
    })
    return { items, skipped, source, fileName: normalizeString(fileName) || 'arquivo.csv' }
  }

  function buildExistingFingerprints() {
    const map = new Map()
    const source = importSnapshotTransactions.value.length ? importSnapshotTransactions.value : transactions.value
    for (const t of source) {
      const fp = txnFingerprint(t.date, t.description, t.amount)
      const previous = map.get(fp)
      if (!previous || isTransactionMetadataRicher(t, previous)) map.set(fp, t)
      // For installment transactions, index by dateless fingerprint (all installments share one key)
      // For recurring monthly, also dateless — a monthly recurrence expands to every month,
      // so importing the same salary/subscription from a different month's statement is a duplicate.
      const rec = normalizeString(t.recurrence || 'none').toLowerCase() || 'none'
      const inst = Number(t.installments) || 0
      if (inst > 1) {
        const instFp = txnInstallmentFingerprint(t.description, t.amount)
        const prev = map.get(instFp)
        if (!prev || isTransactionMetadataRicher(t, prev)) map.set(instFp, t)
      } else if (rec === 'monthly') {
        const monthFp = txnMonthlyFingerprint(t.description, t.amount)
        const prev = map.get(monthFp)
        if (!prev || isTransactionMetadataRicher(t, prev)) map.set(monthFp, t)
      }
    }
    return map
  }

  function isTransactionMetadataRicher(candidate, baseline) {
    const ci = Number(candidate?.installments) || 0
    const bi = Number(baseline?.installments) || 0
    if (ci !== bi) return ci > bi
    const cr = normalizeString(candidate?.recurrence || 'none').toLowerCase() || 'none'
    const br = normalizeString(baseline?.recurrence || 'none').toLowerCase() || 'none'
    if (cr !== br) return cr === 'monthly'
    return false
  }

  function buildImportPreview(parsedItems, existingByFingerprint) {
    const toImport = []
    const inFileFingerprints = new Set()
    const upgradeByTransactionId = new Map()
    let duplicatesExisting = 0, duplicatesInFile = 0, invalid = 0

    for (const item of parsedItems) {
      if (!isValidTransaction(item)) { invalid++; continue }
      const fp = txnFingerprint(item.date, item.description, item.amount)
      const existing = findExistingByAnyFingerprint(item, existingByFingerprint)
      if (existing) {
        duplicatesExisting++
        if (shouldUpgradeDuplicateTransaction(existing, item)) {
          const prev = upgradeByTransactionId.get(existing.id)
          const incoming = selectBestUpgradeCandidate(prev?.incoming, item)
          upgradeByTransactionId.set(existing.id, { existing, incoming })
        }
        continue
      }
      if (inFileFingerprints.has(fp)) { duplicatesInFile++; continue }
      inFileFingerprints.add(fp)
      toImport.push(item)
    }

    return { toImport, toUpgrade: Array.from(upgradeByTransactionId.values()), duplicatesExisting, duplicatesInFile, invalid }
  }

  function findExistingByAnyFingerprint(item, existingByFingerprint) {
    const fingerprints = buildImportCandidateFingerprints(item)
    for (const fp of fingerprints) {
      const existing = existingByFingerprint.get(fp)
      if (existing) return existing
    }
    return null
  }

  function buildImportCandidateFingerprints(item) {
    const set = new Set()
    set.add(txnFingerprint(item.date, item.description, item.amount))
    const rawDate = normalizeString(String(item?._csvOriginalDate || ''))
    if (rawDate && isValidDate(rawDate)) set.add(txnFingerprint(rawDate, item.description, item.amount))
    // For installments, try dateless fingerprint (all installments of same purchase share key)
    // For recurring monthly, also dateless — monthly recurrence covers all months, so importing
    // the same salary/subscription from another month's statement is a duplicate.
    const rec = normalizeString(item.recurrence || 'none').toLowerCase() || 'none'
    const inst = Number(item.installments) || 0
    if (inst > 1) {
      set.add(txnInstallmentFingerprint(item.description, item.amount))
    } else if (rec === 'monthly') {
      set.add(txnMonthlyFingerprint(item.description, item.amount))
    }
    return set
  }

  function selectBestUpgradeCandidate(current, next) {
    if (!current) return next
    const ci = Number(current.installments) || 0
    const ni = Number(next.installments) || 0
    if (ni > ci) return next
    if (ni < ci) return current
    const cr = normalizeString(current.recurrence || 'none').toLowerCase() || 'none'
    const nr = normalizeString(next.recurrence || 'none').toLowerCase() || 'none'
    if (cr !== 'monthly' && nr === 'monthly') return next
    return current
  }

  function shouldUpgradeDuplicateTransaction(existing, incoming) {
    if (!existing || !incoming) return false
    const ei = Number(existing.installments) || 0
    const ii = Number(incoming.installments) || 0
    if (ii > ei) return true
    if (ei > 1 && ii === ei && isValidDate(existing.date) && isValidDate(incoming.date) && existing.date !== incoming.date) return true
    const er = normalizeString(existing.recurrence || 'none').toLowerCase() || 'none'
    const ir = normalizeString(incoming.recurrence || 'none').toLowerCase() || 'none'
    return ei <= 1 && er === 'none' && ir === 'monthly'
  }

  function buildUpgradePayload(existing, incoming) {
    const payload = {
      date: normalizeString(existing.date), type: normalizeString(existing.type).toLowerCase(),
      category: normalizeString(existing.category), method: normalizeString(existing.method).toLowerCase(),
      description: normalizeString(existing.description), amount: Number(existing.amount),
      recurrence: normalizeString(existing.recurrence || 'none').toLowerCase() || 'none',
      recurrenceEnd: normalizeString(existing.recurrenceEnd || ''),
      installments: Number(existing.installments) || 0, accountId: normalizeString(existing.accountId || ''),
      transferDirection: normalizeTransferDirection(existing.transferDirection || ''),
      transferCounterparty: normalizeString(existing.transferCounterparty || ''),
      transferGroupId: normalizeString(existing.transferGroupId || ''),
      transferFromAccountId: normalizeString(existing.transferFromAccountId || ''),
      transferToAccountId: normalizeString(existing.transferToAccountId || ''),
    }
    const ii = Number(incoming.installments) || 0
    const ir = normalizeString(incoming.recurrence || 'none').toLowerCase() || 'none'
    if (ii > payload.installments) {
      payload.installments = ii; payload.recurrence = 'none'; payload.recurrenceEnd = ''
      if (isValidDate(incoming.date)) payload.date = incoming.date
    }
    if (payload.installments > 1 && ii === payload.installments && isValidDate(incoming.date) && payload.date !== incoming.date) {
      payload.date = incoming.date
    }
    if (payload.installments <= 1 && payload.recurrence === 'none' && ir === 'monthly') {
      payload.recurrence = 'monthly'
      if (incoming.recurrenceEnd && isValidDate(incoming.recurrenceEnd)) payload.recurrenceEnd = incoming.recurrenceEnd
    }
    if (!payload.transferDirection) {
      payload.transferDirection = normalizeTransferDirection(incoming.transferDirection || '')
    }
    if (!payload.transferCounterparty) {
      payload.transferCounterparty = normalizeString(incoming.transferCounterparty || '')
    }
    if (!payload.transferFromAccountId) {
      payload.transferFromAccountId = normalizeString(incoming.transferFromAccountId || '')
    }
    if (!payload.transferToAccountId) {
      payload.transferToAccountId = normalizeString(incoming.transferToAccountId || '')
    }
    if (!payload.transferGroupId) {
      payload.transferGroupId = normalizeString(incoming.transferGroupId || '')
    }
    return payload
  }

  async function applyImportMetadataUpgrades(upgrades) {
    let updated = 0, failed = 0
    for (const upgrade of upgrades || []) {
      const existing = upgrade?.existing; const incoming = upgrade?.incoming
      if (!existing?.id || !incoming) continue
      try {
        const payload = buildUpgradePayload(existing, incoming)
        if (!isValidTransaction(payload)) { failed++; continue }
        const dto = await transactionsApi.update(auth.token, existing.id, payload)
        const normalized = normalizeTransaction(dto)
        const idx = transactions.value.findIndex(t => t.id === existing.id)
        if (idx >= 0) transactions.value[idx] = normalized; else transactions.value.push(normalized)
        updated++
      } catch (_) { failed++ }
    }
    return { updated, failed }
  }

  async function refreshSnapshot() {
    try {
      const data = await fetchBootstrap(auth.token)
      if (Array.isArray(data.transactions)) {
        const normalized = data.transactions.map(normalizeTransaction)
        importSnapshotTransactions.value = normalized
        transactions.value = normalized.filter(isValidTransaction)
      }
      if (Array.isArray(data.investmentAssets)) {
        investmentAssets.value = data.investmentAssets.map(normalizeInvestmentAsset).filter(item => item.id && item.name)
      }
    } catch (_) { /* keep current */ }
  }

  async function importCsvBatchCore(files, accountId) {
    const list = Array.isArray(files) ? files : [files]
    const csvFiles = list.filter(file =>
      file && normalizeString(String(file?.name || '')).toLowerCase().endsWith('.csv')
    )
    if (!csvFiles.length) throw new Error('Selecione ao menos um arquivo CSV valido.')

    const parsedByFile = []
    for (const file of csvFiles) {
      const fileName = normalizeString(String(file?.name || 'arquivo.csv')) || 'arquivo.csv'
      const text = await readFileAsText(file)
      let parsed
      try {
        parsed = parseTransactionsFromCsv(text, fileName)
      } catch (e) {
        throw new Error(`Falha ao processar ${fileName}. ${e?.message || ''}`.trim())
      }
      if (accountId) {
        parsed.items.forEach(item => {
          item.accountId = accountId
          const direction = normalizeTransferDirection(item.transferDirection)
          if (direction === 'out' && !item.transferFromAccountId) item.transferFromAccountId = accountId
          if (direction === 'in' && !item.transferToAccountId) item.transferToAccountId = accountId
        })
      }
      parsedByFile.push({ file, parsed })
    }

    const parsedItems = parsedByFile.flatMap(entry => entry.parsed.items)
    if (!parsedItems.length) throw new Error('Nenhuma movimentacao valida nos arquivos selecionados.')

    await refreshSnapshot()
    const existing = buildExistingFingerprints()
    const preview = buildImportPreview(parsedItems, existing)

    const fileSummaries = parsedByFile.map(entry => ({
      fileName: entry.parsed.fileName,
      itemCount: entry.parsed.items.length,
      skipped: entry.parsed.skipped || 0,
      source: entry.parsed.source || { key: 'unknown', label: 'Origem nao identificada', confidence: 'low' },
    }))
    const parsedByFilePayload = parsedByFile.map(entry => ({
      fileName: entry.parsed.fileName,
      items: entry.parsed.items,
      source: entry.parsed.source || { key: 'unknown', label: 'Origem nao identificada', confidence: 'low' },
    }))
    const sourceSummary = summarizeBatchSources(fileSummaries)
    const skipped = fileSummaries.reduce((sum, item) => sum + (item.skipped || 0), 0)

    return {
      parsed: { items: parsedItems, skipped },
      preview,
      files: csvFiles,
      parsedByFile: parsedByFilePayload,
      fileSummaries,
      sourceSummary,
    }
  }

  async function importCsvCore(file, accountId) {
    return importCsvBatchCore([file], accountId)
  }

  function buildImportJobFiles(parsedByFile, accountId) {
    return (Array.isArray(parsedByFile) ? parsedByFile : [])
      .map(entry => {
        const fileName = normalizeString(String(entry?.fileName || 'arquivo.csv')) || 'arquivo.csv'
        const rawItems = Array.isArray(entry?.items) ? entry.items : []
        const items = rawItems.map(item => {
          const withAccount = { ...item }
          if (accountId) {
            withAccount.accountId = accountId
            const direction = normalizeTransferDirection(withAccount.transferDirection)
            if (direction === 'out' && !withAccount.transferFromAccountId) withAccount.transferFromAccountId = accountId
            if (direction === 'in' && !withAccount.transferToAccountId) withAccount.transferToAccountId = accountId
          }
          return toPayload(withAccount, false)
        }).filter(item => isValidDate(item.date) && Number(item.amount) > 0)
        return { name: fileName, items }
      })
      .filter(file => file.items.length > 0)
  }

  async function waitForImportJob(jobId, onProgress) {
    const startedAt = Date.now()
    let transientFailures = 0

    while (true) {
      let job
      try {
        job = await transactionsApi.getImportJob(auth.token, jobId)
        transientFailures = 0
      } catch (err) {
        if (isTransientImportError(err) && (Date.now() - startedAt) < IMPORT_JOB_MAX_WAIT_MS) {
          transientFailures += 1
          if (transientFailures > 5) throw err
          await sleep(IMPORT_JOB_POLL_INTERVAL_MS)
          continue
        }
        throw err
      }

      if (typeof onProgress === 'function') onProgress(job)
      const status = normalizeString(job?.status || '').toLowerCase()
      if (status === 'completed') return job
      if (status === 'failed') throw buildImportJobFailure(job)
      if ((Date.now() - startedAt) > IMPORT_JOB_MAX_WAIT_MS) {
        throw new Error('Tempo limite aguardando a conclusao da importacao.')
      }
      await sleep(IMPORT_JOB_POLL_INTERVAL_MS)
    }
  }

  async function executeImportJob(batchData, preview, accountId, onProgress, options = {}) {
    const filesPayload = buildImportJobFiles(batchData?.parsedByFile, accountId)
    if (!filesPayload.length) throw new Error('Nenhuma movimentacao valida para importar.')

    let createdJob
    try {
      createdJob = await transactionsApi.startImportJob(auth.token, filesPayload)
      if (typeof onProgress === 'function') onProgress(createdJob)
    } catch (err) {
      // Backward compatibility with deployments that still only expose /import sync.
      if (Number(err?.status || 0) === 404 || Number(err?.status || 0) === 405) {
        const legacy = await executeImport(preview, accountId, options)
        return { ...legacy, job: null }
      }
      throw err
    }

    const finalJob = await waitForImportJob(createdJob.id, onProgress)
    const upgradeResult = await applyImportMetadataUpgrades(preview?.toUpgrade)
    await refreshSnapshot()
    const assetSyncResult = await syncInvestmentAssetsFromTransactions({
      silent: true,
      fixedIncomeAnnualRate: options?.fixedIncomeAnnualRate,
      nubankBoxAnnualRate: options?.nubankBoxAnnualRate,
      nubankBoxTurboAnnualRate: options?.nubankBoxTurboAnnualRate,
    })
    const pairingResult = await autoPairInternalTransfers({ silent: true })
    return { result: finalJob.result || {}, upgradeResult, pairingResult, assetSyncResult, job: finalJob }
  }

  async function undoImportBatch(batchId) {
    const normalizedBatchId = normalizeString(String(batchId || ''))
    if (!normalizedBatchId) throw new Error('Lote invalido para desfazer.')
    const result = await transactionsApi.undoImportBatch(auth.token, normalizedBatchId)
    await refreshSnapshot()
    return result
  }

  async function executeImport(preview, accountId, options = {}) {
    let result = { imported: 0, duplicates: 0, invalid: 0 }
    let pending = Array.isArray(preview?.toImport) ? preview.toImport.slice() : []
    let chunkSize = IMPORT_CHUNK_SIZE
    let recoveryPass = 0

    while (pending.length) {
      try {
        const partial = await importTransactionsInChunks(pending, chunkSize)
        result.imported += Number(partial?.imported || 0)
        result.duplicates += Number(partial?.duplicates || 0)
        result.invalid += Number(partial?.invalid || 0)
        pending = []
      } catch (err) {
        result.imported += Number(err?.partialResult?.imported || 0)
        result.duplicates += Number(err?.partialResult?.duplicates || 0)
        result.invalid += Number(err?.partialResult?.invalid || 0)

        if (!isTransientImportError(err) || recoveryPass >= IMPORT_RECOVERY_PASSES) {
          await refreshSnapshot()
          const existing = buildExistingFingerprints()
          const pendingPreview = buildImportPreview(pending, existing)
          result.duplicates += Number(pendingPreview?.duplicatesExisting || 0)
          result.invalid += Number(pendingPreview?.invalid || 0)
          pending = pendingPreview?.toImport || []
          if (!pending.length) break
          throw buildImportFailureError(err, result, pending.length)
        }

        recoveryPass += 1
        await refreshSnapshot()
        const existing = buildExistingFingerprints()
        const pendingPreview = buildImportPreview(pending, existing)
        result.duplicates += Number(pendingPreview?.duplicatesExisting || 0)
        result.invalid += Number(pendingPreview?.invalid || 0)
        pending = pendingPreview?.toImport || []
        chunkSize = Math.max(IMPORT_MIN_CHUNK_SIZE, Math.floor(chunkSize / 2))
        await sleep(300 * recoveryPass)
      }
    }

    const upgradeResult = await applyImportMetadataUpgrades(preview.toUpgrade)
    await refreshSnapshot()
    const assetSyncResult = await syncInvestmentAssetsFromTransactions({
      silent: true,
      fixedIncomeAnnualRate: options?.fixedIncomeAnnualRate,
      nubankBoxAnnualRate: options?.nubankBoxAnnualRate,
      nubankBoxTurboAnnualRate: options?.nubankBoxTurboAnnualRate,
    })
    const pairingResult = await autoPairInternalTransfers({ silent: true })
    return { result, upgradeResult, pairingResult, assetSyncResult }
  }

  // ── Password Change ────────────────────────────────────
  async function changePassword(currentPassword, newPassword) {
    const { authApi } = await import('../api/auth.js')
    try {
      await authApi.changePassword(currentPassword, newPassword, auth.token)
      app.showMessage('Senha alterada com sucesso.', 'success')
      return true
    } catch (e) {
      app.showMessage(`Falha ao alterar senha. (${e.message || ''})`, 'error')
      return false
    }
  }

  // ── Category select options ────────────────────────────
  const allCategoryNames = computed(() => {
    const cats = categories.value.length > 0 ? categories.value : []
    const usedCats = new Set(transactions.value.map(t => t.category))
    const all = new Set([...cats.map(c => c.name), ...usedCats])
    return [...all].sort((a, b) => a.localeCompare(b, 'pt-BR'))
  })

    return {
    // state
    transactions, budgets, goals, accounts, categories, investmentAssets, projection,
    loading, importSnapshotTransactions,
    // editing
    editingTransactionId, editingBudgetId, editingGoalId, editingAccountId, editingCategoryId,
    // table
    tablePage, tablePageSize, searchQuery, filterType, filterCategory, filterMethod, filterRecurrence,
    // computed
    filteredTransactions, dashboardData, investmentStats, netWorth, allCategoryNames,
    // actions
    bootstrap, monthlyTransactions,
    saveTransaction, deleteTransaction, deleteAllTransactions,
    saveBudget, deleteBudget,
    saveGoal, deleteGoal, addGoalContribution,
    saveAccount, deleteAccount, saveAccountDirect,
    saveCategory, deleteCategory,
    saveInvestmentAsset, deleteInvestmentAsset, refreshInvestmentAssetQuote, refreshAllInvestmentQuotes,
    searchMarketInvestmentAssets,
    syncInvestmentAssetsFromTransactions,
    saveProjection, buildProjectionModel,
    sendMonthlySummary, exportCsv,
    parseTransactionsFromCsv, buildExistingFingerprints, buildImportPreview,
    importCsvCore, importCsvBatchCore, executeImport, executeImportJob, undoImportBatch, refreshSnapshot, autoPairInternalTransfers,
    getAccountCsvSource, setAccountCsvSource, clearAccountCsvSource,
    validateCsvBatchForAccount, suggestAccountForBatch,
    changePassword,
  }
})
