import { useState, useEffect } from 'react'
import { supabase } from '../api/client'
import TagoLogo from '../components/TagoLogo'
import TodayStatusCard from '../components/student/TodayStatusCard'
import ClassAttendanceStats from '../components/student/ClassAttendanceStats'
import AttendanceHistoryTable from '../components/student/AttendanceHistoryTable'

export default function StudentPage({ session }) {
  const [attendance, setAttendance] = useState([])
  const [classes, setClasses] = useState([])
  const [todayStatus, setTodayStatus] = useState(null)
  const [loading, setLoading] = useState(true)

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

      const classList = enrolments?.map((e) => e.classes) || []
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
      const todayRecord = records?.find((r) => r.scanned_at?.startsWith(today))
      setTodayStatus(todayRecord?.status || null)

      setLoading(false)
    }

    loadData()

    return () => { cancelled = true }
  }, [session.user.id])

  const handleSignOut = () => supabase.auth.signOut()

  if (loading) return <div className="loading">loading</div>

  return (
    <div className="dashboard">
      <header className="dashboard-header">
        <div className="header-brand">
          <TagoLogo showWord size={18} markClassName="header-brand-icon" />
        </div>
        <div className="header-right">
          <span className="header-email">{session.user.email}</span>
          <button className="btn-ghost" onClick={handleSignOut}>Sign out</button>
        </div>
      </header>

      <main className="dashboard-main">
        <TodayStatusCard todayStatus={todayStatus} />
        <ClassAttendanceStats classes={classes} attendance={attendance} />
        <AttendanceHistoryTable attendance={attendance} classes={classes} />
      </main>
    </div>
  )
}