import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { ArrowLeft, CalendarDays, Clock3, Send } from 'lucide-react'
import { api, supabase } from '../api/client'
import Layout from '../components/Layout'
import Card from '../components/Card'
import Loader from '../components/Loader'

const REQUESTED_STATUS_OPTIONS = [
  { value: 'present', label: 'Present - I was there' },
  { value: 'late', label: 'Late - I arrived after class started' },
  { value: 'excused', label: 'Excused - I had an approved reason' },
]
const APPEAL_REASONS = [
  'I was present but marked absent',
  'I was on time but marked late',
  'I had an approved reason',
  'RFID card or scanner issue',
  'Other',
]

function defaultAppealForm() {
  return {
    appeal_date: new Date().toISOString().slice(0, 10),
    class_id: '',
    attendance_id: '',
    requested_status: '',
    reason: '',
    comments: '',
  }
}

function readAppealDraft(userId) {
  const fallback = defaultAppealForm()
  if (!userId) return fallback

  try {
    const stored = window.localStorage.getItem(`tago-appeal-draft-${userId}`)
    return stored ? { ...fallback, ...JSON.parse(stored) } : fallback
  } catch {
    return fallback
  }
}

function writeAppealDraft(userId, draft) {
  if (!userId) return

  try {
    window.localStorage.setItem(`tago-appeal-draft-${userId}`, JSON.stringify(draft))
  } catch {
    // Draft saving is a convenience only.
  }
}

function clearAppealDraft(userId) {
  if (!userId) return

  try {
    window.localStorage.removeItem(`tago-appeal-draft-${userId}`)
  } catch {
    // Draft saving is a convenience only.
  }
}

function formatDate(value) {
  return value ? new Date(value).toLocaleDateString([], { month: 'short', day: 'numeric', year: 'numeric' }) : 'No date'
}

function formatTime(value) {
  return value ? new Date(value).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : 'No time'
}

function formatStatus(status) {
  return status ? status.replace(/_/g, ' ') : 'Not recorded'
}

function statusTone(status) {
  if (status === 'approved') return 'status-present'
  if (status === 'rejected') return 'status-absent'
  if (status === 'resolved') return 'status-excused'
  return 'status-late'
}

export default function StudentAppealsPage({ session, profile }) {
  const [studentRecord, setStudentRecord] = useState(null)
  const [attendance, setAttendance] = useState([])
  const [classes, setClasses] = useState([])
  const [appeals, setAppeals] = useState([])
  const [appealForm, setAppealForm] = useState(() => readAppealDraft(session.user.id))
  const [notice, setNotice] = useState(null)
  const [submitting, setSubmitting] = useState(false)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  useEffect(() => {
    let cancelled = false

    async function loadData() {
      setLoading(true)
      setError(null)

      const { data: linkedStudent, error: linkError } = await supabase
        .from('student_profiles')
        .select('student_id, students(id, full_name, student_number, year_level, kainga, form_group)')
        .eq('profile_id', session.user.id)
        .maybeSingle()

      if (cancelled) return

      if (linkError) {
        setError(linkError.message)
        setLoading(false)
        return
      }

      if (!linkedStudent?.student_id) {
        setError('This account is not linked to a student record yet.')
        setLoading(false)
        return
      }

      setStudentRecord(linkedStudent.students || null)

      const [
        { data: enrolments, error: enrolmentError },
        { data: records, error: attendanceError },
        appealData,
      ] = await Promise.all([
        supabase
          .from('enrolments')
          .select('classes(id, name, subject, room, teacher_id, profiles(full_name, email))')
          .eq('student_id', linkedStudent.student_id),
        supabase
          .from('attendance')
          .select('*, sessions(id, started_at, classes(id, name, subject, room))')
          .eq('student_id', linkedStudent.student_id)
          .order('scanned_at', { ascending: false }),
        api.get('/api/appeals'),
      ])

      if (cancelled) return

      if (enrolmentError || attendanceError) {
        setError(enrolmentError?.message || attendanceError?.message)
        setLoading(false)
        return
      }

      setClasses(enrolments?.map((row) => row.classes).filter(Boolean) || [])
      setAttendance(records || [])
      setAppeals(Array.isArray(appealData) ? appealData : [])
      setLoading(false)
    }

    loadData()

    return () => { cancelled = true }
  }, [session.user.id])

  useEffect(() => {
    writeAppealDraft(session.user.id, appealForm)
  }, [appealForm, session.user.id])

  const attendanceOptions = useMemo(() => attendance.map((record) => {
    const dateSource = record.scanned_at || record.sessions?.started_at
    const classRecord = record.sessions?.classes || null

    return {
      id: record.id,
      label: `${formatDate(dateSource)} - ${classRecord?.name || 'Unknown class'} - ${formatStatus(record.status)}`,
      classId: classRecord?.id || '',
      className: classRecord?.name || 'Unknown class',
      subject: classRecord?.subject || '',
      room: classRecord?.room || '',
      date: dateSource ? new Date(dateSource).toISOString().slice(0, 10) : '',
      time: dateSource || '',
      status: record.status,
    }
  }), [attendance])
  const selectedAttendance = useMemo(
    () => attendanceOptions.find((record) => record.id === appealForm.attendance_id) || null,
    [appealForm.attendance_id, attendanceOptions],
  )

  const submitAppeal = async (event) => {
    event.preventDefault()
    setSubmitting(true)
    setNotice(null)

    const selectedRecord = attendanceOptions.find((record) => record.id === appealForm.attendance_id)
    const payload = {
      ...appealForm,
      class_id: selectedRecord?.classId || appealForm.class_id,
      appeal_date: selectedRecord?.date || appealForm.appeal_date,
      current_status: selectedRecord?.status || null,
      attendance_id: appealForm.attendance_id || null,
      requested_status: appealForm.requested_status || null,
    }

    const data = await api.post('/api/appeals', payload)
    setSubmitting(false)

    if (data?.error) {
      setNotice({ type: 'error', text: data.error })
      return
    }

    setAppeals((current) => [data.appeal, ...current])
    clearAppealDraft(session.user.id)
    setAppealForm(defaultAppealForm())
    setNotice({
      type: data.emailSent ? 'success' : 'error',
      text: data.emailSent
        ? 'Appeal submitted and teachers notified.'
        : `Appeal submitted. Email notification may not have sent: ${data.emailError || 'email not configured'}`,
    })
  }

  if (loading) {
    return <Loader title="Loading appeals" subtitle="Preparing your attendance records" />
  }

  return (
    <Layout
      email={session.user.email}
      name={studentRecord?.full_name || profile?.full_name}
      role="student"
      profileId={profile?.id}
    >
      <section className="portal-hero">
        <div>
          <p className="portal-eyebrow">Attendance appeals</p>
          <h1 className="portal-title">Submit attendance appeal</h1>
          <p className="portal-subtitle">
            {studentRecord?.full_name || profile?.full_name || 'Student'} - {session.user.email}
          </p>
        </div>
        <div className="portal-side-card">
          <span>Status</span>
          <strong>{appeals.filter((appeal) => appeal.status === 'pending').length} pending</strong>
        </div>
      </section>

      <Link className="student-action-link is-secondary" to="/student">
        <ArrowLeft size={16} strokeWidth={2.2} />
        Back to dashboard
      </Link>

      {error && <div className="portal-alert">{error}</div>}

      {!error && (
        <>
          <Card title="Appeal details">
            <form className="appeal-form" onSubmit={submitAppeal}>
              <div className="portal-form-grid">
                <div className="login-field">
                  <label htmlFor="appeal-record">Attendance record</label>
                  <select
                    id="appeal-record"
                    className="session-select"
                    value={appealForm.attendance_id}
                    onChange={(event) => setAppealForm((current) => {
                      const selected = attendanceOptions.find((record) => record.id === event.target.value)
                      return {
                        ...current,
                        attendance_id: event.target.value,
                        class_id: selected?.classId || current.class_id,
                        appeal_date: selected?.date || current.appeal_date,
                      }
                    })}
                  >
                    <option value="">Select manually</option>
                    {attendanceOptions.map((record) => (
                      <option key={record.id} value={record.id}>{record.label}</option>
                    ))}
                  </select>
                  {attendanceOptions.length === 0 && (
                    <span className="field-help">No attendance records are available yet. Use the date and class fields below.</span>
                  )}
                </div>

                {selectedAttendance && (
                  <div className="appeal-record-preview">
                    <div>
                      <span>Selected record</span>
                      <strong>{selectedAttendance.className}</strong>
                      <p>{selectedAttendance.subject || 'Subject not recorded'}{selectedAttendance.room ? ` - ${selectedAttendance.room}` : ''}</p>
                    </div>
                    <div>
                      <span>
                        <CalendarDays size={14} strokeWidth={2.2} />
                        {formatDate(selectedAttendance.time)}
                      </span>
                      <span>
                        <Clock3 size={14} strokeWidth={2.2} />
                        {formatTime(selectedAttendance.time)}
                      </span>
                      <span className={`status-badge status-${selectedAttendance.status || 'excused'}`}>
                        Current: {formatStatus(selectedAttendance.status)}
                      </span>
                    </div>
                  </div>
                )}

                <div className="login-field">
                  <label htmlFor="appeal-date">Date</label>
                  <input
                    id="appeal-date"
                    type="date"
                    value={appealForm.appeal_date}
                    onChange={(event) => setAppealForm((current) => ({ ...current, appeal_date: event.target.value }))}
                  />
                </div>

                <div className="login-field">
                  <label htmlFor="appeal-class">Class / subject</label>
                  <select
                    id="appeal-class"
                    className="session-select"
                    value={appealForm.class_id}
                    onChange={(event) => setAppealForm((current) => ({ ...current, class_id: event.target.value }))}
                  >
                    <option value="">Select class</option>
                    {classes.map((classItem) => (
                      <option key={classItem.id} value={classItem.id}>
                        {classItem.name} - {classItem.subject}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="login-field">
                  <label htmlFor="appeal-status">Suggested correction (optional)</label>
                  <select
                    id="appeal-status"
                    className="session-select"
                    value={appealForm.requested_status}
                    onChange={(event) => setAppealForm((current) => ({ ...current, requested_status: event.target.value }))}
                  >
                    <option value="">Let the teacher decide</option>
                    {REQUESTED_STATUS_OPTIONS.map((status) => (
                      <option key={status.value} value={status.value}>{status.label}</option>
                    ))}
                  </select>
                </div>

                <div className="login-field">
                  <label htmlFor="appeal-reason">Reason</label>
                  <select
                    id="appeal-reason"
                    className="session-select"
                    value={appealForm.reason}
                    onChange={(event) => setAppealForm((current) => ({ ...current, reason: event.target.value }))}
                  >
                    <option value="">Select reason</option>
                    {APPEAL_REASONS.map((reason) => <option key={reason} value={reason}>{reason}</option>)}
                  </select>
                </div>

                <div className="login-field">
                  <label htmlFor="appeal-comments">Message</label>
                  <textarea
                    id="appeal-comments"
                    value={appealForm.comments}
                    onChange={(event) => setAppealForm((current) => ({ ...current, comments: event.target.value }))}
                    placeholder="Add any details that will help your teacher review this."
                  />
                </div>
              </div>

              {notice && (
                <p className={`action-notice ${notice.type === 'error' ? 'is-error' : 'is-success'}`}>
                  {notice.text}
                </p>
              )}

              <button type="submit" disabled={submitting}>
                <Send size={16} strokeWidth={2.2} />
                {submitting ? 'Submitting...' : 'Submit appeal'}
              </button>
            </form>
          </Card>

          <Card title={`Previous appeals (${appeals.length})`}>
            {appeals.length === 0 ? (
              <div className="portal-empty">
                <strong>No appeals submitted yet.</strong>
                <span>Your submitted appeals and decisions will appear here.</span>
              </div>
            ) : (
              <div className="student-appeal-list">
                {appeals.map((appeal) => (
                  <div key={appeal.id} className="student-appeal-row">
                    <div>
                      <strong>{appeal.class?.name || 'Attendance appeal'} - {formatDate(appeal.appeal_date)}</strong>
                      <span>
                        {appeal.reason}
                        {appeal.session?.started_at ? ` - ${formatTime(appeal.session.started_at)}` : ''}
                      </span>
                      {appeal.teacher_response && <em>{appeal.teacher_response}</em>}
                    </div>
                    <span className={`status-badge ${statusTone(appeal.status)}`}>
                      {appeal.status}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </Card>
        </>
      )}
    </Layout>
  )
}
