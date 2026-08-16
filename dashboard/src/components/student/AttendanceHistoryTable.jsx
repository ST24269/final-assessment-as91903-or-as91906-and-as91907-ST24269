import { useState } from 'react'
import { TriangleAlert } from 'lucide-react'
import { STATUS_BADGE_CLASS } from './statusStyles'

export default function AttendanceHistoryTable({ attendance, classes }) {
  const [selectedClass, setSelectedClass] = useState('all')
  const [selectedStatus, setSelectedStatus] = useState('all')

  const filtered = attendance.filter((record) => {
    const classMatches = selectedClass === 'all' || record.sessions?.classes?.name === selectedClass
    const statusMatches = selectedStatus === 'all' || record.status === selectedStatus
    return classMatches && statusMatches
  })

  return (
    <div className="card">
      <div className="attendance-history-header">
        <p className="card-title">History</p>
        <div className="attendance-history-filters">
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
          <select
            className="override-select"
            value={selectedStatus}
            onChange={(event) => setSelectedStatus(event.target.value)}
          >
            <option value="all">All statuses</option>
            <option value="present">Present</option>
            <option value="late">Late</option>
            <option value="absent">Absent</option>
            <option value="excused">Excused</option>
          </select>
        </div>
      </div>

      {filtered.length === 0 ? (
        <p className="empty-state">No records match this filter.</p>
      ) : (
        <div className="table-scroll">
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
                  <td className="attendance-class-cell">
                    {record.sessions?.classes?.name || '-'}
                  </td>
                  <td className="student-id">
                    {new Date(record.scanned_at).toLocaleDateString([], { month: 'short', day: 'numeric', year: 'numeric' })}
                  </td>
                  <td className="student-id">
                    {new Date(record.scanned_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
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
                      <span className="attendance-edited-tag">edited</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}