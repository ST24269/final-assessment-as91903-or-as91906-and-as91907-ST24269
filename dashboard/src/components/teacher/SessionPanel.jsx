import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { ExternalLink, Play, Square } from 'lucide-react'
import { api } from '../../api/client'

function formatSessionTime(value) {
  return value ? new Date(value).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : 'time not set'
}

export default function SessionPanel({ activeSession, setActiveSession }) {
  const navigate = useNavigate()
  const [classes, setClasses] = useState([])
  const [activeSessions, setActiveSessions] = useState([])
  const [selectedClass, setSelectedClass] = useState('')
  const [notes, setNotes] = useState('')
  const [loading, setLoading] = useState(false)
  const [loadingClasses, setLoadingClasses] = useState(true)
  const [error, setError] = useState(null)

  useEffect(() => {
    let cancelled = false

    async function loadSessionSetup() {
      try {
        const [classData, sessionData] = await Promise.all([
          api.get('/api/sessions/classes'),
          api.get('/api/sessions'),
        ])

        if (cancelled) return

        if (classData?.error) {
          setError(classData.error)
          setClasses([])
        } else {
          setClasses(Array.isArray(classData) ? classData : [])
        }

        if (sessionData?.error) {
          setError((current) => current || sessionData.error)
          setActiveSessions([])
        } else {
          setActiveSessions(Array.isArray(sessionData) ? sessionData.filter((item) => !item.ended_at) : [])
        }
      } catch {
        if (cancelled) return
        setError('Could not load session data.')
        setClasses([])
        setActiveSessions([])
      } finally {
        if (!cancelled) setLoadingClasses(false)
      }
    }

    loadSessionSetup()

    return () => { cancelled = true }
  }, [])

  const selectedClassDetails = useMemo(
    () => classes.find((classItem) => classItem.id === selectedClass),
    [classes, selectedClass],
  )

  const startSession = async () => {
    if (!selectedClass) return setError('Select a class first.')

    setLoading(true)
    setError(null)

    try {
      const data = await api.post('/api/sessions/start', {
        class_id: selectedClass,
        notes: notes.trim() || undefined,
      })

      if (!data) {
        setError('Could not start the session.')
      } else if (data.error) {
        if (data.active_session) {
          setActiveSessions((prev) => (
            prev.some((sessionItem) => sessionItem.id === data.active_session.id)
              ? prev
              : [data.active_session, ...prev]
          ))
          setActiveSession?.(data.active_session)
          // Same class already has a live session - jump straight to it
          // rather than making the teacher click through again.
          navigate(`/teacher/session/${data.active_session.id}`)
        } else {
          setError(data.error)
        }
      } else {
        setActiveSession?.({
          ...data,
          classes: data.classes || selectedClassDetails,
        })
        setNotes('')
        navigate(`/teacher/session/${data.id}`)
      }
    } catch {
      setError('Could not start the session.')
    } finally {
      setLoading(false)
    }
  }

  const endSession = async () => {
    setLoading(true)
    setError(null)

    try {
      const data = await api.patch(`/api/sessions/${activeSession.id}/end`, {})

      if (!data) {
        setError('Could not end the session.')
      } else if (data.error) {
        setError(data.error)
      } else {
        setActiveSessions((prev) => prev.filter((sessionItem) => sessionItem.id !== activeSession.id))
        setActiveSession?.(null)
      }
    } catch {
      setError('Could not end the session.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <section className="portal-section">
      <div className="portal-section-header">
        <p>Session control</p>
      </div>
      {!activeSession ? (
        <div className="portal-form-grid">
          <div className="portal-session-grid">
            <select
              value={selectedClass}
              onChange={(event) => setSelectedClass(event.target.value)}
              disabled={loadingClasses}
              className="session-select"
            >
              <option value="">{loadingClasses ? 'Loading classes...' : 'Select a class...'}</option>
              {classes.map((classItem) => (
                <option key={classItem.id} value={classItem.id}>
                  {classItem.name} - {classItem.subject}{classItem.room ? ` (${classItem.room})` : ''}{classItem.profiles?.full_name ? ` - ${classItem.profiles.full_name}` : ''}
                </option>
              ))}
            </select>

            <input
              value={notes}
              onChange={(event) => setNotes(event.target.value)}
              placeholder="Session note (optional)"
            />

            <button
              onClick={startSession}
              disabled={loading || loadingClasses}
              className="session-start-button"
            >
              <Play size={15} strokeWidth={2.2} />
              {loading ? 'Starting...' : 'Start session'}
            </button>
          </div>

          {selectedClassDetails && (
            <p className="session-helper-text">
              Room: {selectedClassDetails.room || 'not set'} - Subject: {selectedClassDetails.subject}
            </p>
          )}

          {activeSessions.length > 0 && (
            <div className="teacher-active-sessions">
              <div className="portal-section-header">
                <p>Active sessions</p>
              </div>

              <div className="teacher-active-session-list">
                {activeSessions.map((sessionItem) => (
                  <button
                    key={sessionItem.id}
                    type="button"
                    onClick={() => navigate(`/teacher/session/${sessionItem.id}`)}
                    className="teacher-active-session-row"
                  >
                    <span>
                      <strong>{sessionItem.classes?.name || 'Class session'}</strong>
                      <small>
                        {sessionItem.classes?.subject || 'Subject not set'}
                        {sessionItem.classes?.room ? ` - ${sessionItem.classes.room}` : ''}
                        {sessionItem.profiles?.full_name ? ` - opened by ${sessionItem.profiles.full_name}` : ''}
                      </small>
                    </span>
                    <em>
                      <ExternalLink size={14} strokeWidth={2.2} />
                      Open
                    </em>
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      ) : (
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
            </p>
          </div>

          <button
            onClick={endSession}
            disabled={loading}
            className="session-end-button"
          >
            <Square size={14} strokeWidth={2.2} />
            {loading ? 'Ending...' : 'End session'}
          </button>
        </div>
      )}

      {error && (
        <p className="portal-error-message">
          {error}
        </p>
      )}
    </section>
  )
}