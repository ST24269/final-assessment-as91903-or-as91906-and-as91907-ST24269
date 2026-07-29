import { api } from '../api/client'

export async function startSessionForClass(
  classId,
  {
    notes = null,
    coveringForTeacherId = null,
    readerId = null,
  } = {}
) {
  if (!classId) {
    return {
      error: 'No class selected.'
    }
  }

  // readerId is optional here on purpose: the backend (/api/sessions/start)
  // auto-matches a reader to this class by room when reader_id isn't
  // supplied, the same way attendance.js matches an incoming scan to a
  // session by room. Nothing in the current UI collects a reader_id, so
  // requiring it here blocked every single session start before the
  // request ever left the browser. If you later add a manual reader
  // picker to the UI, pass its value through as readerId and it'll be
  // used instead of the automatic match.
  const data = await api.post('/api/sessions/start', {
    class_id: classId,
    ...(readerId ? { reader_id: readerId } : {}),
    notes,
    covering_for_teacher_id: coveringForTeacherId,
  })

  if (!data) {
    return {
      error: 'Could not start the session.'
    }
  }

  if (data.error) {
    if (data.active_session) {
      return {
        session: data.active_session,
        alreadyActive: true
      }
    }

    return {
      error: data.error
    }
  }

  return {
    session: data
  }
}