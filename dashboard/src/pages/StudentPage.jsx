import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { AlertCircle, ArrowRight, CalendarDays, MessageSquareWarning } from 'lucide-react'
import { api, supabase } from '../api/client'
import Layout from '../components/Layout'
import Card from '../components/Card'
import Loader from '../components/Loader'
import TimetableView from '../components/TimetableView'

const STATUS_LABELS = ['present', 'late', 'absent', 'excused']

function isToday(value) {
  return value && new Date(value).toDateString() === new Date().toDateString()
}

function formatDate(value) {
  return value ? new Date(value).toLocaleDateString([], { month: 'short', day: 'numeric', year: 'numeric' }) : 'No date'
}

function formatTime(value) {
  return value ? new Date(value).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : 'No time'
}

function getAttendanceColor(percent) {
  if (percent === null) return 'var(--text-soft)'
  if (percent >= 90) return 'var(--green)'
  if (percent >= 75) return 'var(--primary-2)'
  return 'var(--red)'
}

function StatusBadge({ status }) {
  return (
    <span className={`status-badge status-${status || 'absent'}`}>
      {status || 'unknown'}
    </span>
  )
}

function classLabel(classItem) {
  if (!classItem) return 'Class'
  return `${classItem.name || 'Class'}${classItem.subject ? ` - ${classItem.subject}` : ''}`
}

export default function StudentPage({ session, profile }) {
  const [studentRecord, setStudentRecord] = useState(null)
  const [attendance, setAttendance] = useState([])
  const [classes, setClasses] = useState([])
  const [timetable, setTimetable] = useState({ periods: [], todayPeriods: [], currentClass: null, nextClass: null })
  const [selectedClass, setSelectedClass] = useState('all')
  const [statusFilter, setStatusFilter] = useState('all')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  useEffect(() => {
    let cancelled = false

    async function loadData() {
      setLoading(true)
      setError(null)

      const { data: linkedStudent, error: linkError } = await supabase
        .from('student_profiles')
        .select(`
          student_id,
          students(
            id,
            full_name,
            student_number,
            year_level,
            kainga,
            form_group,
            la_teacher_id,
            profiles(full_name, email)
          )
        `)
        .eq('profile_id', session.user.id)
        .maybeSingle()

      if (cancelled) return

      if (linkError) {
        setError(linkError.message)
        setLoading(false)
        return
      }

      if (!linkedStudent?.student_id) {
        setError('This account is not linked to a student record yet.')
        setLoading(false)
        return
      }

      setStudentRecord(linkedStudent.students || null)

      const [
        { data: enrolments, error: enrolmentError },
        { data: records, error: attendanceError },
        timetableData,
      ] = await Promise.all([
        supabase
          .from('enrolments')
          .select('classes(id, name, subject, room, teacher_id, profiles(full_name, email))')
          .eq('student_id', linkedStudent.student_id),
        supabase
          .from('attendance')
          .select('*, sessions(id, started_at, classes(id, name, subject, room))')
          .eq('student_id', linkedStudent.student_id)
          .order('scanned_at', { ascending: false }),
        api.get('/api/timetable/me'),
      ])

      if (cancelled) return

      if (enrolmentError || attendanceError) {
        setError(enrolmentError?.message || attendanceError?.message)
        setLoading(false)
        return
      }

      setClasses(enrolments?.map((row) => row.classes).filter(Boolean) || [])
      setAttendance(records || [])
      setTimetable(timetableData?.error
        ? { periods: [], todayPeriods: [], currentClass: null, nextClass: null }
        : (timetableData || { periods: [], todayPeriods: [], currentClass: null, nextClass: null }))
      setLoading(false)
    }

    loadData()

    return () => { cancelled = true }
  }, [session.user.id])

  const todayRecord = useMemo(
    () => attendance.find((record) => isToday(record.scanned_at)),
    [attendance],
  )

  const overview = useMemo(() => {
    const counted = attendance.filter((record) => record.status !== 'excused')
    const attended = counted.filter((record) => record.status === 'present' || record.status === 'late')
    const rate = counted.length ? Math.round((attended.length / counted.length) * 100) : null

    return {
      rate,
      attended: attended.length,
      total: counted.length,
      late: attendance.filter((record) => record.status === 'late').length,
      flagged: attendance.filter((record) => record.flagged).length,
    }
  }, [attendance])

  const classStats = useMemo(() => classes.map((classItem) => {
    const records = attendance.filter((record) => record.sessions?.classes?.id === classItem.id)
    const counted = records.filter((record) => record.status !== 'excused')
    const attended = counted.filter((record) => record.status === 'present' || record.status === 'late')
    const percent = counted.length ? Math.round((attended.length / counted.length) * 100) : null
    const lastRecord = records[0]

    return {
      ...classItem,
      attended: attended.length,
      total: counted.length,
      percent,
      lastStatus: lastRecord?.status || null,
    }
  }), [attendance, classes])

  const filteredAttendance = useMemo(() => attendance.filter((record) => {
    const classMatches = selectedClass === 'all' || record.sessions?.classes?.id === selectedClass
    const statusMatches = statusFilter === 'all' || record.status === statusFilter
    return classMatches && statusMatches
  }), [attendance, selectedClass, statusFilter])

  const profileRows = [
    ['Email', session.user.email],
    ['Student ID', studentRecord?.student_number || 'Not set'],
    ['Year', studentRecord?.year_level ? `Year ${studentRecord.year_level}` : 'Not set'],
    ['Kainga', studentRecord?.kainga || 'Not set'],
    ['Form / LA class', studentRecord?.form_group || 'Not set'],
    ['LA teacher', studentRecord?.profiles?.full_name || 'Not assigned'],
  ]

  if (loading) {
    return (
      <Loader
        title="Loading student dashboard"
        subtitle="Pulling your profile, classes, and timetable"
      />
    )
  }

  return (
    <Layout
      email={session.user.email}
      name={studentRecord?.full_name || profile?.full_name}
      role="student"
      profileId={profile?.id}
    >
      <section className="portal-hero">
        <div>
          <p className="portal-eyebrow">Student dashboard</p>
          <h1 className="portal-title">
            {studentRecord?.full_name || profile?.full_name || 'Student'}
          </h1>
          <p className="portal-subtitle">
            {studentRecord?.kainga || 'Kainga not set'}
            {studentRecord?.form_group ? ` - ${studentRecord.form_group}` : ''}
            {studentRecord?.year_level ? ` - Year ${studentRecord.year_level}` : ''}
          </p>
          <div className="student-action-row">
            <Link className="student-action-link" to="/student/appeals">
              <MessageSquareWarning size={16} strokeWidth={2.2} />
              Submit Attendance Appeal
            </Link>
          </div>
        </div>

        <div className="portal-side-card">
          <span>Today</span>
          {todayRecord ? (
            <div className="student-today-status">
              <StatusBadge status={todayRecord.status} />
              <strong>{formatTime(todayRecord.scanned_at)}</strong>
            </div>
          ) : (
            <strong>Not scanned yet</strong>
          )}
        </div>
      </section>

      {error && (
        <div className="portal-alert">
          <AlertCircle size={18} strokeWidth={2.2} />
          {error}
        </div>
      )}

      {error ? (
        <Card title="Student record">
          <div className="portal-empty">
            <strong>No linked student profile</strong>
            <span>An admin needs to link this login account to a student record before attendance details can appear here.</span>
          </div>
        </Card>
      ) : (
        <>
          <section className="student-dashboard-grid">
            <Card title="Profile summary">
              <div className="student-profile-list">
                {profileRows.map(([label, value]) => (
                  <div key={label} className="student-profile-row">
                    <span>{label}</span>
                    <strong>{value}</strong>
                  </div>
                ))}
              </div>
            </Card>

            <Card title="Linked classes">
              {classes.length === 0 ? (
                <div className="portal-empty">
                  <strong>No classes linked yet.</strong>
                  <span>An admin can link your classes from Student-Class Linking.</span>
                </div>
              ) : (
                <div className="student-class-list">
                  {classes.map((classItem) => (
                    <div key={classItem.id} className="student-class-card">
                      <strong>{classLabel(classItem)}</strong>
                      <span>
                        {classItem.room ? `Room ${classItem.room}` : 'Room not set'} - {classItem.profiles?.full_name || 'Teacher not assigned'}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </Card>
          </section>

          <section className="portal-stat-grid">
            {[
              ['Attendance rate', overview.rate === null ? 'No data' : `${overview.rate}%`, `${overview.attended}/${overview.total} counted`],
              ['Classes', classes.length, 'current enrolments'],
              ['Late marks', overview.late, 'across all records'],
              ['Flags', overview.flagged, 'records needing review'],
            ].map(([label, value, detail]) => (
              <div key={label} className="portal-stat">
                <p>{label}</p>
                <strong>{value}</strong>
                <span>{detail}</span>
              </div>
            ))}
          </section>

          <TimetableView
            periods={timetable.periods}
            todayPeriods={timetable.todayPeriods}
            currentClass={timetable.currentClass}
            nextClass={timetable.nextClass}
            title="Student timetable"
            subtitle={new Date().toLocaleDateString([], { weekday: 'long', month: 'short', day: 'numeric' })}
            emptyMessage="No timetable periods are scheduled for your linked classes."
          />

          <Card title="Class attendance">
            {classStats.length === 0 ? (
              <p className="empty-state">No classes linked to this student.</p>
            ) : (
              <div className="student-class-stat-grid">
                {classStats.map((classItem) => {
                  const color = getAttendanceColor(classItem.percent)

                  return (
                    <div key={classItem.id} className="student-class-stat">
                      <div>
                        <strong>{classItem.name}</strong>
                        <span>
                          {classItem.subject}
                          {classItem.room ? ` - Room ${classItem.room}` : ''}
                          {classItem.profiles?.full_name ? ` - ${classItem.profiles.full_name}` : ''}
                        </span>
                      </div>
                      <span className="student-class-percent" style={{ color }}>
                        {classItem.percent === null ? 'No data' : `${classItem.percent}%`}
                      </span>
                      <div className="student-progress-track">
                        <div style={{ width: `${classItem.percent || 0}%`, background: color }} />
                      </div>
                      <small>{classItem.attended}/{classItem.total} attended - {classItem.lastStatus ? `Last: ${classItem.lastStatus}` : 'No scans yet'}</small>
                    </div>
                  )
                })}
              </div>
            )}
          </Card>

          <Card
            title={`Attendance history (${filteredAttendance.length})`}
            action={
              <div className="student-filter-row">
                <select className="session-select" value={selectedClass} onChange={(event) => setSelectedClass(event.target.value)}>
                  <option value="all">All classes</option>
                  {classes.map((classItem) => (
                    <option key={classItem.id} value={classItem.id}>{classItem.name}</option>
                  ))}
                </select>
                <select className="session-select" value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)}>
                  <option value="all">All statuses</option>
                  {STATUS_LABELS.map((status) => (
                    <option key={status} value={status}>{status}</option>
                  ))}
                </select>
              </div>
            }
          >
            {filteredAttendance.length === 0 ? (
              <p className="empty-state">No attendance records match this filter.</p>
            ) : (
              <div className="student-table-wrap">
                <table className="attendance-table">
                  <thead>
                    <tr>
                      {['Class', 'Date', 'Time', 'Status', 'Note'].map((heading) => (
                        <th key={heading}>{heading}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {filteredAttendance.map((record) => (
                      <tr key={record.id}>
                        <td>
                          <strong>{record.sessions?.classes?.name || 'Unknown class'}</strong>
                          <span className="student-table-sub">{record.sessions?.classes?.subject}</span>
                        </td>
                        <td className="student-id">{formatDate(record.scanned_at)}</td>
                        <td className="student-id">{formatTime(record.scanned_at)}</td>
                        <td><StatusBadge status={record.status} /></td>
                        <td className="student-id">
                          {record.flagged ? `Flagged: ${record.flag_reason || 'review needed'}` : record.manual_override ? 'Edited by staff' : 'RFID scan'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Card>

          <Link className="student-action-link is-secondary" to="/student/appeals">
            <CalendarDays size={16} strokeWidth={2.2} />
            Open appeals page
            <ArrowRight size={16} strokeWidth={2.2} />
          </Link>
        </>
      )}
    </Layout>
  )
}
