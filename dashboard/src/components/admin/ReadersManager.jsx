import { useState, useEffect, useCallback } from 'react'
import { Eye, EyeOff, RefreshCw, Wifi, Server, ScanLine, Activity } from 'lucide-react'
import { supabase, api } from '../../api/client'

const KEY_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'

function generateKey() {
  const bytes = new Uint8Array(24)

  if (window.crypto?.getRandomValues) {
    window.crypto.getRandomValues(bytes)
  } else {
    for (let index = 0; index < bytes.length; index += 1) {
      bytes[index] = Math.floor(Math.random() * 256)
    }
  }

  return Array.from(bytes, (byte) => KEY_ALPHABET[byte % KEY_ALPHABET.length]).join('')
}

function maskSecret(value) {
  if (!value) return 'not set'
  const clean = String(value)
  return `${'*'.repeat(Math.max(clean.length - 4, 8))}${clean.slice(-4)}`
}

function getTimeAgo(dateString) {
  if (!dateString) return 'never'
  const date = new Date(dateString)
  const seconds = Math.floor((Date.now() - date.getTime()) / 1000)

  if (seconds < 5) return 'just now'
  if (seconds < 60) return `${seconds}s ago`
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`
  return `${Math.floor(seconds / 86400)}d ago`
}

function getOnlineStatus(lastSeen) {
  if (!lastSeen) return { status: 'offline', color: 'var(--red)', label: 'Offline' }

  const seconds = Math.floor((Date.now() - new Date(lastSeen).getTime()) / 1000)

  if (seconds < 60) return { status: 'online', color: 'var(--green)', label: 'Online' }
  if (seconds < 300) return { status: 'degraded', color: '#f59e0b', label: 'Degraded' }
  return { status: 'offline', color: 'var(--red)', label: 'Offline' }
}

function StatusBadge({ lastSeen }) {
  const { status, color, label } = getOnlineStatus(lastSeen)

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
      <span style={{ width: 8, height: 8, borderRadius: '50%', backgroundColor: color }} />
      <span style={{ color, fontWeight: 500, fontSize: '0.85rem' }}>{label}</span>
    </div>
  )
}

function ReaderRow({ reader }) {
  // Defensive: ensure reader is a valid object
  if (!reader || typeof reader !== 'object') {
    return null
  }

  const { status, color } = getOnlineStatus(reader.last_seen)

  return (
    <tr>
      <td style={{ fontWeight: 500 }}>{reader.label || 'Unnamed'}</td>
      <td className="student-id">{reader.room || '-'}</td>
      <td>
        <StatusBadge lastSeen={reader.last_seen} />
      </td>
      <td className="student-id" style={{ color: reader.last_seen ? 'inherit' : 'var(--text-muted)' }}>
        {reader.last_seen_ago || getTimeAgo(reader.last_seen)}
      </td>
      <td className="student-id" style={{ color: reader.last_scan ? 'inherit' : 'var(--text-muted)' }}>
        {reader.last_scan ? new Date(reader.last_scan).toLocaleTimeString() : 'never'}
      </td>
      <td className="student-id" style={{ fontWeight: 600, color: reader.scan_count_today > 0 ? 'var(--primary)' : 'inherit' }}>
        {reader.scan_count_today || 0}
      </td>
      <td className="student-id" style={{ fontFamily: 'var(--mono)', fontSize: '0.75rem' }}>
        {reader.firmware_version || '1.0.0'}
      </td>
      <td>
        <button style={{
          background: 'transparent', padding: '0.2rem 0.6rem', fontSize: '0.78rem',
          border: `1px solid ${reader.active ? 'var(--green)' : 'var(--red)'}`,
          color: reader.active ? 'var(--green)' : 'var(--red)', cursor: 'pointer'
        }}>
          {reader.active ? 'active' : 'inactive'}
        </button>
      </td>
    </tr>
  )
}

export default function ReadersManager() {
  const [readers, setReaders] = useState([])
  const [stats, setStats] = useState(null)
  const [form, setForm] = useState({ label: '', room: '', api_key: generateKey() })
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [revealedKeys, setRevealedKeys] = useState(() => new Set())
  const [autoRefresh, setAutoRefresh] = useState(true)

  const loadReaders = useCallback(async () => {
    setLoading(true)

    // Fetch readers list and stats in parallel
    const [readersResult, statsResult] = await Promise.all([
      api.get('/api/readers'),
      api.get('/api/readers/stats/summary')
    ])

    // api.get() returns raw JSON on success, { error, status } on failure
    if (readersResult.error) {
      setError(readersResult.error)
      setReaders([])
    } else {
      // Success - result is the array directly, not { data: array }
      setReaders(Array.isArray(readersResult) ? readersResult : [])
      console.log('Readers loaded:', readersResult)
    }

    if (statsResult.error) {
      console.error('Stats error:', statsResult.error)
    } else {
      setStats(statsResult)
    }

    setLoading(false)
  }, [])

  useEffect(() => {
    loadReaders()
  }, [loadReaders])

  // Auto-refresh every 30 seconds
  useEffect(() => {
    if (!autoRefresh) return

    const interval = setInterval(() => {
      loadReaders()
    }, 30000)

    return () => clearInterval(interval)
  }, [autoRefresh, loadReaders])

  const addReader = async () => {
    if (!form.label) return setError('Label required')
    if (!form.api_key || form.api_key.length < 16) return setError('API key must be at least 16 characters.')
    setError(null)

    const result = await api.post('/api/readers', {
      label: form.label,
      room: form.room || null,
      api_key: form.api_key
    })

    // Same rule as loadReaders() above: on success this is the created
    // reader object directly, not wrapped in { data: reader }. Reading
    // result.data here was always undefined, which got pushed straight
    // into the readers array and crashed the table on r.id.
    if (result.error) return setError(result.error)
    setReaders(prev => [...prev, result])
    setForm({ label: '', room: '', api_key: generateKey() })
  }

  const toggleActive = async (id, active) => {
    setError(null)

    const result = await api.patch(`/api/readers/${id}`, { active: !active })

    if (result.error) return setError(result.error)
    setReaders(prev => prev.map(r => r.id === id ? { ...r, active: !active } : r))
  }

  const deleteReader = async (id) => {
    if (!confirm('Delete this reader? This will also delete all scan logs.')) return
    setError(null)

    const result = await api.delete(`/api/readers/${id}`)

    if (result.error) return setError(result.error)
    setReaders(prev => prev.filter(r => r.id !== id))
  }

  const toggleReveal = (id) => {
    setRevealedKeys((current) => {
      const next = new Set(current)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  if (loading && readers.length === 0) return <div className="loading">loading</div>

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
      {/* Stats Overview */}
      {stats && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: '1rem' }}>
          <div className="card" style={{ padding: '1rem', textAlign: 'center' }}>
            <Server size={24} color="var(--text-muted)" style={{ marginBottom: '0.5rem' }} />
            <p style={{ fontSize: '1.75rem', fontWeight: 600, margin: 0 }}>{stats.total_readers}</p>
            <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)', margin: 0 }}>Total Readers</p>
          </div>
          <div className="card" style={{ padding: '1rem', textAlign: 'center' }}>
            <Wifi size={24} color="var(--green)" style={{ marginBottom: '0.5rem' }} />
            <p style={{ fontSize: '1.75rem', fontWeight: 600, margin: 0 }}>{stats.online_readers}</p>
            <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)', margin: 0 }}>Online</p>
          </div>
          <div className="card" style={{ padding: '1rem', textAlign: 'center' }}>
            <ScanLine size={24} color="var(--primary)" style={{ marginBottom: '0.5rem' }} />
            <p style={{ fontSize: '1.75rem', fontWeight: 600, margin: 0 }}>{stats.today_scans}</p>
            <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)', margin: 0 }}>Today's Scans</p>
          </div>
          <div className="card" style={{ padding: '1rem', textAlign: 'center' }}>
            <Activity size={24} color={stats.pending_offline_scans > 0 ? '#f59e0b' : 'var(--text-muted)'} style={{ marginBottom: '0.5rem' }} />
            <p style={{ fontSize: '1.75rem', fontWeight: 600, margin: 0, color: stats.pending_offline_scans > 0 ? '#f59e0b' : 'inherit' }}>{stats.pending_offline_scans}</p>
            <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)', margin: 0 }}>Pending Offline</p>
          </div>
        </div>
      )}

      {/* Reader Health Dashboard */}
      <div className="card">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
          <p className="card-title" style={{ margin: 0 }}>Reader Health Dashboard</p>
          <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.85rem', cursor: 'pointer' }}>
            <input type="checkbox" checked={autoRefresh} onChange={e => setAutoRefresh(e.target.checked)} />
            Auto-refresh (30s)
            <button onClick={loadReaders} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '0.25rem' }} title="Refresh now">
              <RefreshCw size={14} />
            </button>
          </label>
        </div>

        {readers.length === 0 ? (
          <p className="empty-state">No readers configured</p>
        ) : (
          <table className="attendance-table" style={{ marginBottom: 0 }}>
            <thead>
              <tr>
                <th>Reader</th>
                <th>Room</th>
                <th>Status</th>
                <th>Last Seen</th>
                <th>Last Scan</th>
                <th>Today's Scans</th>
                <th>Firmware</th>
                <th>Active</th>
              </tr>
            </thead>
            <tbody>
              {readers.map(r => (
                <ReaderRow key={r?.id} reader={r} />
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Add Reader Form */}
      <div className="card">
        <p className="card-title">Add New Reader</p>
        <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap' }}>
          <input
            placeholder="Label (e.g. Science Room Door)"
            value={form.label}
            onChange={e => setForm(p => ({ ...p, label: e.target.value }))}
            style={{ flex: 2, minWidth: '160px' }}
          />
          <input
            placeholder="Room (e.g. SC1)"
            value={form.room}
            onChange={e => setForm(p => ({ ...p, room: e.target.value }))}
            style={{ flex: 1, minWidth: '100px' }}
          />
          <input
            placeholder="API Key"
            value={form.api_key}
            onChange={e => setForm(p => ({ ...p, api_key: e.target.value }))}
            style={{ flex: 2, minWidth: '160px', fontFamily: 'var(--mono)', fontSize: '0.8rem' }}
          />
          <button
            onClick={() => setForm(p => ({ ...p, api_key: generateKey() }))}
            style={{ background: 'var(--surface-soft)', border: '1px solid var(--line)', color: 'var(--text)', cursor: 'pointer' }}
            aria-label="Generate API key"
            title="Generate new API key"
          >
            <RefreshCw size={15} strokeWidth={2.2} />
          </button>
          <button onClick={addReader}>Add Reader</button>
        </div>
        {error && <p className="error" style={{ marginTop: '0.75rem' }}>{error}</p>}
      </div>

      {/* Reader Details Table */}
      <div className="card">
        <p className="card-title">Reader Configuration ({readers.length})</p>
        {readers.length === 0 ? <p className="empty-state">no readers yet</p> : (
          <table className="attendance-table">
            <thead>
              <tr><th>Label</th><th>Room</th><th>API Key</th><th>Last Seen</th><th>Status</th><th></th></tr>
            </thead>
            <tbody>
              {readers.map(r => (
                <tr key={r.id}>
                  <td style={{ fontWeight: 500 }}>{r.label}</td>
                  <td className="student-id">{r.room || '-'}</td>
                  <td style={{ fontFamily: 'var(--mono)', fontSize: '0.78rem', color: 'var(--text-muted)' }}>
                    <span>{revealedKeys.has(r.id) ? r.api_key : maskSecret(r.api_key)}</span>
                    <button
                      type="button"
                      onClick={() => toggleReveal(r.id)}
                      aria-label={revealedKeys.has(r.id) ? 'Hide reader API key' : 'Reveal reader API key'}
                      style={{ minHeight: '1.8rem', marginLeft: '0.5rem', padding: '0 0.45rem', background: 'transparent', border: '1px solid var(--line)', color: 'var(--text-muted)', cursor: 'pointer' }}
                    >
                      {revealedKeys.has(r.id)
                        ? <EyeOff size={14} strokeWidth={2.2} />
                        : <Eye size={14} strokeWidth={2.2} />}
                    </button>
                  </td>
                  <td className="student-id">{r.last_seen ? new Date(r.last_seen).toLocaleString() : 'never'}</td>
                  <td>
                    <button onClick={() => toggleActive(r.id, r.active)} style={{
                      background: 'transparent', padding: '0.2rem 0.6rem', fontSize: '0.78rem',
                      border: `1px solid ${r.active ? 'var(--green)' : 'var(--red)'}`,
                      color: r.active ? 'var(--green)' : 'var(--red)', cursor: 'pointer'
                    }}>
                      {r.active ? 'active' : 'inactive'}
                    </button>
                  </td>
                  <td><button onClick={() => deleteReader(r.id)} style={{ background: 'transparent', border: '1px solid var(--red)', color: 'var(--red)', padding: '0.3rem 0.6rem', fontSize: '0.8rem', cursor: 'pointer' }}>Delete</button></td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}