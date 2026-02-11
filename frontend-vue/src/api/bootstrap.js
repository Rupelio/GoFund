import { api } from './client.js'

export function fetchBootstrap(token) {
  return api.get('/api/bootstrap', { token })
}
