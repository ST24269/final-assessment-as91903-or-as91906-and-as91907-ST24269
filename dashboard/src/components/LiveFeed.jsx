import Card from './Card'

function formatTime(value) {
  return value ? new Date(value).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : 'No time'
}

export default function LiveFeed({ events = [] }) {
  return (
    <Card title="Recent scans">
      {events.length === 0 ? (
        <p className="live-feed-empty">
          <span />
          Waiting for RFID scans
        </p>
      ) : (
        <div className="live-feed-list">
          {events.map((event) => (
            <div
              key={event.id}
              className={`live-feed-row ${event.flagged ? 'is-flagged' : 'is-ok'}`}
            >
              <div>
                <p>
                  {event.students?.full_name || 'Unknown student'}
                </p>
                <small>
                  {event.flagged ? event.flag_reason || 'Flagged scan' : event.status || 'scanned'}
                </small>
              </div>
              <span>
                {formatTime(event.scanned_at)}
              </span>
            </div>
          ))}
        </div>
      )}
    </Card>
  )
}
