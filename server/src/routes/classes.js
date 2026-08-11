const express = require('express')
const router = express.Router()
const supabase = require('../db/pool')
const { authenticateUser, requireRole } = require('../middleware/auth')

const classSelect = '*, profiles(full_name)'

// Same shape as summarizeAttendance in routes/students.js - kept as a
// small local copy rather than a shared import so this route doesn't
// reach into students.js's private module scope for one helper.
function summarizeAttendance(records) {
  const counted = records.filter((record) => record.status !== 'excused')
  const attended = counted.filter((record) => record.status === 'present' || record.status === 'late')

  return {
    total: records.length,
    counted: counted.length,
    present: records.filter((record) => record.status === 'present').length,
    late: records.filter((record) => record.status === 'late').length,
    absent: records.filter((record) => record.status === 'absent').length,
    percentage: counted.length ? Math.round((attended.length / counted.length) * 100) : null,
    last_scan: records[0]?.scanned_at || null,
  }
}

router.use(authenticateUser)

// GET /api/classes - list all classes (any authenticated role can read;
// tighten to requireRole('admin') if this should be admin-only)
router.get('/', async (_req, res) => {
  const { data, error } = await supabase
    .from('classes')
    .select(classSelect)
    .order('name')

  if (error) return res.status(500).json({ error: error.message })
  res.json(data || [])
})

// POST /api/classes - create a class (admin only)
router.post('/', requireRole('admin'), async (req, res) => {
  const name = String(req.body.name || '').trim()
  const subject = String(req.body.subject || '').trim()
  const room = String(req.body.room || '').trim() || null
  const teacherId = req.body.teacher_id || null

  if (!name || !subject) {
    return res.status(400).json({ error: 'Name and subject required' })
  }

  const { data, error } = await supabase
    .from('classes')
    .insert([{ name, subject, room, teacher_id: teacherId }])
    .select(classSelect)
    .single()

  if (error) return res.status(500).json({ error: error.message })
  res.status(201).json(data)
})

// PATCH /api/classes/:id - update a class (admin only)
router.patch('/:id', requireRole('admin'), async (req, res) => {
  const payload = {}
  if (req.body.name !== undefined) payload.name = String(req.body.name).trim()
  if (req.body.subject !== undefined) payload.subject = String(req.body.subject).trim()
  if (req.body.room !== undefined) payload.room = String(req.body.room).trim() || null
  if (req.body.teacher_id !== undefined) payload.teacher_id = req.body.teacher_id || null

  if (payload.name === '') return res.status(400).json({ error: 'Name cannot be empty' })
  if (payload.subject === '') return res.status(400).json({ error: 'Subject cannot be empty' })

  const { data, error } = await supabase
    .from('classes')
    .update(payload)
    .eq('id', req.params.id)
    .select(classSelect)
    .single()

  if (error) return res.status(500).json({ error: error.message })
  res.json(data)
})

// DELETE /api/classes/:id - delete a class (admin only)
router.delete('/:id', requireRole('admin'), async (req, res) => {
  const { error } = await supabase
    .from('classes')
    .delete()
    .eq('id', req.params.id)

  if (error) return res.status(500).json({ error: error.message })
  res.json({ deleted: true })
})

// GET /api/classes/:id/analytics - attendance stats for one class: overall
// rate, per-student breakdown, per-day breakdown for a chart, and session
// count. Any teacher/admin can pull this up (same access level as GET
// /api/classes) so a teacher can look at their own classes as well as
// search another class's numbers, e.g. when covering or checking on a
// colleague's roll.
// Optional query params: ?from=YYYY-MM-DD&to=YYYY-MM-DD - defaults to the
// last 30 days if not given.
router.get('/:id/analytics', async (req, res) => {
  const classId = req.params.id

  const toDate = req.query.to ? new Date(`${req.query.to}T23:59:59.999Z`) : new Date()
  const fromDate = req.query.from
    ? new Date(`${req.query.from}T00:00:00.000Z`)
    : new Date(toDate.getTime() - 29 * 24 * 60 * 60 * 1000)

  if (Number.isNaN(toDate.getTime()) || Number.isNaN(fromDate.getTime())) {
    return res.status(400).json({ error: 'Invalid from/to date' })
  }

  const { data: classRow, error: classError } = await supabase
    .from('classes')
    .select(classSelect)
    .eq('id', classId)
    .maybeSingle()

  if (classError) return res.status(500).json({ error: classError.message })
  if (!classRow) return res.status(404).json({ error: 'Class not found' })

  const { data: enrolments, error: enrolmentsError } = await supabase
    .from('enrolments')
    .select('students(id, full_name, student_number, year_level, photo_url)')
    .eq('class_id', classId)

  if (enrolmentsError) return res.status(500).json({ error: enrolmentsError.message })

  const { data: sessionRows, error: sessionsError } = await supabase
    .from('sessions')
    .select('id, started_at, ended_at')
    .eq('class_id', classId)
    .gte('started_at', fromDate.toISOString())
    .lte('started_at', toDate.toISOString())
    .order('started_at', { ascending: true })

  if (sessionsError) return res.status(500).json({ error: sessionsError.message })

  const sessionIds = (sessionRows || []).map((session) => session.id)
  // Which calendar day (YYYY-MM-DD) each session falls on, for the
  // per-day chart below.
  const dayBySessionId = new Map(
    (sessionRows || []).map((session) => [session.id, new Date(session.started_at).toISOString().slice(0, 10)]),
  )

  const { data: attendanceRows, error: attendanceError } = sessionIds.length
    ? await supabase
      .from('attendance')
      .select('student_id, session_id, status, scanned_at')
      .in('session_id', sessionIds)
    : { data: [], error: null }

  if (attendanceError) return res.status(500).json({ error: attendanceError.message })

  const attendanceByStudent = new Map()
  const attendanceByDay = new Map()

  for (const record of attendanceRows || []) {
    if (!attendanceByStudent.has(record.student_id)) attendanceByStudent.set(record.student_id, [])
    attendanceByStudent.get(record.student_id).push(record)

    const day = dayBySessionId.get(record.session_id)
    if (day) {
      if (!attendanceByDay.has(day)) attendanceByDay.set(day, [])
      attendanceByDay.get(day).push(record)
    }
  }

  const students = (enrolments || [])
    .map((row) => row.students)
    .filter(Boolean)
    .map((student) => ({
      ...student,
      attendance_summary: summarizeAttendance(attendanceByStudent.get(student.id) || []),
    }))
    .sort((a, b) => (a.attendance_summary.percentage ?? -1) - (b.attendance_summary.percentage ?? -1))

  // One entry per calendar day that had a session in range, even if it
  // had zero attendance records, so the chart shows a real 0% bar rather
  // than silently skipping the day.
  const daily = [...new Set(dayBySessionId.values())]
    .sort()
    .map((day) => ({ date: day, ...summarizeAttendance(attendanceByDay.get(day) || []) }))

  res.json({
    class: classRow,
    from: fromDate.toISOString().slice(0, 10),
    to: toDate.toISOString().slice(0, 10),
    total_sessions: sessionRows?.length || 0,
    summary: summarizeAttendance(attendanceRows || []),
    daily,
    students,
  })
})

module.exports = router