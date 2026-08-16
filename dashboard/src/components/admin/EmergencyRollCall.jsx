import { useEffect, useMemo, useState } from 'react'
import { CheckCircle2, ClipboardCheck, Download, Search, ShieldAlert } from 'lucide-react'
import { api, supabase } from '../../api/client'
import Card from '../Card'
import ConfirmDialog from '../ConfirmDialog'

function formatTime(value) {
  return value ? new Date(value).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : ''
}

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
  const [classes, setClasses] = useState([])
  const [classFilter, setClassFilter] = useState('')
  const [loading, setLoading] = useState(true)
  const [starting, setStarting] = useState(false)
  const [ending, setEnding] = useState(false)
  const [updatingId, setUpdatingId] = useState(null)
  const [notice, setNotice] = useState(null)
  const [confirmStart, setConfirmStart] = useState(false)

  const loadClasses = async () => {
    const data = await api.get('/api/emergency/classes')
    setClasses(data?.error ? [] : data.classes || [])
  }

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
    if (data.event) loadClasses()
    else setClasses([])
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
      if (data.event) loadClasses()
    }

    loadInitial()

    const channel = supabase
      .channel('emergency-checkins')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'emergency_checkins' }, load)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'emergency_class_submissions' }, loadClasses)
      .subscribe()

    return () => {
      cancelled = true
      supabase.removeChannel(channel)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const filteredCheckins = useMemo(() => {
    const term = classFilter.trim().toLowerCase()
    if (!term) return checkins
    return checkins.filter((item) => (item.last_known_class?.name || '').toLowerCase().includes(term))
  }, [checkins, classFilter])

  const filteredClasses = useMemo(() => {
    const term = classFilter.trim().toLowerCase()
    if (!term) return classes
    return classes.filter((item) => [item.name, item.teacher?.full_name].filter(Boolean).join(' ').toLowerCase().includes(term))
  }, [classes, classFilter])

  const start = async () => {
    setStarting(true)
    setNotice(null)
    const data = await api.post('/api/emergency/start', {})
    setStarting(false)
    setConfirmStart(false)

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
    setClasses([])
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

  const accounted = filteredCheckins.filter((item) => item.status === 'accounted')
  const unaccounted = filteredCheckins.filter((item) => item.status === 'unaccounted')

  if (loading) return <p className="empty-state">Loading</p>

  if (!event) {
    return (
      <>
        <Card title="Emergency roll call">
          <div className="emergency-idle">
            <ShieldAlert size={28} strokeWidth={1.8} />
            <p>No active emergency</p>
            {notice && <p className={`action-notice ${notice.type === 'error' ? 'is-error' : 'is-success'}`}>{notice.text}</p>}
            <button type="button" className="account-danger-button" onClick={() => setConfirmStart(true)} disabled={starting}>
              {starting ? 'Starting...' : 'Start roll call'}
            </button>
          </div>
        </Card>

        {confirmStart && (
          <ConfirmDialog
            eyebrow="Start emergency roll call"
            title="This alerts the whole school"
            description="Every teacher's dashboard turns into emergency mode with a siren, and every teacher, admin, and student with a linked email gets notified immediately. Only start this for a real emergency or drill."
            tone="danger"
            confirmLabel={starting ? 'Starting...' : 'Start roll call'}
            onClose={() => setConfirmStart(false)}
            onConfirm={start}
            busy={starting}
          />
        )}
      </>
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

      <label className="appeals-search-field">
        <Search size={15} strokeWidth={2.2} />
        <input
          value={classFilter}
          onChange={(inputEvent) => setClassFilter(inputEvent.target.value)}
          placeholder="Search by class or teacher"
        />
      </label>

      {classes.length > 0 && (
        <section className="emergency-class-submissions">
          <p className="card-title">Class roll submissions</p>
          <div className="emergency-class-summary-list">
            {filteredClasses.map((item) => (
              <div key={item.id} className={`emergency-class-summary-row${item.submitted ? ' is-submitted' : ''}`}>
                <span>
                  <strong>{item.name}</strong>
                  <small>{item.teacher?.full_name || 'No teacher assigned'} - {item.unaccounted} unaccounted of {item.total}</small>
                </span>
                <em>
                  {item.submitted ? (
                    <>
                      <ClipboardCheck size={14} strokeWidth={2.4} />
                      Submitted {formatTime(item.submitted_at)}{item.submitted_by ? ` by ${item.submitted_by}` : ''}
                    </>
                  ) : (
                    'Not submitted'
                  )}
                </em>
              </div>
            ))}
            {filteredClasses.length === 0 && <p className="empty-state">No classes match.</p>}
          </div>
        </section>
      )}

      <div className="emergency-summary-row">
        <span className="appeals-summary-pill is-attention">{unaccounted.length} unaccounted</span>
        <span className="appeals-summary-pill">{accounted.length} accounted</span>
        <span className="appeals-summary-pill">{filteredCheckins.length} total</span>
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
