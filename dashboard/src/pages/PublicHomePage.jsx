import { useEffect } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { GraduationCap, ShieldCheck, UsersRound } from 'lucide-react'
import PublicSiteLayout from '../components/PublicSiteLayout'
import PrismArtifact from '../components/PrismArtifact'
import Reveal from '../components/Reveal'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader } from '@/components/ui/card'
import { Separator } from '@/components/ui/separator'

const highlights = ['RFID scans', 'Realtime register', 'Admin analytics']

const benefitGroups = [
  {
    heading: 'For teachers and students',
    items: [
      'Faster attendance marking',
      'Reduced manual workload',
      'Realtime teacher dashboard',
      'Student visibility',
    ],
  },
  {
    heading: 'For admins and data',
    items: [
      'Admin control centre',
      'RFID reader integration',
      'Audit logs',
      'Flagged records',
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
  { label: 'Student Login', to: '/login/student' },
  { label: 'Teacher Login', to: '/login/teacher' },
  { label: 'Admin Login', to: '/login/admin' },
]

export default function PublicHomePage() {
  const location = useLocation()

  useEffect(() => {
    if (!location.hash) return
    document.getElementById(location.hash.slice(1))?.scrollIntoView({ block: 'start' })
  }, [location.hash])

  return (
    <PublicSiteLayout>
      <main className="vivid-main">
        {/* Hero */}
        <section className="vivid-hero">
          <PrismArtifact className="vivid-hero-prism" />
          <div className="vivid-hero-copy">
            <Reveal as="p" className="vivid-eyebrow">Tago attendance system</Reveal>
            <Reveal as="h1" className="vivid-display" delay={80}>
              Tago school
              <br />
              attendance
              <br />
              platform
            </Reveal>
            <Reveal className="vivid-hero-actions" delay={200} aria-label="Primary actions">
              {loginButtons.map(({ label, to }) => (
                <Button key={to} asChild variant="link" className="vivid-ghost-link">
                  <Link to={to}>{label}</Link>
                </Button>
              ))}
              <Button asChild variant="outline" className="vivid-outline-button">
                <Link to="/documentation">Documentation</Link>
              </Button>
            </Reveal>
          </div>
        </section>

        {/* Problem */}
        <section className="vivid-section vivid-problem" id="problem">
          <Reveal as="p" className="vivid-lead">
            Building a clearer picture of attendance is our singular aim.
          </Reveal>
          <Reveal as="h2" className="vivid-heading-lg" delay={60}>
            Manual attendance is slow to record and harder to see in real time.
          </Reveal>
          <Reveal as="p" className="vivid-body" delay={120}>
            Tago turns each room scan into a validated attendance record and presents it
            through student, teacher, and admin dashboards as it happens.
          </Reveal>
          <Reveal as="ul" className="vivid-service-labels" delay={180} aria-label="System highlights">
            {highlights.map((label) => (
              <li key={label}>{label}</li>
            ))}
          </Reveal>
        </section>

        {/* Benefits */}
        <section className="vivid-section">
          <Reveal as="h2" className="vivid-heading-lg vivid-section-statement">
            Built for school attendance in real classrooms.
          </Reveal>
          <div className="vivid-benefit-groups">
            {benefitGroups.map(({ heading, items }, index) => (
              <Reveal className="vivid-benefit-group" key={heading} delay={index * 90}>
                <p className="vivid-eyebrow">{heading}</p>
                <Separator className="vivid-rule" />
                <ul className="vivid-benefit-list">
                  {items.map((title) => (
                    <li key={title}>
                      <span className="vivid-benefit-title">{title}</span>
                    </li>
                  ))}
                </ul>
              </Reveal>
            ))}
          </div>
        </section>

        {/* Role features */}
        <section className="vivid-section" id="features">
          <Reveal as="h2" className="vivid-heading-lg vivid-section-statement">
            Separate experiences for students, teachers, and admins.
          </Reveal>
          <div className="vivid-role-grid">
            {roleCards.map(({ role, Icon, summary, features }, index) => (
              <Reveal key={role} delay={index * 90}>
                <Card className="vivid-role-card">
                  <CardHeader className="vivid-role-header">
                    <Icon size={22} strokeWidth={1.5} aria-hidden="true" />
                    <h3 className="vivid-role-title">{role}</h3>
                    <p className="vivid-role-summary">{summary}</p>
                  </CardHeader>
                  <CardContent className="vivid-role-body">
                    <ul className="vivid-role-list">
                      {features.map((feature) => (
                        <li key={feature}>{feature}</li>
                      ))}
                    </ul>
                  </CardContent>
                </Card>
              </Reveal>
            ))}
          </div>
        </section>

        {/* CTA */}
        <section className="vivid-section vivid-cta">
          <Reveal as="h2" className="vivid-heading-lg">Read the education and technical breakdown.</Reveal>
          <Reveal delay={80}>
            <Button asChild variant="outline" className="vivid-outline-button">
              <Link to="/documentation">View Documentation</Link>
            </Button>
          </Reveal>
        </section>
      </main>
    </PublicSiteLayout>
  )
}
