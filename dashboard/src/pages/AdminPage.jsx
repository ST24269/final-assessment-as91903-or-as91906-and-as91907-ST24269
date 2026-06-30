import { useState } from 'react'
import {
  BarChart3,
  BookOpen,
  Radio,
  UserRound,
  UsersRound,
} from 'lucide-react'
import AppFooter from '../components/AppFooter'
import ProfileMenu from '../components/ProfileMenu'
import ThemeToggle from '../components/ThemeToggle'
import BorderGlow from '../components/reactbits/BorderGlow'
import Dock from '../components/reactbits/Dock'
import StudentsManager from '../components/admin/StudentsManager'
import ClassesManager from '../components/admin/ClassesManager'
import ReadersManager from '../components/admin/ReadersManager'
import AttendanceOverview from '../components/admin/AttendanceOverview'
import UsersManager from '../components/admin/UsersManager'

const TABS = [
  {
    id: 'students',
    label: 'Student Management',
    Icon: UserRound,
    description: 'Manage records, login accounts, RFID cards, and status',
  },
  {
    id: 'analytics',
    label: 'Analytics',
    Icon: BarChart3,
    description: 'Student attendance insights',
  },
  {
    id: 'classes',
    label: 'Classes',
    Icon: BookOpen,
    description: 'Organise class groups',
  },
  {
    id: 'readers',
    label: 'Readers',
    Icon: Radio,
    description: 'Manage RFID devices',
  },
  {
    id: 'users',
    label: 'Users',
    Icon: UsersRound,
    description: 'Manage user roles',
  },
]

export default function AdminPage({ session, profile }) {
  const [tab, setTab] = useState('students')

  const activeTab = TABS.find((item) => item.id === tab)
  const ActiveIcon = activeTab?.Icon
  const dockItems = TABS.map(({ id, label, Icon }) => ({
    icon: <Icon size={19} strokeWidth={2.25} />,
    label,
    onClick: () => setTab(id),
    className: tab === id ? 'is-active' : '',
  }))

  return (
    <div className="admin-shell">
      <header className="admin-header">
        <div className="admin-brand">
          <div className="admin-logo">
            <Radio size={22} strokeWidth={2.4} />
          </div>
          <div>
            <h1>AttendRFID</h1>
            <p>Admin Control Centre</p>
          </div>
        </div>

        <div className="admin-header-right">
          <ThemeToggle />
          <ProfileMenu
            name={profile?.full_name || 'Admin User'}
            email={session?.user?.email}
            role="admin"
            profileId={profile?.id}
          />
        </div>
      </header>

      <BorderGlow
        className="admin-hero-glow"
        glowColor="154 78 58"
        borderRadius={16}
        glowRadius={30}
        glowIntensity={0.65}
        animated
        colors={['#57df9a', '#45b7ff', '#ff6b7a']}
      >
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
            <strong>
              {ActiveIcon && <ActiveIcon size={20} strokeWidth={2.3} />}
              {activeTab?.label}
            </strong>
            <p>{activeTab?.description}</p>
          </div>
        </section>
      </BorderGlow>

      <main className="admin-main">
        <BorderGlow
          className="admin-panel-glow"
          edgeSensitivity={24}
          glowColor="203 88 64"
          borderRadius={16}
          glowRadius={28}
          glowIntensity={0.55}
          colors={['#45b7ff', '#57df9a', '#ff6b7a']}
        >
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
              {tab === 'analytics' && <AttendanceOverview />}
              {tab === 'users' && <UsersManager />}
            </div>
          </div>
        </BorderGlow>
      </main>

      <div className="admin-dock-shell">
        <Dock
          items={dockItems}
          panelHeight={62}
          baseItemSize={45}
          magnification={64}
          dockHeight={158}
        />
      </div>

      <AppFooter className="admin-footer" />
    </div>
  )
}
