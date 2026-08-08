const express = require('express')
const router = express.Router()
const supabase = require('../db/pool')
const { authenticateUser, requireRole } = require('../middleware/auth')

const normalizeCardUid = (uid) => String(uid).trim().toUpperCase()


// Log scan results
async function logScan(readerId, rfidCardUid, scannedAt, result, processingTimeMs, errorMessage = null, extra = {}) {
  try {
    await supabase.from('scan_logs').insert([{
      reader_id: readerId,
      rfid_card_uid: rfidCardUid,
      scanned_at: scannedAt,
      result,
      processing_time_ms: processingTimeMs,
      error_message: errorMessage,
      student_id: extra.studentId || null,
      class_id: extra.classId || null,
      session_id: extra.sessionId || null,
    }])

    await supabase
      .from('readers')
      .update({ last_scan: scannedAt })
      .eq('id', readerId)

  } catch (error) {
    console.error('Error logging scan:', error)
  }
}


// NEW:
// Finds active session assigned to this physical reader
// This supports relief teachers and room changes.
async function findActiveSessionForReader(readerId) {

  console.log("Looking for active session for reader:", readerId)

  const { data, error } = await supabase
    .from('sessions')
    .select(`
      *,
      classes(
        id,
        name,
        subject,
        room
      )
    `)
    .eq('reader_id', readerId)
    .is('ended_at', null)
    .order('started_at', { ascending: false })
    .limit(1)
    .maybeSingle()


  console.log("Session found:", data)
  console.log("Error:", error)

  return data || null
}



async function getSessionAccess(req, sessionId) {

  const { data: session, error } = await supabase
    .from('sessions')
    .select('id, teacher_id')
    .eq('id', sessionId)
    .single()


  if (error || !session) {
    return {
      allowed: false,
      status: 404,
      error: 'Session not found'
    }
  }


  if (
    req.profile.role === 'admin' ||
    req.profile.role === 'teacher'
  ) {
    return {
      allowed: true,
      session
    }
  }


  return {
    allowed: false,
    status: 403,
    error: 'Only staff can access attendance sessions'
  }
}



// ESP32 scan endpoint
router.post('/scan', async (req, res) => {

  console.log(">>> /api/attendance/scan HIT")


  const startTime = Date.now()


  const {
    rfid_card_uid,
    reader_api_key,
    timestamp
  } = req.body


  const normalizedUid = rfid_card_uid
    ? normalizeCardUid(rfid_card_uid)
    : ''


  const readerApiKey = reader_api_key
    ? String(reader_api_key).trim()
    : ''



  if (!normalizedUid || !readerApiKey) {

    return res.status(400).json({
      error: 'rfid_card_uid and reader_api_key are required'
    })

  }



  let scannedAt = new Date()


  if (timestamp) {

    const parsed = new Date(timestamp)

    if (!isNaN(parsed.getTime())) {
      scannedAt = parsed
    }

  }




  // Validate reader

  const {
    data: reader,
    error: readerError
  } = await supabase
    .from('readers')
    .select('*')
    .eq('api_key', readerApiKey)
    .eq('active', true)
    .maybeSingle()



  if (readerError || !reader) {

    await logScan(
      null,
      normalizedUid,
      scannedAt,
      'reader_inactive',
      Date.now() - startTime,
      'Invalid or inactive reader'
    )


    return res.status(401).json({
      error: 'Invalid or inactive reader'
    })

  }




  // Reader ID is the source of truth now
  if (!reader.id) {

    await logScan(
      null,
      normalizedUid,
      scannedAt,
      'error',
      Date.now() - startTime,
      'Reader ID missing'
    )


    return res.status(409).json({
      error: 'Invalid reader'
    })

  }




  await supabase
    .from('readers')
    .update({
      last_seen: new Date().toISOString(),
      online_status: 'online'
    })
    .eq('id', reader.id)




  // Onboarding check

  const {
    data: pendingOnboarding
  } = await supabase
    .from('onboarding_sessions')
    .select('*, students(*)')
    .eq('reader_id', reader.id)
    .eq('status', 'awaiting_scan')
    .gte('expires_at', new Date().toISOString())
    .maybeSingle()



  if (pendingOnboarding) {

    return handleOnboardingTap(
      pendingOnboarding,
      normalizedUid,
      reader,
      res,
      startTime
    )

  }





  // Find student

  const {
    data: student,
    error: studentError
  } = await supabase
    .from('students')
    .select('*')
    .eq('rfid_card_uid', normalizedUid)
    .maybeSingle()



  if (studentError || !student) {


    const sessionForReader =
      await findActiveSessionForReader(reader.id)



    await logScan(
      reader.id,
      normalizedUid,
      scannedAt,
      'invalid_card',
      Date.now() - startTime,
      `Unrecognised card tapped at ${reader.label || reader.id}`,
      {
        classId: sessionForReader?.class_id,
        sessionId: sessionForReader?.id
      }
    )


    return res.status(404).json({
      error: 'Card not registered to any student'
    })

  }




  // NEW:
  // Find session using reader_id
  const activeSession =
    await findActiveSessionForReader(reader.id)




  if (!activeSession) {


    await logScan(
      reader.id,
      normalizedUid,
      scannedAt,
      'no_session',
      Date.now() - startTime,
      'No active session for reader'
    )


    return res.status(404).json({
      error: 'No active session for this reader'
    })

  }




  // Check enrolment

  const {
    data: enrolment,
    error: enrolmentError
  } = await supabase
    .from('enrolments')
    .select('id')
    .eq('class_id', activeSession.class_id)
    .eq('student_id', student.id)
    .maybeSingle()



  if (enrolmentError || !enrolment) {

    await logScan(
      reader.id,
      normalizedUid,
      scannedAt,
      'not_enrolled',
      Date.now() - startTime,
      `${student.full_name} is not enrolled`,
      {
        studentId: student.id,
        classId: activeSession.class_id,
        sessionId: activeSession.id
      }
    )


    return res.status(409).json({
      error: 'Student is not enrolled in the active class',
      student: student.full_name
    })

  }




  // Existing attendance check

  const {
    data: existing
  } = await supabase
    .from('attendance')
    .select('*')
    .eq('session_id', activeSession.id)
    .eq('student_id', student.id)
    .maybeSingle()



  if (existing) {

    await logScan(
      reader.id,
      normalizedUid,
      scannedAt,
      'duplicate',
      Date.now() - startTime,
      'Already marked present'
    )


    return res.status(409).json({
      error: 'Student already marked present',
      student: student.full_name
    })

  }



  const sessionStart =
    new Date(activeSession.started_at)


  const minutesLate =
    (scannedAt - sessionStart) / 60000


  const status =
    minutesLate > 10 ? 'late' : 'present'



  const {
    data: record,
    error: recordError
  } = await supabase
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

    await logScan(
      reader.id,
      normalizedUid,
      scannedAt,
      'error',
      Date.now() - startTime,
      recordError.message
    )


    return res.status(500).json({
      error: recordError.message
    })

  }



  await logScan(
    reader.id,
    normalizedUid,
    scannedAt,
    'success',
    Date.now() - startTime
  )



  res.status(201).json({
    success: true,
    student: student.full_name,
    status,
    scanned_at: record.scanned_at,
    processing_time_ms: Date.now() - startTime
  })

})


// Added this because taps with no session running were just dead-ending
// in "No active session" with nothing useful. Same reader auth as /scan,
// but skips the session check entirely - it's read-only, so there's no
// harm in it working any time. Frontend "scan a card" search box hits a
// different route (needs a logged-in teacher/admin), this one is for the
// classroom reader itself.
router.post('/lookup', async (req, res) => {
  const { rfid_card_uid, reader_api_key } = req.body

  const normalizedUid = rfid_card_uid ? normalizeCardUid(rfid_card_uid) : ''
  const readerApiKey = reader_api_key ? String(reader_api_key).trim() : ''

  if (!normalizedUid || !readerApiKey) {
    return res.status(400).json({ error: 'rfid_card_uid and reader_api_key are required' })
  }

  // Same reader check as /scan - don't want randoms hitting this without
  // a valid reader key even though it's just a lookup.
  const { data: reader, error: readerError } = await supabase
    .from('readers')
    .select('id')
    .eq('api_key', readerApiKey)
    .eq('active', true)
    .maybeSingle()

  if (readerError || !reader) {
    return res.status(401).json({ error: 'Invalid or inactive reader' })
  }

  const { data: student, error: studentError } = await supabase
    .from('students')
    .select('id, full_name, student_number, year_level, kainga, la_teacher_id')
    .eq('rfid_card_uid', normalizedUid)
    .maybeSingle()

  if (studentError) return res.status(500).json({ error: studentError.message })
  if (!student) return res.status(404).json({ error: 'Card not registered to any student' })

  // LA teacher name - not critical if this fails, just leave it blank
  let laTeacherName = ''
  if (student.la_teacher_id) {
    const { data: teacher } = await supabase
      .from('profiles')
      .select('full_name')
      .eq('id', student.la_teacher_id)
      .maybeSingle()
    laTeacherName = teacher?.full_name || ''
  }

  const { data: enrolments } = await supabase
    .from('enrolments')
    .select('classes(name, subject, room)')
    .eq('student_id', student.id)

  const classes = (enrolments || [])
    .map((row) => row.classes)
    .filter(Boolean)

  res.json({
    full_name: student.full_name,
    student_number: student.student_number,
    year_level: student.year_level,
    kainga: student.kainga,
    la_teacher_name: laTeacherName,
    classes,
  })
})


// POST /api/attendance/bulk-upload
// Upload cached offline scans from ESP32
router.post('/bulk-upload', async (req, res) => {

  const {
    scans,
    reader_id,
    api_key
  } = req.body


  if (
    !scans ||
    !Array.isArray(scans) ||
    !reader_id ||
    !api_key
  ) {
    return res.status(400).json({
      error: 'scans (array), reader_id, and api_key are required'
    })
  }



  const {
    data: reader,
    error: readerError
  } = await supabase
    .from('readers')
    .select('*')
    .eq('id', reader_id)
    .eq('api_key', api_key)
    .eq('active', true)
    .maybeSingle()



  if (readerError || !reader) {

    return res.status(401).json({
      error: 'Invalid reader credentials'
    })

  }



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


    const {
      rfid_card_uid,
      scanned_at
    } = scan


    const normalizedUid =
      normalizeCardUid(rfid_card_uid)


    const scanTime =
      new Date(scanned_at)



    try {


      const {
        data: student
      } = await supabase
        .from('students')
        .select('id, full_name')
        .eq('rfid_card_uid', normalizedUid)
        .maybeSingle()



      if (!student) {


        const session =
          await findActiveSessionForReader(reader.id)



        await logScan(
          reader.id,
          normalizedUid,
          scanTime,
          'invalid_card',
          0,
          'Card not registered',
          {
            classId: session?.class_id,
            sessionId: session?.id
          }
        )



        results.push({
          rfid_card_uid,
          status: 'failed',
          error: 'Card not registered'
        })


        failCount++

        continue

      }





      const activeSession =
        await findActiveSessionForReader(reader.id)



      if (!activeSession) {


        await logScan(
          reader.id,
          normalizedUid,
          scanTime,
          'no_session',
          0,
          'No active session'
        )


        results.push({
          rfid_card_uid,
          status: 'failed',
          error: 'No active session'
        })


        failCount++

        continue

      }




      const {
        data: enrolment
      } = await supabase
        .from('enrolments')
        .select('id')
        .eq('class_id', activeSession.class_id)
        .eq('student_id', student.id)
        .maybeSingle()



      if (!enrolment) {


        await logScan(
          reader.id,
          normalizedUid,
          scanTime,
          'not_enrolled',
          0,
          `${student.full_name} is not enrolled`,
          {
            studentId: student.id,
            classId: activeSession.class_id,
            sessionId: activeSession.id
          }
        )


        results.push({
          rfid_card_uid,
          status: 'failed',
          error: 'Not enrolled'
        })


        failCount++

        continue

      }




      const {
        data: existing
      } = await supabase
        .from('attendance')
        .select('id')
        .eq('session_id', activeSession.id)
        .eq('student_id', student.id)
        .maybeSingle()



      if (existing) {


        await logScan(
          reader.id,
          normalizedUid,
          scanTime,
          'duplicate',
          0,
          'Already recorded'
        )


        results.push({
          rfid_card_uid,
          status: 'skipped',
          error: 'Already recorded'
        })


        continue

      }





      const sessionStart =
        new Date(activeSession.started_at)


      const minutesLate =
        (scanTime - sessionStart) / 60000



      const status =
        minutesLate > 10
          ? 'late'
          : 'present'




      await supabase
        .from('attendance')
        .insert([{
          session_id: activeSession.id,
          student_id: student.id,
          status,
          flagged: false,
          scanned_at: scanTime.toISOString()
        }])



      await logScan(
        reader.id,
        normalizedUid,
        scanTime,
        'success',
        0,
        'Offline upload'
      )



      results.push({
        rfid_card_uid,
        status: 'success'
      })



      successCount++



    } catch(error) {


      await logScan(
        reader.id,
        normalizedUid,
        scanTime,
        'error',
        0,
        error.message
      )



      results.push({
        rfid_card_uid,
        status: 'failed',
        error: error.message
      })


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




// GET reader logs
router.get(
  '/reader-logs/:readerId',
  authenticateUser,
  requireRole('admin'),
  async (req, res) => {

    try {

      const {
        data,
        error
      } = await supabase
        .from('scan_logs')
        .select('*')
        .eq('reader_id', req.params.readerId)
        .order('created_at', {
          ascending: false
        })
        .limit(100)



      if (error) throw error


      res.json(data || [])



    } catch(error) {

      res.status(500).json({
        error: error.message
      })

    }

})



router.use(authenticateUser)



// POST manual roll for a session - the Manual Roll backup page's "Save"
// button. Upserts one attendance row per student in the payload (insert if
// this student has no row yet for this session, update their status if
// they do - e.g. an RFID scan already marked them and the teacher is just
// correcting it by hand). Every row is flagged source: 'manual' and
// manual_override: true so it's clearly distinguishable from a scan.
router.post(
  '/manual/:session_id',
  requireRole('teacher', 'admin'),
  async (req, res) => {

    const records = Array.isArray(req.body.records) ? req.body.records : []

    if (!records.length) {
      return res.status(400).json({ error: 'records is required and must be a non-empty array' })
    }

    const VALID_STATUSES = ['present', 'late', 'absent', 'excused']
    for (const record of records) {
      if (!record.student_id || !VALID_STATUSES.includes(record.status)) {
        return res.status(400).json({
          error: 'Each record needs a student_id and a valid status (present, late, absent, excused)',
        })
      }
    }

    const access = await getSessionAccess(req, req.params.session_id)

    if (!access.allowed) {
      return res.status(access.status).json({ error: access.error })
    }

    // Only students actually enrolled in this session's class can be
    // marked, same rule the RFID scan path already enforces.
    const { data: session, error: sessionError } = await supabase
      .from('sessions')
      .select('id, class_id')
      .eq('id', req.params.session_id)
      .single()

    if (sessionError || !session) {
      return res.status(404).json({ error: 'Session not found' })
    }

    const { data: enrolments, error: enrolmentError } = await supabase
      .from('enrolments')
      .select('student_id')
      .eq('class_id', session.class_id)
      .in('student_id', records.map((record) => record.student_id))

    if (enrolmentError) {
      return res.status(500).json({ error: enrolmentError.message })
    }

    const enrolledIds = new Set((enrolments || []).map((row) => row.student_id))
    const notEnrolled = records.filter((record) => !enrolledIds.has(record.student_id))

    if (notEnrolled.length) {
      return res.status(409).json({
        error: `${notEnrolled.length} student(s) in this submission are not enrolled in this class.`,
      })
    }

    const now = new Date().toISOString()
    const rows = records.map((record) => ({
      session_id: req.params.session_id,
      student_id: record.student_id,
      status: record.status,
      scanned_at: now,
      source: 'manual',
      manual_override: true,
    }))

    const { data, error } = await supabase
      .from('attendance')
      .upsert(rows, { onConflict: 'session_id,student_id' })
      .select()

    if (error) {
      return res.status(500).json({ error: error.message })
    }

    res.json(data)
  }
)



router.get(
  '/session/:session_id',
  requireRole('teacher', 'admin'),
  async (req, res) => {


    const access =
      await getSessionAccess(
        req,
        req.params.session_id
      )



    if (!access.allowed) {

      return res.status(access.status)
        .json({
          error: access.error
        })

    }



    const {
      data,
      error
    } = await supabase
      .from('attendance')
      .select(`
        *,
        students(
          full_name,
          student_number,
          year_level,
          photo_url,
          kainga,
          la_teacher:profiles!la_teacher_id(full_name)
        )
      `)
      .eq('session_id', req.params.session_id)
      .order('scanned_at')



    if (error) {

      return res.status(500)
        .json({
          error: error.message
        })

    }


    res.json(data)

})



router.get(
  '/:id',
  requireRole('teacher', 'admin'),
  async (req, res) => {


    const {
      data: existing,
      error: existingError
    } = await supabase
      .from('attendance')
      .select('id, session_id')
      .eq('id', req.params.id)
      .single()



    if (existingError || !existing) {

      return res.status(404)
        .json({
          error: 'Attendance record not found'
        })

    }



    const access =
      await getSessionAccess(
        req,
        existing.session_id
      )



    if (!access.allowed) {

      return res.status(access.status)
        .json({
          error: access.error
        })

    }




    const {
      data,
      error
    } = await supabase
      .from('attendance')
      .select(`
        *,
        students(
          full_name,
          student_number,
          year_level,
          photo_url,
          kainga,
          la_teacher:profiles!la_teacher_id(full_name)
        )
      `)
      .eq('id', req.params.id)
      .single()



    if (error) {

      return res.status(500)
        .json({
          error: error.message
        })

    }



    res.json(data)

})



// PATCH photo-verification decision (the live feed's Match / No Match buttons)
router.patch(
  '/:id/verify',
  requireRole('teacher', 'admin'),
  async (req, res) => {

    const { decision } = req.body

    if (decision !== null && !['match', 'no_match'].includes(decision)) {
      return res.status(400).json({
        error: 'decision must be "match", "no_match", or null'
      })
    }

    const {
      data: existing,
      error: existingError
    } = await supabase
      .from('attendance')
      .select('id, session_id')
      .eq('id', req.params.id)
      .single()

    if (existingError || !existing) {
      return res.status(404).json({
        error: 'Attendance record not found'
      })
    }

    const access = await getSessionAccess(req, existing.session_id)

    if (!access.allowed) {
      return res.status(access.status).json({
        error: access.error
      })
    }

    const { data, error } = await supabase
      .from('attendance')
      .update({ photo_verified: decision })
      .eq('id', req.params.id)
      .select()
      .single()

    if (error) {
      return res.status(500).json({
        error: error.message
      })
    }

    res.json(data)
  }
)



router.patch(
  '/:id',
  requireRole('teacher', 'admin'),
  async (req, res) => {


    const {
      status
    } = req.body



    if (![
      'present',
      'late',
      'absent',
      'excused'
    ].includes(status)) {

      return res.status(400)
        .json({
          error: 'Invalid status'
        })

    }




    const {
      data: existing,
      error: existingError
    } = await supabase
      .from('attendance')
      .select('id, session_id')
      .eq('id', req.params.id)
      .single()



    if (existingError || !existing) {

      return res.status(404)
        .json({
          error: 'Attendance record not found'
        })

    }



    const access =
      await getSessionAccess(
        req,
        existing.session_id
      )



    if (!access.allowed) {

      return res.status(access.status)
        .json({
          error: access.error
        })

    }



    const {
      data,
      error
    } = await supabase
      .from('attendance')
      .update({
        status,
        manual_override: true
      })
      .eq('id', req.params.id)
      .select()
      .single()



    if (error) {

      return res.status(500)
        .json({
          error: error.message
        })

    }



    res.json(data)

})



module.exports = router