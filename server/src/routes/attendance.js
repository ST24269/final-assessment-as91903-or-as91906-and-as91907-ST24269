const express = require('express')
const router = express.Router()
const supabase = require('../db/pool')
const { authenticateUser, requireRole } = require('../middleware/auth')

const normalizeCardUid = (uid) => String(uid).trim().toUpperCase()

// Helper to log scan results
async function logScan(readerId, rfidCardUid, scannedAt, result, processingTimeMs, errorMessage = null) {
  try {
    await supabase.from('scan_logs').insert([{
      reader_id: readerId,
      rfid_card_uid: rfidCardUid,
      scanned_at: scannedAt,
      result,
      processing_time_ms: processingTimeMs,
      error_message: errorMessage
    }])

    // Update reader's last_scan
    await supabase
      .from('readers')
      .update({ last_scan: scannedAt })
      .eq('id', readerId)
  } catch (error) {
    console.error('Error logging scan:', error)
  }
}

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
// Accepts optional timestamp for offline support.
router.post('/scan', async (req, res) => {
  console.log(">>> /api/attendance/scan HIT");
  const startTime = Date.now()
  const { rfid_card_uid, reader_api_key, timestamp, reader_id } = req.body
  const normalizedUid = rfid_card_uid ? normalizeCardUid(rfid_card_uid) : ''
  const readerApiKey = reader_api_key ? String(reader_api_key).trim() : ''

  if (!normalizedUid || !readerApiKey) {
    return res.status(400).json({ error: 'rfid_card_uid and reader_api_key are required' })
  }

  // Parse timestamp - use provided or current time
let scannedAt = new Date()

if (timestamp) {
  const parsed = new Date(timestamp)

  if (!isNaN(parsed.getTime())) {
    scannedAt = parsed
  }
}
  // Validate reader
  const { data: reader, error: readerError } = await supabase
    .from('readers')
    .select('*')
    .eq('api_key', readerApiKey)
    .eq('active', true)
    .maybeSingle()

  if (readerError || !reader) {
    await logScan(null, normalizedUid, scannedAt, 'reader_inactive', Date.now() - startTime, 'Invalid or inactive reader')
    return res.status(401).json({ error: 'Invalid or inactive reader' })
  }

  if (!reader.room) {
    await logScan(reader.id, normalizedUid, scannedAt, 'error', Date.now() - startTime, 'Reader not assigned to room')
    return res.status(409).json({ error: 'Reader is not assigned to a room' })
  }

// Update reader status
  await supabase
    .from('readers')
    .update({
      last_seen: new Date().toISOString(),
      online_status: 'online'
    })
    .eq('id', reader.id)

  // --- NEW: check for a pending onboarding assignment on this reader ---
  const { data: pendingOnboarding } = await supabase
    .from('onboarding_sessions')
    .select('*, students(*)')
    .eq('reader_id', reader.id)
    .eq('status', 'awaiting_scan')
    .gte('expires_at', new Date().toISOString())
    .maybeSingle()

  if (pendingOnboarding) {
    return handleOnboardingTap(pendingOnboarding, normalizedUid, reader, res, startTime)
  }

  // Look up student
  const { data: student, error: studentError } = await supabase
    .from('students')
    .select('*')
    .eq('rfid_card_uid', normalizedUid)
    .maybeSingle()

  if (studentError || !student) {
    await logScan(reader.id, normalizedUid, scannedAt, 'invalid_card', Date.now() - startTime, 'Card not registered')
    return res.status(404).json({ error: 'Card not registered to any student' })
  }

  // Find active session for this room
  const { data: activeSession, error: sessionError } = await supabase
    .from('sessions')
    .select('*, classes!inner(id, name, room)')
    .eq('classes.room', reader.room)
    .is('ended_at', null)
    .order('started_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (sessionError || !activeSession) {
    await logScan(reader.id, normalizedUid, scannedAt, 'no_session', Date.now() - startTime, 'No active session for room')
    return res.status(404).json({ error: 'No active session for this room' })
  }

  // Check enrolment
  const { data: enrolment, error: enrolmentError } = await supabase
    .from('enrolments')
    .select('id')
    .eq('class_id', activeSession.class_id)
    .eq('student_id', student.id)
    .maybeSingle()

  if (enrolmentError || !enrolment) {
    await logScan(reader.id, normalizedUid, scannedAt, 'not_enrolled', Date.now() - startTime, 'Student not enrolled')
    return res.status(409).json({
      error: 'Student is not enrolled in the active class',
      student: student.full_name,
    })
  }

  // Check for existing attendance
  const { data: existing } = await supabase
    .from('attendance')
    .select('*')
    .eq('session_id', activeSession.id)
    .eq('student_id', student.id)
    .maybeSingle()

  if (existing) {
    const firstScan = new Date(existing.scanned_at)
    const secondsSince = (scannedAt - firstScan) / 1000

    if (secondsSince < 30) {
      await supabase
        .from('attendance')
        .update({
          flagged: true,
          flag_reason: `Scanned twice within ${Math.round(secondsSince)}s`,
        })
        .eq('id', existing.id)

      await logScan(reader.id, normalizedUid, scannedAt, 'duplicate', Date.now() - startTime, 'Duplicate scan within 30s')
      return res.status(409).json({
        error: 'Duplicate scan flagged',
        student: student.full_name,
        flagged: true,
      })
    }

    await logScan(reader.id, normalizedUid, scannedAt, 'duplicate', Date.now() - startTime, 'Already marked present')
    return res.status(409).json({
      error: 'Student already marked present',
      student: student.full_name,
    })
  }

  // Calculate status based on session start time
  const sessionStart = new Date(activeSession.started_at)
  const minutesLate = (scannedAt - sessionStart) / 60000
  const status = minutesLate > 10 ? 'late' : 'present'

  // Create attendance record with the scan timestamp
  const { data: record, error: recordError } = await supabase
    .from('attendance')
    .insert([{
      session_id: activeSession.id,
      student_id: student.id,
      status,
      flagged: false,
      scanned_at: scannedAt.toISOString()
    }])
    .select()
    .single()

  if (recordError) {
    await logScan(reader.id, normalizedUid, scannedAt, 'error', Date.now() - startTime, recordError.message)
    return res.status(500).json({ error: recordError.message })
  }

  await logScan(reader.id, normalizedUid, scannedAt, 'success', Date.now() - startTime)

  res.status(201).json({
    success: true,
    student: student.full_name,
    status,
    scanned_at: record.scanned_at,
    processing_time_ms: Date.now() - startTime
  })
})

// POST /api/attendance/bulk-upload - Upload cached offline scans
router.post('/bulk-upload', async (req, res) => {
  const { scans, reader_id, api_key } = req.body

  if (!scans || !Array.isArray(scans) || !reader_id || !api_key) {
    return res.status(400).json({ error: 'scans (array), reader_id, and api_key are required' })
  }

  // Validate reader
  const { data: reader, error: readerError } = await supabase
    .from('readers')
    .select('*')
    .eq('id', reader_id)
    .eq('api_key', api_key)
    .eq('active', true)
    .maybeSingle()

  if (readerError || !reader) {
    return res.status(401).json({ error: 'Invalid reader credentials' })
  }

  // Update reader status
  await supabase
    .from('readers')
    .update({
      last_seen: new Date().toISOString(),
      online_status: 'online'
    })
    .eq('id', reader.id)

  const results = []
  let successCount = 0
  let failCount = 0

  for (const scan of scans) {
    const { rfid_card_uid, scanned_at } = scan
    const normalizedUid = normalizeCardUid(rfid_card_uid)
    const scanTime = new Date(scanned_at)

    try {
      // Process each scan (same logic as individual scan)
      const { data: student } = await supabase
        .from('students')
        .select('id')
        .eq('rfid_card_uid', normalizedUid)
        .maybeSingle()

      if (!student) {
        await logScan(reader.id, normalizedUid, scanTime, 'invalid_card', 0, 'Card not registered')
        results.push({ rfid_card_uid, status: 'failed', error: 'Card not registered' })
        failCount++
        continue
      }

      const { data: activeSession } = await supabase
        .from('sessions')
        .select('id, class_id, started_at')
        .eq('classes.room', reader.room)
        .is('ended_at', null)
        .order('started_at', { ascending: false })
        .limit(1)
        .maybeSingle()

      if (!activeSession) {
        await logScan(reader.id, normalizedUid, scanTime, 'no_session', 0, 'No active session')
        results.push({ rfid_card_uid, status: 'failed', error: 'No active session' })
        failCount++
        continue
      }

      const { data: enrolment } = await supabase
        .from('enrolments')
        .select('id')
        .eq('class_id', activeSession.class_id)
        .eq('student_id', student.id)
        .maybeSingle()

      if (!enrolment) {
        await logScan(reader.id, normalizedUid, scanTime, 'not_enrolled', 0, 'Not enrolled')
        results.push({ rfid_card_uid, status: 'failed', error: 'Not enrolled' })
        failCount++
        continue
      }

      // Check for existing attendance at exactly the same time (prevent duplicates)
      const { data: existing } = await supabase
        .from('attendance')
        .select('id')
        .eq('session_id', activeSession.id)
        .eq('student_id', student.id)
        .gte('scanned_at', new Date(scanTime.getTime() - 2000).toISOString())
        .lte('scanned_at', new Date(scanTime.getTime() + 2000).toISOString())
        .maybeSingle()

      if (existing) {
        await logScan(reader.id, normalizedUid, scanTime, 'duplicate', 0, 'Already recorded')
        results.push({ rfid_card_uid, status: 'skipped', error: 'Already recorded' })
        continue
      }

      const sessionStart = new Date(activeSession.started_at)
      const minutesLate = (scanTime - sessionStart) / 60000
      const status = minutesLate > 10 ? 'late' : 'present'

      await supabase.from('attendance').insert([{
        session_id: activeSession.id,
        student_id: student.id,
        status,
        flagged: false,
        scanned_at: scanTime.toISOString()
      }])

      await logScan(reader.id, normalizedUid, scanTime, 'success', 0, 'Offline upload')
      results.push({ rfid_card_uid, status: 'success' })
      successCount++
    } catch (error) {
      await logScan(reader.id, normalizedUid, scanTime, 'error', 0, error.message)
      results.push({ rfid_card_uid, status: 'failed', error: error.message })
      failCount++
    }
  }

  res.json({
    success: true,
    processed: scans.length,
    success_count: successCount,
    fail_count: failCount,
    results
  })
})

// GET /api/attendance/reader-logs/:readerId - Get scan logs for a reader (admin only)
router.get('/reader-logs/:readerId', authenticateUser, requireRole('admin'), async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('scan_logs')
      .select('*')
      .eq('reader_id', req.params.readerId)
      .order('created_at', { ascending: false })
      .limit(100)

    if (error) throw error
    res.json(data || [])
  } catch (error) {
    res.status(500).json({ error: error.message })
  }
})

// All routes below require authentication
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
const { sendEmail } = require('../utils/email')
const { importStudentTimetable } = require('./onboarding') // exported helper, see onboarding.js

async function handleOnboardingTap(session, normalizedUid, reader, res, startTime) {
  const student = session.students

  // Make sure this physical card isn't already bound to someone else
  const { data: existingCard } = await supabase
    .from('students')
    .select('id, full_name')
    .eq('rfid_card_uid', normalizedUid)
    .maybeSingle()

  if (existingCard && existingCard.id !== student.id) {
    await logScan(reader.id, normalizedUid, new Date(), 'error', Date.now() - startTime,
      `Card already assigned to ${existingCard.full_name}`)
    return res.status(409).json({
      error: `This card is already assigned to ${existingCard.full_name}`,
    })
  }

  const { error: updateError } = await supabase
    .from('students')
    .update({ rfid_card_uid: normalizedUid, onboarding_status: 'active' })
    .eq('id', student.id)

  if (updateError) {
    return res.status(500).json({ error: updateError.message })
  }

  await supabase
    .from('onboarding_sessions')
    .update({ status: 'completed', completed_at: new Date().toISOString() })
    .eq('id', session.id)

  await logScan(reader.id, normalizedUid, new Date(), 'success', Date.now() - startTime, 'Onboarding tag assigned')

  // Fire and forget the confirmation email - don't block the reader's response on it
  sendOnboardingConfirmation(student).catch((err) =>
    console.error('[onboarding] confirmation email failed:', err.message)
  )

  return res.status(200).json({
    success: true,
    onboarding: true,
    student: student.full_name,
    message: `Card assigned to ${student.full_name}`,
  })
}

async function sendOnboardingConfirmation(student) {
  if (!student.guardian_email) return

  const { data: timetable } = await supabase
    .from('timetable_slots')
    .select('*')
    .eq('student_id', student.id)
    .order('day_of_week')
    .order('start_time')

  const DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday']
  const timetableLines = (timetable || [])
    .map((slot) => `${DAYS[slot.day_of_week]} ${slot.start_time.slice(0, 5)}-${slot.end_time.slice(0, 5)}: ${slot.subject_name}${slot.room ? ' (' + slot.room + ')' : ''}`)
    .join('\n')

  await sendEmail({
    to: student.guardian_email,
    subject: `Tago - ${student.full_name}'s attendance card is active`,
    text: `Hi,\n\n${student.full_name}'s RFID attendance card has been activated and linked to their timetable.\n\nTimetable:\n${timetableLines || '(no timetable on file)'}\n\nThis is an automated message from Tago.`,
  })
}
module.exports = router