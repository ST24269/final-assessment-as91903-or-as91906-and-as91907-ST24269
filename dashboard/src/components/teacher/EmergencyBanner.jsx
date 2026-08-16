import { useEffect, useState } from 'react'
import { CheckCircle2, ShieldAlert } from 'lucide-react'
import { api, supabase } from '../../api/client'
import Card from '../Card'

export default function EmergencyBanner() {
  const [event, setEvent] = useState(null)
  const [checkins, setCheckins] = useState([])
  const [updatingId, setUpdatingId] = useState(null)

  const load = async () => {
    const data = await api.get('/api/emergency/active')
    if (data?.error) return
    setEvent(data.event)
    setCheckins(data.checkins || [])
  }

  useEffect(() => {
    let cancelled = false

    async function loadInitial() {
      const data = await api.get('/api/emergency/active')
      if (cancelled || data?.error) return
      setEvent(data.event)
      setCheckins(data.checkins || [])
    }

    loadInitial()

    const channel = supabase
      .channel('emergency-banner')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'emergency_checkins' }, load)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'emergency_events' }, load)
      .subscribe()

    return () => {
      cancelled = true
      supabase.removeChannel(channel)
    }
  }, [])

  const markAccounted = async (checkin) => {
    setUpdatingId(checkin.id)
    const data = await api.patch(`/api/emergency/checkins/${checkin.id}`, { status: 'accounted' })
    setUpdatingId(null)
    if (data?.error) return
    setCheckins((current) => current.map((item) => (item.id === checkin.id ? data.checkin : item)))
  }

  if (!event) return null

  const unaccounted = checkins.filter((item) => item.status === 'unaccounted')
  const accounted = checkins.filter((item) => item.status === 'accounted')

  return (
    <Card title="Emergency roll call">
      <div className="emergency-summary-row">
        <span className="appeals-summary-pill is-attention">{unaccounted.length} unaccounted</span>
        <span className="appeals-summary-pill">{accounted.length} accounted</span>
      </div>

      {unaccounted.length === 0 ? (
        <div className="portal-empty">
          <strong>All accounted for</strong>
        </div>
      ) : (
        <div className="appeals-list">
          {unaccounted.map((checkin) => (
            <article key={checkin.id} className="appeal-review-card">
              <header>
                <div>
                  <p className="card-title">{checkin.student?.full_name || 'Student'}</p>
                  <h3>{checkin.student?.student_number || 'No ID'}</h3>
                  <span>{checkin.last_known_class?.name || 'No last known class'}</span>
                </div>
                <span className="status-badge status-absent">
                  <ShieldAlert size={13} strokeWidth={2.4} />
                  unaccounted
                </span>
              </header>
              <div className="appeal-actions">
                <button type="button" onClick={() => markAccounted(checkin)} disabled={updatingId === checkin.id}>
                  <CheckCircle2 size={15} strokeWidth={2.2} />
                  Mark accounted
                </button>
              </div>
            </article>
          ))}
        </div>
      )}
    </Card>
  )
}
