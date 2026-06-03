const express = require('express')
const router = express.Router()
const supabase = require('../db/pool')

// GET all sessions
router.get('/', async (req, res) => {
  const { data, error } = await supabase
    .from('sessions')
    .select(`
      *,
      classes(name, subject, room),
      profiles(full_name)
    `)
    .order('started_at', { ascending: false })

  if (error) return res.status(500).json({ error: error.message })
  res.json(data)
})

// GET active session for a class
router.get('/active/:class_id', async (req, res) => {
  const { data, error } = await supabase
    .from('sessions')
    .select('*')
    .eq('class_id', req.params.class_id)
    .is('ended_at', null)
    .single()

  if (error) return res.status(404).json({ error: 'No active session' })
  res.json(data)
})

// POST start a session
router.post('/start', async (req, res) => {
  const { class_id, teacher_id, notes } = req.body

  if (!class_id || !teacher_id) {
    return res.status(400).json({ error: 'class_id and teacher_id are required' })
  }

  // Check no session already active for this class
  const { data: existing } = await supabase
    .from('sessions')
    .select('id')
    .eq('class_id', class_id)
    .is('ended_at', null)
    .single()

  if (existing) {
    return res.status(409).json({ error: 'A session is already active for this class' })
  }

  const { data, error } = await supabase
    .from('sessions')
    .insert([{ class_id, teacher_id, notes }])
    .select()
    .single()

  if (error) return res.status(500).json({ error: error.message })
  res.status(201).json(data)
})

// PATCH end a session
router.patch('/:id/end', async (req, res) => {
  const { data, error } = await supabase
    .from('sessions')
    .update({ ended_at: new Date().toISOString() })
    .eq('id', req.params.id)
    .select()
    .single()

  if (error) return res.status(500).json({ error: error.message })
  res.json(data)
})

module.exports = router