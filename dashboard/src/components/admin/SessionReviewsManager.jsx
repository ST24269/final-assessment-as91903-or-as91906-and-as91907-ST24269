import { useEffect, useState } from 'react'
import { ChevronDown, ChevronRight } from 'lucide-react'
import { api } from '../../api/client'
import StudentDetailModal from '../teacher/StudentDetailModal'

function formatDateTime(value) {
  return value ? new Date(value).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' }) : '—'
}

const STATUS_LABEL = {
  present: 'Present',
  late: 'Late',
  absent: 'Absent',
  excused: 'Excused',
}

function SessionAttendanceDetail({ sessionId }) {
  const [rows, setRows] = useState(null)
  const [error, setError] = useState(null)
  const [detailStudentId, setDetailStudentId] = useState(null)

  useEffect(() => {
    let cancelled = false

    api.get(`/api/attendance/session/${sessionId}`).then((data) => {
      if (cancelled) return
      if (data?.error) {
        setError(data.error)
        return
      }
      setRows(Array.isArray(data) ? data : [])
    })

    return () => { cancelled = true }
  }, [sessionId])

  if (error) return <p className="table-helper-text">{error}</p>
  if (!rows) return <p className="table-helper-text">Loading attendance...</p>
  if (rows.length === 0) return <p className="table-helper-text">No scans recorded for this session.</p>

  return (
    <>
      <table className="admin-subtable">
        <thead>
          <tr>
            <th>Student</th>
            <th>Status</th>
            <th>Scanned at</th>
            <th>Photo check</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.id}>
              <td>
                <button
                  type="button"
                  className="session-review-student-link"
                  onClick={() => setDetailStudentId(row.student_id)}
                >
                  {row.students?.full_name || 'Unknown student'}
                </button>
              </td>
              <td>
                <span className={`status-pill status-pill-${row.status}`}>
                  {STATUS_LABEL[row.status] || row.status}
                </span>
              </td>
              <td>{formatDateTime(row.scanned_at)}</td>
              <td>
                {row.photo_verified === 'match' && 'Match'}
                {row.photo_verified === 'no_match' && 'No match'}
                {!row.photo_verified && '—'}
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      {detailStudentId && (
        <StudentDetailModal
          studentId={detailStudentId}
          onClose={() => setDetailStudentId(null)}
        />
      )}
    </>
  )
}

export default function SessionReviewsManager() {
  const [sessions, setSessions] = useState(null)
  const [error, setError] = useState(null)
  const [expandedId, setExpandedId] = useState(null)

  const load = async () => {
    const data = await api.get('/api/sessions/submitted')

    if (data?.error) {
      setError(data.error)
      return
    }

    setError(null)
    setSessions(Array.isArray(data) ? data : [])
  }

  useEffect(() => {
    load()
  }, [])

  if (error) return <p className="table-helper-text">{error}</p>
  if (!sessions) return <p className="table-helper-text">Loading submitted attendance...</p>

  if (sessions.length === 0) {
    return <p className="table-helper-text">No classes have submitted attendance yet.</p>
  }

  return (
    <div className="session-reviews">
      {sessions.map((item) => {
        const isExpanded = expandedId === item.id

        return (
          <div key={item.id} className="session-review-row">
            <button
              type="button"
              className="session-review-summary"
              onClick={() => setExpandedId(isExpanded ? null : item.id)}
            >
              {isExpanded ? <ChevronDown size={16} strokeWidth={2.2} /> : <ChevronRight size={16} strokeWidth={2.2} />}
              <div>
                <strong>{item.classes?.name || 'Class'}</strong>
                <span>
                  {item.classes?.room ? `${item.classes.room} · ` : ''}
                  {item.profiles?.full_name || 'Unknown teacher'}
                </span>
              </div>
              {!item.attendance_count && (
                <span className="session-review-empty-badge">No attendance taken</span>
              )}
              <span className="session-review-time">Submitted {formatDateTime(item.submitted_at)}</span>
            </button>

            {isExpanded && (
              <div className="session-review-detail">
                <SessionAttendanceDetail sessionId={item.id} />
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
} 