import { createClient } from '@supabase/supabase-js'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY
const apiUrl = import.meta.env.VITE_API_URL

if (!supabaseUrl) {
  throw new Error('Missing VITE_SUPABASE_URL in .env')
}

if (!supabaseAnonKey) {
  throw new Error('Missing VITE_SUPABASE_ANON_KEY in .env')
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey)

async function request(path, options = {}) {
  const { data } = await supabase.auth.getSession()
  const headers = {
    ...(options.body ? { 'Content-Type': 'application/json' } : {}),
    ...(options.headers || {}),
  }

  if (data.session?.access_token) {
    headers.Authorization = `Bearer ${data.session.access_token}`
  }

  const response = await fetch(`${apiUrl || ''}${path}`, {
    ...options,
    headers,
  })

  const text = await response.text()
  let payload

  try {
    payload = text ? JSON.parse(text) : null
  } catch {
    payload = { error: text || response.statusText }
  }

  if (!response.ok) {
    return payload || { error: response.statusText }
  }

  return payload
}

export const api = {
  get: (path) => request(path),

  post: (path, body) =>
    request(path, {
      method: 'POST',
      body: JSON.stringify(body)
    }),

  patch: (path, body) =>
    request(path, {
      method: 'PATCH',
      body: JSON.stringify(body)
    }),

  delete: (path) =>
    request(path, {
      method: 'DELETE'
    })
}
