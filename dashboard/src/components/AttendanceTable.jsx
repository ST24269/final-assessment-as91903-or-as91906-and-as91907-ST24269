import { useMemo, useState } from 'react'
import { api } from '../api/client'
import Card from './Card'

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
        <p className="text-[0.78rem] font-mono text-[#8B9BB0]">Loading attendance...</p>
      )}

      {(error || updateError) && (
        <p className="mb-3 rounded-lg border border-red-500/20 bg-red-500/10 px-3 py-2 text-[0.78rem] font-mono text-red-400">
          {error || updateError}
        </p>
      )}

      {!loading && sortedAttendance.length === 0 ? (
        <p className="text-[0.78rem] font-mono text-[#4A5568]">No RFID scans have arrived for this session yet.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full border-collapse">
            <thead>
              <tr className="border-b border-white/[0.06]">
                {['Student', 'ID', 'Scanned', 'Status', 'Action', 'Note'].map((heading) => (
                  <th key={heading} className="px-2 pb-3 text-left text-[0.65rem] font-mono uppercase tracking-[0.12em] text-[#4A5568]">
                    {heading}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {sortedAttendance.map((record) => (
                <tr key={record.id} className={`border-b border-white/[0.03] transition-colors hover:bg-white/[0.015] ${record.flagged ? 'bg-red-500/[0.03]' : ''}`}>
                  <td className="px-2 py-3">
                    <span className="text-sm font-medium text-white">{record.students?.full_name || 'Unknown student'}</span>
                  </td>
                  <td className="px-2 py-3 text-[0.78rem] font-mono text-[#8B9BB0]">
                    {record.students?.student_number || 'Not set'}
                  </td>
                  <td className="px-2 py-3 text-[0.78rem] font-mono text-[#8B9BB0]">
                    {formatTime(record.scanned_at)}
                  </td>
                  <td className="px-2 py-3">
                    <StatusBadge status={record.status} />
                  </td>
                  <td className="px-2 py-3">
                    <select
                      value={record.status}
                      disabled={updating === record.id}
                      onChange={(event) => changeStatus(record.id, event.target.value)}
                      className="rounded-md border border-white/[0.06] bg-[#1c2330] px-2 py-1 text-[0.75rem] font-mono text-white outline-none disabled:opacity-50"
                    >
                      {STATUS_OPTIONS.map((status) => (
                        <option key={status} value={status}>{status}</option>
                      ))}
                    </select>
                  </td>
                  <td className="px-2 py-3 text-[0.72rem] font-mono text-[#8B9BB0]">
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
