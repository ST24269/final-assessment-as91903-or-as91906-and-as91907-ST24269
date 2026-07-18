import { useEffect, useMemo, useState } from 'react'
import { AlertCircle, RefreshCw } from 'lucide-react'
import { api, supabase } from '../api/client'
import Layout from '../components/Layout'
import AttendanceTable from '../components/AttendanceTable'
import AppealsPanel from '../components/AppealsPanel'
import SessionPanel from '../components/SessionPanel'
import LiveFeed from '../components/LiveFeed'
import TimetableView from '../components/TimetableView'

async function fetchSessionAttendance(sessionId) {
  const data = await api.get(`/api/attendance/session/${sessionId}`)
  if (data?.error) throw new Error(data.error)
  return Array.isArray(data) ? data : []
}

async function fetchAttendanceRecord(recordId) {
  const data = await api.get(`/api/attendance/${recordId}`)
  return data?.error ? null : data
}

function formatTime(value) {
  return value ? new Date(value).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : 'Not available'
}

export default function TeacherPage({ session, profile }) {
  const [activeSession, setActiveSession] = useState(null)
  const [attendance, setAttendance] = useState([])
  const [timetablePeriods, setTimetablePeriods] = useState([])
  const [timetableLoading, setTimetableLoading] = useState(true)
  const [timetableError, setTimetableError] = useState(null)
  const [loadingAttendance, setLoadingAttendance] = useState(false)
  const [attendanceError, setAttendanceError] = useState(null)
  const [lastUpdated, setLastUpdated] = useState(null)

  const handleActiveSessionChange = (nextSession) => {
    setActiveSession(nextSession)

    if (!nextSession) {
      setAttendance([])
      setAttendanceError(null)
      setLastUpdated(null)
    }
  }

  useEffect(() => {
    let cancelled = false

    async function loadTimetable() {
      setTimetableLoading(true)
      setTimetableError(null)

      try {
        const data = await api.get('/api/timetable/teacher')
        if (cancelled) return

        if (data?.error) {
          setTimetablePeriods([])
          setTimetableError(data.error)
        } else {
          setTimetablePeriods(Array.isArray(data) ? data : [])
        }
      } catch (err) {
        if (!cancelled) {
          setTimetablePeriods([])
          setTimetableError(err.message || 'Could not load timetable.')
        }
      } finally {
        if (!cancelled) setTimetableLoading(false)
      }
    }

    loadTimetable()

    return () => { cancelled = true }
  }, [])

  useEffect(() => {
    if (!activeSession) return

    let cancelled = false

    async function loadAttendance() {
      setLoadingAttendance(true)
      setAttendanceError(null)

      try {
        const records = await fetchSessionAttendance(activeSession.id)
        if (cancelled) return
        setAttendance(records)
        setLastUpdated(new Date())
      } catch (err) {
        if (!cancelled) setAttendanceError(err.message)
      } finally {
        if (!cancelled) setLoadingAttendance(false)
      }
    }

    loadAttendance()

    return () => { cancelled = true }
  }, [activeSession])

  useEffect(() => {
    if (!activeSession) return

    const mergeRecord = async (payload) => {
      if (payload.new.session_id !== activeSession.id) return

      const fullRecord = await fetchAttendanceRecord(payload.new.id)
      const nextRecord = fullRecord || payload.new

      setAttendance((prev) => {
        const exists = prev.some((record) => record.id === nextRecord.id)
        if (exists) {
          return prev.map((record) => (record.id === nextRecord.id ? { ...record, ...nextRecord } : record))
        }
        return [nextRecord, ...prev]
      })
      setLastUpdated(new Date())
    }

    const channel = supabase
      .channel(`attendance-session-${activeSession.id}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'attendance' }, mergeRecord)
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'attendance' }, mergeRecord)
      .subscribe()

    return () => supabase.removeChannel(channel)
  }, [activeSession])

  const refreshAttendance = async () => {
    if (!activeSession) return

    setLoadingAttendance(true)
    setAttendanceError(null)

    try {
      const records = await fetchSessionAttendance(activeSession.id)
      setAttendance(records)
      setLastUpdated(new Date())
    } catch (err) {
      setAttendanceError(err.message)
    } finally {
      setLoadingAttendance(false)
    }
  }

  const sortedAttendance = useMemo(() => (
    [...attendance].sort((a, b) => new Date(b.scanned_at || 0) - new Date(a.scanned_at || 0))
  ), [attendance])

  const summary = useMemo(() => ({
    scanned: attendance.length,
    present: attendance.filter((record) => record.status === 'present').length,
    late: attendance.filter((record) => record.status === 'late').length,
    flagged: attendance.filter((record) => record.flagged).length,
    manual: attendance.filter((record) => record.manual_override).length,
    lastScan: sortedAttendance[0]?.scanned_at || null,
  }), [attendance, sortedAttendance])

  const classLabel = activeSession?.classes?.name || 'Live class'
  const classDetail = [
    activeSession?.classes?.subject,
    activeSession?.classes?.room ? `Room ${activeSession.classes.room}` : null,
  ].filter(Boolean).join(' - ')

  return (
    <Layout email={session.user.email} name={profile?.full_name} role="teacher" profileId={profile?.id}>
      <TimetableView
        periods={timetablePeriods}
        title="Teacher timetable"
        subtitle={timetableLoading ? 'Loading your class schedule' : 'Classes assigned to you'}
        emptyMessage={timetableLoading ? 'Loading timetable...' : 'No timetable periods are assigned to you yet.'}
      />

      {timetableError && (
        <div className="portal-alert">
          <AlertCircle size={18} strokeWidth={2.2} />
          {timetableError}
        </div>
      )}

      <SessionPanel activeSession={activeSession} setActiveSession={handleActiveSessionChange} />
      <AppealsPanel mode="teacher" />

      {!activeSession ? (
        <section className="portal-section">
          <div className="portal-empty">
            <strong>Start a class session to begin scanning.</strong>
            <span>
              Once a session is live, RFID scans from the reader in that room will appear here with status, flags, and manual override controls.
            </span>
          </div>
        </section>
      ) : (
        <>
          <section className="portal-hero">
            <div>
              <p className="portal-eyebrow">Live session</p>
              <h1 className="portal-title">{classLabel}</h1>
              <p className="portal-subtitle">
                {classDetail || 'Class details not set'} - started {formatTime(activeSession.started_at)}
              </p>
            </div>

            <div className="portal-side-card">
              <span>Register</span>
              <strong>{summary.scanned} scanned</strong>
              <div className="portal-side-actions mt-3">
                <button
                  onClick={refreshAttendance}
                  disabled={loadingAttendance}
                  className="teacher-refresh-button"
                >
                  <RefreshCw size={15} strokeWidth={2.2} />
                  {loadingAttendance ? 'Refreshing...' : 'Refresh'}
                </button>
                <div className="teacher-refresh-time">
                  Updated {lastUpdated ? formatTime(lastUpdated) : 'not yet'}
                </div>
              </div>
            </div>
          </section>

          <section className="portal-stat-grid teacher-stat-grid">
            {[
              ['Scanned', summary.scanned],
              ['Present', summary.present],
              ['Late', summary.late],
              ['Flagged', summary.flagged],
              ['Edited', summary.manual],
            ].map(([label, value]) => (
              <div key={label} className="portal-stat">
                <p>{label}</p>
                <strong>{value}</strong>
              </div>
            ))}
          </section>

          <div className="teacher-content-grid">
            <LiveFeed events={sortedAttendance.slice(0, 6)} />

            <section className="portal-section">
              <div className="portal-section-header">
                <p>Scan status</p>
              </div>
              <div className="teacher-status-grid">
                <div className="teacher-status-box">
                  <p>Last scan</p>
                  <strong>{summary.lastScan ? formatTime(summary.lastScan) : 'None yet'}</strong>
                </div>
                <div className="teacher-status-box">
                  <p>Review queue</p>
                  <strong>{summary.flagged} flagged</strong>
                </div>
              </div>
            </section>
          </div>

          <AttendanceTable
            attendance={attendance}
            setAttendance={setAttendance}
            loading={loadingAttendance}
            error={attendanceError}
          />
        </>
      )}
    </Layout>
  )
}
