const express = require('express')
const router = express.Router()
const supabase = require('../db/pool')
const { authenticateUser, requireRole } = require('../middleware/auth')

// Apply authentication to all routes
router.use(authenticateUser)

// Helper to get time ago string
function getTimeAgo(date) {
  const seconds = Math.floor((Date.now() - date.getTime()) / 1000)

  if (seconds < 5) return 'just now'
  if (seconds < 60) return `${seconds}s ago`
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`
  return `${Math.floor(seconds / 86400)}d ago`
}

// GET /api/readers - List all readers (admin only)
router.get('/', requireRole('admin'), async (req, res) => {
  try {
    // Explicitly select all columns to avoid any ambiguity
    const { data, error } = await supabase
      .from('readers')
      .select('id, label, room, api_key, last_seen, last_scan, active, firmware_version, mac_address, ip_address, online_status, created_at')
      .order('label')

    if (error) throw error

    // Handle null/empty data
    if (!data || data.length === 0) {
      return res.json([])
    }

    // Transform data to include computed fields
    const readers = data.map((reader) => {
      // Determine online status based on last_seen
      let computedOnlineStatus = 'offline'
      if (reader.last_seen) {
        const secondsSinceLastSeen = (Date.now() - new Date(reader.last_seen).getTime()) / 1000
        if (secondsSinceLastSeen < 60) {
          computedOnlineStatus = 'online'
        } else if (secondsSinceLastSeen < 300) {
          computedOnlineStatus = 'degraded'
        }
      }

      // Note: scan_count_today must be fetched separately or via a join
      // For now, we return 0 - the dashboard can call a separate endpoint if needed
      return {
        id: reader.id,
        label: reader.label,
        room: reader.room,
        api_key: reader.api_key,
        last_seen: reader.last_seen,
        last_scan: reader.last_scan,
        active: reader.active,
        firmware_version: reader.firmware_version,
        mac_address: reader.mac_address,
        ip_address: reader.ip_address,
        online_status: computedOnlineStatus,
        last_seen_ago: reader.last_seen ? getTimeAgo(new Date(reader.last_seen)) : null,
        scan_count_today: 0  // Will be populated by stats endpoint
      }
    })

    res.json(readers)
  } catch (error) {
    console.error('Error fetching readers:', error)
    res.status(500).json({ error: error.message })
  }
})

// GET /api/readers/stats - Dashboard statistics (admin only)
router.get('/stats/summary', requireRole('admin'), async (req, res) => {
  try {
    // Get total readers
    const { count: totalReaders } = await supabase
      .from('readers')
      .select('*', { count: 'exact', head: true })

    // Get online readers (seen within last 5 minutes)
    const { count: onlineReaders } = await supabase
      .from('readers')
      .select('*', { count: 'exact', head: true })
      .gte('last_seen', new Date(Date.now() - 5 * 60 * 1000).toISOString())

    // Get today's total scans
    const { count: todayScans } = await supabase
      .from('scan_logs')
      .select('*', { count: 'exact', head: true })
      .eq('result', 'success')
      .gte('scanned_at', new Date().toISOString().split('T')[0])

    // Get pending offline scans
    const { count: pendingScans } = await supabase
      .from('offline_scans')
      .select('*', { count: 'exact', head: true })
      .eq('status', 'pending')

    res.json({
      total_readers: totalReaders || 0,
      online_readers: onlineReaders || 0,
      today_scans: todayScans || 0,
      pending_offline_scans: pendingScans || 0
    })
  } catch (error) {
    console.error('Error fetching stats:', error)
    res.status(500).json({ error: error.message })
  }
})

// GET /api/readers/:id - Get single reader (admin only)
router.get('/:id', requireRole('admin'), async (req, res) => {
  try {
    const { data: reader, error } = await supabase
      .from('readers')
      .select('*')
      .eq('id', req.params.id)
      .single()

    if (error) throw error
    if (!reader) {
      return res.status(404).json({ error: 'Reader not found' })
    }

    // Get recent scan logs
    const { data: scanLogs } = await supabase
      .from('scan_logs')
      .select('*')
      .eq('reader_id', reader.id)
      .order('created_at', { ascending: false })
      .limit(20)

    // Get today's scan count
    const { count } = await supabase
      .from('scan_logs')
      .select('*', { count: 'exact', head: true })
      .eq('reader_id', reader.id)
      .eq('result', 'success')
      .gte('scanned_at', new Date().toISOString().split('T')[0])

    res.json({
      ...reader,
      scan_count_today: count || 0,
      recent_scans: scanLogs || []
    })
  } catch (error) {
    console.error('Error fetching reader:', error)
    res.status(500).json({ error: error.message })
  }
})

// POST /api/readers - Create new reader (admin only)
router.post('/', requireRole('admin'), async (req, res) => {
  try {
    const { label, room, api_key, firmware_version, mac_address } = req.body

    if (!label || !api_key) {
      return res.status(400).json({ error: 'label and api_key are required' })
    }

    // Check for duplicate API key
    const { data: existing } = await supabase
      .from('readers')
      .select('id')
      .eq('api_key', api_key)
      .maybeSingle()

    if (existing) {
      return res.status(409).json({ error: 'API key already exists' })
    }

    const { data: reader, error } = await supabase
      .from('readers')
      .insert([{
        label,
        room,
        api_key,
        firmware_version: firmware_version || '1.0.0',
        mac_address,
        active: true,
        online_status: 'offline'
      }])
      .select()
      .single()

    if (error) throw error

    res.status(201).json(reader)
  } catch (error) {
    console.error('Error creating reader:', error)
    res.status(500).json({ error: error.message })
  }
})

// PATCH /api/readers/:id - Update reader (admin only)
router.patch('/:id', requireRole('admin'), async (req, res) => {
  try {
    const { label, room, active, firmware_version } = req.body

    // Check reader exists
    const { data: existing } = await supabase
      .from('readers')
      .select('id')
      .eq('id', req.params.id)
      .maybeSingle()

    if (!existing) {
      return res.status(404).json({ error: 'Reader not found' })
    }

    const { data: reader, error } = await supabase
      .from('readers')
      .update({
        ...(label && { label }),
        ...(room !== undefined && { room }),
        ...(active !== undefined && { active }),
        ...(firmware_version && { firmware_version })
      })
      .eq('id', req.params.id)
      .select()
      .single()

    if (error) throw error

    res.json(reader)
  } catch (error) {
    console.error('Error updating reader:', error)
    res.status(500).json({ error: error.message })
  }
})

// DELETE /api/readers/:id - Delete reader (admin only)
router.delete('/:id', requireRole('admin'), async (req, res) => {
  try {
    const { error } = await supabase
      .from('readers')
      .delete()
      .eq('id', req.params.id)

    if (error) throw error

    res.status(204).send()
  } catch (error) {
    console.error('Error deleting reader:', error)
    res.status(500).json({ error: error.message })
  }
})

// POST /api/readers/:id/heartbeat - Reader heartbeat/keepalive
router.post('/:id/heartbeat', async (req, res) => {
  try {
    const { api_key, firmware_version, mac_address, ip_address } = req.body

    // Validate API key
    const { data: reader, error: readerError } = await supabase
      .from('readers')
      .select('*')
      .eq('id', req.params.id)
      .eq('api_key', api_key)
      .eq('active', true)
      .maybeSingle()

    if (readerError || !reader) {
      return res.status(401).json({ error: 'Invalid reader credentials' })
    }

    // Update reader status
    const { error } = await supabase
      .from('readers')
      .update({
        last_seen: new Date().toISOString(),
        online_status: 'online',
        ...(firmware_version && { firmware_version }),
        ...(mac_address && { mac_address }),
        ...(ip_address && { ip_address })
      })
      .eq('id', req.params.id)

    if (error) throw error

    // Check for pending offline scans to upload
    const { data: pendingScans } = await supabase
      .from('offline_scans')
      .select('*')
      .eq('reader_id', reader.id)
      .eq('status', 'pending')
      .order('scanned_at')
      .limit(10)

    res.json({
      success: true,
      pending_scans_count: pendingScans?.length || 0,
      pending_scans: pendingScans || []
    })
  } catch (error) {
    console.error('Error in heartbeat:', error)
    res.status(500).json({ error: error.message })
  }
})

module.exports = router