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

  if (!readerId) {
    return {
      error: 'No classroom reader selected.'
    }
  }

  const data = await api.post('/api/sessions/start', {
    class_id: classId,
    reader_id: readerId,
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