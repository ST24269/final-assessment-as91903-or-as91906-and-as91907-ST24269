const express = require('express')
const router = express.Router()
const supabase = require('../db/pool')

// GET all students
router.get('/', async (req, res) => {
  const { data, error } = await supabase
    .from('students')
    .select('*')
    .order('full_name')

  if (error) return res.status(500).json({ error: error.message })
  res.json(data)
})

// GET single student
router.get('/:id', async (req, res) => {
  const { data, error } = await supabase
    .from('students')
    .select('*')
    .eq('id', req.params.id)
    .single()

  if (error) return res.status(404).json({ error: 'Student not found' })
  res.json(data)
})

// POST create student
router.post('/', async (req, res) => {
  const { full_name, student_number, year_level } = req.body

  if (!full_name || !student_number) {
    return res.status(400).json({ error: 'full_name and student_number are required' })
  }

  const { data, error } = await supabase
    .from('students')
    .insert([{ full_name, student_number, year_level }])
    .select()
    .single()

  if (error) return res.status(500).json({ error: error.message })
  res.status(201).json(data)
})

// PATCH assign RFID card to student
router.patch('/:id/assign-card', async (req, res) => {
  const { rfid_card_uid } = req.body

  if (!rfid_card_uid) {
    return res.status(400).json({ error: 'rfid_card_uid is required' })
  }

  const { data, error } = await supabase
    .from('students')
    .update({ rfid_card_uid })
    .eq('id', req.params.id)
    .select()
    .single()

  if (error) return res.status(500).json({ error: error.message })
  res.json(data)
})

// DELETE student
router.delete('/:id', async (req, res) => {
  const { error } = await supabase
    .from('students')
    .delete()
    .eq('id', req.params.id)

  if (error) return res.status(500).json({ error: error.message })
  res.json({ message: 'Student deleted' })
})

module.exports = router