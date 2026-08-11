import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { ArrowLeft, Search, Users } from 'lucide-react'
import { api } from '../api/client'
import TagoLogo from '../components/TagoLogo'
import ThemeToggle from '../components/ThemeToggle'
import ProfileMenu from '../components/ProfileMenu'
import NotificationBell from '../components/teacher/NotificationBell'
import Card from '../components/Card'
import Loader from '../components/Loader'

function pct(value) {
  return value === null || value === undefined ? 'No data' : `${value}%`
}

function rateClass(value) {
  if (value === null || value === undefined) return ''
  if (value >= 90) return 'status-present'
  if (value >= 75) return 'status-late'
  return 'status-absent'
}

// Small class tile shared by "your classes" and "all classes" lists.
function ClassTile({ classItem, onSelect, isActive }) {
  return (
    <button
      type="button"
      className={`live-feed-row is-ok analytics-class-tile ${isActive ? 'is-active' : ''}`}
      onClick={() => onSelect(classItem.id)}
    >
      <div className="live-feed-details">
        <p className="live-feed-name">{classItem.name}</p>
        <div className="live-feed-meta">
          <span>{classItem.subject}</span>
          {classItem.room && <span>Room {classItem.room}</span>}
          {classItem.profiles?.full_name && <span>{classItem.profiles.full_name}</span>}
        </div>
      </div>
      <span className={`status-badge ${rateClass(classItem.attendance_summary?.percentage)}`}>
        {pct(classItem.attendance_summary?.percentage)}
      </span>
    </button>
  )
}

export default function TeacherAnalyticsPage({ session, profile }) {
  const [classes, setClasses] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [query, setQuery] = useState('')

  const [selectedClassId, setSelectedClassId] = useState(null)
  const [detail, setDetail] = useState(null)
  const [detailLoading, setDetailLoading] = useState(false)
  const [detailError, setDetailError] = useState(null)

  useEffect(() => {
    let cancelled = false

    api.get('/api/classes').then((data) => {
      if (cancelled) return
      if (data?.error) {
        setError(data.error)
      } else {
        setClasses(Array.isArray(data) ? data : [])
      }
      setLoading(false)
    })

    return () => { cancelled = true }
  }, [])

  const ownClasses = useMemo(
    () => classes.filter((classItem) => classItem.teacher_id === session.user.id),
    [classes, session.user.id],
  )

  const otherClasses = useMemo(() => {
    const search = query.trim().toLowerCase()
    const pool = classes.filter((classItem) => classItem.teacher_id !== session.user.id)
    if (!search) return pool
    return pool.filter((classItem) => [
      classItem.name,
      classItem.subject,
      classItem.room,
      classItem.profiles?.full_name,
    ].filter(Boolean).join(' ').toLowerCase().includes(search))
  }, [classes, query, session.user.id])

  useEffect(() => {
    if (!selectedClassId) {
      setDetail(null)
      return
    }

    let cancelled = false
    setDetailLoading(true)
    setDetailError(null)

    api.get(`/api/classes/${selectedClassId}/analytics`).then((data) => {
      if (cancelled) return
      if (data?.error) {
        setDetailError(data.error)
        setDetail(null)
      } else {
        setDetail(data)
      }
      setDetailLoading(false)
    })

    return () => { cancelled = true }
  }, [selectedClassId])

  // Selecting a class from either list just changes which one is "active"
  // for the summary panel below - it doesn't need its own attendance
  // numbers fetched up front, only /api/classes/:id/analytics on demand.
  function selectClass(id) {
    setSelectedClassId((current) => (current === id ? null : id))
  }

  const selectedClassMeta = classes.find((classItem) => classItem.id === selectedClassId)

  if (loading) {
    return <Loader title="Loading analytics" subtitle="Gathering your classes and attendance records" />
  }

  return (
    <div className="dashboard">
      <header className="dashboard-header">
        <div className="header-brand">
          <TagoLogo showWord size={18} markClassName="header-brand-icon" />
        </div>
        <div className="header-right">
          <NotificationBell />
          <ThemeToggle />
          <ProfileMenu
            name={profile?.full_name}
            email={session.user.email}
            role="teacher"
            profileId={profile?.id}
          />
        </div>
      </header>

      <main className="dashboard-main">
        <Link to="/teacher" className="btn-ghost session-back-link">
          <ArrowLeft size={14} strokeWidth={2.2} />
          Back to dashboard
        </Link>

        {error && <div className="portal-alert" role="alert">{error}</div>}

        <Card title="Your classes">
          {ownClasses.length === 0 ? (
            <p className="table-helper-text">You are not assigned as the teacher on any class yet.</p>
          ) : (
            <div className="live-feed-list" style={{ marginTop: '0.5rem' }}>
              {ownClasses.map((classItem) => (
                <ClassTile
                  key={classItem.id}
                  classItem={classItem}
                  onSelect={selectClass}
                  isActive={selectedClassId === classItem.id}
                />
              ))}
            </div>
          )}
        </Card>

        <Card title="Search other classes">
          <p className="table-helper-text">
            Look up attendance for any class - useful when covering, or checking in on a colleague's roll.
          </p>
          <label className="student-search" style={{ marginTop: '0.6rem' }}>
            <Search size={16} strokeWidth={2.2} />
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search by class name, subject, room, or teacher"
            />
          </label>
          {query.trim() && (
            <div className="live-feed-list" style={{ marginTop: '0.75rem' }}>
              {otherClasses.length === 0 ? (
                <p className="table-helper-text">No classes match that search.</p>
              ) : otherClasses.slice(0, 12).map((classItem) => (
                <ClassTile
                  key={classItem.id}
                  classItem={classItem}
                  onSelect={selectClass}
                  isActive={selectedClassId === classItem.id}
                />
              ))}
            </div>
          )}
        </Card>

        {selectedClassId && (
          <Card title={selectedClassMeta ? `${selectedClassMeta.name} - attendance` : 'Class attendance'}>
            {detailLoading ? (
              <p className="table-helper-text">Loading attendance...</p>
            ) : detailError ? (
              <div className="portal-alert" role="alert">{detailError}</div>
            ) : detail ? (
              <>
                <div className="account-mini-stats" style={{ marginBottom: '1rem' }}>
                  <div><span>Overall rate</span><strong>{pct(detail.summary.percentage)}</strong></div>
                  <div><span>Sessions run</span><strong>{detail.total_sessions}</strong></div>
                  <div><span>Present</span><strong>{detail.summary.present}</strong></div>
                  <div><span>Absent</span><strong>{detail.summary.absent}</strong></div>
                </div>

                <p className="table-helper-text" style={{ marginBottom: '0.5rem' }}>
                  <Users size={14} strokeWidth={2.2} style={{ verticalAlign: '-2px' }} /> Students, lowest attendance first
                </p>

                {detail.students.length === 0 ? (
                  <p className="table-helper-text">No students are enrolled in this class.</p>
                ) : (
                  <div className="live-feed-list">
                    {detail.students.map((student) => (
                      <div key={student.id} className="live-feed-row is-ok">
                        <img
                          src={student.photo_url || '/default-avatar.png'}
                          alt=""
                          className="live-feed-avatar-sm"
                        />
                        <div className="live-feed-details">
                          <p className="live-feed-name">{student.full_name}</p>
                          <div className="live-feed-meta">
                            {student.student_number && <span>{student.student_number}</span>}
                            {student.year_level && <span>Year {student.year_level}</span>}
                          </div>
                        </div>
                        <span className={`status-badge ${rateClass(student.attendance_summary.percentage)}`}>
                          {pct(student.attendance_summary.percentage)}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </>
            ) : null}
          </Card>
        )}
      </main>
    </div>
  )
}