import { useEffect, useRef, useState } from 'react'
import { AnimatePresence, motion } from 'motion/react'
import {
  BarChart3,
  BookOpen,
  CalendarDays,
  ClipboardCheck,
  CreditCard,
  HelpCircle,
  Link2,
  Mail,
  MessageSquareWarning,
  ScanLine,
  UploadCloud,
  UserRound,
  UsersRound,
} from 'lucide-react'
import { Link } from 'react-router-dom'
import AppFooter from '../components/AppFooter'
import NotificationBell from '../components/NotificationBell'
import ProfileMenu from '../components/ProfileMenu'
import TagoLogo from '../components/TagoLogo'
import ThemeToggle from '../components/ThemeToggle'
import StudentsManager from '../components/admin/StudentsManager'
import SessionReviewsManager from '../components/admin/SessionReviewsManager'
import RosterImportManager from '../components/admin/RosterImportManager'
import ClassesManager from '../components/admin/ClassesManager'
import ReadersManager from '../components/admin/ReadersManager'
import AttendanceOverview from '../components/admin/AttendanceOverview'
import UsersManager from '../components/admin/UsersManager'
import AppealsManager from '../components/admin/AppealsManager'
import TimetableManager from '../components/admin/TimetableManager'
import StudentClassLinksManager from '../components/admin/StudentClassLinksManager'
import AdminEmailManager from '../components/admin/AdminEmailManager'

// Note: `description` and `tips` are kept on each tab because the "?"
// help popover in the topbar still uses them - only the always-visible
// text under the panel header (h2) has been dropped, per the request to
// keep just the label there.
const TABS = [
  {
    id: 'students',
    label: 'Student Management',
    Icon: UserRound,
    description: 'Manage records, login accounts, RFID cards, and status',
    tips: [
      'Deactivate a card instead of deleting a student if it is lost or stolen.',
      'Bulk actions apply to every row currently checked, not the whole table.',
    ],
  },
  {
    id: 'import',
    label: 'Import Students',
    Icon: UploadCloud,
    description: 'Bring students across from the old system via CSV',
    tips: [
      'Student numbers must be numbers only, and year level must be 11, 12, or 13.',
      'Rows that fail validation are flagged in the preview and skipped, so a bad row won\'t block the rest of the import.',
    ],
  },
  {
    id: 'classes',
    label: 'Class Management',
    Icon: BookOpen,
    description: 'Create classes, subjects, rooms, and teachers',
    tips: [
      'A class needs a room assigned before readers in that room will match sessions to it.',
    ],
  },
  {
    id: 'linking',
    label: 'Student-Class Linking',
    Icon: Link2,
    description: 'Link students to classes and teachers',
    tips: [
      'Students only appear in a teacher roll once they are linked here via enrolments.',
    ],
  },
  {
    id: 'timetable',
    label: 'Timetable Management',
    Icon: CalendarDays,
    description: 'Manage class timetable periods',
    tips: [
      'Timetable periods drive when a session is expected to be active for a class.',
    ],
  },
  {
    id: 'reviews',
    label: 'Attendance Reviews',
    Icon: ClipboardCheck,
    description: "Review every class's submitted attendance",
    tips: [
      'A class shows up here once its teacher ends the session and confirms/submits it.',
      'Expand a row to see each student\'s status and photo-match decision.',
    ],
  },
  {
    id: 'appeals',
    label: 'Attendance Appeals',
    Icon: MessageSquareWarning,
    description: 'Review and correct attendance appeals',
    tips: [
      'Approving an appeal updates the underlying attendance record and logs the change.',
    ],
  },
  {
    id: 'communication',
    label: 'Email / Communication',
    Icon: Mail,
    description: 'Send messages to student recipients',
    tips: [
      'Use the recipient count to confirm your filter matches who you intend to message.',
    ],
  },
  {
    id: 'analytics',
    label: 'Analytics',
    Icon: BarChart3,
    description: 'Student attendance insights',
    tips: [
      'Rates below the amber threshold are flagged for intervention planning.',
    ],
  },
  {
    id: 'readers',
    label: 'Readers',
    Icon: ScanLine,
    description: 'Manage RFID devices',
    tips: [
      'A reader needs an active status and correct room to accept scans.',
    ],
  },
  {
    id: 'users',
    label: 'Users',
    Icon: UsersRound,
    description: 'Manage user roles',
    tips: [
      'Role changes take effect the next time that user signs in.',
    ],
  },
]

const ADMIN_TAB_KEY = 'tago-admin-tab'

function getStoredAdminTab() {
  try {
    const stored = window.localStorage.getItem(ADMIN_TAB_KEY)
    return TABS.some((item) => item.id === stored) ? stored : 'students'
  } catch {
    return 'students'
  }
}

function formatClock(date) {
  return date.toLocaleTimeString([], {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  })
}

export default function AdminPage({ session, profile }) {
  const [tab, setTab] = useState(getStoredAdminTab)
  const [clock, setClock] = useState(() => new Date())
  const [helpOpen, setHelpOpen] = useState(false)
  const helpRef = useRef(null)

  const activeTab = TABS.find((item) => item.id === tab)
  const ActiveIcon = activeTab?.Icon

  useEffect(() => {
    try {
      window.localStorage.setItem(ADMIN_TAB_KEY, tab)
    } catch {
      // Persisting the admin tab is a convenience only.
    }
  }, [tab])

  useEffect(() => {
    const intervalId = window.setInterval(() => setClock(new Date()), 1000)
    return () => window.clearInterval(intervalId)
  }, [])

  useEffect(() => {
    setHelpOpen(false)
  }, [tab])

  useEffect(() => {
    if (!helpOpen) return undefined

    const closeOnPointerDown = (event) => {
      if (!helpRef.current?.contains(event.target)) setHelpOpen(false)
    }

    const closeOnEscape = (event) => {
      if (event.key === 'Escape') setHelpOpen(false)
    }

    document.addEventListener('pointerdown', closeOnPointerDown)
    document.addEventListener('keydown', closeOnEscape)

    return () => {
      document.removeEventListener('pointerdown', closeOnPointerDown)
      document.removeEventListener('keydown', closeOnEscape)
    }
  }, [helpOpen])

  return (
    <div className="admin-app-frame">
      <aside className="admin-sidebar" aria-label="Admin navigation">
        <div className="admin-sidebar-brand">
          <TagoLogo showWord size={20} markClassName="admin-logo" />
        </div>

        <div className="admin-sidebar-profile">
          <span className="profile-menu-avatar" aria-hidden="true">
            {(profile?.full_name || session?.user?.email || 'A').slice(0, 1).toUpperCase()}
          </span>
          <div>
            <strong>{profile?.full_name || 'Admin User'}</strong>
            <span>{session?.user?.email}</span>
          </div>
        </div>

        <nav className="admin-sidebar-nav">
          <p>Your Apps</p>
          {TABS.slice(0, 6).map(({ id, label, Icon }) => (
            <button
              key={id}
              type="button"
              className={tab === id ? 'is-active' : ''}
              onClick={() => setTab(id)}
            >
              <Icon size={17} strokeWidth={2.2} />
              <span>{label}</span>
            </button>
          ))}

          <p>Your Company</p>
          {TABS.slice(6).map(({ id, label, Icon }) => (
            <button
              key={id}
              type="button"
              className={tab === id ? 'is-active' : ''}
              onClick={() => setTab(id)}
            >
              <Icon size={17} strokeWidth={2.2} />
              <span>{label}</span>
            </button>
          ))}
        </nav>
      </aside>

      <div className="admin-workspace">
        <header className="admin-topbar">
          <div className="admin-topbar-left">
            <div>
              <p>Home / {activeTab?.label}</p>
              <h1>{activeTab?.label}</h1>
            </div>
          </div>

          <div className="admin-topbar-actions">
            <span className="admin-live-clock">{formatClock(clock)}</span>

            <Link to="/admin/students" className="btn-ghost admin-card-lookup-link">
              <CreditCard size={16} strokeWidth={2.2} />
              Card lookup
            </Link>

            <NotificationBell />

            <div className="admin-help-menu" ref={helpRef}>
              <button
                type="button"
                className="admin-icon-button"
                aria-label="Help"
                aria-haspopup="dialog"
                aria-expanded={helpOpen}
                onClick={() => setHelpOpen((current) => !current)}
              >
                <HelpCircle size={18} strokeWidth={2.3} />
              </button>

              <AnimatePresence>
                {helpOpen && (
                  <motion.div
                    className="admin-help-content"
                    role="dialog"
                    aria-label={`Help for ${activeTab?.label}`}
                    initial={{ opacity: 0, y: -8, scale: 0.98 }}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    exit={{ opacity: 0, y: -6, scale: 0.98 }}
                    transition={{ duration: 0.18, ease: [0.22, 1, 0.36, 1] }}
                  >
                    <div className="admin-help-header">
                      {ActiveIcon && <ActiveIcon size={16} strokeWidth={2.3} />}
                      <strong>{activeTab?.label}</strong>
                    </div>
                    <p>{activeTab?.description}</p>

                    {activeTab?.tips?.length > 0 && (
                      <ul className="admin-help-tips">
                        {activeTab.tips.map((tip) => (
                          <li key={tip}>{tip}</li>
                        ))}
                      </ul>
                    )}

                    <Link
                      to="/docs"
                      className="admin-help-link"
                      onClick={() => setHelpOpen(false)}
                    >
                      View full documentation
                    </Link>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>

            <ThemeToggle />
            <ProfileMenu
              name={profile?.full_name || 'Admin User'}
              email={session?.user?.email}
              role="admin"
              profileId={profile?.id}
            />
          </div>
        </header>

        <main className="admin-main">
          <section className="admin-panel">
            <div className="admin-panel-header">
              <div>
                <p className="admin-eyebrow">Management</p>
                <h2>
                  {ActiveIcon && <ActiveIcon size={20} strokeWidth={2.3} />}
                  {activeTab?.label}
                </h2>
              </div>
            </div>

            <div className="admin-panel-content">
              {tab === 'students' && <StudentsManager />}
              {tab === 'import' && <RosterImportManager />}
              {tab === 'classes' && <ClassesManager />}
              {tab === 'linking' && <StudentClassLinksManager />}
              {tab === 'reviews' && <SessionReviewsManager />}
              {tab === 'appeals' && <AppealsManager />}
              {tab === 'timetable' && <TimetableManager />}
              {tab === 'communication' && <AdminEmailManager />}
              {tab === 'readers' && <ReadersManager />}
              {tab === 'analytics' && <AttendanceOverview />}
              {tab === 'users' && <UsersManager />}
            </div>
          </section>
        </main>

        <AppFooter className="admin-footer" />
      </div>
    </div>
  )
}