import { useEffect } from 'react'
import { Link, useLocation } from 'react-router-dom'
import {
  Activity,
  BarChart3,
  CheckCircle2,
  ClipboardCheck,
  Clock3,
  Database,
  GraduationCap,
  Radio,
  ShieldCheck,
  TriangleAlert,
  UsersRound,
} from 'lucide-react'
import PublicSiteLayout from '../components/PublicSiteLayout'
import PixelBlast from '../components/reactbits/PixelBlast'
import heroImage from '../assets/hero.png'

const benefits = [
  {
    title: 'Faster attendance marking',
    text: 'RFID scans replace slow roll calls and give staff a cleaner start to each lesson.',
    Icon: Clock3,
  },
  {
    title: 'Reduced manual workload',
    text: 'Teachers spend less time recording names and more time teaching.',
    Icon: ClipboardCheck,
  },
  {
    title: 'Realtime teacher dashboard',
    text: 'Live scan updates appear as students tap their cards at the room reader.',
    Icon: Activity,
  },
  {
    title: 'Student visibility',
    text: 'Students can review attendance status, class history, and RFID details.',
    Icon: GraduationCap,
  },
  {
    title: 'Admin control centre',
    text: 'Admins manage students, users, classes, readers, cards, and attendance analytics.',
    Icon: ShieldCheck,
  },
  {
    title: 'RFID reader integration',
    text: 'ESP32 readers send authenticated scan events to the backend API.',
    Icon: Radio,
  },
  {
    title: 'Audit logs',
    text: 'Sensitive student management actions are tracked for review and accountability.',
    Icon: Database,
  },
  {
    title: 'Flagged records',
    text: 'Duplicate scans and unusual events can be surfaced for teacher or admin review.',
    Icon: TriangleAlert,
  },
]

const roleCards = [
  {
    role: 'Student',
    Icon: GraduationCap,
    summary: 'A simple portal for attendance visibility and RFID card support.',
    features: [
      "View today's attendance status",
      'View attendance rate',
      'View class-by-class attendance',
      'View attendance history',
      'Manage profile and RFID information',
      'Report missing or stolen RFID cards',
    ],
  },
  {
    role: 'Teacher',
    Icon: UsersRound,
    summary: 'A live classroom register built around class sessions and scan review.',
    features: [
      'Start and end class sessions',
      'View live scan feed',
      'See present, late, flagged, and manual edit counts',
      'Manually change attendance status',
      'View the full class register',
    ],
  },
  {
    role: 'Admin',
    Icon: ShieldCheck,
    summary: 'A control centre for school setup, RFID cards, users, and attendance insight.',
    features: [
      'Manage student records and student login accounts',
      'Assign, replace, deactivate, or mark RFID cards as lost',
      'Manage classes, teachers, RFID readers, and API keys',
      'View analytics, audit logs, and students needing attention',
      'Create teacher and admin accounts',
    ],
  },
]

const loginButtons = [
  { label: 'Student Login', to: '/login/student', Icon: GraduationCap },
  { label: 'Teacher Login', to: '/login/teacher', Icon: UsersRound },
  { label: 'Admin Login', to: '/login/admin', Icon: ShieldCheck },
]

export default function PublicHomePage() {
  const location = useLocation()

  useEffect(() => {
    if (!location.hash) return
    document.getElementById(location.hash.slice(1))?.scrollIntoView({ block: 'start' })
  }, [location.hash])

  return (
    <PublicSiteLayout>
      <main className="public-main">
        <section className="public-hero" style={{ '--hero-image': `url(${heroImage})` }}>
          <div className="public-hero-pixels" aria-hidden="true">
            <PixelBlast
              variant="square"
              pixelSize={5}
              color="#57df9a"
              patternScale={2.4}
              patternDensity={1.18}
              pixelSizeJitter={0.18}
              enableRipples={false}
              speed={0.5}
              edgeFade={0.42}
              transparent
            />
          </div>

          <div className="public-hero-copy">
            <p className="public-kicker">CSC RFID Attendance System</p>
            <h1>AttendRFID school attendance platform</h1>
            <p>
              A school attendance system that combines RFID cards, ESP32 room readers,
              Supabase realtime, and role-based dashboards so attendance can be recorded,
              reviewed, and managed with less manual work.
            </p>

            <div className="public-hero-actions" aria-label="Primary actions">
              {loginButtons.map(({ label, to, Icon }) => (
                <Link key={to} className="public-button" to={to}>
                  <Icon size={17} strokeWidth={2.25} />
                  {label}
                </Link>
              ))}
              <Link className="public-button public-button-secondary" to="/documentation">
                <Database size={17} strokeWidth={2.25} />
                View Project Documentation
              </Link>
            </div>
          </div>

          <div className="public-hero-strip" aria-label="System highlights">
            <span><Radio size={16} strokeWidth={2.2} /> RFID scans</span>
            <span><Activity size={16} strokeWidth={2.2} /> Realtime register</span>
            <span><BarChart3 size={16} strokeWidth={2.2} /> Admin analytics</span>
          </div>
        </section>

        <section className="public-section public-problem" id="problem">
          <div className="public-section-heading">
            <p className="public-kicker">The Problem</p>
            <h2>Manual attendance is slow to record and harder to see in real time.</h2>
          </div>
          <div className="public-problem-grid">
            <article>
              <h3>What slows schools down</h3>
              <p>
                Traditional attendance marking can be repetitive for teachers, easy to delay,
                and difficult for students or admins to inspect immediately.
              </p>
            </article>
            <article>
              <h3>What AttendRFID does</h3>
              <p>
                The system turns each room scan into a validated attendance record, then
                presents it through student, teacher, and admin dashboards.
              </p>
            </article>
            <article>
              <h3>Why it helps</h3>
              <p>
                Staff get faster registers, students get clearer visibility, and admins get
                central tools for managing cards, readers, users, and trends.
              </p>
            </article>
          </div>
        </section>

        <section className="public-section">
          <div className="public-section-heading">
            <p className="public-kicker">Benefits</p>
            <h2>Built for school attendance in real classrooms.</h2>
          </div>
          <div className="public-benefit-grid">
            {benefits.map(({ title, text, Icon }) => (
              <article className="public-card" key={title}>
                <span className="public-card-icon" aria-hidden="true">
                  <Icon size={20} strokeWidth={2.25} />
                </span>
                <h3>{title}</h3>
                <p>{text}</p>
              </article>
            ))}
          </div>
        </section>

        <section className="public-section" id="features">
          <div className="public-section-heading">
            <p className="public-kicker">Role-Based Features</p>
            <h2>Separate experiences for students, teachers, and admins.</h2>
          </div>
          <div className="public-role-grid">
            {roleCards.map(({ role, Icon, summary, features }) => (
              <article className="public-role-card" key={role}>
                <header>
                  <span className="public-card-icon" aria-hidden="true">
                    <Icon size={22} strokeWidth={2.25} />
                  </span>
                  <div>
                    <h3>{role}</h3>
                    <p>{summary}</p>
                  </div>
                </header>
                <ul>
                  {features.map((feature) => (
                    <li key={feature}>
                      <CheckCircle2 size={16} strokeWidth={2.2} />
                      <span>{feature}</span>
                    </li>
                  ))}
                </ul>
              </article>
            ))}
          </div>
        </section>

        <section className="public-section public-cta">
          <div>
            <p className="public-kicker">Project Evidence</p>
            <h2>Read the education and technical breakdown.</h2>
            <p>
              The documentation page explains the project overview, tech stack, file
              structure, authentication, RFID scan logic, data model, security,
              and future improvements.
            </p>
          </div>
          <Link className="public-button" to="/documentation">
            <Database size={17} strokeWidth={2.25} />
            Open Documentation
          </Link>
        </section>
      </main>
    </PublicSiteLayout>
  )
}
