const express = require('express')
const router = express.Router()
const supabase = require('../db/pool')
const { authenticateUser, requireRole } = require('../middleware/auth')

const normalizeCardUid = (uid) => String(uid).trim().toUpperCase()

async function getSessionAccess(req, sessionId) {
  const { data: session, error } = await supabase
    .from('sessions')
    .select('id, teacher_id')
    .eq('id', sessionId)
    .single()

  if (error || !session) {
    return { allowed: false, status: 404, error: 'Session not found' }
  }

  if (req.profile.role === 'admin' || req.profile.role === 'teacher') {
    return { allowed: true, session }
  }

  return { allowed: false, status: 403, error: 'Only staff can access attendance sessions' }
}

// Called by ESP32 when a card is tapped. This route is hardware-authenticated by reader API key.
router.post('/scan', async (req, res) => {
  const { rfid_card_uid, reader_api_key } = req.body
  const normalizedUid = rfid_card_uid ? normalizeCardUid(rfid_card_uid) : ''
  const readerApiKey = reader_api_key ? String(reader_api_key).trim() : ''

  if (!normalizedUid || !readerApiKey) {
    return res.status(400).json({ error: 'rfid_card_uid and reader_api_key are required' })
  }

  const { data: reader, error: readerError } = await supabase
    .from('readers')
    .select('*')
    .eq('api_key', readerApiKey)
    .eq('active', true)
    .maybeSingle()

  if (readerError || !reader) {
    return res.status(401).json({ error: 'Invalid or inactive reader' })
  }

  if (!reader.room) {
    return res.status(409).json({ error: 'Reader is not assigned to a room' })
  }

  await supabase
    .from('readers')
    .update({ last_seen: new Date().toISOString() })
    .eq('id', reader.id)

  const { data: student, error: studentError } = await supabase
    .from('students')
    .select('*')
    .eq('rfid_card_uid', normalizedUid)
    .maybeSingle()

  if (studentError || !student) {
    return res.status(404).json({ error: 'Card not registered to any student' })
  }

  const { data: activeSession, error: sessionError } = await supabase
    .from('sessions')
    .select('*, classes!inner(id, name, room)')
    .eq('classes.room', reader.room)
    .is('ended_at', null)
    .order('started_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (sessionError || !activeSession) {
    return res.status(404).json({ error: 'No active session for this room' })
  }

  const { data: enrolment, error: enrolmentError } = await supabase
    .from('enrolments')
    .select('id')
    .eq('class_id', activeSession.class_id)
    .eq('student_id', student.id)
    .maybeSingle()

  if (enrolmentError || !enrolment) {
    return res.status(409).json({
      error: 'Student is not enrolled in the active class',
      student: student.full_name,
    })
  }

  const { data: existing } = await supabase
    .from('attendance')
    .select('*')
    .eq('session_id', activeSession.id)
    .eq('student_id', student.id)
    .maybeSingle()

  if (existing) {
    const firstScan = new Date(existing.scanned_at)
    const now = new Date()
    const secondsSince = (now - firstScan) / 1000

    if (secondsSince < 30) {
      await supabase
        .from('attendance')
        .update({
          flagged: true,
          flag_reason: `Scanned twice within ${Math.round(secondsSince)}s`,
        })
        .eq('id', existing.id)

      return res.status(409).json({
        error: 'Duplicate scan flagged',
        student: student.full_name,
        flagged: true,
      })
    }

    return res.status(409).json({
      error: 'Student already marked present',
      student: student.full_name,
    })
  }

  const sessionStart = new Date(activeSession.started_at)
  const minutesLate = (new Date() - sessionStart) / 60000
  const status = minutesLate > 10 ? 'late' : 'present'

  const { data: record, error: recordError } = await supabase
    .from('attendance')
    .insert([{
      session_id: activeSession.id,
      student_id: student.id,
      status,
      flagged: false,
    }])
    .select()
    .single()

  if (recordError) {
    return res.status(500).json({ error: recordError.message })
  }

  res.status(201).json({
    success: true,
    student: student.full_name,
    status,
    scanned_at: record.scanned_at,
  })
})

router.use(authenticateUser)

router.get('/session/:session_id', requireRole('teacher', 'admin'), async (req, res) => {
  const access = await getSessionAccess(req, req.params.session_id)

  if (!access.allowed) {
    return res.status(access.status).json({ error: access.error })
  }

  const { data, error } = await supabase
    .from('attendance')
    .select(`
      *,
      students(full_name, student_number, year_level)
    `)
    .eq('session_id', req.params.session_id)
    .order('scanned_at')

  if (error) return res.status(500).json({ error: error.message })
  res.json(data)
})

router.get('/:id', requireRole('teacher', 'admin'), async (req, res) => {
  const { data: existing, error: existingError } = await supabase
    .from('attendance')
    .select('id, session_id')
    .eq('id', req.params.id)
    .single()

  if (existingError || !existing) {
    return res.status(404).json({ error: 'Attendance record not found' })
  }

  const access = await getSessionAccess(req, existing.session_id)

  if (!access.allowed) {
    return res.status(access.status).json({ error: access.error })
  }

  const { data, error } = await supabase
    .from('attendance')
    .select(`
      *,
      students(full_name, student_number, year_level)
    `)
    .eq('id', req.params.id)
    .single()

  if (error) return res.status(500).json({ error: error.message })
  res.json(data)
})

router.patch('/:id', requireRole('teacher', 'admin'), async (req, res) => {
  const { status } = req.body

  if (!['present', 'late', 'absent', 'excused'].includes(status)) {
    return res.status(400).json({ error: 'Invalid status' })
  }

  const { data: existing, error: existingError } = await supabase
    .from('attendance')
    .select('id, session_id')
    .eq('id', req.params.id)
    .single()

  if (existingError || !existing) {
    return res.status(404).json({ error: 'Attendance record not found' })
  }

  const access = await getSessionAccess(req, existing.session_id)

  if (!access.allowed) {
    return res.status(access.status).json({ error: access.error })
  }

  const { data, error } = await supabase
    .from('attendance')
    .update({ status, manual_override: true })
    .eq('id', req.params.id)
    .select()
    .single()

  if (error) return res.status(500).json({ error: error.message })
  res.json(data)
})

module.exports = router
