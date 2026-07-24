import { useEffect, useMemo, useState } from 'react'
import {
  Activity,
  CalendarDays,
  CheckCircle2,
  ListFilter,
  TriangleAlert,
  UsersRound,
} from 'lucide-react'
import { supabase } from '../../api/client'

const STATUS_LABELS = ['present', 'late', 'absent', 'excused']
const STATUS_NAMES = {
  present: 'Present',
  late: 'Late',
  absent: 'Absent',
  excused: 'Excused',
}
const STATUS_CLASSES = {
  present: 'status-present',
  late: 'status-late',
  absent: 'status-absent',
  excused: 'status-excused',
}
const TIME_RANGES = [
  { id: 'all', label: 'All time' },
  { id: 'today', label: 'Today' },
  { id: '7d', label: 'Last 7 days' },
  { id: '30d', label: 'Last 30 days' },
]

function getClass(record) {
  return record.sessions?.classes || null
}

function getClassId(record) {
  return getClass(record)?.id || 'unknown'
}

function getClassName(record) {
  return getClass(record)?.name || 'Unknown class'
}

function getStudentName(record) {
  return record.students?.full_name || 'Unknown student'
}

function formatDateTime(value) {
  return value
    ? new Date(value).toLocaleString([], {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    })
    : 'No time'
}

function formatPercent(value) {
  return value === null ? 'No data' : `${value}%`
}

function getAttendanceRate(records) {
  const counted = records.filter((record) => record.status !== 'excused')
  const attended = counted.filter((record) => record.status === 'present' || record.status === 'late')

  return {
    counted: counted.length,
    attended: attended.length,
    rate: counted.length ? Math.round((attended.length / counted.length) * 100) : null,
  }
}

function isWithinRange(value, range) {
  if (range === 'all') return true

  const scannedAt = value ? new Date(value) : null
  if (!scannedAt || Number.isNaN(scannedAt.getTime())) return false

  const now = new Date()

  if (range === 'today') {
    return scannedAt.toDateString() === now.toDateString()
  }

  const days = Number.parseInt(range, 10)
  if (!days) return true

  const earliest = new Date(now)
  earliest.setDate(now.getDate() - days)
  return scannedAt >= earliest
}

function getRateTone(rate) {
  if (rate === null) return 'muted'
  if (rate >= 90) return 'good'
  if (rate >= 75) return 'watch'
  return 'risk'
}

function StatusBadge({ status }) {
  return (
    <span className={`status-badge ${STATUS_CLASSES[status] || 'status-absent'}`}>
      {status || 'unknown'}
    </span>
  )
}

export default function AttendanceOverview() {
  const [records, setRecords] = useState([])
  const [classes, setClasses] = useState([])
  const [studentTotal, setStudentTotal] = useState(null)
  const [selectedClass, setSelectedClass] = useState('all')
  const [timeRange, setTimeRange] = useState('30d')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
const [resolvingId, setResolvingId] = useState(null)

  const resolveFlag = async (record, decision) => {
    setResolvingId(record.id)

    const { data: { user } } = await supabase.auth.getUser()

    await supabase
      .from('attendance')
      .update({ flagged: false, flag_reason: null })
      .eq('id', record.id)

    await supabase.from('audit_logs').insert({
      action: decision === 'confirmed_fraud' ? 'flag_confirmed_fraud' : 'flag_dismissed',
      actor_profile_id: user?.id || null,
      actor_email: user?.email || null,
      target_student_id: record.student_id,
      description: `Photo mismatch flag ${decision}`,
      metadata: { attendance_id: record.id, session_id: record.session_id },
    })

    setRecords((current) => current.map((item) => (
      item.id === record.id ? { ...item, flagged: false, flag_reason: null } : item
    )))
    setResolvingId(null)
  }
  useEffect(() => {
    let cancelled = false

    async function loadData() {
      setLoading(true)
      setError(null)

      try {
        const [attendanceResult, classResult, studentResult] = await Promise.all([
          supabase
            .from('attendance')
            .select(`
              id,
              session_id,
              student_id,
              scanned_at,
              status,
              flagged,
              flag_reason,
              manual_override,
              students(full_name, student_number, year_level),
              sessions(started_at, classes(id, name, subject, room))
            `)
            .order('scanned_at', { ascending: false })
            .limit(1000),
          supabase
            .from('classes')
            .select('id, name, subject, room')
            .order('name'),
          supabase
            .from('students')
            .select('id', { count: 'exact', head: true }),
        ])

        if (attendanceResult.error || classResult.error || studentResult.error) {
          throw new Error(
            attendanceResult.error?.message
              || classResult.error?.message
              || studentResult.error?.message
              || 'Could not load attendance analytics.',
          )
        }

        if (cancelled) return
setRecords(attendanceResult.data || [])
setClasses(classResult.data || [])
        setStudentTotal(studentResult.count ?? null)
      } catch (err) {
        if (!cancelled) {
          setError(err.message)
          setRecords([])
          setClasses([])
          setStudentTotal(null)
        }
      } finally {
        if (!cancelled) setLoading(false)
      }
    }

    loadData()

    return () => { cancelled = true }
  }, [])

  const classOptions = useMemo(() => {
    const byId = new Map()

    classes.forEach((classItem) => {
      byId.set(classItem.id, classItem)
    })

    records.forEach((record) => {
      const classItem = getClass(record)
      if (classItem?.id && !byId.has(classItem.id)) {
        byId.set(classItem.id, classItem)
      }
    })

    return [...byId.values()].sort((a, b) => a.name.localeCompare(b.name))
  }, [classes, records])

  const filteredRecords = useMemo(() => (
    records.filter((record) => {
      const classMatches = selectedClass === 'all' || getClassId(record) === selectedClass
      const rangeMatches = isWithinRange(record.scanned_at, timeRange)
      return classMatches && rangeMatches
    })
  ), [records, selectedClass, timeRange])

  const summary = useMemo(() => {
    const { counted, attended, rate } = getAttendanceRate(filteredRecords)
    const uniqueStudents = new Set(filteredRecords.map((record) => record.student_id).filter(Boolean))
    const uniqueClasses = new Set(filteredRecords.map((record) => getClassId(record)).filter((id) => id !== 'unknown'))

    return {
      total: filteredRecords.length,
      counted,
      attended,
      rate,
      students: uniqueStudents.size,
      classes: uniqueClasses.size,
      flagged: filteredRecords.filter((record) => record.flagged).length,
      manual: filteredRecords.filter((record) => record.manual_override).length,
    }
  }, [filteredRecords])

  const statusTotals = useMemo(() => (
    STATUS_LABELS.map((status) => {
      const count = filteredRecords.filter((record) => record.status === status).length
      return {
        status,
        label: STATUS_NAMES[status],
        count,
        percent: filteredRecords.length ? Math.round((count / filteredRecords.length) * 100) : 0,
      }
    })
  ), [filteredRecords])

  const classStats = useMemo(() => {
    const grouped = new Map()

    filteredRecords.forEach((record) => {
      const id = getClassId(record)
      const classItem = getClass(record)

      if (!grouped.has(id)) {
        grouped.set(id, {
          id,
          name: classItem?.name || 'Unknown class',
          subject: classItem?.subject || 'No subject',
          room: classItem?.room || null,
          records: [],
          students: new Set(),
        })
      }

      const group = grouped.get(id)
      group.records.push(record)
      if (record.student_id) group.students.add(record.student_id)
    })

    return [...grouped.values()]
      .map((group) => {
        const rate = getAttendanceRate(group.records)

        return {
          ...group,
          total: group.records.length,
          ...rate,
          flagged: group.records.filter((record) => record.flagged).length,
          late: group.records.filter((record) => record.status === 'late').length,
          absent: group.records.filter((record) => record.status === 'absent').length,
          studentCount: group.students.size,
        }
      })
      .sort((a, b) => b.total - a.total || a.name.localeCompare(b.name))
  }, [filteredRecords])

  const studentStats = useMemo(() => {
    const grouped = new Map()

    filteredRecords.forEach((record) => {
      const id = record.student_id || record.id

      if (!grouped.has(id)) {
        grouped.set(id, {
          id,
          name: getStudentName(record),
          number: record.students?.student_number || '-',
          records: [],
          classes: new Set(),
        })
      }

      const group = grouped.get(id)
      group.records.push(record)
      group.classes.add(getClassName(record))
    })

    return [...grouped.values()]
      .map((group) => {
        const rate = getAttendanceRate(group.records)
        const late = group.records.filter((record) => record.status === 'late').length
        const absent = group.records.filter((record) => record.status === 'absent').length
        const flagged = group.records.filter((record) => record.flagged).length
        const attentionScore = flagged * 3 + absent * 2 + late + (rate.rate === null ? 0 : Math.max(0, 100 - rate.rate) / 10)

        return {
          ...group,
          total: group.records.length,
          ...rate,
          late,
          absent,
          flagged,
          present: group.records.filter((record) => record.status === 'present').length,
          lastScan: group.records[0]?.scanned_at || null,
          attentionScore,
        }
      })
      .sort((a, b) => b.attentionScore - a.attentionScore || b.total - a.total || a.name.localeCompare(b.name))
      .slice(0, 8)
  }, [filteredRecords])

  const flaggedRecords = useMemo(() => (
    filteredRecords.filter((record) => record.flagged).slice(0, 5)
  ), [filteredRecords])

  const statCards = [
    {
      label: 'Attendance rate',
      value: formatPercent(summary.rate),
      detail: `${summary.attended}/${summary.counted} counted`,
      Icon: Activity,
    },
    {
      label: 'Records',
      value: summary.total,
      detail: `${summary.classes} classes in view`,
      Icon: CalendarDays,
    },
    {
      label: 'Students',
      value: summary.students,
      detail: studentTotal === null ? 'with records' : `${studentTotal} students total`,
      Icon: UsersRound,
    },
    {
      label: 'Flags',
      value: summary.flagged,
      detail: 'need review',
      Icon: TriangleAlert,
    },
    {
      label: 'Manual edits',
      value: summary.manual,
      detail: 'staff updates',
      Icon: CheckCircle2,
    },
  ]

  if (loading) return <div className="analytics-loading">loading</div>

  return (
    <div className="analytics-dashboard">
      <section className="analytics-toolbar">
        <div>
          <p className="card-title">Attendance analytics</p>
          <h4>Student attendance overview</h4>
          <span>Latest attendance records, class trends, student rates, and review flags.</span>
        </div>

        <div className="analytics-filter-row" aria-label="Attendance analytics filters">
          <label className="analytics-filter">
            <span>
              <ListFilter size={13} strokeWidth={2.3} />
              Range
            </span>
            <select
              className="override-select"
              value={timeRange}
              onChange={(event) => setTimeRange(event.target.value)}
            >
              {TIME_RANGES.map((range) => (
                <option key={range.id} value={range.id}>{range.label}</option>
              ))}
            </select>
          </label>

          <label className="analytics-filter">
            <span>Class</span>
            <select
              className="override-select"
              value={selectedClass}
              onChange={(event) => setSelectedClass(event.target.value)}
            >
              <option value="all">All classes</option>
              {classOptions.map((classItem) => (
                <option key={classItem.id} value={classItem.id}>{classItem.name}</option>
              ))}
            </select>
          </label>
        </div>
      </section>

      {error ? (
        <p className="error">{error}</p>
      ) : (
        <>
          <section className="analytics-stat-grid">
            {statCards.map(({ Icon, ...stat }) => (
              <div key={stat.label} className="analytics-stat">
                <span className="analytics-stat-icon">
                  <Icon size={17} strokeWidth={2.2} />
                </span>
                <p>{stat.label}</p>
                <strong>{stat.value}</strong>
                <span>{stat.detail}</span>
              </div>
            ))}
          </section>

          <div className="analytics-grid-two">
            <section className="analytics-card">
              <div className="analytics-card-header">
                <div>
                  <p className="card-title">Status mix</p>
                  <h4>Attendance outcomes</h4>
                </div>
                <span className="analytics-pill">{filteredRecords.length} records</span>
              </div>

              <div className="analytics-status-list">
                {statusTotals.map((item) => (
                  <div key={item.status} className="analytics-status-row">
                    <div className="analytics-status-label">
                      <span className={`analytics-dot analytics-dot-${item.status}`} />
                      <div>
                        <strong>{item.label}</strong>
                        <span>{item.count} records</span>
                      </div>
                    </div>
                    <div className="analytics-meter">
                      <span
                        className={`analytics-meter-fill analytics-meter-${item.status}`}
                        style={{ width: `${item.percent}%` }}
                      />
                    </div>
                    <span className="analytics-percent">{item.percent}%</span>
                  </div>
                ))}
              </div>
            </section>

            <section className="analytics-card">
              <div className="analytics-card-header">
                <div>
                  <p className="card-title">Review queue</p>
                  <h4>Flagged records</h4>
                </div>
                <span className="analytics-pill">{summary.flagged} flags</span>
              </div>

{flaggedRecords.length === 0 ? (
                <div className="portal-empty">
                  <strong>No flagged records</strong>
                  <span>There are no flagged attendance records in this view.</span>
                </div>
              ) : (
                <div className="analytics-alert-list">
                  {flaggedRecords.map((record) => (
                    <div key={record.id} className="analytics-alert-row">
                      <span className="flag-badge">
                        <TriangleAlert size={14} strokeWidth={2.2} />
                        {record.flag_reason || 'Review needed'}
                      </span>
                      <strong>{getStudentName(record)}</strong>
                      <span>{getClassName(record)} - {formatDateTime(record.scanned_at)}</span>
                      <div className="analytics-flag-actions">
                        <button
                          type="button"
                          className="btn-ghost"
                          onClick={() => resolveFlag(record, 'dismissed')}
                          disabled={resolvingId === record.id}
                        >
                          Dismiss
                        </button>
                        <button
                          type="button"
                          className="account-danger-button"
                          onClick={() => resolveFlag(record, 'confirmed_fraud')}
                          disabled={resolvingId === record.id}
                        >
                          Confirm fraud
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </section>
          </div>

          <section className="analytics-card">
            <div className="analytics-card-header">
              <div>
                <p className="card-title">Class breakdown</p>
                <h4>Attendance by class</h4>
              </div>
              <span className="analytics-pill">{classStats.length} classes</span>
            </div>

            {classStats.length === 0 ? (
              <div className="portal-empty">
                <strong>No class data</strong>
                <span>No attendance records match the selected filters.</span>
              </div>
            ) : (
              <div className="analytics-class-list">
                {classStats.map((classItem) => (
                  <div key={classItem.id} className="analytics-class-row">
                    <div className="analytics-class-main">
                      <div>
                        <strong>{classItem.name}</strong>
                        <span>
                          {classItem.subject}{classItem.room ? ` - Room ${classItem.room}` : ''}
                        </span>
                      </div>
                      <div className="analytics-meter">
                        <span
                          className={`analytics-meter-fill analytics-rate-${getRateTone(classItem.rate)}`}
                          style={{ width: `${classItem.rate || 0}%` }}
                        />
                      </div>
                      <small>
                        {classItem.attended}/{classItem.counted} counted - {classItem.studentCount} students - {classItem.flagged} flags
                      </small>
                    </div>
                    <strong className={`analytics-rate analytics-rate-${getRateTone(classItem.rate)}`}>
                      {formatPercent(classItem.rate)}
                    </strong>
                  </div>
                ))}
              </div>
            )}
          </section>

          <section className="analytics-card">
            <div className="analytics-card-header">
              <div>
                <p className="card-title">Student attendance</p>
                <h4>Students needing attention</h4>
              </div>
              <span className="analytics-pill">{studentStats.length} shown</span>
            </div>

            {studentStats.length === 0 ? (
              <div className="portal-empty">
                <strong>No student data</strong>
                <span>No students have attendance records in this view.</span>
              </div>
            ) : (
              <div className="analytics-table-wrap">
                <table className="attendance-table">
                  <thead>
                    <tr>
                      <th>Student</th>
                      <th>Rate</th>
                      <th>Present</th>
                      <th>Late</th>
                      <th>Absent</th>
                      <th>Flags</th>
                      <th>Last scan</th>
                    </tr>
                  </thead>
                  <tbody>
                    {studentStats.map((student) => (
                      <tr key={student.id}>
                        <td>
                          <div style={{ fontWeight: 600 }}>{student.name}</div>
                          <div className="student-id">{student.number} - {student.classes.size} classes</div>
                        </td>
                        <td>
                          <strong className={`analytics-rate analytics-rate-${getRateTone(student.rate)}`}>
                            {formatPercent(student.rate)}
                          </strong>
                        </td>
                        <td>{student.present}</td>
                        <td>{student.late}</td>
                        <td>{student.absent}</td>
                        <td>{student.flagged}</td>
                        <td className="student-id">{formatDateTime(student.lastScan)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>

          <section className="analytics-card">
            <div className="analytics-card-header">
              <div>
                <p className="card-title">Recent records</p>
                <h4>Attendance log</h4>
              </div>
              <span className="analytics-pill">{filteredRecords.length} total</span>
            </div>

            {filteredRecords.length === 0 ? (
              <div className="portal-empty">
                <strong>No records</strong>
                <span>No attendance records match the selected filters.</span>
              </div>
            ) : (
              <div className="analytics-table-wrap">
                <table className="attendance-table">
                  <thead>
                    <tr>
                      <th>Student</th>
                      <th>Class</th>
                      <th>Date</th>
                      <th>Status</th>
                      <th>Note</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredRecords.slice(0, 12).map((record) => (
                      <tr key={record.id} className={record.flagged ? 'flagged-row' : ''}>
                        <td>
                          <div style={{ fontWeight: 600 }}>{getStudentName(record)}</div>
                          <div className="student-id">{record.students?.student_number || '-'}</div>
                        </td>
                        <td className="student-id">{getClassName(record)}</td>
                        <td className="student-id">{formatDateTime(record.scanned_at)}</td>
                        <td><StatusBadge status={record.status} /></td>
                        <td>
                          {record.flagged ? (
                            <span className="flag-badge">
                              <TriangleAlert size={14} strokeWidth={2.2} />
                              {record.flag_reason || 'Review needed'}
                            </span>
                          ) : (
                            <span className="student-id">
                              {record.manual_override ? 'Manual edit' : 'RFID scan'}
                            </span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        </>
      )}
    </div>
  )
}
