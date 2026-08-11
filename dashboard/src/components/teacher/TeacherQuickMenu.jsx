import { Link } from 'react-router-dom'
import { BarChart3, ClipboardList, Users, UserCog } from 'lucide-react'

// Replaces the four separately-stacked "nav only" cards that used to sit
// in the middle of the teacher dashboard (Search students / Manual roll /
// Find cover, plus Appeals had its own card further down). This is just
// navigation, so it reads as a menu rather than a stack of near-identical
// cards competing with the actual session/timetable content for space.
const MENU_ITEMS = [
  { to: '/teacher/students', Icon: Users, label: 'Search students' },
  { to: '/teacher/manual-roll', Icon: ClipboardList, label: 'Manual roll' },
  { to: '/teacher/cover', Icon: UserCog, label: 'Find cover' },
  { to: '/teacher/analytics', Icon: BarChart3, label: 'Analytics' },
]

export default function TeacherQuickMenu() {
  return (
    <nav className="teacher-quick-menu" aria-label="Teacher quick actions">
      {MENU_ITEMS.map(({ to, Icon, label }) => (
        <Link key={to} to={to} className="teacher-quick-menu-item">
          <span className="teacher-quick-menu-icon" aria-hidden="true">
            <Icon size={18} strokeWidth={2.2} />
          </span>
          <strong>{label}</strong>
        </Link>
      ))}
    </nav>
  )
}