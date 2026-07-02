import { useEffect, useMemo, useState } from 'react'
import { CalendarDays, Edit3, Plus, Trash2 } from 'lucide-react'
import { api, supabase } from '../../api/client'

const DAYS = [
  { value: 1, label: 'Monday' },
  { value: 2, label: 'Tuesday' },
  { value: 3, label: 'Wednesday' },
  { value: 4, label: 'Thursday' },
  { value: 5, label: 'Friday' },
  { value: 6, label: 'Saturday' },
  { value: 7, label: 'Sunday' },
]

const EMPTY_FORM = {
  id: '',
  class_id: '',
  day_of_week: 1,
  period_number: '',
  start_time: '',
  end_time: '',
  room: '',
  active: true,
}

function dayLabel(value) {
  return DAYS.find((day) => day.value === Number(value))?.label || 'Day'
}

export default function TimetableManager() {
  const [periods, setPeriods] = useState([])
  const [classes, setClasses] = useState([])
  const [form, setForm] = useState(EMPTY_FORM)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [notice, setNotice] = useState(null)
  const selectedClass = useMemo(
    () => classes.find((classItem) => classItem.id === form.class_id) || null,
    [classes, form.class_id],
  )

  const loadData = async () => {
    setLoading(true)
    setNotice(null)
    const [periodData, classResult] = await Promise.all([
      api.get('/api/timetable/admin'),
      supabase.from('classes').select('id, name, subject, room, teacher_id, profiles(full_name)').order('name'),
    ])

    if (periodData?.error) {
      setNotice({ type: 'error', text: periodData.error })
      setPeriods([])
    } else {
      setPeriods(Array.isArray(periodData) ? periodData : [])
    }

    if (!classResult.error) setClasses(classResult.data || [])
    setLoading(false)
  }

  useEffect(() => {
    let cancelled = false

    async function loadInitialData() {
      const [periodData, classResult] = await Promise.all([
        api.get('/api/timetable/admin'),
        supabase.from('classes').select('id, name, subject, room, teacher_id, profiles(full_name)').order('name'),
      ])

      if (cancelled) return

      if (periodData?.error) {
        setNotice({ type: 'error', text: periodData.error })
        setPeriods([])
      } else {
        setPeriods(Array.isArray(periodData) ? periodData : [])
      }

      if (!classResult.error) setClasses(classResult.data || [])
      setLoading(false)
    }

    loadInitialData()

    return () => { cancelled = true }
  }, [])

  const submitPeriod = async (event) => {
    event.preventDefault()
    setSaving(true)
    setNotice(null)

    const data = await api.post('/api/timetable/admin', {
      ...form,
      teacher_id: selectedClass?.teacher_id || null,
      subject: selectedClass?.subject || '',
      room: form.room || selectedClass?.room || '',
    })
    setSaving(false)

    if (data?.error) {
      setNotice({ type: 'error', text: data.error })
      return
    }

    setForm(EMPTY_FORM)
    setNotice({ type: 'success', text: form.id ? 'Timetable period updated.' : 'Timetable period added.' })
    loadData()
  }

  const editPeriod = (period) => {
    setForm({
      id: period.id,
      class_id: period.class_id,
      day_of_week: period.day_of_week,
      period_number: period.period_number ? String(period.period_number) : '',
      start_time: period.start_time?.slice(0, 5) || '',
      end_time: period.end_time?.slice(0, 5) || '',
      room: period.room || '',
      active: period.active,
    })
  }

  const deletePeriod = async (period) => {
    const data = await api.delete(`/api/timetable/admin/${period.id}`)
    if (data?.error) {
      setNotice({ type: 'error', text: data.error })
      return
    }
    setPeriods((current) => current.filter((item) => item.id !== period.id))
    setNotice({ type: 'success', text: 'Timetable period deleted.' })
  }

  if (loading) return <div className="loading">loading</div>

  return (
    <div className="timetable-manager">
      <section className="card">
        <p className="card-title">Timetable periods</p>
        <form className="timetable-form" onSubmit={submitPeriod}>
          <div className="login-field">
            <label htmlFor="timetable-class">Class / subject</label>
            <select
              id="timetable-class"
              className="session-select"
              value={form.class_id}
              onChange={(event) => setForm((current) => ({ ...current, class_id: event.target.value }))}
            >
              <option value="">Select class</option>
              {classes.map((classItem) => (
                <option key={classItem.id} value={classItem.id}>
                  {classItem.name} - {classItem.subject}{classItem.room ? ` (${classItem.room})` : ''}{classItem.profiles?.full_name ? ` - ${classItem.profiles.full_name}` : ''}
                </option>
              ))}
            </select>
          </div>
          <div className="login-field">
            <label htmlFor="timetable-day">Day</label>
            <select
              id="timetable-day"
              className="session-select"
              value={form.day_of_week}
              onChange={(event) => setForm((current) => ({ ...current, day_of_week: Number(event.target.value) }))}
            >
              {DAYS.map((day) => <option key={day.value} value={day.value}>{day.label}</option>)}
            </select>
          </div>
          <div className="login-field">
            <label htmlFor="timetable-period">Period</label>
            <input
              id="timetable-period"
              type="number"
              min="1"
              max="20"
              value={form.period_number}
              onChange={(event) => setForm((current) => ({ ...current, period_number: event.target.value }))}
              placeholder="Period #"
            />
          </div>
          <div className="login-field">
            <label htmlFor="timetable-start">Start</label>
            <input
              id="timetable-start"
              type="time"
              value={form.start_time}
              onChange={(event) => setForm((current) => ({ ...current, start_time: event.target.value }))}
            />
          </div>
          <div className="login-field">
            <label htmlFor="timetable-end">End</label>
            <input
              id="timetable-end"
              type="time"
              value={form.end_time}
              onChange={(event) => setForm((current) => ({ ...current, end_time: event.target.value }))}
            />
          </div>
          <div className="login-field">
            <label htmlFor="timetable-room">Room</label>
            <input
              id="timetable-room"
              value={form.room}
              onChange={(event) => setForm((current) => ({ ...current, room: event.target.value }))}
              placeholder={selectedClass?.room || 'Room override'}
            />
          </div>
          <button type="submit" disabled={saving}>
            <Plus size={16} strokeWidth={2.2} />
            {saving ? 'Saving...' : form.id ? 'Update period' : 'Add period'}
          </button>
        </form>
        {form.id && (
          <button type="button" className="btn-ghost" onClick={() => setForm(EMPTY_FORM)}>
            Cancel edit
          </button>
        )}
        {notice && (
          <p className={`action-notice ${notice.type === 'error' ? 'is-error' : 'is-success'}`}>
            {notice.text}
          </p>
        )}
      </section>

      <section className="card">
        <p className="card-title">Scheduled periods ({periods.length})</p>
        {periods.length === 0 ? (
          <p className="empty-state">No timetable periods yet.</p>
        ) : (
          <div className="analytics-table-wrap">
            <table className="attendance-table">
              <thead>
                <tr>
                  <th>Class</th>
                  <th>Day</th>
                  <th>Period</th>
                  <th>Time</th>
                  <th>Room</th>
                  <th>Teacher</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {periods.map((period) => (
                  <tr key={period.id}>
                    <td>
                      <strong>{period.class?.name || 'Class'}</strong>
                      <span className="student-table-sub">{period.class?.subject}</span>
                    </td>
                    <td className="student-id">
                      <CalendarDays size={14} strokeWidth={2.2} />
                      {dayLabel(period.day_of_week)}
                    </td>
                    <td className="student-id">{period.period_number || '-'}</td>
                    <td className="student-id">{period.start_time?.slice(0, 5)} - {period.end_time?.slice(0, 5)}</td>
                    <td className="student-id">{period.room || period.class?.room || '-'}</td>
                    <td className="student-id">{period.class?.profiles?.full_name || '-'}</td>
                    <td>
                      <div className="student-row-actions">
                        <button type="button" className="btn-ghost" onClick={() => editPeriod(period)}>
                          <Edit3 size={14} strokeWidth={2.2} />
                          Edit
                        </button>
                        <button type="button" className="account-danger-button" onClick={() => deletePeriod(period)}>
                          <Trash2 size={14} strokeWidth={2.2} />
                          Delete
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  )
}
