const API_BASE = import.meta.env.VITE_API_URL || ''

class ApiError extends Error {
  constructor(status, message, data) {
    super(message)
    this.status = status
    this.data = data
  }
}

async function request(method, path, { body, token, params, headers: customHeaders } = {}) {
  let url = API_BASE ? `${API_BASE}${path}` : path
  if (params) {
    const qs = new URLSearchParams()
    Object.entries(params).forEach(([k, v]) => {
      if (v !== undefined && v !== null && v !== '') qs.set(k, v)
    })
    const search = qs.toString()
    if (search) url += `?${search}`
  }

  const headers = { 'Content-Type': 'application/json', ...(customHeaders || {}) }
  if (token) headers['Authorization'] = `Bearer ${token}`

  const res = await fetch(url.toString(), {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  })

  if (res.status === 204) return null

  const data = await res.json().catch(() => null)

  if (!res.ok) {
    throw new ApiError(res.status, data?.error || `Request failed (${res.status})`, data)
  }

  return data
}

export const api = {
  get: (path, opts) => request('GET', path, opts),
  post: (path, body, opts) => request('POST', path, { body, ...opts }),
  put: (path, body, opts) => request('PUT', path, { body, ...opts }),
  del: (path, opts) => request('DELETE', path, opts),
}

export { ApiError }
