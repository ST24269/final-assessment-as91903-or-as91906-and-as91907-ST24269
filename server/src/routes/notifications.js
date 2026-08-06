const express = require('express')
const router = express.Router()
const supabase = require('../db/pool')
const { authenticateUser } = require('../middleware/auth')

router.use(authenticateUser)

// GET notifications visible to the current user: anything sent directly to
// them, plus anything broadcast to their role (e.g. all admins).
router.get('/', async (req, res) => {
  const { data, error } = await supabase
    .from('notifications')
    .select('*')
    .or(`recipient_id.eq.${req.profile.id},recipient_role.eq.${req.profile.role}`)
    .order('created_at', { ascending: false })
    .limit(50)

  if (error) return res.status(500).json({ error: error.message })

  res.json(data)
})

// PATCH mark a single notification as read
router.patch('/:id/read', async (req, res) => {
  const { data, error } = await supabase
    .from('notifications')
    .update({ read_at: new Date().toISOString() })
    .eq('id', req.params.id)
    .select()
    .single()

  if (error) return res.status(500).json({ error: error.message })

  res.json(data)
})

// PATCH mark everything currently visible to this user as read
router.patch('/read-all', async (req, res) => {
  const { error } = await supabase
    .from('notifications')
    .update({ read_at: new Date().toISOString() })
    .or(`recipient_id.eq.${req.profile.id},recipient_role.eq.${req.profile.role}`)
    .is('read_at', null)

  if (error) return res.status(500).json({ error: error.message })

  res.json({ success: true })
})

module.exports = router