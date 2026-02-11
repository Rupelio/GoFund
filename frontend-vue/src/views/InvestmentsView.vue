<template>
  <div>
    <section class="panel-grid"><article class="panel panel-large">
      <header class="panel-head"><h2>Carteira de Investimentos</h2></header>

      <!-- KPI grid -->
      <section class="kpi-grid" style="margin-bottom:1rem">
        <article class="kpi-card"><p>Investido este mês</p><strong class="warning">{{ formatCurrency(totalThisMonth) }}</strong></article>
        <article class="kpi-card"><p>Total investido (geral)</p><strong class="warning">{{ formatCurrency(totalAllTime) }}</strong></article>
        <article class="kpi-card"><p>Projeção 12 meses</p><strong class="positive">{{ formatCurrency(projected12) }}</strong></article>
        <article class="kpi-card"><p>Rend. médio ponderado</p><strong>{{ avgYield.toFixed(2) }}% a.m.</strong></article>
      </section>

      <!-- Empty state -->
      <template v-if="!Object.keys(groups).length">
        <div class="info-banner" style="margin-bottom: 1.5rem;">
          <p><strong><i class="fa-solid fa-chart-pie"></i> Como usar a Carteira de Investimentos</strong></p>
          <p>Esta seção acompanha automaticamente seus investimentos registrados como movimentações do tipo "Investimento".</p>
          <p><strong>Para começar:</strong> Crie uma movimentação do tipo "Investimento" na aba Movimentações.</p>
          <p><strong>Defina taxas de rendimento:</strong> Para ver projeções futuras, informe a taxa mensal esperada de cada categoria.</p>
        </div>
        <p class="empty-state">Nenhum investimento neste mês. Registre investimentos na aba Movimentações para começar a acompanhar.</p>
      </template>

      <!-- Category breakdown -->
      <template v-else>
        <div class="info-banner" style="margin-bottom: 1.5rem;">
          <p><strong><i class="fa-solid fa-chart-pie"></i> Dica:</strong> Informe a taxa de rendimento mensal esperada de cada categoria para ver projeções futuras do seu patrimônio.</p>
        </div>

        <!-- Reference rates -->
        <article class="item-card" style="border-color: var(--border-accent); margin-bottom:0.75rem">
          <h4>Referências de Mercado</h4>
          <p>CDI: ~{{ CDI_MENSAL }}% a.m. · Poupança: ~{{ POUPANCA_MENSAL }}% a.m.</p>
        </article>

        <!-- Per-category cards -->
        <article v-for="[cat, d] in sortedGroups" :key="cat" class="item-card">
          <h4>{{ cat }}</h4>
          <p>Aplicado: {{ formatCurrency(d.total) }} ({{ d.count }} operações)</p>
          <p>Rend.: <strong>{{ (yields[cat] || 0).toFixed(2) }}%</strong> a.m. · Projeção 12m: <span class="positive">{{ formatCurrency(catProjection(cat, d.total)) }}</span> ({{ catGain(cat, d.total) >= 0 ? '+' : '' }}{{ formatCurrency(catGain(cat, d.total)) }})</p>
          <form class="mini-actions" @submit.prevent="handleSetYield(cat, $event)">
            <input type="number" name="yield" min="0" max="100" step="0.01" placeholder="% mensal" :value="yields[cat] || ''" />
            <button class="mini-btn" type="submit">Definir Rend.</button>
          </form>
        </article>
      </template>
    </article></section>
  </div>
</template>

<script setup>
import { computed, reactive } from 'vue'
import { useDataStore } from '../stores/data.js'
import { useAppStore } from '../stores/app.js'
import { formatCurrency, getInvestmentYields, setInvestmentYield, getMonthlyTransactions } from '../helpers.js'

const data = useDataStore()
const app = useAppStore()

const CDI_MENSAL = 1.15
const POUPANCA_MENSAL = 0.60

// Force reactivity on yields via a counter
const yieldVersion = reactive({ v: 0 })

const yields = computed(() => {
  void yieldVersion.v
  return getInvestmentYields()
})

const groups = computed(() => {
  const monthly = getMonthlyTransactions(data.transactions, app.currentMonth)
  const investments = monthly.filter(t => t.type === 'investimento')
  const g = {}
  investments.forEach(t => {
    if (!g[t.category]) g[t.category] = { total: 0, count: 0 }
    g[t.category].total += t.amount
    g[t.category].count++
  })
  return g
})

const sortedGroups = computed(() => {
  return Object.entries(groups.value).sort((a, b) => b[1].total - a[1].total)
})

const totalThisMonth = computed(() => {
  const monthly = getMonthlyTransactions(data.transactions, app.currentMonth)
  return monthly.filter(t => t.type === 'investimento').reduce((s, t) => s + t.amount, 0)
})

const totalAllTime = computed(() => {
  return data.transactions.filter(t => t.type === 'investimento').reduce((s, t) => s + t.amount, 0)
})

const projected12 = computed(() => {
  const y = yields.value
  let total = 0
  Object.entries(groups.value).forEach(([cat, d]) => {
    const r = (y[cat] || 0) / 100
    total += r > 0 ? d.total * Math.pow(1 + r, 12) : d.total
  })
  return total
})

const avgYield = computed(() => {
  const y = yields.value
  const entries = Object.entries(groups.value)
  if (!entries.length || totalThisMonth.value <= 0) return 0
  let weightedSum = 0
  entries.forEach(([cat, d]) => { weightedSum += (y[cat] || 0) * d.total })
  return weightedSum / totalThisMonth.value
})

function catProjection(cat, total) {
  const r = (yields.value[cat] || 0) / 100
  return r > 0 ? total * Math.pow(1 + r, 12) : total
}

function catGain(cat, total) {
  return catProjection(cat, total) - total
}

function handleSetYield(cat, event) {
  const input = event.target.querySelector('input[name="yield"]')
  const val = Number(input?.value || 0)
  if (val < 0 || val > 100) {
    app.showMessage('Rendimento deve ser entre 0% e 100%.', 'error')
    return
  }
  setInvestmentYield(cat, val)
  yieldVersion.v++
  app.showMessage(`Rendimento de ${cat} atualizado para ${val.toFixed(2)}%.`, 'success')
}
</script>
