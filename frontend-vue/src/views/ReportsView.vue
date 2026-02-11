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
              <div class="report-card"><p>Saldo</p><div class="report-value">{{ formatCurrency(cmpCur.income - cmpCur.expense - cmpCur.investment) }}</div></div>
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
              <div class="report-card"><p>Saldo</p><div class="report-value">{{ formatCurrency(cmpOther.income - cmpOther.expense - cmpOther.investment) }}</div></div>
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
  withAlpha, getYAxisConfig, formatAxisValue, getClosingCash, getInvestmentStats, getCssVar,
} from '../helpers.js'

const data = useDataStore()
const app = useAppStore()

const reportPanel = ref(null)
const patrimonioCanvas = ref(null)
let patrimonioChart = null
const compareMonth = ref('')

// ── Monthly Report KPIs ──────────────────────
function changeInfo(cur, prev) {
  if (prev === 0) return { pct: cur > 0 ? 100 : 0, cls: cur > 0 ? 'up' : 'neutral' }
  const pct = ((cur - prev) / prev) * 100
  return { pct: round2(pct), cls: pct > 1 ? 'up' : pct < -1 ? 'down' : 'neutral' }
}
function arrow(cls) { return cls === 'up' ? '↑' : cls === 'down' ? '↓' : '→' }

const curTxAll = computed(() => getMonthlyTransactions(data.transactions, app.currentMonth))
const prevTxAll = computed(() => getMonthlyTransactions(data.transactions, getMonthShift(app.currentMonth, -1)))
const curTx = computed(() => curTxAll.value.filter(t => t.method !== 'credito'))
const prevTx = computed(() => prevTxAll.value.filter(t => t.method !== 'credito'))

const cur = computed(() => {
  const income = sumByType(curTx.value, 'receita')
  const expense = sumByType(curTx.value, 'despesa')
  const investment = sumByType(curTx.value, 'investimento')
  const creditCard = curTxAll.value.filter(t => t.method === 'credito' && t.type === 'despesa').reduce((s, t) => s + t.amount, 0)
  return { income, expense, investment, creditCard, balance: income - expense - investment }
})

const prev = computed(() => {
  const income = sumByType(prevTx.value, 'receita')
  const expense = sumByType(prevTx.value, 'despesa')
  const investment = sumByType(prevTx.value, 'investimento')
  const creditCard = prevTxAll.value.filter(t => t.method === 'credito' && t.type === 'despesa').reduce((s, t) => s + t.amount, 0)
  return { income, expense, investment, creditCard, balance: income - expense - investment }
})

const incChange = computed(() => changeInfo(cur.value.income, prev.value.income))
const expChange = computed(() => changeInfo(cur.value.expense, prev.value.expense))
const invChange = computed(() => changeInfo(cur.value.investment, prev.value.investment))
const ccChange = computed(() => changeInfo(cur.value.creditCard, prev.value.creditCard))
const balChange = computed(() => changeInfo(cur.value.balance, prev.value.balance))

// Invert for expense/credit (increase is bad)
const expChangeInverted = computed(() => expChange.value.cls === 'up' ? 'down' : expChange.value.cls === 'down' ? 'up' : 'neutral')
const ccChangeInverted = computed(() => ccChange.value.cls === 'up' ? 'down' : ccChange.value.cls === 'down' ? 'up' : 'neutral')

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
  const chartData = months.map(m => round2(getClosingCash(data.transactions, m) + invStats.totalInvested))
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
  const cash = all.filter(t => t.method !== 'credito')
  const income = sumByType(cash, 'receita')
  const expense = sumByType(cash, 'despesa')
  const investment = sumByType(cash, 'investimento')
  const creditCard = all.filter(t => t.method === 'credito' && t.type === 'despesa').reduce((s, t) => s + t.amount, 0)
  return { income, expense, investment, creditCard, all, cash }
}

const cmpCurData = computed(() => buildSums(app.currentMonth))
const cmpOtherData = computed(() => compareMonth.value ? buildSums(compareMonth.value) : { income: 0, expense: 0, investment: 0, creditCard: 0, all: [], cash: [] })
const cmpCur = computed(() => ({ income: cmpCurData.value.income, expense: cmpCurData.value.expense, investment: cmpCurData.value.investment, creditCard: cmpCurData.value.creditCard }))
const cmpOther = computed(() => ({ income: cmpOtherData.value.income, expense: cmpOtherData.value.expense, investment: cmpOtherData.value.investment, creditCard: cmpOtherData.value.creditCard }))
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
  if (typeof html2canvas === 'undefined' || typeof jspdf === 'undefined') {
    app.showMessage('Bibliotecas de PDF não carregadas. Recarregue a página.', 'error')
    return
  }
  try {
    const target = reportPanel.value
    if (!target) { app.showMessage('Painel de relatório não encontrado.', 'error'); return }
    const canvas = await html2canvas(target, {
      scale: 2,
      backgroundColor: getCssVar('--surface') || '#0e1322',
      useCORS: true,
      scrollY: -window.scrollY,
    })
    const imgData = canvas.toDataURL('image/png')
    const pdf = new jspdf.jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' })
    const pageW = pdf.internal.pageSize.getWidth()
    const pageH = pdf.internal.pageSize.getHeight()
    const margin = 10
    const imgW = pageW - margin * 2
    const imgH = (canvas.height * imgW) / canvas.width
    let y = margin
    const usableH = pageH - margin * 2
    if (imgH <= usableH) {
      pdf.addImage(imgData, 'PNG', margin, y, imgW, imgH)
    } else {
      let remainingH = imgH
      while (remainingH > 0) {
        pdf.addImage(imgData, 'PNG', margin, y - (imgH - remainingH), imgW, imgH)
        remainingH -= usableH
        if (remainingH > 0) { pdf.addPage(); y = margin }
      }
    }
    pdf.save(`relatorio-${app.currentMonth}.pdf`)
    app.showMessage(`PDF salvo como relatorio-${app.currentMonth}.pdf`, 'success')
  } catch (err) {
    app.showMessage(`Erro ao gerar PDF: ${err.message || err}`, 'error')
  }
}

watch(() => [app.currentMonth, data.transactions.length], () => nextTick(renderPatrimonioChart), { deep: true })
onMounted(() => nextTick(renderPatrimonioChart))
</script>
