import { Link } from 'react-router-dom'
import { useState } from 'react'
import { supabase } from '../api/client'

const ROLE_COPY = {
  admin: {
    label: 'Admin',
    description: 'Sign in to manage the AttendRFID system.',
  },
  teacher: {
    label: 'Teacher',
    description: 'Sign in to run class sessions and manage registers.',
  },
  student: {
    label: 'Student',
    description: 'Sign in to view your attendance record.',
  },
}

export default function RoleLoginPage({ role }) {
  const config = ROLE_COPY[role]
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState(null)
  const [loading, setLoading] = useState(false)

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

    try {
      const { error } = await supabase.auth.signInWithPassword({
        email: trimmedEmail,
        password,
      })

      if (error) setError(error.message)
    } catch (err) {
      console.error('Unexpected login error:', err)
      setError('Could not connect to AttendRFID. Check your connection and try again.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <main className="login-page">
      <form className="login-card" onSubmit={handleLogin}>
        <div className="login-brand">
          <div className="login-mark">AR</div>
          <div>
            <p>AttendRFID</p>
            <h1>{config.label} sign in</h1>
          </div>
        </div>

        <p className="login-intro">{config.description}</p>

        <div className="login-field">
          <label htmlFor="email">Email</label>
          <input
            id="email"
            type="email"
            autoComplete="email"
            placeholder="name@school.nz"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
          />
        </div>

        <div className="login-field">
          <label htmlFor="password">Password</label>
          <input
            id="password"
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

        <button className="login-submit" type="submit" disabled={loading}>
          {loading ? 'Signing in...' : 'Sign in'}
        </button>

        <div className="login-footer">
          <Link to="/login">Use a different login</Link>
        </div>
      </form>
    </main>
  )
}
