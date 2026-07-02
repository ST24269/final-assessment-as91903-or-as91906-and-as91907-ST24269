import { useEffect, useMemo, useState } from 'react'
import { CheckCircle2, RefreshCw } from 'lucide-react'
import { api, supabase } from '../api/client'
import Card from './Card'

const STATUS_OPTIONS = ['pending', 'approved', 'rejected', 'resolved']
const ATTENDANCE_STATUS_OPTIONS = ['present', 'late', 'absent', 'excused']

function formatDate(value) {
  return value ? new Date(value).toLocaleDateString([], { month: 'short', day: 'numeric', year: 'numeric' }) : 'No date'
}

function statusTone(status) {
  if (status === 'approved') return 'status-present'
  if (status === 'rejected') return 'status-absent'
  if (status === 'resolved') return 'status-excused'
  return 'status-late'
}

export default function AppealsPanel({ mode = 'teacher', compact = false }) {
  const [appeals, setAppeals] = useState([])
  const [teachers, setTeachers] = useState([])
  const [classes, setClasses] = useState([])
  const [loading, setLoading] = useState(true)
  const [notice, setNotice] = useState(null)
  const [updatingId, setUpdatingId] = useState(null)
  const [filters, setFilters] = useState({
    student: '',
    status: 'all',
    kainga: 'all',
    teacher: 'all',
    class_id: 'all',
    date: '',
  })
  const [drafts, setDrafts] = useState({})

  const buildAppealPath = () => {
    const params = new URLSearchParams()
    if (mode === 'admin') {
      if (filters.student) params.set('student', filters.student)
      if (filters.status !== 'all') params.set('status', filters.status)
      if (filters.kainga !== 'all') params.set('kainga', filters.kainga)
      if (filters.teacher !== 'all') params.set('teacher', filters.teacher)
      if (filters.class_id !== 'all') params.set('class_id', filters.class_id)
      if (filters.date) params.set('date', filters.date)
    }

    return `/api/appeals${params.toString() ? `?${params.toString()}` : ''}`
  }

  const loadAppeals = async () => {
    setLoading(true)
    setNotice(null)
    const data = await api.get(buildAppealPath())
    setLoading(false)

    if (data?.error) {
      setNotice({ type: 'error', text: data.error })
      setAppeals([])
      return
    }

    setAppeals(Array.isArray(data) ? data : [])
  }

  useEffect(() => {
    let cancelled = false

    async function loadInitialAppeals() {
      const data = await api.get(buildAppealPath())
      if (cancelled) return

      if (data?.error) {
        setNotice({ type: 'error', text: data.error })
        setAppeals([])
      } else {
        setAppeals(Array.isArray(data) ? data : [])
      }
      setLoading(false)
    }

    loadInitialAppeals()

    if (mode === 'admin') {
      Promise.all([
        supabase.from('profiles').select('id, full_name').eq('role', 'teacher').order('full_name'),
        supabase.from('classes').select('id, name, subject').order('name'),
      ]).then(([teacherResult, classResult]) => {
        if (cancelled) return
        setTeachers(teacherResult.data || [])
        setClasses(classResult.data || [])
      })
    }

    return () => { cancelled = true }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode])

  const kaingaOptions = useMemo(() => (
    [...new Set(appeals.map((appeal) => appeal.student?.kainga).filter(Boolean))].sort()
  ), [appeals])

  const updateAppeal = async (appeal, status) => {
    const draft = drafts[appeal.id] || {}
    setUpdatingId(appeal.id)
    setNotice(null)

    const data = await api.patch(`/api/appeals/${appeal.id}`, {
      status,
      teacher_response: draft.teacher_response || '',
      corrected_status: draft.corrected_status || appeal.requested_status || appeal.current_status,
    })

    setUpdatingId(null)

    if (data?.error) {
      setNotice({ type: 'error', text: data.error })
      return
    }

    setAppeals((current) => current.map((item) => (item.id === appeal.id ? data.appeal : item)))
    setNotice({ type: 'success', text: `Appeal marked ${data.appeal.status}.` })
  }

  const content = (
    <div className="appeals-panel">
      {mode === 'admin' && (
        <div className="appeals-filter-row">
          <input
            value={filters.student}
            onChange={(event) => setFilters((current) => ({ ...current, student: event.target.value }))}
            placeholder="Filter by student"
          />
          <select
            className="session-select"
            value={filters.status}
            onChange={(event) => setFilters((current) => ({ ...current, status: event.target.value }))}
          >
            <option value="all">All statuses</option>
            {STATUS_OPTIONS.map((status) => <option key={status} value={status}>{status}</option>)}
          </select>
          <select
            className="session-select"
            value={filters.kainga}
            onChange={(event) => setFilters((current) => ({ ...current, kainga: event.target.value }))}
          >
            <option value="all">All kainga</option>
            {kaingaOptions.map((kainga) => <option key={kainga} value={kainga}>{kainga}</option>)}
          </select>
          <select
            className="session-select"
            value={filters.teacher}
            onChange={(event) => setFilters((current) => ({ ...current, teacher: event.target.value }))}
          >
            <option value="all">All teachers</option>
            {teachers.map((teacher) => <option key={teacher.id} value={teacher.id}>{teacher.full_name}</option>)}
          </select>
          <select
            className="session-select"
            value={filters.class_id}
            onChange={(event) => setFilters((current) => ({ ...current, class_id: event.target.value }))}
          >
            <option value="all">All classes</option>
            {classes.map((classItem) => <option key={classItem.id} value={classItem.id}>{classItem.name} - {classItem.subject}</option>)}
          </select>
          <input
            type="date"
            value={filters.date}
            onChange={(event) => setFilters((current) => ({ ...current, date: event.target.value }))}
          />
          <button type="button" className="btn-ghost" onClick={loadAppeals}>
            <RefreshCw size={15} strokeWidth={2.2} />
            Apply
          </button>
        </div>
      )}

      {notice && (
        <p className={`action-notice ${notice.type === 'error' ? 'is-error' : 'is-success'}`}>
          {notice.text}
        </p>
      )}

      {loading ? (
        <p className="empty-state">Loading appeals...</p>
      ) : appeals.length === 0 ? (
        <div className="portal-empty">
          <strong>No appeals to show</strong>
          <span>{mode === 'admin' ? 'No appeals match these filters.' : 'Appeals for your classes or LA group will appear here.'}</span>
        </div>
      ) : (
        <div className="appeals-list">
          {appeals.map((appeal) => {
            const draft = drafts[appeal.id] || {}
            return (
              <article key={appeal.id} className="appeal-review-card">
                <header>
                  <div>
                    <p className="card-title">{appeal.student?.full_name || 'Student'}</p>
                    <h3>{appeal.class?.name || 'Attendance record'} - {formatDate(appeal.appeal_date)}</h3>
                    <span>
                      {appeal.student?.student_number || 'No ID'}
                      {appeal.student?.kainga ? ` - ${appeal.student.kainga}` : ''}
                      {appeal.class?.subject ? ` - ${appeal.class.subject}` : ''}
                    </span>
                  </div>
                  <span className={`status-badge ${statusTone(appeal.status)}`}>{appeal.status}</span>
                </header>

                <p>{appeal.reason}</p>
                {appeal.comments && <p className="appeal-comment">{appeal.comments}</p>}
                <div className="appeal-meta-row">
                  <span>Current: {appeal.current_status || 'not recorded'}</span>
                  <span>Requested: {appeal.requested_status || 'not specified'}</span>
                  <span>Notification: {appeal.notification_sent ? 'sent' : 'not sent'}</span>
                </div>

                <div className="appeal-decision-grid">
                  <select
                    className="session-select"
                    value={draft.corrected_status || appeal.requested_status || appeal.current_status || ''}
                    onChange={(event) => setDrafts((current) => ({
                      ...current,
                      [appeal.id]: { ...draft, corrected_status: event.target.value },
                    }))}
                  >
                    <option value="">No correction</option>
                    {ATTENDANCE_STATUS_OPTIONS.map((status) => <option key={status} value={status}>{status}</option>)}
                  </select>
                  <textarea
                    value={draft.teacher_response || ''}
                    onChange={(event) => setDrafts((current) => ({
                      ...current,
                      [appeal.id]: { ...draft, teacher_response: event.target.value },
                    }))}
                    placeholder="Decision comment"
                  />
                </div>

                <div className="appeal-actions">
                  <button type="button" onClick={() => updateAppeal(appeal, 'approved')} disabled={updatingId === appeal.id}>
                    <CheckCircle2 size={15} strokeWidth={2.2} />
                    Approve
                  </button>
                  <button type="button" className="btn-ghost" onClick={() => updateAppeal(appeal, 'rejected')} disabled={updatingId === appeal.id}>
                    Reject
                  </button>
                  <button type="button" className="btn-ghost" onClick={() => updateAppeal(appeal, 'resolved')} disabled={updatingId === appeal.id}>
                    Resolve
                  </button>
                </div>
              </article>
            )
          })}
        </div>
      )}
    </div>
  )

  if (compact) return content

  return <Card title={mode === 'admin' ? 'Attendance appeals' : 'Appeals for your classes'}>{content}</Card>
}
