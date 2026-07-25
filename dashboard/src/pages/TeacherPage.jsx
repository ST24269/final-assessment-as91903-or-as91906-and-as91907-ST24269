import { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import { ArrowUpRight } from 'lucide-react'
import { supabase } from '../api/client'
import { api } from '../api/client'
import AttendanceTable from '../components/teacher/AttendanceTable'
import SessionPanel from '../components/teacher/SessionPanel'
import LiveFeed from '../components/teacher/LiveFeed'
import ScanIssuesAlert from '../components/teacher/ScanIssuesAlert'
import TagoLogo from '../components/TagoLogo'
import ThemeToggle from '../components/ThemeToggle'
import ProfileMenu from '../components/ProfileMenu'
import TimetableView from '../components/TimetableView'
import AppealsPanel from '../components/AppealsPanel'
import Card from '../components/Card'

const EMPTY_TIMETABLE = { periods: [], todayPeriods: [], currentClass: null, nextClass: null }
const SCAN_ISSUE_RESULTS = ['invalid_card', 'not_enrolled']

export default function TeacherPage({ session, profile }) {
  const [activeSession, setActiveSession] = useState(null)
  const [attendance, setAttendance] = useState([])
  const [timetable, setTimetable] = useState(EMPTY_TIMETABLE)
  const [timetableLoading, setTimetableLoading] = useState(true)
  const [scanIssues, setScanIssues] = useState([])
  const [dismissedIssueIds, setDismissedIssueIds] = useState(() => new Set())

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

  // Wrong-class taps and unrecognised cards - RLS on scan_logs limits this to
  // errors that happened at a reader in one of this teacher's own rooms.
  useEffect(() => {
    let cancelled = false

    supabase
      .from('scan_logs')
      .select('*, students(full_name)')
      .in('result', SCAN_ISSUE_RESULTS)
      .order('created_at', { ascending: false })
      .limit(20)
      .then(({ data }) => {
        if (cancelled) return
        setScanIssues((data || []).map((row) => ({ ...row, student: row.students })))
      })

    const channel = supabase
      .channel('scan-log-errors')
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'scan_logs' },
        (payload) => {
          if (!SCAN_ISSUE_RESULTS.includes(payload.new.result)) return
          setScanIssues((current) => [payload.new, ...current].slice(0, 20))
        }
      )
      .subscribe()

    return () => {
      cancelled = true
      supabase.removeChannel(channel)
    }
  }, [])

  function dismissScanIssue(id) {
    setDismissedIssueIds((current) => new Set(current).add(id))
  }

  const visibleScanIssues = scanIssues.filter((issue) => !dismissedIssueIds.has(issue.id))

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
        <ScanIssuesAlert issues={visibleScanIssues} onDismiss={dismissScanIssue} />
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
        <Card
          title="Appeals for your classes"
          action={(
            <Link className="btn-ghost" to="/teacher/appeals">
              Manage appeals
              <ArrowUpRight size={14} strokeWidth={2.2} />
            </Link>
          )}
        >
          <AppealsPanel mode="teacher" compact hideResolved />
        </Card>
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