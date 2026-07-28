import { useState, useEffect } from 'react'
import { supabase } from '../../api/client'
import { api } from '../../api/client'

export default function ClassesManager() {
  const [classes, setClasses] = useState([])
  const [teachers, setTeachers] = useState([])
  const [form, setForm] = useState({ name: '', subject: '', room: '', teacher_id: '' })
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  useEffect(() => {
    let cancelled = false

    async function loadData() {
      const [{ data: cls }, { data: tch }] = await Promise.all([
        supabase.from('classes').select('*, profiles(full_name)').order('name'),
        supabase.from('profiles').select('id, full_name').eq('role', 'teacher')
      ])

      if (cancelled) return

      setClasses(cls || [])
      setTeachers(tch || [])
      setLoading(false)
    }

    loadData()

    return () => { cancelled = true }
  }, [])

  const addClass = async () => {
    if (!form.name || !form.subject) return setError('Name and subject required')
    setError(null)

    const data = await api.post('/api/classes', {
      name: form.name,
      subject: form.subject,
      room: form.room || null,
      teacher_id: form.teacher_id || null,
    })

    if (!data) return setError('Could not create the class.')
    if (data.error) return setError(data.error)

    setClasses(prev => [...prev, data])
    setForm({ name: '', subject: '', room: '', teacher_id: '' })
  }

  const deleteClass = async (id) => {
    if (!confirm('Delete this class?')) return
    await api.delete(`/api/classes/${id}`)
    setClasses(prev => prev.filter(c => c.id !== id))
  }

  if (loading) return <div className="loading">loading</div>

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
      <div className="card">
        <p className="card-title">Add Class</p>
        <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap' }}>
          <input placeholder="Class name (e.g. CSC3)" value={form.name} onChange={e => setForm(p => ({ ...p, name: e.target.value }))} style={{ flex: 1, minWidth: '130px' }} />
          <input placeholder="Subject (e.g. Computer Science)" value={form.subject} onChange={e => setForm(p => ({ ...p, subject: e.target.value }))} style={{ flex: 2, minWidth: '140px' }} />
          <input placeholder="Learning area (e.g. Kea)" value={form.room} onChange={e => setForm(p => ({ ...p, room: e.target.value }))} style={{ flex: 1, minWidth: '100px' }} />
          <select className="session-select" value={form.teacher_id} onChange={e => setForm(p => ({ ...p, teacher_id: e.target.value }))} style={{ flex: 1, minWidth: '140px' }}>
            <option value="">No teacher</option>
            {teachers.map(t => <option key={t.id} value={t.id}>{t.full_name}</option>)}
          </select>
          <button onClick={addClass}>Add</button>
        </div>
        {error && <p className="error" style={{ marginTop: '0.75rem' }}>{error}</p>}
      </div>

      <div className="card">
        <p className="card-title">Classes ({classes.length})</p>
        {classes.length === 0 ? <p className="empty-state">no classes yet</p> : (
          <table className="attendance-table">
            <thead>
              <tr><th>Name</th><th>Subject</th><th>Learning Area</th><th>Teacher</th><th></th></tr>
            </thead>
            <tbody>
              {classes.map(c => (
                <tr key={c.id}>
                  <td style={{ fontWeight: 500 }}>{c.name}</td>
                  <td className="student-id">{c.subject}</td>
                  <td className="student-id">{c.room || '-'}</td>
                  <td className="student-id">{c.profiles?.full_name || '-'}</td>
                  <td><button onClick={() => deleteClass(c.id)} style={{ background: 'transparent', border: '1px solid var(--red)', color: 'var(--red)', padding: '0.3rem 0.6rem', fontSize: '0.8rem' }}>Delete</button></td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}