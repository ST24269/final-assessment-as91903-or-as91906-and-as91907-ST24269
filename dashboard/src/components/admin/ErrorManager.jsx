import { useCallback, useEffect, useState } from 'react'
import { AlertTriangle, CheckCircle2, RefreshCw, RotateCcw } from 'lucide-react'
import { api } from '../../api/client'

const RESULT_LABELS = {
  invalid_card: 'Unrecognised card',
  not_enrolled: 'Wrong class',
  no_session: 'No active session',
  reader_inactive: 'Inactive reader',
  duplicate: 'Duplicate scan',
  error: 'Server error',
}

const RESULT_TONE = {
  invalid_card: 'status-absent',
  not_enrolled: 'status-late',
  no_session: 'status-late',
  reader_inactive: 'status-absent',
  duplicate: 'status-excused',
  error: 'status-absent',
}

function formatDateTime(value) {
  return value ? new Date(value).toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : '-'
}

export default function ErrorsManager() {
  const [errors, setErrors] = useState([])
  const [summary, setSummary] = useState(null)
  const [loading, setLoading] = useState(true)
  const [notice, setNotice] = useState(null)
  const [updatingId, setUpdatingId] = useState(null)
  const [filters, setFilters] = useState({ result: 'all', resolved: 'false' })

  const load = useCallback(async () => {
    setLoading(true)
    setNotice(null)

    const params = new URLSearchParams()
    if (filters.result !== 'all') params.set('result', filters.result)
    if (filters.resolved !== 'all') params.set('resolved', filters.resolved)

    const [errorsResult, summaryResult] = await Promise.all([
      api.get(`/api/errors${params.toString() ? `?${params.toString()}` : ''}`),
      api.get('/api/errors/summary'),
    ])

    setLoading(false)

    if (errorsResult?.error) {
      setNotice({ type: 'error', text: errorsResult.error })
      setErrors([])
    } else {
      setErrors(Array.isArray(errorsResult) ? errorsResult : [])
    }

    if (!summaryResult?.error) setSummary(summaryResult)
  }, [filters])

  useEffect(() => {
    load()
  }, [load])

  const setResolved = async (errorRow, resolved) => {
    setUpdatingId(errorRow.id)
    setNotice(null)

    const data = await api.patch(`/api/errors/${errorRow.id}`, { resolved })
    setUpdatingId(null)

    if (data?.error) {
      setNotice({ type: 'error', text: data.error })
      return
    }

    setErrors((current) => {
      // If we're filtering to a specific resolved state, a status flip means
      // the row no longer belongs in the current list.
      if (filters.resolved !== 'all') return current.filter((row) => row.id !== errorRow.id)
      return current.map((row) => (row.id === errorRow.id ? data : row))
    })
    setSummary((current) => (current ? {
      ...current,
      unresolved: Math.max(0, current.unresolved + (resolved ? -1 : 1)),
    } : current))
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
      {summary && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: '1rem' }}>
          <div className="card" style={{ padding: '1rem', textAlign: 'center' }}>
            <AlertTriangle size={24} color={summary.unresolved > 0 ? 'var(--red)' : 'var(--text-muted)'} style={{ marginBottom: '0.5rem' }} />
            <p style={{ fontSize: '1.75rem', fontWeight: 600, margin: 0, color: summary.unresolved > 0 ? 'var(--red)' : 'inherit' }}>{summary.unresolved}</p>
            <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)', margin: 0 }}>Unresolved</p>
          </div>
          <div className="card" style={{ padding: '1rem', textAlign: 'center' }}>
            <p style={{ fontSize: '1.75rem', fontWeight: 600, margin: 0 }}>{summary.wrong_class_unresolved}</p>
            <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)', margin: 0 }}>Wrong class (open)</p>
          </div>
          <div className="card" style={{ padding: '1rem', textAlign: 'center' }}>
            <p style={{ fontSize: '1.75rem', fontWeight: 600, margin: 0 }}>{summary.unrecognised_card_unresolved}</p>
            <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)', margin: 0 }}>Unrecognised cards (open)</p>
          </div>
          <div className="card" style={{ padding: '1rem', textAlign: 'center' }}>
            <p style={{ fontSize: '1.75rem', fontWeight: 600, margin: 0 }}>{summary.today}</p>
            <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)', margin: 0 }}>Today</p>
          </div>
        </div>
      )}

      <div className="card">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem', flexWrap: 'wrap', gap: '0.75rem' }}>
          <p className="card-title" style={{ margin: 0 }}>Scan errors</p>
          <div style={{ display: 'flex', gap: '0.6rem', alignItems: 'center' }}>
            <select
              className="session-select"
              value={filters.result}
              onChange={(event) => setFilters((current) => ({ ...current, result: event.target.value }))}
            >
              <option value="all">All error types</option>
              {Object.entries(RESULT_LABELS).map(([value, label]) => (
                <option key={value} value={value}>{label}</option>
              ))}
            </select>
            <select
              className="session-select"
              value={filters.resolved}
              onChange={(event) => setFilters((current) => ({ ...current, resolved: event.target.value }))}
            >
              <option value="false">Unresolved</option>
              <option value="true">Resolved</option>
              <option value="all">All</option>
            </select>
            <button type="button" className="btn-ghost" onClick={load}>
              <RefreshCw size={15} strokeWidth={2.2} />
              Refresh
            </button>
          </div>
        </div>

        {notice && (
          <p className={`action-notice ${notice.type === 'error' ? 'is-error' : 'is-success'}`}>
            {notice.text}
          </p>
        )}

        {loading ? (
          <p className="empty-state">Loading errors...</p>
        ) : errors.length === 0 ? (
          <p className="empty-state">No scan errors match these filters.</p>
        ) : (
          <table className="attendance-table">
            <thead>
              <tr>
                <th>Type</th>
                <th>Detail</th>
                <th>Reader / Room</th>
                <th>Class</th>
                <th>Time</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {errors.map((row) => (
                <tr key={row.id}>
                  <td>
                    <span className={`status-badge ${RESULT_TONE[row.result] || 'status-late'}`}>
                      {RESULT_LABELS[row.result] || row.result}
                    </span>
                  </td>
                  <td>
                    <div>{row.student?.full_name || row.error_message || row.rfid_card_uid}</div>
                    {row.error_message && row.student?.full_name && (
                      <small style={{ color: 'var(--text-muted)' }}>{row.error_message}</small>
                    )}
                  </td>
                  <td className="student-id">{row.reader?.label || '-'}{row.reader?.room ? ` (${row.reader.room})` : ''}</td>
                  <td className="student-id">{row.class?.name || '-'}</td>
                  <td className="student-id">{formatDateTime(row.created_at || row.scanned_at)}</td>
                  <td>
                    {row.resolved ? (
                      <button
                        type="button"
                        className="btn-ghost"
                        disabled={updatingId === row.id}
                        onClick={() => setResolved(row, false)}
                      >
                        <RotateCcw size={14} strokeWidth={2.2} />
                        Reopen
                      </button>
                    ) : (
                      <button
                        type="button"
                        disabled={updatingId === row.id}
                        onClick={() => setResolved(row, true)}
                      >
                        <CheckCircle2 size={14} strokeWidth={2.2} />
                        Resolve
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}