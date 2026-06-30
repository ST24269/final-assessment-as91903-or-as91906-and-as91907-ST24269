import { useState, useEffect } from 'react'
import { RefreshCw } from 'lucide-react'
import { supabase } from '../../api/client'

const generateKey = () => Math.random().toString(36).substring(2, 18).toUpperCase()

export default function ReadersManager() {
  const [readers, setReaders] = useState([])
  const [form, setForm] = useState({ label: '', room: '', api_key: generateKey() })
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  useEffect(() => {
    let cancelled = false

    async function loadReaders() {
      const { data } = await supabase.from('readers').select('*').order('label')

      if (cancelled) return

      setReaders(data || [])
      setLoading(false)
    }

    loadReaders()

    return () => { cancelled = true }
  }, [])

  const addReader = async () => {
    if (!form.label) return setError('Label required')
    setError(null)
    const { data, error } = await supabase
      .from('readers')
      .insert([{ label: form.label, room: form.room || null, api_key: form.api_key, active: true }])
      .select().single()
    if (error) return setError(error.message)
    setReaders(prev => [...prev, data])
    setForm({ label: '', room: '', api_key: generateKey() })
  }

  const toggleActive = async (id, active) => {
    await supabase.from('readers').update({ active: !active }).eq('id', id)
    setReaders(prev => prev.map(r => r.id === id ? { ...r, active: !active } : r))
  }

  const deleteReader = async (id) => {
    if (!confirm('Delete this reader?')) return
    await supabase.from('readers').delete().eq('id', id)
    setReaders(prev => prev.filter(r => r.id !== id))
  }

  if (loading) return <div className="loading">loading</div>

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
      <div className="card">
        <p className="card-title">Add Reader</p>
        <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap' }}>
          <input placeholder="Label (e.g. Room 14 Reader)" value={form.label} onChange={e => setForm(p => ({ ...p, label: e.target.value }))} style={{ flex: 2, minWidth: '160px' }} />
          <input placeholder="Room" value={form.room} onChange={e => setForm(p => ({ ...p, room: e.target.value }))} style={{ flex: 1, minWidth: '100px' }} />
          <input placeholder="API Key" value={form.api_key} onChange={e => setForm(p => ({ ...p, api_key: e.target.value }))} style={{ flex: 2, minWidth: '160px', fontFamily: 'var(--mono)', fontSize: '0.8rem' }} />
          <button
            onClick={() => setForm(p => ({ ...p, api_key: generateKey() }))}
            style={{ background: 'var(--surface-soft)', border: '1px solid var(--line)', color: 'var(--text)' }}
            aria-label="Generate API key"
          >
            <RefreshCw size={15} strokeWidth={2.2} />
          </button>
          <button onClick={addReader}>Add</button>
        </div>
        {error && <p className="error" style={{ marginTop: '0.75rem' }}>{error}</p>}
      </div>

      <div className="card">
        <p className="card-title">Readers ({readers.length})</p>
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
                  <td style={{ fontFamily: 'var(--mono)', fontSize: '0.78rem', color: 'var(--text-muted)' }}>{r.api_key}</td>
                  <td className="student-id">{r.last_seen ? new Date(r.last_seen).toLocaleString() : 'never'}</td>
                  <td>
                    <button onClick={() => toggleActive(r.id, r.active)} style={{
                      background: 'transparent', padding: '0.2rem 0.6rem', fontSize: '0.78rem',
                      border: `1px solid ${r.active ? 'var(--green)' : 'var(--red)'}`,
                      color: r.active ? 'var(--green)' : 'var(--red)'
                    }}>
                      {r.active ? 'active' : 'inactive'}
                    </button>
                  </td>
                  <td><button onClick={() => deleteReader(r.id)} style={{ background: 'transparent', border: '1px solid var(--red)', color: 'var(--red)', padding: '0.3rem 0.6rem', fontSize: '0.8rem' }}>Delete</button></td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}
