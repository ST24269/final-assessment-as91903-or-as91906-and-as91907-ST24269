import { useMemo, useState } from 'react'
import { api } from '../../api/client'
import Card from '../Card'

const STATUS_OPTIONS = ['present', 'late', 'absent', 'excused']

function formatTime(value) {
  return value ? new Date(value).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : 'No time'
}

function StatusBadge({ status }) {
  return (
    <span className={`status-badge status-${status || 'absent'}`}>
      {status || 'unknown'}
    </span>
  )
}

export default function AttendanceTable({ attendance, setAttendance, loading = false, error = null }) {
  const [updating, setUpdating] = useState(null)
  const [updateError, setUpdateError] = useState(null)

  const sortedAttendance = useMemo(() => (
    [...attendance].sort((a, b) => new Date(b.scanned_at || 0) - new Date(a.scanned_at || 0))
  ), [attendance])

  const changeStatus = async (id, status) => {
    setUpdating(id)
    setUpdateError(null)

    const data = await api.patch(`/api/attendance/${id}`, { status })

    if (data?.error) {
      setUpdateError(data.error)
    } else {
      setAttendance((prev) => prev.map((record) => (
        record.id === id
          ? { ...record, status, manual_override: true }
          : record
      )))
    }

    setUpdating(null)
  }

  const title = `Class register${attendance.length > 0 ? ` - ${attendance.length} scanned` : ''}`

  return (
    <Card title={title}>
      {loading && (
        <p className="table-helper-text">Loading attendance...</p>
      )}

      {(error || updateError) && (
        <p className="portal-error-message">
          {error || updateError}
        </p>
      )}

      {!loading && sortedAttendance.length === 0 ? (
        <p className="table-helper-text">No RFID scans have arrived for this session yet.</p>
      ) : (
        <div className="student-table-wrap">
          <table className="attendance-table teacher-register-table">
            <thead>
              <tr>
                {['Student', 'ID', 'Scanned', 'Status', 'Action', 'Note'].map((heading) => (
                  <th key={heading}>{heading}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {sortedAttendance.map((record) => (
                <tr key={record.id} className={record.flagged ? 'flagged-row' : ''}>
                  <td>
                    <strong>{record.students?.full_name || 'Unknown student'}</strong>
                  </td>
                  <td className="student-id">
                    {record.students?.student_number || 'Not set'}
                  </td>
                  <td className="student-id">
                    {formatTime(record.scanned_at)}
                  </td>
                  <td>
                    <StatusBadge status={record.status} />
                  </td>
                  <td>
                    <select
                      value={record.status}
                      disabled={updating === record.id}
                      onChange={(event) => changeStatus(record.id, event.target.value)}
                      className="override-select"
                    >
                      {STATUS_OPTIONS.map((status) => (
                        <option key={status} value={status}>{status}</option>
                      ))}
                    </select>
                  </td>
                  <td className="student-id">
                    {record.flagged ? `Flagged: ${record.flag_reason || 'review needed'}` : record.manual_override ? 'Manual override' : 'RFID scan'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Card>
  )
}
