import { useEffect, useRef, useState } from 'react'
import { Bell, CheckCheck, X } from 'lucide-react'
import { api, supabase } from '../api/client'

function formatTime(value) {
  return value ? new Date(value).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' }) : ''
}

// Bell icon + dropdown of persisted notifications, plus a transient popup
// for the most recent unread error-type notification. Poll on an interval
// as a baseline, and refresh immediately on any realtime insert so a new
// notification shows up without waiting for the next poll.
export default function NotificationBell() {
  const [notifications, setNotifications] = useState([])
  const [open, setOpen] = useState(false)
  const [toast, setToast] = useState(null)
  const panelRef = useRef(null)
  const seenIds = useRef(new Set())

  const load = async () => {
    const data = await api.get('/api/notifications')
    if (!Array.isArray(data)) return

    // Anything new and unread with type 'error' pops up as a toast, even
    // if the dropdown is closed.
    const newError = data.find((item) => !item.read_at && item.type === 'error' && !seenIds.current.has(item.id))
    if (newError) setToast(newError)

    data.forEach((item) => seenIds.current.add(item.id))
    setNotifications(data)
  }

  useEffect(() => {
    load()
    const intervalId = window.setInterval(load, 20000)
    return () => window.clearInterval(intervalId)
  }, [])

  useEffect(() => {
    if (!supabase) return undefined

    const channel = supabase
      .channel('notifications-inserts')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'notifications' }, load)
      .subscribe()

    return () => supabase.removeChannel(channel)
  }, [])

  useEffect(() => {
    if (!open) return undefined

    const closeOnPointerDown = (event) => {
      if (!panelRef.current?.contains(event.target)) setOpen(false)
    }

    document.addEventListener('pointerdown', closeOnPointerDown)
    return () => document.removeEventListener('pointerdown', closeOnPointerDown)
  }, [open])

  const unreadCount = notifications.filter((item) => !item.read_at).length

  async function markRead(id) {
    setNotifications((prev) => prev.map((item) => (item.id === id ? { ...item, read_at: new Date().toISOString() } : item)))
    await api.patch(`/api/notifications/${id}/read`, {})
  }

  async function markAllRead() {
    setNotifications((prev) => prev.map((item) => (item.read_at ? item : { ...item, read_at: new Date().toISOString() })))
    await api.patch('/api/notifications/read-all', {})
  }

  return (
    <>
      <div className="notification-bell" ref={panelRef}>
        <button
          type="button"
          className="admin-icon-button notification-bell-button"
          aria-label="Notifications"
          aria-haspopup="dialog"
          aria-expanded={open}
          onClick={() => setOpen((current) => !current)}
        >
          <Bell size={24} strokeWidth={2.2} />
          {unreadCount > 0 && <span className="notification-bell-badge">{unreadCount > 9 ? '9+' : unreadCount}</span>}
        </button>

        {open && (
          <div className="notification-bell-panel" role="dialog" aria-label="Notifications">
            <div className="notification-bell-panel-header">
              <strong>Notifications</strong>
              {unreadCount > 0 && (
                <button type="button" className="btn-ghost notification-mark-all" onClick={markAllRead}>
                  <CheckCheck size={13} strokeWidth={2.4} />
                  Mark all read
                </button>
              )}
            </div>

            {notifications.length === 0 ? (
              <p className="notification-empty">No notifications yet.</p>
            ) : (
              <div className="notification-bell-list">
                {notifications.map((item) => (
                  <button
                    type="button"
                    key={item.id}
                    className={`notification-item notification-item-${item.type} ${item.read_at ? '' : 'is-unread'}`}
                    onClick={() => !item.read_at && markRead(item.id)}
                  >
                    <span className="notification-item-title">{item.title}</span>
                    {item.message && <span className="notification-item-message">{item.message}</span>}
                    <span className="notification-item-time">{formatTime(item.created_at)}</span>
                  </button>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {toast && (
        <div className={`notification-toast notification-toast-${toast.type}`} role="alert">
          <div>
            <strong>{toast.title}</strong>
            {toast.message && <p>{toast.message}</p>}
          </div>
          <button type="button" aria-label="Dismiss" onClick={() => setToast(null)}>
            <X size={14} strokeWidth={2.4} />
          </button>
        </div>
      )}
    </>
  )
}   