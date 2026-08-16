import { useEffect, useMemo, useState } from 'react'
import { CheckCircle2, Pencil, RefreshCw, Search } from 'lucide-react'
import { api } from '../api/client'
import { reasonCodeLabel } from '../config/reasonCodes'
import Card from './Card'
import ConfirmDialog from './ConfirmDialog'

const DECISION_COPY = {
  approved: { eyebrow: 'Approve appeal', confirmLabel: 'Approve' },
  rejected: { eyebrow: 'Reject appeal', confirmLabel: 'Reject' },
  resolved: { eyebrow: 'Resolve appeal', confirmLabel: 'Resolve' },
}

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

function todayDateString() {
  const now = new Date()
  const year = now.getFullYear()
  const month = String(now.getMonth() + 1).padStart(2, '0')
  const day = String(now.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

export default function AppealsPanel({ mode = 'teacher', compact = false, hideResolved = false, historyOnly = false }) {
  const [appeals, setAppeals] = useState([])
  const [loading, setLoading] = useState(true)
  const [notice, setNotice] = useState(null)
  const [updatingId, setUpdatingId] = useState(null)
  const [unlockedIds, setUnlockedIds] = useState(() => new Set())
  const [filters, setFilters] = useState({
    student: '',
    status: 'all',
    class_id: 'all',
  })
  const [drafts, setDrafts] = useState({})
  const [confirmAction, setConfirmAction] = useState(null)

  const loadAppeals = async () => {
    setLoading(true)
    setNotice(null)
    const data = await api.get('/api/appeals')
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
      const data = await api.get('/api/appeals')
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

    return () => { cancelled = true }
  }, [mode])

  // Resolved appeals are done and dusted - they stay hidden from the active
  // list once resolved, and only reappear under "Appeal history" until a
  // teacher clicks Edit to reopen one.
  const scopedAppeals = useMemo(() => {
    if (historyOnly) return appeals.filter((appeal) => appeal.status === 'resolved')
    if (hideResolved && filters.status !== 'resolved') return appeals.filter((appeal) => appeal.status !== 'resolved')
    return appeals
  }, [appeals, hideResolved, historyOnly, filters.status])

  // Teacher mode has no server-side filters, so class options and matching
  // are derived from the teacher's own appeals instead of a school-wide list.
  const teacherClassOptions = useMemo(() => {
    const seen = new Map()
    scopedAppeals.forEach((appeal) => {
      if (appeal.class?.id && !seen.has(appeal.class.id)) {
        seen.set(appeal.class.id, appeal.class)
      }
    })
    return [...seen.values()].sort((a, b) => (a.name || '').localeCompare(b.name || ''))
  }, [scopedAppeals])

  const visibleAppeals = useMemo(() => {
    const search = filters.student.trim().toLowerCase()
    const studentMatches = (appeal) => !search
      || (appeal.student?.full_name || '').toLowerCase().includes(search)
      || (appeal.student?.student_number || '').toLowerCase().includes(search)

    if (mode === 'teacher') {
      return scopedAppeals.filter((appeal) => {
        const statusMatches = filters.status === 'all' || appeal.status === filters.status
        const classMatches = filters.class_id === 'all' || appeal.class?.id === filters.class_id
        return statusMatches && classMatches && studentMatches(appeal)
      })
    }

    if (mode === 'admin') {
      const today = todayDateString()
      return scopedAppeals.filter((appeal) => {
        if (!studentMatches(appeal)) return false
        // With no search, the open-appeals view defaults to today only. A
        // search looks across every date, and the history view always shows
        // every resolved appeal, so neither misses a match.
        return historyOnly || search ? true : appeal.appeal_date === today
      })
    }

    return scopedAppeals
  }, [scopedAppeals, filters, mode, historyOnly])

  // Admin's summary badges track what's on screen (today's appeals, or the
  // active search), while teacher's badges stay pinned to the unfiltered
  // workload so filtering the list doesn't hide how much is outstanding.
  const summaryAppeals = mode === 'admin' ? visibleAppeals : scopedAppeals

  const pendingCount = useMemo(
    () => summaryAppeals.filter((appeal) => appeal.status === 'pending').length,
    [summaryAppeals],
  )

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
    setUnlockedIds((current) => {
      if (!current.has(appeal.id)) return current
      const next = new Set(current)
      next.delete(appeal.id)
      return next
    })

    const emailNote = status === 'resolved'
      ? (data.resolutionEmailSent ? ' Student and teacher notified by email.' : ' Resolution email may not have sent.')
      : ''
    setNotice({ type: 'success', text: `Appeal marked ${data.appeal.status}.${emailNote}` })
  }

  const unlockAppeal = (appealId) => {
    setUnlockedIds((current) => new Set(current).add(appealId))
  }

  const content = (
    <div className="appeals-panel">
      {!loading && summaryAppeals.length > 0 && (
        <div className="appeals-summary-row">
          <span className={`appeals-summary-pill ${pendingCount > 0 ? 'is-attention' : ''}`}>
            {pendingCount} pending
          </span>
          <span className="appeals-summary-pill">{summaryAppeals.length} total</span>
        </div>
      )}

      {mode === 'teacher' && scopedAppeals.length > 0 && (
        <div className="appeals-filter-row">
          <div className="appeals-search-field">
            <Search size={14} strokeWidth={2.2} />
            <input
              value={filters.student}
              onChange={(event) => setFilters((current) => ({ ...current, student: event.target.value }))}
              placeholder="Search by student name or ID"
            />
          </div>
          <select
            className="session-select"
            value={filters.status}
            onChange={(event) => setFilters((current) => ({ ...current, status: event.target.value }))}
          >
            <option value="all">All statuses</option>
            {STATUS_OPTIONS.map((status) => <option key={status} value={status}>{status}</option>)}
          </select>
          {teacherClassOptions.length > 1 && (
            <select
              className="session-select"
              value={filters.class_id}
              onChange={(event) => setFilters((current) => ({ ...current, class_id: event.target.value }))}
            >
              <option value="all">All classes</option>
              {teacherClassOptions.map((classItem) => (
                <option key={classItem.id} value={classItem.id}>{classItem.name} - {classItem.subject}</option>
              ))}
            </select>
          )}
        </div>
      )}

      {mode === 'admin' && (
        <div className="appeals-filter-row">
          <div className="appeals-search-field">
            <Search size={14} strokeWidth={2.2} />
            <input
              value={filters.student}
              onChange={(event) => setFilters((current) => ({ ...current, student: event.target.value }))}
              placeholder="Search any appeal by student name or ID"
            />
          </div>
          <button type="button" className="btn-ghost" onClick={loadAppeals}>
            <RefreshCw size={15} strokeWidth={2.2} />
            Refresh
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
      ) : visibleAppeals.length === 0 ? (
        <div className="portal-empty">
          <strong>No appeals to show</strong>
          <span>
            {mode === 'admin'
              ? (filters.student.trim()
                ? 'No appeals match that search.'
                : (historyOnly ? 'No resolved appeals yet.' : 'No appeals came in today.'))
              : (scopedAppeals.length > 0
                ? 'No appeals match your search or filters.'
                : (hideResolved ? 'No open appeals right now.' : 'Appeals for your classes or LA group will appear here.'))}
          </span>
        </div>
      ) : (
        <div className="appeals-list">
          {visibleAppeals.map((appeal) => {
            const draft = drafts[appeal.id] || {}
            const isLocked = appeal.status === 'resolved' && !unlockedIds.has(appeal.id)
            return (
              <article key={appeal.id} className={`appeal-review-card ${isLocked ? 'is-locked' : ''}`}>
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
                  {reasonCodeLabel(appeal.reason_code) && <span>{reasonCodeLabel(appeal.reason_code)}</span>}
                  <span>Notification: {appeal.notification_sent ? 'sent' : 'not sent'}</span>
                </div>

                {isLocked ? (
                  <div className="appeal-actions">
                    <button type="button" className="btn-ghost" onClick={() => unlockAppeal(appeal.id)}>
                      <Pencil size={15} strokeWidth={2.2} />
                      Edit
                    </button>
                  </div>
                ) : (
                  <>
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
                      <button type="button" onClick={() => setConfirmAction({ appeal, status: 'approved' })} disabled={updatingId === appeal.id}>
                        <CheckCircle2 size={15} strokeWidth={2.2} />
                        Approve
                      </button>
                      <button type="button" className="btn-ghost" onClick={() => setConfirmAction({ appeal, status: 'rejected' })} disabled={updatingId === appeal.id}>
                        Reject
                      </button>
                      <button type="button" className="btn-ghost" onClick={() => setConfirmAction({ appeal, status: 'resolved' })} disabled={updatingId === appeal.id}>
                        Resolve
                      </button>
                    </div>
                  </>
                )}
              </article>
            )
          })}
        </div>
      )}

      {confirmAction && (
        <ConfirmDialog
          eyebrow={DECISION_COPY[confirmAction.status].eyebrow}
          title={confirmAction.appeal.student?.full_name || 'Student'}
          description={`This marks the appeal as ${confirmAction.status} and notifies the student by email.`}
          confirmLabel={DECISION_COPY[confirmAction.status].confirmLabel}
          onClose={() => setConfirmAction(null)}
          onConfirm={async () => {
            await updateAppeal(confirmAction.appeal, confirmAction.status)
            setConfirmAction(null)
          }}
          busy={updatingId === confirmAction.appeal.id}
        />
      )}
    </div>
  )

  if (compact) return content

  return <Card title={mode === 'admin' ? 'Attendance appeals' : 'Appeals for your classes'}>{content}</Card>
}