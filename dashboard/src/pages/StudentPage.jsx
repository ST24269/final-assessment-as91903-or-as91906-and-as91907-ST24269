import { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import { BarChart3, CalendarClock, ListChecks, MessageSquareWarning } from 'lucide-react'
import { api, supabase } from '../api/client'
import TagoLogo from '../components/TagoLogo'
import ThemeToggle from '../components/ThemeToggle'
import ProfileMenu from '../components/ProfileMenu'
import NotificationBell from '../components/NotificationBell'
import TodayStatusCard from '../components/student/TodayStatusCard'
import ClassAttendanceStats from '../components/student/ClassAttendanceStats'
import AttendanceHistoryTable from '../components/student/AttendanceHistoryTable'
import StudentAnalytics from '../components/student/StudentAnalytics'
import TimetableView from '../components/TimetableView'

const EMPTY_TIMETABLE = { periods: [], todayPeriods: [], currentClass: null, nextClass: null }

const MENU_ITEMS = [
  { id: 'timetable', label: 'Timetable', Icon: CalendarClock },
  { id: 'overview', label: 'Overview', Icon: BarChart3 },
  { id: 'attendance', label: 'Attendance', Icon: ListChecks },
]

export default function StudentPage({ session, profile }) {
  const [attendance, setAttendance] = useState([])
  const [classes, setClasses] = useState([])
  const [todayStatus, setTodayStatus] = useState(null)
  const [timetable, setTimetable] = useState(EMPTY_TIMETABLE)
  const [loading, setLoading] = useState(true)
  const [activeTab, setActiveTab] = useState('timetable')

  useEffect(() => {
    let cancelled = false

    const loadData = async () => {
      const { data: sp } = await supabase
        .from('student_profiles')
        .select('student_id')
        .eq('profile_id', session.user.id)
        .maybeSingle()

      if (cancelled) return

      if (!sp) {
        setLoading(false)
        return
      }

      const [{ data: enrolments }, { data: records }, timetableData] = await Promise.all([
        supabase
          .from('enrolments')
          .select('classes(id, name, subject, room)')
          .eq('student_id', sp.student_id),
        supabase
          .from('attendance')
          .select(`
            *,
            sessions(started_at, classes(name, subject))
          `)
          .eq('student_id', sp.student_id)
          .order('scanned_at', { ascending: false }),
        api.get('/api/timetable/me'),
      ])

      if (cancelled) return

      const classList = enrolments?.map((e) => e.classes) || []
      setClasses(classList)
      setAttendance(records || [])
      setTimetable(timetableData?.error ? EMPTY_TIMETABLE : (timetableData || EMPTY_TIMETABLE))

      const today = new Date().toISOString().split('T')[0]
      const todayRecord = records?.find((r) => r.scanned_at?.startsWith(today))
      setTodayStatus(todayRecord?.status || null)

      setLoading(false)
    }

    loadData()

    return () => { cancelled = true }
  }, [session.user.id])

  if (loading) return <div className="loading">loading</div>

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
            role="student"
            profileId={profile?.id}
          />
        </div>
      </header>

      <nav className="student-tab-menu" aria-label="Student dashboard sections">
        {MENU_ITEMS.map(({ id, label, Icon }) => (
          <button
            key={id}
            type="button"
            className={activeTab === id ? 'is-active' : ''}
            onClick={() => setActiveTab(id)}
          >
            <Icon size={16} strokeWidth={2.2} />
            {label}
          </button>
        ))}
        <Link className="student-tab-menu-item" to="/student/appeals">
          <MessageSquareWarning size={16} strokeWidth={2.2} />
          Submit appeal
        </Link>
      </nav>

      <main className="dashboard-main">
        {activeTab === 'timetable' ? (
          <TimetableView
            periods={timetable.periods}
            todayPeriods={timetable.todayPeriods}
            currentClass={timetable.currentClass}
            nextClass={timetable.nextClass}
            title="Timetable"
            subtitle={new Date().toLocaleDateString([], { weekday: 'long', month: 'short', day: 'numeric' })}
            emptyMessage="No timetable periods are scheduled for your linked classes."
          />
        ) : activeTab === 'overview' ? (
          <>
            <TodayStatusCard todayStatus={todayStatus} />
            <StudentAnalytics attendance={attendance} classes={classes} />
            <ClassAttendanceStats classes={classes} attendance={attendance} />
          </>
        ) : (
          <AttendanceHistoryTable attendance={attendance} classes={classes} />
        )}
      </main>
    </div>
  )
}