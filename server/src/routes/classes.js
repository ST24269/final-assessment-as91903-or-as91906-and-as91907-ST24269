const express = require('express')
const router = express.Router()
const supabase = require('../db/pool')
const { authenticateUser, requireRole } = require('../middleware/auth')

const classSelect = '*, profiles(full_name)'

router.use(authenticateUser)

// GET /api/classes - list all classes (any authenticated role can read;
// tighten to requireRole('admin') if this should be admin-only)
router.get('/', async (_req, res) => {
  const { data, error } = await supabase
    .from('classes')
    .select(classSelect)
    .order('name')

  if (error) return res.status(500).json({ error: error.message })
  res.json(data || [])
})

// POST /api/classes - create a class (admin only)
router.post('/', requireRole('admin'), async (req, res) => {
  const name = String(req.body.name || '').trim()
  const subject = String(req.body.subject || '').trim()
  const room = String(req.body.room || '').trim() || null
  const teacherId = req.body.teacher_id || null

  if (!name || !subject) {
    return res.status(400).json({ error: 'Name and subject required' })
  }

  const { data, error } = await supabase
    .from('classes')
    .insert([{ name, subject, room, teacher_id: teacherId }])
    .select(classSelect)
    .single()

  if (error) return res.status(500).json({ error: error.message })
  res.status(201).json(data)
})

// PATCH /api/classes/:id - update a class (admin only)
router.patch('/:id', requireRole('admin'), async (req, res) => {
  const payload = {}
  if (req.body.name !== undefined) payload.name = String(req.body.name).trim()
  if (req.body.subject !== undefined) payload.subject = String(req.body.subject).trim()
  if (req.body.room !== undefined) payload.room = String(req.body.room).trim() || null
  if (req.body.teacher_id !== undefined) payload.teacher_id = req.body.teacher_id || null

  if (payload.name === '') return res.status(400).json({ error: 'Name cannot be empty' })
  if (payload.subject === '') return res.status(400).json({ error: 'Subject cannot be empty' })

  const { data, error } = await supabase
    .from('classes')
    .update(payload)
    .eq('id', req.params.id)
    .select(classSelect)
    .single()

  if (error) return res.status(500).json({ error: error.message })
  res.json(data)
})

// DELETE /api/classes/:id - delete a class (admin only)
router.delete('/:id', requireRole('admin'), async (req, res) => {
  const { error } = await supabase
    .from('classes')
    .delete()
    .eq('id', req.params.id)

  if (error) return res.status(500).json({ error: error.message })
  res.json({ deleted: true })
})

module.exports = router