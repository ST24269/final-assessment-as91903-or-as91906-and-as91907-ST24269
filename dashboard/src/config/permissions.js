export const ACCOUNT_SECTIONS = {
  profile: {
    label: 'Personal info',
    menuLabel: 'Profile overview',
    value: 'Identity',
  },
  rfid: {
    label: 'RFID info',
    menuLabel: 'RFID card',
    value: 'Card status',
  },
  attendance: {
    label: 'Attendance',
    menuLabel: 'Attendance',
    value: 'Summary',
  },
  security: {
    label: 'Account',
    menuLabel: 'Security',
    value: 'Password',
  },
  settings: {
    label: 'Settings',
    menuLabel: 'Settings',
    value: 'Alerts',
  },
}

const ACCOUNT_SECTIONS_BY_ROLE = {
  student: ['profile', 'rfid', 'attendance', 'security', 'settings'],
  teacher: ['profile', 'security', 'settings'],
  admin: ['profile', 'security', 'settings'],
}

export function getAccountSections(role) {
  return ACCOUNT_SECTIONS_BY_ROLE[role] || ACCOUNT_SECTIONS_BY_ROLE.student
}

export function canAccessAccountSection(role, section) {
  return getAccountSections(role).includes(section)
}
