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

const STUDENT_NUMBER_PATTERN = /^[0-9]{1,20}$/
const MAX_IMPORT_NAME_LENGTH = 15
const CARD_ID_PATTERN = /^[A-Z0-9_-]{3,64}$/
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

const normalizeCardUid = (uid) => String(uid).trim().toUpperCase()

function generateTemporaryPassword() {
  return `Tago-${Math.random().toString(36).slice(2, 8)}-${Math.random().toString(36).slice(2, 6)}`
}

function getFrontendUrl() {
  return (
    process.env.FRONTEND_URL ||
    process.env.CLIENT_URL ||
    process.env.APP_URL ||
    'http://localhost:5173'
  ).replace(/\/+$/, '')
}

// Creates a Supabase Auth login for a newly-imported student and emails them
// a temporary password + sign-in link. Skipped if the student already has a
// linked login, so re-importing an existing roster never resets a password
// or double-creates an account.
async function provisionStudentLogin(student, email, fullName) {
  const { data: existingLink } = await supabase
    .from('student_profiles')
    .select('profile_id')
    .eq('student_id', student.id)
    .maybeSingle()

  if (existingLink) {
    return { accountCreated: false, accountEmailSent: false }
  }

  const temporaryPassword = generateTemporaryPassword()

  const { data: authData, error: authError } = await supabase.auth.admin.createUser({
    email,
    password: temporaryPassword,
    email_confirm: true,
  })

  if (authError) {
    return { accountCreated: false, accountEmailSent: false, accountError: authError.message }
  }

  const authUserId = authData.user.id

  const { error: profileError } = await supabase
    .from('profiles')
    .insert([{ id: authUserId, email, full_name: fullName, role: 'student' }])

  if (profileError) {
    await supabase.auth.admin.deleteUser(authUserId)
    return { accountCreated: false, accountEmailSent: false, accountError: profileError.message }
  }

  const { error: linkError } = await supabase
    .from('student_profiles')
    .insert([{ profile_id: authUserId, student_id: student.id }])

  if (linkError) {
    await supabase.auth.admin.deleteUser(authUserId)
    return { accountCreated: false, accountEmailSent: false, accountError: linkError.message }
  }

  const loginUrl = `${getFrontendUrl()}/login/student`

  const emailResult = await sendEmail({
    to: email,
    subject: 'Your Tago student account is ready',
    text: [
      `Kia ora ${fullName},`,
      '',
      'A Tago student account has been created for you.',
      `Log in here: ${loginUrl}`,
      `Email: ${email}`,
      `Temporary password: ${temporaryPassword}`,
      '',
      'Please sign in and change your password from your profile security page.',
    ].join('\n'),
  })

  return {
    accountCreated: true,
    accountEmailSent: emailResult.sent,
    accountError: emailResult.sent ? null : emailResult.error,
  }
}

// Student IDs are numeric only - strips any accidental prefix like "ST" and
// rejects the row if what's left isn't a plain number.
function validateImportStudentNumber(value) {
  const trimmed = String(value || '').trim()
  if (!trimmed) return { error: 'stNumber is required' }
  if (!STUDENT_NUMBER_PATTERN.test(trimmed)) {
    return { error: 'stNumber must contain numbers only (no letters or symbols)' }
  }
  return trimmed
}

// First/last names are capped at 15 characters, matching the limit
// enforced on the admin add/edit student form.
function validateImportNamePart(value, label) {
  const trimmed = String(value || '').trim()
  if (trimmed.length > MAX_IMPORT_NAME_LENGTH) {
    return { error: `${label} must be ${MAX_IMPORT_NAME_LENGTH} characters or fewer (got ${trimmed.length})` }
  }
  return null
}

// Year level accepts "11", "Year 11", "year11" etc, but only years 11-13.
function validateImportYearLevel(value) {
  if (value === null || value === undefined || value === '') return null
  const digitsOnly = String(value).replace(/[^0-9]/g, '')
  const parsed = Number(digitsOnly)
  if (!digitsOnly || !Number.isInteger(parsed) || parsed < 11 || parsed > 13) {
    return { error: 'yearLevel must be 11, 12, or 13' }
  }
  return parsed
}

// Email is optional on import, but if a row has one it must look like an
// actual address rather than silently saving junk into the students table.
function validateImportEmail(value) {
  const trimmed = String(value || '').trim()
  if (!trimmed) return null
  if (!EMAIL_PATTERN.test(trimmed)) {
    return { error: 'email must be a valid email address' }
  }
  return trimmed
}

// ---------------------------------------------------------------------
// POST /api/onboarding/import-roster
// Body: { rows: [{ firstName, lastName, age, yearLevel, kainga,
//                   stNumber, studentEmail, icsUrl, rfidCardUid }, ...] }
// Upserts students and pulls each student's individual timetable feed.
// A row with an rfidCardUid assigns that card immediately (onboarding_status
// 'active'); a row without one leaves the student onboarding_status
// 'pending' so they show up in the "Assign RFID Cards" tap-to-assign list
// instead. Re-importing an existing student without a card column doesn't
// touch their existing card or status either way.
// A row with a studentEmail also gets a Supabase Auth login created (if it
// doesn't already have one) and is emailed a temporary password + sign-in
// link via provisionStudentLogin.
// ---------------------------------------------------------------------
router.post('/import-roster', async (req, res) => {
  const { rows } = req.body

  if (!Array.isArray(rows) || rows.length === 0) {
    return res.status(400).json({ error: 'rows (array) is required' })
  }

  const results = []
  const seenCardUids = new Set()

  for (const row of rows) {
    const fullName = `${(row.firstName || '').trim()} ${(row.lastName || '').trim()}`.trim()

    if (!fullName) {
      results.push({ row, status: 'failed', error: 'firstName and lastName are required' })
      continue
    }

    const firstNameError = validateImportNamePart(row.firstName, 'firstName')
    if (firstNameError) {
      results.push({ row, status: 'failed', error: firstNameError.error })
      continue
    }

    const lastNameError = validateImportNamePart(row.lastName, 'lastName')
    if (lastNameError) {
      results.push({ row, status: 'failed', error: lastNameError.error })
      continue
    }

    const validatedNumber = validateImportStudentNumber(row.stNumber)
    if (validatedNumber?.error) {
      results.push({ row, status: 'failed', error: validatedNumber.error })
      continue
    }

    const validatedYear = validateImportYearLevel(row.yearLevel)
    if (validatedYear?.error) {
      results.push({ row, status: 'failed', error: validatedYear.error })
      continue
    }

    const validatedEmail = validateImportEmail(row.studentEmail)
    if (validatedEmail?.error) {
      results.push({ row, status: 'failed', error: validatedEmail.error })
      continue
    }

    const normalizedCardUid = row.rfidCardUid ? normalizeCardUid(row.rfidCardUid) : null

    if (normalizedCardUid && !CARD_ID_PATTERN.test(normalizedCardUid)) {
      results.push({ row, status: 'failed', error: 'RFID card UID must be 3-64 characters and use letters, numbers, _ or - only.' })
      continue
    }

    if (normalizedCardUid && seenCardUids.has(normalizedCardUid)) {
      results.push({ row, status: 'failed', error: 'RFID card UID is used by more than one row in this file.' })
      continue
    }

    try {
      if (normalizedCardUid) {
        const { data: cardOwner } = await supabase
          .from('students')
          .select('full_name')
          .eq('rfid_card_uid', normalizedCardUid)
          .neq('student_number', validatedNumber)
          .maybeSingle()

        if (cardOwner) throw new Error(`RFID card is already assigned to ${cardOwner.full_name}.`)
      }

      const { data: existingStudent } = await supabase
        .from('students')
        .select('id')
        .eq('student_number', validatedNumber)
        .maybeSingle()

      const payload = {
        full_name: fullName,
        student_number: validatedNumber,
        age: row.age ? Number(row.age) : null,
        year_level: validatedYear,
        kainga: row.kainga || null,
        email: validatedEmail || null,
        ics_url: row.icsUrl || null,
      }

      if (normalizedCardUid) {
        payload.rfid_card_uid = normalizedCardUid
        payload.rfid_status = 'active'
        payload.onboarding_status = 'active'
      } else if (!existingStudent) {
        payload.onboarding_status = 'pending'
      }

      const { data: student, error: upsertError } = await supabase
        .from('students')
        .upsert(payload, { onConflict: 'student_number' })
        .select()
        .single()

      if (upsertError) throw upsertError
      if (normalizedCardUid) seenCardUids.add(normalizedCardUid)

      let timetableCount = 0
      if (row.icsUrl) {
        timetableCount = await importStudentTimetable(student.id, row.icsUrl)
      }

      let accountResult = {}
      if (validatedEmail) {
        accountResult = await provisionStudentLogin(student, validatedEmail, fullName)
      }

      results.push({
        row,
        status: 'success',
        studentId: student.id,
        timetableSlots: timetableCount,
        cardAssigned: Boolean(normalizedCardUid),
        ...accountResult,
      })
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