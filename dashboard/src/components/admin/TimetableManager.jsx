import { useEffect, useMemo, useState } from 'react'
import { CalendarDays, Clock3, Edit3, Plus, Search, Trash2, Wand2 } from 'lucide-react'
import { api, supabase } from '../../api/client'
import Loader from '../Loader'
import ConfirmDialog from '../ConfirmDialog'

const DAYS = [
  { value: 1, label: 'Monday' },
  { value: 2, label: 'Tuesday' },
  { value: 3, label: 'Wednesday' },
  { value: 4, label: 'Thursday' },
  { value: 5, label: 'Friday' },
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

const PERIOD_PRESETS = [
  { period: 1, start: '08:45', end: '09:45' },
  { period: 2, start: '09:50', end: '10:50' },
  { period: 3, start: '11:10', end: '12:10' },
  { period: 4, start: '12:55', end: '13:55' },
  { period: 5, start: '14:00', end: '15:00' },
]

function dayLabel(value) {
  return DAYS.find((day) => day.value === Number(value))?.label || 'Day'
}

function classLabel(classItem) {
  if (!classItem) return 'No class selected'
  return `${classItem.name || 'Class'} - ${classItem.subject || 'Subject'}`
}

function sortPeriods(a, b) {
  return String(a.start_time || '').localeCompare(String(b.start_time || ''))
}

export default function TimetableManager() {
  const [periods, setPeriods] = useState([])
  const [classes, setClasses] = useState([])
  const [form, setForm] = useState(EMPTY_FORM)
  const [selectedDay, setSelectedDay] = useState(1)
  const [classSearch, setClassSearch] = useState('')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [notice, setNotice] = useState(null)
  const [deleteTarget, setDeleteTarget] = useState(null)
  const selectedClass = useMemo(
    () => classes.find((classItem) => classItem.id === form.class_id) || null,
    [classes, form.class_id],
  )
  const dayPeriods = useMemo(
    () => periods.filter((period) => Number(period.day_of_week) === Number(selectedDay)).sort(sortPeriods),
    [periods, selectedDay],
  )
  const periodCounts = useMemo(() => {
    const counts = new Map(DAYS.map((day) => [day.value, 0]))
    for (const period of periods) {
      counts.set(Number(period.day_of_week), (counts.get(Number(period.day_of_week)) || 0) + 1)
    }
    return counts
  }, [periods])
  const filteredClasses = useMemo(() => {
    const query = classSearch.trim().toLowerCase()
    if (!query) return classes

    return classes.filter((classItem) => [
      classItem.name,
      classItem.subject,
      classItem.room,
      classItem.profiles?.full_name,
    ].filter(Boolean).join(' ').toLowerCase().includes(query))
  }, [classes, classSearch])

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

      if (classResult.error) {
        setNotice({ type: 'error', text: classResult.error.message })
        setClasses([])
      } else {
        setClasses(classResult.data || [])
      }
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

    setPeriods((current) => {
      if (form.id) return current.map((period) => (period.id === data.id ? data : period))
      return [...current, data]
    })
    setSelectedDay(Number(data.day_of_week || form.day_of_week))
    setForm({ ...EMPTY_FORM, day_of_week: Number(data.day_of_week || form.day_of_week) })
    setNotice({ type: 'success', text: form.id ? 'Timetable period updated.' : 'Timetable period added.' })
  }

  const editPeriod = (period) => {
    setSelectedDay(Number(period.day_of_week))
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
    setDeleteTarget(null)

    if (data?.error) {
      setNotice({ type: 'error', text: data.error })
      return
    }
    setPeriods((current) => current.filter((item) => item.id !== period.id))
    setNotice({ type: 'success', text: 'Timetable period deleted.' })
  }

  const applyPreset = (preset) => {
    setForm((current) => ({
      ...current,
      day_of_week: selectedDay,
      period_number: String(preset.period),
      start_time: preset.start,
      end_time: preset.end,
    }))
  }

  const selectDay = (day) => {
    setSelectedDay(day.value)
    setForm((current) => ({ ...current, day_of_week: day.value }))
  }

  const selectClass = (classItem) => {
    setForm((current) => ({
      ...current,
      class_id: classItem.id,
      room: current.room || classItem.room || '',
    }))
  }

  if (loading) {
    return <Loader title="Loading timetable" subtitle="Fetching classes and scheduled periods" size="sm" />
  }

  return (
    <div className="timetable-manager">
      <section className="timetable-builder card">
        <div className="timetable-builder-header">
          <div>
            <p className="card-title">Timetable builder</p>
            <h3>{form.id ? 'Edit scheduled period' : 'Add a scheduled period'}</h3>
            <span>{classLabel(selectedClass)} - {dayLabel(form.day_of_week)}</span>
          </div>

          {form.id && (
            <button type="button" className="btn-ghost" onClick={() => setForm({ ...EMPTY_FORM, day_of_week: selectedDay })}>
              Cancel edit
            </button>
          )}
        </div>

        <div className="timetable-day-picker" role="tablist" aria-label="Timetable days">
          {DAYS.map((day) => {
            const count = periodCounts.get(day.value) || 0
            return (
              <button
                key={day.value}
                type="button"
                className={selectedDay === day.value ? 'is-active' : ''}
                onClick={() => selectDay(day)}
                title={`${count} period${count === 1 ? '' : 's'} scheduled on ${day.label}`}
              >
                <span className="timetable-day-count" aria-hidden="true">{count}</span>
                <span>{day.label.slice(0, 3)}</span>
              </button>
            )
          })}
        </div>

        <div className="timetable-builder-grid">
          <div className="timetable-class-picker">
            <label htmlFor="timetable-class-search">Class</label>
            <div className="timetable-search">
              <Search size={16} strokeWidth={2.2} />
              <input
                id="timetable-class-search"
                value={classSearch}
                onChange={(event) => setClassSearch(event.target.value)}
                placeholder="Search class, subject, room, or teacher"
              />
            </div>

            <div className="timetable-class-list">
              {filteredClasses.length === 0 ? (
                <p className="empty-state">No matching classes.</p>
              ) : filteredClasses.map((classItem) => (
                <button
                  key={classItem.id}
                  type="button"
                  className={form.class_id === classItem.id ? 'is-active' : ''}
                  onClick={() => selectClass(classItem)}
                >
                  <strong>{classItem.name}</strong>
                  <span>{classItem.subject}{classItem.room ? ` - ${classItem.room}` : ''}</span>
                  <em>{classItem.profiles?.full_name || 'No teacher assigned'}</em>
                </button>
              ))}
            </div>
          </div>

          <form className="timetable-editor" onSubmit={submitPeriod}>
            <div className="timetable-presets" aria-label="Period presets">
              {PERIOD_PRESETS.map((preset) => (
                <button key={preset.period} type="button" onClick={() => applyPreset(preset)}>
                  <Wand2 size={14} strokeWidth={2.2} />
                  <span>P{preset.period}</span>
                  <em>{preset.start} - {preset.end}</em>
                </button>
              ))}
            </div>

            <div className="portal-form-grid">
              <div className="login-field">
                <label htmlFor="timetable-period">Period</label>
                <input
                  id="timetable-period"
                  type="number"
                  min="1"
                  max="20"
                  value={form.period_number}
                  onChange={(event) => setForm((current) => ({ ...current, period_number: event.target.value }))}
                  placeholder="1"
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
                  placeholder={selectedClass?.room || 'Room'}
                />
              </div>
            </div>

            <button type="submit" disabled={saving}>
              <Plus size={16} strokeWidth={2.2} />
              {saving ? 'Saving...' : form.id ? 'Update period' : 'Add to timetable'}
            </button>
          </form>
        </div>

        {notice && (
          <p className={`action-notice ${notice.type === 'error' ? 'is-error' : 'is-success'}`}>
            {notice.text}
          </p>
        )}
      </section>

      <section className="timetable-day-board card">
        <div className="timetable-builder-header">
          <div>
            <p className="card-title">{dayLabel(selectedDay)}</p>
            <h3>Scheduled periods</h3>
            <span>{dayPeriods.length} period{dayPeriods.length === 1 ? '' : 's'} on this day</span>
          </div>
        </div>

        {dayPeriods.length === 0 ? (
          <div className="portal-empty">
            <strong>No periods scheduled for {dayLabel(selectedDay)}.</strong>
            <span>Select a class and use a preset to add the first one.</span>
          </div>
        ) : (
          <div className="timetable-period-card-list">
            {dayPeriods.map((period) => (
              <article key={period.id} className="timetable-period-card">
                <div className="timetable-period-time">
                  <Clock3 size={16} strokeWidth={2.2} />
                  <strong>{period.start_time?.slice(0, 5)} - {period.end_time?.slice(0, 5)}</strong>
                  <span>Period {period.period_number || '-'}</span>
                </div>

                <div>
                  <h4>{period.class?.name || 'Class'}</h4>
                  <p>{period.class?.subject || period.subject || 'Subject'} - {period.room || period.class?.room || 'No room'}</p>
                  <span>
                    <CalendarDays size={14} strokeWidth={2.2} />
                    {period.class?.profiles?.full_name || 'No teacher assigned'}
                  </span>
                </div>

                <div className="student-row-actions">
                  <button type="button" className="btn-ghost" onClick={() => editPeriod(period)}>
                    <Edit3 size={14} strokeWidth={2.2} />
                    Edit
                  </button>
                  <button type="button" className="account-danger-button" onClick={() => setDeleteTarget(period)}>
                    <Trash2 size={14} strokeWidth={2.2} />
                    Delete
                  </button>
                </div>
              </article>
            ))}
          </div>
        )}
      </section>

      {deleteTarget && (
        <ConfirmDialog
          eyebrow="Delete timetable period"
          title={classLabel(deleteTarget.class)}
          description={`Remove the ${dayLabel(deleteTarget.day_of_week)} period for ${classLabel(deleteTarget.class)}? Teachers lose their scheduled window to start this class without an admin override.`}
          confirmLabel="Delete period"
          tone="danger"
          onClose={() => setDeleteTarget(null)}
          onConfirm={() => deletePeriod(deleteTarget)}
        />
      )}
    </div>
  )
}