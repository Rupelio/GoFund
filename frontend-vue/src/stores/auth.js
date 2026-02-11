import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import { authApi } from '../api/auth.js'
import { fetchBootstrap } from '../api/bootstrap.js'

export const useAuthStore = defineStore('auth', () => {
  const token = ref(localStorage.getItem('gf_token') || '')
  const user = ref(JSON.parse(localStorage.getItem('gf_user') || 'null'))
  const loading = ref(false)
  const error = ref('')

  const isAuthenticated = computed(() => !!token.value && !!user.value)
  const userName = computed(() => user.value?.name || '')
  const userInitial = computed(() => userName.value.charAt(0).toUpperCase() || 'U')

  function setAuth(tkn, usr) {
    token.value = tkn
    user.value = usr
    localStorage.setItem('gf_token', tkn)
    localStorage.setItem('gf_user', JSON.stringify(usr))
  }

  function clearAuth() {
    token.value = ''
    user.value = null
    localStorage.removeItem('gf_token')
    localStorage.removeItem('gf_user')
  }

  async function login(email, password) {
    loading.value = true
    error.value = ''
    try {
      const data = await authApi.login(email, password)
      setAuth(data.token, data.user)
      return true
    } catch (e) {
      error.value = e.message || 'Erro ao fazer login'
      return false
    } finally {
      loading.value = false
    }
  }

  async function register(name, email, password) {
    loading.value = true
    error.value = ''
    try {
      const data = await authApi.register(name, email, password)
      setAuth(data.token, data.user)
      return true
    } catch (e) {
      error.value = e.message || 'Erro ao criar conta'
      return false
    } finally {
      loading.value = false
    }
  }

  async function requestReset(email) {
    loading.value = true
    error.value = ''
    try {
      await authApi.requestReset(email)
      return true
    } catch (e) {
      error.value = e.message || 'Erro ao enviar email'
      return false
    } finally {
      loading.value = false
    }
  }

  async function confirmReset(resetToken, newPassword) {
    loading.value = true
    error.value = ''
    try {
      await authApi.confirmReset(resetToken, newPassword)
      return true
    } catch (e) {
      error.value = e.message || 'Erro ao redefinir senha'
      return false
    } finally {
      loading.value = false
    }
  }

  async function checkSession() {
    if (!token.value) return false
    try {
      const data = await fetchBootstrap(token.value)
      user.value = data.user
      localStorage.setItem('gf_user', JSON.stringify(data.user))
      return data
    } catch {
      clearAuth()
      return false
    }
  }

  function logout() {
    clearAuth()
  }

  return {
    token, user, loading, error,
    isAuthenticated, userName, userInitial,
    login, register, requestReset, confirmReset,
    checkSession, logout, clearAuth,
  }
})
