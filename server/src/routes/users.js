const express = require('express')
const router = express.Router()
const supabase = require('../db/pool')

// POST create a new user (admin only)
router.post('/create', async (req, res) => {
  const { email, password, full_name, role } = req.body

  if (!email || !password || !full_name || !role) {
    return res.status(400).json({ error: 'All fields required' })
  }

  // Create auth user using service key (admin privileges)
  const { data: authData, error: authError } = await supabase.auth.admin.createUser({
    email,
    password,
    email_confirm: true
  })

  if (authError) return res.status(500).json({ error: authError.message })

  // Insert profile
  const { error: profileError } = await supabase
    .from('profiles')
    .insert([{ id: authData.user.id, email, full_name, role }])

  if (profileError) return res.status(500).json({ error: profileError.message })

  res.status(201).json({ success: true, id: authData.user.id })
})

module.exports = router