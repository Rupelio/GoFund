<script setup>
import { ref, provide, onMounted, onUnmounted, computed, nextTick } from 'vue'
import { useRouter, useRoute } from 'vue-router'
import { useAuthStore } from '../stores/auth.js'
import { useDataStore } from '../stores/data.js'
import { useAppStore } from '../stores/app.js'
import { useConfirm } from '../composables/useConfirm.js'
import { formatCurrency } from '../helpers.js'
import AppSidebar from '../components/layout/AppSidebar.vue'
import AppTopbar from '../components/layout/AppTopbar.vue'

const auth = useAuthStore()
const data = useDataStore()
const app = useAppStore()
const router = useRouter()
const route = useRoute()
const { visible: confirmVisible, title: confirmTitle, message: confirmMessage, tone: confirmTone, confirm: showConfirm, accept: confirmAccept, cancel: confirmCancel } = useConfirm()
provide('confirm', showConfirm)

const csvInput = ref(null)
const showCsvImport = ref(false)
const csvPreview = ref(null)
const csvImporting = ref(false)
const csvAccountId = ref('')
const showGlobalLoader = ref(true)
const showDropZone = ref(false)
const showExportMenu = ref(false)
let dragCounter = 0

// CSV Account Dialog (Step 1 — before preview)
const showCsvAccountDialog = ref(false)
const csvAccountSelect = ref('__new__')
const csvNewAccountName = ref('')
const csvNewAccountType = ref('corrente')
const csvNewAccountBalance = ref(0)
const csvNewAccountColor = ref('#5e7fff')
const csvEarliestDate = ref('')
const csvPendingFile = ref(null)

const csvFormattedEarliestDate = computed(() => {
  if (!csvEarliestDate.value) return 'o extrato'
  const [y, m, d] = csvEarliestDate.value.split('-')
  return `${d}/${m}/${y}`
})

const csvSelectedAccountInfo = computed(() => {
  if (!csvAccountSelect.value || csvAccountSelect.value === '__new__' || csvAccountSelect.value === '') return null
  return data.accounts.find(a => a.id === csvAccountSelect.value)
})

const sortedAccounts = computed(() => data.accounts.slice().sort((a, b) => a.name.localeCompare(b.name, 'pt-BR')))

async function handleDeleteAll() {
  const ok = await showConfirm({ title: 'Apagar todas as movimentações?', message: `Você tem ${data.transactions.length} movimentação(ões). Essa ação é irreversível.`, tone: 'danger' })
  if (!ok) return
  const ok2 = await showConfirm({ title: 'Última confirmação', message: 'Deseja realmente excluir TODAS as movimentações? Esta ação não pode ser desfeita.', tone: 'danger' })
  if (ok2) data.deleteAllTransactions()
}

onMounted(async () => {
  showGlobalLoader.value = true
  const ok = await data.bootstrap()
  showGlobalLoader.value = false
  if (!ok) {
    auth.clearAuth()
    router.push({ name: 'login' })
  }
})

// ── Drag & Drop CSV ─────────────────────────────────
function handleDragEnter(e) {
  e.preventDefault()
  dragCounter++
  showDropZone.value = true
}
function handleDragOver(e) { e.preventDefault() }
function handleDragLeave(e) {
  e.preventDefault()
  dragCounter--
  if (dragCounter <= 0) { dragCounter = 0; showDropZone.value = false }
}
async function handleDrop(e) {
  e.preventDefault()
  dragCounter = 0
  showDropZone.value = false
  const file = e.dataTransfer?.files?.[0]
  if (!file || !file.name.toLowerCase().endsWith('.csv')) {
    app.showMessage('Arraste um arquivo .csv para importar.', 'error')
    return
  }
  startCsvImport(file)
}

// ── Keyboard Shortcuts (exact legacy behavior) ──────────
function handleKeydown(e) {
  // Skip if user is typing in a form element
  const tag = (e.target?.tagName || '').toLowerCase()
  if (['input', 'select', 'textarea'].includes(tag)) {
    if (e.key === 'Escape') e.target.blur()
    return
  }

  const pageMap = {
    '1': 'dashboard', '2': 'transactions', '3': 'accounts',
    '4': 'budgets', '5': 'goals', '6': 'investments',
    '7': 'projection', '8': 'reports', '9': 'installments',
    '0': 'settings',
  }

  if (pageMap[e.key]) {
    e.preventDefault()
    router.push({ name: pageMap[e.key] })
    return
  }

  if (e.key === 'ArrowLeft') { e.preventDefault(); app.prevMonth(); return }
  if (e.key === 'ArrowRight') { e.preventDefault(); app.nextMonth(); return }
  if (e.key === '/') {
    e.preventDefault()
    const searchEl = document.querySelector('.table-tools input[type="search"]')
    if (searchEl) searchEl.focus()
    return
  }
  if (e.key === 'n' || e.key === 'N') {
    e.preventDefault()
    router.push({ name: 'transactions' })
    return
  }
}

onMounted(() => document.addEventListener('keydown', handleKeydown))
onUnmounted(() => document.removeEventListener('keydown', handleKeydown))

// Close export menu on outside click
function handleDocClick(e) {
  if (showExportMenu.value && !e.target.closest('.export-dropdown') && !e.target.closest('[data-export-toggle]')) {
    showExportMenu.value = false
  }
}
onMounted(() => document.addEventListener('click', handleDocClick, true))
onUnmounted(() => document.removeEventListener('click', handleDocClick, true))

// ── CSV Import (two-step: account dialog → preview) ────
function triggerCsvImport() {
  csvInput.value?.click()
}

function handleCsvFile(e) {
  const file = e.target?.files?.[0]
  if (!file) return
  startCsvImport(file)
  e.target.value = ''
}

async function startCsvImport(file) {
  try {
    // Read and parse CSV without account ID yet
    const result = await data.importCsvCore(file, undefined)
    csvPendingFile.value = result
    // Find earliest date for the account dialog label
    const items = result.parsed?.items || []
    csvEarliestDate.value = items.length ? items.reduce((min, t) => t.date < min ? t.date : min, items[0].date) : ''
    // Reset account dialog state
    csvAccountSelect.value = '__new__'
    csvNewAccountName.value = ''
    csvNewAccountType.value = 'corrente'
    csvNewAccountBalance.value = 0
    csvNewAccountColor.value = '#5e7fff'
    csvAccountId.value = ''
    // Show Step 1: account dialog
    showCsvAccountDialog.value = true
  } catch (err) {
    app.showMessage(err.message || 'Falha ao processar CSV.', 'error')
  }
}

async function csvAccountContinue() {
  const val = csvAccountSelect.value
  if (val === '__new__') {
    if (!csvNewAccountName.value.trim()) return
    try {
      const created = await data.saveAccountDirect({
        name: csvNewAccountName.value.trim(),
        type: csvNewAccountType.value,
        initialBalance: Number(csvNewAccountBalance.value) || 0,
        color: csvNewAccountColor.value || '#5e7fff',
      })
      if (created) csvAccountId.value = created.id
    } catch (err) {
      app.showMessage('Falha ao criar conta: ' + (err.message || ''), 'error')
      return
    }
  } else if (val) {
    csvAccountId.value = val
  } else {
    csvAccountId.value = ''
  }
  showCsvAccountDialog.value = false
  // Re-process with accountId attached
  if (csvPendingFile.value) {
    const preview = csvPendingFile.value.preview
    if (csvAccountId.value) {
      preview.toImport.forEach(t => { t.accountId = csvAccountId.value })
      if (preview.toUpgrade) preview.toUpgrade.forEach(t => { t.accountId = csvAccountId.value })
    }
    csvPreview.value = preview
    showCsvImport.value = true
  }
}

function csvAccountCancel() {
  showCsvAccountDialog.value = false
  csvPendingFile.value = null
}

async function confirmImport() {
  if (!csvPreview.value) return
  csvImporting.value = true
  try {
    const { result, upgradeResult } = await data.executeImport(csvPreview.value, csvAccountId.value || undefined)
    const imported = result?.imported || csvPreview.value.toImport.length
    const upgraded = upgradeResult?.updated || 0
    let msg = `${imported} movimentação(ões) importada(s).`
    if (upgraded > 0) msg += ` ${upgraded} atualizada(s).`
    if (csvPreview.value.duplicatesExisting > 0) msg += ` ${csvPreview.value.duplicatesExisting} duplicata(s) ignorada(s).`
    app.showMessage(msg, 'success')
  } catch (err) {
    app.showMessage(`Erro na importação: ${err.message}`, 'error')
  } finally {
    csvImporting.value = false
    showCsvImport.value = false
    csvPreview.value = null
    csvPendingFile.value = null
  }
}
</script>

<template>
  <!-- Global Loader -->
  <div v-if="showGlobalLoader" class="global-loader">
    <div class="loader-spinner"></div>
    <p>Carregando dados…</p>
  </div>

  <template v-else>
    <div class="app-bg"></div>
    <main class="dashboard-shell" @dragenter="handleDragEnter" @dragover="handleDragOver" @dragleave="handleDragLeave" @drop="handleDrop">
      <button class="sidebar-toggle" type="button" aria-label="Menu" @click="app.toggleSidebar">&#9776;</button>
      <div class="sidebar-overlay" :class="{ 'is-open': app.sidebarOpen }" @click="app.closeSidebar"></div>
      <AppSidebar />
      <div class="content">
        <AppTopbar>
          <template #actions>
            <button class="btn ghost tiny" type="button" title="Enviar resumo do mês por email" @click="data.sendMonthlySummary"><i class="fa-solid fa-chart-pie"></i> Resumo</button>
            <div style="position:relative;display:inline-block">
              <button class="btn ghost tiny" type="button" @click="showExportMenu = !showExportMenu">Exportar CSV ▾</button>
              <div v-if="showExportMenu" class="export-dropdown" style="position:absolute;top:100%;right:0;z-index:50;min-width:160px;margin-top:4px;background:var(--surface-alt);border:1px solid var(--border);border-radius:8px;box-shadow:0 4px 12px rgba(0,0,0,.15);overflow:hidden" @click="showExportMenu = false">
                <button type="button" style="display:flex;align-items:center;gap:8px;width:100%;padding:0.5rem 0.75rem;border:0;background:transparent;color:var(--text);font-size:0.85rem;cursor:pointer;text-align:left" @mouseenter="$event.target.style.background='var(--surface-hover, rgba(255,255,255,.08))'" @mouseleave="$event.target.style.background='transparent'" @click="data.exportCsv('month')"><i class="fa-solid fa-calendar-day"></i> Mês atual</button>
                <button type="button" style="display:flex;align-items:center;gap:8px;width:100%;padding:0.5rem 0.75rem;border:0;background:transparent;color:var(--text);font-size:0.85rem;cursor:pointer;text-align:left" @mouseenter="$event.target.style.background='var(--surface-hover, rgba(255,255,255,.08))'" @mouseleave="$event.target.style.background='transparent'" @click="data.exportCsv('all')"><i class="fa-solid fa-calendar"></i> Todos os meses</button>
              </div>
            </div>
            <button class="btn ghost tiny" type="button" @click="triggerCsvImport">Importar</button>
            <input ref="csvInput" type="file" accept=".csv" hidden @change="handleCsvFile" />
            <button class="btn ghost tiny danger-text" type="button" title="Apagar todas as movimentações" @click="handleDeleteAll">🗑️ Apagar Tudo</button>
            <button class="btn primary tiny" type="button" @click="router.push({ name: 'transactions' })">+ Nova (N)</button>
          </template>
        </AppTopbar>
        <RouterView />
      </div>
    </main>

    <!-- Drop Zone Overlay -->
    <div v-if="showDropZone" class="dialog-backdrop" style="display:flex;align-items:center;justify-content:center;pointer-events:none">
      <div style="background:var(--surface-alt);border:3px dashed var(--primary);border-radius:16px;padding:3rem 4rem;text-align:center">
        <i class="fa-solid fa-file-csv" style="font-size:3rem;color:var(--primary);margin-bottom:1rem;display:block"></i>
        <p style="font-size:1.2rem;color:var(--text)">Solte o arquivo CSV aqui para importar</p>
      </div>
    </div>

    <!-- CSV Step 1: Account Dialog -->
    <div v-if="showCsvAccountDialog" class="dialog-backdrop" @click.self="csvAccountCancel">
      <section class="dialog-card" role="dialog" aria-modal="true" style="max-width:480px">
        <header class="dialog-header">
          <h3>Vincular a uma conta</h3>
          <button class="dialog-close-btn" type="button" @click="csvAccountCancel">&times;</button>
        </header>
        <div class="dialog-body" style="display:flex;flex-direction:column;gap:0.75rem">
          <p style="margin:0;font-size:0.88rem;color:var(--text-secondary)">Selecione ou crie uma conta para vincular as transações do extrato. Isso garante que o saldo da conta seja calculado corretamente.</p>
          <label style="font-weight:600;font-size:0.85rem">Conta
            <select v-model="csvAccountSelect" style="margin-top:0.25rem;width:100%">
              <option value="__new__">➕ Criar nova conta</option>
              <option v-for="acc in sortedAccounts" :key="acc.id" :value="acc.id">{{ acc.name }} ({{ acc.type }})</option>
              <option value="">Não vincular a nenhuma conta</option>
            </select>
          </label>
          <!-- New account fields -->
          <div v-if="csvAccountSelect === '__new__'" style="display:flex;flex-direction:column;gap:0.5rem;padding:0.75rem;border-radius:8px;background:var(--bg-card, var(--surface-alt));border:1px solid var(--border)">
            <div style="display:grid;grid-template-columns:1fr 1fr;gap:0.5rem">
              <label style="font-size:0.85rem">Nome
                <input v-model="csvNewAccountName" type="text" placeholder="Ex: Nubank" maxlength="40" style="width:100%;margin-top:0.15rem" />
              </label>
              <label style="font-size:0.85rem">Tipo
                <select v-model="csvNewAccountType" style="width:100%;margin-top:0.15rem">
                  <option value="corrente">Corrente</option>
                  <option value="poupanca">Poupança</option>
                  <option value="carteira">Carteira</option>
                  <option value="investimento">Investimento</option>
                  <option value="credito">Cartão de Crédito</option>
                </select>
              </label>
            </div>
            <label style="font-size:0.85rem">Saldo anterior a {{ csvFormattedEarliestDate }}
              <input v-model.number="csvNewAccountBalance" type="number" min="0" step="0.01" style="width:100%;margin-top:0.15rem" />
              <small style="color:var(--text-secondary);font-weight:400;display:block;margin-top:0.2rem">Quanto você tinha na conta <strong>antes</strong> da primeira transação do extrato. Deixe 0 se o extrato cobre todo o histórico.</small>
            </label>
            <label style="font-size:0.85rem">Cor
              <input v-model="csvNewAccountColor" type="color" style="margin-top:0.15rem" />
            </label>
          </div>
          <!-- Existing account warning -->
          <div v-if="csvSelectedAccountInfo && (csvSelectedAccountInfo.initialBalance || 0) > 0" style="padding:0.5rem 0.75rem;border-radius:8px;background:var(--bg-card, var(--surface-alt));border:1px solid var(--border);font-size:0.85rem">
            <i class="fa-solid fa-triangle-exclamation"></i> Esta conta tem saldo inicial de <strong>{{ formatCurrency(csvSelectedAccountInfo.initialBalance) }}</strong>. Se o extrato já contém todo o histórico, considere zerar o saldo inicial na seção de Contas para evitar duplicidade.
          </div>
        </div>
        <footer class="dialog-footer">
          <button class="btn ghost tiny" type="button" @click="csvAccountCancel">Cancelar</button>
          <button class="btn primary tiny" type="button" @click="csvAccountContinue">Continuar</button>
        </footer>
      </section>
    </div>

    <!-- CSV Step 2: Import Preview Dialog -->
    <div v-if="showCsvImport && csvPreview" class="dialog-backdrop" @click.self="showCsvImport = false">
      <section class="dialog-card" role="dialog" style="max-width: 520px">
        <header class="dialog-header">
          <h3>Confirmar importação CSV</h3>
          <button class="dialog-close-btn" type="button" @click="showCsvImport = false">&times;</button>
        </header>
        <div class="dialog-body">
          <p v-if="csvAccountId"><strong>Conta:</strong> {{ (data.accounts.find(a => a.id === csvAccountId) || {}).name }}</p>
          <p><strong>{{ csvPreview.toImport.length }}</strong> novas movimentações para importar.</p>
          <p v-if="csvPreview.duplicatesExisting"><strong>{{ csvPreview.duplicatesExisting }}</strong> duplicatas encontradas (serão ignoradas).</p>
          <p v-if="csvPreview.toUpgrade && csvPreview.toUpgrade.length"><strong>{{ csvPreview.toUpgrade.length }}</strong> a atualizar (parcelamento/recorrência).</p>
          <p v-if="csvPreview.invalid"><strong>{{ csvPreview.invalid }}</strong> inválidas.</p>
        </div>
        <footer class="dialog-footer">
          <button class="btn ghost tiny" @click="showCsvImport = false">Cancelar</button>
          <button class="btn primary tiny" :disabled="csvImporting || !csvPreview.toImport.length" @click="confirmImport">
            {{ csvImporting ? 'Importando…' : 'Importar' }}
          </button>
        </footer>
      </section>
    </div>

    <!-- Global Confirm Dialog (exact legacy #confirmModal) -->
    <div v-if="confirmVisible" class="dialog-backdrop" aria-hidden="false" @click.self="confirmCancel">
      <section class="dialog-card" role="dialog" aria-modal="true">
        <header class="dialog-header">
          <h3>{{ confirmTitle }}</h3>
          <button class="dialog-close-btn" type="button" aria-label="Fechar" @click="confirmCancel">&times;</button>
        </header>
        <div class="dialog-body">
          <p style="white-space: pre-line;">{{ confirmMessage }}</p>
        </div>
        <footer class="dialog-footer">
          <button class="btn ghost tiny" type="button" @click="confirmCancel">Cancelar</button>
          <button class="btn primary tiny" :class="{ 'dialog-ok-danger': confirmTone === 'danger' }" type="button" @click="confirmAccept">Confirmar</button>
        </footer>
      </section>
    </div>
  </template>
</template>
