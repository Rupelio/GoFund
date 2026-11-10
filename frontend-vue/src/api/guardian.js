import { api } from './client.js'

export const guardianApi = {
  getDashboard(token) {
    return api.get('/api/guardian/dashboard', { token })
  },

  evaluateSpend(token, payload) {
    return api.post('/api/guardian/evaluate-spend', payload, { token })
  },

  confirmDecision(token, payload) {
    return api.post('/api/guardian/confirm-decision', payload, { token })
  },

  quickExpense(token, payload, guardianToken = 'gofund-guardian-secret') {
    return api.post('/api/guardian/webhook/quick-expense', payload, {
      token,
      headers: {
        'X-Guardian-Token': guardianToken,
      },
    })
  },
}
