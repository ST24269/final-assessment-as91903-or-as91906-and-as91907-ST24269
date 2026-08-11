import { useEffect, useRef, useState } from 'react'
import { Bell } from 'lucide-react'
import { supabase } from '../../api/client'
import ScanIssuesAlert from './ScanIssuesAlert'

// 'reader_inactive' included so a disabled/misconfigured reader shows up
// here too, not just in the ESP32's own logs. 'lookup' deliberately isn't
// in this list - a card lookup with no session is a normal action, not an
// issue, and it's already surfaced live via StudentSearchPage's own
// listener rather than the issues bell.
const SCAN_ISSUE_RESULTS = ['invalid_card', 'not_enrolled', 'reader_inactive']

export default function NotificationBell() {
  const [scanIssues, setScanIssues] = useState([])
  const [dismissedIssueIds, setDismissedIssueIds] = useState(() => new Set())
  const [open, setOpen] = useState(false)
  const panelRef = useRef(null)

  useEffect(() => {
    let cancelled = false

    supabase
      .from('scan_logs')
      .select('*, students(full_name)')
      .in('result', SCAN_ISSUE_RESULTS)
      .order('created_at', { ascending: false })
      .limit(20)
      .then(({ data }) => {
        if (cancelled) return
        setScanIssues((data || []).map((row) => ({ ...row, student: row.students })))
      })

    const channel = supabase
      .channel('notification-bell-scan-log-errors')   
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'scan_logs' },
        (payload) => {
          if (!SCAN_ISSUE_RESULTS.includes(payload.new.result)) return
          setScanIssues((current) => [payload.new, ...current].slice(0, 20))
        }
      )
      .subscribe()

    return () => {
      cancelled = true
      supabase.removeChannel(channel)
    }
  }, [])

  useEffect(() => {
    if (!open) return undefined

    const closeOnPointerDown = (event) => {
      if (!panelRef.current?.contains(event.target)) setOpen(false)
    }
    const closeOnEscape = (event) => {
      if (event.key === 'Escape') setOpen(false)
    }

    document.addEventListener('pointerdown', closeOnPointerDown)
    document.addEventListener('keydown', closeOnEscape)

    return () => {
      document.removeEventListener('pointerdown', closeOnPointerDown)
      document.removeEventListener('keydown', closeOnEscape)
    }
  }, [open])

  function dismissScanIssue(id) {
    setDismissedIssueIds((current) => new Set(current).add(id))
  }

  const visibleScanIssues = scanIssues.filter((issue) => !dismissedIssueIds.has(issue.id))

  return (
    <div className="notification-bell" ref={panelRef}>
      <button
        type="button"
        className="notification-bell-button"
        aria-label="Scan notifications"
        aria-haspopup="dialog"
        aria-expanded={open}
        onClick={() => setOpen((current) => !current)}
      >
        <Bell size={22} strokeWidth={2.2} />
        {visibleScanIssues.length > 0 && (
          <span className="notification-bell-badge">
            {visibleScanIssues.length > 9 ? '9+' : visibleScanIssues.length}
          </span>
        )}
      </button>

      {open && (
        <div className="notification-bell-panel" role="dialog" aria-label="Scan notifications">
          <ScanIssuesAlert issues={visibleScanIssues} onDismiss={dismissScanIssue} />
        </div>
      )}
    </div>
  )
}