import { useEffect, useState } from 'react'
import { api } from '../../api/client'
import ConfirmDialog from '../ConfirmDialog'

function formatDateTime(value) {
  if (!value) return 'never'
  return new Date(value).toLocaleString([], {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

export default function SystemSettingsManager() {
  const [loading, setLoading] = useState(true)
  const [enabled, setEnabled] = useState(false)
  const [updatedAt, setUpdatedAt] = useState(null)
  const [saving, setSaving] = useState(false)
  const [notice, setNotice] = useState(null)
  const [confirmNext, setConfirmNext] = useState(null)

  const loadSettings = async () => {
    setLoading(true)
    const data = await api.get('/api/settings/testing-mode')
    setLoading(false)

    if (data?.error) {
      setNotice({ type: 'error', text: data.error })
      return
    }

    setEnabled(Boolean(data.enabled))
    setUpdatedAt(data.updated_at)
  }

  useEffect(() => {
    loadSettings()
  }, [])

  const applyTestingMode = async (nextEnabled) => {
    setSaving(true)
    setNotice(null)
    const data = await api.patch('/api/settings/testing-mode', { enabled: nextEnabled })
    setSaving(false)
    setConfirmNext(null)

    if (data?.error) {
      setNotice({ type: 'error', text: data.error })
      return
    }

    setEnabled(Boolean(data.enabled))
    setUpdatedAt(data.updated_at)
    setNotice({
      type: 'success',
      text: nextEnabled ? 'Testing mode enabled.' : 'Testing mode disabled - normal timetable check restored.',
    })
  }

  return (
    <div className="student-management">
      <section className="student-management-header">
        <div>
          <p className="card-title">System Settings</p>
          <h3>Testing and rollout controls that affect every teacher.</h3>
        </div>
      </section>

      {notice && (
        <p className={`action-notice ${notice.type === 'error' ? 'is-error' : 'is-success'}`} role={notice.type === 'error' ? 'alert' : 'status'}>
          {notice.text}
        </p>
      )}

      <section className="student-table-card">
        <div className="student-table-head">
          <p className="card-title">Testing Mode</p>
        </div>

        {loading ? (
          <p className="empty-state">Loading...</p>
        ) : (
          <>
            <label className="account-toggle-row">
              <input
                type="checkbox"
                checked={enabled}
                disabled={saving}
                onChange={(event) => setConfirmNext(event.target.checked)}
              />
              <span>Allow any class to be started at any time of day, skipping the timetable schedule check</span>
            </label>
            <p className="student-table-sub">
              Normally a teacher can only start a class within a few minutes of its scheduled timetable period (admins already bypass this). While
              testing mode is on, every teacher gets that same bypass, so a session - and RFID scanning against it - can be tested without waiting
              for a real period. Currently {enabled ? 'ON' : 'OFF'}, last changed {formatDateTime(updatedAt)}. Turn it off once testing is done.
            </p>
          </>
        )}
      </section>

      {confirmNext !== null && (
        <ConfirmDialog
          eyebrow={confirmNext ? 'Enable testing mode' : 'Disable testing mode'}
          title="Applies to every teacher, school-wide"
          description={confirmNext
            ? 'Any teacher will be able to start any class at any time of day, bypassing the timetable schedule check, until you turn this back off.'
            : 'Teachers go back to only being able to start a class within a few minutes of its scheduled timetable period.'}
          confirmLabel={confirmNext ? 'Enable' : 'Disable'}
          tone={confirmNext ? 'danger' : 'default'}
          onClose={() => setConfirmNext(null)}
          onConfirm={() => applyTestingMode(confirmNext)}
          busy={saving}
        />
      )}
    </div>
  )
}
