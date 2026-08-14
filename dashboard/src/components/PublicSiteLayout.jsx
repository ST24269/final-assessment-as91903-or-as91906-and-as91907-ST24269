import { useState } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { Menu, X } from 'lucide-react'
import AppFooter from './AppFooter'
import TagoLogo from './TagoLogo'
import ThemeToggle from './ThemeToggle'
import { Button } from '@/components/ui/button'

const loginLinks = [
  { label: 'Student', to: '/login/student' },
  { label: 'Teacher', to: '/login/teacher' },
  { label: 'Admin', to: '/login/admin' },
]

const menuItems = [
  { label: 'Home', ariaLabel: 'Go to public home page', to: '/' },
  { label: 'Features', ariaLabel: 'View role-based features', to: '/#features' },
  { label: 'Documentation', ariaLabel: 'Open project documentation', to: '/documentation' },
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
      <header className={`vivid-nav-wrap${menuOpen ? ' is-open' : ''}`}>
        <nav className="vivid-nav" aria-label="Public navigation">
          <Link className="vivid-brand" to="/" aria-label="Tago home">
            <TagoLogo showWord markClassName="vivid-brand-mark" />
          </Link>

          <div className="vivid-nav-links" aria-label="Site sections">
            {menuItems.map(({ label, ariaLabel, to }) => (
              <Link
                key={to}
                className={`vivid-nav-link${isActiveLink(to) ? ' is-active' : ''}`}
                to={to}
                aria-label={ariaLabel}
                aria-current={isActiveLink(to) ? 'page' : undefined}
                onClick={() => setMenuOpen(false)}
              >
                {label}
              </Link>
            ))}
          </div>

          <div className="vivid-nav-actions">
            <div className="vivid-nav-logins" aria-label="Login links">
              {loginLinks.map(({ label, to }) => (
                <Link
                  key={to}
                  className="vivid-nav-link"
                  to={to}
                  onClick={() => setMenuOpen(false)}
                >
                  {label}
                </Link>
              ))}
            </div>
            <ThemeToggle className="vivid-theme-toggle" />
            <Button
              variant="outline"
              className="vivid-outline-button vivid-menu-button"
              type="button"
              aria-label={menuOpen ? 'Close navigation menu' : 'Open navigation menu'}
              aria-expanded={menuOpen}
              aria-controls="public-mobile-menu"
              onClick={() => setMenuOpen((open) => !open)}
            >
              {menuOpen ? <X size={17} strokeWidth={1.6} /> : <Menu size={17} strokeWidth={1.6} />}
              <span>Menu</span>
            </Button>
          </div>
        </nav>

        <div className="vivid-mobile-panel" id="public-mobile-menu" hidden={!menuOpen}>
          <div className="vivid-mobile-links" aria-label="Mobile site sections">
            {menuItems.map(({ label, ariaLabel, to }) => (
              <Link
                key={to}
                className={isActiveLink(to) ? 'is-active' : ''}
                to={to}
                aria-label={ariaLabel}
                aria-current={isActiveLink(to) ? 'page' : undefined}
                onClick={() => setMenuOpen(false)}
              >
                {label}
              </Link>
            ))}
          </div>

          <div className="vivid-mobile-logins" aria-label="Mobile login links">
            {loginLinks.map(({ label, to }) => (
              <Link key={to} to={to} onClick={() => setMenuOpen(false)}>
                {label} Login
              </Link>
            ))}
          </div>
        </div>
      </header>

      {children}

      <AppFooter variant="vivid" />
    </div>
  )
}
