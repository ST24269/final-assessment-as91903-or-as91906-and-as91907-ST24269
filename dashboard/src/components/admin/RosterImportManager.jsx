import { useMemo, useRef, useState } from 'react'
import { AlertTriangle, CheckCircle2, Download, FileUp, UploadCloud } from 'lucide-react'
import { api } from '../../api/client'

const TEMPLATE_HEADERS = ['First Name', 'Last Name', 'ST Number', 'Year Level', 'Kainga', 'Guardian Email']

// Recognised header aliases, normalised (lowercased, letters/numbers only) -> internal field name.
// This lets admins upload a CSV exported from the old system without renaming columns first.
const HEADER_ALIASES = {
  firstname: 'firstName',
  first: 'firstName',
  givenname: 'firstName',
  lastname: 'lastName',
  surname: 'lastName',
  last: 'lastName',
  familyname: 'lastName',
  stnumber: 'stNumber',
  studentnumber: 'stNumber',
  studentid: 'stNumber',
  id: 'stNumber',
  year: 'yearLevel',
  yearlevel: 'yearLevel',
  yeargroup: 'yearLevel',
  kainga: 'kainga',
  house: 'kainga',
  guardianemail: 'guardianEmail',
  parentemail: 'guardianEmail',
  email: 'guardianEmail',
  age: 'age',
}

const VALID_KAINGA = ['Kea', 'Pukeko', 'Mokoroa', 'Pungawerere']

function normalizeHeader(header) {
  return String(header || '').trim().toLowerCase().replace(/[^a-z0-9]/g, '')
}

// Minimal CSV line parser - handles quoted fields containing commas or
// escaped quotes ("") but not quoted fields that span multiple lines.
function parseCsv(text) {
  const lines = text.split(/\r\n|\n|\r/).filter((line) => line.length > 0)
  return lines.map((line) => {
    const fields = []
    let current = ''
    let inQuotes = false

    for (let i = 0; i < line.length; i += 1) {
      const char = line[i]

      if (inQuotes) {
        if (char === '"' && line[i + 1] === '"') {
          current += '"'
          i += 1
        } else if (char === '"') {
          inQuotes = false
        } else {
          current += char
        }
      } else if (char === '"') {
        inQuotes = true
      } else if (char === ',') {
        fields.push(current)
        current = ''
      } else {
        current += char
      }
    }

    fields.push(current)
    return fields.map((field) => field.trim())
  })
}

function mapRowsFromCsv(text) {
  const lines = parseCsv(text)
  if (lines.length === 0) return { rows: [], unmatchedHeaders: [] }

  const [headerRow, ...dataRows] = lines
  const fieldForColumn = headerRow.map((header) => HEADER_ALIASES[normalizeHeader(header)] || null)
  const unmatchedHeaders = headerRow.filter((_, index) => !fieldForColumn[index])

  const rows = dataRows
    .filter((row) => row.some((value) => value !== ''))
    .map((row) => {
      const mapped = {}
      row.forEach((value, index) => {
        const field = fieldForColumn[index]
        if (field) mapped[field] = value
      })
      return mapped
    })

  return { rows, unmatchedHeaders }
}

// Mirrors the server-side validation in onboarding.js/students.js so admins
// see problems immediately, before anything is sent to the API.
function validateRow(row) {
  const errors = []

  if (!String(row.firstName || '').trim() || !String(row.lastName || '').trim()) {
    errors.push('Missing first or last name')
  }

  const stNumber = String(row.stNumber || '').trim()
  if (!stNumber) {
    errors.push('Missing ST number')
  } else if (!/^[0-9]{1,20}$/.test(stNumber)) {
    errors.push('ST number must be numbers only')
  }

  if (row.yearLevel) {
    const digitsOnly = String(row.yearLevel).replace(/[^0-9]/g, '')
    const parsed = Number(digitsOnly)
    if (!digitsOnly || parsed < 11 || parsed > 13) {
      errors.push('Year level must be 11, 12, or 13')
    }
  }

  if (row.kainga && !VALID_KAINGA.some((item) => item.toLowerCase() === String(row.kainga).trim().toLowerCase())) {
    errors.push(`Kainga must be one of: ${VALID_KAINGA.join(', ')}`)
  }

  return errors
}

function downloadTemplate() {
  const csv = `${TEMPLATE_HEADERS.join(',')}\nJane,Smith,123456,11,Kea,jane.guardian@example.com\n`
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = 'tago-student-import-template.csv'
  link.click()
  URL.revokeObjectURL(url)
}

export default function RosterImportManager() {
  const [fileName, setFileName] = useState(null)
  const [parsedRows, setParsedRows] = useState([])
  const [unmatchedHeaders, setUnmatchedHeaders] = useState([])
  const [importing, setImporting] = useState(false)
  const [importResults, setImportResults] = useState(null)
  const [notice, setNotice] = useState(null)
  const fileInputRef = useRef(null)

  const rowsWithValidation = useMemo(
    () => parsedRows.map((row) => ({ row, errors: validateRow(row) })),
    [parsedRows],
  )

  const validRows = useMemo(
    () => rowsWithValidation.filter((item) => item.errors.length === 0).map((item) => item.row),
    [rowsWithValidation],
  )

  const invalidCount = rowsWithValidation.length - validRows.length

  const handleFileSelect = async (event) => {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (!file) return

    setNotice(null)
    setImportResults(null)
    setFileName(file.name)

    try {
      const text = await file.text()
      const { rows, unmatchedHeaders: unmatched } = mapRowsFromCsv(text)

      if (rows.length === 0) {
        setParsedRows([])
        setUnmatchedHeaders([])
        setNotice({ type: 'error', text: 'No data rows found in that file.' })
        return
      }

      setParsedRows(rows)
      setUnmatchedHeaders(unmatched)
    } catch (error) {
      setParsedRows([])
      setUnmatchedHeaders([])
      setNotice({ type: 'error', text: `Could not read that file: ${error.message}` })
    }
  }

  const runImport = async () => {
    if (validRows.length === 0) return

    setImporting(true)
    setNotice(null)
    const data = await api.post('/api/onboarding/import-roster', { rows: validRows })
    setImporting(false)

    if (data?.error) {
      setNotice({ type: 'error', text: data.error })
      return
    }

    setImportResults(data)
    setNotice({
      type: data.fail_count > 0 ? 'error' : 'success',
      text: `Imported ${data.success_count} of ${data.processed} student(s).${data.fail_count ? ` ${data.fail_count} failed.` : ''}`,
    })
  }

  const reset = () => {
    setFileName(null)
    setParsedRows([])
    setUnmatchedHeaders([])
    setImportResults(null)
    setNotice(null)
  }

  return (
    <div className="student-management">
      <section className="student-management-header">
        <div>
          <p className="card-title">Import Students</p>
          <h3>Bring students across from the old system via CSV.</h3>
        </div>
        <div className="student-management-actions">
          <button type="button" className="btn-ghost" onClick={downloadTemplate}>
            <Download size={16} strokeWidth={2.2} />
            Download template
          </button>
          <button type="button" onClick={() => fileInputRef.current?.click()}>
            <UploadCloud size={16} strokeWidth={2.2} />
            Choose CSV
          </button>
          <input
            ref={fileInputRef}
            type="file"
            accept=".csv,text/csv"
            onChange={handleFileSelect}
            style={{ display: 'none' }}
          />
        </div>
      </section>

      <p className="student-management-hint">
        Expected columns: {TEMPLATE_HEADERS.join(', ')}. Column order doesn't matter and common header
        variations (e.g. &quot;Student ID&quot;, &quot;Surname&quot;) are recognised automatically.
        Student numbers must be numbers only, and year level must be 11, 12, or 13 &mdash; rows that
        don't meet this are flagged before anything is imported.
      </p>

      {notice && (
        <p className={`action-notice ${notice.type === 'error' ? 'is-error' : 'is-success'}`} role={notice.type === 'error' ? 'alert' : 'status'}>
          {notice.text}
        </p>
      )}

      {fileName && (
        <section className="student-stat-grid">
          <div><span>File</span><strong style={{ fontSize: '0.95rem' }}>{fileName}</strong></div>
          <div><span>Rows found</span><strong>{parsedRows.length}</strong></div>
          <div><span>Ready to import</span><strong>{validRows.length}</strong></div>
          <div><span>Needs fixing</span><strong>{invalidCount}</strong></div>
        </section>
      )}

      {unmatchedHeaders.length > 0 && (
        <p className="action-notice is-error" role="alert">
          <AlertTriangle size={14} strokeWidth={2.2} style={{ verticalAlign: 'middle', marginRight: '0.35rem' }} />
          These columns weren't recognised and were ignored: {unmatchedHeaders.join(', ')}
        </p>
      )}

      {parsedRows.length > 0 && (
        <section className="student-table-card">
          <div className="student-table-head">
            <p className="card-title">Preview ({parsedRows.length} row{parsedRows.length === 1 ? '' : 's'})</p>
            <button type="button" onClick={runImport} disabled={importing || validRows.length === 0}>
              <FileUp size={16} strokeWidth={2.2} />
              {importing ? 'Importing...' : `Import ${validRows.length} student${validRows.length === 1 ? '' : 's'}`}
            </button>
          </div>

          <div className="student-table-wrap">
            <table className="attendance-table student-management-table">
              <thead>
                <tr>
                  <th>Status</th>
                  <th>First name</th>
                  <th>Last name</th>
                  <th>ST number</th>
                  <th>Year</th>
                  <th>Kainga</th>
                  <th>Guardian email</th>
                </tr>
              </thead>
              <tbody>
                {rowsWithValidation.map(({ row, errors }, index) => (
                  <tr key={index}>
                    <td>
                      {errors.length === 0 ? (
                        <span className="status-badge status-present">
                          <CheckCircle2 size={13} strokeWidth={2.2} style={{ verticalAlign: 'middle', marginRight: '0.25rem' }} />
                          Ready
                        </span>
                      ) : (
                        <span className="status-badge status-absent" title={errors.join('; ')}>
                          {errors.join('; ')}
                        </span>
                      )}
                    </td>
                    <td>{row.firstName || '-'}</td>
                    <td>{row.lastName || '-'}</td>
                    <td>{row.stNumber || '-'}</td>
                    <td>{row.yearLevel || '-'}</td>
                    <td>{row.kainga || '-'}</td>
                    <td className="student-id">{row.guardianEmail || '-'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {importResults && (
        <section className="student-audit-card">
          <div className="student-table-head">
            <p className="card-title">Import Results</p>
            <button type="button" className="btn-ghost" onClick={reset}>Start new import</button>
          </div>
          <div className="student-audit-list">
            {importResults.results.map((result, index) => (
              <div key={index} className="student-audit-row">
                <div>
                  <strong>{`${result.row.firstName || ''} ${result.row.lastName || ''}`.trim() || `Row ${index + 1}`}</strong>
                  <span>{result.status === 'success' ? 'Imported successfully.' : result.error}</span>
                </div>
                <em>{result.status === 'success' ? 'Success' : 'Failed'}</em>
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  )
}