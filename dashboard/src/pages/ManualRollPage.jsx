import { useEffect, useMemo, useState } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import { AlertTriangle, ArrowLeft, ChevronRight, ClipboardList, Save, Send } from 'lucide-react'
import { api } from '../api/client'
import TagoLogo from '../components/TagoLogo'
import ThemeToggle from '../components/ThemeToggle'
import ProfileMenu from '../components/ProfileMenu'
import NotificationBell from '../components/teacher/NotificationBell'
import Card from '../components/Card'
import ErrorToast from '../components/ErrorToast'
import StudentDetailModal from '../components/teacher/StudentDetailModal'

const STATUS_OPTIONS = ['present', 'late', 'absent', 'excused']

export default function ManualRollPage({ session, profile }) {
  const navigate = useNavigate()

  const [classes, setClasses] = useState([])
  const [loadingClasses, setLoadingClasses] = useState(true)
  const [selectedClass, setSelectedClass] = useState('')

  const [activeSession, setActiveSession] = useState(null)
  const [startingSession, setStartingSession] = useState(false)

  const [roster, setRoster] = useState([])
  const [loadingRoster, setLoadingRoster] = useState(false)
  // Keyed by student id -> status string. A student with no key here is
  // UNMARKED, not present - see saveRoll(), which refuses to save until
  // every roster row has an explicit value. Nothing defaults to 'present'.
  const [statuses, setStatuses] = useState({})

  const [detailStudentId, setDetailStudentId] = useState(null)

  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [errorMessage, setErrorMessage] = useState(null)

  // Load the classes this teacher can take a roll for.
  useEffect(() => {
    let cancelled = false

    api.get('/api/sessions/classes').then((data) => {
      if (cancelled) return
      if (data?.error) {
        setErrorMessage(data.error)
      } else {
        setClasses(Array.isArray(data) ? data : [])
      }
      setLoadingClasses(false)
    })

    return () => { cancelled = true }
  }, [])

  const selectedClassDetails = useMemo(
    () => classes.find((classItem) => classItem.id === selectedClass),
    [classes, selectedClass],
  )

  const unmarkedCount = roster.filter((student) => !statuses[student.id]).length

  // Whenever a class is chosen: look for a session already live for it
  // (an RFID session the reader has since dropped out of, or a manual
  // roll someone already started) and load the roster + any attendance
  // already recorded, so re-opening this page doesn't lose work.
  useEffect(() => {
    if (!selectedClass) {
      setActiveSession(null)
      setRoster([])
      setStatuses({})
      setSaved(false)
      return
    }

    let cancelled = false
    setLoadingRoster(true)
    setSaved(false)

    async function load() {
      const [rosterData, sessionData] = await Promise.all([
        api.get(`/api/students/roster/${selectedClass}`),
        api.get(`/api/sessions/active/${selectedClass}`),
      ])

      if (cancelled) return

      if (rosterData?.error) {
        setErrorMessage(rosterData.error)
        setRoster([])
      } else {
        setRoster(Array.isArray(rosterData) ? rosterData : [])
      }

      const foundSession = sessionData?.error ? null : sessionData
      setActiveSession(foundSession || null)

      if (foundSession) {
        const attendanceData = await api.get(`/api/attendance/session/${foundSession.id}`)
        if (cancelled) return

        // Only pre-fill students who already have a real recorded status
        // (e.g. an RFID scan came in before the reader died). Everyone
        // else starts unmarked - the teacher has to actively choose.
        if (Array.isArray(attendanceData)) {
          const initial = {}
          for (const record of attendanceData) {
            initial[record.student_id] = record.status
          }
          setStatuses(initial)
        }
      } else {
        setStatuses({})
      }

      setLoadingRoster(false)
    }

    load()

    return () => { cancelled = true }
  }, [selectedClass])

  async function startManualSession() {
    if (!selectedClass) return
    setStartingSession(true)
    setErrorMessage(null)

    const data = await api.post('/api/sessions/start', {
      class_id: selectedClass,
      manual: true,
      notes: 'Manual roll (backup attendance)',
    })

    setStartingSession(false)

    if (!data) {
      setErrorMessage('Could not start the manual roll.')
      return
    }

    if (data.error) {
      // Someone already has a session running for this class (RFID or
      // manual) - just pick it up rather than blocking the teacher.
      if (data.active_session) {
        setActiveSession(data.active_session)
      } else {
        setErrorMessage(data.error)
      }
      return
    }

    setActiveSession(data)
  }

  function setStatus(studentId, status) {
    setStatuses((prev) => ({ ...prev, [studentId]: status }))
    setSaved(false)
  }

  function markAllPresent() {
    const next = {}
    for (const student of roster) next[student.id] = 'present'
    setStatuses(next)
    setSaved(false)
  }

  async function saveRoll() {
    if (!activeSession) return

    if (unmarkedCount > 0) {
      setErrorMessage(
        `${unmarkedCount} student${unmarkedCount === 1 ? '' : 's'} still ${unmarkedCount === 1 ? "isn't" : "aren't"} marked. Set a status for every row before saving - nobody is assumed present.`,
      )
      return
    }

    const records = roster.map((student) => ({
      student_id: student.id,
      status: statuses[student.id],
    }))

    setSaving(true)
    setErrorMessage(null)

    const data = await api.post(`/api/attendance/manual/${activeSession.id}`, { records })

    setSaving(false)

    if (data?.error) {
      setErrorMessage(data.error)
      return
    }

    setSaved(true)
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

        <Card title="Manual roll (backup attendance)">
          <div className="portal-session-grid" style={{ marginTop: '0.75rem' }}>
            <select
              value={selectedClass}
              onChange={(event) => setSelectedClass(event.target.value)}
              disabled={loadingClasses}
              className="session-select"
            >
              <option value="">{loadingClasses ? 'Loading classes...' : 'Select a class...'}</option>
              {classes.map((classItem) => (
                <option key={classItem.id} value={classItem.id}>
                  {classItem.name} - {classItem.subject}{classItem.room ? ` (${classItem.room})` : ''}
                </option>
              ))}
            </select>
          </div>

          {selectedClassDetails && (
            <p className="session-helper-text">
              Room: {selectedClassDetails.room || 'not set'} - Subject: {selectedClassDetails.subject}
            </p>
          )}
        </Card>

        {selectedClass && !activeSession && !loadingRoster && (
          <Card title="Start the roll">
            <button
              type="button"
              onClick={startManualSession}
              disabled={startingSession}
              className="session-start-button"
            >
              <ClipboardList size={15} strokeWidth={2.2} />
              {startingSession ? 'Starting...' : 'Start manual roll'}
            </button>
          </Card>
        )}

        {selectedClass && activeSession && (
          <Card
            title={`Roster${roster.length ? ` - ${roster.length} students` : ''}`}
            action={(
              <button type="button" className="btn-ghost" onClick={markAllPresent} disabled={loadingRoster}>
                Mark all present
              </button>
            )}
          >
            {loadingRoster ? (
              <p className="table-helper-text">Loading roster...</p>
            ) : roster.length === 0 ? (
              <p className="table-helper-text">No students are enrolled in this class yet.</p>
            ) : (
              <>
                {unmarkedCount > 0 && (
                  <p className="portal-error-message manual-roll-unmarked-banner">
                    <AlertTriangle size={14} strokeWidth={2.2} />
                    {unmarkedCount} student{unmarkedCount === 1 ? '' : 's'} not marked yet
                  </p>
                )}

                <div className="student-table-wrap">
                  <table className="attendance-table teacher-register-table">
                    <thead>
                      <tr>
                        {['Photo', 'Student', 'LA teacher', 'Status'].map((heading) => (
                          <th key={heading}>{heading}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {roster.map((student) => {
                        const status = statuses[student.id] || ''

                        return (
                          <tr key={student.id} className={status ? '' : 'is-unmarked'}>
                            <td>
                              <button
                                type="button"
                                className="live-feed-clickable manual-roll-photo-btn"
                                onClick={() => setDetailStudentId(student.id)}
                                title="View student details"
                              >
                                <img
                                  src={student.photo_url || '/default-avatar.png'}
                                  alt=""
                                  className="student-detail-photo"
                                />
                              </button>
                            </td>
                            <td>
                              <button
                                type="button"
                                className="live-feed-clickable manual-roll-name-btn"
                                onClick={() => setDetailStudentId(student.id)}
                              >
                                <strong>{student.full_name}</strong>
                                <ChevronRight size={14} strokeWidth={2.2} className="live-feed-chevron" />
                              </button>
                              <div className="student-id">{student.student_number}</div>
                            </td>
                            <td className="student-id">
                              {student.la_teacher_name || 'Not set'}
                            </td>
                            <td>
                              <select
                                value={status}
                                onChange={(event) => setStatus(student.id, event.target.value)}
                                className="override-select"
                              >
                                <option value="">Not marked</option>
                                {STATUS_OPTIONS.map((option) => (
                                  <option key={option} value={option}>{option}</option>
                                ))}
                              </select>
                            </td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
              </>
            )}

            {roster.length > 0 && (
              <div className="session-live-row" style={{ marginTop: '1rem' }}>
                <button
                  type="button"
                  onClick={saveRoll}
                  disabled={saving || loadingRoster}
                  className="session-start-button"
                >
                  <Save size={15} strokeWidth={2.2} />
                  {saving ? 'Saving...' : 'Save attendance'}
                </button>

                {saved && (
                  <button
                    type="button"
                    onClick={() => navigate(`/teacher/session/${activeSession.id}`)}
                    className="session-end-button session-submit-button"
                  >
                    <Send size={14} strokeWidth={2.2} />
                    Review &amp; submit to admin
                  </button>
                )}
              </div>
            )}

            {saved && (
              <p className="session-helper-text">
                Saved. Go to review to end the session and submit it to admin, or keep editing and
                save again.
              </p>
            )}
          </Card>
        )}
      </main>

      {detailStudentId && (
        <StudentDetailModal
          studentId={detailStudentId}
          onClose={() => setDetailStudentId(null)}
        />
      )}

      <ErrorToast message={errorMessage} onClose={() => setErrorMessage(null)} />
    </div>
  )
}