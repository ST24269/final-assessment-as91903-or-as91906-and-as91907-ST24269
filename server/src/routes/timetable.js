const express = require('express')
const router = express.Router()
const supabase = require('../db/pool')
const { authenticateUser, requireRole } = require('../middleware/auth')

router.use(authenticateUser)

const timetableSelect = `
  id,
  class_id,
  student_id,
  teacher_id,
  subject,
  day_of_week,
  period_number,
  start_time,
  end_time,
  room,
  active,
  profiles(full_name, email),
  classes(id, name, subject, room, teacher_id, profiles(full_name, email))
`

const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']

function todayIsoDate() {
  return new Date().toISOString().slice(0, 10)
}

function dayOfWeekFor(date = new Date()) {
  const day = date.getDay()
  return day === 0 ? 7 : day
}

function toDateTime(dateString, timeString) {
  return new Date(`${dateString}T${timeString}`)
}

function normalizePeriod(row, attendanceByClass = new Map()) {
  const classRecord = row.classes || null
  const teacher = row.profiles || classRecord?.profiles || null
  return {
    id: row.id,
    class_id: row.class_id,
    student_id: row.student_id,
    teacher_id: row.teacher_id || classRecord?.teacher_id || null,
    day_of_week: row.day_of_week,
    period_number: row.period_number,
    day_label: DAYS[row.day_of_week % 7],
    subject: row.subject || classRecord?.subject || null,
    start_time: row.start_time,
    end_time: row.end_time,
    room: row.room || classRecord?.room || null,
    active: row.active,
    class: classRecord,
    teacher,
    attendance_status: attendanceByClass.get(row.class_id)?.status || null,
    attendance_record_id: attendanceByClass.get(row.class_id)?.id || null,
  }
}

function todayPeriods(periods, now = new Date()) {
  const currentDay = dayOfWeekFor(now)
  return periods
    .filter((period) => period.day_of_week === currentDay)
    .sort((a, b) => String(a.start_time).localeCompare(String(b.start_time)))
}

function findCurrentClass(periods) {
  const now = new Date()
  const today = todayIsoDate()

  return todayPeriods(periods, now)
    .map((period) => ({
      ...period,
      startDate: toDateTime(today, period.start_time),
      endDate: toDateTime(today, period.end_time),
    }))
    .find((period) => period.startDate <= now && period.endDate > now) || null
}

function findNextClass(periods) {
  const now = new Date()
  const today = todayIsoDate()

  const upcomingToday = todayPeriods(periods, now)
    .map((period) => ({ ...period, startDate: toDateTime(today, period.start_time) }))
    .filter((period) => period.startDate >= now)
    .sort((a, b) => a.startDate - b.startDate)

  return upcomingToday[0] || null
}

async function getLinkedStudent(profileId) {
  const { data, error } = await supabase
    .from('student_profiles')
    .select('student_id')
    .eq('profile_id', profileId)
    .maybeSingle()

  if (error) throw new Error(error.message)
  return data?.student_id || null
}

async function getStudentClassIds(studentId) {
  const { data, error } = await supabase
    .from('enrolments')
    .select('class_id')
    .eq('student_id', studentId)

  if (error) throw new Error(error.message)
  return (data || []).map((row) => row.class_id)
}

async function getAttendanceByClass(studentId, date = todayIsoDate()) {
  const start = `${date}T00:00:00.000Z`
  const end = `${date}T23:59:59.999Z`

  const { data, error } = await supabase
    .from('attendance')
    .select('id, status, session_id, sessions(class_id)')
    .eq('student_id', studentId)
    .gte('scanned_at', start)
    .lte('scanned_at', end)

  if (error) throw new Error(error.message)

  const byClass = new Map()
  for (const record of data || []) {
    const classId = record.sessions?.class_id
    if (classId && !byClass.has(classId)) byClass.set(classId, record)
  }
  return byClass
}

router.get('/me', requireRole('student'), async (req, res) => {
  try {
    const studentId = await getLinkedStudent(req.profile.id)
    if (!studentId) return res.status(403).json({ error: 'This account is not linked to a student record.' })

    const classIds = await getStudentClassIds(studentId)
    const periodQueries = []

    if (classIds.length) {
      periodQueries.push(
        supabase
          .from('timetable_periods')
          .select(timetableSelect)
          .in('class_id', classIds)
          .eq('active', true)
          .order('day_of_week')
          .order('start_time'),
      )
    }

    periodQueries.push(
      supabase
        .from('timetable_periods')
        .select(timetableSelect)
        .eq('student_id', studentId)
        .eq('active', true)
        .order('day_of_week')
        .order('start_time'),
    )

    const [periodResults, attendanceByClass] = await Promise.all([
      Promise.all(periodQueries),
      getAttendanceByClass(studentId),
    ])

    const periodError = periodResults.find((result) => result.error)?.error
    if (periodError) return res.status(500).json({ error: periodError.message })

    const rowsById = new Map()
    for (const result of periodResults) {
      for (const row of result.data || []) rowsById.set(row.id, row)
    }

    const periods = [...rowsById.values()].map((period) => normalizePeriod(period, attendanceByClass))
    res.json({
      periods,
      todayPeriods: todayPeriods(periods),
      currentClass: findCurrentClass(periods),
      nextClass: findNextClass(periods),
    })
  } catch (error) {
    res.status(500).json({ error: error.message })
  }
})

router.get('/teacher', requireRole('teacher', 'admin'), async (req, res) => {
  try {
    let query = supabase
      .from('timetable_periods')
      .select(timetableSelect)
      .eq('active', true)
      .order('day_of_week')
      .order('start_time')

    if (req.profile.role === 'teacher') {
      const { data: classes, error: classError } = await supabase
        .from('classes')
        .select('id')
        .eq('teacher_id', req.profile.id)

      if (classError) return res.status(500).json({ error: classError.message })
      const classIds = (classes || []).map((item) => item.id)
      if (!classIds.length) return res.json([])
      query = query.in('class_id', classIds)
    }

    const { data, error } = await query
    if (error) return res.status(500).json({ error: error.message })
    res.json((data || []).map((period) => normalizePeriod(period)))
  } catch (error) {
    res.status(500).json({ error: error.message })
  }
})

router.get('/admin', requireRole('admin'), async (_req, res) => {
  const { data, error } = await supabase
    .from('timetable_periods')
    .select(timetableSelect)
    .order('day_of_week')
    .order('start_time')

  if (error) return res.status(500).json({ error: error.message })
  res.json((data || []).map((period) => normalizePeriod(period)))
})

router.post('/admin', requireRole('admin'), async (req, res) => {
  const day = Number(req.body.day_of_week)
  const periodNumber = req.body.period_number === '' || req.body.period_number === null || req.body.period_number === undefined
    ? null
    : Number(req.body.period_number)
  const payload = {
    class_id: req.body.class_id,
    student_id: req.body.student_id || null,
    teacher_id: req.body.teacher_id || null,
    subject: String(req.body.subject || '').trim() || null,
    day_of_week: day,
    period_number: periodNumber,
    start_time: req.body.start_time,
    end_time: req.body.end_time,
    room: String(req.body.room || '').trim() || null,
    active: req.body.active !== false,
    updated_at: new Date().toISOString(),
  }

  if (!payload.class_id) return res.status(400).json({ error: 'Class is required.' })
  if (!Number.isInteger(day) || day < 1 || day > 7) return res.status(400).json({ error: 'Day is invalid.' })
  if (periodNumber !== null && (!Number.isInteger(periodNumber) || periodNumber < 1 || periodNumber > 20)) {
    return res.status(400).json({ error: 'Period number must be between 1 and 20.' })
  }
  if (!payload.start_time || !payload.end_time) return res.status(400).json({ error: 'Start and end times are required.' })
  if (payload.end_time <= payload.start_time) return res.status(400).json({ error: 'End time must be after start time.' })

  const query = req.body.id
    ? supabase.from('timetable_periods').update(payload).eq('id', req.body.id)
    : supabase.from('timetable_periods').insert([payload])

  const { data, error } = await query.select(timetableSelect).single()
  if (error) return res.status(500).json({ error: error.message })
  res.status(req.body.id ? 200 : 201).json(normalizePeriod(data))
})

router.delete('/admin/:id', requireRole('admin'), async (req, res) => {
  const { error } = await supabase
    .from('timetable_periods')
    .delete()
    .eq('id', req.params.id)

  if (error) return res.status(500).json({ error: error.message })
  res.json({ deleted: true })
})

router.get('/teachers', requireRole('teacher', 'admin'), async (req, res) => {
  const search = String(req.query.search || '').trim()

  let query = supabase
    .from('profiles')
    .select('id, full_name, email')
    .eq('role', 'teacher')
    .order('full_name')

  if (search) {
    query = query.ilike('full_name', `%${search}%`)
  }

  const { data, error } = await query
  if (error) return res.status(500).json({ error: error.message })
  res.json(data || [])
})

router.get('/of/:teacherId', requireRole('teacher', 'admin'), async (req, res) => {
  try {
    const { data: classes, error: classError } = await supabase
      .from('classes')
      .select('id')
      .eq('teacher_id', req.params.teacherId)

    if (classError) return res.status(500).json({ error: classError.message })

    const classIds = (classes || []).map((item) => item.id)
    if (!classIds.length) return res.json([])

    const { data, error } = await supabase
      .from('timetable_periods')
      .select(timetableSelect)
      .in('class_id', classIds)
      .eq('active', true)
      .order('day_of_week')
      .order('start_time')

    if (error) return res.status(500).json({ error: error.message })
    res.json((data || []).map((period) => normalizePeriod(period)))
  } catch (error) {
    res.status(500).json({ error: error.message })
  }
})

module.exports = router