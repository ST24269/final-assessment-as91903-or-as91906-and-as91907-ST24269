const supabase = require('../db/pool')

function getBearerToken(req) {
  const header = req.headers.authorization || ''
  const [scheme, token] = header.split(' ')

  if (scheme?.toLowerCase() !== 'bearer' || !token) {
    return null
  }

  return token
}

async function authenticateUser(req, res, next) {
  const token = getBearerToken(req)

  if (!token) {
    return res.status(401).json({ error: 'Authentication required' })
  }

  const { data, error } = await supabase.auth.getUser(token)

  if (error || !data?.user) {
    return res.status(401).json({ error: 'Invalid or expired session' })
  }

  const { data: profile, error: profileError } = await supabase
    .from('profiles')
    .select('id, email, full_name, role, session_start_buffer_minutes')
    .eq('id', data.user.id)
    .single()

  if (profileError || !profile) {
    return res.status(403).json({ error: 'No profile found for this user' })
  }

  req.user = data.user
  req.profile = profile
  next()
}

function requireRole(...roles) {
  return (req, res, next) => {
    if (!req.profile) {
      return res.status(500).json({ error: 'Profile not loaded' })
    }

    if (!roles.includes(req.profile.role)) {
      return res.status(403).json({ error: 'You do not have permission for this action' })
    }

    next()
  }
}

module.exports = {
  authenticateUser,
  requireRole,
}