import { defineStore } from 'pinia'
import { ref, computed } from 'vue'

export const useAppStore = defineStore('app', () => {
  // Current month in YYYY-MM format
  const now = new Date()
  const currentMonth = ref(
    `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
  )

  // Theme
  const theme = ref(localStorage.getItem('gf_theme') || 'dark')

  // Sidebar collapsed (mobile)
  const sidebarOpen = ref(false)

  // Global message
  const message = ref('')
  const messageType = ref('info') // info, success, error
  let messageTimer = null

  const monthLabel = computed(() => {
    const [y, m] = currentMonth.value.split('-')
    const date = new Date(Number(y), Number(m) - 1, 1)
    return date.toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' })
  })

  function prevMonth() {
    const [y, m] = currentMonth.value.split('-').map(Number)
    const d = new Date(y, m - 2, 1)
    currentMonth.value = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
  }

  function nextMonth() {
    const [y, m] = currentMonth.value.split('-').map(Number)
    const d = new Date(y, m, 1)
    currentMonth.value = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
  }

  function setMonth(value) {
    currentMonth.value = value
  }

  function toggleTheme() {
    theme.value = theme.value === 'dark' ? 'light' : 'dark'
    localStorage.setItem('gf_theme', theme.value)
    document.documentElement.setAttribute('data-theme', theme.value)
    document.body.setAttribute('data-theme', theme.value)
  }

  function toggleSidebar() {
    sidebarOpen.value = !sidebarOpen.value
  }

  function closeSidebar() {
    sidebarOpen.value = false
  }

  function showMessage(msg, type = 'info', duration = 4000) {
    message.value = msg
    messageType.value = type
    if (messageTimer) clearTimeout(messageTimer)
    messageTimer = setTimeout(() => { message.value = '' }, duration)
  }

  // Initialize theme on load
  document.documentElement.setAttribute('data-theme', theme.value)
  document.body.setAttribute('data-theme', theme.value)

  return {
    currentMonth, theme, sidebarOpen,
    message, messageType, monthLabel,
    prevMonth, nextMonth, setMonth,
    toggleTheme, toggleSidebar, closeSidebar,
    showMessage,
  }
})
