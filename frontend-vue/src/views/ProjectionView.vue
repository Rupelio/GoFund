<template>
  <div>
    <section class="panel-grid"><article class="panel panel-large">
      <header class="panel-head"><h2>Projeção Financeira</h2></header>
      <div class="info-banner" style="margin-bottom: 1rem;">
        <p><strong><i class="fa-solid fa-chart-line"></i> Projeção de Patrimônio</strong></p>
        <p>Simule seu patrimônio futuro com base nas suas médias de receitas, despesas e investimentos.</p>
        <p><strong>Valores "auto":</strong> O sistema calcula automaticamente as médias dos últimos 3 meses.</p>
        <p><strong>Valores personalizados:</strong> Informe valores manualmente para cenários específicos.</p>
      </div>
      <form class="projection-form" @submit.prevent="handleSubmit">
        <label>Meses<input v-model.number="form.months" type="number" min="1" max="24" required /></label>
        <label>Receita<input v-model.number="form.income" type="number" min="0" step="0.01" placeholder="auto" /></label>
        <label>Despesa<input v-model.number="form.expense" type="number" min="0" step="0.01" placeholder="auto" /></label>
        <label>Investimento<input v-model.number="form.investment" type="number" min="0" step="0.01" placeholder="auto" /></label>
        <button class="btn ghost tiny" type="submit">Recalcular</button>
      </form>

      <!-- Projection Summary — uses legacy .projection-summary + .summary-pill -->
      <div v-if="model" class="projection-summary">
        <article class="summary-pill">
          <p>Saldo de caixa atual</p>
          <strong>{{ formatCurrency(model.currentCash) }}</strong>
        </article>
        <article class="summary-pill">
          <p>Receita mensal esperada</p>
          <strong>{{ formatCurrency(model.expectedIncome) }}</strong>
        </article>
        <article class="summary-pill">
          <p>Saída mensal esperada</p>
          <strong>{{ formatCurrency(outflow) }}</strong>
        </article>
        <article class="summary-pill">
          <p>{{ model.expectedNet >= 0 ? 'Crescimento mensal esperado' : 'Redução mensal esperada' }}</p>
          <strong>{{ formatCurrency(model.expectedNet) }}</strong>
        </article>
        <article class="summary-pill">
          <p>Caixa projetado em {{ horizonLabel }}</p>
          <strong>{{ formatCurrency(model.projectedEndCash) }}</strong>
        </article>

        <!-- Investment yield pills (only if there's invested capital) -->
        <template v-if="model.investedCapital > 0 && model.avgYieldRate > 0">
          <article class="summary-pill">
            <p>Patrimônio investido</p>
            <strong class="warning">{{ formatCurrency(model.investedCapital) }}</strong>
          </article>
          <article class="summary-pill">
            <p>Rend. mensal estimado</p>
            <strong class="positive">{{ formatCurrency(model.estimatedMonthlyYield) }} ({{ model.avgYieldRate.toFixed(2) }}%)</strong>
          </article>
          <article class="summary-pill">
            <p>Rendimentos acum. ({{ model.futureMonths.length }}m)</p>
            <strong class="positive">{{ formatCurrency(model.totalProjectedYields) }}</strong>
          </article>
          <article class="summary-pill">
            <p>Patrimônio projetado em {{ horizonLabel }}</p>
            <strong>{{ formatCurrency(model.projectedEndPatrimonio) }}</strong>
          </article>
        </template>
        <template v-else-if="model.investedCapital > 0">
          <article class="summary-pill">
            <p>Patrimônio investido</p>
            <strong class="warning">{{ formatCurrency(model.investedCapital) }}</strong>
          </article>
          <article class="summary-pill">
            <p>Rend. mensal estimado</p>
            <strong>Defina rendimentos na carteira</strong>
          </article>
        </template>

        <article class="summary-pill">
          <p>Base de cálculo</p>
          <strong>{{ model.basisDescription }}</strong>
        </article>
      </div>

      <!-- Chart -->
      <div class="chart-wrap" style="margin-top:1rem">
        <canvas ref="chartCanvas"></canvas>
      </div>
    </article></section>
  </div>
</template>

<script setup>
import { ref, computed, watch, onMounted, nextTick } from 'vue'
import { useDataStore } from '../stores/data.js'
import { useAppStore } from '../stores/app.js'
import { formatCurrency, formatMonthLabel, getChartTheme, withAlpha, getYAxisConfig } from '../helpers.js'

const data = useDataStore()
const app = useAppStore()
const chartCanvas = ref(null)
let chartInstance = null

const form = ref({
  months: data.projection.months || 6,
  income: data.projection.income,
  expense: data.projection.expense,
  investment: data.projection.investment,
})

const model = computed(() => {
  if (!data.transactions.length && !data.projection.months) return null
  return data.buildProjectionModel()
})

const outflow = computed(() => {
  if (!model.value) return 0
  return model.value.expectedExpense + model.value.expectedInvestment
})

const horizonLabel = computed(() => {
  if (!model.value || !model.value.futureMonths.length) return ''
  const last = model.value.futureMonths[model.value.futureMonths.length - 1] || app.currentMonth
  return formatMonthLabel(last)
})

function handleSubmit() {
  data.saveProjection({
    months: form.value.months,
    income: form.value.income || null,
    expense: form.value.expense || null,
    investment: form.value.investment || null,
  })
}

function renderChart() {
  if (!chartCanvas.value || !model.value || typeof Chart === 'undefined') return
  if (chartInstance) chartInstance.destroy()
  const m = model.value
  const theme = getChartTheme()
  const yConfig = getYAxisConfig(theme, [m.actual.filter(v => v != null), m.projected.filter(v => v != null), m.projectedPatrimonio.filter(v => v != null)])
  chartInstance = new Chart(chartCanvas.value, {
    type: 'line',
    data: {
      labels: m.labels,
      datasets: [
        {
          label: 'Caixa Real',
          data: m.actual,
          borderColor: theme.actualColor,
          backgroundColor: withAlpha(theme.actualColor, 0.1),
          fill: true, tension: 0.3, pointRadius: 3,
        },
        {
          label: 'Caixa Projetado',
          data: m.projected,
          borderColor: theme.projectedColor,
          backgroundColor: theme.projectedFill,
          borderDash: [6, 3], fill: true, tension: 0.3, pointRadius: 3,
        },
        {
          label: 'Patrimônio Projetado',
          data: m.projectedPatrimonio,
          borderColor: theme.patrimonioColor,
          backgroundColor: theme.patrimonioFill,
          borderDash: [4, 4], fill: true, tension: 0.3, pointRadius: 3,
        },
      ],
    },
    options: {
      responsive: true, maintainAspectRatio: false,
      plugins: {
        legend: { labels: { color: theme.labelColor } },
        tooltip: {
          callbacks: { label: ctx => `${ctx.dataset.label}: ${formatCurrency(ctx.parsed.y)}` },
        },
      },
      scales: {
        x: { grid: { color: theme.gridColor }, ticks: { color: theme.labelColor } },
        y: yConfig,
      },
    },
  })
}

watch(model, () => nextTick(renderChart), { deep: true })
onMounted(() => { if (model.value) nextTick(renderChart) })
</script>
