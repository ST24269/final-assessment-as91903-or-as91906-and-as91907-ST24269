function buildClassStats(classes, attendance) {
  return classes.map((classItem) => {
    const classRecords = attendance.filter(
      (record) => record.sessions?.classes?.name === classItem.name
    )
    const present = classRecords.filter(
      (record) => record.status === 'present' || record.status === 'late'
    ).length
    const pct = classRecords.length
      ? Math.round((present / classRecords.length) * 100)
      : null

    return { ...classItem, total: classRecords.length, present, pct }
  })
}

function pctColour(pct) {
  if (pct === null) return 'var(--text-muted)'
  if (pct >= 90) return 'var(--green)'
  if (pct >= 75) return 'var(--amber)'
  return 'var(--red)'
}

export default function ClassAttendanceStats({ classes, attendance }) {
  const stats = buildClassStats(classes, attendance)

  return (
    <div className="card">
      <p className="card-title">Attendance by class</p>
      {stats.length === 0 ? (
        <p className="empty-state">no classes found</p>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          {stats.map((classItem) => (
            <div key={classItem.id}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.4rem' }}>
                <span style={{ fontSize: '0.9rem', fontWeight: 500 }}>
                  {classItem.name}{' '}
                  <span style={{ color: 'var(--text-muted)', fontWeight: 400 }}>
                    - {classItem.subject}
                  </span>
                </span>
                <span style={{
                  fontFamily: 'var(--mono)',
                  fontSize: '0.85rem',
                  color: pctColour(classItem.pct),
                }}>
                  {classItem.pct === null ? '-' : `${classItem.pct}%`}
                </span>
              </div>
              <div style={{
                height: '4px',
                background: 'var(--surface-2)',
                borderRadius: '2px',
                overflow: 'hidden',
              }}>
                <div style={{
                  height: '100%',
                  width: `${classItem.pct || 0}%`,
                  background: pctColour(classItem.pct),
                  borderRadius: '2px',
                  transition: 'width 0.6s ease',
                }} />
              </div>
              <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', fontFamily: 'var(--mono)' }}>
                {classItem.present}/{classItem.total} sessions
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}