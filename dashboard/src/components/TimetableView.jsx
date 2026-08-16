import { useMemo, useState } from 'react'
import { CalendarDays, Clock3, MapPin, Play, UserRound } from 'lucide-react'

const DAYS = [
  { value: 1, short: 'Mon', label: 'Monday' },
  { value: 2, short: 'Tue', label: 'Tuesday' },
  { value: 3, short: 'Wed', label: 'Wednesday' },
  { value: 4, short: 'Thu', label: 'Thursday' },
  { value: 5, short: 'Fri', label: 'Friday' },
]

function dayOfWeekFor(date = new Date()) {
  const day = date.getDay()
  return day === 0 ? 7 : day
}

function dayLabel(value) {
  return DAYS.find((day) => day.value === Number(value))?.label || 'Day'
}

function timeLabel(value) {
  return value ? String(value).slice(0, 5) : '--:--'
}

function periodDate(timeString) {
  if (!timeString) return null
  const [hour = '0', minute = '0', second = '0'] = String(timeString).split(':')
  const now = new Date()
  return new Date(
    now.getFullYear(),
    now.getMonth(),
    now.getDate(),
    Number(hour),
    Number(minute),
    Number(second),
  )
}

function periodClassLabel(period) {
  return period?.class?.name || period?.subject || 'Class'
}

function periodSubject(period) {
  return period?.subject || period?.class?.subject || 'Subject not set'
}

function periodTeacher(period) {
  return period?.teacher?.full_name || period?.class?.profiles?.full_name || 'Teacher not assigned'
}

function periodRoom(period) {
  return period?.room || period?.class?.room || ''
}

function sortPeriods(periods) {
  return [...periods].sort((a, b) => (
    Number(a.day_of_week) - Number(b.day_of_week)
    || String(a.start_time).localeCompare(String(b.start_time))
  ))
}

function StartClassButton({ period, onStartClass, starting }) {
  if (!onStartClass || !period?.class_id) return null

  return (
    <button
      type="button"
      className="timetable-start-btn"
      onClick={(event) => {
        event.stopPropagation()
        onStartClass(period)
      }}
      disabled={starting}
    >
      <Play size={13} strokeWidth={2.4} />
      {starting ? 'Starting...' : 'Start session'}
    </button>
  )
}

function FocusCard({ label, period, onStartClass, startingId }) {
  return (
    <div className="timetable-focus-card">
      <span>{label}</span>
      {period ? (
        <>
          <strong>{periodClassLabel(period)}</strong>
          <p>{periodSubject(period)}</p>
          <p>
            <Clock3 size={14} strokeWidth={2.2} />
            {dayLabel(period.day_of_week)} {timeLabel(period.start_time)}-{timeLabel(period.end_time)}
          </p>
          <p>
            <MapPin size={14} strokeWidth={2.2} />
            {periodRoom(period) || 'Room not set'}
          </p>
          <p>
            <UserRound size={14} strokeWidth={2.2} />
            {periodTeacher(period)}
          </p>
          <StartClassButton period={period} onStartClass={onStartClass} starting={startingId === period.id} />
        </>
      ) : (
        <strong>No class scheduled</strong>
      )}
    </div>
  )
}

export default function TimetableView({
  periods = [],
  todayPeriods = [],
  currentClass = null,
  nextClass = null,
  title = 'Timetable',
  subtitle = 'Weekly class schedule',
  emptyMessage = 'No timetable periods yet.',
  onStartClass = null,
}) {
  const [selectedDay, setSelectedDay] = useState(dayOfWeekFor())
  const [startingId, setStartingId] = useState(null)
  const sortedPeriods = useMemo(() => sortPeriods(Array.isArray(periods) ? periods : []), [periods])

  const dayCounts = useMemo(() => {
    const counts = new Map(DAYS.map((day) => [day.value, 0]))
    for (const period of sortedPeriods) {
      counts.set(Number(period.day_of_week), (counts.get(Number(period.day_of_week)) || 0) + 1)
    }
    return counts
  }, [sortedPeriods])

  const todaysSchedule = useMemo(() => {
    const provided = Array.isArray(todayPeriods) && todayPeriods.length
      ? todayPeriods
      : sortedPeriods.filter((period) => Number(period.day_of_week) === dayOfWeekFor())
    return sortPeriods(provided)
  }, [sortedPeriods, todayPeriods])

  const focusPeriods = useMemo(() => {
    const now = new Date()
    const enriched = todaysSchedule.map((period) => ({
      ...period,
      startDate: periodDate(period.start_time),
      endDate: periodDate(period.end_time),
    }))

    const current = enriched.find((period) => period.startDate && period.endDate && period.startDate <= now && period.endDate > now) || currentClass
    const next = enriched.find((period) => period.startDate && period.startDate > now) || nextClass
    return { current, next }
  }, [currentClass, nextClass, todaysSchedule])

  const selectedPeriods = useMemo(() => (
    sortedPeriods.filter((period) => Number(period.day_of_week) === Number(selectedDay))
  ), [selectedDay, sortedPeriods])

  async function handleStartClass(period) {
    if (!onStartClass) return
    setStartingId(period.id)
    try {
      await onStartClass(period)
    } finally {
      setStartingId(null)
    }
  }

  return (
    <section className="portal-section timetable-view">
      <div className="portal-section-header">
        <div>
          <p>{title}</p>
          <h2 className="student-section-title">{subtitle}</h2>
        </div>
        <span className="student-email-count">{selectedPeriods.length} periods on {dayLabel(selectedDay)}</span>
      </div>

      {sortedPeriods.length === 0 ? (
        <div className="portal-empty">
          <strong>{emptyMessage}</strong>
          <span>Scheduled periods appear here after they are added in timetable management.</span>
        </div>
      ) : (
        <>
          <div className="timetable-focus-grid">
            <FocusCard label="Current class" period={focusPeriods.current} onStartClass={onStartClass ? handleStartClass : null} startingId={startingId} />
            <FocusCard label="Next class" period={focusPeriods.next} onStartClass={onStartClass ? handleStartClass : null} startingId={startingId} />
          </div>

          <div className="timetable-day-tabs" role="tablist" aria-label="Timetable days">
            {DAYS.map((day) => (
              <button
                key={day.value}
                type="button"
                className={Number(selectedDay) === day.value ? 'is-active' : ''}
                onClick={() => setSelectedDay(day.value)}
              >
                <span>{day.short}</span>
                <strong>{dayCounts.get(day.value) || 0}</strong>
              </button>
            ))}
          </div>

          <div className="student-timetable-list">
            {selectedPeriods.length === 0 ? (
              <div className="portal-empty">
                <strong>No classes on {dayLabel(selectedDay)}.</strong>
                <span>{emptyMessage}</span>
              </div>
            ) : (
              selectedPeriods.map((period) => {
                const isCurrent = Number(selectedDay) === dayOfWeekFor() && focusPeriods.current?.id === period.id
                const isNext = Number(selectedDay) === dayOfWeekFor() && focusPeriods.next?.id === period.id
                return (
                  <div
                    key={period.id}
                    className={`student-timetable-row timetable-period-row ${isCurrent ? 'is-current' : ''} ${isNext ? 'is-next' : ''}`}
                  >
                    <strong>
                      <Clock3 size={15} strokeWidth={2.2} />
                      {timeLabel(period.start_time)}-{timeLabel(period.end_time)}
                    </strong>
                    <span>
                      <CalendarDays size={14} strokeWidth={2.2} />
                      {periodClassLabel(period)} - {periodSubject(period)}
                    </span>
                    <span>
                      <MapPin size={14} strokeWidth={2.2} />
                      {periodRoom(period) || 'Room not set'}
                    </span>
                    <span>
                      <UserRound size={14} strokeWidth={2.2} />
                      {periodTeacher(period)}
                    </span>
                    {isCurrent && <span className="timetable-now-tag">Now</span>}
                    <StartClassButton period={period} onStartClass={onStartClass ? handleStartClass : null} starting={startingId === period.id} />
                  </div>
                )
              })
            )}
          </div>
        </>
      )}
    </section>
  )
}