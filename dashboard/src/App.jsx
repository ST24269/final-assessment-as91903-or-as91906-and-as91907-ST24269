import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { useState, useEffect } from 'react'
import { supabase } from './api/client'
import AdminLoginPage from './pages/AdminLoginPage'
import TeacherLoginPage from './pages/TeacherLoginPage'
import StudentLoginPage from './pages/StudentLoginPage'
import TeacherPage from './pages/TeacherPage'
import StudentPage from './pages/StudentPage'
import AdminPage from './pages/AdminPage'
import AccountPage from './pages/AccountPage'
import ResetPasswordPage from './pages/ResetPasswordPage'
import Loader from './components/Loader'
import { canAccessAccountSection } from './config/permissions'

const LOGIN_ROLE_KEY = 'attendrfid-login-role'
const LOGIN_NOTICE_KEY = 'attendrfid-login-notice'

function writeLoginNotice(notice) {
  window.sessionStorage.setItem(LOGIN_NOTICE_KEY, JSON.stringify(notice))
}

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

function AccountRoute({ session, profile, section, setProfile }) {
  if (!session) return <Navigate to="/login/student" replace />

  if (!profile) {
    return <Navigate to="/login/student" replace />
  }

  if (!canAccessAccountSection(profile.role, section)) {
    return <Navigate to="/account/profile" replace />
  }

  return (
    <AccountPage
      session={session}
      profile={profile}
      section={section}
      setProfile={setProfile}
    />
  )
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
  const userId = session?.user?.id
  const sessionReady = session !== undefined

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
      if (!sessionReady) return

      if (!userId) {
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
          .eq('id', userId)
          .maybeSingle()

        if (error) {
          console.error('Profile fetch error:', error)
          setProfileError(error.message)
          setProfile(null)
          return
        }

        if (!data) {
          console.error('No profile found for user:', userId)
          setProfileError('No profile found for this user.')
          setProfile(null)
          return
        }

        const expectedRole = window.sessionStorage.getItem(LOGIN_ROLE_KEY)
        if (expectedRole && data.role !== expectedRole) {
          writeLoginNotice({
            type: 'role-mismatch',
            expectedRole,
            actualRole: data.role,
          })
          await supabase.auth.signOut()
          window.sessionStorage.removeItem(LOGIN_ROLE_KEY)
          setSession(null)
          setProfile(null)
          return
        }

        window.sessionStorage.removeItem(LOGIN_ROLE_KEY)
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
  }, [sessionReady, userId])

  if (session === undefined) {
    return (
      <Loader
        title="Connecting to AttendRFID"
        subtitle="Checking your saved session"
      />
    )
  }

  if (session && profileLoading) {
    return (
      <Loader
        title="Checking your account"
        subtitle="Loading your dashboard permissions"
      />
    )
  }

  if (session && profileError) {
    return (
      <div className="loading auth-loading-error">
        <p>{profileError}</p>
        <button
          onClick={async () => {
            await supabase.auth.signOut()
            setSession(null)
            setProfile(null)
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
              <StudentLoginPage />
            </LoginRoute>
          }
        />

        <Route path="/reset-password" element={<ResetPasswordPage />} />

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

        {['profile', 'rfid', 'attendance', 'security', 'settings'].map((section) => (
          <Route
            key={section}
            path={`/account/${section}`}
            element={
              <AccountRoute
                session={session}
                profile={profile}
                section={section}
                setProfile={setProfile}
              />
            }
          />
        ))}

        <Route path="/account/role" element={<Navigate to="/account/profile" replace />} />
        <Route path="/account/policies" element={<Navigate to="/account/profile" replace />} />
        <Route path="/account" element={<Navigate to="/account/profile" replace />} />

        <Route
          path="*"
          element={
            session && profile
              ? <Navigate to={`/${profile.role}`} replace />
              : <Navigate to="/login/student" replace />
          }
        />
      </Routes>
    </BrowserRouter>
  )
}
