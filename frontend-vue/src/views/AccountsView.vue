<template>
  <div>
    <section class="panel-grid"><article class="panel">
      <header class="panel-head"><h2>Contas e Carteiras</h2></header>
      <form class="form-stack" @submit.prevent="handleSubmit">
        <div class="row-2">
          <label>Nome<input v-model="form.name" type="text" placeholder="Ex: Nubank" maxlength="40" required /></label>
          <label>Tipo
            <select v-model="form.type" required>
              <option value="corrente">Corrente</option>
              <option value="poupanca">Poupança</option>
              <option value="carteira">Carteira</option>
              <option value="investimento">Investimento</option>
              <option value="credito">Cartão de Crédito</option>
            </select>
          </label>
        </div>
        <div class="row-2">
          <label>Saldo Inicial<input v-model.number="form.initialBalance" type="number" min="0" step="0.01" /></label>
          <label>Cor<input v-model="form.color" type="color" /></label>
        </div>
        <div class="row-actions">
          <button class="btn primary" type="submit">{{ editingId ? 'Atualizar Conta' : 'Criar Conta' }}</button>
          <button v-if="editingId" class="btn ghost" type="button" @click="cancelEdit">Cancelar</button>
        </div>
      </form>

      <div class="stack-list" style="margin-top:1.25rem">
        <!-- Info-banner empty state (matches legacy) -->
        <template v-if="!data.accounts.length">
          <div class="info-banner">
            <p><strong><i class="fa-solid fa-building-columns"></i> Contas e Cartões</strong></p>
            <p>Cadastre suas contas bancárias e cartões para separar transações entre diferentes origens. Você pode acompanhar o saldo de cada conta individualmente.</p>
          </div>
          <p class="empty-state">Nenhuma conta cadastrada. Adicione suas contas acima para organizar melhor suas finanças.</p>
        </template>

        <!-- Account cards sorted by name (matches legacy) -->
        <article
          v-for="acc in sortedAccounts"
          :key="acc.id"
          class="account-card"
          :style="{ borderLeftColor: acc.color || '#5e7fff' }"
        >
          <div class="account-info">
            <h4>{{ acc.name }}</h4>
            <p>{{ accountTypeLabel(acc.type) }}</p>
            <p v-if="accountCsvSource(acc.id)" style="margin-top:0.25rem;font-size:0.78rem;color:var(--text-secondary)">
              <i class="fa-solid fa-link" aria-hidden="true"></i>
              Origem CSV: {{ accountCsvSource(acc.id)?.label }}
            </p>
          </div>
          <div>
            <span class="account-balance" :class="getBalance(acc.id) >= 0 ? 'positive' : 'negative'">
              {{ formatCurrency(getBalance(acc.id)) }}
            </span>
            <div class="mini-actions" style="margin-top:0.5rem">
              <button class="mini-btn" type="button" @click="editAccount(acc)">Editar</button>
              <button v-if="accountCsvSource(acc.id)" class="mini-btn" type="button" @click="unlinkAccountSource(acc)">
                <i class="fa-solid fa-link-slash" aria-hidden="true"></i> Desvincular
              </button>
              <button class="mini-btn" type="button" @click="confirmDeleteAccount(acc)">Excluir</button>
            </div>
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
import { formatCurrency, getAccountBalance } from '../helpers.js'

const data = useDataStore()
const app = useAppStore()
const confirm = inject('confirm')

const form = ref({ name: '', type: 'corrente', initialBalance: 0, color: '#5e7fff' })
const editingId = computed(() => data.editingAccountId)

const typeLabels = {
  corrente: 'Conta Corrente',
  poupanca: 'Poupança',
  carteira: 'Carteira',
  investimento: 'Investimento',
  credito: 'Cartão de Crédito'
}

function accountTypeLabel(type) {
  return typeLabels[type] || type
}

// Sort by name (legacy does .sort((a,b) => a.name.localeCompare(b.name, 'pt-BR')))
const sortedAccounts = computed(() => {
  return [...data.accounts].sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'))
})

function getBalance(id) {
  return getAccountBalance(id, data.accounts, data.transactions)
}

function accountCsvSource(accountId) {
  return data.getAccountCsvSource(accountId)
}

function handleSubmit() {
  data.saveAccount({ ...form.value }).then(ok => { if (ok) resetForm() })
}

function resetForm() {
  form.value = { name: '', type: 'corrente', initialBalance: 0, color: '#5e7fff' }
  data.editingAccountId = null
}

function editAccount(acc) {
  data.editingAccountId = acc.id
  form.value = {
    name: acc.name,
    type: acc.type || 'corrente',
    initialBalance: acc.initialBalance || 0,
    color: acc.color || '#5e7fff'
  }
}

function cancelEdit() { resetForm() }

async function confirmDeleteAccount(acc) {
  const ok = await confirm({
    title: 'Excluir conta',
    message: `Excluir a conta "${acc.name}"?`,
    confirmLabel: 'Excluir',
    tone: 'danger'
  })
  if (!ok) return
  data.deleteAccount(acc.id)
}

async function unlinkAccountSource(acc) {
  const source = accountCsvSource(acc.id)
  if (!source) return
  const ok = await confirm({
    title: 'Desvincular origem CSV',
    message: `Remover o vinculo "${source.label}" da conta "${acc.name}"?`,
    confirmLabel: 'Desvincular',
    tone: 'danger'
  })
  if (!ok) return
  data.clearAccountCsvSource(acc.id)
  app.showMessage(`Origem CSV desvinculada da conta "${acc.name}".`, 'success')
}
</script>
