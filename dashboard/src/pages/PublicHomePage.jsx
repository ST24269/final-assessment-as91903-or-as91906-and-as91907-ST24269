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
  ScanLine,
  ShieldCheck,
  TriangleAlert,
  UsersRound,
} from 'lucide-react'
import PublicSiteLayout from '../components/PublicSiteLayout'
import heroImage from '../assets/hero.png'

const highlights = [
  { label: 'RFID scans', Icon: ScanLine },
  { label: 'Realtime register', Icon: Activity },
  { label: 'Admin analytics', Icon: BarChart3 },
]

const benefitGroups = [
  {
    heading: 'For teachers and students',
    items: [
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
    ],
  },
  {
    heading: 'For admins and data',
    items: [
      {
        title: 'Admin control centre',
        text: 'Admins manage students, users, classes, readers, cards, and attendance analytics.',
        Icon: ShieldCheck,
      },
      {
        title: 'RFID reader integration',
        text: 'ESP32 readers send authenticated scan events to the backend API.',
        Icon: ScanLine,
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
    ],
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
        {/* HERO — headline, one short subtext line, one action group. Nothing else. */}
        <section className="public-hero" style={{ '--hero-image': `url(${heroImage})` }}>
          <div className="public-hero-copy">
            <p className="public-kicker">Tago attendance system</p>
            <h1>Tago school attendance platform</h1>
            <p>
              RFID cards, ESP32 room readers, and realtime dashboards replace manual
              roll calls with less admin work.
            </p>

            <div className="public-hero-actions" aria-label="Primary actions">
              {loginButtons.map(({ label, to, Icon }) => (
                <Link key={to} className="public-button" to={to}>
                  <Icon size={17} strokeWidth={2.25} />
                  {label}
                </Link>
              ))}
            </div>
          </div>
        </section>

        {/* PROBLEM — two-column split, not a card grid. Folds the old highlight strip
            into the right-hand column instead of stacking it inside the hero. */}
        <section className="public-section public-problem-split" id="problem">
          <div className="public-problem-col">
            <h2>Manual attendance is slow to record and harder to see in real time.</h2>
            <p>
              Traditional attendance marking is repetitive for teachers, easy to delay,
              and difficult for students or admins to inspect immediately. Staff lose
              lesson time, and nobody has a clear picture until the day is already over.
            </p>
          </div>
          <div className="public-problem-col">
            <p>
              Tago turns each room scan into a validated attendance record and presents
              it through student, teacher, and admin dashboards as it happens.
            </p>
            <ul className="public-highlight-list" aria-label="System highlights">
              {highlights.map(({ label, Icon }) => (
                <li key={label}>
                  <Icon size={17} strokeWidth={2.2} />
                  <span>{label}</span>
                </li>
              ))}
            </ul>
          </div>
        </section>

        {/* BENEFITS — grouped divide-y rows instead of eight equal cards.
            Two labelled clusters, 2-column rows within each. */}
        <section className="public-section">
          <div className="public-section-heading">
            <h2>Built for school attendance in real classrooms.</h2>
          </div>
          <div className="public-benefit-groups">
            {benefitGroups.map(({ heading, items }) => (
              <div className="public-benefit-group" key={heading}>
                <h3 className="public-benefit-group-heading">{heading}</h3>
                <div className="public-benefit-rows">
                  {items.map(({ title, text, Icon }) => (
                    <div className="public-benefit-row" key={title}>
                      <span className="public-card-icon" aria-hidden="true">
                        <Icon size={19} strokeWidth={2.25} />
                      </span>
                      <div>
                        <h4>{title}</h4>
                        <p>{text}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* ROLE-BASED FEATURES — the one section on the page where a card grid is
            earned: three genuinely distinct entities, each with its own feature list. */}
        <section className="public-section" id="features">
          <div className="public-section-heading">
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

        {/* CTA — one documentation link, not two competing ones. */}
        <section className="public-section public-cta">
          <div>
            <h2>Read the education and technical breakdown.</h2>
            <p>
              The documentation page covers the project overview, tech stack, file
              structure, authentication, RFID scan logic, data model, security,
              and future improvements.
            </p>
          </div>
          <Link className="public-button" to="/documentation">
            <Database size={17} strokeWidth={2.25} />
            View Documentation
          </Link>
        </section>
      </main>
    </PublicSiteLayout>
  )
}