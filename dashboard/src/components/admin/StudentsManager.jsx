import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  Ban,
  Download,
  Edit3,
  Mail,
  Plus,
  RefreshCw,
  Search,
  ShieldAlert,
  Trash2,
  X,
} from 'lucide-react'
import { api, supabase } from '../../api/client'

const KAINGA_OPTIONS = ['Kea', 'Pukeko', 'Mokoroa', 'Pungawerere']
const YEAR_LEVELS = ['9', '10', '11', '12', '13']
const RECENTLY_ADDED_CUTOFF = Date.now() - (30 * 24 * 60 * 60 * 1000)
const EMPTY_FORM = {
  first_name: '',
  last_name: '',
  email: '',
  student_number: '',
  year_level: '',
  form_group: '',
  kainga: '',
  la_teacher_id: '',
  rfid_card_uid: '',
  temporary_password: '',
  auto_generate_password: true,
}

function formatDateTime(value) {
  if (!value) return 'Not recorded'
  return new Date(value).toLocaleString([], {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

function maskCard(value) {
  if (!value) return 'Unassigned'
  const clean = String(value).toUpperCase()
  return `${'*'.repeat(Math.max(clean.length - 4, 4))}${clean.slice(-4)}`
}

function attendanceLabel(summary) {
  if (!summary || summary.percentage === null) return 'No records'
  return `${summary.percentage}% - ${summary.present} present, ${summary.late} late`
}

function getStatusTone(status) {
  if (status === 'active') return 'status-present'
  if (status === 'inactive' || status === 'disabled' || status === 'lost') return 'status-absent'
  return 'status-excused'
}

function studentToForm(student) {
  return {
    first_name: student.first_name || '',
    last_name: student.last_name || '',
    email: student.email || '',
    student_number: student.student_number || '',
    year_level: student.year_level ? String(student.year_level) : '',
    form_group: student.form_group || '',
    kainga: student.kainga || '',
    la_teacher_id: student.la_teacher_id || '',
    rfid_card_uid: student.rfid_card_uid || '',
    temporary_password: '',
    auto_generate_password: true,
  }
}

function csvEscape(value) {
  return `"${String(value ?? '').replace(/"/g, '""')}"`
}

function exportStudents(students) {
  const headers = ['Name', 'Student ID', 'Email', 'Year', 'Class', 'Kainga', 'RFID', 'Account status', 'Attendance']
  const rows = students.map((student) => [
    student.full_name,
    student.student_number,
    student.email,
    student.year_level ? `Year ${student.year_level}` : '',
    student.class_label,
    student.kainga,
    student.rfid_card_uid,
    student.account_status,
    attendanceLabel(student.attendance_summary),
  ])
  const csv = [headers, ...rows].map((row) => row.map(csvEscape).join(',')).join('\n')
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = 'tago-students.csv'
  link.click()
  URL.revokeObjectURL(url)
}

async function fetchStudentManagementData() {
  const [studentData, auditData, teacherResult] = await Promise.all([
    api.get('/api/students/manage'),
    api.get('/api/students/manage/audit-logs'),
    supabase.from('profiles').select('id, full_name, email').eq('role', 'teacher').order('full_name'),
  ])

  return { studentData, auditData, teachers: teacherResult.data || [] }
}

function ActionNotice({ notice }) {
  if (!notice) return null
  return (
    <p className={`action-notice student-toast-notice ${notice.type === 'error' ? 'is-error' : 'is-success'}`} role={notice.type === 'error' ? 'alert' : 'status'}>
      {notice.text}
    </p>
  )
}

function StudentFormModal({ mode, form, setForm, teachers, onClose, onSubmit, saving, student, onUploadPhoto, photoUploading, photoNotice }) {
  const isEdit = mode === 'edit'

  return (
    <div className="student-modal-backdrop" role="presentation">
      <section className="student-modal" role="dialog" aria-modal="true" aria-labelledby="student-form-title">
        <div className="student-modal-header">
          <div>
            <p className="card-title">{isEdit ? 'Edit Student' : 'Add Student'}</p>
            <h3 id="student-form-title">{isEdit ? 'Update student record' : 'Create student and optional login'}</h3>
          </div>
          <button type="button" className="student-icon-button" onClick={onClose} aria-label="Close">
            <X size={18} strokeWidth={2.2} />
          </button>
        </div>

        <form className="student-form-grid" onSubmit={onSubmit}>
          <div className="login-field">
            <label htmlFor="student-first-name">First name</label>
            <input id="student-first-name" value={form.first_name} onChange={(event) => setForm((current) => ({ ...current, first_name: event.target.value }))} />
          </div>
          <div className="login-field">
            <label htmlFor="student-last-name">Last name</label>
            <input id="student-last-name" value={form.last_name} onChange={(event) => setForm((current) => ({ ...current, last_name: event.target.value }))} />
          </div>
          <div className="login-field">
            <label htmlFor="student-email">Email</label>
            <input id="student-email" type="email" value={form.email} onChange={(event) => setForm((current) => ({ ...current, email: event.target.value }))} placeholder="student@school.nz" />
          </div>
          <div className="login-field">
            <label htmlFor="student-number">Student ID</label>
            <input id="student-number" value={form.student_number} onChange={(event) => setForm((current) => ({ ...current, student_number: event.target.value }))} />
          </div>
          <div className="login-field">
            <label htmlFor="student-year">Year level</label>
            <select id="student-year" className="session-select" value={form.year_level} onChange={(event) => setForm((current) => ({ ...current, year_level: event.target.value }))}>
              <option value="">Not set</option>
              {YEAR_LEVELS.map((year) => <option key={year} value={year}>Year {year}</option>)}
            </select>
          </div>
          <div className="login-field">
            <label htmlFor="student-form-group">Class / form group</label>
            <input id="student-form-group" value={form.form_group} onChange={(event) => setForm((current) => ({ ...current, form_group: event.target.value }))} placeholder="Optional" />
          </div>
          <div className="login-field">
            <label htmlFor="student-kainga">Kainga</label>
            <select id="student-kainga" className="session-select" value={form.kainga} onChange={(event) => setForm((current) => ({ ...current, kainga: event.target.value }))}>
              <option value="">Not set</option>
              {KAINGA_OPTIONS.map((kainga) => <option key={kainga} value={kainga}>{kainga}</option>)}
            </select>
          </div>
          <div className="login-field">
            <label htmlFor="student-la-teacher">LA teacher</label>
            <select id="student-la-teacher" className="session-select" value={form.la_teacher_id} onChange={(event) => setForm((current) => ({ ...current, la_teacher_id: event.target.value }))}>
              <option value="">Not set</option>
              {teachers.map((teacher) => <option key={teacher.id} value={teacher.id}>{teacher.full_name}</option>)}
            </select>
          </div>
          {!isEdit && (
            <div className="login-field">
              <label htmlFor="student-rfid">RFID card ID</label>
              <input id="student-rfid" value={form.rfid_card_uid} onChange={(event) => setForm((current) => ({ ...current, rfid_card_uid: event.target.value }))} placeholder="Optional" />
            </div>
          )}

          {isEdit && (
            <div className="login-field student-form-wide">
              <label htmlFor="student-photo">Student photo</label>
              {student?.photo_url && (
                <img src={student.photo_url} alt="" className="student-photo-preview" />
              )}
              <input
                id="student-photo"
                type="file"
                accept="image/*"
                disabled={photoUploading}
                onChange={(event) => {
                  const file = event.target.files?.[0]
                  if (file) onUploadPhoto(student, file)
                  event.target.value = ''
                }}
              />
              {photoUploading && <span className="student-table-sub">Uploading...</span>}
              {photoNotice && (
                <span className={photoNotice.type === 'error' ? 'is-error' : 'is-success'}>
                  {photoNotice.text}
                </span>
              )}
            </div>
          )}

          {!isEdit && (
            <div className="student-form-wide">
              <label className="account-toggle-row">
                <input
                  type="checkbox"
                  checked={form.auto_generate_password}
                  onChange={(event) => setForm((current) => ({ ...current, auto_generate_password: event.target.checked }))}
                />
                <span>Auto-generate temporary password</span>
              </label>
            </div>
          )}

          {!isEdit && !form.auto_generate_password && (
            <div className="login-field student-form-wide">
              <label htmlFor="student-temp-password">Temporary password</label>
              <input
                id="student-temp-password"
                type="text"
                value={form.temporary_password}
                onChange={(event) => setForm((current) => ({ ...current, temporary_password: event.target.value }))}
                placeholder="At least 6 characters"
              />
            </div>
          )}

          <div className="student-modal-actions">
            <button type="button" className="btn-ghost" onClick={onClose}>Cancel</button>
            <button type="submit" disabled={saving}>{saving ? 'Saving...' : isEdit ? 'Save changes' : 'Create student'}</button>
          </div>
        </form>
      </section>
    </div>
  )
}

function RfidModal({ student, form, setForm, onClose, onSubmit, saving }) {
  const needsCard = form.action === 'assign' || form.action === 'replace'

  return (
    <div className="student-modal-backdrop" role="presentation">
      <section className="student-modal student-modal-small" role="dialog" aria-modal="true" aria-labelledby="rfid-form-title">
        <div className="student-modal-header">
          <div>
            <p className="card-title">RFID Card</p>
            <h3 id="rfid-form-title">{student.full_name}</h3>
          </div>
          <button type="button" className="student-icon-button" onClick={onClose} aria-label="Close">
            <X size={18} strokeWidth={2.2} />
          </button>
        </div>
        <form className="student-form-grid" onSubmit={onSubmit}>
          <div className="login-field student-form-wide">
            <label htmlFor="rfid-action">Action</label>
            <select id="rfid-action" className="session-select" value={form.action} onChange={(event) => setForm((current) => ({ ...current, action: event.target.value }))}>
              <option value="assign">Assign card</option>
              <option value="replace">Replace card</option>
              <option value="unassign">Unassign card</option>
              <option value="deactivate">Deactivate card</option>
              <option value="lost">Mark card lost</option>
            </select>
          </div>
          {needsCard && (
            <div className="login-field student-form-wide">
              <label htmlFor="rfid-card-id">RFID card ID</label>
              <input id="rfid-card-id" value={form.rfid_card_uid} onChange={(event) => setForm((current) => ({ ...current, rfid_card_uid: event.target.value }))} />
            </div>
          )}
          <div className="student-danger-copy student-form-wide">
            Current card: <strong>{maskCard(student.rfid_card_uid)}</strong>. Lost or deactivated cards are removed from the active scan lookup.
          </div>
          <div className="student-modal-actions">
            <button type="button" className="btn-ghost" onClick={onClose}>Cancel</button>
            <button type="submit" disabled={saving}>{saving ? 'Saving...' : 'Update RFID'}</button>
          </div>
        </form>
      </section>
    </div>
  )
}

function ConfirmModal({ action, student, onClose, onConfirm, saving }) {
  const isDelete = action === 'delete'
  return (
    <div className="student-modal-backdrop" role="presentation">
      <section className="student-modal student-modal-small" role="dialog" aria-modal="true" aria-labelledby="student-confirm-title">
        <div className="student-modal-header">
          <div>
            <p className="card-title">{isDelete ? 'Permanent delete' : 'Disable student'}</p>
            <h3 id="student-confirm-title">{student.full_name}</h3>
          </div>
          <button type="button" className="student-icon-button" onClick={onClose} aria-label="Close">
            <X size={18} strokeWidth={2.2} />
          </button>
        </div>
        <div className="student-danger-copy">
          <ShieldAlert size={18} strokeWidth={2.2} />
          <p>
            {isDelete
              ? 'If this student has attendance history, Tago will disable the record instead of deleting it so logs are preserved.'
              : 'Disabling a student deactivates their RFID card and removes them from active attendance scanning.'}
          </p>
        </div>
        <div className="student-modal-actions">
          <button type="button" className="btn-ghost" onClick={onClose}>Cancel</button>
          <button type="button" className="account-danger-button" onClick={onConfirm} disabled={saving}>
            {saving ? 'Working...' : isDelete ? 'Delete or disable' : 'Disable student'}
          </button>
        </div>
      </section>
    </div>
  )
}

export default function StudentsManager() {
  const [students, setStudents] = useState([])
  const [auditLogs, setAuditLogs] = useState([])
  const [teachers, setTeachers] = useState([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [busyId, setBusyId] = useState(null)
  const [notice, setNotice] = useState(null)
  const [query, setQuery] = useState('')
  const [statusFilter, setStatusFilter] = useState('all')
  const [rfidFilter, setRfidFilter] = useState('all')
  const [yearFilter, setYearFilter] = useState('all')
  const [kaingaFilter, setKaingaFilter] = useState('all')
  const [recentOnly, setRecentOnly] = useState(false)
  const [selectedIds, setSelectedIds] = useState([])
  const [formModal, setFormModal] = useState(null)
  const [form, setForm] = useState(EMPTY_FORM)
  const [rfidModal, setRfidModal] = useState(null)
  const [rfidForm, setRfidForm] = useState({ action: 'assign', rfid_card_uid: '' })
  const [confirmModal, setConfirmModal] = useState(null)
  const [photoUploading, setPhotoUploading] = useState(false)
  const [photoNotice, setPhotoNotice] = useState(null)

  const uploadStudentPhoto = async (student, file) => {
    setPhotoUploading(true)
    setPhotoNotice(null)

    try {
      const ext = file.name.split('.').pop()
      const path = `${student.id}/${Date.now()}.${ext}`

      const { error: uploadError } = await supabase.storage
        .from('student-photos')
        .upload(path, file, { upsert: true, contentType: file.type })

      if (uploadError) throw new Error(uploadError.message)

      const { data: signedData, error: signError } = await supabase.storage
        .from('student-photos')
        .createSignedUrl(path, 60 * 60 * 24 * 365 * 10)

      if (signError) throw new Error(signError.message)

      const data = await api.patch(`/api/students/manage/${student.id}/photo`, {
        photo_url: signedData.signedUrl,
      })

      if (data?.error) throw new Error(data.error)

      replaceStudent(data.student)
      setPhotoNotice({ type: 'success', text: 'Photo updated.' })
    } catch (error) {
      setPhotoNotice({ type: 'error', text: error.message })
    } finally {
      setPhotoUploading(false)
    }
  }
  const [emailForm, setEmailForm] = useState({ recipientMode: 'visible', subject: '', message: '' })
  const [emailNotice, setEmailNotice] = useState(null)
  const [emailSending, setEmailSending] = useState(false)
  const emailCardRef = useRef(null)
  const emailSubjectRef = useRef(null)

  // Loads students/audit/teacher data.
  // Pass { silent: true } for background refreshes triggered after an
  // action (create/edit/rfid/status change etc.) so the success/error
  // notice we just set isn't wiped out and the table doesn't flash back
  // to the full-page loading state.
  const loadData = useCallback(async (options = {}) => {
    const { silent = false } = options

    if (!silent) {
      setLoading(true)
      setNotice(null)
    }

    const { studentData, auditData, teachers: teacherData } = await fetchStudentManagementData()

    if (studentData?.error) {
      setNotice({ type: 'error', text: studentData.error })
    } else {
      setStudents(Array.isArray(studentData) ? studentData : [])
    }

    if (!auditData?.error) setAuditLogs(Array.isArray(auditData) ? auditData : [])
    setTeachers(teacherData)

    if (!silent) setLoading(false)
  }, [])

  useEffect(() => {
    let cancelled = false

    async function loadInitialData() {
      const { studentData, auditData, teachers: teacherData } = await fetchStudentManagementData()

      if (cancelled) return

      if (studentData?.error) {
        setNotice({ type: 'error', text: studentData.error })
      } else {
        setStudents(Array.isArray(studentData) ? studentData : [])
      }

      if (!auditData?.error) setAuditLogs(Array.isArray(auditData) ? auditData : [])
      setTeachers(teacherData)
      setLoading(false)
    }

    loadInitialData()

    return () => { cancelled = true }
  }, [])

  const visibleStudents = useMemo(() => {
    const search = query.trim().toLowerCase()

    return students.filter((student) => {
      const searchable = [
        student.full_name,
        student.student_number,
        student.email,
        student.rfid_card_uid,
        student.kainga,
        student.class_label,
      ].filter(Boolean).join(' ').toLowerCase()

      if (search && !searchable.includes(search)) return false
      if (statusFilter !== 'all' && student.account_status !== statusFilter) return false
      if (rfidFilter === 'missing' && student.rfid_card_uid) return false
      if (rfidFilter !== 'all' && rfidFilter !== 'missing' && student.rfid_status !== rfidFilter) return false
      if (yearFilter !== 'all' && String(student.year_level || '') !== yearFilter) return false
      if (kaingaFilter !== 'all' && student.kainga !== kaingaFilter) return false
      if (recentOnly && (!student.created_at || new Date(student.created_at).getTime() < RECENTLY_ADDED_CUTOFF)) return false

      return true
    })
  }, [students, query, statusFilter, rfidFilter, yearFilter, kaingaFilter, recentOnly])

  const selectedStudents = useMemo(
    () => students.filter((student) => selectedIds.includes(student.id)),
    [students, selectedIds],
  )

  const emailRecipientPool = useMemo(() => {
    if (emailForm.recipientMode === 'selected') return selectedStudents
    if (emailForm.recipientMode === 'all') return students
    return visibleStudents
  }, [emailForm.recipientMode, selectedStudents, students, visibleStudents])

  const emailRecipients = useMemo(
    () => emailRecipientPool.filter((student) => student.email),
    [emailRecipientPool],
  )

  const emailRecipientPreview = useMemo(() => {
    if (!emailRecipients.length) return 'No recipients with linked email addresses.'
    const names = emailRecipients.slice(0, 4).map((student) => student.full_name).join(', ')
    const extra = emailRecipients.length > 4 ? ` and ${emailRecipients.length - 4} more` : ''
    return `${emailRecipients.length} recipient(s): ${names}${extra}`
  }, [emailRecipients])

  const stats = useMemo(() => ({
    total: students.length,
    active: students.filter((student) => student.account_status === 'active').length,
    noCard: students.filter((student) => !student.rfid_card_uid).length,
    flagged: students.filter((student) => student.attendance_summary?.absent > 0 || student.attendance_summary?.late > 0).length,
  }), [students])

  const replaceStudent = (nextStudent) => {
    setStudents((current) => current.map((student) => (student.id === nextStudent.id ? nextStudent : student)))
  }

  const openAddModal = () => {
    setForm(EMPTY_FORM)
    setFormModal({ mode: 'add' })
    setNotice(null)
  }

  const openEditModal = (student) => {
    setForm(studentToForm(student))
    setFormModal({ mode: 'edit', student })
    setNotice(null)
  }

  const isInteractiveTarget = (target) => Boolean(
    target.closest('button, a, input, select, textarea, label'),
  )

  const handleStudentRowClick = (event, student) => {
    if (isInteractiveTarget(event.target)) return
    openEditModal(student)
  }

  const handleStudentRowKeyDown = (event, student) => {
    if (!['Enter', ' '].includes(event.key) || isInteractiveTarget(event.target)) return
    event.preventDefault()
    openEditModal(student)
  }

  const submitStudentForm = async (event) => {
    event.preventDefault()
    setSaving(true)
    setNotice(null)

    const endpoint = formModal.mode === 'add'
      ? '/api/students/manage'
      : `/api/students/manage/${formModal.student.id}`
    const request = formModal.mode === 'add' ? api.post : api.patch
    const data = await request(endpoint, form)

    setSaving(false)

    if (data?.error) {
      setNotice({ type: 'error', text: data.error })
      return
    }

    if (formModal.mode === 'add') {
      setStudents((current) => [data.student, ...current].sort((a, b) => a.full_name.localeCompare(b.full_name)))
      setNotice({
        type: 'success',
        text: data.emailSent
          ? 'Student created and confirmation email sent.'
          : `Student created. Email not sent: ${data.emailError || 'No email configured.'}`,
      })
    } else {
      replaceStudent(data.student)
      setNotice({ type: data.warning ? 'error' : 'success', text: data.warning || 'Student updated.' })
    }

    setFormModal(null)
    loadData({ silent: true })
  }

  const openRfidModal = (student) => {
    setRfidForm({ action: student.rfid_card_uid ? 'replace' : 'assign', rfid_card_uid: '' })
    setRfidModal({ student })
    setNotice(null)
  }

  const submitRfidForm = async (event) => {
    event.preventDefault()
    setSaving(true)
    setNotice(null)

    const data = await api.patch(`/api/students/manage/${rfidModal.student.id}/rfid`, rfidForm)
    setSaving(false)

    if (data?.error) {
      setNotice({ type: 'error', text: data.error })
      return
    }

    replaceStudent(data.student)
    setNotice({ type: 'success', text: data.message || 'RFID details updated.' })
    setRfidModal(null)
    loadData({ silent: true })
  }

  const runConfirmAction = async () => {
    setBusyId(confirmModal.student.id)
    setNotice(null)

    const data = confirmModal.action === 'delete'
      ? await api.delete(`/api/students/${confirmModal.student.id}`)
      : await api.patch(`/api/students/manage/${confirmModal.student.id}/status`, { account_status: 'disabled' })

    setBusyId(null)

    if (data?.error) {
      setNotice({ type: 'error', text: data.error })
      return
    }

    if (data.deleted) {
      setStudents((current) => current.filter((student) => student.id !== confirmModal.student.id))
    } else if (data.student) {
      replaceStudent(data.student)
    }

    setNotice({ type: 'success', text: data.message || 'Student updated.' })
    setConfirmModal(null)
    loadData({ silent: true })
  }

  const reactivateStudent = async (student) => {
    setBusyId(student.id)
    const data = await api.patch(`/api/students/manage/${student.id}/status`, { account_status: 'active' })
    setBusyId(null)

    if (data?.error) {
      setNotice({ type: 'error', text: data.error })
      return
    }

    replaceStudent(data.student)
    setNotice({ type: 'success', text: data.message || 'Student reactivated.' })
    loadData({ silent: true })
  }

  const resendConfirmation = async (student) => {
    setBusyId(student.id)
    setNotice(null)
    const data = await api.post(`/api/students/manage/${student.id}/resend-confirmation`, {})
    setBusyId(null)

    if (data?.error) {
      setNotice({ type: 'error', text: data.error })
      return
    }

    setNotice({
      type: data.emailSent ? 'success' : 'error',
      text: data.emailSent ? 'Confirmation email sent.' : `Email not sent: ${data.emailError}`,
    })
    loadData({ silent: true })
  }

  const toggleSelectAll = (checked) => {
    setSelectedIds(checked ? visibleStudents.map((student) => student.id) : [])
  }

  const toggleSelected = (studentId, checked) => {
    setSelectedIds((current) => checked
      ? [...new Set([...current, studentId])]
      : current.filter((id) => id !== studentId))
  }

  const bulkDeactivate = async () => {
    setSaving(true)
    setNotice(null)
    const results = await Promise.all(selectedStudents.map((student) => (
      api.patch(`/api/students/manage/${student.id}/status`, { account_status: 'disabled' })
    )))
    setSaving(false)

    const failed = results.find((result) => result?.error)
    if (failed) {
      setNotice({ type: 'error', text: failed.error })
      return
    }

    setSelectedIds([])
    setNotice({ type: 'success', text: `${selectedStudents.length} student(s) disabled.` })
    loadData({ silent: true })
  }

  const bulkResend = async () => {
    setSaving(true)
    setNotice(null)
    const results = await Promise.all(selectedStudents.map((student) => (
      api.post(`/api/students/manage/${student.id}/resend-confirmation`, {})
    )))
    setSaving(false)

    const failed = results.find((result) => result?.error)
    if (failed) {
      setNotice({ type: 'error', text: failed.error })
      return
    }

    setSelectedIds([])
    setNotice({ type: 'success', text: `Confirmation email requested for ${selectedStudents.length} student(s).` })
    loadData({ silent: true })
  }

  const openMailtoFallback = (recipients, subject, message, reason) => {
    const recipientEmails = [...new Set(recipients.map((student) => student.email).filter(Boolean))]
    const params = new URLSearchParams({ subject, body: message })
    const mailtoUrl = `mailto:${recipientEmails.map(encodeURIComponent).join(',')}?${params.toString()}`

    if (mailtoUrl.length > 1900) {
      setEmailNotice({
        type: 'error',
        text: `${reason}. The message is too long for a mail app fallback; shorten it or configure an email provider.`,
      })
      return false
    }

    window.location.href = mailtoUrl
    setEmailNotice({
      type: 'success',
      text: `${reason}. Opened your email app with ${recipientEmails.length} recipient(s).`,
    })
    return true
  }

  const prepareStudentEmail = (student) => {
    if (!student.email) {
      setNotice({ type: 'error', text: `${student.full_name} does not have a linked email address.` })
      return
    }

    setSelectedIds([student.id])
    setEmailForm((current) => ({ ...current, recipientMode: 'selected' }))
    setEmailNotice({ type: 'success', text: `Composer ready for ${student.full_name}.` })

    window.setTimeout(() => {
      emailCardRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
      emailSubjectRef.current?.focus()
    }, 0)
  }

  const sendAdminEmail = async (event) => {
    event.preventDefault()
    const subject = emailForm.subject.trim()
    const message = emailForm.message.trim()

    setEmailNotice(null)

    if (!subject) {
      setEmailNotice({ type: 'error', text: 'Add an email subject before sending.' })
      return
    }

    if (!message) {
      setEmailNotice({ type: 'error', text: 'Add an email message before sending.' })
      return
    }

    if (!emailRecipients.length) {
      setEmailNotice({ type: 'error', text: 'Choose at least one recipient with a linked email address.' })
      return
    }

    setEmailSending(true)
    let data
    try {
      data = await api.post('/api/students/manage/email', {
        recipient_ids: emailRecipients.map((student) => student.id),
        subject,
        message,
      })
    } catch (error) {
      openMailtoFallback(emailRecipients, subject, message, error.message || 'Email server could not be reached')
      setEmailSending(false)
      return
    }
    setEmailSending(false)

    if (data?.error) {
      setEmailNotice({ type: 'error', text: data.error })
      return
    }

    setEmailNotice({
      type: data.emailSent ? 'success' : 'error',
      text: data.emailSent
        ? `Email sent to ${data.recipientCount} recipient(s).`
        : `Email prepared for ${data.recipientCount || emailRecipients.length} recipient(s), but was not sent: ${data.emailError || 'Email provider is not configured.'}`,
    })
    if (data.emailSent === false) {
      openMailtoFallback(
        emailRecipients,
        subject,
        message,
        data.emailError || 'Email provider is not configured',
      )
    }
    loadData({ silent: true })
  }

  if (loading) return <div className="loading">loading</div>

  return (
    <div className="student-management">
      <section className="student-management-header">
        <div>
          <p className="card-title">Student Management</p>
          <h3>Manage student records, accounts, RFID cards, and attendance context.</h3>
        </div>
        <div className="student-management-actions">
          <button type="button" className="btn-ghost" onClick={loadData}>
            <RefreshCw size={16} strokeWidth={2.2} />
            Refresh
          </button>
          <button type="button" onClick={openAddModal}>
            <Plus size={16} strokeWidth={2.2} />
            Add Student
          </button>
        </div>
      </section>

      <ActionNotice notice={notice} />

      <section className="student-stat-grid">
        <div><span>Total students</span><strong>{stats.total}</strong></div>
        <div><span>Active accounts</span><strong>{stats.active}</strong></div>
        <div><span>No RFID card</span><strong>{stats.noCard}</strong></div>
        <div><span>Needs review</span><strong>{stats.flagged}</strong></div>
      </section>

      <section className="student-toolbar">
        <label className="student-search">
          <Search size={16} strokeWidth={2.2} />
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search name, email, student ID, RFID, kainga"
          />
        </label>
        <select className="session-select" value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)}>
          <option value="all">All statuses</option>
          <option value="active">Active</option>
          <option value="inactive">Inactive</option>
          <option value="disabled">Disabled</option>
          <option value="record only">Record only</option>
        </select>
        <select className="session-select" value={rfidFilter} onChange={(event) => setRfidFilter(event.target.value)}>
          <option value="all">All RFID</option>
          <option value="missing">No RFID card</option>
          <option value="active">RFID active</option>
          <option value="inactive">RFID inactive</option>
          <option value="lost">RFID lost</option>
          <option value="unassigned">RFID unassigned</option>
        </select>
        <select className="session-select" value={yearFilter} onChange={(event) => setYearFilter(event.target.value)}>
          <option value="all">All years</option>
          {YEAR_LEVELS.map((year) => <option key={year} value={year}>Year {year}</option>)}
        </select>
        <select className="session-select" value={kaingaFilter} onChange={(event) => setKaingaFilter(event.target.value)}>
          <option value="all">All kainga</option>
          {KAINGA_OPTIONS.map((kainga) => <option key={kainga} value={kainga}>{kainga}</option>)}
        </select>
        <label className="student-recent-toggle">
          <input type="checkbox" checked={recentOnly} onChange={(event) => setRecentOnly(event.target.checked)} />
          Recently added
        </label>
      </section>

      {selectedStudents.length > 0 && (
        <section className="student-bulk-bar">
          <strong>{selectedStudents.length} selected</strong>
          <button type="button" className="btn-ghost" onClick={() => exportStudents(selectedStudents)}>
            <Download size={16} strokeWidth={2.2} />
            Export selected
          </button>
          <button type="button" className="btn-ghost" onClick={bulkResend} disabled={saving}>
            <Mail size={16} strokeWidth={2.2} />
            Resend email
          </button>
          <button type="button" className="account-danger-button" onClick={bulkDeactivate} disabled={saving}>
            <Ban size={16} strokeWidth={2.2} />
            Disable selected
          </button>
        </section>
      )}

      <section className="student-email-card" ref={emailCardRef}>
        <div className="student-table-head">
          <div>
            <p className="card-title">Admin Email</p>
            <h3>Send a composed message to student recipients.</h3>
          </div>
          <span className="student-email-count">{emailRecipientPreview}</span>
        </div>

        <form className="student-email-grid" onSubmit={sendAdminEmail}>
          <div className="student-email-form">
            <label>
              Recipient group
              <select
                className="session-select"
                value={emailForm.recipientMode}
                onChange={(event) => {
                  setEmailForm((current) => ({ ...current, recipientMode: event.target.value }))
                  setEmailNotice(null)
                }}
              >
                <option value="visible">Current filtered view ({visibleStudents.filter((student) => student.email).length})</option>
                <option value="selected">Selected students ({selectedStudents.filter((student) => student.email).length})</option>
                <option value="all">All students with email ({students.filter((student) => student.email).length})</option>
              </select>
            </label>

            <label>
              Email subject
              <input
                ref={emailSubjectRef}
                value={emailForm.subject}
                onChange={(event) => {
                  setEmailForm((current) => ({ ...current, subject: event.target.value }))
                  setEmailNotice(null)
                }}
                placeholder="Attendance update"
              />
            </label>

            <label>
              Email message/body
              <textarea
                value={emailForm.message}
                onChange={(event) => {
                  setEmailForm((current) => ({ ...current, message: event.target.value }))
                  setEmailNotice(null)
                }}
                rows={8}
                placeholder="Write the message students will receive..."
              />
            </label>

            <div className="student-email-actions">
              <button type="submit" disabled={emailSending}>
                <Mail size={16} strokeWidth={2.2} />
                {emailSending ? 'Sending...' : 'Send email'}
              </button>
              <button
                type="button"
                className="btn-ghost"
                onClick={() => {
                  setEmailForm((current) => ({ ...current, subject: '', message: '' }))
                  setEmailNotice(null)
                }}
              >
                Clear draft
              </button>
            </div>

            {emailNotice && (
              <p className={`action-notice student-email-notice ${emailNotice.type === 'error' ? 'is-error' : 'is-success'}`} role={emailNotice.type === 'error' ? 'alert' : 'status'}>
                {emailNotice.text}
              </p>
            )}
          </div>

          <aside className="student-email-preview" aria-label="Email preview">
            <span>Preview</span>
            <strong>{emailForm.subject.trim() || 'No subject yet'}</strong>
            <em>{emailRecipientPreview}</em>
            <p>{emailForm.message.trim() || 'Your message preview will appear here before sending.'}</p>
          </aside>
        </form>
      </section>

      <section className="student-table-card">
        <div className="student-table-head">
          <p className="card-title">Students ({visibleStudents.length}/{students.length})</p>
          <button type="button" className="btn-ghost" onClick={() => exportStudents(visibleStudents)}>
            <Download size={16} strokeWidth={2.2} />
            Export view
          </button>
        </div>

        {visibleStudents.length === 0 ? (
          <div className="portal-empty">
            <strong>No students match these filters.</strong>
            <span>Try clearing search or adding a new student record.</span>
          </div>
        ) : (
          <div className="student-table-wrap">
            <table className="attendance-table student-management-table">
              <thead>
                <tr>
                  <th>
                    <input
                      type="checkbox"
                      checked={visibleStudents.length > 0 && visibleStudents.every((student) => selectedIds.includes(student.id))}
                      onChange={(event) => toggleSelectAll(event.target.checked)}
                      aria-label="Select all students"
                    />
                  </th>
                  <th>Student</th>
                  <th>Email</th>
                  <th>Year / class</th>
                  <th>Kainga</th>
                  <th>RFID</th>
                  <th>LA teacher</th>
                  <th>Account</th>
                  <th>Attendance</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {visibleStudents.map((student) => (
                  <tr
                    key={student.id}
                    className="student-clickable-row"
                    tabIndex={0}
                    onClick={(event) => handleStudentRowClick(event, student)}
                    onKeyDown={(event) => handleStudentRowKeyDown(event, student)}
                    aria-label={`Open ${student.full_name} student record`}
                  >
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
                      <span className="student-table-sub">{student.student_number}</span>
                    </td>
                    <td className="student-id">{student.email || 'No login email'}</td>
                    <td className="student-id">
                      {student.year_level ? `Y${student.year_level}` : 'Year not set'}
                      {student.class_label ? <span className="student-table-sub">{student.class_label}</span> : null}
                    </td>
                    <td>{student.kainga || '-'}</td>
                    <td>
                      <span className={`status-badge ${getStatusTone(student.rfid_status)}`}>{student.rfid_status}</span>
                      <span className="student-table-sub">{maskCard(student.rfid_card_uid)}</span>
                    </td>
                    <td className="student-id">{student.la_teacher_name || '-'}</td>
                    <td>
                      <span className={`status-badge ${getStatusTone(student.account_status)}`}>{student.account_status}</span>
                    </td>
                    <td className="student-id">{attendanceLabel(student.attendance_summary)}</td>
                    <td>
                      <div className="student-row-actions">
                        <button type="button" className="btn-ghost" onClick={() => openEditModal(student)}>
                          <Edit3 size={14} strokeWidth={2.2} />
                          Edit
                        </button>
                        <button type="button" className="btn-ghost" onClick={() => openRfidModal(student)}>
                          RFID
                        </button>
                        <button type="button" className="btn-ghost" onClick={() => prepareStudentEmail(student)} disabled={busyId === student.id}>
                          <Mail size={14} strokeWidth={2.2} />
                          Email
                        </button>
                        <button type="button" className="btn-ghost" onClick={() => resendConfirmation(student)} disabled={busyId === student.id}>
                          Invite
                        </button>
                        {student.account_status === 'active' ? (
                          <button type="button" className="btn-ghost" onClick={() => setConfirmModal({ action: 'disable', student })} disabled={busyId === student.id}>
                            <Ban size={14} strokeWidth={2.2} />
                            Disable
                          </button>
                        ) : (
                          <button type="button" className="btn-ghost" onClick={() => reactivateStudent(student)} disabled={busyId === student.id}>
                            Reactivate
                          </button>
                        )}
                        <button type="button" className="account-danger-button" onClick={() => setConfirmModal({ action: 'delete', student })} disabled={busyId === student.id}>
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

      <section className="student-audit-card">
        <div className="student-table-head">
          <p className="card-title">Recent Student Audit</p>
        </div>
        {auditLogs.length === 0 ? (
          <p className="empty-state">No student management audit entries yet.</p>
        ) : (
          <div className="student-audit-list">
            {auditLogs.slice(0, 6).map((log) => (
              <div key={log.id || `${log.action}-${log.created_at}`} className="student-audit-row">
                <div>
                  <strong>{log.action}</strong>
                  <span>{log.description}</span>
                </div>
                <em>{formatDateTime(log.created_at)}</em>
              </div>
            ))}
          </div>
        )}
      </section>

{formModal && (
        <StudentFormModal
          mode={formModal.mode}
          form={form}
          setForm={setForm}
          teachers={teachers}
          onClose={() => setFormModal(null)}
          onSubmit={submitStudentForm}
          saving={saving}
          student={formModal.student}
          onUploadPhoto={uploadStudentPhoto}
          photoUploading={photoUploading}
          photoNotice={photoNotice}
        />
      )}

      {rfidModal && (
        <RfidModal
          student={rfidModal.student}
          form={rfidForm}
          setForm={setRfidForm}
          onClose={() => setRfidModal(null)}
          onSubmit={submitRfidForm}
          saving={saving}
        />
      )}

      {confirmModal && (
        <ConfirmModal
          action={confirmModal.action}
          student={confirmModal.student}
          onClose={() => setConfirmModal(null)}
          onConfirm={runConfirmAction}
          saving={busyId === confirmModal.student.id}
        />
      )}
    </div>
  )
}