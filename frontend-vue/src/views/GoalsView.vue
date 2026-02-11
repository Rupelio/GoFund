<template>
  <div>
    <section class="panel-grid"><article class="panel">
      <header class="panel-head"><h2>Metas Financeiras</h2></header>
      <form class="form-stack" @submit.prevent="handleSubmit">
        <label>Nome<input v-model="form.name" type="text" placeholder="Ex: Viagem" maxlength="60" required /></label>
        <div class="row-2">
          <label>Alvo (R$)<input v-model.number="form.target" type="number" min="0.01" step="0.01" placeholder="0,00" required /></label>
          <label>Atual (R$)<input v-model.number="form.current" type="number" min="0" step="0.01" placeholder="0,00" required /></label>
        </div>
        <label>Prazo<input v-model="form.dueDate" type="date" /></label>
        <div class="row-actions">
          <button class="btn primary" type="submit">{{ editingId ? 'Atualizar' : 'Criar Meta' }}</button>
          <button v-if="editingId" class="btn ghost" type="button" @click="cancelEdit">Cancelar</button>
        </div>
      </form>

      <div class="stack-list" style="margin-top:1.25rem">
        <!-- Info-banner empty state (matches legacy) -->
        <template v-if="!data.goals.length">
          <div class="info-banner">
            <p><strong><i class="fa-solid fa-bullseye"></i> Metas Financeiras</strong></p>
            <p>Crie metas de economia com valor alvo e prazo. Faça aportes regulares e acompanhe o progresso visual.</p>
          </div>
          <p class="empty-state">Nenhuma meta cadastrada. Defina objetivos financeiros acima para começar a poupar.</p>
        </template>

        <!-- Goal cards sorted by dueDate (matches legacy .item-card structure) -->
        <article v-for="g in sortedGoals" :key="g.id" class="item-card">
          <h4>{{ g.name }}</h4>
          <p>{{ formatCurrency(g.current) }} / {{ formatCurrency(g.target) }} ({{ g.pct.toFixed(1) }}%)</p>
          <p>{{ g.dueText }} — {{ g.status }}</p>
          <div class="progress">
            <span :style="{ width: Math.min(g.pct, 100) + '%' }"></span>
          </div>
          <!-- Inline contribution form (matches legacy) -->
          <form class="mini-actions" @submit.prevent="doContribution(g)">
            <input
              v-model.number="contributions[g.id]"
              type="number"
              name="goalContribution"
              min="0.01"
              step="0.01"
              placeholder="Aporte (R$)"
              required
            />
            <button class="mini-btn" type="submit">Adicionar</button>
          </form>
          <div class="mini-actions">
            <button class="mini-btn" type="button" @click="editGoal(g)">Editar</button>
            <button class="mini-btn" type="button" @click="confirmDeleteGoal(g)">Excluir</button>
          </div>
        </article>
      </div>
    </article></section>
  </div>
</template>

<script setup>
import { ref, reactive, computed, inject } from 'vue'
import { useDataStore } from '../stores/data.js'
import { formatCurrency, formatGoalDueDate, getTodayDate } from '../helpers.js'

const data = useDataStore()
const confirm = inject('confirm')

const form = ref({ name: '', target: null, current: 0, dueDate: '' })
const editingId = computed(() => data.editingGoalId)
const contributions = reactive({})

const sortedGoals = computed(() => {
  const today = new Date(`${getTodayDate()}T00:00:00`)
  return [...data.goals]
    .sort((a, b) => {
      if (!a.dueDate && !b.dueDate) return a.name.localeCompare(b.name, 'pt-BR')
      if (!a.dueDate) return 1
      if (!b.dueDate) return -1
      return a.dueDate.localeCompare(b.dueDate)
    })
    .map(g => {
      const ratio = g.target > 0 ? g.current / g.target : 0
      const pct = ratio * 100
      const due = g.dueDate ? new Date(`${g.dueDate}T00:00:00`) : null
      const isComplete = g.current >= g.target
      const isOverdue = Boolean(due && !isComplete && due < today)
      const dueText = g.dueDate ? formatGoalDueDate(g.dueDate) : 'Sem prazo'
      const status = isComplete ? '✓ Concluída' : isOverdue ? '⚠ Atrasada' : 'Em andamento'
      return { ...g, pct, dueText, status }
    })
})

function handleSubmit() {
  data.saveGoal({
    name: form.value.name,
    target: form.value.target,
    current: form.value.current,
    dueDate: form.value.dueDate || undefined
  }).then(ok => {
    if (ok) resetForm()
  })
}

function resetForm() {
  form.value = { name: '', target: null, current: 0, dueDate: '' }
  data.editingGoalId = null
}

function editGoal(g) {
  data.editingGoalId = g.id
  form.value = { name: g.name, target: g.target, current: g.current, dueDate: g.dueDate || '' }
}

function cancelEdit() { resetForm() }

function doContribution(g) {
  const amount = contributions[g.id]
  if (!amount || amount <= 0) return
  data.addGoalContribution(g.id, amount)
  contributions[g.id] = undefined
}

async function confirmDeleteGoal(g) {
  const ok = await confirm({
    title: 'Excluir meta',
    message: `Deseja excluir a meta "${g.name}"?`,
    confirmLabel: 'Excluir',
    tone: 'danger'
  })
  if (!ok) return
  data.deleteGoal(g.id)
}
</script>
