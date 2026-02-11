<template>
  <div>
    <section class="panel-grid"><article class="panel panel-large">
      <header class="panel-head"><h2>Plano de Parcelas</h2></header>

      <template v-if="!installmentTx.length">
        <div class="info-banner">
          <p><strong><i class="fa-solid fa-credit-card"></i> Compras Parceladas</strong></p>
          <p>Acompanhe aqui o cronograma de todas as suas compras parceladas e veja o comprometimento futuro.</p>
          <p><strong>Para começar:</strong> Registre uma movimentação com parcelas &gt; 1 na aba Movimentações.</p>
        </div>
        <p class="empty-state">Nenhuma compra parcelada encontrada.</p>
      </template>

      <template v-else-if="!months.length">
        <p class="empty-state">Nenhuma parcela futura pendente.</p>
      </template>

      <template v-else>
        <div style="margin-bottom:1rem">
          <strong>Compromisso total futuro:</strong> <span class="negative">{{ formatCurrency(totalFutureCommitment) }}</span>
          <span style="color:var(--text-muted); margin-left:0.5rem">({{ months.length }} meses)</span>
        </div>
        <div class="installment-timeline">
          <div v-for="m in months" :key="m" class="installment-group" :style="m === app.currentMonth ? 'border-color:var(--primary)' : ''">
            <h4>{{ formatMonthLabel(m) }} {{ m === app.currentMonth ? '(atual)' : '' }} — {{ formatCurrency(monthTotal(m)) }}</h4>
            <div v-for="(item, idx) in futureByMonth[m]" :key="idx" class="installment-row">
              <span class="inst-desc">{{ item.description }}</span>
              <span class="inst-info">{{ item.installment }}/{{ item.total }} · {{ item.category }}</span>
              <span class="inst-amount negative">{{ formatCurrency(item.amount) }}</span>
            </div>
          </div>
        </div>
      </template>
    </article></section>
  </div>
</template>

<script setup>
import { computed } from 'vue'
import { useDataStore } from '../stores/data.js'
import { useAppStore } from '../stores/app.js'
import { formatCurrency, formatMonthLabel } from '../helpers.js'

const data = useDataStore()
const app = useAppStore()

const installmentTx = computed(() => data.transactions.filter(t => t.installments > 1))

const futureByMonth = computed(() => {
  const byMonth = {}
  installmentTx.value.forEach(t => {
    const [sy, sm] = t.date.slice(0, 7).split('-').map(Number)
    for (let i = 0; i < t.installments; i++) {
      const d = new Date(sy, sm - 1 + i, 1)
      const m = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
      if (m < app.currentMonth) continue
      if (!byMonth[m]) byMonth[m] = []
      byMonth[m].push({
        description: t.description,
        category: t.category,
        amount: t.amount,
        installment: i + 1,
        total: t.installments,
      })
    }
  })
  return byMonth
})

const months = computed(() => Object.keys(futureByMonth.value).sort())

const totalFutureCommitment = computed(() => {
  let total = 0
  months.value.forEach(m => { futureByMonth.value[m].forEach(i => { total += i.amount }) })
  return total
})

function monthTotal(m) {
  return (futureByMonth.value[m] || []).reduce((s, i) => s + i.amount, 0)
}
</script>
