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

function searchText(parts) {
  return parts.filter(Boolean).join(' ').toLowerCase()
}

export default function StudentClassLinksManager() {
  const [students, setStudents] = useState([])
  const [classes, setClasses] = useState([])
  const [teachers, setTeachers] = useState([])
  const [query, setQuery] = useState('')
  const [classQuery, setClassQuery] = useState('')
  const [selectedStudentId, setSelectedStudentId] = useState('')
  const [loading, setLoading] = useState(true)
  const [savingId, setSavingId] = useState(null)
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
    return students.filter((student) => searchText([
      student.full_name,
      student.student_number,
      student.email,
      student.kainga,
      student.class_label,
    ]).includes(search))
  }, [query, students])

  const selectedStudent = students.find((student) => student.id === selectedStudentId) || null
  const currentLinks = useMemo(() => selectedStudent?.classes || [], [selectedStudent])
  const linkedClassIds = useMemo(
    () => new Set(currentLinks.map((classItem) => classItem.id)),
    [currentLinks],
  )

  const filteredClasses = useMemo(() => {
    const search = classQuery.trim().toLowerCase()
    if (!search) return classes
    return classes.filter((classItem) => searchText([
      classItem.name,
      classItem.subject,
      classItem.room,
      teacherLabel(classItem),
    ]).includes(search))
  }, [classQuery, classes])

  const refreshAfterChange = async () => {
    applyLinkingData(await fetchLinkingData())
  }

  const linkClass = async (classItem) => {
    if (!selectedStudentId || !classItem?.id) {
      setNotice({ type: 'error', text: 'Select a student before linking a class.' })
      return
    }

    setSavingId(`link-${classItem.id}`)
    setNotice(null)

    try {
      const response = await api.post(`/api/students/manage/${selectedStudentId}/classes/${classItem.id}`, {
        teacher_id: classItem.teacher_id || null,
      })

      if (response?.error) throw new Error(response.error)

      await refreshAfterChange()
      setNotice({
        type: 'success',
        text: response?.alreadyLinked
          ? `${selectedStudent?.full_name || 'Student'} was already linked to ${classLabel(classItem)}.`
          : `${selectedStudent?.full_name || 'Student'} linked to ${classLabel(classItem)}.`,
      })
    } catch (error) {
      setNotice({ type: 'error', text: error.message || 'Could not link student to class.' })
    } finally {
      setSavingId(null)
    }
  }

  const unlinkClass = async (classItem) => {
    if (!selectedStudentId || !classItem?.id) return
    setSavingId(`unlink-${classItem.id}`)
    setNotice(null)

    try {
      const response = await api.delete(`/api/students/manage/${selectedStudentId}/classes/${classItem.id}`)
      if (response?.error) throw new Error(response.error)
      await refreshAfterChange()
      setNotice({ type: 'success', text: `${classLabel(classItem)} removed from ${selectedStudent?.full_name || 'student'}.` })
    } catch (error) {
      setNotice({ type: 'error', text: error.message || 'Could not remove student from class.' })
    } finally {
      setSavingId(null)
    }
  }

  const updateClassTeacher = async (classId, teacherId) => {
    setSavingId(`teacher-${classId}`)
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
      setSavingId(null)
    }
  }

  if (loading) return <div className="loading">loading</div>

  return (
    <div className="linking-manager">
      <section className="linking-card">
        <div className="student-table-head">
          <div>
            <p className="card-title">Student-Class Linking</p>
            <h3>Choose a student, then link classes directly.</h3>
          </div>
          <button type="button" className="btn-ghost" onClick={loadData} disabled={Boolean(savingId)}>
            <RefreshCw size={16} strokeWidth={2.2} />
            Refresh
          </button>
        </div>

        {notice && (
          <p className={`action-notice ${notice.type === 'error' ? 'is-error' : 'is-success'}`}>
            {notice.text}
          </p>
        )}
      </section>

      <section className="linking-workspace">
        <div className="linking-card">
          <div className="student-table-head">
            <div>
              <p className="card-title">Students</p>
              <h3>{filteredStudents.length}/{students.length} shown</h3>
            </div>
          </div>

          <label className="student-search">
            <Search size={16} strokeWidth={2.2} />
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search name, email, ID, kainga"
            />
          </label>

          <div className="linking-picker-list">
            {filteredStudents.length === 0 ? (
              <p className="empty-state">No students match this search.</p>
            ) : (
              filteredStudents.map((student) => {
                const active = student.id === selectedStudentId

                return (
                  <button
                    key={student.id}
                    type="button"
                    className={`linking-student-option ${active ? 'is-active' : ''}`}
                    onClick={() => setSelectedStudentId(student.id)}
                  >
                    <span>
                      <strong>{student.full_name}</strong>
                      <small>{student.student_number || student.email || 'No ID'}</small>
                    </span>
                    <em>{student.classes?.length || 0}</em>
                  </button>
                )
              })
            )}
          </div>
        </div>

        <div className="linking-card">
          <div className="student-table-head">
            <div>
              <p className="card-title">Classes</p>
              <h3>{selectedStudent ? selectedStudent.full_name : 'No student selected'}</h3>
            </div>
            <span className="student-email-count">{currentLinks.length}/{classes.length} linked</span>
          </div>

          <label className="student-search">
            <Search size={16} strokeWidth={2.2} />
            <input
              value={classQuery}
              onChange={(event) => setClassQuery(event.target.value)}
              placeholder="Search class, subject, room, teacher"
            />
          </label>

          {!selectedStudent ? (
            <div className="portal-empty">
              <strong>Select a student first.</strong>
              <span>Class link actions appear after a student is selected.</span>
            </div>
          ) : filteredClasses.length === 0 ? (
            <p className="empty-state">No classes match this search.</p>
          ) : (
            <div className="linking-class-list">
              {filteredClasses.map((classItem) => {
                const linked = linkedClassIds.has(classItem.id)
                const rowSaving = savingId?.endsWith(classItem.id)

                return (
                  <div key={classItem.id} className={`linking-class-row ${linked ? 'is-linked' : ''}`}>
                    <div>
                      <strong>{classLabel(classItem)}</strong>
                      <span>
                        {classItem.room ? `Room ${classItem.room}` : 'Room not set'} - {teacherLabel(classItem)}
                      </span>
                    </div>

                    <div className="linking-class-actions">
                      <select
                        className="session-select"
                        value={classItem.teacher_id || ''}
                        onChange={(event) => updateClassTeacher(classItem.id, event.target.value)}
                        disabled={Boolean(savingId)}
                        aria-label={`Teacher for ${classItem.name}`}
                      >
                        <option value="">No teacher</option>
                        {teachers.map((teacher) => (
                          <option key={teacher.id} value={teacher.id}>{teacher.full_name}</option>
                        ))}
                      </select>

                      {linked ? (
                        <button
                          type="button"
                          className="account-danger-button"
                          onClick={() => unlinkClass(classItem)}
                          disabled={Boolean(savingId)}
                        >
                          <Trash2 size={14} strokeWidth={2.2} />
                          {rowSaving ? 'Removing...' : 'Remove'}
                        </button>
                      ) : (
                        <button
                          type="button"
                          className="btn-ghost"
                          onClick={() => linkClass(classItem)}
                          disabled={Boolean(savingId)}
                        >
                          <UserPlus size={14} strokeWidth={2.2} />
                          {rowSaving ? 'Linking...' : 'Link'}
                        </button>
                      )}
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      </section>

      <section className="linking-grid">
        <div className="linking-card">
          <p className="card-title">Current links</p>
          {!selectedStudent ? (
            <p className="empty-state">Select a student.</p>
          ) : currentLinks.length === 0 ? (
            <div className="portal-empty">
              <strong>{selectedStudent.full_name} has no linked classes.</strong>
              <span>Use the class list above to add their first class.</span>
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
                  <button
                    type="button"
                    className="account-danger-button"
                    onClick={() => unlinkClass(classItem)}
                    disabled={Boolean(savingId)}
                  >
                    <Trash2 size={14} strokeWidth={2.2} />
                    Remove
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="linking-card">
          <p className="card-title">Linked students</p>
          <div className="student-table-wrap">
            <table className="attendance-table">
              <thead>
                <tr>
                  <th>Student</th>
                  <th>Kainga</th>
                  <th>Classes</th>
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
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="linking-helper">
            <Link2 size={16} strokeWidth={2.2} />
            <span>{selectedStudent ? `${selectedStudent.full_name} selected` : 'No student selected'}</span>
          </div>
        </div>
      </section>
    </div>
  )
}
