import { useEffect, useState } from 'react'
import AppFooter from './AppFooter'
import ProfileMenu from './ProfileMenu'
import TagoLogo from './TagoLogo'
import ThemeToggle from './ThemeToggle'

const ROLE_LABELS = {
  teacher: 'Teacher',
  student: 'Student',
  admin: 'Admin',
}

export default function Layout({ children, email, name, role, profileId }) {
  const [scrolled, setScrolled] = useState(false)

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 8)
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => window.removeEventListener('scroll', onScroll)
  }, [])

  return (
    <div className="app-shell">
      <div className="app-header-wrap">
        <header className={`app-header ${scrolled ? 'is-scrolled' : ''}`}>
          <div className="app-brand">
            <TagoLogo showWord size={18} markClassName="app-brand-mark" />
            <div className="app-brand-copy">
              <span>{ROLE_LABELS[role] || 'Dashboard'}</span>
            </div>
          </div>

          <div className="app-header-actions">
            {role && (
              <span className={`header-role-badge ${role}`}>
                {ROLE_LABELS[role] || role}
              </span>
            )}
            <ThemeToggle />
            <ProfileMenu name={name} email={email} role={role} profileId={profileId} />
          </div>
        </header>
      </div>

      <main className="app-content">
        {children}
      </main>

      <AppFooter />
    </div>
  )
}
