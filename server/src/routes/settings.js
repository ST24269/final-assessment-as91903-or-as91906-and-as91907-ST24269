const express = require('express')
const router = express.Router()
const supabase = require('../db/pool')
const { authenticateUser, requireRole } = require('../middleware/auth')

router.use(authenticateUser)

// Falls back to testing mode "off" if the system_settings table hasn't been
// created yet (the onboarding-migration.sql that adds it is applied by hand
// in the Supabase SQL editor, same as this project's other migrations) -
// mirrors students.js's supportsExtendedStudentColumns() defensive pattern,
// so POST /sessions/start keeps working normally before that migration runs.
async function getSystemSettings() {
  const { data, error } = await supabase
    .from('system_settings')
    .select('testing_mode_enabled, updated_at')
    .eq('id', true)
    .single()

  if (error) {
    console.warn('[settings] system_settings table is not available yet. Apply the onboarding migration to enable Testing Mode.')
    return { testing_mode_enabled: false, updated_at: null }
  }

  return data
}

// GET current testing-mode state. Teachers can read this too, since it
// explains why the timetable-period check on POST /sessions/start might
// not be enforced right now.
router.get('/testing-mode', requireRole('teacher', 'admin'), async (req, res) => {
  try {
    const settings = await getSystemSettings()
    res.json({ enabled: settings.testing_mode_enabled, updated_at: settings.updated_at })
  } catch (error) {
    res.status(500).json({ error: error.message })
  }
})

// PATCH toggle testing mode. While enabled, POST /sessions/start skips the
// "is this class scheduled right now" check for teachers too - the same
// bypass admins already get - so any class can be started (and therefore
// scanned against) at any time of day for testing.
router.patch('/testing-mode', requireRole('admin'), async (req, res) => {
  const enabled = Boolean(req.body.enabled)

  const { data, error } = await supabase
    .from('system_settings')
    .update({
      testing_mode_enabled: enabled,
      updated_at: new Date().toISOString(),
      updated_by: req.profile.id,
    })
    .eq('id', true)
    .select('testing_mode_enabled, updated_at')
    .single()

  if (error) return res.status(500).json({ error: error.message })

  await supabase.from('audit_logs').insert([{
    action: enabled ? 'testing_mode_enabled' : 'testing_mode_disabled',
    actor_profile_id: req.profile.id,
    actor_email: req.profile.email,
    description: enabled
      ? 'Enabled testing mode - classes can be started at any time of day'
      : 'Disabled testing mode - normal timetable schedule check restored',
  }])

  res.json({ enabled: data.testing_mode_enabled, updated_at: data.updated_at })
})

module.exports = router
module.exports.getSystemSettings = getSystemSettings
