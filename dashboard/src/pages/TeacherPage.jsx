import { useState, useEffect } from 'react'
import { supabase } from '../api/client'
import { api } from '../api/client'
import AttendanceTable from '../components/teacher/AttendanceTable'
import SessionPanel from '../components/teacher/SessionPanel'
import LiveFeed from '../components/teacher/LiveFeed'
import TagoLogo from '../components/TagoLogo'

export default function TeacherPage({ session }) {
  const [activeSession, setActiveSession] = useState(null)
  const [attendance, setAttendance] = useState([])

  const handleSignOut = () => supabase.auth.signOut()

  useEffect(() => {
    if (!activeSession) return
    api.get(`/api/attendance/session/${activeSession.id}`)
      .then((data) => setAttendance(Array.isArray(data) ? data : []))
  }, [activeSession])

  useEffect(() => {
    if (!activeSession) return
    const channel = supabase
      .channel('attendance-changes')
.on(
  'postgres_changes',
  {
    event: 'INSERT',
    schema: 'public',
    table: 'attendance',
  },
  async (payload) => {
    if (payload.new.session_id !== activeSession.id) return

    const data = await api.get(`/api/attendance/session/${activeSession.id}`)
    setAttendance(Array.isArray(data) ? data : [])
  }
)
      .subscribe()
    return () => supabase.removeChannel(channel)
  }, [activeSession])

  return (
    <div className="dashboard">
      <header className="dashboard-header">
        <div className="header-brand">
          <TagoLogo showWord size={18} markClassName="header-brand-icon" />
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