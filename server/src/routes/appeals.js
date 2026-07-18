const express = require('express')
const router = express.Router()
const supabase = require('../db/pool')
const { authenticateUser, requireRole } = require('../middleware/auth')
const { sendEmail } = require('../utils/email')

const VALID_APPEAL_STATUSES = ['pending', 'approved', 'rejected', 'resolved']
const VALID_ATTENDANCE_STATUSES = ['present', 'late', 'absent', 'excused']

router.use(authenticateUser)

const appealSelect = `
  *,
  students(id, full_name, student_number, kainga, la_teacher_id),
  classes(id, name, subject, room, teacher_id, profiles(full_name, email)),
  attendance(id, status, scanned_at),
  sessions(id, started_at, teacher_id)
`

function normalizeDate(value) {
  if (!value) return null
  const parsed = new Date(value)
  if (Number.isNaN(parsed.getTime())) return null
  return parsed.toISOString().slice(0, 10)
}

function publicAppeal(row) {
  return {
    ...row,
    student: row.students || null,
    class: row.classes || null,
    attendance_record: row.attendance || null,
    session: row.sessions || null,
  }
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

  if (error) console.warn(`[audit] ${action}: ${error.message}`)
}

async function getLinkedStudent(profileId) {
  const { data, error } = await supabase
    .from('student_profiles')
    .select('student_id, students(id, full_name, student_number, kainga, la_teacher_id)')
    .eq('profile_id', profileId)
    .maybeSingle()

  if (error) throw new Error(error.message)
  return data?.students ? { id: data.student_id, ...data.students } : null
}

async function getAttendanceForStudent(attendanceId, studentId) {
  if (!attendanceId) return null

  const { data, error } = await supabase
    .from('attendance')
    .select(`
      id,
      student_id,
      session_id,
      status,
      scanned_at,
      sessions(id, class_id, started_at, teacher_id, classes(id, name, subject, room, teacher_id))
    `)
    .eq('id', attendanceId)
    .eq('student_id', studentId)
    .maybeSingle()

  if (error) throw new Error(error.message)
  return data || null
}

async function getAppeal(id) {
  const { data, error } = await supabase
    .from('attendance_appeals')
    .select(appealSelect)
    .eq('id', id)
    .maybeSingle()

  if (error) throw new Error(error.message)
  return data || null
}

function teacherCanAccess(req, appeal) {
  if (req.profile.role === 'admin') return true
  if (req.profile.role !== 'teacher') return false

  return (
    appeal.classes?.teacher_id === req.profile.id ||
    appeal.sessions?.teacher_id === req.profile.id ||
    appeal.students?.la_teacher_id === req.profile.id
  )
}

function applyAdminFilters(rows, query) {
  const search = String(query.student || '').trim().toLowerCase()
  const kainga = String(query.kainga || 'all')
  const teacherId = String(query.teacher || 'all')
  const classId = String(query.class_id || 'all')
  const status = String(query.status || 'all')
  const date = normalizeDate(query.date)

  return rows.filter((row) => {
    const studentText = [
      row.students?.full_name,
      row.students?.student_number,
    ].filter(Boolean).join(' ').toLowerCase()

    if (search && !studentText.includes(search)) return false
    if (kainga !== 'all' && row.students?.kainga !== kainga) return false
    if (teacherId !== 'all' && row.classes?.teacher_id !== teacherId && row.students?.la_teacher_id !== teacherId) return false
    if (classId !== 'all' && row.class_id !== classId) return false
    if (status !== 'all' && row.status !== status) return false
    if (date && row.appeal_date !== date) return false
    return true
  })
}

async function loadNotificationRecipients({ student, classId }) {
  const recipients = []

  const { data: link } = await supabase
    .from('student_profiles')
    .select('profiles(email)')
    .eq('student_id', student.id)
    .maybeSingle()

  if (link?.profiles?.email) recipients.push({ label: 'Student', email: link.profiles.email })

  if (student.la_teacher_id) {
    const { data: laTeacher } = await supabase
      .from('profiles')
      .select('email, full_name')
      .eq('id', student.la_teacher_id)
      .maybeSingle()

    if (laTeacher?.email) recipients.push({ label: 'LA teacher', email: laTeacher.email })
  }

  if (classId) {
    const { data: classRecord } = await supabase
      .from('classes')
      .select('teacher_id, profiles(email, full_name)')
      .eq('id', classId)
      .maybeSingle()

    if (classRecord?.profiles?.email) {
      recipients.push({ label: 'Class teacher', email: classRecord.profiles.email })
    }
  }

  const uniqueEmails = [...new Set(recipients.map((item) => item.email).filter(Boolean))]
  return uniqueEmails
}

async function sendAppealEmail({ appeal, student, classRecord, attendanceRecord, requesterEmail }) {
  const recipients = await loadNotificationRecipients({ student, classId: appeal.class_id })
  const subject = `[Tago] Attendance appeal - ${student.full_name}`
  const classLabel = classRecord
    ? `${classRecord.name} (${classRecord.subject})`
    : 'Class not selected'

  return sendEmail({
    to: recipients,
    subject,
    text: [
      'A student has submitted an attendance appeal.',
      '',
      `Student: ${student.full_name}`,
      `Student email/ID: ${requesterEmail || student.student_number}`,
      `Kainga: ${student.kainga || 'Not set'}`,
      `Date: ${appeal.appeal_date}`,
      `Class: ${classLabel}`,
      `Current status: ${appeal.current_status || attendanceRecord?.status || 'Not recorded'}`,
      `Requested status: ${appeal.requested_status || 'Not specified'}`,
      `Reason: ${appeal.reason}`,
      appeal.comments ? `Comments: ${appeal.comments}` : null,
    ].filter(Boolean).join('\n'),
  })
}

router.get('/', async (req, res) => {
  try {
    let query = supabase
      .from('attendance_appeals')
      .select(appealSelect)
      .order('created_at', { ascending: false })

    if (req.profile.role === 'student') {
      const student = await getLinkedStudent(req.profile.id)
      if (!student) return res.json([])
      query = query.eq('student_id', student.id)
    }

    const { data, error } = await query
    if (error) return res.status(500).json({ error: error.message })

    let rows = data || []
    if (req.profile.role === 'teacher') {
      rows = rows.filter((appeal) => teacherCanAccess(req, appeal))
    } else if (req.profile.role === 'admin') {
      rows = applyAdminFilters(rows, req.query)
    }

    res.json(rows.map(publicAppeal))
  } catch (error) {
    res.status(500).json({ error: error.message })
  }
})

router.post('/', requireRole('student'), async (req, res) => {
  try {
    const student = await getLinkedStudent(req.profile.id)
    if (!student) return res.status(403).json({ error: 'This account is not linked to a student record.' })

    const reason = String(req.body.reason || '').trim()
    const comments = String(req.body.comments || '').trim()
    const requestedStatus = req.body.requested_status || null
    const attendanceId = req.body.attendance_id || null
    const attendanceRecord = await getAttendanceForStudent(attendanceId, student.id)
    const classId = attendanceRecord?.sessions?.class_id || req.body.class_id || null
    const appealDate = normalizeDate(req.body.appeal_date || attendanceRecord?.scanned_at)

    if (!appealDate) return res.status(400).json({ error: 'Select a valid appeal date.' })
    if (!classId && !attendanceRecord) return res.status(400).json({ error: 'Select a class or attendance record to appeal.' })
    if (!reason) return res.status(400).json({ error: 'Reason for appeal is required.' })
    if (requestedStatus && !VALID_ATTENDANCE_STATUSES.includes(requestedStatus)) {
      return res.status(400).json({ error: 'Requested status is invalid.' })
    }

    let classRecord = attendanceRecord?.sessions?.classes || null
    if (!classRecord && classId) {
      const { data, error } = await supabase
        .from('classes')
        .select('id, name, subject, room, teacher_id')
        .eq('id', classId)
        .maybeSingle()

      if (error) return res.status(500).json({ error: error.message })
      classRecord = data
    }

    const payload = {
      student_id: student.id,
      attendance_id: attendanceRecord?.id || null,
      session_id: attendanceRecord?.session_id || null,
      class_id: classRecord?.id || classId,
      appeal_date: appealDate,
      current_status: attendanceRecord?.status || req.body.current_status || null,
      requested_status: requestedStatus,
      reason,
      comments: comments || null,
      created_by_profile_id: req.profile.id,
    }

    const { data: created, error } = await supabase
      .from('attendance_appeals')
      .insert([payload])
      .select(appealSelect)
      .single()

    if (error) return res.status(500).json({ error: error.message })

    const emailResult = await sendAppealEmail({
      appeal: created,
      student,
      classRecord,
      attendanceRecord,
      requesterEmail: req.profile.email,
    })

    const { data: updated } = await supabase
      .from('attendance_appeals')
      .update({
        notification_sent: emailResult.sent,
        notification_error: emailResult.sent ? null : emailResult.error,
      })
      .eq('id', created.id)
      .select(appealSelect)
      .single()

    await logAudit(req, 'appeal_created', student.id, `Created attendance appeal for ${student.full_name}`, {
      appealId: created.id,
      emailSent: emailResult.sent,
      emailError: emailResult.error,
    })

    res.status(201).json({
      appeal: publicAppeal(updated || created),
      emailSent: emailResult.sent,
      emailError: emailResult.sent ? null : emailResult.error,
    })
  } catch (error) {
    res.status(500).json({ error: error.message })
  }
})

router.patch('/:id', requireRole('teacher', 'admin'), async (req, res) => {
  try {
    const appeal = await getAppeal(req.params.id)
    if (!appeal) return res.status(404).json({ error: 'Appeal not found.' })
    if (!teacherCanAccess(req, appeal)) return res.status(403).json({ error: 'You cannot update this appeal.' })

    const status = req.body.status || appeal.status
    const teacherResponse = String(req.body.teacher_response || '').trim()
    const correctedStatus = req.body.corrected_status || req.body.requested_status || appeal.requested_status

    if (!VALID_APPEAL_STATUSES.includes(status)) {
      return res.status(400).json({ error: 'Appeal status is invalid.' })
    }

    if (correctedStatus && !VALID_ATTENDANCE_STATUSES.includes(correctedStatus)) {
      return res.status(400).json({ error: 'Attendance correction status is invalid.' })
    }

    if (status === 'approved' && appeal.attendance_id && correctedStatus) {
      const { error: attendanceError } = await supabase
        .from('attendance')
        .update({ status: correctedStatus, manual_override: true })
        .eq('id', appeal.attendance_id)

      if (attendanceError) return res.status(500).json({ error: attendanceError.message })
    }

    const { data, error } = await supabase
      .from('attendance_appeals')
      .update({
        status,
        requested_status: correctedStatus || appeal.requested_status,
        teacher_response: teacherResponse || null,
        decided_by_profile_id: req.profile.id,
        decided_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq('id', appeal.id)
      .select(appealSelect)
      .single()

    if (error) return res.status(500).json({ error: error.message })

    await logAudit(req, 'appeal_updated', appeal.student_id, `Updated attendance appeal to ${status}`, {
      appealId: appeal.id,
      correctedStatus,
      teacherResponse,
    })

    res.json({ appeal: publicAppeal(data) })
  } catch (error) {
    res.status(500).json({ error: error.message })
  }
})

module.exports = router
