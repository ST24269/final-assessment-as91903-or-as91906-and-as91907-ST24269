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
  profiles(full_name)
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

  if (error) return res.status(404).json({ error: 'No active session' })
  if (!data) return res.status(404).json({ error: 'No active session' })
  res.json(data)
})

// POST start a session
router.post('/start', requireRole('teacher', 'admin'), async (req, res) => {
  const { class_id, teacher_id, notes } = req.body
  const sessionTeacherId = req.profile.role === 'admin'
    ? (teacher_id || req.user.id)
    : req.user.id

  if (!class_id) {
    return res.status(400).json({ error: 'class_id is required' })
  }

  const { data: classRecord, error: classError } = await supabase
    .from('classes')
    .select(classSelect)
    .eq('id', class_id)
    .single()

  if (classError || !classRecord) {
    return res.status(404).json({ error: 'Class not found' })
  }

  // Check no session already active for this class
  const { data: existing } = await supabase
    .from('sessions')
    .select(sessionSelect)
    .eq('class_id', class_id)
    .is('ended_at', null)
    .order('started_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (existing) {
    return res.status(409).json({
      error: 'A session is already active for this class',
      active_session: existing,
    })
  }

  const { data, error } = await supabase
    .from('sessions')
    .insert([{ class_id, teacher_id: sessionTeacherId, notes }])
    .select(sessionSelect)
    .single()

  if (error) return res.status(500).json({ error: error.message })
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
    return res.status(404).json({ error: 'Session not found' })
  }

  if (session.ended_at) {
    return res.json(session)
  }

  const { data, error } = await supabase
    .from('sessions')
    .update({ ended_at: new Date().toISOString() })
    .eq('id', req.params.id)
    .select(sessionSelect)
    .single()

  if (error) return res.status(500).json({ error: error.message })
  res.json(data)
})

module.exports = router
