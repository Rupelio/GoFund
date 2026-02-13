<template>
  <div>
    <section class="panel-grid"><article class="panel panel-large" ref="reportPanel">
      <header class="panel-head">
        <h2>Relatório Mensal</h2>
        <button class="btn ghost tiny" type="button" @click="exportPdf">
          <i class="fa-solid fa-file-pdf"></i> Exportar PDF
        </button>
      </header>

      <!-- KPI Cards -->
      <div class="report-grid">
        <div class="report-card">
          <p>Receitas</p>
          <div class="report-value">{{ formatCurrency(cur.income) }}</div>
          <div class="report-change" :class="incChange.cls">{{ arrow(incChange.cls) }} {{ Math.abs(incChange.pct).toFixed(1) }}% vs mês anterior</div>
        </div>
        <div class="report-card">
          <p>Despesas</p>
          <div class="report-value">{{ formatCurrency(cur.expense) }}</div>
          <div class="report-change" :class="expChangeInverted">{{ arrow(expChange.cls) }} {{ Math.abs(expChange.pct).toFixed(1) }}%</div>
        </div>
        <div class="report-card">
          <p>Investimentos</p>
          <div class="report-value">{{ formatCurrency(cur.investment) }}</div>
          <div class="report-change" :class="invChange.cls">{{ arrow(invChange.cls) }} {{ Math.abs(invChange.pct).toFixed(1) }}%</div>
        </div>
        <div class="report-card">
          <p>Total de Saídas</p>
          <div class="report-value negative">{{ formatCurrency(cur.totalOut) }}</div>
          <div class="report-change" :class="totOutChangeInverted">{{ arrow(totOutChange.cls) }} {{ Math.abs(totOutChange.pct).toFixed(1) }}%</div>
        </div>
        <div class="report-card">
          <p>Saldo Líquido</p>
          <div class="report-value">{{ formatCurrency(cur.balance) }}</div>
          <div class="report-change" :class="balChange.cls">{{ arrow(balChange.cls) }} {{ Math.abs(balChange.pct).toFixed(1) }}%</div>
        </div>
        <div class="report-card">
          <p>Cartão de Crédito</p>
          <div class="report-value warning">{{ formatCurrency(cur.creditCard) }}</div>
          <div class="report-change" :class="ccChangeInverted">{{ arrow(ccChange.cls) }} {{ Math.abs(ccChange.pct).toFixed(1) }}%</div>
        </div>
      </div>

      <h3 class="section-title" style="margin-top:1rem">Fechamento Mensal (Auditável)</h3>
      <div class="report-grid">
        <div class="report-card">
          <p>Saldo Calculado (Sistema)</p>
          <div class="report-value">{{ formatCurrency(cur.balance) }}</div>
          <div class="report-change neutral">Base: transações em caixa (sem crédito e sem transferência)</div>
        </div>
        <div class="report-card">
          <p>Saldo do Extrato (Informado)</p>
          <input
            v-model="statementBalanceInput"
            type="number"
            step="0.01"
            placeholder="Ex: 322.53"
            style="width:100%;margin-top:.35rem;background:var(--surface-alt);border:1px solid var(--border);color:var(--text);border-radius:8px;padding:.5rem .65rem"
          />
          <div class="report-change neutral">Valor opcional para fechamento bancário do mês.</div>
        </div>
        <div class="report-card">
          <p>Divergência de Fechamento</p>
          <div class="report-value" :class="statementDiffClass">
            {{ statementDiff === null ? '—' : formatCurrency(statementDiff) }}
          </div>
          <div class="report-change" :class="statementDiffClass">
            {{ statementDiffMessage }}
          </div>
        </div>
      </div>

      <template v-if="divergenceItems.length">
        <div class="report-category-list" style="margin-top:.75rem">
          <div v-for="item in divergenceItems" :key="item.id" class="report-category-row">
            <span>{{ item.label }}</span>
            <span class="report-change down">{{ item.count }}</span>
          </div>
        </div>
      </template>
      <p v-else class="empty-state" style="margin-top:.75rem">Sem divergências estruturais detectadas neste mês.</p>

      <!-- Category Breakdown -->
      <template v-if="sortedCats.length">
        <h3 class="section-title">Despesas por Categoria</h3>
        <div class="report-category-list">
          <div v-for="[cat, amount] in sortedCats" :key="cat" class="report-category-row">
            <span>{{ cat }}</span>
            <span>
              {{ formatCurrency(amount) }}
              <span class="report-change" :class="catChange(cat).cls">{{ arrow(catChange(cat).cls) }} {{ Math.abs(catChange(cat).pct).toFixed(0) }}%</span>
              <small style="color:var(--text-muted)">vs {{ formatCurrency(prevCats[cat] || 0) }}</small>
            </span>
          </div>
        </div>
      </template>
    </article></section>

    <!-- Patrimônio Evolution -->
    <section class="panel-grid"><article class="panel panel-large">
      <header class="panel-head"><h2>Evolução Patrimonial (12 meses)</h2></header>
      <div class="chart-wrap"><canvas ref="patrimonioCanvas"></canvas></div>
    </article></section>

    <!-- Comparative Mode -->
    <section class="panel-grid"><article class="panel panel-large">
      <header class="panel-head">
        <h2>Modo Comparativo</h2>
        <input type="month" v-model="compareMonth" style="background:var(--surface-alt);border:1px solid var(--border);color:var(--text);border-radius:6px;padding:0.25rem 0.5rem" />
      </header>
      <template v-if="compareMonth && /^\d{4}-\d{2}$/.test(compareMonth)">
        <div class="compare-grid">
          <div class="compare-col">
            <h4>{{ formatMonthLabel(app.currentMonth) }}</h4>
            <div class="report-grid">
              <div class="report-card"><p>Receitas</p><div class="report-value positive">{{ formatCurrency(cmpCur.income) }}</div></div>
              <div class="report-card"><p>Despesas</p><div class="report-value negative">{{ formatCurrency(cmpCur.expense) }}</div></div>
              <div class="report-card"><p>Investimentos</p><div class="report-value warning">{{ formatCurrency(cmpCur.investment) }}</div></div>
              <div class="report-card"><p>Total Saídas</p><div class="report-value negative">{{ formatCurrency(cmpCur.totalOut) }}</div></div>
              <div class="report-card"><p>Saldo</p><div class="report-value">{{ formatCurrency(cmpCur.balance) }}</div></div>
              <div class="report-card"><p>Cartão de Crédito</p><div class="report-value warning">{{ formatCurrency(cmpCur.creditCard) }}</div></div>
            </div>
            <p style="margin-top:.5rem;font-size:.82rem;color:var(--text-muted)">{{ cmpCurAll.length }} transações totais ({{ cmpCurCash.length }} em caixa)</p>
          </div>
          <div class="compare-col">
            <h4>{{ formatMonthLabel(compareMonth) }}</h4>
            <div class="report-grid">
              <div class="report-card"><p>Receitas</p><div class="report-value positive">{{ formatCurrency(cmpOther.income) }}</div></div>
              <div class="report-card"><p>Despesas</p><div class="report-value negative">{{ formatCurrency(cmpOther.expense) }}</div></div>
              <div class="report-card"><p>Investimentos</p><div class="report-value warning">{{ formatCurrency(cmpOther.investment) }}</div></div>
              <div class="report-card"><p>Total Saídas</p><div class="report-value negative">{{ formatCurrency(cmpOther.totalOut) }}</div></div>
              <div class="report-card"><p>Saldo</p><div class="report-value">{{ formatCurrency(cmpOther.balance) }}</div></div>
              <div class="report-card"><p>Cartão de Crédito</p><div class="report-value warning">{{ formatCurrency(cmpOther.creditCard) }}</div></div>
            </div>
            <p style="margin-top:.5rem;font-size:.82rem;color:var(--text-muted)">{{ cmpOtherAll.length }} transações totais ({{ cmpOtherCash.length }} em caixa)</p>
          </div>
        </div>
        <!-- Delta cards -->
        <div class="report-grid" style="margin-top:1rem">
          <div class="report-card"><p>Δ Receitas</p><div class="report-value">{{ formatCurrency(cmpCur.income - cmpOther.income) }}</div><span class="report-change" :class="diffCls(cmpCur.income, cmpOther.income)" v-html="diffBadge(cmpCur.income, cmpOther.income)"></span></div>
          <div class="report-card"><p>Δ Despesas</p><div class="report-value">{{ formatCurrency(cmpCur.expense - cmpOther.expense) }}</div><span class="report-change" :class="diffCls(cmpCur.expense, cmpOther.expense)" v-html="diffBadge(cmpCur.expense, cmpOther.expense)"></span></div>
          <div class="report-card"><p>Δ Investimentos</p><div class="report-value">{{ formatCurrency(cmpCur.investment - cmpOther.investment) }}</div><span class="report-change" :class="diffCls(cmpCur.investment, cmpOther.investment)" v-html="diffBadge(cmpCur.investment, cmpOther.investment)"></span></div>
          <div class="report-card"><p>Δ Total Saídas</p><div class="report-value">{{ formatCurrency(cmpCur.totalOut - cmpOther.totalOut) }}</div><span class="report-change" :class="diffCls(cmpCur.totalOut, cmpOther.totalOut)" v-html="diffBadge(cmpCur.totalOut, cmpOther.totalOut)"></span></div>
          <div class="report-card"><p>Δ Cartão de Crédito</p><div class="report-value">{{ formatCurrency(cmpCur.creditCard - cmpOther.creditCard) }}</div><span class="report-change" :class="diffCls(cmpCur.creditCard, cmpOther.creditCard)" v-html="diffBadge(cmpCur.creditCard, cmpOther.creditCard)"></span></div>
        </div>
      </template>
      <p v-else class="empty-state">Selecione um mês para comparar.</p>
    </article></section>
  </div>
</template>

<script setup>
import { ref, computed, watch, onMounted, nextTick } from 'vue'
import { useDataStore } from '../stores/data.js'
import { useAppStore } from '../stores/app.js'
import {
  formatCurrency, round2, getMonthShift, getMonthSequence,
  getMonthlyTransactions, sumByType, formatMonthLabel, getChartTheme,
  withAlpha, getYAxisConfig, formatAxisValue, getClosingCash, getInvestmentStats,
  isCashAffectingTransaction, isTransferLikeTransaction, normalizeTransferDirection, normalizeString,
} from '../helpers.js'

const data = useDataStore()
const app = useAppStore()

function isCashForKpi(t) {
  return isCashAffectingTransaction(t, {
    excludeInternalTransfers: app.neutralizeInternalTransfersInKpis === true,
  })
}

function kpiCashOptions() {
  return { excludeInternalTransfers: app.neutralizeInternalTransfersInKpis === true }
}

const reportPanel = ref(null)
const patrimonioCanvas = ref(null)
let patrimonioChart = null
const compareMonth = ref('')
const statementBalanceInput = ref('')

function statementBalanceKey(month) {
  return `gofund_statement_balance_${month}`
}

function loadStatementBalance(month) {
  try {
    return localStorage.getItem(statementBalanceKey(month)) || ''
  } catch {
    return ''
  }
}

function saveStatementBalance(month, value) {
  try {
    if (!normalizeString(value)) {
      localStorage.removeItem(statementBalanceKey(month))
    } else {
      localStorage.setItem(statementBalanceKey(month), String(value))
    }
  } catch {
    // ignore storage errors
  }
}

// ── Monthly Report KPIs ──────────────────────
function changeInfo(cur, prev) {
  if (prev === 0) return { pct: cur > 0 ? 100 : 0, cls: cur > 0 ? 'up' : 'neutral' }
  const pct = ((cur - prev) / prev) * 100
  return { pct: round2(pct), cls: pct > 1 ? 'up' : pct < -1 ? 'down' : 'neutral' }
}
function arrow(cls) { return cls === 'up' ? '↑' : cls === 'down' ? '↓' : '→' }

const curTxAll = computed(() => getMonthlyTransactions(data.transactions, app.currentMonth))
const prevTxAll = computed(() => getMonthlyTransactions(data.transactions, getMonthShift(app.currentMonth, -1)))
const curTx = computed(() => curTxAll.value.filter(isCashForKpi))
const prevTx = computed(() => prevTxAll.value.filter(isCashForKpi))

const cur = computed(() => {
  const income = sumByType(curTx.value, 'receita')
  const expense = sumByType(curTx.value, 'despesa')
  const investment = sumByType(curTx.value, 'investimento')
  const totalOut = round2(expense + investment)
  const creditCard = curTxAll.value.filter(t => t.method === 'credito' && t.type === 'despesa').reduce((s, t) => s + t.amount, 0)
  return { income, expense, investment, totalOut, creditCard, balance: getClosingCash(data.transactions, app.currentMonth, kpiCashOptions()) }
})

const prev = computed(() => {
  const income = sumByType(prevTx.value, 'receita')
  const expense = sumByType(prevTx.value, 'despesa')
  const investment = sumByType(prevTx.value, 'investimento')
  const totalOut = round2(expense + investment)
  const prevMonth = getMonthShift(app.currentMonth, -1)
  const creditCard = prevTxAll.value.filter(t => t.method === 'credito' && t.type === 'despesa').reduce((s, t) => s + t.amount, 0)
  return { income, expense, investment, totalOut, creditCard, balance: getClosingCash(data.transactions, prevMonth, kpiCashOptions()) }
})

const incChange = computed(() => changeInfo(cur.value.income, prev.value.income))
const expChange = computed(() => changeInfo(cur.value.expense, prev.value.expense))
const invChange = computed(() => changeInfo(cur.value.investment, prev.value.investment))
const ccChange = computed(() => changeInfo(cur.value.creditCard, prev.value.creditCard))
const totOutChange = computed(() => changeInfo(cur.value.totalOut, prev.value.totalOut))
const balChange = computed(() => changeInfo(cur.value.balance, prev.value.balance))

// Invert for expense/credit/totalOut (increase is bad)
const expChangeInverted = computed(() => expChange.value.cls === 'up' ? 'down' : expChange.value.cls === 'down' ? 'up' : 'neutral')
const ccChangeInverted = computed(() => ccChange.value.cls === 'up' ? 'down' : ccChange.value.cls === 'down' ? 'up' : 'neutral')
const totOutChangeInverted = computed(() => totOutChange.value.cls === 'up' ? 'down' : totOutChange.value.cls === 'down' ? 'up' : 'neutral')

const statementBalance = computed(() => {
  const raw = normalizeString(statementBalanceInput.value).replace(',', '.')
  if (!raw) return null
  const value = Number(raw)
  return Number.isFinite(value) ? value : null
})
const statementDiff = computed(() => {
  if (statementBalance.value === null) return null
  return round2(statementBalance.value - cur.value.balance)
})
const statementDiffClass = computed(() => {
  if (statementDiff.value === null) return 'neutral'
  if (Math.abs(statementDiff.value) < 0.01) return 'up'
  return statementDiff.value > 0 ? 'up' : 'down'
})
const statementDiffMessage = computed(() => {
  if (statementDiff.value === null) return 'Informe o saldo do extrato para calcular a divergência.'
  if (Math.abs(statementDiff.value) < 0.01) return 'Fechamento conciliado (diferença zero).'
  return 'Diferença entre saldo do banco e saldo calculado pelo sistema.'
})

const transferMonthRows = computed(() => curTxAll.value.filter(isTransferLikeTransaction))
const divergenceItems = computed(() => {
  const rows = transferMonthRows.value
  const withoutDirection = rows.filter(t => normalizeTransferDirection(t.transferDirection || t.transfer_direction) === '').length
  const withoutLink = rows.filter(t => {
    const from = normalizeString(t.transferFromAccountId || t.transfer_from_account_id || '')
    const to = normalizeString(t.transferToAccountId || t.transfer_to_account_id || '')
    return !from && !to && !normalizeString(t.accountId || '')
  }).length
  const legacyType = rows.filter(t => normalizeString(t.type).toLowerCase() !== 'transferencia').length

  return [
    { id: 'missing-direction', label: 'Transferências sem direção (in/out)', count: withoutDirection },
    { id: 'missing-account-link', label: 'Transferências sem vínculo de conta (origem/destino)', count: withoutLink },
    { id: 'legacy-type', label: 'Transferências em tipo legado (receita/despesa)', count: legacyType },
  ].filter(item => item.count > 0)
})

// Category breakdown
const curCats = computed(() => {
  const cats = {}
  curTx.value.filter(t => t.type === 'despesa').forEach(t => { cats[t.category] = (cats[t.category] || 0) + t.amount })
  return cats
})
const prevCats = computed(() => {
  const cats = {}
  prevTx.value.filter(t => t.type === 'despesa').forEach(t => { cats[t.category] = (cats[t.category] || 0) + t.amount })
  return cats
})
const sortedCats = computed(() => {
  const allKeys = new Set([...Object.keys(curCats.value), ...Object.keys(prevCats.value)])
  return [...allKeys].sort((a, b) => (curCats.value[b] || 0) - (curCats.value[a] || 0)).map(c => [c, curCats.value[c] || 0])
})
function catChange(cat) { return changeInfo(curCats.value[cat] || 0, prevCats.value[cat] || 0) }

// ── Patrimônio Chart ─────────────────────────
function renderPatrimonioChart() {
  if (!patrimonioCanvas.value || typeof Chart === 'undefined') return
  if (patrimonioChart) patrimonioChart.destroy()
  const theme = getChartTheme()
  const months = getMonthSequence(app.currentMonth, -11, 0)
  const labels = months.map(formatMonthLabel)
  const invStats = getInvestmentStats(data.transactions)
  const chartData = months.map(m => round2(getClosingCash(data.transactions, m, kpiCashOptions()) + invStats.totalInvested))
  patrimonioChart = new Chart(patrimonioCanvas.value, {
    type: 'line',
    data: {
      labels,
      datasets: [{
        label: 'Patrimônio Líquido',
        data: chartData,
        borderColor: theme.actualColor,
        backgroundColor: withAlpha(theme.actualColor, 0.12),
        fill: true, tension: 0.35, pointRadius: 3, pointHoverRadius: 6,
      }],
    },
    options: {
      responsive: true, maintainAspectRatio: false,
      plugins: { legend: { display: false } },
      scales: {
        x: { ticks: { color: theme.labelColor, font: { size: 11 } }, grid: { display: false } },
        y: { ticks: { color: theme.labelColor, callback: v => formatAxisValue(v) }, grid: { color: theme.gridColor } },
      },
    },
  })
}

// ── Comparative Mode ─────────────────────────
function buildSums(month) {
  const all = getMonthlyTransactions(data.transactions, month)
  const cash = all.filter(isCashForKpi)
  const income = sumByType(cash, 'receita')
  const expense = sumByType(cash, 'despesa')
  const investment = sumByType(cash, 'investimento')
  const totalOut = round2(expense + investment)
  const creditCard = all.filter(t => t.method === 'credito' && t.type === 'despesa').reduce((s, t) => s + t.amount, 0)
  const balance = getClosingCash(data.transactions, month, kpiCashOptions())
  return { income, expense, investment, totalOut, creditCard, balance, all, cash }
}

const cmpCurData = computed(() => buildSums(app.currentMonth))
const cmpOtherData = computed(() => compareMonth.value ? buildSums(compareMonth.value) : { income: 0, expense: 0, investment: 0, creditCard: 0, balance: 0, all: [], cash: [] })
const cmpCur = computed(() => ({ income: cmpCurData.value.income, expense: cmpCurData.value.expense, investment: cmpCurData.value.investment, totalOut: cmpCurData.value.totalOut, creditCard: cmpCurData.value.creditCard, balance: cmpCurData.value.balance }))
const cmpOther = computed(() => ({ income: cmpOtherData.value.income, expense: cmpOtherData.value.expense, investment: cmpOtherData.value.investment, totalOut: cmpOtherData.value.totalOut, creditCard: cmpOtherData.value.creditCard, balance: cmpOtherData.value.balance }))
const cmpCurAll = computed(() => cmpCurData.value.all)
const cmpCurCash = computed(() => cmpCurData.value.cash)
const cmpOtherAll = computed(() => cmpOtherData.value.all)
const cmpOtherCash = computed(() => cmpOtherData.value.cash)

function diffBadge(a, b) {
  if (b === 0) return ''
  const pct = (((a - b) / Math.abs(b)) * 100).toFixed(1)
  return `${Number(pct) > 0 ? '+' : ''}${pct}%`
}
function diffCls(a, b) {
  if (b === 0) return 'neutral'
  const pct = ((a - b) / Math.abs(b)) * 100
  return pct > 0 ? 'up' : pct < 0 ? 'down' : 'neutral'
}

// ── PDF Export ────────────────────────────────
async function exportPdf() {
  if (typeof jspdf === 'undefined') {
    app.showMessage('Biblioteca jsPDF não carregada. Recarregue a página.', 'error')
    return
  }
  try {
    const pdf = new jspdf.jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' })
    const W = pdf.internal.pageSize.getWidth()
    const H = pdf.internal.pageSize.getHeight()
    const margin = 14
    const contentW = W - margin * 2
    let y = margin

    // Colors
    const dark = [14, 19, 34]
    const surface = [22, 27, 34]
    const cardBg = [33, 38, 45]
    const border = [48, 54, 61]
    const textPrimary = [230, 237, 243]
    const textMuted = [139, 148, 158]
    const green = [16, 216, 132]
    const red = [248, 81, 73]
    const orange = [255, 166, 87]
    const purple = [158, 139, 255]
    const blue = [94, 127, 255]

    // Helper: check page overflow
    function checkPage(needed) {
      if (y + needed > H - margin) {
        pdf.addPage()
        // Page bg
        pdf.setFillColor(...dark)
        pdf.rect(0, 0, W, H, 'F')
        y = margin
      }
    }

    // Page background
    pdf.setFillColor(...dark)
    pdf.rect(0, 0, W, H, 'F')

    // ── Header ──
    pdf.setFontSize(18)
    pdf.setFont('helvetica', 'bold')
    pdf.setTextColor(...purple)
    pdf.text('GoFund', margin, y + 6)
    pdf.setFontSize(10)
    pdf.setFont('helvetica', 'normal')
    pdf.setTextColor(...textMuted)
    const monthLabel = formatMonthLabel(app.currentMonth)
    pdf.text(`Relatório Financeiro - ${monthLabel}`, margin + 30, y + 6)
    y += 14

    // Separator line
    pdf.setDrawColor(...border)
    pdf.setLineWidth(0.3)
    pdf.line(margin, y, W - margin, y)
    y += 8

    // ── KPI Cards ──
    const kpis = [
      { label: 'Receitas', value: formatCurrency(cur.value.income), color: green, change: incChange.value },
      { label: 'Despesas', value: formatCurrency(cur.value.expense), color: red, change: expChange.value },
      { label: 'Investimentos', value: formatCurrency(cur.value.investment), color: orange, change: invChange.value },
      { label: 'Total de Saídas', value: formatCurrency(cur.value.totalOut), color: red, change: totOutChange.value },
      { label: 'Cartão de Crédito', value: formatCurrency(cur.value.creditCard), color: purple, change: ccChange.value },
      { label: 'Saldo Líquido', value: formatCurrency(cur.value.balance), color: cur.value.balance >= 0 ? green : red, change: balChange.value },
    ]

    const cardW = (contentW - 8) / 3
    const cardH = 22
    const cardGap = 4

    kpis.forEach((kpi, i) => {
      const col = i % 3
      const row = Math.floor(i / 3)
      if (col === 0 && row > 0) y += cardH + cardGap
      if (col === 0) checkPage(cardH + 4)
      const cx = margin + col * (cardW + cardGap)
      const cy = y

      // Card background
      pdf.setFillColor(...cardBg)
      pdf.roundedRect(cx, cy, cardW, cardH, 2, 2, 'F')

      // Label
      pdf.setFontSize(7)
      pdf.setFont('helvetica', 'normal')
      pdf.setTextColor(...textMuted)
      pdf.text(kpi.label.toUpperCase(), cx + 4, cy + 6)

      // Value
      pdf.setFontSize(11)
      pdf.setFont('helvetica', 'bold')
      pdf.setTextColor(...kpi.color)
      pdf.text(kpi.value, cx + 4, cy + 14)

      // Change
      const chSign = kpi.change.cls === 'up' ? '+' : kpi.change.cls === 'down' ? '-' : '='
      const chColor = kpi.change.cls === 'up' ? green : kpi.change.cls === 'down' ? red : textMuted
      pdf.setFontSize(7)
      pdf.setFont('helvetica', 'normal')
      pdf.setTextColor(...chColor)
      pdf.text(`${chSign} ${Math.abs(kpi.change.pct).toFixed(1)}% vs mês anterior`, cx + 4, cy + 19)
    })
    y += cardH + 10

    // ── Despesas por Categoria ──
    if (sortedCats.value.length) {
      checkPage(20)
      pdf.setFontSize(12)
      pdf.setFont('helvetica', 'bold')
      pdf.setTextColor(...textPrimary)
      pdf.text('Despesas por Categoria', margin, y)
      y += 7

      // Table header
      const colCat = margin
      const colVal = margin + contentW * 0.5
      const colChg = margin + contentW * 0.75
      const colPrev = margin + contentW * 0.88

      checkPage(8)
      pdf.setFillColor(...cardBg)
      pdf.rect(margin, y - 3, contentW, 7, 'F')
      pdf.setFontSize(7)
      pdf.setFont('helvetica', 'bold')
      pdf.setTextColor(...textMuted)
      pdf.text('CATEGORIA', colCat + 3, y + 1)
      pdf.text('VALOR', colVal, y + 1)
      pdf.text('VARIAÇÃO', colChg, y + 1)
      pdf.text('MÊS ANT.', colPrev, y + 1)
      y += 7

      sortedCats.value.forEach(([cat, amount]) => {
        checkPage(7)
        // Subtle row border
        pdf.setDrawColor(...border)
        pdf.setLineWidth(0.15)
        pdf.line(margin, y + 3.5, W - margin, y + 3.5)

        pdf.setFontSize(8.5)
        pdf.setFont('helvetica', 'normal')
        pdf.setTextColor(...textPrimary)
        pdf.text(cat, colCat + 3, y + 2)

        pdf.setTextColor(...red)
        pdf.text(formatCurrency(amount), colVal, y + 2)

        const ch = catChange(cat)
        const chSign = ch.cls === 'up' ? '+' : ch.cls === 'down' ? '-' : '='
        const chColor = ch.cls === 'up' ? red : ch.cls === 'down' ? green : textMuted
        pdf.setTextColor(...chColor)
        pdf.setFontSize(7.5)
        pdf.text(`${chSign} ${Math.abs(ch.pct).toFixed(0)}%`, colChg, y + 2)

        pdf.setTextColor(...textMuted)
        pdf.text(formatCurrency(prevCats.value[cat] || 0), colPrev, y + 2)
        y += 7
      })
      y += 6
    }

    // ── Detailed Transactions ──
    checkPage(20)
    pdf.setFontSize(12)
    pdf.setFont('helvetica', 'bold')
    pdf.setTextColor(...textPrimary)
    pdf.text('Movimentações Detalhadas', margin, y)
    y += 3

    // Summary count
    const txAll = curTxAll.value
    const txCash = curTx.value
    pdf.setFontSize(8)
    pdf.setFont('helvetica', 'normal')
    pdf.setTextColor(...textMuted)
    pdf.text(`${txAll.length} transações no mês (${txCash.length} em caixa, ${txAll.length - txCash.length} excluídas por crédito/transferência)`, margin, y + 4)
    y += 9

    // Transaction table header
    const tColDate = margin
    const tColDesc = margin + 22
    const tColCat = margin + contentW * 0.48
    const tColMethod = margin + contentW * 0.68
    const tColAmount = margin + contentW * 0.82

    checkPage(8)
    pdf.setFillColor(...cardBg)
    pdf.rect(margin, y - 3, contentW, 7, 'F')
    pdf.setFontSize(6.5)
    pdf.setFont('helvetica', 'bold')
    pdf.setTextColor(...textMuted)
    pdf.text('DATA', tColDate + 2, y + 1)
    pdf.text('DESCRIÇÃO', tColDesc, y + 1)
    pdf.text('CATEGORIA', tColCat, y + 1)
    pdf.text('MÉTODO', tColMethod, y + 1)
    pdf.text('VALOR', tColAmount, y + 1)
    y += 7

    // Sort transactions by date
    const sortedTx = [...txAll].sort((a, b) => a.date.localeCompare(b.date))

    // Method labels
    const methodLabels = { pix: 'Pix', debito: 'Débito', credito: 'Crédito', boleto: 'Boleto', dinheiro: 'Dinheiro', transferencia: 'TED/DOC' }

    // Type colors
    const typeColors = { receita: green, despesa: red, investimento: orange, transferencia: blue }

    sortedTx.forEach(t => {
      checkPage(6.5)

      // Zebra / row border
      pdf.setDrawColor(...border)
      pdf.setLineWidth(0.1)
      pdf.line(margin, y + 2.5, W - margin, y + 2.5)

      // Date
      pdf.setFontSize(7.5)
      pdf.setFont('helvetica', 'normal')
      pdf.setTextColor(...textMuted)
      const [ty, tm, td] = t.date.split('-')
      pdf.text(`${td}/${tm}`, tColDate + 2, y + 1)

      // Description (truncate if too long)
      pdf.setTextColor(...textPrimary)
      let desc = t.description || '-'
      // Add installment info
      if (t.installments > 1) desc += ` (parc.)`
      if (t.recurrence === 'monthly') desc += ' (rec)'
      const maxDescW = tColCat - tColDesc - 3
      pdf.setFontSize(7.5)
      while (pdf.getTextWidth(desc) > maxDescW && desc.length > 5) {
        desc = desc.slice(0, -4) + '...'
      }
      pdf.text(desc, tColDesc, y + 1)

      // Category
      pdf.setFontSize(7)
      pdf.setTextColor(...textMuted)
      let catText = t.category || '-'
      const maxCatW = tColMethod - tColCat - 2
      while (pdf.getTextWidth(catText) > maxCatW && catText.length > 3) {
        catText = catText.slice(0, -4) + '...'
      }
      pdf.text(catText, tColCat, y + 1)

      // Method
      pdf.text(methodLabels[t.method] || t.method || '-', tColMethod, y + 1)

      // Amount
      const color = typeColors[t.type] || textPrimary
      pdf.setTextColor(...color)
      pdf.setFontSize(7.5)
      pdf.setFont('helvetica', 'bold')
      const sign = t.type === 'receita' ? '+' : t.type === 'transferencia' ? '' : '-'
      pdf.text(`${sign}${formatCurrency(t.amount)}`, tColAmount, y + 1)

      y += 5.5
    })

    y += 8

    // ── Totals Summary ──
    checkPage(30)
    pdf.setDrawColor(...border)
    pdf.setLineWidth(0.3)
    pdf.line(margin, y, W - margin, y)
    y += 6

    pdf.setFontSize(9)
    pdf.setFont('helvetica', 'bold')
    pdf.setTextColor(...textPrimary)
    pdf.text('Resumo', margin, y)
    y += 6

    const summaryItems = [
      { label: 'Total Receitas', value: formatCurrency(cur.value.income), color: green },
      { label: 'Total Despesas', value: formatCurrency(cur.value.expense), color: red },
      { label: 'Total Investimentos', value: formatCurrency(cur.value.investment), color: orange },
      { label: 'Total Cartão de Crédito', value: formatCurrency(cur.value.creditCard), color: purple },
      { label: 'Saldo Líquido', value: formatCurrency(cur.value.balance), color: cur.value.balance >= 0 ? green : red },
      { label: 'Patrimônio Líquido', value: formatCurrency(data.netWorth), color: data.netWorth >= 0 ? green : red },
    ]

    summaryItems.forEach(item => {
      checkPage(7)
      pdf.setFontSize(8)
      pdf.setFont('helvetica', 'normal')
      pdf.setTextColor(...textMuted)
      pdf.text(item.label, margin + 3, y)

      pdf.setFont('helvetica', 'bold')
      pdf.setTextColor(...item.color)
      pdf.text(item.value, margin + contentW * 0.55, y)
      y += 5.5
    })

    y += 8

    // ── Footer ──
    checkPage(10)
    pdf.setDrawColor(...border)
    pdf.setLineWidth(0.2)
    pdf.line(margin, y, W - margin, y)
    y += 5
    pdf.setFontSize(7)
    pdf.setFont('helvetica', 'normal')
    pdf.setTextColor(...textMuted)
    pdf.text('GoFund - Gestão Financeira Profissional', margin, y)
    pdf.text(`Gerado em ${new Date().toLocaleDateString('pt-BR')} às ${new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}`, W - margin, y, { align: 'right' })

    pdf.save(`relatorio-${app.currentMonth}.pdf`)
    app.showMessage(`PDF salvo como relatorio-${app.currentMonth}.pdf`, 'success')
  } catch (err) {
    app.showMessage(`Erro ao gerar PDF: ${err.message || err}`, 'error')
  }
}

watch(() => app.currentMonth, month => {
  statementBalanceInput.value = loadStatementBalance(month)
}, { immediate: true })

watch(statementBalanceInput, value => {
  saveStatementBalance(app.currentMonth, value)
})

watch(() => [app.currentMonth, data.transactions.length], () => nextTick(renderPatrimonioChart), { deep: true })
onMounted(() => nextTick(renderPatrimonioChart))
</script>
