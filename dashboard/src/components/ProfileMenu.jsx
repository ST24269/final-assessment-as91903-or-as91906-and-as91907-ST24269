import { useEffect, useMemo, useRef, useState } from 'react'
import { AnimatePresence, motion } from 'motion/react'
import {
  BarChart3,
  ChevronDown,
  KeyRound,
  LayoutDashboard,
  LogOut,
  Radio,
  Settings,
  User,
} from 'lucide-react'
import { Link, useLocation } from 'react-router-dom'
import { supabase } from '../api/client'
import { ACCOUNT_SECTIONS, getAccountSections } from '../config/permissions'

const ROLE_LABELS = {
  teacher: 'Teacher',
  student: 'Student',
  admin: 'Admin',
}

const SECTION_ICONS = {
  profile: User,
  rfid: Radio,
  attendance: BarChart3,
  security: KeyRound,
  settings: Settings,
}

function getInitials(name, email) {
  const source = name || email || 'User'
  const parts = source
    .replace(/@.*/, '')
    .split(/[.\s_-]+/)
    .filter(Boolean)

  return parts
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join('') || 'U'
}

function getStoredAvatar(profileId) {
  if (!profileId) return ''

  try {
    return window.localStorage.getItem(`tago-avatar-${profileId}`) || ''
  } catch {
    return ''
  }
}

export default function ProfileMenu({
  name,
  email,
  role,
  profileId,
  onSignOut = () => supabase.auth.signOut(),
}) {
  const [open, setOpen] = useState(false)
  const [, setAvatarVersion] = useState(0)
  const menuRef = useRef(null)
  const location = useLocation()
  const roleLabel = ROLE_LABELS[role] || 'Account'
  const displayName = name || email?.split('@')[0] || roleLabel
  const initials = useMemo(() => getInitials(displayName, email), [displayName, email])
  const avatarUrl = getStoredAvatar(profileId)
  const menuItems = [
    ...getAccountSections(role).map((section) => {
      const config = ACCOUNT_SECTIONS[section]
      return {
        label: config.menuLabel,
        value: config.value,
        to: `/account/${section}`,
        Icon: SECTION_ICONS[section],
      }
    }),
    {
      label: 'Dashboard',
      value: roleLabel,
      to: role ? `/${role}` : '/login/student',
      Icon: LayoutDashboard,
    },
  ]

  useEffect(() => {
    if (!profileId) return undefined

    const syncAvatar = (event) => {
      if (event.detail?.profileId === profileId) {
        setAvatarVersion((current) => current + 1)
      }
    }

    window.addEventListener('tago-avatar-updated', syncAvatar)

    return () => window.removeEventListener('tago-avatar-updated', syncAvatar)
  }, [profileId])

  useEffect(() => {
    if (!open) return undefined

    const closeOnPointerDown = (event) => {
      if (!menuRef.current?.contains(event.target)) setOpen(false)
    }

    const closeOnEscape = (event) => {
      if (event.key === 'Escape') setOpen(false)
    }

    document.addEventListener('pointerdown', closeOnPointerDown)
    document.addEventListener('keydown', closeOnEscape)

    return () => {
      document.removeEventListener('pointerdown', closeOnPointerDown)
      document.removeEventListener('keydown', closeOnEscape)
    }
  }, [open])

  const handleSignOut = async () => {
    setOpen(false)
    await onSignOut()
  }

  return (
    <div className={`profile-menu ${open ? 'is-open' : ''}`} ref={menuRef}>
      <button
        type="button"
        className="profile-menu-trigger"
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((current) => !current)}
      >
        <span className="profile-menu-copy">
          <span className="profile-menu-name">{displayName}</span>
          <span className="profile-menu-email">{email}</span>
        </span>
        {avatarUrl ? (
          <img className="profile-menu-avatar" src={avatarUrl} alt="" />
        ) : (
          <span className="profile-menu-avatar" aria-hidden="true">{initials}</span>
        )}
        <ChevronDown
          className={`profile-menu-chevron ${open ? 'is-open' : ''}`}
          size={16}
          strokeWidth={2.3}
        />
      </button>

      <AnimatePresence>
        {open && (
          <motion.div
            className="profile-menu-content"
            role="menu"
            initial={{ opacity: 0, y: -8, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -6, scale: 0.98 }}
            transition={{ duration: 0.18, ease: [0.22, 1, 0.36, 1] }}
          >
            <div className="profile-menu-summary">
              {avatarUrl ? (
                <img className="profile-menu-avatar profile-menu-avatar-large" src={avatarUrl} alt="" />
              ) : (
                <span className="profile-menu-avatar profile-menu-avatar-large" aria-hidden="true">{initials}</span>
              )}
              <div>
                <strong>{displayName}</strong>
                <span>{email}</span>
              </div>
            </div>

            <div className="profile-menu-list">
              {menuItems.map(({ label, value, to, Icon }, index) => (
                <motion.div
                  key={to}
                  initial={{ opacity: 0, x: -6 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: 0.03 + (index * 0.035), duration: 0.18 }}
                >
                  <Link
                    className={`profile-menu-item ${location.pathname === to ? 'is-active' : ''}`}
                    to={to}
                    role="menuitem"
                    onClick={() => setOpen(false)}
                  >
                    <Icon size={16} strokeWidth={2.2} />
                    <span>{label}</span>
                    <em>{value}</em>
                  </Link>
                </motion.div>
              ))}
            </div>

            <div className="profile-menu-separator" />

            <button
              type="button"
              className="profile-menu-signout"
              onClick={handleSignOut}
              role="menuitem"
            >
              <LogOut size={16} strokeWidth={2.2} />
              <span>Sign out</span>
            </button>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
