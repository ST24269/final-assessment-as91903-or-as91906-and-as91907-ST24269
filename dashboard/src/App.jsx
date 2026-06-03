import './styles/index.css'
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { useState, useEffect } from 'react'
import { supabase } from './api/client'
import LoginPage from './pages/LoginPage'
import TeacherPage from './pages/TeacherPage'
import StudentPage from './pages/StudentPage'
import AdminPage from './pages/AdminPage'

function ProtectedRoute({ session, profile, role, children }) {
  if (!session) return <Navigate to="/login" replace />
  if (profile && profile.role !== role) return <Navigate to={`/${profile.role}`} replace />
  return children
}

export default function App() {
  const [session, setSession] = useState(undefined)
  const [profile, setProfile] = useState(null)

  useEffect(() => {
    // Get initial session
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session ?? null)
    })

    // Listen for changes
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session ?? null)
    })

    return () => subscription.unsubscribe()
  }, [])

  // Fetch profile whenever session changes
  useEffect(() => {
    if (session === undefined) return
    if (!session) { setProfile(null); return }

    supabase
      .from('profiles')
      .select('*')
      .eq('id', session.user.id)
      .single()
      .then(({ data }) => setProfile(data))
  }, [session])

  if (session === undefined) return <div className="loading">connecting</div>

  if (session && !profile) return <div className="loading">connecting</div>

  return (
    <BrowserRouter>
      <Routes>
        <Route path="/login" element={
          session && profile
            ? <Navigate to={`/${profile.role}`} replace />
            : <LoginPage />
        } />
        <Route path="/teacher" element={
          <ProtectedRoute session={session} profile={profile} role="teacher">
            <TeacherPage session={session} profile={profile} />
          </ProtectedRoute>
        } />
        <Route path="/student" element={
          <ProtectedRoute session={session} profile={profile} role="student">
            <StudentPage session={session} profile={profile} />
          </ProtectedRoute>
        } />
        <Route path="/admin" element={
          <ProtectedRoute session={session} profile={profile} role="admin">
            <AdminPage session={session} profile={profile} />
          </ProtectedRoute>
        } />
        <Route path="*" element={
          session && profile
            ? <Navigate to={`/${profile.role}`} replace />
            : <Navigate to="/login" replace />
        } />
      </Routes>
    </BrowserRouter>
  )
}