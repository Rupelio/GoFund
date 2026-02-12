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

// ── String Utilities ───────────────────────────────────────
export function normalizeString(v) { return String(v || '').replace(/\s+/g, ' ').trim() }

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

export function sumByType(transactions, type) {
  return transactions.filter(t => t.type === type).reduce((s, t) => s + t.amount, 0)
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
  let recurrence = normalizeString(String(t?.recurrence || 'none')).toLowerCase()

  if (t?._csvImport && (recurrence === '' || recurrence === 'none') && installments <= 1) {
    if (shouldInferMonthlyBankRecurrence(description, method, type, category, Math.abs(amount))) {
      recurrence = 'monthly'
    } else {
      recurrence = 'none'
    }
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
    accountId: normalizeString(String(t?.accountId || t?.account_id || '')),
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
  const totalInvested = allInvestments.reduce((s, t) => s + t.amount, 0)
  if (totalInvested <= 0) return { totalInvested: 0, avgMonthlyRate: 0, estimatedMonthlyYield: 0 }
  const yields = getInvestmentYields()
  const groups = {}
  allInvestments.forEach(t => {
    if (!groups[t.category]) groups[t.category] = 0
    groups[t.category] += t.amount
  })
  let weightedSum = 0
  Object.entries(groups).forEach(([cat, total]) => { weightedSum += (yields[cat] || 0) * total })
  const avgMonthlyRate = weightedSum / totalInvested / 100
  return {
    totalInvested: round2(totalInvested),
    avgMonthlyRate,
    estimatedMonthlyYield: round2(totalInvested * avgMonthlyRate),
  }
}

// ── Cash / Patrimônio helpers ──────────────────────────────
export function getClosingCash(allTransactions, targetMonth) {
  let cash = 0
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
      if (t.type === 'transferencia') return
      if (t.method === 'credito') return
      cash += t.type === 'receita' ? t.amount : -t.amount
    })
  })
  return round2(cash)
}

export function getMonthlySummaryMap(allTransactions, selectedMonth) {
  const map = new Map()
  const historyMonths = getMonthSequence(selectedMonth, -5, 0)
  historyMonths.forEach(m => {
    const expanded = getMonthlyTransactions(allTransactions, m)
    expanded.forEach(t => {
      if (t.type === 'transferencia') return
      if (t.method === 'credito') return
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
  let balance = 0
  const linked = transactions.filter(t => t.accountId === accountId)
  linked.forEach(t => {
    if (t.type === 'transferencia') return
    if (t.method === 'credito') return
    balance += t.type === 'receita' ? t.amount : -t.amount
  })
  if (balance === 0 && (account.initialBalance || 0) > 0 && linked.length === 0) {
    balance = account.initialBalance
  }
  return round2(balance)
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
  const t = String(v ?? '').replace(/[^\d,.\-]/g, '').trim()
  if (!t) return NaN
  let n = t
  if (t.includes(',') && t.includes('.')) n = t.replace(/\./g, '').replace(',', '.')
  else if (t.includes(',') && !t.includes('.')) n = t.replace(',', '.')
  return Number(n)
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

  if (type === 'despesa' && CARD_BILL_REGEX.test(normalizedDesc)) return 'Fatura'
  if (isSubscriptionDescription(normalizedDesc)) return 'Assinaturas'

  const rules = [
    [/supermercado|condor|angeloni|festval|carrefour|atacad[ãa]o|big\b|assa[ií]|walmart|p[ãa]o de a[çc][úu]car|extra\s*hiper|zaffari|nacional|koch|bistek|giassi|fort\s*atacadista|sams?\s*club|makro|maxxi|mini\s*mercado|mini\s*pre[çc]o|dia\s*supermercado/, 'Supermercado'],
    [/restaurante|lanchonete|churrascaria|sorveteria|burger|mcdonald|mc\s*donald|subway|pizza|sushi|shawarma|shawarm|ifood|rappi|99\s*food|madeinchina|habib|bobs?\b|kfc|outback|spoleto|giraffas|coco\s*bambu|cantina|bistr[oô]|a\s*baiana|temakeria|acai|a[çc]a[ií]/, 'Alimentação'],
    [/padaria|confeitaria|cafe\b|café|padariae|starbucks|cafeteria|doceria|bolo|torta/, 'Alimentação'],
    [/posto|combustivel|combust[ií]vel|shell\b|ipiranga|petrobras|auto\s*posto|ale\b|br\s*distribuidora|gasolina|etanol|diesel|gnv/, 'Transporte'],
    [/uber|99\b|cabify|estacionamento|estapar|zona\s*azul|park|vaga\s*livre/, 'Transporte'],
    [/ped[áa]gio|sem\s*parar|veloe|move\s*mais|conect\s*car|auto\s*pista/, 'Transporte'],
    [/mec[âa]nica|oficina|borracharia|pneu|auto\s*el[eé]trica|auto\s*pe[çc]as|funilaria|lava\s*(r[áa]pido|jato|car)/, 'Transporte'],
    [/farm[áa]cia|panvel|drogaria|droga\s*raia|drogasil|pague\s*menos|ultrafarm|rede\s*d['']or|farma/, 'Saúde'],
    [/hospital|cl[ií]nica|m[ée]dico|lab(orat[óo]rio)?|consult(a|[oó]rio)|dentista|odonto|fisio(terapia)?|psic[oó]logo|exame|unimed|amil|sulam[ée]rica|hapvida|prevent\s*senior|bradesco\s*sa[úu]de/, 'Saúde'],
    [/[óo]tica|[óo]culos|lentes|vision/, 'Saúde'],
    [/copel|sanepar|compagas|energi[as]|eletri|[áa]gua\b|enel|cemig|ceee|celesc|coelba|equatorial|neoenergia|light\b|celpe|cosern/, 'Contas'],
    [/aluguel|condom[ií]nio|iptu|seguro\s*resid/, 'Moradia'],
    [/internet|telefone|claro\b|vivo\b|tim\*|tim\b|oi\b|net\b|sky\b|brisanet|desktop\b|algar|sercomtel/, 'Internet'],
    [/universidade|faculdade|escola|curso|cultura|livraria|associa[çã]o.*cultura|apc|saraiva|amazon\s*kindle/, 'Educação'],
    [/udemy|coursera|alura|rocketseat|origamid|domestika|duolingo/, 'Educação'],
    [/cinema|teatro|steam|playstation|xbox|game|nuuvem|sharkcraft|ingresso/, 'Lazer'],
    [/bar\b|pub\b|cerveja|balada|boate|show|festival|parque|praia|hotel|hostel|airbnb|booking/, 'Lazer'],
    [/dl\*google|google\s*(one|play|storage|premium)|amazonprimebr|youtube\s*prem|icloud|dropbox|adobe|chatgpt|openai|canva|notion|figma|github|heroku|vercel|fly\.io|microsoft\s*365|office\s*365/, 'Assinaturas'],
    [/apple\.com|apple\s*music|apple\s*one|apple\s*arcade/, 'Assinaturas'],
    [/amazon|mercadolivre|mercado\s*livre|shopee|aliexpress|shein|magalu|magazine|americanas|casas\s*bahia|submarino|kabum|pichau|terabyte/, 'Compras Online'],
    [/roupa|vestu[áa]rio|renner|cea\b|c&a|riachuelo|zara|semina|hering|marisa|centauro|netshoes|adidas|nike|puma|decathlon|lupo/, 'Vestuário'],
    [/pet\s*shop|pet\s*center|cobasi|petz|veterin[áa]rio|ra[çc][ãa]o|cachorro|gato/, 'Pet'],
    [/aplica[çc][ãa]o|rdb|cdb|tesouro|investimento|poupan[çc]a|fundo|a[çc][ãa]o|etf|cri\b|cra\b|debenture|lci|lca|coe|previdencia/, 'Investimento'],
    [/sal[áa]rio|folha\s*de\s*pagamento|pro\s*labore|honorario|freelance|comiss[ãa]o|bonifica[çc][ãa]o/, 'Salário'],
    [/fatura|pgto\s*cart|cart[ãa]o\s*de\s*cr[ée]dito/, 'Fatura'],
    [/receita\s*federal|imposto|darf|gps|inss|irpf|irpj|icms|iss\b|simples\s*nacional|das\b|gru\b|detran|dpvat|ipva|licenciamento/, 'Impostos'],
    [/registrobr|registro\.br|hostgator|locaweb|godaddy|cloudflare|namecheap/, 'Internet'],
    [/seguro\s*(auto|vida|viagem)|porto\s*seguro|liberty|mapfre|zurich|tokio\s*marine|sulam[ée]rica\s*segur/, 'Seguros'],
    [/transfer[êe]ncia\s*recebida/, 'Transferência'],
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
  const isReceived = /\btransfer\w*\s+recebida\b|\bpix\b/.test(normalizedDesc)
  const hasCnpj = /\d{2}\.\d{3}\.\d{3}\/\d{4}-\d{2}/.test(normalizedDesc)
  return isPixOrTransfer && isReceived && hasCnpj && numericAmount >= 1000
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
  if (preserveId && t.id) p.id = t.id
  return p
}

export function getProjectionBasis(proj, avg) {
  const i = proj.income !== null ? `Receita: ${formatCurrency(proj.income)}` : `Receita média: ${formatCurrency(avg.income)}`
  const e = proj.expense !== null ? `Despesa: ${formatCurrency(proj.expense)}` : `Despesa média: ${formatCurrency(avg.expense)}`
  const v = proj.investment !== null ? `Invest.: ${formatCurrency(proj.investment)}` : `Invest. médio: ${formatCurrency(avg.investment)}`
  return `${i} / ${e} / ${v}`
}

