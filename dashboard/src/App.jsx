import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { useState, useEffect } from 'react'
import { supabase } from './api/client'
import LoginPage from './pages/LoginPage'
import AdminLoginPage from './pages/AdminLoginPage'
import TeacherLoginPage from './pages/TeacherLoginPage'
import StudentLoginPage from './pages/StudentLoginPage'
import TeacherPage from './pages/TeacherPage'
import StudentPage from './pages/StudentPage'
import AdminPage from './pages/AdminPage'

function ProtectedRoute({ session, profile, role, children }) {
  if (!session) return <Navigate to={`/login/${role}`} replace />

  if (!profile) {
    return <Navigate to={`/login/${role}`} replace />
  }

  if (profile.role !== role) {
    return <Navigate to={`/${profile.role}`} replace />
  }

  return children
}

function LoginRoute({ session, profile, children }) {
  if (session && profile) {
    return <Navigate to={`/${profile.role}`} replace />
  }

  return children
}

export default function App() {
  const [session, setSession] = useState(undefined)
  const [profile, setProfile] = useState(null)
  const [profileLoading, setProfileLoading] = useState(false)
  const [profileError, setProfileError] = useState(null)

  useEffect(() => {
    const getInitialSession = async () => {
      const { data, error } = await supabase.auth.getSession()

      if (error) {
        console.error('Session error:', error)
        setSession(null)
        return
      }

      setSession(data.session ?? null)
    }

    getInitialSession()

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session ?? null)
    })

    return () => subscription.unsubscribe()
  }, [])

  useEffect(() => {
    const fetchProfile = async () => {
      if (session === undefined) return

      if (!session) {
        setProfile(null)
        setProfileLoading(false)
        setProfileError(null)
        return
      }

      setProfileLoading(true)
      setProfileError(null)

      try {
        const { data, error } = await supabase
          .from('profiles')
          .select('*')
          .eq('id', session.user.id)
          .maybeSingle()

        if (error) {
          console.error('Profile fetch error:', error)
          setProfileError(error.message)
          setProfile(null)
          return
        }

        if (!data) {
          console.error('No profile found for user:', session.user.id)
          setProfileError('No profile found for this user.')
          setProfile(null)
          return
        }

        setProfile(data)
      } catch (err) {
        console.error('Unexpected profile error:', err)
        setProfileError('Could not load profile.')
        setProfile(null)
      } finally {
        setProfileLoading(false)
      }
    }

    fetchProfile()
  }, [session])

  if (session === undefined) {
    return <div className="loading">connecting</div>
  }

  if (session && profileLoading) {
    return <div className="loading">connecting</div>
  }

  if (session && profileError) {
    return (
      <div className="loading">
        <p>{profileError}</p>
        <button
          onClick={async () => {
            await supabase.auth.signOut()
            window.location.href = '/login'
          }}
        >
          Sign out
        </button>
      </div>
    )
  }

  return (
    <BrowserRouter>
      <Routes>
        <Route
          path="/login"
          element={
            <LoginRoute session={session} profile={profile}>
              <LoginPage />
            </LoginRoute>
          }
        />

        <Route
          path="/login/admin"
          element={
            <LoginRoute session={session} profile={profile}>
              <AdminLoginPage />
            </LoginRoute>
          }
        />

        <Route
          path="/admin/login"
          element={
            <LoginRoute session={session} profile={profile}>
              <AdminLoginPage />
            </LoginRoute>
          }
        />

        <Route
          path="/login/teacher"
          element={
            <LoginRoute session={session} profile={profile}>
              <TeacherLoginPage />
            </LoginRoute>
          }
        />

        <Route
          path="/teacher/login"
          element={
            <LoginRoute session={session} profile={profile}>
              <TeacherLoginPage />
            </LoginRoute>
          }
        />

        <Route
          path="/login/student"
          element={
            <LoginRoute session={session} profile={profile}>
              <StudentLoginPage />
            </LoginRoute>
          }
        />

        <Route
          path="/student/login"
          element={
            <LoginRoute session={session} profile={profile}>
              <StudentLoginPage />
            </LoginRoute>
          }
        />

        <Route
          path="/teacher"
          element={
            <ProtectedRoute session={session} profile={profile} role="teacher">
              <TeacherPage session={session} profile={profile} />
            </ProtectedRoute>
          }
        />

        <Route
          path="/student"
          element={
            <ProtectedRoute session={session} profile={profile} role="student">
              <StudentPage session={session} profile={profile} />
            </ProtectedRoute>
          }
        />

        <Route
          path="/admin"
          element={
            <ProtectedRoute session={session} profile={profile} role="admin">
              <AdminPage session={session} profile={profile} />
            </ProtectedRoute>
          }
        />

        <Route
          path="*"
          element={
            session && profile
              ? <Navigate to={`/${profile.role}`} replace />
              : <Navigate to="/login" replace />
          }
        />
      </Routes>
    </BrowserRouter>
  )
}
