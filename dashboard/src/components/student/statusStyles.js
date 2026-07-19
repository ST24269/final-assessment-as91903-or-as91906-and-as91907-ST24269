// Shared between TodayStatusCard and AttendanceHistoryTable so the two
// don't drift out of sync with separate copies of the same maps.

export const STATUS_BADGE_CLASS = {
  present: 'status-present',
  late: 'status-late',
  absent: 'status-absent',
  excused: 'status-excused',
}

export const TODAY_STATUS_COLOUR = {
  present: 'var(--green)',
  late: 'var(--amber)',
  absent: 'var(--red)',
  excused: 'var(--blue)',
}