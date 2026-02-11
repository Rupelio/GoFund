<script setup>
import { ref } from 'vue'
import { useAuthStore } from '../stores/auth.js'

const auth = useAuthStore()
const email = ref('')
const sent = ref(false)

async function handleSubmit() {
  const ok = await auth.requestReset(email.value)
  if (ok) sent.value = true
}
</script>

<template>
  <div class="app-bg"></div>
  <main class="auth-shell">
    <section class="auth-card">
      <header class="auth-header">
        <p class="brand">GOFUND</p>
        <h1>Gestão Financeira Profissional</h1>
        <p class="auth-subtitle">Informe seu email para receber o link de redefinição.</p>
      </header>
      <form v-if="!sent" class="auth-form" @submit.prevent="handleSubmit">
        <label>Email<input v-model="email" type="email" placeholder="seu@email.com" required autocomplete="email"/></label>
        <button class="btn primary" type="submit" :disabled="auth.loading">Enviar link</button>
      </form>
      <p v-if="sent" class="auth-success">Link enviado! Verifique sua caixa de entrada.</p>
      <router-link to="/login" class="auth-link">&larr; Voltar ao login</router-link>
      <p v-if="auth.error" class="status-message error">{{ auth.error }}</p>
    </section>
  </main>
</template>
