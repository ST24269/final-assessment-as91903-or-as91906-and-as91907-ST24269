import { STATUS_BADGE_CLASS, TODAY_STATUS_COLOUR } from './statusStyles'

export default function TodayStatusCard({ todayStatus }) {
  return (
    <div className="card" style={{
      borderLeft: `3px solid ${todayStatus ? TODAY_STATUS_COLOUR[todayStatus] : 'var(--border)'}`,
    }}>
      <p className="card-title">Today</p>
      {todayStatus ? (
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
          <span
            className={`status-badge ${STATUS_BADGE_CLASS[todayStatus]}`}
            style={{ fontSize: '0.9rem', padding: '0.3rem 0.8rem' }}
          >
            {todayStatus}
          </span>
          <span style={{ color: 'var(--text-muted)', fontSize: '0.9rem' }}>
            You've been marked for today
          </span>
        </div>
      ) : (
        <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem', fontFamily: 'var(--mono)' }}>
          not yet scanned today
        </p>
      )}
    </div>
  )
}