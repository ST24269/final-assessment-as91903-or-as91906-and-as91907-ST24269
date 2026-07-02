import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link2, RefreshCw, Search, Trash2, UserPlus } from 'lucide-react'
import { api } from '../../api/client'

function classLabel(classItem) {
  if (!classItem) return 'Class'
  return `${classItem.name || 'Class'} - ${classItem.subject || 'Subject'}`
}

function teacherLabel(classItem) {
  return classItem?.profiles?.full_name || 'Teacher not assigned'
}

export default function StudentClassLinksManager() {
  const [students, setStudents] = useState([])
  const [classes, setClasses] = useState([])
  const [teachers, setTeachers] = useState([])
  const [query, setQuery] = useState('')
  const [selectedStudentId, setSelectedStudentId] = useState('')
  const [selectedClassId, setSelectedClassId] = useState('')
  const [selectedTeacherId, setSelectedTeacherId] = useState('')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [notice, setNotice] = useState(null)

  const applyLinkingData = useCallback((payload) => {
    const nextStudents = Array.isArray(payload?.students) ? payload.students : []
    const nextClasses = Array.isArray(payload?.classes) ? payload.classes : []
    const nextTeachers = Array.isArray(payload?.teachers) ? payload.teachers : []

    setStudents(nextStudents)
    setClasses(nextClasses)
    setTeachers(nextTeachers)
    setSelectedStudentId((current) => (
      current && nextStudents.some((student) => student.id === current)
        ? current
        : nextStudents[0]?.id || ''
    ))
    setSelectedClassId((current) => (
      current && nextClasses.some((classItem) => classItem.id === current)
        ? current
        : nextClasses[0]?.id || ''
    ))
    setSelectedTeacherId((current) => (
      current && nextTeachers.some((teacher) => teacher.id === current)
        ? current
        : ''
    ))
  }, [])

  const fetchLinkingData = useCallback(async () => {
    const payload = await api.get('/api/students/manage/linking-data')
    if (payload?.error) throw new Error(payload.error)
    return payload
  }, [])

  const loadData = useCallback(async () => {
    setLoading(true)
    setNotice(null)

    try {
      applyLinkingData(await fetchLinkingData())
    } catch (error) {
      setStudents([])
      setClasses([])
      setTeachers([])
      setNotice({ type: 'error', text: error.message || 'Could not load student-class links.' })
    } finally {
      setLoading(false)
    }
  }, [applyLinkingData, fetchLinkingData])

  useEffect(() => {
    let cancelled = false

    async function loadInitialData() {
      setLoading(true)

      try {
        const payload = await fetchLinkingData()
        if (cancelled) return
        applyLinkingData(payload)
      } catch (error) {
        if (cancelled) return
        setStudents([])
        setClasses([])
        setTeachers([])
        setNotice({ type: 'error', text: error.message || 'Could not load student-class links.' })
      } finally {
        if (!cancelled) setLoading(false)
      }
    }

    loadInitialData()

    return () => { cancelled = true }
  }, [applyLinkingData, fetchLinkingData])

  const filteredStudents = useMemo(() => {
    const search = query.trim().toLowerCase()
    if (!search) return students
    return students.filter((student) => [
      student.full_name,
      student.student_number,
      student.email,
      student.kainga,
      student.class_label,
    ].filter(Boolean).join(' ').toLowerCase().includes(search))
  }, [query, students])

  const selectedStudent = students.find((student) => student.id === selectedStudentId) || null
  const selectedClass = classes.find((classItem) => classItem.id === selectedClassId) || null
  const currentLinks = selectedStudent?.classes || []

  const refreshAfterChange = async () => {
    applyLinkingData(await fetchLinkingData())
  }

  const linkStudent = async (event) => {
    event.preventDefault()
    if (!selectedStudentId || !selectedClassId) {
      setNotice({ type: 'error', text: 'Select a student and class before linking.' })
      return
    }

    setSaving(true)
    setNotice(null)

    try {
      const response = await api.post(`/api/students/manage/${selectedStudentId}/classes/${selectedClassId}`, {
        teacher_id: selectedTeacherId || null,
      })

      if (response?.error) throw new Error(response.error)

      await refreshAfterChange()
      setNotice({
        type: 'success',
        text: response?.alreadyLinked
          ? `${selectedStudent?.full_name || 'Student'} was already linked to ${classLabel(selectedClass)}.`
          : `${selectedStudent?.full_name || 'Student'} linked to ${classLabel(selectedClass)}.`,
      })
    } catch (error) {
      setNotice({ type: 'error', text: error.message || 'Could not link student to class.' })
    } finally {
      setSaving(false)
    }
  }

  const unlinkStudent = async (classItem) => {
    if (!selectedStudentId || !classItem?.id) return
    setSaving(true)
    setNotice(null)

    try {
      const response = await api.delete(`/api/students/manage/${selectedStudentId}/classes/${classItem.id}`)
      if (response?.error) throw new Error(response.error)
      await refreshAfterChange()
      setNotice({ type: 'success', text: `${classLabel(classItem)} removed from ${selectedStudent?.full_name || 'student'}.` })
    } catch (error) {
      setNotice({ type: 'error', text: error.message || 'Could not remove student from class.' })
    } finally {
      setSaving(false)
    }
  }

  const updateClassTeacher = async (classId, teacherId) => {
    setSaving(true)
    setNotice(null)

    try {
      const response = await api.patch(`/api/students/manage/classes/${classId}/teacher`, {
        teacher_id: teacherId || null,
      })

      if (response?.error) throw new Error(response.error)
      await refreshAfterChange()
      setNotice({ type: 'success', text: 'Class teacher updated.' })
    } catch (error) {
      setNotice({ type: 'error', text: error.message || 'Could not update class teacher.' })
    } finally {
      setSaving(false)
    }
  }

  if (loading) return <div className="loading">loading</div>

  return (
    <div className="linking-manager">
      <section className="linking-card">
        <div className="student-table-head">
          <div>
            <p className="card-title">Student-Class Linking</p>
            <h3>Link students to classes and class teachers.</h3>
          </div>
          <button type="button" className="btn-ghost" onClick={loadData}>
            <RefreshCw size={16} strokeWidth={2.2} />
            Refresh
          </button>
        </div>

        {notice && (
          <p className={`action-notice ${notice.type === 'error' ? 'is-error' : 'is-success'}`}>
            {notice.text}
          </p>
        )}

        <form className="linking-form" onSubmit={linkStudent}>
          <label className="student-search">
            <Search size={16} strokeWidth={2.2} />
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search student name, email, ID, kainga"
            />
          </label>

          <div className="login-field">
            <label htmlFor="link-student">Student</label>
            <select
              id="link-student"
              className="session-select"
              value={selectedStudentId}
              onChange={(event) => setSelectedStudentId(event.target.value)}
            >
              {filteredStudents.map((student) => (
                <option key={student.id} value={student.id}>
                  {student.full_name} - {student.student_number || 'No ID'}
                </option>
              ))}
            </select>
          </div>

          <div className="login-field">
            <label htmlFor="link-class">Class / subject</label>
            <select
              id="link-class"
              className="session-select"
              value={selectedClassId}
              onChange={(event) => setSelectedClassId(event.target.value)}
            >
              {classes.map((classItem) => (
                <option key={classItem.id} value={classItem.id}>
                  {classLabel(classItem)}{classItem.room ? ` (${classItem.room})` : ''}
                </option>
              ))}
            </select>
          </div>

          <div className="login-field">
            <label htmlFor="link-teacher">Teacher</label>
            <select
              id="link-teacher"
              className="session-select"
              value={selectedTeacherId}
              onChange={(event) => setSelectedTeacherId(event.target.value)}
            >
              <option value="">Keep current teacher</option>
              {teachers.map((teacher) => (
                <option key={teacher.id} value={teacher.id}>{teacher.full_name}</option>
              ))}
            </select>
          </div>

          <button type="submit" disabled={saving || !filteredStudents.length || !classes.length}>
            <UserPlus size={16} strokeWidth={2.2} />
            {saving ? 'Linking...' : 'Link Student'}
          </button>
        </form>
      </section>

      <section className="linking-grid">
        <div className="linking-card">
          <p className="card-title">Current links</p>
          {!selectedStudent ? (
            <p className="empty-state">Select a student.</p>
          ) : currentLinks.length === 0 ? (
            <div className="portal-empty">
              <strong>{selectedStudent.full_name} has no linked classes.</strong>
              <span>Use the form above to add their first class.</span>
            </div>
          ) : (
            <div className="linking-list">
              {currentLinks.map((classItem) => (
                <div key={classItem.id} className="linking-row">
                  <div>
                    <strong>{classLabel(classItem)}</strong>
                    <span>
                      {classItem.room ? `Room ${classItem.room}` : 'Room not set'} - {teacherLabel(classItem)}
                    </span>
                  </div>
                  <button type="button" className="account-danger-button" onClick={() => unlinkStudent(classItem)} disabled={saving}>
                    <Trash2 size={14} strokeWidth={2.2} />
                    Remove
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="linking-card">
          <p className="card-title">Class teacher assignments</p>
          {classes.length === 0 ? (
            <p className="empty-state">No classes yet.</p>
          ) : (
            <div className="linking-list">
              {classes.map((classItem) => (
                <div key={classItem.id} className="linking-row">
                  <div>
                    <strong>{classLabel(classItem)}</strong>
                    <span>{classItem.room ? `Room ${classItem.room}` : 'Room not set'}</span>
                  </div>
                  <select
                    className="session-select"
                    value={classItem.teacher_id || ''}
                    onChange={(event) => updateClassTeacher(classItem.id, event.target.value)}
                    disabled={saving}
                    aria-label={`Teacher for ${classItem.name}`}
                  >
                    <option value="">No teacher</option>
                    {teachers.map((teacher) => (
                      <option key={teacher.id} value={teacher.id}>{teacher.full_name}</option>
                    ))}
                  </select>
                </div>
              ))}
            </div>
          )}
        </div>
      </section>

      <section className="linking-card">
        <p className="card-title">Linked students</p>
        <div className="student-table-wrap">
          <table className="attendance-table">
            <thead>
              <tr>
                <th>Student</th>
                <th>Kainga</th>
                <th>Classes</th>
                <th>Teachers</th>
              </tr>
            </thead>
            <tbody>
              {filteredStudents.map((student) => (
                <tr
                  key={student.id}
                  className="student-clickable-row"
                  tabIndex={0}
                  onClick={() => setSelectedStudentId(student.id)}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter' || event.key === ' ') {
                      event.preventDefault()
                      setSelectedStudentId(student.id)
                    }
                  }}
                >
                  <td>
                    <strong>{student.full_name}</strong>
                    <span className="student-table-sub">{student.student_number || student.email}</span>
                  </td>
                  <td className="student-id">{student.kainga || '-'}</td>
                  <td className="student-id">{student.classes?.map((classItem) => classLabel(classItem)).join(', ') || 'None'}</td>
                  <td className="student-id">{student.classes?.map((classItem) => teacherLabel(classItem)).join(', ') || '-'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="linking-helper">
          <Link2 size={16} strokeWidth={2.2} />
          <span>{selectedStudent ? `${selectedStudent.full_name} selected` : 'No student selected'}</span>
        </div>
      </section>
    </div>
  )
}
