import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import {
  ArrowLeft,
  Bell,
  Camera,
  CheckCircle2,
  KeyRound,
  LogOut,
  Moon,
  Radio,
  ShieldCheck,
  Sun,
} from 'lucide-react'
import { api, supabase } from '../api/client'
import Layout from '../components/Layout'
import Card from '../components/Card'
import Loader from '../components/Loader'
import useThemeMode, { animateThemeChange } from '../hooks/useThemeMode'
import { ACCOUNT_SECTIONS, getAccountSections } from '../config/permissions'

const ROLE_LABELS = {
  teacher: 'Teacher',
  student: 'Student',
  admin: 'Admin',
}

const SECTION_LABELS = {
  profile: 'Profile overview',
  rfid: 'RFID card',
  attendance: 'Attendance',
  security: 'Account security',
  settings: 'Settings',
}

function dashboardPath(role) {
  return role ? `/${role}` : '/login/student'
}

function formatDateTime(value) {
  if (!value) return 'Not recorded'
  return new Date(value).toLocaleString([], {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

function formatDate(value) {
  if (!value) return 'Not recorded'
  return new Date(value).toLocaleDateString([], { month: 'short', day: 'numeric', year: 'numeric' })
}

function maskId(value, visible = 4) {
  if (!value) return 'Not linked'
  const clean = String(value).replace(/\s+/g, '').toUpperCase()
  return `${'*'.repeat(Math.max(clean.length - visible, 4))}${clean.slice(-visible)}`
}

function shortStaffId(value) {
  if (!value) return 'Not set'
  return `STAFF-${String(value).slice(0, 8).toUpperCase()}`
}

function getStoredPreferences(profileId) {
  if (typeof window === 'undefined' || !profileId) {
    return { emailAlerts: true, absenceAlerts: true, contactEmail: '' }
  }

  const stored = (() => {
    try {
      return window.localStorage.getItem(`tago-account-settings-${profileId}`)
    } catch {
      return null
    }
  })()

  if (!stored) return { emailAlerts: true, absenceAlerts: true, contactEmail: '' }

  try {
    return {
      emailAlerts: true,
      absenceAlerts: true,
      contactEmail: '',
      ...JSON.parse(stored),
    }
  } catch {
    return { emailAlerts: true, absenceAlerts: true, contactEmail: '' }
  }
}

function getStoredAvatar(profileId) {
  if (typeof window === 'undefined' || !profileId) return ''

  try {
    return window.localStorage.getItem(`tago-avatar-${profileId}`) || ''
  } catch {
    return ''
  }
}

function ActionNotice({ notice }) {
  if (!notice) return null

  return (
    <p
      className={`action-notice ${notice.type === 'error' ? 'is-error' : 'is-success'}`}
      role={notice.type === 'error' ? 'alert' : 'status'}
    >
      {notice.text}
    </p>
  )
}

function summariseAttendance(records) {
  const counted = records.filter((record) => record.status !== 'excused')
  const attended = counted.filter((record) => record.status === 'present' || record.status === 'late')
  const now = Date.now()
  const sevenDays = records.filter((record) => record.scanned_at && now - new Date(record.scanned_at).getTime() <= 7 * 24 * 60 * 60 * 1000)
  const thirtyDays = records.filter((record) => record.scanned_at && now - new Date(record.scanned_at).getTime() <= 30 * 24 * 60 * 60 * 1000)

  return {
    percentage: counted.length ? Math.round((attended.length / counted.length) * 100) : null,
    present: records.filter((record) => record.status === 'present').length,
    late: records.filter((record) => record.status === 'late').length,
    absent: records.filter((record) => record.status === 'absent').length,
    weekCount: sevenDays.length,
    monthCount: thirtyDays.length,
    weekAttended: sevenDays.filter((record) => record.status === 'present' || record.status === 'late').length,
    monthAttended: thirtyDays.filter((record) => record.status === 'present' || record.status === 'late').length,
  }
}

export default function AccountPage({ session, profile, section = 'profile', setProfile }) {
  const [fullName, setFullName] = useState(profile?.full_name || '')
  const [password, setPassword] = useState('')
  const [savingProfile, setSavingProfile] = useState(false)
  const [savingPassword, setSavingPassword] = useState(false)
  const [accountData, setAccountData] = useState({
    loading: true,
    error: null,
    student: null,
    classes: [],
    attendance: [],
  })
  const [preferences, setPreferences] = useState(() => getStoredPreferences(profile?.id))
  const [avatarUrl, setAvatarUrl] = useState(() => getStoredAvatar(profile?.id))
  const [cardDetails, setCardDetails] = useState('')
  const [sendingCardRequest, setSendingCardRequest] = useState(null)
  const [notices, setNotices] = useState({})
  const { theme, setTheme } = useThemeMode()
  const activeSection = SECTION_LABELS[section] ? section : 'profile'
  const roleLabel = ROLE_LABELS[profile?.role] || 'Account'
  const allowedSections = useMemo(() => getAccountSections(profile?.role), [profile?.role])
  const attendanceSummary = useMemo(
    () => summariseAttendance(accountData.attendance),
    [accountData.attendance],
  )
  const isStudent = profile?.role === 'student'
  const displayName = accountData.student?.full_name || profile?.full_name || session.user.email
  const classesLabel = accountData.classes.length
    ? accountData.classes.map((classItem) => classItem.name).join(', ')
    : isStudent ? 'No classes linked' : profile?.role === 'teacher' ? 'No classes assigned' : 'Admin access'
  const cardUid = accountData.student?.rfid_card_uid
  const lastScan = accountData.attendance[0]?.scanned_at || null
  const accountStats = isStudent ? [
    ['Attendance', attendanceSummary.percentage === null ? 'No data' : `${attendanceSummary.percentage}%`],
    ['RFID', cardUid ? 'Linked' : 'Not linked'],
    ['Late', attendanceSummary.late],
    ['Absent', attendanceSummary.absent],
  ] : [
    ['Role', roleLabel],
    [profile?.role === 'teacher' ? 'Classes' : 'Access', profile?.role === 'teacher' ? accountData.classes.length : 'Admin'],
    ['Last login', formatDateTime(session.user.last_sign_in_at)],
    ['Profile', 'Staff'],
  ]

  const setActionNotice = (key, type, text) => {
    setNotices((current) => ({
      ...current,
      [key]: text ? { type, text } : null,
    }))
  }

  useEffect(() => {
    let cancelled = false

    async function loadAccountData() {
      setAccountData((current) => ({ ...current, loading: true, error: null }))

      if (profile?.role === 'student') {
        const { data: linkedStudent, error: linkError } = await supabase
          .from('student_profiles')
          .select('student_id, students(id, full_name, student_number, year_level, rfid_card_uid, created_at)')
          .eq('profile_id', session.user.id)
          .maybeSingle()

        if (cancelled) return

        if (linkError) {
          setAccountData({ loading: false, error: linkError.message, student: null, classes: [], attendance: [] })
          return
        }

        if (!linkedStudent?.student_id) {
          setAccountData({ loading: false, error: null, student: null, classes: [], attendance: [] })
          return
        }

        const [{ data: enrolments }, { data: attendance }] = await Promise.all([
          supabase
            .from('enrolments')
            .select('classes(id, name, subject, room)')
            .eq('student_id', linkedStudent.student_id),
          supabase
            .from('attendance')
            .select('id, status, scanned_at, flagged, manual_override, sessions(started_at, classes(name, subject, room))')
            .eq('student_id', linkedStudent.student_id)
            .order('scanned_at', { ascending: false })
            .limit(30),
        ])

        if (cancelled) return

        setAccountData({
          loading: false,
          error: null,
          student: linkedStudent.students || null,
          classes: enrolments?.map((row) => row.classes).filter(Boolean) || [],
          attendance: attendance || [],
        })
        return
      }

      if (profile?.role === 'teacher') {
        const { data: classes, error: classError } = await supabase
          .from('classes')
          .select('id, name, subject, room')
          .eq('teacher_id', session.user.id)
          .order('name')

        if (cancelled) return

        setAccountData({
          loading: false,
          error: classError?.message || null,
          student: null,
          classes: classes || [],
          attendance: [],
        })
        return
      }

      setAccountData({ loading: false, error: null, student: null, classes: [], attendance: [] })
    }

    loadAccountData()

    return () => { cancelled = true }
  }, [profile?.role, session.user.id])

  useEffect(() => {
    if (accountData.loading) return

    const target = document.getElementById(`account-${activeSection}`)
    target?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }, [activeSection, accountData.loading])

  const handleProfileSubmit = async (event) => {
    event.preventDefault()
    const trimmedName = fullName.trim()

    if (!trimmedName) {
      setActionNotice('profile', 'error', 'Enter a display name.')
      return
    }

    setSavingProfile(true)
    setActionNotice('profile', null, null)

    const data = await api.patch('/api/users/me', { full_name: trimmedName })
    setSavingProfile(false)

    if (data?.error) {
      setActionNotice('profile', 'error', data.error)
      return
    }

    setProfile?.(data.profile)
    setActionNotice('profile', 'success', 'Profile updated.')
  }

  const handlePasswordSubmit = async (event) => {
    event.preventDefault()

    if (password.length < 6) {
      setActionNotice('security', 'error', 'Password must be at least 6 characters.')
      return
    }

    setSavingPassword(true)
    setActionNotice('security', null, null)

    const { error: updateError } = await supabase.auth.updateUser({ password })
    setSavingPassword(false)

    if (updateError) {
      setActionNotice('security', 'error', updateError.message)
      return
    }

    setPassword('')
    setActionNotice('security', 'success', 'Password updated.')
  }

  const handleAvatarChange = (event) => {
    const file = event.target.files?.[0]
    if (!file) return

    if (!file.type.startsWith('image/')) {
      setActionNotice('profile', 'error', 'Choose an image file for the profile picture.')
      return
    }

    const reader = new FileReader()
    reader.onload = () => {
      const nextAvatar = String(reader.result || '')

      try {
        window.localStorage.setItem(`tago-avatar-${profile.id}`, nextAvatar)
      } catch {
        setActionNotice('profile', 'error', 'This browser could not save the profile picture locally.')
        return
      }

      setAvatarUrl(nextAvatar)
      window.dispatchEvent(new CustomEvent('tago-avatar-updated', {
        detail: { profileId: profile.id, avatarUrl: nextAvatar },
      }))
      setActionNotice('profile', 'success', 'Profile picture updated on this device.')
    }
    reader.readAsDataURL(file)
  }

  const removeAvatar = () => {
    try {
      window.localStorage.removeItem(`tago-avatar-${profile.id}`)
    } catch {
      setActionNotice('profile', 'error', 'This browser could not remove the saved profile picture.')
      return
    }

    setAvatarUrl('')
    window.dispatchEvent(new CustomEvent('tago-avatar-updated', {
      detail: { profileId: profile.id, avatarUrl: '' },
    }))
    setActionNotice('profile', 'success', 'Profile picture removed.')
  }

  const handleCardRequest = async (type) => {
    setSendingCardRequest(type)
    setActionNotice('rfid', null, null)

    const data = await api.post('/api/users/card-request', {
      type,
      details: cardDetails.trim() || undefined,
    })

    setSendingCardRequest(null)

    if (data?.error) {
      setActionNotice('rfid', 'error', data.error)
      return
    }

    if (data?.deactivated) {
      setAccountData((current) => ({
        ...current,
        student: current.student ? { ...current.student, rfid_card_uid: null } : current.student,
      }))
    }

    if (data?.emailSent) {
      setActionNotice('rfid', 'success', data.deactivated
        ? 'Card deactivated and an email was sent to support.'
        : 'Request email sent to support.')
    } else {
      setActionNotice('rfid', 'success', data.deactivated
        ? `Card deactivated, but email was not sent: ${data.emailError}`
        : `Request saved, but email was not sent: ${data.emailError}`)
    }
  }

  const savePreferences = () => {
    try {
      window.localStorage.setItem(`tago-account-settings-${profile.id}`, JSON.stringify(preferences))
    } catch {
      setActionNotice('settings', 'error', 'This browser could not save settings locally.')
      return
    }

    setActionNotice('settings', 'success', 'Settings saved on this device.')
  }

  const changeTheme = (nextTheme, event) => {
    const rect = event.currentTarget.getBoundingClientRect()
    animateThemeChange(nextTheme, {
      x: rect.left + (rect.width / 2),
      y: rect.top + (rect.height / 2),
    })
    setTheme(nextTheme)
  }

  if (accountData.loading) {
    return (
      <Loader
        title="Loading profile"
        subtitle="Gathering identity, RFID, and attendance details"
      />
    )
  }

  return (
    <Layout email={session.user.email} name={profile?.full_name} role={profile?.role} profileId={profile?.id}>
      <section className="account-hero">
        <div className="account-hero-identity">
          {avatarUrl ? (
            <img className="account-profile-avatar" src={avatarUrl} alt="" />
          ) : (
            <div className="account-profile-avatar" aria-hidden="true">
              {displayName.split(/\s+/).slice(0, 2).map((part) => part[0]).join('').toUpperCase() || 'U'}
            </div>
          )}
          <div>
            <p className="portal-eyebrow">Profile</p>
            <h1 className="portal-title">{displayName}</h1>
            <p className="portal-subtitle">{roleLabel} - {session.user.email}</p>
          </div>
        </div>
        <Link className="account-back-link" to={dashboardPath(profile?.role)}>
          <ArrowLeft size={16} strokeWidth={2.2} />
          Dashboard
        </Link>
      </section>

      <nav className="account-section-nav" aria-label="Profile sections">
        {allowedSections.map((id) => (
          <Link
            key={id}
            className={`account-section-link ${activeSection === id ? 'is-active' : ''}`}
            to={`/account/${id}`}
          >
            {ACCOUNT_SECTIONS[id]?.label || id}
          </Link>
        ))}
      </nav>

      {accountData.error && (
        <div className="portal-alert" role="alert">
          {accountData.error}
        </div>
      )}

      <section className="account-stat-grid" aria-label="Profile quick summary">
        {accountStats.map(([label, value]) => (
          <div className="account-stat" key={label}>
            <span>{label}</span>
            <strong>{value}</strong>
          </div>
        ))}
      </section>

      <section id="account-profile" className="account-section">
        <Card title="Personal info">
          <div className="account-two-column">
            <form className="account-form" onSubmit={handleProfileSubmit}>
              <div className="account-avatar-editor">
                {avatarUrl ? (
                  <img className="account-avatar-preview" src={avatarUrl} alt="" />
                ) : (
                  <div className="account-avatar-preview" aria-hidden="true">
                    <Camera size={20} strokeWidth={2.2} />
                  </div>
                )}
                <div className="account-avatar-actions">
                  <label className="account-file-button" htmlFor="profile-picture">
                    <Camera size={16} strokeWidth={2.2} />
                    Set profile picture
                  </label>
                  <input
                    id="profile-picture"
                    className="sr-only"
                    type="file"
                    accept="image/*"
                    onChange={handleAvatarChange}
                  />
                  {avatarUrl && (
                    <button type="button" className="btn-ghost" onClick={removeAvatar}>
                      Remove picture
                    </button>
                  )}
                </div>
              </div>

              <div className="login-field">
                <label htmlFor="account-full-name">Full name</label>
                <input
                  id="account-full-name"
                  value={fullName}
                  onChange={(event) => setFullName(event.target.value)}
                  placeholder="Your name"
                />
              </div>
              <div className="account-action-row">
                <button type="submit" disabled={savingProfile}>
                  {savingProfile ? 'Saving...' : 'Save profile'}
                </button>
              </div>
              <ActionNotice notice={notices.profile} />
            </form>

            <div className="account-detail-list">
              <div>
                <span>{isStudent ? 'Student ID' : 'Staff ID'}</span>
                <strong>{isStudent ? accountData.student?.student_number || 'Not linked' : shortStaffId(profile?.id)}</strong>
              </div>
              <div>
                <span>Role</span>
                <strong>{roleLabel}</strong>
              </div>
              <div>
                <span>Email</span>
                <strong>{profile?.email || session.user.email}</strong>
              </div>
              <div>
                <span>Kainga / class</span>
                <strong>{classesLabel}</strong>
              </div>
              <div>
                <span>Created</span>
                <strong>{formatDate(profile?.created_at)}</strong>
              </div>
            </div>
          </div>
        </Card>
      </section>

      {allowedSections.includes('rfid') && (
      <section id="account-rfid" className="account-section">
        <Card title="RFID info">
          <div className="account-two-column">
            <div className="account-role-card">
              <div className={`account-role-icon ${cardUid ? 'student' : ''}`}>
                <Radio size={22} strokeWidth={2.3} />
              </div>
              <div>
                <strong>{cardUid ? 'Card linked' : 'No RFID card linked'}</strong>
                <span>Sensitive RFID data is masked for privacy and security.</span>
              </div>
            </div>

            <div className="account-detail-list">
              <div>
                <span>Masked card ID</span>
                <strong>{maskId(cardUid)}</strong>
              </div>
              <div>
                <span>Last card scan</span>
                <strong>{formatDateTime(lastScan)}</strong>
              </div>
              <div>
                <span>Card actions</span>
                <textarea
                  className="account-card-details"
                  value={cardDetails}
                  onChange={(event) => setCardDetails(event.target.value)}
                  placeholder="Optional note for the office"
                />
                <div className="account-inline-actions">
                  <button
                    type="button"
                    className="btn-ghost"
                    disabled={Boolean(sendingCardRequest)}
                    onClick={() => handleCardRequest('reassign')}
                  >
                    {sendingCardRequest === 'reassign' ? 'Sending...' : 'Request reassignment'}
                  </button>
                  <button
                    type="button"
                    className="btn-ghost"
                    disabled={Boolean(sendingCardRequest)}
                    onClick={() => handleCardRequest('new')}
                  >
                    {sendingCardRequest === 'new' ? 'Sending...' : 'Request new card'}
                  </button>
                  <button
                    type="button"
                    className="btn-ghost"
                    disabled={Boolean(sendingCardRequest)}
                    onClick={() => handleCardRequest('missing')}
                  >
                    {sendingCardRequest === 'missing' ? 'Deactivating...' : 'Report missing card'}
                  </button>
                  <button
                    type="button"
                    className="btn-ghost account-danger-inline"
                    disabled={Boolean(sendingCardRequest)}
                    onClick={() => handleCardRequest('stolen')}
                  >
                    {sendingCardRequest === 'stolen' ? 'Deactivating...' : 'Report stolen card'}
                  </button>
                </div>
                <ActionNotice notice={notices.rfid} />
              </div>
            </div>
          </div>
        </Card>
      </section>
      )}

      {allowedSections.includes('attendance') && (
      <section id="account-attendance" className="account-section">
        <Card title="Attendance summary">
          {isStudent ? (
            <div className="account-attendance-layout">
              <div className="account-mini-stats">
                <div><span>Overall</span><strong>{attendanceSummary.percentage === null ? 'No data' : `${attendanceSummary.percentage}%`}</strong></div>
                <div><span>Present</span><strong>{attendanceSummary.present}</strong></div>
                <div><span>Late</span><strong>{attendanceSummary.late}</strong></div>
                <div><span>Absent</span><strong>{attendanceSummary.absent}</strong></div>
              </div>

              <div className="account-detail-list">
                <div>
                  <span>Weekly summary</span>
                  <strong>{attendanceSummary.weekCount ? `${attendanceSummary.weekAttended}/${attendanceSummary.weekCount} attended` : 'No records this week'}</strong>
                </div>
                <div>
                  <span>Monthly summary</span>
                  <strong>{attendanceSummary.monthCount ? `${attendanceSummary.monthAttended}/${attendanceSummary.monthCount} attended` : 'No records this month'}</strong>
                </div>
              </div>

              <div className="account-recent-list">
                {accountData.attendance.slice(0, 5).map((record) => (
                  <div key={record.id} className="account-recent-row">
                    <div>
                      <strong>{record.sessions?.classes?.name || 'Attendance scan'}</strong>
                      <span>{formatDateTime(record.scanned_at)}</span>
                    </div>
                    <span className={`status-badge status-${record.status || 'absent'}`}>{record.status || 'unknown'}</span>
                  </div>
                ))}
                {accountData.attendance.length === 0 && (
                  <div className="portal-empty">
                    <strong>No attendance records yet</strong>
                    <span>Recent RFID scans will appear here once your card is used for class attendance.</span>
                  </div>
                )}
              </div>
            </div>
          ) : (
            <div className="portal-empty">
              <strong>Attendance summary is for student accounts.</strong>
              <span>Staff accounts use Tago to manage sessions, readers, and records rather than record personal attendance.</span>
            </div>
          )}
        </Card>
      </section>
      )}

      <section id="account-security" className="account-section">
        <div className="account-grid">
          <Card title="Account and security">
            <form className="account-form" onSubmit={handlePasswordSubmit}>
              <div className="login-field">
                <label htmlFor="account-password">New password</label>
                <input
                  id="account-password"
                  type="password"
                  autoComplete="new-password"
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  placeholder="At least 6 characters"
                />
              </div>
              <div className="account-action-row">
                <button type="submit" disabled={savingPassword}>
                  <KeyRound size={16} strokeWidth={2.2} />
                  {savingPassword ? 'Updating...' : 'Update password'}
                </button>
              </div>
              <ActionNotice notice={notices.security} />
            </form>

            <div className="account-security-actions">
              <div>
                <span>Last login</span>
                <strong>{formatDateTime(session.user.last_sign_in_at)}</strong>
              </div>
              <button type="button" className="account-danger-button" onClick={() => supabase.auth.signOut()}>
                <LogOut size={16} strokeWidth={2.2} />
                Logout
              </button>
            </div>
          </Card>

          <Card title="Privacy notice">
            <div className="account-privacy-note">
              <ShieldCheck size={22} strokeWidth={2.3} />
              <p>
                RFID is used only to record attendance. Full RFID card IDs are not shown in the profile, and card data should only be changed by authorised staff.
              </p>
            </div>
          </Card>
        </div>
      </section>

      <section id="account-settings" className="account-section">
        <div className="account-grid">
          <Card title="Notification preferences">
            <div className="account-settings-list">
              <label className="account-toggle-row">
                <input
                  type="checkbox"
                  checked={preferences.emailAlerts}
                  onChange={(event) => setPreferences((current) => ({ ...current, emailAlerts: event.target.checked }))}
                />
                <span><Bell size={16} strokeWidth={2.2} /> Email alerts</span>
              </label>
              <label className="account-toggle-row">
                <input
                  type="checkbox"
                  checked={preferences.absenceAlerts}
                  onChange={(event) => setPreferences((current) => ({ ...current, absenceAlerts: event.target.checked }))}
                />
                <span><CheckCircle2 size={16} strokeWidth={2.2} /> Absence alerts</span>
              </label>
              <div className="login-field">
                <label htmlFor="contact-email">Preferred contact email</label>
                <input
                  id="contact-email"
                  type="email"
                  value={preferences.contactEmail}
                  onChange={(event) => setPreferences((current) => ({ ...current, contactEmail: event.target.value }))}
                  placeholder={session.user.email}
                />
              </div>
              <button type="button" onClick={savePreferences}>Save preferences</button>
              <ActionNotice notice={notices.settings} />
            </div>
          </Card>

          <Card title="Display settings">
            <div className="account-choice-row" role="group" aria-label="Theme">
              <button
                type="button"
                className={`account-choice ${theme === 'light' ? 'is-active' : ''}`}
                onClick={(event) => changeTheme('light', event)}
              >
                <Sun size={16} strokeWidth={2.2} />
                Light
              </button>
              <button
                type="button"
                className={`account-choice ${theme === 'dark' ? 'is-active' : ''}`}
                onClick={(event) => changeTheme('dark', event)}
              >
                <Moon size={16} strokeWidth={2.2} />
                Dark
              </button>
            </div>
          </Card>
        </div>
      </section>
    </Layout>
  )
}
