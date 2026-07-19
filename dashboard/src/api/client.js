import { createClient } from '@supabase/supabase-js'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY
const apiUrl = (import.meta.env.VITE_API_URL || '').replace(/\/+$/, '')

function getClientConfigError() {
  const missing = []

  if (!supabaseUrl) missing.push('VITE_SUPABASE_URL')
  if (!supabaseAnonKey) missing.push('VITE_SUPABASE_ANON_KEY')

  if (missing.length) {
    return `Missing dashboard configuration: ${missing.join(', ')}. Add these public Supabase values to dashboard/.env or the live hosting environment.`
  }

  return null
}

export const clientConfigError = getClientConfigError()
export const supabase = clientConfigError ? null : createClient(supabaseUrl, supabaseAnonKey)

function friendlyNetworkError(error) {
  if (error?.name === 'AbortError') {
    return 'The Tago server took too long to respond. Check the connection and try again.'
  }

  return 'Could not reach the Tago server. Check your connection or ask an administrator to verify VITE_API_URL.'
}

async function request(path, options = {}) {
  if (clientConfigError) {
    return { error: clientConfigError, code: 'CLIENT_CONFIG_ERROR' }
  }

  let session

  try {
    const { data, error } = await supabase.auth.getSession()

    if (error) {
      return { error: 'Your sign-in session could not be checked. Sign in again and retry.', code: 'SESSION_ERROR' }
    }

    session = data.session
  } catch {
    return { error: 'Your sign-in session could not be checked. Sign in again and retry.', code: 'SESSION_ERROR' }
  }

  const headers = {
    ...(options.body ? { 'Content-Type': 'application/json' } : {}),
    ...(options.headers || {}),
  }

  if (session?.access_token) {
    headers.Authorization = `Bearer ${session.access_token}`
  }

  const controller = new AbortController()
  const timeoutId = window.setTimeout(() => controller.abort(), 15000)
  let response

  try {
    response = await fetch(`${apiUrl}${path}`, {
      ...options,
      headers,
      signal: options.signal || controller.signal,
    })
  } catch (error) {
    return {
      error: friendlyNetworkError(error),
      code: error?.name === 'AbortError' ? 'TIMEOUT' : 'NETWORK_ERROR',
    }
  } finally {
    window.clearTimeout(timeoutId)
  }

  const text = await response.text()
  let payload

  try {
    payload = text ? JSON.parse(text) : null
  } catch {
    payload = { error: text || response.statusText }
  }

  if (!response.ok) {
    const message = payload?.error || response.statusText || 'Request failed.'
    const error = payload?.requestId && response.status >= 500
      ? `${message} Reference: ${payload.requestId}`
      : message

    return {
      ...(payload || {}),
      error,
      status: response.status,
    }
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
