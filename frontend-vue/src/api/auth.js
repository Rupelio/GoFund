import { api } from './client.js'

export const authApi = {
  login(email, password) {
    return api.post('/api/auth/login', { email, password })
  },
  register(name, email, password) {
    return api.post('/api/auth/register', { name, email, password })
  },
  requestReset(email) {
    return api.post('/api/auth/request-reset', { email })
  },
  confirmReset(token, newPassword) {
    return api.post('/api/auth/confirm-reset', { token, newPassword })
  },
  changePassword(currentPassword, newPassword, token) {
    return api.put('/api/auth/password', { currentPassword, newPassword }, { token })
  },
  me(token) {
    return api.get('/api/me', { token })
  },
}
