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
provide('triggerCsvImport', () => triggerCsvImport())

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
const csvSuggestedAccount = ref(null)

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
const csvPendingFilesSummary = computed(() => csvPendingFile.value?.fileSummaries || [])
const csvPendingSourceSummary = computed(() => csvPendingFile.value?.sourceSummary || { items: [], mixedKnown: false })
const csvSelectedAccountId = computed(() => (
  csvAccountSelect.value && csvAccountSelect.value !== '__new__' ? csvAccountSelect.value : ''
))
const csvSelectedAccountSource = computed(() => (
  csvSelectedAccountId.value ? data.getAccountCsvSource(csvSelectedAccountId.value) : null
))
const csvBatchGlobalValidation = computed(() => data.validateCsvBatchForAccount(csvPendingFile.value, ''))
const csvBatchSelectedValidation = computed(() => data.validateCsvBatchForAccount(csvPendingFile.value, csvSelectedAccountId.value))

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
  const files = Array.from(e.dataTransfer?.files || [])
    .filter(file => String(file?.name || '').toLowerCase().endsWith('.csv'))
  if (!files.length) {
    app.showMessage('Arraste um ou mais arquivos .csv para importar.', 'error')
    return
  }
  startCsvImportBatch(files)
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
  const files = Array.from(e.target?.files || [])
    .filter(file => String(file?.name || '').toLowerCase().endsWith('.csv'))
  if (!files.length) return
  startCsvImportBatch(files)
  e.target.value = ''
}

async function startCsvImportBatch(files) {
  try {
    // Read and parse CSV files without account ID yet
    const result = await data.importCsvBatchCore(files, undefined)
    csvPendingFile.value = result
    csvSuggestedAccount.value = data.suggestAccountForBatch(result)
    // Find earliest date for the account dialog label
    const items = result.parsed?.items || []
    csvEarliestDate.value = items.length ? items.reduce((min, t) => t.date < min ? t.date : min, items[0].date) : ''
    // Reset account dialog state
    csvAccountSelect.value = csvSuggestedAccount.value?.accountId || '__new__'
    csvNewAccountName.value = ''
    csvNewAccountType.value = 'corrente'
    csvNewAccountBalance.value = 0
    csvNewAccountColor.value = '#5e7fff'
    csvAccountId.value = csvSuggestedAccount.value?.accountId || ''
    // Show Step 1: account dialog
    showCsvAccountDialog.value = true
  } catch (err) {
    app.showMessage(err.message || 'Falha ao processar CSV.', 'error')
  }
}

function useSuggestedAccount() {
  if (!csvSuggestedAccount.value?.accountId) return
  csvAccountSelect.value = csvSuggestedAccount.value.accountId
}

function applyAccountIdToPreview(preview) {
  if (!preview) return preview
  if (!csvAccountId.value) return preview
  preview.toImport.forEach(t => { t.accountId = csvAccountId.value })
  if (preview.toUpgrade) preview.toUpgrade.forEach(u => {
    if (u?.incoming) u.incoming.accountId = csvAccountId.value
  })
  return preview
}

function unlinkSelectedAccountSource() {
  if (!csvSelectedAccountId.value) return
  data.clearAccountCsvSource(csvSelectedAccountId.value)
  app.showMessage('Vinculo de origem removido para a conta selecionada.', 'success')
}

async function csvAccountContinue() {
  const batchValidation = data.validateCsvBatchForAccount(csvPendingFile.value, '')
  if (!batchValidation.ok) {
    app.showMessage(batchValidation.errors?.[0] || 'Nao foi possivel validar o lote selecionado.', 'error')
    return
  }

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

  const validation = data.validateCsvBatchForAccount(csvPendingFile.value, csvAccountId.value || '')
  if (!validation.ok) {
    if (csvSuggestedAccount.value?.accountId && csvAccountSelect.value !== csvSuggestedAccount.value.accountId) {
      csvAccountSelect.value = csvSuggestedAccount.value.accountId
      app.showMessage(`Conta sugerida "${csvSuggestedAccount.value.accountName}" selecionada automaticamente.`, 'info')
      return
    }
    app.showMessage(validation.errors?.[0] || 'Nao foi possivel validar o lote selecionado.', 'error')
    return
  }
  if (validation.shouldBindSource && csvAccountId.value && validation.sourceToBind) {
    data.setAccountCsvSource(csvAccountId.value, validation.sourceToBind)
  }
  if (validation.infos?.length) {
    app.showMessage(validation.infos[0], 'info')
  }

  showCsvAccountDialog.value = false
  // Re-process with accountId attached
  if (csvPendingFile.value) {
    const preview = csvPendingFile.value.preview
    csvPreview.value = applyAccountIdToPreview(preview)
    showCsvImport.value = true
  }
}

function csvAccountCancel() {
  showCsvAccountDialog.value = false
  csvPendingFile.value = null
  csvSuggestedAccount.value = null
}

async function recomputeCsvPreviewFromParsed() {
  if (!csvPendingFile.value?.parsed?.items?.length) return
  await data.refreshSnapshot()
  const existing = data.buildExistingFingerprints()
  const preview = data.buildImportPreview(csvPendingFile.value.parsed.items, existing)
  csvPreview.value = applyAccountIdToPreview(preview)
}

async function confirmImport() {
  if (!csvPreview.value) return
  csvImporting.value = true
  let shouldResetImportState = false
  try {
    const { result, upgradeResult } = await data.executeImport(csvPreview.value, csvAccountId.value || undefined)
    const imported = result?.imported ?? csvPreview.value.toImport.length
    const upgraded = upgradeResult?.updated || 0
    let msg = imported > 0 ? `${imported} movimentacao(oes) importada(s).` : 'Nenhuma nova movimentacao foi adicionada.'
    if (upgraded > 0) msg += ` ${upgraded} atualizada(s).`
    if (csvPreview.value.duplicatesExisting > 0) msg += ` ${csvPreview.value.duplicatesExisting} duplicata(s) ignorada(s).`
    app.showMessage(msg, imported > 0 || upgraded > 0 ? 'success' : 'info')
    shouldResetImportState = true
  } catch (err) {
    await recomputeCsvPreviewFromParsed()
    const partialImported = Number(err?.partialResult?.imported || 0)
    const remaining = Number(csvPreview.value?.toImport?.length || 0)
    if (remaining === 0) {
      const msg = partialImported > 0
        ? `Importacao concluida apos instabilidade de gateway. ${partialImported} movimentacao(oes) confirmada(s).`
        : 'Importacao concluida apos instabilidade de gateway.'
      app.showMessage(msg, 'success')
      shouldResetImportState = true
      return
    }
    if (partialImported > 0 || remaining > 0) {
      app.showMessage(`Importacao interrompida por instabilidade (${err.message || 'gateway'}). Ja importadas: ${partialImported}. Pendentes: ${remaining}. Clique em Importar novamente para concluir.`, 'error')
    } else {
      app.showMessage(`Erro na importacao: ${err.message}`, 'error')
    }
  } finally {
    csvImporting.value = false
    if (shouldResetImportState) {
      showCsvImport.value = false
      csvPreview.value = null
      csvPendingFile.value = null
      csvSuggestedAccount.value = null
    }
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
            <input ref="csvInput" type="file" accept=".csv" multiple hidden @change="handleCsvFile" />
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
        <p style="font-size:1.2rem;color:var(--text)">Solte um ou mais arquivos CSV aqui para importar</p>
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
          <div v-if="csvPendingFilesSummary.length" style="padding:0.6rem 0.75rem;border-radius:8px;background:var(--bg-card, var(--surface-alt));border:1px solid var(--border);display:flex;flex-direction:column;gap:0.4rem">
            <p style="margin:0;font-size:0.85rem;font-weight:600;display:flex;align-items:center;gap:0.45rem">
              <i class="fa-solid fa-file-csv" aria-hidden="true"></i>
              {{ csvPendingFilesSummary.length }} arquivo(s) no lote
            </p>
            <p v-if="csvPendingSourceSummary.mixedKnown" style="margin:0;font-size:0.82rem;color:var(--danger)">
              Origens diferentes detectadas. Esse lote nao podera ser importado em uma unica conta.
            </p>
            <div v-for="item in csvPendingFilesSummary" :key="item.fileName" style="display:flex;justify-content:space-between;gap:0.75rem;font-size:0.8rem;color:var(--text-secondary)">
              <span style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap">{{ item.fileName }}</span>
              <span>{{ item.source?.label || 'Origem nao identificada' }} - {{ item.itemCount }}</span>
            </div>
          </div>
          <div v-if="csvSuggestedAccount" style="padding:0.55rem 0.7rem;border-radius:8px;border:1px solid var(--border);background:var(--bg-card, var(--surface-alt));display:flex;align-items:center;justify-content:space-between;gap:0.75rem">
            <p style="margin:0;font-size:0.82rem;color:var(--text-secondary)">
              <i class="fa-solid fa-circle-info" aria-hidden="true"></i>
              Conta sugerida para este lote: <strong>{{ csvSuggestedAccount.accountName }}</strong>
            </p>
            <button v-if="csvAccountSelect !== csvSuggestedAccount.accountId" class="btn ghost tiny" type="button" @click="useSuggestedAccount">Usar sugestao</button>
          </div>
          <div v-if="!csvBatchGlobalValidation.ok" style="padding:0.55rem 0.7rem;border-radius:8px;border:1px solid var(--danger);background:rgba(220,53,69,0.08);color:var(--danger);font-size:0.82rem">
            <p style="margin:0;display:flex;align-items:center;gap:0.4rem">
              <i class="fa-solid fa-triangle-exclamation" aria-hidden="true"></i>
              {{ csvBatchGlobalValidation.errors?.[0] || 'Lote invalido para importacao unica.' }}
            </p>
          </div>
          <label style="font-weight:600;font-size:0.85rem">Conta
            <select v-model="csvAccountSelect" style="margin-top:0.25rem;width:100%">
              <option value="__new__">➕ Criar nova conta</option>
              <option v-for="acc in sortedAccounts" :key="acc.id" :value="acc.id">{{ acc.name }} ({{ acc.type }})</option>
              <option value="">Não vincular a nenhuma conta</option>
            </select>
          </label>
          <div v-if="csvSelectedAccountSource" style="padding:0.55rem 0.7rem;border-radius:8px;border:1px solid var(--border);background:var(--bg-card, var(--surface-alt));display:flex;align-items:center;justify-content:space-between;gap:0.75rem">
            <p style="margin:0;font-size:0.82rem;color:var(--text-secondary)">
              <i class="fa-solid fa-link" aria-hidden="true"></i>
              Origem vinculada: <strong>{{ csvSelectedAccountSource.label }}</strong>
            </p>
            <button class="btn ghost tiny" type="button" @click="unlinkSelectedAccountSource">
              <i class="fa-solid fa-link-slash" aria-hidden="true"></i> Desvincular
            </button>
          </div>
          <div v-if="csvSelectedAccountId && !csvBatchSelectedValidation.ok" style="padding:0.55rem 0.7rem;border-radius:8px;border:1px solid var(--danger);background:rgba(220,53,69,0.08);color:var(--danger);font-size:0.82rem;display:flex;flex-direction:column;gap:0.45rem">
            <p style="margin:0;display:flex;align-items:center;gap:0.4rem">
              <i class="fa-solid fa-triangle-exclamation" aria-hidden="true"></i>
              {{ csvBatchSelectedValidation.errors?.[0] || 'Conta selecionada incompativel com o lote.' }}
            </p>
            <div v-if="csvSuggestedAccount && csvAccountSelect !== csvSuggestedAccount.accountId">
              <button class="btn ghost tiny" type="button" @click="useSuggestedAccount">
                <i class="fa-solid fa-rotate-right" aria-hidden="true"></i> Trocar para conta sugerida
              </button>
            </div>
          </div>
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
          <p v-if="csvPendingFilesSummary.length > 1"><strong>{{ csvPendingFilesSummary.length }}</strong> arquivos no lote.</p>
          <p v-if="csvAccountId"><strong>Conta:</strong> {{ (data.accounts.find(a => a.id === csvAccountId) || {}).name }}</p>
          <p><strong>{{ csvPreview.toImport.length }}</strong> novas movimentações para importar.</p>
          <p v-if="csvPreview.duplicatesExisting"><strong>{{ csvPreview.duplicatesExisting }}</strong> duplicatas encontradas (serão ignoradas).</p>
          <p v-if="!csvPreview.toImport.length && csvPreview.duplicatesExisting" style="color:var(--text-secondary)">
            Este arquivo já foi importado antes. Ao confirmar, nada novo será adicionado.
          </p>
          <p v-if="csvPreview.toUpgrade && csvPreview.toUpgrade.length"><strong>{{ csvPreview.toUpgrade.length }}</strong> a atualizar (parcelamento/recorrência).</p>
          <p v-if="csvPreview.invalid"><strong>{{ csvPreview.invalid }}</strong> inválidas.</p>
        </div>
        <footer class="dialog-footer">
          <button class="btn ghost tiny" @click="showCsvImport = false">Cancelar</button>
          <button class="btn primary tiny" :disabled="csvImporting" @click="confirmImport">
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
