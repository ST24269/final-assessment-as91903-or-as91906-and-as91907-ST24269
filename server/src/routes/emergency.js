const express = require('express')
const router = express.Router()
const supabase = require('../db/pool')
const { authenticateUser, requireRole } = require('../middleware/auth')
const { isValidEmailAddress, sendEmail } = require('../utils/email')

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

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

// Every teacher/admin login, every active student's roster email, plus the
// login email of any active student who has a Tago account - the whole-
// school broadcast list for emergency start/end notifications. Both
// student email sources are included because editing a student's roster
// email (students.email, via StudentsManager) does not update their
// existing login email (profiles.email) - the two can drift apart, and
// for a safety alert it's better to email both than silently drop one.
async function collectEmergencyRecipients() {
  const [{ data: staffProfiles }, { data: activeStudents }, { data: studentLinks }] = await Promise.all([
    supabase.from('profiles').select('email').in('role', ['teacher', 'admin']),
    supabase.from('students').select('id, email').eq('account_status', 'active'),
    supabase.from('student_profiles').select('student_id, profiles(email)'),
  ])

  const activeStudentIds = new Set((activeStudents || []).map((row) => row.id))
  const linkedActiveStudentEmails = (studentLinks || [])
    .filter((row) => activeStudentIds.has(row.student_id))
    .map((row) => row.profiles?.email)

  const emails = [
    ...(staffProfiles || []).map((row) => row.email),
    ...(activeStudents || []).map((row) => row.email),
    ...linkedActiveStudentEmails,
  ]
    .map((email) => String(email || '').trim())
    .filter((email) => email && isValidEmailAddress(email))
    .map((email) => email.toLowerCase())

  return [...new Set(emails)]
}

async function notifyEmergencyStarted(event) {
  const recipients = await collectEmergencyRecipients()
  if (!recipients.length) return { sent: false, error: 'No recipients with a valid email address.' }

  const startedAt = new Date(event.started_at).toLocaleString('en-NZ', { dateStyle: 'medium', timeStyle: 'short' })
  const subject = 'Emergency alert: school-wide roll call in progress'
  const text = [
    'An emergency has been declared at your school.',
    `Started: ${startedAt}`,
    '',
    'Teachers: go to your Tago dashboard now and complete a roll call for your current class.',
    "Students and staff: follow your school's standard emergency procedures until an all-clear is given.",
  ].join('\n')
  const html = `
    <p><strong>An emergency has been declared at your school.</strong></p>
    <p>Started: ${escapeHtml(startedAt)}</p>
    <p><strong>Teachers:</strong> go to your Tago dashboard now and complete a roll call for your current class.</p>
    <p>Students and staff: follow your school's standard emergency procedures until an all-clear is given.</p>
  `.trim()

  return sendEmail({ to: recipients, subject, text, html })
}

async function notifyEmergencyEnded(event) {
  const recipients = await collectEmergencyRecipients()
  if (!recipients.length) return { sent: false, error: 'No recipients with a valid email address.' }

  const subject = 'All clear: emergency roll call has ended'
  const text = 'The emergency has ended and the roll call is complete. Normal school activities may resume.'
  const html = `<p>${text}</p>`

  return sendEmail({ to: recipients, subject, text, html })
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

// Enrolled (active-student) ids for a class - the actual roster a manual
// roll call should walk, independent of whether anyone has an open
// session right now. last_known_class_id (set from open sessions at the
// moment the emergency started) is too sparse to rely on: most classes
// won't have one yet, which used to make an unfiltered class look like
// "everyone accounted for" when really nobody had been checked at all.
async function getEnrolledStudentIds(classId) {
  const { data, error } = await supabase
    .from('enrolments')
    .select('student_id')
    .eq('class_id', classId)

  if (error) throw new Error(error.message)
  return (data || []).map((row) => row.student_id)
}

// GET /api/emergency/active - current event + checkins, staff only.
// Optional ?class_id= scopes the checkins to one class's enrolled roster
// (used by the per-class manual roll call view).
router.get('/active', authenticateUser, requireRole('teacher', 'admin'), async (req, res) => {
  try {
    const event = await getActiveEvent()
    if (!event) return res.json({ event: null, checkins: [] })

    let query = supabase
      .from('emergency_checkins')
      .select(checkinSelect)
      .eq('event_id', event.id)
      .order('status', { ascending: true })

    const classId = req.query.class_id ? String(req.query.class_id).trim() : ''
    if (classId) {
      const studentIds = await getEnrolledStudentIds(classId)
      if (!studentIds.length) return res.json({ event, checkins: [] })
      query = query.in('student_id', studentIds)
    }

    const { data, error } = await query
    if (error) return res.status(500).json({ error: error.message })

    res.json({ event, checkins: (data || []).map(publicCheckin) })
  } catch (error) {
    res.status(500).json({ error: error.message })
  }
})

// GET /api/emergency/classes - per-class summary for the active event:
// accounted/unaccounted counts, submission status, and whether the
// requesting teacher currently has this class in session. Powers both the
// teacher "find a class" search and the admin submission tracker.
router.get('/classes', authenticateUser, requireRole('teacher', 'admin'), async (req, res) => {
  try {
    const event = await getActiveEvent()
    if (!event) return res.status(409).json({ error: 'No active emergency roll call.' })

    const search = String(req.query.search || '').trim()

    let classQuery = supabase
      .from('classes')
      .select('id, name, subject, room, teacher_id, profiles(full_name)')
      .order('name')

    if (search) classQuery = classQuery.ilike('name', `%${search}%`)

    const [{ data: classes, error: classError }, { data: checkins, error: checkinError }, { data: submissions, error: submissionError }, { data: enrolmentRows, error: enrolmentError }] = await Promise.all([
      classQuery,
      supabase.from('emergency_checkins').select('student_id, status').eq('event_id', event.id),
      supabase
        .from('emergency_class_submissions')
        .select('class_id, submitted_at, accounted_count, unaccounted_count, submitted_by:submitted_by_profile_id(full_name)')
        .eq('event_id', event.id),
      supabase.from('enrolments').select('class_id, student_id'),
    ])

    if (classError) return res.status(500).json({ error: classError.message })
    if (checkinError) return res.status(500).json({ error: checkinError.message })
    if (submissionError) return res.status(500).json({ error: submissionError.message })
    if (enrolmentError) return res.status(500).json({ error: enrolmentError.message })

    let currentClassIds = new Set()
    if (req.profile.role === 'teacher') {
      const { data: openSessions, error: sessionError } = await supabase
        .from('sessions')
        .select('class_id')
        .eq('teacher_id', req.profile.id)
        .is('ended_at', null)

      if (sessionError) return res.status(500).json({ error: sessionError.message })
      currentClassIds = new Set((openSessions || []).map((row) => row.class_id))
    }

    const submissionByClass = new Map((submissions || []).map((row) => [row.class_id, row]))
    const statusByStudent = new Map((checkins || []).map((row) => [row.student_id, row.status]))

    const studentIdsByClass = new Map()
    for (const row of enrolmentRows || []) {
      if (!studentIdsByClass.has(row.class_id)) studentIdsByClass.set(row.class_id, [])
      studentIdsByClass.get(row.class_id).push(row.student_id)
    }

    const result = (classes || []).map((classRow) => {
      const submission = submissionByClass.get(classRow.id)
      // Only enrolled students who are part of the active roll call (i.e.
      // active at the time the emergency started) count towards the roster.
      const classCounts = (studentIdsByClass.get(classRow.id) || []).reduce((acc, studentId) => {
        const status = statusByStudent.get(studentId)
        if (!status) return acc
        acc.total += 1
        acc[status === 'accounted' ? 'accounted' : 'unaccounted'] += 1
        return acc
      }, { total: 0, accounted: 0, unaccounted: 0 })

      return {
        id: classRow.id,
        name: classRow.name,
        subject: classRow.subject,
        room: classRow.room,
        teacher: classRow.profiles ? { full_name: classRow.profiles.full_name } : null,
        ...classCounts,
        is_current: currentClassIds.has(classRow.id),
        submitted: Boolean(submission),
        submitted_at: submission?.submitted_at || null,
        submitted_by: submission?.submitted_by?.full_name || null,
      }
    })

    result.sort((a, b) => Number(b.is_current) - Number(a.is_current) || b.unaccounted - a.unaccounted)

    res.json({ event, classes: result })
  } catch (error) {
    res.status(500).json({ error: error.message })
  }
})

// POST /api/emergency/classes/:classId/submit - teacher (or admin) confirms
// their roll call for one class is complete during the active event.
router.post('/classes/:classId/submit', authenticateUser, requireRole('teacher', 'admin'), async (req, res) => {
  try {
    const event = await getActiveEvent()
    if (!event) return res.status(409).json({ error: 'No active emergency roll call.' })

    const classId = req.params.classId

    const { data: classRow, error: classError } = await supabase
      .from('classes')
      .select('id, name')
      .eq('id', classId)
      .maybeSingle()

    if (classError) return res.status(500).json({ error: classError.message })
    if (!classRow) return res.status(404).json({ error: 'Class not found.' })

    const studentIds = await getEnrolledStudentIds(classId)

    const { data: checkins, error: checkinError } = studentIds.length
      ? await supabase
        .from('emergency_checkins')
        .select('status')
        .eq('event_id', event.id)
        .in('student_id', studentIds)
      : { data: [], error: null }

    if (checkinError) return res.status(500).json({ error: checkinError.message })

    const accountedCount = (checkins || []).filter((row) => row.status === 'accounted').length
    const unaccountedCount = (checkins || []).length - accountedCount

    const { data: submission, error: submissionError } = await supabase
      .from('emergency_class_submissions')
      .upsert([{
        event_id: event.id,
        class_id: classId,
        submitted_by_profile_id: req.profile.id,
        submitted_at: new Date().toISOString(),
        accounted_count: accountedCount,
        unaccounted_count: unaccountedCount,
      }], { onConflict: 'event_id,class_id' })
      .select('class_id, submitted_at, accounted_count, unaccounted_count')
      .single()

    if (submissionError) return res.status(500).json({ error: submissionError.message })

    await logAudit('emergency_class_submitted', req.profile.id, req.profile.email, `Submitted emergency roll for ${classRow.name}`, {
      eventId: event.id,
      classId,
      accountedCount,
      unaccountedCount,
    })

    res.status(201).json({ submission })
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

    const notifyResult = await notifyEmergencyStarted(event)

    await logAudit('emergency_started', req.profile.id, req.profile.email, 'Started emergency roll call', {
      eventId: event.id,
      studentCount: rows.length,
      emailSent: notifyResult.sent,
      emailError: notifyResult.error,
    })

    res.status(201).json({ event, studentCount: rows.length, notification: notifyResult })
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

    const notifyResult = await notifyEmergencyEnded(event)

    await logAudit('emergency_ended', req.profile.id, req.profile.email, 'Ended emergency roll call', {
      eventId: event.id,
      emailSent: notifyResult.sent,
      emailError: notifyResult.error,
    })

    res.json({ event, notification: notifyResult })
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
