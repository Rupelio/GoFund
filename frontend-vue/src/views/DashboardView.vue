<template>
  <div>
    <!-- KPI Cards -->
    <section class="kpi-grid">
      <article class="kpi-card"><p>Saldo do Mês</p><strong :class="{ positive: dd.balance >= 0, negative: dd.balance < 0 }">{{ formatCurrency(dd.balance) }}</strong></article>
      <article class="kpi-card"><p>Receitas</p><strong class="positive">{{ formatCurrency(dd.income) }}</strong></article>
      <article class="kpi-card"><p>Despesas</p><strong class="negative">{{ formatCurrency(dd.expense) }}</strong></article>
      <article class="kpi-card"><p>Investimentos</p><strong class="warning">{{ formatCurrency(dd.investment) }}</strong></article>
      <article class="kpi-card"><p>Total de Saídas</p><strong class="negative">{{ formatCurrency(dd.totalOut) }}</strong></article>
      <article class="kpi-card"><p>Cartão de Crédito</p><strong style="color:#a78bfa">{{ formatCurrency(dd.creditCard) }}</strong></article>
      <article class="kpi-card"><p>Patrimônio Líquido</p><strong :class="data.netWorth >= 0 ? 'positive' : 'negative'">{{ formatCurrency(data.netWorth) }}</strong></article>
    </section>

    <!-- Dismissible Banners -->
    <section class="dashboard-banners">
      <!-- Welcome Banner -->
      <div v-if="showBanner('welcome')" class="info-banner dismissible-banner">
        <button class="banner-close" type="button" title="Fechar" @click="closeBanner('welcome')">×</button>
        <p><strong>👋 Bem-vindo ao GoFund!</strong></p>
        <p>Use os atalhos de teclado para navegar: <kbd>1-9</kbd> para páginas, <kbd>N</kbd> para nova movimentação, <kbd>←→</kbd> para mudar de mês.</p>
        <label class="banner-dont-show">
          <input type="checkbox" v-model="dontShowAgain.welcome" />
          Não mostrar novamente
        </label>
      </div>

      <!-- CSV Import Hint Banner -->
      <div v-if="showBanner('csv-hint')" class="info-banner dismissible-banner csv-hint-banner">
        <button class="banner-close" type="button" title="Fechar" @click="closeBanner('csv-hint')">×</button>
        <p><i class="fa-solid fa-file-csv" style="color:var(--primary);margin-right:6px"></i> <strong>Importe o extrato do seu cartão!</strong></p>
        <p>Você pode importar seu extrato CSV de duas formas:</p>
        <div class="csv-hint-actions">
          <button class="btn ghost tiny" type="button" @click="triggerCsvImport">
            <i class="fa-solid fa-upload"></i> Clique para importar
          </button>
          <span class="csv-hint-separator">ou</span>
          <span class="csv-hint-drag"><i class="fa-solid fa-hand-pointer"></i> Arraste o arquivo .csv para qualquer lugar da tela</span>
        </div>
        <label class="banner-dont-show">
          <input type="checkbox" v-model="dontShowAgain['csv-hint']" />
          Não mostrar novamente
        </label>
      </div>
    </section>

    <!-- Alerts -->
    <section class="alerts-bar">
      <div v-for="alert in allAlerts" :key="alert.id" class="alert-item" :class="'alert-' + alert.type">
        <span class="alert-icon" v-html="alert.icon"></span>
        <span class="alert-text">{{ alert.text }}</span>
        <button class="alert-dismiss" type="button" @click="dismissAlert(alert.id)">&times;</button>
      </div>
    </section>

    <!-- Charts -->
    <section class="panel-grid">
      <article class="panel">
        <header class="panel-head"><h2>Fluxo de Caixa</h2></header>
        <div class="chart-wrap"><canvas ref="cashFlowCanvas"></canvas></div>
      </article>
      <article class="panel">
        <header class="panel-head"><h2>Gastos por Categoria</h2></header>
        <canvas ref="expenseByCategoryCanvas"></canvas>
      </article>
    </section>
  </div>
</template>

<script setup>
import { ref, reactive, computed, watch, onMounted, nextTick, inject } from 'vue'
import { useDataStore } from '../stores/data.js'
import { useAppStore } from '../stores/app.js'
import {
  formatCurrency, round2, getChartTheme, withAlpha, getChartColors,
  getMonthSequence, getMonthlyTransactions, getMonthShift, formatMonthLabel, getYAxisConfig, formatAxisValue,
  formatGoalDueDate, getTodayDate, getInvestmentStats, getClosingCash,
  getInvestmentCategories, isInvestmentRedemption, isCashAffectingTransaction,
} from '../helpers.js'

const data = useDataStore()
const app = useAppStore()
const triggerCsvImport = inject('triggerCsvImport', () => {})

function isCashForKpi(t) {
  return isCashAffectingTransaction(t, {
    excludeInternalTransfers: app.neutralizeInternalTransfersInKpis === true,
  })
}

// ── Dismissible Banners ───────────────────────────────
const BANNERS_STORAGE_KEY = 'gofund_hidden_banners'

function loadHiddenBanners() {
  try {
    const raw = localStorage.getItem(BANNERS_STORAGE_KEY)
    return raw ? new Set(JSON.parse(raw)) : new Set()
  } catch { return new Set() }
}
function saveHiddenBanners(s) {
  localStorage.setItem(BANNERS_STORAGE_KEY, JSON.stringify([...s]))
}

const permanentlyHidden = ref(loadHiddenBanners())
const closedBanners = ref(new Set())
const dontShowAgain = reactive({})

function showBanner(id) {
  return !permanentlyHidden.value.has(id) && !closedBanners.value.has(id)
}

function closeBanner(id) {
  if (dontShowAgain[id]) {
    permanentlyHidden.value.add(id)
    permanentlyHidden.value = new Set(permanentlyHidden.value)
    saveHiddenBanners(permanentlyHidden.value)
  }
  closedBanners.value.add(id)
  closedBanners.value = new Set(closedBanners.value)
}

const cashFlowCanvas = ref(null)
const expenseByCategoryCanvas = ref(null)
let cashFlowChart = null
let expenseChart = null
// Persistent dismissed alerts scoped by month
function loadDismissed() {
  try {
    const raw = localStorage.getItem('gofund_dismissed_alerts')
    if (raw) {
      const obj = JSON.parse(raw)
      if (obj.month === app.currentMonth) return new Set(obj.ids)
    }
  } catch {}
  return new Set()
}
function saveDismissed(s) {
  localStorage.setItem('gofund_dismissed_alerts', JSON.stringify({ month: app.currentMonth, ids: [...s] }))
}
const dismissedAlerts = ref(loadDismissed())

const dd = computed(() => data.dashboardData)

// Reset dismissed set when month changes
watch(() => app.currentMonth, () => {
  dismissedAlerts.value = loadDismissed()
})

function dismissAlert(id) {
  dismissedAlerts.value.add(id)
  dismissedAlerts.value = new Set(dismissedAlerts.value) // trigger reactivity
  saveDismissed(dismissedAlerts.value)
}

// Full alerts (exact legacy logic)
const allAlerts = computed(() => {
  const alerts = []
  const month = app.currentMonth
  const monthly = data.monthlyTransactions(month)
  const expenses = {}
  monthly.filter(t => isCashForKpi(t) && (t.type === 'despesa' || t.type === 'investimento'))
    .forEach(t => { expenses[t.category.toLowerCase()] = (expenses[t.category.toLowerCase()] || 0) + t.amount })

  // Budget alerts
  data.budgets.forEach(b => {
    const used = expenses[b.category.toLowerCase()] || 0
    if (used > b.limit) {
      alerts.push({ id: `budget-over-${b.id || b.category}`, type: 'danger', icon: '<i class="fa-solid fa-circle-exclamation"></i>', text: `Orçamento de "${b.category}" excedido: ${formatCurrency(used)} / ${formatCurrency(b.limit)} (${((used / b.limit) * 100).toFixed(0)}%)` })
    } else if (used > b.limit * 0.85) {
      alerts.push({ id: `budget-warn-${b.id || b.category}`, type: 'warning', icon: '<i class="fa-solid fa-triangle-exclamation"></i>', text: `"${b.category}" atingiu ${((used / b.limit) * 100).toFixed(0)}% do orçamento (${formatCurrency(used)} / ${formatCurrency(b.limit)})` })
    }
  })

  // Goal deadline alerts
  const today = new Date(`${getTodayDate()}T00:00:00`)
  data.goals.forEach(g => {
    if (g.current >= g.target) return
    if (!g.dueDate) return
    const due = new Date(`${g.dueDate}T00:00:00`)
    const diff = Math.ceil((due - today) / 86400000)
    if (diff < 0) {
      alerts.push({ id: `goal-over-${g.id || g.name}`, type: 'danger', icon: '<i class="fa-solid fa-bullseye"></i>', text: `Meta "${g.name}" venceu há ${Math.abs(diff)} dias — faltam ${formatCurrency(g.target - g.current)}` })
    } else if (diff <= 15) {
      alerts.push({ id: `goal-warn-${g.id || g.name}`, type: 'warning', icon: '<i class="fa-solid fa-bullseye"></i>', text: `Meta "${g.name}" vence em ${diff} dias — faltam ${formatCurrency(g.target - g.current)}` })
    }
  })

  // Recurring transaction alerts
  const recurring = data.transactions.filter(t => t.recurrence === 'monthly')
  const upcomingRecurring = recurring.filter(t => {
    const tMonth = t.date.slice(0, 7)
    if (tMonth > month) return false
    if (t.recurrenceEnd && t.recurrenceEnd.slice(0, 7) < month) return false
    return true
  })
  const recurringExpenses = upcomingRecurring.filter(t => isCashForKpi(t) && t.type === 'despesa')
  const recurringIncome = upcomingRecurring.filter(t => isCashForKpi(t) && t.type === 'receita')
  if (recurringExpenses.length > 0) {
    const total = recurringExpenses.reduce((s, t) => s + t.amount, 0)
    alerts.push({ id: 'recurring-expenses', type: 'info', icon: '<i class="fa-solid fa-rotate"></i>', text: `${recurringExpenses.length} despesas recorrentes este mês (${formatCurrency(total)})` })
  }
  if (recurringIncome.length > 0) {
    const total = recurringIncome.reduce((s, t) => s + t.amount, 0)
    alerts.push({ id: 'recurring-income', type: 'success', icon: '<i class="fa-solid fa-rotate"></i>', text: `${recurringIncome.length} receitas recorrentes este mês (${formatCurrency(total)})` })
  }

  return alerts.filter(a => !dismissedAlerts.value.has(a.id))
})

function renderCashFlowChart() {
  if (!cashFlowCanvas.value || typeof Chart === 'undefined') return
  if (cashFlowChart) cashFlowChart.destroy()
  const theme = getChartTheme()
  const transactions = getMonthlyTransactions(data.transactions, app.currentMonth)
  const [y, m] = app.currentMonth.split('-').map(Number)
  const days = new Date(y, m, 0).getDate()
  const daily = new Array(days).fill(0)
  const dailyPatri = new Array(days).fill(0)
  const invCats = getInvestmentCategories(data.transactions)
  transactions.forEach(t => {
    const d = Number(t.date.slice(8, 10)) - 1
    if (d >= 0 && d < days) {
      if (!isCashForKpi(t)) return
      const isRedempt = isInvestmentRedemption(t, invCats)
      daily[d] += (t.type === 'receita' ? 1 : -1) * t.amount
      // Investment round-trips (application / redemption) don't change patrimônio
      if (t.type === 'receita' && !isRedempt) dailyPatri[d] += t.amount
      else if (t.type === 'despesa') dailyPatri[d] -= t.amount
    }
  })
  const labels = []; const cumulative = []; const patriCumulative = []
  // Start from previous month's closing cash to carry over balance
  const prevMonth = getMonthShift(app.currentMonth, -1)
  const prevClosing = getClosingCash(data.transactions, prevMonth, {
    excludeInternalTransfers: app.neutralizeInternalTransfersInKpis === true,
  })
  let running = prevClosing; let patriRunning = prevClosing
  const investStats = getInvestmentStats(data.transactions)
  const dailyYield = days > 0 ? investStats.estimatedMonthlyYield / days : 0
  for (let i = 0; i < days; i++) {
    running += daily[i]
    patriRunning += dailyPatri[i] + dailyYield
    cumulative.push(round2(running))
    patriCumulative.push(round2(patriRunning))
    labels.push(String(i + 1).padStart(2, '0'))
  }
  const pos = cumulative[cumulative.length - 1] >= 0
  const datasets = [
    { label: 'Fluxo de caixa', data: cumulative, borderColor: pos ? theme.positiveColor : theme.negativeColor, backgroundColor: pos ? theme.positiveFill : theme.negativeFill, fill: true, tension: 0.3, pointRadius: 1, pointHoverRadius: 5, borderWidth: 2 },
  ]
  if (investStats.totalInvested > 0) {
    datasets.push({ label: 'Patrimônio (c/ rendimentos)', data: patriCumulative, borderColor: theme.patrimonioColor, backgroundColor: 'transparent', borderDash: [4, 3], tension: 0.3, pointRadius: 1, pointHoverRadius: 5, borderWidth: 2, fill: false })
  }
  const allData = [cumulative]
  if (investStats.totalInvested > 0) allData.push(patriCumulative)
  cashFlowChart = new Chart(cashFlowCanvas.value, {
    type: 'line',
    data: { labels, datasets },
    options: {
      responsive: true, maintainAspectRatio: false,
      layout: { padding: { left: 4, right: 12, top: 8, bottom: 4 } },
      interaction: { mode: 'index', intersect: false },
      plugins: {
        legend: { display: datasets.length > 1, labels: { color: theme.labelColor, usePointStyle: true, boxWidth: 8, padding: 12, font: { size: 11 } } },
        tooltip: { callbacks: { label: c => `${c.dataset.label}: ${formatCurrency(c.parsed.y || 0)}` } },
      },
      scales: {
        x: { grid: { color: theme.gridColor }, ticks: { color: theme.labelColor, maxTicksLimit: 10, font: { size: 11 } } },
        y: getYAxisConfig(theme, allData),
      },
    },
  })
}

function renderExpenseByCategoryChart() {
  if (!expenseByCategoryCanvas.value || typeof Chart === 'undefined') return
  if (expenseChart) expenseChart.destroy()
  const theme = getChartTheme()
  const monthly = data.monthlyTransactions(app.currentMonth)
  const expenses = monthly.filter(t => t.type === 'despesa' && isCashForKpi(t))
  const groups = {}
  expenses.forEach(t => { groups[t.category] = (groups[t.category] || 0) + t.amount })
  const sorted = Object.entries(groups).sort((a, b) => b[1] - a[1])
  if (!sorted.length) return
  const labels = sorted.map(([cat]) => cat)
  const values = sorted.map(([, val]) => round2(val))
  const colors = getChartColors(labels.length)
  expenseChart = new Chart(expenseByCategoryCanvas.value, {
    type: 'doughnut',
    data: { labels, datasets: [{ data: values, backgroundColor: colors, borderWidth: 0 }] },
    options: {
      responsive: true, maintainAspectRatio: true,
      plugins: {
        legend: { position: 'right', labels: { color: theme.labelColor, padding: 12, boxWidth: 14, font: { size: 12 } } },
        tooltip: { callbacks: { label: ctx => `${ctx.label}: ${formatCurrency(ctx.parsed)}` } },
      },
    },
  })
}

function renderAllCharts() {
  nextTick(() => { renderCashFlowChart(); renderExpenseByCategoryChart() })
}

watch(() => [app.currentMonth, data.transactions.length], renderAllCharts, { deep: true })
onMounted(renderAllCharts)
</script>
