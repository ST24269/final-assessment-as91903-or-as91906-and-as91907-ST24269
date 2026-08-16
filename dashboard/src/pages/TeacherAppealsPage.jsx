import { useState } from 'react'
import { Link } from 'react-router-dom'
import { ArrowLeft } from 'lucide-react'
import Layout from '../components/Layout'
import AppealsPanel from '../components/AppealsPanel'

export default function TeacherAppealsPage({ session, profile }) {
  const [view, setView] = useState('open')

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
        </div>
      </section>

      <Link className="student-action-link is-secondary" to="/teacher">
        <ArrowLeft size={16} strokeWidth={2.2} />
        Back to dashboard
      </Link>

      <div className="appeals-view-tabs" role="tablist" aria-label="Appeals view">
        <button type="button" className={view === 'open' ? 'is-active' : ''} onClick={() => setView('open')}>
          Open appeals
        </button>
        <button type="button" className={view === 'history' ? 'is-active' : ''} onClick={() => setView('history')}>
          Appeal history
        </button>
      </div>

      {view === 'open' ? (
        <AppealsPanel mode="teacher" hideResolved />
      ) : (
        <AppealsPanel mode="teacher" historyOnly />
      )}
    </Layout>
  )
}