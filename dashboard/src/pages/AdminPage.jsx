import { useState } from 'react'
import { supabase } from '../api/client'
import StudentsManager from '../components/admin/StudentsManager'
import ClassesManager from '../components/admin/ClassesManager'
import ReadersManager from '../components/admin/ReadersManager'
import AttendanceOverview from '../components/admin/AttendanceOverview'
import UsersManager from '../components/admin/UsersManager'

const TABS = [
  {
    id: 'students',
    label: 'Students',
    icon: '👤',
    description: 'Manage student records'
  },
  {
    id: 'classes',
    label: 'Classes',
    icon: '📚',
    description: 'Organise class groups'
  },
  {
    id: 'readers',
    label: 'Readers',
    icon: '📡',
    description: 'Manage RFID devices'
  },
  {
    id: 'attendance',
    label: 'Attendance',
    icon: '📋',
    description: 'View attendance logs'
  },
  {
    id: 'users',
    label: 'Users',
    icon: '🔑',
    description: 'Manage user roles'
  },
]

export default function AdminPage({ session, profile }) {
  const [tab, setTab] = useState('students')

  const activeTab = TABS.find(t => t.id === tab)

  const handleSignOut = async () => {
    await supabase.auth.signOut()
    window.location.href = '/login'
  }

  return (
    <div className="admin-shell">
      <div className="admin-bg">
        <div className="admin-blur admin-blur-one" />
        <div className="admin-blur admin-blur-two" />
      </div>

      <header className="admin-header">
        <div className="admin-brand">
          <div className="admin-logo">📡</div>
          <div>
            <h1>AttendRFID</h1>
            <p>Admin Control Centre</p>
          </div>
        </div>

        <div className="admin-header-right">
          <div className="admin-user-card">
            <span className="admin-role-badge">Admin</span>
            <div>
              <p>{profile?.full_name || 'Admin User'}</p>
              <span>{session?.user?.email}</span>
            </div>
          </div>

          <button className="admin-signout-btn" onClick={handleSignOut}>
            Sign out
          </button>
        </div>
      </header>

      <section className="admin-hero">
        <div>
          <p className="admin-eyebrow">System Overview</p>
          <h2>Manage your school attendance system</h2>
          <p>
            Control students, classes, RFID readers, attendance records, and user roles from one dashboard.
          </p>
        </div>

        <div className="admin-hero-card">
          <span>Current section</span>
          <strong>{activeTab?.icon} {activeTab?.label}</strong>
          <p>{activeTab?.description}</p>
        </div>
      </section>

      <nav className="admin-tabs">
        {TABS.map(t => (
          <button
            key={t.id}
            className={`admin-tab ${tab === t.id ? 'active' : ''}`}
            onClick={() => setTab(t.id)}
          >
            <span className="admin-tab-icon">{t.icon}</span>
            <span>
              <strong>{t.label}</strong>
              <small>{t.description}</small>
            </span>
          </button>
        ))}
      </nav>

      <main className="admin-main">
        <div className="admin-panel">
          <div className="admin-panel-header">
            <div>
              <p className="admin-eyebrow">Management</p>
              <h3>{activeTab?.label}</h3>
            </div>
            <span className="admin-panel-pill">{activeTab?.description}</span>
          </div>

          <div className="admin-panel-content">
            {tab === 'students' && <StudentsManager />}
            {tab === 'classes' && <ClassesManager />}
            {tab === 'readers' && <ReadersManager />}
            {tab === 'attendance' && <AttendanceOverview />}
            {tab === 'users' && <UsersManager />}
          </div>
        </div>
      </main>
    </div>
  )
}