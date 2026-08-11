const express = require('express')
const router = express.Router()
const supabase = require('../db/pool')
const { authenticateUser, requireRole } = require('../middleware/auth')
const { sendEmail } = require('../utils/email')

const VALID_ROLES = ['admin', 'teacher', 'student']
const CARD_REQUESTS = {
  reassign: 'RFID card reassignment request',
  new: 'New RFID card request',
  missing: 'Missing RFID card report',
  stolen: 'Stolen RFID card report',
}

router.use(authenticateUser)

// PATCH current user's profile details
router.patch('/me', async (req, res) => {
  const fullName = req.body.full_name?.trim()

  if (!fullName) {
    return res.status(400).json({ error: 'Full name is required' })
  }

  const payload = { full_name: fullName }

  if (req.body.session_start_buffer_minutes !== undefined) {
    const buffer = Number(req.body.session_start_buffer_minutes)

    if (!Number.isInteger(buffer) || buffer < 0 || buffer > 60) {
      return res.status(400).json({ error: 'session_start_buffer_minutes must be a whole number from 0 to 60' })
    }

    payload.session_start_buffer_minutes = buffer
  }

  const { data, error } = await supabase
    .from('profiles')
    .update(payload)
    .eq('id', req.profile.id)
    .select('*')
    .single()

  if (error) return res.status(500).json({ error: error.message })

  res.json({ profile: data })
})

// POST RFID card support request. Missing/stolen reports deactivate the linked card.
router.post('/card-request', async (req, res) => {
  const { type, details } = req.body
  const requestLabel = CARD_REQUESTS[type]

  if (!requestLabel) {
    return res.status(400).json({ error: 'Invalid card request type' })
  }

  let student = null
  let deactivated = false

  if (req.profile.role === 'student') {
    const { data: link } = await supabase
      .from('student_profiles')
      .select('student_id, students(id, full_name, student_number, rfid_card_uid)')
      .eq('profile_id', req.profile.id)
      .maybeSingle()

    student = link?.students || null

    if ((type === 'missing' || type === 'stolen') && student?.id && student.rfid_card_uid) {
      const { error: deactivateError } = await supabase
        .from('students')
        .update({ rfid_card_uid: null })
        .eq('id', student.id)

      if (deactivateError) {
        return res.status(500).json({ error: deactivateError.message })
      }

      deactivated = true
    }
  }

  const subject = `[Tago] ${requestLabel} - ${req.profile.full_name}`
  const text = [
    requestLabel,
    '',
    `Name: ${req.profile.full_name}`,
    `Email: ${req.profile.email}`,
    `Role: ${req.profile.role}`,
    student ? `Student ID: ${student.student_number}` : null,
    student?.rfid_card_uid ? `Previous card: ****${student.rfid_card_uid.slice(-4)}` : 'Previous card: not linked',
    deactivated ? 'Card status: deactivated immediately' : 'Card status: unchanged',
    details ? `Details: ${details}` : null,
  ].filter(Boolean).join('\n')

  const emailResult = await sendEmail({ subject, text })

  // Return proper status: 200 if email sent, 500 if failed (server error)
  // The main operation (deactivation) succeeded, but notification failed
  if (!emailResult.sent) {
    console.error('[users] Card request email failed:', emailResult.error)
  }

  res.status(emailResult.sent ? 200 : 500).json({
    success: emailResult.sent,  // Indicate if email was actually sent
    emailSent: emailResult.sent,
    emailError: emailResult.sent ? null : emailResult.error,
    deactivated,
    message: emailResult.sent ? 'Card request submitted and notification sent.' : 'Card request submitted, but notification failed.',
  })
})

// POST create a new user (admin only)
router.post('/create', requireRole('admin'), async (req, res) => {
  const { email, password, full_name, role, student_id, student_number, year_level } = req.body
  const trimmedEmail = email?.trim()
  const trimmedName = full_name?.trim()
  const trimmedStudentNumber = student_number?.trim()
  const parsedYearLevel = year_level === null || year_level === undefined || year_level === ''
    ? null
    : Number(year_level)

  if (!trimmedEmail || !password || !trimmedName || !role) {
    return res.status(400).json({ error: 'All fields required' })
  }

  if (!VALID_ROLES.includes(role)) {
    return res.status(400).json({ error: 'Invalid role' })
  }

  if (role === 'student' && !student_id && !trimmedStudentNumber) {
    return res.status(400).json({ error: 'Student number is required for student accounts' })
  }

  if (role === 'student' && !student_id && trimmedStudentNumber && !/^[0-9]{1,20}$/.test(trimmedStudentNumber)) {
    return res.status(400).json({ error: 'Student number must contain numbers only (no letters or symbols)' })
  }

  if (role === 'student' && parsedYearLevel !== null && (!Number.isInteger(parsedYearLevel) || parsedYearLevel < 11 || parsedYearLevel > 13)) {
    return res.status(400).json({ error: 'year_level must be a whole number from 11 to 13' })
  }

  let studentId = student_id || null
  let createdStudentId = null

  const cleanupCreatedStudent = async () => {
    if (!createdStudentId) return
    await supabase.from('students').delete().eq('id', createdStudentId)
  }

  if (role === 'student' && !studentId) {
    const { data: createdStudent, error: studentError } = await supabase
      .from('students')
      .insert([{
        full_name: trimmedName,
        student_number: trimmedStudentNumber,
        year_level: parsedYearLevel,
      }])
      .select('id')
      .single()

    if (studentError) return res.status(500).json({ error: studentError.message })

    studentId = createdStudent.id
    createdStudentId = createdStudent.id
  }

  // Create auth user using service key (admin privileges)
  const { data: authData, error: authError } = await supabase.auth.admin.createUser({
    email: trimmedEmail,
    password,
    email_confirm: true
  })

  if (authError) {
    await cleanupCreatedStudent()
    return res.status(500).json({ error: authError.message })
  }

  // Insert profile
  const { error: profileError } = await supabase
    .from('profiles')
    .insert([{
      id: authData.user.id,
      email: trimmedEmail,
      full_name: trimmedName,
      role,
    }])

  if (profileError) {
    await supabase.auth.admin.deleteUser(authData.user.id)
    await cleanupCreatedStudent()
    return res.status(500).json({ error: profileError.message })
  }

  if (role === 'student') {
    const { error: linkError } = await supabase
      .from('student_profiles')
      .insert([{ profile_id: authData.user.id, student_id: studentId }])

    if (linkError) {
      await supabase.auth.admin.deleteUser(authData.user.id)
      await cleanupCreatedStudent()
      return res.status(500).json({ error: linkError.message })
    }
  }

  const emailResult = await sendEmail({
    to: trimmedEmail,
    subject: 'Your Tago account has been created',
    text: [
      `Kia ora ${trimmedName},`,
      '',
      'A Tago account has been created for you.',
      `Role: ${role}`,
      `Email: ${trimmedEmail}`,
      '',
      'Use the password provided by your school administrator to sign in.',
    ].join('\n'),
  })

  res.status(201).json({
    success: true,
    id: authData.user.id,
    student_id: studentId,
    studentCreated: Boolean(createdStudentId),
    emailSent: emailResult.sent,
    emailError: emailResult.sent ? null : emailResult.error,
  })
})

module.exports = router