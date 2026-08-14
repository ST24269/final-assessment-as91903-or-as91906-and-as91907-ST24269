import { useEffect, useMemo, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { ArrowLeft, ChevronRight, CreditCard, Search } from 'lucide-react'
import { api, supabase } from '../api/client'
import TagoLogo from '../components/TagoLogo'
import ThemeToggle from '../components/ThemeToggle'
import ProfileMenu from '../components/ProfileMenu'
import Card from '../components/Card'
import ErrorToast from '../components/ErrorToast'
import StudentDetailModal from '../components/teacher/StudentDetailModal'

export default function StudentSearchPage({ session, profile }) {
  const role = profile?.role === 'admin' ? 'admin' : 'teacher'

  const [students, setStudents] = useState([])
  const [loading, setLoading] = useState(true)
  const [query, setQuery] = useState('')

  const [cardUid, setCardUid] = useState('')
  const [scanning, setScanning] = useState(false)

  const [detailStudentId, setDetailStudentId] = useState(null)
  const [errorMessage, setErrorMessage] = useState(null)

  const scanInputRef = useRef(null)

  useEffect(() => {
    let cancelled = false

    api.get('/api/students').then((data) => {
      if (cancelled) return
      if (data?.error) {
        setErrorMessage(data.error)
      } else {
        setStudents(Array.isArray(data) ? data : [])
      }
      setLoading(false)
    })

    // A USB/desk RFID reader behaves like a keyboard - it just types the
    // UID then Enter. Keep the scan field focused by default so a card can
    // be tapped the moment this page opens, without clicking into the box.
    scanInputRef.current?.focus()

    return () => { cancelled = true }
  }, [])

  // Live "someone just tapped their card on a classroom reader with no
  // session running" listener. The physical reader hits POST
  // /api/attendance/lookup, which now writes a scan_logs row with
  // result: 'lookup' (previously this only ever printed to the ESP32's
  // own Serial monitor, so the dashboard had no way to react to it).
  // Auto-open that student's profile the moment the row lands.
  useEffect(() => {
    if (!supabase) return undefined

    const channel = supabase
      .channel('student-search-card-lookups')
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'scan_logs' },
        (payload) => {
          if (payload.new?.result !== 'lookup' || !payload.new?.student_id) return
          setDetailStudentId(payload.new.student_id)
        }
      )
      .subscribe()

    return () => supabase.removeChannel(channel)
  }, [])

  const results = useMemo(() => {
    const search = query.trim().toLowerCase()
    if (!search) return students

    return students.filter((student) => {
      const searchable = [
        student.full_name,
        student.student_number,
        student.email,
        student.rfid_card_uid,
        student.kainga,
        student.form_group,
        student.class_label,
        student.la_teacher_name,
      ].filter(Boolean).join(' ').toLowerCase()

      return searchable.includes(search)
    })
  }, [students, query])

  async function lookupByCard(event) {
    event.preventDefault()
    const uid = cardUid.trim()
    if (!uid) return

    setScanning(true)
    setErrorMessage(null)

    const data = await api.get(`/api/students/by-card/${encodeURIComponent(uid)}`)

    setScanning(false)
    setCardUid('')
    scanInputRef.current?.focus()

    if (data?.error) {
      setErrorMessage(data.error)
      return
    }

    setDetailStudentId(data.id)
  }

  return (
    <div className="dashboard">
      <header className="dashboard-header">
        <div className="header-brand">
          <TagoLogo showWord size={18} markClassName="header-brand-icon" />
        </div>
        <div className="header-right">
          <ThemeToggle />
          <ProfileMenu
            name={profile?.full_name}
            email={session.user.email}
            role={role}
            profileId={profile?.id}
          />
        </div>
      </header>

      <main className="dashboard-main">
        <Link to={`/${role}`} className="btn-ghost session-back-link">
          <ArrowLeft size={14} strokeWidth={2.2} />
          Back to dashboard
        </Link>

        <Card title="Find a student by their card">
          <form onSubmit={lookupByCard} className="portal-session-grid" style={{ marginTop: '0.75rem' }}>
            <label className="student-search" style={{ flex: 1 }}>
              <CreditCard size={16} strokeWidth={2.2} />
              <input
                ref={scanInputRef}
                value={cardUid}
                onChange={(event) => setCardUid(event.target.value)}
                placeholder="Scan a card, or type its UID and press Enter"
                autoComplete="off"
              />
            </label>
            <button type="submit" className="session-start-button" disabled={scanning || !cardUid.trim()}>
              {scanning ? 'Looking up...' : 'Look up'}
            </button>
          </form>
        </Card>

        <Card title={`All students${!loading ? ` - ${results.length}/${students.length}` : ''}`}>
          <label className="student-search">
            <Search size={16} strokeWidth={2.2} />
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search name, student ID, RFID card, kainga, form group, LA teacher..."
            />
          </label>

          {loading ? (
            <p className="table-helper-text">Loading students...</p>
          ) : results.length === 0 ? (
            <p className="table-helper-text">No students match that search.</p>
          ) : (
            <div className="live-feed-list" style={{ marginTop: '0.75rem' }}>
              {results.map((student) => (
                <div key={student.id} className="live-feed-row is-ok">
                  <button
                    type="button"
                    className="live-feed-clickable"
                    onClick={() => setDetailStudentId(student.id)}
                  >
                    <img
                      src={student.photo_url || '/default-avatar.png'}
                      alt=""
                      className="live-feed-avatar-sm"
                    />
                    <div className="live-feed-details">
                      <p className="live-feed-name">
                        {student.full_name}
                        <ChevronRight size={14} strokeWidth={2.2} className="live-feed-chevron" />
                      </p>
                      <div className="live-feed-meta">
                        {student.student_number && <span>{student.student_number}</span>}
                        {student.year_level && <span>Year {student.year_level}</span>}
                        {student.kainga && <span className="live-feed-pill">{student.kainga}</span>}
                        {student.la_teacher_name && <span>LA: {student.la_teacher_name}</span>}
                      </div>
                      <small>{student.class_label || 'Not enrolled in any classes'}</small>
                    </div>
                  </button>
                </div>
              ))}
            </div>
          )}
        </Card>
      </main>

      {detailStudentId && (
        <StudentDetailModal
          studentId={detailStudentId}
          onClose={() => setDetailStudentId(null)}
        />
      )}

      <ErrorToast message={errorMessage} onClose={() => setErrorMessage(null)} />
    </div>
  )
}