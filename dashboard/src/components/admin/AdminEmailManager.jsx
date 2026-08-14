import { useEffect, useMemo, useRef, useState } from 'react'
import { Mail, RefreshCw, Search } from 'lucide-react'
import { api } from '../../api/client'

export default function AdminEmailManager() {
  const [students, setStudents] = useState([])
  const [query, setQuery] = useState('')
  const [selectedIds, setSelectedIds] = useState([])
  const [form, setForm] = useState({ recipientMode: 'visible', subject: '', message: '' })
  const [notice, setNotice] = useState(null)
  const [loading, setLoading] = useState(true)
  const [sending, setSending] = useState(false)
  const subjectRef = useRef(null)

  const loadData = async () => {
    setLoading(true)
    setNotice(null)
    const data = await api.get('/api/students/manage')
    if (data?.error) {
      setNotice({ type: 'error', text: data.error })
      setStudents([])
    } else {
      setStudents(Array.isArray(data) ? data : [])
    }
    setLoading(false)
  }

  useEffect(() => {
    let cancelled = false

    async function loadInitialData() {
      const data = await api.get('/api/students/manage')
      if (cancelled) return
      if (data?.error) {
        setNotice({ type: 'error', text: data.error })
        setStudents([])
      } else {
        setStudents(Array.isArray(data) ? data : [])
      }
      setLoading(false)
    }

    loadInitialData()

    return () => { cancelled = true }
  }, [])

  const visibleStudents = useMemo(() => {
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

  const selectedStudents = useMemo(
    () => students.filter((student) => selectedIds.includes(student.id)),
    [students, selectedIds],
  )

  const recipientPool = useMemo(() => {
    if (form.recipientMode === 'selected') return selectedStudents
    if (form.recipientMode === 'all') return students
    return visibleStudents
  }, [form.recipientMode, selectedStudents, students, visibleStudents])

  const recipients = useMemo(
    () => recipientPool.filter((student) => student.email),
    [recipientPool],
  )

  const recipientPreview = useMemo(() => {
    if (!recipients.length) return 'No recipients with linked email addresses.'
    const names = recipients.slice(0, 4).map((student) => student.full_name).join(', ')
    const extra = recipients.length > 4 ? ` and ${recipients.length - 4} more` : ''
    return `${recipients.length} recipient(s): ${names}${extra}`
  }, [recipients])

  const toggleSelected = (studentId, checked) => {
    setSelectedIds((current) => checked
      ? [...new Set([...current, studentId])]
      : current.filter((id) => id !== studentId))
  }

  const openMailtoFallback = (reason, subject, message) => {
    const emails = [...new Set(recipients.map((student) => student.email).filter(Boolean))]
    const params = new URLSearchParams({ subject, body: message })
    const mailtoUrl = `mailto:${emails.map(encodeURIComponent).join(',')}?${params.toString()}`

    if (mailtoUrl.length > 1900) {
      setNotice({
        type: 'error',
        text: `${reason}. The message is too long for a mail app fallback; shorten it or configure backend email.`,
      })
      return
    }

    window.location.href = mailtoUrl
    setNotice({ type: 'success', text: `${reason}. Opened your email app with ${emails.length} recipient(s).` })
  }

  const sendEmail = async (event) => {
    event.preventDefault()
    const subject = form.subject.trim()
    const message = form.message.trim()

    setNotice(null)

    if (!subject) {
      setNotice({ type: 'error', text: 'Add an email subject before sending.' })
      subjectRef.current?.focus()
      return
    }

    if (!message) {
      setNotice({ type: 'error', text: 'Add an email message before sending.' })
      return
    }

    if (!recipients.length) {
      setNotice({ type: 'error', text: 'Choose at least one recipient with a linked email address.' })
      return
    }

    setSending(true)
    const data = await api.post('/api/students/manage/email', {
      recipient_ids: recipients.map((student) => student.id),
      subject,
      message,
    })
    setSending(false)

    if (data?.error) {
      setNotice({ type: 'error', text: data.error })
      return
    }

    if (data.emailSent) {
      setNotice({ type: 'success', text: `Email sent to ${data.recipientCount} recipient(s).` })
      return
    }

    openMailtoFallback(data.emailError || 'Email provider is not configured', subject, message)
  }

  if (loading) return <div className="loading">loading</div>

  return (
    <div className="student-management">
      <section className="student-email-card">
        <div className="student-table-head">
          <div>
            <p className="card-title">Email / Communication</p>
            <h3>Send a composed message to student recipients.</h3>
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

        <form className="student-email-grid" onSubmit={sendEmail}>
          <div className="student-email-form">
            <label>
              Recipient group
              <select
                className="session-select"
                value={form.recipientMode}
                onChange={(event) => setForm((current) => ({ ...current, recipientMode: event.target.value }))}
              >
                <option value="visible">Current filtered view ({visibleStudents.filter((student) => student.email).length})</option>
                <option value="selected">Selected students ({selectedStudents.filter((student) => student.email).length})</option>
                <option value="all">All students with email ({students.filter((student) => student.email).length})</option>
              </select>
            </label>

            <label>
              Email subject
              <input
                ref={subjectRef}
                value={form.subject}
                onChange={(event) => setForm((current) => ({ ...current, subject: event.target.value }))}
                placeholder="Attendance update"
              />
            </label>

            <label>
              Email message/body
              <textarea
                value={form.message}
                onChange={(event) => setForm((current) => ({ ...current, message: event.target.value }))}
                rows={8}
                placeholder="Write the message students will receive..."
              />
            </label>

            <div className="student-email-actions">
              <button type="submit" disabled={sending}>
                <Mail size={16} strokeWidth={2.2} />
                {sending ? 'Sending...' : 'Send email'}
              </button>
              <button type="button" className="btn-ghost" onClick={() => setForm((current) => ({ ...current, subject: '', message: '' }))}>
                Clear draft
              </button>
            </div>
          </div>

          <aside className="student-email-preview" aria-label="Email preview">
            <span>Preview</span>
            <strong>{form.subject.trim() || 'No subject yet'}</strong>
            <em>{recipientPreview}</em>
            <p>{form.message.trim()}</p>
          </aside>
        </form>
      </section>

      <section className="student-table-card">
        <div className="student-table-head">
          <p className="card-title">Recipients</p>
          <label className="student-search">
            <Search size={16} strokeWidth={2.2} />
            <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search recipients" />
          </label>
        </div>
        <div className="student-table-wrap">
          <table className="attendance-table">
            <thead>
              <tr>
                <th>Select</th>
                <th>Student</th>
                <th>Email</th>
                <th>Class</th>
              </tr>
            </thead>
            <tbody>
              {visibleStudents.map((student) => (
                <tr key={student.id}>
                  <td>
                    <input
                      type="checkbox"
                      checked={selectedIds.includes(student.id)}
                      onChange={(event) => toggleSelected(student.id, event.target.checked)}
                      aria-label={`Select ${student.full_name}`}
                    />
                  </td>
                  <td>
                    <strong>{student.full_name}</strong>
                    <span className="student-table-sub">{student.student_number || 'No student ID'}</span>
                  </td>
                  <td className="student-id">{student.email || 'No linked email'}</td>
                  <td className="student-id">{student.class_label || 'No class linked'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  )
}
