import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import { useAuthStore } from './auth.js'
import { useAppStore } from './app.js'
import { transactionsApi } from '../api/transactions.js'
import { budgetsApi, goalsApi, accountsApi, categoriesApi, projectionApi, summaryApi } from '../api/resources.js'
import { fetchBootstrap } from '../api/bootstrap.js'
import {
  normalizeTransaction, normalizeBudget, normalizeGoal, normalizeProjection,
  isValidTransaction, isValidBudget, isValidGoal,
  getMonthlyTransactions, getInvestmentStats, getInvestmentYields, setInvestmentYield as setYield,
  getClosingCash, getMonthlySummaryMap, getAverageMonthlyFlow,
  getMonthSequence, getMonthShift, round2, formatMonthLabel, formatCurrency,
  normalizeString, normalizeCategory, normalizeHeader, findHeaderIdx,
  parseFlexibleNumber, detectCsvDelimiter, parseCsvLine, csvEscape,
  readFileAsText, normalizeCsvDate, extractInstallmentInfo, adjustToInstallmentStartDate,
  isSubscriptionDescription, shouldInferMonthlyBankRecurrence,
  inferCategoryFromDescription, CARD_BILL_REGEX, SUBSCRIPTION_REGEX,
  txnFingerprint, txnMonthlyFingerprint, txnInstallmentFingerprint, normalizeDescriptionForFingerprint, toPayload, isValidDate,
  getProjectionBasis, getAccountBalance,
} from '../helpers.js'

export const useDataStore = defineStore('data', () => {
  const auth = useAuthStore()
  const app = useAppStore()

  // ── State ──────────────────────────────────────────────
  const transactions = ref([])
  const budgets = ref([])
  const goals = ref([])
  const accounts = ref([])
  const categories = ref([])
  const projection = ref(normalizeProjection({}))
  const importSnapshotTransactions = ref([])
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
  const dashboardData = computed(() => {
    const monthly = monthlyTransactions(app.currentMonth)
    const cashBasis = monthly.filter(t => t.method !== 'credito')
    const income = cashBasis.filter(t => t.type === 'receita').reduce((s, t) => s + t.amount, 0)
    const expense = cashBasis.filter(t => t.type === 'despesa').reduce((s, t) => s + t.amount, 0)
    const investment = cashBasis.filter(t => t.type === 'investimento').reduce((s, t) => s + t.amount, 0)
    const creditCard = monthly.filter(t => t.method === 'credito' && t.type === 'despesa').reduce((s, t) => s + t.amount, 0)
    const balance = income - expense - investment
    return { income, expense, investment, creditCard, balance, monthly }
  })

  const investmentStats = computed(() => getInvestmentStats(transactions.value))

  const netWorth = computed(() => {
    const real = transactions.value.filter(t => t.method !== 'credito')
    const totalIncome = real.filter(t => t.type === 'receita').reduce((s, t) => s + t.amount, 0)
    const totalExpense = real.filter(t => t.type === 'despesa').reduce((s, t) => s + t.amount, 0)
    const totalInvestment = real.filter(t => t.type === 'investimento').reduce((s, t) => s + t.amount, 0)
    const cash = totalIncome - totalExpense - totalInvestment
    const goalsSaved = goals.value.reduce((s, g) => s + g.current, 0)
    const stats = investmentStats.value
    return round2(cash + stats.totalInvested + goalsSaved)
  })

  // ── Transaction CRUD ───────────────────────────────────
  async function saveTransaction(payload) {
    const id = editingTransactionId.value
    try {
      if (id) {
        const updated = normalizeTransaction(
          await transactionsApi.update(auth.token, id, payload)
        )
        const idx = transactions.value.findIndex(t => t.id === id)
        if (idx >= 0) transactions.value[idx] = updated
        app.showMessage('Movimentação atualizada.', 'success')
      } else {
        const created = normalizeTransaction(
          await transactionsApi.create(auth.token, payload)
        )
        transactions.value.push(created)
        app.showMessage('Movimentação criada.', 'success')
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
    const monthlyMap = getMonthlySummaryMap(transactions.value, app.currentMonth)
    const avgMonths = getMonthSequence(app.currentMonth, -2, 0)
    const avg = getAverageMonthlyFlow(monthlyMap, avgMonths)

    const expectedIncome = p.income ?? avg.income
    const expectedExpense = p.expense ?? avg.expense
    const expectedInvestment = p.investment ?? avg.investment
    const expectedNet = round2(expectedIncome - expectedExpense - expectedInvestment)

    const stats = investmentStats.value
    const rate = stats.avgMonthlyRate

    const labels = historyMonths.concat(futureMonths).map(formatMonthLabel)
    const actual = historyMonths.map(m => round2(getClosingCash(transactions.value, m)))
    futureMonths.forEach(() => actual.push(null))

    const projected = new Array(labels.length).fill(null)
    const projectedPatrimonio = new Array(labels.length).fill(null)
    const startIdx = historyMonths.length - 1
    let rolling = round2(getClosingCash(transactions.value, app.currentMonth))
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
      currentCash: round2(getClosingCash(transactions.value, app.currentMonth)),
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
  function exportCsv() {
    if (!transactions.value.length) {
      app.showMessage('Sem movimentações para exportar.', 'error')
      return
    }
    const headers = ['id', 'date', 'type', 'category', 'method', 'description', 'amount', 'recurrence', 'recurrenceEnd', 'installments', 'createdAt']
    const rows = transactions.value.map(t => [t.id, t.date, t.type, t.category, t.method, t.description, t.amount.toFixed(2), t.recurrence || 'none', t.recurrenceEnd || '', t.installments || 0, t.createdAt])
    const csv = [headers.join(',')].concat(rows.map(r => r.map(csvEscape).join(','))).join('\n')
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const a = Object.assign(document.createElement('a'), { href: url, download: `movimentacoes-${app.currentMonth}.csv` })
    document.body.appendChild(a); a.click(); a.remove(); URL.revokeObjectURL(url)
    app.showMessage('CSV exportado.', 'success')
  }

  // ── CSV Import ─────────────────────────────────────────
  function parseTransactionsFromCsv(csvText) {
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
      createdAt: findHeaderIdx(headers, ['createdat', 'created_at']),
    }
    const hasAmountColumn = idx.amount >= 0
    const hasSplitAmountColumns = idx.debit >= 0 || idx.credit >= 0
    if (idx.date < 0 || idx.description < 0 || (!hasAmountColumn && !hasSplitAmountColumns)) {
      throw new Error('Cabeçalho CSV inválido. Mínimo: Data, Descrição e Valor (ou Débito/Crédito).')
    }
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
        if (rawAmount <= 0 && (desc.includes('pagamento recebido') || desc.includes('parcelamento de fatura'))) { skipped++; return }
        if (!inferredType) inferredType = rawAmount >= 0 ? 'despesa' : 'receita'
        if (!inferredMethod) inferredMethod = 'credito'
        if (!inferredCategory) inferredCategory = inferCategoryFromDescription(desc, { method: inferredMethod, type: inferredType })
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
        if (!inferredCategory) inferredCategory = inferCategoryFromDescription(desc, { method: inferredMethod, type: inferredType })
      }

      const descLower = rawDesc.toLowerCase()
      if (inferredType === 'despesa' && CARD_BILL_REGEX.test(descLower)) {
        inferredCategory = 'Fatura'
        if (inferredMethod === 'credito') inferredMethod = 'transferencia'
      }

      let inferredInstallments = idx.installments >= 0 ? Number(cols[idx.installments]) || 0 : 0
      let inferredRecurrence = idx.recurrence >= 0 ? String(cols[idx.recurrence] || 'none') : 'none'
      let inferredRecurrenceEnd = idx.recurrenceEnd >= 0 ? String(cols[idx.recurrenceEnd] || '') : ''
      const installmentInfo = extractInstallmentInfo(rawDesc)
      if (installmentInfo) {
        if (inferredInstallments <= 0) inferredInstallments = installmentInfo.total
        parsedDate = adjustToInstallmentStartDate(parsedDate, installmentInfo)
      }

      if (isCreditCardCsv && inferredInstallments <= 0 && inferredRecurrence === 'none') {
        if (isSubscriptionDescription(rawDesc)) inferredRecurrence = 'monthly'
      }
      if (isBankCsv && inferredInstallments <= 0 && inferredRecurrence === 'none') {
        if (shouldInferMonthlyBankRecurrence(rawDesc, inferredMethod, inferredType, inferredCategory, Math.abs(rawAmount))) inferredRecurrence = 'monthly'
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
        createdAt: idx.createdAt >= 0 ? String(cols[idx.createdAt] || new Date().toISOString()) : new Date().toISOString(),
      })
      if (isValidDate(originalParsedDate)) item._csvOriginalDate = originalParsedDate
      isValidTransaction(item) ? items.push(item) : skipped++
    })
    return { items, skipped }
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
    } catch (_) { /* keep current */ }
  }

  async function importCsvCore(file, accountId) {
    const text = await readFileAsText(file)
    const parsed = parseTransactionsFromCsv(text)
    if (!parsed.items.length) throw new Error('Nenhuma movimentação válida no CSV.')

    if (accountId) parsed.items.forEach(item => { item.accountId = accountId })

    await refreshSnapshot()
    const existing = buildExistingFingerprints()
    const preview = buildImportPreview(parsed.items, existing)

    return { parsed, preview, file }
  }

  async function executeImport(preview, accountId) {
    let result = { imported: 0, duplicates: 0, invalid: 0 }
    if (preview.toImport.length) {
      result = await transactionsApi.import(auth.token, preview.toImport.map(item => toPayload(item, false)))
    }
    const upgradeResult = await applyImportMetadataUpgrades(preview.toUpgrade)
    await refreshSnapshot()
    return { result, upgradeResult }
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
    transactions, budgets, goals, accounts, categories, projection,
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
    saveProjection, buildProjectionModel,
    sendMonthlySummary, exportCsv,
    parseTransactionsFromCsv, buildExistingFingerprints, buildImportPreview,
    importCsvCore, executeImport, refreshSnapshot,
    changePassword,
  }
})
