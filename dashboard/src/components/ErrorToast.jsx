import { useEffect } from 'react'
import { AlertTriangle, X } from 'lucide-react'

// A transient popup for errors from actions on the current page (ending a
// session, submitting attendance, verifying a scan) - distinct from
// NotificationBell, which is for persisted, cross-session notifications.
export default function ErrorToast({ message, onClose }) {
  useEffect(() => {
    if (!message) return undefined
    const timeoutId = window.setTimeout(onClose, 8000)
    return () => window.clearTimeout(timeoutId)
  }, [message, onClose])

  if (!message) return null

  return (
    <div className="notification-toast notification-toast-error" role="alert">
      <AlertTriangle size={16} strokeWidth={2.4} />
      <div>
        <strong>Something went wrong</strong>
        <p>{message}</p>
      </div>
      <button type="button" aria-label="Dismiss" onClick={onClose}>
        <X size={14} strokeWidth={2.4} />
      </button>
    </div>
  )
}