import { useState, useEffect } from 'react'
import { supabase } from '../api/client'
import { api } from '../api/client'
import AttendanceTable from './AttendanceTable'
import SessionPanel from './SessionPanel'
import LiveFeed from './LiveFeed'

export default function TeacherDashboard({ session }) {
  const [activeSession, setActiveSession] = useState(null)
  const [attendance, setAttendance] = useState([])

  const handleSignOut = () => supabase.auth.signOut()

  useEffect(() => {
    if (!activeSession) return
    api.get(`/api/attendance/session/${activeSession.id}`)
      .then(data => setAttendance(Array.isArray(data) ? data : []))
  }, [activeSession])

  useEffect(() => {
    if (!activeSession) return
    const channel = supabase
      .channel('attendance-changes')
      .on('postgres_changes', {
        event: 'INSERT',
        schema: 'public',
        table: 'attendance',
      }, (payload) => {
        if (payload.new.session_id !== activeSession.id) return
        setAttendance(prev => [...prev, payload.new])
      })
      .subscribe()
    return () => supabase.removeChannel(channel)
  }, [activeSession])

  return (
    <div className="dashboard">
      <header className="dashboard-header">
        <div className="header-brand">
          <div className="header-brand-icon">📡</div>
          <h1>AttendRFID</h1>
        </div>
        <div className="header-right">
          <span className="header-email">{session.user.email}</span>
          <button className="btn-ghost" onClick={handleSignOut}>Sign out</button>
        </div>
      </header>

      <main className="dashboard-main">
        <SessionPanel
          session={session}
          activeSession={activeSession}
          setActiveSession={setActiveSession}
        />
        {activeSession && (
          <>
            <LiveFeed activeSession={activeSession} />
            <AttendanceTable
              attendance={attendance}
              activeSession={activeSession}
              setAttendance={setAttendance}
            />
          </>
        )}
      </main>
    </div>
  )
}