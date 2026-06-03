const express = require('express')
const router = express.Router()
const supabase = require('../db/pool')

// POST scan — called by ESP32 when a card is tapped
router.post('/scan', async (req, res) => {
  const { rfid_card_uid, reader_api_key } = req.body

  if (!rfid_card_uid || !reader_api_key) {
    return res.status(400).json({ error: 'rfid_card_uid and reader_api_key are required' })
  }

  // 1. Validate the reader
  const { data: reader, error: readerError } = await supabase
    .from('readers')
    .select('*')
    .eq('api_key', reader_api_key)
    .eq('active', true)
    .single()

  if (readerError || !reader) {
    return res.status(401).json({ error: 'Invalid or inactive reader' })
  }

  // Update last_seen on the reader
  await supabase
    .from('readers')
    .update({ last_seen: new Date().toISOString() })
    .eq('id', reader.id)

  // 2. Look up the student by card UID
  const { data: student, error: studentError } = await supabase
    .from('students')
    .select('*')
    .eq('rfid_card_uid', rfid_card_uid)
    .single()

  if (studentError || !student) {
    return res.status(404).json({ error: 'Card not registered to any student' })
  }

  // 3. Find the active session for this reader's room
  const { data: session, error: sessionError } = await supabase
    .from('sessions')
    .select('*, classes(room)')
    .eq('classes.room', reader.room)
    .is('ended_at', null)
    .single()

  if (sessionError || !session) {
    return res.status(404).json({ error: 'No active session for this room' })
  }

  // 4. Check for duplicate scan (proxy fraud detection)
  const { data: existing } = await supabase
    .from('attendance')
    .select('*')
    .eq('session_id', session.id)
    .eq('student_id', student.id)
    .single()

  if (existing) {
    // Already scanned — check how recently
    const firstScan = new Date(existing.scanned_at)
    const now = new Date()
    const secondsSince = (now - firstScan) / 1000

    if (secondsSince < 30) {
      // Scanned twice within 30 seconds — flag it
      await supabase
        .from('attendance')
        .update({
          flagged: true,
          flag_reason: `Scanned twice within ${Math.round(secondsSince)}s`
        })
        .eq('id', existing.id)

      return res.status(409).json({
        error: 'Duplicate scan flagged',
        student: student.full_name,
        flagged: true
      })
    }

    return res.status(409).json({
      error: 'Student already marked present',
      student: student.full_name
    })
  }

  // 5. Determine status — late if more than 10 mins after session start
  const sessionStart = new Date(session.started_at)
  const minutesLate = (new Date() - sessionStart) / 60000
  const status = minutesLate > 10 ? 'late' : 'present'

  // 6. Record attendance
  const { data: record, error: recordError } = await supabase
    .from('attendance')
    .insert([{
      session_id: session.id,
      student_id: student.id,
      status,
      flagged: false
    }])
    .select()
    .single()

  if (recordError) return res.status(500).json({ error: recordError.message })

  res.status(201).json({
    success: true,
    student: student.full_name,
    status,
    scanned_at: record.scanned_at
  })
})

// GET attendance for a session
router.get('/session/:session_id', async (req, res) => {
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

// PATCH manual override — teacher changes a student's status
router.patch('/:id', async (req, res) => {
  const { status } = req.body

  if (!['present', 'late', 'absent', 'excused'].includes(status)) {
    return res.status(400).json({ error: 'Invalid status' })
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