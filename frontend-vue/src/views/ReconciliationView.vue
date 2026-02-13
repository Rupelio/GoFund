<template>
  <div>
    <section class="panel-grid">
      <article class="panel panel-large">
        <header class="panel-head">
          <h2>Conciliação Mensal</h2>
          <select v-model="accountFilter" style="max-width:260px">
            <option value="__all__">Todas as contas</option>
            <option value="__unassigned__">Sem conta vinculada</option>
            <option v-for="acc in accountOptions" :key="acc.id" :value="acc.id">{{ acc.name }}</option>
          </select>
        </header>

        <p style="margin:0 0 0.8rem 0;font-size:0.86rem;color:var(--text-secondary)">
          Fórmula base: <strong>saldo inicial + entradas - despesas - investimentos</strong>. O ajuste abaixo mostra o efeito de transferências no mês selecionado.
        </p>

        <div class="report-grid">
          <div class="report-card">
            <p>Saldo Inicial</p>
            <div class="report-value">{{ formatCurrency(openingBalance) }}</div>
          </div>
          <div class="report-card">
            <p>Entradas</p>
            <div class="report-value positive">{{ formatCurrency(income) }}</div>
          </div>
          <div class="report-card">
            <p>Despesas</p>
            <div class="report-value negative">{{ formatCurrency(expense) }}</div>
          </div>
          <div class="report-card">
            <p>Investimentos</p>
            <div class="report-value warning">{{ formatCurrency(investment) }}</div>
          </div>
          <div class="report-card">
            <p>Saldo Esperado</p>
            <div class="report-value" :class="expectedClosing >= 0 ? 'positive' : 'negative'">{{ formatCurrency(expectedClosing) }}</div>
          </div>
          <div class="report-card">
            <p>Ajuste Transferências</p>
            <div class="report-value" :class="transferAdjustment >= 0 ? 'positive' : 'negative'">{{ formatCurrency(transferAdjustment) }}</div>
          </div>
          <div class="report-card">
            <p>Saldo Realizado (estimado)</p>
            <div class="report-value" :class="realizedClosing >= 0 ? 'positive' : 'negative'">{{ formatCurrency(realizedClosing) }}</div>
          </div>
          <div class="report-card">
            <p>Diferença</p>
            <div class="report-value" :class="difference >= 0 ? 'positive' : 'negative'">{{ formatCurrency(difference) }}</div>
          </div>
        </div>

        <h3 class="section-title">Composição do Mês</h3>
        <div class="report-category-list">
          <div class="report-category-row"><span>Saldo inicial</span><span>{{ formatCurrency(openingBalance) }}</span></div>
          <div class="report-category-row"><span>+ Entradas</span><span class="positive">{{ formatCurrency(income) }}</span></div>
          <div class="report-category-row"><span>- Despesas</span><span class="negative">{{ formatCurrency(expense) }}</span></div>
          <div class="report-category-row"><span>- Investimentos</span><span class="warning">{{ formatCurrency(investment) }}</span></div>
          <div class="report-category-row"><span>= Saldo esperado</span><span :class="expectedClosing >= 0 ? 'positive' : 'negative'">{{ formatCurrency(expectedClosing) }}</span></div>
          <div class="report-category-row"><span>+/- Ajuste por transferências</span><span :class="transferAdjustment >= 0 ? 'positive' : 'negative'">{{ formatCurrency(transferAdjustment) }}</span></div>
          <div class="report-category-row"><span>= Saldo realizado (estimado)</span><span :class="realizedClosing >= 0 ? 'positive' : 'negative'">{{ formatCurrency(realizedClosing) }}</span></div>
        </div>

        <h3 class="section-title">Transferências no Mês</h3>
        <p style="margin:0 0 0.65rem 0;font-size:0.82rem;color:var(--text-secondary)">
          Recebidas: <strong class="positive">{{ formatCurrency(transferIn) }}</strong>
          · Enviadas: <strong class="negative">{{ formatCurrency(transferOut) }}</strong>
          <span v-if="transferUnknown > 0"> · Indefinidas: <strong>{{ formatCurrency(transferUnknown) }}</strong></span>
        </p>
        <template v-if="transferRows.length">
          <div class="report-category-list">
            <div v-for="item in transferRows" :key="item.key" class="report-category-row">
              <span style="display:flex;gap:0.45rem;align-items:center;min-width:0">
                <i class="fa-solid" :class="item.direction === 'Recebida' ? 'fa-arrow-down' : (item.direction === 'Enviada' ? 'fa-arrow-up' : 'fa-right-left')" aria-hidden="true"></i>
                <span style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap">{{ item.description }}</span>
              </span>
              <span :class="item.direction === 'Recebida' ? 'positive' : (item.direction === 'Enviada' ? 'negative' : '')">
                {{ item.direction }} · {{ formatCurrency(item.amount) }}
              </span>
            </div>
          </div>
        </template>
        <p v-else class="empty-state">Nenhuma transferência identificada para o filtro atual.</p>
      </article>
    </section>
  </div>
</template>

<script setup>
import { computed, ref } from 'vue'
import { useDataStore } from '../stores/data.js'
import { useAppStore } from '../stores/app.js'
import { formatCurrency, getMonthShift, normalizeString, round2 } from '../helpers.js'

const data = useDataStore()
const app = useAppStore()

const accountFilter = ref('__all__')

const accountOptions = computed(() =>
  [...data.accounts].sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'))
)

function matchesAccount(t) {
  if (accountFilter.value === '__all__') return true
  if (accountFilter.value === '__unassigned__') return !normalizeString(t.accountId)
  return normalizeString(t.accountId) === accountFilter.value
}

function isTransferLikeTransaction(t) {
  const normalizedType = normalizeString(String(t.type || '')).toLowerCase()
  if (normalizedType === 'transferencia') return true
  const normalizedCategory = normalizeString(String(t.category || '')).toLowerCase()
  return normalizedCategory === 'transferência' || normalizedCategory === 'transferencia'
}

function isCoreCashTransaction(t) {
  if (isTransferLikeTransaction(t)) return false
  if (t.method === 'credito') return false
  return true
}

function getMonthsUntil(targetMonth) {
  const months = new Set()
  data.transactions.forEach(t => {
    const month = String(t.date || '').slice(0, 7)
    if (month && month <= targetMonth) months.add(month)
  })
  data.transactions.forEach(t => {
    const firstMonth = String(t.date || '').slice(0, 7)
    if (!firstMonth) return
    if (t.recurrence === 'monthly' || Number(t.installments || 0) > 1) {
      let month = firstMonth
      while (month <= targetMonth) {
        months.add(month)
        month = getMonthShift(month, 1)
      }
    }
  })
  return [...months].sort()
}

function calculateCoreClosing(month) {
  let balance = 0
  const months = getMonthsUntil(month)
  months.forEach(m => {
    const items = data.monthlyTransactions(m).filter(matchesAccount)
    items.forEach(t => {
      if (!isCoreCashTransaction(t)) return
      balance += t.type === 'receita' ? Number(t.amount || 0) : -Number(t.amount || 0)
    })
  })
  return round2(balance)
}

const previousMonth = computed(() => getMonthShift(app.currentMonth, -1))
const openingBalance = computed(() => calculateCoreClosing(previousMonth.value))

const monthTransactions = computed(() =>
  data.monthlyTransactions(app.currentMonth).filter(matchesAccount)
)

const income = computed(() => round2(monthTransactions.value
  .filter(t => t.type === 'receita' && isCoreCashTransaction(t))
  .reduce((sum, t) => sum + Number(t.amount || 0), 0)))

const expense = computed(() => round2(monthTransactions.value
  .filter(t => t.type === 'despesa' && isCoreCashTransaction(t))
  .reduce((sum, t) => sum + Number(t.amount || 0), 0)))

const investment = computed(() => round2(monthTransactions.value
  .filter(t => t.type === 'investimento' && isCoreCashTransaction(t))
  .reduce((sum, t) => sum + Number(t.amount || 0), 0)))

const expectedClosing = computed(() =>
  round2(openingBalance.value + income.value - expense.value - investment.value)
)

const transferRows = computed(() => {
  const rows = []
  for (const t of monthTransactions.value) {
    if (!isTransferLikeTransaction(t)) continue
    const desc = normalizeString(t.description).toLowerCase()
    let direction = 'Indefinida'
    if (/\brecebid[ao]\b|\bcreditad[ao]\b|\bentrada\b/.test(desc)) direction = 'Recebida'
    else if (/\benviad[ao]\b|\bdebitad[ao]\b|\bsaida\b/.test(desc)) direction = 'Enviada'
    else if (String(t.type || '').toLowerCase() === 'receita') direction = 'Recebida'
    else if (String(t.type || '').toLowerCase() === 'despesa') direction = 'Enviada'
    rows.push({
      key: `${t.id}-${direction}`,
      description: normalizeString(t.description) || 'Transferência',
      amount: Number(t.amount || 0),
      direction,
    })
  }
  return rows.sort((a, b) => b.amount - a.amount)
})

const transferIn = computed(() => round2(
  transferRows.value.filter(item => item.direction === 'Recebida').reduce((sum, item) => sum + item.amount, 0)
))
const transferOut = computed(() => round2(
  transferRows.value.filter(item => item.direction === 'Enviada').reduce((sum, item) => sum + item.amount, 0)
))
const transferUnknown = computed(() => round2(
  transferRows.value.filter(item => item.direction === 'Indefinida').reduce((sum, item) => sum + item.amount, 0)
))

const transferAdjustment = computed(() => round2(transferIn.value - transferOut.value))
const realizedClosing = computed(() => round2(expectedClosing.value + transferAdjustment.value))
const difference = computed(() => round2(realizedClosing.value - expectedClosing.value))
</script>
