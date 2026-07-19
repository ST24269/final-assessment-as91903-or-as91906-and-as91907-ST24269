import { useState } from 'react'
import { TriangleAlert } from 'lucide-react'
import { STATUS_BADGE_CLASS } from './statusStyles'

export default function AttendanceHistoryTable({ attendance, classes }) {
  const [selectedClass, setSelectedClass] = useState('all')

  const filtered = selectedClass === 'all'
    ? attendance
    : attendance.filter((record) => record.sessions?.classes?.name === selectedClass)

  return (
    <div className="card">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.25rem' }}>
        <p className="card-title" style={{ margin: 0 }}>History</p>
        <select
          className="override-select"
          value={selectedClass}
          onChange={(event) => setSelectedClass(event.target.value)}
        >
          <option value="all">All classes</option>
          {classes.map((classItem) => (
            <option key={classItem.id} value={classItem.name}>{classItem.name}</option>
          ))}
        </select>
      </div>

      {filtered.length === 0 ? (
        <p className="empty-state">no records</p>
      ) : (
        <table className="attendance-table">
          <thead>
            <tr>
              <th>Class</th>
              <th>Date</th>
              <th>Time</th>
              <th>Status</th>
              <th>Note</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((record) => (
              <tr key={record.id} className={record.flagged ? 'flagged-row' : ''}>
                <td style={{ fontWeight: 500 }}>
                  {record.sessions?.classes?.name || '-'}
                </td>
                <td className="student-id">
                  {new Date(record.scanned_at).toLocaleDateString()}
                </td>
                <td className="student-id">
                  {new Date(record.scanned_at).toLocaleTimeString()}
                </td>
                <td>
                  <span className={`status-badge ${STATUS_BADGE_CLASS[record.status]}`}>
                    {record.status}
                  </span>
                </td>
                <td>
                  {record.flagged && (
                    <span className="flag-badge">
                      <TriangleAlert size={14} strokeWidth={2.2} />
                      {record.flag_reason || 'flagged'}
                    </span>
                  )}
                  {record.manual_override && !record.flagged && (
                    <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', fontFamily: 'var(--mono)' }}>
                      edited
                    </span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  )
}