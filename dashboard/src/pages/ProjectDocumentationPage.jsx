import {
  BookOpen,
  CheckCircle2,
  Database,
  FileText,
  KeyRound,
  LockKeyhole,
  Radio,
  Rocket,
  ShieldCheck,
} from 'lucide-react'
import PublicSiteLayout from '../components/PublicSiteLayout'

const techStack = [
  'React frontend with Vite',
  'React Router routes for public pages, login pages, dashboards, and account sections',
  'Supabase authentication for email/password sign in',
  'Supabase database tables with row level security policies',
  'Supabase realtime subscriptions for live attendance updates',
  'Node and Express backend API routes',
  'ESP32 RFID reader firmware in the hardware folder',
  'RFID cards and room readers',
  'Custom CSS variables, Tailwind v4 import, lucide-react icons, and existing dashboard styles',
]

const dataModel = [
  ['profiles', 'User profile records for student, teacher, and admin roles.'],
  ['students', 'Student identity, student number, year level, RFID UID, and status fields.'],
  ['student_profiles', 'Links Supabase login profiles to student records.'],
  ['classes', 'Class groups with name, subject, room, and optional teacher.'],
  ['enrolments', 'Many-to-many links between students and classes.'],
  ['sessions', 'Class attendance sessions with start time, end time, teacher, and notes.'],
  ['attendance', 'Attendance records with scanned time, status, flags, and manual override state.'],
  ['readers', 'RFID reader devices with room, API key, active status, and last seen time.'],
  ['audit_logs', 'Admin audit trail for sensitive student management actions.'],
]

const securityPoints = [
  'Protected React routes keep dashboards behind authenticated sessions.',
  'The app checks profiles.role before allowing student, teacher, or admin dashboard access.',
  'Express middleware verifies bearer tokens and applies requireRole checks on API routes.',
  'Reader API keys authenticate ESP32 scan requests.',
  'RFID card UIDs are masked in student-facing profile views.',
  'Missing or stolen cards can be deactivated so they no longer work for active scans.',
  'Admins control sensitive student, reader, class, and user-management tasks.',
  'Audit logs record student-management actions for review.',
]

const futureImprovements = [
  'More detailed attendance reports by class, student, term, and date range.',
  'Parent or guardian notifications for absences and repeated lateness.',
  'Stronger admin analytics for trends and intervention planning.',
  'Offline scan caching on the ESP32 if network connection drops.',
  'More advanced anomaly detection for unusual scan patterns.',
  'Exportable attendance reports for office or compliance tasks.',
  'Further mobile polish for the student portal.',
]

const docSections = [
  { id: 'overview', label: 'Project Overview', Icon: BookOpen },
  { id: 'problem', label: 'Problem Being Solved', Icon: FileText },
  { id: 'tech-stack', label: 'Tech Stack', Icon: Rocket },
  { id: 'file-structure', label: 'File Structure', Icon: FileText },
  { id: 'authentication', label: 'Authentication and Roles', Icon: KeyRound },
  { id: 'rfid-logic', label: 'RFID Scan Logic', Icon: Radio },
  { id: 'data-model', label: 'Database Overview', Icon: Database },
  { id: 'security', label: 'Security and Privacy', Icon: LockKeyhole },
  { id: 'future', label: 'Future Improvements', Icon: ShieldCheck },
]

const fileTree = `final-assessment-as91903-or-as91906-and-as91907-ST24269/
|-- README.md
|-- docs/
|   |-- wiring-diagram.md
|-- hardware/
|   |-- platformio.ini
|   |-- README.MD
|   |-- src/
|       |-- main.cpp
|-- server/
|   |-- package.json
|   |-- Dockerfile
|   |-- src/
|       |-- index.js
|       |-- middleware/
|       |   |-- auth.js
|       |-- db/
|       |   |-- pool.js
|       |   |-- schema.sql
|       |   |-- student-management-migration.sql
|       |-- routes/
|       |   |-- auth.js
|       |   |-- attendance.js
|       |   |-- sessions.js
|       |   |-- students.js
|       |   |-- users.js
|       |-- services/
|       |   |-- anomaly.js
|       |   |-- kamar.js
|       |-- utils/
|           |-- email.js
|-- dashboard/
    |-- index.html
    |-- package.json
    |-- vite.config.js
    |-- public/
    |   |-- favicon.png
    |   |-- icons.svg
    |-- src/
        |-- main.jsx
        |-- App.jsx
        |-- index.css
        |-- api/
        |   |-- client.js
        |-- assets/
        |   |-- hero.png
        |-- config/
        |   |-- permissions.js
        |-- hooks/
        |   |-- useThemeMode.js
        |   |-- useWebSocket.js
        |-- pages/
        |   |-- LoginPage.jsx
        |   |-- StudentPage.jsx
        |   |-- TeacherPage.jsx
        |   |-- AdminPage.jsx
        |   |-- AccountPage.jsx
        |   |-- PublicHomePage.jsx
        |   |-- ProjectDocumentationPage.jsx
        |-- components/
            |-- Layout.jsx
            |-- ProfileMenu.jsx
            |-- SessionPanel.jsx
            |-- AttendanceTable.jsx
            |-- LiveFeed.jsx
            |-- PublicSiteLayout.jsx
            |-- admin/`

function DocSection({ id, label, Icon, children }) {
  return (
    <section className="public-doc-section" id={id}>
      <div className="public-doc-section-title">
        <span className="public-card-icon" aria-hidden="true">
          <Icon size={20} strokeWidth={2.25} />
        </span>
        <h2>{label}</h2>
      </div>
      {children}
    </section>
  )
}

export default function ProjectDocumentationPage() {
  return (
    <PublicSiteLayout>
      <main className="public-docs-shell">
        <section className="public-doc-hero">
          <p className="public-kicker">Education and Project Breakdown</p>
          <h1>Project Documentation</h1>
          <p>
            A readable README-style explanation of the Tago attendance system,
            including the problem, implementation, role dashboards, RFID scan logic,
            data model, security choices, and future improvements.
          </p>
        </section>

        <div className="public-doc-layout">
          <aside className="public-doc-nav" aria-label="Documentation sections">
            {docSections.map(({ id, label, Icon }) => (
              <a key={id} href={`#${id}`}>
                <Icon size={15} strokeWidth={2.2} />
                <span>{label}</span>
              </a>
            ))}
          </aside>

          <article className="public-docs-main">
            <DocSection id="overview" label="Project Overview" Icon={BookOpen}>
              <p>
                Tago is an RFID-based school attendance system. It was built to
                connect physical classroom scans with digital attendance dashboards for
                students, teachers, and administrators. The system uses RFID cards and
                ESP32 room readers to create attendance records, then presents those
                records through role-based web views.
              </p>
            </DocSection>

            <DocSection id="problem" label="Problem Being Solved" Icon={FileText}>
              <p>
                Manual attendance can be slow, repetitive, and hard to track in real
                time. Teachers may lose lesson time marking a roll, students may not
                easily see their own attendance history, and admins may need a central
                way to manage users, cards, classes, devices, and flagged records.
              </p>
              <p>
                This project improves accuracy and visibility by turning a
                card scan into a validated attendance record that updates the teacher
                dashboard live.
              </p>
            </DocSection>

            <DocSection id="tech-stack" label="Tech Stack" Icon={Rocket}>
              <ul className="public-doc-checklist">
                {techStack.map((item) => (
                  <li key={item}>
                    <CheckCircle2 size={16} strokeWidth={2.2} />
                    <span>{item}</span>
                  </li>
                ))}
              </ul>
            </DocSection>

            <DocSection id="file-structure" label="File Structure" Icon={FileText}>
              <p>
                This overview shows the important files and folders that exist in the
                current repository.
              </p>
              <pre className="public-file-tree">{fileTree}</pre>
              <div className="public-doc-note-grid">
                <article>
                  <h3>dashboard</h3>
                  <p>React frontend, public pages, role login pages, dashboards, account pages, shared components, styles, and Supabase browser client.</p>
                </article>
                <article>
                  <h3>server</h3>
                  <p>Express API, authentication middleware, Supabase service client, database schema, routes for scans, sessions, attendance, students, users, and password reset.</p>
                </article>
                <article>
                  <h3>hardware</h3>
                  <p>ESP32 firmware project and PlatformIO configuration for the RFID reader side of the system.</p>
                </article>
              </div>
            </DocSection>

            <DocSection id="authentication" label="Authentication and Roles" Icon={KeyRound}>
              <p>
                The app has three roles: student, teacher, and admin. Each role has a
                dedicated login URL: <code>/login/student</code>, <code>/login/teacher</code>,
                and <code>/login/admin</code>.
              </p>
              <p>
                Supabase email/password authentication is used. After login, the app
                checks <code>profiles.role</code>. If a user signs in through the wrong
                role page, the app signs them out and displays a role mismatch notice.
                Protected routes redirect users to the dashboard for their actual role.
              </p>
            </DocSection>

            <DocSection id="rfid-logic" label="RFID Scan Logic" Icon={Radio}>
              <p>
                The ESP32 reader sends scans to <code>/api/attendance/scan</code> with an
                RFID UID and reader API key. The server validates the active reader,
                checks the reader room, finds an active session for that room, confirms
                the RFID card belongs to a student, and verifies that the student is
                enrolled in the active class.
              </p>
              <p>
                A valid scan creates an attendance record. The status is <code>present</code>
                or <code>late</code> depending on the time since the session started.
                Duplicate scans within 30 seconds are flagged so staff can review them.
              </p>
            </DocSection>

            <DocSection id="data-model" label="Database and Data Model Overview" Icon={Database}>
              <div className="public-data-table" role="table" aria-label="Database entities">
                {dataModel.map(([entity, description]) => (
                  <div className="public-data-row" role="row" key={entity}>
                    <strong role="cell">{entity}</strong>
                    <span role="cell">{description}</span>
                  </div>
                ))}
              </div>
              <p>
                RFID card data is stored on the <code>students</code> entity through the
                RFID UID field rather than a separate RFID card table.
              </p>
            </DocSection>

            <DocSection id="security" label="Security and Privacy" Icon={LockKeyhole}>
              <ul className="public-doc-checklist">
                {securityPoints.map((point) => (
                  <li key={point}>
                    <ShieldCheck size={16} strokeWidth={2.2} />
                    <span>{point}</span>
                  </li>
                ))}
              </ul>
            </DocSection>

            <DocSection id="future" label="Future Improvements" Icon={ShieldCheck}>
              <ul className="public-doc-checklist">
                {futureImprovements.map((item) => (
                  <li key={item}>
                    <CheckCircle2 size={16} strokeWidth={2.2} />
                    <span>{item}</span>
                  </li>
                ))}
              </ul>
            </DocSection>
          </article>
        </div>
      </main>
    </PublicSiteLayout>
  )
}
