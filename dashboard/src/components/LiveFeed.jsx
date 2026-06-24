import Card from './Card'

function formatTime(value) {
  return value ? new Date(value).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : 'No time'
}

export default function LiveFeed({ events = [] }) {
  return (
    <Card title="Recent scans">
      {events.length === 0 ? (
        <p className="flex items-center gap-2 text-[0.78rem] font-mono text-[#4A5568]">
          <span className="h-1.5 w-1.5 rounded-full bg-[#4A5568]" />
          Waiting for RFID scans
        </p>
      ) : (
        <div className="flex flex-col gap-2">
          {events.map((event) => (
            <div
              key={event.id}
              className={`flex items-center justify-between rounded-lg border border-l-2 px-4 py-2.5 text-sm font-mono ${
                event.flagged
                  ? 'border-red-500/[0.12] border-l-red-400 bg-red-500/[0.05]'
                  : 'border-emerald-500/[0.12] border-l-emerald-400 bg-emerald-500/[0.05]'
              }`}
            >
              <div className="min-w-0">
                <p className={event.flagged ? 'text-red-400' : 'text-emerald-400'}>
                  {event.students?.full_name || 'Unknown student'}
                </p>
                <p className="mt-0.5 truncate text-[0.7rem] text-[#8B9BB0]">
                  {event.flagged ? event.flag_reason || 'Flagged scan' : event.status || 'scanned'}
                </p>
              </div>
              <span className="shrink-0 text-[0.75rem] text-[#8B9BB0]">
                {formatTime(event.scanned_at)}
              </span>
            </div>
          ))}
        </div>
      )}
    </Card>
  )
}
