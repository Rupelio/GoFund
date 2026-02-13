<script setup>
import { computed } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useAuthStore } from '../../stores/auth.js'
import { useAppStore } from '../../stores/app.js'

const route = useRoute()
const router = useRouter()
const auth = useAuthStore()
const app = useAppStore()

const navItems = [
  { name: 'dashboard', label: 'Dashboard', icon: 'grid' },
  { name: 'transactions', label: 'Movimentações', icon: 'arrows' },
  { name: 'accounts', label: 'Contas', icon: 'card' },
  { name: 'budgets', label: 'Orçamento', icon: 'pie' },
  { name: 'goals', label: 'Metas', icon: 'target' },
  { name: 'projection', label: 'Projeção', icon: 'bar' },
  { name: 'settings', label: 'Configurações', icon: 'gear' },
]

const currentPage = computed(() => route.name)

function navigate(name) {
  router.push({ name })
  app.closeSidebar()
}

function logout() {
  auth.logout()
  router.push({ name: 'login' })
}
</script>

<template>
  <!-- Exact same HTML from legacy index.html lines 71-89 -->
  <aside class="sidebar" :class="{ 'is-open': app.sidebarOpen }">
    <div class="logo-block"><svg class="logo-hex" width="28" height="32" viewBox="0 0 28 32"><defs><linearGradient id="hxg" x1="0%" y1="0%" x2="100%" y2="100%"><stop offset="0%" stop-color="#9e8bff"/><stop offset="100%" stop-color="#5e7fff"/></linearGradient></defs><polygon points="14,0 27,8 27,24 14,32 1,24 1,8" fill="url(#hxg)"/></svg><p>GOFUND</p></div>
    <nav class="sidebar-nav">
      <!-- Dashboard -->
      <a href="#" :class="{ 'is-active': currentPage === 'dashboard' }" @click.prevent="navigate('dashboard')"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="3" width="7" height="7" rx="1.5"/><rect x="3" y="14" width="7" height="7" rx="1.5"/><rect x="14" y="14" width="7" height="7" rx="1.5"/></svg>Dashboard</a>
      <!-- Movimentações -->
      <a href="#" :class="{ 'is-active': currentPage === 'transactions' }" @click.prevent="navigate('transactions')"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><line x1="4" y1="9" x2="20" y2="9"/><polyline points="8 5 4 9 8 13"/><line x1="20" y1="16" x2="4" y2="16"/><polyline points="16 12 20 16 16 20"/></svg>Movimentações</a>
      <!-- Contas -->
      <a href="#" :class="{ 'is-active': currentPage === 'accounts' }" @click.prevent="navigate('accounts')"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="5" width="20" height="14" rx="2"/><line x1="2" y1="10" x2="22" y2="10"/></svg>Contas</a>
      <!-- Orçamento -->
      <a href="#" :class="{ 'is-active': currentPage === 'budgets' }" @click.prevent="navigate('budgets')"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M21.21 15.89A10 10 0 1 1 8 2.83"/><path d="M22 12A10 10 0 0 0 12 2v10z"/></svg>Orçamento</a>
      <!-- Metas -->
      <a href="#" :class="{ 'is-active': currentPage === 'goals' }" @click.prevent="navigate('goals')"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="6"/><circle cx="12" cy="12" r="2"/></svg>Metas</a>
      <!-- Investimentos -->
      <a href="#" :class="{ 'is-active': currentPage === 'investments' }" @click.prevent="navigate('investments')"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><polyline points="22 7 13.5 15.5 8.5 10.5 2 17"/><polyline points="16 7 22 7 22 13"/></svg>Investimentos</a>
      <!-- Projeção -->
      <a href="#" :class="{ 'is-active': currentPage === 'projection' }" @click.prevent="navigate('projection')"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="20" x2="12" y2="10"/><line x1="18" y1="20" x2="18" y2="4"/><line x1="6" y1="20" x2="6" y2="14"/></svg>Projeção</a>
      <!-- Relatórios -->
      <a href="#" :class="{ 'is-active': currentPage === 'reports' }" @click.prevent="navigate('reports')"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/></svg>Relatórios</a>
      <!-- Conciliação -->
      <a href="#" :class="{ 'is-active': currentPage === 'reconciliation' }" @click.prevent="navigate('reconciliation')"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="2" width="18" height="20" rx="2"/><line x1="8" y1="7" x2="16" y2="7"/><line x1="8" y1="12" x2="16" y2="12"/><line x1="8" y1="17" x2="12" y2="17"/></svg>Conciliação</a>
      <!-- Parcelas -->
      <a href="#" :class="{ 'is-active': currentPage === 'installments' }" @click.prevent="navigate('installments')"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="1" y="4" width="22" height="16" rx="2"/><line x1="1" y1="10" x2="23" y2="10"/></svg>Parcelas</a>
      <!-- Configurações -->
      <a href="#" :class="{ 'is-active': currentPage === 'settings' }" @click.prevent="navigate('settings')"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>Configurações</a>
    </nav>
    <div class="sidebar-user">
      <div class="user-chip">{{ auth.userInitial }}</div>
      <div><p class="user-name">{{ auth.userName }}</p><button class="btn ghost tiny" type="button" @click="logout">Sair</button></div>
      <button class="theme-toggle" type="button" aria-label="Alternar tema" @click="app.toggleTheme"><span class="theme-icon-dark">&#9790;</span><span class="theme-icon-light">&#9728;</span></button>
    </div>
  </aside>
</template>
