import { useMemo, useState, useEffect } from 'react'
import { supabase } from '../../api/client'
import { api } from '../../api/client'

async function fetchUserManagerData() {
  const { data: profileRows } = await supabase.from('profiles').select('*').order('full_name')

  return {
    profiles: profileRows || [],
  }
}

export default function UsersManager() {
  const [profiles, setProfiles] = useState([])
  const [form, setForm] = useState({
    email: '',
    full_name: '',
    role: 'teacher',
    password: '',
  })
  const [roleFilter, setRoleFilter] = useState('all')
  const [sortBy, setSortBy] = useState('full_name')
  const [sortDirection, setSortDirection] = useState('asc')
  const [loading, setLoading] = useState(true)
  const [adding, setAdding] = useState(false)
  const [error, setError] = useState(null)
  const [success, setSuccess] = useState(null)

  useEffect(() => {
    let cancelled = false

    async function loadInitialData() {
      const data = await fetchUserManagerData()

      if (cancelled) return

      setProfiles(data.profiles)
      setLoading(false)
    }

    loadInitialData()

    return () => { cancelled = true }
  }, [])

  const refreshData = async () => {
    const data = await fetchUserManagerData()
    setProfiles(data.profiles)
  }

  const addUser = async () => {
    setError(null)
    setSuccess(null)

    if (!form.email || !form.full_name || !form.password) return setError('All fields required')

    setAdding(true)

    // Create auth user via server endpoint
    const data = await api.post('/api/users/create', {
      email: form.email,
      password: form.password,
      full_name: form.full_name,
      role: form.role,
    })

    if (data.error) setError(data.error)
    else {
      const roleLabel = form.role.charAt(0).toUpperCase() + form.role.slice(1)
      const createdMessage = data.studentCreated
        ? `Student record and login created for ${form.email}`
        : `${roleLabel} account created for ${form.email}`

      setSuccess(data.emailSent
        ? `${createdMessage}. Email sent.`
        : `${createdMessage}. Email not sent: ${data.emailError}`)
      setForm({
        email: '',
        full_name: '',
        role: 'teacher',
        password: '',
      })
      refreshData()
    }
    setAdding(false)
  }

  const visibleProfiles = useMemo(() => {
    const filtered = roleFilter === 'all'
      ? profiles
      : profiles.filter((profile) => profile.role === roleFilter)

    return [...filtered].sort((a, b) => {
      const aValue = a[sortBy] || ''
      const bValue = b[sortBy] || ''
      const comparison = String(aValue).localeCompare(String(bValue), undefined, {
        numeric: true,
        sensitivity: 'base',
      })

      return sortDirection === 'asc' ? comparison : comparison * -1
    })
  }, [profiles, roleFilter, sortBy, sortDirection])

  if (loading) return <div className="loading">loading</div>

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
      <div className="card">
        <p className="card-title">Create Staff Account</p>
        <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap' }}>
          <input placeholder="Full name" value={form.full_name} onChange={e => setForm(p => ({ ...p, full_name: e.target.value }))} style={{ flex: 2, minWidth: '150px' }} />
          <input placeholder="Email" value={form.email} onChange={e => setForm(p => ({ ...p, email: e.target.value }))} style={{ flex: 2, minWidth: '180px' }} />
          <input placeholder="Password" type="password" value={form.password} onChange={e => setForm(p => ({ ...p, password: e.target.value }))} style={{ flex: 1, minWidth: '130px' }} />
          <select className="session-select" value={form.role} onChange={e => setForm(p => ({ ...p, role: e.target.value }))} style={{ flex: 1, minWidth: '120px' }}>
            <option value="teacher">Teacher</option>
            <option value="admin">Admin</option>
          </select>
          <button onClick={addUser} disabled={adding}>{adding ? 'Creating...' : 'Create'}</button>
        </div>
        <p className="student-management-hint">Student login creation is handled from Student Management so student records, RFID cards, and confirmation emails stay together.</p>
        {error && <p className="action-notice is-error" role="alert">{error}</p>}
        {success && <p className="action-notice is-success" role="status">{success}</p>}
      </div>

      <div className="card">
        <div className="admin-users-toolbar">
          <p className="card-title">All Users ({visibleProfiles.length}/{profiles.length})</p>
          <div className="admin-users-controls">
            <select className="session-select" value={roleFilter} onChange={e => setRoleFilter(e.target.value)}>
              <option value="all">All roles</option>
              <option value="student">Students</option>
              <option value="teacher">Teachers</option>
              <option value="admin">Admins</option>
            </select>
            <select className="session-select" value={sortBy} onChange={e => setSortBy(e.target.value)}>
              <option value="full_name">Sort by name</option>
              <option value="email">Sort by email</option>
              <option value="role">Sort by role</option>
              <option value="created_at">Sort by created</option>
            </select>
            <button
              type="button"
              className="btn-ghost"
              onClick={() => setSortDirection((current) => (current === 'asc' ? 'desc' : 'asc'))}
            >
              {sortDirection === 'asc' ? 'Ascending' : 'Descending'}
            </button>
          </div>
        </div>
        {visibleProfiles.length === 0 ? <p className="empty-state">no users match this filter</p> : (
          <table className="attendance-table">
            <thead>
              <tr><th>Name</th><th>Email</th><th>Role</th></tr>
            </thead>
            <tbody>
              {visibleProfiles.map(p => (
                <tr key={p.id}>
                  <td style={{ fontWeight: 500 }}>{p.full_name}</td>
                  <td className="student-id">{p.email}</td>
                  <td>
                    <span className={`header-role-badge ${p.role}`}>{p.role}</span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}
