import { useEffect, useMemo, useState } from 'react'
import { supabase } from '../api/client'
import Layout from '../components/Layout'
import Card from '../components/Card'
import Loader from '../components/Loader'

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

export default function StudentPage({ session, profile }) {
  const [studentRecord, setStudentRecord] = useState(null)
  const [attendance, setAttendance] = useState([])
  const [classes, setClasses] = useState([])
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
        .select('student_id, students(full_name, student_number, year_level)')
        .eq('profile_id', session.user.id)
        .maybeSingle()

      if (cancelled) return

      if (linkError) {
        setError(linkError.message)
        setLoading(false)
        return
      }

      if (!linkedStudent) {
        setError('This account is not linked to a student record yet.')
        setLoading(false)
        return
      }

      setStudentRecord(linkedStudent.students || null)

      const [{ data: enrolments, error: enrolmentError }, { data: records, error: attendanceError }] = await Promise.all([
        supabase
          .from('enrolments')
          .select('classes(id, name, subject, room)')
          .eq('student_id', linkedStudent.student_id),
        supabase
          .from('attendance')
          .select('*, sessions(started_at, classes(id, name, subject, room))')
          .eq('student_id', linkedStudent.student_id)
          .order('scanned_at', { ascending: false }),
      ])

      if (cancelled) return

      if (enrolmentError || attendanceError) {
        setError(enrolmentError?.message || attendanceError?.message)
        setLoading(false)
        return
      }

      setClasses(enrolments?.map((row) => row.classes).filter(Boolean) || [])
      setAttendance(records || [])
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
      lastScannedAt: lastRecord?.scanned_at || null,
    }
  }), [attendance, classes])

  const filteredAttendance = useMemo(() => attendance.filter((record) => {
    const classMatches = selectedClass === 'all' || record.sessions?.classes?.id === selectedClass
    const statusMatches = statusFilter === 'all' || record.status === statusFilter
    return classMatches && statusMatches
  }), [attendance, selectedClass, statusFilter])

  if (loading) {
    return (
      <Loader
        title="Loading student dashboard"
        subtitle="Pulling your attendance records"
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
          <p className="portal-eyebrow">Student overview</p>
          <h1 className="portal-title">
            {studentRecord?.full_name || profile?.full_name || 'Student'}
          </h1>
          <p className="portal-subtitle">
            {studentRecord?.student_number ? `Student ID ${studentRecord.student_number}` : session.user.email}
            {studentRecord?.year_level ? ` - Year ${studentRecord.year_level}` : ''}
          </p>
        </div>

        <div className="portal-side-card">
          <span>Today</span>
          {todayRecord ? (
            <div className="mt-3 flex items-center gap-3">
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

          <Card title="Class attendance">
            {classStats.length === 0 ? (
              <p className="text-[0.78rem] font-mono text-[#4A5568]">No classes linked to this student.</p>
            ) : (
              <div className="grid gap-4 lg:grid-cols-2">
                {classStats.map((classItem) => {
                  const color = getAttendanceColor(classItem.percent)

                  return (
                    <div key={classItem.id} className="rounded-lg border border-white/[0.06] bg-white/[0.025] p-4">
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <h2 className="text-sm font-bold text-white">{classItem.name}</h2>
                          <p className="mt-1 text-[0.78rem] text-[#8B9BB0]">
                            {classItem.subject}{classItem.room ? ` - ${classItem.room}` : ''}
                          </p>
                        </div>
                        <span className="font-mono text-sm" style={{ color }}>
                          {classItem.percent === null ? 'No data' : `${classItem.percent}%`}
                        </span>
                      </div>

                      <div className="mt-4 h-2 overflow-hidden rounded-full bg-[#1c2330]">
                        <div
                          className="h-full rounded-full transition-all duration-700"
                          style={{ width: `${classItem.percent || 0}%`, background: color }}
                        />
                      </div>

                      <div className="mt-3 flex items-center justify-between text-[0.72rem] font-mono text-[#8B9BB0]">
                        <span>{classItem.attended}/{classItem.total} attended</span>
                        <span>{classItem.lastStatus ? `Last: ${classItem.lastStatus}` : 'No scans yet'}</span>
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </Card>

          <Card
            title={`History (${filteredAttendance.length})`}
            action={
              <div className="flex flex-wrap gap-2">
                <select
                  className="rounded-md border border-white/[0.06] bg-[#1c2330] px-2 py-1 text-[0.75rem] font-mono text-white outline-none"
                  value={selectedClass}
                  onChange={(event) => setSelectedClass(event.target.value)}
                >
                  <option value="all">All classes</option>
                  {classes.map((classItem) => (
                    <option key={classItem.id} value={classItem.id}>{classItem.name}</option>
                  ))}
                </select>
                <select
                  className="rounded-md border border-white/[0.06] bg-[#1c2330] px-2 py-1 text-[0.75rem] font-mono text-white outline-none"
                  value={statusFilter}
                  onChange={(event) => setStatusFilter(event.target.value)}
                >
                  <option value="all">All statuses</option>
                  {STATUS_LABELS.map((status) => (
                    <option key={status} value={status}>{status}</option>
                  ))}
                </select>
              </div>
            }
          >
            {filteredAttendance.length === 0 ? (
              <p className="text-[0.78rem] font-mono text-[#4A5568]">No attendance records match this filter.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full border-collapse">
                  <thead>
                    <tr className="border-b border-white/[0.06]">
                      {['Class', 'Date', 'Time', 'Status', 'Note'].map((heading) => (
                        <th key={heading} className="px-2 pb-3 text-left text-[0.65rem] font-mono uppercase tracking-[0.12em] text-[#4A5568]">
                          {heading}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {filteredAttendance.map((record) => (
                      <tr key={record.id} className="border-b border-white/[0.03] transition-colors hover:bg-white/[0.015]">
                        <td className="px-2 py-3">
                          <span className="text-sm font-medium text-white">{record.sessions?.classes?.name || 'Unknown class'}</span>
                          <span className="ml-2 text-[0.72rem] text-[#8B9BB0]">{record.sessions?.classes?.subject}</span>
                        </td>
                        <td className="px-2 py-3 text-[0.78rem] font-mono text-[#8B9BB0]">{formatDate(record.scanned_at)}</td>
                        <td className="px-2 py-3 text-[0.78rem] font-mono text-[#8B9BB0]">{formatTime(record.scanned_at)}</td>
                        <td className="px-2 py-3"><StatusBadge status={record.status} /></td>
                        <td className="px-2 py-3 text-[0.72rem] font-mono text-[#8B9BB0]">
                          {record.flagged ? `Flagged: ${record.flag_reason || 'review needed'}` : record.manual_override ? 'Edited by staff' : 'RFID scan'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Card>
        </>
      )}
    </Layout>
  )
}
