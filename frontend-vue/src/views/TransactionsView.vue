<template>
  <div class="transactions-page">
    <section class="panel-grid">
      <!-- Transaction Form -->
      <article class="panel">
        <header class="panel-head"><h2>{{ editingId ? 'Editar Movimentação' : 'Nova Movimentação' }}</h2></header>
        <form class="form-stack" @submit.prevent="handleSubmit">
          <label>Descrição<input ref="descriptionInput" v-model="form.description" type="text" placeholder="Ex: Salário, Aluguel..." maxlength="80" required /></label>
          <div class="row-2">
            <label>Valor (R$)<input v-model.number="form.amount" type="number" min="0.01" step="0.01" placeholder="0,00" required /></label>
            <label>Data<input v-model="form.date" type="date" required /></label>
          </div>
          <div class="row-2">
            <label>Categoria
              <div class="input-with-action">
                <select v-model="form.category" required>
                  <option v-for="cat in categoryOptions" :key="cat" :value="cat">{{ cat }}</option>
                </select>
                <button class="btn-icon-add" type="button" title="Nova categoria" @click="showQuickCategory = true">+</button>
              </div>
            </label>
            <label>Tipo
              <select v-model="form.type" required>
                <option value="receita">Receita</option>
                <option value="despesa">Despesa</option>
                <option value="investimento">Investimento</option>
                <option value="transferencia">Transferência</option>
              </select>
            </label>
          </div>
          <div class="row-2">
            <label>Método
              <select v-model="form.method" required>
                <option value="pix">PIX</option>
                <option value="debito">Débito</option>
                <option value="credito">Crédito</option>
                <option value="dinheiro">Dinheiro</option>
                <option value="transferencia">Transferência</option>
                <option value="outros">Outros</option>
              </select>
            </label>
            <label>Conta
              <select v-model="form.accountId">
                <option value="">Sem conta</option>
                <option v-for="acc in data.accounts" :key="acc.id" :value="acc.id">{{ acc.name }}</option>
              </select>
            </label>
          </div>
          <div v-if="showTransferFields" class="row-2">
            <label>Direção da transferência
              <select v-model="form.transferDirection">
                <option value="">Não informado</option>
                <option value="out">Saída</option>
                <option value="in">Entrada</option>
              </select>
            </label>
            <label>Contraparte
              <input v-model="form.transferCounterparty" type="text" maxlength="120" placeholder="Ex: Nubank / Pessoa / Empresa" />
            </label>
          </div>
          <div v-if="showTransferFields" class="row-2">
            <label>Conta origem
              <select v-model="form.transferFromAccountId">
                <option value="">Não vincular</option>
                <option v-for="acc in data.accounts" :key="`from-${acc.id}`" :value="acc.id">{{ acc.name }}</option>
              </select>
            </label>
            <label>Conta destino
              <select v-model="form.transferToAccountId">
                <option value="">Não vincular</option>
                <option v-for="acc in data.accounts" :key="`to-${acc.id}`" :value="acc.id">{{ acc.name }}</option>
              </select>
            </label>
          </div>
          <div class="row-2">
            <label>Recorrência
              <select v-model="recurrenceMode">
                <option value="none">Única</option>
                <option value="monthly">Mensal</option>
                <option value="installments">Parcelado</option>
              </select>
            </label>
            <label v-if="recurrenceMode === 'installments'">Parcelas<input v-model.number="form.installments" type="number" min="2" max="48" placeholder="12" /></label>
            <label v-if="recurrenceMode === 'monthly'">Fim<input v-model="form.recurrenceEnd" type="date" /></label>
          </div>
          <div class="row-actions">
            <button class="btn primary" type="submit">{{ editingId ? 'Atualizar' : 'Salvar' }}</button>
            <button v-if="editingId" class="btn ghost" type="button" @click="cancelEdit">Cancelar</button>
          </div>
        </form>
      </article>

      <!-- Transactions Table -->
      <article class="panel panel-table">
        <header class="panel-head transactions-header">
          <h2>Movimentações</h2>
          <div class="table-tools">
            <input v-model="data.searchQuery" type="search" placeholder="Buscar... (/)" />
            <select v-model="data.filterType">
              <option value="todos">Todos</option>
              <option value="receita">Receita</option>
              <option value="despesa">Despesa</option>
              <option value="investimento">Investimento</option>
              <option value="transferencia">Transferência</option>
            </select>
            <select v-model="data.filterCategory">
              <option value="todas">Todas</option>
              <option v-for="cat in data.allCategoryNames" :key="cat" :value="cat">{{ cat }}</option>
            </select>
            <select v-model="data.filterMethod">
              <option value="todos">Todos Métodos</option>
              <option value="pix">PIX</option>
              <option value="debito">Débito</option>
              <option value="credito">Crédito</option>
              <option value="dinheiro">Dinheiro</option>
              <option value="boleto">Boleto</option>
              <option value="transferencia">Transferência</option>
              <option value="outros">Outros</option>
            </select>
            <select v-model="data.filterRecurrence">
              <option value="todos">Todas Freq.</option>
              <option value="none">Única</option>
              <option value="monthly">Mensal</option>
              <option value="installments">Parcelado</option>
            </select>
          </div>
        </header>

        <!-- Desktop table -->
        <div class="table-wrap">
          <table>
            <thead><tr><th>Descrição</th><th>Categoria</th><th>Método</th><th>Data</th><th>Valor</th><th>Ações</th></tr></thead>
            <tbody>
              <tr v-for="t in paginatedTransactions" :key="t.id + (t.isVirtual ? '-v' : '')" :class="{ 'credit-card-row': t.method === 'credito' }">
                <td>{{ t.description }}</td>
                <td>{{ t.category }}</td>
                <td>{{ getMethodLabel(t.method) }}</td>
                <td>{{ formatDate(t.date) }}</td>
                <td :class="valueClass(t)">{{ valueSign(t) }} {{ formatCurrency(t.amount) }}</td>
                <td>
                  <span class="tag" :class="t.type">{{ t.type === 'transferencia' ? 'transferência' : t.type }}</span>
                  <span v-if="t.method === 'credito'" class="tag credito-badge"><i class="fa-solid fa-credit-card"></i> próx. fatura</span>
                  <span v-if="t.recurrence === 'monthly'" class="tag recurrence">mensal</span>
                  <span v-if="t.installments > 1" class="tag recurrence">{{ t.installmentNumber || 1 }}/{{ t.installments }}</span>
                  <div class="mini-actions">
                    <template v-if="t.isVirtual">
                      <button class="mini-btn" type="button" @click="editTransaction({ ...t, id: t.originalId || t.id })">Ver original</button>
                    </template>
                    <template v-else>
                      <button class="mini-btn" type="button" @click="editTransaction(t)">Editar</button>
                      <button class="mini-btn" type="button" @click="confirmDelete(t)">Excluir</button>
                    </template>
                  </div>
                </td>
              </tr>
              <tr v-if="!paginatedTransactions.length">
                <td colspan="6" class="text-muted text-center">Nenhuma movimentação encontrada.</td>
              </tr>
            </tbody>
          </table>
        </div>

        <!-- Mobile cards (exact legacy row-based layout) -->
        <div class="transactions-cards-container">
          <div v-for="t in paginatedTransactions" :key="'card-' + t.id + (t.isVirtual ? '-v' : '')" class="transaction-card" :class="{ 'credit-card-row': t.method === 'credito' }">
            <div class="transaction-card-header">
              <div class="transaction-card-title">{{ t.description }}</div>
              <div :class="'transaction-card-amount ' + valueClass(t)">{{ valueSign(t) }}{{ formatCurrency(t.amount) }}</div>
            </div>
            <div class="transaction-card-body">
              <div class="transaction-card-row"><span class="transaction-card-label">Categoria</span><span>{{ t.category }}</span></div>
              <div class="transaction-card-row"><span class="transaction-card-label">Método</span><span>{{ getMethodLabel(t.method) }}</span></div>
              <div class="transaction-card-row"><span class="transaction-card-label">Data</span><span>{{ formatDate(t.date) }}</span></div>
              <div class="transaction-card-row">
                <span class="transaction-card-label">Tipo</span>
                <span>
                  <span class="tag" :class="t.type">{{ t.type === 'transferencia' ? 'transferência' : t.type }}</span>
                  <span v-if="t.method === 'credito'" class="tag credito-badge"><i class="fa-solid fa-credit-card"></i> próx. fatura</span>
                  <span v-if="t.recurrence === 'monthly'" class="tag recurrence">mensal</span>
                  <span v-if="t.installments > 1" class="tag recurrence">{{ t.installmentNumber || 1 }}/{{ t.installments }}</span>
                </span>
              </div>
            </div>
            <div class="transaction-card-actions">
              <template v-if="t.isVirtual">
                <button class="btn ghost" type="button" @click="editTransaction({ ...t, id: t.originalId || t.id })">Ver original</button>
              </template>
              <template v-else>
                <button class="btn ghost" type="button" @click="editTransaction(t)">Editar</button>
                <button class="btn ghost" type="button" @click="confirmDelete(t)">Excluir</button>
              </template>
            </div>
          </div>
        </div>

        <!-- Filter summary (exact legacy: count + income/expense/invest totals + page info) -->
        <div v-if="data.filteredTransactions.length" class="table-filter-summary">
          <span v-html="filterSummaryHtml"></span>
          <span>Pág {{ data.tablePage }}/{{ totalPages }}</span>
        </div>

        <!-- Pagination (numbered buttons with ellipsis, exact legacy) -->
        <div v-if="totalPages > 1" class="table-pagination">
          <button :disabled="data.tablePage <= 1" @click="data.tablePage--">&lt;</button>
          <template v-if="pagStart > 1">
            <button @click="data.tablePage = 1">1</button>
            <span class="page-info">â€¦</span>
          </template>
          <button v-for="p in pagRange" :key="p" :class="{ 'is-active': p === data.tablePage }" @click="data.tablePage = p">{{ p }}</button>
          <template v-if="pagEnd < totalPages">
            <span class="page-info">â€¦</span>
            <button @click="data.tablePage = totalPages">{{ totalPages }}</button>
          </template>
          <button :disabled="data.tablePage >= totalPages" @click="data.tablePage++">&gt;</button>
        </div>

        <!-- Empty state -->
        <div v-if="!data.filteredTransactions.length && !data.searchQuery && data.filterType === 'todos'" style="display:block">
          <div class="info-banner">
            <p><strong><i class="fa-solid fa-wallet"></i> Bem-vindo às Movimentações!</strong></p>
            <p>Aqui você registra todas as suas receitas, despesas e investimentos para acompanhar suas finanças.</p>
            <p><strong>Para começar:</strong> Preencha o formulário acima com sua primeira movimentação.</p>
            <p><strong>Dica:</strong> Use o atalho <kbd>N</kbd> para focar no formulário rapidamente.</p>
          </div>
          <p class="empty-state">Nenhuma movimentação registrada. Use o formulário acima ou importe um CSV.</p>
        </div>
      </article>
    </section>

    <!-- Quick Category Dialog -->
    <div v-if="showQuickCategory" class="dialog-backdrop" @click.self="showQuickCategory = false">
      <section class="dialog-card" role="dialog">
        <header class="dialog-header">
          <h3>Nova Categoria</h3>
          <button class="dialog-close-btn" type="button" @click="showQuickCategory = false">&times;</button>
        </header>
        <div class="dialog-body">
          <form class="form-stack" @submit.prevent="createQuickCategory">
            <label>Nome<input v-model="quickCategoryName" type="text" maxlength="40" required /></label>
            <div class="row-actions"><button class="btn primary" type="submit">Criar</button></div>
          </form>
        </div>
      </section>
    </div>

    <!-- Confirm Delete Dialog -->
    <div v-if="confirmDeleteItem" class="dialog-backdrop" @click.self="confirmDeleteItem = null">
      <section class="dialog-card" role="dialog">
        <header class="dialog-header">
          <h3>Confirmar exclusão</h3>
          <button class="dialog-close-btn" type="button" @click="confirmDeleteItem = null">&times;</button>
        </header>
        <div class="dialog-body">
          <p>Deseja excluir "<strong>{{ confirmDeleteItem.description }}</strong>" ({{ formatCurrency(confirmDeleteItem.amount) }})?</p>
        </div>
        <footer class="dialog-footer">
          <button class="btn ghost tiny" @click="confirmDeleteItem = null">Cancelar</button>
          <button class="btn primary tiny dialog-ok-danger" @click="doDelete">Excluir</button>
        </footer>
      </section>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, watch, onMounted, nextTick } from 'vue'
import { useDataStore } from '../stores/data.js'
import { useAppStore } from '../stores/app.js'
import {
  formatDate, formatCurrency, getMethodLabel, getTodayDate,
  normalizeCategory, defaultCategoryTypes, normalizeString, normalizeTransferDirection,
} from '../helpers.js'

const data = useDataStore()
const app = useAppStore()

const descriptionInput = ref(null)
const showQuickCategory = ref(false)
const quickCategoryName = ref('')
const confirmDeleteItem = ref(null)

const form = ref({
  description: '', amount: null, date: getTodayDate(), category: '',
  type: 'despesa', method: 'pix', accountId: '', installments: null, recurrenceEnd: '',
  transferDirection: '', transferCounterparty: '', transferFromAccountId: '', transferToAccountId: '',
})

const recurrenceMode = ref('none')
const editingId = computed(() => data.editingTransactionId)

const categoryOptions = computed(() => {
  const cats = new Set(data.allCategoryNames)
  if (form.value.category && !cats.has(form.value.category)) cats.add(form.value.category)
  return [...cats].sort((a, b) => a.localeCompare(b, 'pt-BR'))
})

const totalPages = computed(() => Math.max(1, Math.ceil(data.filteredTransactions.length / data.tablePageSize)))
const showTransferFields = computed(() => {
  const category = normalizeString(form.value.category).toLowerCase()
  return form.value.type === 'transferencia' || category === 'transferência' || category === 'transferencia'
})

const paginatedTransactions = computed(() => {
  const start = (data.tablePage - 1) * data.tablePageSize
  return data.filteredTransactions.slice(start, start + data.tablePageSize)
})

// Legacy value class mapping
function valueClass(t) {
  if (t.type === 'receita') return 'value-income'
  if (t.type === 'despesa') return 'value-expense'
  if (t.type === 'transferencia') return 'value-transfer'
  return 'value-investment'
}
function valueSign(t) { return t.type === 'receita' ? '+' : '-' }

// Filter summary (exact legacy: count · +income · -expense · invest)
const filterSummaryHtml = computed(() => {
  const items = data.filteredTransactions
  const totalIncome = items.filter(t => t.type === 'receita').reduce((s, t) => s + t.amount, 0)
  const totalExpense = items.filter(t => t.type === 'despesa').reduce((s, t) => s + t.amount, 0)
  const totalInvest = items.filter(t => t.type === 'investimento').reduce((s, t) => s + t.amount, 0)
  const parts = [`<strong>${items.length}</strong> movimentações`]
  if (totalIncome > 0) parts.push(`<span class="positive">+${formatCurrency(totalIncome)}</span>`)
  if (totalExpense > 0) parts.push(`<span class="negative">-${formatCurrency(totalExpense)}</span>`)
  if (totalInvest > 0) parts.push(`<span class="warning">${formatCurrency(totalInvest)}</span>`)
  return parts.join(' &middot; ')
})

// Numbered pagination (exact legacy: max 7 buttons with ellipsis)
const maxPagBtns = 7
const pagStart = computed(() => {
  let s = Math.max(1, data.tablePage - Math.floor(maxPagBtns / 2))
  const e = Math.min(totalPages.value, s + maxPagBtns - 1)
  if (e - s + 1 < maxPagBtns) s = Math.max(1, e - maxPagBtns + 1)
  return s
})
const pagEnd = computed(() => Math.min(totalPages.value, pagStart.value + maxPagBtns - 1))
const pagRange = computed(() => {
  const r = []
  for (let i = pagStart.value; i <= pagEnd.value; i++) r.push(i)
  return r
})

function handleSubmit() {
  const direction = normalizeTransferDirection(form.value.transferDirection)
  const payload = {
    description: form.value.description, amount: form.value.amount, date: form.value.date,
    category: normalizeCategory(form.value.category), type: form.value.type, method: form.value.method,
    accountId: form.value.accountId || undefined,
    recurrence: recurrenceMode.value === 'installments' ? 'none' : recurrenceMode.value,
    recurrenceEnd: recurrenceMode.value === 'monthly' ? form.value.recurrenceEnd : '',
    installments: recurrenceMode.value === 'installments' ? (form.value.installments || 0) : 0,
  }
  if (showTransferFields.value) {
    payload.transferDirection = direction || undefined
    payload.transferCounterparty = normalizeString(form.value.transferCounterparty) || undefined
    payload.transferFromAccountId = normalizeString(form.value.transferFromAccountId) || undefined
    payload.transferToAccountId = normalizeString(form.value.transferToAccountId) || undefined
    if (!payload.transferFromAccountId && !payload.transferToAccountId && payload.accountId) {
      if (direction === 'out') payload.transferFromAccountId = payload.accountId
      if (direction === 'in') payload.transferToAccountId = payload.accountId
    }
  }
  data.saveTransaction(payload).then(ok => { if (ok) resetForm() })
}

function resetForm() {
  form.value = {
    description: '', amount: null, date: getTodayDate(), category: '', type: 'despesa', method: 'pix', accountId: '',
    installments: null, recurrenceEnd: '', transferDirection: '', transferCounterparty: '', transferFromAccountId: '', transferToAccountId: '',
  }
  recurrenceMode.value = 'none'
  data.editingTransactionId = null
}

function editTransaction(t) {
  data.editingTransactionId = t.id
  form.value = {
    description: t.description, amount: t.amount, date: t.date, category: t.category, type: t.type, method: t.method,
    accountId: t.accountId || '', installments: t.installments || null, recurrenceEnd: t.recurrenceEnd || '',
    transferDirection: normalizeTransferDirection(t.transferDirection) || '',
    transferCounterparty: t.transferCounterparty || '',
    transferFromAccountId: t.transferFromAccountId || '',
    transferToAccountId: t.transferToAccountId || '',
  }
  if (t.installments > 1) recurrenceMode.value = 'installments'
  else if (t.recurrence === 'monthly') recurrenceMode.value = 'monthly'
  else recurrenceMode.value = 'none'
  nextTick(() => descriptionInput.value?.focus())
}

function cancelEdit() { resetForm() }
function confirmDelete(t) { confirmDeleteItem.value = t }
function doDelete() { data.deleteTransaction(confirmDeleteItem.value.id); confirmDeleteItem.value = null }

async function createQuickCategory() {
  if (!quickCategoryName.value.trim()) return
  const cat = normalizeCategory(quickCategoryName.value)
  await data.saveCategory({ name: cat, type: 'todas', icon: 'ðŸ“' })
  form.value.category = cat
  quickCategoryName.value = ''
  showQuickCategory.value = false
}

onMounted(() => {
  if (!form.value.category && categoryOptions.value.length) form.value.category = categoryOptions.value[0]
})

// Auto-fill type/recurrence when category changes (exact legacy behavior)
watch(() => form.value.category, (newCat) => {
  if (!newCat) return
  const catLower = newCat.toLowerCase()
  // Auto-set recurrence
  if (catLower === 'assinaturas') {
    recurrenceMode.value = 'monthly'
  } else if (recurrenceMode.value === 'monthly' && catLower !== 'assinaturas') {
    recurrenceMode.value = 'none'
  }
  // Auto-fill type from matching category or defaults
  const matchingCat = data.categories.find(c => c.name.toLowerCase() === catLower)
  if (matchingCat && matchingCat.type && matchingCat.type !== 'todas') {
    form.value.type = matchingCat.type
  } else if (defaultCategoryTypes[catLower]) {
    const dt = defaultCategoryTypes[catLower]
    if (dt !== 'todas') form.value.type = dt
  }
})

watch(showTransferFields, (enabled) => {
  if (enabled) return
  form.value.transferDirection = ''
  form.value.transferCounterparty = ''
  form.value.transferFromAccountId = ''
  form.value.transferToAccountId = ''
})
</script>





