<template>
  <div>
    <section class="panel-grid"><article class="panel">
      <header class="panel-head"><h2>Orçamentos Mensais</h2></header>
      <form class="budget-form-row" @submit.prevent="handleSubmit">
        <label>Categoria
          <select v-model="form.category" required>
            <option value="" disabled>Selecione...</option>
            <option v-for="cat in data.allCategoryNames" :key="cat" :value="cat">{{ cat }}</option>
          </select>
        </label>
        <label>Limite (R$)<input v-model.number="form.limit" type="number" min="0.01" step="0.01" placeholder="0,00" required /></label>
        <button class="btn ghost tiny" type="submit">Salvar</button>
      </form>

      <div class="stack-list" style="margin-top:1.25rem">
        <!-- Info-banner empty state (matches legacy) -->
        <template v-if="!data.budgets.length">
          <div class="info-banner">
            <p><strong><i class="fa-solid fa-sack-dollar"></i> Orçamentos</strong></p>
            <p>Defina limites de gastos por categoria para controlar suas despesas. O sistema alertará quando você ultrapassar os limites.</p>
          </div>
          <p class="empty-state">Nenhum orçamento definido. Use o formulário acima para criar seu primeiro orçamento.</p>
        </template>

        <!-- Budget cards sorted by category (matches legacy .item-card structure) -->
        <article v-for="b in budgetRows" :key="b.id" class="item-card">
          <h4>{{ b.category }}</h4>
          <p>{{ formatCurrency(b.spent) }} / {{ formatCurrency(b.limit) }} ({{ b.pct.toFixed(1) }}%)</p>
          <div class="progress" :class="{ 'over-budget': b.pct > 100 }">
            <span :style="{ width: Math.min(b.pct, 100) + '%' }"></span>
          </div>
          <div class="mini-actions">
            <button class="mini-btn" type="button" @click="editBudget(b)">Editar</button>
            <button class="mini-btn" type="button" @click="confirmDeleteBudget(b)">Excluir</button>
          </div>
        </article>
      </div>
    </article></section>
  </div>
</template>

<script setup>
import { ref, computed, inject } from 'vue'
import { useDataStore } from '../stores/data.js'
import { useAppStore } from '../stores/app.js'
import { formatCurrency } from '../helpers.js'

const data = useDataStore()
const app = useAppStore()
const confirm = inject('confirm')

const form = ref({ category: '', limit: null })

const budgetRows = computed(() => {
  const monthly = data.monthlyTransactions(app.currentMonth)
  // Legacy includes despesa AND investimento in budget calculation
  const expenses = {}
  monthly
    .filter(t => t.type === 'despesa' || t.type === 'investimento')
    .forEach(t => {
      const key = t.category.toLowerCase()
      expenses[key] = (expenses[key] || 0) + t.amount
    })

  return [...data.budgets]
    .sort((a, b) => a.category.localeCompare(b.category, 'pt-BR'))
    .map(b => {
      const spent = expenses[b.category.toLowerCase()] || 0
      const ratio = b.limit > 0 ? spent / b.limit : 0
      const pct = ratio * 100
      return { ...b, spent, pct }
    })
})

function handleSubmit() {
  data.saveBudget({ category: form.value.category, limit: form.value.limit }).then(ok => {
    if (ok) { form.value = { category: '', limit: null } }
  })
}

function editBudget(b) {
  data.editingBudgetId = b.id
  form.value = { category: b.category, limit: b.limit }
}

async function confirmDeleteBudget(b) {
  const ok = await confirm({
    title: 'Excluir orçamento',
    message: 'Deseja excluir este orçamento?',
    confirmLabel: 'Excluir',
    tone: 'danger'
  })
  if (!ok) return
  data.deleteBudget(b.id)
}
</script>
