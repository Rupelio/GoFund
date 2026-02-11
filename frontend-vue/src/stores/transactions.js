import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import { transactionsApi } from '../api/transactions.js'
import { useAuthStore } from './auth.js'
import { useAppStore } from './app.js'

export const useTransactionsStore = defineStore('transactions', () => {
  const items = ref([])
  const total = ref(0)
  const loading = ref(false)
  const limit = ref(200)
  const offset = ref(0)

  // Bootstrapped data (budgets, goals, etc.)
  const budgets = ref([])
  const goals = ref([])
  const projection = ref({})
  const categories = ref([])
  const accounts = ref([])

  // Computed summaries
  const income = computed(() =>
    items.value.filter(t => t.type === 'receita').reduce((s, t) => s + t.amount, 0)
  )
  const expense = computed(() =>
    items.value.filter(t => t.type === 'despesa').reduce((s, t) => s + t.amount, 0)
  )
  const investment = computed(() =>
    items.value.filter(t => t.type === 'investimento').reduce((s, t) => s + t.amount, 0)
  )
  const creditCard = computed(() =>
    items.value.filter(t => t.method === 'credito' && t.type === 'despesa').reduce((s, t) => s + t.amount, 0)
  )
  const balance = computed(() => income.value - expense.value - investment.value)

  async function loadTransactions() {
    const auth = useAuthStore()
    const app = useAppStore()
    if (!auth.token) return
    loading.value = true
    try {
      const data = await transactionsApi.list(auth.token, {
        month: app.currentMonth,
        limit: limit.value,
        offset: offset.value,
      })
      items.value = data.items || []
      total.value = data.total || 0
    } catch (e) {
      console.error('Failed to load transactions', e)
    } finally {
      loading.value = false
    }
  }

  async function createTransaction(payload) {
    const auth = useAuthStore()
    const result = await transactionsApi.create(auth.token, payload)
    await loadTransactions()
    return result
  }

  async function updateTransaction(id, payload) {
    const auth = useAuthStore()
    const result = await transactionsApi.update(auth.token, id, payload)
    await loadTransactions()
    return result
  }

  async function deleteTransaction(id) {
    const auth = useAuthStore()
    await transactionsApi.remove(auth.token, id)
    await loadTransactions()
  }

  function setBootstrapData(data) {
    budgets.value = data.budgets || []
    goals.value = data.goals || []
    projection.value = data.projection || {}
    categories.value = data.categories || []
    accounts.value = data.accounts || []
    items.value = data.transactions || []
    total.value = (data.transactions || []).length
  }

  return {
    items, total, loading, limit, offset,
    budgets, goals, projection, categories, accounts,
    income, expense, investment, creditCard, balance,
    loadTransactions, createTransaction, updateTransaction, deleteTransaction,
    setBootstrapData,
  }
})
