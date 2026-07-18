import { useState } from 'react'
import { GraduationCap, ShieldCheck, UsersRound } from 'lucide-react'
import { Link } from 'react-router-dom'
import { api, supabase } from '../api/client'
import AppFooter from '../components/AppFooter'
import TagoLogo from '../components/TagoLogo'
import ThemeToggle from '../components/ThemeToggle'

const LOGIN_ROLE_KEY = 'tago-login-role'
const LOGIN_NOTICE_KEY = 'tago-login-notice'
const VALID_ROLES = ['student', 'teacher', 'admin']

const ROLE_COPY = {
  student: {
    label: 'Student',
    title: 'Student sign in',
    intro: 'View your attendance status, class history, and scan records.',
    Icon: GraduationCap,
  },
  teacher: {
    label: 'Teacher',
    title: 'Teacher sign in',
    intro: 'Start class sessions, review live RFID scans, and update registers.',
    Icon: UsersRound,
  },
  admin: {
    label: 'Admin',
    title: 'Admin sign in',
    intro: 'Manage students, classes, readers, attendance records, and user access.',
    Icon: ShieldCheck,
  },
}

function readStoredLoginNotice(role) {
  const storedNotice = (() => {
    try {
      const value = window.sessionStorage.getItem(LOGIN_NOTICE_KEY)
      window.sessionStorage.removeItem(LOGIN_NOTICE_KEY)
      return value
    } catch {
      return null
    }
  })()

  if (!storedNotice) return null

  try {
    const parsedNotice = JSON.parse(storedNotice)
    if (parsedNotice.type === 'invalid-role') return parsedNotice
    return parsedNotice.expectedRole === role ? parsedNotice : null
  } catch {
    return null
  }
}

function setLoginRole(role) {
  try {
    window.sessionStorage.setItem(LOGIN_ROLE_KEY, role)
  } catch {
    // Login still works without the role hint; App will validate the profile.
  }
}

function clearLoginRole() {
  try {
    window.sessionStorage.removeItem(LOGIN_ROLE_KEY)
  } catch {
    // Storage can be unavailable in strict browser privacy modes.
  }
}

function clearLoginNotice() {
  try {
    window.sessionStorage.removeItem(LOGIN_NOTICE_KEY)
  } catch {
    // Storage can be unavailable in strict browser privacy modes.
  }
}

export default function LoginPage({ role = 'student' }) {
  const config = ROLE_COPY[role] || ROLE_COPY.student
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState(null)
  const [roleNotice, setRoleNotice] = useState(() => readStoredLoginNotice(role))
  const [loading, setLoading] = useState(false)
  const [resetLoading, setResetLoading] = useState(false)
  const [resetMessage, setResetMessage] = useState(null)

  const handleLogin = async (event) => {
    event.preventDefault()
    if (loading) return

    const trimmedEmail = email.trim()

    if (!trimmedEmail || !password.trim()) {
      setError('Enter your email and password.')
      return
    }

    setLoading(true)
    setError(null)
    setRoleNotice(null)
    clearLoginNotice()
    setLoginRole(role)

    try {
      const { data, error } = await supabase.auth.signInWithPassword({
        email: trimmedEmail,
        password,
      })

      if (error) {
        clearLoginRole()
        setError(error.message)
        return
      }

      const { data: profile, error: profileError } = await supabase
        .from('profiles')
        .select('role')
        .eq('id', data.user.id)
        .maybeSingle()

      if (profileError || !profile) {
        await supabase.auth.signOut()
        clearLoginRole()
        setError('No profile is linked to this login. Ask an admin to check your account.')
        return
      }

      if (!VALID_ROLES.includes(profile.role)) {
        await supabase.auth.signOut()
        clearLoginRole()
        setRoleNotice({
          type: 'invalid-role',
          actualRole: profile.role,
        })
        return
      }

      if (profile.role !== role) {
        await supabase.auth.signOut()
        clearLoginRole()
        setRoleNotice({
          type: 'role-mismatch',
          expectedRole: role,
          actualRole: profile.role,
        })
        return
      }

      clearLoginRole()
    } catch (err) {
      clearLoginRole()
      console.error('Unexpected login error:', err)
      setError('Could not connect to Tago. Check your connection and try again.')
    } finally {
      setLoading(false)
    }
  }

  const handleForgotPassword = async () => {
    const trimmedEmail = email.trim()

    if (!trimmedEmail) {
      setError('Enter your email first, then choose forgot password.')
      setResetMessage(null)
      return
    }

    setResetLoading(true)
    setError(null)
    setResetMessage(null)

    const resetResult = await api.post('/api/auth/forgot-password', { email: trimmedEmail, role })

    setResetLoading(false)

    if (resetResult?.error) {
      setError(resetResult.error)
      return
    }

    setResetMessage(resetResult?.message || 'If an account exists for this email, a password reset link has been sent.')
  }

  return (
    <main className="login-page">
      <div className="login-shell">
        <form className="login-card" onSubmit={handleLogin} aria-label={`${config.label} sign in`}>
          <div className="login-card-top">
            <div className="login-brand">
              <TagoLogo showWord size={20} markClassName="login-mark" />
              <div>
                <p>{config.label} portal</p>
                <h1>{config.title}</h1>
              </div>
            </div>

            <ThemeToggle />
          </div>

          <p className="login-intro">{config.intro}</p>

          {roleNotice?.type === 'role-mismatch' && (
            <div className="login-notice" role="alert">
              <p>
                That account is registered as {ROLE_COPY[roleNotice.actualRole]?.label || roleNotice.actualRole}.
                You are on the {config.label} sign-in page.
              </p>
              <Link className="login-notice-link" to={`/login/${roleNotice.actualRole}`}>
                Open {ROLE_COPY[roleNotice.actualRole]?.label || roleNotice.actualRole} sign in
              </Link>
            </div>
          )}

          {roleNotice?.type === 'invalid-role' && (
            <div className="login-notice" role="alert">
              <p>
                That account has an unsupported role value: {roleNotice.actualRole || 'unknown'}.
                Ask an admin to update the profile role before signing in.
              </p>
            </div>
          )}

          <div className="login-field">
            <label htmlFor={`${role}-email`}>Email</label>
            <input
              id={`${role}-email`}
              type="email"
              autoComplete="email"
              placeholder="name@school.nz"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
            />
          </div>

          <div className="login-field">
            <label htmlFor={`${role}-password`}>Password</label>
            <input
              id={`${role}-password`}
              type="password"
              autoComplete="current-password"
              placeholder="Password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
            />
          </div>

          {error && (
            <p className="login-error" role="alert">{error}</p>
          )}

          {resetMessage && (
            <p className="login-success" role="status">{resetMessage}</p>
          )}

          <button className="login-submit" type="submit" disabled={loading}>
            {loading ? 'Signing in...' : `Sign in as ${config.label}`}
          </button>

          <button
            type="button"
            className="login-link-button"
            onClick={handleForgotPassword}
            disabled={resetLoading}
          >
            {resetLoading ? 'Sending reset email...' : 'Forgot password?'}
          </button>
        </form>

        <AppFooter className="login-page-footer" />
      </div>
    </main>
  )
}
