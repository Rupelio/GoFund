import { api } from './client.js'

export const transactionsApi = {
  list(token, { month, limit, offset } = {}) {
    return api.get('/api/transactions', { token, params: { month, limit, offset } })
  },
  get(token, id) {
    return api.get(`/api/transactions/${id}`, { token })
  },
  create(token, payload) {
    return api.post('/api/transactions', payload, { token })
  },
  update(token, id, payload) {
    return api.put(`/api/transactions/${id}`, payload, { token })
  },
  remove(token, id) {
    return api.del(`/api/transactions/${id}`, { token })
  },
  removeAll(token) {
    return api.del('/api/transactions', { token })
  },
  import(token, items) {
    return api.post('/api/transactions/import', { items }, { token })
  },
  startImportJob(token, files) {
    return api.post('/api/transactions/import/jobs', { files }, { token })
  },
  getImportJob(token, jobId) {
    return api.get(`/api/transactions/import/jobs/${jobId}`, { token })
  },
  undoImportBatch(token, batchId) {
    return api.del(`/api/transactions/import/batches/${batchId}`, { token })
  },
}
