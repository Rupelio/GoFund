<script setup>
import { ref } from 'vue'
import { useRouter } from 'vue-router'
import { useAuthStore } from '../stores/auth.js'

const router = useRouter()
const auth = useAuthStore()

const name = ref('')
const email = ref('')
const password = ref('')

async function handleRegister() {
  const ok = await auth.register(name.value, email.value, password.value)
  if (ok) router.push({ name: 'dashboard' })
}
</script>

<template>
  <div class="app-bg"></div>
  <main class="auth-shell">
    <section class="auth-card">
      <header class="auth-header">
        <p class="brand">GOFUND</p>
        <h1>Gestão Financeira Profissional</h1>
        <p class="auth-subtitle">Entre com sua conta ou crie um novo acesso.</p>
      </header>
      <div class="auth-tabs">
        <router-link to="/login" class="auth-tab" type="button">Login</router-link>
        <button class="auth-tab is-active" type="button">Cadastro</button>
      </div>
      <form class="auth-form" @submit.prevent="handleRegister">
        <label>Nome<input v-model="name" type="text" placeholder="Seu nome" minlength="2" required autocomplete="name"/></label>
        <label>Email<input v-model="email" type="email" placeholder="seu@email.com" required autocomplete="email"/></label>
        <label>Senha<input v-model="password" type="password" placeholder="Mínimo 8 caracteres" minlength="8" required autocomplete="new-password"/></label>
        <button class="btn primary" type="submit" :disabled="auth.loading">
          <template v-if="auth.loading">Criando...</template>
          <template v-else>Criar conta</template>
        </button>
      </form>
      <p v-if="auth.error" class="status-message error">{{ auth.error }}</p>
    </section>
  </main>
</template>
