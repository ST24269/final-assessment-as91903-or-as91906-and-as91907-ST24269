import { useEffect, useMemo, useState } from 'react'
import { supabase } from '../api/client'
import { api } from '../api/client'

export default function SessionPanel({ activeSession, setActiveSession, session }) {
  const [classes, setClasses] = useState([])
  const [selectedClass, setSelectedClass] = useState('')
  const [notes, setNotes] = useState('')
  const [loading, setLoading] = useState(false)
  const [loadingClasses, setLoadingClasses] = useState(true)
  const [error, setError] = useState(null)

  useEffect(() => {
    let cancelled = false

    async function loadClasses() {
      const { data, error: classError } = await supabase
        .from('classes')
        .select('id, name, subject, room')
        .order('name')

      if (cancelled) return

      if (classError) setError(classError.message)
      setClasses(data || [])
      setLoadingClasses(false)
    }

    loadClasses()

    return () => { cancelled = true }
  }, [])

  const selectedClassDetails = useMemo(
    () => classes.find((classItem) => classItem.id === selectedClass),
    [classes, selectedClass],
  )

  const startSession = async () => {
    if (!selectedClass) return setError('Select a class first.')

    setLoading(true)
    setError(null)

    const data = await api.post('/api/sessions/start', {
      class_id: selectedClass,
      teacher_id: session.user.id,
      notes: notes.trim() || undefined,
    })

    if (data.error) {
      setError(data.error)
    } else {
      setActiveSession({
        ...data,
        classes: data.classes || selectedClassDetails,
      })
      setNotes('')
    }

    setLoading(false)
  }

  const endSession = async () => {
    setLoading(true)
    setError(null)

    const data = await api.patch(`/api/sessions/${activeSession.id}/end`, {})

    if (data.error) {
      setError(data.error)
    } else {
      setActiveSession(null)
    }

    setLoading(false)
  }

  return (
    <section className="portal-section">
      <div className="portal-section-header">
        <p>Session control</p>
      </div>
      {!activeSession ? (
        <div className="portal-form-grid">
          <div className="portal-session-grid">
            <select
              value={selectedClass}
              onChange={(event) => setSelectedClass(event.target.value)}
              disabled={loadingClasses}
              className="min-h-11 rounded-[10px] border border-white/[0.06] bg-[#1c2330] px-4 py-2.5 text-sm font-mono text-white outline-none transition-all duration-200 focus:border-[#1A9B8C50] disabled:opacity-50"
            >
              <option value="">{loadingClasses ? 'Loading classes...' : 'Select a class...'}</option>
              {classes.map((classItem) => (
                <option key={classItem.id} value={classItem.id}>
                  {classItem.name} - {classItem.subject}{classItem.room ? ` (${classItem.room})` : ''}
                </option>
              ))}
            </select>

            <input
              value={notes}
              onChange={(event) => setNotes(event.target.value)}
              placeholder="Session note (optional)"
              className="min-h-11 rounded-[10px] border border-white/[0.06] bg-[#1c2330] px-4 py-2.5 text-sm text-white outline-none transition-all duration-200 placeholder:text-[#4A5568] focus:border-[#1A9B8C50]"
            />

            <button
              onClick={startSession}
              disabled={loading || loadingClasses}
              className="min-h-11 rounded-[10px] bg-[#1A9B8C] px-5 py-2.5 text-sm font-bold text-[#050505] transition-all duration-300 hover:bg-[#22B5A4] hover:shadow-[0_4px_16px_rgba(26,155,140,0.3)] active:scale-[0.98] disabled:opacity-40"
            >
              {loading ? 'Starting...' : 'Start session'}
            </button>
          </div>

          {selectedClassDetails && (
            <p className="text-[0.78rem] font-mono text-[#8B9BB0]">
              Room: {selectedClassDetails.room || 'not set'} - Subject: {selectedClassDetails.subject}
            </p>
          )}
        </div>
      ) : (
        <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <div>
            <div className="flex items-center gap-2 text-sm font-semibold">
              <span className="h-2 w-2 rounded-full bg-emerald-400 shadow-[0_0_8px_rgba(52,211,153,0.8)]" />
              Session live
            </div>
            <p className="mt-1 text-[0.78rem] font-mono text-[#8B9BB0]">
              {activeSession.classes?.name || 'Class'} - started {new Date(activeSession.started_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
              {activeSession.classes?.room ? ` - ${activeSession.classes.room}` : ''}
            </p>
          </div>

          <button
            onClick={endSession}
            disabled={loading}
            className="rounded-lg border border-red-500/30 px-4 py-2 text-sm font-mono text-red-400 transition-all duration-200 hover:border-red-400 hover:bg-red-500/10 disabled:opacity-40"
          >
            {loading ? 'Ending...' : 'End session'}
          </button>
        </div>
      )}

      {error && (
        <p className="mt-3 rounded-lg border border-red-500/20 bg-red-500/10 px-3 py-2 text-[0.78rem] font-mono text-red-400">
          {error}
        </p>
      )}
    </section>
  )
}
