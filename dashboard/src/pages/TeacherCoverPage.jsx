import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { ArrowLeft, Search } from 'lucide-react'
import { Link } from 'react-router-dom'
import { api } from '../api/client'
import TagoLogo from '../components/TagoLogo'
import ThemeToggle from '../components/ThemeToggle'
import ProfileMenu from '../components/ProfileMenu'
import TimetableView from '../components/TimetableView'
import { startSessionForClass } from '../utils/startSession'

export default function TeacherCoverPage({ session, profile }) {
  const navigate = useNavigate()
  const [query, setQuery] = useState('')
  const [results, setResults] = useState([])
  const [searching, setSearching] = useState(false)
  const [selectedTeacher, setSelectedTeacher] = useState(null)
  const [timetable, setTimetable] = useState([])
  const [timetableLoading, setTimetableLoading] = useState(false)
  const [startError, setStartError] = useState(null)
  const latestTeacherIdRef = useRef(null)

  useEffect(() => {
    let cancelled = false
    setSearching(true)

    const timeout = setTimeout(() => {
      api.get(`/api/timetable/teachers?search=${encodeURIComponent(query)}`).then((data) => {
        if (cancelled) return
        setResults(Array.isArray(data) ? data : [])
        setSearching(false)
      })
    }, 250)

    return () => {
      cancelled = true
      clearTimeout(timeout)
    }
  }, [query])

  function selectTeacher(teacher) {
    setSelectedTeacher(teacher)
    setTimetableLoading(true)
    setStartError(null)

    // Guard against out-of-order responses: if the teacher clicks a
    // different row before this request resolves, ignore the stale result
    // instead of overwriting the timetable that belongs to the newer pick.
    latestTeacherIdRef.current = teacher.id

    api.get(`/api/timetable/of/${teacher.id}`).then((data) => {
      if (latestTeacherIdRef.current !== teacher.id) return
      setTimetable(Array.isArray(data) ? data : [])
      setTimetableLoading(false)
    })
  }

  async function handleStartClass(period) {
    if (!period.class_id || !selectedTeacher) return
    setStartError(null)

    const result = await startSessionForClass(period.class_id, {
      coveringForTeacherId: selectedTeacher.id,
    })

    if (result.error) {
      setStartError(result.error)
      return
    }

    navigate(`/teacher/session/${result.session.id}`)
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

        <section className="portal-section">
          <div className="portal-section-header">
            <p>Find a teacher to cover</p>
          </div>

          <label className="student-search">
            <Search size={16} strokeWidth={2.2} />
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search teacher name..."
              autoFocus
            />
          </label>

          {searching && <p className="table-helper-text">Searching...</p>}

          {!searching && query && results.length === 0 && (
            <p className="table-helper-text">No teachers match "{query}".</p>
          )}

          {!searching && results.length > 0 && (
            <div className="teacher-active-session-list">
              {results.map((teacher) => (
                <button
                  key={teacher.id}
                  type="button"
                  className={`teacher-active-session-row ${selectedTeacher?.id === teacher.id ? 'is-active' : ''}`}
                  onClick={() => selectTeacher(teacher)}
                >
                  <span>
                    <strong>{teacher.full_name}</strong>
                    <small>{teacher.email}</small>
                  </span>
                </button>
              ))}
            </div>
          )}
        </section>

        {startError && <p className="portal-error-message">{startError}</p>}

        {selectedTeacher && !timetableLoading && (
          <TimetableView
            periods={timetable}
            title={`${selectedTeacher.full_name}'s timetable`}
            subtitle="Select a class to start it on their behalf"
            emptyMessage={`${selectedTeacher.full_name} has no timetable periods set.`}
            onStartClass={handleStartClass}
          />
        )}

        {selectedTeacher && timetableLoading && (
          <p className="table-helper-text">Loading timetable...</p>
        )}
      </main>
    </div>
  )
}