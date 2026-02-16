/* ── GoFund Helpers ───────────────────────────────────────────
 *  Literal translation of all helper / utility functions from
 *  the legacy app.js into a shared ES module.
 * ─────────────────────────────────────────────────────────── */

// ── Constants ──────────────────────────────────────────────
export const CURRENCY = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' })

export const METHOD_LABELS = {
  pix: 'Pix', debito: 'Débito', credito: 'Crédito',
  boleto: 'Boleto', transferencia: 'Transferência',
  dinheiro: 'Dinheiro', cheque: 'Cheque',
}

export const defaultCategoryTypes = {
  alimentação: 'despesa', transporte: 'despesa', moradia: 'despesa',
  saúde: 'despesa', educação: 'despesa', lazer: 'despesa',
  compras: 'despesa', 'compras online': 'despesa', supermercado: 'despesa',
  assinaturas: 'despesa', contas: 'despesa', impostos: 'despesa',
  vestuário: 'despesa', pet: 'despesa', internet: 'despesa',
  seguros: 'despesa', fatura: 'despesa', outros: 'despesa',
  salário: 'receita', transferência: 'todas',
  investimento: 'investimento',
}

export const CARD_BILL_REGEX = /\b(?:pag(?:amento|to)?\s*(?:de\s*)?fatura|fatura\s*(?:do|de)?\s*cart(?:a|ã)o|pgto\s*cart(?:a|ã)o|pag(?:amento)?\s*cart(?:a|ã)o|cart(?:a|ã)o\s*de\s*cr[eé]dito)\b/i

const SUBSCRIPTION_KEYWORDS = [
  "dl\\*google", "google\\s*(one|play|storage|premium|workspace)", "youtube\\s*(prem|premium|music)",
  "amazonprimebr", "amazon\\s*prime", "prime\\s*video", "netflix", "spotify", "deezer", "tidal",
  "disney\\+?", "star\\+?", "hbo\\s*(max)?", "\\bmax\\b", "paramount\\+?", "globoplay", "crunchyroll",
  "apple\\s*(music|tv|one|arcade|icloud)", "apple\\.com\\/bill", "icloud", "dropbox", "onedrive",
  "chatgpt", "openai", "perplexity", "notion", "canva", "adobe", "figma", "grammarly", "midjourney",
  "microsoft\\s*365", "office\\s*365", "github\\s*(copilot)?", "vercel", "fly\\.io", "cloudflare",
  "railway", "render", "heroku", "digitalocean", "linode", "\\baws\\b", "google\\s*cloud", "\\bgcp\\b",
  "\\bazure\\b", "supabase", "mongodb\\s*atlas", "uol\\s*host", "hostinger", "hostgator", "namecheap",
  "nordvpn", "expressvpn", "surfshark", "kaspersky", "avast", "mcafee",
  "strava", "myfitnesspal", "headspace", "calm", "linkedin\\s*premium", "x\\s*premium", "patreon",
  "substack", "meta\\s*verified", "discord\\s*nitro", "telegram\\s*premium",
  "\\btim\\b", "tim\\*", "tim\\s*celular", "tim\\s*fibra", "tim\\s*live", "tim\\s*controle", "tim\\s*black",
  "\\bclaro\\b", "claro\\*", "claro\\s*celular", "claro\\s*fibra", "claro\\s*flex", "claro\\s*net", "\\bnet\\s*claro\\b",
  "\\bvivo\\b", "vivo\\*", "vivo\\s*celular", "vivo\\s*fibra", "vivo\\s*easy", "vivo\\s*controle",
  "\\boi\\s*(fibra|m[oó]vel|velox|total|celular)\\b", "oi\\*",
  "\\bnextel\\b", "\\balgar\\b", "algar\\s*(telecom|fibra)", "\\bbrisanet\\b", "\\bdesktop\\s*fibra\\b",
  "\\bconsig(net|a)\\b", "\\bhughesnet\\b", "\\bstarlink\\b",
]
export const SUBSCRIPTION_REGEX = new RegExp(SUBSCRIPTION_KEYWORDS.join("|"), "i")

export const PIX_TRANSFER_HINT_REGEX = /\b(?:enviado|enviada|recebido|recebida|devolu(?:c|ç)ao|transfer(?:encia)?|ted|doc|cpf|cnpj|chave|favorecido)\b/i
const TRANSFER_SIGNAL_REGEX = /\b(?:transfer\w*|pix|ted|doc|chave\s*pix|ag[êe]ncia:|conta:)\b/i
const TRANSFER_RECEIVED_REGEX = /\b(?:recebid[ao]|creditad[ao]|entrada|depositad[ao])\b/i
const TRANSFER_SENT_REGEX = /\b(?:enviad[ao]|debitad[ao]|saida|transfer[êe]ncia\s+enviad[ao])\b/i
const CPF_CNPJ_REGEX = /\d{2}\.\d{3}\.\d{3}\/\d{4}-\d{2}|\d{3}\.\d{3}\.\d{3}-\d{2}/

// ── String Utilities ───────────────────────────────────────
export function normalizeString(v) { return String(v || '').replace(/\s+/g, ' ').trim() }
function normalizeAscii(v) { return normalizeString(v).toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '') }

export function normalizeTransferDirection(direction) {
  const v = normalizeAscii(direction)
  if (!v) return ''
  if (v === 'in' || v === 'entrada' || v === 'recebida' || v === 'recebido') return 'in'
  if (v === 'out' || v === 'saida' || v === 'enviada' || v === 'enviado') return 'out'
  return ''
}

export function inferTransferCounterparty(description) {
  const raw = normalizeString(description)
  if (!raw) return ''

  const pieces = raw.split(' - ').map(v => normalizeString(v)).filter(Boolean)
  for (let i = 1; i < pieces.length; i++) {
    const part = pieces[i]
    if (!part || part.length < 3) continue
    if (CPF_CNPJ_REGEX.test(part)) continue
    if (/^(?:ag[êe]ncia|conta|bco|banco|ip\s*\(\d{4}\))/i.test(part)) continue
    return part.slice(0, 120)
  }

  const direct = raw.match(/(?:pix|transfer[êe]ncia)[^-\n]*-\s*(.+?)\s*-\s*(?:\d{2}\.\d{3}\.\d{3}\/\d{4}-\d{2}|\d{3}\.\d{3}\.\d{3}-\d{2})/i)
  if (direct && direct[1]) return normalizeString(direct[1]).slice(0, 120)
  return ''
}

export function inferTransferDirection(description, type, context = {}) {
  const normalizedDesc = normalizeAscii(description)
  const normalizedType = normalizeAscii(type)
  const normalizedMethod = normalizeAscii(context.method)
  const normalizedCategory = normalizeAscii(context.category)
  const prefilled = normalizeTransferDirection(context.direction || context.transferDirection)
  if (prefilled) return prefilled

  const hasTransferSignal = normalizedCategory === 'transferencia'
    || normalizedMethod === 'transferencia'
    || TRANSFER_SIGNAL_REGEX.test(normalizedDesc)

  if (!hasTransferSignal && normalizedType !== 'transferencia') return ''
  if (TRANSFER_RECEIVED_REGEX.test(normalizedDesc)) return 'in'
  if (TRANSFER_SENT_REGEX.test(normalizedDesc)) return 'out'

  const numericAmount = Number(context.amount)
  if (Number.isFinite(numericAmount) && numericAmount < 0) return 'out'
  if (Number.isFinite(numericAmount) && numericAmount > 0 && normalizedType === 'receita') return 'in'
  if (normalizedType === 'receita') return 'in'
  if (normalizedType === 'despesa' || normalizedType === 'investimento') return 'out'
  return ''
}

export function isTransferLikeTransaction(t) {
  if (!t || typeof t !== 'object') return false
  const type = normalizeAscii(t.type)
  if (type === 'transferencia') return true

  const direction = normalizeTransferDirection(t.transferDirection || t.transfer_direction)
  if (direction) return true

  const transferFrom = normalizeString(t.transferFromAccountId || t.transfer_from_account_id)
  const transferTo = normalizeString(t.transferToAccountId || t.transfer_to_account_id)
  if (transferFrom || transferTo) return true

  if (normalizeString(t.transferCounterparty || t.transfer_counterparty)) return true

  const category = normalizeAscii(t.category)
  if (category === 'transferencia') return true

  return false
}

export function getTransferEndpointIds(t) {
  if (!t || typeof t !== 'object') return { from: '', to: '' }
  const direction = normalizeTransferDirection(t.transferDirection || t.transfer_direction)
  const accountId = normalizeString(t.accountId || t.account_id || '')
  let from = normalizeString(t.transferFromAccountId || t.transfer_from_account_id || '')
  let to = normalizeString(t.transferToAccountId || t.transfer_to_account_id || '')
  if (!from && direction === 'out') from = accountId
  if (!to && direction === 'in') to = accountId
  return { from, to }
}

export function isInternalTransferBetweenOwnAccounts(t) {
  if (!isTransferLikeTransaction(t)) return false
  const { from, to } = getTransferEndpointIds(t)
  return Boolean(from && to && from !== to)
}

export function isCashAffectingTransaction(t, options = {}) {
  if (!t || typeof t !== 'object') return false
  const type = normalizeAscii(t.type)
  if (type !== 'receita' && type !== 'despesa' && type !== 'investimento') return false
  if (normalizeAscii(t.method) === 'credito') return false
  if (options.excludeInternalTransfers === true && isInternalTransferBetweenOwnAccounts(t)) return false
  return true
}

export function getSignedCashImpact(t, options = {}) {
  if (!isCashAffectingTransaction(t, options)) return 0
  const amount = Number(t.amount) || 0
  return normalizeAscii(t.type) === 'receita' ? amount : -amount
}

export function toCents(value) {
  return Math.round((Number(value) || 0) * 100)
}

export function fromCents(cents) {
  return round2((Number(cents) || 0) / 100)
}

export function normalizeCategory(v) {
  const n = normalizeString(v)
  return n ? n.split(' ').map(w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()).join(' ') : ''
}

export function getMethodLabel(m) { return METHOD_LABELS[m] || m }

export function parseOptionalNumber(v) {
  if (v == null) return null
  const n = typeof v === 'number' ? v : Number(String(v).trim())
  return Number.isFinite(n) ? n : null
}

export function round2(n) { return Number(n.toFixed(2)) }
export function clamp(v, min, max) { return Math.min(Math.max(v, min), max) }

export function createId() {
  return window.crypto?.randomUUID?.() ?? `id-${Date.now()}-${Math.random().toString(16).slice(2)}`
}

export function escapeHtml(v) {
  return String(v).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#039;')
}

// ── Date / Format Utilities ────────────────────────────────
export function getCurrentMonth() {
  const n = new Date()
  return `${n.getFullYear()}-${String(n.getMonth() + 1).padStart(2, '0')}`
}

export function getTodayDate() {
  const n = new Date()
  return `${n.getFullYear()}-${String(n.getMonth() + 1).padStart(2, '0')}-${String(n.getDate()).padStart(2, '0')}`
}

export function isValidDate(v) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(v))) return false
  const [y, m, d] = String(v).split('-').map(Number)
  const date = new Date(y, m - 1, d)
  return date.getFullYear() === y && date.getMonth() + 1 === m && date.getDate() === d
}

export function formatDate(v) {
  const [y, m, d] = String(v).split('-')
  return d && m && y ? `${d}/${m}/${y}` : v
}

export function formatCurrency(v) { return CURRENCY.format(Number(v) || 0) }

export function formatMonthLabel(mv) {
  const [y, m] = mv.split('-')
  const d = new Date(Number(y), Number(m) - 1, 1)
  return `${d.toLocaleDateString('pt-BR', { month: 'short' }).replace('.', '')}/${String(d.getFullYear()).slice(-2)}`
}

export function formatGoalDueDate(dueDate) {
  const today = new Date(`${getTodayDate()}T00:00:00`)
  const due = new Date(`${dueDate}T00:00:00`)
  const diff = Math.ceil((due - today) / 86400000)
  if (diff === 0) return `Vence hoje (${formatDate(dueDate)})`
  if (diff > 0) return `Vence em ${diff} dias (${formatDate(dueDate)})`
  return `Venceu há ${Math.abs(diff)} dias (${formatDate(dueDate)})`
}

// ── Month Sequence Helpers ─────────────────────────────────
export function getMonthSequence(base, start, end) {
  const seq = []
  for (let o = start; o <= end; o++) seq.push(getMonthShift(base, o))
  return seq
}

export function getMonthShift(base, offset) {
  const [y, m] = base.split('-').map(Number)
  const d = new Date(y, m - 1 + offset, 1)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}

export function sumByType(transactions, type, options = {}) {
  const normalizedType = normalizeAscii(type)
  const excludeTransferLike = options.excludeTransferLike === true
  const excludeCredit = options.excludeCredit === true
  return transactions
    .filter(t => normalizeAscii(t.type) === normalizedType)
    .filter(t => !excludeCredit || normalizeAscii(t.method) !== 'credito')
    .filter(t => !excludeTransferLike || !isTransferLikeTransaction(t))
    .reduce((s, t) => s + (Number(t.amount) || 0), 0)
}

// ── Normalizers ────────────────────────────────────────────
export function normalizeUser(u) {
  return {
    id: normalizeString(String(u?.id || '')),
    name: normalizeString(u?.name || '') || 'Usuário',
    email: normalizeString(String(u?.email || '')),
  }
}

export function normalizeTransaction(t) {
  const description = normalizeString(String(t?.description || ''))
  const installmentInfo = extractInstallmentInfo(description)
  let installments = Number(t?.installments) || 0
  if (installments <= 0 && installmentInfo) installments = installmentInfo.total

  const dateValue = normalizeString(String(t?.date || ''))
  const type = normalizeString(String(t?.type || '')).toLowerCase()
  const category = normalizeCategory(String(t?.category || ''))
  const method = normalizeString(String(t?.method || '')).toLowerCase()
  const amount = Number(t?.amount)
  const accountId = normalizeString(String(t?.accountId || t?.account_id || ''))
  let recurrence = normalizeString(String(t?.recurrence || 'none')).toLowerCase()
  const normalizedCategoryAscii = normalizeAscii(category)
  const shouldInferTransferMeta = type === 'transferencia'
    || normalizedCategoryAscii === 'transferencia'
    || normalizeTransferDirection(t?.transferDirection || t?.transfer_direction) !== ''
  let transferDirection = normalizeTransferDirection(t?.transferDirection || t?.transfer_direction)
  if (!transferDirection && shouldInferTransferMeta) {
    transferDirection = inferTransferDirection(description, type, { method, category, amount })
  }
  let transferCounterparty = normalizeString(String(t?.transferCounterparty || t?.transfer_counterparty || ''))
  if (!transferCounterparty && transferDirection) transferCounterparty = inferTransferCounterparty(description)
  const transferGroupId = normalizeString(String(t?.transferGroupId || t?.transfer_group_id || ''))
  let transferFromAccountId = normalizeString(String(t?.transferFromAccountId || t?.transfer_from_account_id || ''))
  let transferToAccountId = normalizeString(String(t?.transferToAccountId || t?.transfer_to_account_id || ''))
  if (!transferFromAccountId && !transferToAccountId && accountId) {
    if (transferDirection === 'out') transferFromAccountId = accountId
    if (transferDirection === 'in') transferToAccountId = accountId
  }

  if (t?._csvImport && (recurrence === '' || recurrence === 'none') && installments <= 1) {
    // CSV imports never auto-infer monthly recurrence.
    // Each CSV line is a real historical transaction.
    recurrence = 'none'
  } else if (recurrence === '') {
    recurrence = 'none'
  }

  return {
    id: normalizeString(String(t?.id || createId())),
    date: dateValue,
    type,
    category,
    method,
    description,
    amount,
    createdAt: normalizeString(String(t?.createdAt || t?.created_at || new Date().toISOString())),
    updatedAt: normalizeString(String(t?.updatedAt || t?.updated_at || new Date().toISOString())),
    recurrence,
    recurrenceEnd: normalizeString(String(t?.recurrenceEnd || t?.recurrence_end || '')),
    installments,
    accountId,
    transferDirection,
    transferCounterparty,
    transferGroupId,
    transferFromAccountId,
    transferToAccountId,
  }
}

export function normalizeBudget(b) {
  return {
    id: normalizeString(String(b?.id || createId())),
    category: normalizeCategory(String(b?.category || '')),
    limit: Number(b?.limit),
    createdAt: normalizeString(String(b?.createdAt || b?.created_at || '')),
    updatedAt: normalizeString(String(b?.updatedAt || b?.updated_at || '')),
  }
}

export function normalizeGoal(g) {
  return {
    id: normalizeString(String(g?.id || createId())),
    name: normalizeString(String(g?.name || '')),
    target: Number(g?.target),
    current: Number(g?.current),
    dueDate: normalizeString(String(g?.dueDate || g?.due_date || '')),
    createdAt: normalizeString(String(g?.createdAt || g?.created_at || '')),
    updatedAt: normalizeString(String(g?.updatedAt || g?.updated_at || '')),
  }
}

export function normalizeProjection(p) {
  const months = clamp(Number.isInteger(Number(p?.months)) ? Number(p.months) : 6, 1, 24)
  const income = parseOptionalNumber(p?.income)
  const expense = parseOptionalNumber(p?.expense)
  const investment = parseOptionalNumber(p?.investment)
  return {
    months,
    income: income !== null && income >= 0 ? round2(income) : null,
    expense: expense !== null && expense >= 0 ? round2(expense) : null,
    investment: investment !== null && investment >= 0 ? round2(investment) : null,
    updatedAt: normalizeString(String(p?.updatedAt || p?.updated_at || '')),
  }
}

// ── Validators ─────────────────────────────────────────────
export function isValidTransaction(t) {
  if (!t || typeof t !== 'object') return false
  if (t.id != null && !normalizeString(t.id)) return false
  if (!isValidDate(t.date)) return false
  if (!['receita', 'despesa', 'investimento', 'transferencia'].includes(t.type)) return false
  if (!normalizeString(t.category) || !METHOD_LABELS[t.method]) return false
  if (!normalizeString(t.description)) return false
  return Number.isFinite(t.amount) && t.amount > 0
}

export function isValidBudget(b) {
  if (!b || typeof b !== 'object') return false
  if (b.id != null && !normalizeString(b.id)) return false
  return Boolean(normalizeString(b.category)) && Number.isFinite(b.limit) && b.limit > 0
}

export function isValidGoal(g) {
  if (!g || typeof g !== 'object') return false
  if (g.id != null && !normalizeString(g.id)) return false
  if (!normalizeString(g.name)) return false
  if (!Number.isFinite(g.target) || g.target <= 0) return false
  if (!Number.isFinite(g.current) || g.current < 0) return false
  if (g.dueDate && !isValidDate(g.dueDate)) return false
  return true
}

// ── Monthly Transaction Expansion ──────────────────────────
export function getMonthlyTransactions(allTransactions, month) {
  const effective = []
  for (const t of allTransactions) {
    const tMonth = t.date.slice(0, 7)

    if (t.recurrence === 'monthly') {
      if (tMonth > month) continue
      if (t.recurrenceEnd && t.recurrenceEnd.slice(0, 7) < month) continue
      if (shouldSkipMonthlyExpansionForTransfer(t)) {
        if (tMonth === month) effective.push(t)
        continue
      }
      const clone = { ...t, isVirtual: tMonth !== month, originalId: t.id }
      if (tMonth !== month) {
        const day = Number(t.date.slice(8, 10))
        const [vy, vm] = month.split('-').map(Number)
        const lastDay = new Date(vy, vm, 0).getDate()
        const eDay = String(Math.min(day, lastDay)).padStart(2, '0')
        clone.date = `${month}-${eDay}`
      }
      effective.push(clone)
      continue
    }

    if (t.installments > 1) {
      const [sy, sm] = tMonth.split('-').map(Number)
      const [cy, cm] = month.split('-').map(Number)
      const diff = (cy - sy) * 12 + (cm - sm)
      if (diff < 0 || diff >= t.installments) continue
      const day = Number(t.date.slice(8, 10))
      const [vy, vm] = month.split('-').map(Number)
      const lastDay = new Date(vy, vm, 0).getDate()
      const eDay = String(Math.min(day, lastDay)).padStart(2, '0')
      const entry = { ...t, installmentNumber: diff + 1 }
      if (diff > 0) { entry.date = `${month}-${eDay}`; entry.isVirtual = true; entry.originalId = t.id }
      effective.push(entry)
      continue
    }

    if (tMonth === month) effective.push(t)
  }
  return effective
}

function shouldSkipMonthlyExpansionForTransfer(t) {
  if (!t || t.recurrence !== 'monthly') return false
  if (t.type !== 'despesa') return false
  if (t.method !== 'pix' && t.method !== 'transferencia') return false
  const desc = String(t.description || '').toLowerCase()
  if (!/\bagencia:\b|\bconta:\b/.test(desc)) return false
  return /\btransfer\w*\b|\bpix\b/.test(desc)
}

// ── Investment Yield Helpers ───────────────────────────────

/** Set of lower-cased categories that have at least one type=investimento txn */
export function getInvestmentCategories(allTransactions) {
  return new Set(
    allTransactions.filter(t => t.type === 'investimento').map(t => t.category.toLowerCase())
  )
}

/** True when a receita transaction is actually a return of invested capital (resgate) */
export function isInvestmentRedemption(t, investCategories) {
  return t.type === 'receita' && investCategories.has(t.category.toLowerCase())
}

export function getInvestmentYields() {
  try { return JSON.parse(localStorage.getItem('gofund_investment_yields') || '{}') } catch { return {} }
}

export function setInvestmentYield(category, rate) {
  const yields = getInvestmentYields()
  yields[category] = rate
  localStorage.setItem('gofund_investment_yields', JSON.stringify(yields))
}

export function getInvestmentStats(allTransactions) {
  const allInvestments = allTransactions.filter(t => t.type === 'investimento')
  const totalApplied = allInvestments.reduce((s, t) => s + t.amount, 0)
  // Identify withdrawal categories (receita with same category as investments)
  const investCategories = new Set(allInvestments.map(t => t.category.toLowerCase()))
  const withdrawals = allTransactions.filter(t =>
    t.type === 'receita' && investCategories.has(t.category.toLowerCase())
  )
  const totalWithdrawn = withdrawals.reduce((s, t) => s + t.amount, 0)

  // Calculate net invested per category chronologically.
  // Each withdrawal consumes at most the current balance (principal only).
  // Any excess (yield) is income, not a reduction in invested capital.
  const categoryBalance = {}
  const events = []
  allInvestments.forEach(t => events.push({ date: t.date + '|0', cat: t.category, amount: t.amount, type: 'apply' }))
  withdrawals.forEach(t => events.push({ date: t.date + '|1', cat: t.category, amount: t.amount, type: 'withdraw' }))
  events.sort((a, b) => a.date.localeCompare(b.date))
  for (const e of events) {
    const key = e.cat.toLowerCase()
    if (!categoryBalance[key]) categoryBalance[key] = { balance: 0, catName: e.cat }
    if (e.type === 'apply') {
      categoryBalance[key].balance += e.amount
    } else {
      // Withdrawal caps at current balance (extra = yield/income)
      categoryBalance[key].balance = Math.max(0, categoryBalance[key].balance - e.amount)
    }
  }

  const totalInvested = round2(Object.values(categoryBalance).reduce((s, c) => s + c.balance, 0))
  if (totalInvested <= 0) return { totalInvested: 0, totalApplied: round2(totalApplied), totalWithdrawn: round2(totalWithdrawn), avgMonthlyRate: 0, estimatedMonthlyYield: 0 }

  const yields = getInvestmentYields()
  let weightedSum = 0
  for (const [key, c] of Object.entries(categoryBalance)) {
    if (c.balance > 0) {
      weightedSum += (yields[c.catName] || 0) * c.balance
    }
  }
  const avgMonthlyRate = weightedSum / totalInvested / 100
  return {
    totalInvested,
    totalApplied: round2(totalApplied),
    totalWithdrawn: round2(totalWithdrawn),
    avgMonthlyRate,
    estimatedMonthlyYield: round2(totalInvested * avgMonthlyRate),
  }
}

// ── Cash / Patrimônio helpers ──────────────────────────────
export function getClosingCash(allTransactions, targetMonth, options = {}) {
  let cashCents = 0
  const months = new Set()
  allTransactions.forEach(t => {
    const m = t.date.slice(0, 7)
    if (m <= targetMonth) months.add(m)
  })
  allTransactions.forEach(t => {
    if (t.recurrence === 'monthly' || t.installments > 1) {
      let cur = t.date.slice(0, 7)
      while (cur <= targetMonth) {
        months.add(cur)
        cur = getMonthShift(cur, 1)
      }
    }
  })
  const sortedMonths = [...months].sort()
  sortedMonths.forEach(m => {
    const expanded = getMonthlyTransactions(allTransactions, m)
    expanded.forEach(t => {
      cashCents += toCents(getSignedCashImpact(t, options))
    })
  })
  return fromCents(cashCents)
}

export function getMonthlySummaryMap(allTransactions, selectedMonth, options = {}) {
  const map = new Map()
  const historyMonths = getMonthSequence(selectedMonth, -5, 0)
  historyMonths.forEach(m => {
    const expanded = getMonthlyTransactions(allTransactions, m)
    expanded.forEach(t => {
      if (!isCashAffectingTransaction(t, options)) return
      const c = map.get(m) || { income: 0, expense: 0, investment: 0 }
      if (t.type === 'receita') c.income += t.amount
      else if (t.type === 'despesa') c.expense += t.amount
      else if (t.type === 'investimento') c.investment += t.amount
      map.set(m, c)
    })
  })
  return map
}

export function getAverageMonthlyFlow(map, months) {
  let inc = 0, exp = 0, inv = 0, pts = 0
  months.forEach(m => {
    const s = map.get(m)
    if (!s) return
    inc += s.income; exp += s.expense; inv += s.investment; pts++
  })
  return pts ? { income: round2(inc / pts), expense: round2(exp / pts), investment: round2(inv / pts) } : { income: 0, expense: 0, investment: 0 }
}

// ── Chart Theme ────────────────────────────────────────────
export function getCssVar(name) { return getComputedStyle(document.body).getPropertyValue(name).trim() }

export function withAlpha(color, alpha) {
  const v = String(color || '').trim()
  if (!v) return `rgba(99,110,124,${alpha})`
  if (v.startsWith('#')) {
    const hex = v.slice(1)
    const n = hex.length === 3 ? hex.split('').map(c => c + c).join('') : hex
    const [r, g, b] = [n.slice(0, 2), n.slice(2, 4), n.slice(4, 6)].map(h => parseInt(h, 16))
    return [r, g, b].some(isNaN) ? `rgba(99,110,124,${alpha})` : `rgba(${r},${g},${b},${alpha})`
  }
  if (v.startsWith('rgb(')) {
    const p = v.replace('rgb(', '').replace(')', '').split(',').map(s => parseInt(s.trim(), 10))
    return p.length === 3 && !p.some(isNaN) ? `rgba(${p[0]},${p[1]},${p[2]},${alpha})` : `rgba(99,110,124,${alpha})`
  }
  return v.startsWith('rgba(') ? v : `rgba(99,110,124,${alpha})`
}

export function getChartTheme() {
  return {
    labelColor: getCssVar('--text-secondary'),
    gridColor: withAlpha(getCssVar('--text-muted'), 0.15),
    positiveColor: getCssVar('--success'),
    negativeColor: getCssVar('--danger'),
    positiveFill: withAlpha(getCssVar('--success'), 0.12),
    negativeFill: withAlpha(getCssVar('--danger'), 0.12),
    projectedColor: getCssVar('--primary-soft'),
    projectedFill: withAlpha(getCssVar('--primary'), 0.1),
    actualColor: getCssVar('--primary'),
    surfaceBorder: getCssVar('--border'),
    emptyColor: withAlpha(getCssVar('--text-muted'), 0.25),
    patrimonioColor: getCssVar('--warning'),
    patrimonioFill: withAlpha(getCssVar('--warning'), 0.08),
  }
}

export function getChartColors(q) {
  const palette = ['#5e7fff', '#7b59ff', '#10d884', '#ff5a65', '#f5b74e', '#48b8ff', '#22c55e', '#ef4444', '#14b8a6', '#f97316']
  return Array.from({ length: q }, (_, i) => palette[i % palette.length])
}

export function formatAxisValue(value) {
  const abs = Math.abs(value)
  const sign = value < 0 ? '-' : ''
  if (abs >= 1_000_000) return `${sign}R$ ${(abs / 1_000_000).toLocaleString('pt-BR', { maximumFractionDigits: 1 })}M`
  if (abs >= 1_000) return `${sign}R$ ${(abs / 1_000).toLocaleString('pt-BR', { maximumFractionDigits: 1 })}k`
  return `${sign}R$ ${Math.round(abs).toLocaleString('pt-BR')}`
}

export function getYAxisConfig(theme, dataArrays) {
  const allValues = dataArrays.flat().filter(v => v != null && Number.isFinite(v))
  const maxAbs = allValues.length > 0 ? Math.max(...allValues.map(Math.abs)) : 0
  const suggestedMax = maxAbs < 10 ? 100 : undefined
  return {
    grid: { color: theme.gridColor },
    ticks: {
      color: theme.labelColor,
      callback: v => formatAxisValue(Number(v)),
      maxTicksLimit: 7, precision: 0,
      font: { size: 12 }, padding: 4,
    },
    beginAtZero: true,
    suggestedMax,
  }
}

// ── Account Balance ────────────────────────────────────────
export function getAccountBalance(accountId, accounts, transactions) {
  const account = accounts.find(a => a.id === accountId)
  if (!account) return 0
  let balanceCents = 0
  const linked = transactions.filter(t => {
    if (t.accountId === accountId) return true
    const from = normalizeString(t.transferFromAccountId || t.transfer_from_account_id)
    const to = normalizeString(t.transferToAccountId || t.transfer_to_account_id)
    return from === accountId || to === accountId
  })
  linked.forEach(t => {
    if (normalizeAscii(t.method) === 'credito') return

    if (isTransferLikeTransaction(t)) {
      const direction = normalizeTransferDirection(t.transferDirection || t.transfer_direction)
      const from = normalizeString(t.transferFromAccountId || t.transfer_from_account_id)
      const to = normalizeString(t.transferToAccountId || t.transfer_to_account_id)
      const amountCents = toCents(t.amount)

      if (from && from === accountId) balanceCents -= amountCents
      if (to && to === accountId) balanceCents += amountCents
      if (!from && !to) {
        if (direction === 'out') balanceCents -= amountCents
        else if (direction === 'in') balanceCents += amountCents
      }
      return
    }

    balanceCents += toCents(normalizeAscii(t.type) === 'receita' ? t.amount : -Number(t.amount || 0))
  })
  if (linked.length === 0) {
    balanceCents = toCents(account.initialBalance || 0)
  } else if (account.initialBalance) {
    balanceCents += toCents(account.initialBalance)
  }
  return fromCents(balanceCents)
}

// ── CSV Helpers ────────────────────────────────────────────
export function normalizeHeader(v) {
  return normalizeString(String(v || '').replace(/^\uFEFF/, ''))
    .toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]/g, '')
}

export function findHeaderIdx(headers, aliases) {
  for (const a of aliases) { const i = headers.indexOf(a); if (i >= 0) return i }
  return -1
}

export function parseFlexibleNumber(v) {
  let raw = String(v ?? '').trim()
  if (!raw) return NaN

  let negative = false
  if (/^\(.*\)$/.test(raw)) {
    negative = true
    raw = raw.slice(1, -1)
  }
  if (/^\s*-\s*/.test(raw)) {
    negative = true
    raw = raw.replace(/^\s*-\s*/, '')
  }
  if (/-\s*$/.test(raw)) {
    negative = true
    raw = raw.replace(/-\s*$/, '')
  }

  raw = raw.replace(/[^\d,.\s]/g, '').replace(/\s+/g, '')
  if (!raw) return NaN

  const commaPos = raw.lastIndexOf(',')
  const dotPos = raw.lastIndexOf('.')
  let normalized = raw

  if (commaPos >= 0 && dotPos >= 0) {
    if (commaPos > dotPos) {
      // 1.234,56
      normalized = raw.replace(/\./g, '').replace(',', '.')
    } else {
      // 1,234.56
      normalized = raw.replace(/,/g, '')
    }
  } else if (commaPos >= 0) {
    // 1234,56
    normalized = raw.replace(/\./g, '').replace(',', '.')
  } else {
    // 1234.56 or 1234
    normalized = raw.replace(/,/g, '')
  }

  const parsed = Number(normalized)
  if (!Number.isFinite(parsed)) return NaN
  return negative ? -Math.abs(parsed) : parsed
}

export function detectCsvDelimiter(headerLine) {
  const candidates = [',', ';', '\t']
  const counts = candidates.map(candidate => ({ candidate, count: countUnquotedDelimiters(headerLine, candidate) }))
  counts.sort((a, b) => b.count - a.count)
  return counts[0].count > 0 ? counts[0].candidate : ','
}

function countUnquotedDelimiters(line, delimiter) {
  let inQ = false, count = 0
  for (let i = 0; i < line.length; i++) {
    const c = line[i]
    if (c === '"') { if (inQ && line[i + 1] === '"') i++; else inQ = !inQ; continue }
    if (!inQ && c === delimiter) count++
  }
  return count
}

export function parseCsvLine(line, delimiter = ',') {
  const vals = []; let cur = '', inQ = false
  for (let i = 0; i < line.length; i++) {
    const c = line[i]
    if (c === '"') { if (inQ && line[i + 1] === '"') { cur += '"'; i++ } else inQ = !inQ }
    else if (c === delimiter && !inQ) { vals.push(cur); cur = '' }
    else cur += c
  }
  vals.push(cur); return vals
}

export function csvEscape(v) {
  const t = String(v ?? '')
  return /[",\n]/.test(t) ? `"${t.replace(/"/g, '""')}"` : t
}

export function readFileAsText(f) {
  return new Promise((res, rej) => {
    const r = new FileReader()
    r.onerror = () => rej(new Error('Falha ao ler arquivo.'))
    r.onload = () => res(String(r.result || ''))
    r.readAsText(f)
  })
}

// ── CSV Date / Installment Parsing ─────────────────────────
export function normalizeCsvDate(rawDate) {
  const text = normalizeString(String(rawDate || ''))
  if (!text) return ''
  let match = text.match(/^(\d{4})-(\d{2})-(\d{2})(?:[T\s].*)?$/)
  if (match) return `${match[1]}-${match[2]}-${match[3]}`
  match = text.match(/^(\d{4})\/(\d{1,2})\/(\d{1,2})(?:\s.*)?$/)
  if (match) return `${match[1]}-${String(Number(match[2])).padStart(2, '0')}-${String(Number(match[3])).padStart(2, '0')}`
  match = text.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{4})(?:\s.*)?$/)
  if (match) {
    const d = String(Number(match[1])).padStart(2, '0')
    const m = String(Number(match[2])).padStart(2, '0')
    return `${match[3]}-${m}-${d}`
  }
  return text
}

export function extractInstallmentInfo(desc) {
  const text = String(desc || '')
  const directPatterns = [
    /(?:parcela|parc\.?)\s*(\d{1,2})\s*\/\s*(\d{1,2})/i,
    /(?:parcelamento(?:\s+de\s+fatura)?|fatura\s+parcelada)[^\d]{0,12}(\d{1,2})\s*\/\s*(\d{1,2})/i,
  ]
  for (const pattern of directPatterns) {
    const match = text.match(pattern)
    if (!match) continue
    const info = buildInstallmentInfo(match[1], match[2])
    if (info) return info
  }
  const genericFraction = text.match(/(\d{1,2})\s*\/\s*(\d{1,2})/)
  if (genericFraction && /(parcela|parcelamento|fatura)/i.test(text)) {
    const info = buildInstallmentInfo(genericFraction[1], genericFraction[2])
    if (info) return info
  }
  const timesMatch = text.match(/(?:parcelamento(?:\s+de\s+fatura)?|fatura\s+parcelada)[^\d]{0,12}(\d{1,2})\s*x\b/i)
  if (timesMatch) {
    const info = buildInstallmentInfo(1, timesMatch[1])
    if (info) return info
  }
  return null
}

function buildInstallmentInfo(current, total) {
  const cur = Number(current), tot = Number(total)
  if (!Number.isInteger(cur) || !Number.isInteger(tot)) return null
  if (tot <= 1 || tot > 96) return null
  if (cur < 1 || cur > tot) return null
  return { current: cur, total: tot }
}

export function adjustToInstallmentStartDate(dateValue, installmentInfo) {
  if (!installmentInfo || installmentInfo.current <= 1) return dateValue
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(dateValue || ''))) return dateValue
  const [py, pm, pd] = String(dateValue).split('-').map(Number)
  const targetDate = new Date(py, pm - 1 - (installmentInfo.current - 1), 1)
  const monthLastDay = new Date(targetDate.getFullYear(), targetDate.getMonth() + 1, 0).getDate()
  const clampedDay = Math.min(pd, monthLastDay)
  return `${targetDate.getFullYear()}-${String(targetDate.getMonth() + 1).padStart(2, '0')}-${String(clampedDay).padStart(2, '0')}`
}

// ── Category Inference ─────────────────────────────────────
export function inferCategoryFromDescription(desc, context = {}) {
  const normalizedDesc = String(desc || '').toLowerCase()
  const method = normalizeString(context.method || '').toLowerCase()
  const type = normalizeString(context.type || '').toLowerCase()
  const numericAmount = Number(context.amount) || 0
  const normalizedDescAscii = normalizedDesc.normalize('NFD').replace(/[\u0300-\u036f]/g, '')

  if (type === 'despesa' && CARD_BILL_REGEX.test(normalizedDesc)) return 'Fatura'
  if (isSubscriptionDescription(normalizedDesc)) return 'Assinaturas'
  if (isLikelySalaryIncome(normalizedDescAscii, type, method, '', Math.abs(numericAmount))) return 'Salário'

  const rules = [
    [/supermercado|condor|angeloni|festval|carrefour|atacad[ãa]o|big\b|assa[ií]|walmart|p[ãa]o de a[çc][úu]car|extra\s*hiper|zaffari|nacional|koch|bistek|giassi|fort\s*atacadista|sams?\s*club|makro|maxxi|mini\s*mercado|mini\s*pre[çc]o|dia\s*supermercado/, 'Supermercado'],
    [/restaurante|lanchonete|churrascaria|sorveteria|burger|mcdonald|mc\s*donald|subway|pizza|sushi|shawarma|shawarm|ifood|rappi|99\s*food|madeinchina|habib|bobs?\b|kfc|outback|spoleto|giraffas|coco\s*bambu|cantina|bistr[oô]|a\s*baiana|temakeria|acai|a[çc]a[ií]/, 'Alimentação'],
    [/padaria|confeitaria|cafe\b|café|padariae|starbucks|cafeteria|doceria|bolo|torta/, 'Alimentação'],
    [/posto|combustivel|combust[ií]vel|shell\b|ipiranga|petrobras|auto\s*posto|\bale\b|br\s*distribuidora|gasolina|etanol|diesel|gnv/, 'Transporte'],
    [/uber|\b99\s*(?:pop|taxi|moto|app)\b|\b99app\b|cabify|estacionamento|estapar|zona\s*azul|park|vaga\s*livre/, 'Transporte'],
    [/ped[áa]gio|sem\s*parar|veloe|move\s*mais|conect\s*car|auto\s*pista/, 'Transporte'],
    [/mec[âa]nica|oficina|borracharia|pneu|auto\s*el[eé]trica|auto\s*pe[çc]as|funilaria|lava\s*(r[áa]pido|jato|car)/, 'Transporte'],
    [/farm[áa]cia|panvel|drogaria|droga\s*raia|drogasil|pague\s*menos|ultrafarm|rede\s*d['']or|farma/, 'Saúde'],
    [/hospital|cl[ií]nica|m[ée]dico|lab(orat[óo]rio)?|consult(a|[oó]rio)|dentista|odonto|fisio(terapia)?|psic[oó]logo|exame|unimed|amil|sulam[ée]rica|hapvida|prevent\s*senior|bradesco\s*sa[úu]de/, 'Saúde'],
    [/[óo]tica|[óo]culos|lentes|vision/, 'Saúde'],
    [/\bcopel\b|\bcopel\s*dis\b|\bsanepar\b|\bcompagas\b|\bcomgas\b|\bnaturgy\b|\bgasmig\b|\bbahiagas\b|\bsulgas\b|\bceg\b|\bceg\s*rio\b|\benel\b|\bedp\b|\bcpfl\b|\bcemig\b|\bceee\b|\bcelesc\b|\bcoelba\b|\bequatorial\b|\bneoenergia\b|\blight\b|\bcelpe\b|\bcosern\b|\benergisa\b|\brge\b|\belektro\b|\beletropaulo\b|\bampla\b|\bsabesp\b|\bsaneago\b|\bcopasa\b|\bcaesb\b|\bcedae\b|\bcorsan\b|\bcagece\b|\bcompesa\b|\bembasa\b|\bsanasa\b|\bsaneatins\b|\bigu[aá]\s*saneamento\b|\bbrk\s*ambiental\b|\b[aá]guas?\s*do\s*rio\b|\b[aá]guas?\s*de\s*manaus\b|\benergia\b|\beletric[ai]\b|\b[aá]gua\b|\bg[aá]s\b|\bsaneamento\b|\bconta\s*de\s*(?:luz|energia|[aá]gua|g[aá]s)\b|\bfatura\s*de\s*(?:energia|[aá]gua|g[aá]s)\b/, 'Contas'],
    [/aluguel|condom[ií]nio|iptu|seguro\s*resid/, 'Moradia'],
    [/internet|telefone|banda\s*larga|fibra(?:\s*[óo]ptica)?|provedor(?:a)?\s*de\s*internet|wi[\s-]?fi|\bclaro\b|\bvivo\b|\btim(?:\*|\b)|\boi\b|\bnet\b|\bsky\b|brisanet|\bdesktop\b|\balgar\b|sercomtel|\bnio\b|\bsumicity\b|\bunifique\b|\bvalenet\b|\balares?\b|\bligga\b|\bvtal\b|\bservi[cç]os?\s+de\s+rede\b|\brede\s+nordeste\b|\btelecom\b/, 'Internet'],
    [/universidade|faculdade|escola|\bcurso\b|\bcultura\b|livraria|associa[çã]o.*cultura|apc|saraiva|amazon\s*kindle/, 'Educação'],
    [/udemy|coursera|alura|rocketseat|origamid|domestika|duolingo/, 'Educação'],
    [/cinema|teatro|steam|playstation|xbox|\bgame\b|nuuvem|sharkcraft|ingresso/, 'Lazer'],
    [/\bbar\b|\bpub\b|cerveja|balada|boate|\bshow\b|festival|parque|praia|hotel|hostel|airbnb|booking/, 'Lazer'],
    [/dl\*google|google\s*(one|play|storage|premium)|amazonprimebr|youtube\s*prem|icloud|dropbox|adobe|chatgpt|openai|canva|notion|figma|github|heroku|vercel|fly\.io|microsoft\s*365|office\s*365/, 'Assinaturas'],
    [/apple\.com|apple\s*music|apple\s*one|apple\s*arcade/, 'Assinaturas'],
    [/amazon|mercadolivre|mercado\s*livre|shopee|aliexpress|shein|magalu|magazine|americanas|casas\s*bahia|submarino|kabum|pichau|terabyte/, 'Compras Online'],
    [/roupa|vestu[áa]rio|renner|cea\b|c&a|riachuelo|zara|semina|hering|marisa|centauro|netshoes|adidas|nike|puma|decathlon|lupo/, 'Vestuário'],
    [/pet\s*shop|pet\s*center|cobasi|petz|veterin[áa]rio|ra[çc][ãa]o|cachorro|gato/, 'Pet'],
    [/aplica[çc][ãa]o|rdb|cdb|tesouro|investimento|poupan[çc]a|fundo|a[çc][ãa]o|etf|cri\b|cra\b|debenture|lci|lca|coe|previdencia/, 'Investimento'],
    [/sal[áa]rio|folha\s*de\s*pagamento|pro\s*labore|honorario|freelance|comiss[ãa]o|bonifica[çc][ãa]o/, 'Salário'],
    [/fatura|pgto\s*cart|cart[ãa]o\s*de\s*cr[ée]dito/, 'Fatura'],
    [/\b(?:receita\s*federal|impostos?|darf(?:\s+numerado)?|gps|guia\s+da\s+previdencia\s+social|inss|irpf|irpj|icms|issqn?|simples\s*nacional|pgdas-?d?|das|doc(?:umento)?\s+de\s+arrecadacao\s+do\s+simples(?:\s+nacional)?|gru|guia\s+de\s+recolhimento\s+da\s+uniao|sefaz|detran|dpvat|ipva|iptu|licenciamento)\b/, 'Impostos'],
    [/registrobr|registro\.br|hostgator|locaweb|godaddy|cloudflare|namecheap/, 'Internet'],
    [/seguro\s*(auto|vida|viagem)|porto\s*seguro|liberty|mapfre|zurich|tokio\s*marine|sulam[ée]rica\s*segur/, 'Seguros'],
    [/\b(?:transfer[êe]ncia|pix)\s*(?:recebid[ao]|enviad[ao])\b|\bdevolu(?:c|ç)[aã]o\s*(?:de\s*)?pix\b|\b(?:ted|doc)\b|\bchave\s*pix\b|\bag[eê]ncia:\b|\bconta:\b|\bnu\s*pagamentos\b|\binstitui[cç][aã]o\s*de\s*pagamento\b|\bip\s*\(\d{4}\)\b/, 'Transferência'],
  ]
  for (const [regex, cat] of rules) {
    if (regex.test(normalizedDesc)) return cat
  }
  const isPix = method === 'pix' || /\bpix\b/.test(normalizedDesc)
  if (isPix && PIX_TRANSFER_HINT_REGEX.test(normalizedDesc)) return 'Transferência'
  if (isPix && type === 'despesa') return 'Outros'
  if (isPix && type === 'receita') return 'Outros'
  if (isPix) return 'Transferência'
  return 'Outros'
}

const B3_TICKER_REGEX = /\b([A-Z]{4}\d{1,2})(?:\.SA)?\b/
const EXPLICIT_TICKER_REGEX = /\b(?:ticker|ativo|papel|a[çc][aã]o|etf|fii|stock|symbol)\s*[:\-]?\s*([A-Z]{1,6})(?:\.SA)?\b/i

function inferAssetTypeFromHint(descAscii, ticker) {
  if (/\b(fii|fundo\s*imobiliario)\b/.test(descAscii)) return 'fii'
  if (/\betf\b/.test(descAscii)) return 'etf'
  if (/\b(cripto|bitcoin|btc|ethereum|eth|solana|sol)\b/.test(descAscii)) return 'cripto'
  if (/\b(tesouro|cdb|rdb|lci|lca|cri|cra|debenture|previdencia|poupanca|renda\s*fixa)\b/.test(descAscii)) return 'renda_fixa'
  if (ticker) {
    if (ticker.endsWith('11') && /\bfii\b/.test(descAscii)) return 'fii'
    return 'acao'
  }
  if (/\b(fundo)\b/.test(descAscii)) return 'fundo'
  return 'outro'
}

function isNubankInvestmentContext(context = {}) {
  const sourceKeyAscii = normalizeAscii(context.csvSourceKey || context.sourceKey || '')
  if (sourceKeyAscii.includes('nubank')) return true
  const sourceLabelAscii = normalizeAscii(context.csvSourceLabel || context.sourceLabel || '')
  if (sourceLabelAscii.includes('nubank')) return true
  const accountNameAscii = normalizeAscii(context.accountName || '')
  if (/\bnubank\b/.test(accountNameAscii)) return true
  return false
}

function inferAssetNameFromHint(descAscii, ticker, category, context = {}) {
  if (ticker) return ticker
  if (/\b(nubank|nu)\b/.test(descAscii) && /\bcaixinha\b/.test(descAscii) && /\bturbo\b/.test(descAscii) && /\b(cdb|rdb)\b/.test(descAscii)) return 'Caixinha Nubank Turbo (RDB)'
  if (/\bcaixinha\b/.test(descAscii) && /\bturbo\b/.test(descAscii) && /\b(cdb|rdb)\b/.test(descAscii)) return 'Caixinha Turbo (RDB)'
  if (/\b(nubank|nu)\b/.test(descAscii) && /\bcaixinha\b/.test(descAscii) && /\b(cdb|rdb)\b/.test(descAscii)) return 'Caixinha Nubank (RDB)'
  if (/\bcaixinha\b/.test(descAscii) && /\b(cdb|rdb)\b/.test(descAscii)) return 'Caixinha (RDB)'
  if (isNubankInvestmentContext(context) && /\brdb\b/.test(descAscii) && /\b(aplicacao|resgate|rendimento|juros|investimento)\b/.test(descAscii)) {
    return 'Caixinha Nubank (RDB)'
  }
  if (/\btesouro\b/.test(descAscii)) return 'Tesouro Direto'
  if (/\bcdb\b|\brdb\b/.test(descAscii)) return 'CDB/RDB'
  if (/\blci\b|\blca\b/.test(descAscii)) return 'LCI/LCA'
  if (/\bprevidencia\b/.test(descAscii)) return 'Previdencia'
  if (/\bpoupanca\b/.test(descAscii)) return 'Poupanca'
  if (/\betf\b/.test(descAscii)) return 'ETF'
  if (/\bfii\b/.test(descAscii)) return 'FII'
  if (/\bfundo\b/.test(descAscii)) return 'Fundo'
  if (/\bbitcoin\b|\bbtc\b/.test(descAscii)) return 'Bitcoin'
  if (/\bethereum\b|\beth\b/.test(descAscii)) return 'Ethereum'
  return normalizeCategory(category || 'Investimentos')
}

function inferAssetCategoryFromHint(descAscii, assetType, fallbackCategory) {
  if (assetType === 'renda_fixa') {
    if (/\btesouro\b/.test(descAscii)) return 'Tesouro Direto'
    if (/\blci\b|\blca\b/.test(descAscii)) return 'LCI/LCA'
    if (/\b(cdb|rdb)\b/.test(descAscii)) return 'CDB/RDB'
    return 'Renda fixa'
  }
  if (assetType === 'acao') return 'Acoes'
  if (assetType === 'etf') return 'ETFs'
  if (assetType === 'fii') return 'Fundos Imobiliarios (FIIs)'
  if (assetType === 'cripto') return 'Criptoativos'
  if (assetType === 'fundo') return 'Fundos'
  return normalizeCategory(fallbackCategory || 'Investimentos')
}

function normalizeTickerHint(rawTicker = '') {
  return normalizeString(String(rawTicker || '')).toUpperCase().replace(/\s+/g, '')
}

export function extractInvestmentAssetHint(description, context = {}) {
  const rawDesc = normalizeString(description)
  if (!rawDesc) return null

  const descAscii = normalizeAscii(rawDesc)
  const category = normalizeString(context.category || '')
  const categoryAscii = normalizeAscii(category)
  const type = normalizeAscii(context.type)
  const looksInvestment = type === 'investimento'
    || categoryAscii === 'investimento'
    || /\b(investimento|aplicacao|resgate|rendimento|dividendo|juros|tesouro|cdb|rdb|lci|lca|cri|cra|debenture|fii|etf|acao|acoes|fundo|cripto|bitcoin|btc|ethereum|eth)\b/.test(descAscii)
  if (!looksInvestment) return null

  const upperDesc = rawDesc.toUpperCase()
  let ticker = ''
  const b3Match = upperDesc.match(B3_TICKER_REGEX)
  if (b3Match?.[1]) ticker = normalizeTickerHint(b3Match[1])
  if (!ticker) {
    const explicit = upperDesc.match(EXPLICIT_TICKER_REGEX)
    if (explicit?.[1]) ticker = normalizeTickerHint(explicit[1])
  }
  if (!ticker) {
    if (/\bbitcoin\b|\bbtc\b/.test(descAscii)) ticker = 'BTC-USD'
    else if (/\bethereum\b|\beth\b/.test(descAscii)) ticker = 'ETH-USD'
  }

  const assetType = inferAssetTypeFromHint(descAscii, ticker)
  const pricingSource = ticker ? 'market' : 'manual'
  const name = inferAssetNameFromHint(descAscii, ticker, category, context)
  const inferredCategory = inferAssetCategoryFromHint(descAscii, assetType, category)
  const institution = isNubankInvestmentContext(context) ? 'nubank' : ''
  const confidence = ticker
    ? 'high'
    : (assetType === 'renda_fixa' || assetType === 'fundo' ? 'medium' : 'low')

  return {
    name,
    assetType,
    ticker,
    pricingSource,
    category: inferredCategory || 'Investimentos',
    institution,
    confidence,
  }
}

export function classifyInvestmentReceiptKind(description, context = {}) {
  const descAscii = normalizeAscii(description)
  const categoryAscii = normalizeAscii(context.category || '')

  if (!descAscii && categoryAscii !== 'investimento') return 'unknown'

  if (/\b(resgate|retirada|saque|liquidacao|venda|amortizacao|desinvest)\b/.test(descAscii)) return 'redemption'
  if (/\b(rendimento|rendimentos|juros|dividendo|provento|rentabilidade|correcao|atualizacao\s*monetaria|yield|cupom)\b/.test(descAscii)) return 'yield'
  if (categoryAscii === 'investimento') return 'yield'
  return 'unknown'
}

export function isSubscriptionDescription(desc) {
  return SUBSCRIPTION_REGEX.test(String(desc || ''))
}

export function shouldInferMonthlyBankRecurrence(desc, method, type, category, amount) {
  const normalizedDesc = String(desc || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '')
  const normalizedMethod = normalizeString(String(method || '')).toLowerCase()
  const normalizedType = normalizeString(String(type || '')).toLowerCase()
  const normalizedCategory = normalizeCategory(String(category || '')).toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '')
  const numericAmount = Number(amount) || 0

  if (isLikelySalaryIncome(normalizedDesc, normalizedType, normalizedMethod, normalizedCategory, numericAmount)) return true
  if (isLikelyTuitionExpense(normalizedDesc, normalizedCategory)) return true
  if (isSubscriptionDescription(normalizedDesc) || normalizedCategory === 'assinaturas') return true
  if (normalizedType && normalizedType !== 'despesa') return false
  if (normalizedMethod === 'pix' || normalizedMethod === 'transferencia') return false
  if (/\btransfer\w*\b|\bpix\b|\bted\b|\bdoc\b|\bagencia:\b|\bconta:\b|\brecebida\b|\benviada\b/.test(normalizedDesc)) return false
  return false
}

function isLikelyTuitionExpense(normalizedDesc, normalizedCategory) {
  if (normalizedCategory === 'educacao') return true
  return /\bfaculdade\b|\buniversidade\b|\bmensalidade\b|\bcolegio\b|\bescola\b|\bapc\b|associacao\s+paranaense\s+de\s+cultura/.test(normalizedDesc)
}

function isLikelySalaryIncome(normalizedDesc, normalizedType, normalizedMethod, normalizedCategory, numericAmount) {
  if (normalizedType !== 'receita') return false
  if (normalizedCategory === 'salario') return true
  if (/\bsalario\b|\bfolha\b|\bpro\s*labore\b|\bholerite\b|\bpagamento\s+de\s+salario\b|\badiantamento\s+salarial\b/.test(normalizedDesc)) return true
  const isPixOrTransfer = normalizedMethod === 'pix' || normalizedMethod === 'transferencia'
  if (!isPixOrTransfer) return false
  const isReceived = /\b(?:transfer\w*|pix|ted|doc)\s*(?:recebid[ao]|creditad[ao])\b|\brecebid[ao]\s+pelo\s+pix\b/.test(normalizedDesc)
  if (!isReceived) return false
  const hasCnpj = /\d{2}\.\d{3}\.\d{3}\/\d{4}-\d{2}/.test(normalizedDesc)
  if (!hasCnpj || numericAmount < 1000) return false
  const nonSalaryHints = /\b(?:estorno|reembolso|devolu(?:cao|c)|resgate|rendimento|emprestimo|venda|cashback)\b/.test(normalizedDesc)
  return !nonSalaryHints
}

// ── CSV Import Fingerprinting ──────────────────────────────
export function normalizeDescriptionForFingerprint(description) {
  return normalizeString(String(description))
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

export function txnFingerprint(date, description, amount) {
  const d = normalizeDescriptionForFingerprint(description)
  return `${date}|${d}|${Math.abs(Number(amount)).toFixed(2)}`
}

// Dateless fingerprint for recurring monthly transactions.
// A monthly recurrence already expands to every month, so importing
// the same salary/subscription from a different month's statement is a duplicate.
export function txnMonthlyFingerprint(description, amount) {
  const d = normalizeDescriptionForFingerprint(description)
  return `monthly|${d}|${Math.abs(Number(amount)).toFixed(2)}`
}

// Fully dateless fingerprint for installment transactions.
// Strips the installment suffix (e.g. "parcela 2 3") so that
// different installment numbers of the same purchase match.
export function txnInstallmentFingerprint(description, amount) {
  let d = normalizeDescriptionForFingerprint(description)
  d = d.replace(/\s+parcela\s+\d+\s+\d+\s*$/i, '').replace(/\s+\d+\s+\d+\s*$/, '').trim()
  return `installment|${d}|${Math.abs(Number(amount)).toFixed(2)}`
}

export function toPayload(t, preserveId) {
  const p = {
    date: t.date, type: t.type, category: t.category,
    method: t.method, description: t.description,
    amount: Number(t.amount), recurrence: t.recurrence || 'none',
    recurrenceEnd: t.recurrenceEnd || '', installments: Number(t.installments) || 0,
  }
  if (t.accountId) p.accountId = t.accountId
  if (normalizeTransferDirection(t.transferDirection)) p.transferDirection = normalizeTransferDirection(t.transferDirection)
  if (normalizeString(t.transferCounterparty)) p.transferCounterparty = normalizeString(t.transferCounterparty)
  if (normalizeString(t.transferGroupId)) p.transferGroupId = normalizeString(t.transferGroupId)
  if (normalizeString(t.transferFromAccountId)) p.transferFromAccountId = normalizeString(t.transferFromAccountId)
  if (normalizeString(t.transferToAccountId)) p.transferToAccountId = normalizeString(t.transferToAccountId)
  if (preserveId && t.id) p.id = t.id
  return p
}

export function getProjectionBasis(proj, avg) {
  const i = proj.income !== null ? `Receita: ${formatCurrency(proj.income)}` : `Receita média: ${formatCurrency(avg.income)}`
  const e = proj.expense !== null ? `Despesa: ${formatCurrency(proj.expense)}` : `Despesa média: ${formatCurrency(avg.expense)}`
  const v = proj.investment !== null ? `Invest.: ${formatCurrency(proj.investment)}` : `Invest. médio: ${formatCurrency(avg.investment)}`
  return `${i} / ${e} / ${v}`
}
