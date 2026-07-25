const express = require('express')
const router = express.Router()
const supabase = require('../db/pool')
const { authenticateUser, requireRole } = require('../middleware/auth')

// Every non-success scan result. 'success' scans live in the live feed, not here.
const ERROR_RESULTS = ['invalid_card', 'not_enrolled', 'no_session', 'reader_inactive', 'duplicate', 'error']

router.use(authenticateUser)
router.use(requireRole('admin'))

const errorSelect = `
  *,
  readers(id, label, room),
  students(id, full_name, student_number),
  classes(id, name, subject, room, teacher_id, profiles(full_name, email))
`

function publicError(row) {
  return {
    ...row,
    reader: row.readers || null,
    student: row.students || null,
    class: row.classes || null,
  }
}

// GET /api/errors - list scan errors, newest first, with optional filters
router.get('/', async (req, res) => {
  try {
    const { result, resolved, reader_id, class_id, from, to } = req.query

    let query = supabase
      .from('scan_logs')
      .select(errorSelect)
      .in('result', ERROR_RESULTS)
      .order('created_at', { ascending: false })
      .limit(500)

    if (result && ERROR_RESULTS.includes(result)) query = query.eq('result', result)
    if (resolved === 'true') query = query.eq('resolved', true)
    if (resolved === 'false') query = query.eq('resolved', false)
    if (reader_id) query = query.eq('reader_id', reader_id)
    if (class_id) query = query.eq('class_id', class_id)
    if (from) query = query.gte('created_at', from)
    if (to) query = query.lte('created_at', to)

    const { data, error } = await query
    if (error) return res.status(500).json({ error: error.message })

    res.json((data || []).map(publicError))
  } catch (error) {
    res.status(500).json({ error: error.message })
  }
})

// GET /api/errors/summary - counts for the admin dashboard header
router.get('/summary', async (req, res) => {
  try {
    const { count: unresolved } = await supabase
      .from('scan_logs')
      .select('*', { count: 'exact', head: true })
      .in('result', ERROR_RESULTS)
      .eq('resolved', false)

    const { count: today } = await supabase
      .from('scan_logs')
      .select('*', { count: 'exact', head: true })
      .in('result', ERROR_RESULTS)
      .gte('created_at', new Date().toISOString().split('T')[0])

    const { count: wrongClass } = await supabase
      .from('scan_logs')
      .select('*', { count: 'exact', head: true })
      .eq('result', 'not_enrolled')
      .eq('resolved', false)

    const { count: unrecognisedCard } = await supabase
      .from('scan_logs')
      .select('*', { count: 'exact', head: true })
      .eq('result', 'invalid_card')
      .eq('resolved', false)

    res.json({
      unresolved: unresolved || 0,
      today: today || 0,
      wrong_class_unresolved: wrongClass || 0,
      unrecognised_card_unresolved: unrecognisedCard || 0,
    })
  } catch (error) {
    res.status(500).json({ error: error.message })
  }
})

// PATCH /api/errors/:id - mark an error resolved / reopen it
router.patch('/:id', async (req, res) => {
  try {
    const resolved = Boolean(req.body.resolved)

    const { data, error } = await supabase
      .from('scan_logs')
      .update({
        resolved,
        resolved_by: resolved ? req.profile.id : null,
        resolved_at: resolved ? new Date().toISOString() : null,
      })
      .eq('id', req.params.id)
      .select(errorSelect)
      .single()

    if (error) return res.status(500).json({ error: error.message })
    if (!data) return res.status(404).json({ error: 'Error log not found' })

    res.json(publicError(data))
  } catch (error) {
    res.status(500).json({ error: error.message })
  }
})

module.exports = router