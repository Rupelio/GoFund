import { createRouter, createWebHistory } from 'vue-router'
import { useAuthStore } from '../stores/auth.js'

const routes = [
  {
    path: '/login',
    name: 'login',
    component: () => import('../views/LoginView.vue'),
    meta: { guest: true },
  },
  {
    path: '/register',
    name: 'register',
    component: () => import('../views/RegisterView.vue'),
    meta: { guest: true },
  },
  {
    path: '/forgot-password',
    name: 'forgot-password',
    component: () => import('../views/ForgotPasswordView.vue'),
    meta: { guest: true },
  },
  {
    path: '/reset-password',
    name: 'reset-password',
    component: () => import('../views/ResetPasswordView.vue'),
    meta: { guest: true },
  },
  {
    path: '/',
    component: () => import('../layouts/DashboardLayout.vue'),
    meta: { requiresAuth: true },
    children: [
      {
        path: '',
        name: 'dashboard',
        component: () => import('../views/DashboardView.vue'),
      },
      {
        path: 'transactions',
        name: 'transactions',
        component: () => import('../views/TransactionsView.vue'),
      },
      {
        path: 'accounts',
        name: 'accounts',
        component: () => import('../views/AccountsView.vue'),
      },
      {
        path: 'budgets',
        name: 'budgets',
        component: () => import('../views/BudgetsView.vue'),
      },
      {
        path: 'goals',
        name: 'goals',
        component: () => import('../views/GoalsView.vue'),
      },
      {
        path: 'investments',
        name: 'investments',
        component: () => import('../views/InvestmentsView.vue'),
      },
      {
        path: 'projection',
        name: 'projection',
        component: () => import('../views/ProjectionView.vue'),
      },
      {
        path: 'reports',
        name: 'reports',
        component: () => import('../views/ReportsView.vue'),
      },
      {
        path: 'reconciliation',
        name: 'reconciliation',
        component: () => import('../views/ReconciliationView.vue'),
      },
      {
        path: 'installments',
        name: 'installments',
        component: () => import('../views/InstallmentsView.vue'),
      },
      {
        path: 'settings',
        name: 'settings',
        component: () => import('../views/SettingsView.vue'),
      },
    ],
  },
  { path: '/:pathMatch(.*)*', redirect: '/' },
]

const router = createRouter({
  history: createWebHistory(),
  routes,
})

router.beforeEach((to) => {
  const auth = useAuthStore()
  if (to.meta.requiresAuth && !auth.isAuthenticated) {
    return { name: 'login' }
  }
  if (to.meta.guest && auth.isAuthenticated) {
    return { name: 'dashboard' }
  }
})

export default router
