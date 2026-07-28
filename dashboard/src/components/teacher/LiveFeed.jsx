import { useState } from 'react'
import { Check, X, ChevronRight } from 'lucide-react'
import Card from '../Card'
import { api } from '../../api/client'
import StudentDetailModal from './StudentDetailModal'

function formatTime(value) {
  return value ? new Date(value).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : 'No time'
}

export default function LiveFeed({ events = [], onEventUpdate }) {
  const [verifying, setVerifying] = useState(null)
  const [detailStudentId, setDetailStudentId] = useState(null)

  const setVerification = async (event, decision) => {
    setVerifying(event.id)
    const data = await api.patch(`/api/attendance/${event.id}/verify`, { decision })
    setVerifying(null)

    if (!data?.error && onEventUpdate) {
      onEventUpdate(event.id, data)
    }
  }

  return (
    <Card title="Recent scans">
      {events.length === 0 ? (
        <p className="live-feed-empty">
          <span />
          Waiting for RFID scans
        </p>
      ) : (
        <div className="live-feed-list">
          {events.map((event) => {
            const student = event.students || {}
            const decision = event.photo_verified // 'match' | 'no_match' | null
            const isBusy = verifying === event.id

            return (
              <div
                key={event.id}
                className={`live-feed-row ${decision === 'no_match' ? 'is-flagged' : decision === 'match' ? 'is-confirmed' : 'is-ok'}`}
              >
                <button
                  type="button"
                  className="live-feed-clickable"
                  onClick={() => setDetailStudentId(event.student_id)}
                >
                  <img
                    src={student.photo_url || '/default-avatar.png'}
                    alt=""
                    className="live-feed-avatar-sm"
                  />
                  <div className="live-feed-details">
                    <p className="live-feed-name">
                      {student.full_name || 'Unknown student'}
                      <ChevronRight size={14} strokeWidth={2.2} className="live-feed-chevron" />
                    </p>
                    <div className="live-feed-meta">
                      {student.student_number && <span>{student.student_number}</span>}
                      {student.kainga && <span className="live-feed-pill">{student.kainga}</span>}
                      {student.la_teacher?.full_name && <span>LA: {student.la_teacher.full_name}</span>}
                    </div>
                    <small>
                      {event.flagged ? event.flag_reason || 'Flagged scan' : event.status || 'scanned'}
                    </small>
                  </div>
                </button>

                <span className="live-feed-time">{formatTime(event.scanned_at)}</span>

<div className="live-feed-verify-actions">
  <button
    type="button"
    className={`live-feed-verify-btn is-match ${decision === 'match' ? 'is-selected' : ''}`}
    onClick={() => setVerification(event, decision === 'match' ? null : 'match')}
    disabled={isBusy}
  >
    <Check size={14} strokeWidth={2.6} />
    Match
  </button>
  <button
    type="button"
    className={`live-feed-verify-btn is-no-match ${decision === 'no_match' ? 'is-selected' : ''}`}
    onClick={() => setVerification(event, decision === 'no_match' ? null : 'no_match')}
    disabled={isBusy}
  >
    <X size={14} strokeWidth={2.6} />
    No Match
  </button>
</div>
              </div>
            )
          })}
        </div>
      )}

      {detailStudentId && (
        <StudentDetailModal
          studentId={detailStudentId}
          onClose={() => setDetailStudentId(null)}
        />
      )}
    </Card>
  )
}