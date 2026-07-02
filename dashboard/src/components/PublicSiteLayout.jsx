import { useState } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { FileText, GraduationCap, Home, LogIn, Menu, ShieldCheck, UsersRound, X } from 'lucide-react'
import AppFooter from './AppFooter'
import ThemeToggle from './ThemeToggle'

const loginLinks = [
  { label: 'Student', to: '/login/student', Icon: GraduationCap },
  { label: 'Teacher', to: '/login/teacher', Icon: UsersRound },
  { label: 'Admin', to: '/login/admin', Icon: ShieldCheck },
]

const menuItems = [
  { label: 'Home', ariaLabel: 'Go to public home page', to: '/', Icon: Home },
  { label: 'Features', ariaLabel: 'View role-based features', to: '/#features', Icon: UsersRound },
  { label: 'Documentation', ariaLabel: 'Open project documentation', to: '/documentation', Icon: FileText },
]

export default function PublicSiteLayout({ children }) {
  const [menuOpen, setMenuOpen] = useState(false)
  const location = useLocation()

  const isActiveLink = (to) => {
    if (to === '/') return location.pathname === '/' || location.pathname === '/home'
    if (to.startsWith('/#')) return location.pathname === '/' && location.hash === to.slice(1)
    return location.pathname === to
  }

  return (
    <div className="public-site">
      <header className={`public-nav-wrap${menuOpen ? ' is-open' : ''}`}>
        <nav className="public-nav" aria-label="Public navigation">
          <Link className="public-brand" to="/" aria-label="AttendRFID home">
            <span className="public-brand-mark" aria-hidden="true">
              <img src="/favicon.svg" alt="" width="28" height="28" />
            </span>
            <span className="public-brand-copy">
              <strong>AttendRFID</strong>
              <em>CSC Attendance System</em>
            </span>
          </Link>

          <div className="public-nav-links" aria-label="Site sections">
            {menuItems.map(({ label, ariaLabel, to, Icon }) => (
              <Link
                key={to}
                className={`public-nav-link${isActiveLink(to) ? ' is-active' : ''}`}
                to={to}
                aria-label={ariaLabel}
                aria-current={isActiveLink(to) ? 'page' : undefined}
                onClick={() => setMenuOpen(false)}
              >
                <Icon size={16} strokeWidth={2.2} />
                <span>{label}</span>
              </Link>
            ))}
          </div>

          <div className="public-nav-actions">
            <div className="public-nav-login-links" aria-label="Login links">
              {loginLinks.map(({ label, to, Icon }, index) => (
                <Link
                  key={to}
                  className={`public-nav-login${index === 0 ? ' is-primary' : ''}`}
                  to={to}
                  onClick={() => setMenuOpen(false)}
                >
                  <Icon size={15} strokeWidth={2.25} />
                  <span>{label}</span>
                </Link>
              ))}
            </div>
            <ThemeToggle />
            <button
              className="public-nav-menu-button"
              type="button"
              aria-label={menuOpen ? 'Close navigation menu' : 'Open navigation menu'}
              aria-expanded={menuOpen}
              aria-controls="public-mobile-menu"
              onClick={() => setMenuOpen((open) => !open)}
            >
              {menuOpen ? <X size={19} strokeWidth={2.35} /> : <Menu size={19} strokeWidth={2.35} />}
              <span>Menu</span>
            </button>
          </div>
        </nav>

        <div className="public-mobile-panel" id="public-mobile-menu" hidden={!menuOpen}>
          <div className="public-mobile-links" aria-label="Mobile site sections">
            {menuItems.map(({ label, ariaLabel, to, Icon }) => (
              <Link
                key={to}
                className={isActiveLink(to) ? 'is-active' : ''}
                to={to}
                aria-label={ariaLabel}
                aria-current={isActiveLink(to) ? 'page' : undefined}
                onClick={() => setMenuOpen(false)}
              >
                <Icon size={17} strokeWidth={2.25} />
                <span>{label}</span>
              </Link>
            ))}
          </div>

          <div className="public-mobile-logins" aria-label="Mobile login links">
            {loginLinks.map(({ label, to, Icon }, index) => (
              <Link
                key={to}
                className={index === 0 ? 'is-primary' : ''}
                to={to}
                onClick={() => setMenuOpen(false)}
              >
                <Icon size={17} strokeWidth={2.25} />
                <span>{label} Login</span>
                <LogIn size={15} strokeWidth={2.25} />
              </Link>
            ))}
          </div>
        </div>
      </header>

      {children}

      <AppFooter className="public-footer" />
    </div>
  )
}
