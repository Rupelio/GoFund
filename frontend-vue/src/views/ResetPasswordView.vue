<script setup>
import { ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useAuthStore } from '../stores/auth.js'

const route = useRoute()
const router = useRouter()
const auth = useAuthStore()

const newPassword = ref('')
const confirmPassword = ref('')
const localError = ref('')
const success = ref(false)
const resetToken = route.query['reset-token'] || route.query.token || ''

async function handleSubmit() {
  localError.value = ''
  if (newPassword.value.length < 8) {
    localError.value = 'Nova senha deve ter no mínimo 8 caracteres.'
    return
  }
  if (newPassword.value !== confirmPassword.value) {
    localError.value = 'As senhas não coincidem'
    return
  }
  if (!/[a-zA-Z]/.test(newPassword.value) || !/\d/.test(newPassword.value)) {
    localError.value = 'Nova senha deve conter letras e números.'
    return
  }
  const ok = await auth.confirmReset(resetToken, newPassword.value)
  if (ok) {
    success.value = true
    setTimeout(() => router.push({ name: 'login' }), 2000)
  }
}
</script>

<template>
  <div class="app-bg"></div>
  <main class="auth-shell">
    <section class="auth-card">
      <header class="auth-header">
        <p class="brand">GOFUND</p>
        <h1>Gestão Financeira Profissional</h1>
        <p class="auth-subtitle">Defina sua nova senha.</p>
      </header>
      <form v-if="!success" class="auth-form" @submit.prevent="handleSubmit">
        <label>Nova Senha<input v-model="newPassword" type="password" placeholder="Mínimo 8 caracteres" minlength="8" required autocomplete="new-password"/></label>
        <label>Confirmar Senha<input v-model="confirmPassword" type="password" placeholder="Repita a senha" minlength="8" required autocomplete="new-password"/></label>
        <button class="btn primary" type="submit" :disabled="auth.loading">Redefinir Senha</button>
      </form>
      <p v-if="success" class="auth-success">Senha redefinida! Redirecionando...</p>
      <p v-if="localError || auth.error" class="status-message error">{{ localError || auth.error }}</p>
    </section>
  </main>
</template>
