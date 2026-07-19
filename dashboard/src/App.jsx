import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { useState, useEffect, useRef } from 'react'
import { clientConfigError, supabase } from './api/client'
import AdminLoginPage from './pages/AdminLoginPage'
import TeacherLoginPage from './pages/TeacherLoginPage'
import StudentLoginPage from './pages/StudentLoginPage'
import TeacherPage from './pages/TeacherPage'
import StudentPage from './pages/StudentPage'
import StudentAppealsPage from './pages/StudentAppealsPage'
import AdminPage from './pages/AdminPage'
import AccountPage from './pages/AccountPage'
import ResetPasswordPage from './pages/ResetPasswordPage'
import PublicHomePage from './pages/PublicHomePage'
import ProjectDocumentationPage from './pages/ProjectDocumentationPage'
import Loader from './components/Loader'
import { canAccessAccountSection } from './config/permissions'


const LOGIN_ROLE_KEY = 'tago-login-role'
const LOGIN_NOTICE_KEY = 'tago-login-notice'
const VALID_ROLES = ['student', 'teacher', 'admin']

function isValidRole(role) {
  return VALID_ROLES.includes(role)
}

function writeLoginNotice(notice) {
  try {
    window.sessionStorage.setItem(LOGIN_NOTICE_KEY, JSON.stringify(notice))
  } catch {
    // Storage can be unavailable in strict browser privacy modes.
  }
}

function clearLoginIntent() {
  try {
    window.sessionStorage.removeItem(LOGIN_ROLE_KEY)
  } catch {
    // Storage can be unavailable in strict browser privacy modes.
  }
}

function readLoginIntent() {
  try {
    return window.sessionStorage.getItem(LOGIN_ROLE_KEY)
  } catch {
    return null
  }
}

function StartupError({ message }) {
  return (
    <main className="app-failure" role="alert">
      <section className="app-failure-panel">
        <p className="app-failure-kicker">Configuration needed</p>
        <h1>Tago cannot connect yet.</h1>
        <p>{message}</p>
        <p>
          The service-role key still belongs on the backend only. The dashboard
          should only receive Vite variables that begin with VITE_.
        </p>
        <div className="app-failure-actions">
          <button type="button" onClick={() => window.location.reload()}>
            Retry
          </button>
        </div>
      </section>
    </main>
  )
}

function ProtectedRoute({ session, profile, role, children }) {
  if (!session) return <Navigate to={`/login/${role}`} replace />

  if (!profile) {
    return <Navigate to={`/login/${role}`} replace />
  }

  if (!isValidRole(profile.role)) {
    return <Navigate to="/login/student" replace />
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

  if (!isValidRole(profile.role)) {
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

function LoginRoute({ session, profile, role, setSession, setProfile, children }) {
  const switchingRoles = Boolean(session && profile && role && profile.role !== role)

  useEffect(() => {
    if (!switchingRoles) return

    writeLoginNotice({
      type: 'role-mismatch',
      expectedRole: role,
      actualRole: profile.role,
    })
    clearLoginIntent()

    supabase.auth.signOut().finally(() => {
      setSession(null)
      setProfile(null)
    })
  }, [profile?.role, role, setProfile, setSession, switchingRoles])

  if (session && profile) {
    if (switchingRoles) {
      return (
        <Loader
          title="Switching sign-in role"
          subtitle={`Signing out of the ${profile.role} session`}
        />
      )
    }

    return <Navigate to={`/${isValidRole(profile.role) ? profile.role : 'student'}`} replace />
  }

  return children
}

export default function App() {
  const configReady = Boolean(supabase && !clientConfigError)
  const [session, setSession] = useState(undefined)
  const [profile, setProfile] = useState(null)
  const [profileLoading, setProfileLoading] = useState(false)
  const [profileError, setProfileError] = useState(null)
  const lastSessionUserId = useRef(null)
  const userId = session?.user?.id
  const sessionReady = session !== undefined

  useEffect(() => {
    if (!configReady) {
      return undefined
    }

    const getInitialSession = async () => {
      const { data, error } = await supabase.auth.getSession()

      if (error) {
        console.error('Session error:', error)
        setSession(null)
        return
      }

      lastSessionUserId.current = data.session?.user?.id || null
      setSession(data.session ?? null)
    }

    getInitialSession()

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event, session) => {
      const nextUserId = session?.user?.id || null
      const userChanged = nextUserId !== lastSessionUserId.current
      lastSessionUserId.current = nextUserId

      if (event === 'SIGNED_OUT') {
        clearLoginIntent()
        setProfile(null)
        setProfileError(null)
      }

      if (event === 'SIGNED_IN' && userChanged) {
        setProfile(null)
        setProfileError(null)
      }

      setSession(session ?? null)
    })

    return () => subscription.unsubscribe()
  }, [configReady])

  useEffect(() => {
    const fetchProfile = async () => {
      if (!configReady) return
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

        if (!isValidRole(data.role)) {
          console.error('Invalid profile role:', data.role)
          writeLoginNotice({
            type: 'invalid-role',
            actualRole: data.role,
          })
          await supabase.auth.signOut()
          clearLoginIntent()
          setSession(null)
          setProfile(null)
          return
        }

        const expectedRole = readLoginIntent()
        if (expectedRole && data.role !== expectedRole) {
          writeLoginNotice({
            type: 'role-mismatch',
            expectedRole,
            actualRole: data.role,
          })
          await supabase.auth.signOut()
          clearLoginIntent()
          setSession(null)
          setProfile(null)
          return
        }

        clearLoginIntent()
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
  }, [configReady, sessionReady, userId])

  if (!configReady) {
    return <StartupError message={clientConfigError} />
  }

  if (session === undefined) {
    return (
      <Loader
        title="Connecting to Tago"
        subtitle="Checking your saved session"
      />
    )
  }

  if (session && (profileLoading || (!profile && !profileError))) {
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
        <Route path="/" element={<PublicHomePage />} />
        <Route path="/home" element={<PublicHomePage />} />
        <Route path="/documentation" element={<ProjectDocumentationPage />} />
        <Route path="/project" element={<ProjectDocumentationPage />} />

        <Route
          path="/login"
          element={
            <LoginRoute session={session} profile={profile} role="student" setSession={setSession} setProfile={setProfile}>
              <StudentLoginPage />
            </LoginRoute>
          }
        />

        <Route path="/reset-password" element={<ResetPasswordPage />} />

        <Route
          path="/login/admin"
          element={
            <LoginRoute session={session} profile={profile} role="admin" setSession={setSession} setProfile={setProfile}>
              <AdminLoginPage />
            </LoginRoute>
          }
        />

        <Route
          path="/admin/login"
          element={
            <LoginRoute session={session} profile={profile} role="admin" setSession={setSession} setProfile={setProfile}>
              <AdminLoginPage />
            </LoginRoute>
          }
        />

        <Route
          path="/login/teacher"
          element={
            <LoginRoute session={session} profile={profile} role="teacher" setSession={setSession} setProfile={setProfile}>
              <TeacherLoginPage />
            </LoginRoute>
          }
        />

        <Route
          path="/teacher/login"
          element={
            <LoginRoute session={session} profile={profile} role="teacher" setSession={setSession} setProfile={setProfile}>
              <TeacherLoginPage />
            </LoginRoute>
          }
        />

        <Route
          path="/login/student"
          element={
            <LoginRoute session={session} profile={profile} role="student" setSession={setSession} setProfile={setProfile}>
              <StudentLoginPage />
            </LoginRoute>
          }
        />

        <Route
          path="/student/login"
          element={
            <LoginRoute session={session} profile={profile} role="student" setSession={setSession} setProfile={setProfile}>
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
          path="/student/appeals"
          element={
            <ProtectedRoute session={session} profile={profile} role="student">
              <StudentAppealsPage session={session} profile={profile} />
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
              ? <Navigate to={`/${isValidRole(profile.role) ? profile.role : 'student'}`} replace />
              : <Navigate to="/login/student" replace />
          }
        />
      </Routes>
    </BrowserRouter>
  )
}
