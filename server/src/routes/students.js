const express = require('express')
const router = express.Router()
const supabase = require('../db/pool')
const { authenticateUser, requireRole } = require('../middleware/auth')
const { isValidEmailAddress, sendEmail } = require('../utils/email')

router.use(authenticateUser)

const BASE_STUDENT_COLUMNS = 'id, full_name, student_number, year_level, rfid_card_uid, created_at'
const EXTENDED_STUDENT_COLUMNS = `${BASE_STUDENT_COLUMNS}, first_name, last_name, kainga, form_group, account_status, rfid_status, disabled_at`
const VALID_KAINGA = ['Kea', 'Pukeko', 'Mokoroa', 'Pungawerere']
const VALID_ACCOUNT_STATUSES = ['active', 'inactive', 'disabled']
const CARD_ID_PATTERN = /^[A-Z0-9_-]{3,64}$/
let extendedStudentColumnsSupported = null

const normalizeCardUid = (uid) => String(uid).trim().toUpperCase()

function parseYearLevel(yearLevel) {
  if (yearLevel === null || yearLevel === undefined || yearLevel === '') return null
  const parsed = Number(yearLevel)
  if (!Number.isInteger(parsed) || parsed < 9 || parsed > 13) {
    return { error: 'year_level must be a whole number from 9 to 13' }
  }
  return parsed
}

function splitName(fullName = '') {
  const parts = String(fullName).trim().split(/\s+/).filter(Boolean)
  return {
    firstName: parts[0] || '',
    lastName: parts.slice(1).join(' '),
  }
}

function buildFullName({ first_name, last_name, full_name }) {
  const explicitName = String(full_name || '').trim()
  if (explicitName) return explicitName
  return [first_name, last_name].map((part) => String(part || '').trim()).filter(Boolean).join(' ')
}

function normalizeKainga(value) {
  if (!value) return null
  return VALID_KAINGA.find((item) => item.toLowerCase() === String(value).trim().toLowerCase()) || null
}

function validateCardUid(uid) {
  if (!uid) return null
  const normalizedUid = normalizeCardUid(uid)
  if (!CARD_ID_PATTERN.test(normalizedUid)) {
    return { error: 'RFID card ID must be 3-64 characters and use letters, numbers, _ or - only.' }
  }
  return normalizedUid
}

function generateTemporaryPassword() {
  return `Attend-${Math.random().toString(36).slice(2, 8)}-${Math.random().toString(36).slice(2, 6)}`
}

async function supportsExtendedStudentColumns() {
  if (extendedStudentColumnsSupported !== null) return extendedStudentColumnsSupported

  const { error } = await supabase
    .from('students')
    .select('first_name, last_name, kainga, form_group, account_status, rfid_status, disabled_at')
    .limit(1)

  extendedStudentColumnsSupported = !error
  if (error) {
    console.warn('[students] Extended student columns are not available yet. Apply the student-management migration to persist kainga/account/RFID status fields.')
  }

  return extendedStudentColumnsSupported
}

async function selectStudents() {
  const extended = await supportsExtendedStudentColumns()
  const { data, error } = await supabase
    .from('students')
    .select(extended ? EXTENDED_STUDENT_COLUMNS : BASE_STUDENT_COLUMNS)
    .order('full_name')

  if (error) throw new Error(error.message)
  return data || []
}

async function logAudit(req, action, targetStudentId, description, metadata = {}) {
  const { error } = await supabase
    .from('audit_logs')
    .insert([{
      action,
      actor_profile_id: req.profile.id,
      actor_email: req.profile.email,
      target_student_id: targetStudentId || null,
      description,
      metadata,
    }])

  if (error) {
    console.warn(`[audit] ${action}: ${description}`, error.message)
  }
}

async function ensureUniqueStudentNumber(studentNumber, excludeId = null) {
  let query = supabase
    .from('students')
    .select('id')
    .eq('student_number', studentNumber)
    .limit(1)

  if (excludeId) query = query.neq('id', excludeId)

  const { data, error } = await query
  if (error) return { error: error.message }
  if (data?.length) return { error: 'A student with this student ID already exists.' }
  return { ok: true }
}

async function ensureUniqueCardUid(cardUid, excludeId = null) {
  if (!cardUid) return { ok: true }

  let query = supabase
    .from('students')
    .select('id, full_name')
    .eq('rfid_card_uid', cardUid)
    .limit(1)

  if (excludeId) query = query.neq('id', excludeId)

  const { data, error } = await query
  if (error) return { error: error.message }
  if (data?.length) return { error: `RFID card is already assigned to ${data[0].full_name}.` }
  return { ok: true }
}

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

async function enrichStudents(students) {
  if (!students.length) return []

  const studentIds = students.map((student) => student.id)
  const [linksResult, enrolmentsResult, attendanceResult] = await Promise.all([
    supabase
      .from('student_profiles')
      .select('student_id, profile_id')
      .in('student_id', studentIds),
    supabase
      .from('enrolments')
      .select('student_id, classes(id, name, subject, room)')
      .in('student_id', studentIds),
    supabase
      .from('attendance')
      .select('student_id, status, scanned_at')
      .in('student_id', studentIds)
      .order('scanned_at', { ascending: false }),
  ])

  if (linksResult.error) throw new Error(linksResult.error.message)
  if (enrolmentsResult.error) throw new Error(enrolmentsResult.error.message)
  if (attendanceResult.error) throw new Error(attendanceResult.error.message)

  const links = linksResult.data || []
  const profileIds = [...new Set(links.map((link) => link.profile_id).filter(Boolean))]
  let profilesById = new Map()

  if (profileIds.length) {
    const { data: profiles, error: profilesError } = await supabase
      .from('profiles')
      .select('id, email, full_name, role, created_at')
      .in('id', profileIds)

    if (profilesError) throw new Error(profilesError.message)
    profilesById = new Map((profiles || []).map((profile) => [profile.id, profile]))
  }

  const linkByStudent = new Map(links.map((link) => [link.student_id, link]))
  const classesByStudent = new Map()
  const attendanceByStudent = new Map()

  for (const row of enrolmentsResult.data || []) {
    if (!classesByStudent.has(row.student_id)) classesByStudent.set(row.student_id, [])
    if (row.classes) classesByStudent.get(row.student_id).push(row.classes)
  }

  for (const record of attendanceResult.data || []) {
    if (!attendanceByStudent.has(record.student_id)) attendanceByStudent.set(record.student_id, [])
    attendanceByStudent.get(record.student_id).push(record)
  }

  return students.map((student) => {
    const link = linkByStudent.get(student.id)
    const profile = link?.profile_id ? profilesById.get(link.profile_id) : null
    const classes = classesByStudent.get(student.id) || []
    const attendanceRecords = attendanceByStudent.get(student.id) || []
    const parsedName = splitName(student.full_name)

    return {
      ...student,
      first_name: student.first_name || parsedName.firstName,
      last_name: student.last_name || parsedName.lastName,
      email: profile?.email || '',
      profile_id: link?.profile_id || null,
      classes,
      class_label: student.form_group || classes.map((classItem) => classItem.name).join(', '),
      account_status: student.account_status || (profile ? 'active' : 'record only'),
      rfid_status: student.rfid_status || (student.rfid_card_uid ? 'active' : 'unassigned'),
      attendance_summary: summarizeAttendance(attendanceRecords),
    }
  })
}

function applyStudentFilters(students, query) {
  const search = String(query.search || '').trim().toLowerCase()
  const accountStatus = String(query.status || 'all')
  const rfidFilter = String(query.rfid || 'all')
  const yearLevel = String(query.year_level || 'all')
  const kainga = String(query.kainga || 'all')
  const recentlyAdded = query.recent === 'true'
  const recentCutoff = Date.now() - (30 * 24 * 60 * 60 * 1000)

  return students.filter((student) => {
    const searchable = [
      student.full_name,
      student.student_number,
      student.email,
      student.rfid_card_uid,
      student.kainga,
      student.class_label,
    ].filter(Boolean).join(' ').toLowerCase()

    if (search && !searchable.includes(search)) return false
    if (accountStatus !== 'all' && student.account_status !== accountStatus) return false
    if (yearLevel !== 'all' && String(student.year_level || '') !== yearLevel) return false
    if (kainga !== 'all' && student.kainga !== kainga) return false
    if (recentlyAdded && (!student.created_at || new Date(student.created_at).getTime() < recentCutoff)) return false
    if (rfidFilter === 'missing' && student.rfid_card_uid) return false
    if (rfidFilter !== 'all' && rfidFilter !== 'missing' && student.rfid_status !== rfidFilter) return false

    return true
  })
}

async function getEnrichedStudent(id) {
  const extended = await supportsExtendedStudentColumns()
  const { data, error } = await supabase
    .from('students')
    .select(extended ? EXTENDED_STUDENT_COLUMNS : BASE_STUDENT_COLUMNS)
    .eq('id', id)
    .single()

  if (error) throw new Error(error.message)
  const [student] = await enrichStudents([data])
  return student
}

async function buildStudentPayload(body, { includeRfid = true, defaultStatus = 'active' } = {}) {
  const extended = await supportsExtendedStudentColumns()
  const fullName = buildFullName(body)
  const studentNumber = String(body.student_number || '').trim()
  const parsedYearLevel = parseYearLevel(body.year_level)

  if (!fullName) return { error: 'Student first and last name are required.' }
  if (!studentNumber) return { error: 'Student ID is required.' }
  if (parsedYearLevel?.error) return { error: parsedYearLevel.error }

  const payload = {
    full_name: fullName,
    student_number: studentNumber,
    year_level: parsedYearLevel,
  }

  if (includeRfid && body.rfid_card_uid) {
    const normalizedUid = validateCardUid(body.rfid_card_uid)
    if (normalizedUid?.error) return normalizedUid
    payload.rfid_card_uid = normalizedUid
  }

  if (extended) {
    const normalizedKainga = normalizeKainga(body.kainga)
    payload.first_name = String(body.first_name || splitName(fullName).firstName).trim()
    payload.last_name = String(body.last_name || splitName(fullName).lastName).trim()
    payload.kainga = normalizedKainga
    payload.form_group = String(body.form_group || '').trim() || null
    payload.account_status = VALID_ACCOUNT_STATUSES.includes(body.account_status) ? body.account_status : defaultStatus
    if (includeRfid) payload.rfid_status = payload.rfid_card_uid ? 'active' : 'unassigned'
  }

  return { payload, extended }
}

// Rich admin-only student management list.
router.get('/manage', requireRole('admin'), async (req, res) => {
  try {
    const students = await enrichStudents(await selectStudents())
    res.json(applyStudentFilters(students, req.query))
  } catch (error) {
    res.status(500).json({ error: error.message })
  }
})

router.get('/manage/audit-logs', requireRole('admin'), async (req, res) => {
  const { data, error } = await supabase
    .from('audit_logs')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(50)

  if (error) {
    console.warn('[audit] Could not load audit logs:', error.message)
    return res.json([])
  }

  res.json(data || [])
})

router.post('/manage', requireRole('admin'), async (req, res) => {
  const email = String(req.body.email || '').trim().toLowerCase()
  const shouldCreateLogin = Boolean(email)
  const temporaryPassword = req.body.temporary_password || (req.body.auto_generate_password ? generateTemporaryPassword() : '')
  let authUserId = null
  let studentId = null

  if (email && !isValidEmailAddress(email)) {
    return res.status(400).json({ error: 'Enter a valid email address.' })
  }

  if (shouldCreateLogin && (!temporaryPassword || temporaryPassword.length < 6)) {
    return res.status(400).json({ error: 'Temporary password must be at least 6 characters.' })
  }

  const built = await buildStudentPayload(req.body)
  if (built.error) return res.status(400).json({ error: built.error })

  const duplicateNumber = await ensureUniqueStudentNumber(built.payload.student_number)
  if (duplicateNumber.error) return res.status(409).json({ error: duplicateNumber.error })

  const duplicateCard = await ensureUniqueCardUid(built.payload.rfid_card_uid)
  if (duplicateCard.error) return res.status(409).json({ error: duplicateCard.error })

  try {
    const { data: createdStudent, error: studentError } = await supabase
      .from('students')
      .insert([built.payload])
      .select()
      .single()

    if (studentError) return res.status(500).json({ error: studentError.message })
    studentId = createdStudent.id

    let emailResult = { sent: false, error: 'No email address was provided.' }

    if (shouldCreateLogin) {
      const { data: authData, error: authError } = await supabase.auth.admin.createUser({
        email,
        password: temporaryPassword,
        email_confirm: true,
      })

      if (authError) {
        await supabase.from('students').delete().eq('id', studentId)
        return res.status(500).json({ error: authError.message })
      }

      authUserId = authData.user.id

      const { error: profileError } = await supabase
        .from('profiles')
        .insert([{
          id: authUserId,
          email,
          full_name: built.payload.full_name,
          role: 'student',
        }])

      if (profileError) {
        await supabase.auth.admin.deleteUser(authUserId)
        await supabase.from('students').delete().eq('id', studentId)
        return res.status(500).json({ error: profileError.message })
      }

      const { error: linkError } = await supabase
        .from('student_profiles')
        .insert([{ profile_id: authUserId, student_id: studentId }])

      if (linkError) {
        await supabase.auth.admin.deleteUser(authUserId)
        await supabase.from('students').delete().eq('id', studentId)
        return res.status(500).json({ error: linkError.message })
      }

      emailResult = await sendEmail({
        to: email,
        subject: 'Your AttendRFID student account has been created',
        text: [
          `Kia ora ${built.payload.full_name},`,
          '',
          'Your AttendRFID student account has been created.',
          `Email: ${email}`,
          `Temporary password: ${temporaryPassword}`,
          '',
          'Please sign in and change your password from your profile security page.',
        ].join('\n'),
      })
    }

    await logAudit(req, 'student_created', studentId, `Created student ${built.payload.full_name}`, {
      email,
      emailSent: emailResult.sent,
    })

    const student = await getEnrichedStudent(studentId)

    res.status(201).json({
      student,
      emailSent: emailResult.sent,
      emailError: emailResult.sent ? null : emailResult.error,
    })
  } catch (error) {
    if (authUserId) await supabase.auth.admin.deleteUser(authUserId)
    if (studentId) await supabase.from('students').delete().eq('id', studentId)
    res.status(500).json({ error: error.message })
  }
})

router.patch('/manage/:id', requireRole('admin'), async (req, res) => {
  const current = await getEnrichedStudent(req.params.id).catch(() => null)
  if (!current) return res.status(404).json({ error: 'Student not found' })

  const email = String(req.body.email || '').trim().toLowerCase()
  if (email && !isValidEmailAddress(email)) {
    return res.status(400).json({ error: 'Enter a valid email address.' })
  }

  const built = await buildStudentPayload({
    ...req.body,
    student_number: req.body.student_number || current.student_number,
    full_name: buildFullName(req.body) || current.full_name,
    year_level: req.body.year_level ?? current.year_level,
  }, { includeRfid: false, defaultStatus: current.account_status === 'record only' ? 'active' : current.account_status })

  if (built.error) return res.status(400).json({ error: built.error })

  const duplicateNumber = await ensureUniqueStudentNumber(built.payload.student_number, req.params.id)
  if (duplicateNumber.error) return res.status(409).json({ error: duplicateNumber.error })

  const { error: updateError } = await supabase
    .from('students')
    .update(built.payload)
    .eq('id', req.params.id)

  if (updateError) return res.status(500).json({ error: updateError.message })

  let warning = null
  if (email && current.profile_id) {
    const [{ error: profileError }, { error: authError }] = await Promise.all([
      supabase.from('profiles').update({ email, full_name: built.payload.full_name }).eq('id', current.profile_id),
      supabase.auth.admin.updateUserById(current.profile_id, { email }),
    ])

    if (profileError || authError) warning = profileError?.message || authError?.message
  } else if (email && !current.profile_id) {
    warning = 'Student record updated, but there is no linked login account to update email for.'
  } else if (current.profile_id) {
    await supabase.from('profiles').update({ full_name: built.payload.full_name }).eq('id', current.profile_id)
  }

  await logAudit(req, 'student_edited', req.params.id, `Edited student ${built.payload.full_name}`, { email, warning })
  const student = await getEnrichedStudent(req.params.id)
  res.json({ student, warning })
})

router.patch('/manage/:id/rfid', requireRole('admin'), async (req, res) => {
  const action = req.body.action || 'assign'
  const current = await getEnrichedStudent(req.params.id).catch(() => null)
  if (!current) return res.status(404).json({ error: 'Student not found' })

  const extended = await supportsExtendedStudentColumns()
  const update = {}
  let auditAction = 'rfid_updated'
  let description = `Updated RFID card for ${current.full_name}`

  if (action === 'assign' || action === 'replace') {
    const normalizedUid = validateCardUid(req.body.rfid_card_uid)
    if (normalizedUid?.error) return res.status(400).json({ error: normalizedUid.error })
    const duplicateCard = await ensureUniqueCardUid(normalizedUid, req.params.id)
    if (duplicateCard.error) return res.status(409).json({ error: duplicateCard.error })

    update.rfid_card_uid = normalizedUid
    if (extended) update.rfid_status = 'active'
    auditAction = action === 'replace' ? 'rfid_replaced' : 'rfid_assigned'
    description = `${action === 'replace' ? 'Replaced' : 'Assigned'} RFID card for ${current.full_name}`
  } else if (action === 'unassign') {
    update.rfid_card_uid = null
    if (extended) update.rfid_status = 'unassigned'
    auditAction = 'rfid_unassigned'
    description = `Unassigned RFID card for ${current.full_name}`
  } else if (action === 'deactivate' || action === 'lost') {
    update.rfid_card_uid = null
    if (extended) update.rfid_status = action === 'lost' ? 'lost' : 'inactive'
    auditAction = action === 'lost' ? 'rfid_marked_lost' : 'rfid_deactivated'
    description = `${action === 'lost' ? 'Marked RFID card as lost' : 'Deactivated RFID card'} for ${current.full_name}`
  } else {
    return res.status(400).json({ error: 'Invalid RFID action.' })
  }

  const { error } = await supabase.from('students').update(update).eq('id', req.params.id)
  if (error) return res.status(500).json({ error: error.message })

  await logAudit(req, auditAction, req.params.id, description, { action, previousCard: current.rfid_card_uid })
  const student = await getEnrichedStudent(req.params.id)
  res.json({ student, message: description })
})

router.patch('/manage/:id/status', requireRole('admin'), async (req, res) => {
  const status = req.body.account_status || 'inactive'
  if (!VALID_ACCOUNT_STATUSES.includes(status)) {
    return res.status(400).json({ error: 'Invalid account status.' })
  }

  const current = await getEnrichedStudent(req.params.id).catch(() => null)
  if (!current) return res.status(404).json({ error: 'Student not found' })

  const extended = await supportsExtendedStudentColumns()
  const update = {}

  if (extended) {
    update.account_status = status
    update.disabled_at = status === 'active' ? null : new Date().toISOString()
  }

  if (status !== 'active') {
    update.rfid_card_uid = null
    if (extended) update.rfid_status = 'inactive'
  }

  if (!Object.keys(update).length) {
    return res.status(409).json({
      error: 'Student status columns are not available yet. Apply the student-management migration.',
    })
  }

  const { error } = await supabase.from('students').update(update).eq('id', req.params.id)
  if (error) return res.status(500).json({ error: error.message })

  await logAudit(req, `student_${status}`, req.params.id, `${status === 'active' ? 'Reactivated' : 'Disabled'} student ${current.full_name}`)
  const student = await getEnrichedStudent(req.params.id)
  res.json({ student, message: status === 'active' ? 'Student reactivated.' : 'Student disabled and RFID card deactivated.' })
})

router.post('/manage/:id/resend-confirmation', requireRole('admin'), async (req, res) => {
  const current = await getEnrichedStudent(req.params.id).catch(() => null)
  if (!current) return res.status(404).json({ error: 'Student not found' })
  if (!current.email) return res.status(400).json({ error: 'Student has no linked email address.' })

  const emailResult = await sendEmail({
    to: current.email,
    subject: 'Your AttendRFID account details',
    text: [
      `Kia ora ${current.full_name},`,
      '',
      'Your AttendRFID student account is active.',
      `Email: ${current.email}`,
      '',
      'If you do not know your password, use the forgot password link on the sign-in page.',
    ].join('\n'),
  })

  await logAudit(req, 'confirmation_email_resent', req.params.id, `Resent confirmation email to ${current.email}`, {
    emailSent: emailResult.sent,
    emailError: emailResult.error,
  })

  res.status(emailResult.sent ? 200 : 202).json({
    success: true,
    emailSent: emailResult.sent,
    emailError: emailResult.sent ? null : emailResult.error,
  })
})

// GET all students for staff read-only views.
router.get('/', requireRole('teacher', 'admin'), async (req, res) => {
  try {
    const students = await selectStudents()
    res.json(students)
  } catch (error) {
    res.status(500).json({ error: error.message })
  }
})

// GET single student
router.get('/:id', requireRole('teacher', 'admin'), async (req, res) => {
  const { data, error } = await supabase
    .from('students')
    .select(BASE_STUDENT_COLUMNS)
    .eq('id', req.params.id)
    .single()

  if (error) return res.status(404).json({ error: 'Student not found' })
  res.json(data)
})

// POST create a simple student record. Rich student + login creation lives at /manage.
router.post('/', requireRole('admin'), async (req, res) => {
  const built = await buildStudentPayload(req.body)
  if (built.error) return res.status(400).json({ error: built.error })

  const duplicateNumber = await ensureUniqueStudentNumber(built.payload.student_number)
  if (duplicateNumber.error) return res.status(409).json({ error: duplicateNumber.error })

  const duplicateCard = await ensureUniqueCardUid(built.payload.rfid_card_uid)
  if (duplicateCard.error) return res.status(409).json({ error: duplicateCard.error })

  const { data, error } = await supabase
    .from('students')
    .insert([built.payload])
    .select()
    .single()

  if (error) return res.status(500).json({ error: error.message })
  await logAudit(req, 'student_created', data.id, `Created student ${data.full_name}`)
  res.status(201).json(data)
})

// PATCH assign RFID card to student. Kept for existing callers.
router.patch('/:id/assign-card', requireRole('admin'), async (req, res) => {
  const normalizedUid = validateCardUid(req.body.rfid_card_uid)
  if (normalizedUid?.error) return res.status(400).json({ error: normalizedUid.error })

  const duplicateCard = await ensureUniqueCardUid(normalizedUid, req.params.id)
  if (duplicateCard.error) return res.status(409).json({ error: duplicateCard.error })

  const extended = await supportsExtendedStudentColumns()
  const update = { rfid_card_uid: normalizedUid }
  if (extended) update.rfid_status = 'active'

  const { data, error } = await supabase
    .from('students')
    .update(update)
    .eq('id', req.params.id)
    .select()
    .single()

  if (error) return res.status(500).json({ error: error.message })
  await logAudit(req, 'rfid_assigned', req.params.id, `Assigned RFID card to ${data.full_name}`)
  res.json(data)
})

// DELETE student. Students with attendance history are disabled instead to preserve logs.
router.delete('/:id', requireRole('admin'), async (req, res) => {
  const current = await getEnrichedStudent(req.params.id).catch(() => null)
  if (!current) return res.status(404).json({ error: 'Student not found' })

  const { count, error: countError } = await supabase
    .from('attendance')
    .select('id', { count: 'exact', head: true })
    .eq('student_id', req.params.id)

  if (countError) return res.status(500).json({ error: countError.message })

  if (count > 0) {
    const extended = await supportsExtendedStudentColumns()
    if (!extended) {
      return res.status(409).json({
        error: 'Student has attendance history, so they can only be disabled after the student-management migration is applied.',
      })
    }

    const update = { rfid_card_uid: null }
    update.account_status = 'disabled'
    update.rfid_status = 'inactive'
    update.disabled_at = new Date().toISOString()

    const { error } = await supabase.from('students').update(update).eq('id', req.params.id)
    if (error) return res.status(500).json({ error: error.message })

    await logAudit(req, 'student_disabled', req.params.id, `Disabled ${current.full_name} instead of deleting because attendance history exists.`)
    const student = await getEnrichedStudent(req.params.id)
    return res.json({
      student,
      disabled: true,
      message: 'Student has attendance history, so they were disabled instead of deleted.',
    })
  }

  const { data: linkedProfile, error: linkLookupError } = await supabase
    .from('student_profiles')
    .select('profile_id')
    .eq('student_id', req.params.id)
    .maybeSingle()

  if (linkLookupError) return res.status(500).json({ error: linkLookupError.message })

  await logAudit(req, 'student_deleted', req.params.id, `Deleted student ${current.full_name}`)

  const { error } = await supabase
    .from('students')
    .delete()
    .eq('id', req.params.id)

  if (error) return res.status(500).json({ error: error.message })

  let warning = null
  if (linkedProfile?.profile_id) {
    const { error: authError } = await supabase.auth.admin.deleteUser(linkedProfile.profile_id)
    if (authError) warning = authError.message
  }

  res.json({
    deleted: true,
    message: warning
      ? `Student deleted, but linked login could not be removed: ${warning}`
      : 'Student and linked login deleted.',
    warning,
  })
})

module.exports = router
