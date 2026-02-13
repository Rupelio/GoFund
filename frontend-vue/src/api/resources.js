import { api } from './client.js'

export const budgetsApi = {
  create(token, payload) {
    return api.post('/api/budgets', payload, { token })
  },
  update(token, id, payload) {
    return api.put(`/api/budgets/${encodeURIComponent(id)}`, payload, { token })
  },
  remove(token, id) {
    return api.del(`/api/budgets/${encodeURIComponent(id)}`, { token })
  },
}

export const goalsApi = {
  create(token, payload) {
    return api.post('/api/goals', payload, { token })
  },
  update(token, id, payload) {
    return api.put(`/api/goals/${encodeURIComponent(id)}`, payload, { token })
  },
  remove(token, id) {
    return api.del(`/api/goals/${encodeURIComponent(id)}`, { token })
  },
  addContribution(token, id, amount) {
    return api.post(`/api/goals/${encodeURIComponent(id)}/contributions`, { amount }, { token })
  },
}

export const accountsApi = {
  create(token, payload) {
    return api.post('/api/accounts', payload, { token })
  },
  update(token, id, payload) {
    return api.put(`/api/accounts/${encodeURIComponent(id)}`, payload, { token })
  },
  remove(token, id) {
    return api.del(`/api/accounts/${encodeURIComponent(id)}`, { token })
  },
}

export const categoriesApi = {
  create(token, payload) {
    return api.post('/api/categories', payload, { token })
  },
  update(token, id, payload) {
    return api.put(`/api/categories/${encodeURIComponent(id)}`, payload, { token })
  },
  remove(token, id) {
    return api.del(`/api/categories/${encodeURIComponent(id)}`, { token })
  },
}

export const projectionApi = {
  update(token, payload) {
    return api.put('/api/projection', payload, { token })
  },
}

export const summaryApi = {
  send(token, month) {
    return api.post(`/api/summary/send?month=${month}`, undefined, { token })
  },
}

export const investmentsApi = {
  searchMarket(token, query, limit = 10) {
    return api.get('/api/investments/market/search', {
      token,
      params: { q: query, limit },
    })
  },
  list(token) {
    return api.get('/api/investments/assets', { token })
  },
  create(token, payload) {
    return api.post('/api/investments/assets', payload, { token })
  },
  update(token, id, payload) {
    return api.put(`/api/investments/assets/${encodeURIComponent(id)}`, payload, { token })
  },
  remove(token, id) {
    return api.del(`/api/investments/assets/${encodeURIComponent(id)}`, { token })
  },
  refreshQuote(token, id) {
    return api.post(`/api/investments/assets/${encodeURIComponent(id)}/quote`, undefined, { token })
  },
}
