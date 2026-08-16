import { useMemo } from 'react'
import { Flame, TrendingUp, TrendingDown } from 'lucide-react'
import AttendanceLineChart from '../teacher/AttendanceLineChart'

function toDayKey(value) {
  return value ? new Date(value).toISOString().slice(0, 10) : null
}

function buildDailySeries(attendance, days) {
  const byDay = new Map()

  attendance.forEach((record) => {
    const key = toDayKey(record.scanned_at)
    if (!key) return
    if (!byDay.has(key)) byDay.set(key, { present: 0, late: 0, absent: 0, excused: 0 })
    const bucket = byDay.get(key)
    if (bucket[record.status] !== undefined) bucket[record.status] += 1
  })

  const series = []
  const today = new Date()

  for (let i = days - 1; i >= 0; i -= 1) {
    const date = new Date(today)
    date.setDate(date.getDate() - i)
    const key = date.toISOString().slice(0, 10)
    const bucket = byDay.get(key)
    const counted = bucket ? bucket.present + bucket.late + bucket.absent : 0

    series.push({
      date: key,
      present: bucket?.present || 0,
      late: bucket?.late || 0,
      absent: bucket?.absent || 0,
      percentage: counted ? Math.round(((bucket.present + bucket.late) / counted) * 100) : null,
    })
  }

  return series
}

function computeStreak(attendance) {
  const sorted = [...attendance]
    .filter((record) => record.scanned_at)
    .sort((a, b) => new Date(b.scanned_at) - new Date(a.scanned_at))

  let streak = 0
  for (const record of sorted) {
    if (record.status === 'present' || record.status === 'late') {
      streak += 1
    } else if (record.status === 'absent') {
      break
    }
  }
  return streak
}

function compareRecentWeeks(attendance) {
  const now = Date.now()
  const week = 7 * 24 * 60 * 60 * 1000
  const inRange = (record, start, end) => {
    if (!record.scanned_at) return false
    const time = new Date(record.scanned_at).getTime()
    return time > start && time <= end
  }

  const thisWeek = attendance.filter((record) => inRange(record, now - week, now))
  const lastWeek = attendance.filter((record) => inRange(record, now - (week * 2), now - week))

  const pctFor = (records) => {
    const counted = records.filter((record) => record.status !== 'excused')
    if (!counted.length) return null
    const attended = counted.filter((record) => record.status === 'present' || record.status === 'late')
    return Math.round((attended.length / counted.length) * 100)
  }

  return { thisWeek: pctFor(thisWeek), lastWeek: pctFor(lastWeek) }
}

function bestAndWorstClass(classes, attendance) {
  const stats = classes.map((classItem) => {
    const records = attendance.filter((record) => record.sessions?.classes?.name === classItem.name)
    const counted = records.filter((record) => record.status !== 'excused')
    const attended = counted.filter((record) => record.status === 'present' || record.status === 'late')
    return {
      name: classItem.name,
      pct: counted.length ? Math.round((attended.length / counted.length) * 100) : null,
    }
  }).filter((item) => item.pct !== null)

  if (!stats.length) return { best: null, worst: null }

  const sorted = [...stats].sort((a, b) => b.pct - a.pct)
  return { best: sorted[0], worst: sorted[sorted.length - 1] }
}

export default function StudentAnalytics({ attendance, classes }) {
  const dailySeries = useMemo(() => buildDailySeries(attendance, 14), [attendance])
  const streak = useMemo(() => computeStreak(attendance), [attendance])
  const weekCompare = useMemo(() => compareRecentWeeks(attendance), [attendance])
  const { best, worst } = useMemo(() => bestAndWorstClass(classes, attendance), [classes, attendance])
  const weekDelta = weekCompare.thisWeek !== null && weekCompare.lastWeek !== null
    ? weekCompare.thisWeek - weekCompare.lastWeek
    : null

  return (
    <div className="card">
      <p className="card-title">Attendance trend</p>

      <div className="student-analytics-stats">
        <div className="student-analytics-stat">
          <span><Flame size={15} strokeWidth={2.2} /> Current streak</span>
          <strong>{streak} {streak === 1 ? 'class' : 'classes'}</strong>
        </div>
        <div className="student-analytics-stat">
          <span>
            {weekDelta === null ? null : weekDelta >= 0 ? (
              <TrendingUp size={15} strokeWidth={2.2} />
            ) : (
              <TrendingDown size={15} strokeWidth={2.2} />
            )}
            This week vs last
          </span>
          <strong>
            {weekCompare.thisWeek === null ? 'No data' : `${weekCompare.thisWeek}%`}
            {weekDelta !== null && (
              <em className={weekDelta >= 0 ? 'is-up' : 'is-down'}>
                {weekDelta >= 0 ? '+' : ''}{weekDelta}%
              </em>
            )}
          </strong>
        </div>
        <div className="student-analytics-stat">
          <span>Strongest class</span>
          <strong>{best ? `${best.name} - ${best.pct}%` : 'No data'}</strong>
        </div>
        <div className="student-analytics-stat">
          <span>Needs attention</span>
          <strong>{worst ? `${worst.name} - ${worst.pct}%` : 'No data'}</strong>
        </div>
      </div>

      <AttendanceLineChart data={dailySeries} />
    </div>
  )
}
