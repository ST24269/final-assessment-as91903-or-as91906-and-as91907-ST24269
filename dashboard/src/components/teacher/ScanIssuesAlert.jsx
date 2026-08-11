import { AlertTriangle, UserX, WifiOff, X } from 'lucide-react'

function formatTime(value) {
  return value ? new Date(value).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : ''
}

function issueCopy(issue) {
  if (issue.result === 'not_enrolled') {
    return {
      Icon: UserX,
      title: issue.student?.full_name ? `${issue.student.full_name} tapped in from the wrong class` : 'Student tapped in from the wrong class',
      detail: issue.error_message || 'This student is not enrolled in the class running here.',
    }
  }

  if (issue.result === 'reader_inactive') {
    return {
      Icon: WifiOff,
      title: 'Reader is disabled',
      detail: issue.error_message || 'A card was tapped at a reader that is currently marked inactive.',
    }
  }

  return {
    Icon: AlertTriangle,
    title: 'Unrecognised card',
    detail: issue.error_message || `An unregistered card (${issue.rfid_card_uid}) was tapped at this reader.`,
  }
}

export default function ScanIssuesAlert({ issues = [], onDismiss }) {
  if (issues.length === 0) return null

  return (
    <div className="scan-issues-panel">
      {issues.map((issue) => {
        const { Icon, title, detail } = issueCopy(issue)
        return (
          <div key={issue.id} className={`scan-issue-row scan-issue-${issue.result}`}>
            <Icon size={17} strokeWidth={2.2} />
            <div>
              <p>{title}</p>
              <span>{detail}</span>
            </div>
            <span className="scan-issue-time">{formatTime(issue.scanned_at || issue.created_at)}</span>
            {onDismiss && (
              <button
                type="button"
                className="scan-issue-dismiss"
                onClick={() => onDismiss(issue.id)}
                aria-label="Dismiss"
              >
                <X size={14} strokeWidth={2.2} />
              </button>
            )}
          </div>
        )
      })}
    </div>
  )
}