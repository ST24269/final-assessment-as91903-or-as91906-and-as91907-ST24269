import { useEffect, useRef, useState } from 'react'
import { CheckCircle2, ClipboardCheck, RotateCcw, Send, ShieldAlert } from 'lucide-react'
import { api, supabase } from '../../api/client'
import Card from '../Card'
import ConfirmDialog from '../ConfirmDialog'
import { playEmergencySiren } from '../../utils/siren'

function formatTime(value) {
  return value ? new Date(value).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : ''
}

export default function EmergencyBanner({ onStatusChange }) {
  const [event, setEvent] = useState(null)
  const [classes, setClasses] = useState([])
  const [selectedClassId, setSelectedClassId] = useState(null)
  const [checkins, setCheckins] = useState([])
  const [loadingStatus, setLoadingStatus] = useState(true)
  const [loadingRoster, setLoadingRoster] = useState(false)
  const [updatingId, setUpdatingId] = useState(null)
  const [submitting, setSubmitting] = useState(false)
  const [confirmSubmit, setConfirmSubmit] = useState(false)
  const [notice, setNotice] = useState(null)
  const sirenedEventIdRef = useRef(null)

  const applyStatus = (data) => {
    if (data?.error) {
      setEvent(null)
      setClasses([])
      onStatusChange?.(false)
      return
    }

    // Sound the siren once per emergency event, the moment this component
    // first sees it - not on every subsequent checkin/submission update.
    if (data.event && sirenedEventIdRef.current !== data.event.id) {
      sirenedEventIdRef.current = data.event.id
      playEmergencySiren(10000)
    }

    setEvent(data.event)
    setClasses(data.classes || [])
    onStatusChange?.(true)
    setSelectedClassId((current) => current || (data.classes || []).find((item) => item.is_current)?.id || null)
  }

  const load = async () => {
    const data = await api.get('/api/emergency/classes')
    applyStatus(data)
  }

  useEffect(() => {
    let cancelled = false

    async function loadInitial() {
      const data = await api.get('/api/emergency/classes')
      if (cancelled) return
      applyStatus(data)
      setLoadingStatus(false)
    }

    loadInitial()

    const channel = supabase
      .channel('emergency-banner')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'emergency_checkins' }, load)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'emergency_events' }, load)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'emergency_class_submissions' }, load)
      .subscribe()

    return () => {
      cancelled = true
      supabase.removeChannel(channel)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    if (!event || !selectedClassId) return undefined

    let cancelled = false

    async function loadRoster() {
      setLoadingRoster(true)
      const data = await api.get(`/api/emergency/active?class_id=${selectedClassId}`)
      if (cancelled) return
      setCheckins(data?.error ? [] : data.checkins || [])
      setLoadingRoster(false)
    }

    loadRoster()

    return () => { cancelled = true }
  }, [event, selectedClassId])

  const selectedClass = classes.find((item) => item.id === selectedClassId) || null

  const toggleStatus = async (checkin) => {
    const nextStatus = checkin.status === 'accounted' ? 'unaccounted' : 'accounted'
    setUpdatingId(checkin.id)
    const data = await api.patch(`/api/emergency/checkins/${checkin.id}`, { status: nextStatus })
    setUpdatingId(null)

    if (data?.error) {
      setNotice({ type: 'error', text: data.error })
      return
    }

    setCheckins((current) => current.map((item) => (item.id === checkin.id ? data.checkin : item)))
  }

  const submitRoll = async () => {
    if (!selectedClassId) return
    setSubmitting(true)
    setNotice(null)
    const data = await api.post(`/api/emergency/classes/${selectedClassId}/submit`, {})
    setSubmitting(false)
    setConfirmSubmit(false)

    if (data?.error) {
      setNotice({ type: 'error', text: data.error })
      return
    }

    setNotice({ type: 'success', text: 'Roll call submitted.' })
    load()
  }

  const handleSubmitClick = () => {
    const unaccountedCount = checkins.filter((item) => item.status === 'unaccounted').length
    if (unaccountedCount > 0) {
      setConfirmSubmit(true)
      return
    }
    submitRoll()
  }

  if (loadingStatus || !event) return null

  const roster = [...checkins].sort((a, b) => (a.status === b.status ? 0 : a.status === 'unaccounted' ? -1 : 1))
  const unaccounted = checkins.filter((item) => item.status === 'unaccounted')
  const accounted = checkins.filter((item) => item.status === 'accounted')

  return (
    <div className="emergency-active-panel">
      <div className="emergency-active-header">
        <ShieldAlert size={22} strokeWidth={2.2} />
        <div>
          <strong>Emergency - roll call in progress</strong>
          <span>Started {formatTime(event.started_at)}{event.notes ? ` - ${event.notes}` : ''}</span>
        </div>
      </div>

      <Card title="Manual roll call">
        <div className="portal-session-grid" style={{ marginBottom: '0.85rem' }}>
          <select
            value={selectedClassId || ''}
            onChange={(inputEvent) => setSelectedClassId(inputEvent.target.value || null)}
            className="session-select"
          >
            <option value="">Select a class...</option>
            {classes.map((item) => (
              <option key={item.id} value={item.id}>
                {item.name} - {item.subject}
                {item.is_current ? ' (your current class)' : ''}
                {item.submitted ? ' - submitted' : ''}
              </option>
            ))}
          </select>
        </div>

        {notice && <p className={`action-notice ${notice.type === 'error' ? 'is-error' : 'is-success'}`}>{notice.text}</p>}

        {!selectedClass && (
          <div className="portal-empty">
            <strong>Select a class above to run your roll call.</strong>
          </div>
        )}

        {selectedClass && (
          <>
            <div className="emergency-summary-row">
              <span className="appeals-summary-pill is-attention">{unaccounted.length} unaccounted</span>
              <span className="appeals-summary-pill">{accounted.length} accounted</span>
              {selectedClass.submitted && (
                <span className="appeals-summary-pill is-success">
                  <ClipboardCheck size={13} strokeWidth={2.4} />
                  Submitted {formatTime(selectedClass.submitted_at)}
                </span>
              )}
            </div>

            {loadingRoster ? (
              <p className="empty-state">Loading roll...</p>
            ) : roster.length === 0 ? (
              <div className="portal-empty">
                <strong>No students are enrolled in this class yet.</strong>
              </div>
            ) : (
              <div className="appeals-list">
                {roster.map((checkin) => (
                  <article key={checkin.id} className="appeal-review-card">
                    <header>
                      <div>
                        <p className="card-title">{checkin.student?.full_name || 'Student'}</p>
                        <h3>{checkin.student?.student_number || 'No ID'}</h3>
                      </div>
                      <span className={`status-badge ${checkin.status === 'accounted' ? 'status-present' : 'status-absent'}`}>
                        {checkin.status}
                      </span>
                    </header>
                    <div className="appeal-actions">
                      <button type="button" onClick={() => toggleStatus(checkin)} disabled={updatingId === checkin.id}>
                        {checkin.status === 'accounted' ? (
                          <>
                            <RotateCcw size={15} strokeWidth={2.2} />
                            Mark unaccounted
                          </>
                        ) : (
                          <>
                            <CheckCircle2 size={15} strokeWidth={2.2} />
                            Mark accounted
                          </>
                        )}
                      </button>
                    </div>
                  </article>
                ))}
              </div>
            )}

            <div className="emergency-submit-row">
              <button type="button" className="account-danger-button" onClick={handleSubmitClick} disabled={submitting || roster.length === 0}>
                <Send size={15} strokeWidth={2.2} />
                {submitting ? 'Submitting...' : selectedClass.submitted ? 'Re-submit roll call' : 'Submit roll call'}
              </button>
            </div>
          </>
        )}
      </Card>

      {confirmSubmit && (
        <ConfirmDialog
          eyebrow="Submit roll call"
          title={selectedClass?.name || 'This class'}
          description={`${unaccounted.length} student(s) are still unaccounted for. Submit anyway?`}
          tone="danger"
          confirmLabel="Submit anyway"
          onClose={() => setConfirmSubmit(false)}
          onConfirm={submitRoll}
          busy={submitting}
        />
      )}
    </div>
  )
}
