const express = require('express')
const router = express.Router()
const supabase = require('../db/pool')
const { authenticateUser, requireRole } = require('../middleware/auth')

const normalizeCardUid = (uid) => String(uid).trim().toUpperCase()

const checkinSelect = `
  *,
  students(id, full_name, student_number, year_level, kainga),
  classes:last_known_class_id(id, name, room)
`

function publicCheckin(row) {
  return {
    ...row,
    student: row.students || null,
    last_known_class: row.classes || null,
  }
}

async function logAudit(action, actorProfileId, actorEmail, description, metadata = {}) {
  const { error } = await supabase.from('audit_logs').insert([{
    action,
    actor_profile_id: actorProfileId || null,
    actor_email: actorEmail || null,
    description,
    metadata,
  }])
  if (error) console.warn(`[audit] ${action}: ${error.message}`)
}

async function getActiveEvent() {
  const { data, error } = await supabase
    .from('emergency_events')
    .select('*')
    .eq('status', 'active')
    .order('started_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (error) throw new Error(error.message)
  return data || null
}

// GET /api/emergency/active - current event + checkins, staff only
router.get('/active', authenticateUser, requireRole('teacher', 'admin'), async (req, res) => {
  try {
    const event = await getActiveEvent()
    if (!event) return res.json({ event: null, checkins: [] })

    const { data, error } = await supabase
      .from('emergency_checkins')
      .select(checkinSelect)
      .eq('event_id', event.id)
      .order('status', { ascending: true })

    if (error) return res.status(500).json({ error: error.message })

    res.json({ event, checkins: (data || []).map(publicCheckin) })
  } catch (error) {
    res.status(500).json({ error: error.message })
  }
})

// POST /api/emergency/start - admin activates emergency mode across the school
router.post('/start', authenticateUser, requireRole('admin'), async (req, res) => {
  try {
    const existing = await getActiveEvent()
    if (existing) return res.status(409).json({ error: 'An emergency roll call is already active.' })

    const { data: event, error: eventError } = await supabase
      .from('emergency_events')
      .insert([{ started_by_profile_id: req.profile.id, notes: req.body.notes || null }])
      .select()
      .single()

    if (eventError) return res.status(500).json({ error: eventError.message })

    const { data: students, error: studentsError } = await supabase
      .from('students')
      .select('id')
      .eq('account_status', 'active')

    if (studentsError) return res.status(500).json({ error: studentsError.message })

    // Last known class: whichever session (started but not ended) each
    // student currently has an attendance record for.
    const { data: openAttendance } = await supabase
      .from('attendance')
      .select('student_id, sessions!inner(class_id, ended_at)')
      .is('sessions.ended_at', null)

    const lastKnownByStudent = new Map()
    ;(openAttendance || []).forEach((row) => {
      lastKnownByStudent.set(row.student_id, row.sessions?.class_id || null)
    })

    const rows = (students || []).map((student) => ({
      event_id: event.id,
      student_id: student.id,
      status: 'unaccounted',
      last_known_class_id: lastKnownByStudent.get(student.id) || null,
    }))

    if (rows.length) {
      const { error: checkinError } = await supabase.from('emergency_checkins').insert(rows)
      if (checkinError) return res.status(500).json({ error: checkinError.message })
    }

    await logAudit('emergency_started', req.profile.id, req.profile.email, 'Started emergency roll call', {
      eventId: event.id,
      studentCount: rows.length,
    })

    res.status(201).json({ event, studentCount: rows.length })
  } catch (error) {
    res.status(500).json({ error: error.message })
  }
})

// POST /api/emergency/:id/end - admin ends the active event
router.post('/:id/end', authenticateUser, requireRole('admin'), async (req, res) => {
  try {
    const { data: event, error } = await supabase
      .from('emergency_events')
      .update({ status: 'ended', ended_at: new Date().toISOString(), ended_by_profile_id: req.profile.id })
      .eq('id', req.params.id)
      .eq('status', 'active')
      .select()
      .single()

    if (error) return res.status(500).json({ error: error.message })
    if (!event) return res.status(404).json({ error: 'Active emergency event not found.' })

    await logAudit('emergency_ended', req.profile.id, req.profile.email, 'Ended emergency roll call', { eventId: event.id })

    res.json({ event })
  } catch (error) {
    res.status(500).json({ error: error.message })
  }
})

// PATCH /api/emergency/checkins/:id - manual accounted/unaccounted override
router.patch('/checkins/:id', authenticateUser, requireRole('teacher', 'admin'), async (req, res) => {
  try {
    const status = req.body.status
    if (!['accounted', 'unaccounted'].includes(status)) {
      return res.status(400).json({ error: 'status must be accounted or unaccounted.' })
    }

    const { data, error } = await supabase
      .from('emergency_checkins')
      .update({
        status,
        method: 'manual',
        checked_by_profile_id: req.profile.id,
        checked_at: new Date().toISOString(),
      })
      .eq('id', req.params.id)
      .select(checkinSelect)
      .single()

    if (error) return res.status(500).json({ error: error.message })
    if (!data) return res.status(404).json({ error: 'Check-in not found.' })

    await logAudit('emergency_manual_checkin', req.profile.id, req.profile.email, `Marked student ${status}`, {
      checkinId: data.id,
      studentId: data.student_id,
    })

    res.json({ checkin: publicCheckin(data) })
  } catch (error) {
    res.status(500).json({ error: error.message })
  }
})

// POST /api/emergency/scan - reader-authenticated, marks a student accounted
// for during an active emergency. Independent of normal class sessions.
router.post('/scan', async (req, res) => {
  try {
    const normalizedUid = req.body.rfid_card_uid ? normalizeCardUid(req.body.rfid_card_uid) : ''
    const readerApiKey = req.body.reader_api_key ? String(req.body.reader_api_key).trim() : ''

    if (!normalizedUid || !readerApiKey) {
      return res.status(400).json({ error: 'rfid_card_uid and reader_api_key are required' })
    }

    const { data: reader, error: readerError } = await supabase
      .from('readers')
      .select('id')
      .eq('api_key', readerApiKey)
      .eq('active', true)
      .maybeSingle()

    if (readerError || !reader) {
      return res.status(401).json({ error: 'Invalid or inactive reader' })
    }

    const event = await getActiveEvent()
    if (!event) return res.status(409).json({ error: 'No active emergency roll call.' })

    const { data: student, error: studentError } = await supabase
      .from('students')
      .select('id, full_name')
      .eq('rfid_card_uid', normalizedUid)
      .maybeSingle()

    if (studentError || !student) {
      return res.status(404).json({ error: 'Card not registered to any student' })
    }

    const { data, error } = await supabase
      .from('emergency_checkins')
      .update({ status: 'accounted', method: 'scan', checked_at: new Date().toISOString() })
      .eq('event_id', event.id)
      .eq('student_id', student.id)
      .select(checkinSelect)
      .maybeSingle()

    if (error) return res.status(500).json({ error: error.message })

    if (!data) {
      const { data: created, error: createError } = await supabase
        .from('emergency_checkins')
        .insert([{ event_id: event.id, student_id: student.id, status: 'accounted', method: 'scan', checked_at: new Date().toISOString() }])
        .select(checkinSelect)
        .single()

      if (createError) return res.status(500).json({ error: createError.message })
      return res.status(201).json({ checkin: publicCheckin(created), student: student.full_name })
    }

    res.json({ checkin: publicCheckin(data), student: student.full_name })
  } catch (error) {
    res.status(500).json({ error: error.message })
  }
})

module.exports = router
