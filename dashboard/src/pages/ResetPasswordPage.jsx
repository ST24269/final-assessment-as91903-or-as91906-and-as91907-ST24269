import { useState } from 'react'
import { Link } from 'react-router-dom'
import { KeyRound } from 'lucide-react'
import { supabase } from '../api/client'
import AppFooter from '../components/AppFooter'
import ThemeToggle from '../components/ThemeToggle'

export default function ResetPasswordPage() {
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [message, setMessage] = useState(null)
  const [error, setError] = useState(null)

  const handleReset = async (event) => {
    event.preventDefault()

    if (password.length < 6) {
      setError('Password must be at least 6 characters.')
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
    setMessage('Password reset. You can now sign in with your new password.')
  }

  return (
    <main className="login-page">
      <div className="login-shell">
        <form className="login-card" onSubmit={handleReset} aria-label="Reset password">
          <div className="login-card-top">
            <div className="login-brand">
              <div className="login-mark">
                <KeyRound size={20} strokeWidth={2.4} />
              </div>
              <div>
                <p>AttendRFID</p>
                <h1>Reset password</h1>
              </div>
            </div>

            <ThemeToggle />
          </div>

          <p className="login-intro">
            Enter a new password after opening the recovery link from your email.
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

          <button className="login-submit" type="submit" disabled={loading}>
            {loading ? 'Updating...' : 'Reset password'}
          </button>

          <Link className="login-notice-link" to="/login/student">
            Back to student sign in
          </Link>
        </form>

        <AppFooter className="login-page-footer" />
      </div>
    </main>
  )
}
