const express = require('express')
const router = express.Router()
const supabase = require('../db/pool')
const { authenticateUser, requireRole } = require('../middleware/auth')

router.use(authenticateUser)

const classSelect = `
  id,
  teacher_id,
  name,
  subject,
  room,
  profiles(full_name)
`

const sessionSelect = `
  *,
  classes(name, subject, room),
  readers(id, room),
  profiles!sessions_teacher_id_fkey(full_name)
`

// GET classes available for attendance sessions
router.get('/classes', requireRole('teacher', 'admin'), async (req, res) => {
  const { data, error } = await supabase
    .from('classes')
    .select(classSelect)
    .order('name')

  if (error) return res.status(500).json({ error: error.message })

  res.json(data)
})


// GET all sessions
router.get('/', requireRole('teacher', 'admin'), async (req, res) => {
  const { data, error } = await supabase
    .from('sessions')
    .select(sessionSelect)
    .order('started_at', { ascending: false })

  if (error) return res.status(500).json({ error: error.message })

  res.json(data)
})


// GET all submitted sessions - the admin review queue
router.get('/submitted', requireRole('admin'), async (req, res) => {
  const { data, error } = await supabase
    .from('sessions')
    .select(sessionSelect)
    .not('submitted_at', 'is', null)
    .order('submitted_at', { ascending: false })

  if (error) return res.status(500).json({ error: error.message })

  res.json(data)
})


// GET active session for a class
router.get('/active/:class_id', requireRole('teacher', 'admin'), async (req, res) => {
  const { data, error } = await supabase
    .from('sessions')
    .select(sessionSelect)
    .eq('class_id', req.params.class_id)
    .is('ended_at', null)
    .order('started_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (error) {
    return res.status(404).json({ error: 'No active session' })
  }

  if (!data) {
    return res.status(404).json({ error: 'No active session' })
  }

  res.json(data)
})


// POST start a session
router.post('/start', requireRole('teacher', 'admin'), async (req, res) => {

  const {
    class_id,
    notes,
    reader_id: providedReaderId,
    // Not yet persisted - see note below on why this isn't inserted yet.
    covering_for_teacher_id,
  } = req.body

  if (!class_id) {
    return res.status(400).json({
      error: 'class_id is required'
    })
  }

  // Check class exists
  const { data: classRecord, error: classError } = await supabase
    .from('classes')
    .select(classSelect)
    .eq('id', class_id)
    .single()

  if (classError || !classRecord) {
    return res.status(404).json({
      error: 'Class not found'
    })
  }

  // Resolve the reader for this session. If the caller explicitly supplied
  // one, use it (still validated below). Otherwise - the normal case, since
  // nothing in the UI currently collects a reader_id - match a reader to
  // this class automatically by room, the same way attendance.js already
  // matches an incoming scan to a session by room.
  let readerRecord = null

  if (providedReaderId) {
    const { data, error } = await supabase
      .from('readers')
      .select('id, room')
      .eq('id', providedReaderId)
      .single()

    if (error || !data) {
      return res.status(404).json({ error: 'Reader not found' })
    }

    readerRecord = data
  } else {
    if (!classRecord.room) {
      return res.status(409).json({
        error: `"${classRecord.name}" has no learning area/room set, so no classroom reader can be matched. Set the class's learning area in Manage Classes first.`,
      })
    }

    const { data: readersForRoom, error: readerLookupError } = await supabase
      .from('readers')
      .select('id, room')
      .eq('room', classRecord.room)
      .eq('active', true)

    if (readerLookupError) {
      return res.status(500).json({ error: readerLookupError.message })
    }

    if (!readersForRoom || readersForRoom.length === 0) {
      return res.status(404).json({
        error: `No active classroom reader is registered for room "${classRecord.room}".`,
      })
    }

    if (readersForRoom.length > 1) {
      return res.status(409).json({
        error: `Multiple active readers are registered for room "${classRecord.room}". Pass reader_id explicitly to choose one.`,
        readers: readersForRoom,
      })
    }

    readerRecord = readersForRoom[0]
  }

  // Prevent duplicate active class sessions
  const { data: existingClassSession } = await supabase
    .from('sessions')
    .select(sessionSelect)
    .eq('class_id', class_id)
    .is('ended_at', null)
    .order('started_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (existingClassSession) {
    return res.status(409).json({
      error: 'A session is already active for this class',
      active_session: existingClassSession
    })
  }

  // Prevent duplicate reader sessions
  const { data: existingReaderSession } = await supabase
    .from('sessions')
    .select(sessionSelect)
    .eq('reader_id', readerRecord.id)
    .is('ended_at', null)
    .order('started_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (existingReaderSession) {
    return res.status(409).json({
      error: 'A session is already active on this reader',
      active_session: existingReaderSession
    })
  }

  // NOTE: `covering_for_teacher_id` is accepted above but intentionally not
  // written to the sessions table yet - this schema's `sessions` table
  // (per sessionSelect) only has class_id/teacher_id/reader_id/notes, no
  // column to record who covered the class. If you want that tracked,
  // add a `covering_for_teacher_id` column to `sessions` and uncomment
  // the line below.
  const { data, error } = await supabase
    .from('sessions')
    .insert([
      {
        class_id,
        teacher_id: req.profile.id,
        reader_id: readerRecord.id,
        notes,
        // covering_for_teacher_id: covering_for_teacher_id || null,
      }
    ])
    .select(sessionSelect)
    .single()

  if (error) {
    return res.status(500).json({
      error: error.message
    })
  }

  res.status(201).json(data)
})



// PATCH end a session
router.patch('/:id/end', requireRole('teacher', 'admin'), async (req, res) => {

  const { data: session, error: sessionError } = await supabase
    .from('sessions')
    .select('id, ended_at')
    .eq('id', req.params.id)
    .single()


  if (sessionError || !session) {
    return res.status(404).json({
      error: 'Session not found'
    })
  }


  if (session.ended_at) {
    return res.json(session)
  }


  const { data, error } = await supabase
    .from('sessions')
    .update({
      ended_at: new Date().toISOString()
    })
    .eq('id', req.params.id)
    .select(sessionSelect)
    .single()


  if (error) {
    return res.status(500).json({
      error: error.message
    })
  }


  res.json(data)
})


// PATCH submit a session's attendance for admin review
// Must be ended first - submitting is a separate, explicit "this is final"
// step from ending, so a teacher can review the roll before sending it on.
router.patch('/:id/submit', requireRole('teacher', 'admin'), async (req, res) => {

  const { data: session, error: sessionError } = await supabase
    .from('sessions')
    .select(sessionSelect)
    .eq('id', req.params.id)
    .single()

  if (sessionError || !session) {
    return res.status(404).json({
      error: 'Session not found'
    })
  }

  if (!session.ended_at) {
    return res.status(409).json({
      error: 'End the session before submitting attendance.'
    })
  }

  if (session.submitted_at) {
    return res.json(session)
  }

  const { data, error } = await supabase
    .from('sessions')
    .update({ submitted_at: new Date().toISOString() })
    .eq('id', req.params.id)
    .select(sessionSelect)
    .single()

  if (error) {
    return res.status(500).json({
      error: error.message
    })
  }

  // Notify every admin. Failure to notify shouldn't fail the submission
  // itself, so this is best-effort.
  try {
    await supabase.from('notifications').insert([{
      recipient_role: 'admin',
      type: 'info',
      title: 'Attendance submitted',
      message: `${data.classes?.name || 'A class'} attendance was submitted by ${req.profile.full_name || 'a teacher'} for review.`,
      session_id: data.id,
    }])
  } catch (notifyError) {
    console.error('Failed to create submission notification:', notifyError)
  }

  res.json(data)
})


module.exports = router