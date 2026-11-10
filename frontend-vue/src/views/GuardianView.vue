<script setup>
import { ref, computed, onMounted } from 'vue'
import { useAuthStore } from '../stores/auth.js'
import { useAppStore } from '../stores/app.js'
import { guardianApi } from '../api/guardian.js'

const auth = useAuthStore()
const app = useAppStore()

const FII_REF_PRICE = 8.05
const FII_MONTHLY_YIELD = 0.0112
const RING_TARGET = 350.0

const loading = ref(true)
const evaluating = ref(false)
const confirming = ref(false)
const quickAdding = ref(false)

// Visual feedback effects
const celebrationEffect = ref(null) // { amount, shares, questTitle }
const damageEffect = ref(null) // { amount, envelopeName }
const showWebhookGuide = ref(false)

// Dashboard State
const envelopes = ref([])
const quests = ref([])
const totalSavedMonth = ref(0)
const savedFiiShares = ref(0)
const savedFiiSharesCount = ref(0)
const estimatedMonthlyDividend = ref(0)
const paydayChecklist = ref({
  current_day: new Date().getDate(),
  active_cycle: null,
  cycles: [],
})
const recentLogs = ref([])

// Selected payday cycle tab
const selectedCycleId = ref('')
const checkedTasks = ref({})

// Form: Consultar o Roberto
const spendForm = ref({
  description: '',
  amount: null,
  envelope_slug: 'lazer_semanal',
})

// Active evaluation result from Roberto
const activeEvaluation = ref(null)
const selectedSaveQuestId = ref(null)

// Form: Quick-Expense Webhook
const quickForm = ref({
  title: '',
  amount: null,
  guardianToken: localStorage.getItem('gf_guardian_webhook_token') || 'gofund-guardian-secret',
})

const envelopeOptions = [
  { slug: 'lazer_semanal', label: '🍔 HP Lazer da Semana (R$ 100/sem)', short: 'Lazer Semanal', icon: 'fa-gamepad' },
  { slug: 'vr_mercado', label: '🛒 Escudo Vale-Refeição (R$ 600/mês)', short: 'Vale-Refeição', icon: 'fa-basket-shopping' },
  { slug: 'casa_combustivel', label: '⛽ Casa, Farmácia & Gasolina (R$ 400/mês)', short: 'Casa & Gasolina', icon: 'fa-gas-pump' },
  { slug: 'piso_cartao', label: '🔒 Piso Fixo do Cartão (Trava R$ 634,67)', short: 'Piso do Cartão', icon: 'fa-credit-card' },
]

const quickPresets = [
  { description: '99Food Hambúrguer', amount: 62.50, slug: 'lazer_semanal', tag: '🍔 99Food R$ 62,50' },
  { description: 'Jogo Steam Lancamento', amount: 119.90, slug: 'lazer_semanal', tag: '🎮 Jogo Steam R$ 119,90' },
  { description: 'iFood Quarta à Noite', amount: 48.90, slug: 'lazer_semanal', tag: '🍕 iFood Semana R$ 48,90' },
  { description: 'Mercado Festival Rápido', amount: 74.00, slug: 'vr_mercado', tag: '🛒 Festival R$ 74,00' },
  { description: 'Posto Gasolina + Nissei', amount: 95.00, slug: 'casa_combustivel', tag: '⛽ Posto/Nissei R$ 95,00' },
]

// Live impact preview while typing
const livePreview = computed(() => {
  const amt = Number(spendForm.value.amount) || 0
  if (amt <= 0) return null
  return {
    cpts11: Math.floor(amt / 7.01),
    knsc11: Math.floor(amt / 8.27),
    mxrf11: Math.floor(amt / 8.80),
    avgShares: Math.max(1, Math.round(amt / FII_REF_PRICE)),
    dividend: (amt * FII_MONTHLY_YIELD),
    ringPct: ((amt / RING_TARGET) * 100),
  }
})

const autoClassifiedQuickSlug = computed(() => {
  return classifyExpenseTitle(quickForm.value.title)
})

const activeCycleToDisplay = computed(() => {
  const cycles = paydayChecklist.value?.cycles || []
  if (selectedCycleId.value) {
    const found = cycles.find(c => c.id === selectedCycleId.value)
    if (found) return found
  }
  return paydayChecklist.value?.active_cycle || cycles[0] || null
})

const currentCycleCompletedCount = computed(() => {
  const tasks = activeCycleToDisplay.value?.tasks || []
  return tasks.filter(t => !!checkedTasks.value[t.id]).length
})

function formatBRL(value) {
  const num = Number(value) || 0
  return num.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
}

function classifyExpenseTitle(title) {
  const lower = String(title || '').toLowerCase().trim()
  if (!lower) return 'lazer_semanal'
  if (/(festival|angeloni|condor|muffato|carrefour|assai|assaí|atacad|mercado|supermercado|padaria|acougue|açougue|hortifruti|vr)/.test(lower)) {
    return 'vr_mercado'
  }
  if (/(posto|ipiranga|shell|petrobras|gasolina|combust|etanol|nissei|raia|drogasil|panvel|farmacia|farmácia|drogaria|casa|leroy)/.test(lower)) {
    return 'casa_combustivel'
  }
  if (/(piso|fatura|assinatura|recorrente|seguro)/.test(lower)) {
    return 'piso_cartao'
  }
  return 'lazer_semanal'
}

function getEnvelopeSubtitle(env) {
  switch (env.slug) {
    case 'lazer_semanal':
      return 'R$ 100/sem • Renova toda Sexta-feira'
    case 'vr_mercado':
      return 'R$ 150/sem | R$ 600/mês • Escudo Alimentação'
    case 'casa_combustivel':
      return 'R$ 400/mês • Casa, Farmácia & Gasolina'
    case 'piso_cartao':
      return 'Trava R$ 634,67 • Custos Fixos no Crédito'
    default:
      return env.reset_cycle === 'weekly_friday' ? 'Ciclo Semanal (Sexta)' : 'Ciclo Mensal (Dia 01)'
  }
}

function getEnvelopeIcon(slug) {
  switch (slug) {
    case 'lazer_semanal': return 'fa-solid fa-gamepad'
    case 'vr_mercado': return 'fa-solid fa-shield-halved'
    case 'casa_combustivel': return 'fa-solid fa-gas-pump'
    case 'piso_cartao': return 'fa-solid fa-lock'
    default: return 'fa-solid fa-heart-pulse'
  }
}

function getQuestMeta(quest) {
  const title = String(quest.title || '').toLowerCase()
  if (title.includes('anel')) {
    return {
      badge: 'QUEST 1 • DEZEMBRO',
      icon: '💍',
      accent: 'emerald',
      blocks: 10,
      subtitle: 'Pedido de casamento em dezembro (Meta R$ 350,00)',
      formatProgress: `${formatBRL(quest.current_value)} / ${formatBRL(quest.target_value)}`,
    }
  }
  if (title.includes('fii') || quest.unit_type === 'SHARES') {
    return {
      badge: 'QUEST 2 • RENDA PASSIVA XP',
      icon: '🏢',
      accent: 'cyan',
      blocks: 10,
      subtitle: `CPTS11 • KNSC11 • MXRF11 (Ref. ${formatBRL(quest.unit_price_ref || FII_REF_PRICE)}/cota)`,
      formatProgress: `${Number(quest.current_value).toFixed(0)}/${Number(quest.target_value).toFixed(0)} cotas`,
    }
  }
  return {
    badge: 'QUEST 3 • RESERVA BLINDADA',
    icon: '🚀',
    accent: 'amber',
    blocks: 10,
    subtitle: 'Meta Fase 1: R$ 5.000 • Meta Final: R$ 10.000 (120% CDI)',
    formatProgress: `${formatBRL(quest.current_value)} / R$ 5.000 (${formatBRL(quest.target_value)})`,
  }
}

function getFilledBlocks(pct, totalBlocks = 10) {
  const clamped = Math.max(0, Math.min(100, Number(pct) || 0))
  return Math.round((clamped / 100) * totalBlocks)
}

function getPaydayStorageKey() {
  const now = new Date()
  const ym = `${now.getFullYear()}_${String(now.getMonth() + 1).padStart(2, '0')}`
  return `gf_guardian_payday_${ym}`
}

function loadCheckedTasks() {
  try {
    const raw = localStorage.getItem(getPaydayStorageKey())
    if (raw) checkedTasks.value = JSON.parse(raw)
  } catch {
    checkedTasks.value = {}
  }
}

function togglePaydayTask(taskId) {
  checkedTasks.value = {
    ...checkedTasks.value,
    [taskId]: !checkedTasks.value[taskId],
  }
  try {
    localStorage.setItem(getPaydayStorageKey(), JSON.stringify(checkedTasks.value))
  } catch {
    // ignore storage errors
  }
}

function buildFallbackDashboardState() {
  try {
    const cached = localStorage.getItem('gf_guardian_local_state_v1')
    if (cached) return JSON.parse(cached)
  } catch {
    // ignore
  }
  const day = new Date().getDate()
  const cycles = [
    {
      id: 'ciclo_dvet',
      title: 'Ciclo Dvet (R$ 3.600)',
      subtitle: 'Dia 01 a 04 — Blindagem de Custos Fixos & Semana 1',
      day_range: 'Dia 01 a 04',
      income: 3600,
      is_active: day >= 1 && day <= 4,
      tasks: [
        { id: 'dvet_luz', title: 'Pagar Luz (~R$ 207)', description: 'Quitar fatura da Copel logo na entrada do ciclo.', amount_label: '~R$ 207,00', amount: 207 },
        { id: 'dvet_aluguel', title: 'Separar Aluguel (R$ 2.126,14)', description: 'Intocável: blindar o valor exato da moradia.', amount_label: 'R$ 2.126,14', amount: 2126.14 },
        { id: 'dvet_mei', title: 'Pagar DAS MEI (R$ 86)', description: 'Manter CNPJ em dia sem multa.', amount_label: 'R$ 86,00', amount: 86 },
        { id: 'dvet_semana1', title: 'Separar Envelope Semana 1 (R$ 100 Lazer + R$ 100 Casa/Combustível)', description: 'Abastecer a barra de HP da primeira semana do mês.', amount_label: 'R$ 200,00', amount: 200 },
      ],
    },
    {
      id: 'ciclo_auditop',
      title: 'Ciclo Auditop (R$ 1.300)',
      subtitle: 'Dia 05 a 12 — Reserva PUCPR, Envelopes & Aporte FIIs/Meli+',
      day_range: 'Dia 05 a 12',
      income: 1300,
      is_active: day >= 5 && day <= 12,
      tasks: [
        { id: 'auditop_pucpr', title: 'Isolar R$ 333 da PUCPR no Cofrinho Meli+', description: 'Guardar metade da mensalidade rendendo 120% do CDI até o dia 13.', amount_label: 'R$ 333,00', amount: 333 },
        { id: 'auditop_claro', title: 'Reservar Claro Fibra (R$ 94,90)', description: 'Garantir internet fixa sem surpresa na fatura.', amount_label: 'R$ 94,90', amount: 94.90 },
        { id: 'auditop_semanas', title: 'Abastecer Envelopes Semanas 2, 3 e 4', description: 'Recarregar o HP de Lazer (R$ 100/sem) e Casa/Combustível.', amount_label: 'R$ 600,00', amount: 600 },
        { id: 'auditop_aporte', title: 'Aportar Sobra Limpa (70% Cofrinho Meli+ 120% CDI / 30% FIIs na XP)', description: 'Comprar cotas de CPTS11, KNSC11 ou MXRF11 e fortalecer reserva.', amount_label: '70% / 30%', amount: 272.10 },
      ],
    },
    {
      id: 'ciclo_pucpr',
      title: 'Ciclo PUCPR (Quitação)',
      subtitle: 'Dia 13 — Fechamento do Boleto da Faculdade',
      day_range: 'Dia 13',
      income: 633,
      is_active: day >= 13,
      tasks: [
        { id: 'pucpr_boleto', title: 'Juntar R$ 300 do Pix da mãe + R$ 333 reservados e pagar boleto PUCPR (R$ 632,78)', description: 'Resgatar os R$ 333 do Cofrinho Meli+, somar ao Pix da mãe e liquidar o boleto.', amount_label: 'R$ 632,78', amount: 632.78 },
      ],
    },
  ]
  const activeCycle = cycles.find(c => c.is_active) || cycles[2]
  return {
    envelopes: [
      { id: 1, slug: 'lazer_semanal', name: 'HP Lazer da Semana', limit_amount: 100.00, spent_amount: 0.00, remaining_amount: 100.00, hp_percentage: 100, status: 'green', reset_cycle: 'weekly_friday' },
      { id: 2, slug: 'vr_mercado', name: 'Escudo Vale-Refeição', limit_amount: 600.00, spent_amount: 0.00, remaining_amount: 600.00, hp_percentage: 100, status: 'green', reset_cycle: 'monthly_day_1' },
      { id: 3, slug: 'casa_combustivel', name: 'Casa, Farmácia & Gasolina', limit_amount: 400.00, spent_amount: 0.00, remaining_amount: 400.00, hp_percentage: 100, status: 'green', reset_cycle: 'monthly_day_1' },
      { id: 4, slug: 'piso_cartao', name: 'Piso Fixo do Cartão', limit_amount: 634.67, spent_amount: 0.00, remaining_amount: 634.67, hp_percentage: 100, status: 'green', reset_cycle: 'monthly_day_1' },
    ],
    quests: [
      { id: 1, title: 'Anel Solitário Pedra Verde', target_value: 350.00, current_value: 0.00, progress_percentage: 0, unit_type: 'BRL', unit_price_ref: 1.00 },
      { id: 2, title: 'Meta 50 Cotas de FIIs', target_value: 50.00, current_value: 21.00, progress_percentage: 42.0, unit_type: 'SHARES', unit_price_ref: 8.05 },
      { id: 3, title: 'Cofrinho Meli+ 120% CDI', target_value: 10000.00, current_value: 200.00, progress_percentage: 2.0, unit_type: 'BRL', unit_price_ref: 1.00 },
    ],
    total_saved_month: 0,
    saved_fii_shares: 0,
    saved_fii_shares_count: 0,
    estimated_monthly_dividend: 0,
    payday_checklist: {
      current_day: day,
      active_cycle: activeCycle,
      cycles,
    },
    recent_logs: [],
  }
}

function saveLocalFallbackState() {
  try {
    localStorage.setItem('gf_guardian_local_state_v1', JSON.stringify({
      envelopes: envelopes.value,
      quests: quests.value,
      total_saved_month: totalSavedMonth.value,
      saved_fii_shares: savedFiiShares.value,
      saved_fii_shares_count: savedFiiSharesCount.value,
      estimated_monthly_dividend: estimatedMonthlyDividend.value,
      payday_checklist: paydayChecklist.value,
      recent_logs: recentLogs.value,
    }))
  } catch {
    // ignore
  }
}

function applyDashboardData(res) {
  envelopes.value = res.envelopes || []
  quests.value = res.quests || []
  totalSavedMonth.value = Number(res.total_saved_month || 0)
  savedFiiShares.value = Number(res.saved_fii_shares || 0)
  savedFiiSharesCount.value = Number(res.saved_fii_shares_count || Math.floor(totalSavedMonth.value / FII_REF_PRICE))
  estimatedMonthlyDividend.value = Number(res.estimated_monthly_dividend || (totalSavedMonth.value * FII_MONTHLY_YIELD))
  if (res.payday_checklist) {
    paydayChecklist.value = res.payday_checklist
    if (!selectedCycleId.value && res.payday_checklist.active_cycle?.id) {
      selectedCycleId.value = res.payday_checklist.active_cycle.id
    }
  }
  recentLogs.value = res.recent_logs || []
  if (!selectedSaveQuestId.value && quests.value.length) {
    const fiiQuest = quests.value.find(q => q.unit_type === 'SHARES') || quests.value[0]
    selectedSaveQuestId.value = fiiQuest.id
  }
  saveLocalFallbackState()
}

async function fetchDashboard() {
  loading.value = true
  try {
    const res = await guardianApi.getDashboard(auth.token)
    applyDashboardData(res)
  } catch {
    const fallback = buildFallbackDashboardState()
    applyDashboardData(fallback)
  } finally {
    loading.value = false
  }
}

function applyPreset(preset) {
  spendForm.value.description = preset.description
  spendForm.value.amount = preset.amount
  spendForm.value.envelope_slug = preset.slug
}

function buildLocalRobertoEvaluation(desc, amount, slug) {
  const env = envelopes.value.find(e => e.slug === slug) || envelopes.value[0] || {
    name: 'HP Lazer da Semana',
    limit_amount: 100,
    spent_amount: 0,
    remaining_amount: 100,
  }
  const cpts11 = Math.max(1, Math.floor(amount / 7.01))
  const knsc11 = Math.max(1, Math.floor(amount / 8.27))
  const mxrf11 = Math.max(1, Math.floor(amount / 8.80))
  const avgShares = Math.max(1, Math.round(amount / FII_REF_PRICE))
  const div = Math.round((amount * FII_MONTHLY_YIELD) * 100) / 100
  const ringPct = Math.round(((amount / RING_TARGET) * 100) * 10) / 10

  const now = new Date()
  const dayOfWeek = now.getDay() // 1..4 = Mon..Thu
  const isMonToThu = dayOfWeek >= 1 && dayOfWeek <= 4
  const lower = desc.toLowerCase()
  const isDelivery = /(99food|ifood|delivery|hamburguer|hambúrguer|pizza|lanche)/.test(lower)
  const isSteam = /(steam|jogo|game)/.test(lower)
  const exceeds = amount > env.remaining_amount

  const fiiText = `Esses ${formatBRL(amount)} comprariam ${cpts11} cotas de CPTS11 (R$ 7,01), ${knsc11} de KNSC11 (R$ 8,27) ou ${mxrf11} de MXRF11 (R$ 8,80), gerando ~${formatBRL(div)}/mês perpétuos isentos de IR, além de equivalerem a ${ringPct}% do Anel Solitário com Pedra Verde (R$ 350) para dezembro!`

  let verdict = 'APPROVED'
  let headline = `✅ Liberado pelo guardião! Ainda sobram ${formatBRL(Math.max(0, env.remaining_amount - amount))} de HP.`
  let argument = `O gasto com '${desc}' cabe dentro do envelope ${env.name}. Mesmo assim, avalie o custo de oportunidade: ${fiiText}`

  if (isSteam && (exceeds || slug !== 'lazer_semanal')) {
    verdict = 'DENIED'
    headline = '🛑 Regra das 72 Horas na Wishlist ativada, Rupélio!'
    argument = `Comprar '${desc}' fora do envelope de R$ 100 da semana é armadilha! Aplique a Regra das 72 Horas na Wishlist antes de abrir a carteira. ${fiiText}`
  } else if (isDelivery && isMonToThu) {
    verdict = exceeds ? 'DENIED' : 'WARNING'
    headline = '🍔 Delivery de segunda a quinta? Cadê o VR de R$ 600 e o foco na academia?'
    argument = `Plena semana útil, Rupélio! Você tem R$ 600 de Vale-Refeição pra manter comida rápida em casa e está focado na rotina de academia com a esposa. ${fiiText}`
  } else if (exceeds) {
    verdict = 'DENIED'
    headline = `🚨 Barra de HP estourada! Só restam ${formatBRL(env.remaining_amount)} em ${env.name}.`
    argument = `Esse gasto de ${formatBRL(amount)} em '${desc}' ultrapassa seu HP disponível (${formatBRL(env.remaining_amount)}). ${fiiText}`
  } else if (((env.remaining_amount - amount) / env.limit_amount) * 100 < 30) {
    verdict = 'WARNING'
    headline = `⚠️ Cuidado: seu HP em ${env.name} vai entrar na zona vermelha!`
    argument = `Você tem saldo, mas restarão apenas ${formatBRL(env.remaining_amount - amount)}. ${fiiText}`
  }

  return {
    log_id: Date.now(),
    verdict,
    headline,
    argument,
    fii_equivalent_shares: avgShares,
    ring_percentage: ringPct,
    monthly_dividend: div,
    envelope_slug: slug,
    amount,
    description: desc,
  }
}

async function handleAskRoberto() {
  const desc = String(spendForm.value.description || '').trim()
  const amount = Number(spendForm.value.amount)
  const slug = spendForm.value.envelope_slug || 'lazer_semanal'

  if (!desc || !amount || amount <= 0) {
    app.showMessage('Preencha a descrição e um valor válido para consultar o Roberto.', 'error')
    return
  }

  evaluating.value = true
  activeEvaluation.value = null
  try {
    const res = await guardianApi.evaluateSpend(auth.token, {
      description: desc,
      amount,
      envelope_slug: slug,
    })
    activeEvaluation.value = res
    await fetchDashboard()
  } catch {
    const fallbackEval = buildLocalRobertoEvaluation(desc, amount, slug)
    activeEvaluation.value = fallbackEval
    recentLogs.value.unshift({
      id: fallbackEval.log_id,
      item_description: desc,
      amount,
      category_slug: slug,
      ai_verdict: fallbackEval.verdict,
      ai_message: fallbackEval.argument,
      headline: fallbackEval.headline,
      argument: fallbackEval.argument,
      fii_equivalent_shares: fallbackEval.fii_equivalent_shares,
      user_decision: 'PENDING',
      created_at: new Date().toISOString(),
    })
    saveLocalFallbackState()
  } finally {
    evaluating.value = false
  }
}

function recomputeEnvelopeClient(env) {
  const rem = Math.max(0, Number(env.limit_amount) - Number(env.spent_amount))
  env.remaining_amount = Math.round(rem * 100) / 100
  const pct = env.limit_amount > 0 ? ((env.limit_amount - env.spent_amount) / env.limit_amount) * 100 : 0
  env.hp_percentage = Math.max(0, Math.min(100, Math.round(pct * 100) / 100))
  env.status = env.hp_percentage > 50 ? 'green' : env.hp_percentage >= 20 ? 'yellow' : 'red'
}

async function handleConfirmDecision(decision) {
  if (!activeEvaluation.value || confirming.value) return
  confirming.value = true

  const evalSnap = { ...activeEvaluation.value }
  try {
    const res = await guardianApi.confirmDecision(auth.token, {
      log_id: evalSnap.log_id,
      decision,
      quest_id: decision === 'SAVED' && selectedSaveQuestId.value ? Number(selectedSaveQuestId.value) : undefined,
    })
    envelopes.value = res.envelopes || envelopes.value
    quests.value = res.quests || quests.value
    totalSavedMonth.value = Number(res.total_saved_month ?? totalSavedMonth.value)
    savedFiiShares.value = Number(res.saved_fii_shares ?? savedFiiShares.value)
    savedFiiSharesCount.value = Number(res.saved_fii_shares_count ?? savedFiiSharesCount.value)
    estimatedMonthlyDividend.value = Math.round((totalSavedMonth.value * FII_MONTHLY_YIELD) * 100) / 100
    await fetchDashboard()
  } catch {
    // Fallback local state update
    if (decision === 'SPENT') {
      const env = envelopes.value.find(e => e.slug === evalSnap.envelope_slug)
      if (env) {
        env.spent_amount = Math.round((Number(env.spent_amount) + Number(evalSnap.amount)) * 100) / 100
        recomputeEnvelopeClient(env)
      }
    } else if (decision === 'SAVED') {
      totalSavedMonth.value = Math.round((totalSavedMonth.value + Number(evalSnap.amount)) * 100) / 100
      savedFiiShares.value = Math.round((totalSavedMonth.value / FII_REF_PRICE) * 100) / 100
      savedFiiSharesCount.value = Math.floor(totalSavedMonth.value / FII_REF_PRICE)
      estimatedMonthlyDividend.value = Math.round((totalSavedMonth.value * FII_MONTHLY_YIELD) * 100) / 100
      const targetQuest = quests.value.find(q => q.id === selectedSaveQuestId.value) || quests.value.find(q => q.unit_type === 'SHARES')
      if (targetQuest) {
        const delta = targetQuest.unit_type === 'SHARES'
          ? Math.round((Number(evalSnap.amount) / (targetQuest.unit_price_ref || FII_REF_PRICE)) * 100) / 100
          : Number(evalSnap.amount)
        targetQuest.current_value = Math.round((Number(targetQuest.current_value) + delta) * 100) / 100
        targetQuest.progress_percentage = Math.min(100, Math.round(((targetQuest.current_value / targetQuest.target_value) * 100) * 100) / 100)
      }
    }
    const logItem = recentLogs.value.find(l => l.id === evalSnap.log_id)
    if (logItem) logItem.user_decision = decision
    saveLocalFallbackState()
  } finally {
    confirming.value = false
    activeEvaluation.value = null
    spendForm.value.description = ''
    spendForm.value.amount = null

    if (decision === 'SAVED') {
      celebrationEffect.value = {
        amount: evalSnap.amount,
        shares: evalSnap.fii_equivalent_shares || Math.max(1, Math.round(evalSnap.amount / FII_REF_PRICE)),
        description: evalSnap.description,
      }
      setTimeout(() => { celebrationEffect.value = null }, 4500)
    } else {
      const env = envelopes.value.find(e => e.slug === evalSnap.envelope_slug)
      damageEffect.value = {
        amount: evalSnap.amount,
        envelopeName: env?.name || evalSnap.envelope_slug,
      }
      setTimeout(() => { damageEffect.value = null }, 3200)
    }
  }
}

async function handleQuickExpense() {
  const title = String(quickForm.value.title || '').trim()
  const amount = Number(quickForm.value.amount)
  if (!title || !amount || amount <= 0) {
    app.showMessage('Informe o título e o valor do gasto rápido.', 'error')
    return
  }

  quickAdding.value = true
  const slug = autoClassifiedQuickSlug.value
  try {
    localStorage.setItem('gf_guardian_webhook_token', quickForm.value.guardianToken || 'gofund-guardian-secret')
    const res = await guardianApi.quickExpense(
      auth.token,
      { title, amount },
      quickForm.value.guardianToken || 'gofund-guardian-secret'
    )
    const idx = envelopes.value.findIndex(e => e.slug === res.envelope_slug)
    if (idx !== -1 && res.envelope) {
      envelopes.value[idx] = res.envelope
    } else {
      await fetchDashboard()
    }
    damageEffect.value = {
      amount,
      envelopeName: res.envelope?.name || slug,
    }
    setTimeout(() => { damageEffect.value = null }, 3000)
    quickForm.value.title = ''
    quickForm.value.amount = null
    app.showMessage(`Dano de ${formatBRL(amount)} registrado em ${res.envelope?.name || slug}!`, 'success')
  } catch {
    // Local fallback
    const env = envelopes.value.find(e => e.slug === slug)
    if (env) {
      env.spent_amount = Math.round((Number(env.spent_amount) + amount) * 100) / 100
      recomputeEnvelopeClient(env)
      saveLocalFallbackState()
      damageEffect.value = { amount, envelopeName: env.name }
      setTimeout(() => { damageEffect.value = null }, 3000)
    }
    quickForm.value.title = ''
    quickForm.value.amount = null
  } finally {
    quickAdding.value = false
  }
}

onMounted(() => {
  loadCheckedTasks()
  fetchDashboard()
})
</script>

<template>
  <div class="guardian-hud min-h-screen text-slate-100 pb-12 relative">
    <!-- Celebratory Victory Overlay ("SAVED") -->
    <transition name="hud-pop">
      <div
        v-if="celebrationEffect"
        class="fixed top-5 right-5 z-50 max-w-md rounded-2xl border-2 border-emerald-400 bg-slate-950/95 p-5 shadow-2xl shadow-emerald-500/30 backdrop-blur-xl"
      >
        <div class="flex items-start gap-4">
          <div class="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-emerald-500/20 text-2xl border border-emerald-400/40">
            🔥
          </div>
          <div>
            <p class="text-xs font-bold uppercase tracking-widest text-emerald-400 font-mono">
              IMPULSO DERROTADO • CRITICAL SAVE!
            </p>
            <h4 class="mt-1 text-base font-extrabold text-white">
              +{{ formatBRL(celebrationEffect.amount) }} blindados de "{{ celebrationEffect.description }}"!
            </h4>
            <p class="mt-1 text-xs text-emerald-200/90">
              Equivalente a <strong>+{{ celebrationEffect.shares }} cota(s) de FIIs</strong> adicionadas ao seu Termômetro de Renda Passiva!
            </p>
          </div>
        </div>
      </div>
    </transition>

    <!-- Damage Taken Overlay ("SPENT") -->
    <transition name="hud-pop">
      <div
        v-if="damageEffect"
        class="fixed top-5 right-5 z-50 max-w-md rounded-2xl border-2 border-rose-500 bg-slate-950/95 p-5 shadow-2xl shadow-rose-500/30 backdrop-blur-xl"
      >
        <div class="flex items-start gap-4">
          <div class="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-rose-500/20 text-2xl border border-rose-500/40">
            💥
          </div>
          <div>
            <p class="text-xs font-bold uppercase tracking-widest text-rose-400 font-mono">
              HP DAMAGE TAKEN • -{{ formatBRL(damageEffect.amount) }}
            </p>
            <h4 class="mt-1 text-base font-extrabold text-white">
              Barra de {{ damageEffect.envelopeName }} sofreu dano!
            </h4>
            <p class="mt-1 text-xs text-rose-200/80">
              Mantenha a guarda alta nos próximos dias para não zerar o envelope.
            </p>
          </div>
        </div>
      </div>
    </transition>

    <!-- 1. HEADER DE STATUS & CONTADOR DE COTAS SALVAS -->
    <header class="hud-hero-banner mb-6 rounded-2xl border border-emerald-500/30 bg-gradient-to-br from-slate-900/95 via-slate-900/90 to-emerald-950/40 p-5 sm:p-6 shadow-xl relative overflow-hidden">
      <div class="hud-grid-bg"></div>
      <div class="relative z-10 flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
        <div>
          <div class="inline-flex items-center gap-2 rounded-full border border-emerald-400/40 bg-emerald-500/15 px-3.5 py-1.5 text-xs sm:text-sm font-bold text-emerald-300 shadow-inner">
            <span>🛡️</span>
            <span>
              {{ formatBRL(totalSavedMonth) }} salvos de impulsos este mês
              (Equivalente a +{{ savedFiiShares.toFixed(1) }} cotas de FIIs gerando {{ formatBRL(estimatedMonthlyDividend) }}/mês)
            </span>
          </div>
          <h1 class="mt-3 text-2xl sm:text-3xl font-extrabold tracking-tight text-white flex items-center gap-3">
            <span class="hud-title-font">GUARDIÃO FINANCEIRO</span>
            <span class="rounded-md bg-violet-500/20 border border-violet-400/30 px-2.5 py-0.5 text-xs font-mono font-semibold text-violet-300">
              COPILOTO ROBERTO v2.5
            </span>
          </h1>
          <p class="mt-1 text-sm text-slate-300">
            Painel tático de sobrevivência financeira em tempo real • Conversor anti-impulso de FIIs &amp; Metas
          </p>
        </div>

        <!-- FII Reference Ticker Strip -->
        <div class="flex flex-wrap items-center gap-2 sm:gap-3">
          <div class="rounded-xl border border-slate-700/70 bg-slate-950/70 px-3 py-2 text-xs font-mono">
            <span class="text-slate-400 block text-[10px]">CPTS11</span>
            <strong class="text-emerald-400">R$ 7,01</strong>
          </div>
          <div class="rounded-xl border border-slate-700/70 bg-slate-950/70 px-3 py-2 text-xs font-mono">
            <span class="text-slate-400 block text-[10px]">KNSC11</span>
            <strong class="text-cyan-400">R$ 8,27</strong>
          </div>
          <div class="rounded-xl border border-slate-700/70 bg-slate-950/70 px-3 py-2 text-xs font-mono">
            <span class="text-slate-400 block text-[10px]">MXRF11</span>
            <strong class="text-violet-400">R$ 8,80</strong>
          </div>
          <div class="rounded-xl border border-emerald-500/30 bg-emerald-950/40 px-3 py-2 text-xs font-mono">
            <span class="text-emerald-300/70 block text-[10px]">YIELD ISENTO</span>
            <strong class="text-emerald-300">~1,12% a.m.</strong>
          </div>
        </div>
      </div>
    </header>

    <!-- 2. GRID DE BARRAS DE HP (OS ENVELOPES) -->
    <section class="mb-7">
      <div class="flex items-center justify-between mb-3">
        <h2 class="text-sm font-bold uppercase tracking-wider text-slate-300 font-mono flex items-center gap-2">
          <i class="fa-solid fa-heart-pulse text-emerald-400"></i>
          Barras de HP do Orçamento (Envelopes Ativos)
        </h2>
        <span class="text-xs text-slate-400 font-mono">
          🟢 &gt;50% Seguro • 🟡 20-50% Atenção • 🔴 &lt;20% Crítico
        </span>
      </div>

      <div class="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
        <article
          v-for="env in envelopes"
          :key="env.slug"
          class="hp-card rounded-2xl border p-4 transition-all duration-300 relative overflow-hidden"
          :class="{
            'border-emerald-500/35 bg-slate-900/90 shadow-lg shadow-emerald-950/30': env.status === 'green',
            'border-amber-500/45 bg-slate-900/90 shadow-lg shadow-amber-950/30': env.status === 'yellow',
            'border-rose-500/60 bg-rose-950/20 shadow-lg shadow-rose-950/40 animate-pulse-slow': env.status === 'red',
          }"
        >
          <div class="flex items-start justify-between gap-2 mb-2">
            <div class="flex items-center gap-2.5">
              <div
                class="flex h-9 w-9 items-center justify-center rounded-xl text-sm border"
                :class="{
                  'bg-emerald-500/15 border-emerald-500/40 text-emerald-400': env.status === 'green',
                  'bg-amber-500/15 border-amber-500/40 text-amber-400': env.status === 'yellow',
                  'bg-rose-500/20 border-rose-500/50 text-rose-400': env.status === 'red',
                }"
              >
                <i :class="getEnvelopeIcon(env.slug)"></i>
              </div>
              <div>
                <h3 class="text-sm font-bold text-white leading-tight">{{ env.name }}</h3>
                <p class="text-[11px] text-slate-400">{{ getEnvelopeSubtitle(env) }}</p>
              </div>
            </div>
            <span
              class="rounded-lg px-2 py-0.5 text-xs font-mono font-bold border"
              :class="{
                'bg-emerald-500/15 border-emerald-400/40 text-emerald-300': env.status === 'green',
                'bg-amber-500/15 border-amber-400/40 text-amber-300': env.status === 'yellow',
                'bg-rose-500/20 border-rose-400/50 text-rose-300': env.status === 'red',
              }"
            >
              {{ env.hp_percentage.toFixed(0) }}% HP
            </span>
          </div>

          <!-- RPG Health Bar Track -->
          <div class="mt-3 mb-2">
            <div class="h-4 w-full rounded-lg bg-slate-950 p-0.5 border border-slate-800 relative overflow-hidden">
              <div
                class="h-full rounded-md transition-all duration-700 ease-out relative"
                :class="{
                  'bg-gradient-to-r from-emerald-600 via-emerald-500 to-teal-400': env.status === 'green',
                  'bg-gradient-to-r from-amber-600 via-amber-500 to-yellow-400': env.status === 'yellow',
                  'bg-gradient-to-r from-rose-700 via-rose-500 to-orange-500': env.status === 'red',
                }"
                :style="{ width: `${Math.max(0, Math.min(100, env.hp_percentage))}%` }"
              ></div>
              <div class="hp-bar-segments"></div>
            </div>
          </div>

          <div class="flex items-center justify-between text-xs font-mono mt-2">
            <span class="text-slate-300">
              Restante: <strong class="text-white">{{ formatBRL(env.remaining_amount) }}</strong>
            </span>
            <span class="text-slate-400">
              Dano: {{ formatBRL(env.spent_amount) }} / {{ formatBRL(env.limit_amount) }}
            </span>
          </div>
        </article>
      </div>
    </section>

    <!-- MAIN 2-COLUMN TACTICAL LAYOUT -->
    <div class="grid grid-cols-1 lg:grid-cols-12 gap-6">
      <!-- 3. COMPONENTE CENTRAL: CONSULTAR O ROBERTO (POSSO GASTAR?) -->
      <section class="lg:col-span-7 flex flex-col gap-6">
        <div class="rounded-2xl border border-violet-500/35 bg-slate-900/95 p-5 sm:p-6 shadow-xl relative overflow-hidden">
          <div class="flex items-center justify-between gap-3 mb-4">
            <div class="flex items-center gap-3">
              <div class="flex h-11 w-11 items-center justify-center rounded-2xl bg-violet-500/20 border border-violet-400/40 text-xl">
                🤖
              </div>
              <div>
                <span class="text-[11px] font-mono uppercase tracking-widest text-violet-300 font-bold">
                  ORÁCULO ANTI-IMPULSO • GEMINI 2.5 FLASH
                </span>
                <h2 class="text-lg sm:text-xl font-extrabold text-white">
                  Consultar o Roberto ("Posso Gastar?")
                </h2>
              </div>
            </div>
          </div>

          <!-- Quick Presets -->
          <div class="mb-4">
            <p class="text-xs text-slate-400 mb-2 font-mono">Atalhos de simulação rápida:</p>
            <div class="flex flex-wrap gap-2">
              <button
                v-for="preset in quickPresets"
                :key="preset.tag"
                type="button"
                class="rounded-lg border border-slate-700/80 bg-slate-950/70 hover:border-violet-400/60 hover:bg-violet-950/30 px-2.5 py-1.5 text-xs text-slate-200 transition cursor-pointer"
                @click="applyPreset(preset)"
              >
                {{ preset.tag }}
              </button>
            </div>
          </div>

          <!-- Spend Evaluation Form -->
          <form class="space-y-4" @submit.prevent="handleAskRoberto">
            <div class="grid grid-cols-1 sm:grid-cols-12 gap-3">
              <label class="sm:col-span-5 block">
                <span class="text-xs font-semibold text-slate-300 mb-1 block">O que você quer comprar?</span>
                <input
                  v-model="spendForm.description"
                  type="text"
                  placeholder="Ex: 99Food Hambúrguer, Jogo Steam..."
                  class="w-full rounded-xl border border-slate-700 bg-slate-950 px-3.5 py-2.5 text-sm text-white placeholder-slate-500 focus:border-violet-400 focus:outline-none"
                  required
                />
              </label>

              <label class="sm:col-span-3 block">
                <span class="text-xs font-semibold text-slate-300 mb-1 block">Valor (R$)</span>
                <input
                  v-model.number="spendForm.amount"
                  type="number"
                  min="0.01"
                  step="0.01"
                  placeholder="62,50"
                  class="w-full rounded-xl border border-slate-700 bg-slate-950 px-3.5 py-2.5 text-sm font-mono text-white placeholder-slate-500 focus:border-violet-400 focus:outline-none"
                  required
                />
              </label>

              <label class="sm:col-span-4 block">
                <span class="text-xs font-semibold text-slate-300 mb-1 block">Barra de HP (Envelope)</span>
                <select
                  v-model="spendForm.envelope_slug"
                  class="w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-2.5 text-sm text-white focus:border-violet-400 focus:outline-none"
                >
                  <option v-for="opt in envelopeOptions" :key="opt.slug" :value="opt.slug">
                    {{ opt.label }}
                  </option>
                </select>
              </label>
            </div>

            <!-- Live Psychological Conversion Preview -->
            <div
              v-if="livePreview"
              class="rounded-xl border border-slate-800 bg-slate-950/80 p-3 flex flex-wrap items-center justify-between gap-2 text-xs font-mono"
            >
              <span class="text-slate-300">
                ⚡ Impacto Real:
                <strong class="text-emerald-400">{{ livePreview.cpts11 }} CPTS11</strong> •
                <strong class="text-cyan-400">{{ livePreview.knsc11 }} KNSC11</strong> •
                <strong class="text-violet-400">{{ livePreview.mxrf11 }} MXRF11</strong>
              </span>
              <span class="text-amber-300">
                💍 {{ livePreview.ringPct.toFixed(1) }}% do Anel Solitário (R$ 350)
              </span>
            </div>

            <button
              type="submit"
              :disabled="evaluating"
              class="w-full rounded-xl bg-gradient-to-r from-violet-600 via-indigo-600 to-purple-600 hover:from-violet-500 hover:to-purple-500 py-3 px-5 text-sm font-extrabold uppercase tracking-wider text-white shadow-lg shadow-violet-600/25 transition cursor-pointer disabled:opacity-50"
            >
              <span v-if="evaluating">
                <i class="fa-solid fa-spinner fa-spin mr-2"></i> Roberto está calculando suas cotas...
              </span>
              <span v-else>
                🛡️ Perguntar ao Roberto Antes de Gastar
              </span>
            </button>
          </form>

          <!-- ROBERTO VERDICT CARD -->
          <transition name="hud-pop">
            <div
              v-if="activeEvaluation"
              class="mt-6 rounded-2xl border-2 p-5 transition-all"
              :class="{
                'border-emerald-500/70 bg-emerald-950/25': activeEvaluation.verdict === 'APPROVED',
                'border-amber-500/70 bg-amber-950/25': activeEvaluation.verdict === 'WARNING',
                'border-rose-500/80 bg-rose-950/30': activeEvaluation.verdict === 'DENIED',
              }"
            >
              <div class="flex flex-wrap items-center justify-between gap-2 mb-3">
                <span
                  class="inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-mono font-extrabold uppercase tracking-wider"
                  :class="{
                    'bg-emerald-500/20 text-emerald-300 border border-emerald-400/50': activeEvaluation.verdict === 'APPROVED',
                    'bg-amber-500/20 text-amber-300 border border-amber-400/50': activeEvaluation.verdict === 'WARNING',
                    'bg-rose-500/25 text-rose-300 border border-rose-400/50': activeEvaluation.verdict === 'DENIED',
                  }"
                >
                  <i
                    :class="{
                      'fa-solid fa-circle-check': activeEvaluation.verdict === 'APPROVED',
                      'fa-solid fa-triangle-exclamation': activeEvaluation.verdict === 'WARNING',
                      'fa-solid fa-ban': activeEvaluation.verdict === 'DENIED',
                    }"
                  ></i>
                  VEREDITO DO ROBERTO: {{ activeEvaluation.verdict }}
                </span>

                <span class="text-xs font-mono text-slate-300">
                  {{ formatBRL(activeEvaluation.amount) }} • <strong>{{ activeEvaluation.fii_equivalent_shares }} cotas FII</strong>
                </span>
              </div>

              <h3 class="text-base sm:text-lg font-extrabold text-white mb-2">
                {{ activeEvaluation.headline }}
              </h3>
              <p class="text-sm text-slate-200 leading-relaxed mb-4">
                {{ activeEvaluation.argument }}
              </p>

              <!-- Target Quest Selector for Saved Impulse -->
              <div class="mb-4 flex flex-wrap items-center justify-between gap-2 rounded-xl bg-slate-950/70 px-3.5 py-2.5 border border-slate-800">
                <span class="text-xs text-slate-300">
                  🎯 Se desistir do gasto, impulsionar qual Quest?
                </span>
                <select
                  v-model="selectedSaveQuestId"
                  class="rounded-lg border border-slate-700 bg-slate-900 px-2.5 py-1 text-xs text-emerald-300 font-semibold"
                >
                  <option v-for="q in quests" :key="q.id" :value="q.id">
                    {{ q.title }}
                  </option>
                </select>
              </div>

              <!-- Action Buttons -->
              <div class="grid grid-cols-1 sm:grid-cols-12 gap-3">
                <button
                  type="button"
                  :disabled="confirming"
                  class="sm:col-span-8 rounded-xl bg-gradient-to-r from-emerald-500 to-teal-500 hover:from-emerald-400 hover:to-teal-400 py-3.5 px-4 text-sm font-extrabold text-slate-950 shadow-lg shadow-emerald-500/25 transition cursor-pointer"
                  @click="handleConfirmDecision('SAVED')"
                >
                  🔥 Desisti de Gastar! (+{{ activeEvaluation.fii_equivalent_shares }} Cotas no Termômetro)
                </button>

                <button
                  type="button"
                  :disabled="confirming"
                  class="sm:col-span-4 rounded-xl border border-rose-500/40 bg-slate-900/90 hover:bg-rose-950/50 py-3.5 px-3 text-xs font-semibold text-rose-300 transition cursor-pointer"
                  @click="handleConfirmDecision('SPENT')"
                >
                  Assumir o Dano e Descontar do HP
                </button>
              </div>
            </div>
          </transition>
        </div>

        <!-- QUICK-ADD / WEBHOOK (ALTERNATIVA GRATUITA AO OPEN FINANCE) -->
        <div class="rounded-2xl border border-slate-800 bg-slate-900/90 p-5 shadow-lg">
          <div class="flex flex-wrap items-center justify-between gap-2 mb-3">
            <div>
              <span class="text-[10px] font-mono uppercase tracking-widest text-cyan-400 font-bold">
                INGESTÃO RÁPIDA • WEBHOOK SEM OPEN FINANCE PAGO
              </span>
              <h3 class="text-base font-bold text-white">
                ⚡ Quick-Add &amp; Automação de Notificação Mobile
              </h3>
            </div>
            <button
              type="button"
              class="rounded-lg border border-cyan-500/30 bg-cyan-500/10 px-3 py-1 text-xs font-mono text-cyan-300 hover:bg-cyan-500/20 cursor-pointer"
              @click="showWebhookGuide = !showWebhookGuide"
            >
              {{ showWebhookGuide ? 'Ocultar Webhook' : '📲 Configurar Atalho Nubank' }}
            </button>
          </div>

          <form class="grid grid-cols-1 sm:grid-cols-12 gap-3 items-end" @submit.prevent="handleQuickExpense">
            <label class="sm:col-span-6 block">
              <span class="text-xs text-slate-400 mb-1 block">
                Estabelecimento / Notificação (Auto-classifica HP)
              </span>
              <input
                v-model="quickForm.title"
                type="text"
                placeholder="Ex: 99Food, Supermercado Festival, Posto, Nissei..."
                class="w-full rounded-xl border border-slate-700 bg-slate-950 px-3.5 py-2 text-sm text-white placeholder-slate-500 focus:border-cyan-400 focus:outline-none"
                required
              />
            </label>

            <label class="sm:col-span-3 block">
              <span class="text-xs text-slate-400 mb-1 block">Valor (R$)</span>
              <input
                v-model.number="quickForm.amount"
                type="number"
                min="0.01"
                step="0.01"
                placeholder="55,90"
                class="w-full rounded-xl border border-slate-700 bg-slate-950 px-3.5 py-2 text-sm font-mono text-white placeholder-slate-500 focus:border-cyan-400 focus:outline-none"
                required
              />
            </label>

            <div class="sm:col-span-3">
              <button
                type="submit"
                :disabled="quickAdding"
                class="w-full rounded-xl bg-cyan-500 hover:bg-cyan-400 py-2.5 px-3 text-xs font-extrabold uppercase tracking-wider text-slate-950 transition cursor-pointer"
              >
                {{ quickAdding ? 'Registrando...' : '⚡ Descontar HP' }}
              </button>
            </div>
          </form>

          <p v-if="quickForm.title" class="mt-2 text-xs font-mono text-slate-400">
            Alvo detectado automaticamente:
            <strong class="text-cyan-300">{{ autoClassifiedQuickSlug }}</strong>
          </p>

          <!-- Webhook Setup Instructions for Android/iOS -->
          <div
            v-if="showWebhookGuide"
            class="mt-4 rounded-xl border border-cyan-500/30 bg-slate-950 p-4 text-xs font-mono text-slate-300 space-y-2"
          >
            <p class="text-cyan-300 font-bold">
              Como plugar no Atalho do iOS ou MacroDroid (Android) lendo notificações do Nubank:
            </p>
            <p>
              <strong>Endpoint:</strong> <code>POST /api/guardian/webhook/quick-expense</code>
            </p>
            <p>
              <strong>Header:</strong> <code>X-Guardian-Token: {{ quickForm.guardianToken }}</code>
            </p>
            <p>
              <strong>Body JSON:</strong> <code>{ "title": "99Food", "amount": 55.90 }</code>
            </p>
            <p class="text-slate-400">
              Regras automáticas: <code>99food/ifood/steam</code> → <code>lazer_semanal</code> |
              <code>festival/angeloni</code> → <code>vr_mercado</code> |
              <code>posto/nissei</code> → <code>casa_combustivel</code>.
            </p>
          </div>
        </div>
      </section>

      <!-- RIGHT COLUMN: 4. TERMÔMETROS DE QUESTS & 5. ORÁCULO DO DIA DE PAGAMENTO -->
      <section class="lg:col-span-5 flex flex-col gap-6">
        <!-- 4. SEÇÃO TERMÔMETROS DE QUESTS -->
        <div class="rounded-2xl border border-slate-800 bg-slate-900/95 p-5 sm:p-6 shadow-xl">
          <div class="flex items-center justify-between mb-4">
            <div>
              <span class="text-[10px] font-mono uppercase tracking-widest text-emerald-400 font-bold">
                PROGRESSÃO DE METAS GAMIFICADAS
              </span>
              <h2 class="text-lg font-extrabold text-white">
                🏆 Termômetros de Quests
              </h2>
            </div>
          </div>

          <div class="space-y-4">
            <article
              v-for="quest in quests"
              :key="quest.id"
              class="rounded-xl border border-slate-800 bg-slate-950/80 p-4"
            >
              <div class="flex items-start justify-between gap-2 mb-1.5">
                <div class="flex items-center gap-2.5">
                  <span class="text-xl">{{ getQuestMeta(quest).icon }}</span>
                  <div>
                    <span class="text-[10px] font-mono font-bold uppercase tracking-wider text-emerald-400 block">
                      {{ getQuestMeta(quest).badge }}
                    </span>
                    <h3 class="text-sm font-bold text-white">{{ quest.title }}</h3>
                  </div>
                </div>
                <span class="rounded-md bg-slate-900 px-2 py-1 text-xs font-mono font-bold text-emerald-300 border border-slate-800">
                  {{ quest.progress_percentage.toFixed(1) }}%
                </span>
              </div>

              <p class="text-xs text-slate-400 mb-2.5">
                {{ getQuestMeta(quest).subtitle }}
              </p>

              <!-- Segmented Visual Block Bar -->
              <div class="grid grid-cols-10 gap-1.5 mb-2">
                <div
                  v-for="idx in 10"
                  :key="idx"
                  class="h-3 rounded-sm transition-all duration-500"
                  :class="
                    idx <= Math.max(quest.current_value > 0 ? 1 : 0, getFilledBlocks(quest.progress_percentage, 10))
                      ? 'bg-gradient-to-t from-emerald-500 to-teal-300 shadow-sm shadow-emerald-400/50'
                      : 'bg-slate-800/80 border border-slate-700/40'
                  "
                ></div>
              </div>

              <div class="flex items-center justify-between text-xs font-mono text-slate-300">
                <span>Progresso Atual:</span>
                <strong class="text-white">{{ getQuestMeta(quest).formatProgress }}</strong>
              </div>
            </article>
          </div>
        </div>

        <!-- 5. WIDGET ORÁCULO DO DIA DE PAGAMENTO -->
        <div class="rounded-2xl border border-amber-500/35 bg-slate-900/95 p-5 sm:p-6 shadow-xl">
          <div class="flex items-center justify-between gap-2 mb-3">
            <div>
              <span class="text-[10px] font-mono uppercase tracking-widest text-amber-400 font-bold">
                PROTOCOLO DE QUINZENA • DIA {{ paydayChecklist.current_day }} DO MÊS
              </span>
              <h2 class="text-lg font-extrabold text-white">
                📅 Oráculo do Dia de Pagamento
              </h2>
            </div>
            <span class="rounded-lg bg-amber-500/15 border border-amber-400/40 px-2.5 py-1 text-xs font-mono font-bold text-amber-300">
              {{ currentCycleCompletedCount }}/{{ (activeCycleToDisplay?.tasks || []).length }} concluídas
            </span>
          </div>

          <!-- Cycle Switcher Tabs -->
          <div class="grid grid-cols-3 gap-1.5 mb-4 rounded-xl bg-slate-950 p-1 border border-slate-800">
            <button
              v-for="cycle in paydayChecklist.cycles"
              :key="cycle.id"
              type="button"
              class="rounded-lg py-1.5 px-2 text-[11px] font-mono font-bold transition cursor-pointer text-center"
              :class="
                activeCycleToDisplay?.id === cycle.id
                  ? 'bg-amber-500 text-slate-950 shadow'
                  : 'text-slate-400 hover:text-white'
              "
              @click="selectedCycleId = cycle.id"
            >
              {{ cycle.day_range }}
              <span v-if="cycle.is_active" class="ml-1">●</span>
            </button>
          </div>

          <div v-if="activeCycleToDisplay" class="space-y-2.5">
            <div class="rounded-xl bg-amber-500/10 border border-amber-500/25 px-3.5 py-2.5 mb-3">
              <div class="flex items-center justify-between">
                <strong class="text-sm text-amber-300">{{ activeCycleToDisplay.title }}</strong>
                <span
                  v-if="activeCycleToDisplay.is_active"
                  class="rounded bg-amber-400/20 px-2 py-0.5 text-[10px] font-mono font-bold text-amber-200"
                >
                  CICLO ATUAL
                </span>
              </div>
              <p class="text-xs text-slate-300 mt-0.5">{{ activeCycleToDisplay.subtitle }}</p>
            </div>

            <label
              v-for="task in activeCycleToDisplay.tasks"
              :key="task.id"
              class="flex items-start gap-3 rounded-xl border p-3 transition cursor-pointer"
              :class="
                checkedTasks[task.id]
                  ? 'border-emerald-500/40 bg-emerald-950/20 text-slate-400 line-through'
                  : 'border-slate-800 bg-slate-950/80 hover:border-amber-500/40 text-slate-100'
              "
            >
              <input
                type="checkbox"
                :checked="!!checkedTasks[task.id]"
                class="mt-1 h-4 w-4 rounded accent-emerald-500"
                @change="togglePaydayTask(task.id)"
              />
              <div class="flex-1 min-w-0">
                <div class="flex items-center justify-between gap-2">
                  <span class="text-xs sm:text-sm font-bold">{{ task.title }}</span>
                  <span v-if="task.amount_label" class="shrink-0 text-xs font-mono text-amber-300">
                    {{ task.amount_label }}
                  </span>
                </div>
                <p class="text-xs text-slate-400 mt-0.5">{{ task.description }}</p>
              </div>
            </label>
          </div>
        </div>
      </section>
    </div>

    <!-- HISTÓRICO RECENTE DO ROBERTO -->
    <section v-if="recentLogs.length" class="mt-6 rounded-2xl border border-slate-800 bg-slate-900/90 p-5">
      <h3 class="text-xs font-mono font-bold uppercase tracking-wider text-slate-400 mb-3">
        📜 Histórico Recente do Oráculo Roberto
      </h3>
      <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
        <div
          v-for="log in recentLogs.slice(0, 6)"
          :key="log.id"
          class="rounded-xl border border-slate-800 bg-slate-950/80 p-3 text-xs flex items-center justify-between gap-2"
        >
          <div class="min-w-0">
            <p class="font-bold text-white truncate">{{ log.item_description }}</p>
            <p class="font-mono text-slate-400">
              {{ formatBRL(log.amount) }} • {{ log.fii_equivalent_shares }} cotas FII
            </p>
          </div>
          <span
            class="shrink-0 rounded-md px-2 py-1 font-mono text-[10px] font-bold uppercase"
            :class="{
              'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40': log.user_decision === 'SAVED',
              'bg-rose-500/20 text-rose-300 border border-rose-500/40': log.user_decision === 'SPENT',
              'bg-slate-800 text-slate-300': log.user_decision === 'PENDING',
            }"
          >
            {{ log.user_decision === 'SAVED' ? '🛡️ SALVO' : log.user_decision === 'SPENT' ? '💥 GASTO' : '⏳ PENDENTE' }}
          </span>
        </div>
      </div>
    </section>
  </div>
</template>

<style scoped>
.hud-title-font {
  font-family: 'Orbitron', 'Manrope', sans-serif;
  letter-spacing: 0.04em;
}

.hud-grid-bg {
  position: absolute;
  inset: 0;
  background-image:
    linear-gradient(to right, rgba(16, 216, 132, 0.05) 1px, transparent 1px),
    linear-gradient(to bottom, rgba(16, 216, 132, 0.05) 1px, transparent 1px);
  background-size: 24px 24px;
  pointer-events: none;
}

.hp-bar-segments {
  position: absolute;
  inset: 0;
  background-image: repeating-linear-gradient(
    90deg,
    transparent,
    transparent 18px,
    rgba(2, 6, 23, 0.65) 18px,
    rgba(2, 6, 23, 0.65) 20px
  );
  pointer-events: none;
}

@keyframes pulseSlow {
  0%, 100% { box-shadow: 0 0 0 0 rgba(244, 63, 94, 0.35); }
  50% { box-shadow: 0 0 22px 4px rgba(244, 63, 94, 0.25); }
}

.animate-pulse-slow {
  animation: pulseSlow 2.4s infinite ease-in-out;
}

.hud-pop-enter-active,
.hud-pop-leave-active {
  transition: all 0.28s cubic-bezier(0.16, 1, 0.3, 1);
}
.hud-pop-enter-from,
.hud-pop-leave-to {
  opacity: 0;
  transform: translateY(-10px) scale(0.97);
}
</style>
