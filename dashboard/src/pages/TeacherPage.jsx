import { useState, useEffect } from 'react'
import { supabase } from '../api/client'
import { api } from '../api/client'
import AttendanceTable from '../components/teacher/AttendanceTable'
import SessionPanel from '../components/teacher/SessionPanel'
import LiveFeed from '../components/teacher/LiveFeed'
import TagoLogo from '../components/TagoLogo'
import ThemeToggle from '../components/ThemeToggle'
import ProfileMenu from '../components/ProfileMenu'
import TimetableView from '../components/TimetableView'
import AppealsPanel from '../components/AppealsPanel'

const EMPTY_TIMETABLE = { periods: [], todayPeriods: [], currentClass: null, nextClass: null }

export default function TeacherPage({ session, profile }) {
  const [activeSession, setActiveSession] = useState(null)
  const [attendance, setAttendance] = useState([])
  const [timetable, setTimetable] = useState(EMPTY_TIMETABLE)
  const [timetableLoading, setTimetableLoading] = useState(true)

  useEffect(() => {
    let cancelled = false

    api.get('/api/timetable/teacher').then((data) => {
      if (cancelled) return
      setTimetable(data?.error ? EMPTY_TIMETABLE : { ...EMPTY_TIMETABLE, periods: Array.isArray(data) ? data : [] })
      setTimetableLoading(false)
    })

    return () => { cancelled = true }
  }, [])

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
  
async function handleFlag(attendanceId) {
    const updated = await api.patch(`/api/attendance/${attendanceId}/flag`, { reason: 'photo_mismatch' })
    if (!updated?.error) {
      setAttendance((prev) => prev.map((row) => (row.id === attendanceId ? { ...row, ...updated } : row)))
    }
  }
  return (
    <div className="dashboard">
      <header className="dashboard-header">
        <div className="header-brand">
          <TagoLogo showWord size={18} markClassName="header-brand-icon" />
        </div>
        <div className="header-right">
          <ThemeToggle />
          <ProfileMenu
            name={profile?.full_name}
            email={session.user.email}
            role="teacher"
            profileId={profile?.id}
          />
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
            <LiveFeed events={attendance} onFlag={handleFlag} />
            <AttendanceTable
              attendance={attendance}
              activeSession={activeSession}
              setAttendance={setAttendance}
            />
          </>
        )}
        <AppealsPanel mode="teacher" />
        {!timetableLoading && (
          <TimetableView
            periods={timetable.periods}
            todayPeriods={timetable.todayPeriods}
            currentClass={timetable.currentClass}
            nextClass={timetable.nextClass}
            title="Timetable"
            subtitle="Classes assigned to you"
            emptyMessage="No timetable periods are assigned to you yet."
          />
        )}
      </main>
    </div>
  )
}