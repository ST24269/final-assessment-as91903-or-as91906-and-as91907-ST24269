import { useEffect, useState } from 'react'
import { X } from 'lucide-react'
import { api } from '../../api/client'

const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']

function formatSlotTime(value) {
  return value ? value.slice(0, 5) : ''
}

export default function StudentDetailModal({ studentId, onClose }) {
  const [student, setStudent] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  useEffect(() => {
    let cancelled = false

    setLoading(true)
    setError(null)

    api.get(`/api/students/${studentId}/detail`).then((data) => {
      if (cancelled) return
      if (data?.error) {
        setError(data.error)
      } else {
        setStudent(data)
      }
      setLoading(false)
    })

    return () => { cancelled = true }
  }, [studentId])

  return (
    <div className="student-modal-backdrop" role="presentation" onClick={onClose}>
      <section
        className="student-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="student-detail-title"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="student-modal-header">
          <div>
            <p className="card-title">Student details</p>
            <h3 id="student-detail-title">{student?.full_name || 'Loading...'}</h3>
          </div>
          <button type="button" className="student-icon-button" onClick={onClose} aria-label="Close">
            <X size={18} strokeWidth={2.2} />
          </button>
        </div>

        {loading && <p className="table-helper-text">Loading student details...</p>}
        {error && <p className="portal-error-message">{error}</p>}

        {student && !loading && (
          <div className="student-detail-body">
            <div className="student-detail-header">
              <img
                src={student.photo_url || '/default-avatar.png'}
                alt=""
                className="student-detail-photo"
              />
              <div>
                <strong>{student.full_name}</strong>
                <span>{student.student_number}</span>
                <span>{student.year_level ? `Year ${student.year_level}` : 'Year not set'}</span>
              </div>
            </div>

            <div className="student-detail-grid">
              <div>
                <span>Kainga</span>
                <strong>{student.kainga || 'Not set'}</strong>
              </div>
              <div>
                <span>Form group</span>
                <strong>{student.form_group || 'Not set'}</strong>
              </div>
              <div>
                <span>LA teacher</span>
                <strong>{student.la_teacher_name || 'Not set'}</strong>
              </div>
              <div>
                <span>Attendance rate</span>
                <strong>
                  {student.attendance_summary?.percentage === null || student.attendance_summary?.percentage === undefined
                    ? 'No data'
                    : `${student.attendance_summary.percentage}%`}
                </strong>
              </div>
            </div>

            <div className="student-detail-section">
              <p className="card-title">Enrolled classes</p>
              {student.classes?.length ? (
                <ul className="student-detail-list">
                  {student.classes.map((classItem) => (
                    <li key={classItem.id}>
                      <strong>{classItem.name}</strong>
                      <span>{classItem.subject}{classItem.room ? ` - Room ${classItem.room}` : ''}</span>
                      {classItem.profiles?.full_name && <span>Teacher: {classItem.profiles.full_name}</span>}
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="table-helper-text">Not enrolled in any classes yet.</p>
              )}
            </div>

            <div className="student-detail-section">
              <p className="card-title">Weekly timetable</p>
              {student.timetable?.length ? (
                <ul className="student-detail-list">
                  {student.timetable.map((slot) => (
                    <li key={slot.id}>
                      <strong>{DAYS[slot.day_of_week] || 'Unknown day'}</strong>
                      <span>{formatSlotTime(slot.start_time)}-{formatSlotTime(slot.end_time)}: {slot.subject_name}</span>
                      {slot.room && <span>Room {slot.room}</span>}
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="table-helper-text">No timetable slots on file.</p>
              )}
            </div>
          </div>
        )}
      </section>
    </div>
  )
}