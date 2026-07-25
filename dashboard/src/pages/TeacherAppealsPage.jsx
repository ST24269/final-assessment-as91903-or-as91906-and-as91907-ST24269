import { Link } from 'react-router-dom'
import { ArrowLeft } from 'lucide-react'
import Layout from '../components/Layout'
import AppealsPanel from '../components/AppealsPanel'

export default function TeacherAppealsPage({ session, profile }) {
  return (
    <Layout
      email={session.user.email}
      name={profile?.full_name}
      role="teacher"
      profileId={profile?.id}
    >
      <section className="portal-hero">
        <div>
          <p className="portal-eyebrow">Attendance appeals</p>
          <h1 className="portal-title">Manage appeals</h1>
          <p className="portal-subtitle">
            Review, approve, reject, or resolve appeals for your classes and learning-advisor group.
          </p>
        </div>
      </section>

      <Link className="student-action-link is-secondary" to="/teacher">
        <ArrowLeft size={16} strokeWidth={2.2} />
        Back to dashboard
      </Link>

      <AppealsPanel mode="teacher" />
    </Layout>
  )
}