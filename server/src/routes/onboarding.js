const express = require('express')
const router = express.Router()
const supabase = require('../db/pool')
const { authenticateUser, requireRole } = require('../middleware/auth')
const { sendEmail } = require('../utils/email')
const { fetchStudentTimetable } = require('../utils/icsParser')

// All onboarding routes require an authenticated admin.
// (The one exception, /scan, lives in attendance.js since it's the
// hardware-authenticated route the reader already calls.)
router.use(authenticateUser, requireRole('admin'))

// ---------------------------------------------------------------------
// POST /api/onboarding/import-roster
// Body: { rows: [{ firstName, lastName, age, yearLevel, kainga,
//                   stNumber, guardianEmail, icsUrl }, ...] }
// Upserts students as onboarding_status='pending' and pulls each
// student's individual timetable feed.
// ---------------------------------------------------------------------
router.post('/import-roster', async (req, res) => {
  const { rows } = req.body

  if (!Array.isArray(rows) || rows.length === 0) {
    return res.status(400).json({ error: 'rows (array) is required' })
  }

  const results = []

  for (const row of rows) {
    const fullName = `${(row.firstName || '').trim()} ${(row.lastName || '').trim()}`.trim()
    const stNumber = (row.stNumber || '').trim()

    if (!fullName || !stNumber) {
      results.push({ row, status: 'failed', error: 'firstName, lastName and stNumber are required' })
      continue
    }

    try {
      const { data: student, error: upsertError } = await supabase
        .from('students')
        .upsert(
          {
            full_name: fullName,
            student_number: stNumber,
            age: row.age ? Number(row.age) : null,
            year_level: row.yearLevel || null,
            kainga: row.kainga || null,
            guardian_email: row.guardianEmail || null,
            ics_url: row.icsUrl || null,
            onboarding_status: 'pending',
          },
          { onConflict: 'student_number' }
        )
        .select()
        .single()

      if (upsertError) throw upsertError

      let timetableCount = 0
      if (row.icsUrl) {
        timetableCount = await importStudentTimetable(student.id, row.icsUrl)
      }

      results.push({ row, status: 'success', studentId: student.id, timetableSlots: timetableCount })
    } catch (error) {
      results.push({ row, status: 'failed', error: error.message })
    }
  }

  const successCount = results.filter((r) => r.status === 'success').length

  res.json({
    success: true,
    processed: rows.length,
    success_count: successCount,
    fail_count: rows.length - successCount,
    results,
  })
})

// Pulls (or re-pulls) one student's ICS feed and replaces their timetable_slots.
async function importStudentTimetable(studentId, icsUrl) {
  const slots = await fetchStudentTimetable(icsUrl)

  // Clear old slots for this student before inserting fresh ones
  await supabase.from('timetable_slots').delete().eq('student_id', studentId)

  if (slots.length === 0) return 0

  // Make sure every subject exists, get a subject_id map
  const subjectNames = [...new Set(slots.map((s) => s.subject_name))]
  const subjectIdByName = {}

  for (const name of subjectNames) {
    const { data: subject, error } = await supabase
      .from('subjects')
      .upsert({ name }, { onConflict: 'name' })
      .select()
      .single()
    if (!error && subject) subjectIdByName[name] = subject.id
  }

  const rows = slots.map((slot) => ({
    student_id: studentId,
    subject_id: subjectIdByName[slot.subject_name] || null,
    subject_name: slot.subject_name,
    day_of_week: slot.day_of_week,
    start_time: slot.start_time,
    end_time: slot.end_time,
    room: slot.room,
    teacher_name: slot.teacher_name,
  }))

  const { error: insertError } = await supabase.from('timetable_slots').insert(rows)
  if (insertError) throw insertError

  return rows.length
}

// ---------------------------------------------------------------------
// GET /api/onboarding/roster?status=pending
// ---------------------------------------------------------------------
router.get('/roster', async (req, res) => {
  const status = req.query.status || 'pending'

  const { data, error } = await supabase
    .from('students')
    .select('*')
    .eq('onboarding_status', status)
    .order('full_name')

  if (error) return res.status(500).json({ error: error.message })
  res.json(data)
})

// GET /api/onboarding/roster/:studentId/timetable
router.get('/roster/:studentId/timetable', async (req, res) => {
  const { data, error } = await supabase
    .from('timetable_slots')
    .select('*')
    .eq('student_id', req.params.studentId)
    .order('day_of_week')
    .order('start_time')

  if (error) return res.status(500).json({ error: error.message })
  res.json(data)
})

// ---------------------------------------------------------------------
// POST /api/onboarding/start-assignment
// Body: { studentId, readerId }
// Opens a 2-minute window: the next tap on this reader binds the card
// to this student. attendance.js's /scan route checks for this before
// treating a tap as a normal attendance scan.
// ---------------------------------------------------------------------
router.post('/start-assignment', async (req, res) => {
  const { studentId, readerId } = req.body

  if (!studentId || !readerId) {
    return res.status(400).json({ error: 'studentId and readerId are required' })
  }

  const { data: student, error: studentError } = await supabase
    .from('students')
    .select('id, full_name, onboarding_status')
    .eq('id', studentId)
    .single()

  if (studentError || !student) {
    return res.status(404).json({ error: 'Student not found' })
  }

  // Clear out any stale/expired window on this reader first
  await supabase
    .from('onboarding_sessions')
    .update({ status: 'expired' })
    .eq('reader_id', readerId)
    .eq('status', 'awaiting_scan')

  const { data: session, error: sessionError } = await supabase
    .from('onboarding_sessions')
    .insert([{
      student_id: studentId,
      reader_id: readerId,
      admin_user_id: req.profile.id,
      status: 'awaiting_scan',
    }])
    .select()
    .single()

  if (sessionError) return res.status(500).json({ error: sessionError.message })

  res.status(201).json({
    success: true,
    sessionId: session.id,
    studentName: student.full_name,
    expiresAt: session.expires_at,
  })
})

// GET /api/onboarding/session/:id - poll for completion from the admin UI
router.get('/session/:id', async (req, res) => {
  const { data, error } = await supabase
    .from('onboarding_sessions')
    .select('*, students(full_name, student_number)')
    .eq('id', req.params.id)
    .single()

  if (error || !data) return res.status(404).json({ error: 'Session not found' })
  res.json(data)
})

// DELETE /api/onboarding/session/:id - admin cancels the assignment window
router.delete('/session/:id', async (req, res) => {
  const { error } = await supabase
    .from('onboarding_sessions')
    .update({ status: 'cancelled' })
    .eq('id', req.params.id)
    .eq('status', 'awaiting_scan')

  if (error) return res.status(500).json({ error: error.message })
  res.json({ success: true })
})

module.exports = router
module.exports.importStudentTimetable = importStudentTimetable