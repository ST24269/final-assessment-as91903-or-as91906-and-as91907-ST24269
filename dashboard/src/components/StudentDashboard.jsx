import { useState, useEffect } from 'react'
import { Radio, TriangleAlert } from 'lucide-react'
import { supabase } from '../api/client'

export default function StudentDashboard({ session }) {
  const [attendance, setAttendance] = useState([])
  const [classes, setClasses] = useState([])
  const [todayStatus, setTodayStatus] = useState(null)
  const [loading, setLoading] = useState(true)
  const [selectedClass, setSelectedClass] = useState('all')

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

      const { data: enrolments } = await supabase
        .from('enrolments')
        .select('classes(id, name, subject, room)')
        .eq('student_id', sp.student_id)

      if (cancelled) return

      const classList = enrolments?.map(e => e.classes) || []
      setClasses(classList)

      const { data: records } = await supabase
        .from('attendance')
        .select(`
          *,
          sessions(started_at, classes(name, subject))
        `)
        .eq('student_id', sp.student_id)
        .order('scanned_at', { ascending: false })

      if (cancelled) return

      setAttendance(records || [])

      const today = new Date().toISOString().split('T')[0]
      const todayRecord = records?.find(r =>
        r.scanned_at?.startsWith(today)
      )
      setTodayStatus(todayRecord?.status || null)

      setLoading(false)
    }

    loadData()

    return () => { cancelled = true }
  }, [session.user.id])

  const handleSignOut = () => supabase.auth.signOut()

  // Attendance % per class
  const getClassStats = () => {
    return classes.map(c => {
      const classRecords = attendance.filter(
        r => r.sessions?.classes?.name === c.name
      )
      const present = classRecords.filter(
        r => r.status === 'present' || r.status === 'late'
      ).length
      const pct = classRecords.length
        ? Math.round((present / classRecords.length) * 100)
        : null
      return { ...c, total: classRecords.length, present, pct }
    })
  }

  const filtered = selectedClass === 'all'
    ? attendance
    : attendance.filter(r => r.sessions?.classes?.name === selectedClass)

  const statusClass = {
    present: 'status-present',
    late: 'status-late',
    absent: 'status-absent',
    excused: 'status-excused'
  }

  const todayColour = {
    present: 'var(--green)',
    late: 'var(--amber)',
    absent: 'var(--red)',
    excused: 'var(--blue)'
  }

  if (loading) return <div className="loading">loading</div>

  return (
    <div className="dashboard">
      <header className="dashboard-header">
        <div className="header-brand">
          <div className="header-brand-icon">
            <Radio size={18} strokeWidth={2.4} />
          </div>
          <h1>AttendRFID</h1>
        </div>
        <div className="header-right">
          <span className="header-email">{session.user.email}</span>
          <button className="btn-ghost" onClick={handleSignOut}>Sign out</button>
        </div>
      </header>

      <main className="dashboard-main">

        {/* Today's status */}
        <div className="card" style={{
          borderLeft: `3px solid ${todayStatus ? todayColour[todayStatus] : 'var(--border)'}`,
        }}>
          <p className="card-title">Today</p>
          {todayStatus ? (
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
              <span className={`status-badge ${statusClass[todayStatus]}`} style={{ fontSize: '0.9rem', padding: '0.3rem 0.8rem' }}>
                {todayStatus}
              </span>
              <span style={{ color: 'var(--text-muted)', fontSize: '0.9rem' }}>
                You've been marked for today
              </span>
            </div>
          ) : (
            <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem', fontFamily: 'var(--mono)' }}>
              not yet scanned today
            </p>
          )}
        </div>

        {/* Class attendance percentages */}
        <div className="card">
          <p className="card-title">Attendance by class</p>
          {getClassStats().length === 0 ? (
            <p className="empty-state">no classes found</p>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              {getClassStats().map(c => (
                <div key={c.id}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.4rem' }}>
                    <span style={{ fontSize: '0.9rem', fontWeight: 500 }}>
                      {c.name} <span style={{ color: 'var(--text-muted)', fontWeight: 400 }}>- {c.subject}</span>
                    </span>
                    <span style={{
                      fontFamily: 'var(--mono)',
                      fontSize: '0.85rem',
                      color: c.pct === null ? 'var(--text-muted)' :
                        c.pct >= 90 ? 'var(--green)' :
                        c.pct >= 75 ? 'var(--amber)' : 'var(--red)'
                    }}>
                      {c.pct === null ? '-' : `${c.pct}%`}
                    </span>
                  </div>
                  <div style={{
                    height: '4px',
                    background: 'var(--surface-2)',
                    borderRadius: '2px',
                    overflow: 'hidden'
                  }}>
                    <div style={{
                      height: '100%',
                      width: `${c.pct || 0}%`,
                      background: c.pct >= 90 ? 'var(--green)' :
                        c.pct >= 75 ? 'var(--amber)' : 'var(--red)',
                      borderRadius: '2px',
                      transition: 'width 0.6s ease'
                    }} />
                  </div>
                  <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', fontFamily: 'var(--mono)' }}>
                    {c.present}/{c.total} sessions
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Attendance history */}
        <div className="card">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.25rem' }}>
            <p className="card-title" style={{ margin: 0 }}>History</p>
            <select
              className="override-select"
              value={selectedClass}
              onChange={e => setSelectedClass(e.target.value)}
            >
              <option value="all">All classes</option>
              {classes.map(c => (
                <option key={c.id} value={c.name}>{c.name}</option>
              ))}
            </select>
          </div>

          {filtered.length === 0 ? (
            <p className="empty-state">no records</p>
          ) : (
            <table className="attendance-table">
              <thead>
                <tr>
                  <th>Class</th>
                  <th>Date</th>
                  <th>Time</th>
                  <th>Status</th>
                  <th>Note</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map(record => (
                  <tr key={record.id} className={record.flagged ? 'flagged-row' : ''}>
                    <td style={{ fontWeight: 500 }}>
                      {record.sessions?.classes?.name || '-'}
                    </td>
                    <td className="student-id">
                      {new Date(record.scanned_at).toLocaleDateString()}
                    </td>
                    <td className="student-id">
                      {new Date(record.scanned_at).toLocaleTimeString()}
                    </td>
                    <td>
                      <span className={`status-badge ${statusClass[record.status]}`}>
                        {record.status}
                      </span>
                    </td>
                    <td>
                      {record.flagged && (
                        <span className="flag-badge">
                          <TriangleAlert size={14} strokeWidth={2.2} />
                          {record.flag_reason || 'flagged'}
                        </span>
                      )}
                      {record.manual_override && !record.flagged && (
                        <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', fontFamily: 'var(--mono)' }}>
                          edited
                        </span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

      </main>
    </div>
  )
}
