import { useEffect, useState } from 'react'
import { useNavigate, useParams, Link } from 'react-router-dom'
import { ArrowLeft, Send, Square } from 'lucide-react'
import { api, supabase } from '../api/client'
import AttendanceTable from '../components/teacher/AttendanceTable'
import LiveFeed from '../components/teacher/LiveFeed'
import TagoLogo from '../components/TagoLogo'
import ThemeToggle from '../components/ThemeToggle'
import ProfileMenu from '../components/ProfileMenu'
import NotificationBell from '../components/NotificationBell'
import ErrorToast from '../components/ErrorToast'
import ConfirmDialog from '../components/ConfirmDialog'

function formatSessionTime(value) {
  return value ? new Date(value).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : 'time not set'
}

export default function TeacherSessionPage({ session, profile }) {
  const { sessionId } = useParams()
  const navigate = useNavigate()

  const [activeSession, setActiveSession] = useState(null)
  const [sessionLoading, setSessionLoading] = useState(true)
  const [notFound, setNotFound] = useState(false)
  const [attendance, setAttendance] = useState([])
  const [ending, setEnding] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [errorMessage, setErrorMessage] = useState(null)
  const [confirmAction, setConfirmAction] = useState(null)

  // Look up the session by id. Reuses the existing /api/sessions list
  // endpoint rather than assuming a single-session route exists.
  useEffect(() => {
    let cancelled = false

    async function loadSession() {
      setSessionLoading(true)
      setNotFound(false)

      const data = await api.get('/api/sessions')
      if (cancelled) return

      const match = Array.isArray(data) ? data.find((item) => item.id === sessionId) : null

      // Still findable here once ended but not yet submitted, so a page
      // refresh mid-review doesn't strand the teacher before they can submit.
      if (!match || match.submitted_at) {
        setNotFound(true)
        setSessionLoading(false)
        return
      }

      setActiveSession(match)
      setSessionLoading(false)
    }

    loadSession()

    return () => { cancelled = true }
  }, [sessionId])

  // Redirect back to the dashboard if this session doesn't exist or has
  // already ended (e.g. someone else ended it, or a stale refresh).
  useEffect(() => {
    if (notFound) navigate('/teacher', { replace: true })
  }, [notFound, navigate])

  useEffect(() => {
    if (!sessionId) return
    api.get(`/api/attendance/session/${sessionId}`)
      .then((data) => setAttendance(Array.isArray(data) ? data : []))
  }, [sessionId])

  useEffect(() => {
    const channel = supabase
      .channel(`attendance-changes-${sessionId}`)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'attendance' },
        async (payload) => {
          if (payload.new.session_id !== sessionId) return
          const data = await api.get(`/api/attendance/session/${sessionId}`)
          setAttendance(Array.isArray(data) ? data : [])
        }
      )
      .subscribe()

    return () => supabase.removeChannel(channel)
  }, [sessionId])

  function handleEventUpdate(attendanceId, updatedRecord) {
    setAttendance((prev) => prev.map((row) => (row.id === attendanceId ? { ...row, ...updatedRecord } : row)))
  }

  async function endSession() {
    setEnding(true)
    const data = await api.patch(`/api/sessions/${sessionId}/end`, {})
    setEnding(false)

    if (data?.error) {
      setErrorMessage(data.error)
      return
    }

    // Stay on the page so the teacher can review the roll before
    // submitting it to admin, rather than being redirected away immediately.
    setActiveSession(data)
  }

  async function submitAttendance() {
    setSubmitting(true)
    const data = await api.patch(`/api/sessions/${sessionId}/submit`, {})
    setSubmitting(false)

    if (data?.error) {
      setErrorMessage(data.error)
      return
    }

    navigate('/teacher')
  }

  if (sessionLoading) {
    return (
      <div className="dashboard">
        <main className="dashboard-main">
          <p className="table-helper-text">Loading session...</p>
        </main>
      </div>
    )
  }

  return (
    <div className="dashboard">
      <header className="dashboard-header">
        <div className="header-brand">
          <TagoLogo showWord size={18} markClassName="header-brand-icon" />
        </div>
        <div className="header-right">
          <NotificationBell />
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
        <Link to="/teacher" className="btn-ghost session-back-link">
          <ArrowLeft size={14} strokeWidth={2.2} />
          Back to dashboard
        </Link>

        <section className="portal-section">
          <div className="session-live-row">
            <div>
              <div className="session-live-title">
                <span className="session-live-dot" />
                Session live
              </div>
              <p className="session-helper-text">
                {activeSession.classes?.name || 'Class'} - started {formatSessionTime(activeSession.started_at)}
                {activeSession.classes?.room ? ` - ${activeSession.classes.room}` : ''}
                {activeSession.profiles?.full_name ? ` - opened by ${activeSession.profiles.full_name}` : ''}
                {activeSession.ended_at ? ' - ended, ready to review' : ''}
              </p>
            </div>

            {activeSession.ended_at ? (
              <button onClick={() => setConfirmAction('submit')} disabled={submitting} className="session-end-button session-submit-button">
                <Send size={14} strokeWidth={2.2} />
                {submitting ? 'Submitting...' : 'Confirm & submit attendance'}
              </button>
            ) : (
              <button onClick={() => setConfirmAction('end')} disabled={ending} className="session-end-button">
                <Square size={14} strokeWidth={2.2} />
                {ending ? 'Ending...' : 'End session'}
              </button>
            )}
          </div>
        </section>

        <LiveFeed events={attendance} onEventUpdate={handleEventUpdate} onError={setErrorMessage} />
        <AttendanceTable
          attendance={attendance}
          activeSession={activeSession}
          setAttendance={setAttendance}
        />
      </main>

      <ErrorToast message={errorMessage} onClose={() => setErrorMessage(null)} />

      {confirmAction === 'end' && (
        <ConfirmDialog
          eyebrow="End session"
          title={activeSession.classes?.name || 'Class session'}
          description="This stops the reader from taking any more scans for this session. You'll still be able to review the roll before submitting it."
          confirmLabel="End session"
          onClose={() => setConfirmAction(null)}
          onConfirm={async () => {
            await endSession()
            setConfirmAction(null)
          }}
          busy={ending}
        />
      )}

      {confirmAction === 'submit' && (
        <ConfirmDialog
          eyebrow="Submit attendance"
          title={activeSession.classes?.name || 'Class session'}
          description="This sends the roll to admin for review. Double-check the list below before confirming - you won't be able to edit it here afterwards."
          confirmLabel="Confirm & submit"
          onClose={() => setConfirmAction(null)}
          onConfirm={async () => {
            await submitAttendance()
            setConfirmAction(null)
          }}
          busy={submitting}
        />
      )}
    </div>
  )
}