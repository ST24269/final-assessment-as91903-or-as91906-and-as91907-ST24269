import { useEffect, useState } from 'react'
import { CheckCircle2, Download, ShieldAlert } from 'lucide-react'
import { api, supabase } from '../../api/client'
import Card from '../Card'

function toCsv(checkins) {
  const header = ['Student', 'Number', 'Status', 'Last known class', 'Method', 'Checked at']
  const rows = checkins.map((item) => [
    item.student?.full_name || '',
    item.student?.student_number || '',
    item.status,
    item.last_known_class?.name || '',
    item.method || '',
    item.checked_at || '',
  ])
  return [header, ...rows].map((row) => row.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(',')).join('\n')
}

function downloadCsv(csv, filename) {
  const blob = new Blob([csv], { type: 'text/csv' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  link.click()
  URL.revokeObjectURL(url)
}

export default function EmergencyRollCall() {
  const [event, setEvent] = useState(null)
  const [checkins, setCheckins] = useState([])
  const [loading, setLoading] = useState(true)
  const [starting, setStarting] = useState(false)
  const [ending, setEnding] = useState(false)
  const [updatingId, setUpdatingId] = useState(null)
  const [notice, setNotice] = useState(null)

  const load = async () => {
    const data = await api.get('/api/emergency/active')
    if (data?.error) {
      setNotice({ type: 'error', text: data.error })
      setLoading(false)
      return
    }
    setEvent(data.event)
    setCheckins(data.checkins || [])
    setLoading(false)
  }

  useEffect(() => {
    let cancelled = false

    async function loadInitial() {
      const data = await api.get('/api/emergency/active')
      if (cancelled) return
      if (data?.error) {
        setNotice({ type: 'error', text: data.error })
        setLoading(false)
        return
      }
      setEvent(data.event)
      setCheckins(data.checkins || [])
      setLoading(false)
    }

    loadInitial()

    const channel = supabase
      .channel('emergency-checkins')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'emergency_checkins' }, load)
      .subscribe()

    return () => {
      cancelled = true
      supabase.removeChannel(channel)
    }
  }, [])

  const start = async () => {
    setStarting(true)
    setNotice(null)
    const data = await api.post('/api/emergency/start', {})
    setStarting(false)

    if (data?.error) {
      setNotice({ type: 'error', text: data.error })
      return
    }

    await load()
  }

  const end = async () => {
    if (!event) return
    setEnding(true)
    setNotice(null)
    const data = await api.post(`/api/emergency/${event.id}/end`, {})
    setEnding(false)

    if (data?.error) {
      setNotice({ type: 'error', text: data.error })
      return
    }

    setEvent(null)
    setCheckins([])
  }

  const markAccounted = async (checkin) => {
    setUpdatingId(checkin.id)
    const data = await api.patch(`/api/emergency/checkins/${checkin.id}`, { status: 'accounted' })
    setUpdatingId(null)

    if (data?.error) {
      setNotice({ type: 'error', text: data.error })
      return
    }

    setCheckins((current) => current.map((item) => (item.id === checkin.id ? data.checkin : item)))
  }

  const exportRoll = () => {
    downloadCsv(toCsv(checkins), `emergency-roll-${new Date().toISOString().slice(0, 19)}.csv`)
  }

  const accounted = checkins.filter((item) => item.status === 'accounted')
  const unaccounted = checkins.filter((item) => item.status === 'unaccounted')

  if (loading) return <p className="empty-state">Loading</p>

  if (!event) {
    return (
      <Card title="Emergency roll call">
        <div className="emergency-idle">
          <ShieldAlert size={28} strokeWidth={1.8} />
          <p>No active emergency</p>
          {notice && <p className={`action-notice ${notice.type === 'error' ? 'is-error' : 'is-success'}`}>{notice.text}</p>}
          <button type="button" className="account-danger-button" onClick={start} disabled={starting}>
            {starting ? 'Starting...' : 'Start roll call'}
          </button>
        </div>
      </Card>
    )
  }

  return (
    <Card
      title="Emergency roll call"
      action={(
        <div className="emergency-header-actions">
          <button type="button" className="btn-ghost" onClick={exportRoll}>
            <Download size={15} strokeWidth={2.2} />
            Export
          </button>
          <button type="button" className="account-danger-button" onClick={end} disabled={ending}>
            {ending ? 'Ending...' : 'End roll call'}
          </button>
        </div>
      )}
    >
      {notice && <p className={`action-notice ${notice.type === 'error' ? 'is-error' : 'is-success'}`}>{notice.text}</p>}

      <div className="emergency-summary-row">
        <span className="appeals-summary-pill is-attention">{unaccounted.length} unaccounted</span>
        <span className="appeals-summary-pill">{accounted.length} accounted</span>
        <span className="appeals-summary-pill">{checkins.length} total</span>
      </div>

      <div className="appeals-list">
        {unaccounted.map((checkin) => (
          <article key={checkin.id} className="appeal-review-card">
            <header>
              <div>
                <p className="card-title">{checkin.student?.full_name || 'Student'}</p>
                <h3>{checkin.student?.student_number || 'No ID'}</h3>
                <span>{checkin.last_known_class?.name || 'No last known class'}</span>
              </div>
              <span className="status-badge status-absent">unaccounted</span>
            </header>
            <div className="appeal-actions">
              <button type="button" onClick={() => markAccounted(checkin)} disabled={updatingId === checkin.id}>
                <CheckCircle2 size={15} strokeWidth={2.2} />
                Mark accounted
              </button>
            </div>
          </article>
        ))}
        {unaccounted.length === 0 && (
          <div className="portal-empty">
            <strong>All accounted for</strong>
          </div>
        )}
      </div>
    </Card>
  )
}
