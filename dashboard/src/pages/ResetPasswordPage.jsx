import { useEffect, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { supabase } from '../api/client'
import AppFooter from '../components/AppFooter'
import TagoLogo from '../components/TagoLogo'
import ThemeToggle from '../components/ThemeToggle'

export default function ResetPasswordPage() {
  const [searchParams] = useSearchParams()
  const role = ['student', 'teacher', 'admin'].includes(searchParams.get('role'))
    ? searchParams.get('role')
    : 'student'
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [checkingLink, setCheckingLink] = useState(true)
  const [recoveryReady, setRecoveryReady] = useState(false)
  const [loading, setLoading] = useState(false)
  const [message, setMessage] = useState(null)
  const [error, setError] = useState(null)

  useEffect(() => {
    let cancelled = false

    function cleanRecoveryUrl() {
      const cleanUrl = `${window.location.pathname}?role=${role}`
      window.history.replaceState(window.history.state, '', cleanUrl)
    }

    async function prepareRecoverySession() {
      setCheckingLink(true)
      setError(null)

      try {
        const url = new URL(window.location.href)
        const code = url.searchParams.get('code')
        const tokenHash = url.searchParams.get('token_hash')
        const hashParams = new URLSearchParams(window.location.hash.replace(/^#/, ''))
        const accessToken = hashParams.get('access_token')
        const refreshToken = hashParams.get('refresh_token')
        const hashType = hashParams.get('type')

        if (code) {
          const { error: exchangeError } = await supabase.auth.exchangeCodeForSession(code)
          if (exchangeError) throw exchangeError
          cleanRecoveryUrl()
        } else if (tokenHash) {
          const { error: verifyError } = await supabase.auth.verifyOtp({
            token_hash: tokenHash,
            type: 'recovery',
          })
          if (verifyError) throw verifyError
          cleanRecoveryUrl()
        } else if (accessToken && refreshToken && (!hashType || hashType === 'recovery')) {
          const { error: sessionError } = await supabase.auth.setSession({
            access_token: accessToken,
            refresh_token: refreshToken,
          })
          if (sessionError) throw sessionError
          cleanRecoveryUrl()
        }

        const { data, error: sessionError } = await supabase.auth.getSession()
        if (sessionError) throw sessionError

        if (!cancelled) {
          setRecoveryReady(Boolean(data.session))
          if (!data.session) {
            setError('Open the latest password reset link from your email before setting a new password.')
          }
        }
      } catch (err) {
        if (!cancelled) {
          setRecoveryReady(false)
          setError(err.message || 'Could not verify this password reset link.')
        }
      } finally {
        if (!cancelled) setCheckingLink(false)
      }
    }

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event, session) => {
      if (cancelled || event !== 'PASSWORD_RECOVERY') return
      setRecoveryReady(Boolean(session))
      setCheckingLink(false)
      setError(session ? null : 'Open the latest password reset link from your email before setting a new password.')
    })

    prepareRecoverySession()

    return () => {
      cancelled = true
      subscription.unsubscribe()
    }
  }, [role])

  const handleReset = async (event) => {
    event.preventDefault()

    if (password.length < 6) {
      setError('Password must be at least 6 characters.')
      setMessage(null)
      return
    }

    if (!recoveryReady) {
      setError('Open the latest password reset link from your email before setting a new password.')
      setMessage(null)
      return
    }

    if (password !== confirmPassword) {
      setError('Passwords do not match.')
      setMessage(null)
      return
    }

    setLoading(true)
    setError(null)
    setMessage(null)

    const { error: updateError } = await supabase.auth.updateUser({ password })
    setLoading(false)

    if (updateError) {
      setError(updateError.message)
      return
    }

    setPassword('')
    setConfirmPassword('')
    await supabase.auth.signOut()
    setMessage('Password reset. You can now sign in with your new password.')
  }

  return (
    <main className="login-page">
      <div className="login-shell">
        <form className="login-card" onSubmit={handleReset} aria-label="Reset password">
          <div className="login-card-top">
            <div className="login-brand">
              <TagoLogo showWord size={20} markClassName="login-mark" />
              <div>
                <p>Account security</p>
                <h1>Reset password</h1>
              </div>
            </div>

            <ThemeToggle />
          </div>

          <p className="login-intro">
            {checkingLink
              ? 'Checking your recovery link...'
              : 'Enter a new password after opening the recovery link from your email.'}
          </p>

          <div className="login-field">
            <label htmlFor="new-password">New password</label>
            <input
              id="new-password"
              type="password"
              autoComplete="new-password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              placeholder="At least 6 characters"
            />
          </div>

          <div className="login-field">
            <label htmlFor="confirm-password">Confirm password</label>
            <input
              id="confirm-password"
              type="password"
              autoComplete="new-password"
              value={confirmPassword}
              onChange={(event) => setConfirmPassword(event.target.value)}
              placeholder="Repeat password"
            />
          </div>

          {error && <p className="login-error" role="alert">{error}</p>}
          {message && <p className="login-success" role="status">{message}</p>}

          <button className="login-submit" type="submit" disabled={loading || checkingLink || !recoveryReady}>
            {loading ? 'Updating...' : checkingLink ? 'Checking link...' : 'Reset password'}
          </button>

          <Link className="login-notice-link" to={`/login/${role}`}>
            Back to {role} sign in
          </Link>
        </form>

        <AppFooter className="login-page-footer" />
      </div>
    </main>
  )
}
